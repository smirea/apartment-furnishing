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
INCH = 0.0254
spec = json.loads((ROOT / 'dimensions.json').read_text())
W, H, D = [spec[k] * INCH for k in ('width', 'height', 'depth')]
OPEN_W, OPEN_D = 76.3 * INCH, 80.11 * INCH
RAIL_TOP = 8.47 * INCH
RAIL_BOTTOM = RAIL_TOP - 7.87 * INCH
BACK = -D / 2
HEAD_FRONT = BACK + 1.55 * INCH
OPEN_BACK = BACK + 2.8 * INCH
OPEN_FRONT = OPEN_BACK + OPEN_D
RIM_W = (W - OPEN_W) / 2

rng = np.random.default_rng(28)
u, v = np.meshgrid(np.linspace(0, 1, 256), np.linspace(0, 1, 512))
warp = u + .009 * np.sin(v * 11) + .004 * np.sin(v * 27 + u * 12)
grain = .89 + .035 * np.sin(warp * 290) + .022 * np.sin(warp * 731 + v * 4)
grain += .018 * rng.normal(size=u.shape)
wood_image = Image.fromarray(np.uint8(np.clip(grain, .7, 1)[..., None] * np.ones(3) * 255))
walnut = PBRMaterial(name='Warm walnut satin', baseColorFactor=[132, 85, 51, 255], baseColorTexture=wood_image, metallicFactor=0.0, roughnessFactor=.48)
shadow = PBRMaterial(name='Walnut recessed grooves', baseColorFactor=[76, 44, 26, 255], metallicFactor=0.0, roughnessFactor=.64)
slatmat = PBRMaterial(name='Natural pale wood slats', baseColorFactor=[211, 190, 145, 255], baseColorTexture=wood_image, metallicFactor=0.0, roughnessFactor=.78)
steel = PBRMaterial(name='Dark steel hardware', baseColorFactor=[41, 39, 35, 255], metallicFactor=.7, roughnessFactor=.4)
footmat = PBRMaterial(name='Recessed dark walnut feet', baseColorFactor=[59, 37, 24, 255], metallicFactor=0.0, roughnessFactor=.65)
scene = trimesh.Scene()

def add(mesh, name, material, grain_axis=1):
    assert mesh.is_watertight
    mesh = mesh.copy()
    mesh.unmerge_vertices()
    vertices = mesh.vertices
    other = (grain_axis + 1) % 3
    if np.ptp(vertices[:, other]) < .002:
        other = (other + 1) % 3
    uv = np.column_stack((vertices[:, other] / .24, vertices[:, grain_axis] / 1.1))
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv, material=material)
    scene.add_geometry(mesh, node_name=name, geom_name=name)


def box(name, size, center, material=walnut, grain_axis=1):
    mesh = trimesh.creation.box(extents=size)
    mesh.apply_translation(center)
    add(mesh, name, material, grain_axis)


def rib(name, x, y, z, height, side=0):
    mesh = trimesh.creation.cylinder(radius=.0058, height=height, sections=12)
    mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    mesh.vertices[:, 2] *= .7
    if side:
        mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    mesh.apply_translation([x, y, z])
    add(mesh, name, walnut)


head_base = RAIL_BOTTOM
head_cap = .018
stile_w = .116
panel_low = RAIL_TOP + .016
panel_high = H - head_cap - .014
panel_h = panel_high - panel_low
box('Headboard solid rear panel', [W - .018, H - head_base - head_cap, .026], [0, (head_base + H - head_cap) / 2, BACK + .013], shadow)
for sign, label in [(-1, 'Left'), (1, 'Right')]:
    box(label + ' headboard solid stile', [stile_w, H - head_base - head_cap, HEAD_FRONT - BACK], [sign * (W / 2 - stile_w / 2), (head_base + H - head_cap) / 2, (BACK + HEAD_FRONT) / 2])
