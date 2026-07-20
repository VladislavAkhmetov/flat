import cv2
import numpy as np
from furniture_detection import FurnitureDetector
from server import opencv_fallback

def inspect():
    print("🔍 Inspecting test_flat.png...")
    img = cv2.imread(r"D:\dev\flat\test_flat.png")
    if img is None:
        print("❌ Could not read image at D:\\dev\\flat\\test_flat.png")
        return
        
    print(f"✓ Read image successfully. Dimensions: {img.shape}")
    
    # 1. Run OpenCV fallback
    print("\n--- OpenCV Fallback Walls ---")
    res_walls = opencv_fallback(img)
    print(f"Extracted {len(res_walls['walls'])} walls.")
    for i, w in enumerate(res_walls['walls'][:10]):
        print(f"  Wall {i}: start={w['start']}, end={w['end']}, thickness={w['thickness']:.2f}")
        
    # 2. Run Furniture detector
    print("\n--- YOLOv8 Furniture Detections ---")
    detector = FurnitureDetector()
    furniture = detector.detect(img)
    print(f"Detected {len(furniture)} furniture items:")
    for f in furniture:
        print(f"  ID: {f['id']} | Center: ({f['x']:.1f}, {f['y']:.1f}) | Size: {f['width']:.1f}x{f['height']:.1f} | Conf: {f['confidence']:.3f}")

if __name__ == '__main__':
    inspect()
