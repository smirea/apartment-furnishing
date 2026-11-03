from pathlib import Path
import json
import numpy as np
import trimesh
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

INCH = .0254
ROOT = Path(__file__).parent
scene = trimesh.Scene()
rng = np.random.default_rng(81)

# Long grain and subtle joined timber variation keep the broad boards from looking painted.
w, h = 1024, 512
xx, yy = np.meshgrid(np.linspace(0, 1, w), np.linspace(0, 1, h))
warp = yy + .006*np.sin(xx*18 + yy*22) + .003*np.sin(xx*41)
grain = np.sin(warp*620 + 2*np.sin(xx*10))
fine = np.sin(warp*1900 + np.sin(xx*23))
shade = .035*grain + .012*fine + .025*np.sin(xx*19+yy*38)
for row in range(10):
    for col in range(5):
        mask = (yy >= row/10) & (yy < (row+1)/10) & (xx >= (col+.35*(row%2))/5) & (xx < (col+1+.35*(row%2))/5)
        shade[mask] += rng.uniform(-.035,.035)
base = np.array([119, 69, 32])/255
pixels = np.uint8(np.clip(base[None,None,:]*(1+shade[:,:,None]),0,1)*255)
wood_image = Image.fromarray(pixels)
wood = trimesh.visual.material.PBRMaterial(name='Warm walnut rubberwood', baseColorTexture=wood_image, baseColorFactor=[255,255,255,255], metallicFactor=0, roughnessFactor=.38)
slatmat = trimesh.visual.material.PBRMaterial(name='Pale unfinished wooden slats', baseColorFactor=[225,216,194,255], metallicFactor=0, roughnessFactor=.8)
supportmat = trimesh.visual.material.PBRMaterial(name='Walnut underframe', baseColorFactor=[79,49,28,255], metallicFactor=0, roughnessFactor=.55)


def add(mesh, name, material, grain_axis='x'):
    if material is wood:
        v=mesh.vertices/INCH
        u=v[:,0]/90.75 if grain_axis=='x' else v[:,2]/83.8
        uv=np.column_stack((u+.5, v[:,1]/40))
        mesh.visual=trimesh.visual.texture.TextureVisuals(uv=uv, material=material)
    else:
        mesh.visual=trimesh.visual.TextureVisuals(material=material)
    scene.add_geometry(mesh, node_name=name, geom_name=name)


def box(name, size, center, material, grain_axis='x'):
    mesh=trimesh.creation.box(extents=np.array(size)*INCH)
    mesh.apply_translation(np.array(center)*INCH)
    add(mesh,name,material,grain_axis)


def board(name, width, bottom, top, z, thickness, top_radius, bottom_radius, material):
    left,right=-width/2,width/2
    outline=[]
    for cx,cy,r,start in [(right-top_radius,top-top_radius,top_radius,0),
                          (left+top_radius,top-top_radius,top_radius,90),
                          (left+bottom_radius,bottom+bottom_radius,bottom_radius,180),
                          (right-bottom_radius,bottom+bottom_radius,bottom_radius,270)]:
        angles=np.deg2rad(np.linspace(start,start+90,17))
        outline.extend(np.column_stack((cx+r*np.cos(angles),cy+r*np.sin(angles))))
    outline=np.array(outline)
    n=len(outline)
    center=outline.mean(axis=0)
    vertices=[]
    bevel=.12
    for zz,inset in [(z-thickness/2,bevel),(z-thickness/2+bevel,0),(z+thickness/2-bevel,0),(z+thickness/2,bevel)]:
        ring=outline.copy()
        ring[:,0]=np.clip(ring[:,0],left+inset,right-inset)
        ring[:,1]=np.clip(ring[:,1],bottom+inset,top-inset)
        vertices.extend([[x,y,zz] for x,y in ring])
    vertices.extend([[*center,z-thickness/2],[*center,z+thickness/2]])
    faces=[]
    for k in range(3):
        for i in range(n):
            j=(i+1)%n
            a,b,c,d=k*n+i,k*n+j,(k+1)*n+j,(k+1)*n+i
            faces.extend([[a,b,c],[a,c,d]])
    for i in range(n):
        j=(i+1)%n
        faces.extend([[4*n,j,i],[4*n+1,3*n+i,3*n+j]])
    mesh=trimesh.Trimesh(vertices=np.array(vertices)*INCH,faces=faces,process=True)
    mesh.fix_normals()
    add(mesh,name,material)