box('Headboard top cap', [W, head_cap, HEAD_FRONT - BACK + .002], [0, H - head_cap / 2, BACK + (HEAD_FRONT - BACK + .002) / 2], grain_axis=0)
box('Headboard lower horizontal trim', [W - 2 * stile_w, .025, .015], [0, panel_low - .009, HEAD_FRONT - .006], grain_axis=0)
box('Headboard upper horizontal trim', [W - 2 * stile_w, .014, .014], [0, panel_high + .007, HEAD_FRONT - .006], grain_axis=0)
for i, x in enumerate(np.linspace(-W / 2 + stile_w + .009, W / 2 - stile_w - .009, 126)):
    rib(f'Headboard vertical flute {i:03}', x, (panel_low + panel_high) / 2, HEAD_FRONT - .004, panel_h)

face_h = RAIL_TOP - RAIL_BOTTOM
front_depth = D / 2 - OPEN_FRONT
front_z = D / 2
box('Footboard structural core', [W - .012, face_h - .024, front_depth - .012], [0, RAIL_BOTTOM + face_h / 2, (OPEN_FRONT + front_z) / 2 - .004], shadow, 0)
box('Footboard wide walnut top rim', [W, .025, front_depth], [0, RAIL_TOP - .0125, front_z - front_depth / 2], grain_axis=0)
box('Footboard bottom border', [W, .016, .022], [0, RAIL_BOTTOM + .008, front_z - .011], grain_axis=0)
for sign in [-1, 1]:
    box(f'Footboard end stile {sign}', [.023, face_h - .025, .022], [sign * (W / 2 - .0115), RAIL_BOTTOM + (face_h - .025) / 2, front_z - .011])
for i, x in enumerate(np.linspace(-W / 2 + .03, W / 2 - .03, 140)):
    rib(f'Footboard vertical flute {i:03}', x, (RAIL_BOTTOM + .016 + RAIL_TOP - .025) / 2, front_z - .005, face_h - .041)

for sign in [-1, 1]:
    for i, z in enumerate(np.linspace(OPEN_FRONT + .008, D / 2 - .012, 12)):
        rib(f'Footboard side return {sign} flute {i:02}', sign * (W / 2 - .0045), (RAIL_BOTTOM + .016 + RAIL_TOP - .025) / 2, z, face_h - .041, side=sign)

side_start, side_end = HEAD_FRONT, OPEN_FRONT
side_length = side_end - side_start
for sign, label in [(-1, 'Left'), (1, 'Right')]:
    x = sign * (W / 2 - RIM_W / 2)
    box(label + ' wide platform rim', [RIM_W, .025, side_length], [x, RAIL_TOP - .0125, (side_start + side_end) / 2], grain_axis=2)
    box(label + ' inner support rail', [.035, .126, side_length], [sign * (OPEN_W / 2 + .021), RAIL_TOP - .088, (side_start + side_end) / 2], grain_axis=2)
    for drawer in range(2):
        gap = .003
        length = side_length / 2 - gap
        z = side_start + side_length * (drawer + .5) / 2
        box(f'{label} closed drawer {drawer + 1}', [.034, face_h - .046, length], [sign * (W / 2 - .022), (RAIL_BOTTOM + .016 + RAIL_TOP - .030) / 2, z], shadow, 2)
        box(f'{label} drawer {drawer + 1} bottom edge', [.022, .014, length], [sign * (W / 2 - .011), RAIL_BOTTOM + .007, z], grain_axis=2)
        zs = np.linspace(z - length / 2 + .01, z + length / 2 - .01, 64)
        for j, rz in enumerate(zs):
            rib(f'{label} drawer {drawer + 1} flute {j:03}', sign * (W / 2 - .0045), (RAIL_BOTTOM + .016 + RAIL_TOP - .030) / 2, rz, face_h - .046, side=sign)
    box(label + ' front rim corner', [RIM_W, face_h - .025, .015], [x, RAIL_BOTTOM + (face_h - .025) / 2, OPEN_FRONT - .0075], grain_axis=1)

