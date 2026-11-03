import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import trimesh
from PIL import Image
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from scipy.ndimage import gaussian_filter
from trimesh.visual.material import PBRMaterial


ROOT = Path(__file__).parent
INCH = 0.0254
spec = json.loads((ROOT / 'dimensions.json').read_text())
W, H, D = [spec[k] * INCH for k in ('width', 'height', 'depth')]
T = 1.41 * INCH
RAIL_TOP = 11.22 * INCH
SLAT_TOP = (11.22 - 7) * INCH
scene = trimesh.Scene()
rng = np.random.default_rng(43)


def wood_texture(base, seed):
    random = np.random.default_rng(seed)
    h, w = 512, 1024
    y, x = np.mgrid[0:h, 0:w]
    drift = 6 * np.sin(x / 190) + 3 * np.sin(x / 77 + y / 150)
    grain = np.sin((y + drift) * .72 + 2 * np.sin(x / 250))
    fine = gaussian_filter(random.normal(size=(h, w)), (.65, 14))
    broad = gaussian_filter(random.normal(size=(h, w)), (15, 95))
    fine /= fine.std()
    broad /= broad.std()
    tone = 1 + .018 * grain + .023 * fine + .045 * broad
    rgb = np.clip(np.array(base)[None, None, :] * tone[:, :, None], 0, 255)
    return Image.fromarray(rgb.astype(np.uint8))


walnut = PBRMaterial(name='Warm walnut satin', baseColorFactor=[255, 255, 255, 255],
                     baseColorTexture=wood_texture([133, 89, 54], 4), metallicFactor=0,
                     roughnessFactor=.48)
pale = PBRMaterial(name='Unfinished slat wood', baseColorFactor=[255, 255, 255, 255],
                   baseColorTexture=wood_texture([198, 183, 157], 8), metallicFactor=0,
                   roughnessFactor=.78)
backing = PBRMaterial(name='Unfinished rear panel', baseColorFactor=[173, 159, 137, 255],
                      metallicFactor=0, roughnessFactor=.85)
metal = PBRMaterial(name='Recessed brass brackets', baseColorFactor=[141, 115, 63, 255],
                    metallicFactor=.7, roughnessFactor=.43)


def finish(mesh, name, material, grain='auto'):
    # Separate face vertices so the grain turns with each board surface.
    vertices = mesh.vertices[mesh.faces].reshape(-1, 3)
    normals = np.repeat(mesh.face_normals, 3, axis=0)
    dominant = np.argmax(abs(normals), axis=1)
    uv = np.empty((len(vertices), 2))
    uv[:, 0] = np.where(dominant == 0, vertices[:, 2], vertices[:, 0])
    uv[:, 1] = np.where(dominant == 1, vertices[:, 2], vertices[:, 1])
    if grain == 'x':
        uv[:, 0] = vertices[:, 0]
    uv *= [1 / 1.55, 1 / .45]
    uv += rng.random(2)
    result = trimesh.Trimesh(vertices=vertices, faces=np.arange(len(vertices)).reshape(-1, 3),
                             process=False)
    result.visual = trimesh.visual.TextureVisuals(uv=uv, material=material)
    scene.add_geometry(result, node_name=name, geom_name=name)


def board(name, size, center, material=walnut, radius=.002, grain='auto'):
    size = np.array(size)
    radius = min(radius, size.min() * .48)
    if radius:
        sphere = trimesh.creation.uv_sphere(radius=radius, count=[8, 12]).vertices
        corners = np.array(np.meshgrid(*[[-1, 1]] * 3)).T.reshape(-1, 3)
        points = np.concatenate([sphere + corner * (size / 2 - radius) for corner in corners])
        mesh = trimesh.convex.convex_hull(points)
        mesh.vertices *= size / mesh.extents
    else:
        mesh = trimesh.creation.box(extents=size)
    mesh.apply_translation(center)
    finish(mesh, name, material, grain)


def rounded_path(width, depth, radius, steps=9):
    points = []
    for cx, cz, start in [(width/2-radius, depth/2-radius, 0),
                           (-width/2+radius, depth/2-radius, 90),
                           (-width/2+radius, -depth/2+radius, 180),
                           (width/2-radius, -depth/2+radius, 270)]:
        for angle in np.linspace(start, start+90, steps):
            a = np.radians(angle)
            points.append([cx + radius*np.cos(a), cz + radius*np.sin(a)])
    return np.array(points)


def frame_ring(name, width, depth, bottom, top, thickness, radius):
    outer = rounded_path(width, depth, radius)
    inner = rounded_path(width-2*thickness, depth-2*thickness, .009)
    n = len(outer)
    vertices = np.array([[x, y, z] for y in [bottom, top]
                         for path in [outer, inner] for x, z in path])
    faces = []
    for i in range(n):
        j = (i+1) % n
        for a, b, c, d in [(i, j, 2*n+j, 2*n+i),
                            (n+j, n+i, 3*n+i, 3*n+j),
                            (2*n+i, 2*n+j, 3*n+j, 3*n+i),
                            (j, i, n+i, n+j)]:
            faces.extend([[a, b, c], [a, c, d]])
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=True)
    mesh.fix_normals()
    finish(mesh, name, walnut)


