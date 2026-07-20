"""
YOLOv8 Furniture Detection Training Script.
This script supports downloading a dataset from Roboflow Universe and training locally,
or outputs a 1-click Google Colab template to train in the cloud for free.
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
    """Outputs a copy-pasteable Python code block for Google Colab."""
    print("=" * 80)
    print("⭐ GOOGLE COLAB 1-CLICK FREE TRAINING TEMPLATE FOR FURNITURE ⭐")
    print("=" * 80)
    print("""
Copy and paste the following code block into a Google Colab notebook
(Make sure to change the Runtime Type to GPU: Runtime -> Change runtime type -> T4 GPU):

```python
# 1. Install ultralytics and roboflow
!pip install ultralytics roboflow

# 2. Download high-quality floor plan furniture dataset from Roboflow Universe
from roboflow import Roboflow
rf = Roboflow(api_key="YOUR_ROBOFLOW_API_KEY") # Get your free API key at roboflow.com

# We recommend this high-quality floor plan furniture dataset, or choose your own from:
# https://universe.roboflow.com/search?q=marketing+floor+plan+furniture
project = rf.workspace("architectural-elements").project("furniture-floorplans")
dataset = project.version(1).download("yolov8")

# 3. Train YOLOv8 on the dataset
from ultralytics import YOLO

# Load pre-trained base object detection model
model = YOLO('yolov8n.pt')

# Train for 50 epochs (takes ~15 mins on Google Colab T4 GPU)
results = model.train(
    data=f"{dataset.location}/data.yaml",
    epochs=50,
    imgsz=640,
    batch=16,
    device=0
)

# 4. Zip and download your trained model
import shutil
shutil.make_archive('yolov8_furniture', 'zip', 'runs/detect/train/weights')
print("✅ Training complete! Download 'yolov8_furniture.zip' from the files panel,")
print("extract it, and copy 'best.pt' to your apps/ai-service/weights/marketing_furniture.pt")
```
""")
    print("=" * 80)


def main():
    parser = argparse.ArgumentParser(description="Train YOLOv8 on Floor Plan Furniture")
    parser.add_argument("--colab", action="store_true", help="Print copy-pasteable Google Colab template")
    parser.add_argument("--api_key", type=str, default="", help="Roboflow API key (optional)")
    parser.add_argument("--workspace", type=str, default="architectural-elements", help="Roboflow Workspace ID")
    parser.add_argument("--project", type=str, default="furniture-floorplans", help="Roboflow Project ID")
    parser.add_argument("--version", type=int, default=1, help="Roboflow Project Version ID")
    parser.add_argument("--data", type=str, default="", help="Path to data.yaml for local training (skip download)")
    parser.add_argument("--epochs", type=int, default=30, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=8, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    args = parser.parse_args()

    # If --colab is specified or no arguments are provided, show Colab guide
    if args.colab or (len(sys.argv) == 1 and not args.data and not args.api_key):
        setup_colab_template()
        print("\n💡 Tip: Run with --api_key <your_key> to start downloading and training locally.")
        print("💡 Tip: Or run with --data <path/to/data.yaml> to train locally on an already downloaded dataset.")
        return

    dataset_yaml_path = None

    # Handle Roboflow download if API key is provided
    if args.api_key:
        try:
            from roboflow import Roboflow
            print("📥 Connecting to Roboflow...")
            rf = Roboflow(api_key=args.api_key)
            project = rf.workspace(args.workspace).project(args.project)
            print(f"📥 Downloading dataset '{args.project}' version {args.version} in yolov8 format...")
            dataset = project.version(args.version).download("yolov8")
            dataset_yaml_path = Path(dataset.location) / "data.yaml"
        except ImportError:
            print("❌ Error: 'roboflow' package is required to download datasets.")
            print("Please install it using: pip install roboflow")
            return
        except Exception as e:
            print(f"❌ Roboflow download failed: {e}")
            return
    elif args.data:
        dataset_yaml_path = Path(args.data)

    if not dataset_yaml_path or not dataset_yaml_path.exists():
        print(f"❌ Error: Dataset config file not found or not specified.")
        return

    print("📦 Initializing YOLOv8 Object Detection Training...")
    device = 0 if torch.cuda.is_available() else "cpu"
    print(f"   Device: {'GPU (cuda:0)' if device == 0 else 'CPU (Slow - recommended to use Google Colab!)'}")

    # Load base model (downloads automatically if not present)
    print("📥 Loading base yolov8n.pt model...")
    model = YOLO('yolov8n.pt')

    print(f"🚀 Starting training on '{dataset_yaml_path}' for {args.epochs} epochs...")
    try:
        model.train(
            data=str(dataset_yaml_path.absolute()),
            epochs=args.epochs,
            imgsz=args.imgsz,
            batch=args.batch,
            device=device,
            project="floor_plan_furniture",
            name="detection"
        )
        print("\n✅ Local training complete!")
        
        # Copy the best weights to our weights directory
        best_weights_src = Path("floor_plan_furniture/detection/weights/best.pt")
        target_dir = Path(__file__).parent / "weights"
        target_dir.mkdir(exist_ok=True)
        best_weights_target = target_dir / "marketing_furniture.pt"
        
        if best_weights_src.exists():
            import shutil
            shutil.copy(str(best_weights_src), str(best_weights_target))
            print(f"🎉 Successfully copied trained model to: {best_weights_target}")
        else:
            print(f"⚠ Could not locate trained weights at {best_weights_src}")
            print(f"Please find 'best.pt' and copy it to: {best_weights_target}")
            
    except Exception as e:
        print(f"❌ Training failed: {e}")


if __name__ == "__main__":
    main()
