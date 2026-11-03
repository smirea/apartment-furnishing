from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
SLATS = 8
FACE, GAP = 1.06, 0.41
PITCH = FACE + GAP
RW, RH = SLATS * PITCH, SLATS * PITCH * 2
rng = np.random.default_rng(81927)


def noise(shape, sy, sx):
    a = gaussian_filter(rng.standard_normal(shape), (sy, sx), mode='wrap')
    return a / max(a.std(), 1e-9)


# Sample only an interior top face; side faces and cast shadows would bias the oak dark.
photo = Image.open(ROOT / 'main.jpg').convert('RGB')
mask = Image.new('L', photo.size)
ImageDraw.Draw(mask).polygon([(565, 580), (1580, 296), (1580, 348), (630, 626)], fill=255)
samples = np.asarray(photo)[np.asarray(mask) > 0]
oak = np.median(samples, axis=0)
color = np.empty((H, W, 3), dtype=np.float64)
height = np.empty((H, W), dtype=np.float64)
y = np.arange(H)[:, None] / H
sw = W // SLATS
x = np.arange(sw)[None, :] / sw * PITCH
edge_distance = FACE / 2 - np.abs(x - PITCH / 2)
face = edge_distance >= 0
# A tiny eased edge retains the specified square-cut profile.
t = np.clip(edge_distance / 0.012, 0, 1)
profile = t * t * (3 - 2 * t)

for s in range(SLATS):
    shape = (H, sw)
    phase = rng.uniform(0, 2 * np.pi)
    warp = (0.045 * np.sin(2 * np.pi * y + phase)
            + 0.018 * np.sin(4 * np.pi * y + phase * 1.3)
            + 0.012 * noise(shape, 100, 12))
    u = x + warp
    broad = noise(shape, 140, 8)
    fiber = noise(shape, 22, 0.65)
    fine = noise(shape, 5, 0.45)
    growth = np.sin(u * rng.uniform(70, 100) + 1.4 * np.sin(2 * np.pi * y + phase))
    pores = np.maximum(0, noise(shape, 12, 0.5) - 0.8) ** 1.5
    annual = np.maximum(0, growth - 0.35) ** 3
    # Oak medullary rays are subtle broken transverse flecks.
    rays = np.maximum(0, noise(shape, 0.6, 3.2) - 2.0)
    center = rng.uniform(-0.3, 1.4)
    ring_radius = np.sqrt(((x - center) * 1.3 + warp) ** 2
                          + (1.65 * np.sin(np.pi * (y - phase))) ** 2 + 0.04)
    rings = np.maximum(0, np.sin(52 * ring_radius + 0.3 * broad) - 0.25) ** 2
    grain = broad * 3.5 + fiber * 2.7 + fine * 0.8 - pores * 10 - annual * 5 - rings * 9 + rays * 4
    tone = rng.normal(0, 3.2)
    wood = oak[None, None, :] + (grain + tone)[..., None] * np.array([1.0, 0.96, 0.86])
    wood += noise(shape, 90, 7)[..., None] * np.array([0.9, 0.15, -0.6])
    felt_noise = noise(shape, 0.6, 0.6) * 1.5 + noise(shape, 2, 2) * 0.8
    felt = np.array([22., 22., 21.])[None, None, :] + felt_noise[..., None]
    color[:, s * sw:(s + 1) * sw] = np.where(face[..., None], wood, felt)
    micro = (fiber * 0.00016 - pores * 0.00032 + fine * 0.00006)
    height[:, s * sw:(s + 1) * sw] = profile * (0.51 + micro) + (~face) * felt_noise * 0.00012

# Physical derivatives keep the normals consistent with the inch-scaled color map.
dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * RW / W)
dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * RH / H)
normals = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
color8 = np.uint8(np.clip(np.rint(color), 0, 255))
normal8 = np.uint8(np.clip(np.rint((normals + 1) * 127.5), 0, 255))
Image.fromarray(color8).save(ROOT / 'texture.png')
Image.fromarray(normal8).save(ROOT / 'normal.png')
note = ('Manufacturer spec sheet overrides photo estimates: 8 square-cut 1.06 in solid oak slats per panel, 0.41 in black PET felt gaps, 1.47 in pitch, 0.51 in slat thickness over 9 mm felt, and 0.87 in total depth with three coats of low-satin polyurethane. '
        'Tile covers 8 pitches by 23.52 in (11.76 in wide, preserving the specified face/gap sizes despite the separately listed 11.81 in installed panel width); oak tones are sampled from the main listing photo, with procedural wrapping grain and black felt.')
(ROOT / 'texture.json').write_text(json.dumps(dict(repeatWidthIn=round(RW, 4), repeatHeightIn=round(RH, 4), depthIn=0.87, note=note), indent=2) + '\n')

light = np.array([-0.45, 0.6, 0.66]); light /= np.linalg.norm(light)
shade = 0.32 + 0.68 * np.maximum(0, normals @ light)
linear = (color8 / 255.) ** 2.2
shaded = np.uint8(np.clip((linear * shade[..., None]) ** (1 / 2.2) * 255, 0, 255))
left = Image.fromarray(color8).resize((256, 512), Image.Resampling.LANCZOS)
right = Image.fromarray(shaded).resize((256, 512), Image.Resampling.LANCZOS)
preview = Image.new('RGB', (1536, 1536))
for j in range(3):
    for i in range(3):
        preview.paste(left, (i * 256, j * 512))
        preview.paste(right, (768 + i * 256, j * 512))
preview.save(ROOT / 'preview.png')
print(f'Built {W} × {H}: {RW:.2f} × {RH:.2f} in, {SLATS} slats; sampled oak RGB {oak.tolist()}')
print('Periodic boundary mean color steps:', np.abs(color[:, 0] - color[:, -1]).mean(), np.abs(color[0] - color[-1]).mean())
