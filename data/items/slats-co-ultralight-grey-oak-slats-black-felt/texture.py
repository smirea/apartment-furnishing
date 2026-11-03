import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
rng = np.random.default_rng(2718)
W, H = 896, 1920
FACE, GAP, COUNT = 1.20, 0.49, 7
PITCH = FACE + GAP
WIDTH, HEIGHT = COUNT * PITCH, 25.35
DX, DY = WIDTH / W, HEIGHT / H


def field(sy, sx):
    a = gaussian_filter(rng.normal(size=(H, W)), (sy, sx), mode='wrap')
    return a / a.std()


def save(name, a):
    Image.fromarray(np.uint8(np.clip(a, 0, 255))).save(ROOT / name)


# All filters and coordinate warps wrap, including at the grain's vertical join.
y, x = np.mgrid[:H, :W]
u = x * DX
phase = (u - GAP / 2) % PITCH
face = phase < FACE
edge_distance = np.minimum(phase, FACE - phase)
groove_distance = np.minimum(phase - FACE, PITCH - phase)
height = np.where(face, 9 / 25.4, 9 / 25.4 - np.maximum(groove_distance, 0) * (6.2 / 25.4) / (GAP / 2))

warp = field(95, 19) * 2.5 + field(240, 65) * 3.3
coords = np.array([y, (x + warp) % W])
fibers = map_coordinates(field(26, 0.55), coords, order=1, mode='grid-wrap')
fine = map_coordinates(field(8, 0.35), coords, order=1, mode='grid-wrap')
long_grain = map_coordinates(field(130, 2.1), coords, order=1, mode='grid-wrap')
broad = field(170, 12)
pores = np.maximum(-fibers - 0.85, 0) ** 1.25
variation = 2.7 * long_grain + 1.7 * fibers + 0.9 * fine + 1.8 * broad - 3.2 * pores
slat_id = np.floor((u - GAP / 2) / PITCH).astype(int) % COUNT
tones = np.array([-1.8, 2.0, -0.6, 3.0, 0.7, -2.3, 1.2])[slat_id]

source = np.asarray(Image.open(ROOT / 'main.jpg').convert('RGB'), dtype=float)
patch = source[360:390, 1000:1250]
wood_color = np.median(patch.reshape(-1, 3), axis=0)
wood = wood_color + (variation + tones)[..., None] * np.array([1.0, 0.97, 0.92])
felt_noise = 1.8 * field(0.55, 0.55) + 0.65 * field(2.5, 2.5)
felt = np.array([34, 35, 36]) + felt_noise[..., None]
albedo = np.where(face[..., None], wood, felt)
save('texture.png', albedo)

height += np.where(face, (0.00032 * fibers + 0.0002 * fine - 0.00025 * pores), 0.00032 * felt_noise)
height = gaussian_filter(height, (0.35, 0.5), mode='wrap')
dhdx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * DX)
dhdy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * DY)
# Image rows point down; OpenGL tangent Y points up.
normal = np.stack([-dhdx, dhdy, np.ones_like(height)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
save('normal.png', (normal * 0.5 + 0.5) * 255 + 0.5)

metadata = {
    'repeatWidthIn': WIDTH,
    'repeatHeightIn': HEIGHT,
    'depthIn': 9 / 25.4,
    'note': 'Manufacturer specs override photo estimates: seven 1.20 in faces with 0.49 in 90-degree V-grooves on a 1.69 in pitch, 6.2 mm groove depth and 9 mm total coreless veneer/felt depth; these stated widths sum to an 11.83 in repeat versus the rounded 11.80 in panel listing. Grey oak tone is sampled from main.jpg, with procedural grain and black felt; the tile covers seven pitches by 25.35 in with half-grooves at the horizontal boundaries.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.48, 0.58, 0.66])
light /= np.linalg.norm(light)
illumination = 0.35 + 0.65 * np.maximum(0, normal @ light)
shaded = albedo * illumination[..., None]
thumb = (336, 720)
color_tile = Image.fromarray(np.uint8(np.clip(albedo, 0, 255))).resize(thumb, Image.Resampling.LANCZOS)
shade_tile = Image.fromarray(np.uint8(np.clip(shaded, 0, 255))).resize(thumb, Image.Resampling.LANCZOS)
preview = Image.new('RGB', (2040, 2200), '#ddddda')
for row in range(3):
    for col in range(3):
        preview.paste(color_tile, (col * thumb[0], 40 + row * thumb[1]))
        preview.paste(shade_tile, (1032 + col * thumb[0], 40 + row * thumb[1]))
draw = ImageDraw.Draw(preview)
draw.text((12, 12), 'ALBEDO / 3 x 3 tiles', fill='#222222')
draw.text((1044, 12), 'NORMAL-LIT / upper-left light / 3 x 3 tiles', fill='#222222')
preview.save(ROOT / 'preview.png')

assert abs(W / H - WIDTH / HEIGHT) < 1e-12
assert np.isfinite(normal).all()
print(json.dumps(metadata, indent=2))
print('Saved texture.png, normal.png and preview.png; 896 x 1920 maps, seven pitches, exact physical pixel aspect.')
