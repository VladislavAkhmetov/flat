"""
Smoke-test wall recognition pipeline on a local floor-plan image (no HTTP server).

Usage:
  py smoke_recognition.py path/to/plan.png
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np


def main():
    if len(sys.argv) < 2:
        print("Usage: py smoke_recognition.py <image>")
        sys.exit(2)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"File not found: {path}")
        sys.exit(1)

    contents = path.read_bytes()
    print(f"Loading {path} ({len(contents)} bytes)")

    # Import after path check so missing deps show clearly
    from server import _process_plan_sync

    result = _process_plan_sync(contents, custom_threshold=None, grayscale=None, contrast=None)

    walls = result.get("walls", [])
    furniture = result.get("furniture", [])
    print("--- RESULT ---")
    print(f"method: {result.get('method')}")
    print(f"style:  {result.get('style')}")
    print(f"walls:  {len(walls)}")
    print(f"furn:   {len(furniture)}")
    print(f"size:   {result.get('image_width')}x{result.get('image_height')}")
    print(f"ppm:    {result.get('px_per_meter')}")
    print(f"scale:  {result.get('scale_source')}")

    # Sanity checks for marketing plans
    w = result.get("image_width") or 1
    h = result.get("image_height") or 1
    margin = 0.02
    outside = 0
    for wall in walls:
        for key in ("start", "end"):
            x, y = wall[key]["x"], wall[key]["y"]
            if x < -margin * w or y < -margin * h or x > w * (1 + margin) or y > h * (1 + margin):
                outside += 1
    print(f"endpoints outside canvas: {outside}")

    furn_outside = 0
    for f in furniture:
        x, y = f.get("x", 0), f.get("y", 0)
        if x < 0 or y < 0 or x > w or y > h:
            furn_outside += 1
    print(f"furniture outside canvas: {furn_outside}")

    out_json = path.with_suffix(".smoke.json")
    # Compact dump without huge style_metrics noise optional
    dump = {
        "method": result.get("method"),
        "style": result.get("style"),
        "num_walls": len(walls),
        "num_furniture": len(furniture),
        "image_width": result.get("image_width"),
        "image_height": result.get("image_height"),
        "px_per_meter": result.get("px_per_meter"),
        "walls": walls[:80],
        "furniture": furniture[:40],
    }
    out_json.write_text(json.dumps(dump, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out_json}")

    # Overlay preview
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is not None:
        if max(img.shape[:2]) > 1500:
            s = 1500 / max(img.shape[:2])
            img = cv2.resize(img, None, fx=s, fy=s)
        overlay = img.copy()
        for wall in walls:
            p1 = (int(wall["start"]["x"]), int(wall["start"]["y"]))
            p2 = (int(wall["end"]["x"]), int(wall["end"]["y"]))
            cv2.line(overlay, p1, p2, (0, 0, 255), 2)
        for f in furniture:
            cv2.circle(overlay, (int(f["x"]), int(f["y"])), 6, (0, 200, 0), -1)
        out_png = path.with_name(path.stem + "_smoke_overlay.png")
        cv2.imwrite(str(out_png), overlay)
        print(f"Wrote {out_png}")

    # Soft pass criteria
    ok = len(walls) >= 4 and len(walls) < 200 and outside == 0
    print("PASS" if ok else "WARN — inspect overlay")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
