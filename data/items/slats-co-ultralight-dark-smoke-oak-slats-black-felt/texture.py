import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
SLATS, FACE, GAP = 7, 1.20, 0.49
PITCH = FACE + GAP
WIDTH, HEIGHT = SLATS * PITCH, SLATS * PITCH * 2
rng = np.random.default_rng(314159)
y, x = np.mgrid[:H, :W].astype(np.float64)


def field(nx, ny):
    grid = rng.normal(size=(ny, nx))
    result = map_coordinates(grid, [y * ny / H, x * nx / W],
                             order=3, mode='grid-wrap')
    return (result - result.mean()) / result.std()


# Every noise field is periodic; grain distortion also closes at the tile boundary.
warp = 2.8 * field(12, 5) + 0.8 * field(32, 11)
warped_x = x + warp
broad = field(35, 7)
long_grain = field(190, 12)
fibers = field(480, 75)
fine = field(750, 430)
flow = np.sin(2 * np.pi * (warped_x * 230 / W + 0.20 * field(22, 9)))
flow2 = np.sin(2 * np.pi * (warped_x * 391 / W + 0.13 * field(37, 14)))
pores = np.maximum(0, field(360, 95) - 1.15) ** 1.3
pores *= 0.5 + 0.5 * np.clip(field(75, 35), 0, 1)

local = ((x + 0.5) / W * WIDTH) % PITCH
from_center = np.abs(local - PITCH / 2)
wood = from_center <= FACE / 2
slat_index = np.floor((x + 0.5) / W * SLATS).astype(int)
slat_tones = np.array([-1.5, 2.0, -3.0, 0.4, 3.0, -0.6, 1.2])
tone = slat_tones[slat_index]
variation = (2.6 * broad + 2.8 * long_grain + 1.5 * fibers
             + 0.65 * fine + 1.1 * flow + 0.6 * flow2 - 4.5 * pores + tone)
# Palette measured only on the main listing photo's unobstructed veneer faces.
base = np.array([83.0, 72.0, 63.0])
color_wood = base + variation[..., None] * np.array([1.0, 0.91, 0.80])
color_wood += broad[..., None] * np.array([0.55, 0.05, -0.35])
felt_noise = field(700, 1100)
felt = np.array([32.0, 33.0, 34.0]) + felt_noise[..., None] * 1.6
color = np.where(wood[..., None], color_wood, felt)
color = np.uint8(np.clip(np.rint(color), 0, 255))

# The surface is veneer on felt, with 45-degree cuts rather than rigid slat sides.
groove_depth_mm = np.clip((from_center - FACE / 2) * 25.4, 0, 6.2)
height_mm = 9.0 - groove_depth_mm
micro_wood = (0.009 * long_grain + 0.008 * fibers + 0.003 * fine
              - 0.018 * pores)
height_mm += np.where(wood, micro_wood, 0.009 * felt_noise)
height_mm = gaussian_filter(height_mm, sigma=(0.0, 0.42), mode='wrap')
dx = WIDTH * 25.4 / W
dy = HEIGHT * 25.4 / H
sx = (np.roll(height_mm, -1, axis=1) - np.roll(height_mm, 1, axis=1)) / (2 * dx)
sy = (np.roll(height_mm, -1, axis=0) - np.roll(height_mm, 1, axis=0)) / (2 * dy)
# Image rows point down; tangent-space +Y points up (OpenGL).
normals = np.stack([-sx, sy, np.ones_like(sx)], axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
normal_rgb = np.uint8(np.clip(np.rint((normals * 0.5 + 0.5) * 255), 0, 255))
Image.fromarray(color).save(ROOT / 'texture.png')
Image.fromarray(normal_rgb).save(ROOT / 'normal.png')
metadata = {
    'repeatWidthIn': round(WIDTH, 2),
    'repeatHeightIn': round(HEIGHT, 2),
    'depthIn': 0.35,
    'note': 'Manufacturer specifications override photo estimates: seven 1.20 in faces on a 1.69 in pitch with 0.49 in, 90-degree V-grooves cut 6.2 mm deep, leaving 2.8 mm felt, and 0.35 in total depth; these exact face/groove sizes total 11.83 in rather than the inconsistent listed 11.80 in panel width. The tile is seven pitches wide and 23.66 in tall, with periodic procedural oak grain and dark smoked-brown veneer/black felt colors sampled from the main listing photo.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.45, 0.55, 0.80])
light /= np.linalg.norm(light)
shading = 0.28 + 0.72 * np.maximum(0, normals @ light)
linear = np.where(color / 255 <= 0.04045, color / 255 / 12.92,
                  ((color / 255 + 0.055) / 1.055) ** 2.4)
shaded_linear = linear * shading[..., None]
shaded = np.where(shaded_linear <= 0.0031308, shaded_linear * 12.92,
                  1.055 * shaded_linear ** (1 / 2.4) - 0.055)
shaded = np.uint8(np.clip(np.rint(shaded * 255), 0, 255))
thumb = (307, 614)
flat_thumb = Image.fromarray(color).resize(thumb, Image.Resampling.LANCZOS)
shaded_thumb = Image.fromarray(shaded).resize(thumb, Image.Resampling.LANCZOS)
preview = Image.new('RGB', (thumb[0] * 6 + 24, thumb[1] * 3 + 40), '#dddddd')
draw = ImageDraw.Draw(preview)
draw.text((12, 12), 'COLOR MAP / 3 x 3', fill='#222222')
draw.text((thumb[0] * 3 + 24, 12), 'NORMAL-MAP LIGHTING / 3 x 3 / UPPER LEFT', fill='#222222')
for row in range(3):
    for col in range(3):
        preview.paste(flat_thumb, (col * thumb[0], 40 + row * thumb[1]))
        preview.paste(shaded_thumb, (thumb[0] * 3 + 24 + col * thumb[0], 40 + row * thumb[1]))
preview.save(ROOT / 'preview.png')
assert W / H == WIDTH / HEIGHT
assert color.shape == normal_rgb.shape == (H, W, 3)
for name, values in [('color', color.astype(float)), ('normal', normal_rgb.astype(float))]:
    print(name, 'wrap deltas x/y:',
          round(np.abs(values[:, 0] - values[:, -1]).mean(), 3),
          round(np.abs(values[0] - values[-1]).mean(), 3))
print(json.dumps(metadata, indent=2))
