from pathlib import Path
import json

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

OUT = Path(__file__).parent
W, H = 1024, 2048
SLATS = 7
FACE, GAP = 1.20, 0.49
PITCH = FACE + GAP
WIDTH, HEIGHT = SLATS * PITCH, 23.66
rng = np.random.default_rng(20261103)


def noise(shape, sigma):
    field = gaussian_filter(rng.standard_normal(shape), sigma, mode='wrap')
    return field / max(field.std(), 1e-9)


y, x = np.mgrid[:H, :W]
xin = x / W * WIDTH
t = (xin - GAP / 2) / PITCH
slat = np.floor(t).astype(int) % SLATS
local = np.mod(t, 1) * PITCH
wood = local < FACE
# Periodic fields keep the grain continuous through the top and bottom edges.
warp = noise((H, W), (110, 14)) * 2.4 + noise((H, W), (29, 30)) * 1.0
coords = np.array([y, (x + warp) % W])
broad = map_coordinates(noise((H, W), (140, 5)), coords, order=1, mode='grid-wrap')
fibers = map_coordinates(noise((H, W), (23, .65)), coords, order=1, mode='grid-wrap')
pores = np.maximum(-fibers - .7, 0) ** 1.4
fine = noise((H, W), (.55, .4))
long_grain = noise((H, W), (65, 1.6))
slat_tone = np.array([.5, -1.2, 1.5, -.3, 1.0, -1.0, .0])[slat]
variation = 2.3 * broad + 1.1 * long_grain - 3.2 * pores + .65 * fine + slat_tone
wood_base = np.array([225., 207., 183.])
wood_rgb = wood_base + variation[..., None] * np.array([1., 1.04, 1.1])

felt_cloud = noise((H, W), (8, 8))
felt_fine = noise((H, W), (.6, .6))
felt_fiber = noise((H, W), (1.8, .45))
felt_variation = 1.5 * felt_cloud + 2.0 * felt_fine + 1.0 * felt_fiber
felt_rgb = np.array([175., 166., 153.]) + felt_variation[..., None]
color = np.where(wood[..., None], wood_rgb, felt_rgb)
color = np.uint8(np.clip(color, 0, 255))

# A 90-degree V drops 6.2 mm into the 9 mm felt; it has no vertical core walls.
groove_x = np.maximum(local - FACE, 0)
groove_depth = np.minimum(groove_x, GAP - groove_x) * (6.2 / 25.4) / (GAP / 2)
height = np.where(wood, 0., -groove_depth)
height += np.where(wood, (.0006 * long_grain - .0004 * pores), .0008 * felt_fiber)
dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * WIDTH / W)
dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * HEIGHT / H)
normal = np.stack([-dx, dy, np.ones_like(height)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
normal_rgb = np.uint8(np.clip(np.rint((normal * .5 + .5) * 255), 0, 255))
Image.fromarray(color).save(OUT / 'texture.png')
Image.fromarray(normal_rgb).save(OUT / 'normal.png')
metadata = {
    'repeatWidthIn': WIDTH,
    'repeatHeightIn': HEIGHT,
    'depthIn': .35,
    'note': 'Manufacturer spec sheet overrides photo estimates: seven 1.20 in faces on a 1.69 in pitch with 0.49 in, 90-degree V-grooves cut 6.2 mm into 9 mm felt; seven exact pitches span 11.83 in rather than the listed 11.80 in panel width. The seamless tile is 23.66 in tall, with pale white-oak veneer and oatmeal felt colors taken from the main listing photo; no MDF or rigid core.'
}
(OUT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')
light = np.array([-.45, .55, .80])
light /= np.linalg.norm(light)
illumination = .42 + .58 * np.maximum(normal @ light, 0)
shaded = np.uint8(np.clip(color.astype(float) * illumination[..., None], 0, 255))
preview = Image.new('RGB', (1536, 1536))
for side, data in enumerate((color, shaded)):
    small = Image.fromarray(data).resize((256, 512), Image.Resampling.LANCZOS)
    for row in range(3):
        for col in range(3):
            preview.paste(small, (side * 768 + col * 256, row * 512))
preview.save(OUT / 'preview.png')
print(json.dumps(metadata, indent=2))
for name, data in [('color', color), ('normal', normal_rgb)]:
    print(name, 'edge mean absolute pixel differences:',
          'left/right', np.abs(data[:, 0].astype(float) - data[:, -1]).mean().round(3),
          'top/bottom', np.abs(data[0].astype(float) - data[-1]).mean().round(3))
