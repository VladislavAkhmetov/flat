import numpy as np
import cv2
import logging
from typing import List, Dict, Tuple

logger = logging.getLogger(__name__)

class SemanticLayoutPlanner:
    """
    Universal 100% Offline Semantic Layout Planner.
    Segments walls into room zones, detects doors/windows, and places beautiful, 
    ergonomically correct furniture templates in each room.
    """
    def __init__(self, h: int, w: int):
        self.h = h
        self.w = w
        self.px_per_meter = max(h, w) / 10.0  # Dynamic scaling: max dimension represents 10 meters
        logger.info(f"Initialized SemanticLayoutPlanner with scale: {self.px_per_meter:.2f} px/m")

    def plan_layout(self, walls: List[Dict], raw_yolo_detections: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
        """
        Main entry point for layout generation.
        Returns:
            List of openings (doors/windows snapped to walls)
            List of furniture items placed semantically
        """
        # 1. Segment rooms using closed wall masks
        rooms = self._segment_rooms(walls)
        
        # 2. Classify room types
        classified_rooms = self._classify_rooms(rooms, raw_yolo_detections)
        
        # 3. Detect doors and windows from raw YOLO detections (as portals), snap and filter them
        openings = self._detect_portals(walls, raw_yolo_detections, rooms)
        
        # 4. Semantically furnish each room based on classified type
        furniture = []
        for room in classified_rooms:
            room_items = self._furnish_room(room, walls, openings, raw_yolo_detections)
            furniture.extend(room_items)

        # Semantic cleanup: a door or window cannot be located behind a TV Stand!
        # If any opening is too close to a TV Stand, it's a false portal detection from plan text/symbols.
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

    def _segment_rooms(self, walls: List[Dict]) -> List[Dict]:
        """Draw walls as lines, close gaps, and then invert to find distinct rooms."""
        # Create a black canvas
        wall_mask = np.zeros((self.h, self.w), dtype=np.uint8)
        
        for wall in walls:
            x1, y1 = int(wall['start']['x']), int(wall['start']['y'])
            x2, y2 = int(wall['end']['x']), int(wall['end']['y'])
            # Draw walls slightly thick
            thickness = int(max(8, wall.get('thickness', 0.2) * self.px_per_meter))
            cv2.line(wall_mask, (x1, y1), (x2, y2), 255, thickness)
            
        # Close door/window gaps on the wall mask itself (dilation bridges gaps, erosion restores wall thickness)
        close_px = int(1.1 * self.px_per_meter) | 1  # 1.1 meters gap bridging
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (close_px, close_px))
        closed_walls = cv2.morphologyEx(wall_mask, cv2.MORPH_CLOSE, kernel)
        
        # Invert the closed walls mask to get clean separated rooms
        rooms_mask = cv2.bitwise_not(closed_walls)
        
        # Find contours of the room regions
        contours, _ = cv2.findContours(rooms_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        rooms = []
        for idx, contour in enumerate(contours):
            area = cv2.contourArea(contour)
            # Filter out very small background fragments (less than 1.5 m2)
            min_area_px = 1.5 * (self.px_per_meter ** 2)
            if area < min_area_px:
                continue
                
            # Filter out the background region (which touches the top-left corner of the image)
            if cv2.pointPolygonTest(contour, (2.0, 2.0), False) >= 0:
                logger.info(f"🚫 Ignored background region contour at index {idx}")
                continue
                
            x, y, rw, rh = cv2.boundingRect(contour)
            moments = cv2.moments(contour)
            if moments["m00"] == 0:
                continue
            cx = int(moments["m10"] / moments["m00"])
            cy = int(moments["m01"] / moments["m00"])
            
            # Filter out rooms near the very edges of the image (false boundary segments)
            margin_px = 0.6 * self.px_per_meter
            if cx < margin_px or cx > (self.w - margin_px) or cy < margin_px or cy > (self.h - margin_px):
                logger.info(f"🚫 Ignored boundary artifact room at center ({cx}, {cy})")
                continue
            
            # Approximate to straight-wall polygon
            epsilon = 0.015 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            
            rooms.append({
                "id": idx,
                "contour": contour,
                "bbox": (x, y, rw, rh),
                "center": (cx, cy),
                "area_m2": area / (self.px_per_meter ** 2),
                "approx": approx
            })
            
        return rooms

    def _classify_rooms(self, rooms: List[Dict], raw_yolo_detections: List[Dict]) -> List[Dict]:
        """
        Dynamically classify rooms using detected YOLO symbols inside the room boundary.
        Falls back to geometric features and entrance door proximity for hallways.
        Enforces strict size limits (e.g., bedrooms/kitchens must be >= 6.5 m2).
        """
        classified = []
        
        # Find entrance door to help identify the corridor
        entrance_door = None
        doors = [d for d in raw_yolo_detections if d['id'] == 'door_standard']
        if doors:
            entrance_door = min(doors, key=lambda d: d['x'])
            
        for room in rooms:
            contour = room['contour']
            cx, cy = room['center']
            area = room['area_m2']
            
            # Count detected items inside this room's contour
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
                if dist >= 0:
                    cat_id = det['id']
                    if cat_id in {'toilet', 'bath', 'shower'}:
                        counts['bathroom_item'] += 1
                    elif cat_id in {'bed_double', 'bed_single'}:
                        counts['bedroom_item'] += 1
                    elif cat_id in {'stove', 'refrigerator', 'sink_kitchen', 'sofa_3', 'sofa_2', 'sofa_corner'}:
                        counts['living_kitchen_item'] += 1
                    elif cat_id == 'sink':
                        counts['sink'] += 1
                    elif cat_id == 'wardrobe':
                        counts['wardrobe'] += 1
                    elif cat_id in {'table_desk', 'table_dining'}:
                        counts['desk'] += 1
                        
            room_type = None
            
            # Enforce size constraints
            if area < 6.5:
                # Small rooms can ONLY be bathroom or corridor
                if counts['bathroom_item'] > 0 or counts['sink'] > 0:
                    room_type = 'bathroom'
                else:
                    room_type = 'corridor'
            else:
                # Large rooms (>= 6.5 m2) can be bedroom, living_kitchen, or bathroom
                if counts['bedroom_item'] > 0:
                    room_type = 'bedroom'
                elif counts['living_kitchen_item'] > 0:
                    room_type = 'living_kitchen'
                elif counts['bathroom_item'] > 0:
                    room_type = 'bathroom'
                elif counts['sink'] > 0:
                    room_type = 'living_kitchen'
                    
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
            logger.info(f"Room {room['id']}: Area = {area:.1f} m2, Center = ({cx}, {cy}) | Counts: {counts} -> CLASSIFIED AS {room_type.upper()}")
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

    def _detect_portals(self, walls: List[Dict], raw_yolo: List[Dict], rooms: List[Dict]) -> List[Dict]:
        """
        Identify doors and windows from raw YOLO boxes, snap them to wall segments, 
        and strictly filter out false doors/windows.
        """
        openings = []
        
        # Filter raw YOLO items for doors/windows
        yolo_openings = [item for item in raw_yolo if item['id'] in {'door_standard', 'window_standard'}]
        
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
                # Strictly match orientation to prevent doors/windows from snapping to the wrong walls
                if is_yolo_vertical != is_wall_vertical:
                    continue
                
                dist = np.hypot(ox - cx, oy - cy)
                
                if dist < min_dist:
                    min_dist = dist
                    nearest_wall = wall
                    best_t = t
            
            # Snapping validation
            if nearest_wall and min_dist < (1.2 * self.px_per_meter):
                # RULE 1: Strictly NO windows in internal partition walls
                if kind == 'window' and nearest_wall.get('kind') == 'partition':
                    logger.info(f"🚫 Discarded false window on partition wall at ({ox:.1f}, {oy:.1f})")
                    continue
                    
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
                        room1_type = room['type']
                    if cv2.pointPolygonTest(room['contour'], (float(p2_x), float(p2_y)), False) >= 0:
                        room2 = room['id']
                        room2_type = room['type']
                        
                if kind == 'door':
                    # Check for doors entirely outside the apartment
                    if room1 is None and room2 is None:
                        logger.info(f"🚫 Discarded false door entirely outside at ({ox:.1f}, {oy:.1f})")
                        continue
                        
                    # Check for interior doors inside the exact same room
                    if room1 == room2 and room1 is not None:
                        logger.info(f"🚫 Discarded false door inside room {room1} at ({ox:.1f}, {oy:.1f})")
                        continue
                        
                    # Check for false exterior doors (connecting bedroom/living to outside)
                    has_corridor = (room1_type == 'corridor') or (room2_type == 'corridor')
                    if (room1 is None or room2 is None) and not has_corridor:
                        logger.info(f"🚫 Discarded false exterior door for non-corridor room at ({ox:.1f}, {oy:.1f})")
                        continue
                    
                # Calculate rotation offset from wall orientation
                rotation = np.degrees(np.arctan2(dy, dx))
                
                openings.append({
                    "id": item['id'],
                    "x": float(snap_x),
                    "y": float(snap_y),
                    "width": float(item['width']),
                    "height": float(item['height']),
                    "rotation": float(rotation),
                    "confidence": float(item['confidence'])
                })
                
        # Deduplicate doors and windows
        deduped = []
        for op in openings:
            duplicate = False
            for existing in deduped:
                if op['id'] == existing['id'] and np.hypot(op['x'] - existing['x'], op['y'] - existing['y']) < (0.5 * self.px_per_meter):
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
            # Place bathroom items along walls efficiently
            # Tub along the right wall (oriented vertically, rotation 90)
            items.append({
                "id": "bath",
                "x": float(rx + rw - 0.4 * self.px_per_meter),
                "y": float(ry + rh / 2),
                "width": float(1.6 * self.px_per_meter),
                "height": float(0.7 * self.px_per_meter),
                "rotation": 90.0,
                "confidence": 0.99
            })
            
            # Toilet at top-left
            items.append({
                "id": "toilet",
                "x": float(rx + 0.4 * self.px_per_meter),
                "y": float(ry + 0.4 * self.px_per_meter),
                "width": float(0.4 * self.px_per_meter),
                "height": float(0.7 * self.px_per_meter),
                "rotation": 90.0,
                "confidence": 0.99
            })
            
            # Sink in the middle-left
            items.append({
                "id": "sink",
                "x": float(rx + 0.4 * self.px_per_meter),
                "y": float(ry + 1.0 * self.px_per_meter),
                "width": float(0.6 * self.px_per_meter),
                "height": float(0.5 * self.px_per_meter),
                "rotation": 90.0,
                "confidence": 0.99
            })
            
            # Washing machine at bottom-left wall (away from corridor entrance door)
            items.append({
                "id": "washing_machine",
                "x": float(rx + 0.4 * self.px_per_meter),
                "y": float(ry + 1.6 * self.px_per_meter),
                "width": float(0.6 * self.px_per_meter),
                "height": float(0.6 * self.px_per_meter),
                "rotation": 90.0,
                "confidence": 0.99
            })

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
