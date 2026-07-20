import argparse
import logging
import os
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from torchvision import transforms
from model import UNet

def predict_img(net, full_img, device, scale_factor=0.5, out_threshold=0.5):
    net.eval()
    img = torch.from_numpy(BasicDataset.preprocess(full_img, scale_factor, is_mask=False))
    img = img.unsqueeze(0)
    img = img.to(device=device, dtype=torch.float32)

    with torch.no_grad():
        output = net(img)

        # For binary segmentation, we often use 2 output classes (bg, fg) and Softmax or CrossEntropy
        # Or 1 output class and Sigmoid.
        # Here assuming 2 classes (CrossEntropy training)
        if net.n_classes > 1:
            probs = F.softmax(output, dim=1)[0]
        else:
            probs = torch.sigmoid(output)[0]

        tf = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((full_img.size[1], full_img.size[0]), transforms.InterpolationMode.NEAREST),
            transforms.ToTensor()
        ])

        full_mask = tf(probs.cpu()).squeeze()
    
    if net.n_classes > 1:
        return full_mask[1] > out_threshold # Return mask for class 1 (Wall)
    else:
        return full_mask > out_threshold

# Helper because we didn't import dataset.py fully due to execution context
class BasicDataset:
    @classmethod
    def preprocess(cls, pil_img, scale, is_mask):
        w, h = pil_img.size
        newW, newH = int(scale * w), int(scale * h)
        assert newW > 0 and newH > 0, 'Scale is too small'
        pil_img = pil_img.resize((newW, newH), resample=Image.NEAREST if is_mask else Image.BICUBIC)
        img_ndarray = np.asarray(pil_img)
        if not is_mask:
            if img_ndarray.ndim == 2:
                img_ndarray = img_ndarray[np.newaxis, ...]
            else:
                img_ndarray = img_ndarray.transpose((2, 0, 1))
            img_ndarray = img_ndarray / 255
        return img_ndarray

def get_args():
    parser = argparse.ArgumentParser(description='Predict masks from input images')
    parser.add_argument('--model', '-m', default='MODEL.pth', metavar='FILE', help='Specify the file in which the model is stored')
    parser.add_argument('--input', '-i', metavar='INPUT', nargs='+', help='Filenames of input images', required=True)
    parser.add_argument('--output', '-o', metavar='OUTPUT', nargs='+', help='Filenames of output images')
    parser.add_argument('--viz', '-v', action='store_true', help='Visualize the images as they are processed')
    parser.add_argument('--no-save', '-n', action='store_true', help='Do not save the output masks')
    parser.add_argument('--mask-threshold', '-t', type=float, default=0.5, help='Minimum probability value to consider a mask pixel white')
    parser.add_argument('--scale', '-s', type=float, default=0.5, help='Scale factor for the input images')
    parser.add_argument('--bilinear', action='store_true', default=False, help='Use bilinear upsampling') 
    return parser.parse_args()

if __name__ == '__main__':
    args = get_args()
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    
    in_files = args.input
    out_files = args.output

    if not args.output:
        out_files = [os.path.splitext(f)[0] + '_mask.png' for f in in_files]

    net = UNet(n_channels=3, n_classes=2, bilinear=args.bilinear)

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    logging.info(f'Loading model {args.model}')
    logging.info(f'Using device {device}')

    try:
        net.load_state_dict(torch.load(args.model, map_location=device))
        logging.info('Model loaded!')
    except FileNotFoundError:
        logging.error(f'Model file {args.model} not found! Please train it first or download weights.')
        exit(1)

    net.to(device=device)

    for i, fn in enumerate(in_files):
        logging.info(f'\nPredicting image {fn} ...')
        img = Image.open(fn)

        mask = predict_img(net=net,
                           full_img=img,
                           scale_factor=args.scale,
                           out_threshold=args.mask_threshold,
                           device=device)

        if not args.no_save:
            out_fn = out_files[i]
            result = mask_to_image(mask)
            result.save(out_files[i])
            logging.info(f'Mask saved to {out_files[i]}')

def mask_to_image(mask: np.ndarray):
    if isinstance(mask, torch.Tensor):
        mask = mask.numpy()
    return Image.fromarray((mask * 255).astype(np.uint8))
