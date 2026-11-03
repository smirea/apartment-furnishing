from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
SLATS = 8
PITCH = 1.575
FACE = 1.10
RW, RH = SLATS * PITCH, 25.2
DEPTH = 0.83
rng = np.random.default_rng(307)


def noise(shape, sigma):
    a = gaussian_filter(rng.normal(size=shape), sigma, mode='wrap')
    return a / max(a.std(), 1e-8)


source = np.array(Image.open(ROOT / 'main.jpg').convert('RGB').resize((1600, 1600)))
centers = [582, 609, 635, 662, 689, 715, 742, 768, 822, 848, 875, 901, 928, 954, 980, 1007]
samples = np.array([np.median(source[170:800, x-3:x+4], axis=(0, 1)) for x in centers])
base = np.median(samples, axis=0)
# Shrinking the sampled palette removes the broad illumination gradient across the listing photo.
palette = base + (samples - base) * 0.50
print('Sampled ash RGB:', base.round(1).tolist())

y, x = np.mgrid[:H, :W]
local = ((x + W / SLATS / 2) % (W / SLATS) - W / SLATS / 2) * RW / W
edge_distance = FACE / 2 - np.abs(local)
coverage = np.clip(edge_distance / (RW / W) + 0.5, 0, 1)
bevel = 0.045
ramp = np.clip(edge_distance / bevel, 0, 1)
profile = ramp * ramp * (3 - 2 * ramp)
height = profile * 0.475
felt = noise((H, W), (0.65, 0.65))
color = np.empty((H, W, 3), dtype=float)
color[:] = np.array([17., 17., 16.]) + felt[..., None] * 1.5
wood = np.zeros_like(color)
grain_height = np.zeros((H, W))

for s in range(SLATS):
    # The slat centered on the horizontal boundary is generated as one continuous board.
    columns = np.where(((x[0] + W / SLATS / 2) // (W / SLATS)).astype(int) % SLATS == s)[0]
    order = np.argsort(local[0, columns])
    columns = columns[order]
    n = len(columns)
    yy = np.arange(H)[:, None] / H
    xx = np.linspace(-1, 1, n, endpoint=False)[None, :]
    phase = rng.uniform(0, 2 * np.pi)
    warp = 0.07 * np.sin(2*np.pi*yy + phase) + 0.035 * np.sin(4*np.pi*yy + phase*1.8)
    broad = noise((H, n), (170, 9))
    fibers = noise((H, n), (40, 0.65))
    soft = noise((H, n), (80, 3))
    fine = noise((H, n), (2.0, 0.5))
    ring_phase = (xx + warp + 0.03 * broad) * rng.uniform(35, 54)
    lines = np.exp(-((np.sin(ring_phase) / 0.20)**2))
    cathedral = np.zeros((H, n))
    if s in (2, 6):
        center = rng.uniform(-0.5, 0.5)
        arch = np.sqrt(((xx-center)*1.9)**2 + (0.35 + 1.2*(1-np.cos(2*np.pi*yy+phase)))**2)
        cathedral = np.exp(-(np.sin(arch*12)/0.20)**2) * 4.0
    tone = broad*2.8 + fibers*2.3 + soft*2.0 + fine*0.65 - lines*5.0 - cathedral
    c = palette[[0, 5, 9, 2, 12, 7, 15, 4][s]]
    wood[:, columns, :] = c + tone[..., None] * np.array([1., 0.95, 0.82])
    grain_height[:, columns] = (fibers*0.00032 - lines*0.0005 + fine*0.0001)

color = color * (1-coverage[..., None]) + wood * coverage[..., None]
height += grain_height * profile + felt * 0.00018 * (1-profile)
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2*RW/W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2*RH/H)
# Image rows point down; the OpenGL tangent-space green axis points up.
normals = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
Image.fromarray(np.uint8(np.clip(color, 0, 255))).save(ROOT / 'texture.png')
Image.fromarray(np.uint8(np.clip((normals*0.5+0.5)*255+0.5, 0, 255))).save(ROOT / 'normal.png')
metadata = {
    'repeatWidthIn': RW,
    'repeatHeightIn': RH,
    'depthIn': DEPTH,
    'note': 'No manufacturer spec sheet is published; the dimension diagram shows eight slats per 12.60 x 94.49 in panel (1.575 in pitch), with estimated 1.10 in faces, 0.475 in felt gaps, softly eased edges and 0.83 in total thickness. This tile covers eight pitches x 25.2 in; pale natural ash tones are sampled from main.jpg, with black felt backing and procedural grain.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.48, 0.60, 0.64])
light /= np.linalg.norm(light)
shade = 0.40 + 0.60 * np.maximum(0, normals @ light)
linear = np.where(color/255 <= 0.04045, color/255/12.92, ((color/255+0.055)/1.055)**2.4)
shaded_linear = np.clip(linear*shade[..., None], 0, 1)
shaded = np.where(shaded_linear <= 0.0031308, shaded_linear*12.92, 1.055*shaded_linear**(1/2.4)-0.055)
a = Image.fromarray(np.uint8(np.clip(color, 0, 255))).resize((256, 512), Image.Resampling.LANCZOS)
b = Image.fromarray(np.uint8(shaded*255)).resize((256, 512), Image.Resampling.LANCZOS)
preview = Image.new('RGB', (1560, 1584), '#eeeeea')
for row in range(3):
    for col in range(3):
        preview.paste(a, (col*256, 48+row*512))
        preview.paste(b, (792+col*256, 48+row*512))
draw = ImageDraw.Draw(preview)
draw.text((14, 17), 'COLOR / 3 x 3 / 37.8 x 75.6 in', fill='#202020')
draw.text((806, 17), 'NORMAL-SHADED / LIGHT FROM UPPER LEFT', fill='#202020')
preview.save(ROOT / 'preview.png')
assert W/H == RW/RH
assert Image.open(ROOT / 'normal.png').size == (W, H)
print(f'Wrote maps {W} x {H}; repeat {RW:g} x {RH:g} in')
print('Vertical seam RGB delta:', np.abs(color[0]-color[-1]).mean().round(3))
print('Horizontal seam RGB delta:', np.abs(color[:, 0]-color[:, -1]).mean().round(3))
