import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter


ROOT = Path(__file__).resolve().parent
W, H = 1536, 1920
WIDTH_MM, HEIGHT_MM = 600.0, 750.0
rng = np.random.default_rng(2403)


def noise(sy, sx):
    field = gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), (sy, sx), mode="wrap")
    return field / max(field.std(), 1e-8)


def save_rgb(name, array):
    Image.fromarray(np.uint8(np.clip(array, 0, 255))).save(ROOT / name)


def normals(height):
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * WIDTH_MM / W)
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * HEIGHT_MM / H)
    # Image rows point down; OpenGL tangent-space green points up.
    n = np.stack((-dx, dy, np.ones_like(height)), axis=-1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


x = (np.arange(W, dtype=np.float32)[None, :] + 0.5) * WIDTH_MM / W
panel = np.floor(x / 300).astype(int)
joint_distance = np.minimum(x % 300, 300 - x % 300)
reveal = np.broadcast_to(joint_distance < 1.5, (H, W))

photo = np.asarray(Image.open(ROOT / "main.jpg").convert("RGB"), dtype=np.float32)
base = np.median(photo[250:650, 700:1400].reshape(-1, 3), axis=0)

# Periodic fields keep the veneer continuous across both texture boundaries.
drift = noise(140, 55)
warp = 2.8 * noise(180, 32) + 0.45 * noise(40, 12)
phase = x + warp
growth = np.zeros((H, W), dtype=np.float32)
for wavelength, weight in [(3.4, 0.4), (7.5, 0.45), (15, 0.25)]:
    cycles = round(WIDTH_MM / wavelength)
    wave = np.sin(2 * np.pi * phase * cycles / WIDTH_MM + 0.6 * drift)
    growth += weight * (np.exp(2.2 * wave) / np.exp(2.2) - 0.35)

fibers = noise(20, 0.65)
pores_field = noise(9, 0.45)
pores = np.maximum(pores_field - 1.05, 0) ** 1.3
fine = noise(1.0, 0.5)
cloud = noise(100, 22)
grain = -3.8 * growth + 1.3 * fibers - 2.3 * pores + 0.5 * fine + 1.5 * cloud
tones = np.array([0.7, -0.7], dtype=np.float32)[panel]
color = base[None, None, :] + (grain + tones)[..., None] * np.array([1.0, 0.92, 0.8])
color += np.stack((0.45 * cloud, 0.1 * cloud, -0.35 * cloud), axis=-1)
felt = np.clip(32 + 2 * noise(0.6, 0.6), 24, 40)
color[reveal] = np.stack((felt, felt, felt * 0.97), axis=-1)[reveal]

# Only the top 1.5 mm is chamfered; the intact felt remains 7.5 mm thick.
height = np.broadcast_to(7.5 + np.minimum(joint_distance, 1.5), (H, W)).copy()
height += np.where(reveal, 0, 0.006 * fibers - 0.009 * pores + 0.002 * fine)
n = normals(height)
save_rgb("texture.png", color)
save_rgb("normal.png", (n * 0.5 + 0.5) * 255)

metadata = {
    "repeatWidthIn": WIDTH_MM / 25.4,
    "repeatHeightIn": HEIGHT_MM / 25.4,
    "depthIn": 9 / 25.4,
    "note": "Manufacturer spec overrides photo estimates: two 300 mm panel pitches, each with a continuous 297 mm oak face and a 3 mm wide, 1.5 mm deep 90-degree V reveal at joins only; total depth is 9 mm, with oak color sampled from main.jpg and procedural grain. This 600 x 750 mm tile wraps in both directions, but the manufacturer says Accent cannot wrap a column; its 3000 mm maximum panel length also needs trim coverage on a full 10 ft wall."
}
(ROOT / "texture.json").write_text(json.dumps(metadata, indent=2) + "\n")

light = np.array([-0.5, 0.6, 0.8])
light /= np.linalg.norm(light)
shade = 0.35 + 0.65 * np.maximum(np.sum(n * light, axis=-1), 0)
shaded = np.clip(color * shade[..., None], 0, 255).astype(np.uint8)
thumb = Image.fromarray(np.uint8(np.clip(color, 0, 255))).resize((384, 480), Image.Resampling.LANCZOS)
lit_thumb = Image.fromarray(shaded).resize((384, 480), Image.Resampling.LANCZOS)
preview = Image.new("RGB", (2304, 1440))
for row in range(3):
    for col in range(3):
        preview.paste(thumb, (col * 384, row * 480))
        preview.paste(lit_thumb, (1152 + col * 384, row * 480))
preview.save(ROOT / "preview.png")
print(f"Wrote texture, normal, metadata and preview: {W} x {H}; {WIDTH_MM / 25.4:.5f} x {HEIGHT_MM / 25.4:.5f} in")
