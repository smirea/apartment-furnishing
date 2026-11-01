from pathlib import Path
import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

OUT = Path(__file__).resolve().parent
W, H, D = np.array([78, 45.5, 82]) * 0.0254
scene = trimesh.Scene()
materials = {
    'velvet': PBRMaterial(name='warm white velvet', baseColorFactor=[241, 238, 228, 255], roughnessFactor=0.94, metallicFactor=0),
    'seam': PBRMaterial(name='ivory piping', baseColorFactor=[224, 220, 210, 255], roughnessFactor=1, metallicFactor=0),
    'wood': PBRMaterial(name='natural birch slats', baseColorFactor=[195, 156, 105, 255], roughnessFactor=0.76, metallicFactor=0),
    'steel': PBRMaterial(name='powder coated support steel', baseColorFactor=[39, 39, 37, 255], roughnessFactor=0.48, metallicFactor=0.65),
    'feet': PBRMaterial(name='dark feet', baseColorFactor=[49, 43, 37, 255], roughnessFactor=0.65, metallicFactor=0),
}

def add(name, mesh, center, material):
    mesh.apply_translation(center)
    mesh.visual = trimesh.visual.TextureVisuals(material=materials[material])
    scene.add_geometry(mesh, node_name=name, geom_name=name)
    return mesh

def rounded(name, size, center, radius, material='velvet'):
    size = np.array(size)
    radius = min(radius, min(size) / 2)
    sphere = trimesh.creation.uv_sphere(radius=radius, count=[8, 12])
    offsets = np.array(np.meshgrid(*[[-s/2 + radius, s/2-radius] for s in size])).T.reshape(-1, 3)
    points = np.vstack([sphere.vertices + offset for offset in offsets])
    mesh = trimesh.convex.convex_hull(points)
    # Keep the specified overall dimensions independent of sphere sampling.
    mesh.apply_scale(size / mesh.extents)
    return add(name, mesh, center, material)

def box(name, size, center, material):
    return add(name, trimesh.creation.box(extents=size), center, material)

# Headboard is a padded backing with broad raised channels and shallow seams.
hb_z = -D/2 + .065
rounded('upholstered headboard backing', [W, .99, .13], [0, H-.495, hb_z], .045)
num_panels = 5
outer_margin = .026
panel_span = (W - 2*outer_margin) / num_panels
for i in range(num_panels):
    x = -W/2 + outer_margin + panel_span*(i+.5)
    rounded(f'vertical velvet channel {i+1}', [panel_span-.007, .935, .088], [x, H-.485, hb_z+.069], .037)

# Rails cradle the slats inside the upholstered perimeter.
rail_bottom, rail_top = .115, .355
side_width = .080
for side, x in [('left', -W/2+side_width/2), ('right', W/2-side_width/2)]:
    rounded(f'{side} upholstered side rail', [side_width, rail_top-rail_bottom, D-.15], [x, (rail_top+rail_bottom)/2, .025], .025)
    rounded(f'{side} top stitched welt', [.006, .006, D-.19], [x-side_width*.26*np.sign(x), rail_top-.005, .025], .0025, 'seam')
rounded('upholstered foot rail', [W, .24, .105], [0, .235, D/2-.0525], .030)
rounded('foot rail upper welt', [W-.07, .006, .006], [0, .350, D/2-.027], .0025, 'seam')
box('rear cross rail', [W-.16, .12, .06], [0, .235, -D/2+.16], 'steel')

for x in [-W/2+.115, W/2-.115]:
    box(f'slat support ledge {x}', [.035, .040, D-.24], [x, .271, .025], 'steel')
box('center steel spine', [.055, .06, D-.25], [0, .24, .025], 'steel')
for i, z in enumerate(np.linspace(-D/2+.24, D/2-.15, 15)):
    for side, x in [('left', -W/4+.043), ('right', W/4-.043)]:
        rounded(f'birch slat {i+1} {side}', [W/2-.105, .018, .070], [x, .300, z], .004, 'wood')

for x in [-W/2+.095, W/2-.095]:
    for z in [-D/2+.115, D/2-.11]:
        rounded(f'recessed foot {x} {z}', [.060, .14, .060], [x, .070, z], .007, 'feet')
for z in [-.55, .55]:
    box(f'center support foot {z}', [.042, .22, .042], [0, .11, z], 'steel')

scene.export(OUT / 'model.glb')
loaded = trimesh.load(OUT / 'model.glb', force='scene')
print('Bounds in inches (X, Y, Z):')
print(np.round(loaded.bounds / .0254, 3))
print('Size in inches:', np.round(loaded.extents / .0254, 3))
print('Faces:', sum(len(g.faces) for g in loaded.geometry.values()))

fig = plt.figure(figsize=(10, 9), facecolor='#f1f0ed')
ax = fig.add_subplot(111, projection='3d')
all_tris, all_colors = [], []
for source_mesh in loaded.geometry.values():
    mesh = source_mesh.subdivide_to_size(max_edge=.12, max_iter=6)
    vertices = mesh.vertices[:, [0, 2, 1]]
    tris = vertices[mesh.faces]
    color = np.array(source_mesh.visual.material.baseColorFactor[:3], dtype=float) / 255
    normals = mesh.face_normals
    light = np.array([-.4, .85, .35]); light /= np.linalg.norm(light)
    shading = .65 + .35*np.maximum(0, normals @ light)
    colors = np.clip(shading[:, None]*color, 0, 1)
    all_tris.append(tris)
    all_colors.append(colors)
collection = Poly3DCollection(np.vstack(all_tris), facecolors=np.vstack(all_colors), linewidths=0, edgecolors='none', zsort='average')
ax.add_collection3d(collection)
ax.set_xlim(-W*.57, W*.57)
ax.set_ylim(-D*.57, D*.57)
ax.set_zlim(0, H*1.05)
ax.set_box_aspect((W, D, H))
ax.view_init(elev=25, azim=57)
ax.set_axis_off()
plt.tight_layout()
fig.savefig(OUT / 'preview.png', dpi=160, bbox_inches='tight', pad_inches=.05)
plt.close(fig)
