import json
import numpy as np
import trimesh
from PIL import Image
from trimesh.visual.material import PBRMaterial
from trimesh.visual.texture import TextureVisuals
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

INCH = .0254
W, H, D = np.array([47.2, 29.5, 31.5]) * INCH
scene = trimesh.Scene()
rng = np.random.default_rng(24)
n = 768
u, v = np.meshgrid(np.linspace(0,1,n),np.linspace(0,1,n))
warp = v + .008*np.sin(u*16+v*13) + .004*np.sin(u*41+v*28)
grain = (.038*np.sin(warp*480 + 2*np.sin(u*9)) + .019*np.sin(warp*1430) + .025*np.sin(warp*111+u*7))
grain += rng.normal(0,.008,(n,n))
base = np.array([126,85,56])/255
pixels = np.uint8(np.clip(base[None,None,:]+grain[:,:,None],0,1)*255)
wood = PBRMaterial(name='Warm walnut rubberwood',baseColorFactor=[255,255,255,255],baseColorTexture=Image.fromarray(pixels),roughnessFactor=.39,metallicFactor=0)
darkwood = PBRMaterial(name='Walnut apron',baseColorFactor=[106,68,43,255],roughnessFactor=.43,metallicFactor=0)
metal = PBRMaterial(name='Recessed steel slide',baseColorFactor=[63,60,53,255],roughnessFactor=.35,metallicFactor=.75)
black = PBRMaterial(name='Leveling foot',baseColorFactor=[38,31,26,255],roughnessFactor=.68,metallicFactor=0)

def add(mesh,name,mat=wood,axes=(0,2)):
    if mat is wood:
        a,b = axes
        verts=mesh.vertices
        uv=np.column_stack((verts[:,a]/.8,verts[:,b]/.36))
        mesh.visual=TextureVisuals(uv=uv,material=mat)
    else:
        mesh.visual=TextureVisuals(uv=np.zeros((len(mesh.vertices),2)),material=mat)
    scene.add_geometry(mesh,node_name=name,geom_name=name)

def outline(w,d,r,segments=10):
    out=[]
    for cx,cz,start in [(w/2-r,d/2-r,0),(-w/2+r,d/2-r,90),(-w/2+r,-d/2+r,180),(w/2-r,-d/2+r,270)]:
        for angle in np.linspace(start,start+90,segments,endpoint=False):
            t=np.radians(angle)
            out.append([cx+r*np.cos(t),cz+r*np.sin(t)])
    return np.array(out)

def rounded_slab(w,d,h,r,center,bevel=.002):
    rings=[]
    for y,inset in [(-h/2,bevel),(-h/2+bevel,0),(h/2-bevel,0),(h/2,bevel)]:
        p=outline(w-2*inset,d-2*inset,max(r-inset,.0005))
        rings.append(np.column_stack((p[:,0],np.full(len(p),y),p[:,1])))
    verts=np.concatenate(rings)
    k=len(rings[0]); faces=[]
    for j in range(3):
        for i in range(k):
            a=j*k+i;b=j*k+(i+1)%k;c=(j+1)*k+(i+1)%k;e=(j+1)*k+i
            faces.extend([[a,b,c],[a,c,e]])
    verts=np.vstack((verts,[0,-h/2,0],[0,h/2,0]))
    for i in range(k):
        faces.extend([[4*k,(i+1)%k,i],[4*k+1,3*k+i,3*k+(i+1)%k]])
    mesh=trimesh.Trimesh(vertices=verts,faces=faces,process=True)
    mesh.fix_normals(); mesh.apply_translation(center)
    return mesh

# The split uses square inner corners so the closed leaf joint stays straight.
def top_half(sign):
    r=.034; seam=.00065; xs= W/2
    pts=[]
    if sign==1:
        pts=[[seam,-D/2],[xs-r,-D/2]]
        for a in np.linspace(-90,0,13):
            pts.append([xs-r+r*np.cos(np.radians(a)),-D/2+r+r*np.sin(np.radians(a))])
        pts.append([xs,D/2-r])
        for a in np.linspace(0,90,13):
            pts.append([xs-r+r*np.cos(np.radians(a)),D/2-r+r*np.sin(np.radians(a))])
        pts.append([seam,D/2])
    else:
        mesh=top_half(1); mesh.apply_scale([-1,1,1]); mesh.fix_normals();return mesh
    p=np.array(pts);k=len(p);t=.86*INCH;bev=.0018
    rings=[]
    centroid=p.mean(axis=0)
    for y,inset in [(H-t,bev),(H-t+bev,0),(H-bev,0),(H,bev)]:
        q=p.copy()
        if inset:
            q=centroid+(q-centroid)*(1-inset/(D/2))
        rings.append(np.column_stack((q[:,0],np.full(k,y),q[:,1])))
    verts=np.concatenate(rings);faces=[]
    for j in range(3):
        for i in range(k):
            a=j*k+i;b=j*k+(i+1)%k;c=(j+1)*k+(i+1)%k;e=(j+1)*k+i
            faces += [[a,b,c],[a,c,e]]
    for i in range(1,k-1):
        faces += [[0,i+1,i],[3*k,3*k+i,3*k+i+1]]
    mesh=trimesh.Trimesh(verts,faces,process=True);mesh.fix_normals();return mesh

