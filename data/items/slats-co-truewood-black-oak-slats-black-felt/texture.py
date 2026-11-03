from pathlib import Path
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
REPEAT_W, REPEAT_H = 11.8, 23.6
SLATS = 8
PITCH = REPEAT_W / SLATS
FACE = 1.0
DEPTH = 0.75
RELIEF = 0.51
rng = np.random.default_rng(7819)


def noise(sy, sx):
    field = gaussian_filter(rng.standard_normal((H, W)), (sy, sx), mode='wrap')
    return field / field.std()


y, x = np.mgrid[:H, :W]
wall_x = (x + 0.5) * REPEAT_W / W
local = (wall_x + PITCH / 2) % PITCH - PITCH / 2
slat_id = np.floor((wall_x + PITCH / 2) / PITCH).astype(int) % SLATS
inside = np.abs(local) < FACE / 2

# Periodic domain warping keeps fibers continuous across both texture boundaries.
warp = 2.2 * noise(90, 14) + 0.7 * noise(28, 9)
coords = np.array([y, (x + warp) % W])
fibers = map_coordinates(noise(38, 0.75), coords, order=1, mode='grid-wrap')
long_grain = map_coordinates(noise(130, 2.3), coords, order=1, mode='grid-wrap')
figure = map_coordinates(noise(65, 8), coords, order=1, mode='grid-wrap')
pores = np.maximum(fibers - 0.85, 0) ** 1.3
fine = noise(1.1, 0.55)
grain = 1.15 * long_grain + 0.75 * figure + 0.50 * fibers - 1.35 * pores + 0.23 * fine

photo = np.asarray(Image.open(ROOT / 'main.jpg').convert('RGB'), dtype=float)
patches = [(800, 550), (1000, 670), (1250, 810), (1000, 220)]
samples = np.array([np.median(photo[cy-12:cy+12, cx-12:cx+12], axis=(0, 1)) for cx, cy in patches])
face_color = np.median(samples, axis=0)
tones = rng.normal(0, 1.45, SLATS)
tones -= tones.mean()
wood = face_color + (grain + tones[slat_id])[..., None]
felt_noise = noise(0.6, 0.6)
felt = np.array([20.0, 20.0, 20.5]) + (0.8 * felt_noise + 0.35 * noise(3, 3))[..., None]
albedo = np.where(inside[..., None], wood, felt)
albedo = np.clip(np.rint(albedo), 0, 255).astype(np.uint8)
Image.fromarray(albedo).save(ROOT / 'texture.png')

# A narrow rounded shoulder joins a flat face to a steep side and recessed felt.
edge_distance = FACE / 2 - np.abs(local)
shoulder = 0.025
edge_t = np.clip(edge_distance / shoulder, 0, 1)
profile = edge_t * edge_t * (3 - 2 * edge_t)
height = RELIEF * profile + np.where(inside, 0.0007 * long_grain - 0.0006 * pores, 0.00035 * felt_noise)
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * REPEAT_W / W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * REPEAT_H / H)
normals = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
normal_rgb = np.clip(np.rint((normals * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)
Image.fromarray(normal_rgb).save(ROOT / 'normal.png')

metadata = {
    'repeatWidthIn': REPEAT_W,
    'repeatHeightIn': REPEAT_H,
    'depthIn': DEPTH,
    'note': 'No manufacturer slat specification is published: eight slats per panel are counted from the gallery, giving a 1.475 in pitch from the recorded 11.8 in panel width; 1.0 in faces, 0.475 in rectangular felt-backed gaps, small rounded edges and 0.51 in relief above felt are photo estimates, while 0.75 in total thickness is from the panel record. The tile covers eight pitches by 23.6 in with wrapping vertical grain; matte charcoal-black oak face tones and subtle variation are sampled from main.jpg, with black felt estimated from its backing and no colors taken from the natural-wood gallery examples.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.55, 0.65, 0.8])
light /= np.linalg.norm(light)
diffuse = np.maximum(np.sum(normals * light, axis=-1), 0)
linear = np.where(albedo / 255 <= 0.04045, albedo / 255 / 12.92, ((albedo / 255 + 0.055) / 1.055) ** 2.4)
shaded = linear * (0.30 + 0.90 * diffuse[..., None])
srgb = np.where(shaded <= 0.0031308, 12.92 * shaded, 1.055 * shaded ** (1 / 2.4) - 0.055)
shaded = np.clip(np.rint(srgb * 255), 0, 255).astype(np.uint8)
preview = Image.new('RGB', (1536, 1576), (228, 228, 228))
draw = ImageDraw.Draw(preview)
draw.text((16, 12), 'COLOR MAP: 3 x 3 | 35.4 x 70.8 in', fill=(20, 20, 20))
draw.text((784, 12), 'NORMAL-SHADED: 3 x 3 | LIGHT FROM UPPER LEFT', fill=(20, 20, 20))
for col, data in enumerate((albedo, shaded)):
    tiled = Image.fromarray(np.tile(data, (3, 3, 1))).resize((768, 1536), Image.Resampling.LANCZOS)
    preview.paste(tiled, (col * 768, 40))
preview.save(ROOT / 'preview.png')
assert W / H == REPEAT_W / REPEAT_H
assert abs(SLATS * PITCH - REPEAT_W) < 1e-10
for name, data in [('color', albedo.astype(float)), ('normal', normal_rgb.astype(float))]:
    vertical_seam = np.abs(data[0] - data[-1]).mean()
    vertical_interior = np.abs(np.diff(data, axis=0)).mean()
    horizontal_seam = np.abs(data[:, 0] - data[:, -1]).mean()
    print(f'{name}: vertical seam/interior {vertical_seam:.3f}/{vertical_interior:.3f}; horizontal seam {horizontal_seam:.3f}')
print(f'Wrote 1024 x 2048 maps, preview and metadata; sampled face RGB {face_color.tolist()}')
