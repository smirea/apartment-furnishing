from pathlib import Path
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
REPEAT_W, REPEAT_H = 11.8, 23.6
SLATS = 7
PITCH = REPEAT_W / SLATS
FACE = 1.18
DEPTH = 0.75
rng = np.random.default_rng(4173)


def noise(shape, sy, sx):
    a = gaussian_filter(rng.normal(size=shape), (sy, sx), mode='wrap')
    return a / max(a.std(), 1e-8)


def palette():
    photo = Image.open(ROOT / 'main.jpg').convert('RGB').resize((1600, 1600))
    regions = [
        [(1190, 986), (1500, 884), (1500, 915), (1190, 1018)],
        [(1050, 821), (1490, 680), (1490, 718), (1050, 860)],
    ]
    samples = []
    for polygon in regions:
        mask = Image.new('L', photo.size)
        ImageDraw.Draw(mask).polygon(polygon, fill=255)
        pixels = np.asarray(photo)[np.asarray(mask) > 0]
        samples.append(np.median(pixels, axis=0))
    # Only color statistics are retained; perspective and photographic lighting never enter the tile.
    base = np.median(samples, axis=0)
    print('Main-photo face medians:', samples, 'chosen:', base)
    return base


y, x = np.mgrid[:H, :W].astype(float)
x_inches = x / W * REPEAT_W
phase = (x_inches + PITCH / 2) % PITCH - PITCH / 2
slat_ids = np.floor((x_inches + PITCH / 2) / PITCH).astype(int) % SLATS
edge = FACE / 2 - np.abs(phase)
coverage = np.clip(edge / (REPEAT_W / W) + 0.5, 0, 1)
base = palette()
wood = np.zeros((H, W))
relief = np.zeros((H, W))
slat_tones = rng.normal(0, 3.0, SLATS)

for i in range(SLATS):
    broad = noise((H, W), 100, 13)
    long = noise((H, W), 42, 2.6)
    fine = noise((H, W), 9, 0.65)
    warp = noise((H, W), 130, 18) * 7
    coords = [y, (x + warp) % W]
    long = map_coordinates(long, coords, order=1, mode='grid-wrap')
    fine = map_coordinates(fine, coords, order=1, mode='grid-wrap')
    pores = np.maximum(-fine - 0.55, 0) ** 1.3
    center = rng.uniform(0, 1)
    cross = phase / FACE - rng.uniform(0.7, 1.8)
    length = np.sin(np.pi * (y / H - center)) * rng.uniform(3, 5)
    rings = np.sin(np.sqrt(cross ** 2 + length ** 2) * 22 + broad * 0.25)
    grain = broad * 2.1 + long * 3.1 + fine * 1.2 - pores * 2.7 + rings * 1.5
    selected = slat_ids == i
    wood[selected] = (grain + slat_tones[i])[selected]
    relief[selected] = (long * 0.0005 - pores * 0.0009)[selected]

felt = noise((H, W), 0.55, 0.55) * 1.1 + noise((H, W), 3, 3) * 0.45
wood_rgb = base + wood[..., None] * np.array([1.0, 0.98, 0.95])
felt_rgb = np.array([31, 31, 30]) + felt[..., None]
color = wood_rgb * coverage[..., None] + felt_rgb * (1 - coverage[..., None])

# The backing is estimated at 0.20 in; the remaining 0.55 in is the slat relief.
bevel = 0.035
height = 0.20 + 0.55 * np.clip(edge / bevel, 0, 1)
height += relief * coverage + felt * 0.00015 * (1 - coverage)
dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * REPEAT_W / W)
dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * REPEAT_H / H)
# Image rows point down; OpenGL tangent-space green points up.
normals = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
normal_rgb = np.rint((normals + 1) * 127.5).clip(0, 255).astype('uint8')
color_rgb = np.rint(color).clip(0, 255).astype('uint8')
Image.fromarray(color_rgb).save(ROOT / 'texture.png')
Image.fromarray(normal_rgb).save(ROOT / 'normal.png')
metadata = {
    'repeatWidthIn': REPEAT_W,
    'repeatHeightIn': REPEAT_H,
    'depthIn': DEPTH,
    'note': 'No manufacturer spec sheet was published: estimated 7 slats per recorded 11.8 in panel, with 1.18 in faces, 0.506 in black-felt gaps and 1.686 in pitch; total depth is the recorded 0.75 in (backing and chamfer profile estimated). The tile spans 7 pitches by 23.6 in, with procedural wrapping grain and grey-oak tones sampled only from the main listing photo.',
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.55, 0.6, 0.8])
light /= np.linalg.norm(light)
shade = 0.28 + 0.72 * np.maximum(normals @ light, 0)
linear = np.where(color / 255 <= 0.04045, color / 255 / 12.92, ((color / 255 + 0.055) / 1.055) ** 2.4)
shaded = linear * shade[..., None]
shaded = np.where(shaded <= 0.0031308, shaded * 12.92, 1.055 * shaded ** (1 / 2.4) - 0.055)
shaded_rgb = np.rint(shaded * 255).clip(0, 255).astype('uint8')
thumb = (256, 512)
left = Image.fromarray(color_rgb).resize(thumb, Image.Resampling.LANCZOS)
right = Image.fromarray(shaded_rgb).resize(thumb, Image.Resampling.LANCZOS)
preview = Image.new('RGB', (1536, 1572), (242, 242, 242))
draw = ImageDraw.Draw(preview)
draw.text((12, 10), 'COLOR / 3 x 3', fill=(25, 25, 25))
draw.text((780, 10), 'NORMAL-LIT / UPPER LEFT / 3 x 3', fill=(25, 25, 25))
for row in range(3):
    for col in range(3):
        preview.paste(left, (col * 256, 36 + row * 512))
        preview.paste(right, (768 + col * 256, 36 + row * 512))
preview.save(ROOT / 'preview.png')
assert W / H == REPEAT_W / REPEAT_H
for name, a in [('color', color_rgb), ('normal', normal_rgb)]:
    h_seam = np.abs(a[0].astype(float) - a[-1]).mean()
    v_seam = np.abs(a[:, 0].astype(float) - a[:, -1]).mean()
    print(f'{name}: top/bottom difference {h_seam:.3f}, left/right {v_seam:.3f}')
print(f'Wrote {W} x {H} maps, {SLATS} slats, {PITCH:.6f} in pitch.')
