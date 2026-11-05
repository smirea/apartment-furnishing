import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
import numpy as np
from PIL import Image
import trimesh
from trimesh.visual.material import PBRMaterial


ROOT = Path(__file__).resolve().parent
W, H, D = np.array([55, 28.3, 23.6]) * 0.0254
scene = trimesh.Scene()
black = PBRMaterial(name='Satin charcoal powder coated steel', baseColorFactor=[27, 26, 24, 255], metallicFactor=0.65, roughnessFactor=0.38)
plastic = PBRMaterial(name='Black molded plastic', baseColorFactor=[20, 21, 21, 255], metallicFactor=0, roughnessFactor=0.58)
silver = PBRMaterial(name='Drive shaft steel', baseColorFactor=[137, 140, 142, 255], metallicFactor=0.9, roughnessFactor=0.28)
white = PBRMaterial(name='Control markings', baseColorFactor=[207, 219, 215, 255], metallicFactor=0, roughnessFactor=0.4)
glass = PBRMaterial(name='LED display window', baseColorFactor=[7, 12, 12, 255], metallicFactor=0.1, roughnessFactor=0.16)

rng = np.random.default_rng(14)
tx, tz = np.meshgrid(np.linspace(0, 10, 1536), np.linspace(0, 6, 768))
warp = tz * 15 + 1.6 * np.sin(tx * 0.7 + tz * 1.3) + 0.7 * np.sin(tx * 1.9 + tz * 0.6)
grain = (0.025 * np.sin(warp * 9) + 0.017 * np.sin(warp * 23 + np.sin(tx))
         + 0.027 * np.sin(warp * 2.1) + rng.normal(0, 0.009, tx.shape))
tone = np.sin(tz * 5 + np.sin(tx * 0.25)) * 0.025
rgb = np.clip(np.array([0.43, 0.285, 0.185])[None, None, :] + (grain + tone)[..., None], 0, 1)
wood_image = Image.fromarray((rgb * 255).astype(np.uint8))
wood = PBRMaterial(name='Warm walnut finished solid wood', baseColorTexture=wood_image, baseColorFactor=[255, 255, 255, 255], metallicFactor=0, roughnessFactor=0.4)


def add(mesh, name, material, wood_uv=False):
    if wood_uv:
        uv = np.column_stack((mesh.vertices[:, 0] / W + 0.5, mesh.vertices[:, 2] / D + 0.5))
        mesh.visual = trimesh.visual.TextureVisuals(uv=uv, material=material)
    else:
        mesh.visual = trimesh.visual.TextureVisuals(material=material)
    scene.add_geometry(mesh, node_name=name, geom_name=name)
    return mesh


def box(name, size, center, material=black, bevel=0):
    if bevel:
        size = np.asarray(size)
        inner = size / 2 - bevel
        points = []
        for axis in range(3):
            for sign in [-1, 1]:
                for a in [-1, 1]:
                    for b in [-1, 1]:
                        p = np.zeros(3)
                        p[axis] = sign * size[axis] / 2
                        others = [k for k in range(3) if k != axis]
                        p[others] = [a * inner[others[0]], b * inner[others[1]]]
                        points.append(p)
        mesh = trimesh.convex.convex_hull(np.array(points))
    else:
        mesh = trimesh.creation.box(extents=size)
    mesh.apply_translation(center)
    return add(mesh, name, material, material is wood)


def rod(name, start, end, radius, material=black, sections=12):
    start, end = np.array(start), np.array(end)
    vec = end - start
    mesh = trimesh.creation.cylinder(radius=radius, height=np.linalg.norm(vec), sections=sections)
    mesh.apply_transform(trimesh.geometry.align_vectors([0, 0, 1], vec))
    mesh.apply_translation((start + end) / 2)
    return add(mesh, name, material)


# A convex fan from an interior point preserves the shallow front and rear cutouts.
outline = []
r = 0.024
for cx, cz, a0 in [(W/2-r, D/2-r, 0), (-W/2+r, D/2-r, 90), (-W/2+r, -D/2+r, 180), (W/2-r, -D/2+r, 270)]:
    if a0 == 90:
        for x in np.linspace(W/2-r, -W/2+r, 65)[1:-1]:
            z = D/2 - 0.037 * (max(0, np.cos(x / (W/2-r) * np.pi/2)) ** 2)
            outline.append((x, z))
    if a0 == 270:
        for x in np.linspace(-W/2+r, W/2-r, 65)[1:-1]:
            notch = 0.016 * np.clip((0.26-abs(x))/0.025, 0, 1)
            outline.append((x, -D/2 + notch))
    for a in np.linspace(a0, a0+90, 10):
        outline.append((cx + r*np.cos(np.deg2rad(a)), cz + r*np.sin(np.deg2rad(a))))
