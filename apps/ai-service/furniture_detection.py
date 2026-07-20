import cv2
import numpy as np
from ultralytics import YOLO
import logging
from typing import List, Dict
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

# Constants
YOLO_MODEL_PATH = 'weights/architect_furniture.pt'  # Path to local weights file
HF_MODEL_URL = 'https://huggingface.co/SamirShabani/Architect/resolve/main/best.pt'

# Mapping SamirShabani/Architect classes to our Furniture Catalog IDs
CLASS_MAPPING = {
    8: 'stove',          # gas stove -> Stove
    9: 'refrigerator',   # refrigerator -> Refrigerator
    10: 'washing_machine', # washing machine -> Washing Machine
    11: 'sofa_3',        # sofa -> Sofa 3-Seat
    12: 'bed_double',    # bed -> Double Bed
    13: 'armchair',      # chair -> Armchair
    14: 'table_dining',  # table -> Dining Table
    16: 'tv_stand',      # TV cabinet -> TV Stand
    19: 'wardrobe',      # wardrobe -> Wardrobe
    20: 'sink',          # sink -> Sink
    21: 'bath',          # bath -> Bath
    22: 'bath',          # bath tub -> Bath
    25: 'toilet',        # toilet -> Toilet
}

def resolve_catalog_id_from_name(class_name: str) -> str:
    """
    Dynamically maps a detected class name (e.g. from any Roboflow model) 
    to our internal Furniture Catalog IDs.
    """
    name = class_name.lower().strip()
    
    # Openings
    if 'door' in name:
        return 'door_standard'
    if 'window' in name:
        return 'window_standard'
        
    # Kitchen
    if 'stove' in name or 'oven' in name or 'cook' in name or 'range' in name:
        return 'stove'
    if 'fridge' in name or 'refrigerator' in name:
        return 'refrigerator'
    if 'kitchen sink' in name or 'sink kitchen' in name:
        return 'sink_kitchen'
    if 'kitchen' in name or 'counter' in name:
        return 'kitchen_module'
        
    # Plumbing
    if 'bath' in name or 'tub' in name:
        return 'bath'
    if 'toilet' in name or 'wc' in name:
        return 'toilet'
    if 'shower' in name:
        return 'shower'
    if 'washing' in name or 'washer' in name:
        return 'washing_machine'
    if 'sink' in name or 'washbasin' in name or 'basin' in name:
        if 'sink4' in name:
            return 'sink_kitchen'
        return 'sink'
        
    # Furniture
    if 'single bed' in name or 'bed single' in name:
        return 'bed_single'
    if 'bed' in name:
        return 'bed_double'
    if 'sofa2' in name or 'sofa_corner' in name or 'corner' in name:
        return 'sofa_corner'
    if 'sofa1' in name or 'sofa_2' in name or 'sofa 2' in name or 'love seat' in name or 'loveseat' in name:
        return 'sofa_2'
    if 'sofa' in name or 'couch' in name or 'settee' in name:
        return 'sofa_3'
    if 'armchair' in name or 'easy chair' in name:
        return 'armchair'
    if 'office chair' in name or 'desk chair' in name:
        return 'chair_office'
    if 'chair' in name or 'stool' in name or 'seat' in name:
        return 'chair_dining'
    if 'dining table' in name:
        return 'table_dining'
    if 'table' in name or 'desk' in name:
        return 'table_dining'
    if 'tv' in name or 'cabinet' in name or 'stand' in name:
        return 'tv_stand'
    if 'wardrobe' in name or 'closet' in name or 'cupboard' in name:
        return 'wardrobe'
        
    return None

