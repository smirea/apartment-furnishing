from pathlib import Path
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
SLATS = 7
FACE_MM, GAP_MM = 30.5, 12.3
PITCH_MM = FACE_MM + GAP_MM
WIDTH_MM = SLATS * PITCH_MM
HEIGHT_MM = WIDTH_MM * H / W
rng = np.random.default_rng(41027)
y, x = np.mgrid[:H, :W].astype(float)


def noise(sy, sx):
    a = gaussian_filter(rng.normal(size=(H, W)).astype(np.float32), (sy, sx), mode='wrap')
    return a / max(a.std(), 1e-8)


def save(name, pixels):
    Image.fromarray(np.uint8(np.clip(pixels, 0, 255))).save(ROOT / name)


# Put the tile boundaries on the groove apex, as at the factory panel joint.
phase = (x * WIDTH_MM / W) % PITCH_MM
face = (phase >= GAP_MM / 2) & (phase <= GAP_MM / 2 + FACE_MM)
edge_distance = np.minimum(phase - GAP_MM / 2, GAP_MM / 2 + FACE_MM - phase)
slat_index = np.floor(x * SLATS / W).astype(int)

source = Image.open(ROOT / 'main.jpg').convert('RGB')
mask = Image.new('L', source.size)
ImageDraw.Draw(mask).polygon([(560, 568), (1200, 390), (1200, 425), (585, 598)], fill=255)
wood_samples = np.asarray(source)[np.asarray(mask) > 0]
wood_color = np.median(wood_samples, axis=0)
print('Main-photo walnut median:', wood_color.tolist())

warp = 4.5 * noise(95, 28) + 1.4 * noise(32, 12)
coords = np.array([y, (x + warp) % W])
long_fibers = map_coordinates(noise(65, 0.65), coords, order=1, mode='grid-wrap')
medium_fibers = map_coordinates(noise(110, 3.5), coords, order=1, mode='grid-wrap')
broad_grain = map_coordinates(noise(180, 12), coords, order=1, mode='grid-wrap')

# Closed, warped growth rings give occasional walnut cathedrals without a vertical seam.
ring_detail = np.zeros((H, W))
for i in range(SLATS):
    center = (i + 0.50 + rng.uniform(-0.12, 0.12)) * W / SLATS
    offset = rng.uniform(0, H)
    vertical = 2 * np.sin(np.pi * (y - offset) / H)
    radius = np.sqrt(((x - center + 0.35 * warp) / 18) ** 2 + (vertical * 2.1) ** 2 + 0.04)
    rings = np.sin(radius * 11 + 0.35 * broad_grain)
    bands = np.maximum(rings - 0.20, 0) ** 2
    ring_detail += np.where(slat_index == i, bands - 0.19, 0)

slat_tones = np.array([-1.8, 2.1, -0.6, 3.0, -2.4, 0.9, -0.9])[slat_index]
fine = noise(0.6, 0.5)
variation = (2.6 * broad_grain + 2.1 * medium_fibers + 1.2 * long_fibers
             - 5.3 * ring_detail + 0.7 * fine + slat_tones)
wood = wood_color + variation[..., None] * np.array([1.0, 0.93, 0.84])
pore = np.maximum(-long_fibers - 1.7, 0) * 2.2
wood -= pore[..., None] * np.array([1, 0.9, 0.8])

felt_variation = 2.4 * noise(0.65, 0.65) + 1.7 * noise(3, 3) + 0.7 * noise(12, 10)
felt = np.array([169, 171, 170]) + felt_variation[..., None]
albedo = np.where(face[..., None], wood, felt)
save('texture.png', albedo)

# The V has 45-degree felt flanks; only the veneer faces receive wood microrelief.
groove_distance = np.minimum(phase, PITCH_MM - phase)
height_mm = np.where(face, 9.0, 9.0 - GAP_MM / 2 + groove_distance)
height_mm = gaussian_filter(height_mm, (0, 0.3), mode='wrap')
height_mm += np.where(face, 0.014 * medium_fibers + 0.009 * long_fibers,
                      0.014 * noise(0.8, 0.8))
dx_mm, dy_mm = WIDTH_MM / W, HEIGHT_MM / H
dhdx = (np.roll(height_mm, -1, axis=1) - np.roll(height_mm, 1, axis=1)) / (2 * dx_mm)
dhdy_image = (np.roll(height_mm, -1, axis=0) - np.roll(height_mm, 1, axis=0)) / (2 * dy_mm)
normals = np.stack([-dhdx, dhdy_image, np.ones_like(dhdx)], axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
save('normal.png', (normals * 0.5 + 0.5) * 255)

metadata = {
    'repeatWidthIn': WIDTH_MM / 25.4,
    'repeatHeightIn': HEIGHT_MM / 25.4,
    'depthIn': 9 / 25.4,
    'note': 'Manufacturer spec dimensions override photo estimates: seven 30.5 mm walnut faces on 42.8 mm pitches with 12.3 mm, 90-degree V-grooves about 6.2 mm deep in 9 mm felt, with no rigid core; the seven-pitch tile is 299.6 mm wide versus the rounded nominal 300 mm panel. Muted walnut tone is sampled from the main listing photo, with light grey felt matched to that photo; procedural grain wraps over the 599.2 mm tile height.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.48, 0.62, 0.62])
light /= np.linalg.norm(light)
illumination = 0.32 + 0.68 * np.maximum(normals @ light, 0)
shaded = albedo * illumination[..., None]
color_tile = Image.fromarray(np.uint8(np.clip(albedo, 0, 255))).resize((384, 768), Image.Resampling.LANCZOS)
shade_tile = Image.fromarray(np.uint8(np.clip(shaded, 0, 255))).resize((384, 768), Image.Resampling.LANCZOS)
preview = Image.new('RGB', (2304, 2340), '#e5e2dc')
draw = ImageDraw.Draw(preview)
draw.text((16, 10), 'ALBEDO: 3 x 3 repeats', fill='#292929')
draw.text((1168, 10), 'NORMAL-MAP RELIEF: upper-left light, 3 x 3 repeats', fill='#292929')
for row in range(3):
    for column in range(3):
        preview.paste(color_tile, (column * 384, 36 + row * 768))
        preview.paste(shade_tile, (1152 + column * 384, 36 + row * 768))
preview.save(ROOT / 'preview.png')
print(json.dumps(metadata, indent=2))
print('Wrote texture.png, normal.png, texture.json, preview.png')
