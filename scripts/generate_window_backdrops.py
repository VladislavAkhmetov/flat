import os
import sys
import math
import numpy as np
import cv2

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

DIRS = [
    os.path.abspath(r"D:\dev\flat\assets\backgrounds"),
    os.path.abspath(r"D:\dev\flat\apps\widget-frontend\public\backgrounds"),
    os.path.abspath(r"D:\dev\flat\apps\api-backend\uploads\backgrounds")
]

for d in DIRS:
    os.makedirs(d, exist_ok=True)

W, H = 2048, 1024


def save_to_all(img_bgr, filename):
    for d in DIRS:
        p = os.path.join(d, filename)
        cv2.imwrite(p, img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
        print(f"✓ Saved {filename} to {d}")


def generate_city_day():
    img = np.zeros((H, W, 3), dtype=np.float32)
    # Sky gradient: deep blue at zenith (y=0) to light cyan/white at horizon (y=H//2)
    for y in range(H):
        t = y / H
        if y < H // 2:
            sky_t = y / (H // 2)
            # Zenith (0.7, 0.45, 0.15) BGR -> Horizon (0.95, 0.85, 0.70)
            b = 0.75 + 0.20 * sky_t
            g = 0.48 + 0.38 * sky_t
            r = 0.18 + 0.55 * sky_t
        else:
            # Ground / distant greenery gradient
            g_t = (y - H // 2) / (H // 2)
            b = 0.45 - 0.25 * g_t
            g = 0.55 - 0.20 * g_t
            r = 0.35 - 0.15 * g_t
        img[y, :] = (b, g, r)

    # Add soft clouds
    for _ in range(12):
        cx = np.random.randint(0, W)
        cy = np.random.randint(int(H * 0.15), int(H * 0.42))
        rw = np.random.randint(120, 300)
        rh = np.random.randint(30, 70)
        cv2.ellipse(img, (cx, cy), (rw, rh), 0, 0, 360, (0.95, 0.95, 0.95), -1)

    img = cv2.GaussianBlur(img, (99, 45), 0)

    # City Skyscrapers on the horizon
    np.random.seed(42)
    horizon_y = int(H * 0.52)
    
    # Distant layer
    for x in range(0, W, 25):
        bw = np.random.randint(20, 55)
        bh = np.random.randint(40, 160)
        col = (0.75 + np.random.rand()*0.1, 0.65 + np.random.rand()*0.1, 0.55 + np.random.rand()*0.1)
        cv2.rectangle(img, (x, horizon_y - bh), (x + bw, horizon_y), col, -1)

    # Midground layer (crisper buildings)
    for x in range(0, W, 40):
        bw = np.random.randint(30, 75)
        bh = np.random.randint(60, 240)
        col = (0.60 + np.random.rand()*0.15, 0.50 + np.random.rand()*0.15, 0.40 + np.random.rand()*0.15)
        cv2.rectangle(img, (x, horizon_y - bh), (x + bw, horizon_y), col, -1)
        # Windows grid
        for wy in range(horizon_y - bh + 15, horizon_y - 10, 18):
            for wx in range(x + 6, x + bw - 6, 12):
                if np.random.rand() > 0.3:
                    cv2.rectangle(img, (wx, wy), (wx + 6, wy + 8), (0.85, 0.88, 0.92), -1)

    # Foreground tree line / park
    for x in range(0, W, 18):
        th = np.random.randint(25, 65)
        col = (0.22 + np.random.rand()*0.08, 0.48 + np.random.rand()*0.12, 0.25 + np.random.rand()*0.08)
        cv2.circle(img, (x, horizon_y - th//2), th, col, -1)

    img_out = np.clip(img * 255, 0, 255).astype(np.uint8)
    save_to_all(img_out, "city_day.jpg")


def generate_park_day():
    img = np.zeros((H, W, 3), dtype=np.float32)
    for y in range(H):
        if y < H // 2:
            sky_t = y / (H // 2)
            b = 0.85 + 0.12 * sky_t
            g = 0.60 + 0.28 * sky_t
            r = 0.25 + 0.50 * sky_t
        else:
            g_t = (y - H // 2) / (H // 2)
            b = 0.20 - 0.10 * g_t
            g = 0.45 - 0.15 * g_t
            r = 0.25 - 0.10 * g_t
        img[y, :] = (b, g, r)

    # Soft clouds
    for _ in range(15):
        cx = np.random.randint(0, W)
        cy = np.random.randint(int(H * 0.12), int(H * 0.40))
        rw = np.random.randint(140, 320)
        rh = np.random.randint(35, 75)
        cv2.ellipse(img, (cx, cy), (rw, rh), 0, 0, 360, (0.96, 0.96, 0.96), -1)
    img = cv2.GaussianBlur(img, (99, 45), 0)

    # Lush tree canopies across the horizon
    np.random.seed(101)
    horizon_y = int(H * 0.52)
    
    # Layer 1: distant trees
    for x in range(0, W, 15):
        r = np.random.randint(45, 110)
        col = (0.28 + np.random.rand()*0.08, 0.52 + np.random.rand()*0.12, 0.30 + np.random.rand()*0.08)
        cv2.circle(img, (x, horizon_y - r//2), r, col, -1)

    # Layer 2: foreground trees & warm sunlight
    for x in range(0, W, 25):
        r = np.random.randint(60, 140)
        col = (0.20 + np.random.rand()*0.08, 0.58 + np.random.rand()*0.15, 0.32 + np.random.rand()*0.08)
        cv2.circle(img, (x, horizon_y + 10 - r//2), r, col, -1)

    img_out = np.clip(img * 255, 0, 255).astype(np.uint8)
    save_to_all(img_out, "park_day.jpg")


def generate_sunset():
    img = np.zeros((H, W, 3), dtype=np.float32)
    for y in range(H):
        t = y / H
        if y < H // 2:
            sky_t = y / (H // 2)
            # Dusk indigo -> fiery golden orange
            b = 0.45 * (1 - sky_t) + 0.15 * sky_t
            g = 0.20 * (1 - sky_t) + 0.48 * sky_t
            r = 0.35 * (1 - sky_t) + 0.95 * sky_t
        else:
            g_t = (y - H // 2) / (H // 2)
            b = 0.25 - 0.15 * g_t
            g = 0.18 - 0.10 * g_t
            r = 0.35 - 0.20 * g_t
        img[y, :] = (b, g, r)

    # Sun glow on the horizon
    sun_x = int(W * 0.45)
    sun_y = int(H * 0.48)
    for rad, col in [(280, (0.2, 0.6, 1.0)), (140, (0.4, 0.8, 1.0)), (60, (0.9, 0.98, 1.0))]:
        cv2.circle(img, (sun_x, sun_y), rad, col, -1)

    img = cv2.GaussianBlur(img, (121, 61), 0)

    # Sunset silhouettes of skyscrapers & bridge
    horizon_y = int(H * 0.52)
    np.random.seed(77)
    for x in range(0, W, 30):
        bw = np.random.randint(25, 65)
        bh = np.random.randint(50, 200)
        col = (0.12, 0.08, 0.18) # Dark violet-black silhouette
        cv2.rectangle(img, (x, horizon_y - bh), (x + bw, horizon_y), col, -1)

    img_out = np.clip(img * 255, 0, 255).astype(np.uint8)
    save_to_all(img_out, "sunset.jpg")


def generate_night_city():
    img = np.zeros((H, W, 3), dtype=np.float32)
    for y in range(H):
        sky_t = y / H
        # Deep night navy -> dark indigo
        b = 0.18 + 0.10 * sky_t
        g = 0.08 + 0.05 * sky_t
        r = 0.04 + 0.04 * sky_t
        img[y, :] = (b, g, r)

    # Stars in upper sky
    np.random.seed(999)
    for _ in range(400):
        sx = np.random.randint(0, W)
        sy = np.random.randint(0, int(H * 0.42))
        br = np.random.rand() * 0.8 + 0.2
        img[sy, sx] = (br, br, br)

    # City Skyline with glowing warm and cool windows
    horizon_y = int(H * 0.52)
    for x in range(0, W, 35):
        bw = np.random.randint(28, 70)
        bh = np.random.randint(60, 260)
        # Dark building body
        cv2.rectangle(img, (x, horizon_y - bh), (x + bw, horizon_y), (0.05, 0.04, 0.03), -1)
        # Window lights
        for wy in range(horizon_y - bh + 12, horizon_y - 8, 14):
            for wx in range(x + 5, x + bw - 5, 10):
                if np.random.rand() > 0.4:
                    is_warm = np.random.rand() > 0.3
                    col = (0.4, 0.8, 1.0) if is_warm else (0.9, 0.8, 0.4) # Warm gold or cool cyan
                    cv2.rectangle(img, (wx, wy), (wx + 5, wy + 6), col, -1)

    img_out = np.clip(img * 255, 0, 255).astype(np.uint8)
    save_to_all(img_out, "night_city.jpg")


if __name__ == '__main__':
    print("=" * 60)
    print("🌅 GENERATING 360° WINDOW VIEW PANORAMIC BACKDROPS")
    print("=" * 60)
    generate_city_day()
    generate_park_day()
    generate_sunset()
    generate_night_city()
    print("🎉 ALL BACKDROPS GENERATED SUCCESSFULLY!")
