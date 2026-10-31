from pathlib import Path
import numpy as np
import trimesh
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

OUT = Path(__file__).resolve().parent
W, H, D = np.array([33, 34, 33.5]) * 0.0254
rng = np.random.default_rng(12)
a = np.arange(256)
x, y = np.meshgrid(a, a)
weave = 0.97 + 0.018 * np.sin(x * np.pi / 2) + 0.018 * np.sin(y * np.pi / 3) + rng.normal(0, 0.012, (256, 256))
tex = Image.fromarray(np.uint8(np.clip(weave[..., None] * np.array([232, 229, 218]), 0, 255)))

def fabric(name, color=(255, 254, 248, 255)):
    return trimesh.visual.material.PBRMaterial(name=name, baseColorFactor=color, baseColorTexture=tex, roughnessFactor=0.96, metallicFactor=0)

cloth = fabric('Warm ivory linen chenille')
seatcloth = fabric('Seat chenille', (250, 249, 243, 255))
seamcloth = fabric('Upholstered seam cord', (228, 226, 217, 255))
basecloth = fabric('Swivel pedestal fabric', (219, 216, 205, 255))
metal = trimesh.visual.material.PBRMaterial(name='Recessed swivel mechanism', baseColorFactor=[46, 44, 39, 255], roughnessFactor=0.36, metallicFactor=0.75)
scene = trimesh.Scene()

def add(mesh, name, material):
    v = mesh.vertices
    n = mesh.vertex_normals
    axis = np.argmax(np.abs(n), axis=1)
    uv = np.zeros((len(v), 2))
    for k, axes in enumerate([(2, 1), (0, 2), (0, 1)]):
        sel = axis == k
        uv[sel] = v[sel][:, axes] * 11
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv, material=material)
    scene.add_geometry(mesh, node_name=name, geom_name=name)
    return mesh


def rounded_box(name, size, center, radius, material=cloth, deform=None, rotation=0):
    half = np.array(size) / 2
    core = half - radius
    grids = [np.unique(np.r_[np.linspace(-h, h, 17), -c, c]) for h, c in zip(half, core)]
    vertices, faces = [], []
    for axis in range(3):
        other = [k for k in range(3) if k != axis]
        for sign in [-1, 1]:
            offset = len(vertices)
            for u in grids[other[0]]:
                for v in grids[other[1]]:
                    p = np.zeros(3)
                    p[axis] = sign * half[axis]
                    p[other] = [u, v]
                    q = np.clip(p, -core, core)
                    delta = p - q
                    vertices.append(q + radius * delta / np.linalg.norm(delta))
            nu, nv = len(grids[other[0]]), len(grids[other[1]])
            for i in range(nu - 1):
                for j in range(nv - 1):
                    a = offset + i * nv + j
                    faces.extend([[a, a + nv, a + 1], [a + 1, a + nv, a + nv + 1]])
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=True)
    mesh.fix_normals()
    if deform:
        mesh.vertices = deform(mesh.vertices.copy())
    if rotation:
        mesh.apply_transform(trimesh.transformations.rotation_matrix(rotation, [1, 0, 0]))
    mesh.apply_translation(center)
    return add(mesh, name, material)

# The exterior side panels run down into the rounded apron, as on the upholstered barrel shell.
rounded_box('Rounded lower upholstered apron', [.793, .225, .803], [0, .188, .002], .092)
rounded_box('Tall curved outer back', [.798, .685, .202], [0, .5211, -.32445], .088)

for side, label in [(-1, 'Left'), (1, 'Right')]:
    def slope(v):
        v[:, 1] += -.072 * (v[:, 2] / .775) * ((v[:, 1] + .303) / .606)
        return v
    rounded_box(label + ' full upholstered arm', [.180, .606, .8409], [side * (W / 2 - .090), .427, .005], .086, deform=slope)

rounded_box('Deep loose seat cushion', [.510, .225, .650], [0, .3515, .058], .064, seatcloth)
rounded_box('Soft inset back cushion', [.530, .399, .164], [0, .646, -.239], .070, seatcloth, rotation=np.deg2rad(-9))

