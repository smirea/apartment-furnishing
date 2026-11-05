import json
import numpy as np
import trimesh
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

INCH = .0254
W, H, D = np.array([55.12, 27.2, 28.03]) * INCH
scene = trimesh.Scene()
colors = {}
rng = np.random.default_rng(8)
xx, zz = np.meshgrid(np.linspace(0, 1, 1024), np.linspace(0, 1, 512))
grain = np.zeros_like(xx)
for i in range(25):
    grain += rng.uniform(.12,.5) * np.sin(zz*rng.uniform(90,1100) + np.sin(xx*rng.uniform(2,13))*rng.uniform(.3,2) + rng.uniform(0,7))
grain += .55*np.sin(zz*32 + np.sin(xx*5)*.8)
grain += rng.normal(0,.16,grain.shape)
wood_pixels = np.uint8(np.clip(np.array([66,40,28])[None,None,:] + grain[:,:,None]*np.array([3.8,2.9,2.1]),0,255))
wood = trimesh.visual.material.PBRMaterial(name='dark walnut solid rubberwood', baseColorTexture=Image.fromarray(wood_pixels), baseColorFactor=[255,255,255,255], metallicFactor=0, roughnessFactor=.34)
steel = trimesh.visual.material.PBRMaterial(name='charcoal satin steel',baseColorFactor=[36,35,33,255],metallicFactor=.65,roughnessFactor=.36)
brown = trimesh.visual.material.PBRMaterial(name='warm espresso A frame',baseColorFactor=[57,39,31,255],metallicFactor=.42,roughnessFactor=.36)
black = trimesh.visual.material.PBRMaterial(name='black control housing',baseColorFactor=[19,20,21,255],metallicFactor=.12,roughnessFactor=.4)
screen = trimesh.visual.material.PBRMaterial(name='glossy dark display',baseColorFactor=[10,16,20,255],metallicFactor=.1,roughnessFactor=.15)
rubber = trimesh.visual.material.PBRMaterial(name='rubber feet',baseColorFactor=[21,20,19,255],metallicFactor=0,roughnessFactor=.85)
light = trimesh.visual.material.PBRMaterial(name='controller markings',baseColorFactor=[160,170,174,255],metallicFactor=0,roughnessFactor=.4)

def add(mesh, name, mat, wood_uv=False):
    if wood_uv:
        uv=np.column_stack((mesh.vertices[:,0]/W+.5, mesh.vertices[:,2]/D+.5))
        mesh.visual=trimesh.visual.texture.TextureVisuals(uv=uv,material=mat)
    else:
        mesh.visual=trimesh.visual.TextureVisuals(material=mat)
    scene.add_geometry(mesh,node_name=name,geom_name=name)
    colors[name] = np.array([66,40,28])/255 if wood_uv else np.array(mat.baseColorFactor[:3])/255
    return mesh

def box(name, size, pos, mat):
    m=trimesh.creation.box(extents=size)
    m.apply_translation(pos)
    return add(m,name,mat)

def beam(name, start, end, breadth, thickness, mat):
    start,end=np.array(start),np.array(end)
    direction=end-start
    m=trimesh.creation.box(extents=[breadth,thickness,np.linalg.norm(direction)])
    m.apply_transform(trimesh.geometry.align_vectors([0,0,1],direction))
    m.apply_translation((start+end)/2)
    return add(m,name,mat)

def cyl(name,r,depth,pos,mat,axis=[0,1,0]):
    m=trimesh.creation.cylinder(radius=r,height=depth,sections=16)
    m.apply_transform(trimesh.geometry.align_vectors([0,0,1],axis))
    m.apply_translation(pos)
    return add(m,name,mat)

# Rounded outlines with a small bevel preserve the thin solid-wood edge.
def outline(w,d,r):
    p=[]
    for cx,cz,st in [(w/2-r,d/2-r,0),(-w/2+r,d/2-r,90),(-w/2+r,-d/2+r,180),(w/2-r,-d/2+r,270)]:
        for a in np.linspace(st,st+90,13,endpoint=False):
            t=np.radians(a)
            p.append([cx+r*np.cos(t),cz+r*np.sin(t)])
    return np.array(p)

verts=[]
for y,inset in [(H-.028,.003),(H-.025,0),(H-.003,0),(H,.003)]:
    ring=outline(W-2*inset,D-2*inset,.026-inset)
    verts.extend([[x,y,z] for x,z in ring])
n=len(ring)
faces=[]
for k in range(3):
    for j in range(n):
        a=k*n+j;b=k*n+(j+1)%n;c=(k+1)*n+(j+1)%n;d=(k+1)*n+j
        faces.extend([[a,b,c],[a,c,d]])
verts.extend([[0,H-.028,0],[0,H,0]])
for j in range(n):
    faces.extend([[4*n,j,(j+1)%n],[4*n+1,3*n+(j+1)%n,3*n+j]])