outline = np.array(outline)
n = len(outline)
t = 0.025
vertices = [[0, H, 0], [0, H-t, 0]]
vertices += [[x, H, z] for x, z in outline]
vertices += [[x, H-t, z] for x, z in outline]
faces = []
for i in range(n):
    j = (i+1) % n
    faces.extend([[0, 2+j, 2+i], [1, 2+n+i, 2+n+j], [2+i, 2+j, 2+n+j], [2+i, 2+n+j, 2+n+i]])
top = trimesh.Trimesh(vertices=vertices, faces=faces, process=True)
top.fix_normals()
add(top, 'Rounded solid walnut top with concave front and rear cable recess', wood, True)

for side, x in [('Left', -0.525), ('Right', 0.525)]:
    box(side+' T foot', [0.078, 0.043, 0.575], [x, 0.034, 0], bevel=0.009)
    for z in [-0.225, 0.225]:
        rod(side+f' leveling pad {z}', [x, 0, z], [x, 0.016, z], 0.029, plastic, 24)
    box(side+' lower column stage', [0.061, 0.247, 0.061], [x, 0.175, 0], bevel=0.0015)
    box(side+' middle column stage', [0.065, 0.235, 0.065], [x, 0.405, 0], bevel=0.0015)
    box(side+' upper column sleeve', [0.07, 0.201, 0.07], [x, 0.609, 0], bevel=0.002)
    box(side+' column collar', [0.072, 0.009, 0.072], [x, 0.511, 0], plastic, bevel=0.001)
    box(side+' top support bracket', [0.052, 0.018, 0.48], [x, H-t-0.009, 0], bevel=0.003)
    box(side+' solid wood underside batten', [0.028, 0.018, 0.49], [x+(-0.055 if x<0 else 0.055), H-t-0.009, 0], wood, bevel=0.002)
    for z in [-0.19, 0.19]:
        rod(side+f' bracket screw {z}', [x, H-t-0.020, z], [x, H-t-0.017, z], 0.0045, silver)

box('Telescopic frame crossbeam', [1.065, 0.052, 0.044], [0, H-0.080, -0.020], bevel=0.002)
box('Crossbeam center adjustment sleeve', [0.34, 0.055, 0.047], [0, H-0.080, -0.020], bevel=0.001)
rod('Single motor transmission shaft', [-0.516, H-0.052, 0.058], [0.493, H-0.052, 0.058], 0.006, silver, 16)
for x in [-0.39, 0.37]:
    rod('Drive shaft coupling '+str(x), [x-0.014, H-0.052, 0.058], [x+0.014, H-0.052, 0.058], 0.010, plastic)
box('Right single motor housing', [0.095, 0.073, 0.088], [0.493, H-0.093, 0.065], plastic, bevel=0.006)
box('Under top electrical control box', [0.20, 0.025, 0.078], [0.23, H-0.043, -0.10], plastic, bevel=0.003)

box('Keypad mounting neck', [0.036, 0.017, 0.075], [0.481, H-0.037, 0.23], plastic)
box('Front right memory control panel', [0.136, 0.033, 0.024], [0.481, H-0.055, 0.278], plastic, bevel=0.004)
box('Recessed LED screen', [0.032, 0.018, 0.001], [0.433, H-0.055, 0.2905], glass)
for j in range(5):
    x = 0.463 + j*0.020
    box('Keypad button '+str(j), [0.015, 0.019, 0.0016], [x, H-0.055, 0.291], black, bevel=0.0004)
    for dx, dy, sx, sy in [(-0.006, 0, 0.0007, 0.015), (0.006, 0, 0.0007, 0.015), (0, 0.0075, 0.012, 0.0007), (0, -0.0075, 0.012, 0.0007)]:
        box(f'Button border {j} {dx} {dy}', [sx, sy, 0.0005], [x+dx, H-0.055+dy, 0.292], white)
    if j < 3:
        box('Memory preset marking '+str(j), [0.001, 0.009, 0.0006], [x, H-0.055, 0.2925], white)
    else:
        y = H-0.055
        flip = 1 if j == 3 else -1
        rod('Arrow left '+str(j), [x-0.003, y-0.002*flip, 0.2926], [x, y+0.003*flip, 0.2926], 0.00065, white, 6)
        rod('Arrow right '+str(j), [x, y+0.003*flip, 0.2926], [x+0.003, y-0.002*flip, 0.2926], 0.00065, white, 6)
