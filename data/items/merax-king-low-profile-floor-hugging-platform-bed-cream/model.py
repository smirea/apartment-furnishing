import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial


ROOT = Path(__file__).parent
INCH = 0.0254
scene = trimesh.Scene()
cream = PBRMaterial(name="Cream polyester", baseColorFactor=[225, 220, 201, 255], roughnessFactor=0.94, metallicFactor=0)
piping = PBRMaterial(name="Cream piping", baseColorFactor=[211, 206, 188, 255], roughnessFactor=0.96, metallicFactor=0)
wood = PBRMaterial(name="Natural pale slats", baseColorFactor=[201, 175, 130, 255], roughnessFactor=0.78, metallicFactor=0)
support = PBRMaterial(name="Plywood support", baseColorFactor=[158, 124, 82, 255], roughnessFactor=0.84, metallicFactor=0)
black = PBRMaterial(name="Black inner frame", baseColorFactor=[31, 30, 27, 255], roughnessFactor=0.64, metallicFactor=0.12)


def add(mesh, name, material):
    mesh.visual = trimesh.visual.TextureVisuals(material=material)
    scene.add_geometry(mesh, node_name=name, geom_name=name)


def rounded_box(size, center, radius, name, material, steps=12):
    half = np.array(size) / 2
    radius = min(radius, min(half) - 0.001)
    core = half - radius
    vertices, faces = [], []
    for axis in range(3):
        other = [i for i in range(3) if i != axis]
        for sign in [-1, 1]:
            start = len(vertices)
            for a in np.linspace(-1, 1, steps + 1):
                for b in np.linspace(-1, 1, steps + 1):
                    p = np.zeros(3)
                    p[axis] = sign * half[axis]
                    p[other] = [a * half[other[0]], b * half[other[1]]]
                    q = np.clip(p, -core, core)
                    delta = p - q
                    vertices.append(q + radius * delta / np.linalg.norm(delta))
            for i in range(steps):
                for j in range(steps):
                    a = start + i * (steps + 1) + j
                    b = a + steps + 1
                    pair = [[a, b, a + 1], [a + 1, b, b + 1]]
                    if sign != [1, -1, 1][axis]:
                        pair = [face[::-1] for face in pair]
                    faces.extend(pair)
    mesh = trimesh.Trimesh(vertices=np.array(vertices), faces=faces, process=True)
    mesh.apply_translation(center)
    mesh.apply_scale(INCH)
    add(mesh, name, material)


def box(size, center, name, material):
    mesh = trimesh.creation.box(extents=np.array(size) * INCH)
    mesh.apply_translation(np.array(center) * INCH)
    add(mesh, name, material)


def seam_loop(cx, cy, z, width, height, radius, name):
    points = []
    for x, y, angle in [(width/2-radius, height/2-radius, 0),
                         (-width/2+radius, height/2-radius, 90),
                         (-width/2+radius, -height/2+radius, 180),
                         (width/2-radius, -height/2+radius, 270)]:
        for t in np.linspace(angle, angle + 90, 10, endpoint=False):
            t = np.deg2rad(t)
            points.append([cx + x + radius*np.cos(t), cy + y + radius*np.sin(t), z])
    vertices, faces = [], []
    points = np.array(points)
    for i, p in enumerate(points):
        tangent = points[(i+1) % len(points)] - points[(i-1) % len(points)]
        tangent /= np.linalg.norm(tangent)
        normal = np.cross(tangent, [0, 0, 1])
        for t in np.linspace(0, 2*np.pi, 6, endpoint=False):
            vertices.append(p + 0.045*(np.cos(t)*normal + np.sin(t)*np.array([0, 0, 1])))
    for i in range(len(points)):
        for j in range(6):
            a, b = i*6+j, ((i+1) % len(points))*6+j
            c, d = i*6+(j+1)%6, ((i+1) % len(points))*6+(j+1)%6
            faces.extend([[a, b, c], [c, b, d]])
    mesh = trimesh.Trimesh(vertices=np.array(vertices)*INCH, faces=faces, process=True)
    if mesh.volume < 0:
        mesh.invert()
    add(mesh, name, piping)