W,D,H=90.75,83.8,40
board('Headboard lower panel',W,0,19.13,-D/2+.6,1.2,.10,.8,wood)
board('Headboard rounded upper panel',W,19.17,H,-D/2+.6,1.2,6.2,.10,wood)
board('Rounded floor standing footboard',W,0,13.97,D/2-.6,1.2,1.5,.9,wood)
# The wide horizontal ledges reconcile the printed overall width and mattress opening.
for side in [-1,1]:
    box(f'Side rail {side}',[1.2,6.6,81.4],[side*44.6,9.1,0],wood,'z')
    box(f'Broad side ledge {side}',[7.375,.8,81.4],[side*(38+7.375/2),12,0],wood,'z')
    box(f'Slat support cleat {side}',[1,1.1,80],[side*37.5,9.5,0],supportmat,'z')

for index,x in enumerate([-12.6,12.6]):
    box(f'Longitudinal support beam {index}',[1.4,2.4,80],[x,8.9,0],supportmat,'z')
    for j,z in enumerate([-29,0,29]):
        box(f'Hidden support leg {index}-{j}',[1.65,7.7,1.65],[x,3.85,z],supportmat)

for i,z in enumerate(np.linspace(-38.65,38.65,16)):
    box(f'Wooden mattress slat {i+1:02}',[76,.7,2.7],[0,10.65,z],slatmat)

scene.export(ROOT/'model.glb')
loaded=trimesh.load(ROOT/'model.glb',force='scene')
bounds=loaded.bounds/INCH
print('Reloaded bounds in inches:')
print(bounds)
size=bounds[1]-bounds[0]
print(f'Width {size[0]:.3f}, height {size[1]:.3f}, depth {size[2]:.3f}')
print('Faces:',sum(len(m.faces) for m in loaded.geometry.values()))
assert np.allclose(size,[W,H,D],rtol=.02)
assert abs(bounds[0,1])<1e-5
assert sum(len(m.faces) for m in loaded.geometry.values())<60000

fig=plt.figure(figsize=(17,6),facecolor='#f5f3ef')
views=[('Front three-quarter',24,57),('Top-down',90,90),('Side',9,0)]
for i,(title,elev,azim) in enumerate(views,1):
    ax=fig.add_subplot(1,3,i,projection='3d')
    all_tris=[]
    all_colors=[]
    for mesh in loaded.geometry.values():
        mat=mesh.visual.material
        mesh=mesh.subdivide_to_size(max_edge=.09)
        verts=mesh.vertices
        tris=verts[mesh.faces][:,:,[0,2,1]]
        if mat.name=='Warm walnut rubberwood':
            color=np.array([119,69,32])/255
        else:
            color=np.array(mat.baseColorFactor[:3])/255
        normals=mesh.face_normals
        light=np.array([-.4,.8,.5]); light/=np.linalg.norm(light)
        shade=.64+.36*np.maximum(normals@light,0)
        colors=np.clip(color[None,:]*shade[:,None],0,1)
        all_tris.extend(tris)
        all_colors.extend(colors)
    ax.add_collection3d(Poly3DCollection(all_tris,facecolors=all_colors,edgecolors='none',linewidths=0,antialiaseds=False))
    ax.set_xlim(-1.25,1.25);ax.set_ylim(-1.25,1.25);ax.set_zlim(0,1.15)
    ax.set_box_aspect((2.5,2.5,1.15))
    ax.view_init(elev=elev,azim=azim)
    ax.set_proj_type('ortho')
    ax.set_title(title,pad=2)
    ax.set_axis_off()
fig.tight_layout()
fig.savefig(ROOT/'preview.png',dpi=170,facecolor=fig.get_facecolor(),bbox_inches='tight')
plt.close(fig)
