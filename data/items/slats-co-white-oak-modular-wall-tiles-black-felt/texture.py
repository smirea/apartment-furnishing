from pathlib import Path
import json

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

OUT = Path(__file__).parent
W, H = 1024, 2048
WIDTH_IN, HEIGHT_IN = 12.6, 25.2
PITCH, FACE, DEPTH = 1.575, 1.10, 0.83
rng = np.random.default_rng(41827)


def noise(shape, sx, sy):
    a = gaussian_filter(rng.normal(size=shape), (sy, sx), mode='wrap')
    return a / max(a.std(), 1e-8)


def save(name, a):
    Image.fromarray(np.uint8(np.clip(a, 0, 1) * 255 + .5)).save(OUT / name)


y, x = np.mgrid[:H, :W]
xi = (x + .5) * WIDTH_IN / W
u = ((xi + PITCH / 2) % PITCH) - PITCH / 2
edge_distance = FACE / 2 - np.abs(u)
face_mask = edge_distance > 0
# The shallow bevel occupies the physical slat edge, not a painted highlight.
edge = np.clip(edge_distance / .035, 0, 1)
edge = edge * edge * (3 - 2 * edge)
height = .48 * edge

reference = np.asarray(Image.open(OUT / 'main.jpg').convert('RGB').resize((1600, 1600)))
samples = np.concatenate([reference[720:1450, c:c+12].reshape(-1, 3) for c in [576, 629, 682, 735]])
base = np.median(samples, axis=0) / 255
felt = np.array([.036, .034, .030])
color = np.broadcast_to(felt, (H, W, 3)).copy()
felt_noise = noise((H, W), .6, .6)
color += felt_noise[..., None] * .004

for slat in range(8):
    mask = face_mask & (((np.floor((xi + PITCH / 2) / PITCH)).astype(int) % 8) == slat)
    # Periodic coordinate warping keeps the long fibers continuous at the tile ends.
    phase = rng.uniform(0, 2*np.pi, 4)
    warp = (4.5*np.sin(2*np.pi*y/H + phase[0])
            + 2.8*np.sin(4*np.pi*y/H + phase[1])
            + 1.5*np.sin(6*np.pi*y/H + phase[2]))
    broad = noise((H, W), 6, 125)
    fibers = noise((H, W), .72, 28)
    pores = noise((H, W), .55, 11)
    coords = np.array([y, (x + warp) % W])
    broad = map_coordinates(broad, coords, order=1, mode='grid-wrap')
    fibers = map_coordinates(fibers, coords, order=1, mode='grid-wrap')
    pores = map_coordinates(pores, coords, order=1, mode='grid-wrap')
    dark_pores = np.maximum(pores - 1.05, 0) ** 1.25
    grain = broad*.016 + fibers*.012 - dark_pores*.042
    tone = rng.normal(0, .014)
    face_color = base + tone + grain[..., None] * np.array([1, .95, .78])
    face_color += broad[..., None] * np.array([.004, .001, -.004])
    color[mask] = face_color[mask]
    micro_height = fibers*.00045 - dark_pores*.0010
    height[mask] += micro_height[mask] * edge[mask]

# Height is in inches, so derivatives use the same world units as the repeat.
dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2*WIDTH_IN/W)
dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2*HEIGHT_IN/H)
normal = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
save('texture.png', color)
save('normal.png', normal*.5+.5)
metadata = {
    'repeatWidthIn': WIDTH_IN,
    'repeatHeightIn': HEIGHT_IN,
    'depthIn': DEPTH,
    'note': 'No manufacturer spec sheet is published; the dimension diagram shows eight slats per 12.60-inch strip (sixteen per 25.2-inch panel), giving a 1.575-inch pitch, with photo-estimated 1.10-inch faces and 0.475-inch black felt gaps. This tile spans eight pitches by 25.2 inches; 0.83-inch total thickness comes from the supplied record, and oak tones are sampled from the main listing photo.'
}
(OUT / 'texture.json').write_text(json.dumps(metadata, indent=2) + '\n')

light = np.array([-.45, .6, .66])
light /= np.linalg.norm(light)
shade = .24 + .76*np.maximum(0, normal @ light)
shaded = np.clip(color * shade[..., None], 0, 1)
left = Image.fromarray(np.uint8(np.clip(color, 0, 1)*255+.5)).resize((384, 768), Image.Resampling.LANCZOS)
right = Image.fromarray(np.uint8(shaded*255+.5)).resize((384, 768), Image.Resampling.LANCZOS)
preview = Image.new('RGB', (2304, 2304))
for row in range(3):
    for col in range(3):
        preview.paste(left, (col*384, row*768))
        preview.paste(right, (1152+col*384, row*768))
preview.save(OUT / 'preview.png')
print(json.dumps(metadata, indent=2))
print('Wrote texture.png, normal.png, texture.json, and preview.png')