for sign in [-1,1]:
    top=top_half(sign)
    vertices,faces=trimesh.remesh.subdivide_to_size(top.vertices,top.faces,max_edge=.08,max_iter=6)
    top=trimesh.Trimesh(vertices,faces,process=True)
    add(top,'Tabletop left' if sign<0 else 'Tabletop right')
under=H-.86*INCH
for z in [-.326,.326]:
    add(rounded_slab(1.00,.022,.069,.005,[0,under-.045,z]),'Apron '+str(z))
    add(rounded_slab(.397,.009,.012,.003,[0,under-.009,z]),'Recessed leaf pull '+str(z),darkwood)
for x in [-.497,.497]:
    add(rounded_slab(.022,.65,.087,.004,[x,under-.0435,0]),'End apron '+str(x))
for z in [-.23,.23]:
    add(rounded_slab(.96,.024,.018,.002,[0,under-.028,z]),'Hidden slide '+str(z),metal)
add(rounded_slab(.398,.59,.017,.008,[0,under-.049,0]),'Stored center extension leaf')

for sx in [-1,1]:
    for sz in [-1,1]:
        bottom=np.array([sx*.551, .003, sz*.354])
        top=np.array([sx*.485,under-.012,sz*.316])
        p0=outline(.026,.026,.004,5)
        p1=outline(.054,.054,.005,5)
        verts=np.vstack((np.column_stack((p0[:,0]+bottom[0],np.full(len(p0),bottom[1]),p0[:,1]+bottom[2])),np.column_stack((p1[:,0]+top[0],np.full(len(p1),top[1]),p1[:,1]+top[2]))))
        k=len(p0);faces=[]
        for i in range(k):
            j=(i+1)%k;faces.extend([[i,j,k+j],[i,k+j,k+i]])
        for i in range(1,k-1):faces.extend([[0,i+1,i],[k,k+i,k+i+1]])
        leg=trimesh.Trimesh(verts,faces,process=True);leg.fix_normals()
        add(leg,f'Tapered leg {sx} {sz}',axes=(1,0))
        add(rounded_slab(.023,.023,.003,.003,[bottom[0],.0015,bottom[2]],bevel=.0005),f'Foot {sx} {sz}',black)
scene.export('model.glb')
loaded=trimesh.load('model.glb',force='scene')
print('Bounds in inches:', loaded.bounds/INCH)
print('Overall size in inches:',loaded.extents/INCH)
print('Faces:',sum(len(m.faces) for m in loaded.geometry.values()))
def raster(elev,azim):
    e,a=np.radians([elev,azim])
    eye=np.array([np.cos(e)*np.cos(a),np.cos(e)*np.sin(a),np.sin(e)])
    right=np.array([-np.sin(a),np.cos(a),0])
    up=np.cross(eye,right)
    size=650
    buffer=np.full((size,size),-np.inf)
    canvas=np.ones((size,size,3))*.97
    scale=450
    for name,m in loaded.geometry.items():
        v=m.vertices[:,[0,2,1]]-np.array([0,0,H/2])
        coords=np.column_stack((v@right*scale+size/2,-v@up*scale+size/2,v@eye))
        color=np.array([.49,.33,.22])
        if 'slide' in name.lower():color=np.array([.23,.22,.20])
        if 'foot' in name.lower():color=np.array([.14,.12,.10])
        for face,normal in zip(m.faces,m.face_normals[:,[0,2,1]]):
            t=coords[face]
            lo=np.maximum(0,np.floor(t[:,:2].min(axis=0)).astype(int))
            hi=np.minimum(size-1,np.ceil(t[:,:2].max(axis=0)).astype(int))
            if np.any(hi<lo):continue
            xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1))
            den=(t[1,1]-t[2,1])*(t[0,0]-t[2,0])+(t[2,0]-t[1,0])*(t[0,1]-t[2,1])
            if abs(den)<1e-9:continue
            b0=((t[1,1]-t[2,1])*(xx-t[2,0])+(t[2,0]-t[1,0])*(yy-t[2,1]))/den
            b1=((t[2,1]-t[0,1])*(xx-t[2,0])+(t[0,0]-t[2,0])*(yy-t[2,1]))/den
            b2=1-b0-b1
            z=b0*t[0,2]+b1*t[1,2]+b2*t[2,2]
            old=buffer[yy,xx]
            mask=(b0>=-1e-7)&(b1>=-1e-7)&(b2>=-1e-7)&(z>old)
            shade=.73+.27*max(0,normal@np.array([.3,-.45,.84]))
            buffer[yy[mask],xx[mask]]=z[mask]
            canvas[yy[mask],xx[mask]]=np.clip(color*shade,0,1)
    return canvas
fig,axes=plt.subplots(1,3,figsize=(15,5),facecolor='#f7f5f2')
for ax,(e,a,title) in zip(axes,[(24,53,'Front three-quarter'),(90,-90,'Top'),(8,0,'Side')]):
    ax.imshow(raster(e,a));ax.set_title(title);ax.axis('off')
plt.tight_layout();plt.savefig('preview.png',dpi=180,bbox_inches='tight',pad_inches=.25);plt.close()
