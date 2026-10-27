"""
FastAPI server for AI-powered floor plan processing.
Uses pretrained CubiCasa5k model for wall detection.
"""
import asyncio
import os
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
from style_router import detect_plan_style
from mask2former_walls import predict_wall_mask as mask2former_predict_wall_mask, get_mask2former_detector
from wall_graph import mask_to_wall_segments, offset_walls
from room_ocr import _get_reader as get_ocr_reader

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

# Limits: reject oversized uploads and work in a single <=1500px coordinate system
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_IMAGE_DIM = 1500

# Inference is synchronous (OpenCV/YOLO/PyTorch) - run it in a single worker thread
# so a request never blocks the event loop (and /health stays responsive).
from concurrent.futures import ThreadPoolExecutor
inference_executor = ThreadPoolExecutor(max_workers=1)


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

        # Warm OCR + Mask2Former so first /process-plan is not a cold start
        try:
            get_ocr_reader()
        except Exception as e:
            logger.warning(f"⚠ EasyOCR preload skipped: {e}")
        try:
            get_mask2former_detector()._ensure_loaded()
        except Exception as e:
            logger.warning(f"⚠ Mask2Former preload skipped: {e}")

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


def content_crop(img: np.ndarray, pad_ratio: float = 0.03) -> tuple:
    """
    Crop to the largest non-white content blob (removes empty margins / frame noise).
    Returns (cropped_img, offset_x, offset_y). If crop is unsafe, returns the original.
    """
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Non-white content
    content = (gray < 245).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    content = cv2.morphologyEx(content, cv2.MORPH_CLOSE, kernel, iterations=2)
    contours, _ = cv2.findContours(content, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return img, 0, 0
    largest = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(largest)
    if area < 0.08 * h * w:
        return img, 0, 0
    x, y, bw, bh = cv2.boundingRect(largest)
    pad = int(max(bw, bh) * pad_ratio)
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(w, x + bw + pad)
    y1 = min(h, y + bh + pad)
    # Avoid tiny / near-full crops
    if (x1 - x0) < 0.35 * w or (y1 - y0) < 0.35 * h:
        return img, 0, 0
    if (x1 - x0) >= 0.98 * w and (y1 - y0) >= 0.98 * h:
        return img, 0, 0
    cropped = img[y0:y1, x0:x1].copy()
    logger.info(f"✂ Content crop: {w}x{h} → {cropped.shape[1]}x{cropped.shape[0]} (offset {x0},{y0})")
    return cropped, x0, y0


def walls_from_mask(mask: np.ndarray, method: str, gray_for_topology: Optional[np.ndarray] = None) -> dict:
    """Skeletonize a wall mask into API wall segments + cleanup filters."""
    h, w = mask.shape[:2]
    walls = mask_to_wall_segments(mask, px_per_meter_hint=max(h, w) / 10.0)
    walls = filter_duplicate_walls(walls, distance_threshold=20)
    walls = merge_collinear_walls(walls, gap_threshold=30)
    walls = filter_by_connectivity(walls, connection_threshold=max(25, int(min(h, w) * 0.03)))
    if gray_for_topology is not None:
        walls = filter_by_topology(walls, gray_for_topology, h, w)
    walls = mark_outer_walls_bearing(walls)
    return {
        "walls": walls,
        "image_width": w,
        "image_height": h,
        "num_walls": len(walls),
        "method": method,
    }


def mark_outer_walls_bearing(walls: list) -> list:
    """
    Promote perimeter wall segments to bearing so windows can host on them.

    Uses distance-to-convex-hull (not axis-aligned bbox) so a balcony stub
    sticking out does not demote the main facade (living-room windows).
    """
    if len(walls) < 3:
        return walls
    pts = []
    for wall in walls:
        pts.append([wall['start']['x'], wall['start']['y']])
        pts.append([wall['end']['x'], wall['end']['y']])
    arr = np.array(pts, dtype=np.float32).reshape(-1, 1, 2)
    hull = cv2.convexHull(arr)
    # Approximate apartment span for margin
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    span = max(max(xs) - min(xs), max(ys) - min(ys), 1.0)
    margin = max(22.0, 0.035 * span)
    for wall in walls:
        mx = (wall['start']['x'] + wall['end']['x']) / 2.0
        my = (wall['start']['y'] + wall['end']['y']) / 2.0
        # Also sample endpoints — short facade pieces near hull corners
        samples = [
            (mx, my),
            (wall['start']['x'], wall['start']['y']),
            (wall['end']['x'], wall['end']['y']),
        ]
        on_hull = False
        for sx, sy in samples:
            dist = abs(cv2.pointPolygonTest(hull, (float(sx), float(sy)), True))
            if dist <= margin:
                on_hull = True
                break
        if on_hull:
            wall['kind'] = 'bearing'
            wall['thickness'] = max(float(wall.get('thickness', 0.2)), 0.22)
    return walls


def _segment_covered_by_walls(
    walls: list, x1: float, y1: float, x2: float, y2: float, tol: float
) -> bool:
    """True if an existing wall already covers most of this segment."""
    mx, my = (x1 + x2) / 2.0, (y1 + y2) / 2.0
    seg_len = float(np.hypot(x2 - x1, y2 - y1))
    if seg_len < 1:
        return True
    for wall in walls:
        wx1, wy1 = wall['start']['x'], wall['start']['y']
        wx2, wy2 = wall['end']['x'], wall['end']['y']
        wdx, wdy = wx2 - wx1, wy2 - wy1
        wlen = float(np.hypot(wdx, wdy))
        if wlen < 1:
            continue
        # Orientation must match
        if abs(wdx) >= abs(wdy):
            if abs(x2 - x1) < abs(y2 - y1):
                continue
            if abs(my - (wy1 + wy2) / 2.0) > tol:
                continue
            a0, a1 = min(x1, x2), max(x1, x2)
            b0, b1 = min(wx1, wx2), max(wx1, wx2)
        else:
            if abs(y2 - y1) < abs(x2 - x1):
                continue
            if abs(mx - (wx1 + wx2) / 2.0) > tol:
                continue
            a0, a1 = min(y1, y2), max(y1, y2)
            b0, b1 = min(wy1, wy2), max(wy1, wy2)
        overlap = max(0.0, min(a1, b1) - max(a0, b0))
        if overlap >= 0.55 * seg_len:
            return True
    return False


def augment_walls_from_ink(img: np.ndarray, walls: list, px_per_meter: float = None) -> list:
    """
    Recover thin dark wall strokes that neural masks often miss:
    wet-room partitions, entrance-wall stubs, balcony glazing frames.
    Ignores colored dashed zone boundaries (kitchen/living).
    """
    if img is None or img.size == 0:
        return walls
    h, w = img.shape[:2]
    ppm = px_per_meter if px_per_meter and px_per_meter > 0 else max(h, w) / 10.0
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    # Dark ink, low chroma (skip orange dashed zone lines)
    ink = ((gray < 90) & (hsv[:, :, 1] < 70)).astype(np.uint8) * 255
    k = max(3, int(0.03 * ppm) | 1)
    ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8), iterations=1)
    ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)

    min_len = max(18.0, 0.55 * ppm)
    max_gap = max(8, int(0.25 * ppm))
    lines = cv2.HoughLinesP(
        ink,
        rho=1,
        theta=np.pi / 180,
        threshold=max(25, int(0.45 * ppm)),
        minLineLength=int(min_len),
        maxLineGap=max_gap,
    )
    if lines is None:
        return walls

    tol = max(10.0, 0.22 * ppm)
    added = []
    working = list(walls)
    for line in lines:
        x1, y1, x2, y2 = map(float, line[0])
        dx, dy = x2 - x1, y2 - y1
        length = float(np.hypot(dx, dy))
        if length < min_len:
            continue
        angle = float(np.degrees(np.arctan2(abs(dy), abs(dx))))
        if 18.0 < angle < 72.0:
            continue
        # Snap H/V
        if angle <= 18.0:
            y = round((y1 + y2) / 2.0)
            x1, x2, y1, y2 = x1, x2, y, y
        else:
            x = round((x1 + x2) / 2.0)
            x1, x2, y1, y2 = x, x, y1, y2
        if _segment_covered_by_walls(working + added, x1, y1, x2, y2, tol):
            continue
        # Require enough ink support along the candidate (reject dashed leftovers)
        n = max(5, int(length / 6))
        hits = 0
        for t in np.linspace(0.05, 0.95, n):
            px = int(round(x1 + t * (x2 - x1)))
            py = int(round(y1 + t * (y2 - y1)))
            if 0 <= px < w and 0 <= py < h and ink[py, px] > 0:
                hits += 1
        if hits / n < 0.55:
            continue
        thick_m = 0.12 if length < 2.5 * ppm else 0.18
        kind = 'partition'
        added.append({
            'start': {'x': int(round(x1)), 'y': int(round(y1))},
            'end': {'x': int(round(x2)), 'y': int(round(y2))},
            'length': length,
            'thickness': thick_m,
            'kind': kind,
        })

    if not added:
        return walls
    merged = working + added
    merged = filter_duplicate_walls(merged, distance_threshold=max(12, int(0.2 * ppm)))
    merged = merge_collinear_walls(merged, gap_threshold=max(20, int(0.3 * ppm)))
    merged = mark_outer_walls_bearing(merged)
    logger.info(f"🖋 Ink augmentation: +{len(added)} wall segment(s) → {len(merged)} total")
    return merged


