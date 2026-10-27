"""
Complete inference pipeline for floor plan wall detection.
Includes preprocessing, model prediction, and post-processing with line extraction.
"""
import torch
import numpy as np
import cv2
from PIL import Image
from typing import List, Dict, Tuple, Optional
from pathlib import Path
import torch.nn.functional as F
from model import get_safe_device


class FloorPlanInference:
    """Complete inference pipeline for floor plan wall detection."""
    
    def __init__(
        self,
        model: torch.nn.Module,
        device: str = None,
        input_size: int = 512,
        wall_class_idx: int = 1
    ):
        """
        Initialize inference pipeline.
        
        Args:
            model: Pretrained segmentation model
            device: Device to run inference on
            input_size: Input size for model (will resize images to this)
            wall_class_idx: Class index for walls in model output
        """
        self.model = model
        self.device = device or get_safe_device()
        self.input_size = input_size
        self.wall_class_idx = wall_class_idx
        
        # ImageNet normalization (standard for pretrained models)
        # Must live on self.device (resolved above), not the raw `device` arg which may be None
        self.mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1).to(self.device)
        self.std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1).to(self.device)
    
    def preprocess_image(self, image: np.ndarray) -> Tuple[torch.Tensor, Tuple[int, int, int, int]]:
        """
        Preprocess image for model input with aspect ratio preservation.
        
        Args:
            image: Input image (H, W, 3) in BGR format
        
        Returns:
            Preprocessed tensor and size info (orig_h, orig_w, new_h, new_w)
        """
        original_h, original_w = image.shape[:2]
        
        # Calculate target size preserving aspect ratio
        scale = self.input_size / max(original_h, original_w)
        new_h = int(original_h * scale)
        new_w = int(original_w * scale)
        
        # Convert BGR to RGB
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Resize preserving aspect ratio
        image_resized = cv2.resize(image_rgb, (new_w, new_h))
        
        # Pad to square input_size
        delta_h = self.input_size - new_h
        delta_w = self.input_size - new_w
        
        # Pad with white (255) to represent empty space
        image_padded = cv2.copyMakeBorder(
            image_resized, 
            0, delta_h, 0, delta_w, 
            cv2.BORDER_CONSTANT, 
            value=[255, 255, 255]
        )
        
        # Convert to tensor and normalize
        image_tensor = torch.from_numpy(image_padded).permute(2, 0, 1).float() / 255.0
        image_tensor = image_tensor.unsqueeze(0).to(self.device)
        
        # Normalize with ImageNet stats
        image_tensor = (image_tensor - self.mean) / self.std
        
        return image_tensor, (original_h, original_w, new_h, new_w)
    
    def predict_mask(self, image_tensor: torch.Tensor) -> np.ndarray:
        """
        Run model prediction.
        
        Args:
            image_tensor: Preprocessed image tensor
        
        Returns:
            Predicted mask (H, W) with class indices
        """
        with torch.no_grad():
            output = self.model(image_tensor)
            
            # Get class predictions
            if output.shape[1] > 1:
                # Multi-class output
                mask = torch.argmax(output, dim=1)
            else:
                # Binary output
                mask = (torch.sigmoid(output) > 0.5).long()
            
            mask = mask.squeeze(0).cpu().numpy()
        
        return mask
    
    def postprocess_mask(
        self,
        mask: np.ndarray,
        size_info: Tuple[int, int, int, int]
    ) -> np.ndarray:
        """
        Resize mask back to original image size, handling padding.
        
        Args:
            mask: Predicted mask (input_size, input_size)
            size_info: Tuple (orig_h, orig_w, new_h, new_w)
        
        Returns:
            Resized mask (orig_h, orig_w)
        """
        orig_h, orig_w, new_h, new_w = size_info
        
        # Crop padding
        mask_cropped = mask[:new_h, :new_w]
        
        # Resize back to original size
        mask_resized = cv2.resize(
            mask_cropped.astype(np.uint8),
            (orig_w, orig_h),
            interpolation=cv2.INTER_NEAREST
        )
        
        return mask_resized
    
    def extract_wall_mask(self, mask: np.ndarray) -> np.ndarray:
        """
        Extract binary wall mask from multi-class prediction.
        
        Args:
            mask: Multi-class mask
        
        Returns:
            Binary wall mask (0 or 255)
        """
        wall_mask = (mask == self.wall_class_idx).astype(np.uint8) * 255
        
        # Morphological operations to clean up mask
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        # Increased iterations to better close gaps in predicted walls
        wall_mask = cv2.morphologyEx(wall_mask, cv2.MORPH_CLOSE, kernel, iterations=3)
        wall_mask = cv2.morphologyEx(wall_mask, cv2.MORPH_OPEN, kernel, iterations=1)
        
        return wall_mask
    
    def extract_wall_lines(
        self,
        wall_mask: np.ndarray,
        min_line_length: Optional[int] = None, 
        max_line_gap: int = 20     # Increased from 10 to connect segments better
    ) -> List[Dict]:
        """
        Extract wall lines from binary mask using contours and line detection.
        
        Args:
            wall_mask: Binary wall mask (0 or 255)
            min_line_length: Minimum line length in pixels
            max_line_gap: Maximum gap between line segments
        
        Returns:
            List of wall dictionaries with start/end coordinates
        """
        if min_line_length is None:
             # Dynamic threshold: 2% of min image dimension
             # This filters out small furniture details and text
             h, w = wall_mask.shape[:2]
             min_line_length = min(h, w) * 0.02
        
        walls = []
        
        # Find contours
        contours, _ = cv2.findContours(wall_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            # Skip very small contours
            if cv2.contourArea(contour) < 100:
                continue
            
            # Approximate contour to polygon
            epsilon = 0.002 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            
            # Extract line segments from polygon
            for i in range(len(approx)):
                p1 = approx[i][0]
                p2 = approx[(i + 1) % len(approx)][0]
                
                # Calculate line length
                length = np.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)
                
                if length >= min_line_length:
                    walls.append({
                        'start': {'x': int(p1[0]), 'y': int(p1[1])},
                        'end': {'x': int(p2[0]), 'y': int(p2[1])},
                        'length': float(length)
                    })
        
        # If contour-based extraction fails, try HoughLines as fallback
        if len(walls) == 0:
            edges = cv2.Canny(wall_mask, 50, 150)
            lines = cv2.HoughLinesP(
                edges,
                rho=1,
                theta=np.pi/180,
                threshold=50,
                minLineLength=min_line_length,
                maxLineGap=max_line_gap
            )
            
            if lines is not None:
                for line in lines:
                    x1, y1, x2, y2 = line[0]
                    walls.append({
                        'start': {'x': int(x1), 'y': int(y1)},
                        'end': {'x': int(x2), 'y': int(y2)}
                    })
        
        return walls
    
    def snap_to_grid(
        self,
        walls: List[Dict],
        angle_threshold: float = 5.0
    ) -> List[Dict]:
        """
        Snap wall angles to nearest 90-degree increment.
        
        Args:
            walls: List of wall dictionaries
            angle_threshold: Angle threshold in degrees for snapping
        
        Returns:
            List of walls with snapped angles
        """
        snapped_walls = []
        
        for wall in walls:
            x1, y1 = wall['start']['x'], wall['start']['y']
            x2, y2 = wall['end']['x'], wall['end']['y']
            
            # Calculate angle
            dx = x2 - x1
            dy = y2 - y1
            angle = np.degrees(np.arctan2(dy, dx)) % 180
            
            # Snap to 0° or 90° if close
            if angle < angle_threshold or angle > (180 - angle_threshold):
                # Horizontal - fix y coordinate
                y_avg = (y1 + y2) // 2
                wall['start']['y'] = y_avg
                wall['end']['y'] = y_avg
            elif abs(angle - 90) < angle_threshold:
                # Vertical - fix x coordinate
                x_avg = (x1 + x2) // 2
                wall['start']['x'] = x_avg
                wall['end']['x'] = x_avg
            
            snapped_walls.append(wall)
        
        return snapped_walls
    
    def __call__(
        self,
        image: np.ndarray,
        snap_angles: bool = True
    ) -> Dict:
        """
        Complete inference pipeline.
        
        Args:
            image: Input image (BGR format)
            snap_angles: Whether to snap angles to 90-degree increments
        
        Returns:
            Dictionary with walls and image dimensions
        """
        # Preprocess with aspect ratio preservation
        image_tensor, size_info = self.preprocess_image(image)
        
        # Predict
        mask = self.predict_mask(image_tensor)
        
        # Postprocess mask (crop padding, resize)
        mask_full = self.postprocess_mask(mask, size_info)
        
        # Extract wall mask
        wall_mask = self.extract_wall_mask(mask_full)
        
        # Extract lines
        walls = self.extract_wall_lines(wall_mask)
        
        # Snap angles if requested
        if snap_angles:
            walls = self.snap_to_grid(walls)
        
        # Use dimensions from size_info (original size)
        return {
            'walls': walls,
            'image_width': size_info[1],
            'image_height': size_info[0],
            'num_walls': len(walls)
        }


