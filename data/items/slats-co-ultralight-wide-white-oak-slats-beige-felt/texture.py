from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1200, 2000
WIDTH_MM, HEIGHT_MM = 300.0, 500.0
rng = np.random.default_rng(73109)


def field(shape, sigma):
    a = gaussian_filter(rng.standard_normal(shape), sigma, mode='wrap')
    return (a - a.mean()) / max(a.std(), 1e-8)


def save_rgb(name, a):
    Image.fromarray(np.uint8(np.clip(a, 0, 255))).save(ROOT / name)


photo = np.asarray(Image.open(ROOT / 'main.jpg').convert('RGB'), dtype=float)
# Sampling inside one flat face avoids the recessed felt and its lighting shadow.
patches = [photo[510:610, 1000:1200], photo[690:770, 1050:1300], photo[460:510, 1250:1450]]
wood_base = np.median(np.concatenate([p.reshape(-1, 3) for p in patches]), axis=0)
felt_base = np.array([178.0, 172.0, 160.0])
color = np.empty((H, W, 3), dtype=float)
height = np.zeros((H, W), dtype=float)
y, x = np.mgrid[:H, :400]
for slat in range(3):
    broad = field((H, 400), (150, 25))
    drift = field((H, 400), (100, 40))
    long_fiber = field((H, 400), (28, 0.7))
    soft_fiber = field((H, 400), (65, 2.5))
    pores = field((H, 400), (5, 0.45))
    phase = x * (2 * np.pi / 39) + drift * 1.3 + broad * 0.4
    growth = np.maximum(0, np.cos(phase)) ** 14
    warp = field((H, 400), (60, 12)) * 2.5
    fibers = map_coordinates(long_fiber, [y, x + warp], order=1, mode='grid-wrap')
    pore_marks = np.maximum(pores - 1.15, 0) ** 1.2
    grain = 1.7 * broad + 1.4 * soft_fiber + 1.3 * fibers - 2.4 * growth - 1.3 * pore_marks
    tone = [-1.1, 1.5, -0.2][slat]
    rgb = wood_base + (grain + tone)[..., None] * np.array([1.0, 0.91, 0.76])
    color[:, slat * 400:(slat + 1) * 400] = rgb
    height[:, slat * 400:(slat + 1) * 400] = 0.006 * fibers + 0.003 * soft_fiber - 0.006 * pore_marks

xx = (np.arange(W) + 0.5) * WIDTH_MM / W
# Groove centers sit on the tile boundary and each 100 mm panel pitch.
distance = np.minimum(xx % 100.0, 100.0 - xx % 100.0)
cut = np.maximum(1.5 - distance, 0.0)
mask = distance < 1.5
felt_noise = field((H, W), (0.65, 0.65))
color[:, mask] = (felt_base + felt_noise[:, mask, None] * 1.5)
height[:, mask] = -cut[mask] + felt_noise[:, mask] * 0.003

# Physical derivatives keep the 45 degree V flanks at their specified slope.
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH_MM / W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT_MM / H)
normals = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
save_rgb('texture.png', color)
save_rgb('normal.png', (normals * 0.5 + 0.5) * 255)

metadata = {
    'repeatWidthIn': WIDTH_MM / 25.4,
    'repeatHeightIn': HEIGHT_MM / 25.4,
    'depthIn': 9.0 / 25.4,
    'note': 'Manufacturer spec overrides photo estimates: three 97 mm (3.8189 in) faces on 100 mm (3.9370 in) pitches per 300 mm panel, with 3 mm (0.1181 in) wide, 1.5 mm deep 90-degree V reveals and 9 mm veneer-on-felt total depth; colors follow main.jpg pale white oak and beige felt. Tile covers three pitches by 500 mm vertically; the spec permits broad curves but explicitly rules out wrapping columns, and the 3000 mm panel is 48 mm short of a true 10 ft wall.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.45, 0.6, 0.66])
light /= np.linalg.norm(light)
shade = 0.28 + 0.72 * np.maximum(0, normals @ light)
shaded = color * shade[..., None]
preview = Image.new('RGB', (1440, 1234), '#efebe4')
for i, source in enumerate([color, shaded]):
    tile = Image.fromarray(np.uint8(np.clip(source, 0, 255))).resize((240, 400), Image.Resampling.LANCZOS)
    for row in range(3):
        for col in range(3):
            preview.paste(tile, (i * 720 + col * 240, 34 + row * 400))
draw = ImageDraw.Draw(preview)
draw.text((12, 11), 'COLOR MAP / 3 x 3', fill='#37332d')
draw.text((732, 11), 'NORMAL-LIT MATERIAL / 3 x 3 / UPPER LEFT LIGHT', fill='#37332d')
preview.save(ROOT / 'preview.png')
print(json.dumps({'size': [W, H], 'woodRGB': wood_base.tolist(), **metadata}, indent=2))
