import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
WIDTH_MM, HEIGHT_MM = 300.0, 600.0
SLAT_MM, GAP_MM, SLATS = 27.0, 10.5, 8
PITCH_MM = SLAT_MM + GAP_MM
rng = np.random.default_rng(21423)


def noise(sy, sx):
    a = gaussian_filter(rng.normal(size=(H, W)), (sy, sx), mode='wrap')
    return a / max(a.std(), 1e-8)


def save(name, a):
    Image.fromarray(np.uint8(np.clip(a, 0, 255))).save(ROOT / name)


def main():
    source = np.asarray(Image.open(ROOT / 'main.jpg').convert('RGB'), dtype=float)
    samples = [source[y-10:y+10, x-10:x+10].reshape(-1, 3)
               for x, y in [(1100, 570), (1000, 690), (900, 850)]]
    palette = np.array([np.median(a, axis=0) for a in samples])
    base = palette.mean(axis=0)

    y, x = np.mgrid[:H, :W].astype(float)
    xmm = x * WIDTH_MM / W
    phase = np.mod(xmm - GAP_MM / 2, PITCH_MM)
    index = np.floor(np.mod(xmm - GAP_MM / 2, WIDTH_MM) / PITCH_MM).astype(int)
    face = phase < SLAT_MM
    edge_distance = np.minimum(phase, SLAT_MM - phase)

    wander = noise(110, 13) * 2.5 + noise(45, 4) * 0.45
    warped_x = np.mod(x + wander, W)
    fibers = map_coordinates(noise(30, 0.65), [y, warped_x], order=1, mode='grid-wrap')
    long_grain = map_coordinates(noise(130, 2.8), [y, warped_x], order=1, mode='grid-wrap')
    broad_grain = noise(190, 8)
    fine = noise(1.2, 0.38)
    pores_field = map_coordinates(noise(8, 0.48), [y, warped_x], order=1, mode='grid-wrap')
    pores = np.clip((pores_field - 1.30) / 1.8, 0, 1)
    grain = 3.6 * fibers + 3.7 * long_grain + 2.1 * broad_grain + 0.9 * fine - 13 * pores
    tones = np.array([-1.5, 3.2, -3.6, 0.7, 4.0, -2.1, 1.8, -0.7])
    warmth = rng.normal(0, 0.75, SLATS)[index]
    wood = base + (grain + tones[index])[..., None] * np.array([1.0, 0.98, 0.95])
    wood += warmth[..., None] * np.array([1.0, 0.15, -0.8])
    felt_noise = 1.2 * noise(0.38, 0.38) + 0.7 * noise(1.3, 1.3)
    felt = np.array([31.0, 30.0, 29.0]) + felt_noise[..., None]
    color = np.where(face[..., None], wood, felt)
    save('texture.png', color)

    # Heights are millimetres; the 5 mm felt is the zero plane for relief.
    bevel = 0.48
    t = np.clip(edge_distance / bevel, 0, 1)
    profile = 5.0 - bevel * (1 - np.sqrt(np.clip(1 - (1 - t)**2, 0, 1)))
    wood_height = profile + 0.012 * fibers + 0.008 * long_grain - 0.025 * pores
    height = np.where(face, wood_height, 0.008 * felt_noise)
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * WIDTH_MM / W)
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * HEIGHT_MM / H)
    normals = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
    normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
    save('normal.png', (normals * 0.5 + 0.5) * 255 + 0.5)

    metadata = {
        'repeatWidthIn': WIDTH_MM / 25.4,
        'repeatHeightIn': HEIGHT_MM / 25.4,
        'depthIn': 10.0 / 25.4,
        'note': 'Manufacturer spec sheet dimensions override photo estimates and rounded inch figures: 8 slats, each 27 mm (1.063 in) wide with 10.5 mm (0.413 in) gaps, on a 37.5 mm (1.476 in) pitch; the tile covers the 300 mm installed panel width by 600 mm tall, with 5 mm slats on 5 mm felt (10 mm total depth). Grey oak face colors are sampled from the main listing photo, with synthesized wrapping veneer grain and black felt; the 305 mm overall panel width includes the overlapping joint and is not the installed repeat.'
    }
    (ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

    light = np.array([-0.45, 0.55, 0.80])
    light /= np.linalg.norm(light)
    shade = 0.30 + 0.70 * np.clip(normals @ light, 0, 1)
    shaded = np.clip(color * shade[..., None], 0, 255).astype('uint8')
    canvas = Image.new('RGB', (1552, 1580), '#dddddd')
    draw = ImageDraw.Draw(canvas)
    draw.text((12, 12), 'COLOR / 3 x 3 repeats', fill='#222222')
    draw.text((796, 12), 'NORMAL RELIEF / upper-left light / 3 x 3', fill='#222222')
    for offset, a in [(0, color), (784, shaded)]:
        small = Image.fromarray(np.uint8(np.clip(a, 0, 255))).resize((256, 512), Image.Resampling.LANCZOS)
        for row in range(3):
            for col in range(3):
                canvas.paste(small, (offset + col * 256, 36 + row * 512))
    canvas.save(ROOT / 'preview.png')
    print('Wood color sampled from main.jpg:', base.round(2).tolist())
    print(f'{W} x {H}; {SLATS} slats; repeat {WIDTH_MM / 25.4:.6f} x {HEIGHT_MM / 25.4:.6f} in')
    print('Written texture.png, normal.png, texture.json, preview.png')


if __name__ == '__main__':
    main()