class YOLOWallInference:
    """Inference pipeline for wall detection using YOLOv8-seg."""
    
    def __init__(self, model_path: str, device: str = None):
        from ultralytics import YOLO
        self.device = device or get_safe_device()
        self.model = YOLO(model_path)
        
    def __call__(self, image: np.ndarray, snap_angles: bool = True) -> dict:
        """Run YOLOv8-seg wall segmentation and extract snapped wall segments."""
        results = self.model(image, device=self.device, verbose=False)
        result = results[0]
        
        h, w = image.shape[:2]
        wall_mask = np.zeros((h, w), dtype=np.uint8)
        
        # Merge all instance segmentation masks into a single binary mask
        if result.masks is not None:
            for poly in result.masks.xy:
                if len(poly) > 0:
                    cv2.fillPoly(wall_mask, [poly.astype(np.int32)], 255)
                    
        # Apply standard morphological operations to clean up
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        wall_mask = cv2.morphologyEx(wall_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        wall_mask = cv2.morphologyEx(wall_mask, cv2.MORPH_OPEN, kernel, iterations=1)
        
        # Extract lines
        walls = []
        min_line_length = min(h, w) * 0.02
        
        contours, _ = cv2.findContours(wall_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            if cv2.contourArea(contour) < 100:
                continue
                
            epsilon = 0.002 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            
            for i in range(len(approx)):
                p1 = approx[i][0]
                p2 = approx[(i + 1) % len(approx)][0]
                
                length = np.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)
                
                if length >= min_line_length:
                    walls.append({
                        'start': {'x': int(p1[0]), 'y': int(p1[1])},
                        'end': {'x': int(p2[0]), 'y': int(p2[1])},
                        'length': float(length)
                    })
                    
        # Fallback to HoughLinesP if no contours
        if len(walls) == 0:
            edges = cv2.Canny(wall_mask, 50, 150)
            lines = cv2.HoughLinesP(
                edges,
                rho=1,
                theta=np.pi/180,
                threshold=50,
                minLineLength=min_line_length,
                maxLineGap=20
            )
            
            if lines is not None:
                for line in lines:
                    x1, y1, x2, y2 = line[0]
                    walls.append({
                        'start': {'x': int(x1), 'y': int(y1)},
                        'end': {'x': int(x2), 'y': int(y2)},
                        'length': float(np.sqrt((x2-x1)**2 + (y2-y1)**2))
                    })
                    
        # Angle Snapping
        if snap_angles:
            for wall in walls:
                x1, y1 = wall['start']['x'], wall['start']['y']
                x2, y2 = wall['end']['x'], wall['end']['y']
                
                dx = x2 - x1
                dy = y2 - y1
                angle = np.degrees(np.arctan2(dy, dx)) % 180
                
                if angle < 5.0 or angle > 175.0:
                    y_avg = (y1 + y2) // 2
                    wall['start']['y'] = y_avg
                    wall['end']['y'] = y_avg
                elif abs(angle - 90.0) < 5.0:
                    x_avg = (x1 + x2) // 2
                    wall['start']['x'] = x_avg
                    wall['end']['x'] = x_avg
                    
        # Set default wall properties
        for wall in walls:
            wall['thickness'] = 0.2
            wall['kind'] = 'bearing'
            
        return {
            'walls': walls,
            'image_width': w,
            'image_height': h,
            'num_walls': len(walls),
            'method': 'yolov8_segmentation'
        }


if __name__ == '__main__':
    print("Inference pipeline module loaded successfully")
