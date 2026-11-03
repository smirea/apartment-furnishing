from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
WIDTH, HEIGHT, DEPTH = 11.8, 23.6, 0.75
SLATS = 7
PITCH, FACE = WIDTH / SLATS, 1.10
rng = np.random.default_rng(14828)


def noise(shape, sigma):
    field = gaussian_filter(rng.standard_normal(shape), sigma, mode='wrap')
    return (field - field.mean()) / max(field.std(), 1e-8)


def sample_face_color():
    photo = np.asarray(Image.open(ROOT / 'main.jpg').convert('RGB').resize((1600, 1600)))
    mask = Image.new('L', (1600, 1600))
    ImageDraw.Draw(mask).polygon([(760, 710), (1460, 497), (1480, 530), (795, 746)], fill=255)
    pixels = photo[np.asarray(mask) > 0].astype(float)
    return np.median(pixels, axis=0)


y, x = np.mgrid[:H, :W]
u = (x + 0.5) / W * SLATS
slat_id = np.floor(u).astype(int)
local = (u % 1 - 0.5) * PITCH
edge_distance = FACE / 2 - abs(local)
face_mask = edge_distance >= 0

# All noise and coordinate warps are periodic, including the grain at the top/bottom join.
warp = 3.5 * noise((H, W), (110, 24)) + 1.2 * noise((H, W), (38, 12))
coords = np.array([y.astype(float), (x + warp) % W])
broad = map_coordinates(noise((H, W), (150, 13)), coords, order=1, mode='grid-wrap')
fibers = map_coordinates(noise((H, W), (52, 1.2)), coords, order=1, mode='grid-wrap')
fine = map_coordinates(noise((H, W), (18, 0.48)), coords, order=1, mode='grid-wrap')
pore = np.maximum(-fibers - 0.65, 0) ** 1.5
pore *= np.clip(0.7 + 0.35 * noise((H, W), (7, 2)), 0, 1.4)
short_fibers = map_coordinates(noise((H, W), (3.5, 0.45)), coords, order=1, mode='grid-wrap')
ray = noise((H, W), (0.6, 3.5))
micro = rng.standard_normal((H, W))
base = sample_face_color()
slat_tones = np.array([-1.8, 2.8, -3.0, 0.8, 3.5, -1.0, 0.0])
variation = 2.8 * broad + 2.0 * fibers + 1.8 * fine + 1.4 * short_fibers - 3.2 * pore + 0.4 * ray + 0.55 * micro
variation += slat_tones[slat_id]
wood = base + variation[..., None] * np.array([1.0, 0.92, 0.80])
wood += broad[..., None] * np.array([0.65, 0.12, -0.4])
felt_noise = noise((H, W), (0.6, 0.6))
felt = np.array([22.0, 23.0, 24.0]) + felt_noise[..., None] * 1.1
albedo = np.where(face_mask[..., None], wood, felt)
color = np.uint8(np.clip(np.rint(albedo), 0, 255))

# Height is in inches; using physical texel spacing keeps the normal strength independent of resolution.
chamfer = 0.025
profile = np.where(face_mask, 0.50 - chamfer * (1 - np.clip(edge_distance / chamfer, 0, 1)), 0)
height = profile + np.where(face_mask, 0.0007 * fibers + 0.00025 * fine - 0.0005 * pore, 0.00015 * felt_noise)
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH / W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT / H)
# Image rows point down, so OpenGL's upward tangent gives a positive green component for dy.
normals = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
normal_rgb = np.uint8(np.clip(np.rint((normals + 1) * 127.5), 0, 255))
Image.fromarray(color).save(ROOT / 'texture.png')
Image.fromarray(normal_rgb).save(ROOT / 'normal.png')
metadata = {
    'repeatWidthIn': WIDTH,
    'repeatHeightIn': HEIGHT,
    'depthIn': DEPTH,
    'note': 'No manufacturer spec sheet is published; the recorded panel is 11.8 x 94.49 x 0.75 in, and the photos suggest 7 slats per panel, estimated 1.10 in faces and 0.586 in rectangular felt gaps on a 1.686 in pitch with lightly softened edges. The tile spans 7 pitches by 23.6 in; muted dark smoke oak tones are sampled from main.jpg, with black felt, and the normal profile estimates 0.50 in wood relief above 0.25 in backing.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.45, 0.55, 0.80])
light /= np.linalg.norm(light)
lambert = np.maximum(normals @ light, 0)
linear = (color / 255) ** 2.2
shaded = np.uint8(np.clip((linear * (0.30 + 0.70 * lambert[..., None])) ** (1 / 2.2) * 255, 0, 255))
thumb = Image.fromarray(color).resize((280, 560), Image.Resampling.LANCZOS)
preview = Image.new('RGB', (1680, 1720), (42, 42, 42))
draw = ImageDraw.Draw(preview)
draw.text((18, 12), 'Albedo: 3 x 3 repeats | 35.4 x 70.8 inches', fill='white')
draw.text((858, 12), 'Normal-map lighting: upper left | 3 x 3 repeats', fill='white')
shade_thumb = Image.fromarray(shaded).resize((280, 560), Image.Resampling.LANCZOS)
for row in range(3):
    for col in range(3):
        preview.paste(thumb, (col * 280, 40 + row * 560))
        preview.paste(shade_thumb, (840 + col * 280, 40 + row * 560))
preview.save(ROOT / 'preview.png')
print('Sampled oak RGB:', np.round(base, 1).tolist())
print('Wrote texture.png, normal.png, texture.json, preview.png')
print('Albedo mean seam deltas (x/y):', float(np.abs(color[:, 0].astype(float) - color[:, -1]).mean()), float(np.abs(color[0].astype(float) - color[-1]).mean()))
print('Normal mean seam deltas (x/y):', float(np.abs(normal_rgb[:, 0].astype(float) - normal_rgb[:, -1]).mean()), float(np.abs(normal_rgb[0].astype(float) - normal_rgb[-1]).mean()))
assert W / H == WIDTH / HEIGHT
assert all((ROOT / name).exists() for name in ['texture.png', 'normal.png', 'texture.json', 'preview.png'])
