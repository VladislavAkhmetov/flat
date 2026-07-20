import os
from PIL import Image
import torch
from torch.utils.data import Dataset
import numpy as np

class WallDataset(Dataset):
    def __init__(self, images_dir, masks_dir, transform=None, scale=0.5):
        self.images_dir = images_dir
        self.masks_dir = masks_dir
        self.transform = transform
        self.scale = scale
        self.ids = [os.path.splitext(file)[0] for file in os.listdir(images_dir) if not file.startswith('.')]

    def __len__(self):
        return len(self.ids)

    def __getitem__(self, idx):
        name = self.ids[idx]
        mask_file = list(filter(lambda x: x.startswith(name), os.listdir(self.masks_dir)))[0]
        img_file = list(filter(lambda x: x.startswith(name), os.listdir(self.images_dir)))[0]

        mask_path = os.path.join(self.masks_dir, mask_file)
        img_path = os.path.join(self.images_dir, img_file)

        img = Image.open(img_path)
        mask = Image.open(mask_path)

        assert img.size == mask.size, \
            f'Image and mask {name} should be the same size, but are {img.size} and {mask.size}'

        img = self.preprocess(img, self.scale)
        mask = self.preprocess(mask, self.scale, is_mask=True)

        return {
            'image': torch.from_numpy(img).type(torch.FloatTensor),
            'mask': torch.from_numpy(mask).type(torch.LongTensor)
        }

    def preprocess(self, pil_img, scale, is_mask=False):
        w, h = pil_img.size
        newW, newH = int(scale * w), int(scale * h)
        assert newW > 0 and newH > 0, 'Scale is too small, resized images would have no pixel'
        
        pil_img = pil_img.resize((newW, newH), resample=Image.NEAREST if is_mask else Image.BICUBIC)
        img_ndarray = np.asarray(pil_img)

        if not is_mask:
            if img_ndarray.ndim == 2:
                img_ndarray = img_ndarray[np.newaxis, ...]
            else:
                img_ndarray = img_ndarray.transpose((2, 0, 1))

            img_ndarray = img_ndarray / 255
        else:
             # Assuming mask is 0 or 255, normalize to 0 or 1
             # If using multiclass, logic would be different
            img_ndarray = img_ndarray / 255

        return img_ndarray
