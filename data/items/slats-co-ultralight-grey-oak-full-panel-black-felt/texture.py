import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1600, 2000
WIDTH_MM, HEIGHT_MM = 600.0, 750.0
rng = np.random.default_rng(4107)


def noise(sy, sx):
    a = gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), (sy, sx), mode='wrap')
    return a / max(float(a.std()), 1e-8)


def save(name, a):
    Image.fromarray(np.clip(np.rint(a), 0, 255).astype(np.uint8)).save(ROOT / name)


# Sample only veneer, away from the black edge, props and strong cast shadows.
photo = np.asarray(Image.open(ROOT / 'main.jpg').convert('RGB'), dtype=np.float32)
samples = np.concatenate([photo[250:550, 850:1350].reshape(-1, 3),
                          photo[600:850, 1050:1450].reshape(-1, 3)])
base = np.median(samples, axis=0)
y, x = np.mgrid[:H, :W].astype(np.float32)
warp = 4.5 * noise(160, 36) + 1.8 * np.sin(2 * np.pi * y / H)
coords = [y, np.mod(x + warp, W)]
fibres = map_coordinates(noise(100, 0.7), coords, order=1, mode='grid-wrap')
long_grain = map_coordinates(noise(240, 2.6), coords, order=1, mode='grid-wrap')
broad_grain = map_coordinates(noise(150, 14), coords, order=1, mode='grid-wrap')
pores = np.maximum(-fibres - 0.9, 0) * np.clip(0.65 + 0.22 * noise(17, 1.0), 0, 1)
fine = noise(2.8, 0.45)
variation = 2.3 * fibres + 2.6 * long_grain + 1.7 * broad_grain - 3.1 * pores + 0.6 * fine
panel_index = (x // (W / 2)).astype(int)
panel_tone = np.array([-1.2, 1.2])[panel_index]
wood = base[None, None, :] + (variation + panel_tone)[..., None] * np.array([1.0, 0.98, 0.94])

# Butt joints are 90-degree V profiles, not slots through the entire 9mm panel.
x_mm = (x + 0.5) * WIDTH_MM / W
joint_distance = np.abs((x_mm + 150) % 300 - 150)
chamfer = np.clip((1.5 - joint_distance) / 1.5, 0, 1)
felt = np.array([30.0, 30.0, 29.0]) + noise(0.6, 0.6)[..., None] * 1.1
color = wood * (1 - chamfer[..., None]) + felt * chamfer[..., None]
height_mm = 9.0 - 1.5 * chamfer + (0.006 * fibres - 0.008 * pores + 0.002 * fine) * (1 - chamfer)
dx = (np.roll(height_mm, -1, axis=1) - np.roll(height_mm, 1, axis=1)) / (2 * WIDTH_MM / W)
dy = (np.roll(height_mm, -1, axis=0) - np.roll(height_mm, 1, axis=0)) / (2 * HEIGHT_MM / H)
# Image rows point down; the OpenGL tangent Y axis points up.
normals = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
save('texture.png', color)
save('normal.png', (normals * 0.5 + 0.5) * 255)
metadata = {
    'repeatWidthIn': WIDTH_MM / 25.4,
    'repeatHeightIn': HEIGHT_MM / 25.4,
    'depthIn': 9 / 25.4,
    'note': 'Manufacturer spec overrides photo estimates: two 300mm (11.811in) pitches, each a continuous 297mm (11.693in) veneer face with no internal slats and a 3mm (0.118in) wide, 1.5mm deep 90-degree V reveal at joins, on 9mm black felt; the tile spans 600 x 750mm without horizontal end joints. Grey oak tone is sampled from main.jpg, rather than the spec\'s White Oak/Walnut finish names or other gallery colors; the spec says Accent cannot wrap a column (standard UltraLight Slat is required), and 94.49in panels do not span a 10ft wall height.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')
light = np.array([-0.48, 0.55, 0.68])
light /= np.linalg.norm(light)
illumination = 0.28 + 0.72 * np.maximum(normals @ light, 0)
shade = np.clip(185 * illumination[..., None] * np.array([0.98, 0.99, 1.0]), 0, 255)
preview = Image.new('RGB', (1960, 1240), '#e9e7e3')
draw = ImageDraw.Draw(preview)
for name, pixels, left in [('Color map: 3 x 3', color, 20), ('Normal map shaded: upper-left light, 3 x 3', shade, 1000)]:
    tile = Image.fromarray(np.clip(pixels, 0, 255).astype(np.uint8)).resize((312, 390), Image.Resampling.LANCZOS)
    draw.text((left, 12), name, fill='#242424')
    for row in range(3):
        for col in range(3):
            preview.paste(tile, (left + col * 312, 40 + row * 390))
preview.save(ROOT / 'preview.png')

assert W / H == WIDTH_MM / HEIGHT_MM
assert np.isfinite(normals).all()
for axis, label in [(0, 'vertical'), (1, 'horizontal')]:
    edge = np.abs(np.take(color, 0, axis=axis) - np.take(color, -1, axis=axis)).mean()
    neighbor = np.abs(color - np.roll(color, 1, axis=axis)).mean()
    print(f'{label} seam mean RGB step: {edge:.3f}; average adjacent step: {neighbor:.3f}')
print(f'Veneer sample RGB: {base.tolist()}')
print(f'Wrote 1600 x 2000 maps, {WIDTH_MM / 25.4:.6f} x {HEIGHT_MM / 25.4:.6f} inches, and preview.png')
