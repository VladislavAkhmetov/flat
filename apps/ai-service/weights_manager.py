"""
Weight manager for automatic download and caching of pretrained model weights.
"""
import os
import gdown
from pathlib import Path

# Model configurations
MODEL_CONFIGS = {
    'cubicasa5k': {
        'gdrive_id': '1gRB7ez1e4H7a9Y09lLqRuna0luZO5VRK',
        'filename': 'cubicasa5k_model.pth',
        'description': 'CubiCasa5k pretrained model (unofficial checkpoint)'
    },
    'resnet34_unet': {
        'url': 'https://github.com/qubvel/segmentation_models.pytorch/releases/download/v0.2.0/unet_resnet34_imagenet.pth',
        'filename': 'resnet34_unet_imagenet.pth',
        'description': 'ResNet34 U-Net pretrained on ImageNet (fallback)'
    }
}

WEIGHTS_DIR = Path(__file__).parent / 'weights'


def ensure_weights_dir():
    """Create weights directory if it doesn't exist."""
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    return WEIGHTS_DIR


def download_from_gdrive(file_id: str, output_path: Path, quiet: bool = False) -> bool:
    """
    Download file from Google Drive.
    
    Args:
        file_id: Google Drive file ID
        output_path: Path to save the downloaded file
        quiet: If True, suppress download progress
    
    Returns:
        True if successful, False otherwise
    """
    try:
        print(f"Downloading from Google Drive (ID: {file_id})...")
        gdown.download(id=file_id, output=str(output_path), quiet=quiet)
        
        if output_path.exists() and output_path.stat().st_size > 0:
            print(f"✓ Successfully downloaded to {output_path}")
            return True
        else:
            print(f"✗ Download failed or file is empty")
            return False
    except Exception as e:
        print(f"✗ Error downloading from Google Drive: {e}")
        return False


def download_from_url(url: str, output_path: Path) -> bool:
    """
    Download file from direct URL.
    
    Args:
        url: Direct download URL
        output_path: Path to save the downloaded file
    
    Returns:
        True if successful, False otherwise
    """
    try:
        import urllib.request
        print(f"Downloading from {url}...")
        urllib.request.urlretrieve(url, output_path)
        
        if output_path.exists() and output_path.stat().st_size > 0:
            print(f"✓ Successfully downloaded to {output_path}")
            return True
        else:
            print(f"✗ Download failed or file is empty")
            return False
    except Exception as e:
        print(f"✗ Error downloading from URL: {e}")
        return False


def get_model_weights(model_name: str = 'cubicasa5k', force_download: bool = False) -> Path:
    """
    Get model weights, downloading if necessary.
    
    Args:
        model_name: Name of the model configuration
        force_download: If True, re-download even if file exists
    
    Returns:
        Path to the model weights file
    
    Raises:
        ValueError: If model_name is not recognized
        RuntimeError: If download fails
    """
    if model_name not in MODEL_CONFIGS:
        raise ValueError(f"Unknown model: {model_name}. Available: {list(MODEL_CONFIGS.keys())}")
    
    config = MODEL_CONFIGS[model_name]
    weights_dir = ensure_weights_dir()
    weights_path = weights_dir / config['filename']
    
    # Check if weights already exist
    if weights_path.exists() and not force_download:
        print(f"✓ Using cached weights: {weights_path}")
        return weights_path
    
    # Download weights
    print(f"Downloading {config['description']}...")
    
    success = False
    if 'gdrive_id' in config:
        success = download_from_gdrive(config['gdrive_id'], weights_path, quiet=False)
    elif 'url' in config:
        success = download_from_url(config['url'], weights_path)
    
    if not success:
        raise RuntimeError(f"Failed to download weights for {model_name}")
    
    return weights_path


if __name__ == '__main__':
    # Test weight download
    print("Testing weight manager...")
    try:
        weights_path = get_model_weights('cubicasa5k')
        print(f"\n✓ Weights ready at: {weights_path}")
        print(f"  File size: {weights_path.stat().st_size / (1024**2):.2f} MB")
    except Exception as e:
        print(f"\n✗ Error: {e}")
        print("\nTrying fallback model...")
        try:
            weights_path = get_model_weights('resnet34_unet')
            print(f"✓ Fallback weights ready at: {weights_path}")
        except Exception as e2:
            print(f"✗ Fallback also failed: {e2}")
