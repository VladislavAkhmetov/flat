"""
Free Russian room-label OCR for marketing floor plans (EasyOCR).

Maps labels like «Ванная», «Зона кухни», «Прихожая» → semantic room types
used by SemanticLayoutPlanner.
"""
from __future__ import annotations

import logging
import re
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Longer / more specific phrases first
_LABEL_RULES: List[Tuple[str, Tuple[str, ...]]] = [
    ("bathroom", ("ванная", "ванн", "душевая", "душев")),
    ("toilet", ("санузел", "с/у", "туалет", "уборная", "wc")),
    ("kitchen", ("кухн", "приготовлен", "зона кух")),
    ("living", ("гостин", "зона отдых", "зона гостин", "отдых")),
    ("bedroom", ("спальн", "комната", "кабинет", "детск")),
    ("corridor", ("прихож", "коридор", "холл", "тамбур", "входн")),
    ("balcony", ("балкон", "лоджи")),
]

_reader = None
_reader_failed = False


def _get_reader():
    global _reader, _reader_failed
    if _reader_failed:
        return None
    if _reader is not None:
        return _reader
    try:
        import easyocr
        import torch

        gpu = torch.cuda.is_available()
        logger.info("📦 Loading EasyOCR (ru+en, gpu=%s)...", gpu)
        _reader = easyocr.Reader(["ru", "en"], gpu=gpu, verbose=False)
        logger.info("✅ EasyOCR ready")
        return _reader
    except Exception as e:
        logger.warning("⚠ EasyOCR unavailable: %s", e)
        _reader_failed = True
        return None


def _normalize(text: str) -> str:
    t = text.lower().replace("ё", "е")
    t = re.sub(r"[^a-zа-я0-9/]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def label_to_room_type(text: str) -> Optional[str]:
    """Map OCR text to a planner room type, or None if not a room label."""
    n = _normalize(text)
    if not n or len(n) < 3:
        return None
    # Skip pure area measurements like "17.7 m2"
    if re.fullmatch(r"[\d\s.,]+m?\s*2?", n.replace("м", "m")):
        return None
    if re.search(r"^\d+([.,]\d+)?\s*(м|m)", n):
        return None

    for room_type, keys in _LABEL_RULES:
        for key in keys:
            if key in n:
                return room_type
    return None


def extract_room_labels(bgr_img: np.ndarray, min_confidence: float = 0.25) -> List[Dict]:
    """
    Run OCR on a floor-plan image.

    Returns list of {type, text, x, y, confidence, bbox}.
    """
    reader = _get_reader()
    if reader is None or bgr_img is None:
        return []

    h, w = bgr_img.shape[:2]
    # Cap OCR resolution for speed (labels stay readable around 800–1000px)
    scale = 1.0
    work = bgr_img
    max_dim = max(h, w)
    if max_dim > 1000:
        scale = 1000 / max_dim
        work = cv2.resize(bgr_img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    elif max_dim < 700:
        scale = 700 / max_dim
        work = cv2.resize(bgr_img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    try:
        # detail=1 → (bbox, text, conf); narrower mag_ratio = faster
        results = reader.readtext(work, detail=1, paragraph=False, batch_size=8)
    except Exception as e:
        logger.warning("⚠ EasyOCR readtext failed: %s", e)
        return []

    labels: List[Dict] = []
    for item in results:
        if not item or len(item) < 3:
            continue
        box, text, conf = item[0], item[1], float(item[2])
        if conf < min_confidence:
            continue
        room_type = label_to_room_type(str(text))
        if not room_type:
            continue
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        cx = (min(xs) + max(xs)) / 2.0 / scale
        cy = (min(ys) + max(ys)) / 2.0 / scale
        labels.append({
            "type": room_type,
            "text": str(text),
            "x": float(cx),
            "y": float(cy),
            "confidence": conf,
            "bbox": (
                float(min(xs) / scale),
                float(min(ys) / scale),
                float((max(xs) - min(xs)) / scale),
                float((max(ys) - min(ys)) / scale),
            ),
        })

    logger.info("🔤 OCR room labels: %d → %s", len(labels), [(l["text"], l["type"]) for l in labels])
    return labels


def assign_labels_to_rooms(rooms: List[Dict], labels: List[Dict]) -> List[Dict]:
    """
    Attach OCR labels to rooms (point-in-contour, else nearest center).
    Open-plan kitchen+living in one contour → type living_kitchen.
    """
    if not rooms or not labels:
        return rooms

    used = set()

    def _labels_inside(room: Dict) -> List[Tuple[int, Dict]]:
        contour = room.get("contour")
        found = []
        for i, lab in enumerate(labels):
            if contour is not None and cv2.pointPolygonTest(contour, (lab["x"], lab["y"]), False) >= 0:
                found.append((i, lab))
        return found

    # First pass: all labels inside contour
    for room in rooms:
        inside = _labels_inside(room)
        if not inside:
            continue
        types = {lab["type"] for _, lab in inside}
        # Open-plan: kitchen + living (or kitchen + bedroom label noise) in one zone
        if "kitchen" in types and "living" in types:
            room["type"] = "living_kitchen"
            room["ocr_label"] = " + ".join(sorted({lab["text"] for _, lab in inside}))
            room["ocr_confidence"] = max(lab["confidence"] for _, lab in inside)
        else:
            # Prefer specific wet/service rooms over generic "комната"/bedroom
            priority = ["bathroom", "toilet", "kitchen", "living", "corridor", "balcony", "bedroom"]
            best = None
            best_rank = 99
            for i, lab in inside:
                rank = priority.index(lab["type"]) if lab["type"] in priority else 50
                # demote generic bedroom when area is tiny
                if lab["type"] == "bedroom" and room.get("area_m2", 99) < 4.0:
                    rank = 80
                score = rank - lab["confidence"]
                if best is None or score < best_rank:
                    best_rank = score
                    best = (i, lab)
            idx, lab = best
            room["type"] = lab["type"]
            room["ocr_label"] = lab["text"]
            room["ocr_confidence"] = lab["confidence"]
        for i, _ in inside:
            used.add(i)
        logger.info(
            "🔤 Room %s ← OCR '%s' → %s",
            room.get("id"), room.get("ocr_label"), room.get("type"),
        )

    # Second pass: unmatched rooms ← nearest unmatched label
    for room in rooms:
        if room.get("ocr_label"):
            continue
        cx, cy = room["center"]
        best = None
        best_dist = float("inf")
        for i, lab in enumerate(labels):
            if i in used:
                continue
            d = float(np.hypot(lab["x"] - cx, lab["y"] - cy))
            if d < best_dist:
                best_dist = d
                best = (i, lab)
        rx, ry, rw, rh = room["bbox"]
        gate = max(120.0, 0.35 * float(np.hypot(rw, rh)))
        if best is not None and best_dist <= gate:
            idx, lab = best
            used.add(idx)
            room["type"] = lab["type"]
            room["ocr_label"] = lab["text"]
            room["ocr_confidence"] = lab["confidence"]
            logger.info(
                "🔤 Room %s ← nearest OCR '%s' → %s (d=%.0f)",
                room.get("id"), lab["text"], lab["type"], best_dist,
            )

    return rooms
