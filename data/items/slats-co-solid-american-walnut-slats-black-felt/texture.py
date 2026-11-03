from pathlib import Path
import json

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
WIDTH_MM, HEIGHT_MM = 300.0, 600.0
SLATS, FACE_MM, GAP_MM = 8, 27.0, 10.5
rng = np.random.default_rng(20261103)


def field(shape, sigma):
    a = gaussian_filter(rng.normal(size=shape), sigma, mode='wrap')
    return (a - a.mean()) / max(a.std(), 1e-9)


def save(name, a):
    Image.fromarray(np.uint8(np.clip(a, 0, 255))).save(ROOT / name)


photo = np.asarray(Image.open(ROOT / 'main.jpg').convert('RGB'), dtype=float)
# These patches lie on broad slat faces, avoiding the dark vertical sidewalls.
patches = [(1050, 530), (1050, 690), (1200, 880), (1050, 90)]
samples = np.array([np.median(photo[y-10:y+10, x-10:x+10], axis=(0, 1)) for x, y in patches])
base = np.median(samples, axis=0)
# Remove the pale neutral veil of the photographed satin reflections.
base = base * 0.90
color = np.empty((H, W, 3), dtype=float)
height = np.empty((H, W), dtype=float)
y = np.arange(H)[:, None]
x = np.arange(W)[None, :]
pitch_px = W // SLATS
face_px = FACE_MM / WIDTH_MM * W
phase = np.mod(x, pitch_px) - pitch_px / 2
face_distance_mm = FACE_MM / 2 - np.abs(phase) * WIDTH_MM / W
mask = np.clip(face_distance_mm / 0.22 + 0.5, 0, 1)
felt = field((H, W), (0.65, 0.65))
felt_long = field((H, W), (2.0, 0.7))
color[:] = np.array([18, 19, 19]) + (felt * 1.3 + felt_long * 0.7)[..., None]
height[:] = 9.0 + felt * 0.018

for i in range(SLATS):
    cols = np.arange(i * pitch_px, (i + 1) * pitch_px)
    local_x = np.arange(pitch_px)[None, :]
    broad = field((H, pitch_px), (110, 11))
    drift = field((H, 1), (95, 0)) * 4.0
    drift += 1.6 * np.sin(2 * np.pi * y / H + i)
    coords = np.broadcast_arrays(y, local_x + drift)
    long_grain = map_coordinates(field((H, pitch_px), (100, 1.2)), coords, order=1, mode='grid-wrap')
    fine_grain = map_coordinates(field((H, pitch_px), (24, 0.48)), coords, order=1, mode='grid-wrap')
    # Periodic warped contours form elongated walnut growth-ring figures.
    center = pitch_px * (0.3 + 0.45 * rng.random())
    swell = np.sin(2 * np.pi * y / H + rng.uniform(0, 2*np.pi))
    radius = np.sqrt(((local_x - center + drift) / 14.0) ** 2 + (2.8 + 2.1 * swell) ** 2)
    rings = np.sin(radius * 6.8 + broad * 0.65)
    dark_rings = np.maximum(0, rings - 0.32) ** 2
    pores = np.maximum(0, -fine_grain - 1.2)
    tone = rng.uniform(-10, 8)
    variation = broad * 5.0 + long_grain * 4.8 + fine_grain * 1.6 - dark_rings * 13.0 - pores * 4.2
    wood = base + np.array([tone, tone * .88, tone * .78]) + variation[..., None] * np.array([1.0, .92, .83])
    wood += rng.normal(size=(H, pitch_px, 1)) * .55
    m = mask[:, cols]
    color[:, cols] = color[:, cols] * (1-m[..., None]) + wood * m[..., None]
    profile = np.clip(face_distance_mm[:, cols] / 0.15, 0, 1)
    wood_height = 22.0 - (1-profile) * .15 + long_grain * .012 + fine_grain * .007 - pores * .009
    height[:, cols] = height[:, cols] * (1-m) + wood_height * m

save('texture.png', color)
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH_MM / W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT_MM / H)
# Image rows point down; OpenGL tangent-space green points up.
normals = np.stack((-dx, dy, np.ones_like(height)), axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
save('normal.png', (normals + 1) * 127.5)
metadata = {
    'repeatWidthIn': WIDTH_MM / 25.4,
    'repeatHeightIn': HEIGHT_MM / 25.4,
    'depthIn': 22 / 25.4,
    'note': 'Manufacturer spec sheet overrides photo estimates and rounded inch labels: 8 square-cut solid walnut slats, 27 mm (1.063 in) faces plus 10.5 mm (0.413 in) black felt gaps on 37.5 mm (1.476 in) pitch, 13 mm wood over 9 mm felt, 22 mm total depth. Tile spans eight pitches by 600 mm; main.jpg supplies deep chocolate walnut face tones for the three-coat low-satin polyurethane finish, with procedural vertically wrapping grain.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')
light = np.array([-.45, .55, .80])
light /= np.linalg.norm(light)
lambert = np.maximum(0, normals @ light)
linear = (np.clip(color, 0, 255) / 255) ** 2.2
shaded = np.power(linear * (.24 + .76 * lambert[..., None]), 1/2.2) * 255
thumb = Image.fromarray(np.uint8(np.clip(color, 0, 255))).resize((256, 512), Image.Resampling.LANCZOS)
shaded_thumb = Image.fromarray(np.uint8(np.clip(shaded, 0, 255))).resize((256, 512), Image.Resampling.LANCZOS)
preview = Image.new('RGB', (1536, 1536))
for row in range(3):
    for col in range(3):
        preview.paste(thumb, (col*256, row*512))
        preview.paste(shaded_thumb, (768+col*256, row*512))
preview.save(ROOT / 'preview.png')
print(json.dumps(metadata, indent=2))
print('Face RGB sampled:', base.round(1).tolist())
print('Generated 1024 x 2048 maps and 1536 x 1536 preview.')
