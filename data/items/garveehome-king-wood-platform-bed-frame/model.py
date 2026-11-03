import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image
import trimesh
from scipy.spatial import ConvexHull
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

ROOT = Path(__file__).resolve().parent
INCH = 0.0254
spec = json.loads((ROOT / 'dimensions.json').read_text())
W, H, D = [spec[k] * INCH for k in ('width', 'height', 'depth')]
rng = np.random.default_rng(42)


def grain_image(base, strength, seed):
    random = np.random.default_rng(seed)
    u, v = np.meshgrid(np.linspace(0, 10, 1024), np.linspace(0, 10, 256))
    warp = v + 0.11 * np.sin(u * 0.6 + v * 0.8) + 0.06 * np.sin(u * 1.7 + v * 0.7)
    grain = (0.40 * np.sin(warp * 31 + 1.4 * np.sin(u * 0.9))
             + 0.20 * np.sin(warp * 79 + np.sin(u))
             + 0.16 * np.sin(warp * 147)
             + 0.22 * np.sin(warp * 5.2 + u * 0.15))
    pores = np.maximum(0, np.sin(warp * 43 + 2 * np.sin(u * 0.7)) - 0.78)
    value = strength * (grain - 2 * pores) + random.normal(0, 1.3, u.shape)
    return Image.fromarray(np.clip(np.array(base)[None, None, :] + value[..., None], 0, 255).astype(np.uint8))


walnut = trimesh.visual.material.PBRMaterial(
    name='Walnut engineered wood veneer', baseColorFactor=[255, 255, 255, 255],
    baseColorTexture=grain_image([91, 66, 47], 13, 3), metallicFactor=0, roughnessFactor=0.76)
slatwood = trimesh.visual.material.PBRMaterial(
    name='Unfinished pale wood slats', baseColorFactor=[255, 255, 255, 255],
    baseColorTexture=grain_image([192, 171, 132], 6, 9), metallicFactor=0, roughnessFactor=0.9)
steel = trimesh.visual.material.PBRMaterial(
    name='Black coated steel', baseColorFactor=[24, 26, 26, 255], metallicFactor=0.65, roughnessFactor=0.48)
felt = trimesh.visual.material.PBRMaterial(
    name='Dark anti noise support tape', baseColorFactor=[35, 34, 31, 255], metallicFactor=0, roughnessFactor=1)
scene = trimesh.Scene()


def box(name, extents, center, material, grain_axis=0, bevel=0.0007):
    half = np.array(extents) / 2
    points = []
    for signs in np.array(np.meshgrid(*[[-1, 1]] * 3)).T.reshape(-1, 3):
        for axis in range(3):
            point = signs * (half - bevel)
            point[axis] = signs[axis] * half[axis]
            points.append(point)
    hull = ConvexHull(points)
    mesh = trimesh.Trimesh(vertices=points, faces=hull.simplices, process=True)
    mesh.fix_normals()
    # UV seams keep the veneer grain along the board rather than stretching around corners.
    normals = mesh.face_normals.copy()
    vertices = mesh.vertices[mesh.faces].reshape(-1, 3)
    uv = []
    for tri, normal in zip(vertices.reshape(-1, 3, 3), normals):
        face_axis = int(np.argmax(np.abs(normal)))
        first = grain_axis if face_axis != grain_axis else (grain_axis + 1) % 3
        second = next(a for a in range(3) if a != first and a != face_axis)
        a = (tri[:, first] / extents[first] + 0.5)
        b = (tri[:, second] / extents[second] + 0.5)
        uv.extend(np.column_stack([a, b]))
    mesh = trimesh.Trimesh(vertices=vertices, faces=np.arange(len(vertices)).reshape(-1, 3), process=False)
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv, material=material)
    mesh.merge_vertices(merge_tex=False)
    mesh.apply_translation(center)
    scene.add_geometry(mesh, node_name=name, geom_name=name)


wall = 0.019
box('Foot walnut panel', [W, H, wall], [0, H / 2, D / 2 - wall / 2], walnut)
box('Head walnut panel no headboard', [W, H, wall], [0, H / 2, -D / 2 + wall / 2], walnut)
for sign, label in [(-1, 'Left'), (1, 'Right')]:
    box(label + ' walnut side panel', [wall, H, D - wall * 2],
        [sign * (W / 2 - wall / 2), H / 2, 0], walnut, grain_axis=2)
    box(label + ' inner slat ledge', [0.030, 0.035, D - wall * 2],
        [sign * (W / 2 - wall - 0.015), 0.121, 0], slatwood, grain_axis=2)

beam_y = 0.119
box('Central longitudinal steel spine', [0.045, 0.040, D - wall * 2], [0, beam_y, 0], steel, grain_axis=2)
for i, z in enumerate([-D / 2 + 0.08, 0, D / 2 - 0.08]):
    box(f'Central floor support {i + 1}', [0.040, 0.099, 0.040], [0, 0.0495, z], steel)
for i, z in enumerate([-D * 0.26, D * 0.26]):
    box(f'Transverse steel brace {i + 1}', [W - 2 * wall, 0.028, 0.035], [0, 0.098, z], steel)
box('Central anti noise tape', [0.047, 0.002, D - 0.045], [0, 0.140, 0], felt, grain_axis=2)