# The 84.87-inch frame starts at the front face of the thick headboard.
depth = 90.49
rear = -depth/2
head_front = rear + 5.62
front = depth/2
for i, x in enumerate([-24.5925, 24.5925]):
    rounded_box([49.065, 24.75, 5.62], [x, 12.375, rear+2.81], 0.8,
                f"Padded headboard panel {i+1}", cream, 16)
    seam_loop(x, 12.375, head_front-0.14, 48.35, 24.03, 0.65, f"Headboard piping {i+1}")

rail_width = 4.25
foot_z = front - rail_width/2
rail_length = 84.87 - rail_width/2
for side, x in [("Left", -40.625), ("Right", 40.625)]:
    rounded_box([4.25, 6.62, rail_length], [x, 3.31, head_front+rail_length/2], 2.12,
                f"{side} upholstered side rail", cream, 16)
    box([0.65, 3.75, 80.6], [np.sign(x)*38.175, 3.1, head_front+40.3], f"{side} black inner rail", black)
rounded_box([85.5, 6.62, 4.25], [0, 3.31, foot_z], 2.12,
            "Rounded upholstered foot rail", cream, 18)

slat_top = 2.13
for i, x in enumerate([-12.8, 12.8]):
    box([1.5, 1.25, 80.62], [x, 1.13, head_front+40.31], f"Longitudinal wood beam {i+1}", support)
    for j, z in enumerate([head_front+7, head_front+40, head_front+74]):
        box([1.5, 0.505, 2.0], [x, 0.2525, z], f"Support foot {i+1}-{j+1}", support)
for i, z in enumerate(np.linspace(head_front+1.65, front-5.8, 13)):
    rounded_box([77, 0.46, 1.8], [0, slat_top-0.23, z], 0.1,
                f"Wood slat {i+1:02}", wood, 2)
for i, x in enumerate([-33.4, 33.4]):
    box([0.6, 0.06, 79.4], [x, slat_top-0.49, head_front+40.3], f"Slat retaining tape {i+1}", black)
for i, x in enumerate([-38, 38]):
    box([1.5, 4.5, 0.2], [x, 4.0, head_front+0.13], f"Headboard mounting bracket {i+1}", black)

scene.export(ROOT / "model.glb")
loaded = trimesh.load(ROOT / "model.glb", force="scene")
dimensions = np.ptp(loaded.bounds, axis=0) / INCH
print("Reloaded bounds in inches:", loaded.bounds / INCH)
print("Width, height, depth in inches:", dimensions)
expected = json.loads((ROOT / "dimensions.json").read_text())
assert np.allclose(dimensions, [expected[k] for k in ["width", "height", "depth"]], rtol=0.02)
print("Faces:", sum(len(m.faces) for m in loaded.geometry.values()))

fig = plt.figure(figsize=(18, 7), facecolor="#f2f1ed")
for index, (title, elev, azim) in enumerate([
    ("Front three-quarter", 26, 56), ("Top-down", 90, 90), ("Side", 0, 0)
]):
    ax = fig.add_subplot(1, 3, index+1, projection="3d")
    triangles, colors = [], []
    for mesh in loaded.geometry.values():
        verts = mesh.vertices[:, [0, 2, 1]]
        rgba = np.array(mesh.visual.material.baseColorFactor) / 255
        tri = verts[mesh.faces[:, ::-1]]
        normals = np.cross(tri[:, 1]-tri[:, 0], tri[:, 2]-tri[:, 0])
        normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
        light = np.array([-0.3, 0.4, 0.85])
        light /= np.linalg.norm(light)
        brightness = 0.74 + 0.26*np.maximum(normals @ light, 0)
        facecolors = np.tile(rgba, (len(tri), 1))
        facecolors[:, :3] *= brightness[:, None]
        triangles.extend(tri)
        colors.extend(facecolors)
    collection = Poly3DCollection(triangles, facecolors=colors, edgecolors="none", linewidth=0, antialiased=False)
    ax.add_collection3d(collection)
    bounds = loaded.bounds[:, [0, 2, 1]]
    ax.set_xlim(bounds[:, 0]); ax.set_ylim(bounds[:, 1]); ax.set_zlim(0, bounds[1, 2])
    ax.set_box_aspect(np.ptp(bounds, axis=0))
    ax.view_init(elev=elev, azim=azim)
    ax.set_title(title, pad=12)
    ax.set_axis_off()
fig.tight_layout()
fig.savefig(ROOT / "preview.png", dpi=160, bbox_inches="tight")
plt.close(fig)
