import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

OUT = Path(__file__).resolve().parent
WIDTH, HEIGHT = 1024, 2048
PITCH = 1.31
FLUTES = 9
REPEAT_WIDTH = PITCH * FLUTES
REPEAT_HEIGHT = REPEAT_WIDTH * HEIGHT / WIDTH
RELIEF = 0.29
rng = np.random.default_rng(73)


def periodic_noise(sigma):
    noise = gaussian_filter(rng.standard_normal((HEIGHT, WIDTH)), sigma, mode='wrap')
    return noise / noise.std()


# Sample at pixel centers so the texture boundary falls exactly on a trough.
x = (np.arange(WIDTH) + 0.5) * REPEAT_WIDTH / WIDTH
phase = (x / PITCH) % 1
cross_section = np.sqrt(np.maximum(0, 1 - (2 * phase - 1) ** 2))
fine = periodic_noise(0.65)
soft = periodic_noise(5)
height = RELIEF * cross_section[None, :] + fine * 0.000035 + soft * 0.000025

# The primer is opaque: profile shading belongs only in the normal map.
albedo = np.array([229.0, 229.0, 227.5])[None, None, :]
albedo = np.broadcast_to(albedo, (HEIGHT, WIDTH, 3)).copy()
albedo += (fine * 0.22 + soft * 0.13)[..., None]
color = np.uint8(np.clip(np.rint(albedo), 0, 255))
Image.fromarray(color).save(OUT / 'texture.png')

dx = REPEAT_WIDTH / WIDTH
dy = REPEAT_HEIGHT / HEIGHT
slope_x = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * dx)
slope_down = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * dy)
# Image rows point down; the OpenGL tangent-space green axis points up.
normal = np.stack((-slope_x, slope_down, np.ones_like(height)), axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
normal_rgb = np.uint8(np.clip(np.rint((normal * 0.5 + 0.5) * 255), 0, 255))
Image.fromarray(normal_rgb).save(OUT / 'normal.png')

metadata = {
    'repeatWidthIn': round(REPEAT_WIDTH, 6),
    'repeatHeightIn': round(REPEAT_HEIGHT, 6),
    'depthIn': 0.35,
    'note': 'Manufacturer spec sheet overrides photo estimates: Ridge has nine convex half-round flutes at 1.31 in pitch, 0.29 in relief and 0.35 in total thickness; this tile spans nine pitches (11.79 in, versus the stated 11.80 in panel width) by 23.58 in. Neutral primed-white color follows the main photo and specified sanded primer finish, with subtle primer texture and no wood grain, veneer, felt or dark backing.'
}
(OUT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.6, 0.7, 0.65])
light /= np.linalg.norm(light)
intensity = 0.35 + 0.65 * np.maximum(0, normal @ light)
linear_color = (color.astype(float) / 255) ** 2.2
shaded = np.uint8(np.clip((linear_color * intensity[..., None]) ** (1 / 2.2) * 255, 0, 255))
preview = Image.new('RGB', (1536, 1536))
for side, data in enumerate((color, shaded)):
    small = Image.fromarray(data).resize((256, 512), Image.Resampling.LANCZOS)
    for row in range(3):
        for col in range(3):
            preview.paste(small, (side * 768 + col * 256, row * 512))
preview.save(OUT / 'preview.png')

assert WIDTH / HEIGHT == REPEAT_WIDTH / REPEAT_HEIGHT
assert np.isfinite(normal).all()
assert np.allclose(np.linalg.norm(normal, axis=-1), 1)
print(f'Built {WIDTH} x {HEIGHT}: {FLUTES} Ridge flutes, {REPEAT_WIDTH:.2f} x {REPEAT_HEIGHT:.2f} in')
print(f'Color edge differences (8-bit), x/y: {np.abs(color[:, 0].astype(float) - color[:, -1]).mean():.3f} / {np.abs(color[0].astype(float) - color[-1]).mean():.3f}')
