import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates


ROOT = Path(__file__).resolve().parent
W, H = 1000, 2032
WIDTH_MM, HEIGHT_MM = 300.0, 609.6
rng = np.random.default_rng(31827)
y, x = np.mgrid[:H, :W].astype(float)


def noise(sx, sy):
    field = gaussian_filter(rng.standard_normal((H, W)), (sy, sx), mode='wrap')
    return field / max(field.std(), 1e-8)


# All stochastic fields use periodic boundaries, including the grain warp.
warp = 6.0 * noise(22, 150) + 1.4 * noise(7, 45)
coords = np.array([y, (x + warp) % W])


def grain(sx, sy):
    return map_coordinates(noise(sx, sy), coords, order=1, mode='grid-wrap')


broad = grain(18, 210)
ribbons = grain(4.8, 150)
fibers = grain(0.65, 32)
fine = grain(0.35, 5)
pores = np.clip(-grain(0.48, 13) - 1.05, 0, 2.8)
pores *= np.clip(noise(5, 25) * 0.3 + 0.65, 0.1, 1)
variation = 3.2 * broad + 3.4 * ribbons + 3.4 * fibers + 1.1 * fine - 7.5 * pores
variation += 0.5 * noise(0.3, 0.5)

# The main listing's unobstructed face regions cluster around RGB 171,153,140.
face_color = np.array([171.0, 153.0, 140.0])
slat = np.floor((x * WIDTH_MM / W) / 100.0).astype(int)
slat_tones = np.array([[-1.8, -1.3, -0.7], [2.0, 1.3, 0.7], [-0.2, 0.0, 0.3]])
wood = face_color + slat_tones[slat] + variation[..., None] * np.array([1.0, 0.96, 0.88])
wood += broad[..., None] * np.array([0.4, 0.0, -0.35])

x_mm = x * WIDTH_MM / W
reveal_distance = np.minimum(x_mm % 100, 100 - x_mm % 100)
coverage = np.clip((1.5 - reveal_distance) / (WIDTH_MM / W) + 0.5, 0, 1)
felt_noise = 1.6 * noise(0.55, 0.55) + 0.8 * noise(2.2, 2.2)
felt = np.array([57.0, 46.0, 39.0]) + felt_noise[..., None]
color = wood * (1 - coverage[..., None]) + felt * coverage[..., None]

# Absolute millimeters: the V apex leaves a continuous 7.5 mm backbone.
height = 9.0 - np.maximum(1.5 - reveal_distance, 0)
wood_relief = 0.007 * fibers + 0.003 * fine - 0.011 * pores
height += wood_relief * (1 - coverage) + 0.003 * felt_noise * coverage

dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * WIDTH_MM / W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * HEIGHT_MM / H)
normal = np.stack([-dx, dy, np.ones_like(height)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
normal_rgb = np.round((normal * 0.5 + 0.5) * 255).clip(0, 255).astype('uint8')
color_rgb = np.round(color).clip(0, 255).astype('uint8')
Image.fromarray(color_rgb).save(ROOT / 'texture.png')
Image.fromarray(normal_rgb).save(ROOT / 'normal.png')

metadata = {
    'repeatWidthIn': WIDTH_MM / 25.4,
    'repeatHeightIn': HEIGHT_MM / 25.4,
    'depthIn': 9.0 / 25.4,
    'note': 'Manufacturer spec sheet overrides photo estimates: three 97 mm (3.819 in) walnut faces on 100 mm (3.937 in) pitches per 300 mm panel, with 3 mm (0.118 in) wide, 90-degree V reveals cut 1.5 mm into 9 mm brown felt; half-reveals at panel edges form identical joints, and the tile is one panel wide by 24 in tall, with taupe walnut grain and brown felt colors taken from the main listing photo. The 3000 mm (118.11 in) panel is shorter than a full 10 ft wall, and the manufacturer states Wide cannot wrap a column: column texturing is a visualization only, not a supported installation.'
}
(ROOT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-0.5, 0.65, 0.75])
light /= np.linalg.norm(light)
lighting = 0.28 + 0.72 * np.maximum(normal @ light, 0)
shaded = np.round(color_rgb * lighting[..., None]).clip(0, 255).astype('uint8')
preview = Image.new('RGB', (1536, 1560), '#eeeeee')
for image, left in [(color_rgb, 0), (shaded, 768)]:
    tiled = Image.fromarray(np.tile(image, (3, 3, 1)))
    tiled.thumbnail((768, 1560), Image.Resampling.LANCZOS)
    preview.paste(tiled, (left, 0))
preview.save(ROOT / 'preview.png')
print(f'Created {W} x {H} maps; repeat {WIDTH_MM / 25.4:.6f} x {HEIGHT_MM / 25.4:g} inches.')
print('Preview: 3 x 3 albedo at left; 3 x 3 upper-left-lit normal shading at right.')
print('Face RGB mean:', color_rgb[coverage == 0].mean(axis=0).round(1))
print('Wrap steps (mean RGB):', np.abs(color_rgb[:, 0].astype(float) - color_rgb[:, -1]).mean().round(2), np.abs(color_rgb[0].astype(float) - color_rgb[-1]).mean().round(2))
