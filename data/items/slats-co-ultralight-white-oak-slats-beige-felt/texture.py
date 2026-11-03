import json
import io
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageCms
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
FACE, GAP, COUNT = 1.20, 0.49, 7
PITCH = FACE + GAP
WIDTH, HEIGHT = COUNT * PITCH, COUNT * PITCH * 2
rng = np.random.default_rng(72819)


def noise(shape, sy, sx):
    a = gaussian_filter(rng.standard_normal(shape), (sy, sx), mode='wrap')
    return a / max(a.std(), 1e-8)


# Sample only material colors; no photograph pixels enter the synthesized grain.
source = Image.open(ROOT / 'main.jpg')
if source.info.get('icc_profile'):
    source = ImageCms.profileToProfile(source, ImageCms.ImageCmsProfile(io.BytesIO(source.info['icc_profile'])), ImageCms.createProfile('sRGB'), outputMode='RGB')
photo = np.asarray(source.resize((1600, 1600), Image.Resampling.LANCZOS), dtype=float)
wood_samples = [photo[570:595, 790:870], photo[415:440, 690:770],
                photo[780:805, 1000:1080], photo[955:980, 1250:1330]]
wood_base = np.median(np.concatenate([a.reshape(-1, 3) for a in wood_samples]), axis=0)
felt_samples = [photo[200:211, 990:1010]]
felt_base = np.median(np.concatenate([a.reshape(-1, 3) for a in felt_samples]), axis=0)
# The visible light felt flank is the reference, rather than its occluded apex.

x = (np.arange(W) + 0.5) * WIDTH / W
y = (np.arange(H) + 0.5) * HEIGHT / H
xx, yy = np.meshgrid(x, y)
local = xx % PITCH
face = (local >= GAP / 2) & (local < GAP / 2 + FACE)
slat = np.floor(xx / PITCH).astype(int)
fine = noise((H, W), 0.65, 0.65)
felt = noise((H, W), 0.8, 0.8)
color = np.empty((H, W, 3), dtype=float)
color[:] = felt_base + (felt * 1.7)[..., None]
grain_height = np.zeros((H, W))

for k in range(COUNT):
    # Periodic, flowing longitudinal pores and growth bands, unique to each slat.
    theta = 2 * np.pi * yy / HEIGHT
    phase = rng.uniform(0, 2 * np.pi)
    warp = (0.040 * np.sin(theta + phase) + 0.018 * np.sin(3 * theta + phase * 2)
            + 0.006 * np.sin(7 * theta + phase))
    u = local - GAP / 2 + warp
    broad = noise((H, W), 130, 7)
    fibers = noise((H, W), 17, 0.7)
    pores = noise((H, W), 5, 0.55)
    warped = map_coordinates(fibers, [np.broadcast_to(np.arange(H)[:, None], (H, W)),
                                    np.arange(W)[None, :] + warp * W / WIDTH], mode='grid-wrap', order=1)
    rings = np.sin(2 * np.pi * (u * 13.5 + 0.20 * np.sin(theta * 2 + phase)))
    latewood = np.maximum(rings - 0.55, 0) ** 2
    # Very restrained cathedrals prevent the veneer reading as uniform pinstripes.
    arch = np.cos(theta + phase)
    cathedral = np.sin(2 * np.pi * (u * 5 + 1.1 * arch + 0.28 * np.cos(2 * theta + phase)))
    g = (2.3 * broad + 2.0 * warped + 0.65 * pores + 0.45 * fine
         - 4.0 * latewood + 0.8 * cathedral)
    tone = rng.normal(0, 2.0)
    c = wood_base + tone * np.array([1.0, 0.91, 0.78]) + g[..., None] * np.array([1, 0.91, 0.76])
    mask = face & (slat == k)
    color[mask] = c[mask]
    grain_height[mask] = (0.00020 * warped + 0.00008 * pores)[mask]

# A 90-degree V drops half the groove width, leaving the specified felt backbone.
distance_to_apex = np.minimum(local, PITCH - local)
height = np.minimum(distance_to_apex, GAP / 2)
height = gaussian_filter(height, (0, 0.35), mode='wrap')
height += grain_height + (~face) * felt * 0.00018
# Image rows point down; tangent-space green points up (OpenGL).
dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * WIDTH / W)
dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * HEIGHT / H)
n = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
albedo = np.uint8(np.clip(np.rint(color), 0, 255))
normal = np.uint8(np.clip(np.rint((n * 0.5 + 0.5) * 255), 0, 255))
Image.fromarray(albedo).save(ROOT / 'texture.png')
Image.fromarray(normal).save(ROOT / 'normal.png')
metadata = {
    'repeatWidthIn': round(WIDTH, 4),
    'repeatHeightIn': round(HEIGHT, 4),
    'depthIn': 0.35,
    'note': 'Manufacturer spec overrides photo estimates: seven 1.20 in white-oak faces on 1.69 in pitches with 0.49 in, 90-degree V-grooves cut 6.2 mm into 9 mm felt (2.8 mm backbone, no rigid core); seven pitches total 11.83 in versus the listed 11.80 in panel width. The tile is seven pitches wide and 23.66 in tall, with muted pale oak and oatmeal-beige felt colors sampled from main.jpg; grain is synthesized and periodic with no baked lighting.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.55, 0.65, 0.65])
light /= np.linalg.norm(light)
shade = 0.40 + 0.60 * np.maximum(np.sum(n * light, axis=-1), 0)
shaded = np.uint8(np.clip(color * shade[..., None], 0, 255))
thumb_size = (360, 720)
left = Image.fromarray(albedo).resize(thumb_size, Image.Resampling.LANCZOS)
right = Image.fromarray(shaded).resize(thumb_size, Image.Resampling.LANCZOS)
preview = Image.new('RGB', (2184, 2200), '#eeece8')
for row in range(3):
    for col in range(3):
        preview.paste(left, (col * 360, 40 + row * 720))
        preview.paste(right, (1104 + col * 360, 40 + row * 720))
draw = ImageDraw.Draw(preview)
draw.text((12, 12), 'Albedo | 3 x 3 | 35.49 x 70.98 in', fill='#302c28')
draw.text((1116, 12), 'Normal-map lighting | upper-left light | 3 x 3', fill='#302c28')
preview.save(ROOT / 'preview.png')
print(json.dumps({'dimensions': [W, H], 'woodRGB': wood_base.tolist(), 'feltRGB': felt_base.tolist(), **metadata}, indent=2))
for name, a in [('albedo', albedo.astype(float)), ('normal', normal.astype(float))]:
    print(name, 'wrap mean differences x/y:', np.abs(a[:, 0] - a[:, -1]).mean(), np.abs(a[0] - a[-1]).mean())
assert W / H == WIDTH / HEIGHT
