import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

OUT = Path(__file__).resolve().parent
WIDTH, HEIGHT = 1024, 2048
PITCH, SCOOP, CUT = 1.31, 1.18, 0.31
REPEAT_WIDTH, REPEAT_HEIGHT = 9 * PITCH, 18 * PITCH
DX, DY = REPEAT_WIDTH / WIDTH, REPEAT_HEIGHT / HEIGHT
rng = np.random.default_rng(267)


def periodic_noise(sigma):
    noise = gaussian_filter(rng.normal(size=(HEIGHT, WIDTH)), sigma, mode='wrap')
    return noise / noise.std()


# The circular scoop is inferred from the end-on photos; its width and depth are specified.
x = (np.arange(WIDTH) + 0.5) * DX
phase = (x + PITCH / 2) % PITCH - PITCH / 2
half = SCOOP / 2
radius = (half * half + CUT * CUT) / (2 * CUT)
profile = radius - np.sqrt(radius * radius - np.minimum(np.abs(phase), half) ** 2)
profile = np.minimum(profile, CUT)
profile = gaussian_filter(profile, 0.22, mode='wrap')

micro = periodic_noise(1.1)
height = 0.06 + np.broadcast_to(profile, (HEIGHT, WIDTH)).copy()
height += micro * 0.000035
slope_x = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * DX)
slope_up = (np.roll(height, 1, axis=0) - np.roll(height, -1, axis=0)) / (2 * DY)
normals = np.stack((-slope_x, -slope_up, np.ones_like(height)), axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
normal_pixels = np.rint((normals * 0.5 + 0.5) * 255).astype(np.uint8)

# Sanded primer obscures MDF fibres and has the same colour in scoops and on peaks.
albedo_variation = periodic_noise(14) * 0.18 + micro * 0.10
albedo = np.clip(np.array([239.0, 239.0, 237.0]) + albedo_variation[..., None], 0, 255)
color_pixels = np.rint(albedo).astype(np.uint8)
Image.fromarray(color_pixels).save(OUT / 'texture.png')
Image.fromarray(normal_pixels).save(OUT / 'normal.png')

metadata = {
    'repeatWidthIn': round(REPEAT_WIDTH, 2),
    'repeatHeightIn': round(REPEAT_HEIGHT, 2),
    'depthIn': 0.37,
    'note': 'Manufacturer specs override photo estimates: nine 1.31 in repeats, each a 1.18 in concave scoop and 0.13 in flat peak, with a 0.31 in cut and 0.37 in total thickness; nine stated pitches span 11.79 in versus the listed 11.80 in panel width. The main photo supplies the white sanded-primer finish over MDF, with no visible wood grain or backing; the circular scoop shape follows the close-ups, and the tile covers 11.79 by 23.58 in.'
}
(OUT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.55, 0.65, 0.72])
light /= np.linalg.norm(light)
illumination = 0.30 + 0.70 * np.maximum(normals @ light, 0)
linear_color = (albedo / 255) ** 2.2
shaded = np.clip((linear_color * illumination[..., None]) ** (1 / 2.2) * 255, 0, 255)
size = (256, 512)
color_tile = Image.fromarray(color_pixels).resize(size, Image.Resampling.LANCZOS)
shaded_tile = Image.fromarray(np.rint(shaded).astype(np.uint8)).resize(size, Image.Resampling.LANCZOS)
preview = Image.new('RGB', (1536, 1536))
for row in range(3):
    for col in range(3):
        preview.paste(color_tile, (col * size[0], row * size[1]))
        preview.paste(shaded_tile, (768 + col * size[0], row * size[1]))
preview.save(OUT / 'preview.png')

assert WIDTH / HEIGHT == REPEAT_WIDTH / REPEAT_HEIGHT
assert np.isfinite(normals).all()
assert abs(np.linalg.norm(normals, axis=-1) - 1).max() < 1e-12
print(f'Wrote seamless {WIDTH} x {HEIGHT} maps: {REPEAT_WIDTH:.2f} x {REPEAT_HEIGHT:.2f} in, nine Valley repeats.')
print(f'Profile relief: {np.ptp(profile):.5f} in; normal convention: OpenGL +Y up.')