top=trimesh.Trimesh(vertices=verts,faces=faces)
top.fix_normals()
add(top,'rounded bevel solid walnut desktop',wood,True)

for side,x in [('left',-.55),('right',.55)]:
    for direction,z in [('front',.292),('rear',-.292)]:
        foot=(x,.027,z)
        crown=(x,.526,0)
        beam(side+' '+direction+' splayed leg',foot,crown,.078,.060,brown if direction=='front' else steel)
        box(side+' '+direction+' floor pad',[.066,.009,.065],(x,.0045,z),rubber)
    beam(side+' lower A cross tie',(x,.13,-.23),(x,.13,.23),.044,.034,brown)
    box(side+' outer lift column',[.066,.145,.072],(x,.543,0),steel)
    box(side+' inner lift column',[.055,.073,.061],(x,.620,0),steel)
    box(side+' top mount',[.09,.035,.55],(x,H-.045,0),steel)
    box(side+' motor cover',[.13,.045,.13],(x*.85,H-.073,0),black)
    for z in [-.17,.17]:
        cyl(side+' tie fastener '+str(z),.005,.003,(x+.040,.13,z),black,[1,0,0])
    box(side+' telescoping collar',[.068,.005,.074],(x,.58,0),black)
box('under top transverse support',[1.10,.045,.045],(0,H-.062,0),steel)
box('rear cable tray bottom',[.91,.012,.104],(0,H-.113,-.21),steel)
box('rear cable tray back lip',[.91,.064,.008],(0,H-.087,-.261),steel)
for x in [-.40,.40]:
    box('tray mounting hanger '+str(x),[.035,.075,.012],(x,H-.073,-.254),steel)
    box('tray end '+str(x),[.009,.035,.102],(x*1.125,H-.092,-.21),steel)
box('under desk control electronics',[.19,.033,.10],(.17,H-.059,-.115),black)
controller=box('front right keypad housing',[.145,.036,.062],(.355,H-.055,.306),black)
box('keypad display',[.041,.019,.002],(.306,H-.054,.338),screen)
for i in range(6):
    box('keypad button '+str(i),[.011,.015,.002],(.339+i*.014,H-.054,.338),steel)
    cyl('keypad marking '+str(i),.0015,.001,(.339+i*.014,H-.053,.3395),light,[0,0,1])

scene.export('model.glb')
loaded=trimesh.load('model.glb',force='scene')
print('Bounds in inches:', loaded.bounds/INCH)
size=loaded.extents/INCH
print('Overall dimensions in inches:',size)
print('Faces:',sum(len(m.faces) for m in loaded.geometry.values()))
assert np.allclose(size,[55.12,27.2,28.03],rtol=.02)

fig=plt.figure(figsize=(15,5.6),facecolor='#efede9')
for idx,(title,elev,azim) in enumerate([('Front three-quarter',23,55),('Top-down',90,90),('Side',8,0)]):
    ax=fig.add_subplot(1,3,idx+1,projection='3d',facecolor='#efede9',computed_zorder=False)
    all_triangles=[]
    all_colors=[]
    for name,m in loaded.geometry.items():
        v=m.vertices[:,[0,2,1]]
        normals=m.face_normals
        el,az=np.radians([elev,azim])
        camera=np.array([np.cos(el)*np.cos(az),np.sin(el),np.cos(el)*np.sin(az)])
        visible=normals@camera > 1e-7
        triangles=v[m.faces[visible]]
        normals=normals[visible]
        illumination=.72+.28*np.abs(normals@np.array([.3,.7,.65]))
        fc=np.clip(colors[name][None,:]*illumination[:,None],0,1)
        all_triangles.extend(triangles)
        all_colors.extend(fc)
    pc=Poly3DCollection(all_triangles,facecolors=all_colors,edgecolors=all_colors,linewidth=.12,antialiased=False)
    ax.add_collection3d(pc)
    cap=outline(W-.006,D-.006,.023)
    cap3=np.column_stack((cap[:,0],cap[:,1],np.full(len(cap),H+.00001)))
    surface=Poly3DCollection([cap3],facecolors=[np.array([66,40,28])/255*(.72+.28*.7)],edgecolor='none',zorder=20)
    ax.add_collection3d(surface)
    ax.set_xlim(-W*.54,W*.54);ax.set_ylim(-D*.54,D*.54);ax.set_zlim(0,H*1.07)
    ax.set_box_aspect([W,D,H])
    ax.view_init(elev=elev,azim=azim)
    ax.set_proj_type('ortho');ax.axis('off');ax.set_title(title,fontsize=12)
fig.tight_layout()
plt.savefig('preview.png',dpi=170,facecolor=fig.get_facecolor(),bbox_inches='tight')