for digit, x in [('7', 0.426), ('2', 0.438)]:
    segs = {'a': (0, 0.006, 0.007, 0.001), 'b': (0.0035, 0.003, 0.001, 0.006), 'c': (0.0035, -0.003, 0.001, 0.006), 'd': (0, -0.006, 0.007, 0.001), 'e': (-0.0035, -0.003, 0.001, 0.006), 'g': (0, 0, 0.007, 0.001)}
    for key in ('abc' if digit == '7' else 'abged'):
        dx, dy, sx, sy = segs[key]
        box('LED '+digit+key, [sx, sy, 0.0007], [x+dx, H-0.055+dy, 0.2915], white)
curve = np.array([[0.48, H-0.07, 0.254], [0.48, H-0.16, 0.19], [0.44, H-0.175, 0.12], [0.42, H-0.15, 0.10], [0.44, H-0.09, 0.08]])
for i in range(len(curve)-1):
    rod('Control cable '+str(i), curve[i], curve[i+1], 0.0026, plastic)

scene.export(ROOT / 'model.glb')
loaded = trimesh.load(ROOT / 'model.glb', force='scene')
print('Reloaded bounds in inches:', (loaded.bounds / 0.0254).round(3).tolist())
print('Overall dimensions in inches:', (loaded.extents / 0.0254).round(3).tolist())
print('Faces:', sum(len(g.faces) for g in loaded.geometry.values()))
expected = np.array([W, H, D])
assert np.all(np.abs(loaded.extents / expected - 1) < 0.02)
assert sum(len(g.faces) for g in loaded.geometry.values()) < 60000

fig = plt.figure(figsize=(16, 6), facecolor='#eeeae5')
for i, (title, elev, azim) in enumerate([('Front three-quarter', 24, 55), ('Top-down', 90, 90), ('Right side', 0, 0)]):
    ax = fig.add_subplot(1, 3, i+1, projection='3d', facecolor='#eeeae5')
    for mesh in scene.geometry.values():
        render_mesh = mesh
        if mesh.visual.material.name == wood.name:
            rv, rf = trimesh.remesh.subdivide_to_size(mesh.vertices, mesh.faces, max_edge=0.035, max_iter=8)
            render_mesh = trimesh.Trimesh(vertices=rv, faces=rf, process=False)
        v = render_mesh.vertices[:, [0, 2, 1]]
        color = [0.43, 0.285, 0.185] if mesh.visual.material.name == wood.name else np.array(mesh.visual.material.baseColorFactor[:3])/255
        tris = v[render_mesh.faces]
        normals = np.cross(tris[:, 1]-tris[:, 0], tris[:, 2]-tris[:, 0])
        normals /= np.maximum(np.linalg.norm(normals, axis=1)[:, None], 1e-9)
        shade = 0.65 + 0.35*np.clip(normals @ np.array([0.2, 0.3, 0.93]), 0, 1)
        colors = np.clip(np.array(color)[None, :]*shade[:, None], 0, 1)
        if mesh.visual.material.name == wood.name:
            centers = render_mesh.triangles_center
            u = np.clip(((centers[:, 0]/W+0.5)*1535).astype(int), 0, 1535)
            vtex = np.clip(((1-(centers[:, 2]/D+0.5))*767).astype(int), 0, 767)
            colors = rgb[vtex, u]*shade[:, None]
        ax.add_collection3d(Poly3DCollection(tris, facecolors=colors, linewidths=0, edgecolors='none'))
    ax.set_xlim(-W*.56, W*.56)
    ax.set_ylim(-D*.6, D*.6)
    ax.set_zlim(0, H*1.08)
    ax.set_box_aspect([W, D, H])
    ax.view_init(elev=elev, azim=azim)
    ax.set_title(title, fontsize=13)
    ax.set_axis_off()
plt.tight_layout()
fig.savefig(ROOT / 'preview.png', dpi=160, bbox_inches='tight')
plt.close(fig)
