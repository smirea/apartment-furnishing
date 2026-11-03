from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
REPEAT_W, REPEAT_H = 12.08, 24.16
PITCH, FACE = 1.51, 1.00
rng = np.random.default_rng(84723)


def noise(sy, sx):
    a = gaussian_filter(rng.normal(size=(H, W)), (sy, sx), mode='wrap')
    return a / max(a.std(), 1e-8)


# Only face interiors supply color; the photographic gradients are not copied.
source = Image.open(ROOT / 'main.jpg').convert('RGB')
polygons = [
    [(350, 215), (900, 49), (955, 68), (405, 236)],
    [(455, 337), (1060, 153), (1110, 173), (505, 357)],
    [(600, 447), (1250, 249), (1295, 269), (645, 467)],
    [(730, 559), (1380, 361), (1425, 381), (775, 579)],
    [(875, 675), (1490, 487), (1530, 507), (915, 695)],
    [(1030, 792), (1500, 650), (1545, 670), (1075, 812)],
]
pixels = np.asarray(source)
samples = []
for polygon in polygons:
    mask = Image.new('L', source.size)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    samples.append(np.median(pixels[np.asarray(mask) > 0], axis=0))
samples = np.array(samples)
base = np.median(samples, axis=0)
print('Sampled bamboo RGB:', base.round(1).tolist())

Y, X = np.mgrid[:H, :W]
xin = (X + .5) * REPEAT_W / W
phase = xin % PITCH
slat = np.floor(xin / PITCH).astype(int)
distance = FACE / 2 - np.abs(phase - PITCH / 2)
coverage = np.clip(distance / (REPEAT_W / W) + .5, 0, 1)

fine = noise(30, .48)
fibers = noise(115, 1.1)
bands = noise(260, 4)
broad = noise(170, 13)
warp = 1.4 * np.sin(2 * np.pi * Y / H) + .65 * np.sin(6 * np.pi * Y / H + 1.3)
fine = map_coordinates(fine, [Y, (X + warp) % W], order=1, mode='grid-wrap')
grain = 1.8 * fine + 2.2 * fibers + 1.9 * bands + .75 * broad

# Bamboo culm nodes are small, broken cross-fiber marks rather than hardwood knots.
for i in [0, 2, 3, 5, 7]:
    center_y = rng.uniform(0, H)
    cx = (i + .5) * W / 8 + rng.uniform(-16, 16)
    node_x = X - cx
    node_y = (Y - center_y + H / 2) % H - H / 2
    curve = node_y - 2.2 * np.sin(node_x * .16) - .025 * node_x**2
    envelope = np.exp(-(node_x / 23)**4)
    grain -= 5.5 * np.exp(-(curve / 2.1)**2) * envelope
    grain -= 2.0 * np.exp(-(node_y / 29)**2) * envelope * np.maximum(0, fibers)

tone = np.clip((samples.mean(axis=1) / base.mean() - 1), -.04, .04)
tone = np.resize(tone[rng.permutation(len(tone))], 8)
tone += rng.uniform(-.009, .009, 8)
wood = base[None, None, :] * (1 + tone[slat, None])
wood = wood + grain[..., None] * np.array([1.0, .83, .65])
wood += noise(.5, .5)[..., None] * .48
felt_noise = noise(.55, .55)
felt = np.array([25., 26., 26.])[None, None, :] + felt_noise[..., None] * 1.9
color = np.clip(wood * coverage[..., None] + felt * (1 - coverage[..., None]), 0, 255)

# The 13 mm step is square, with only a tiny eased edge to keep sampled normals stable.
ease = np.clip(distance / .018, 0, 1)
ease = ease * ease * (3 - 2 * ease)
height = .51 * ease + coverage * (fine * .00028 + fibers * .00020)
height += (1 - coverage) * felt_noise * .00022
sx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * REPEAT_W / W)
sy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * REPEAT_H / H)
normal = np.stack([-sx, sy, np.ones_like(sx)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
normal_rgb = np.rint((normal * .5 + .5) * 255).astype('uint8')
Image.fromarray(np.rint(color).astype('uint8')).save(ROOT / 'texture.png')
Image.fromarray(normal_rgb).save(ROOT / 'normal.png')
metadata = {
    'repeatWidthIn': REPEAT_W,
    'repeatHeightIn': REPEAT_H,
    'depthIn': .87,
    'note': 'Manufacturer bamboo specifications override photo estimates: 8 solid 1.00 in slats with square profiles and 0.51 in gaps on a 1.51 in pitch, 0.51 in slat thickness over 0.35 in felt, and 0.87 in specified total depth; this eight-pitch tile is 12.08 in wide (the sheet separately rounds installed panel coverage to 12.09 in). Medium brown bamboo tones are sampled from main.jpg with procedural wrapping grain, recycled black felt, and a matte non-gloss lacquer appearance.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-.5, .65, .65])
light /= np.linalg.norm(light)
illumination = .30 + .70 * np.maximum(0, normal @ light)
linear = (color / 255) ** 2.2
shaded = np.clip((linear * illumination[..., None]) ** (1 / 2.2) * 255, 0, 255).astype('uint8')
preview = Image.new('RGB', (1536, 1536), '#eeeae4')
for offset, tile in [(0, Image.fromarray(np.rint(color).astype('uint8'))), (768, Image.fromarray(shaded))]:
    tile = tile.resize((256, 512), Image.Resampling.LANCZOS)
    for row in range(3):
        for col in range(3):
            preview.paste(tile, (offset + col * 256, row * 512))
preview.save(ROOT / 'preview.png')

assert W / H == REPEAT_W / REPEAT_H
assert np.isfinite(normal).all()
for name, a in [('color', color), ('normal', normal_rgb.astype(float))]:
    seam_y = np.abs(a[0] - a[-1]).mean()
    regular_y = np.abs(a[1:] - a[:-1]).mean()
    seam_x = np.abs(a[:, 0] - a[:, -1]).mean()
    print(f'{name}: vertical wrap delta {seam_y:.3f}, interior delta {regular_y:.3f}, horizontal wrap delta {seam_x:.3f}')
print('Wrote texture.png, normal.png, texture.json, preview.png at 1024 × 2048.')
