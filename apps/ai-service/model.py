"""
Modern floor plan segmentation model using pretrained encoders.
Supports CubiCasa5k-style architectures and standard segmentation models.
"""
import torch
import torch.nn as nn
import segmentation_models_pytorch as smp


def get_safe_device() -> str:
    """
    Check if CUDA is available and actually functional.
    Falls back to 'cpu' if a CUDA operation fails.
    """
    if not torch.cuda.is_available():
        return 'cpu'
    try:
        # Perform a quick verification to ensure the GPU/driver isn't glitched
        x = torch.zeros(1).cuda()
        y = x + 1
        torch.cuda.synchronize()
        del x, y
        return 'cuda'
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            f"⚠ Warning: CUDA is available but failed verification test: {e}. Falling back to 'cpu'."
        )
        return 'cpu'


class FloorPlanSegmentationModel:
    """
    Factory class for creating floor plan segmentation models.
    Supports multiple architectures with pretrained encoders.
    """
    
    @staticmethod
    def create_model(
        architecture: str = 'unet',
        encoder_name: str = 'resnet34',
        encoder_weights: str = 'imagenet',
        in_channels: int = 3,
        classes: int = 5,
        activation: str = None
    ) -> nn.Module:
        """
        Create a segmentation model for floor plan analysis.
        
        Args:
            architecture: Model architecture ('unet', 'unetplusplus', 'deeplabv3', 'fpn')
            encoder_name: Encoder backbone ('resnet34', 'resnet50', 'efficientnet-b0', etc.)
            encoder_weights: Pretrained weights ('imagenet', None for random init)
            in_channels: Number of input channels (3 for RGB)
            classes: Number of output classes (typically 5: background, wall, door, window, room)
            activation: Output activation ('sigmoid' for binary, 'softmax' for multi-class, None for logits)
        
        Returns:
            PyTorch model
        """
        architecture = architecture.lower()
        
        if architecture == 'unet':
            model = smp.Unet(
                encoder_name=encoder_name,
                encoder_weights=encoder_weights,
                in_channels=in_channels,
                classes=classes,
                activation=activation
            )
        elif architecture == 'unetplusplus':
            model = smp.UnetPlusPlus(
                encoder_name=encoder_name,
                encoder_weights=encoder_weights,
                in_channels=in_channels,
                classes=classes,
                activation=activation
            )
        elif architecture == 'deeplabv3':
            model = smp.DeepLabV3(
                encoder_name=encoder_name,
                encoder_weights=encoder_weights,
                in_channels=in_channels,
                classes=classes,
                activation=activation
            )
        elif architecture == 'fpn':
            model = smp.FPN(
                encoder_name=encoder_name,
                encoder_weights=encoder_weights,
                in_channels=in_channels,
                classes=classes,
                activation=activation
            )
        else:
            raise ValueError(f"Unknown architecture: {architecture}")
        
        return model


def load_pretrained_model(
    weights_path: str,
    architecture: str = 'unet',
    encoder_name: str = 'resnet34',
    num_classes: int = 5,
    device: str = None
) -> nn.Module:
    """
    Load a pretrained floor plan segmentation model.
    
    Args:
        weights_path: Path to model weights (.pth file)
        architecture: Model architecture
        encoder_name: Encoder backbone
        num_classes: Number of output classes
        device: Device to load model on
    
    Returns:
        Loaded model in evaluation mode
    """
    if device is None:
        device = get_safe_device()

    # Create model
    model = FloorPlanSegmentationModel.create_model(
        architecture=architecture,
        encoder_name=encoder_name,
        encoder_weights=None,  # We'll load our own weights
        in_channels=3,
        classes=num_classes,
        activation=None  # Output raw logits
    )
    
    # Load weights
    try:
        checkpoint = torch.load(weights_path, map_location=device)
        
        # Handle different checkpoint formats
        if isinstance(checkpoint, dict):
            if 'model_state_dict' in checkpoint:
                state_dict = checkpoint['model_state_dict']
            elif 'state_dict' in checkpoint:
                state_dict = checkpoint['state_dict']
            else:
                state_dict = checkpoint
        else:
            state_dict = checkpoint
        
        # Load state dict with strict=False to handle partial matches
        model.load_state_dict(state_dict, strict=False)
        print(f"✓ Loaded pretrained weights from {weights_path}")
        
    except Exception as e:
        print(f"⚠ Warning: Could not load pretrained weights: {e}")
        print("  Using model with ImageNet-pretrained encoder only")
        # Reinitialize with ImageNet weights as fallback
        model = FloorPlanSegmentationModel.create_model(
            architecture=architecture,
            encoder_name=encoder_name,
            encoder_weights='imagenet',
            in_channels=3,
            classes=num_classes,
            activation=None
        )
    
    model = model.to(device)
    model.eval()
    
    return model


# CubiCasa5k class mapping
CUBICASA_CLASSES = {
    0: 'background',
    1: 'wall',
    2: 'door',
    3: 'window',
    4: 'room'
}


if __name__ == '__main__':
    # Test model creation
    print("Testing model creation...")
    
    # Test 1: Create model with ImageNet pretrained encoder
    model = FloorPlanSegmentationModel.create_model(
        architecture='unet',
        encoder_name='resnet34',
        encoder_weights='imagenet',
        classes=5
    )
    print(f"✓ Created U-Net with ResNet34 encoder")
    
    # Test 2: Test forward pass
    dummy_input = torch.randn(1, 3, 512, 512)
    with torch.no_grad():
        output = model(dummy_input)
    print(f"✓ Forward pass successful: {dummy_input.shape} → {output.shape}")
    
    print("\nModel is ready for inference!")
