import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates


ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
FACE, GAP, SLATS = 1.20, 0.49, 7
PITCH = FACE + GAP
WIDTH = SLATS * PITCH
HEIGHT = WIDTH * H / W
DEPTH = 0.35
rng = np.random.default_rng(9031)


def noise(sy, sx):
    field = gaussian_filter(rng.standard_normal((H, W)), (sy, sx), mode="wrap")
    return field / field.std()


def save(name, values):
    Image.fromarray(np.uint8(np.clip(values, 0, 1) * 255 + 0.5)).save(ROOT / name)


photo = np.asarray(Image.open(ROOT / "main.jpg").convert("RGB"), dtype=float)
samples = [(900, 740), (1150, 650), (1100, 1020), (1200, 1090), (1000, 880)]
swatches = np.array([np.median(photo[y-12:y+12, x-12:x+12], axis=(0, 1)) for x, y in samples])
oak = np.median(swatches, axis=0) / 255
felt = np.median(photo[468:492, 1188:1212], axis=(0, 1)) / 255

y, x = np.mgrid[:H, :W]
wall_x = (x + 0.5) * WIDTH / W
phase = np.mod(wall_x, PITCH)
slat_id = np.floor(wall_x / PITCH).astype(int)
distance = np.abs(phase - PITCH / 2)
wood_mask = distance <= FACE / 2

warp = 3.0 * noise(190, 19) + 1.3 * noise(65, 7)
warped_x = np.mod(x + warp, W)
coords = np.array([y.astype(float), warped_x])
fibers = map_coordinates(noise(55, 0.65), coords, order=1, mode="grid-wrap")
fine = map_coordinates(noise(13, 0.38), coords, order=1, mode="grid-wrap")
broad = noise(170, 10)
growth = np.sin(2 * np.pi * (x * 35 / W + 0.15 * noise(240, 20)))
pores = np.maximum(fine - 1.25, 0) ** 1.2
grain = 0.010 * fibers + 0.005 * fine + 0.010 * broad + 0.004 * growth - 0.014 * pores
tones = np.array([-0.005, 0.012, -0.010, 0.004, 0.017, -0.002, -0.012])
wood = oak + (grain + tones[slat_id])[..., None] * np.array([1.0, 0.91, 0.77])
felt_noise = noise(0.5, 0.5)
backing = felt + (0.004 * felt_noise + 0.002 * noise(3, 3))[..., None]
color = np.where(wood_mask[..., None], wood, backing)
save("texture.png", color)

# The V is cut into felt, not an empty slot between rigid wooden cores.
groove_depth = 6.2 / 25.4
height = DEPTH - np.clip((distance - FACE / 2) / (GAP / 2), 0, 1) * groove_depth
height = gaussian_filter(height, (0, 0.48), mode="wrap")
height += np.where(wood_mask, 0.00012 * fibers + 0.00005 * fine, 0.00022 * felt_noise)
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH / W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT / H)
normal = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
save("normal.png", normal * 0.5 + 0.5)

metadata = {
    "repeatWidthIn": round(WIDTH, 5),
    "repeatHeightIn": round(HEIGHT, 5),
    "depthIn": DEPTH,
    "note": "Manufacturer specifications override photo estimates: seven 1.20 in slat faces on a 1.69 in pitch, 0.49 in wide 90-degree V-grooves cut 6.2 mm into coreless felt, and 0.35 in total depth; these inch components total 11.83 in versus the listed 11.80 in nominal panel width. The tile is seven pitches wide and 23.66 in tall, with procedural wrapping oak grain and oak/black-felt colors sampled from the main listing photo.",
}
(ROOT / "texture.json").write_text(json.dumps(metadata, indent=2) + "\n")

light = np.array([-0.5, 0.65, 0.65])
light /= np.linalg.norm(light)
diffuse = np.maximum(normal @ light, 0)
linear = np.where(color <= 0.04045, color / 12.92, ((color + 0.055) / 1.055) ** 2.4)
shaded_linear = linear * (0.28 + 0.9 * diffuse[..., None])
shaded = np.where(shaded_linear <= 0.0031308, shaded_linear * 12.92, 1.055 * shaded_linear ** (1 / 2.4) - 0.055)

preview = Image.new("RGB", (1536, 1536))
for side, values in enumerate((color, shaded)):
    tile = Image.fromarray(np.uint8(np.clip(values, 0, 1) * 255 + 0.5)).resize((256, 512), Image.Resampling.LANCZOS)
    for row in range(3):
        for col in range(3):
            preview.paste(tile, (side * 768 + col * 256, row * 512))
preview.save(ROOT / "preview.png")
print(json.dumps(metadata, indent=2))
print("Wrote texture.png, normal.png and preview.png at", ROOT)
