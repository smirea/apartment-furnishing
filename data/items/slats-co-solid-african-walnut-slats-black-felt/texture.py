from pathlib import Path
import json

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
WIDTH_IN, HEIGHT_IN = 12.6, 25.2
PITCH, FACE, DEPTH = 1.575, 1.10, 0.83
rng = np.random.default_rng(64231)


def noise(shape, sy, sx):
    a = gaussian_filter(rng.standard_normal(shape), (sy, sx), mode='wrap')
    return a / max(a.std(), 1e-9)


def save(name, a):
    Image.fromarray(np.uint8(np.clip(a, 0, 1) * 255 + 0.5)).save(ROOT / name)


def build():
    photo = np.asarray(Image.open(ROOT / 'main.jpg').convert('RGB').resize((1600, 1600)))
    centers = [582, 609, 636, 662, 689, 715, 742, 769]
    palette = np.array([np.median(photo[180:700, x-2:x+3].reshape(-1, 3), axis=0) for x in centers]) / 255
    yy, xx = np.mgrid[:H, :W]
    x_in = (xx + 0.5) * WIDTH_IN / W
    local = (x_in + PITCH / 2) % PITCH - PITCH / 2
    dist = FACE / 2 - np.abs(local)
    mask = np.clip(dist / (WIDTH_IN / W) + 0.5, 0, 1)
    # The unpublished cross-section is approximated with 0.60 in relief over 0.23 in felt.
    bevel = np.clip(dist / 0.045, 0, 1)
    profile = bevel * bevel * (3 - 2 * bevel)
    felt = noise((H, W), 0.6, 0.6)
    color = np.empty((H, W, 3), dtype=float)
    color[:] = np.array([9, 9, 10]) / 255
    color += felt[..., None] * 0.0025
    height = felt * 0.0005
    board_ids = np.floor((x_in + PITCH / 2) / PITCH).astype(int) % 8
    for board in range(8):
        # All fields wrap in both directions, including grain sampled across the tile boundary.
        broad = noise((H, W), 100, 13)
        fibers = noise((H, W), 32, 0.8)
        fine = noise((H, W), 7, 0.45)
        warp = 7 * noise((H, W), 140, 35)
        coords = np.array([yy, xx + warp])
        fibers = map_coordinates(fibers, coords, order=1, mode='grid-wrap')
        fine = map_coordinates(fine, coords, order=1, mode='grid-wrap')
        pores = np.maximum(-fibers - 0.7, 0) ** 1.3
        tone = 1 + 0.10 * broad + 0.065 * fibers + 0.025 * fine - 0.075 * pores
        wood = palette[board] * np.clip(tone[..., None], 0.52, 1.5)
        wood += noise((H, W), 0.4, 0.4)[..., None] * 0.002
        selection = board_ids == board
        blend = mask * selection
        color = color * (1 - blend[..., None]) + wood * blend[..., None]
        surface = 0.60 * profile + profile * (fibers * 0.0007 + fine * 0.00025 - pores * 0.0004)
        height += surface * selection

    # Image rows point down; tangent-space OpenGL green points up.
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH_IN / W)
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT_IN / H)
    normals = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
    normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
    save('texture.png', color)
    save('normal.png', normals * 0.5 + 0.5)
    metadata = {
        'repeatWidthIn': WIDTH_IN,
        'repeatHeightIn': HEIGHT_IN,
        'depthIn': DEPTH,
        'note': 'No manufacturer spec sheet is published; the dimension diagram shows 8 slats per 12.6 in panel, giving a 1.575 in pitch, with photo-estimated 1.10 in faces, 0.475 in gaps and softly eased edges (0.60 in relief estimated within the recorded 0.83 in total thickness). Tile is 8 pitches wide and 25.2 in tall; dark African walnut tones are sampled from main.jpg with black felt backing, not the lighter gallery close-up.'
    }
    (ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')
    light = np.array([-0.48, 0.60, 0.64])
    light /= np.linalg.norm(light)
    shade = 0.24 + 0.76 * np.clip(normals @ light, 0, 1)
    shaded = np.repeat(shade[..., None], 3, axis=-1)
    panels = []
    for a in [color, shaded]:
        tile = Image.fromarray(np.uint8(np.clip(a, 0, 1) * 255 + 0.5)).resize((256, 512), Image.Resampling.LANCZOS)
        panel = Image.new('RGB', (768, 1536))
        for row in range(3):
            for col in range(3):
                panel.paste(tile, (col * 256, row * 512))
        panels.append(panel)
    preview = Image.new('RGB', (1536, 1536))
    preview.paste(panels[0], (0, 0))
    preview.paste(panels[1], (768, 0))
    preview.save(ROOT / 'preview.png')
    assert W / H == WIDTH_IN / HEIGHT_IN
    for label, a in [('color', color), ('normal', normals)]:
        seam_y = np.abs(a[0] - a[-1]).mean()
        interior_y = np.abs(np.diff(a, axis=0)).mean()
        seam_x = np.abs(a[:, 0] - a[:, -1]).mean()
        interior_x = np.abs(np.diff(a, axis=1)).mean()
        print(f'{label}: seam X {seam_x:.5f}, typical X {interior_x:.5f}; seam Y {seam_y:.5f}, typical Y {interior_y:.5f}')
    print(f'Wrote {W} x {H} maps: {WIDTH_IN} x {HEIGHT_IN} in, 8 slats, {PITCH} in pitch.')


if __name__ == '__main__':
    build()
