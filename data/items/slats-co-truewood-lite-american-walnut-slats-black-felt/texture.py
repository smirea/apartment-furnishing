import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates


ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
WIDTH_MM, HEIGHT_MM = 300, 600
PITCH_MM, FACE_MM = 37.5, 27
RNG = np.random.default_rng(61429)


def noise(shape, sy, sx):
    a = gaussian_filter(RNG.normal(size=shape), (sy, sx), mode="wrap")
    return a / max(a.std(), 1e-8)


def save(name, array):
    Image.fromarray(np.uint8(np.clip(array, 0, 1) * 255 + 0.5)).save(ROOT / name)


def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.maximum(c, 0) ** (1 / 2.4) - 0.055)


def build():
    photo = np.asarray(Image.open(ROOT / "main.jpg").convert("RGB"), dtype=float)
    samples = [(650, 120), (700, 225), (750, 340), (800, 450),
               (850, 565), (900, 700), (1050, 825), (1150, 985)]
    tones = np.array([np.median(photo[y-9:y+10, x-18:x+19], axis=(0, 1)) for x, y in samples])
    # Small interior samples supply color statistics only; no lit photo pixels enter the map.
    base = np.median(tones, axis=0)
    tones = base + (tones - base) * 0.65
    print("Walnut RGB samples:", tones.round(1).tolist())

    y, x = np.mgrid[:H, :W]
    local_mm = ((x + 0.5) * WIDTH_MM / W) % PITCH_MM
    inside = FACE_MM / 2 - np.abs(local_mm - PITCH_MM / 2)
    face = np.clip(inside / (WIDTH_MM / W) + 0.5, 0, 1)
    felt = noise((H, W), 0.65, 0.65)
    color = np.array([0.060, 0.059, 0.057])[None, None, :] + felt[..., None] * 0.004
    height = 5 + 0.018 * felt
    wood = np.zeros((H, W, 3))
    relief = np.zeros((H, W))

    for slat in range(8):
        start, end = slat * 128, (slat + 1) * 128
        yy, xx = np.mgrid[:H, :128]
        t = 2 * np.pi * yy / H
        phase = RNG.uniform(0, 2 * np.pi)
        bend = (3.8 * np.sin(t + phase) + 1.7 * np.sin(2 * t - phase)
                + 0.8 * np.sin(3 * t + 0.7 * phase))
        if slat in (1, 4, 6):
            bend += 10 * np.cos(t + phase) ** 6
        warped_x = xx + bend + noise((H, 128), 70, 9) * 1.5
        coords = [yy, warped_x]
        broad = map_coordinates(noise((H, 128), 160, 6), coords, order=1, mode="grid-wrap")
        ribbons = map_coordinates(noise((H, 128), 55, 1.15), coords, order=1, mode="grid-wrap")
        fibers = map_coordinates(noise((H, 128), 11, 0.40), coords, order=1, mode="grid-wrap")
        pores = np.maximum(fibers - 0.8, 0) ** 1.25
        fine = noise((H, 128), 0.65, 0.45)
        growth_lines = np.maximum(np.sin(warped_x * 0.85 + broad * 0.35) - 0.65, 0)
        growth_lines *= np.clip(noise((H, 128), 25, 4) + 0.5, 0, 1)
        grain = 4 * broad + 4.4 * ribbons + 2.4 * fibers - 5.2 * pores - 7 * growth_lines + 0.7 * fine
        wood[:, start:end] = (tones[slat] + grain[..., None] * np.array([1.0, 0.93, 0.83])) / 255
        relief[:, start:end] = 0.013 * ribbons + 0.008 * fibers - 0.018 * pores

    color = color * (1 - face[..., None]) + wood * face[..., None]
    # The square 5 mm rise is softened only at the veneer edge, not across the gap.
    ramp = np.clip(inside / 0.45, 0, 1)
    bevel = ramp * ramp * (3 - 2 * ramp)
    height += 5 * bevel + relief * face
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH_MM / W)
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT_MM / H)
    # Image rows point down; OpenGL tangent green points up.
    normal = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    save("texture.png", color)
    save("normal.png", normal * 0.5 + 0.5)

    meta = {
        "repeatWidthIn": WIDTH_MM / 25.4,
        "repeatHeightIn": HEIGHT_MM / 25.4,
        "depthIn": 10 / 25.4,
        "note": "Manufacturer spec sheet dimensions override photo estimates: 8 slats, each 27 mm (1.063 in) wide with a 10.5 mm (0.413 in) square felt gap, on a 37.5 mm pitch; the tile spans the 300 mm installed panel width by 600 mm, with 5 mm slats over 5 mm felt (10 mm total). Muted American walnut tones and per-slat variation are sampled from the main listing photo; grain and black acoustic felt are synthesized periodically without baked lighting."
    }
    (ROOT / "texture.json").write_text(json.dumps(meta, indent=2) + "\n")

    light = np.array([-0.45, 0.60, 0.66])
    light /= np.linalg.norm(light)
    lighting = 0.30 + 0.70 * np.maximum(normal @ light, 0)
    shaded = linear_to_srgb(srgb_to_linear(color) * lighting[..., None])
    panel_w, panel_h = 768, 1536
    preview = Image.new("RGB", (2 * panel_w, panel_h + 52), (235, 232, 227))
    draw = ImageDraw.Draw(preview)
    draw.text((15, 18), "COLOR / 3 x 3 TILES / 900 x 1800 mm", fill=(35, 32, 29))
    draw.text((panel_w + 15, 18), "NORMAL-SHADED / UPPER-LEFT LIGHT / 3 x 3 TILES", fill=(35, 32, 29))
    for column, source in enumerate((color, shaded)):
        thumbnail = Image.fromarray(np.uint8(np.clip(source, 0, 1) * 255 + 0.5)).resize((256, 512), Image.Resampling.LANCZOS)
        for row in range(3):
            for tile in range(3):
                preview.paste(thumbnail, (column * panel_w + tile * 256, 52 + row * 512))
    preview.save(ROOT / "preview.png")

    for name, a in (("color", color), ("normal", normal)):
        print(name, "wrap mean difference x/y:",
              float(np.abs(a[:, 0] - a[:, -1]).mean()),
              float(np.abs(a[0] - a[-1]).mean()))
    assert W / H == WIDTH_MM / HEIGHT_MM
    assert WIDTH_MM / PITCH_MM == 8
    assert all(Image.open(ROOT / name).size == (W, H) for name in ("texture.png", "normal.png"))
    print("Wrote texture.png, normal.png, texture.json, preview.png")


if __name__ == "__main__":
    build()