# The hidden metal bearing sits between a low fabric-covered disc and the chair shell.
def cylinder(name, radius, height, center, material):
    m = trimesh.creation.cylinder(radius=radius, height=height, sections=80)
    m.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    m.apply_translation(center)
    return add(m, name, material)

cylinder('Low dark swivel bearing', .253, .030, [0, .015, -.018], metal)
profile = np.array([[0, .024], [.244, .024], [.279, .031], [.296, .047], [.300, .066], [.294, .083], [.276, .097], [0, .097]])
base = trimesh.creation.revolve(profile, sections=96)
base.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
base.apply_translation([0, 0, -.018])
add(base, 'Rounded fabric swivel pedestal', basecloth)


def cord(name, points, radius=.0015):
    points = np.asarray(points)
    verts, faces = [], []
    for i, p in enumerate(points):
        t = points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]
        t /= np.linalg.norm(t)
        n = np.cross(t, [0, 1, 0])
        if np.linalg.norm(n) < .01:
            n = np.cross(t, [1, 0, 0])
        n /= np.linalg.norm(n)
        b = np.cross(t, n)
        for a in np.linspace(0, 2 * np.pi, 8, endpoint=False):
            verts.append(p + radius * (np.cos(a) * n + np.sin(a) * b))
    for i in range(len(points) - 1):
        for j in range(8):
            a, b = i * 8 + j, i * 8 + (j + 1) % 8
            faces.extend([[a, b, a + 8], [b, b + 8, a + 8]])
    faces.extend([[0, j + 1, j] for j in range(1, 7)])
    start = (len(points) - 1) * 8
    faces.extend([[start, start + j, start + j + 1] for j in range(1, 7)])
    add(trimesh.Trimesh(verts, faces, process=True), name, seamcloth)

# Small welt seams outline the lower edge of the cushion without exaggerating the piping.
pts = []
for cx, cz, start in [(.199, .327, 0), (-.199, .327, 90), (-.199, -.211, 180), (.199, -.211, 270)]:
    for angle in np.linspace(start, start + 90, 18):
        t = np.deg2rad(angle)
        pts.append([cx + .054 * np.cos(t), .298, cz + .054 * np.sin(t)])
pts.append(pts[0])
cord('Seat cushion lower welt', pts, .0013)
cord('Center front apron tailored seam', [[0, t, .4031] for t in np.linspace(.116, .234, 20)], .0008)

scene.export(OUT / 'model.glb')
loaded = trimesh.load(OUT / 'model.glb', force='scene')
bounds = loaded.bounds
print('Bounds in inches:', np.round(bounds / .0254, 3))
print('Size in inches (width, height, depth):', np.round(np.ptp(bounds, axis=0) / .0254, 3))
print('Faces:', sum(len(g.faces) for g in loaded.geometry.values()))

fig = plt.figure(figsize=(8, 8), facecolor='#f1f0ed')
ax = fig.add_subplot(111, projection='3d')
light = np.array([-.5, .8, .9]); light /= np.linalg.norm(light)
all_triangles, all_colors = [], []
for geom in loaded.geometry.values():
    v = geom.vertices
    triangles = v[geom.faces][:, :, [0, 2, 1]]
    normals = geom.face_normals
    shade = .59 + .41 * np.clip(normals @ light, 0, 1)
    mat = geom.visual.material
    color = np.array(mat.baseColorFactor[:3]) / 255
    if getattr(mat, 'baseColorTexture', None) is not None:
        color *= np.array([232, 229, 218]) / 255
    colors = np.clip(shade[:, None] * color, 0, 1)
    all_triangles.append(triangles)
    all_colors.append(colors)
ax.add_collection3d(Poly3DCollection(np.concatenate(all_triangles), facecolors=np.concatenate(all_colors), edgecolors='none', linewidth=0, antialiased=False))
ax.set_xlim(-.55, .55); ax.set_ylim(-.55, .55); ax.set_zlim(0, 1.02)
ax.set_box_aspect((1.1, 1.1, 1.02))
ax.view_init(elev=20, azim=57)
ax.set_axis_off()
ax.set_proj_type('ortho')
plt.tight_layout(pad=0)
fig.savefig(OUT / 'preview.png', dpi=160, bbox_inches='tight', pad_inches=.05)
plt.close(fig)
