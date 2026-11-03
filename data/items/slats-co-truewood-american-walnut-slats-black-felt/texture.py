from pathlib import Path
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent
W, H = 1024, 2048
WIDTH, HEIGHT = 11.8, 23.6
COUNT = 7
PITCH = WIDTH / COUNT
FACE = 1.10
rng = np.random.default_rng(20941)


def noise(shape, sy, sx):
    field = gaussian_filter(rng.normal(size=shape), (sy, sx), mode='wrap')
    return field / max(field.std(), 1e-8)


photo = Image.open(ROOT / 'main.jpg').convert('RGB')
# Sample only the broad top surfaces, away from edges and felt.
polygons = [
    [(530, 464), (1170, 264), (1220, 300), (580, 501)],
    [(690, 582), (1330, 382), (1380, 419), (740, 619)],
    [(840, 712), (1440, 523), (1490, 560), (890, 749)],
    [(1010, 850), (1470, 705), (1520, 742), (1060, 887)],
]
samples = []
for polygon in polygons:
    mask = Image.new('L', photo.size)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    pixels = np.asarray(photo)[np.asarray(mask) > 0]
    samples.append(np.median(pixels, axis=0))
base = np.median(samples, axis=0)
print('Main-photo sampled walnut RGB:', base.round(1).tolist())

x = (np.arange(W) + .5) * WIDTH / W
y = (np.arange(H) + .5) * HEIGHT / H
slat_id = np.floor(x / PITCH).astype(int)
u = (x % PITCH) - PITCH / 2
inside = np.abs(u) <= FACE / 2
felt = noise((H, W), .6, .6)
color = np.broadcast_to(np.array([27., 27., 26.]), (H, W, 3)).copy()
color += felt[..., None] * 1.0
height = np.full((H, W), .001)
height += felt * .00035

for index in range(COUNT):
    cols = np.flatnonzero(slat_id == index)
    n = len(cols)
    yy = 2 * np.pi * (np.arange(H) + .5)[:, None] / H
    xx = np.linspace(-1, 1, n)[None, :]
    phase = rng.uniform(0, 2*np.pi)
    warp = .11*np.sin(yy + phase) + .045*np.sin(3*yy + phase*.7)
    warp = warp + .03 * noise((H, n), 65, 9)
    broad = noise((H, n), 170, 13)
    medium = noise((H, n), 48, 2.3)
    fine = noise((H, n), 13, .52)
    micro = noise((H, n), 1.0, .38)
    coord = xx + warp
    growth = np.sin(2*np.pi*(coord*5.6 + .55*np.sin(yy + phase)))
    pores = np.maximum(0, growth - .55)**2
    # Periodic oval growth contours produce subtle veneer figure without a vertical seam.
    ellipse = np.sqrt(((xx-rng.uniform(-1.2, 1.2))*.85)**2 +
                      (2.8*np.sin((yy+phase)/2))**2 + .08)
    figure = np.sin(ellipse*23 + broad*.45)
    grain = broad*2.2 + medium*2.2 + fine*1.35 + micro*.5
    grain += figure*.8 - pores*2.4
    tint = rng.uniform(-5.0, 5.0)
    wood = base[None, None, :] + grain[..., None]*np.array([1., .93, .85])
    wood += tint*np.array([1., .93, .86])
    region = inside[cols]
    color[:, cols[region], :] = wood[:, region, :]
    dist = FACE/2 - np.abs(u[cols])
    bevel = np.clip(dist / .035, 0, 1)
    bevel = bevel*bevel*(3-2*bevel)
    surface = .49*bevel[None, :] + .0015*medium + .0007*fine
    height[:, cols[region]] = surface[:, region]

# Image rows run down; OpenGL's tangent-space green axis runs up.
dx = (np.roll(height, -1, axis=1)-np.roll(height, 1, axis=1))/(2*WIDTH/W)
dy = (np.roll(height, -1, axis=0)-np.roll(height, 1, axis=0))/(2*HEIGHT/H)
normal = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
albedo = np.clip(np.rint(color), 0, 255).astype(np.uint8)
encoded = np.clip(np.rint((normal*.5+.5)*255), 0, 255).astype(np.uint8)
Image.fromarray(albedo).save(ROOT / 'texture.png')
Image.fromarray(encoded).save(ROOT / 'normal.png')
meta = {
    'repeatWidthIn': WIDTH,
    'repeatHeightIn': HEIGHT,
    'depthIn': .75,
    'note': 'No manufacturer spec sheet was published; the recorded panel is 11.8 × 94.49 × 0.75 in, and photos suggest 7 slats per panel, estimated at 1.10 in face width with 0.586 in flat black-felt gaps on a 1.686 in pitch and slightly rounded edges. This tile spans 7 pitches × 23.6 in; walnut colors are sampled from the main listing photo, with procedural grain, and the estimated 0.49 in face-to-felt relief is separate from the recorded total depth.'
}
(ROOT / 'texture.json').write_text(json.dumps(meta, indent=2) + '\n')

light = np.array([-.48, .58, .66])
light /= np.linalg.norm(light)
shade = .28 + .72*np.maximum(0, normal @ light)
linear = (albedo/255.)**2.2
shaded = np.clip((linear*shade[..., None])**(1/2.2)*255, 0, 255).astype(np.uint8)
left = Image.fromarray(np.tile(albedo, (3, 3, 1)))
right = Image.fromarray(np.tile(shaded, (3, 3, 1)))
left.thumbnail((768, 1536), Image.Resampling.LANCZOS)
right.thumbnail((768, 1536), Image.Resampling.LANCZOS)
preview = Image.new('RGB', (1536, 1580), '#eeeeee')
preview.paste(left, (0, 44))
preview.paste(right, (768, 44))
draw = ImageDraw.Draw(preview)
draw.text((15, 15), 'COLOR MAP / 3 x 3 / 35.4 x 70.8 in', fill='#222222')
draw.text((783, 15), 'NORMAL-MAP RELIEF / UPPER-LEFT LIGHT / 3 x 3', fill='#222222')
preview.save(ROOT / 'preview.png')
print('Wrote texture.png, normal.png, texture.json, preview.png')
print('Resolution:', W, H, '| face:', FACE, '| gap:', PITCH-FACE, '| pitch:', PITCH)
for name, arr in [('color', albedo.astype(float)), ('normal', encoded.astype(float))]:
    print(name, 'wrap mean absolute differences x/y:',
          round(np.abs(arr[:, 0]-arr[:, -1]).mean(), 3),
          round(np.abs(arr[0]-arr[-1]).mean(), 3))