class FurnitureDetector:
    def __init__(self, device: str = None):
        from model import get_safe_device
        self.device = device or get_safe_device()
        try:
            # Check for custom trained model first
            custom_model_path = Path('weights/marketing_furniture.pt')
            model_path = Path(YOLO_MODEL_PATH)
            
            loaded_path = None
            self.is_custom = False
            
            if custom_model_path.exists():
                logger.info(f"📦 Loading custom trained marketing furniture model: {custom_model_path}")
                loaded_path = custom_model_path
                self.is_custom = True
            else:
                if not model_path.exists():
                    logger.info(f"📥 Downloading specialized architectural symbol detector from Hugging Face...")
                    model_path.parent.mkdir(parents=True, exist_ok=True)
                    
                    # Show download progress (reporthook)
                    last_percent = -10
                    def progress_callback(block_num, block_size, total_size):
                        nonlocal last_percent
                        downloaded = block_num * block_size
                        if total_size > 0:
                            percent = min(100, int(downloaded * 100 / total_size))
                            if percent >= last_percent + 10:  # Log every 10%
                                logger.info(f"   Downloading weights: {percent}% completed")
                                last_percent = percent
                            
                    # Use custom user agent to avoid Hugging Face blocks
                    opener = urllib.request.build_opener()
                    opener.addheaders = [('User-agent', 'Mozilla/5.0')]
                    urllib.request.install_opener(opener)
                    
                    urllib.request.urlretrieve(HF_MODEL_URL, str(model_path), reporthook=progress_callback)
                    logger.info("✓ Model weights downloaded successfully!")
                
                logger.info(f"📦 Loading fallback YOLOv8 model: {YOLO_MODEL_PATH}")
                loaded_path = model_path
                
            self.model = YOLO(str(loaded_path))
            logger.info("✅ YOLOv8 model loaded successfully")
        except Exception as e:
            logger.error(f"❌ Failed to load YOLOv8: {e}")
            self.model = None

    def detect(self, image: np.ndarray) -> List[Dict]:
        """
        Detect furniture in the image.
        Returns a list of furniture items with catalog mappings.
        """
        if self.model is None:
            return []

        # Check color saturation to determine if it is a colored marketing plan
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        avg_saturation = np.mean(hsv[:, :, 1])
        logger.info(f"🔍 Furniture detector: Average image saturation = {avg_saturation:.2f}")
        
        # Saturation > 8.0 indicates colorful marketing plan
        # We only apply B&W outline preprocessing for the fallback CAD model.
        # Custom models (is_custom = True) are trained on colored layouts directly, so color/texture must be preserved!
        if avg_saturation > 8.0 and not self.is_custom:
            logger.info("🎨 Colored marketing plan detected. Preprocessing to clean CAD outlines...")
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            # Smooth out wood grains, carpet textures, while keeping sharp edges
            smoothed = cv2.bilateralFilter(gray, 9, 75, 75)
            # Apply adaptive thresholding to get clean black outlines on white background
            clean_cad = cv2.adaptiveThreshold(
                smoothed, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                cv2.THRESH_BINARY, 25, 12
            )
            # Convert single channel to 3 channels (BGR) for YOLOv8
            image_bgr = cv2.cvtColor(clean_cad, cv2.COLOR_GRAY2BGR)
            
            # Save preprocessed debug image to analyze quality
            try:
                cv2.imwrite('debug_furniture_prep.png', clean_cad)
                logger.info("✓ Saved preprocessed outline to debug_furniture_prep.png")
            except Exception as e:
                logger.warning(f"Could not save debug image: {e}")
        else:
            logger.info("📐 Using original BGR color image directly (YOLO expects standard BGR array).")
            image_bgr = image

        # Run inference
        results = self.model(image_bgr, verbose=False, device=self.device)
        
        detected_items = []
        
        # Process results
        for result in results:
            boxes = result.boxes
            for box in boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                
                # Log raw detection for debugging
                class_name = self.model.names[cls_id] if (self.model and self.model.names) else str(cls_id)
                logger.info(f"🔍 Raw detection: cls={cls_id} ({class_name}), conf={conf:.3f}")
                
                # Dynamic mapping lookup
                catalog_id = None
                if not self.is_custom and cls_id in CLASS_MAPPING:
                    catalog_id = CLASS_MAPPING[cls_id]
                else:
                    catalog_id = resolve_catalog_id_from_name(class_name)
                
                # Filter by confidence and supported classes
                # Lower threshold to 0.08 for doors and windows to guarantee entrance door and window snapping,
                # while keeping 0.22 for standard furniture items to suppress clutter.
                min_conf = 0.08 if (catalog_id and ('door' in catalog_id or 'window' in catalog_id)) else 0.22
                if conf < min_conf or catalog_id is None:
                    continue
                
                # Get coordinates
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                
                # Calculate center
                center_x = (x1 + x2) / 2
                center_y = (y1 + y2) / 2
                
                # Calculate dimensions (pixels)
                width = x2 - x1
                height = y2 - y1
                
                # Determine rotation (heuristic)
                # Most furniture in plans aligns with walls (0 or 90 degrees)
                # But for now we just place it default (0)
                rotation = 0
                
                detected_items.append({
                    "id": catalog_id,
                    "x": center_x,
                    "y": center_y,
                    "width": width,   # Pixel width (needs scaling in frontend)
                    "height": height, # Pixel height
                    "rotation": rotation,
                    "confidence": conf
                })
                
        logger.info(f"🪑 Detected {len(detected_items)} furniture items")
        return detected_items

