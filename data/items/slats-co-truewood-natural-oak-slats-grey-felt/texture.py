from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
W, H = 1008, 2016
WIDTH, HEIGHT, DEPTH = 11.8, 23.6, 0.75
SLATS = 7
PITCH = WIDTH / SLATS
FACE = 1.18
rng = np.random.default_rng(74019)


def noise(shape, sigma):
    a = gaussian_filter(rng.standard_normal(shape), sigma, mode='wrap')
    return a / max(a.std(), 1e-8)


# Sample only unobstructed oak faces; low-frequency photo illumination is not copied.
photo = np.asarray(Image.open(ROOT / 'main.jpg').convert('RGB'), dtype=float)
scale = photo.shape[1] / 1600
patches = [(round(x*scale), round(y*scale)) for x, y in [(900, 240), (1000, 340), (1100, 460), (1200, 620), (1350, 810)]]
samples = [np.median(photo[y-8:y+8, x-8:x+8], axis=(0, 1)) for x, y in patches]
oak = np.median(samples, axis=0)
print('Oak photo samples:', np.round(samples, 1).tolist(), 'median:', oak.tolist())
# Exposed front backing has less occlusion than the narrow recessed channels.
felt_samples = [np.median(photo[y-4:y+4, x-4:x+4], axis=(0, 1)) for x, y in [(round(x*scale), round(y*scale)) for x, y in [(1240, 1160), (1300, 1140), (1380, 1115)]]]
felt_color = np.median(felt_samples, axis=0)
print('Felt photo samples:', np.round(felt_samples, 1).tolist(), 'median:', felt_color.tolist())

px = WIDTH / W
x = (np.arange(W) + 0.5) * px
distance = np.abs((x + PITCH / 2) % PITCH - PITCH / 2)
edge = FACE / 2 - distance
coverage = np.clip(edge / px + 0.5, 0, 1)
# The relief is estimated: 0.30 in felt plus 0.45 in wood, with a small rounded edge.
radius = 0.035
rounded = np.sqrt(np.maximum(0, radius**2 - np.maximum(0, radius-edge)**2))
profile = np.where(edge >= 0, 0.45-radius+rounded, 0.0)
height = np.broadcast_to(profile, (H, W)).copy()
felt = noise((H, W), (0.65, 0.65)) * 1.3 + noise((H, W), (3, 3)) * 0.7
color = np.broadcast_to(felt_color, (H, W, 3)).copy() + felt[..., None]
y = np.arange(H)[:, None] / H

for slat in range(SLATS):
    center = slat * PITCH
    rel = ((x-center+WIDTH/2) % WIDTH-WIDTH/2)
    cols = np.flatnonzero(np.abs(rel) <= FACE/2+px)
    order = np.argsort(rel[cols])
    cols = cols[order]
    sw = len(cols)
    u = rel[cols][None, :] / FACE
    phase = rng.uniform(0, 2*np.pi)
    warp = 0.035*np.sin(2*np.pi*y+phase) + 0.014*np.sin(4*np.pi*y+phase*1.7)
    broad = noise((H, sw), (130, 8))
    ribbons = noise((H, sw), (65, 1.4))
    fibers = noise((H, sw), (14, 0.48))
    coords = np.meshgrid(np.arange(H), np.arange(sw), indexing='ij')
    displaced = [coords[0], coords[1] + np.broadcast_to(warp*sw, (H, sw))]
    ribbons = map_coordinates(ribbons, displaced, order=1, mode='grid-wrap')
    fibers = map_coordinates(fibers, displaced, order=1, mode='grid-wrap')
    vessel = np.maximum(0, -fibers-1.05)**1.3
    growth = np.sin(2*np.pi*(u*9 + warp*15) + broad*0.7)
    grain = 2.3*broad + 2.1*ribbons + 0.9*fibers - 2.0*vessel + 0.85*growth
    tone = rng.normal(0, 2.4)
    wood = oak + (grain+tone)[..., None] * np.array([1.0, 0.94, 0.82])
    wood += rng.normal(0, 0.65, 3)
    blend = coverage[cols][None, :, None]
    color[:, cols] = color[:, cols]*(1-blend) + wood*blend
    height[:, cols] += (0.00015*ribbons - 0.0002*vessel) * coverage[cols]

height += noise((H, W), (0.75, 0.75)) * 0.00012 * (1-coverage)
dx = (np.roll(height, -1, axis=1)-np.roll(height, 1, axis=1))/(2*px)
# Image rows run down; tangent-space +Y runs up.
dy_up = (np.roll(height, 1, axis=0)-np.roll(height, -1, axis=0))/(2*px)
normal = np.stack((-dx, -dy_up, np.ones_like(height)), axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
color8 = np.clip(np.rint(color), 0, 255).astype(np.uint8)
normal8 = np.clip(np.rint((normal+1)*127.5), 0, 255).astype(np.uint8)
Image.fromarray(color8).save(ROOT/'texture.png')
Image.fromarray(normal8).save(ROOT/'normal.png')
metadata = {
    'repeatWidthIn': WIDTH,
    'repeatHeightIn': HEIGHT,
    'depthIn': DEPTH,
    'note': 'No manufacturer spec sheet was published; photos suggest 7 slats per recorded 11.8 in panel, with estimated 1.18 in faces, 0.506 in grey-felt gaps and 1.686 in pitch, lightly rounded edges, and recorded 0.75 in total thickness (0.30 in felt / 0.45 in wood relief estimated). Tile is 7 pitches wide by 23.6 in tall; natural oak tones and grey felt were sampled from the main listing photo, with gallery photos used only for structure.'
}
(ROOT/'texture.json').write_text(json.dumps(metadata, indent=2)+'\n')
light = np.array([-0.48, 0.58, 0.66])
light /= np.linalg.norm(light)
shade = 0.30 + 0.70*np.maximum(0, normal@light)
shaded = np.clip(color*shade[..., None], 0, 255).astype(np.uint8)
left = Image.fromarray(np.tile(color8, (3, 3, 1))).resize((W, H), Image.Resampling.LANCZOS)
right = Image.fromarray(np.tile(shaded, (3, 3, 1))).resize((W, H), Image.Resampling.LANCZOS)
preview = Image.new('RGB', (2*W+24, H+44), '#eeeeee')
preview.paste(left, (0, 44))
preview.paste(right, (W+24, 44))
draw = ImageDraw.Draw(preview)
draw.text((12, 14), 'COLOR | 3 x 3 repeats', fill='#222222')
draw.text((W+36, 14), 'NORMAL-SHADED | 3 x 3 repeats | upper-left light', fill='#222222')
preview.save(ROOT/'preview.png')
assert W/H == WIDTH/HEIGHT
for name, a in [('color', color8.astype(float)), ('normal', normal8.astype(float))]:
    seam_y = np.mean(np.abs(a[0]-a[-1]))
    inner_y = np.mean(np.abs(np.diff(a, axis=0)))
    seam_x = np.mean(np.abs(a[:, 0]-a[:, -1]))
    print(f'{name}: vertical-wrap delta {seam_y:.3f}, typical vertical delta {inner_y:.3f}, horizontal-wrap delta {seam_x:.3f}')
print(f'Wrote {W} x {H}; {SLATS} slats; pitch {PITCH:.6f} in; face {FACE} in; gap {PITCH-FACE:.6f} in')
