from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent
W, H = 896, 1792
WIDTH, HEIGHT = 11.8, 23.6
SLATS = 7
PITCH = WIDTH / SLATS
FACE = PITCH * 0.75
rng = np.random.default_rng(23871)


def noise(shape, sy, sx):
    n = gaussian_filter(rng.standard_normal(shape), (sy, sx), mode='wrap')
    return n / max(n.std(), 1e-8)


# Face-only samples avoid the cast shadows along the felt edges.
source = Image.open(ROOT / 'main.jpg').convert('RGB')
mask = Image.new('L', source.size)
ImageDraw.Draw(mask).polygon([(800, 628), (1400, 446), (1420, 482), (850, 666)], fill=255)
samples = np.asarray(source)[np.asarray(mask) > 0]
wood_color = np.median(samples, axis=0)
felt_color = np.array([43., 44., 44.])
color = np.empty((H, W, 3), dtype=float)
height = np.empty((H, W), dtype=float)
slat_px = W // SLATS
v = np.arange(H)[:, None] / H
u = (np.arange(slat_px)[None, :] + 0.5) / slat_px
slat_tones = [-1.8, 2.3, -0.8, 3.0, -2.4, 0.7, -0.5]

for i in range(SLATS):
    shape = (H, slat_px)
    broad = noise(shape, 140, 13)
    medium = noise(shape, 33, 2.2)
    fibers = noise(shape, 17, 0.48)
    pores = noise(shape, 2.8, 0.45)
    warp = noise(shape, 100, 7) * 0.23
    sweep = 0.35 * np.sin(2 * np.pi * (v + i * .143))
    phase = u * 13 + warp + sweep
    if i in (1, 3, 6):
        center = [.42, .58, .37][(1, 3, 6).index(i)]
        arch = np.sin(np.pi * (v + .11 * i)) ** 2
        phase = np.sqrt(((u - center) * 13) ** 2 + arch * 29 + 0.08) + warp * .22
    ring = np.sin(2 * np.pi * phase)
    fine_ring = np.sin(2 * np.pi * (phase * 2.13 + medium * .08))
    vessel = np.maximum(0, -ring - .45) ** 2
    tone = broad * 1.7 + medium * 1.15 + fibers * .9 + pores * .42
    tone += ring * .9 + fine_ring * .45 - vessel * 5
    wood = wood_color + slat_tones[i] + tone[..., None] * np.array([1.0, .91, .76])
    felt = felt_color + noise(shape, .7, .7)[..., None] * 1.1
    distance = (0.375 - np.abs(u - .5)) * PITCH
    bevel = np.clip(distance / .012, 0, 1)
    bevel = bevel * bevel * (3 - 2 * bevel)
    face_mask = distance > 0
    color[:, i*slat_px:(i+1)*slat_px] = np.where(face_mask[..., None], wood, felt)
    # Thin veneer on felt: only the veneer relief, not a thick rigid wood core.
    height[:, i*slat_px:(i+1)*slat_px] = bevel * .022 + np.where(
        face_mask, fibers * .00028 + medium * .00018 - vessel * .0003,
        noise(shape, .7, .7) * .00045)

rgb = np.uint8(np.clip(np.rint(color), 0, 255))
Image.fromarray(rgb).save(ROOT / 'texture.png')
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH / W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT / H)
normal = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
normal_rgb = np.uint8(np.clip(np.rint((normal * .5 + .5) * 255), 0, 255))
Image.fromarray(normal_rgb).save(ROOT / 'normal.png')
metadata = {
    'repeatWidthIn': WIDTH,
    'repeatHeightIn': HEIGHT,
    'depthIn': .35,
    'note': 'Seven slats and an approximately 3:1 face-to-gap ratio are estimated from the sole listing photo: 1.264 in faces, 0.421 in gaps, and 1.686 in pitch across the recorded 11.8 in panel width; tile height is 23.6 in and recorded total thickness is 0.35 in. Warm muted white oak is sampled from the main photo over charcoal black felt, with thin veneer relief rather than a rigid wood core.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')
light = np.array([-.48, .58, .66])
light /= np.linalg.norm(light)
shade = .36 + .64 * np.maximum(0, normal @ light)
linear_color = (rgb / 255.) ** 2.2
lit = np.uint8(np.clip((linear_color * shade[..., None]) ** (1/2.2) * 255, 0, 255))
thumb = (336, 672)
flat_tile = Image.fromarray(rgb).resize(thumb, Image.Resampling.LANCZOS)
shaded_tile = Image.fromarray(lit).resize(thumb, Image.Resampling.LANCZOS)
preview = Image.new('RGB', (2016, 2054), (240, 240, 240))
draw = ImageDraw.Draw(preview)
draw.text((12, 12), 'COLOR MAP - 3 x 3 tiles', fill=(30, 30, 30))
draw.text((1020, 12), 'NORMAL-SHADED MATERIAL - upper-left light - 3 x 3 tiles', fill=(30, 30, 30))
for y in range(3):
    for x in range(3):
        preview.paste(flat_tile, (x*336, 38+y*672))
        preview.paste(shaded_tile, (1008+x*336, 38+y*672))
preview.save(ROOT / 'preview.png')
print(f'Wood sample RGB: {wood_color.tolist()}')
print(f'Created {W} x {H} maps; {WIDTH} x {HEIGHT} in, {SLATS} slats')
for name, a in [('color', rgb.astype(float)), ('normal', normal_rgb.astype(float))]:
    print(name, 'boundary mean differences x/y:', round(np.abs(a[:, 0]-a[:, -1]).mean(), 3), round(np.abs(a[0]-a[-1]).mean(), 3))
assert W / H == WIDTH / HEIGHT
