import argparse
import logging
import os
import sys
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch import optim
from torch.utils.data import DataLoader, random_split
from tqdm import tqdm
from pathlib import Path

from dataset import WallDataset
from model import UNet

# 4GB VRAM Optimization: Mixed Precision
from torch.cuda.amp import GradScaler, autocast

def train_net(net, device, epochs=5, batch_size=1, learning_rate=1e-5, val_percent=0.1, save_cp=True, img_scale=0.5):
    # 1. Create dataset
    try:
        dataset = WallDataset('./data/images', './data/masks', scale=img_scale)
    except Exception as e:
        logging.error(f'Error loading dataset: {e}')
        logging.info('Please create ./data/images and ./data/masks directories with training data')
        return

    # 2. Split into train / validation partitions
    n_val = int(len(dataset) * val_percent)
    n_train = len(dataset) - n_val
    train_set, val_set = random_split(dataset, [n_train, n_val], generator=torch.Generator().manual_seed(0))

    # 3. Create data loaders
    loader_args = dict(batch_size=batch_size, num_workers=2, pin_memory=True)
    train_loader = DataLoader(train_set, shuffle=True, **loader_args)
    val_loader = DataLoader(val_set, shuffle=False, drop_last=True, **loader_args)

    logging.info(f'''Starting training:
        Epochs:          {epochs}
        Batch size:      {batch_size}
        Learning rate:   {learning_rate}
        Training size:   {n_train}
        Validation size: {n_val}
        Checkpoints:     {save_cp}
        Device:          {device.type}
        Images scaling:  {img_scale}
    ''')
    
    # 4. Set up optimizer, loss, scalar
    optimizer = optim.RMSprop(net.parameters(), lr=learning_rate, weight_decay=1e-8, momentum=0.9)
    # scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, 'max', patience=2)  # goal: maximize Dice score
    criterion = nn.CrossEntropyLoss()
    scaler = GradScaler() # For Mixed Precision (AMP)

    global_step = 0

    # 5. Begin training
    for epoch in range(epochs):
        net.train()
        epoch_loss = 0
        with tqdm(total=n_train, desc=f'Epoch {epoch + 1}/{epochs}', unit='img') as pbar:
            for batch in train_loader:
                images = batch['image']
                true_masks = batch['mask']

                assert images.shape[1] == net.n_channels, \
                    f'Network has been defined with {net.n_channels} input channels, ' \
                    f'but loaded images have {images.shape[1]} channels. Please check that ' \
                    'the images are loaded correctly.'

                images = images.to(device=device, dtype=torch.float32)
                true_masks = true_masks.to(device=device, dtype=torch.long)

                # Use autocast for mixed precision
                with autocast():
                    masks_pred = net(images)
                    loss = criterion(masks_pred, true_masks)

                optimizer.zero_grad(set_to_none=True)
                scaler.scale(loss).backward()
                scaler.step(optimizer)
                scaler.update()

                pbar.update(images.shape[0])
                global_step += 1
                epoch_loss += loss.item()
                pbar.set_postfix(**{'loss (batch)': loss.item()})

        if save_cp:
            Path('./checkpoints/').mkdir(parents=True, exist_ok=True)
            torch.save(net.state_dict(), f'./checkpoints/checkpoint_epoch{epoch + 1}.pth')
            logging.info(f'Checkpoint {epoch + 1} saved!')

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    logging.info(f'Using device {device}')

    # Change here to adapt to your data
    # n_channels=3 for RGB images
    # n_classes=2 for binary segmentation (background, wall)
    net = UNet(n_channels=3, n_classes=2, bilinear=False)
    net.to(device=device)

    try:
        train_net(net=net, device=device, epochs=5, batch_size=2, img_scale=0.5)
    except KeyboardInterrupt:
        torch.save(net.state_dict(), 'INTERRUPTED.pth')
        logging.info('Saved interrupt checkpoint')
        sys.exit(0)
