from pathlib import Path
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent
WIDTH, HEIGHT = 896, 1792
PITCH, FACE, GAP = 1.66, 1.11, 0.55
REPEATS = 7
REPEAT_WIDTH = REPEATS * PITCH
REPEAT_HEIGHT = REPEAT_WIDTH * HEIGHT / WIDTH
CUT_DEPTH, THICKNESS = 0.14, 0.20
rng = np.random.default_rng(6577116)


def periodic_noise(sigma):
    noise = gaussian_filter(rng.standard_normal((HEIGHT, WIDTH)), sigma, mode='wrap')
    return noise / noise.std()


def srgb_to_linear(value):
    return np.where(value <= 0.04045, value / 12.92, ((value + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(value):
    value = np.clip(value, 0, 1)
    return np.where(value <= 0.0031308, value * 12.92, 1.055 * value ** (1 / 2.4) - 0.055)


# Sample only the main listing's flat white face; exposure is removed because it is studio-lit.
photo = np.asarray(Image.open(ROOT / 'main.png').convert('RGB'), dtype=np.float64)
sample = photo[280:340, 800:1050].reshape(-1, 3)
sample = np.median(sample, axis=0)
white = 234.0 * sample / sample.mean()

x = (np.arange(WIDTH) + 0.5) * REPEAT_WIDTH / WIDTH
phase = (x + FACE / 2) % PITCH
edge_distance = np.minimum(phase, FACE - phase)
# A tiny eased machining edge retains the specified square channel and full cut depth.
bevel = 0.012
eased = np.clip(edge_distance / bevel + 0.5, 0, 1)
eased = eased * eased * (3 - 2 * eased)
primer = periodic_noise((0.65, 0.65))
height = CUT_DEPTH * eased[None, :] + primer * 0.000035

# Sanded primer conceals MDF grain; surface variation stays minute and nondirectional.
variation = 0.16 * primer + 0.10 * periodic_noise((12, 12))
slat_id = np.floor((x + FACE / 2) / PITCH).astype(int) % REPEATS
slat_tone = rng.uniform(-0.35, 0.35, REPEATS)
variation += slat_tone[slat_id][None, :] * eased[None, :]
albedo = np.clip(white[None, None, :] + variation[:, :, None], 0, 255)
color_image = Image.fromarray(np.rint(albedo).astype(np.uint8))
color_image.save(ROOT / 'texture.png')

dx, dy = REPEAT_WIDTH / WIDTH, REPEAT_HEIGHT / HEIGHT
slope_x = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * dx)
slope_y = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * dy)
normal = np.stack((-slope_x, slope_y, np.ones_like(height)), axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
normal_pixels = np.rint((normal * 0.5 + 0.5) * 255).astype(np.uint8)
Image.fromarray(normal_pixels).save(ROOT / 'normal.png')

metadata = {
    'repeatWidthIn': round(REPEAT_WIDTH, 4),
    'repeatHeightIn': round(REPEAT_HEIGHT, 4),
    'depthIn': THICKNESS,
    'note': 'Manufacturer spec sheet overrides photo estimates: Slat has 1.11 in flat faces, 0.55 in square channels, 1.66 in pitch, 7 repeats per panel, 0.14 in cut depth and 0.20 in total thickness; its stated 11.80 in panel width differs from 7 pitches (11.62 in), so this seamless tile preserves the exact pitch over seven repeats. Main-photo neutral primed white is exposure-corrected for unlit albedo across faces and groove floors, with subtle sanded-primer texture, no exposed wood grain or felt; the 11.62 by 23.24 in tile has no vertical board joints.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.55, 0.65, 0.75])
light /= np.linalg.norm(light)
illumination = 0.32 + 0.68 * np.maximum(normal @ light, 0)
shaded = linear_to_srgb(srgb_to_linear(albedo / 255) * illumination[:, :, None])
shaded_image = Image.fromarray(np.rint(shaded * 255).astype(np.uint8))
preview = Image.new('RGB', (1184, 1232), '#d8d8d8')
draw = ImageDraw.Draw(preview)
for left, source, label in [(24, color_image, 'COLOR / 3 x 3 / UNLIT'), (608, shaded_image, 'NORMAL RELIEF / 3 x 3 / UPPER-LEFT LIGHT')]:
    tiled = Image.fromarray(np.tile(np.asarray(source), (3, 3, 1)))
    tiled = tiled.resize((552, 1104), Image.Resampling.LANCZOS)
    preview.paste(tiled, (left, 64))
    draw.text((left, 26), label, fill='#252525')
draw.text((24, 1192), 'SLAT: 1.11 in face + 0.55 in channel | Tile: 11.62 x 23.24 in | Depth: 0.20 in', fill='#252525')
preview.save(ROOT / 'preview.png')

assert WIDTH / HEIGHT == REPEAT_WIDTH / REPEAT_HEIGHT
assert np.isfinite(normal).all()
assert abs(np.linalg.norm(normal, axis=-1) - 1).max() < 1e-12
print(json.dumps({'size': [WIDTH, HEIGHT], 'sample_rgb': sample.tolist(), 'albedo_rgb': white.tolist(), 'repeat_inches': [REPEAT_WIDTH, REPEAT_HEIGHT], 'slats_per_tile': REPEATS}, indent=2))
for name, pixels in [('color', np.asarray(color_image)), ('normal', normal_pixels)]:
    a = pixels.astype(float)
    print(f'{name}: horizontal wrap mean delta {abs(a[:, 0] - a[:, -1]).mean():.3f}; vertical wrap mean delta {abs(a[0] - a[-1]).mean():.3f}')