count = 14
slat_depth = 0.088
length = D - 2 * wall - 0.026
step = (length - slat_depth) / (count - 1)
for i in range(count):
    z = -length / 2 + slat_depth / 2 + i * step
    box(f'Wood support slat {i + 1:02}', [W - 2 * wall - 0.007, 0.015, slat_depth],
        [0, 0.1485, z], slatwood, bevel=0.001)

for x in [-W / 2 + 0.023, W / 2 - 0.023]:
    for z in [-D / 2, D / 2]:
        screw = trimesh.creation.cylinder(radius=0.0025, height=0.0005, sections=12)
        screw.visual = trimesh.visual.TextureVisuals(material=steel)
        screw.apply_translation([x, 0.038, z + (0.0001 if z < 0 else -0.0001)])
        scene.add_geometry(screw, node_name=f'Recessed fastener {x} {z}')

scene.export(ROOT / 'model.glb')
loaded = trimesh.load(ROOT / 'model.glb', force='scene')
bounds = loaded.bounds
actual = (bounds[1] - bounds[0]) / INCH
print('Reloaded model bounds in inches:')
print(f'width={actual[0]:.3f}, height={actual[1]:.3f}, depth={actual[2]:.3f}')
print('Min XYZ:', bounds[0], 'Max XYZ:', bounds[1])
faces = sum(len(mesh.faces) for mesh in loaded.geometry.values())
print('Faces:', faces)
assert np.allclose(actual, [spec[k] for k in ('width', 'height', 'depth')], rtol=0.02)
assert abs(bounds[0, 1]) < 1e-5
assert faces < 60000

fig = plt.figure(figsize=(16, 5.8), facecolor='#f4f2ee')
views = [(25, 53, 'Front three-quarter'), (90, -90, 'Top-down'), (0, 0, 'Side')]
for j, (elev, azim, title) in enumerate(views, 1):
    ax = fig.add_subplot(1, 3, j, projection='3d')
    all_triangles = []
    all_colors = []
    for mesh in loaded.geometry.values():
        pending = [(mesh.vertices[f], mesh.visual.uv[f] if mesh.visual.uv is not None else np.zeros((3, 2)), n)
                   for f, n in zip(mesh.faces, mesh.face_normals)]
        triangles, texture_uv, surface_normals = [], [], []
        while pending:
            t, u, n = pending.pop()
            edges = np.linalg.norm(t - np.roll(t, -1, axis=0), axis=1)
            a = int(np.argmax(edges))
            if edges[a] > 0.035:
                b, c = (a + 1) % 3, (a + 2) % 3
                middle, middle_uv = (t[a] + t[b]) / 2, (u[a] + u[b]) / 2
                pending.append((np.array([t[a], middle, t[c]]), np.array([u[a], middle_uv, u[c]]), n))
                pending.append((np.array([middle, t[b], t[c]]), np.array([middle_uv, u[b], u[c]]), n))
            else:
                triangles.append(t)
                texture_uv.append(u.mean(axis=0))
                surface_normals.append(n)
        tri = np.array(triangles)
        tri = tri[:, :, [0, 2, 1]]
        mat = mesh.visual.material
        name = mat.name or ''
        base = np.array([0.36, 0.26, 0.185] if 'Walnut' in name else
                        [0.75, 0.67, 0.52] if 'pale' in name else [0.095, 0.10, 0.10])
        normals = np.array(surface_normals)[:, [0, 2, 1]]
        light = np.array([-0.3, 0.45, 0.84])
        shading = 0.70 + 0.30 * np.maximum(0, normals @ light)
        colors = np.clip(base[None, :] * shading[:, None], 0, 1)
        if mesh.visual.uv is not None and getattr(mat, 'baseColorTexture', None) is not None:
            tex = np.asarray(mat.baseColorTexture)
            uv = np.array(texture_uv)
            pix = tex[((1 - uv[:, 1]) * (tex.shape[0] - 1)).astype(int).clip(0, tex.shape[0]-1),
                      (uv[:, 0] * (tex.shape[1] - 1)).astype(int).clip(0, tex.shape[1]-1), :3] / 255
            colors = pix * shading[:, None]
        all_triangles.extend(tri)
        all_colors.extend(colors)
    ax.add_collection3d(Poly3DCollection(all_triangles, facecolors=all_colors, edgecolors='none', zsort='average'))
    ax.set_xlim(-W / 2 - 0.06, W / 2 + 0.06)
    ax.set_ylim(-D / 2 - 0.06, D / 2 + 0.06)
    ax.set_zlim(0, H + 0.02)
    ax.set_box_aspect((W + 0.12, D + 0.12, H + 0.02))
    ax.view_init(elev=elev, azim=azim)
    ax.set_proj_type('ortho')
    ax.set_title(title, pad=3)
    ax.set_axis_off()
    ax.set_facecolor('#f4f2ee')
fig.suptitle('GarveeHome King Platform Frame • Walnut • 77.2″ W × 81″ D × 7.7″ H', y=0.96)
fig.subplots_adjust(left=0, right=1, bottom=0.02, top=0.90, wspace=0.01)
fig.savefig(ROOT / 'preview.png', dpi=180, facecolor=fig.get_facecolor())
plt.close(fig)
