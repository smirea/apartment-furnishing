import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

W, H = 1024, 2048
WIDTH_MM, HEIGHT_MM = 300.0, 600.0
rng = np.random.default_rng(42)
y, x = np.mgrid[:H, :W]
x_mm = x * WIDTH_MM / W
y_mm = y * HEIGHT_MM / H
pitch, face = 37.5, 27.0
phase = x_mm % pitch
slat = (x_mm / pitch).astype(int)
distance = face / 2 - np.abs(phase - pitch / 2)
wood_mask = distance >= 0


def noise(shape, sigma):
    a = gaussian_filter(rng.normal(size=shape), sigma, mode='wrap')
    return (a - a.mean()) / a.std()


# Sample only face interiors; gallery lighting and alternate finishes do not set the palette.
source = np.asarray(Image.open('main.png').convert('RGB'), dtype=float)
centers = [(700, 195), (750, 300), (800, 420), (900, 530), (1000, 640), (1090, 740)]
palette = np.array([np.median(source[b-12:b+12, a-35:a+35].reshape(-1, 3), axis=0) for a, b in centers])
base = np.median(palette, axis=0)
tone = rng.normal(0, 1.8, 8)[slat]
color = np.zeros((H, W, 3), dtype=float)
grain_height = np.zeros((H, W))

for i in range(8):
    cols = slice(i * 128, (i + 1) * 128)
    yy, xx = np.mgrid[:H, :128]
    t = 2 * np.pi * yy / H
    u = (xx - 64) * WIDTH_MM / W
    bend = 0.8 * np.sin(t + i * 1.7) + 0.35 * np.sin(3 * t + i)
    # Periodic coordinates preserve long grain and occasional cathedral-shaped growth rings.
    cathedral = (2.8 + 0.8 * np.cos(t + i)) * np.cos(t + i * 0.8)
    coord = u + bend + cathedral * np.exp(-((u - 4 * np.sin(t + i)) / 12) ** 2)
    growth = np.sin(coord * 2.0 + 0.6 * np.sin(t * 2 + i))
    ring = np.maximum(growth, 0) ** 14
    broad = noise((H, 128), (130, 8))
    fiber = noise((H, 128), (28, 0.65))
    pores = np.maximum(noise((H, 128), (10, 0.5)) - 1.0, 0) ** 1.3
    fine = noise((H, 128), (1.2, 0.4))
    value = 2.0 * broad + 2.3 * fiber - 4.5 * ring - 5.0 * pores + 0.65 * fine
    color[:, cols] = base + tone[:, cols, None] + value[..., None] * np.array([1.0, 0.86, 0.67])
    grain_height[:, cols] = 0.016 * fiber - 0.022 * pores + 0.004 * fine

felt_noise = noise((H, W), (0.5, 0.5))
felt_cloud = noise((H, W), (7, 7))
felt = np.array([23.0, 23.0, 22.0]) + (1.5 * felt_noise + 0.6 * felt_cloud)[..., None]
color = np.where(wood_mask[..., None], color, felt)
color = np.uint8(np.clip(np.rint(color), 0, 255))
Image.fromarray(color).save('texture.png')

# Relief is measured from the felt surface; total product depth also includes 5 mm felt.
bevel_mm = 0.65
bevel = np.clip(distance / bevel_mm, 0, 1)
height = np.where(wood_mask, 5.0 - 0.45 * (1 - bevel) ** 2 + grain_height, 0.012 * felt_noise)
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH_MM / W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT_MM / H)
normal = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
Image.fromarray(np.uint8(np.clip(np.rint((normal * 0.5 + 0.5) * 255), 0, 255))).save('normal.png')

metadata = {
    'repeatWidthIn': WIDTH_MM / 25.4,
    'repeatHeightIn': HEIGHT_MM / 25.4,
    'depthIn': 10.0 / 25.4,
    'note': 'Manufacturer spec dimensions override photo estimates: 8 slats with 27 mm faces and 10.5 mm gaps on a 37.5 mm pitch, 5 mm slats on 5 mm felt; the tile covers 300 x 600 mm. Oak tones are sampled from the main listing photo and black felt follows that selected product/photo, despite the sheet listing oatmeal felt for Natural Oak.'
}
Path('texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.45, 0.6, 0.66])
light /= np.linalg.norm(light)
diffuse = np.clip(normal @ light, 0, 1)
shaded = np.uint8(np.clip(color.astype(float) * (0.32 + 0.78 * diffuse[..., None]), 0, 255))
# Light is used only in the preview, never in either delivered material map.
size = (384, 768)
flat_small = Image.fromarray(color).resize(size, Image.Resampling.LANCZOS)
shade_small = Image.fromarray(shaded).resize(size, Image.Resampling.LANCZOS)
preview = Image.new('RGB', (size[0] * 6, size[1] * 3))
for row in range(3):
    for col in range(3):
        preview.paste(flat_small, (col * size[0], row * size[1]))
        preview.paste(shade_small, ((col + 3) * size[0], row * size[1]))
preview.save('preview.png')

assert W / H == WIDTH_MM / HEIGHT_MM
assert 8 * pitch == WIDTH_MM
for name in ('texture.png', 'normal.png'):
    a = np.asarray(Image.open(name)).astype(float)
    vertical_seam = np.abs(a[0] - a[-1]).mean()
    horizontal_seam = np.abs(a[:, 0] - a[:, -1]).mean()
    print(f'{name}: {W} x {H}; boundary differences x={horizontal_seam:.3f}, y={vertical_seam:.3f}')
print(json.dumps(metadata, indent=2))
