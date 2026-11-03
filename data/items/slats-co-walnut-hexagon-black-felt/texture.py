import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates


ROOT = Path(__file__).resolve().parent
W, H = 1181, 2048
HEIGHT_IN = 25.98
WIDTH_IN = HEIGHT_IN * W / H
DX, DY = WIDTH_IN / 2, HEIGHT_IN / 3
RADIUS = 9.30 / 2
APOTHEM = RADIUS * np.sqrt(3) / 2
DEPTH_IN = 0.40
RELIEF_IN = 0.24
rng = np.random.default_rng(7491)
y, x = np.mgrid[:H, :W].astype(np.float32)
x = (x + 0.5) * WIDTH_IN / W
y = (y + 0.5) * HEIGHT_IN / H


def noise(rows, cols, seed, shift=None):
    random = np.random.default_rng(seed)
    small = random.normal(size=(rows, cols)).astype(np.float32)
    yy = y / HEIGHT_IN * rows
    xx = x / WIDTH_IN * cols
    if shift is not None:
        xx = xx + shift
    result = map_coordinates(small, [yy, xx], order=3, mode='grid-wrap')
    return result / max(float(result.std()), 0.001)


photo = np.asarray(Image.open(ROOT / 'main.jpg').convert('RGB').resize((1600, 1600)))
samples = [photo[970:1090, 610:705], photo[950:1060, 340:430], photo[880:1000, 770:875]]
walnut = np.median(np.concatenate([a.reshape(-1, 3) for a in samples]), axis=0)
print('Main-photo walnut sample, RGB:', walnut.tolist())

felt = noise(420, 280, 1) * 1.1 + noise(900, 520, 2) * 0.65
color = np.stack([13 + felt, 13 + felt, 12.5 + felt], axis=-1)
height = noise(560, 320, 3) * 0.00045
distance = np.full((H, W), -100, dtype=np.float32)
owner = np.zeros((H, W), dtype=np.int16)

# A two-column rectangular lattice closes both staggered hexagon boundaries.
for col in range(-1, 4):
    for row in range(-2, 5):
        cx = col * DX
        cy = (row + 0.5 * (col % 2)) * DY
        xx, yy = np.abs(x - cx), np.abs(y - cy)
        d = np.minimum(APOTHEM - yy, APOTHEM - np.sqrt(3) / 2 * xx - yy / 2)
        take = d > distance
        distance[take] = d[take]
        owner[take] = (col % 2) * 3 + (row % 3)

for face in range(6):
    seed = 100 + face * 30
    warp = noise(6, 12, seed) * 0.28 + noise(14, 20, seed + 1) * 0.055
    broad = noise(7, 80, seed + 2, warp)
    fibers = noise(16, 210, seed + 3, warp * 3.7)
    fine = noise(30, 470, seed + 4, warp * 8.2)
    pores = np.maximum(-fibers - 0.8, 0) ** 1.25
    vessel = noise(100, 850, seed + 6, warp * 14)
    grain = broad * 3.8 + fibers * 3.2 + fine * 1.5 - pores * 3.0 + vessel * 0.8
    tone = [-3.0, 2.0, -0.5, 3.0, -4.0, 0.5][face]
    wood = walnut + (grain + tone)[..., None] * np.array([1.0, 0.82, 0.66])
    wood += noise(8, 16, seed + 5)[..., None] * np.array([1.5, 0.65, 0.25])
    mask = (owner == face) & (distance >= 0)
    color[mask] = wood[mask]
    bevel = np.clip(distance / 0.055, 0, 1)
    bevel = bevel * bevel * (3 - 2 * bevel)
    surface = RELIEF_IN * bevel + (fibers * 0.00055 + broad * 0.0009) * bevel
    height[mask] = surface[mask]

# Periodic derivatives preserve the OpenGL normal convention at the tile edges.
height = gaussian_filter(height, 0.65, mode='wrap')
sx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH_IN / W)
sy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT_IN / H)
normal = np.stack([-sx, sy, np.ones_like(sx)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
normal_rgb = np.round((normal * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)
rgb = np.round(color).clip(0, 255).astype(np.uint8)
Image.fromarray(rgb).save(ROOT / 'texture.png')
Image.fromarray(normal_rgb).save(ROOT / 'normal.png')

metadata = {
    'repeatWidthIn': WIDTH_IN,
    'repeatHeightIn': HEIGHT_IN,
    'depthIn': DEPTH_IN,
    'note': 'No manufacturer specs were published; the diagram’s 22.48 × 25.98 in felt backing with nine staggered hexagons gives approximately 7.49 in column spacing and 8.66 in vertical pitch, with this tile spanning two columns and three pitches (width rounded to preserve pixel aspect). Regular hexagon faces about 9.30 × 8.05 in, 0.40 in total thickness and 0.24 in face relief are estimates; walnut color is sampled from the main photo and gaps are black felt.',
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.50, 0.60, 0.75])
light /= np.linalg.norm(light)
lambert = np.maximum(normal @ light, 0)
shaded = np.round((0.24 + 0.76 * lambert)[..., None] * 225).clip(0, 255).astype(np.uint8)
shaded = np.repeat(shaded, 3, axis=2)
panel_size = (W // 3, H // 3)
albedo_tile = Image.fromarray(rgb).resize(panel_size, Image.Resampling.LANCZOS)
normal_tile = Image.fromarray(shaded).resize(panel_size, Image.Resampling.LANCZOS)
panel_w, panel_h = panel_size[0] * 3, panel_size[1] * 3
preview = Image.new('RGB', (panel_w * 2 + 36, panel_h + 48), '#eeeae5')
draw = ImageDraw.Draw(preview)
draw.text((10, 14), 'COLOR MAP / 3 x 3', fill='#222222')
draw.text((panel_w + 30, 14), 'NORMAL RELIEF / UPPER-LEFT LIGHT / 3 x 3', fill='#222222')
for row in range(3):
    for col in range(3):
        preview.paste(albedo_tile, (col * panel_size[0], 42 + row * panel_size[1]))
        preview.paste(normal_tile, (panel_w + 36 + col * panel_size[0], 42 + row * panel_size[1]))
preview.save(ROOT / 'preview.png')
print(json.dumps(metadata, indent=2))
for name, arr in [('color', rgb), ('normal', normal_rgb)]:
    print(name, 'mean boundary differences, x/y:',
          round(float(np.abs(arr[:, 0].astype(float) - arr[:, -1]).mean()), 3),
          round(float(np.abs(arr[0].astype(float) - arr[-1]).mean()), 3))
