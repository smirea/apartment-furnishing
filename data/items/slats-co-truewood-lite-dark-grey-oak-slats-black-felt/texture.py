import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates


ROOT = Path(__file__).resolve().parent
W, H = 1200, 2000
WIDTH_MM, HEIGHT_MM = 300.0, 500.0
PITCH, FACE = 37.5, 27.0
rng = np.random.default_rng(4271)


def noise(sy, sx):
    field = gaussian_filter(rng.normal(size=(H, W)).astype(np.float32), (sy, sx), mode="wrap")
    return field / max(field.std(), 1e-8)


def save(name, array):
    Image.fromarray(np.uint8(np.clip(array, 0, 255))).save(ROOT / name)


y, x = np.mgrid[:H, :W].astype(np.float32)
x_mm = (x + 0.5) * WIDTH_MM / W
phase = (x_mm + FACE / 2) % PITCH - FACE / 2
edge_distance = FACE / 2 - abs(phase)
face_mask = edge_distance > 0
slat_index = np.floor((x_mm + FACE / 2) / PITCH).astype(int) % 8

# All filtering and grain warps wrap, including the long grain at the tile ends.
drift = 4.5 * noise(95, 20) + 1.3 * noise(28, 7)
warped_x = (x + drift) % W
long_grain = map_coordinates(noise(65, 1.3), [y, warped_x], order=1, mode="grid-wrap")
fibers = map_coordinates(noise(19, 0.55), [y, warped_x], order=1, mode="grid-wrap")
broad = noise(120, 15)
pores = np.clip(-long_grain - 0.65, 0, 2.4)
short_pores = pores * np.clip(noise(8, 1.0) + 0.65, 0, 1)
grain = 1.5 * broad + 1.7 * long_grain + 0.85 * fibers - 2.3 * short_pores
tones = np.array([-1.8, 1.5, -0.8, 2.2, -1.1, 0.5, -2.1, 1.0])[slat_index]
wood = np.array([65.0, 65.5, 64.5]) + (grain + tones)[..., None]
wood += noise(0.55, 0.45)[..., None] * 0.45
felt_fiber = noise(0.65, 0.65) * 0.9 + noise(2, 2) * 0.35
felt = np.array([17.0, 18.0, 18.0]) + felt_fiber[..., None]
color = np.where(face_mask[..., None], wood, felt)
save("texture.png", color)

# The veneer face sits 5 mm above the felt; the backing supplies the other 5 mm.
bevel = np.clip(edge_distance / 0.45, 0, 1)
profile = bevel * bevel * (3 - 2 * bevel)
height = 5.0 * profile + face_mask * (0.012 * long_grain + 0.004 * fibers)
height += (~face_mask) * 0.007 * felt_fiber
dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * WIDTH_MM / W)
dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * HEIGHT_MM / H)
normal = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
save("normal.png", np.rint((normal * 0.5 + 0.5) * 255))

metadata = {
    "repeatWidthIn": WIDTH_MM / 25.4,
    "repeatHeightIn": HEIGHT_MM / 25.4,
    "depthIn": 10 / 25.4,
    "note": "Manufacturer spec sheet dimensions override photo estimates and rounded inch values: eight 27 mm slat faces with 10.5 mm rectangular felt gaps on a 37.5 mm pitch, 300 mm installed width, and 10 mm total depth (5 mm slat + 5 mm felt). Tile is eight pitches wide and 500 mm tall; charcoal dark grey oak veneer tones are sampled from the main listing photo, with black felt and procedural wrapping grain; the small edge easing is an appearance approximation."
}
(ROOT / "texture.json").write_text(json.dumps(metadata, indent=2) + "\n")

light = np.array([-0.48, 0.58, 0.66])
light /= np.linalg.norm(light)
shade = 0.25 + 0.75 * np.maximum(0, normal @ light)
lit_normal = np.uint8(np.clip(shade[..., None] * 220, 0, 255)).repeat(3, axis=2)
tile = Image.open(ROOT / "texture.png")
normal_lit = Image.fromarray(lit_normal)
preview = Image.new("RGB", (1480, 1248), (35, 35, 35))
for column, source in enumerate([tile, normal_lit]):
    small = source.resize((240, 400), Image.Resampling.LANCZOS)
    for row in range(3):
        for col in range(3):
            preview.paste(small, (column * 740 + col * 240, 48 + row * 400))
draw = ImageDraw.Draw(preview)
draw.text((12, 15), "COLOR MAP / 3 x 3", fill="white")
draw.text((752, 15), "NORMAL RELIEF / UPPER-LEFT LIGHT / 3 x 3", fill="white")
preview.save(ROOT / "preview.png")
print(f"Created {W} x {H} maps; 8 slats; {WIDTH_MM / 25.4:.6f} x {HEIGHT_MM / 25.4:.6f} in repeat")
print("Boundary RGB mean differences (x, y):", np.abs(color[:, 0] - color[:, -1]).mean(), np.abs(color[0] - color[-1]).mean())
