from pathlib import Path
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1600, 2000
WIDTH_MM, HEIGHT_MM = 600.0, 750.0
rng = np.random.default_rng(2187)
y, x = np.mgrid[:H, :W].astype(np.float32)


def noise(sy, sx):
    field = gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), (sy, sx), mode='wrap')
    return field / max(float(field.std()), 1e-8)


# Sample only the veneer interior; the polygon excludes props, felt and background.
photo = np.asarray(Image.open(ROOT / 'main.jpg').convert('RGB'), dtype=np.float32)
mask_image = Image.new('L', (photo.shape[1], photo.shape[0]))
ImageDraw.Draw(mask_image).polygon([(420, 340), (1510, 125), (1510, 1000), (1250, 1120)], fill=255)
samples = photo[np.asarray(mask_image) > 0]
base = np.median(samples, axis=0)
print('Main-photo veneer median RGB:', base.round(1).tolist())

# All noise and coordinate warps are periodic, including the long grain direction.
warp = 11 * noise(155, 55) + 2.5 * noise(48, 18)
warped_x = (x + warp) % W
warped_y = y % H

def warped(field):
    return map_coordinates(field, [warped_y, warped_x], order=1, mode='grid-wrap')


broad = warped(noise(170, 42))
medium = warped(noise(90, 11))
fibers = warped(noise(37, 1.1))
pore_field = warped(noise(14, .65))
pores = np.clip(-pore_field - 1.15, 0, 2.8)

# Growth contours vary locally rather than forming straight, equally spaced stripes.
growth = noise(180, 70)
phase = x * (2 * np.pi * 82 / W) + 3.5 * growth + .8 * noise(80, 28)
rings = np.exp(-((np.sin(phase) + .88) / .18) ** 2)
rings *= .35 + .65 / (1 + np.exp(-noise(100, 30)))
local_x = x % (W // 2)
cathedral = np.zeros_like(x)
for index, center, origin in [(0, 315, 740), (1, 465, 1540)]:
    radius = np.sqrt((local_x - center + warp * .65) ** 2 +
                     (340 * np.sin(np.pi * (y - origin) / H)) ** 2 + 1400)
    contour_phase = radius * .19 + 1.15 * noise(110, 32) + .2 * medium
    contour = np.exp(-(np.sin(contour_phase) / .13) ** 2)
    envelope = np.sin(np.pi * local_x / (W // 2)) ** 2
    cathedral += contour * envelope * np.clip(.55 + .5 * noise(55, 22), 0, 1) * (x // (W // 2) == index)
tone = 5.8 * broad + 2.5 * medium + 1.6 * fibers - 3.7 * pores - 4.0 * rings - 9 * cathedral
panel = (x // (W // 2)).astype(int)
panel_tone = np.array([-1.7, 1.7], dtype=np.float32)[panel]
color = base[None, None, :] + (tone + panel_tone)[..., None] * np.array([1.0, .94, .86])
color += broad[..., None] * np.array([.6, .0, -.55])

mm_x = (x + .5) * WIDTH_MM / W
# The tile boundary runs through a join; two 1.5 mm chamfers make one 3 mm V.
distance = np.minimum(mm_x % 300, 300 - mm_x % 300)
chamfer = np.clip(distance / 1.5, 0, 1)
felt = np.array([36, 35, 34], dtype=np.float32)
felt_noise = noise(.55, .55)
face_mask = np.clip((distance - 1.32) / .18, 0, 1)
color = color * face_mask[..., None] + (felt + felt_noise[..., None] * 1.7) * (1 - face_mask[..., None])
height = 7.5 + 1.5 * chamfer
height += (fibers * .009 - pores * .011 + medium * .008 - cathedral * .012) * chamfer

dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH_MM / W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT_MM / H)
# Image rows increase downward, opposite to the OpenGL tangent-space Y axis.
normals = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
rgb = np.clip(np.rint(color), 0, 255).astype(np.uint8)
normal_rgb = np.clip(np.rint((normals * .5 + .5) * 255), 0, 255).astype(np.uint8)
Image.fromarray(rgb).save(ROOT / 'texture.png')
Image.fromarray(normal_rgb).save(ROOT / 'normal.png')

metadata = {
    'repeatWidthIn': WIDTH_MM / 25.4,
    'repeatHeightIn': HEIGHT_MM / 25.4,
    'depthIn': 9 / 25.4,
    'note': 'Manufacturer spec sheet overrides photo estimates: two 300 mm panels, each with a continuous 297 mm veneer face and no internal slats, meeting at a 3 mm wide, 1.5 mm deep 90-degree V reveal; total thickness is 9 mm. Pale taupe-brown walnut color is sampled from main.jpg with black felt at joins; grain wraps over 750 mm vertically, and Accent is not suitable for wrapping columns per the spec sheet.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-.5, .6, .7], dtype=np.float32)
light /= np.linalg.norm(light)
shade = .28 + .72 * np.maximum(0, normals @ light)
shaded = np.clip(rgb.astype(np.float32) * shade[..., None], 0, 255).astype(np.uint8)
size = (480, 600)
albedo_small = Image.fromarray(rgb).resize(size, Image.Resampling.LANCZOS)
shaded_small = Image.fromarray(shaded).resize(size, Image.Resampling.LANCZOS)
preview = Image.new('RGB', (size[0] * 6, size[1] * 3 + 40), '#eeeae5')
draw = ImageDraw.Draw(preview)
draw.text((14, 14), 'COLOR MAP - 3 x 3 tiles', fill='#282828')
draw.text((size[0] * 3 + 14, 14), 'NORMAL MAP SHADING - upper-left light - 3 x 3 tiles', fill='#282828')
for row in range(3):
    for col in range(3):
        preview.paste(albedo_small, (col * size[0], 40 + row * size[1]))
        preview.paste(shaded_small, ((col + 3) * size[0], 40 + row * size[1]))
preview.save(ROOT / 'preview.png')
print(f'Wrote {W} x {H} maps; repeat {WIDTH_MM / 25.4:.5f} x {HEIGHT_MM / 25.4:.5f} in')
print('Periodic boundary height steps (mm), X / Y:', float(abs(height[:, 0] - height[:, -1]).mean()), float(abs(height[0] - height[-1]).mean()))
