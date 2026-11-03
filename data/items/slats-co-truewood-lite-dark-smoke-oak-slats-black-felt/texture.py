import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates


OUT = Path(__file__).resolve().parent
W, H = 1000, 2032
MM_PER_PIXEL = 0.3
rng = np.random.default_rng(4118)


def noise(shape, sigma):
    a = gaussian_filter(rng.standard_normal(shape), sigma, mode="wrap")
    return (a - a.mean()) / max(a.std(), 1e-8)


y, x = np.mgrid[:H, :W]
rgb = np.empty((H, W, 3), dtype=float)
felt = noise((H, W), (0.6, 0.6))
felt_cloud = noise((H, W), (13, 13))
rgb[:] = np.array([19, 19, 18]) + (felt * 1.5 + felt_cloud * 0.65)[..., None]
height = 5 + felt * 0.018

for slat in range(8):
    start = slat * 125
    # Half a gap at each tile edge preserves the installed seam pitch.
    local_x = np.arange(125) - 17.5
    face = (local_x >= 0) & (local_x < 90)
    u = np.broadcast_to(local_x, (H, 125))
    v = np.broadcast_to(np.arange(H)[:, None], u.shape)
    phase = rng.uniform(0, 2 * np.pi, 5)
    bend = (
        3.5 * np.sin(2 * np.pi * v / H + phase[0])
        + 1.6 * np.sin(4 * np.pi * v / H + phase[1])
        + 0.7 * np.sin(10 * np.pi * v / H + phase[2])
    )
    warped = u + bend * (0.7 + 0.3 * np.sin(u / 36 + phase[3]))
    broad = noise((H, 125), (150, 13))
    fibers = noise((H, 125), (19, 0.65))
    fibers = map_coordinates(fibers, [v, warped % 125], order=1, mode="grid-wrap")
    growth = np.sin(warped * 0.49 + 0.7 * np.sin(warped * 0.1) + phase[4])
    growth = np.maximum(growth, 0) ** 7
    pore_field = noise((H, 125), (7, 0.5))
    pore_field = map_coordinates(pore_field, [v, warped % 125], order=1, mode="grid-wrap")
    pores = np.clip((pore_field - 1.15) * 0.8, 0, 1.5)
    fine = noise((H, 125), (1.4, 0.45))
    tone = rng.normal(0, 4)
    variation = broad * 3.1 + fibers * 3.3 - growth * 4.0 - pores * 19 + fine * 0.8
    wood = np.array([123, 91, 70]) + tone * np.array([1, 0.85, 0.65])
    wood = wood + variation[..., None] * np.array([1, 0.88, 0.72])
    rgb[:, start:start + 125][:, face] = wood[:, face]
    distance_mm = np.minimum(u, 90 - u) * MM_PER_PIXEL
    bevel = np.clip(distance_mm / 0.45, 0, 1)
    wood_height = 5 + 5 * bevel + fibers * 0.008 - pores * 0.025
    height[:, start:start + 125][:, face] = wood_height[:, face]

color = np.uint8(np.clip(np.rint(rgb), 0, 255))
Image.fromarray(color).save(OUT / "texture.png")

dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * MM_PER_PIXEL)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * MM_PER_PIXEL)
normal = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
Image.fromarray(np.uint8(np.rint((normal * 0.5 + 0.5) * 255))).save(OUT / "normal.png")

metadata = {
    "repeatWidthIn": 300 / 25.4,
    "repeatHeightIn": 24,
    "depthIn": 10 / 25.4,
    "note": "Manufacturer spec sheet overrides photo estimates: 8 slats with 27 mm (1.063 in) faces and 10.5 mm (0.413 in) rectangular felt gaps on a 37.5 mm (1.476 in) pitch give a 300 mm installed repeat, with 5 mm slats over 5 mm felt (10 mm total), rather than the 305 mm loose-panel width. Warm dark smoke oak tones are sampled from the main listing photo over black felt; procedural grain wraps over 24 in vertically, with a small edge softening for the normal map.",
}
(OUT / "texture.json").write_text(json.dumps(metadata, indent=2) + "\n")

light = np.array([-0.45, 0.55, 0.8])
light /= np.linalg.norm(light)
diffuse = np.maximum(normal @ light, 0)
linear = (color / 255) ** 2.2
shaded = np.uint8(np.clip((linear * (0.28 + 0.85 * diffuse[..., None])) ** (1 / 2.2) * 255, 0, 255))
thumb_size = (250, 508)
preview = Image.new("RGB", (1520, 1568), (235, 232, 227))
draw = ImageDraw.Draw(preview)
draw.text((10, 10), "ALBEDO / 3 x 3 / 35.433 x 72 inches", fill=(35, 35, 35))
draw.text((770, 10), "NORMAL-MAP LIGHTING / upper-left light / 3 x 3", fill=(35, 35, 35))
for offset, pixels in [(0, color), (770, shaded)]:
    thumb = Image.fromarray(pixels).resize(thumb_size, Image.Resampling.LANCZOS)
    for row in range(3):
        for col in range(3):
            preview.paste(thumb, (offset + col * 250, 40 + row * 508))
preview.save(OUT / "preview.png")
print(json.dumps(metadata, indent=2))
print(f"Wrote texture.png, normal.png ({W} x {H}), texture.json and preview.png")
