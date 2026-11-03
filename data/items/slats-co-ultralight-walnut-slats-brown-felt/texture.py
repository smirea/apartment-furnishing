import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter


ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
SLATS = 7
FACE, GAP = 1.20, 0.49
PITCH = FACE + GAP
WIDTH, HEIGHT = SLATS * PITCH, SLATS * PITCH * 2
rng = np.random.default_rng(731)
y, x = np.mgrid[:H, :W]
xin, yin = (x + 0.5) * WIDTH / W, (y + 0.5) * HEIGHT / H
phase = xin % PITCH
face_distance = np.abs(phase - PITCH / 2)
wood = face_distance <= FACE / 2


def noise(sy, sx):
    a = gaussian_filter(rng.standard_normal((H, W)), (sy, sx), mode="wrap")
    return a / max(a.std(), 1e-8)


source = Image.open(ROOT / "main.jpg").convert("RGB")
mask = Image.new("L", source.size)
draw = ImageDraw.Draw(mask)
draw.polygon([(550, 555), (1450, 300), (1450, 343), (580, 589)], fill=255)
wood_color = np.median(np.asarray(source)[np.asarray(mask) > 0], axis=0)
draw.rectangle((0, 0, source.width, source.height), fill=0)
draw.polygon([(770, 785), (1450, 587), (1450, 598), (780, 793)], fill=255)
felt_color = np.median(np.asarray(source)[np.asarray(mask) > 0], axis=0)

tone = np.zeros((H, W))
grain_height = np.zeros((H, W))
slat_index = np.floor(xin / PITCH).astype(int)
for i in range(SLATS):
    active = slat_index == i
    local = (phase - PITCH / 2) / FACE
    t = 2 * np.pi * yin / HEIGHT
    bend = 0.045 * np.sin(t + i * 1.73) + 0.025 * np.sin(3 * t + i)
    bend += 0.014 * noise(95, 12)
    # Periodic longitudinal warping keeps even cathedral grain continuous at the tile ends.
    rings = local + bend + 0.15 * np.cos(t + i * 2.1) * np.exp(-((local + 0.1) / 0.5) ** 2)
    broad = np.sin(2 * np.pi * (rings * 6.8 + i * 0.731))
    fine = np.sin(2 * np.pi * (rings * 37 + 0.20 * noise(32, 3)))
    pores = np.maximum(0, noise(9, 0.6) - 1.0)
    growth = np.exp(-((np.sin(2 * np.pi * (rings * 10.7 + i * .2))) / .18) ** 2)
    value = rng.normal(0, 2.1) + 2.7 * broad + 1.1 * fine
    value += 1.6 * noise(75, 9) + 0.9 * noise(2.2, .6) - 3.8 * pores - 3.0 * growth
    tone[active] = value[active]
    grain_height[active] = (0.00025 * fine - 0.00035 * pores)[active]

felt_fiber = noise(.65, .65)
felt_cloud = noise(7, 6)
color = np.broadcast_to(felt_color, (H, W, 3)).copy().astype(float)
color += (1.7 * felt_fiber + .6 * felt_cloud)[..., None]
wood_rgb = wood_color + tone[..., None] * np.array([1.0, .95, .88])
color[wood] = wood_rgb[wood]
color = np.uint8(np.clip(color, 0, 255))

# The groove is felt on both 45-degree flanks, with an intact 2.8 mm backbone.
groove_distance = np.maximum(face_distance - FACE / 2, 0)
height = .35 - np.minimum(groove_distance, 6.2 / 25.4)
height += grain_height
height += (~wood) * .0004 * felt_fiber
height = gaussian_filter(height, .65, mode="wrap")
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH / W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT / H)
normal = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
normal_rgb = np.uint8(np.clip(np.rint((normal * .5 + .5) * 255), 0, 255))
Image.fromarray(color).save(ROOT / "texture.png")
Image.fromarray(normal_rgb).save(ROOT / "normal.png")

metadata = {
    "repeatWidthIn": WIDTH,
    "repeatHeightIn": HEIGHT,
    "depthIn": .35,
    "note": "Manufacturer spec overrides photo estimates: seven 1.20 in walnut faces on 1.69 in pitches with 0.49 in, 90-degree V-grooves cut 6.2 mm into 9 mm felt; these pitches total 11.83 in versus the nominal 11.80 in panel width. The tile is 23.66 in tall, and muted walnut and brown felt colors are sampled from the main listing photo.",
}
(ROOT / "texture.json").write_text(json.dumps(metadata, indent=2) + "\n")

light = np.array([-.45, .55, .80])
light /= np.linalg.norm(light)
shade = .35 + .65 * np.maximum(0, normal @ light)
linear = (color / 255) ** 2.2
shaded = np.uint8(np.clip((linear * shade[..., None]) ** (1 / 2.2) * 255, 0, 255))
tile_size = (256, 512)
preview = Image.new("RGB", (1536, 1536))
for col, data in enumerate((color, shaded)):
    tile = Image.fromarray(data).resize(tile_size, Image.Resampling.LANCZOS)
    for row in range(3):
        for n in range(3):
            preview.paste(tile, (col * 768 + n * 256, row * 512))
preview.save(ROOT / "preview.png")
print(json.dumps({"woodRGB": wood_color.tolist(), "feltRGB": felt_color.tolist(), **metadata}, indent=2))
assert W / H == WIDTH / HEIGHT
assert np.isfinite(normal).all()
