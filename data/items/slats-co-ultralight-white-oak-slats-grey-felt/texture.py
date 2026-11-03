from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

OUT = Path(__file__).resolve().parent
W, H = 1024, 2048
SLATS = 7
FACE, GAP = 1.20, 0.49
PITCH = FACE + GAP
WIDTH = SLATS * PITCH
HEIGHT = WIDTH * H / W
rng = np.random.default_rng(4127)


def noise(shape, sy, sx):
    a = gaussian_filter(rng.standard_normal(shape), (sy, sx), mode='wrap')
    return (a - a.mean()) / max(a.std(), 1e-8)


def sample(poly):
    source = Image.open(OUT / 'main.jpg').convert('RGB')
    mask = Image.new('L', source.size)
    ImageDraw.Draw(mask).polygon(poly, fill=255)
    return np.median(np.asarray(source)[np.asarray(mask) > 0], axis=0)


oak = sample([(650, 683), (709, 724), (1450, 499), (1390, 458)])
felt = sample([(650, 635), (660, 652), (1460, 408), (1450, 391)])
y = (np.arange(H) + .5)[:, None] / H
x_in = (np.arange(W) + .5) / W * WIDTH
phase = np.mod(x_in, PITCH)
# The tile boundary is the V apex, matching the factory half-groove joint.
distance = np.maximum(GAP / 2 - phase, phase - (GAP / 2 + FACE))
wood = distance <= 0
height_profile = np.where(wood, 0.0, -np.minimum(distance, GAP / 2))
height_profile = gaussian_filter(height_profile, .55, mode='wrap')
color = np.zeros((H, W, 3), dtype=np.float64)
relief = np.zeros((H, W), dtype=np.float64)
for i in range(SLATS):
    cols = np.flatnonzero((x_in >= i * PITCH) & (x_in < (i + 1) * PITCH))
    n = len(cols)
    u = ((x_in[cols] - i * PITCH - GAP / 2) / FACE)[None, :]
    broad = noise((H, n), 160, 13)
    fine = noise((H, n), 22, .7)
    warp = noise((H, n), 115, 8) * .13
    wander = .045 * np.sin(2 * np.pi * y + rng.uniform(0, 6.28))
    rings = (u + warp + wander) * rng.uniform(21, 29)
    # Periodic ring contours form subtle oak crowns without an end-grain motif.
    center = rng.uniform(-.5, 1.5)
    crown = np.sqrt(((u - center) * 1.6) ** 2 + (.65 + .48 * np.cos(2 * np.pi * y + rng.uniform(0, 6.28))) ** 2)
    ringphase = rings * .40 + crown * 17
    pores = np.maximum(0, np.cos(2 * np.pi * ringphase)) ** 16
    hair = np.maximum(0, np.sin(2 * np.pi * (rings * 2.5 + fine * .12))) ** 24
    grain = broad * 1.7 + fine * .9 - (pores - pores.mean()) * 6 - (hair - hair.mean()) * 3
    tone = rng.normal(0, 1.7)
    color[:, cols] = oak + (grain + tone)[..., None] * np.array([1, .96, .87])
    relief[:, cols] = broad * .00009 + fine * .00007 - pores * .00028

felt_noise = noise((H, W), .65, .65)
fiber = noise((H, W), 1.8, .4)
felt_color = felt + (felt_noise * 3.0 + fiber * 1.2)[..., None]
color[:, ~wood] = felt_color[:, ~wood]
relief[:, ~wood] = felt_noise[:, ~wood] * .00020
height = height_profile[None, :] + relief

dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH / W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT / H)
# Image rows run downward; tangent-space green points upward (OpenGL).
normals = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
albedo = np.clip(np.rint(color), 0, 255).astype('uint8')
encoded = np.clip(np.rint((normals * .5 + .5) * 255), 0, 255).astype('uint8')
Image.fromarray(albedo).save(OUT / 'texture.png')
Image.fromarray(encoded).save(OUT / 'normal.png')
note = ('Spec-sheet dimensions override photo estimates: seven 1.20 in oak faces with 0.49 in, 90-degree V-grooves (6.2 mm deep, 2.8 mm felt remaining), 0.35 in total depth, and no rigid core; seven 1.69 in pitches give an 11.83 in tile, a 0.03 in discrepancy with the listed 11.80 in panel width. Muted white-oak and neutral grey-felt colors are sampled from main.jpg; grain is procedural and both axes wrap seamlessly.')
(OUT / 'texture.json').write_text(json.dumps(dict(repeatWidthIn=WIDTH, repeatHeightIn=HEIGHT, depthIn=.35, note=note), indent=2) + '\n')

light = np.array([-.55, .65, .75]); light /= np.linalg.norm(light)
shade = .33 + .67 * np.maximum(0, normals @ light)
linear = (albedo / 255) ** 2.2
lit = np.clip((linear * shade[..., None]) ** (1 / 2.2) * 255, 0, 255).astype('uint8')
size = (384, 768)
color_small = Image.fromarray(albedo).resize(size, Image.Resampling.LANCZOS)
shade_small = Image.fromarray(lit).resize(size, Image.Resampling.LANCZOS)
preview = Image.new('RGB', (2304, 2338), '#eeeeee')
draw = ImageDraw.Draw(preview)
draw.text((12, 10), 'ALBEDO / 3 x 3 tiles', fill='#222222')
draw.text((1164, 10), 'NORMAL-MAP LIGHTING / upper-left light / 3 x 3 tiles', fill='#222222')
for iy in range(3):
    for ix in range(3):
        preview.paste(color_small, (ix * 384, 34 + iy * 768))
        preview.paste(shade_small, (1152 + ix * 384, 34 + iy * 768))
preview.save(OUT / 'preview.png')
for name, data in [('albedo', albedo), ('normal', encoded)]:
    a = data.astype(float)
    print(name, 'boundary mean differences x/y:', np.abs(a[:, 0] - a[:, -1]).mean().round(3), np.abs(a[0] - a[-1]).mean().round(3))
print(f'{W} x {H}; {WIDTH:.2f} x {HEIGHT:.2f} in; oak {oak}; felt {felt}')
