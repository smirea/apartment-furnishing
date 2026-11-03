from pathlib import Path
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
SLATS = 7
FACE, GAP = 1.20, 0.49
PITCH = FACE + GAP
WIDTH = SLATS * PITCH
HEIGHT = WIDTH * H / W
DEPTH = 0.35
CUT = 6.2 / 25.4
rng = np.random.default_rng(307)


def noise(sx, sy):
    field = gaussian_filter(rng.normal(size=(H, W)).astype(np.float32), (sy, sx), mode='wrap')
    return field / max(float(field.std()), 1e-8)


def save(name, pixels):
    Image.fromarray(np.uint8(np.clip(np.rint(pixels), 0, 255))).save(ROOT / name)


# Half-grooves at tile boundaries reproduce the manufacturer's butt joint.
x = np.arange(W) * WIDTH / W
y = np.arange(H) * HEIGHT / H
phase = x % PITCH
edge_distance = np.minimum(phase, PITCH - phase)
face_mask = edge_distance >= GAP / 2
slat_index = np.minimum((x / PITCH).astype(int), SLATS - 1)

source = np.asarray(Image.open(ROOT / 'main.jpg').convert('RGB'))
# Interior panel swatch excludes the glass, table and exposed panel end.
swatch = source[int(source.shape[0] * .29):int(source.shape[0] * .46),
                int(source.shape[1] * .69):int(source.shape[1] * .96)]
values = swatch.reshape(-1, 3).astype(float)
luma = values.mean(axis=1)
face_color = np.median(values[(luma > 27) & (luma < 43)], axis=0)
# Felt's photographic brightness includes illumination on its sloping flanks.
felt_color = face_color * .68

warp = noise(15, 180) * .022
z = y[:, None] / HEIGHT
u = (x[None, :] + warp) / PITCH
fine_grain = noise(.7, 25)
long_grain = noise(2.0, 110)
broad_grain = noise(9, 230)
fiber = np.sin(2 * np.pi * (u * 72 + .4 * np.sin(2 * np.pi * z) + .17 * noise(4, 95)))
pores = np.maximum(noise(.65, 11) - 1.05, 0) ** 1.3
wood = 1.15 * fine_grain + 1.1 * long_grain + .65 * broad_grain + .35 * fiber - .9 * pores
slat_tones = rng.uniform(-1.8, 1.8, SLATS)
wood += slat_tones[slat_index][None, :]
felt_fibers = noise(.55, .65)
felt_mottling = noise(4, 5)
felt = .6 * felt_fibers + .35 * felt_mottling

color = np.where(face_mask[None, :, None],
                 face_color[None, None, :] + wood[:, :, None],
                 felt_color[None, None, :] + felt[:, :, None])
save('texture.png', color)

# A small smooth transition removes the infinitely sharp V apex and shoulders.
profile = CUT * np.minimum(edge_distance / (GAP / 2), 1)
profile = gaussian_filter(profile, .48, mode='wrap')
height = np.broadcast_to(profile[None, :], (H, W)).copy()
height += np.where(face_mask[None, :],
                   .00013 * long_grain + .00010 * fine_grain - .00012 * pores,
                   .00012 * felt_fibers)
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH / W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT / H)
# Image rows run down; OpenGL tangent-space Y runs up.
normal = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
save('normal.png', (normal * .5 + .5) * 255)

metadata = {
    'repeatWidthIn': round(WIDTH, 5),
    'repeatHeightIn': round(HEIGHT, 5),
    'depthIn': DEPTH,
    'note': 'Manufacturer specifications override photo estimates: seven 1.20 in faces on 1.69 in pitches with 0.49 in wide, 90-degree V-grooves cut 6.2 mm deep in 9 mm felt, and 0.35 in total thickness; the exact pitches total 11.83 in rather than the nominal 11.80 in panel width. The tile is seven pitches wide and 23.66 in tall, with black oak veneer and black felt colors sampled from the main listing photo, and no rigid core.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-.55, .6, .8])
light /= np.linalg.norm(light)
lambert = np.maximum(np.sum(normal * light, axis=-1), 0)
# Shade in linear light so the black material remains visible in the preview.
linear = (np.clip(color, 0, 255) / 255) ** 2.2
shaded = (linear * (.3 + .95 * lambert[:, :, None])) ** (1 / 2.2) * 255
thumb_w, thumb_h = 256, 512
albedo_thumb = Image.fromarray(np.uint8(np.clip(color, 0, 255))).resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
shaded_thumb = Image.fromarray(np.uint8(np.clip(shaded, 0, 255))).resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
preview = Image.new('RGB', (thumb_w * 6 + 24, thumb_h * 3 + 48), (190, 190, 190))
for row in range(3):
    for col in range(3):
        preview.paste(albedo_thumb, (col * thumb_w, 48 + row * thumb_h))
        preview.paste(shaded_thumb, (thumb_w * 3 + 24 + col * thumb_w, 48 + row * thumb_h))
draw = ImageDraw.Draw(preview)
draw.text((12, 17), 'COLOR MAP / 3 x 3', fill=(20, 20, 20))
draw.text((thumb_w * 3 + 36, 17), 'NORMAL-MAP LIGHTING / UPPER LEFT / 3 x 3', fill=(20, 20, 20))
preview.save(ROOT / 'preview.png')
print(json.dumps({'size': [W, H], 'faceRGB': face_color.tolist(), 'feltRGB': felt_color.tolist(), **metadata}, indent=2))
assert abs((W / H) - WIDTH / HEIGHT) < 1e-12
assert np.isfinite(normal).all()
for axis in (0, 1):
    seam = np.abs(np.take(color, 0, axis=axis) - np.take(color, -1, axis=axis))
    print(f'Color boundary axis {axis}: mean difference {seam.mean():.3f} / 255')
