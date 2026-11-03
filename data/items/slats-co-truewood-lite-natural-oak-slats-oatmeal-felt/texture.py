import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
WIDTH_MM, HEIGHT_MM = 300.0, 600.0
rng = np.random.default_rng(71204)


def noise(shape, sigma):
    a = gaussian_filter(rng.normal(size=shape).astype(np.float32), sigma, mode='wrap')
    return a / max(float(a.std()), 1e-6)


def photo_palette():
    photo = np.asarray(Image.open(ROOT / 'main.jpg').convert('RGB'), dtype=np.float32)
    # Stay inside broad, unobstructed faces; avoid the bright bevels and recessed shadows.
    polygons = [
        [(425, 490), (1100, 301), (1100, 341), (466, 524)],
        [(552, 588), (1120, 421), (1120, 461), (593, 625)],
        [(684, 700), (1130, 561), (1130, 603), (724, 736)],
        [(815, 805), (1190, 685), (1190, 725), (852, 839)],
    ]
    colors = []
    for polygon in polygons:
        mask = Image.new('1', (photo.shape[1], photo.shape[0]))
        ImageDraw.Draw(mask).polygon(polygon, fill=1)
        colors.append(np.median(photo[np.asarray(mask, dtype=bool)], axis=0))
    colors = np.asarray(colors)
    print('Main-photo face medians:', colors.tolist())
    return np.median(colors, axis=0)


base = photo_palette()
y, x = np.mgrid[:H, :W].astype(np.float32)
pitch_px = W / 8
local = (x % pitch_px - pitch_px / 2) * (WIDTH_MM / W)
distance = 13.5 - np.abs(local)
bevel_mm = 0.5
profile = np.clip(distance / bevel_mm, 0, 1)
profile = profile * profile * (3 - 2 * profile)
coverage = np.clip(distance / (WIDTH_MM / W) + 0.5, 0, 1)

felt_fine = noise((H, W), (0.65, 0.65))
felt_soft = noise((H, W), (5, 5))
# The photo's recesses include lighting; use its warm grey hue without its dark cast shadows.
felt_base = np.array([153.0, 143.0, 130.0], dtype=np.float32)
felt = felt_base + (2.3 * felt_fine + 0.8 * felt_soft)[..., None]
wood = np.empty((H, W, 3), dtype=np.float32)
grain_height = np.zeros((H, W), dtype=np.float32)

for slat in range(8):
    a, b = slat * 128, (slat + 1) * 128
    sy, sx = np.mgrid[:H, :128].astype(np.float32)
    u, v = sx / 128, sy / H
    waviness = noise((H, 128), (135, 17))
    warp = 5.5 * waviness + 2.0 * np.sin(2 * np.pi * v + slat)
    fiber = noise((H, 128), (55, 0.65))
    fine = noise((H, 128), (9, 0.38))
    broad = noise((H, 128), (160, 9))
    coords = np.array([sy, sx + warp])
    fiber = map_coordinates(fiber, coords, mode='grid-wrap', order=1)
    fine = map_coordinates(fine, coords, mode='grid-wrap', order=1)
    center = rng.uniform(-0.5, 1.5)
    annual_phase = 2 * np.pi * (
        9 * np.sqrt((u - center + warp / 128) ** 2 + (0.22 + 0.15 * np.cos(2 * np.pi * v + slat)) ** 2)
        + 0.15 * broad
    )
    ring = np.maximum(0, np.cos(annual_phase)) ** 12
    pores = np.maximum(0, -fiber - 0.9) ** 1.4
    pore_breakup = np.clip(0.65 + 0.25 * noise((H, 128), (13, 1)), 0, 1)
    pores *= pore_breakup
    tone = rng.normal(0, 2.6)
    warmth = rng.normal(0, 0.8)
    color = base + 2.0 + np.array([tone + warmth, tone, tone - warmth])
    signal = 2.0 * broad + 2.8 * fiber + 0.9 * fine - 7.0 * ring - 12.0 * pores
    wood[:, a:b] = color + signal[..., None] * np.array([1, 0.96, 0.88])
    grain_height[:, a:b] = 0.012 * fiber + 0.005 * fine - 0.016 * pores

rgb = felt * (1 - coverage[..., None]) + wood * coverage[..., None]
height = 5 * profile + grain_height * profile + 0.013 * felt_fine * (1 - coverage)

# Texture rows run downward; OpenGL tangent +Y runs upward, hence the positive row derivative.
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH_MM / W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT_MM / H)
normals = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
normal_rgb = np.rint((normals * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)
color_image = Image.fromarray(np.rint(rgb).clip(0, 255).astype(np.uint8))
color_image.save(ROOT / 'texture.png')
Image.fromarray(normal_rgb).save(ROOT / 'normal.png')
metadata = {
    'repeatWidthIn': WIDTH_MM / 25.4,
    'repeatHeightIn': HEIGHT_MM / 25.4,
    'depthIn': 10 / 25.4,
    'note': 'Manufacturer spec sheet overrides photo estimates: 8 rectangular 27 mm oak-veneered slats with 10.5 mm exposed felt gaps on a 37.5 mm pitch, 5 mm slats over 5 mm felt (10 mm total); the installed panel repeat is 300 mm, not the 305 mm end-to-end width. This 300 x 600 mm seamless tile uses pale natural oak tones sampled from main.jpg and warm oatmeal felt, with subtle softened edges and procedural, vertically wrapping grain.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.45, 0.55, 0.8])
light /= np.linalg.norm(light)
illumination = 0.3 + 0.7 * np.clip(normals @ light, 0, 1)
shaded = np.rint(200 * illumination).clip(0, 255).astype(np.uint8)
shaded = Image.fromarray(np.repeat(shaded[..., None], 3, axis=2))
thumb = color_image.resize((320, 640), Image.Resampling.LANCZOS)
relief = shaded.resize((320, 640), Image.Resampling.LANCZOS)
preview = Image.new('RGB', (1944, 1960), '#e8e5df')
for row in range(3):
    for col in range(3):
        preview.paste(thumb, (col * 320, 40 + row * 640))
        preview.paste(relief, (984 + col * 320, 40 + row * 640))
draw = ImageDraw.Draw(preview)
draw.text((12, 14), 'COLOR MAP / 3 x 3 / 900 x 1800 mm', fill='#35302b')
draw.text((996, 14), 'NORMAL RELIEF / UPPER-LEFT LIGHT / 3 x 3', fill='#35302b')
preview.save(ROOT / 'preview.png')

assert W / H == WIDTH_MM / HEIGHT_MM
assert 8 * (27 + 10.5) == WIDTH_MM
assert np.isfinite(normals).all()
print(f'Wrote {W} x {H} maps; repeat {WIDTH_MM / 25.4:.6f} x {HEIGHT_MM / 25.4:.6f} in.')
for name, data in [('color', rgb), ('normal', normal_rgb.astype(float))]:
    seam_y = np.mean(np.abs(data[0] - data[-1]))
    internal_y = np.mean(np.abs(data[1:] - data[:-1]))
    seam_x = np.mean(np.abs(data[:, 0] - data[:, -1]))
    print(f'{name}: vertical wrap delta {seam_y:.3f}, internal row delta {internal_y:.3f}, horizontal wrap delta {seam_x:.3f}')
