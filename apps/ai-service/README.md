# AI Service - Floor Plan Wall Detection

AI microservice for automatic wall detection on floor plan images using pretrained deep learning models.

## Features

- **Pretrained Model**: Uses CubiCasa5k-compatible architecture with ResNet34 encoder
- **Auto-download Weights**: Automatically downloads pretrained weights from Google Drive
- **Robust Fallback**: Falls back to OpenCV HoughLines if model fails
- **Modern Architecture**: Built with FastAPI and segmentation-models-pytorch
- **GPU Support**: CUDA-accelerated inference (tested on GTX 1050 Ti 4GB)

## Installation

```powershell
# Install dependencies
py -m pip install -r requirements.txt
```

## Usage

### Start Server

```powershell
py server.py
```

Server runs on `http://localhost:5000`

### API Endpoint

**POST /process-plan**

Upload a floor plan image and get detected walls.

```bash
curl -X POST -F "file=@plan.png" http://localhost:5000/process-plan
```

Response:
```json
{
  "walls": [
    {"start": {"x": 100, "y": 200}, "end": {"x": 500, "y": 200}},
    ...
  ],
  "image_width": 3250,
  "image_height": 3215,
  "num_walls": 15
}
```

## Architecture

- **Model**: U-Net with ResNet34 encoder
- **Input Size**: 512x512 (auto-resized)
- **Output Classes**: Background, Wall, Door, Window, Room
- **Post-processing**: Morphological operations, contour extraction, angle snapping

## Files

- `server.py` - FastAPI server
- `model.py` - Model architecture definitions
- `inference.py` - Complete inference pipeline
- `weights_manager.py` - Auto-download pretrained weights
- `requirements.txt` - Python dependencies

## Testing

Test weight download:
```powershell
py weights_manager.py
```

Test model creation:
```powershell
py model.py
```

## Notes

- First run will download ~100MB of pretrained weights
- If CubiCasa5k weights fail, uses ImageNet-pretrained encoder
- OpenCV fallback always available if AI fails
