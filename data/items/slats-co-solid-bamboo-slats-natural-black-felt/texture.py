from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
SLATS = 8
FACE, GAP = 1.00, 0.51
RW, RH = SLATS * (FACE + GAP), 24.16
rng = np.random.default_rng(4127)


def noise(shape, sigma):
    a = gaussian_filter(rng.normal(size=shape), sigma, mode='wrap')
    return a / max(a.std(), 1e-8)


def save(name, a):
    Image.fromarray(np.uint8(np.clip(a, 0, 255))).save(ROOT / name)


# Small face-only samples establish color without carrying photographic lighting into the tile.
photo = np.asarray(Image.open(ROOT / 'main.jpg').convert('RGB'), dtype=float)
samples = [(900, 200), (1200, 730), (1100, 460), (1000, 480)]
swatches = np.array([np.median(photo[y-6:y+6, x-6:x+6], axis=(0, 1)) for x, y in samples])
base = swatches.mean(axis=0)
base += np.array([4.0, 6.0, 8.0])
y, x = np.mgrid[:H, :W]
xin = (x + 0.5) * RW / W
phase = (xin - GAP / 2) % (FACE + GAP)
on_face = phase < FACE
edge = np.minimum(phase, FACE - phase)
color = np.zeros((H, W, 3), dtype=float)
felt = noise((H, W), (0.6, 0.6))
felt_cloud = noise((H, W), (14, 14))
color[:] = np.array([24, 25, 24]) + (felt * 1.7 + felt_cloud * 0.5)[..., None]
height = np.zeros((H, W), dtype=float)

for i in range(SLATS):
    cols = np.flatnonzero(on_face[0] & (np.floor((xin[0] - GAP / 2) / (FACE + GAP)).astype(int) == i))
    n = len(cols)
    yy, xx = np.mgrid[:H, :n]
    broad = noise((H, n), (180, 9))
    fibers = noise((H, n), (95, 0.65))
    fine = noise((H, n), (16, 0.45))
    pores = noise((H, n), (3.2, 0.4))
    warp = 1.6 * noise((H, n), (120, 22))
    fiber_warp = map_coordinates(fibers, [yy.astype(float), xx + warp], order=1, mode='grid-wrap')
    grain = 1.9 * broad + 2.2 * fiber_warp + 0.7 * fine
    grain -= np.maximum(fiber_warp - 0.85, 0) ** 1.3 * 1.4
    node = np.zeros((H, n))
    for j in range(2):
        cy = rng.uniform(0, H)
        bend = 8 * np.sin(xx / n * np.pi + rng.uniform(0, 6.28))
        dist = (yy - cy - bend + H / 2) % H - H / 2
        localized = np.exp(-((xx - rng.uniform(0, n)) / (n * 0.33)) ** 2)
        node += np.exp(-(dist / 2.2) ** 2) * localized * 3.0
        node += np.exp(-(dist / 12) ** 2) * localized * 0.7
    tone = rng.normal(0, 2.0)
    tint = rng.normal(0, 0.65, 3)
    rgb = base + tint + (grain + tone - node)[..., None] * np.array([1.0, 0.94, 0.8])
    color[:, cols] = rgb
    # The felt is 9 mm thick; the exposed square-cut bamboo rises another 13 mm.
    chamfer = np.clip(edge[:, cols] / 0.025, 0, 1)
    height[:, cols] = 13 / 25.4 - 0.025 * (1 - chamfer)
    height[:, cols] += (0.00022 * fine + 0.00010 * pores - 0.00008 * node)

height[~on_face] = (0.00022 * felt)[~on_face]
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * RW / W)
# Image rows point down; OpenGL tangent Y points up.
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * RH / H)
normal = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
save('texture.png', color)
save('normal.png', (normal * 0.5 + 0.5) * 255 + 0.5)
metadata = {
    'repeatWidthIn': RW,
    'repeatHeightIn': RH,
    'depthIn': 0.87,
    'note': 'Manufacturer spec sheet takes precedence over photo estimates: eight 1.00 in solid bamboo slats with 0.51 in square-profile felt gaps on a 1.51 in pitch, 0.51 in slat thickness over 0.35 in felt and 0.87 in specified total depth; tile covers eight pitches (12.08 in, versus the rounded 12.09 in installed panel width). Natural blonde bamboo tones are sampled from the main listing photo, with procedural vertical grain, recycled black felt and a non-gloss protective lacquer finish.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.48, 0.58, 0.66])
light /= np.linalg.norm(light)
shade = 0.36 + 0.64 * np.maximum(normal @ light, 0)
shaded = np.clip(color * shade[..., None], 0, 255).astype('uint8')
thumb = Image.fromarray(np.uint8(np.clip(color, 0, 255))).resize((256, 512), Image.Resampling.LANCZOS)
relief = Image.fromarray(shaded).resize((256, 512), Image.Resampling.LANCZOS)
preview = Image.new('RGB', (1560, 1576), '#eeeae3')
draw = ImageDraw.Draw(preview)
draw.text((12, 10), 'ALBEDO: 3 x 3 tiles', fill='#292620')
draw.text((792, 10), 'NORMAL-MAP RELIEF: upper-left light', fill='#292620')
for row in range(3):
    for col in range(3):
        preview.paste(thumb, (12 + col * 256, 32 + row * 512))
        preview.paste(relief, (792 + col * 256, 32 + row * 512))
preview.save(ROOT / 'preview.png')
assert W / H == RW / RH
assert np.isfinite(normal).all()
print(f'Built {W} x {H}; {SLATS} slats; {RW:.2f} x {RH:.2f} inches; sampled face RGB {base.round(1)}')
print('Periodic height derivatives and periodic grain use wrapped boundaries on both axes.')
