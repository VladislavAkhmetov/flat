"""
Convert a binary wall mask into centerline wall segments (skeleton → polylines).

Avoids the classic OpenCV contour bug where both long edges of a thick wall
become two parallel "thin walls".
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
from skimage.morphology import skeletonize

logger = logging.getLogger(__name__)


def _snap_endpoints(
    x1: float, y1: float, x2: float, y2: float, angle_tol: float = 15.0
) -> Optional[Tuple[int, int, int, int]]:
    dx, dy = x2 - x1, y2 - y1
    length = float(np.hypot(dx, dy))
    if length < 1:
        return None
    angle = float(np.degrees(np.arctan2(abs(dy), abs(dx))))
    if angle < angle_tol:
        y_avg = int(round((y1 + y2) / 2))
        return int(round(x1)), y_avg, int(round(x2)), y_avg
    if angle > (90 - angle_tol):
        x_avg = int(round((x1 + x2) / 2))
        return x_avg, int(round(y1)), x_avg, int(round(y2))
    # Keep mild diagonals; drop noisy crooked stubs later by length
    return int(round(x1)), int(round(y1)), int(round(x2)), int(round(y2))


def _trace_skeleton_polylines(skel: np.ndarray) -> List[np.ndarray]:
    """
    Trace 8-connected skeleton pixels into polylines.
    Junctions split paths so each branch is a separate polyline.
    """
    binary = (skel > 0).astype(np.uint8)
    h, w = binary.shape
    neighbors = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]

    def degree(y: int, x: int) -> int:
        c = 0
        for dy, dx in neighbors:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and binary[ny, nx]:
                c += 1
        return c

    ys, xs = np.where(binary)
    if len(xs) == 0:
        return []

    visited = np.zeros_like(binary, dtype=bool)
    polylines: List[np.ndarray] = []

    # Prefer starting at endpoints (degree 1), then junctions
    endpoints = [(int(y), int(x)) for y, x in zip(ys, xs) if degree(int(y), int(x)) == 1]
    junctions = [(int(y), int(x)) for y, x in zip(ys, xs) if degree(int(y), int(x)) >= 3]
    starts = endpoints + junctions + [(int(y), int(x)) for y, x in zip(ys, xs)]

    for sy, sx in starts:
        if visited[sy, sx] or not binary[sy, sx]:
            continue

        # Walk each unused neighbor branch from this start
        branch_starts = []
        for dy, dx in neighbors:
            ny, nx = sy + dy, sx + dx
            if 0 <= ny < h and 0 <= nx < w and binary[ny, nx] and not visited[ny, nx]:
                branch_starts.append((ny, nx))

        if not branch_starts and not visited[sy, sx]:
            # Isolated pixel
            visited[sy, sx] = True
            continue

        if not branch_starts:
            continue

        # Also allow a path that begins at the seed itself once
        for first in branch_starts:
            if visited[first[0], first[1]]:
                continue
            path = [(sy, sx)]
            visited[sy, sx] = True
            cy, cx = first
            while True:
                path.append((cy, cx))
                visited[cy, cx] = True
                if degree(cy, cx) != 2:
                    # Stop at next endpoint/junction (after taking one step into it)
                    # Find unused continuation only if degree==2; else break
                    pass

                nexts = []
                for dy, dx in neighbors:
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and binary[ny, nx] and not visited[ny, nx]:
                        nexts.append((ny, nx))

                if degree(cy, cx) >= 3:
                    # Stop at junction — do not continue through
                    break
                if not nexts:
                    break
                # Prefer continuing in the same direction
                if len(path) >= 2:
                    py, px = path[-2]
                    vdy, vdx = cy - py, cx - px
                    nexts.sort(key=lambda p: -((p[0] - cy) * vdy + (p[1] - cx) * vdx))
                cy, cx = nexts[0]
                if degree(cy, cx) != 2 and (cy, cx) != first:
                    path.append((cy, cx))
                    visited[cy, cx] = True
                    break

            if len(path) >= 2:
                polylines.append(np.array([(x, y) for y, x in path], dtype=np.float32))

    return polylines


def _approx_segments(poly: np.ndarray, min_length: float) -> List[Tuple[int, int, int, int]]:
    if poly is None or len(poly) < 2:
        return []
    pts = poly.reshape(-1, 1, 2).astype(np.float32)
    peri = float(cv2.arcLength(pts, False))
    epsilon = max(2.0, 0.01 * peri)
    approx = cv2.approxPolyDP(pts, epsilon, False).reshape(-1, 2)
    if len(approx) < 2:
        return []

    segs = []
    for i in range(len(approx) - 1):
        x1, y1 = float(approx[i, 0]), float(approx[i, 1])
        x2, y2 = float(approx[i + 1, 0]), float(approx[i + 1, 1])
        if np.hypot(x2 - x1, y2 - y1) < min_length:
            continue
        snapped = _snap_endpoints(x1, y1, x2, y2)
        if snapped is None:
            continue
        sx1, sy1, sx2, sy2 = snapped
        if np.hypot(sx2 - sx1, sy2 - sy1) < min_length:
            continue
        segs.append((sx1, sy1, sx2, sy2))
    return segs


def _local_thickness_m(
    dist: np.ndarray, x1: int, y1: int, x2: int, y2: int, h: int, w: int, px_per_meter_hint: float
) -> Tuple[float, str]:
    """Estimate wall thickness in meters from distance transform samples along the segment."""
    n = max(3, int(np.hypot(x2 - x1, y2 - y1) / 8))
    radii = []
    for t in np.linspace(0.1, 0.9, n):
        x = int(round(x1 + t * (x2 - x1)))
        y = int(round(y1 + t * (y2 - y1)))
        if 0 <= x < w and 0 <= y < h:
            radii.append(float(dist[y, x]))
    if not radii:
        return 0.20, "partition"
    # distanceTransform gives radius in px; full thickness ≈ 2 * radius
    thick_px = 2.0 * float(np.median(radii))
    thick_m = thick_px / max(px_per_meter_hint, 1.0)
    thick_m = float(np.clip(thick_m, 0.10, 0.45))
    kind = "bearing" if thick_m >= 0.22 else "partition"
    return thick_m, kind


def mask_to_wall_segments(
    mask: np.ndarray,
    min_length_ratio: float = 0.015,
    px_per_meter_hint: Optional[float] = None,
) -> List[Dict]:
    """
    Skeletonize a binary wall mask and emit centerline wall segments.

    Args:
        mask: uint8 binary mask (walls > 0)
        min_length_ratio: minimum segment length as fraction of min(h, w)
        px_per_meter_hint: optional scale for thickness in meters
    """
    if mask is None or mask.size == 0:
        return []

    h, w = mask.shape[:2]
    binary = (mask > 0).astype(np.uint8)

    # Light close to bridge tiny gaps before skeletonize
    k = max(3, int(min(h, w) * 0.004) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k, k))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)

    # Remove speckles
    open_k = max(3, int(min(h, w) * 0.003) | 1)
    open_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (open_k, open_k))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, open_kernel, iterations=1)

    if np.count_nonzero(binary) < 50:
        return []

    dist = cv2.distanceTransform(binary, cv2.DIST_L2, 5)
    skel = skeletonize(binary > 0).astype(np.uint8)

    # Dilate skeleton 1px so junctions connect more reliably for tracing
    skel = cv2.dilate(skel, np.ones((3, 3), np.uint8), iterations=1)
    skel = skeletonize(skel > 0).astype(np.uint8)

    min_length = max(12.0, min(h, w) * min_length_ratio)
    ppm = px_per_meter_hint if px_per_meter_hint and px_per_meter_hint > 0 else max(h, w) / 10.0

    polylines = _trace_skeleton_polylines(skel)
    walls: List[Dict] = []

    for poly in polylines:
        for x1, y1, x2, y2 in _approx_segments(poly, min_length):
            length = float(np.hypot(x2 - x1, y2 - y1))
            # Drop steep diagonals (text underlines / noise)
            angle = float(np.degrees(np.arctan2(abs(y2 - y1), abs(x2 - x1))))
            if 20.0 < angle < 70.0 and length < min(h, w) * 0.08:
                continue
            thick_m, kind = _local_thickness_m(dist, x1, y1, x2, y2, h, w, ppm)
            walls.append({
                "start": {"x": int(x1), "y": int(y1)},
                "end": {"x": int(x2), "y": int(y2)},
                "length": length,
                "thickness": thick_m,
                "kind": kind,
            })

    # Fallback: if tracing failed, use Hough on skeleton
    if len(walls) < 3:
        logger.info("Skeleton tracing sparse (%d) — Hough fallback on skeleton", len(walls))
        lines = cv2.HoughLinesP(
            (skel * 255).astype(np.uint8),
            rho=1,
            theta=np.pi / 180,
            threshold=max(20, int(min(h, w) * 0.02)),
            minLineLength=int(min_length),
            maxLineGap=max(8, int(min(h, w) * 0.015)),
        )
        walls = []
        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = map(int, line[0])
                snapped = _snap_endpoints(x1, y1, x2, y2)
                if snapped is None:
                    continue
                x1, y1, x2, y2 = snapped
                length = float(np.hypot(x2 - x1, y2 - y1))
                if length < min_length:
                    continue
                angle = float(np.degrees(np.arctan2(abs(y2 - y1), abs(x2 - x1))))
                if 20.0 < angle < 70.0:
                    continue
                thick_m, kind = _local_thickness_m(dist, x1, y1, x2, y2, h, w, ppm)
                walls.append({
                    "start": {"x": x1, "y": y1},
                    "end": {"x": x2, "y": y2},
                    "length": length,
                    "thickness": thick_m,
                    "kind": kind,
                })

    logger.info("wall_graph: mask → %d centerline segments", len(walls))
    return walls


def offset_walls(walls: List[Dict], ox: int, oy: int) -> List[Dict]:
    """Translate wall coordinates by crop origin offset."""
    out = []
    for w in walls:
        nw = dict(w)
        nw["start"] = {"x": int(w["start"]["x"] + ox), "y": int(w["start"]["y"] + oy)}
        nw["end"] = {"x": int(w["end"]["x"] + ox), "y": int(w["end"]["y"] + oy)}
        out.append(nw)
    return out