frame_ring('Continuous rounded walnut perimeter rails', W, D, .050, RAIL_TOP, T, .026)
frame_ring('Recessed open plinth', W-.065, D-.060, 0, .060, .035, .012)
board('Full width rounded headboard', [W, H, T], [0, H/2, -D/2+T/2], radius=.009)

for side in [-1, 1]:
    x = side*(W/2-T-.009)
    board(f'Inner rail liner {side}', [.010, .184, D-2*T-.025],
          [x, .159, 0], pale, radius=.001)
    board(f'Slat bearing cleat {side}', [.026, .031, D-2*T-.035],
          [side*(W/2-T-.020), SLAT_TOP-.033, 0], pale)
    for i, z in enumerate(np.linspace(-D/2+.16, D/2-.16, 5)):
        board(f'Inner vertical brace {side} {i}', [.016, .161, .025],
              [side*(W/2-T-.020), .171, z], pale)

board('Longitudinal central support', [.045, .057, D-2*T-.015],
      [0, SLAT_TOP-.045, 0], radius=.002)
for i, z in enumerate([-.73, 0, .73]):
    board(f'Central concealed foot {i}', [.055, .054, .075], [0, .027, z])

for i, z in enumerate(np.linspace(-D/2+T+.061, D/2-T-.061, 14)):
    board(f'Pale cross slat {i+1:02}', [W-2*T-.015, .018, .071],
          [0, SLAT_TOP-.009, z], pale, radius=.002, grain='x')

for i, x in enumerate([-W/4+.009, W/4-.009]):
    board(f'Rear recessed headboard panel {i+1}', [W/2-.055, H-.085, .003],
          [x, H/2, -D/2-.0001+.002], backing, radius=.001)
for side in [-1, 1]:
    for end in [-1, 1]:
        board(f'Interior corner fitting {side} {end}', [.018, .045, .032],
              [side*(W/2-T-.026), .068, end*(D/2-T-.025)], metal, radius=.001)

scene.export(ROOT / 'model.glb')
loaded = trimesh.load(ROOT / 'model.glb', force='scene')
bounds = loaded.bounds
actual = (bounds[1]-bounds[0])/INCH
print('Reloaded bounds in inches (X width, Y height, Z depth):', actual.round(4).tolist())
print('Bounds in meters:', bounds.tolist())
print('Triangles:', sum(len(g.faces) for g in loaded.geometry.values()))
assert np.allclose(actual, [spec['width'], spec['height'], spec['depth']], rtol=.02)
assert abs(bounds[0, 1]) < .0001
assert sum(len(g.faces) for g in loaded.geometry.values()) < 60000

fig = plt.figure(figsize=(16, 6), facecolor='#f6f4f0')
for k, (title, elev, azim) in enumerate([
        ('Front three-quarter', 26, 57), ('Top-down', 90, 90), ('Side', 9, 0)]):
    ax = fig.add_subplot(1, 3, k+1, projection='3d')
    all_triangles, all_colors = [], []
    for mesh in loaded.geometry.values():
        mat = mesh.visual.material
        if mat.baseColorTexture is not None:
            tex = np.asarray(mat.baseColorTexture.convert('RGB')) / 255
            uv = mesh.visual.uv[mesh.faces].mean(axis=1) % 1
            colors = tex[((1-uv[:, 1])*(tex.shape[0]-1)).astype(int),
                         (uv[:, 0]*(tex.shape[1]-1)).astype(int)]
        else:
            colors = np.tile(np.asarray(mat.baseColorFactor[:3])/255, (len(mesh.faces), 1))
        light = np.array([.25, .35, .9])
        normals = mesh.face_normals[:, [0, 2, 1]]
        shading = .64 + .36*np.maximum(0, normals @ (light/np.linalg.norm(light)))
        # Small render-only triangles prevent painter-order artifacts on broad boards.
        rv, rf, source = trimesh.remesh.subdivide_to_size(
            mesh.vertices, mesh.faces, max_edge=.12, max_iter=7, return_index=True)
        all_triangles.append(rv[:, [0, 2, 1]][rf])
        all_colors.append(np.clip(colors*shading[:, None], 0, 1)[source])
    collection = Poly3DCollection(np.concatenate(all_triangles), facecolors=np.concatenate(all_colors),
                                  linewidths=0, edgecolors='none')
    ax.add_collection3d(collection)
    ax.set(xlim=(-W*.54, W*.54), ylim=(-D*.54, D*.54), zlim=(0, H*1.06))
    ax.set_box_aspect((W, D, H))
    ax.view_init(elev=elev, azim=azim)
    ax.set_axis_off()
    ax.set_title(title, fontsize=13)
    ax.set_facecolor('#f6f4f0')
fig.tight_layout()
fig.savefig(ROOT / 'preview.png', dpi=170, bbox_inches='tight')
plt.close(fig)
