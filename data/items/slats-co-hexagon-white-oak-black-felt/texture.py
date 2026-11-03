from pathlib import Path
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1184, 2048
REPEAT_H = 26.10
REPEAT_W = REPEAT_H * W / H
DEPTH = 0.75
rng = np.random.default_rng(8317)


def noise(sy, sx):
    field = gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), (sy, sx), mode='wrap')
    return field / max(float(field.std()), 1e-6)


def save(name, array):
    Image.fromarray(np.uint8(np.clip(array, 0, 255))).save(ROOT / name)


y, x = np.mgrid[:H, :W].astype(np.float32)
xx, yy = (x + 0.5) * REPEAT_W / W, (y + 0.5) * REPEAT_H / H
pitch = REPEAT_H / 3
apothem = 4.05
best = np.full((H, W), -100, np.float32)
labels = np.zeros((H, W), np.int8)
for col in range(2):
    dx = np.abs((xx - col * REPEAT_W / 2 + REPEAT_W / 2) % REPEAT_W - REPEAT_W / 2)
    for row in range(3):
        cy = (row + col / 2) * pitch
        dy = np.abs((yy - cy + REPEAT_H / 2) % REPEAT_H - REPEAT_H / 2)
        distance = np.minimum(apothem - dy, apothem - np.sqrt(3) / 2 * dx - 0.5 * dy)
        take = distance > best
        best[take] = distance[take]
        labels[take] = col * 3 + row

# All fields and sampling wrap so both the grain and its derivatives cross tile boundaries.
warp = 4.0 * noise(100, 28) + 1.5 * noise(35, 10)
coords = np.array([y, (x + warp) % W])
broad = map_coordinates(noise(145, 11), coords, order=1, mode='grid-wrap')
fibers = map_coordinates(noise(45, 0.8), coords, order=1, mode='grid-wrap')
fine = noise(5, 0.5)
pores = np.maximum(noise(16, 0.65) - 1.15, 0) ** 1.4
pores *= np.clip(0.65 + 0.3 * noise(7, 3), 0, 1)
grain = 2.7 * broad + 2.8 * fibers + 0.9 * fine - 8.5 * pores

source = np.array(Image.open(ROOT / 'main.jpg').convert('RGB').resize((1600, 1600)))
swatches = [source[890:1000, 780:880], source[960:1070, 340:440], source[980:1090, 610:700]]
base = np.median(np.concatenate([a.reshape(-1, 3) for a in swatches]), axis=0)
wood = base + grain[..., None] * np.array([0.65, 0.90, 1.10])
tones = np.array([-2.4, 0.5, -0.8, 1.8, -3.2, 0.0], np.float32)
wood += tones[labels, None] * np.array([0.55, 0.9, 1.1])
felt_noise = 1.25 * noise(0.5, 0.5) + 0.45 * noise(3, 3)
felt = np.array([10.0, 10.0, 9.5]) + felt_noise[..., None]
pixel_in = REPEAT_H / H
coverage = np.clip(best / pixel_in + 0.5, 0, 1)
color = felt * (1 - coverage[..., None]) + wood * coverage[..., None]
save('texture.png', color)

# Thickness is unlisted; split the estimate into 0.35 in felt and 0.40 in raised faces.
edge = np.clip(best / 0.055, 0, 1)
edge = edge * edge * (3 - 2 * edge)
height = 0.35 + 0.40 * edge
height += coverage * (0.0007 * fibers - 0.0008 * pores)
height += (1 - coverage) * 0.00035 * felt_noise
height = gaussian_filter(height, 0.45, mode='wrap')
dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * pixel_in)
dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * pixel_in)
normal = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
save('normal.png', (normal * 0.5 + 0.5) * 255 + 0.5)

metadata = {
    'repeatWidthIn': REPEAT_W,
    'repeatHeightIn': REPEAT_H,
    'depthIn': DEPTH,
    'note': 'The dimension diagram (24.40 x 29.92 in overall; 22.48 x 25.98 in backing, nine hexagons per panel) implies approximately 9.35 x 8.10 in flat-top hexagon faces with 0.60 in black-felt joints on an 8.70 in vertical pitch; this seamless tile spans two staggered columns and three pitches. No manufacturer specs are published, so 0.75 in total thickness is an estimate; white-oak face colors are sampled from the first listing photo, with procedural vertical grain and no baked lighting.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.45, 0.55, 0.70])
light /= np.linalg.norm(light)
shading = 0.30 + 0.70 * np.maximum(normal @ light, 0)
shaded = color * shading[..., None]
thumb_size = (384, round(384 * H / W))
preview = Image.new('RGB', (thumb_size[0] * 6, thumb_size[1] * 3 + 42), '#e7e5e1')
for side, data in enumerate([color, shaded]):
    thumb = Image.fromarray(np.uint8(np.clip(data, 0, 255))).resize(thumb_size, Image.Resampling.LANCZOS)
    for row in range(3):
        for col in range(3):
            preview.paste(thumb, ((side * 3 + col) * thumb_size[0], 42 + row * thumb_size[1]))
draw = ImageDraw.Draw(preview)
draw.text((15, 14), 'COLOR / 3 x 3 repeats', fill='#242424')
draw.text((3 * thumb_size[0] + 15, 14), 'NORMAL-MAP LIGHTING / upper-left light / 3 x 3 repeats', fill='#242424')
preview.save(ROOT / 'preview.png')
print(json.dumps(metadata, indent=2))
print('Face median RGB:', base.tolist())
print('Face coverage:', round(float(coverage.mean()), 4))
for name, data in [('color', color), ('normal', normal * 127.5)]:
    for axis in [0, 1]:
        seam = np.abs(np.take(data, 0, axis=axis) - np.take(data, -1, axis=axis)).mean()
        adjacent = np.abs(np.diff(data, axis=axis)).mean()
        print(f'{name}, axis {axis}: boundary change {seam:.3f}; mean interior change {adjacent:.3f}')
