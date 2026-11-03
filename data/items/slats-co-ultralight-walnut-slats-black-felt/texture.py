from pathlib import Path
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
SLATS = 7
FACE, GAP = 1.20, 0.49
PITCH = FACE + GAP
WIDTH, HEIGHT = SLATS * PITCH, SLATS * PITCH * 2
DEPTH = 0.35
GROOVE_DEPTH = 6.2 / 25.4
rng = np.random.default_rng(32061)


def noise(shape, sy, sx):
    a = gaussian_filter(rng.standard_normal(shape), (sy, sx), mode='wrap')
    return a / max(a.std(), 1e-8)


def save(name, pixels):
    Image.fromarray(np.uint8(np.clip(pixels, 0, 255))).save(ROOT / name)


y, x = np.mgrid[:H, :W]
xin = (x + 0.5) * WIDTH / W
yin = (y + 0.5) * HEIGHT / H
phase = np.mod(xin, PITCH)
# Tile boundaries pass through the groove apex, matching the factory half-grooves.
distance = np.minimum(phase, PITCH - phase)
face_coverage = np.clip((distance - GAP / 2) / (WIDTH / W) + 0.5, 0, 1)
groove_profile = np.clip(distance / (GAP / 2), 0, 1)
height = DEPTH - GROOVE_DEPTH * (1 - groove_profile)
height = gaussian_filter(height, (0, 0.32), mode='wrap')

# Sample only veneer from the main listing photo; gallery colorways do not set color.
source = np.array(Image.open(ROOT / 'main.jpg').convert('RGB'))
mask = Image.new('L', (source.shape[1], source.shape[0]))
ImageDraw.Draw(mask).polygon([(445, 549), (1530, 250), (1530, 313), (535, 626)], fill=255)
wood_base = np.median(source[np.array(mask) > 0], axis=0)
felt = np.array([32.0, 33.0, 33.5])
felt_noise = 0.70 * noise((H, W), 0.38, 0.38) + 0.35 * noise((H, W), 3, 3)
color = felt[None, None, :] + felt_noise[:, :, None]
wood_relief = np.zeros((H, W))

for slat in range(SLATS):
    cols = np.flatnonzero((xin[0] >= slat * PITCH) & (xin[0] < (slat + 1) * PITCH))
    n = len(cols)
    yy, xx = np.mgrid[:H, :n]
    t = yy / H
    u = xx / n
    offset = rng.uniform(0, 2 * np.pi)
    warp = 3.2 * np.sin(2 * np.pi * t + offset) + 1.7 * np.sin(4 * np.pi * t + offset * 1.7)
    warp += 1.2 * noise((H, n), 80, 14)
    coords = [yy.astype(float), np.mod(xx + warp, n)]
    fibers = map_coordinates(noise((H, n), 27, 0.62), coords, order=1, mode='grid-wrap')
    streaks = map_coordinates(noise((H, n), 100, 2.2), coords, order=1, mode='grid-wrap')
    broad = noise((H, n), 160, 12)
    # Periodic growth-ring phase gives long, gently tapering walnut figures.
    ring_phase = (u * rng.uniform(10, 16) + 1.3 * np.cos(2 * np.pi * t + offset)
                  + 0.45 * broad + 0.25 * np.sin(4 * np.pi * t + offset))
    if slat % 3 != 1:
        arch = np.sqrt((u - rng.uniform(-0.45, 1.3)) ** 2
                       + (0.22 + 0.60 * (1 - np.cos(2 * np.pi * t + offset))) ** 2)
        ring_phase = 16 * arch + 0.10 * broad + 0.045 * streaks
    rings = np.maximum(np.cos(ring_phase * 2 * np.pi), 0) ** 12
    pores = np.maximum(-fibers - 1.15, 0) ** 1.3
    fine = noise((H, n), 2.2, 0.42)
    small_fibers = noise((H, n), 7, 0.45)
    variation = (3.0 * broad + 2.8 * streaks + 3.0 * fibers - 7.5 * rings
                 - 3.3 * pores + 1.5 * fine + 1.4 * small_fibers + 1.2)
    tone = rng.normal(0, 3.2)
    tint = rng.normal(0, 0.6, 3)
    wood = wood_base + tint + (variation + tone)[:, :, None] * np.array([1.0, 0.94, 0.85])
    coverage = face_coverage[:, cols, None]
    color[:, cols] = color[:, cols] * (1 - coverage) + wood * coverage
    wood_relief[:, cols] = (fibers * 0.00012 - pores * 0.00012 + fine * 0.000035)

height += wood_relief * face_coverage + felt_noise * (1 - face_coverage) * 0.00006
# Image rows point down; OpenGL's tangent +Y points up.
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH / W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT / H)
normals = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
save('texture.png', color)
save('normal.png', (normals * 0.5 + 0.5) * 255 + 0.5)
metadata = {
    'repeatWidthIn': round(WIDTH, 4),
    'repeatHeightIn': round(HEIGHT, 4),
    'depthIn': DEPTH,
    'note': 'Manufacturer spec overrides photo estimates: 7 slats, 1.20 in faces + 0.49 in grooves = 1.69 in pitch; 90-degree V-grooves cut 6.2 mm into 9 mm felt (2.8 mm backbone), real walnut veneer with no rigid core, and 0.35 in total depth. Tile spans 7 pitches by 23.66 in, preserving face/groove sizes despite the rounded 11.80 in panel width (7 pitches total 11.83 in); muted walnut color is sampled from the main photo, with charcoal-black felt and procedural seamless grain.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.55, 0.65, 0.85])
light /= np.linalg.norm(light)
illumination = 0.32 + 0.68 * np.maximum(normals @ light, 0)
srgb = np.clip(color / 255, 0, 1)
linear = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
shaded = linear * illumination[:, :, None]
shaded = np.where(shaded <= 0.0031308, shaded * 12.92, 1.055 * shaded ** (1 / 2.4) - 0.055)
preview = Image.new('RGB', (1536, 1576), (237, 235, 231))
for side, data in enumerate((color, shaded * 255)):
    tile = Image.fromarray(np.uint8(np.clip(data, 0, 255))).resize((256, 512), Image.Resampling.LANCZOS)
    for row in range(3):
        for col in range(3):
            preview.paste(tile, (side * 768 + col * 256, 40 + row * 512))
draw = ImageDraw.Draw(preview)
draw.text((16, 14), 'ALBEDO / 3 x 3 / each tile 11.83 x 23.66 inches', fill=(35, 35, 35))
draw.text((784, 14), 'NORMAL-SHADED / 3 x 3 / upper-left light', fill=(35, 35, 35))
preview.save(ROOT / 'preview.png')
assert W / H == WIDTH / HEIGHT
assert np.isfinite(normals).all()
print(f'Generated {W} x {H}: {WIDTH:.2f} x {HEIGHT:.2f} in, {SLATS} vertical slats; main-photo veneer RGB {wood_base.tolist()}')
print('Periodic boundary height step / max internal step:', float(abs(height[:, 0] - height[:, -1]).max()), float(abs(np.diff(height, axis=1)).max()))
