"""
FastAPI server for AI-powered floor plan processing.
Uses pretrained CubiCasa5k model for wall detection.
"""
import uvicorn
import logging
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np
from io import BytesIO
from PIL import Image

# Import our modules
from model import FloorPlanSegmentationModel, load_pretrained_model
from inference import FloorPlanInference, YOLOWallInference
from weights_manager import get_model_weights
from furniture_detection import FurnitureDetector
from semantic_planner import SemanticLayoutPlanner

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Floor Plan AI Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model instance
model = None
inference_pipeline = None
furniture_detector = None
yolo_wall_pipeline = None


@app.on_event("startup")
async def startup_event():
    """Initialize model on startup."""
    global model, inference_pipeline, furniture_detector, yolo_wall_pipeline
    
    try:
        logger.info("🚀 Starting AI service...")
        logger.info("📦 Downloading/loading pretrained weights...")
        
        # Try to get CubiCasa5k weights
        try:
            weights_path = get_model_weights('cubicasa5k')
            logger.info(f"✓ Got weights: {weights_path}")
            
            # Load model with weights
            model = load_pretrained_model(
                weights_path=str(weights_path),
                architecture='unet',
                encoder_name='resnet34',
                num_classes=5
            )
        except Exception as e:
            logger.warning(f"⚠ Could not load CubiCasa5k weights: {e}")
            logger.info("📦 Using ImageNet-pretrained encoder as fallback...")
            
            # Fallback to ImageNet pretrained encoder
            model = FloorPlanSegmentationModel.create_model(
                architecture='unet',
                encoder_name='resnet34',
                encoder_weights='imagenet',
                classes=5
            )
            model.eval()
        
        # Create inference pipeline
        inference_pipeline = FloorPlanInference(
            model=model,
            input_size=512,
            wall_class_idx=1  # Wall class in CubiCasa5k
        )
        
        logger.info("✅ AI service ready!")
        logger.info(f"   Device: {inference_pipeline.device}")
        # Initialize Furniture Detector
        try:
            furniture_detector = FurnitureDetector()
        except Exception as e:
            logger.warning(f"⚠ Failed to init furniture detector: {e}")

        # Initialize YOLOv8 Wall Segmenter if weights are present
        try:
            yolo_weights_path = Path('weights/yolov8_walls_seg.pt')
            if yolo_weights_path.exists():
                logger.info(f"📦 Loading custom YOLOv8-seg wall model: {yolo_weights_path}")
                yolo_wall_pipeline = YOLOWallInference(str(yolo_weights_path))
                logger.info("✅ Custom YOLOv8-seg wall segmenter loaded successfully")
            else:
                logger.info("ℹ Custom YOLOv8-seg wall weights (weights/yolov8_walls_seg.pt) not found. Wall detection will default to OpenCV fallback.")
        except Exception as e:
            logger.warning(f"⚠ Failed to load custom YOLOv8-seg wall segmenter: {e}")

        logger.info("✅ AI service startup complete!")
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize model: {e}")
        logger.info("   Service will use OpenCV fallback only")


def preprocess_floor_plan(img: np.ndarray) -> np.ndarray:
    """
    Advanced preprocessing for marketing floor plans.
    Includes adaptive wall color detection and enhanced contrast.
    """
    h, w = img.shape[:2]
    
    # Downscale very large images for faster processing
    max_dim = 1500
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        logger.info(f"Downscaled image from {w}x{h} to {img.shape[1]}x{img.shape[0]}")
    
    # Convert to LAB for better contrast
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    
    # CLAHE on L channel
    clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
    l_enhanced = clahe.apply(l)
    
    lab_enhanced = cv2.merge([l_enhanced, a, b])
    img_enhanced = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)
    
    # Bilateral filter for noise reduction
    img_filtered = cv2.bilateralFilter(img_enhanced, d=7, sigmaColor=50, sigmaSpace=50)
    
    logger.info("Applied CLAHE + bilateral filter preprocessing")
    
    return img_filtered


