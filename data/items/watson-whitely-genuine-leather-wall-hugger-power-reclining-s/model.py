import json
import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

INCH = .0254
scene = trimesh.Scene()
leather = PBRMaterial(name='Saddle brown leather', baseColorFactor=[151,91,47,255], roughnessFactor=.43, metallicFactor=0)
side_leather = PBRMaterial(name='Saddle leather side panels', baseColorFactor=[142,82,42,255], roughnessFactor=.46, metallicFactor=0)
piping = PBRMaterial(name='Leather welting', baseColorFactor=[125,73,37,255], roughnessFactor=.5, metallicFactor=0)
stitch = PBRMaterial(name='Tonal saddle stitching', baseColorFactor=[175,119,73,255], roughnessFactor=.7, metallicFactor=0)
black = PBRMaterial(name='Black steel mechanism', baseColorFactor=[22,23,22,255], roughnessFactor=.34, metallicFactor=.65)
chrome = PBRMaterial(name='Polished control bezel', baseColorFactor=[170,174,173,255], roughnessFactor=.2, metallicFactor=.9)
control = PBRMaterial(name='Control inset', baseColorFactor=[28,27,26,255], roughnessFactor=.28, metallicFactor=.1)

def add(mesh, name, material):
    mesh.vertices *= INCH
    mesh.visual = trimesh.visual.TextureVisuals(material=material)
    scene.add_geometry(mesh, node_name=name, geom_name=name)

def sp(a, e):
    return np.sign(a)*np.abs(a)**e

def cushion(name, center, size, material=leather, e=.32, tilt=0, lumbar=0):
    n, rings = 40, 20
    verts = [[0,-size[1]/2,0]]
    for j in range(1,rings):
        v=-np.pi/2+np.pi*j/rings
        for i in range(n):
            u=2*np.pi*i/n
            x=size[0]/2*sp(np.cos(v),e)*sp(np.cos(u),e)
            y=size[1]/2*sp(np.sin(v),e)
            z=size[2]/2*sp(np.cos(v),e)*sp(np.sin(u),e)
            if z>0 and lumbar:
                z+=lumbar*np.exp(-((y+size[1]*.25)/(size[1]*.26))**2)*(1-(x/(size[0]*.52))**4)
            verts.append([x,y,z])
    verts.append([0,size[1]/2,0])
    faces=[]
    for i in range(n):
        ni=(i+1)%n
        faces.append([0,1+ni,1+i])
    for j in range(rings-2):
        for i in range(n):
            a=1+j*n+i; b=1+j*n+(i+1)%n
            faces.extend([[a,b,b+n],[a,b+n,a+n]])
    top=len(verts)-1
    for i in range(n):
        faces.append([top,1+(rings-2)*n+i,1+(rings-2)*n+(i+1)%n])
    mesh=trimesh.Trimesh(vertices=verts, faces=faces, process=True)
    mesh.fix_normals()
    rot=trimesh.transformations.rotation_matrix(np.radians(tilt),[1,0,0])
    mesh.apply_transform(rot)
    mesh.apply_translation(center)
    add(mesh,name,material)

def line(name, points, radius, mat):
    # Continuous leather welting and selected seam lines define the upholstery panels.
    points=np.array(points)
    pieces=[]
    for a,b in zip(points[:-1],points[1:]):
        length=np.linalg.norm(b-a)
        m=trimesh.creation.cylinder(radius=radius,height=length,sections=6)
        m.apply_transform(trimesh.geometry.align_vectors([0,0,1],(b-a)/length))
        m.apply_translation((a+b)/2)
        pieces.append(m)
    add(trimesh.util.concatenate(pieces),name,mat)

def box(name,center,size,mat):
    m=trimesh.creation.box(extents=size)
    m.apply_translation(center)
    add(m,name,mat)

for x in [-31.8,-11.8,11.8,31.8]:
    for z in [-13,13.4]:
        box(f'Hidden foot {x} {z}',[x,.55,z],[1.3,1.1,1.6],black)
