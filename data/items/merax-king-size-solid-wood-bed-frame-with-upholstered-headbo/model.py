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

INCH = 0.0254
OUT = Path(__file__).parent
scene = trimesh.Scene()
rng = np.random.default_rng(31)


def grain_image(base, fabric=False):
    n = 512
    v, u = np.mgrid[0:n, 0:n] / n
    noise = rng.normal(0, 1, (n, n))
    if fabric:
        variation = noise * 1.2 + .65 * np.sin(u * np.pi * 420) + .65 * np.sin(v * np.pi * 420)
    else:
        warp = u * 36 + .24 * np.sin(v * 11) + .12 * np.sin(v * 23 + u * 7)
        variation = 3.0 * np.sin(warp * np.pi * 2) + 1.9 * np.sin(warp * np.pi * 7.1) + noise * .9
        variation += 2 * np.sin(u * 14 + v * 2)
    return Image.fromarray(np.uint8(np.clip(np.array(base)[None, None, :] + variation[:, :, None], 0, 255)))


walnut = PBRMaterial(name='Warm dark walnut', baseColorFactor=[255, 255, 255, 255], baseColorTexture=grain_image([79, 51, 34]), roughnessFactor=.47, metallicFactor=0)
pine = PBRMaterial(name='Natural unfinished slat wood', baseColorFactor=[255, 255, 255, 255], baseColorTexture=grain_image([194, 170, 132]), roughnessFactor=.83, metallicFactor=0)
fabric = PBRMaterial(name='Ivory velvet upholstery', baseColorFactor=[255, 255, 255, 255], baseColorTexture=grain_image([222, 214, 198], True), roughnessFactor=.94, metallicFactor=0)
seam_mat = PBRMaterial(name='Ivory edge stitching', baseColorFactor=[202, 193, 177, 255], roughnessFactor=.96, metallicFactor=0)
preview_colors = {'Warm dark walnut': [79/255, 51/255, 34/255], 'Natural unfinished slat wood': [194/255, 170/255, 132/255], 'Ivory velvet upholstery': [222/255, 214/255, 198/255], 'Ivory edge stitching': [202/255, 193/255, 177/255]}


def finish(mesh, name, material, axis=0):
    vertices = mesh.vertices
    transverse = (axis + 1) % 3
    lo = vertices.min(axis=0)
    span = np.maximum(vertices.max(axis=0) - lo, .001)
    uv = np.column_stack(((vertices[:, transverse] - lo[transverse]) / span[transverse], (vertices[:, axis] - lo[axis]) / span[axis]))
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv, material=material)
    scene.add_geometry(mesh, node_name=name, geom_name=name)
    return mesh


def rounded_box(name, size, center, mat, radius=.12, axis=0):
    ext = np.array(size) * INCH
    r = min(radius * INCH, min(ext) * .49)
    if mat is fabric:
        mesh = trimesh.creation.box(extents=ext)
        for _ in range(4):
            mesh = mesh.subdivide()
        core = np.clip(mesh.vertices, -ext / 2 + r, ext / 2 - r)
        offset = mesh.vertices - core
        mesh.vertices = core + offset / np.linalg.norm(offset, axis=1)[:, None] * r
    else:
        sphere = trimesh.creation.uv_sphere(radius=r, count=[8, 12])
        points = sphere.vertices + np.sign(sphere.vertices) * (ext / 2 - r)
        mesh = trimesh.convex.convex_hull(points)
    mesh.apply_translation(np.array(center) * INCH)
    return finish(mesh, name, mat, axis)


def tapered_leg(name, x, z, height, upper, lower, mat):
    vertices = []
    for y, width, shift in [(0, lower, -.12), (3.0, lower + .35, -.05), (height, upper, 0)]:
        for dx, dz in [(-1,-1),(1,-1),(1,1),(-1,1)]:
            vertices.append([(x + dx * width / 2) * INCH, y * INCH, (z + dz * width / 2 + shift) * INCH])
    faces = [[0,2,1],[0,3,2],[8,9,10],[8,10,11]]
    for ring in range(2):
        for i in range(4):
            a, b = ring * 4 + i, ring * 4 + (i+1)%4
            faces.extend([[a,b,b+4],[a,b+4,a+4]])
    return finish(trimesh.Trimesh(vertices=vertices, faces=faces), name, mat, 1)


