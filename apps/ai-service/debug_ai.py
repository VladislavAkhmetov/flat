import cv2
import numpy as np
import torch
import logging
import sys
from inference import FloorPlanInference
from model import load_pretrained_model
from weights_manager import get_model_weights

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def debug_ai():
    image_path = "C:/Users/amazi/.gemini/antigravity/brain/b44ca7c0-4a71-4f80-8663-0f476c0a98b0/uploaded_image_1769194205932.png"
    print(f"Debugging AI on {image_path}")
    
    # Simulate server loading
    with open(image_path, 'rb') as f:
        contents = f.read()
    
    nparr = np.frombuffer(contents, np.uint8)
    img_raw = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    
    if len(img_raw.shape) == 3 and img_raw.shape[2] == 4:
        print("Handling Alpha...")
        b, g, r, a = cv2.split(img_raw)
        overlay_color = [255, 255, 255] # White background
        
        bg = np.zeros((img_raw.shape[0], img_raw.shape[1], 3), dtype=np.uint8)
        bg[:] = overlay_color
        
        alpha = a.astype(float) / 255
        for i in range(3):
            # Same logic as server.py
            bg[:, :, i] = (1 - alpha) * bg[:, :, i] + alpha * img_raw[:, :, i]
            
        img = bg.astype(np.uint8) # Ensure uint8
    else:
        img = img_raw

    cv2.imwrite("debug_input.png", img) # Save what we are feeding the model

    # Load model
    try:
        weights_path = get_model_weights('cubicasa5k')
        print(f"Weights: {weights_path}")
        
        model = load_pretrained_model(
            weights_path=str(weights_path),
            architecture='unet',
            encoder_name='resnet34',
            num_classes=5
        )
        print("Model loaded")
    except Exception as e:
        print(f"Failed to load model: {e}")
        return

    # Inference pipeline
    pipeline = FloorPlanInference(model=model, input_size=512)
    
    # Run preprocess manually to check
    tensor, sizes = pipeline.preprocess_image(img)
    print(f"Tensor shape: {tensor.shape}")
    print(f"Sizes: {sizes}")
    
    # Run prediction
    with torch.no_grad():
        output = model(tensor)
        print(f"Output shape: {output.shape}")
        
        # Softmax
        probs = torch.softmax(output, dim=1)
        pred_mask = torch.argmax(probs, dim=1).cpu().numpy()[0]
        
    print(f"Predicted mask shape: {pred_mask.shape}")
    unique_classes = np.unique(pred_mask)
    print(f"Unique classes found: {unique_classes}")
    
    # Check wall class (1)
    wall_pixels = np.sum(pred_mask == 1)
    print(f"Wall pixels (class 1): {wall_pixels}")
    
    # Save mask
    debug_mask = (pred_mask * 50).astype(np.uint8) # Scale 0-4 to 0-200
    cv2.imwrite("debug_mask.png", debug_mask)
    print("Saved debug_mask.png")
    
    # Run full pipeline extraction
    result = pipeline(img, snap_angles=True)
    print(f"Pipeline result: {result['num_walls']} walls")

if __name__ == "__main__":
    debug_ai()
