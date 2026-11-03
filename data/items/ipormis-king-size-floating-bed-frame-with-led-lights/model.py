from pathlib import Path
import json
import numpy as np
import trimesh
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from trimesh.visual.material import PBRMaterial

ROOT = Path(__file__).resolve().parent
INCH = 0.0254
scene = trimesh.Scene()
colors = {}

rng = np.random.default_rng(4)
grain = rng.normal(0, 1, (256, 1024))
for _ in range(5):
    grain = (grain + np.roll(grain, 1, axis=1) + np.roll(grain, -1, axis=1)) / 3
grain += rng.normal(0, .6, (256, 1))
grain = np.clip(20 + grain * 4, 9, 33).astype(np.uint8)
texture = Image.fromarray(np.stack([grain, grain, grain], axis=-1))
wood = PBRMaterial(name='Black horizontal wood grain', baseColorTexture=texture,
                   baseColorFactor=[255, 255, 255, 255], metallicFactor=0.0, roughnessFactor=.73)
steel = PBRMaterial(name='Black powder coated steel', baseColorFactor=[21, 23, 24, 255],
                    metallicFactor=.65, roughnessFactor=.38)
plastic = PBRMaterial(name='Charging station black plastic', baseColorFactor=[14, 15, 16, 255],
                      metallicFactor=0, roughnessFactor=.35)
dark = PBRMaterial(name='Socket recess', baseColorFactor=[3, 4, 5, 255],
                   metallicFactor=0, roughnessFactor=.7)
silver = PBRMaterial(name='USB port and screws', baseColorFactor=[105, 108, 111, 255],
                     metallicFactor=.9, roughnessFactor=.27)
foam = PBRMaterial(name='EVA slat padding', baseColorFactor=[30, 31, 32, 255],
                   metallicFactor=0, roughnessFactor=1)
led = PBRMaterial(name='Warm amber LED diffuser', baseColorFactor=[255, 174, 44, 255],
                  emissiveFactor=[1, .36, .025], metallicFactor=0, roughnessFactor=.35)

def add(name, mesh, material, color):
    mesh.visual = trimesh.visual.TextureVisuals(material=material)
    if material is wood:
        v = mesh.vertices / INCH
        mesh.visual = trimesh.visual.TextureVisuals(uv=np.column_stack([v[:, 0] / 45 + v[:, 2] / 60, v[:, 1] / 10]), material=material)
    scene.add_geometry(mesh, node_name=name, geom_name=name)
    colors[name] = color

def box(name, size, center, mat=steel, color='#191b1c', angle=0):
    mesh = trimesh.creation.box(extents=np.array(size) * INCH)
    if angle:
        mesh.apply_transform(trimesh.transformations.rotation_matrix(np.deg2rad(angle), [1, 0, 0]))
    mesh.apply_translation(np.array(center) * INCH)
    add(name, mesh, mat, color)

def beam(name, start, end, width=.8, height=.8):
    start, end = np.array(start) * INCH, np.array(end) * INCH
    vec = end - start
    mesh = trimesh.creation.box([width * INCH, height * INCH, np.linalg.norm(vec)])
    mesh.apply_transform(trimesh.geometry.align_vectors([0, 0, 1], vec))
    mesh.apply_translation((start + end) / 2)
    add(name, mesh, steel, '#191b1c')

# The visible rails are cantilevered beyond the recessed steel support frame.
for x in [-37.85, 37.85]:
    box('Side wood rail ' + str(x), [.8, 4.8, 81.6], [x, 9.1, 2.2], wood, '#161616')
box('Foot wood rail', [76.5, 4.8, .8], [0, 9.1, 42.6], wood, '#161616')
box('Head cross rail', [75, 1.5, 1.2], [0, 10.65, -37.9])
for x in [-36.75, 36.75]:
    box('Side steel tube ' + str(x), [1.15, 1.5, 79], [x, 10.65, 1.5])
for x in [-18, 18]:
    box('Longitudinal support ' + str(x), [1.1, 1.5, 79], [x, 9.9, 1.5])
for z in [-28, 2, 32]:
    box('Recessed cross support ' + str(z), [51, 1.2, 1.2], [0, 8.1, z])
    for x in [-24, 0, 24]:
        box('Inset support foot ' + str((x, z)), [1.3, 7.5, 1.3], [x, 3.75, z])
        box('Floor cap ' + str((x, z)), [1.4, .18, 1.4], [x, .09, z], plastic)
