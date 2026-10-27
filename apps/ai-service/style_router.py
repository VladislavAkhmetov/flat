"""
Heuristic floor-plan style classifier (no paid APIs).

Classes:
  - cad_outline: thin black lines on white background
  - marketing_filled: thick gray walls + color zone fills
  - photo_messy: noisy scan / photo
"""
from __future__ import annotations

import logging
from typing import Dict, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)


def detect_plan_style(img: np.ndarray) -> Tuple[str, Dict[str, float]]:
    """
    Classify a BGR floor-plan image.

    Returns:
        (style_name, metrics_dict)
    """
    if img is None or img.size == 0:
        return "photo_messy", {"avg_sat": 0.0, "color_fill_ratio": 0.0, "edge_density": 0.0, "thick_dark_ratio": 0.0}

    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    avg_sat = float(np.mean(hsv[:, :, 1]))
    color_fill_ratio = float(np.mean(hsv[:, :, 1] > 30))

    edges = cv2.Canny(gray, 60, 160)
    edge_density = float(np.mean(edges > 0))

    # Thick dark structures survive a modest morphological open
    _, dark = cv2.threshold(gray, 120, 255, cv2.THRESH_BINARY_INV)
    min_dim = min(h, w)
    open_k = max(5, int(min_dim * 0.008) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (open_k, open_k))
    thick = cv2.morphologyEx(dark, cv2.MORPH_OPEN, kernel, iterations=1)
    thick_dark_ratio = float(np.mean(thick > 0))

    # Noise proxy: high-frequency residual after blur
    blur = cv2.GaussianBlur(gray, (9, 9), 0)
    residual = cv2.absdiff(gray, blur)
    noise_ratio = float(np.mean(residual > 18))

    metrics = {
        "avg_sat": avg_sat,
        "color_fill_ratio": color_fill_ratio,
        "edge_density": edge_density,
        "thick_dark_ratio": thick_dark_ratio,
        "noise_ratio": noise_ratio,
    }

    # Marketing: noticeable color fills and/or thick wall blobs
    if color_fill_ratio > 0.04 or (avg_sat > 12.0 and thick_dark_ratio > 0.015):
        style = "marketing_filled"
    elif noise_ratio > 0.18 and edge_density > 0.08 and thick_dark_ratio < 0.02:
        style = "photo_messy"
    elif edge_density > 0.02 and thick_dark_ratio < 0.03 and avg_sat < 15.0:
        style = "cad_outline"
    elif thick_dark_ratio >= 0.03:
        style = "marketing_filled"
    else:
        style = "cad_outline"

    logger.info(
        "🧭 Plan style=%s (sat=%.1f fill=%.3f edges=%.3f thick=%.3f noise=%.3f)",
        style, avg_sat, color_fill_ratio, edge_density, thick_dark_ratio, noise_ratio,
    )
    return style, metrics