for x in [-23.6,0,23.6]:
    label={-23.6:'Left',0:'Center',23.6:'Right'}[x]
    box(label+' metal underframe',[x,1.3,0],[22.5,1.1,30],black)
    cushion(label+' upholstered rear',[x,20,-16.3],[23.5,37,6.3],side_leather,e=.22)
    cushion(label+' lower footrest roll',[x,3.7,14.65],[23.4,4.3,7.4],leather,e=.4)
    cushion(label+' closed footrest',[x,10.3,15.05],[23.45,10.2,7.7],leather,e=.27)
    cushion(label+' seat cushion',[x,17.15,3.2],[23.5,5.0,25.0],leather,e=.44)
    cushion(label+' lumbar back cushion',[x,26.25,-10.6],[23.3,17.9,7.0],leather,e=.4,tilt=-10,lumbar=.9)
    cushion(label+' adjustable headrest',[x,36.35,-13.0],[23.35,9.1,8.0],leather,e=.35,tilt=-7)
    # The central vertical double seam is a visible feature of each lower back pad.
    for dx in [-.12,.12]:
        ys=np.linspace(20.2,32.2,22)
        pts=[]
        for y in ys:
            ly=y-26.25
            zz=-10.6+np.sin(np.radians(-10))*ly+3.5*np.cos(np.radians(-10))+.9*np.exp(-((ly+4.475)/4.654)**2)
            pts.append([x+dx,y,zz+.015])
        line(label+f' back stitching {dx}',pts,.022,stitch)
    xs=np.linspace(-11.15,11.15,36)
    line(label+' seat front stitch',[[x+u,18.08-.25*(abs(u)/11.15)**6,15.3-.7*(abs(u)/11.15)**8] for u in xs],.027,stitch)

for sign, label in [(-1,'Left'),(1,'Right')]:
    x=sign*39.15
    cushion(label+' arm upholstered pedestal',[x,11.9,.0],[7.5,22.0,37.3],side_leather,e=.25)
    cushion(label+' tall rear wing',[sign*35.95,26.8,-14.3],[4.8,25.5,8.2],leather,e=.34,tilt=-8)
    cushion(label+' pillowed armrest',[x,22.3,2.45],[7.5,4.6,30.8],leather,e=.48)
    line(label+' arm outer panel seam',[[sign*42.83,18.6-1.3*np.sin(t*np.pi),14.5-t*29] for t in np.linspace(0,1,38)],.036,stitch)
    # Each end arm has an oval chrome bezel with dark inset and two power rockers.
    cushion(label+' control chrome surround',[sign*42.83,18.3,7.2],[.14,1.65,3.85],chrome,e=.7)
    cushion(label+' dark switch panel',[sign*42.91,18.3,7.2],[.08,1.32,3.47],control,e=.65)
    for z in [6.3,7.45]:
        cushion(label+f' rocker {z}',[sign*42.96,18.3,z],[.08,.79,.72],chrome,e=.5)
    box(label+' USB port',[sign*42.97,18.3,8.45],[.08,.55,.20],black)
    box(label+' USB C port',[sign*42.97,18.3,8.76],[.08,.30,.12],black)

# Normalize the measured envelope to the supplied upright dimensions.
target=np.array([85.8,40.9,38.9])*INCH
bounds=scene.bounds
scale=target/(bounds[1]-bounds[0])
for geom in scene.geometry.values():
    geom.vertices=(geom.vertices-bounds[0])*scale
    geom.vertices[:,0]-=target[0]/2
    geom.vertices[:,2]-=target[2]/2
scene.export('model.glb')
loaded=trimesh.load('model.glb',force='scene')
print('Reloaded bounds (inches):',loaded.bounds/INCH)
print('Overall size (inches):',np.diff(loaded.bounds,axis=0)[0]/INCH)
print('Faces:',sum(len(m.faces) for m in loaded.geometry.values()))

fig=plt.figure(figsize=(18,6),facecolor='#eeeae4')
views=[('Front three-quarter',20,62),('Top-down',90,90),('Side',0,0)]
for k,(title,elev,azim) in enumerate(views,1):
    ax=fig.add_subplot(1,3,k,projection='3d')
    for mesh in loaded.geometry.values():
        verts=mesh.vertices[:,[0,2,1]]
        triangles=verts[mesh.faces]
        color=np.array(mesh.visual.material.baseColorFactor[:3])/255
        normals=np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0])
        normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-12)
        lighting=.73+.27*np.clip(-normals@np.array([-.35,.5,.79]),0,1)
        coll=Poly3DCollection(triangles,facecolors=np.clip(color[None,:]*lighting[:,None],0,1),edgecolors='none')
        ax.add_collection3d(coll)
    ax.set_xlim(-1.16,1.16); ax.set_ylim(-.63,.63); ax.set_zlim(0,1.13)
    ax.set_box_aspect([2.32,1.26,1.13]); ax.view_init(elev=elev,azim=azim)
    ax.set_title(title,color='#41372e',fontsize=14)
    ax.set_axis_off()
plt.tight_layout()
plt.savefig('preview.png',dpi=150,facecolor=fig.get_facecolor(),bbox_inches='tight')
plt.close(fig)