def auto_detect_wall_threshold(img: np.ndarray) -> int:
    """
    Automatically detect optimal threshold for wall color.
    Uses K-means clustering to find the darkest significant color cluster.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Get histogram of dark pixels only (< 150)
    dark_pixels = gray[gray < 150].flatten()
    
    if len(dark_pixels) < 100:
        return 80  # Default fallback
    
    # Use K-means to find 3 clusters in dark pixels
    from sklearn.cluster import KMeans
    
    # Reshape for sklearn
    dark_pixels_reshaped = dark_pixels.reshape(-1, 1).astype(np.float32)
    
    # Sample for speed
    if len(dark_pixels_reshaped) > 10000:
        indices = np.random.choice(len(dark_pixels_reshaped), 10000, replace=False)
        dark_pixels_reshaped = dark_pixels_reshaped[indices]
    
    kmeans = KMeans(n_clusters=3, random_state=42, n_init=10)
    kmeans.fit(dark_pixels_reshaped)
    
    # Get cluster centers (sorted by brightness)
    centers = sorted(kmeans.cluster_centers_.flatten())
    
    # Wall threshold is between darkest and middle cluster
    wall_threshold = int((centers[0] + centers[1]) / 2)
    wall_threshold = max(40, min(100, wall_threshold))  # Clamp to reasonable range
    
    logger.info(f"Auto-detected wall threshold: {wall_threshold} (clusters: {[int(c) for c in centers]})")
    
    return wall_threshold


def segment_rooms(gray: np.ndarray, wall_mask: np.ndarray) -> np.ndarray:
    """
    Segment image into rooms using flood fill.
    Returns labeled image where each room has unique label.
    """
    h, w = gray.shape
    
    # Invert wall mask (rooms are white, walls are black)
    room_mask = cv2.bitwise_not(wall_mask)
    
    # Clean up with morphology
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    room_mask = cv2.morphologyEx(room_mask, cv2.MORPH_OPEN, kernel, iterations=2)
    
    # Find connected components (rooms)
    num_labels, labels = cv2.connectedComponents(room_mask)
    
    logger.info(f"Found {num_labels - 1} room regions")
    
    return labels


def extract_room_boundaries(labels: np.ndarray, h: int, w: int) -> list:
    """
    Extract wall segments from room boundaries.
    Boundaries between different labeled regions are walls.
    """
    walls = []
    
    # Find edges between different labels using gradient
    gx = np.abs(np.diff(labels, axis=1))
    gy = np.abs(np.diff(labels, axis=0))
    
    # Boundaries are where gradient is non-zero
    boundary_mask = np.zeros((h, w), dtype=np.uint8)
    boundary_mask[:, :-1] |= (gx > 0).astype(np.uint8) * 255
    boundary_mask[:-1, :] |= (gy > 0).astype(np.uint8) * 255
    
    # Thin the boundaries
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    boundary_mask = cv2.morphologyEx(boundary_mask, cv2.MORPH_CLOSE, kernel)
    
    # Extract lines from boundary mask
    return extract_walls_from_mask(boundary_mask, h, w)


@app.get("/health")
def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "ai-service",
        "model_loaded": model is not None,
        "version": "1.0.0"
    }


@app.post("/process-plan")
async def process_plan(
    file: UploadFile = File(...),
    threshold: Optional[str] = Form(None),
    grayscale: Optional[str] = Form(None),
    contrast: Optional[str] = Form(None)
):
    """
    Process floor plan image and extract walls.
    Arguments:
        file: Uploaded image file
        threshold: Optional custom threshold (0-255)
        grayscale: Optional 'true' to force B&W
        contrast: Optional float > 1.0 to boost contrast
    """
    try:
        logger.info(f"📥 Received file: {file.filename}, threshold: {threshold}, bw: {grayscale}, contrast: {contrast}")
        
        # Parse threshold
        custom_threshold = None
        if threshold and threshold.strip().lower() != 'undefined':
            try:
                custom_threshold = int(threshold)
                logger.info(f"   Custom threshold: {custom_threshold}")
            except ValueError:
                logger.warning(f"   Invalid threshold value: {threshold}")

        # Read image
        contents = await file.read()
        logger.info(f"   File size: {len(contents)} bytes")
        
        nparr = np.frombuffer(contents, np.uint8)
        # Load with UNCHANGED to keep Alpha channel if present
        img_raw = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
        
        if img_raw is None:
            logger.error("❌ Failed to decode image")
            raise HTTPException(status_code=400, detail="Invalid image file - could not decode")
            
        # Handle Alpha Channel (Transparency) -> Convert to White Background
        if len(img_raw.shape) == 3 and img_raw.shape[2] == 4:
            # Has Alpha
            logger.info("ℹ Image has Alpha channel, handling transparency...")
            b, g, r, a = cv2.split(img_raw)
            overlay_color = [255, 255, 255] # White background
            
            # Create white background
            bg = np.zeros((img_raw.shape[0], img_raw.shape[1], 3), dtype=np.uint8)
            bg[:] = overlay_color
            
            # Composite
            alpha = a.astype(float) / 255
            for i in range(3):
                bg[:, :, i] = (1 - alpha) * bg[:, :, i] + alpha * img_raw[:, :, i]
            
            img = bg
            logger.info("✓ Converted transparent background to white")
        elif len(img_raw.shape) == 2:
             # Grayscale -> RGB
              img = cv2.cvtColor(img_raw, cv2.COLOR_GRAY2BGR)
        else:
            # Standard BGR
            img = img_raw
            if img.shape[2] == 4: # Just in case
                 img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
        
        # Apply Optional Preprocessing
        if grayscale and grayscale.strip().lower() == 'true':
             logger.info("🎨 Applying Smart Grayscale (Color Burn)")
             # Instead of simple Average/Luma, we use MIN channel to keep colors dark
             # And burn saturated areas
             
             # Split channels
             b, g, r = cv2.split(img)
             
             # 1. Base is the darkest channel (often Blue for beige/warm colors)
             darkest_channel = np.minimum(np.minimum(r, g), b)
             
             # 2. Calculate saturation to identify "colored" areas vs gray/white
             hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
             s = hsv[:, :, 1].astype(np.float32)
             
             # 3. Burn (darken) pixels proportional to their saturation
             # If saturation is high (0-255), we darken the pixel
             # Beige has S ~ 30-100. White has S=0.
             burn_factor = 1.0 - (s / 512.0) # Reduce brightness by up to 50% for fully saturated
             
             burned = darkest_channel.astype(np.float32) * burn_factor
             burned = np.clip(burned, 0, 255).astype(np.uint8)
             
             # 4. Enhance local contrast specifically for walls (structure extraction)
             # Inverted Top-Hat transform to catch dark thin lines
             kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
             tophat = cv2.morphologyEx(burned, cv2.MORPH_BLACKHAT, kernel)
             
             # Mix tophat (edges) back in to darken edges further
             final_gray = cv2.subtract(burned, tophat)
             
             # Restore into 3 channels
             img = cv2.cvtColor(final_gray, cv2.COLOR_GRAY2BGR)
             
             logger.info("✓ Applied Color Burn to emphasize light walls")
        
        if contrast:
            try:
                c_val = float(contrast)
                if c_val > 1.0:
                    logger.info(f"🎨 Applying Contrast Boost (CLAHE): {c_val}")
                    # Use CLAHE for smart contrast
                    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
                    l, a, b = cv2.split(lab)
                    clahe = cv2.createCLAHE(clipLimit=c_val * 2.0, tileGridSize=(8, 8))
                    l_enhanced = clahe.apply(l)
                    lab_enhanced = cv2.merge([l_enhanced, a, b])
                    img = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)
            except Exception as e:
                logger.warning(f"Failed to apply contrast: {e}")

        logger.info(f"✓ Image prepared: {img.shape}")
        
        # 1. Wall Detection
        result = None
        
        # Calculate saturation to check if it's a colored marketing plan
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        avg_saturation = np.mean(hsv[:, :, 1])
        is_colored = avg_saturation > 8.0
        logger.info(f"🔍 Wall detection: Average saturation = {avg_saturation:.2f}, is_colored = {is_colored}")
        
        # Skip neural wall models if the user manually adjusted the threshold slider,
        # or if the plan is colored (U-Net/YOLO are trained on CAD outline plans and fail on colored/textured plans)
        skip_neural = (custom_threshold is not None) or is_colored
        
        if not skip_neural and yolo_wall_pipeline is not None:
            try:
                logger.info("🤖 Running custom YOLOv8-seg wall detection...")
                result = yolo_wall_pipeline(img, snap_angles=True)
                logger.info(f"✓ YOLOv8-seg detected {result['num_walls']} walls")
                
                # Apply post-processing cleanup
                yolo_walls = result.get('walls', [])
                yolo_walls = filter_duplicate_walls(yolo_walls, distance_threshold=20)
                yolo_walls = merge_collinear_walls(yolo_walls, gap_threshold=30)
                result['walls'] = yolo_walls
                result['num_walls'] = len(yolo_walls)
                logger.info(f"✓ YOLOv8-seg: {result['num_walls']} walls remaining after cleaning")
                
                # If YOLOv8-seg returns too few walls, it might have failed, fallback
                if result['num_walls'] < 4:
                    logger.warning("⚠ YOLOv8-seg detected too few walls (<4) after cleaning, falling back...")
                    result = None
            except Exception as e:
                logger.warning(f"⚠ YOLOv8-seg wall detection failed: {e}. Falling back...")
                result = None

        # CubiCasa5k U-Net high quality wall detection
        if not skip_neural and result is None and inference_pipeline is not None:
            try:
                logger.info("🧠 Running CubiCasa5k U-Net wall detection...")
                result = inference_pipeline(img, snap_angles=True)
                logger.info(f"✓ CubiCasa5k U-Net detected {result['num_walls']} walls")
                
                unet_walls = result.get('walls', [])
                
                # Populate default thickness and kind if not present
                for wall in unet_walls:
                    if 'thickness' not in wall:
                        wall['thickness'] = 0.20
                    if 'kind' not in wall:
                        wall['kind'] = 'bearing'
                
                # Apply post-processing cleanup (collinear merge, duplicate removal)
                unet_walls = filter_duplicate_walls(unet_walls, distance_threshold=20)
                unet_walls = merge_collinear_walls(unet_walls, gap_threshold=30)
                
                result['walls'] = unet_walls
                result['num_walls'] = len(unet_walls)
                logger.info(f"✓ CubiCasa5k U-Net: {result['num_walls']} walls remaining after cleaning")
                        
                if result['num_walls'] < 4:
                    logger.warning("⚠ CubiCasa5k U-Net detected too few walls (<4) after cleaning, falling back to OpenCV...")
                    result = None
            except Exception as e:
                logger.warning(f"⚠ CubiCasa5k U-Net wall detection failed: {e}. Falling back to OpenCV...")
                result = None

        if result is None:
            # Use OpenCV color detection as standard fallback
            logger.info(f"🎨 Detecting walls using OpenCV fallback (Threshold={custom_threshold if custom_threshold else 'AUTO'})")
            result = opencv_fallback(img, custom_threshold)

        # 2. Universal Offline Semantic Layout Planner (Geometric + Room Furnisher)
        furniture_list = []
        if furniture_detector is not None:
            try:
                logger.info("🪑 Running YOLOv8 raw symbol detection...")
                raw_yolo_detections = furniture_detector.detect(img)
                logger.info(f"✓ Detected {len(raw_yolo_detections)} raw architectural symbols")
                
                # Run the Semantic Layout Planner
                h, w = img.shape[:2]
                planner = SemanticLayoutPlanner(h, w)
                openings, furniture = planner.plan_layout(result['walls'], raw_yolo_detections)
                
                # Combine openings and furniture (openings are treated as door/window catalog items)
                furniture_list = openings + furniture
                logger.info(f"✓ Semantic planner generated {len(furniture_list)} final items")
            except Exception as e:
                logger.warning(f"⚠ Semantic Layout Planner failed: {e}")
                import traceback
                logger.warning(traceback.format_exc())
        else:
            logger.info("ℹ Furniture detector not loaded, skipping furniture planning")

        # FINAL FALLBACK: Default Square (If everything failed)
        if len(result['walls']) < 4:
             logger.warning("No walls detected by any method, using default square (Last Resort)")
             h, w = img.shape[:2]
             m = 50
             result['walls'] = [
                {"start": {"x": m, "y": m}, "end": {"x": w-m, "y": m}, "thickness": 0.15, "kind": "bearing"},
                {"start": {"x": w-m, "y": m}, "end": {"x": w-m, "y": h-m}, "thickness": 0.15, "kind": "bearing"},
                {"start": {"x": w-m, "y": h-m}, "end": {"x": m, "y": h-m}, "thickness": 0.15, "kind": "bearing"},
                {"start": {"x": m, "y": h-m}, "end": {"x": m, "y": m}, "thickness": 0.15, "kind": "bearing"},
            ]
             
        # Decision Logic: Return processed result with walls and furniture
        logger.info(f"👉 Plan processing complete ({len(result['walls'])} walls, {len(furniture_list)} furniture)")
        result["furniture"] = furniture_list
        logger.info(f"✓ Final result: {len(result['walls'])} walls detected")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"💥 Error processing plan: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


def opencv_fallback(img: np.ndarray, custom_threshold: Optional[int] = None) -> dict:
    """
    Simple, extremely reliable structural wall detection.
    Uses 2-stage morphology to isolate thick structural walls from thin lines (furniture, text).
    """
    logger.info(f"Original image size: {img.shape[1]}x{img.shape[0]}")
    
    # Preprocessing: just resize if too large
    h, w = img.shape[:2]
    max_dim = 1500
    scale_factor = 1.0
    if max(h, w) > max_dim:
        scale_factor = max_dim / max(h, w)
        img = cv2.resize(img, None, fx=scale_factor, fy=scale_factor, interpolation=cv2.INTER_AREA)
        h, w = img.shape[:2]
        logger.info(f"Resized to {w}x{h}")
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # We choose the threshold
    # Default threshold for dark walls in grayscale is around 140 (good average)
    threshold_value = custom_threshold if custom_threshold is not None else 140
    
    # Threshold the image (invert so walls are white, background is black)
    _, wall_mask = cv2.threshold(gray, threshold_value, 255, cv2.THRESH_BINARY_INV)
    
    # --- 2-Stage Structural Morphology ---
    # Determine dynamic kernel sizes based on image dimensions
    min_dim = min(h, w)
    # Increase kernel sizes for color plans to aggressively filter out textured furniture and text outlines
    hsv_check = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    avg_sat = np.mean(hsv_check[:, :, 1])
    if avg_sat > 8.0:
        open_k_size = max(7, int(min_dim * 0.008) | 1)  # e.g. 7px for 800px min_dim
        close_k_size = max(9, int(min_dim * 0.012) | 1)  # e.g. 9px for 800px min_dim
    else:
        open_k_size = max(5, int(min_dim * 0.005) | 1)
        close_k_size = max(7, int(min_dim * 0.009) | 1)
    
    logger.info(f"Using structural kernels: open={open_k_size}x{open_k_size}, close={close_k_size}x{close_k_size}, saturation={avg_sat:.1f}")
    
    kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (open_k_size, open_k_size))
    kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (close_k_size, close_k_size))
    
    # 1. Structural Opening: erase all elements thinner than open_k_size (furniture outlines, text, dimensions)
    # This leaves ONLY the thick structural walls!
    wall_mask_cleaned = cv2.morphologyEx(wall_mask, cv2.MORPH_OPEN, kernel_open, iterations=1)
    
    # 2. Structural Closing: bridge gaps in the walls (doors, windows)
    # This connects the wall segments into continuous rooms
    wall_mask_cleaned = cv2.morphologyEx(wall_mask_cleaned, cv2.MORPH_CLOSE, kernel_close, iterations=2)
    
    # Save debug mask to inspect wall extraction quality
    try:
        cv2.imwrite('debug_mask.png', wall_mask_cleaned)
        logger.info("✓ Saved processed wall mask to debug_mask.png")
    except Exception as e:
        logger.warning(f"Could not save debug mask: {e}")
        
    # Extract walls from the clean mask
    all_walls = extract_walls_simple(wall_mask_cleaned, h, w)
    
    # Basic filtering: remove very short walls
    min_length = min(h, w) * 0.015  # 1.5% of min dimension
    all_walls = [w for w in all_walls if w.get('length', 100) >= min_length]
    
    # Remove duplicates
    all_walls = filter_duplicate_walls(all_walls, distance_threshold=20)
    
    # Merge collinear walls
    all_walls = merge_collinear_walls(all_walls, gap_threshold=30)
    
    logger.info(f"Final OpenCV wall extraction result: {len(all_walls)} walls")
    
    return {
        "walls": all_walls,
        "image_width": w,
        "image_height": h,
        "method": "opencv_fallback"
    }


def extract_walls_simple(mask: np.ndarray, h: int, w: int) -> list:
    """Extract wall lines from binary mask using simple contour analysis."""
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    walls = []
    # Reduced thresholds: 1% of min dimension, or 15px
    min_length = max(15, min(h, w) * 0.01) 
    min_area = max(50, (min(h, w) * 0.003) ** 2)
    
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue
        
        x, y, bw, bh = cv2.boundingRect(contour)
        
        # Approximate to polygon - clean epsilon (0.006 arcLength for straight line approximation)
        epsilon = 0.006 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)
        logger.debug(f"Contour: {len(contour)} pts -> {len(approx)} vertices (epsilon={epsilon:.1f})")
        
        # Extract line segments
        for i in range(len(approx)):
            p1 = approx[i][0]
            p2 = approx[(i + 1) % len(approx)][0]
            
            dx, dy = p2[0] - p1[0], p2[1] - p1[1]
            length = np.sqrt(dx**2 + dy**2)
            
            if length < min_length:
                continue
            
            # Snap to H/V only if very close
            # Orthogonal snaps and diagonal filtering
            angle = np.degrees(np.arctan2(abs(dy), abs(dx)))
            if angle < 15: # Horizontal-ish
                y_avg = (p1[1] + p2[1]) // 2
                p1 = (int(p1[0]), int(y_avg))
                p2 = (int(p2[0]), int(y_avg))
            elif angle > 75: # Vertical-ish
                x_avg = (p1[0] + p2[0]) // 2
                p1 = (int(x_avg), int(p1[1]))
                p2 = (int(x_avg), int(p2[1]))
            else:
                # Discard crooked/diagonal wall segments from underlines/text
                logger.info(f"🚫 Discarding crooked diagonal wall segment at {angle:.1f}°")
                continue
            
            # Midpoint coordinate to classify interior vs exterior walls
            mx = (p1[0] + p2[0]) / 2.0
            my = (p1[1] + p2[1]) / 2.0
            
            # Universal margins: interior walls lie away from the borders
            is_interior_x = (0.15 * w) < mx < (0.85 * w)
            is_interior_y = (0.15 * h) < my < (0.85 * h)
            
            if is_interior_x and is_interior_y:
                thickness_m = 0.15
                kind = "partition"
            else:
                thickness_m = 0.25
                kind = "bearing"
            
            walls.append({
                "start": {"x": int(p1[0]), "y": int(p1[1])},
                "end": {"x": int(p2[0]), "y": int(p2[1])},
                "length": float(length),
                "thickness": float(thickness_m),
                "kind": kind
            })
    
    return walls


def filter_by_geometry(walls: list, h: int, w: int) -> list:
    """
    Filter walls by geometric properties.
    Walls are elongated (high aspect ratio) and have minimum length.
    """
    min_length = min(h, w) * 0.04  # 4% of image size
    
    filtered = []
    for wall in walls:
        length = wall.get('length', 0)
        if length < 1:
            x1, y1 = wall['start']['x'], wall['start']['y']
            x2, y2 = wall['end']['x'], wall['end']['y']
            length = np.sqrt((x2-x1)**2 + (y2-y1)**2)
            wall['length'] = length
        
        # Keep walls that are long enough
        if length >= min_length:
            filtered.append(wall)
    
    logger.info(f"Geometry filter: {len(walls)} -> {len(filtered)} walls (min_length={min_length:.0f})")
    return filtered


def filter_by_connectivity(walls: list, connection_threshold: float = 30) -> list:
    """
    Filter walls by connectivity.
    Keep only walls that connect to at least one other wall.
    This removes isolated furniture-like segments.
    """
    if len(walls) < 3:
        return walls
    
    # Build connection graph
    connected = [False] * len(walls)
    
    for i, wall1 in enumerate(walls):
        if connected[i]:
            continue
            
        x1_s, y1_s = wall1['start']['x'], wall1['start']['y']
        x1_e, y1_e = wall1['end']['x'], wall1['end']['y']
        
        for j, wall2 in enumerate(walls):
            if i == j:
                continue
                
            x2_s, y2_s = wall2['start']['x'], wall2['start']['y']
            x2_e, y2_e = wall2['end']['x'], wall2['end']['y']
            
            # Check if any endpoints are close
            endpoints = [
                (x1_s, y1_s, x2_s, y2_s),
                (x1_s, y1_s, x2_e, y2_e),
                (x1_e, y1_e, x2_s, y2_s),
                (x1_e, y1_e, x2_e, y2_e),
            ]
            
            for x1, y1, x2, y2 in endpoints:
                dist = np.sqrt((x2-x1)**2 + (y2-y1)**2)
                if dist < connection_threshold:
                    connected[i] = True
                    connected[j] = True
                    break
            
            if connected[i]:
                break
    
    filtered = [wall for i, wall in enumerate(walls) if connected[i]]
    
    logger.info(f"Connectivity filter: {len(walls)} -> {len(filtered)} walls")
    return filtered


def filter_by_topology(walls: list, gray: np.ndarray, h: int, w: int) -> list:
    """
    Filter walls using topological analysis.
    Keeps walls that are part of the apartment perimeter or connect to it.
    """
    if len(walls) < 5:
        return walls  # Not enough walls to filter
    
    # Find the apartment perimeter (largest dark contour)
    _, binary = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY_INV)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=3)
    
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return walls
    
    # Find the largest contour (apartment boundary)
    largest_contour = max(contours, key=cv2.contourArea)
    perimeter_area = cv2.contourArea(largest_contour)
    
    # If perimeter is too small, skip filtering
    if perimeter_area < (h * w) * 0.1:  # Less than 10% of image
        logger.info("Perimeter too small, skipping topological filtering")
        return walls
    
    # Get perimeter polygon
    epsilon = 0.01 * cv2.arcLength(largest_contour, True)
    perimeter_poly = cv2.approxPolyDP(largest_contour, epsilon, True)
    
    logger.info(f"Found perimeter with area {perimeter_area:.0f}, {len(perimeter_poly)} vertices")
    
    # Create a mask of the perimeter boundary region
    perimeter_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(perimeter_mask, [largest_contour], -1, 255, thickness=60)  # 60px thick boundary
    
    # Filter walls: keep those with endpoints near the perimeter
    filtered_walls = []
    connection_threshold = 50  # pixels
    
    for wall in walls:
        x1, y1 = wall['start']['x'], wall['start']['y']
        x2, y2 = wall['end']['x'], wall['end']['y']
        
        # Check if wall endpoints are near the perimeter
        # Point is near perimeter if it's within the perimeter mask
        near_perimeter_start = False
        near_perimeter_end = False
        
        # Check start point
        if 0 <= y1 < h and 0 <= x1 < w:
            near_perimeter_start = perimeter_mask[int(y1), int(x1)] > 0
        
        # Check end point
        if 0 <= y2 < h and 0 <= x2 < w:
            near_perimeter_end = perimeter_mask[int(y2), int(x2)] > 0
        
        # Keep wall if at least one endpoint touches perimeter
        # OR if it's a long wall (likely an internal wall spanning the apartment)
        wall_length = wall.get('length', np.sqrt((x2-x1)**2 + (y2-y1)**2))
        min_dim = min(h, w)
        is_long_wall = wall_length > min_dim * 0.15  # More than 15% of image size
        
        if near_perimeter_start or near_perimeter_end or is_long_wall:
            # Mark walls touching perimeter as bearing
            if near_perimeter_start and near_perimeter_end:
                wall['kind'] = 'bearing'
            filtered_walls.append(wall)
    
    logger.info(f"Topological filter: {len(walls)} -> {len(filtered_walls)} walls")
    
    # If filtering removed too many walls, return original
    if len(filtered_walls) < 4:
        logger.warning("Topological filter too aggressive, keeping original walls")
        return walls
    
    return filtered_walls


def detect_walls_by_color(img: np.ndarray, gray: np.ndarray, h: int, w: int) -> list:
    """Detect walls by dark color filtering."""
    # Compute HSV and ensure gray matches img size
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    gray_local = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)  # Use local gray to ensure same size as HSV
    
    # Dark pixels (gray < 100) - more relaxed
    _, dark_mask = cv2.threshold(gray_local, 100, 255, cv2.THRESH_BINARY_INV)
    
    # Low Value in HSV (V < 120)
    low_v_mask = (hsv[:, :, 2] < 120).astype(np.uint8) * 255
    
    # Combine with OR
    wall_mask = cv2.bitwise_or(dark_mask, low_v_mask)
    
    # Light morphology
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    wall_mask = cv2.morphologyEx(wall_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    
    return extract_walls_from_mask(wall_mask, h, w)


def detect_walls_by_edges(gray: np.ndarray, h: int, w: int) -> list:
    """Detect walls using edge detection and Hough lines."""
    # Blur to reduce noise
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # Canny edge detection
    edges = cv2.Canny(blur, 30, 100)
    
    # Dilate edges to connect nearby ones
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges = cv2.dilate(edges, kernel, iterations=1)
    
    # Hough lines with relaxed parameters
    min_length = max(30, min(h, w) * 0.03)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi/180,
        threshold=50,
        minLineLength=int(min_length),
        maxLineGap=20
    )
    
    walls = []
    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]
            dx, dy = x2 - x1, y2 - y1
            length = np.sqrt(dx**2 + dy**2)
            
            # Orientation filter (H/V ±20°)
            angle = np.degrees(np.arctan2(abs(dy), abs(dx)))
            if angle > 20 and angle < 70:
                continue
            
            # Snap to H/V
            if angle < 20:
                y_avg = (y1 + y2) // 2
                y1, y2 = y_avg, y_avg
            else:
                x_avg = (x1 + x2) // 2
                x1, x2 = x_avg, x_avg
            
            walls.append({
                "start": {"x": int(x1), "y": int(y1)},
                "end": {"x": int(x2), "y": int(y2)},
                "length": float(length),
                "thickness": 0.2, # Default to bearing thickness
                "kind": "bearing" # Default to bearing
            })
    
    return walls


def detect_walls_adaptive(gray: np.ndarray, h: int, w: int, custom_threshold: Optional[int] = None) -> list:
    """Detect walls using adaptive thresholding."""
    # Default C parameter is 5
    c_val = 5
    open_iter = 1
    
    if custom_threshold is not None:
        t_normalized = (custom_threshold - 10) / 240.0  # 0.0 to 1.0
        t_normalized = max(0.0, min(1.0, t_normalized))
        
        # Map threshold 10-250 → C value 12 to 1 (more sensitivity -> lower C -> more walls)
        c_val = int(12 - 11 * t_normalized)
        
        # Map threshold 10-250 → open_iterations 2 to 0
        open_iter = int(round(2 * (1 - t_normalized)))
        
        logger.info(f"Adaptive thresholding custom scale: C={c_val}, open_iterations={open_iter}")
        
    # Adaptive threshold
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv2.THRESH_BINARY_INV, 21, c_val
    )
    
    # Morphology to clean up
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)
    if open_iter > 0:
        binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=open_iter)
    
    return extract_walls_from_mask(binary, h, w)


def extract_walls_from_mask(mask: np.ndarray, h: int, w: int) -> list:
    """Extract wall lines from a binary mask."""
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    walls = []
    min_wall_length = max(25, min(h, w) * 0.025)  # 2.5% of image
    min_contour_area = max(200, (min(h, w) * 0.008) ** 2)
    
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_contour_area:
            continue
        
        x, y, bw, bh = cv2.boundingRect(contour)
        aspect = max(bw, bh) / (min(bw, bh) + 1)
        
        # Accept more shapes (aspect > 1.5)
        if aspect < 1.5 and area < min_contour_area * 3:
            continue
        
        wall_thickness_px = min(bw, bh)
        
        epsilon = 0.008 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)
        
        for i in range(len(approx)):
            p1 = approx[i][0]
            p2 = approx[(i + 1) % len(approx)][0]
            
            dx, dy = p2[0] - p1[0], p2[1] - p1[1]
            length = np.sqrt(dx**2 + dy**2)
            
            if length < min_wall_length:
                continue
            
            # Orientation filter - REMOVED
            angle = np.degrees(np.arctan2(abs(dy), abs(dx)))
            # if angle > 20 and angle < 70:
            #     continue
            
            # Snap to H/V only if close
            if angle < 10:
                y_avg = (p1[1] + p2[1]) // 2
                p1 = (p1[0], y_avg)
                p2 = (p2[0], y_avg)
            elif angle > 80:
                x_avg = (p1[0] + p2[0]) // 2
                p1 = (x_avg, p1[1])
                p2 = (x_avg, p2[1])
            
            # Midpoint coordinate to classify interior vs exterior walls
            mx = (p1[0] + p2[0]) / 2.0
            my = (p1[1] + p2[1]) / 2.0
            
            # Universal margins: interior walls lie away from the borders
            is_interior_x = (0.15 * w) < mx < (0.85 * w)
            is_interior_y = (0.15 * h) < my < (0.85 * h)
            
            if is_interior_x and is_interior_y:
                thickness_m = 0.15
                kind = "partition"
            else:
                thickness_m = 0.25
                kind = "bearing"
            
            walls.append({
                "start": {"x": int(p1[0]), "y": int(p1[1])},
                "end": {"x": int(p2[0]), "y": int(p2[1])},
                "length": float(length),
                "thickness": float(thickness_m),
                "kind": kind
            })
    
    return walls


def merge_collinear_walls(walls: list, gap_threshold: float = 50) -> list:
    """Merge walls that are collinear and close together."""
    if len(walls) < 2:
        return walls
    
    merged = []
    used = set()
    
    for i, wall1 in enumerate(walls):
        if i in used:
            continue
        
        # Check if wall is diagonal
        dx1 = abs(wall1['end']['x'] - wall1['start']['x'])
        dy1 = abs(wall1['end']['y'] - wall1['start']['y'])
        angle = np.degrees(np.arctan2(dy1, dx1))
        
        if 10 < angle < 80:
            # Diagonal wall - do not attempt to merge with H/V logic
            # This prevents diagonal walls from being "straightened"
            merged.append(wall1)
            used.add(i)
            continue

        # Determine if wall is horizontal or vertical
        is_horizontal = dx1 > dy1
        
        # Find other walls on same line
        best_start = wall1['start'].copy()
        best_end = wall1['end'].copy()
        
        for j, wall2 in enumerate(walls):
            if i == j or j in used:
                continue
            
            dx2 = abs(wall2['end']['x'] - wall2['start']['x'])
            dy2 = abs(wall2['end']['y'] - wall2['start']['y'])
            is_horizontal2 = dx2 > dy2
            
            if is_horizontal != is_horizontal2:
                continue
            
            if is_horizontal:
                # Check if on same horizontal line (similar Y)
                y1 = (wall1['start']['y'] + wall1['end']['y']) / 2
                y2 = (wall2['start']['y'] + wall2['end']['y']) / 2
                if abs(y1 - y2) > 20:
                    continue
                
                # Check if close enough to merge
                min1, max1 = min(wall1['start']['x'], wall1['end']['x']), max(wall1['start']['x'], wall1['end']['x'])
                min2, max2 = min(wall2['start']['x'], wall2['end']['x']), max(wall2['start']['x'], wall2['end']['x'])
                
                if min2 > max1 + gap_threshold or min1 > max2 + gap_threshold:
                    continue
                
                # Merge
                new_min = min(min1, min2)
                new_max = max(max1, max2)
                best_start = {'x': new_min, 'y': int(y1)}
                best_end = {'x': new_max, 'y': int(y1)}
                used.add(j)
            else:
                # Check if on same vertical line (similar X)
                x1 = (wall1['start']['x'] + wall1['end']['x']) / 2
                x2 = (wall2['start']['x'] + wall2['end']['x']) / 2
                if abs(x1 - x2) > 20:
                    continue
                
                # Check if close enough to merge
                min1, max1 = min(wall1['start']['y'], wall1['end']['y']), max(wall1['start']['y'], wall1['end']['y'])
                min2, max2 = min(wall2['start']['y'], wall2['end']['y']), max(wall2['start']['y'], wall2['end']['y'])
                
                if min2 > max1 + gap_threshold or min1 > max2 + gap_threshold:
                    continue
                
                # Merge
                new_min = min(min1, min2)
                new_max = max(max1, max2)
                best_start = {'x': int(x1), 'y': new_min}
                best_end = {'x': int(x1), 'y': new_max}
                used.add(j)
        
        merged.append({
            'start': best_start,
            'end': best_end,
            'length': np.sqrt((best_end['x']-best_start['x'])**2 + (best_end['y']-best_start['y'])**2),
            'thickness': wall1.get('thickness', 0.2), # Preserve thickness
            'kind': wall1.get('kind', 'bearing')      # Preserve kind
        })
        used.add(i)
    
    return merged


def filter_duplicate_walls(walls: list, distance_threshold: float = 20) -> list:
    """Remove duplicate or near-duplicate walls."""
    if not walls:
        return walls
    
    filtered = []
    for wall in walls:
        is_duplicate = False
        for existing in filtered:
            # Check if walls are nearly identical
            d1 = np.sqrt((wall['start']['x'] - existing['start']['x'])**2 + 
                         (wall['start']['y'] - existing['start']['y'])**2)
            d2 = np.sqrt((wall['end']['x'] - existing['end']['x'])**2 + 
                         (wall['end']['y'] - existing['end']['y'])**2)
            
            if d1 < distance_threshold and d2 < distance_threshold:
                is_duplicate = True
                break
            
            # Also check reversed
            d1r = np.sqrt((wall['start']['x'] - existing['end']['x'])**2 + 
                          (wall['start']['y'] - existing['end']['y'])**2)
            d2r = np.sqrt((wall['end']['x'] - existing['start']['x'])**2 + 
                          (wall['end']['y'] - existing['start']['y'])**2)
            
            if d1r < distance_threshold and d2r < distance_threshold:
                is_duplicate = True
                break
        
        if not is_duplicate:
            filtered.append(wall)
    
    return filtered


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000)
