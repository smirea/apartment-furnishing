from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
WIDTH_MM, HEIGHT_MM = 300.0, 600.0
SLAT_MM, GAP_MM, RISE_MM = 27.0, 10.5, 5.0
rng = np.random.default_rng(19427)


def field(shape, sy, sx):
    a = gaussian_filter(rng.standard_normal(shape), (sy, sx), mode='wrap')
    return (a - a.mean()) / max(a.std(), 1e-8)


def save(name, a):
    Image.fromarray(np.uint8(np.clip(np.rint(a), 0, 255))).save(ROOT / name)


def main():
    photo = np.asarray(Image.open(ROOT / 'main.png').convert('RGB'), dtype=float)
    samples = photo[100:700, 550:1200].reshape(-1, 3)
    lum = samples.mean(axis=1)
    samples = samples[(lum > 12) & (lum < 38) & (samples.max(axis=1) - samples.min(axis=1) < 7)]
    wood_color = np.median(samples, axis=0)
    felt_color = np.array([8.0, 8.2, 8.0])
    y, x = np.mgrid[:H, :W]
    pitch_px = W // 8
    local_mm = ((x + 0.5) % pitch_px) * WIDTH_MM / W
    distance = SLAT_MM / 2 - np.abs(local_mm - (SLAT_MM + GAP_MM) / 2)
    mask = np.clip(distance / (WIDTH_MM / W) + 0.5, 0, 1)
    # The 5 mm relief sits on 5 mm felt; the small edge radius is visual, not specified.
    edge = np.clip(distance / 0.65, 0, 1)
    profile = edge * edge * (3 - 2 * edge)
    felt = field((H, W), 0.6, 0.6)
    rgb = felt_color + felt[..., None] * 0.65
    height = 5.0 + felt * 0.008
    wood = np.empty((H, W))
    relief = np.empty((H, W))
    tones = rng.normal(0, 0.9, 8)
    for slat in range(8):
        shape = (H, pitch_px)
        yy, xx = np.mgrid[:H, :pitch_px].astype(float)
        bend = field(shape, 105, 13) * 2.6 + field(shape, 32, 7) * 0.6
        coords = [yy, xx + bend]
        broad = map_coordinates(field(shape, 70, 4), coords, order=1, mode='grid-wrap')
        fibres = map_coordinates(field(shape, 24, 0.65), coords, order=1, mode='grid-wrap')
        fine = map_coordinates(field(shape, 7, 0.4), coords, order=1, mode='grid-wrap')
        pores = np.maximum(-fibres - 0.55, 0) ** 1.4
        grain = broad * 0.7 + fibres * 0.95 + fine * 0.45 - pores * 0.85
        region = slice(slat * pitch_px, (slat + 1) * pitch_px)
        wood[:, region] = grain + tones[slat]
        relief[:, region] = broad * 0.008 + fibres * 0.012 + fine * 0.004 - pores * 0.013
    rgb = rgb * (1 - mask[..., None]) + (wood_color + wood[..., None]) * mask[..., None]
    height += RISE_MM * profile + relief * profile
    # Image rows point down; OpenGL tangent-space green points up.
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * WIDTH_MM / W)
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * HEIGHT_MM / H)
    normal = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    save('texture.png', rgb)
    save('normal.png', (normal * 0.5 + 0.5) * 255)
    meta = {
        'repeatWidthIn': WIDTH_MM / 25.4,
        'repeatHeightIn': HEIGHT_MM / 25.4,
        'depthIn': 10.0 / 25.4,
        'note': 'Manufacturer spec sheet overrides photo estimates: 8 three-side black-oak-veneered slats, each 27 mm (1.063 in) wide with a 10.5 mm (0.413 in) flat felt gap on a 37.5 mm (1.476 in) pitch; 5 mm slats over 5 mm black felt give 10 mm total depth, and this tile spans 300 x 600 mm (8 pitches). Near-black oak face tones are sampled from main.png, with procedural vertical oak grain and black felt informed by the gallery; the small softened edge profile is an approximation.'
    }
    (ROOT / 'texture.json').write_text(json.dumps(meta, indent=2) + '\n')
    light = np.array([-0.45, 0.55, 0.8])
    light /= np.linalg.norm(light)
    diffuse = np.maximum(normal @ light, 0)
    albedo = np.clip(rgb / 255, 0, 1)
    linear = np.where(albedo <= 0.04045, albedo / 12.92, ((albedo + 0.055) / 1.055) ** 2.4)
    shaded = linear * (0.30 + 0.9 * diffuse[..., None])
    shaded = np.where(shaded <= 0.0031308, shaded * 12.92, 1.055 * shaded ** (1 / 2.4) - 0.055)
    color_tile = Image.fromarray(np.uint8(np.clip(np.rint(rgb), 0, 255))).resize((256, 512), Image.Resampling.LANCZOS)
    shade_tile = Image.fromarray(np.uint8(np.clip(shaded * 255, 0, 255))).resize((256, 512), Image.Resampling.LANCZOS)
    preview = Image.new('RGB', (1560, 1580), '#565656')
    for row in range(3):
        for col in range(3):
            preview.paste(color_tile, (col * 256, 44 + row * 512))
            preview.paste(shade_tile, (792 + col * 256, 44 + row * 512))
    draw = ImageDraw.Draw(preview)
    draw.text((12, 15), 'COLOR MAP / 3 x 3 / 24 slats', fill='white')
    draw.text((804, 15), 'NORMAL-MAP SHADING / UPPER-LEFT LIGHT / 3 x 3', fill='white')
    preview.save(ROOT / 'preview.png')
    print(f'Face sample RGB: {wood_color}; size {W} x {H}; 8 slats; pitch {37.5 / 25.4:.6f} in')
    for name, a in [('color', rgb), ('normal', normal * 127.5 + 127.5)]:
        print(f'{name} mean boundary deltas, x/y: {np.abs(a[:, 0] - a[:, -1]).mean():.3f} / {np.abs(a[0] - a[-1]).mean():.3f}')
    assert W / H == WIDTH_MM / HEIGHT_MM
    assert abs(8 * (SLAT_MM + GAP_MM) - WIDTH_MM) < 1e-9


if __name__ == '__main__':
    main()
