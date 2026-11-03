from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

OUT = Path(__file__).parent
W, H = 1024, 2048
REPEAT_W, REPEAT_H = 11.83, 23.66
rng = np.random.default_rng(2718)

def noise(shape, sigma):
    a = gaussian_filter(rng.standard_normal(shape), sigma, mode='wrap')
    return a / max(a.std(), 1e-8)

x = (np.arange(W) + .5) * REPEAT_W / W
y = (np.arange(H) + .5) * REPEAT_H / H
xx, yy = np.meshgrid(x, y)
pitch, face, gap = 1.69, 1.20, .49
# Put a groove apex at each tile boundary, matching the factory half-grooves.
phase = xx % pitch
wood = (phase >= gap / 2) & (phase <= pitch - gap / 2)
slat = np.floor(xx / pitch).astype(int)
local = (phase - gap / 2) / face

broad = noise((H, W), (100, 12))
fine = noise((H, W), (22, .65))
pores = noise((H, W), (3.5, .45))
warp = .027 * np.sin(2*np.pi*yy/REPEAT_H + .7*slat) + .011*np.sin(4*np.pi*yy/REPEAT_H + 1.3*slat)
grain_pos = local + warp + .012*broad
lines = (np.sin(2*np.pi*(grain_pos*24 + .15*np.sin(grain_pos*13))) + 1)/2
lines = lines**14
cathedrals = np.cos(2*np.pi*(local*3.2 + .30*np.cos(2*np.pi*yy/REPEAT_H + slat*.83)))
cathedrals = np.maximum(cathedrals, 0)**18
variation = np.array([1.2, -2.3, 2.1, -.5, -1.4, 2.8, -1.9])[slat]
grain = 1.3*broad + .65*fine + .28*pores - 1.8*lines - 1.1*cathedrals + variation
wood_color = np.array([185., 173., 158.]) + grain[...,None]*np.array([1., .96, .88])

felt_fine = noise((H, W), (.55, .55))
felt_cloud = noise((H, W), (6, 6))
felt = np.array([201., 195., 183.]) + (1.5*felt_fine + .7*felt_cloud)[...,None]
color = np.where(wood[...,None], wood_color, felt)

apex_dist = np.minimum(phase, pitch-phase)
height = np.minimum(apex_dist/(gap/2), 1) * (6.2/25.4)
# A tiny edge radius softens the meeting of veneer and cut felt.
height = gaussian_filter(height, (.0, .35), mode='wrap')
height += np.where(wood, .00020*fine + .00008*pores, .00040*felt_fine)
dx = (np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))/(2*REPEAT_W/W)
dy = (np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))/(2*REPEAT_H/H)
n = np.stack([-dx, dy, np.ones_like(dx)],axis=2)
n /= np.linalg.norm(n,axis=2,keepdims=True)
normal = np.clip(np.rint((n*.5+.5)*255),0,255).astype('uint8')
color = np.clip(np.rint(color),0,255).astype('uint8')
Image.fromarray(color).save(OUT/'texture.png')
Image.fromarray(normal).save(OUT/'normal.png')
metadata = {
    'repeatWidthIn': REPEAT_W,
    'repeatHeightIn': REPEAT_H,
    'depthIn': .35,
    'note': 'Manufacturer spec sheet overrides photo estimates: seven 1.20 in slat faces on 1.69 in pitches with 0.49 in, 90-degree V-grooves cut 6.2 mm into 9 mm felt; these rounded widths total 11.83 in versus the listed 11.80 in panel. Muted ultralight maple veneer and beige felt colors follow main.jpg, with no MDF or rigid core; the tile covers seven pitches by 23.66 in.'
}
(OUT/'texture.json').write_text(json.dumps(metadata,indent=2)+'\n')

light = np.array([-.5,.65,.7]); light /= np.linalg.norm(light)
illumination = .40 + .60*np.maximum(n@light, 0)
linear = (color/255.)**2.2
shaded = np.clip((linear*illumination[...,None])**(1/2.2)*255,0,255).astype('uint8')
small = Image.fromarray(color).resize((384,768),Image.Resampling.LANCZOS)
preview = Image.new('RGB',(2304,2304))
for row in range(3):
    for col in range(3):
        preview.paste(small,(col*384,row*768))
preview.paste(Image.fromarray(shaded).resize((1152,2304),Image.Resampling.LANCZOS),(1152,0))
preview.save(OUT/'preview.png')
print(json.dumps(metadata,indent=2))
print('Created texture.png, normal.png, texture.json, preview.png')