def detect_door_arcs(
    img: np.ndarray, walls: list, px_per_meter: float, existing_doors: list = None
) -> list:
    """
    Detect quarter-circle door swing symbols on marketing plans.

    Very strict: only keep arcs whose radius matches a door (~0.7–1.0 m),
    whose center sits ~1 radius off a wall, and that are not already covered
    by YOLO. Caps output to avoid flooding the planner.
    """
    if img is None or not walls or not px_per_meter:
        return []
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Prefer dark ink strokes (door arcs) over noisy Canny of fills
    ink = (gray < 110).astype(np.uint8) * 255
    ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    edges = cv2.Canny(ink, 50, 140)
    min_r = max(10, int(0.55 * px_per_meter))
    max_r = max(min_r + 2, int(0.95 * px_per_meter))
    circles = cv2.HoughCircles(
        edges,
        cv2.HOUGH_GRADIENT,
        dp=1.4,
        minDist=max(20, int(1.1 * px_per_meter)),
        param1=100,
        param2=28,
        minRadius=min_r,
        maxRadius=max_r,
    )
    if circles is None:
        return []

    known = list(existing_doors or [])
    doors = []
    # Facade extremes — prefer entrance-like arcs on outer walls
    endpoints = []
    for wall in walls:
        endpoints.append((wall['start']['x'], wall['start']['y']))
        endpoints.append((wall['end']['x'], wall['end']['y']))
    xs = [p[0] for p in endpoints] or [0]
    ys = [p[1] for p in endpoints] or [0]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    facade_m = 1.2 * px_per_meter

    scored = []
    for cx, cy, r in circles[0]:
        cx, cy, r = float(cx), float(cy), float(r)
        best = None
        best_dist = float('inf')
        best_outer = False
        for wall in walls:
            x1, y1 = wall['start']['x'], wall['start']['y']
            x2, y2 = wall['end']['x'], wall['end']['y']
            dx, dy = x2 - x1, y2 - y1
            l2 = dx * dx + dy * dy
            if l2 < 1:
                continue
            t = max(0.0, min(1.0, ((cx - x1) * dx + (cy - y1) * dy) / l2))
            # Prefer hinge near segment interior, not at far corners of long walls
            if t < 0.05 or t > 0.95:
                continue
            px, py = x1 + t * dx, y1 + t * dy
            dist = float(np.hypot(cx - px, cy - py))
            if abs(dist - r) < 0.28 * px_per_meter and dist < best_dist:
                best_dist = dist
                mx, my = px, py
                best_outer = (
                    mx <= minx + facade_m or mx >= maxx - facade_m or
                    my <= miny + facade_m or my >= maxy - facade_m
                )
                best = (px, py, r, best_outer)
        if best is None:
            continue
        px, py, rad, is_outer = best
        if any(np.hypot(px - d['x'], py - d['y']) < 0.85 * px_per_meter for d in known + doors):
            continue
        # Ink density on the arc ring (quarter-circle support)
        ring_hits, ring_total = 0, 0
        for ang in range(0, 360, 12):
            rad_a = np.radians(ang)
            ax = int(round(cx + rad * np.cos(rad_a)))
            ay = int(round(cy + rad * np.sin(rad_a)))
            if 0 <= ax < gray.shape[1] and 0 <= ay < gray.shape[0]:
                ring_total += 1
                if ink[ay, ax] > 0:
                    ring_hits += 1
        if ring_total < 8 or ring_hits / ring_total < 0.18:
            continue
        score = (ring_hits / max(1, ring_total)) + (0.35 if is_outer else 0.0)
        scored.append((score, {
            'id': 'door_standard',
            'x': float(px),
            'y': float(py),
            'width': float(max(0.8 * px_per_meter, rad)),
            'height': float(max(0.8 * px_per_meter, rad)),
            'rotation': 0.0,
            'confidence': 0.58 if is_outer else 0.50,
        }))

    scored.sort(key=lambda t: -t[0])
    # Keep only the best outer-facade arcs (entrance / balcony door) — max 2
    outer = [d for s, d in scored if d.get('confidence', 0) >= 0.58]
    doors = (outer[:2] if outer else [d for _, d in scored[:1]])
    if doors:
        logger.info(f"🚪 Door-arc detector: {len(doors)} door(s) (from {len(scored)} candidates)")
    return doors


