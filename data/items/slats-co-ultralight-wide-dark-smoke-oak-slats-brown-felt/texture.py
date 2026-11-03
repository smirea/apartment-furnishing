from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1600, 2000
WIDTH_MM, HEIGHT_MM = 600, 750
rng = np.random.default_rng(2681)
y, x = np.mgrid[:H, :W].astype(np.float32)

def field(nx, ny):
    grid = rng.normal(size=(ny, nx)).astype(np.float32)
    result = map_coordinates(grid, [y / H * ny, x / W * nx], order=3, mode='grid-wrap')
    return (result - result.mean()) / result.std()

# All random fields live on a torus so grain and relief continue across both edges.
broad = field(22, 5)
medium = field(110, 13)
warp = 2.8 * field(12, 5) + 0.9 * field(32, 9)
warped_x = (x + warp * W / WIDTH_MM) % W
fine_base = field(650, 24)
fine = map_coordinates(fine_base, [y, warped_x], order=1, mode='grid-wrap')
flow_base = field(210, 8)
flow = map_coordinates(flow_base, [y, warped_x], order=1, mode='grid-wrap')

pitch_px = W / 6
slat = (x / pitch_px).astype(int)
slat_tones = np.array([-1.7, 2.2, -0.8, 1.0, -2.1, 1.4], dtype=np.float32)[slat]
pores = np.maximum(0, -fine - 0.85) ** 1.35
pores *= np.clip(0.65 + field(100, 85) * 0.26, 0.05, 1.2)
fiber = field(1000, 180)
variation = 2.0 * broad + 1.7 * medium + 2.0 * flow + 0.65 * fine - 4.0 * pores + 0.5 * fiber + slat_tones
wood = np.array([84.0, 72.5, 63.0], dtype=np.float32)[None, None, :] + variation[..., None] * np.array([1, 0.94, 0.85])
wood += field(32, 8)[..., None] * np.array([0.6, 0.15, -0.25])

x_mm = (x + 0.5) * WIDTH_MM / W
signed = (x_mm + 50) % 100 - 50
distance = np.abs(signed)
# A 90-degree V has unit slope; its apex is 1.5 mm below the veneer face.
height = 9.0 - np.maximum(0, 1.5 - distance)
reveal = distance < 1.5
felt_noise = field(600, 700)
felt = np.array([45, 37, 30], dtype=np.float32)[None, None, :] + felt_noise[..., None] * 1.7
coverage = np.clip((1.5 - distance) * W / WIDTH_MM + 0.5, 0, 1)
color = wood * (1 - coverage[..., None]) + felt * coverage[..., None]
height += (0.009 * flow + 0.006 * fine - 0.012 * pores) * (1 - coverage)
height += 0.006 * felt_noise * coverage

# Rows increase downwards; tangent-space +Y points upwards (OpenGL).
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH_MM / W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT_MM / H)
normals = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
normal_rgb = np.rint((normals + 1) * 127.5).clip(0, 255).astype(np.uint8)
color_rgb = np.rint(color).clip(0, 255).astype(np.uint8)
Image.fromarray(color_rgb).save(ROOT / 'texture.png')
Image.fromarray(normal_rgb).save(ROOT / 'normal.png')
metadata = {
    'repeatWidthIn': WIDTH_MM / 25.4,
    'repeatHeightIn': HEIGHT_MM / 25.4,
    'depthIn': 9 / 25.4,
    'note': 'Exact manufacturer spec dimensions override photo estimates: three 97 mm (3.82 in) faces per 300 mm panel, 3 mm wide 90-degree V-reveals cut 1.5 mm deep, half-reveals at panel edges, and 9 mm total veneer-on-brown-felt thickness; this tile spans six 100 mm pitches by 750 mm, with oak tone sampled from the first listing photo and brown felt per the spec. The 3000 mm panel is shorter than a true 10 ft wall, and the manufacturer explicitly prohibits wrapping this Wide profile around columns; column mapping is a visual simulation only.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.5, 0.65, 0.57])
light /= np.linalg.norm(light)
decoded_normals = normal_rgb.astype(np.float32) / 127.5 - 1
decoded_normals /= np.linalg.norm(decoded_normals, axis=-1, keepdims=True)
lambert = np.maximum(0, decoded_normals @ light)
linear = np.where(color_rgb / 255 <= 0.04045, color_rgb / 255 / 12.92, ((color_rgb / 255 + 0.055) / 1.055) ** 2.4)
shaded = linear * (0.28 + 0.85 * lambert[..., None])
shaded = np.where(shaded <= 0.0031308, shaded * 12.92, 1.055 * np.maximum(shaded, 0) ** (1 / 2.4) - 0.055)
shaded = np.rint(shaded * 255).clip(0, 255).astype(np.uint8)
preview = Image.new('RGB', (1920, 1240), (225, 223, 219))
draw = ImageDraw.Draw(preview)
draw.text((15, 12), 'COLOR MAP / 3 x 3 / 23.622 x 29.528 in per tile', fill=(30, 30, 30))
draw.text((975, 12), 'NORMAL-MAP RELIEF / UPPER-LEFT LIGHT / 3 x 3', fill=(30, 30, 30))
for offset, data in [(0, color_rgb), (960, shaded)]:
    thumb = Image.fromarray(data).resize((320, 400), Image.Resampling.LANCZOS)
    for row in range(3):
        for col in range(3):
            preview.paste(thumb, (offset + col * 320, 40 + row * 400))
preview.save(ROOT / 'preview.png')

assert W / H == WIDTH_MM / HEIGHT_MM
assert sum(np.diff(reveal[0].astype(int)) == 1) == 6
for name, data in [('color', color_rgb.astype(float)), ('normal', normal_rgb.astype(float))]:
    for axis in [0, 1]:
        seam = np.abs(np.take(data, 0, axis=axis) - np.take(data, -1, axis=axis)).mean()
        print(f'{name} axis {axis}: boundary step {seam:.3f}/255')
print(json.dumps(metadata, indent=2))
