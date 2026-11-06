from pathlib import Path
import json
import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1536, 1920
rng = np.random.default_rng(732)
source = np.asarray(Image.open(ROOT / 'gallery-03.jpg').convert('RGB'))[14:-14, 14:-14]
field = cv2.resize(source, (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255
lab = cv2.cvtColor(field, cv2.COLOR_RGB2LAB)
# Remove the broad photographic exposure gradient while retaining the actual fibers.
for c in range(3):
    broad = gaussian_filter(lab[:, :, c], 100)
    lab[:, :, c] += np.median(broad) - broad
field = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)
main = np.asarray(Image.open(ROOT / 'main.jpg').convert('RGB')).astype(np.float32) / 255
main_lab = cv2.cvtColor(main, cv2.COLOR_RGB2LAB)
swatch = main_lab[440:570, 240:530]
target = np.median(swatch.reshape(-1, 3), axis=0)
lab = cv2.cvtColor(np.clip(field, 0, 1), cv2.COLOR_RGB2LAB)
lab += target - np.median(lab.reshape(-1, 3), axis=0)
field = np.clip(cv2.cvtColor(lab, cv2.COLOR_LAB2RGB), 0, 1)

y, x = np.mgrid[:H, :W].astype(np.float32)
cx, cy = (W - 1) / 2, (H - 1) / 2
rx, ry = W / 2 - 1, H / 2 - 1
nx, ny = (x - cx) / rx, (y - cy) / ry
rho = np.sqrt(nx * nx + ny * ny)
theta = np.arctan2(ny, nx)
normal_scale = 1 / np.sqrt((np.cos(theta) / rx) ** 2 + (np.sin(theta) / ry) ** 2)
depth = (1 - rho) * normal_scale

angles = np.linspace(-np.pi, np.pi, 20001)
speed = np.sqrt((rx * np.sin(angles)) ** 2 + (ry * np.cos(angles)) ** 2)
arc = np.cumsum(speed) * (angles[1] - angles[0])
s = np.interp(theta, angles, arc)
perimeter = arc[-1]
period = perimeter / round(perimeter / 18)
edge_width = 10.5
v = depth / edge_width
phase = 2 * np.pi * (s / period + 0.48 * v)
strand = np.sin(phase)
strand_detail = np.sin(phase * 9 + v * 19) * 0.012
edge_noise = gaussian_filter(rng.normal(size=(H, W)).astype(np.float32), 0.45)
base = np.median(field.reshape(-1, 3), axis=0)
variation = 0.055 * strand + 0.015 * np.sin(phase * 2) + strand_detail + 0.017 * edge_noise
edge = np.clip(base[None, None, :] + variation[:, :, None], 0, 1)
blend = np.clip((edge_width - depth) / 1.2, 0, 1)
field = field * (1 - blend[:, :, None]) + edge * blend[:, :, None]
roughness = 0.22 * np.sin(s * 1.4) + 0.12 * np.sin(s * 3.7)
alpha = np.clip(depth + roughness + 0.5, 0, 1)
rgba = np.dstack((np.uint8(np.clip(field, 0, 1) * 255 + 0.5), np.uint8(alpha * 255 + 0.5)))
rgba[alpha == 0, :3] = 0
texture = Image.fromarray(rgba, 'RGBA')
texture.save(ROOT / 'texture.png')
(ROOT / 'texture.json').write_text(json.dumps({'note': 'Used the gallery’s full top-down jute weave without tiling, flattened broad photographic lighting, and matched the natural tan color to the main listing photo. Shaped to the specified 96 × 120-inch oval with a narrow braided edge and transparent surroundings.'}, indent=2) + '\n')

preview = Image.new('RGB', (1350, 900), '#e9e9e9')
draw = ImageDraw.Draw(preview)
draw.text((25, 18), 'MAIN LISTING PHOTO', fill='#252525')
draw.text((715, 18), 'TOP-DOWN TEXTURE / 96 x 120 in OVAL', fill='#252525')
photo = Image.open(ROOT / 'main.jpg').convert('RGB')
photo.thumbnail((650, 810))
preview.paste(photo, (20, 70))
thumb = texture.copy()
thumb.thumbnail((620, 800))
preview.paste(thumb, (715, 65), thumb)
preview.save(ROOT / 'preview.png')
print(f'Wrote texture.png ({W} x {H}, RGBA), texture.json, and preview.png')
