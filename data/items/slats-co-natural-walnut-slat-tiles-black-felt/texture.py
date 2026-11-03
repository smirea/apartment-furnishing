from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
RW, RH = 12.6, 25.2
PITCH, FACE, DEPTH = 1.575, 1.125, 0.83
rng = np.random.default_rng(7319)


def noise(sy, sx):
    a = gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), (sy, sx), mode='wrap')
    return a / max(float(a.std()), 1e-8)


def save(name, a):
    Image.fromarray(np.uint8(np.clip(a, 0, 255))).save(ROOT / name)


photo = np.asarray(Image.open(ROOT / 'main.jpg').convert('RGB').resize((1600, 1600), Image.Resampling.LANCZOS), dtype=float)
# Sample face interiors only; the plant and cast shadows are outside these patches.
palette = np.array([np.median(photo[740:1070, x-5:x+6], axis=(0, 1))
                    for x in [583, 609, 636, 662, 689, 715, 742, 768]])
print('Main-photo face RGB medians:', np.round(palette).tolist())
palette = palette.mean(axis=0) + 0.65 * (palette - palette.mean(axis=0))
order = rng.permutation(8)
y, x = np.mgrid[:H, :W]
xin = (x + 0.5) * RW / W
local = (xin % PITCH) - PITCH / 2
slat = np.floor(xin / PITCH).astype(int)
d = FACE / 2 - np.abs(local)
coverage = np.clip(d / (RW / W) + 0.5, 0, 1)

broad = noise(150, 9)
fibers = noise(27, 0.65)
pores = noise(5, 0.45)
warp = 3.0 * noise(110, 15) + 0.7 * noise(40, 5)
phase = x * 1.23 + warp
ridges = np.maximum(0, np.cos(phase)) ** 14
broken = np.clip(noise(12, 1.2) + 0.35, 0, 1)
variation = 5.0 * broad + 3.0 * fibers + 1.0 * pores - 8.0 * ridges * broken
wood = palette[order[slat]] + variation[..., None] * np.array([1.0, 0.88, 0.75])
feltgrain = 1.1 * noise(0.45, 0.6) + 0.6 * noise(1.5, 1.0)
felt = np.array([16.0, 15.5, 15.0]) + feltgrain[..., None]
albedo = wood * coverage[..., None] + felt * (1 - coverage[..., None])
save('texture.png', albedo)

# Heights are in inches, so derivatives use real-world texel spacing.
bevel = np.clip(d / 0.045, 0, 1)
bevel = bevel * bevel * (3 - 2 * bevel)
height = 0.46 * bevel + coverage * (0.00065 * fibers + 0.00035 * pores - 0.0006 * ridges * broken)
height += (1 - coverage) * 0.00035 * feltgrain
dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * RW / W)
dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * RH / H)
# Image rows point down; OpenGL tangent-space green points up.
normal = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
save('normal.png', (normal * 0.5 + 0.5) * 255 + 0.5)

note = ('No manufacturer specifications were published: the dimension diagram gives a 12.60 × 47.24 in panel with 8 slats (1.575 in pitch); photo proportions suggest 1.125 in faces, 0.45 in straight felt gaps and lightly eased edges, while 0.83 in total thickness is an unverified estimate. '
        'This seamless tile is 8 pitches wide and 25.20 in tall, using walnut face tones sampled from the main listing photo and near-black felt; the installed pattern has no visible horizontal joint.')
(ROOT / 'texture.json').write_text(json.dumps(dict(repeatWidthIn=RW, repeatHeightIn=RH, depthIn=DEPTH, note=note), indent=2) + '\n')

light = np.array([-0.5, 0.6, 0.8])
light /= np.linalg.norm(light)
shade = 0.28 + 0.72 * np.maximum(0, normal @ light)
shaded = np.ones_like(albedo) * np.array([183, 171, 151]) * shade[..., None]
preview = Image.new('RGB', (1536, 1578), '#eeeeee')
for column, a in enumerate([albedo, shaded]):
    tile = Image.fromarray(np.uint8(np.clip(a, 0, 255))).resize((256, 512), Image.Resampling.LANCZOS)
    for i in range(3):
        for j in range(3):
            preview.paste(tile, (column * 768 + i * 256, 42 + j * 512))
draw = ImageDraw.Draw(preview)
draw.text((16, 14), 'COLOR MAP / 3 x 3 / 37.8 x 75.6 in', fill='black')
draw.text((784, 14), 'NORMAL MAP SHADED / LIGHT UPPER LEFT / 3 x 3', fill='black')
preview.save(ROOT / 'preview.png')
assert W / H == RW / RH
assert round(RW / PITCH) == 8
for name in ['texture.png', 'normal.png']:
    a = np.asarray(Image.open(ROOT / name), dtype=float)
    print(name, Image.open(ROOT / name).size,
          'edge differences x/y:', round(float(np.abs(a[:, 0] - a[:, -1]).mean()), 3),
          round(float(np.abs(a[0] - a[-1]).mean()), 3))
print('Wrote texture.png, normal.png, texture.json, preview.png')
