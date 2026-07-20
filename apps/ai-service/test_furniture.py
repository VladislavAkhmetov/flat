import cv2
import sys
import numpy as np
import logging
from pathlib import Path
from furniture_detection import FurnitureDetector, resolve_catalog_id_from_name

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_detector():
    logger.info("🧪 Testing Furniture Detector & Dynamic Catalog Mapping...")
    
    # 1. Test resolving catalog IDs from different possible class names
    test_names = [
        # Standard names from SamirShabani
        ("sofa", "sofa_3"),
        ("gas stove", "stove"),
        ("refrigerator", "refrigerator"),
        ("bed", "bed_double"),
        ("chair", "armchair"),
        ("table", "table_dining"),
        ("toilet", "toilet"),
        ("sink", "sink"),
        ("bath tub", "bath"),
        # Other potential Roboflow class names
        ("dining table", "table_dining"),
        ("desk", "table_dining"),
        ("couch", "sofa_3"),
        ("double bed", "bed_double"),
        ("arm chair", "armchair"),
        ("wc", "toilet"),
        ("washbasin", "sink"),
        ("wardrobe", "wardrobe"),
        ("kitchen counter", "kitchen_module"),
        # Enriched catalog items
        ("single bed", "bed_single"),
        ("sofa 2", "sofa_2"),
        ("loveseat", "sofa_2"),
        ("sofa2", "sofa_corner"),
        ("corner sofa", "sofa_corner"),
        ("sink4", "sink_kitchen"),
        ("office chair", "chair_office"),
        ("kitchen sink", "sink_kitchen"),
        ("unknown_item", None)
    ]
    
    logger.info("\n--- Testing resolve_catalog_id_from_name ---")
    all_passed = True
    for input_name, expected in test_names:
        result = resolve_catalog_id_from_name(input_name)
        passed = result == expected
        logger.info(f"Input: '{input_name:<16}' | Expected: '{str(expected):<15}' | Result: '{str(result):<15}' | {'✅ PASS' if passed else '❌ FAIL'}")
        if not passed:
            all_passed = False
            
    if all_passed:
        logger.info("✓ resolve_catalog_id_from_name tests PASSED!")
    else:
        logger.warning("⚠ Some resolve_catalog_id_from_name mappings did not match expected values.")

    # 2. Instantiate detector
    logger.info("\n--- Loading FurnitureDetector ---")
    detector = FurnitureDetector()
    if detector.model is None:
        logger.error("❌ Failed to load FurnitureDetector model!")
        return

    # 3. Find a test image
    logger.info("\n--- Running Detection on Sample Floor Plans ---")
    examples_dir = Path(__file__).parent.parent.parent / "flat plans examples"
    if not examples_dir.exists():
        logger.warning(f"⚠ 'flat plans examples' directory not found at {examples_dir}. Creating empty mock image for testing.")
        # Create a mock white image for testing the pipeline execution
        img = np.ones((500, 500, 3), dtype=np.uint8) * 255
        # Draw some dark shapes to mock furniture
        cv2.rectangle(img, (100, 100), (200, 150), (50, 50, 50), -1)
        cv2.rectangle(img, (300, 300), (350, 450), (100, 100, 100), -1)
        test_images = [("mock_image.png", img)]
    else:
        test_images = []
        for file in examples_dir.glob("*.png"):
            img = cv2.imread(str(file))
            if img is not None:
                test_images.append((file.name, img))
                if len(test_images) >= 2: # Test up to 2 images
                    break

    if not test_images:
        logger.error("❌ No test images could be loaded!")
        return

    # Run detection
    for name, img in test_images:
        logger.info(f"\nProcessing image: {name} (shape: {img.shape})")
        
        # Test raw detections (all classes found by YOLO)
        try:
            results = detector.model(img, verbose=False)
            logger.info("  Raw YOLO classes detected in image:")
            found_any_raw = False
            for r in results:
                for box in r.boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    class_name = detector.model.names[cls_id]
                    logger.info(f"    - Class: {cls_id} ({class_name}), Conf: {conf:.2f}")
                    found_any_raw = True
            if not found_any_raw:
                logger.info("    - No objects detected by raw model.")
        except Exception as e:
            logger.error(f"  Error running raw model inference: {e}")

        # Test filtered & mapped catalog items
        try:
            items = detector.detect(img)
            logger.info(f"  Detected & Catalog-Mapped items ({len(items)}):")
            for item in items:
                logger.info(f"    - ID: {item['id']:<15} | Center: ({item['x']:.1f}, {item['y']:.1f}) | Size: {item['width']:.1f}x{item['height']:.1f} | Conf: {item['confidence']:.2f}")
        except Exception as e:
            logger.error(f"  Error running filtered detection: {e}")

    logger.info("\n✅ Verification complete!")

if __name__ == "__main__":
    test_detector()