box('Rear mattress support ledge', [OPEN_W, .045, OPEN_BACK - HEAD_FRONT], [0, RAIL_TOP - .038, (OPEN_BACK + HEAD_FRONT) / 2], grain_axis=0)
slat_top = RAIL_TOP - .035
box('Longitudinal center support', [.048, .085, OPEN_D], [0, slat_top - .025 - .0425, (OPEN_BACK + OPEN_FRONT) / 2], grain_axis=2)
for i, z in enumerate(np.linspace(OPEN_BACK + .042, OPEN_FRONT - .042, 16)):
    box(f'Pale wood mattress slat {i + 1:02}', [OPEN_W, .021, .069], [0, slat_top - .0105, z], slatmat, 0)
for i, z in enumerate(np.linspace(OPEN_BACK + .16, OPEN_FRONT - .16, 3)):
    height = slat_top - .025 - .085
    box(f'Center support leg {i + 1}', [.055, height, .055], [0, height / 2, z], footmat)
    box(f'Center support steel bracket {i + 1}', [.067, .008, .074], [0, height + .004, z], steel)
for sign in [-1, 1]:
    for z in [BACK + .08, D / 2 - .08]:
        box(f'Recessed corner foot {sign} {z:.2f}', [.065, RAIL_BOTTOM, .065], [sign * (W / 2 - .09), RAIL_BOTTOM / 2, z], footmat)
    for z in [OPEN_BACK + .018, OPEN_FRONT - .018]:
        box(f'Slat mounting bracket {sign} {z:.2f}', [.032, .016, .052], [sign * (OPEN_W / 2 - .012), slat_top - .026, z], steel)

scene.export(ROOT / 'model.glb')
loaded = trimesh.load(ROOT / 'model.glb', force='scene')
bounds = loaded.bounds
actual = bounds[1] - bounds[0]
print('Bounds in inches [X width, Y height, Z depth]:')
print(np.round(bounds / INCH, 3))
print('Overall size in inches:', np.round(actual / INCH, 3))
faces = sum(len(g.faces) for g in loaded.geometry.values())
print('Faces:', faces)
assert np.allclose(actual, [W, H, D], rtol=.02)
assert abs(bounds[0, 1]) < 1e-6
assert faces < 60000

fig = plt.figure(figsize=(18, 6), facecolor='#f4f1eb')
views = [('Front three-quarter', 24, 57), ('Top-down', 90, 90), ('Side', 0, 0)]
light = np.array([-.45, .85, .6])
light /= np.linalg.norm(light)
for idx, (title, elev, azim) in enumerate(views, 1):
    ax = fig.add_subplot(1, 3, idx, projection='3d', computed_zorder=True)
    ax.set_facecolor('#f4f1eb')
    triangles, facecolors = [], []
    for geom in loaded.geometry.values():
        render_vertices, render_faces = trimesh.remesh.subdivide_to_size(geom.vertices, geom.faces, max_edge=.065, max_iter=8)
        verts = render_vertices[:, [0, 2, 1]]
        mat = geom.visual.material
        color = np.asarray(mat.baseColorFactor[:3], dtype=float) / 255
        if mat.baseColorTexture is not None:
            color *= np.asarray(mat.baseColorTexture).mean(axis=(0, 1))[:3] / 255
        normals = trimesh.triangles.normals(render_vertices[render_faces])[0]
        shade = .65 + .35 * np.maximum(0, normals @ light)
        colors = np.clip(shade[:, None] * color, 0, 1)
        triangles.append(verts[render_faces])
        facecolors.append(colors)
    poly = Poly3DCollection(np.concatenate(triangles), facecolors=np.concatenate(facecolors), linewidths=0, edgecolors='none')
    ax.add_collection3d(poly)
    ax.set_xlim(-W / 2 - .08, W / 2 + .08)
    ax.set_ylim(-D / 2 - .08, D / 2 + .08)
    ax.set_zlim(0, H + .06)
    ax.set_box_aspect([W + .16, D + .16, H + .06])
    ax.view_init(elev=elev, azim=azim)
    ax.set_proj_type('ortho')
    ax.set_axis_off()
    ax.set_title(title, fontsize=14, color='#493524', pad=0)
fig.subplots_adjust(left=0, right=1, bottom=0, top=.94, wspace=0)
fig.savefig(ROOT / 'preview.png', dpi=160, facecolor=fig.get_facecolor())
plt.close(fig)
print('Exported model.glb and preview.png')
