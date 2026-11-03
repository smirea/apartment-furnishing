from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

OUT = Path(__file__).parent
W, H = 1024, 2048
RW, RH = 11.8, 23.6
COUNT = 7
PITCH = RW / COUNT
FACE = 1.12
rng = np.random.default_rng(2367)
y, x = np.mgrid[:H, :W]
xin, yin = x * RW / W, y * RH / H
slat = np.floor(xin / PITCH).astype(int)
u = xin % PITCH - PITCH / 2
edge = FACE / 2 - np.abs(u)


def noise(sy, sx):
    a = gaussian_filter(rng.normal(size=(H, W)), (sy, sx), mode='wrap')
    return a / a.std()


# Periodic longitudinal drift keeps every grain strand continuous across the tile ends.
t = 2 * np.pi * y / H
warp = 0.030 * np.sin(t + slat * 1.71) + 0.013 * np.sin(3 * t + slat * 2.43)
grain_x = u + warp
broad = noise(100, 11)
fine = noise(22, 0.65)
fibers = noise(70, 0.9)
phase = 2 * np.pi * (grain_x * 12.5 + 0.18 * np.sin(t * 2 + grain_x * 3))
lines = np.maximum(0, np.cos(phase)) ** 16
phase2 = 2 * np.pi * (grain_x * 31 + 0.2 * np.sin(t * 3 + slat))
pores = np.maximum(0, np.cos(phase2)) ** 24
pores *= np.clip(0.45 + noise(12, 1.5) * 0.3, 0, 1)
variation = np.array([1.5, -2.1, 0.2, 3.2, -0.8, 1.0, -2.8])[slat]
growth_radius = np.sqrt((grain_x + 0.24 * np.sin(slat * 2.1)) ** 2 + (1.2 * np.sin((t + slat * 1.31) / 2)) ** 2 + 0.03)
growth_phase = growth_radius * 2 * np.pi * (10 + slat * 0.37) + 0.4 * broad
growth = np.maximum(0, np.cos(growth_phase)) ** 12
gr = 2.5 * broad + 1.4 * fine + 0.85 * fibers - 1.6 * lines - 3.3 * pores - 2.0 * growth
wood = np.array([170.5, 151.0, 126.0])[None, None, :] + (gr + variation)[..., None] * np.array([1.0, 0.96, 0.85])
feltgrain = noise(0.5, 0.5)
felt = np.array([29., 30., 30.])[None, None, :] + feltgrain[..., None] * 1.25
mask = np.clip(edge / (RW / W) + 0.5, 0, 1)
color = wood * mask[..., None] + felt * (1 - mask[..., None])
Image.fromarray(np.uint8(np.clip(color, 0, 255))).save(OUT / 'texture.png')

# Height is in inches, including a shallow rounded shoulder above recessed felt.
shoulder = np.clip(edge / 0.045, 0, 1)
profile = shoulder * shoulder * (3 - 2 * shoulder)
height = 0.50 * profile
height += (0.0004 * fibers + 0.00025 * fine - 0.00065 * pores) * profile
height += 0.0005 * feltgrain * (1 - profile)
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * RW / W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * RH / H)
n = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
Image.fromarray(np.uint8(np.clip(np.rint((n * 0.5 + 0.5) * 255), 0, 255))).save(OUT / 'normal.png')

metadata = {
    'repeatWidthIn': RW,
    'repeatHeightIn': RH,
    'depthIn': 0.75,
    'note': 'No manufacturer spec sheet was published; photos suggest 7 slats per recorded 11.8 in panel, estimated 1.12 in faces and 0.566 in rectangular felt gaps on a 1.686 in pitch with lightly softened edges, while 0.75 in total thickness is from the panel record. Tile covers 7 pitches by 23.6 in; muted natural oak veneer colors and charcoal black felt are matched to the main photo, with structure checked against the gallery.'
}
(OUT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.45, 0.60, 0.66])
light /= np.linalg.norm(light)
lambert = np.maximum(0, n @ light)
linear = (np.clip(color, 0, 255) / 255) ** 2.2
shaded = np.uint8(np.clip((linear * (0.25 + 0.75 * lambert[..., None])) ** (1 / 2.2) * 255, 0, 255))
thumb = Image.fromarray(np.uint8(np.clip(color, 0, 255))).resize((256, 512), Image.Resampling.LANCZOS)
shade_thumb = Image.fromarray(shaded).resize((256, 512), Image.Resampling.LANCZOS)
preview = Image.new('RGB', (1536, 1536))
for row in range(3):
    for col in range(3):
        preview.paste(thumb, (col * 256, row * 512))
        preview.paste(shade_thumb, (768 + col * 256, row * 512))
preview.save(OUT / 'preview.png')

assert W / H == RW / RH
for name, a in [('color', color), ('normal', n)]:
    for axis in [0, 1]:
        seam = np.abs(np.take(a, 0, axis=axis) - np.take(a, -1, axis=axis)).mean()
        print(f'{name} axis {axis} mean seam step: {seam:.4f}')
print(f'Built {W} x {H}, {COUNT} slats, pitch {PITCH:.6f} in, gap {PITCH - FACE:.6f} in')
