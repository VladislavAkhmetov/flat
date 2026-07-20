"""
Floor Plan Wall Segmentation YOLOv8-seg Training Script.
This script provides local training and Google Colab instructions to train
a custom wall segmentation model using YOLOv8-seg.
"""
import os
import sys
import argparse
from pathlib import Path

try:
    import torch
    from ultralytics import YOLO
except ImportError:
    print("❌ Error: 'torch' and 'ultralytics' packages are required.")
    print("Please install them using: pip install torch torchvision ultralytics")
    sys.exit(1)


def setup_colab_template():
    """Outputs a clean, copy-pasteable Python code block for Google Colab."""
    print("=" * 80)
    print("⭐ GOOGLE COLAB 1-CLICK FREE TRAINING TEMPLATE ⭐")
    print("=" * 80)
    print("""
Copy and paste the following code block into a Google Colab notebook
(Make sure to change the Runtime Type to GPU: Runtime -> Change runtime type -> T4 GPU):

```python
# 1. Install ultralytics and roboflow
!pip install ultralytics roboflow

# 2. Download high-quality floor plan segmentation dataset from Roboflow Universe
from roboflow import Roboflow
rf = Roboflow(api_key="YOUR_ROBOFLOW_API_KEY") # Get a free API key at roboflow.com
project = rf.workspace("floorplans").project("floor-plan-segmentation-qfdrq")
dataset = project.version(1).download("yolov8")

# 3. Train YOLOv8-seg on the dataset
from ultralytics import YOLO

# Load pre-trained base segmentation model
model = YOLO('yolov8n-seg.pt')

# Train for 50 epochs (takes ~15-20 mins on T4 GPU)
results = model.train(
    data=f"{dataset.location}/data.yaml",
    epochs=50,
    imgsz=640,
    batch=16,
    device=0
)

# 4. Zip and download your trained model
import shutil
shutil.make_archive('yolov8_walls_seg', 'zip', 'runs/segment/train/weights')
print("✅ Training complete! Download 'yolov8_walls_seg.zip' from the files panel,")
print("extract it, and copy 'best.pt' to your apps/ai-service/weights/yolov8_walls_seg.pt")
```
""")
    print("=" * 80)


def main():
    parser = argparse.ArgumentParser(description="Train YOLOv8-seg on Floor Plan Walls")
    parser.add_argument("--colab", action="store_true", help="Print copy-pasteable Google Colab template")
    parser.add_argument("--data", type=str, default="", help="Path to data.yaml dataset config file for local training")
    parser.add_argument("--epochs", type=int, default=30, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=8, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    args = parser.parse_args()

    # If --colab is specified or no arguments are provided, show Colab guide
    if args.colab or (len(sys.argv) == 1 and not args.data):
        setup_colab_template()
        print("\n💡 Tip: Run with --data <path/to/data.yaml> to start training locally.")
        return

    # Local training path
    if args.data:
        yaml_path = Path(args.data)
        if not yaml_path.exists():
            print(f"❌ Error: Dataset config file not found at '{args.data}'")
            return

        print("📦 Initializing YOLOv8-seg Wall Segmentation Training...")
        device = 0 if torch.cuda.is_available() else "cpu"
        print(f"   Device: {'GPU (cuda:0)' if device == 0 else 'CPU (Slow - recommended to use Google Colab!)'}")

        # Load base model (downloads automatically if not present)
        print("📥 Loading base yolov8n-seg.pt model...")
        model = YOLO('yolov8n-seg.pt')

        print(f"🚀 Starting training on '{args.data}' for {args.epochs} epochs...")
        try:
            model.train(
                data=str(yaml_path.absolute()),
                epochs=args.epochs,
                imgsz=args.imgsz,
                batch=args.batch,
                device=device,
                project="floor_plan_walls",
                name="segmentation"
            )
            print("\n✅ Local training complete!")
            print("Please copy the trained weights from:")
            print("   floor_plan_walls/segmentation/weights/best.pt")
            print("to:")
            print("   apps/ai-service/weights/yolov8_walls_seg.pt")
        except Exception as e:
            print(f"❌ Training failed: {e}")


if __name__ == "__main__":
    main()