# The six inner feet and four corner posts give the ten supports shown in the gallery.
for x, side in [(-40.45, 'left'), (40.45, 'right')]:
    tapered_leg(f'{side} foot end tapered leg', x, 41.7, 11.8, 2.2, 1.55, walnut)
    rounded_box(f'{side} tall headboard post', [2.2, 40, 2.2], [x,20,-41.7], walnut, .38, 1)
    rounded_box(f'{side} side rail', [1.3,4.7,82.2], [x,9.45,-.25], walnut, .08, 2)
    rounded_box(f'{side} inner slat ledge', [.65,1,80], [x + (1 if x < 0 else -1)*.8,8.85,0], walnut, .05, 2)
    rounded_box(f'{side} visible foot joint key', [.33,3.6,.16], [x,9.85,42.64], walnut, .035, 1)
rounded_box('Foot rail', [78.7,4.7,1.4], [0,9.45,41.6], walnut, .09)
rounded_box('Rear rail', [78.7,4.7,1.35], [0,9.45,-40.65], walnut, .09)
for x in [-13.2,13.2]:
    rounded_box(f'Inner longitudinal support beam {x}', [1.35,1.8,80.6], [x,8.55,0], pine, .06, 2)
    for z in [-35,0,35]:
        rounded_box(f'Inner support leg {x} {z}', [1.4,7.65,1.4], [x,3.825,z], pine, .08, 1)
for i, z in enumerate(np.linspace(-37.8,37.8,10)):
    rounded_box(f'Slat {i+1:02}', [78.6,.65,2.65], [0,9.775,z], pine, .10)
rounded_box('Padded upholstered headboard', [78.8,23.5,2.8], [0,32.75,-40.75], fabric, .83)

scene.metadata['description'] = 'Walnut king platform bed with ivory upholstered headboard, ten slats and ten support legs; mattress excluded.'
scene.export(OUT / 'model.glb')
loaded = trimesh.load(OUT / 'model.glb', force='scene')
print('Reloaded bounds (inches):', np.round(loaded.bounds / INCH, 3).tolist())
size = loaded.extents / INCH
print('Overall width, height, depth (inches):', np.round(size, 3).tolist())
print('Faces:', sum(len(g.faces) for g in loaded.geometry.values()))
expected = json.loads((OUT / 'dimensions.json').read_text())
assert np.allclose(size, [expected[k] for k in ['width','height','depth']], rtol=.02)
assert sum(len(g.faces) for g in loaded.geometry.values()) < 60000
assert abs(loaded.bounds[0,1]) < .0001

fig = plt.figure(figsize=(18,6), facecolor='#f5f3ef')
for number, (title,elev,azim) in enumerate([('Front three-quarter',25,58),('Top-down',90,90),('Side',0,0)], 1):
    ax = fig.add_subplot(1,3,number,projection='3d')
    ax.set_facecolor('#f5f3ef')
    for geom in loaded.geometry.values():
        verts = geom.vertices[:,[0,2,1]]
        normals = geom.face_normals[:,[0,2,1]]
        light = np.array([-.4,.2,.85])
        shade = .76 + .24 * np.clip(normals @ light, -1,1)
        color = np.array(preview_colors[geom.visual.material.name])
        poly = Poly3DCollection(verts[geom.faces], facecolors=np.clip(shade[:,None]*color,0,1), linewidths=0, zsort='average')
        ax.add_collection3d(poly)
    ax.set_xlim(-1.17,1.17)
    ax.set_ylim(-1.17,1.17)
    ax.set_zlim(0,1.2)
    ax.set_box_aspect([2.34,2.34,1.2])
    ax.view_init(elev=elev,azim=azim)
    ax.set_proj_type('ortho')
    ax.set_axis_off()
    ax.set_title(title, fontsize=13)
fig.subplots_adjust(left=0,right=1,top=.92,bottom=0,wspace=0)
fig.savefig(OUT / 'preview.png',dpi=160,facecolor=fig.get_facecolor())
plt.close(fig)
