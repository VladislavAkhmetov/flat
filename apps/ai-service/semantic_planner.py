import numpy as np
import cv2
import logging
from typing import List, Dict, Tuple, Optional

from room_ocr import extract_room_labels, assign_labels_to_rooms

logger = logging.getLogger(__name__)

class SemanticLayoutPlanner:
    """
    Universal 100% Offline Semantic Layout Planner.
    Segments walls into room zones, detects doors/windows, and places beautiful, 
    ergonomically correct furniture templates in each room.
    """
    def __init__(self, h: int, w: int, px_per_meter: float = None, plan_image: np.ndarray = None):
        self.h = h
        self.w = w
        self.plan_image = plan_image
        if px_per_meter and px_per_meter > 0:
            self.px_per_meter = px_per_meter
        else:
            # Fallback heuristic: max dimension represents 10 meters
            self.px_per_meter = max(h, w) / 10.0
        logger.info(f"Initialized SemanticLayoutPlanner with scale: {self.px_per_meter:.2f} px/m")

    def plan_layout(self, walls: List[Dict], raw_yolo_detections: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
        """
        Main entry point for layout generation.
        Returns:
            List of openings (doors/windows snapped to walls)
            List of furniture items placed semantically
        """
        # 0. OCR first — labels drive room flood-fill (critical for empty labeled rooms)
        ocr_labels = []
        if self.plan_image is not None:
            try:
                ocr_labels = extract_room_labels(self.plan_image)
            except Exception as e:
                logger.warning(f"⚠ Room OCR failed: {e}")

        # 1. Segment rooms: OCR-guided flood-fill preferred, geometric fallback
        rooms = []
        if ocr_labels:
            rooms = self._segment_rooms_from_labels(walls, ocr_labels)
            logger.info(f"🏠 OCR-guided segmentation → {len(rooms)} rooms")
        if len(rooms) < 2:
            geo = self._segment_rooms(walls)
            logger.info(f"🏠 Geometric segmentation → {len(geo)} rooms")
            if len(geo) > len(rooms):
                rooms = geo
                if ocr_labels:
                    rooms = assign_labels_to_rooms(rooms, ocr_labels)

        apartment_hull = self._apartment_hull(walls, rooms)
        classified_rooms = self._classify_rooms(rooms, raw_yolo_detections)

        # 2. Detect doors and windows
        openings = self._detect_portals(walls, raw_yolo_detections, classified_rooms)

        # 3. Furnish every typed room (OCR label is enough — do not require ≥2)
        furniture = []
        for room in classified_rooms:
            if not room.get('type'):
                continue
            # Balcony: no furniture template, but keep room for portal context
            if room.get('type') == 'balcony':
                continue
            room_items = self._furnish_room(room, walls, openings, raw_yolo_detections)
            if room_items:
                logger.info(f"🛋 Furnished {room.get('type')} ({room.get('ocr_label')}) → {len(room_items)} items")
            else:
                logger.warning(f"⚠ No furniture template output for {room.get('type')} / {room.get('ocr_label')}")
            furniture.extend(room_items)

        if raw_yolo_detections:
            have = {f['id'] for f in furniture}
            for det in self._yolo_furniture_passthrough(raw_yolo_detections):
                if det['id'] not in have and det['id'] in {
                    'bed_double', 'bed_single', 'sofa_2', 'sofa_3', 'toilet', 'bath'
                }:
                    furniture.append(det)
                    have.add(det['id'])

        furniture = self._clamp_items_to_hull(furniture, apartment_hull, classified_rooms)
        furniture = self._reject_wrong_room_furniture(furniture, classified_rooms)

        # Semantic cleanup: a door or window cannot be located behind a TV Stand!
        tv_stands = [f for f in furniture if f['id'] == 'tv_stand']
        if tv_stands and openings:
            filtered_openings = []
            for op in openings:
                too_close = False
                for tv in tv_stands:
                    dist = np.hypot(op['x'] - tv['x'], op['y'] - tv['y'])
                    if dist < 0.5 * self.px_per_meter:
                        logger.info(f"🚫 Discarded false opening behind TV Stand at ({op['x']:.1f}, {op['y']:.1f})")
                        too_close = True
                        break
                if not too_close:
                    filtered_openings.append(op)
            openings = filtered_openings

        logger.info(f"Semantic Planner complete: generated {len(openings)} openings, {len(furniture)} furniture items")
        return openings, furniture

    def _apartment_hull(self, walls: List[Dict], rooms: List[Dict]) -> Optional[np.ndarray]:
        """Convex hull of wall endpoints + room contours for in-bounds clamping."""
        pts = []
        for wall in walls:
            pts.append([wall['start']['x'], wall['start']['y']])
            pts.append([wall['end']['x'], wall['end']['y']])
        for room in rooms:
            contour = room.get('contour')
            if contour is not None and len(contour) > 0:
                pts.extend(contour.reshape(-1, 2).tolist())
        if len(pts) < 3:
            return None
        arr = np.array(pts, dtype=np.float32).reshape(-1, 1, 2)
        hull = cv2.convexHull(arr)
        return hull

    def _point_in_hull(self, x: float, y: float, hull: Optional[np.ndarray], rooms: List[Dict]) -> bool:
        if rooms:
            for room in rooms:
                contour = room.get('contour')
                if contour is not None and cv2.pointPolygonTest(contour, (float(x), float(y)), False) >= 0:
                    return True
        if hull is not None:
            return cv2.pointPolygonTest(hull, (float(x), float(y)), False) >= 0
        # No geometry → reject out-of-image points only
        return 0 <= x < self.w and 0 <= y < self.h

    def _clamp_items_to_hull(self, items: List[Dict], hull: Optional[np.ndarray], rooms: List[Dict]) -> List[Dict]:
        """Drop furniture whose center is outside the apartment / rooms."""
        if not items:
            return items
        kept = []
        for item in items:
            x, y = float(item.get('x', -1)), float(item.get('y', -1))
            if self._point_in_hull(x, y, hull, rooms):
                kept.append(item)
            else:
                logger.info(f"🚫 Dropped out-of-bounds {item.get('id')} at ({x:.0f},{y:.0f})")
        if len(kept) != len(items):
            logger.info(f"Furniture clamp: {len(items)} → {len(kept)}")
        return kept

    def _reject_wrong_room_furniture(self, items: List[Dict], rooms: List[Dict]) -> List[Dict]:
        """Drop dining/beds that landed inside wet rooms (OCR bathroom/toilet)."""
        wet = [r for r in rooms if r.get('type') in ('bathroom', 'toilet')]
        if not wet or not items:
            return items
        banned_in_wet = {
            'table_dining', 'chair_dining', 'table_desk', 'bed_double', 'bed_single',
            'sofa_2', 'sofa_3', 'sofa_corner', 'kitchen_set', 'refrigerator', 'tv', 'tv_stand',
        }
        kept = []
        for item in items:
            x, y = float(item.get('x', -1)), float(item.get('y', -1))
            cid = item.get('id')
            in_wet = False
            for room in wet:
                contour = room.get('contour')
                if contour is not None and cv2.pointPolygonTest(contour, (x, y), False) >= 0:
                    in_wet = True
                    break
            if in_wet and cid in banned_in_wet:
                logger.info(f"🚫 Dropped {cid} inside wet room at ({x:.0f},{y:.0f})")
                continue
            kept.append(item)
        return kept

    def _hull_perimeter_seal(self, walls: List[Dict]) -> Optional[np.ndarray]:
        """Light convex-hull stroke so exterior flood cannot enter via facade gaps."""
        if not walls:
            return None
        pts = []
        for wall in walls:
            pts.append([wall['start']['x'], wall['start']['y']])
            pts.append([wall['end']['x'], wall['end']['y']])
        if len(pts) < 3:
            return None
        hull = cv2.convexHull(np.array(pts, dtype=np.float32))
        mask = np.zeros((self.h, self.w), dtype=np.uint8)
        thick = max(4, int(0.12 * self.px_per_meter))
        cv2.polylines(mask, [hull.astype(np.int32)], isClosed=True, color=255, thickness=thick)
        return mask

    def _wet_room_ink_seals(self, labels: List[Dict]) -> Optional[np.ndarray]:
        """
        Local dark-ink barriers only around wet-room OCR labels.
        Prevents toilet/bathroom flood from leaking into the bedroom without
        sealing the whole apartment (global ink barriers were too aggressive).
        """
        if self.plan_image is None or not labels:
            return None
        wet = [l for l in labels if l.get('type') in ('toilet', 'bathroom')]
        if not wet:
            return None
        gray = cv2.cvtColor(self.plan_image, cv2.COLOR_BGR2GRAY) if len(self.plan_image.shape) == 3 else self.plan_image
        hsv = cv2.cvtColor(self.plan_image, cv2.COLOR_BGR2HSV) if len(self.plan_image.shape) == 3 else None
        ink = (gray < 90).astype(np.uint8) * 255
        if hsv is not None:
            ink[hsv[:, :, 1] > 75] = 0
        mask = np.zeros_like(ink)
        r = int(2.2 * self.px_per_meter)
        for lab in wet:
            x, y = int(lab['x']), int(lab['y'])
            cv2.circle(mask, (x, y), r, 255, -1)
        local = cv2.bitwise_and(ink, mask)
        k = max(3, int(0.05 * self.px_per_meter) | 1)
        local = cv2.dilate(local, np.ones((k, k), np.uint8), iterations=1)
        return local

    def _build_free_space_mask(
        self, walls: List[Dict], close_m: float = 1.0, extra_barriers: Optional[np.ndarray] = None
    ) -> np.ndarray:
        """Wall raster → closed free-space mask (255 = walkable interior)."""
        wall_mask = np.zeros((self.h, self.w), dtype=np.uint8)
        for wall in walls:
            x1, y1 = int(wall['start']['x']), int(wall['start']['y'])
            x2, y2 = int(wall['end']['x']), int(wall['end']['y'])
            thickness = int(max(8, wall.get('thickness', 0.2) * self.px_per_meter))
            cv2.line(wall_mask, (x1, y1), (x2, y2), 255, thickness)
        if extra_barriers is not None:
            wall_mask = cv2.bitwise_or(wall_mask, extra_barriers)
        close_px = max(3, int(close_m * self.px_per_meter) | 1)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (close_px, close_px))
        closed = cv2.morphologyEx(wall_mask, cv2.MORPH_CLOSE, kernel)
        free = cv2.bitwise_not(closed)
        # Paint exterior from borders so free space = interior only
        exterior = free.copy()
        ff_mask = np.zeros((self.h + 2, self.w + 2), np.uint8)
        step_x = max(1, self.w // 24)
        step_y = max(1, self.h // 24)
        for x in range(0, self.w, step_x):
            if exterior[0, x] == 255:
                cv2.floodFill(exterior, ff_mask, (x, 0), 128)
            if exterior[self.h - 1, x] == 255:
                cv2.floodFill(exterior, ff_mask, (x, self.h - 1), 128)
        for y in range(0, self.h, step_y):
            if exterior[y, 0] == 255:
                cv2.floodFill(exterior, ff_mask, (0, y), 128)
            if exterior[y, self.w - 1] == 255:
                cv2.floodFill(exterior, ff_mask, (self.w - 1, y), 128)
        return np.where(exterior == 255, 255, 0).astype(np.uint8)

    def _contour_to_room(self, contour, idx: int, room_type: str = None, ocr_label: str = None) -> Optional[Dict]:
        area = cv2.contourArea(contour)
        area_m2 = area / (self.px_per_meter ** 2)
        if area_m2 < 0.8 or area_m2 > 60.0:
            return None
        x, y, rw, rh = cv2.boundingRect(contour)
        moments = cv2.moments(contour)
        if moments["m00"] == 0:
            return None
        cx = int(moments["m10"] / moments["m00"])
        cy = int(moments["m01"] / moments["m00"])
        epsilon = 0.015 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)
        room = {
            "id": idx,
            "contour": contour,
            "bbox": (x, y, rw, rh),
            "center": (cx, cy),
            "area_m2": area_m2,
            "approx": approx,
            "type": room_type,
        }
        if ocr_label:
            room["ocr_label"] = ocr_label
            room["ocr_confidence"] = 1.0
        return room

    def _segment_rooms_from_labels(self, walls: List[Dict], labels: List[Dict]) -> List[Dict]:
        """
        For each OCR room label, grow a room region from the label point with an
        area cap (door gaps otherwise leak into the whole apartment).
        """
        # Close door gaps; local wet-room ink keeps toilet from leaking into bedroom.
        # Stronger close also seals missing entrance-wall stubs so exterior flood
        # cannot pour into the living/kitchen through the open right side.
        wet_seals = self._wet_room_ink_seals(labels)
        hull_seal = self._hull_perimeter_seal(walls)
        extra = wet_seals
        if hull_seal is not None:
            extra = hull_seal if extra is None else cv2.bitwise_or(extra, hull_seal)
        free = self._build_free_space_mask(walls, close_m=2.0, extra_barriers=extra)
        rooms: List[Dict] = []
        claimed = np.zeros_like(free)

        # Max area (m²) per type — stops flood through open doorways
        max_area = {
            "toilet": 2.2,
            "bathroom": 4.5,
            "corridor": 9.0,
            "kitchen": 14.0,
            "living": 18.0,
            "bedroom": 22.0,
            "living_kitchen": 40.0,
            "balcony": 4.0,
        }
        # Corridor LAST — open-plan living shares space with hallway; corridor
        # flood must not claim the гостиная before living OCR runs.
        order = {"toilet": 0, "bathroom": 1, "balcony": 2, "kitchen": 3, "living": 4, "bedroom": 5, "corridor": 6}
        # Dedupe: one seed per type neighborhood (skip subtitle duplicates like "(отдых)")
        # Allow multiple bedrooms (two "Комната" labels)
        sorted_labels = sorted(labels, key=lambda l: (order.get(l["type"], 9), -l["confidence"]))
        used_types_near = []
        wet_centers = [
            (l["x"], l["y"]) for l in labels if l.get("type") in ("toilet", "bathroom")
        ]

        for lab in sorted_labels:
            # Skip duplicate labels of same type within 1.2 m (bedrooms: 2.5 m — two rooms)
            dedupe_r = 2.5 * self.px_per_meter if lab["type"] == "bedroom" else 1.2 * self.px_per_meter
            if any(
                t == lab["type"] and np.hypot(lab["x"] - x0, lab["y"] - y0) < dedupe_r
                for t, x0, y0 in used_types_near
            ):
                continue

            sx, sy = int(round(lab["x"])), int(round(lab["y"]))
            if not (0 <= sx < self.w and 0 <= sy < self.h):
                continue
            seed = None
            # Wider search — labels often sit on furniture icons / hatch fills
            search_r = int(1.6 * self.px_per_meter)
            candidates = []
            for r in range(0, search_r, 2):
                for dy in range(-r, r + 1, max(1, r // 3 or 1)):
                    for dx in range(-r, r + 1, max(1, r // 3 or 1)):
                        x, y = sx + dx, sy + dy
                        if 0 <= x < self.w and 0 <= y < self.h and free[y, x] == 255 and claimed[y, x] == 0:
                            candidates.append((x, y))
                if candidates and r >= int(0.35 * self.px_per_meter):
                    break
            if not candidates:
                logger.info(f"🔤 OCR '{lab['text']}' — no free-space seed near ({sx},{sy})")
                continue
            # Wet rooms: prefer seed toward the wet-room stack (not into the bedroom)
            if lab["type"] in ("toilet", "bathroom") and wet_centers:
                wx = float(np.mean([p[0] for p in wet_centers]))
                wy = float(np.mean([p[1] for p in wet_centers]))
                seed = min(candidates, key=lambda p: np.hypot(p[0] - wx, p[1] - wy))
            else:
                seed = min(candidates, key=lambda p: np.hypot(p[0] - sx, p[1] - sy))

            cap_m2 = max_area.get(lab["type"], 20.0)
            # Corridor leftovers only — keep small so it cannot swallow living
            if lab["type"] == "corridor":
                cap_m2 = min(cap_m2, 9.0)
            cap_px = int(cap_m2 * (self.px_per_meter ** 2))
            blob = self._limited_flood(free, claimed, seed, cap_px)
            if blob is None:
                continue
            contours, _ = cv2.findContours(blob, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                continue
            contour = max(contours, key=cv2.contourArea)
            room = self._contour_to_room(contour, len(rooms), lab["type"], lab["text"])
            if room is None:
                continue

            # Open-plan: kitchen seed inside existing living (or vice versa) → merge
            merged = False
            for existing in rooms:
                if existing.get("type") in ("kitchen", "living", "living_kitchen") and lab["type"] in ("kitchen", "living"):
                    if cv2.pointPolygonTest(existing["contour"], (float(seed[0]), float(seed[1])), False) >= 0:
                        existing["type"] = "living_kitchen"
                        existing["ocr_label"] = f"{existing.get('ocr_label', '')}+{lab['text']}"
                        merged = True
                        break
            if merged:
                used_types_near.append((lab["type"], lab["x"], lab["y"]))
                continue

            claimed[blob == 255] = 255
            rooms.append(room)
            used_types_near.append((lab["type"], lab["x"], lab["y"]))
            logger.info(
                f"🔤 Flood room '{lab['text']}' → {room['type']} {room['area_m2']:.1f}m² @ {room['center']}"
            )

        return rooms

    def _limited_flood(self, free: np.ndarray, claimed: np.ndarray, seed: tuple, max_pixels: int) -> Optional[np.ndarray]:
        """BFS flood from seed on free&unclaimed pixels, stop at max_pixels."""
        from collections import deque
        h, w = free.shape
        sx, sy = seed
        if free[sy, sx] == 0 or claimed[sy, sx]:
            return None
        out = np.zeros_like(free)
        q = deque([(sx, sy)])
        out[sy, sx] = 255
        count = 1
        while q and count < max_pixels:
            x, y = q.popleft()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and out[ny, nx] == 0 and free[ny, nx] == 255 and claimed[ny, nx] == 0:
                    out[ny, nx] = 255
                    q.append((nx, ny))
                    count += 1
                    if count >= max_pixels:
                        break
        if count < int(0.8 * (self.px_per_meter ** 2)):
            return None
        # Fill holes / smooth
        k = max(3, int(0.15 * self.px_per_meter) | 1)
        out = cv2.morphologyEx(out, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8))
        return out

    def _segment_rooms(self, walls: List[Dict]) -> List[Dict]:
        """
        Draw walls, close door gaps, flood-fill the exterior from the image border,
        then treat remaining free-space blobs as rooms.

        IMPORTANT: do NOT use RETR_EXTERNAL on a simple invert of the wall mask —
        the exterior (outside the apartment) is also white and swallows interior
        rooms as holes, so every contour looks like "background".
        """
        wall_mask = np.zeros((self.h, self.w), dtype=np.uint8)
        for wall in walls:
            x1, y1 = int(wall['start']['x']), int(wall['start']['y'])
            x2, y2 = int(wall['end']['x']), int(wall['end']['y'])
            thickness = int(max(10, wall.get('thickness', 0.2) * self.px_per_meter))
            cv2.line(wall_mask, (x1, y1), (x2, y2), 255, thickness)

        # Try moderate then stronger gap-bridging — avoid convex-hull seal (it merged
        # rooms into 50–90 m² blobs and spawned duplicate random furniture).
        rooms = []
        for close_m in (1.2, 1.8, 2.4):
            close_px = int(close_m * self.px_per_meter) | 1
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (close_px, close_px))
            closed_walls = cv2.morphologyEx(wall_mask, cv2.MORPH_CLOSE, kernel)

            free = cv2.bitwise_not(closed_walls)
            exterior = free.copy()
            ff_mask = np.zeros((self.h + 2, self.w + 2), np.uint8)
            step_x = max(1, self.w // 24)
            step_y = max(1, self.h // 24)
            for x in range(0, self.w, step_x):
                if exterior[0, x] == 255:
                    cv2.floodFill(exterior, ff_mask, (x, 0), 128)
                if exterior[self.h - 1, x] == 255:
                    cv2.floodFill(exterior, ff_mask, (x, self.h - 1), 128)
            for y in range(0, self.h, step_y):
                if exterior[y, 0] == 255:
                    cv2.floodFill(exterior, ff_mask, (0, y), 128)
                if exterior[y, self.w - 1] == 255:
                    cv2.floodFill(exterior, ff_mask, (self.w - 1, y), 128)

            rooms_mask = np.where(exterior == 255, 255, 0).astype(np.uint8)
            contours, _ = cv2.findContours(rooms_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            candidate = []
            min_area_px = 1.5 * (self.px_per_meter ** 2)
            max_area_m2 = 45.0  # reject merged mega-rooms
            for idx, contour in enumerate(contours):
                area = cv2.contourArea(contour)
                area_m2 = area / (self.px_per_meter ** 2)
                if area < min_area_px or area_m2 > max_area_m2:
                    continue

                x, y, rw, rh = cv2.boundingRect(contour)
                moments = cv2.moments(contour)
                if moments["m00"] == 0:
                    continue
                cx = int(moments["m10"] / moments["m00"])
                cy = int(moments["m01"] / moments["m00"])

                epsilon = 0.015 * cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, epsilon, True)

                candidate.append({
                    "id": idx,
                    "contour": contour,
                    "bbox": (x, y, rw, rh),
                    "center": (cx, cy),
                    "area_m2": area_m2,
                    "approx": approx,
                    "type": None,
                })

            if len(candidate) >= 2:
                rooms = candidate
                logger.info(f"🏠 Room seal close={close_m:.1f}m → {len(rooms)} rooms")
                break
            if len(candidate) > len(rooms):
                rooms = candidate

        return rooms

    def _classify_rooms(self, rooms: List[Dict], raw_yolo_detections: List[Dict]) -> List[Dict]:
        """
        Classify rooms: OCR label (if already set) wins; else YOLO symbols + geometry.
        """
        classified = []

        entrance_door = None
        doors = [d for d in raw_yolo_detections if d['id'] == 'door_standard']
        if doors:
            # Entrance is usually on the outer facade — farthest from apartment centroid
            cx0 = float(np.mean([r['center'][0] for r in rooms])) if rooms else self.w / 2.0
            cy0 = float(np.mean([r['center'][1] for r in rooms])) if rooms else self.h / 2.0
            entrance_door = max(doors, key=lambda d: np.hypot(d['x'] - cx0, d['y'] - cy0))

        for room in rooms:
            contour = room['contour']
            cx, cy = room['center']
            area = room['area_m2']

            # OCR already assigned a type — trust the label (marketing plans are explicit)
            if room.get('ocr_label') and room.get('type'):
                t = room['type']
                room['type'] = t
                logger.info(
                    f"Room {room['id']}: Area = {area:.1f} m2 | OCR '{room.get('ocr_label')}' "
                    f"-> CLASSIFIED AS {t.upper()}"
                )
                classified.append(room)
                continue

            counts = {
                'bathroom_item': 0,
                'bedroom_item': 0,
                'living_kitchen_item': 0,
                'sink': 0,
                'wardrobe': 0,
                'desk': 0
            }

            for det in raw_yolo_detections:
                dist = cv2.pointPolygonTest(contour, (float(det['x']), float(det['y'])), False)
                if dist < 0:
                    continue
                cat_id = det['id']
                conf = float(det.get('confidence', 0))
                if cat_id in {'sink', 'sink_kitchen'} and conf < 0.70:
                    continue
                if cat_id in {'toilet', 'bath', 'shower'} and conf >= 0.40:
                    counts['bathroom_item'] += 1
                elif cat_id in {'bed_double', 'bed_single'} and conf >= 0.40:
                    counts['bedroom_item'] += 1
                elif cat_id in {'stove', 'refrigerator', 'sofa_3', 'sofa_2', 'sofa_corner'} and conf >= 0.40:
                    counts['living_kitchen_item'] += 1
                elif cat_id == 'sink_kitchen' and conf >= 0.70:
                    counts['living_kitchen_item'] += 1
                elif cat_id == 'sink' and conf >= 0.70:
                    counts['sink'] += 1
                elif cat_id == 'wardrobe' and conf >= 0.45:
                    counts['wardrobe'] += 1
                elif cat_id in {'table_desk', 'table_dining'} and conf >= 0.45:
                    counts['desk'] += 1

            room_type = None

            if area < 6.5:
                if counts['bathroom_item'] > 0 or counts['sink'] > 0:
                    room_type = 'bathroom' if area >= 2.2 else 'toilet'
                else:
                    room_type = 'corridor'
            else:
                if counts['bedroom_item'] > 0:
                    room_type = 'bedroom'
                elif counts['living_kitchen_item'] > 0:
                    room_type = 'living_kitchen'
                elif counts['bathroom_item'] > 0:
                    room_type = 'bathroom'
                elif counts['sink'] > 0:
                    room_type = 'kitchen'

            is_near_entrance = False
            if entrance_door:
                dist_to_entrance = np.hypot(cx - entrance_door['x'], cy - entrance_door['y'])
                if dist_to_entrance < 2.5 * self.px_per_meter:
                    is_near_entrance = True

            if not room_type:
                x, y, w, h = room['bbox']
                aspect_ratio = max(w, h) / max(1, min(w, h))
                if area < 6.5 and (aspect_ratio > 1.8 or is_near_entrance):
                    room_type = 'corridor'
                elif area < 6.5:
                    room_type = 'bathroom'
                elif area >= 16.0:
                    room_type = 'living_kitchen'
                else:
                    room_type = 'bedroom'

            room['type'] = room_type
            logger.info(
                f"Room {room['id']}: Area = {area:.1f} m2, Center = ({cx}, {cy}) | "
                f"Counts: {counts} -> CLASSIFIED AS {room_type.upper()}"
            )
            classified.append(room)

        return classified

    def _point_to_segment_dist(self, px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
        """Calculate standard shortest distance from point to line segment."""
        dx = x2 - x1
        dy = y2 - y1
        l2 = dx*dx + dy*dy
        if l2 == 0:
            return np.hypot(px - x1, py - y1)
        t = ((px - x1) * dx + (py - y1) * dy) / l2
        t = max(0.0, min(1.0, t))
        cx_pt = x1 + t * dx
        cy_pt = y1 + t * dy
        return np.hypot(px - cx_pt, py - cy_pt)

    def _snap_object_to_wall(self, x: float, y: float, w_width: float, w_depth: float, room_walls: List[Dict], room_contour: np.ndarray, openings: List[Dict]) -> Tuple[float, float, float]:
        """
        Snaps an object (e.g. wardrobe) flush against the nearest room wall segment,
        aligning its orientation to face inside the room normal.
        """
        nearest_wall = None
        min_dist = float('inf')
        best_t = 0.5
        
        suitable_walls = []
        for wall in room_walls:
            has_portal_block = False
            for op in openings:
                op_dist = self._point_to_segment_dist(op['x'], op['y'], wall['start'][0], wall['start'][1], wall['end'][0], wall['end'][1])
                if op_dist < 1.0 * self.px_per_meter:
                    has_portal_block = True
                    break
            if not has_portal_block:
                suitable_walls.append(wall)
                
        walls_to_check = suitable_walls if suitable_walls else room_walls
        for wall in walls_to_check:
            wx1, wy1 = wall['start'][0], wall['start'][1]
            wx2, wy2 = wall['end'][0], wall['end'][1]
            dx = wx2 - wx1
            dy = wy2 - wy1
            l2 = dx*dx + dy*dy
            if l2 == 0:
                continue
            t = ((x - wx1) * dx + (y - wy1) * dy) / l2
            t = max(0.0, min(1.0, t))
            cx = wx1 + t * dx
            cy = wy1 + t * dy
            dist = np.hypot(x - cx, y - cy)
            if dist < min_dist:
                min_dist = dist
                nearest_wall = wall
                best_t = t
                
        if not nearest_wall:
            return x, y, 0.0
            
        wx1, wy1 = nearest_wall['start'][0], nearest_wall['start'][1]
        wx2, wy2 = nearest_wall['end'][0], nearest_wall['end'][1]
        snap_x = wx1 + best_t * (wx2 - wx1)
        snap_y = wy1 + best_t * (wy2 - wy1)
        
        ux = nearest_wall['dx'] / nearest_wall['length']
        uy = nearest_wall['dy'] / nearest_wall['length']
        nx1, ny1 = -uy, ux
        nx2, ny2 = uy, -ux
        
        test_dist = 20.0
        tx1, ty1 = snap_x + nx1 * test_dist, snap_y + ny1 * test_dist
        dist1 = cv2.pointPolygonTest(room_contour, (float(tx1), float(ty1)), False)
        nx, ny = (nx1, ny1) if dist1 >= 0 else (nx2, ny2)
        
        snap_x += nx * (w_depth / 2)
        snap_y += ny * (w_depth / 2)
        rot = np.degrees(np.arctan2(ny, nx)) - 90
        
        return float(snap_x), float(snap_y), float(rot)

    def _yolo_furniture_passthrough(self, raw_yolo: List[Dict]) -> List[Dict]:
        """
        Trusted YOLO subset only. Marketing-plan YOLO massively hallucinates sinks
        on chairs/hangers/text — those classes are never placed from detections.
        """
        trusted = {
            'bed_double': (0.55, 1),
            'bed_single': (0.55, 1),
            'sofa_2': (0.55, 1),
            'sofa_3': (0.55, 1),
            'sofa_corner': (0.50, 1),
            'toilet': (0.50, 1),
            'bath': (0.50, 1),
            'refrigerator': (0.55, 1),
            'stove': (0.55, 1),
        }

        candidates = [
            d for d in raw_yolo
            if d.get('id') in trusted
            and float(d.get('confidence', 0)) >= trusted[d['id']][0]
        ]
        candidates.sort(key=lambda d: float(d.get('confidence', 0)), reverse=True)

        kept: List[Dict] = []
        counts: Dict[str, int] = {}
        min_sep = 0.8 * self.px_per_meter

        for det in candidates:
            cid = det['id']
            if counts.get(cid, 0) >= trusted[cid][1]:
                continue
            if any(np.hypot(det['x'] - o['x'], det['y'] - o['y']) < min_sep for o in kept if o['id'] == cid):
                continue
            kept.append(det)
            counts[cid] = counts.get(cid, 0) + 1

        return kept

    def _detect_portals(self, walls: List[Dict], raw_yolo: List[Dict], rooms: List[Dict]) -> List[Dict]:
        """
        Identify doors and windows from raw YOLO boxes, snap them to wall segments, 
        and strictly filter out false doors/windows.
        """
        openings = []
        
        # Filter raw YOLO / synthetic items for doors/windows (incl. balcony glazing)
        yolo_openings = [
            item for item in raw_yolo
            if item['id'] in {'door_standard', 'window_standard', 'window_panoramic'}
        ]
        
        for item in yolo_openings:
            ox, oy = item['x'], item['y']
            kind = 'door' if item['id'] == 'door_standard' else 'window'
            
            # Find the nearest wall
            nearest_wall = None
            min_dist = float('inf')
            best_t = 0.5
            
            is_yolo_vertical = item.get('height', 1) > item.get('width', 1)
            
            for wall in walls:
                wx1, wy1 = wall['start']['x'], wall['start']['y']
                wx2, wy2 = wall['end']['x'], wall['end']['y']
                
                dx = wx2 - wx1
                dy = wy2 - wy1
                length_sq = dx*dx + dy*dy
                if length_sq == 0:
                    continue
                    
                t = ((ox - wx1) * dx + (oy - wy1) * dy) / length_sq
                t = max(0.0, min(1.0, t))
                cx = wx1 + t * dx
                cy = wy1 + t * dy
                
                is_wall_vertical = abs(dx) < abs(dy)
                dist = np.hypot(ox - cx, oy - cy)
                # Prefer orientation-matching walls but do not exclude others outright:
                # YOLO bboxes of doors with swing arcs are near-square, so a strict
                # orientation match loses real doors.
                if is_yolo_vertical != is_wall_vertical:
                    dist *= 1.5
                
                if dist < min_dist:
                    min_dist = dist
                    nearest_wall = wall
                    best_t = t
            
            # Snapping validation
            if nearest_wall and min_dist < (1.2 * self.px_per_meter):
                # Snap coordinates to exact wall point
                wx1, wy1 = nearest_wall['start']['x'], nearest_wall['start']['y']
                wx2, wy2 = nearest_wall['end']['x'], nearest_wall['end']['y']
                snap_x = wx1 + best_t * (wx2 - wx1)
                snap_y = wy1 + best_t * (wy2 - wy1)
                
                dx = wx2 - wx1
                dy = wy2 - wy1
                length = np.hypot(dx, dy)
                
                # Calculate normal vector perpendicular to the wall
                ux = dx / length if length > 0 else 0.0
                uy = dy / length if length > 0 else 0.0
                nx, ny = -uy, ux # normal perpendicular to wall
                
                # RULE 2: Interior doors must separate different room zones!
                # If both sides of the door belong to the exact same room, it is a false door.
                # RULE 3: Exterior doors (where one side is None/outside) must connect directly to the corridor!
                # Doors leading directly from a bedroom or living room to the outside are false exterior doors.
                offset = 0.4 * self.px_per_meter
                p1_x = snap_x + nx * offset
                p1_y = snap_y + ny * offset
                p2_x = snap_x - nx * offset
                p2_y = snap_y - ny * offset
                
                room1 = None
                room2 = None
                room1_type = None
                room2_type = None
                
                for room in rooms:
                    if cv2.pointPolygonTest(room['contour'], (float(p1_x), float(p1_y)), False) >= 0:
                        room1 = room['id']
                        room1_type = room.get('type')
                    if cv2.pointPolygonTest(room['contour'], (float(p2_x), float(p2_y)), False) >= 0:
                        room2 = room['id']
                        room2_type = room.get('type')
                        
                conf = float(item.get('confidence', 0))
                corridor_types = ('corridor',)
                near_corridor = room1_type in corridor_types or room2_type in corridor_types
                if kind == 'door':
                    # Both sides outside — keep moderate-conf (entrance often sits on missing wall stub)
                    if room1 is None and room2 is None:
                        if conf >= 0.40:
                            logger.info(f"⚠ Keeping door without room context at ({ox:.1f}, {oy:.1f})")
                        else:
                            logger.info(f"🚫 Discarded false door entirely outside at ({ox:.1f}, {oy:.1f})")
                            continue

                    # Same-room: often bad room merge — keep confident detections
                    if room1 == room2 and room1 is not None and conf < 0.55:
                        logger.info(f"🚫 Discarded false door inside room {room1} at ({ox:.1f}, {oy:.1f})")
                        continue

                    # Exterior door: corridor/kitchen/wet OR any typed room OR entrance-level conf
                    has_ok = (
                        room1_type in ('corridor', 'bathroom', 'toilet', 'kitchen', 'living', 'living_kitchen', 'bedroom', 'balcony')
                        or room2_type in ('corridor', 'bathroom', 'toilet', 'kitchen', 'living', 'living_kitchen', 'bedroom', 'balcony')
                    )
                    if rooms and (room1 is None or room2 is None) and not has_ok and conf < 0.45:
                        logger.info(
                            f"🚫 Discarded false exterior door at ({ox:.1f}, {oy:.1f}) "
                            f"(rooms: {room1_type}/{room2_type})"
                        )
                        continue
                    # Boost: exterior door next to corridor is almost always the entrance
                    if (room1 is None or room2 is None) and near_corridor:
                        conf = max(conf, 0.7)
                        item = dict(item, confidence=conf)

                # Drop only clear interior windows (both sides inside rooms)
                # Keep facade windows even when wall kind was mislabeled partition
                if kind == 'window' and room1 is not None and room2 is not None and conf < 0.5:
                    logger.info(f"🚫 Discarded interior window between rooms at ({ox:.1f}, {oy:.1f})")
                    continue
                if kind == 'window' and item.get('id') == 'window_panoramic':
                    pass  # always keep balcony glazing

                rotation = np.degrees(np.arctan2(dy, dx))
                if kind == 'door':
                    catalog_id = 'door_standard'
                elif item.get('id') == 'window_panoramic' or item.get('panoramic'):
                    catalog_id = 'window_panoramic'
                else:
                    catalog_id = 'window_standard'

                # Along-wall opening width from YOLO bbox projection
                ux = dx / length if length > 0 else 1.0
                uy = dy / length if length > 0 else 0.0
                along = abs(item.get('width', 0) * ux) + abs(item.get('height', 0) * uy)
                if catalog_id == 'window_panoramic':
                    along = max(1.0 * self.px_per_meter, min(length * 0.92, along or length * 0.9))
                elif kind == 'window':
                    along = max(0.9 * self.px_per_meter, min(3.0 * self.px_per_meter, along or 1.4 * self.px_per_meter))
                else:
                    along = max(0.7 * self.px_per_meter, min(1.1 * self.px_per_meter, along or 0.9 * self.px_per_meter))

                openings.append({
                    "id": catalog_id,
                    "x": float(snap_x),
                    "y": float(snap_y),
                    "width": float(along),
                    "height": float(item.get('height', along)),
                    "rotation": float(rotation),
                    "confidence": float(item['confidence']),
                    "panoramic": catalog_id == 'window_panoramic',
                })
                
        # Deduplicate doors and windows (prefer higher confidence / geometric seals)
        openings.sort(key=lambda o: float(o.get('confidence', 0)), reverse=True)
        deduped = []
        for op in openings:
            duplicate = False
            for existing in deduped:
                # Any portal within ~1 m is the same opening (door vs window conflict → keep first)
                if np.hypot(op['x'] - existing['x'], op['y'] - existing['y']) < (1.0 * self.px_per_meter):
                    duplicate = True
                    break
            if not duplicate:
                deduped.append(op)

        return deduped

    def _get_room_walls(self, approx) -> List[Dict]:
        """Convert approximated room boundary polygon to list of individual 2D wall lines."""
        room_walls = []
        for i in range(len(approx)):
            p1 = approx[i][0]
            p2 = approx[(i + 1) % len(approx)][0]
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            length = np.sqrt(dx**2 + dy**2)
            room_walls.append({
                'start': p1,
                'end': p2,
                'dx': dx,
                'dy': dy,
                'length': length,
                'length_m': length / self.px_per_meter
            })
        return room_walls

    def _furnish_room(self, room: Dict, walls: List[Dict], openings: List[Dict], raw_yolo_detections: List[Dict]) -> List[Dict]:
        """Furnish rooms semantically using rigid templates centered inside wall boundaries."""
        rtype = room['type']
        contour = room['contour']
        rx, ry, rw, rh = room['bbox']
        cx, cy = room['center']
        
        items = []
        
        def point_to_segment_dist(px, py, x1, y1, x2, y2):
            dx = x2 - x1
            dy = y2 - y1
            l2 = dx*dx + dy*dy
            if l2 == 0:
                return np.hypot(px - x1, py - y1)
            t = ((px - x1) * dx + (py - y1) * dy) / l2
            t = max(0.0, min(1.0, t))
            cx_pt = x1 + t * dx
            cy_pt = y1 + t * dy
            return np.hypot(px - cx_pt, py - cy_pt)
        
        # 1. BEDROOM TEMPLATE
        if rtype == 'bedroom':
            room_walls = self._get_room_walls(room['approx'])
            if not room_walls:
                return []
                
            # Find the longest wall (headboard wall)
            main_wall_idx = max(range(len(room_walls)), key=lambda i: room_walls[i]['length'])
            main_wall = room_walls[main_wall_idx]
            
            # Perpendicular normal vector pointing inside the room
            ux = main_wall['dx'] / main_wall['length']
            uy = main_wall['dy'] / main_wall['length']
            nx1, ny1 = -uy, ux
            nx2, ny2 = uy, -ux
            
            mx = (main_wall['start'][0] + main_wall['end'][0]) / 2.0
            my = (main_wall['start'][1] + main_wall['end'][1]) / 2.0
            
            # Check which normal goes inside contour
            test_dist = 20.0
            tx1, ty1 = mx + nx1 * test_dist, my + ny1 * test_dist
            dist1 = cv2.pointPolygonTest(contour, (float(tx1), float(ty1)), False)
            nx, ny = (nx1, ny1) if dist1 >= 0 else (nx2, ny2)
            
            # Bed coordinates (centered, offset by 1.0 meters inside the room)
            bed_offset = 1.0 * self.px_per_meter
            bed_x = mx + nx * bed_offset
            bed_y = my + ny * bed_offset
            
            # Bed rotation (faces the room normal)
            rot = np.degrees(np.arctan2(ny, nx)) - 90
            
            items.append({
                "id": "bed_double",
                "x": float(bed_x),
                "y": float(bed_y),
                "width": float(2.0 * self.px_per_meter),
                "height": float(2.0 * self.px_per_meter),
                "rotation": float(rot),
                "confidence": 0.99
            })
            
            # Two bedside tables (using bedside_table catalog item!) on both sides of the bed
            sx, sy = -ny, nx  # perpendicular side vector
            side_offset = 1.35 * self.px_per_meter
            ts_offset = 0.25 * self.px_per_meter
            
            for side in [-1, 1]:
                tsx = mx + sx * (side * side_offset) + nx * ts_offset
                tsy = my + sy * (side * side_offset) + ny * ts_offset
                items.append({
                    "id": "bedside_table",
                    "x": float(tsx),
                    "y": float(tsy),
                    "width": float(0.5 * self.px_per_meter),
                    "height": float(0.45 * self.px_per_meter),
                    "rotation": float(rot),
                    "confidence": 0.99
                })
                
            # Bedroom wardrobe along the opposite or side wall (excluding doors/windows) using snap utility
            other_walls = [w for i, w in enumerate(room_walls) if i != main_wall_idx]
            filtered_other_walls = []
            for w in other_walls:
                has_portal = False
                for op in openings:
                    dist = self._point_to_segment_dist(op['x'], op['y'], w['start'][0], w['start'][1], w['end'][0], w['end'][1])
                    if dist < 1.0 * self.px_per_meter:
                        has_portal = True
                        break
                if not has_portal:
                    filtered_other_walls.append(w)
                    
            wardrobe_wall = None
            if filtered_other_walls:
                wardrobe_wall = max(filtered_other_walls, key=lambda w: w['length'])
            elif other_walls:
                wardrobe_wall = max(other_walls, key=lambda w: w['length'])
                
            if wardrobe_wall:
                w_mx = (wardrobe_wall['start'][0] + wardrobe_wall['end'][0]) / 2.0
                w_my = (wardrobe_wall['start'][1] + wardrobe_wall['end'][1]) / 2.0
                w_depth = 0.6 * self.px_per_meter
                
                wardrobe_x, wardrobe_y, w_rot = self._snap_object_to_wall(
                    w_mx, w_my, wardrobe_wall['length'] * 0.8, w_depth,
                    room_walls, contour, openings
                )
                w_width_m = min(3.0, max(1.2, wardrobe_wall['length_m'] * 0.8))
                
                items.append({
                    "id": "wardrobe",
                    "x": float(wardrobe_x),
                    "y": float(wardrobe_y),
                    "width": float(w_width_m * self.px_per_meter),
                    "height": float(w_depth),
                    "rotation": float(w_rot),
                    "confidence": 0.99
                })
                
            # Place Desk and Chair along the right exterior wall (near window)
            desk_x = rx + rw - 0.4 * self.px_per_meter
            desk_y = ry + rh - 1.2 * self.px_per_meter
            items.append({
                "id": "table_desk",
                "x": float(desk_x),
                "y": float(desk_y),
                "width": float(1.2 * self.px_per_meter),
                "height": float(0.6 * self.px_per_meter),
                "rotation": 270.0,
                "confidence": 0.99
            })
            items.append({
                "id": "chair_dining",  # acts as office chair
                "x": float(desk_x - 0.6 * self.px_per_meter),
                "y": float(desk_y),
                "width": float(0.45 * self.px_per_meter),
                "height": float(0.45 * self.px_per_meter),
                "rotation": 90.0,
                "confidence": 0.99
            })

        # 2. BATHROOM TEMPLATE
        elif rtype == 'bathroom':
            items.append({
                "id": "bath",
                "x": float(rx + rw - 0.4 * self.px_per_meter),
                "y": float(ry + rh / 2),
                "width": float(1.6 * self.px_per_meter),
                "height": float(0.7 * self.px_per_meter),
                "rotation": 90.0,
                "confidence": 0.99
            })
            items.append({
                "id": "toilet",
                "x": float(rx + 0.4 * self.px_per_meter),
                "y": float(ry + 0.4 * self.px_per_meter),
                "width": float(0.4 * self.px_per_meter),
                "height": float(0.7 * self.px_per_meter),
                "rotation": 90.0,
                "confidence": 0.99
            })
            items.append({
                "id": "sink",
                "x": float(rx + 0.4 * self.px_per_meter),
                "y": float(ry + 1.0 * self.px_per_meter),
                "width": float(0.6 * self.px_per_meter),
                "height": float(0.5 * self.px_per_meter),
                "rotation": 90.0,
                "confidence": 0.99
            })
            if room['area_m2'] >= 2.8:
                items.append({
                    "id": "washing_machine",
                    "x": float(rx + 0.4 * self.px_per_meter),
                    "y": float(ry + min(rh - 0.4 * self.px_per_meter, 1.6 * self.px_per_meter)),
                    "width": float(0.6 * self.px_per_meter),
                    "height": float(0.6 * self.px_per_meter),
                    "rotation": 90.0,
                    "confidence": 0.99
                })

        # 2b. TOILET / small санузел — never dining furniture
        elif rtype == 'toilet':
            items.append({
                "id": "toilet",
                "x": float(cx),
                "y": float(cy),
                "width": float(0.4 * self.px_per_meter),
                "height": float(0.7 * self.px_per_meter),
                "rotation": 90.0,
                "confidence": 0.99
            })
            if room['area_m2'] >= 1.2:
                items.append({
                    "id": "sink",
                    "x": float(rx + 0.35 * self.px_per_meter),
                    "y": float(ry + 0.35 * self.px_per_meter),
                    "width": float(0.5 * self.px_per_meter),
                    "height": float(0.4 * self.px_per_meter),
                    "rotation": 90.0,
                    "confidence": 0.99
                })

        # 2c. KITCHEN only (OCR «Зона кухни»)
        elif rtype == 'kitchen':
            k_x = rx + 0.35 * self.px_per_meter
            wall_length_m = max(rh, rw) / self.px_per_meter
            kitchen_set_width_m = min(3.2, max(1.4, wall_length_m - 1.0))
            items.append({
                "id": "refrigerator",
                "x": float(k_x),
                "y": float(ry + 0.5 * self.px_per_meter),
                "width": float(0.6 * self.px_per_meter),
                "height": float(0.6 * self.px_per_meter),
                "rotation": 90.0,
                "confidence": 0.99
            })
            items.append({
                "id": "kitchen_set",
                "x": float(k_x),
                "y": float(ry + (1.2 + kitchen_set_width_m / 2) * self.px_per_meter),
                "width": float(kitchen_set_width_m * self.px_per_meter),
                "height": float(0.6 * self.px_per_meter),
                "rotation": 90.0,
                "confidence": 0.99
            })
            if room['area_m2'] >= 8.0:
                items.append({
                    "id": "table_dining",
                    "x": float(cx + 0.4 * self.px_per_meter),
                    "y": float(cy),
                    "width": float(1.2 * self.px_per_meter),
                    "height": float(0.8 * self.px_per_meter),
                    "rotation": 0.0,
                    "confidence": 0.99
                })
                for i in (-1, 1):
                    items.append({
                        "id": "chair_dining",
                        "x": float(cx + 0.4 * self.px_per_meter + i * 0.55 * self.px_per_meter),
                        "y": float(cy + 0.7 * self.px_per_meter),
                        "width": float(0.45 * self.px_per_meter),
                        "height": float(0.45 * self.px_per_meter),
                        "rotation": 0.0,
                        "confidence": 0.99
                    })

        # 2d. LIVING only (OCR «Зона гостиной»)
        elif rtype == 'living':
            sofa_id = "sofa_3" if room['area_m2'] >= 12 else "sofa_2"
            sofa_w_m = 2.2 if sofa_id == "sofa_3" else 1.6
            sofa_d_m = 0.9
            sofa_x = rx + rw - (sofa_w_m / 2 + 0.25) * self.px_per_meter
            sofa_y = ry + rh - (sofa_d_m / 2 + 0.25) * self.px_per_meter
            items.append({
                "id": sofa_id,
                "x": float(sofa_x),
                "y": float(sofa_y),
                "width": float(sofa_w_m * self.px_per_meter),
                "height": float(sofa_d_m * self.px_per_meter),
                "rotation": 180.0,
                "confidence": 0.99
            })
            items.append({
                "id": "tv_stand",
                "x": float(sofa_x),
                "y": float(ry + 0.3 * self.px_per_meter),
                "width": float(1.4 * self.px_per_meter),
                "height": float(0.4 * self.px_per_meter),
                "rotation": 0.0,
                "confidence": 0.99
            })
            items.append({
                "id": "tv",
                "x": float(sofa_x),
                "y": float(ry + 0.3 * self.px_per_meter),
                "width": float(1.1 * self.px_per_meter),
                "height": float(0.12 * self.px_per_meter),
                "rotation": 0.0,
                "confidence": 0.99
            })

        # 2e. BALCONY — no indoor furniture
        elif rtype == 'balcony':
            return []

        # 3. STUDIO / LIVING KITCHEN TEMPLATE
        elif rtype == 'living_kitchen':
            # Split the studio dynamically into:
            # - Left part: Kitchen + Dining
            # - Right part: Living Room
            
            # --- A. KITCHEN ZONE (Left Wall) - Integrated Premium Kitchen Set ---
            k_x = rx + 0.35 * self.px_per_meter
            
            # Calculate remaining space for kitchen set along the wall dynamically
            wall_length_m = rh / self.px_per_meter
            fridge_space = 0.6
            margin_bottom = 0.4
            
            # Bespoke kitchen set width to fit the kitchen wall perfectly
            kitchen_set_width_m = max(1.2, wall_length_m - fridge_space - margin_bottom)
            kitchen_set_width_m = min(3.6, kitchen_set_width_m)  # Cap at reasonable length
            
            # Refrigerator positioned at the top of the kitchen zone
            fridge_y = ry + (margin_bottom + 0.3) * self.px_per_meter
            items.append({
                "id": "refrigerator",
                "x": float(k_x),
                "y": float(fridge_y),
                "width": float(0.6 * self.px_per_meter),
                "height": float(0.6 * self.px_per_meter),
                "rotation": 90.0,
                "confidence": 0.99
            })
            
            # Integrated Premium Kitchen Set positioned right next to the refrigerator
            kitchen_set_y = fridge_y + (0.3 + kitchen_set_width_m / 2.0) * self.px_per_meter
            items.append({
                "id": "kitchen_set",
                "x": float(k_x),
                "y": float(kitchen_set_y),
                "width": float(kitchen_set_width_m * self.px_per_meter),
                "height": float(0.6 * self.px_per_meter),
                "rotation": 90.0,
                "confidence": 0.99
            })
            
            # --- B. DINING ZONE (Middle-Left) ---
            dt_x = rx + 1.9 * self.px_per_meter
            dt_y = ry + 2.1 * self.px_per_meter
            
            # Dining Table
            items.append({
                "id": "table_dining",
                "x": float(dt_x),
                "y": float(dt_y),
                "width": float(1.2 * self.px_per_meter),
                "height": float(0.8 * self.px_per_meter),
                "rotation": 90.0,
                "confidence": 0.99
            })
            
            # 4 Dining Chairs placed symmetrically
            for i in [-1, 1]:
                items.append({
                    "id": "chair_dining",
                    "x": float(dt_x + i * 0.65 * self.px_per_meter),
                    "y": float(dt_y - 0.25 * self.px_per_meter),
                    "width": float(0.45 * self.px_per_meter),
                    "height": float(0.45 * self.px_per_meter),
                    "rotation": 0.0 if i > 0 else 180.0,
                    "confidence": 0.99
                })
                items.append({
                    "id": "chair_dining",
                    "x": float(dt_x + i * 0.65 * self.px_per_meter),
                    "y": float(dt_y + 0.25 * self.px_per_meter),
                    "width": float(0.45 * self.px_per_meter),
                    "height": float(0.45 * self.px_per_meter),
                    "rotation": 0.0 if i > 0 else 180.0,
                    "confidence": 0.99
                })
                
            # --- C. LIVING ROOM ZONE (Right Half) with Adaptive Sofa Selection ---
            # Check if there is an explicitly detected straight sofa in this room
            has_detected_straight_sofa = False
            for det in raw_yolo_detections:
                if det['id'] in {'sofa_3', 'sofa_2'}:
                    dist = cv2.pointPolygonTest(contour, (float(det['x']), float(det['y'])), False)
                    if dist >= 0:
                        has_detected_straight_sofa = True
                        break
                        
            use_straight_sofa = room['area_m2'] < 16.0 or has_detected_straight_sofa
            
            sofa_id = "sofa_corner"
            sofa_w_m = 2.2
            sofa_d_m = 2.2
            
            if use_straight_sofa:
                if room['area_m2'] < 10.0:
                    sofa_id = "sofa_2"
                    sofa_w_m = 1.6
                    sofa_d_m = 0.9
                else:
                    sofa_id = "sofa_3"
                    sofa_w_m = 2.2
                    sofa_d_m = 0.9
            
            sofa_x = rx + rw - (sofa_w_m / 2 + 0.2) * self.px_per_meter
            sofa_y = ry + rh - (sofa_d_m / 2 + 0.2) * self.px_per_meter
            
            items.append({
                "id": sofa_id,
                "x": float(sofa_x),
                "y": float(sofa_y),
                "width": float(sofa_w_m * self.px_per_meter),
                "height": float(sofa_d_m * self.px_per_meter),
                "rotation": 180.0,
                "confidence": 0.99
            })
            
            # TV Stand opposite to the sofa (along top wall boundary dynamically)
            tv_x = sofa_x
            tv_y = ry + 0.25 * self.px_per_meter
            
            # Check if there is an opening (door or window) close to the proposed TV location
            has_door_blocking = False
            for op in openings:
                if np.hypot(tv_x - op['x'], tv_y - op['y']) < 1.5 * self.px_per_meter:
                    has_door_blocking = True
                    break
            
            # If blocked, try to shift it horizontally away from the door, or skip if no space
            if has_door_blocking:
                # Try shifting left
                shifted_x = tv_x - 1.8 * self.px_per_meter
                still_blocked = False
                for op in openings:
                    if np.hypot(shifted_x - op['x'], tv_y - op['y']) < 1.2 * self.px_per_meter:
                        still_blocked = True
                        break
                if not still_blocked and shifted_x > rx + 0.5 * self.px_per_meter:
                    tv_x = shifted_x
                    has_door_blocking = False
                else:
                    # Try shifting right
                    shifted_x = tv_x + 1.8 * self.px_per_meter
                    still_blocked = False
                    for op in openings:
                        if np.hypot(shifted_x - op['x'], tv_y - op['y']) < 1.2 * self.px_per_meter:
                            still_blocked = True
                            break
                    if not still_blocked and shifted_x < rx + rw - 0.5 * self.px_per_meter:
                        tv_x = shifted_x
                        has_door_blocking = False
            
            # Place TV stand and TV ONLY if not blocked by a door (or if shifted successfully)
            if not has_door_blocking:
                items.append({
                    "id": "tv_stand",
                    "x": float(tv_x),
                    "y": float(tv_y),
                    "width": float(1.6 * self.px_per_meter),
                    "height": float(0.45 * self.px_per_meter),
                    "rotation": 0.0,
                    "confidence": 0.99
                })
                items.append({
                    "id": "tv",
                    "x": float(tv_x),
                    "y": float(tv_y),
                    "width": float(1.2 * self.px_per_meter),
                    "height": float(0.15 * self.px_per_meter),
                    "rotation": 0.0,
                    "confidence": 0.99
                })

        # 4. CORRIDOR / HALLWAY TEMPLATE
        elif rtype == 'corridor':
            # Place wardrobe flush against the longest suitable wall of the corridor using snap utility
            room_walls = self._get_room_walls(room['approx'])
            if room_walls:
                suitable_walls = []
                for w in room_walls:
                    has_portal = False
                    for op in openings:
                        dist = self._point_to_segment_dist(op['x'], op['y'], w['start'][0], w['start'][1], w['end'][0], w['end'][1])
                        if dist < 1.0 * self.px_per_meter:
                            has_portal = True
                            break
                    if not has_portal and w['length_m'] >= 0.8:
                        suitable_walls.append(w)
                        
                w_wall = None
                if suitable_walls:
                    w_wall = max(suitable_walls, key=lambda w: w['length'])
                elif room_walls:
                    w_wall = max(room_walls, key=lambda w: w['length'])
                    
                if w_wall:
                    w_mx = (w_wall['start'][0] + w_wall['end'][0]) / 2.0
                    w_my = (w_wall['start'][1] + w_wall['end'][1]) / 2.0
                    w_depth = 0.45 * self.px_per_meter
                    
                    wardrobe_x, wardrobe_y, w_rot = self._snap_object_to_wall(
                        w_mx, w_my, w_wall['length'] * 0.6, w_depth,
                        room_walls, contour, openings
                    )
                    
                    items.append({
                        "id": "wardrobe",
                        "x": float(wardrobe_x),
                        "y": float(wardrobe_y),
                        "width": float(min(1.5, max(0.8, w_wall['length_m'] * 0.6)) * self.px_per_meter),
                        "height": float(w_depth),
                        "rotation": float(w_rot),
                        "confidence": 0.99
                    })
            
        return items
