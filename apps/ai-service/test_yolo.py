import cv2
import sys
import numpy as np
import logging
from furniture_detection import FurnitureDetector

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_yolo():
    image_path = "C:/Users/amazi/.gemini/antigravity/brain/b44ca7c0-4a71-4f80-8663-0f476c0a98b0/uploaded_image_1769192680801.png"
    print(f"Testing YOLO on {image_path}")
    
    img = cv2.imread(image_path)
    if img is None:
        print("Failed to load image")
        return

    detector = FurnitureDetector()
    
    # Run detection
    if detector.model:
        # Run raw model to see ALL results
        results = detector.model(img)
        print("\n--- Raw Detections ---")
        for r in results:
            for box in r.boxes:
                print(f"Class: {box.cls[0]} ({detector.model.names[int(box.cls[0])]}), Conf: {box.conf[0]:.2f}")

    # Run our filtered detection
    print("\n--- Filtered Results ---")
    items = detector.detect(img)
    print(f"Found {len(items)} items:")
    for item in items:
        print(item)

if __name__ == "__main__":
    test_yolo()