def extend_walls_for_entrance_doors(walls: list, doors: list, px_per_meter: float) -> list:
    """
    If an exterior door sits just past the end of a facade wall stub, extend
    that wall through the door so the opening can snap (common for entrance).

    Strictly axis-aligned: never create diagonals.
    """
    if not walls or not doors or not px_per_meter:
        return walls
    endpoints = []
    for wall in walls:
        endpoints.append((wall['start']['x'], wall['start']['y']))
        endpoints.append((wall['end']['x'], wall['end']['y']))
    xs = [p[0] for p in endpoints] or [0]
    ys = [p[1] for p in endpoints] or [0]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    facade_m = 0.85 * px_per_meter
    working = [dict(w, start=dict(w['start']), end=dict(w['end'])) for w in walls]
    line_tol = max(12.0, 0.22 * px_per_meter)

    for door in doors:
        if door.get('id') != 'door_standard':
            continue
        # Only confident exterior / entrance candidates
        if float(door.get('confidence', 0)) < 0.45:
            continue
        dx, dy = float(door['x']), float(door['y'])
        on_facade = (
            dx <= minx + facade_m or dx >= maxx - facade_m or
            dy <= miny + facade_m or dy >= maxy - facade_m
        )
        near_right = dx >= maxx - 2.0 * px_per_meter
        if not (on_facade or near_right):
            continue

        best_i, best_dist, best_end, is_h = None, float('inf'), None, None
        for i, wall in enumerate(working):
            x1, y1 = wall['start']['x'], wall['start']['y']
            x2, y2 = wall['end']['x'], wall['end']['y']
            horiz = abs(x2 - x1) >= abs(y2 - y1)
            # Door must be collinear with the wall axis
            if horiz:
                if abs(dy - (y1 + y2) / 2.0) > line_tol:
                    continue
            else:
                if abs(dx - (x1 + x2) / 2.0) > line_tol:
                    continue
            for (ex, ey), which in (((x1, y1), 'start'), ((x2, y2), 'end')):
                dist = float(np.hypot(dx - ex, dy - ey))
                if dist < best_dist:
                    best_dist = dist
                    best_i = i
                    best_end = which
                    is_h = horiz
        if best_i is None or best_dist > 1.3 * px_per_meter:
            continue

        wall = working[best_i]
        # Already covers the door?
        x1, y1 = wall['start']['x'], wall['start']['y']
        x2, y2 = wall['end']['x'], wall['end']['y']
        if is_h:
            if min(x1, x2) - 0.2 * px_per_meter <= dx <= max(x1, x2) + 0.2 * px_per_meter:
                continue
            y = int(round((y1 + y2) / 2.0))
            if best_end == 'end':
                # extend the endpoint that is closer to the door along X
                if abs(x2 - dx) <= abs(x1 - dx):
                    wall['end'] = {'x': int(round(dx + 0.55 * px_per_meter * (1 if x2 >= x1 else -1))), 'y': y}
                else:
                    wall['start'] = {'x': int(round(dx + 0.55 * px_per_meter * (1 if x1 >= x2 else -1))), 'y': y}
            else:
                if abs(x1 - dx) <= abs(x2 - dx):
                    wall['start'] = {'x': int(round(dx + 0.55 * px_per_meter * (1 if x1 >= x2 else -1))), 'y': y}
                else:
                    wall['end'] = {'x': int(round(dx + 0.55 * px_per_meter * (1 if x2 >= x1 else -1))), 'y': y}
            # Re-snap both endpoints to same Y
            wall['start']['y'] = y
            wall['end']['y'] = y
        else:
            if min(y1, y2) - 0.2 * px_per_meter <= dy <= max(y1, y2) + 0.2 * px_per_meter:
                continue
            x = int(round((x1 + x2) / 2.0))
            direction = 1 if (best_end == 'end' and y2 >= y1) or (best_end == 'start' and y1 < y2) else -1
            # Extend the nearer endpoint past the door along Y
            if abs(y2 - dy) <= abs(y1 - dy):
                wall['end'] = {'x': x, 'y': int(round(dy + 0.55 * px_per_meter * (1 if y2 >= y1 else -1)))}
            else:
                wall['start'] = {'x': x, 'y': int(round(dy + 0.55 * px_per_meter * (1 if y1 >= y2 else -1)))}
            wall['start']['x'] = x
            wall['end']['x'] = x

        wall['length'] = float(np.hypot(
            wall['end']['x'] - wall['start']['x'],
            wall['end']['y'] - wall['start']['y'],
        ))
        wall['kind'] = 'bearing'
        wall['thickness'] = max(float(wall.get('thickness', 0.2)), 0.22)
        logger.info(
            f"🚪 Extended wall through entrance door at ({dx:.0f},{dy:.0f}) → "
            f"L={wall['length']:.0f}px"
        )

    return working