for i, z in enumerate(np.linspace(-35.8, 39.5, 11)):
    box('Steel slat %02d' % (i + 1), [73, .65, 1.15], [0, 11.175, z])
    box('Slat EVA strip %02d' % (i + 1), [72.5, .055, .8], [0, 11.4725, z], foam, '#222222')
for x in [-36, 36]:
    beam('Foot diagonal ' + str(x), [x, 9.9, 40.5], [x * .58, 9.9, 25], .7, .6)
    beam('Head diagonal ' + str(x), [x, 9.9, -36.8], [x * .58, 9.9, -22], .7, .6)

for x in [-36.5, 36.5]:
    box('Headboard upright ' + str(x), [1.15, 37.5, 1.15], [x, 18.75, -41.6])
    box('Headboard upright cap ' + str(x), [1.2, .15, 1.2], [x, .075, -41.6], plastic)
for i in range(3):
    y = 24.1 + i * 5.65
    z = -39.0 - (y - 24.1) * .065
    box('Headboard wood panel %d' % (i + 1), [76.5, 5.17, .7], [0, y, z], wood, '#181818', -3.7)
    if i < 2:
        box('Headboard gap LED %d' % i, [74.5, .13, .14], [0, y + 2.8, z + .05], led, '#ffb12b')
box('Headboard storage shelf', [76.5, .48, 4], [0, 37.76, -41], wood, '#191919')
box('Rear headboard LED', [73, .12, .13], [0, 37.2, -42.8], led, '#ffb12b')
for x in [-36.9, 36.9]:
    box('Underbed side LED ' + str(x), [.13, .12, 77], [x, 6.82, 2], led, '#ffb12b')
box('Underbed foot LED', [73.8, .12, .13], [0, 6.82, 41.8], led, '#ffb12b')

box('Charging station body', [8.2, .12, 2.5], [0, 37.985, -41], plastic, '#101112')
for x in [-2.45, -.45]:
    box('AC socket bezel ' + str(x), [1.5, .035, 1.8], [x, 38.06, -41], plastic, '#262728')
    for dx in [-.3, .3]:
        box('AC blade opening ' + str((x, dx)), [.11, .018, .48], [x + dx, 38.085, -41.2], dark, '#030405')
    box('AC ground opening ' + str(x), [.22, .018, .24], [x, 38.085, -40.55], dark, '#030405')
for x in [1.4, 2.55]:
    box('USB metal rim ' + str(x), [.65, .035, .36], [x, 38.06, -41], silver, '#73777a')
    box('USB opening ' + str(x), [.52, .018, .24], [x, 38.085, -41], dark, '#030405')

scene.export(ROOT / 'model.glb')
loaded = trimesh.load(ROOT / 'model.glb', force='scene')
bounds = loaded.bounds / INCH
size = bounds[1] - bounds[0]
print('Reloaded bounds in inches:', bounds.tolist())
print('Width, height, depth in inches:', size.tolist())
print('Triangle count:', sum(len(m.faces) for m in loaded.geometry.values()))
expected = json.loads((ROOT / 'dimensions.json').read_text())
assert np.allclose(size, [expected[k] for k in ['width', 'height', 'depth']], rtol=.02)
assert sum(len(m.faces) for m in loaded.geometry.values()) < 60000

fig = plt.figure(figsize=(18, 7), facecolor='#eeeeee')
for index, (title, elev, azim) in enumerate([
    ('Front three-quarter', 25, 56), ('Top-down', 90, 90), ('Side', 0, 0)
]):
    ax = fig.add_subplot(1, 3, index + 1, projection='3d')
    for name, mesh in scene.geometry.items():
        verts = mesh.vertices[:, [0, 2, 1]]
        poly = Poly3DCollection(verts[mesh.faces], facecolors=colors[name], edgecolor=None, linewidth=0, shade=True,
                                lightsource=matplotlib.colors.LightSource(azdeg=135, altdeg=50))
        ax.add_collection3d(poly)
    ax.set_xlim(-1.13, 1.13)
    ax.set_ylim(-1.2, 1.2)
    ax.set_zlim(0, 1.08)
    ax.set_box_aspect([2.26, 2.4, 1.08])
    ax.view_init(elev=elev, azim=azim)
    ax.set_title(title)
    ax.set_axis_off()
    ax.set_facecolor('#eeeeee')
fig.tight_layout()
fig.savefig(ROOT / 'preview.png', dpi=150, bbox_inches='tight')
plt.close(fig)