def detect_balcony_glazing(
    img: np.ndarray, walls: list, px_per_meter: float, ocr_labels: list = None
) -> tuple:
    """
    If OCR found a balcony/loggia, ensure thin outer walls exist and emit
    panoramic glazing openings along the outer balcony edges.
    Returns (walls, openings).
    """
    if not walls or not px_per_meter:
        return walls, []
    labels = [l for l in (ocr_labels or []) if l.get('type') == 'balcony']
    if not labels:
        return walls, []

    lab = max(labels, key=lambda l: float(l.get('confidence', 0)))
    bx, by = float(lab['x']), float(lab['y'])

    # Collect wall endpoints; balcony is a small protrusion near the label
    endpoints = []
    for wall in walls:
        endpoints.append((wall['start']['x'], wall['start']['y']))
        endpoints.append((wall['end']['x'], wall['end']['y']))
    xs = [p[0] for p in endpoints]
    ys = [p[1] for p in endpoints]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)

    # Walls near the balcony label (within ~2.5 m)
    near = []
    for wall in walls:
        mx = (wall['start']['x'] + wall['end']['x']) / 2.0
        my = (wall['start']['y'] + wall['end']['y']) / 2.0
        if np.hypot(mx - bx, my - by) < 2.8 * px_per_meter:
            near.append(wall)

    # If Mask2Former missed balcony entirely, synthesize a thin U from ink around label
    working = list(walls)
    if len(near) < 2 and img is not None:
        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        r = int(2.2 * px_per_meter)
        x0, x1 = max(0, int(bx - r)), min(w, int(bx + r))
        y0, y1 = max(0, int(by - r)), min(h, int(by + r))
        roi = gray[y0:y1, x0:x1]
        dark = (roi < 100).astype(np.uint8) * 255
        lines = cv2.HoughLinesP(dark, 1, np.pi / 180, threshold=20,
                                minLineLength=int(0.6 * px_per_meter), maxLineGap=10)
        if lines is not None:
            for line in lines:
                lx1, ly1, lx2, ly2 = map(int, line[0])
                lx1, ly1, lx2, ly2 = lx1 + x0, ly1 + y0, lx2 + x0, ly2 + y0
                if _segment_covered_by_walls(working, lx1, ly1, lx2, ly2, 0.25 * px_per_meter):
                    continue
                working.append({
                    'start': {'x': lx1, 'y': ly1},
                    'end': {'x': lx2, 'y': ly2},
                    'length': float(np.hypot(lx2 - lx1, ly2 - ly1)),
                    'thickness': 0.10,
                    'kind': 'partition',
                })
            working = mark_outer_walls_bearing(working)
            near = [
                wall for wall in working
                if np.hypot(
                    (wall['start']['x'] + wall['end']['x']) / 2.0 - bx,
                    (wall['start']['y'] + wall['end']['y']) / 2.0 - by,
                ) < 2.8 * px_per_meter
            ]

    openings = []
    apartment_cx = (minx + maxx) / 2.0
    apartment_cy = (miny + maxy) / 2.0
    for wall in near:
        mx = (wall['start']['x'] + wall['end']['x']) / 2.0
        my = (wall['start']['y'] + wall['end']['y']) / 2.0
        # Outer edges of balcony: near global bbox extreme AND farther from center than label
        on_outer = (
            mx <= minx + 0.7 * px_per_meter or mx >= maxx - 0.7 * px_per_meter or
            my <= miny + 0.7 * px_per_meter or my >= maxy - 0.7 * px_per_meter
        )
        length = float(wall.get('length') or np.hypot(
            wall['end']['x'] - wall['start']['x'],
            wall['end']['y'] - wall['start']['y'],
        ))
        if not on_outer or length < 0.7 * px_per_meter:
            continue
        # Skip kitchen-shared wall: midpoint closer to apartment center than the balcony label
        if np.hypot(mx - apartment_cx, my - apartment_cy) + 0.15 * px_per_meter < np.hypot(
            bx - apartment_cx, by - apartment_cy
        ):
            continue
        openings.append({
            'id': 'window_panoramic',
            'x': float(mx),
            'y': float(my),
            'width': float(max(length * 0.9, 1.2 * px_per_meter)),
            'height': float(0.2 * px_per_meter),
            'rotation': 0.0,
            'confidence': 0.7,
            'panoramic': True,
        })

    if openings:
        logger.info(f"🪟 Balcony glazing: {len(openings)} panoramic opening(s)")
    return working, openings


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
    logger.info(f"📥 Received file: {file.filename}, threshold: {threshold}, bw: {grayscale}, contrast: {contrast}")

    # Parse threshold
    custom_threshold = None
    if threshold and threshold.strip().lower() != 'undefined':
        try:
            custom_threshold = int(threshold)
            logger.info(f"   Custom threshold: {custom_threshold}")
        except ValueError:
            logger.warning(f"   Invalid threshold value: {threshold}")

    contents = await file.read()
    logger.info(f"   File size: {len(contents)} bytes")

    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large (max {MAX_UPLOAD_BYTES // (1024*1024)} MB)")

    # Offload the fully synchronous CV/NN pipeline to the worker thread
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(
            inference_executor,
            _process_plan_sync,
            contents, custom_threshold, grayscale, contrast
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"💥 Error processing plan: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


def _process_plan_sync(
    contents: bytes,
    custom_threshold: Optional[int],
    grayscale: Optional[str],
    contrast: Optional[str]
) -> dict:
    """Synchronous processing pipeline (runs in the inference executor thread)."""
    nparr = np.frombuffer(contents, np.uint8)
    # Load with UNCHANGED to keep Alpha channel if present
    img_raw = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)

    if img_raw is None:
        logger.error("❌ Failed to decode image")
        raise HTTPException(status_code=400, detail="Invalid image file - could not decode")

    # Handle Alpha Channel (Transparency) -> Composite onto white background (vectorized)
    if len(img_raw.shape) == 3 and img_raw.shape[2] == 4:
        logger.info("ℹ Image has Alpha channel, handling transparency...")
        alpha = img_raw[:, :, 3:4].astype(np.float32) / 255.0
        rgb = img_raw[:, :, :3].astype(np.float32)
        img = (rgb * alpha + 255.0 * (1.0 - alpha)).astype(np.uint8)
        logger.info("✓ Converted transparent background to white")
    elif len(img_raw.shape) == 2:
        # Grayscale -> RGB
        img = cv2.cvtColor(img_raw, cv2.COLOR_GRAY2BGR)
    else:
        # Standard BGR
        img = img_raw

    # Downscale ONCE at the start so walls, furniture and the planner all
    # operate in the SAME coordinate system (fixes wall/furniture misalignment
    # on plans larger than MAX_IMAGE_DIM and speeds up YOLO/U-Net).
    orig_h, orig_w = img.shape[:2]
    if max(orig_h, orig_w) > MAX_IMAGE_DIM:
        s = MAX_IMAGE_DIM / max(orig_h, orig_w)
        img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        logger.info(f"Downscaled input {orig_w}x{orig_h} -> {img.shape[1]}x{img.shape[0]} (single shared coordinate system)")

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
        burn_factor = 1.0 - (s / 512.0)  # Reduce brightness by up to 50% for fully saturated

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

    # Crop empty margins so field noise is not vectorized as walls
    full_img = img
    img, crop_ox, crop_oy = content_crop(img)
    full_h, full_w = full_img.shape[:2]

    # Style router (cad_outline | marketing_filled | photo_messy)
    plan_style, style_metrics = detect_plan_style(img)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    avg_saturation = float(np.mean(hsv[:, :, 1]))
    gray_full = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Manual threshold slider → OpenCV only. Otherwise run neural / Mask2Former.
    skip_neural = custom_threshold is not None
    result = None

    # --- marketing / photo: Mask2Former wall mask → skeleton graph ---
    if not skip_neural and plan_style in ("marketing_filled", "photo_messy"):
        try:
            logger.info("🧩 Mask2Former wall segmentation for style=%s", plan_style)
            m2f_mask = mask2former_predict_wall_mask(img)
            if m2f_mask is not None:
                result = walls_from_mask(m2f_mask, method="mask2former", gray_for_topology=gray_full)
                logger.info("✓ Mask2Former → %d walls", result["num_walls"])
                if result["num_walls"] < 4:
                    logger.warning("⚠ Mask2Former produced <4 walls, falling back...")
                    result = None
        except Exception as e:
            logger.warning("⚠ Mask2Former path failed: %s", e)
            result = None

    # --- CAD (and marketing fallback): YOLO-seg ---
    if not skip_neural and result is None and yolo_wall_pipeline is not None:
        try:
            logger.info("🤖 Running custom YOLOv8-seg wall detection...")
            result = yolo_wall_pipeline(img, snap_angles=True)
            yolo_walls = result.get('walls', [])
            yolo_walls = filter_duplicate_walls(yolo_walls, distance_threshold=20)
            yolo_walls = merge_collinear_walls(yolo_walls, gap_threshold=30)
            yolo_walls = filter_by_connectivity(yolo_walls, connection_threshold=max(25, int(min(img.shape[:2]) * 0.03)))
            yolo_walls = filter_by_topology(yolo_walls, gray_full, img.shape[0], img.shape[1])
            result['walls'] = yolo_walls
            result['num_walls'] = len(yolo_walls)
            result['method'] = 'yolo_seg'
            logger.info(f"✓ YOLOv8-seg: {result['num_walls']} walls remaining after cleaning")
            if result['num_walls'] < 4:
                logger.warning("⚠ YOLOv8-seg detected too few walls (<4) after cleaning, falling back...")
                result = None
        except Exception as e:
            logger.warning(f"⚠ YOLOv8-seg wall detection failed: {e}. Falling back...")
            result = None

    # --- CubiCasa5k U-Net ---
    if not skip_neural and result is None and inference_pipeline is not None:
        try:
            logger.info("🧠 Running CubiCasa5k U-Net wall detection...")
            result = inference_pipeline(img, snap_angles=True)
            unet_walls = result.get('walls', [])
            for wall in unet_walls:
                if 'thickness' not in wall:
                    wall['thickness'] = 0.20
                if 'kind' not in wall:
                    wall['kind'] = 'bearing'
            unet_walls = filter_duplicate_walls(unet_walls, distance_threshold=20)
            unet_walls = merge_collinear_walls(unet_walls, gap_threshold=30)
            unet_walls = filter_by_connectivity(unet_walls, connection_threshold=max(25, int(min(img.shape[:2]) * 0.03)))
            unet_walls = filter_by_topology(unet_walls, gray_full, img.shape[0], img.shape[1])
            result['walls'] = unet_walls
            result['num_walls'] = len(unet_walls)
            result['method'] = 'unet'
            logger.info(f"✓ CubiCasa5k U-Net: {result['num_walls']} walls remaining after cleaning")
            if result['num_walls'] < 4:
                logger.warning("⚠ CubiCasa5k U-Net detected too few walls (<4), falling back to OpenCV...")
                result = None
        except Exception as e:
            logger.warning(f"⚠ CubiCasa5k U-Net wall detection failed: {e}. Falling back to OpenCV...")
            result = None

    # --- Last resort: OpenCV + auto-threshold + skeleton graph ---
    if result is None:
        logger.info(
            "🎨 OpenCV fallback (Threshold=%s, style=%s)",
            custom_threshold if custom_threshold is not None else "AUTO",
            plan_style,
        )
        result = opencv_fallback(img, custom_threshold, avg_saturation)

    # Map crop-local wall coords back to the full (downscaled) canvas
    if crop_ox or crop_oy:
        result['walls'] = offset_walls(result.get('walls', []), crop_ox, crop_oy)
    result['image_width'] = full_w
    result['image_height'] = full_h
    result['style'] = plan_style
    result['style_metrics'] = style_metrics

    # Work on the full image for furniture / planner (same coordinate system as walls)
    img = full_img

    # 2. Universal Offline Semantic Layout Planner (Geometric + Room Furnisher)
    h, w = img.shape[:2]
    furniture_list = []
    px_per_meter = max(h, w) / 10.0
    scale_source = 'default_10m'
    raw_yolo_detections = []

    # Recover thin partitions / balcony / entrance stubs Mask2Former often drops
    try:
        result['walls'] = augment_walls_from_ink(img, result.get('walls', []), px_per_meter)
        result['num_walls'] = len(result['walls'])
    except Exception as e:
        logger.warning(f"⚠ Ink wall augmentation failed: {e}")

    if furniture_detector is not None:
        try:
            logger.info("🪑 Running YOLOv8 raw symbol detection...")
            raw_yolo_detections = furniture_detector.detect(img)
            logger.info(f"✓ Detected {len(raw_yolo_detections)} raw architectural symbols")
            px_per_meter, scale_source = estimate_px_per_meter(raw_yolo_detections, h, w)
            logger.info(f"📏 Scale: {px_per_meter:.2f} px/m (source: {scale_source})")
            # Re-run ink augment with calibrated scale (better length thresholds)
            result['walls'] = augment_walls_from_ink(img, result.get('walls', []), px_per_meter)
        except Exception as e:
            logger.warning(f"⚠ Furniture detector failed: {e}")
            raw_yolo_detections = []
    else:
        logger.info("ℹ Furniture detector not loaded — continuing with geometric openings")

    try:
        # Seal window/door-sized gaps (prevents floor-to-ceiling holes) even without YOLO
        sealed_walls, gap_openings = seal_wall_gaps(
            result['walls'], px_per_meter, raw_yolo_detections
        )
        result['walls'] = sealed_walls
        result['walls'] = mark_outer_walls_bearing(result['walls'])

        facade_windows = detect_facade_windows(img, result['walls'], px_per_meter)
        yolo_doors = [d for d in raw_yolo_detections if d.get('id') == 'door_standard']
        # Extend facade stubs through entrance doors so openings can snap
        result['walls'] = extend_walls_for_entrance_doors(
            result['walls'], list(yolo_doors) + list(gap_openings), px_per_meter
        )
        # Arc detector only if no plausible entrance door on the right half of the plan
        endpoints = []
        for wall in result['walls']:
            endpoints += [(wall['start']['x'], wall['start']['y']), (wall['end']['x'], wall['end']['y'])]
        minx = min((p[0] for p in endpoints), default=0)
        maxx = max((p[0] for p in endpoints), default=0)
        mid_x = (minx + maxx) / 2.0
        has_right_door = any(
            d.get('id') == 'door_standard'
            and float(d.get('x', 0)) >= mid_x
            and float(d.get('confidence', 0)) >= 0.45
            for d in list(yolo_doors) + list(gap_openings)
        )
        arc_doors = []
        if not has_right_door:
            arc_doors = detect_door_arcs(
                img, result['walls'], px_per_meter,
                existing_doors=list(yolo_doors) + list(gap_openings),
            )
            if arc_doors:
                result['walls'] = extend_walls_for_entrance_doors(
                    result['walls'], arc_doors, px_per_meter
                )
        gap_openings = list(gap_openings) + facade_windows + arc_doors

        # Boost the rightmost facade door (typical entrance on RU marketing plans)
        all_doors = [
            d for d in list(raw_yolo_detections) + list(gap_openings)
            if d.get('id') == 'door_standard'
        ]
        if all_doors:
            endpoints = []
            for wall in result['walls']:
                endpoints += [
                    (wall['start']['x'], wall['start']['y']),
                    (wall['end']['x'], wall['end']['y']),
                ]
            maxx = max((p[0] for p in endpoints), default=0)
            mid_x = (min((p[0] for p in endpoints), default=0) + maxx) / 2.0
            right_doors = [d for d in all_doors if float(d.get('x', 0)) >= mid_x]
            if right_doors:
                entrance = max(right_doors, key=lambda d: float(d.get('x', 0)))
                entrance['confidence'] = max(float(entrance.get('confidence', 0)), 0.72)
                logger.info(
                    f"🚪 Entrance boost → door at ({entrance['x']:.0f},{entrance['y']:.0f}) "
                    f"conf={entrance['confidence']:.2f}"
                )

        # OCR early for balcony glazing (also used inside planner)
        from room_ocr import extract_room_labels
        ocr_labels = []
        try:
            ocr_labels = extract_room_labels(img)
        except Exception as e:
            logger.warning(f"⚠ Early OCR failed: {e}")

        result['walls'], balcony_glazing = detect_balcony_glazing(
            img, result['walls'], px_per_meter, ocr_labels
        )
        gap_openings = list(gap_openings) + balcony_glazing

        n_win = sum(1 for o in gap_openings if 'window' in o.get('id', ''))
        n_door = sum(1 for o in gap_openings if o.get('id') == 'door_standard')
        if gap_openings:
            logger.info(f"🪟 Sealed/facade/arc/balcony openings → {n_win} window(s), {n_door} door(s)")
        augmented_detections = list(raw_yolo_detections) + gap_openings

        planner = SemanticLayoutPlanner(h, w, px_per_meter=px_per_meter, plan_image=img)
        openings, furniture = planner.plan_layout(result['walls'], augmented_detections)

        furniture_list = openings + furniture
        logger.info(f"✓ Semantic planner generated {len(furniture_list)} final items")
    except Exception as e:
        logger.warning(f"⚠ Semantic Layout Planner failed: {e}")
        import traceback
        logger.warning(traceback.format_exc())

    # FINAL FALLBACK: Default Square (If everything failed)
    if len(result['walls']) < 4:
        logger.warning("No walls detected by any method, using default square (Last Resort)")
        m = 50
        result['walls'] = [
            {"start": {"x": m, "y": m}, "end": {"x": w-m, "y": m}, "thickness": 0.15, "kind": "bearing"},
            {"start": {"x": w-m, "y": m}, "end": {"x": w-m, "y": h-m}, "thickness": 0.15, "kind": "bearing"},
            {"start": {"x": w-m, "y": h-m}, "end": {"x": m, "y": h-m}, "thickness": 0.15, "kind": "bearing"},
            {"start": {"x": m, "y": h-m}, "end": {"x": m, "y": m}, "thickness": 0.15, "kind": "bearing"},
        ]

    logger.info(
        f"👉 Plan processing complete ({len(result['walls'])} walls, {len(furniture_list)} furniture, "
        f"method={result.get('method')}, style={result.get('style')})"
    )
    result["furniture"] = furniture_list
    result["px_per_meter"] = float(px_per_meter)
    result["scale_source"] = scale_source
    result["num_walls"] = len(result["walls"])
    return result


def detect_facade_windows(img: np.ndarray, walls: list, px_per_meter: float) -> list:
    """
    Find bright rectangular cuts in dark exterior wall bands (typical marketing windows).
    Returns synthetic window_standard detections snapped to nearest outer wall.
    """
    if img is None or not walls or not px_per_meter:
        return []

    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Bright patches (window glass / white insets)
    bright = (gray > 210).astype(np.uint8) * 255
    # Dark structure
    dark = (gray < 120).astype(np.uint8) * 255
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=1)

    # Keep bright blobs that touch dark walls
    dilated_dark = cv2.dilate(dark, np.ones((7, 7), np.uint8), iterations=1)
    candidates = cv2.bitwise_and(bright, dilated_dark)

    contours, _ = cv2.findContours(candidates, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    min_area = (0.35 * px_per_meter) ** 2
    max_area = (2.8 * px_per_meter) ** 2

    endpoints = []
    for wall in walls:
        endpoints.append([wall['start']['x'], wall['start']['y']])
        endpoints.append([wall['end']['x'], wall['end']['y']])
    if not endpoints:
        return []
    hull = cv2.convexHull(np.array(endpoints, dtype=np.float32).reshape(-1, 1, 2))
    xs = [p[0] for p in endpoints]
    ys = [p[1] for p in endpoints]
    span = max(max(xs) - min(xs), max(ys) - min(ys), 1.0)
    facade_margin = max(0.7 * px_per_meter, 0.04 * span)

    windows = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue
        x, y, bw, bh = cv2.boundingRect(cnt)
        aspect = max(bw, bh) / max(1, min(bw, bh))
        if aspect < 1.2 or aspect > 8.0:
            continue
        cx, cy = x + bw / 2.0, y + bh / 2.0
        # Hull-distance facade test (balcony stubs must not demote living facade)
        on_facade = abs(cv2.pointPolygonTest(hull, (float(cx), float(cy)), True)) <= facade_margin
        if not on_facade:
            continue

        # Snap to nearest wall
        best_wall = None
        best_dist = float('inf')
        for wall in walls:
            x1, y1 = wall['start']['x'], wall['start']['y']
            x2, y2 = wall['end']['x'], wall['end']['y']
            dx, dy = x2 - x1, y2 - y1
            l2 = dx * dx + dy * dy
            if l2 < 1:
                continue
            t = max(0.0, min(1.0, ((cx - x1) * dx + (cy - y1) * dy) / l2))
            px, py = x1 + t * dx, y1 + t * dy
            dist = float(np.hypot(cx - px, cy - py))
            if dist < best_dist:
                best_dist = dist
                best_wall = (px, py, max(bw, bh))
        if best_wall is None or best_dist > 0.6 * px_per_meter:
            continue
        px, py, span = best_wall
        # Dedup vs existing
        if any(np.hypot(px - w0['x'], py - w0['y']) < 0.5 * px_per_meter for w0 in windows):
            continue
        windows.append({
            'id': 'window_standard',
            'x': float(px),
            'y': float(py),
            'width': float(max(span, 0.9 * px_per_meter)),
            'height': float(0.15 * px_per_meter),
            'rotation': 0.0,
            'confidence': 0.55,
        })

    if windows:
        logger.info(f"🪟 Facade window detector: {len(windows)} window(s)")
    return windows


def seal_wall_gaps(walls: list, px_per_meter: float, yolo_detections: list = None) -> tuple:
    """
    Merge collinear wall segments separated by opening-sized gaps and emit
    synthetic door/window detections.

    OpenCV polylines stop at doors/windows → floor-to-ceiling holes in 3D.
    Classification (in order):
      1) YOLO window near the gap → window
      2) interior gap → door
      3) exterior + wide gap on the same facade as YOLO windows → window
      4) otherwise → door (entrance / interior)
    """
    if not walls or not px_per_meter:
        return walls, []

    min_gap = 0.45 * px_per_meter  # catch narrower window cuts
    max_gap = 3.5 * px_per_meter
    line_tol = max(18.0, 0.35 * px_per_meter)

    working = [dict(w, start=dict(w['start']), end=dict(w['end'])) for w in walls]
    openings = []
    yolo_windows = [
        d for d in (yolo_detections or [])
        if d.get('id') == 'window_standard' and float(d.get('confidence', 0)) >= 0.35
    ]

    endpoints = []
    for w in working:
        endpoints.append([w['start']['x'], w['start']['y']])
        endpoints.append([w['end']['x'], w['end']['y']])

    xs = [p[0] for p in endpoints] or [0]
    ys = [p[1] for p in endpoints] or [0]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    facade_margin = 0.7 * px_per_meter
    yolo_med_x = float(np.median([w['x'] for w in yolo_windows])) if yolo_windows else None
    yolo_med_y = float(np.median([w['y'] for w in yolo_windows])) if yolo_windows else None

    def _on_outer_facade(x, y) -> bool:
        return (
            x <= minx + facade_margin or x >= maxx - facade_margin or
            y <= miny + facade_margin or y >= maxy - facade_margin
        )

    def _orient(wall):
        dx = abs(wall['end']['x'] - wall['start']['x'])
        dy = abs(wall['end']['y'] - wall['start']['y'])
        return 'h' if dx >= dy else 'v'

    def _span(wall, axis):
        a0 = wall['start'][axis]
        a1 = wall['end'][axis]
        return (min(a0, a1), max(a0, a1))

    yolo_doors = [
        d for d in (yolo_detections or [])
        if d.get('id') == 'door_standard' and float(d.get('confidence', 0)) >= 0.35
    ]

    def _classify(gap_px, mx, my, wall_kind):
        gap_m = gap_px / px_per_meter
        # 1) YOLO window near this gap
        for yw in yolo_windows:
            if np.hypot(yw['x'] - mx, yw['y'] - my) < 1.2 * px_per_meter:
                return 'window_standard'
        # 2) YOLO door near this gap
        for yd in yolo_doors:
            if np.hypot(yd['x'] - mx, yd['y'] - my) < 1.0 * px_per_meter:
                return 'door_standard'
        # 3) Exterior facade:
        #    entrance / balcony doors ≈ 0.7–1.15 m; windows typically wider.
        #    (Previously ≤2.4 m → window, which mis-labeled entrance doors.)
        if _on_outer_facade(mx, my):
            if gap_m <= 1.15:
                return 'door_standard'
            return 'window_standard'
        # 4) Interior gap → door
        return 'door_standard'

    changed = True
    while changed:
        changed = False
        n = len(working)
        for i in range(n):
            if changed:
                break
            for j in range(i + 1, n):
                w1, w2 = working[i], working[j]
                if _orient(w1) != _orient(w2):
                    continue
                kind = 'bearing' if 'bearing' in (w1.get('kind'), w2.get('kind')) else w1.get('kind', 'partition')

                if _orient(w1) == 'h':
                    y1 = (w1['start']['y'] + w1['end']['y']) / 2
                    y2 = (w2['start']['y'] + w2['end']['y']) / 2
                    if abs(y1 - y2) > line_tol:
                        continue
                    min1, max1 = _span(w1, 'x')
                    min2, max2 = _span(w2, 'x')
                    if max1 < min2:
                        gap, gap_mid = min2 - max1, (max1 + min2) / 2
                    elif max2 < min1:
                        gap, gap_mid = min1 - max2, (max2 + min1) / 2
                    else:
                        continue
                    if not (min_gap <= gap <= max_gap):
                        continue
                    y = int(round((y1 + y2) / 2))
                    new_wall = {
                        'start': {'x': int(min(min1, min2)), 'y': y},
                        'end': {'x': int(max(max1, max2)), 'y': y},
                        'thickness': max(w1.get('thickness', 0.2), w2.get('thickness', 0.2)),
                        'kind': kind,
                        'length': float(max(max1, max2) - min(min1, min2)),
                    }
                    oid = _classify(gap, gap_mid, y, kind)
                    openings.append({
                        'id': oid,
                        'x': float(gap_mid),
                        'y': float(y),
                        'width': float(gap),
                        'height': float(max(8.0, 0.2 * px_per_meter)),
                        'rotation': 0.0,
                        'confidence': 0.95,
                    })
                else:
                    x1 = (w1['start']['x'] + w1['end']['x']) / 2
                    x2 = (w2['start']['x'] + w2['end']['x']) / 2
                    if abs(x1 - x2) > line_tol:
                        continue
                    min1, max1 = _span(w1, 'y')
                    min2, max2 = _span(w2, 'y')
                    if max1 < min2:
                        gap, gap_mid = min2 - max1, (max1 + min2) / 2
                    elif max2 < min1:
                        gap, gap_mid = min1 - max2, (max2 + min1) / 2
                    else:
                        continue
                    if not (min_gap <= gap <= max_gap):
                        continue
                    x = int(round((x1 + x2) / 2))
                    new_wall = {
                        'start': {'x': x, 'y': int(min(min1, min2))},
                        'end': {'x': x, 'y': int(max(max1, max2))},
                        'thickness': max(w1.get('thickness', 0.2), w2.get('thickness', 0.2)),
                        'kind': kind,
                        'length': float(max(max1, max2) - min(min1, min2)),
                    }
                    oid = _classify(gap, x, gap_mid, kind)
                    openings.append({
                        'id': oid,
                        'x': float(x),
                        'y': float(gap_mid),
                        'width': float(max(8.0, 0.2 * px_per_meter)),
                        'height': float(gap),
                        'rotation': 90.0,
                        'confidence': 0.95,
                    })

                working = [w for k, w in enumerate(working) if k != i and k != j]
                working.append(new_wall)
                changed = True
                break

    working = merge_collinear_walls(working, gap_threshold=max(30, int(0.35 * px_per_meter)))
    # Collapse near-duplicate parallel walls (double exterior lines → duplicate windows)
    working = filter_duplicate_walls(working, distance_threshold=max(18, int(0.3 * px_per_meter)))

    # Dedupe openings (parallel double walls produce twins)
    deduped = []
    for op in openings:
        if any(
            o['id'] == op['id'] and np.hypot(o['x'] - op['x'], o['y'] - op['y']) < 0.9 * px_per_meter
            for o in deduped
        ):
            continue
        deduped.append(op)

    return working, deduped


def estimate_px_per_meter(raw_detections: list, h: int, w: int) -> tuple:
    """
    Calibrate plan scale using detected standard doors.
    A door symbol with its swing arc forms a near-square bbox whose side equals
    the door width (standard 0.8-0.9 m). Falls back to the '10 meters on the
    long side' heuristic when no reliable doors are found.
    """
    default = max(h, w) / 10.0
    door_sizes = [
        max(d.get('width', 0), d.get('height', 0))
        for d in raw_detections
        if d.get('id') == 'door_standard' and d.get('width', 0) > 0
    ]
    if not door_sizes:
        return default, 'default_10m'

    door_px = float(np.median(door_sizes))
    estimate = door_px / 0.85  # standard door width in meters

    # Sanity check: apartment long side should land in a plausible 4-40 m range
    long_side_m = max(h, w) / estimate
    if not (4.0 <= long_side_m <= 40.0):
        logger.warning(f"📏 Door-based scale rejected (long side would be {long_side_m:.1f} m), using default")
        return default, 'default_10m'

    return estimate, 'door_calibration'


def opencv_fallback(img: np.ndarray, custom_threshold: Optional[int] = None, avg_sat: Optional[float] = None) -> dict:
    """
    Structural wall detection via threshold + morphology + skeleton centerlines.
    NOTE: the image is already downscaled by the caller - all detectors share one coordinate system.
    """
    h, w = img.shape[:2]
    logger.info(f"OpenCV fallback on image {w}x{h}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    if custom_threshold is not None:
        threshold_value = custom_threshold
    else:
        threshold_value = auto_detect_wall_threshold(img)
        # auto_detect clamps to 40-100 (dark walls); for light-gray marketing walls
        # also try a higher complementary threshold and OR the masks if needed.
        logger.info(f"Auto wall threshold: {threshold_value}")

    _, wall_mask = cv2.threshold(gray, threshold_value, 255, cv2.THRESH_BINARY_INV)

    # Also capture mid-gray thick walls common in marketing plans
    if custom_threshold is None:
        _, mid_mask = cv2.threshold(gray, 160, 255, cv2.THRESH_BINARY_INV)
        wall_mask = cv2.bitwise_or(wall_mask, mid_mask)

    min_dim = min(h, w)
    if avg_sat is None:
        hsv_check = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        avg_sat = float(np.mean(hsv_check[:, :, 1]))
    if avg_sat > 8.0:
        open_k_size = max(7, int(min_dim * 0.008) | 1)
        close_k_size = max(9, int(min_dim * 0.012) | 1)
    else:
        open_k_size = max(5, int(min_dim * 0.005) | 1)
        close_k_size = max(7, int(min_dim * 0.009) | 1)

    logger.info(
        f"Using structural kernels: open={open_k_size}x{open_k_size}, "
        f"close={close_k_size}x{close_k_size}, saturation={avg_sat:.1f}, thr={threshold_value}"
    )

    kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (open_k_size, open_k_size))
    kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (close_k_size, close_k_size))

    wall_mask_cleaned = cv2.morphologyEx(wall_mask, cv2.MORPH_OPEN, kernel_open, iterations=1)
    wall_mask_cleaned = cv2.morphologyEx(wall_mask_cleaned, cv2.MORPH_CLOSE, kernel_close, iterations=2)

    # Centerline extraction (not dual contour edges)
    result = walls_from_mask(wall_mask_cleaned, method="opencv_fallback", gray_for_topology=gray)
    logger.info(f"Final OpenCV wall extraction result: {result['num_walls']} walls")
    return result


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
    port = int(os.environ.get("FLAT_AI_PORT", os.environ.get("PORT", "5000")))
    uvicorn.run(app, host="0.0.0.0", port=port)
