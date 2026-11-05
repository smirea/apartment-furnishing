import json
from pathlib import Path
import numpy as np
import trimesh
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

OUT = Path(__file__).parent
INCH = .0254
DIMS = json.loads((OUT / 'dimensions.json').read_text())
scene = trimesh.Scene()
fabric = trimesh.visual.material.PBRMaterial(name='Warm ivory boucle', baseColorFactor=[239,235,221,255], roughnessFactor=.96, metallicFactor=0)
feet_mat = trimesh.visual.material.PBRMaterial(name='Black plastic feet', baseColorFactor=[29,27,24,255], roughnessFactor=.7, metallicFactor=0)


def add(name, vertices, faces, material=fabric):
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=True)
    edges = {}
    adjacency = [[] for _ in mesh.faces]
    for fi, face in enumerate(mesh.faces):
        for a, b in zip(face, np.roll(face, -1)):
            key = (min(a,b), max(a,b))
            direction = 1 if a < b else -1
            if key in edges:
                other, old_direction = edges[key]
                same = direction == old_direction
                adjacency[fi].append((other,same))
                adjacency[other].append((fi,same))
            else:
                edges[key] = (fi,direction)
    flips = {}
    for seed in range(len(mesh.faces)):
        if seed in flips:
            continue
        flips[seed] = False
        stack = [seed]
        while stack:
            current = stack.pop()
            for neighbor, same in adjacency[current]:
                if neighbor not in flips:
                    flips[neighbor] = flips[current] ^ same
                    stack.append(neighbor)
    faces = mesh.faces.copy()
    for fi, flip in flips.items():
        if flip:
            faces[fi] = faces[fi][::-1]
    mesh.faces = faces
    if mesh.volume < 0:
        mesh.invert()
    mesh.visual = trimesh.visual.TextureVisuals(material=material)
    scene.add_geometry(mesh, node_name=name, geom_name=name)
    return mesh


def frame(t):
    t = np.asarray(t)
    p = np.stack([1.23*np.sin(t), -.82*np.cos(t)], axis=-1)
    tangent = np.stack([1.23*np.cos(t), .82*np.sin(t)], axis=-1)
    tangent /= np.linalg.norm(tangent, axis=-1, keepdims=True)
    normal = np.stack([tangent[...,1], -tangent[...,0]], axis=-1)
    return p, normal, tangent


def outline(a, b, half_depth, cap_a, cap_b, inset=0):
    t = np.linspace(a,b,49)
    p,n,v = frame(t)
    p = p-inset*n
    outer = p+half_depth*n
    inner = p-half_depth*n
    u = np.linspace(0,np.pi,17)[1:-1]
    end = p[-1]+half_depth*np.cos(u)[:,None]*n[-1]+cap_b*np.sin(u)[:,None]*v[-1]
    start = p[0]-half_depth*np.cos(u)[:,None]*n[0]-cap_a*np.sin(u)[:,None]*v[0]
    return np.concatenate([outer,end,inner[::-1],start])


def cross2(a, b):
    return a[...,0]*b[...,1]-a[...,1]*b[...,0]


def padded_prism(name, boundary, levels):
    center = boundary.mean(axis=0)
    count = len(boundary)
    vertices=[]
    for y, scale in levels:
        ring = center+(boundary-center)*scale
        vertices.extend(np.column_stack([ring[:,0],np.full(count,y),ring[:,1]]))
    faces=[]
    for k in range(len(levels)-1):
        for j in range(count):
            q=k*count+j; r=k*count+(j+1)%count
            faces.extend([[q,r,r+count],[q,r+count,q+count]])
    for k in [0,len(levels)-1]:
        pts=center+(boundary-center)*levels[k][1]
        remaining = list(range(count))
        orientation = np.sign(np.sum(pts[:,0]*np.roll(pts[:,1],-1)-pts[:,1]*np.roll(pts[:,0],-1)))
        while len(remaining) > 3:
            for ii in range(len(remaining)):
                ia, ib, ic = remaining[ii-1],remaining[ii],remaining[(ii+1)%len(remaining)]
                aa,bb,cc=pts[[ia,ib,ic]]
                cross = cross2(bb-aa,cc-bb)
                if cross*orientation <= 1e-12:
                    continue
                others=[v for v in remaining if v not in [ia,ib,ic]]
                q=pts[others]
                c1=cross2(bb-aa,q-aa)*orientation
                c2=cross2(cc-bb,q-bb)*orientation
                c3=cross2(aa-cc,q-cc)*orientation
                if np.any((c1>=-1e-12)&(c2>=-1e-12)&(c3>=-1e-12)):
                    continue
                faces.append([ia+k*count,ib+k*count,ic+k*count])
                remaining.pop(ii)
                break
            else:
                raise ValueError(f'Self-intersecting outline for {name}')
        faces.append([v+k*count for v in remaining])
    return add(name,vertices,faces)


sweep=np.deg2rad(105)
for side,(a,b) in enumerate([(-sweep,-.0015),(.0015,sweep)]):
    boundary=outline(a,b,.53,.42 if side==0 else .004,.004 if side==0 else .42)
    padded_prism(f'Module {side+1} upholstered plinth',boundary,[(.035,.974),(.055,.994),(.085,1),(.225,1),(.26,.991),(.27,.97)])

for i,(a,b) in enumerate(zip(np.linspace(-sweep,sweep,5)[:-1],np.linspace(-sweep,sweep,5)[1:])):
    a+=.005; b-=.005
    boundary=outline(a,b,.384,.06,.06,inset=.055)
    padded_prism(f'Seat cushion {i+1}',boundary,[(.245,.965),(.266,.99),(.31,1),(.357,.995),(.379,.966),(.383,.90)])


def back_path(side):
    if side==0:
        p,n,v=frame(-sweep)
        u=np.linspace(np.pi,0,25)
        cap=p+.405*np.cos(u)[:,None]*n-.40*np.sin(u)[:,None]*v
        t=np.linspace(-sweep,-.002,85)
        pp,nn,_=frame(t)
        points=np.vstack([cap[:-1],pp+.405*nn])
    else:
        t=np.linspace(.002,sweep,85)
        pp,nn,_=frame(t)
        p,n,v=frame(sweep)
        u=np.linspace(0,np.pi,25)
        cap=p+.405*np.cos(u)[:,None]*n+.40*np.sin(u)[:,None]*v
        points=np.vstack([pp+.405*nn,cap[1:]])
    return points


for side in range(2):
    points=back_path(side)
    tang=np.gradient(points,axis=0)
    tang/=np.linalg.norm(tang,axis=1,keepdims=True)
    normals=np.column_stack([tang[:,1],-tang[:,0]])
    angle=np.linspace(0,2*np.pi,28,endpoint=False)
    cross=.119*np.sign(np.cos(angle))*np.abs(np.cos(angle))**.42
    vertical=np.sign(np.sin(angle))*np.abs(np.sin(angle))**.38
    vertices=[]
    for j,(p,n) in enumerate(zip(points,normals)):
        along=j/(len(points)-1)
        end_fraction=(1-along) if side==0 else along
        top=.78994-.025*max(0,(end_fraction-.72)/.28)
        y=.045+(vertical+1)*.5*(top-.045)
        lean=.025*(y-.045)/(top-.045)
        xz=p+(cross+lean)[:,None]*n
        vertices.extend(np.column_stack([xz[:,0],y,xz[:,1]]))
    faces=[]; size=len(angle)
    for j in range(len(points)-1):
        for k in range(size):
            a=j*size+k; b=j*size+(k+1)%size
            faces.extend([[a,b,b+size],[a,b+size,a+size]])
    for j in [0,len(points)-1]:
        ring=np.asarray(vertices)[j*size:(j+1)*size]
        center=len(vertices); vertices.append(ring.mean(axis=0))
        for k in range(size):
            faces.append([center,j*size+k,j*size+(k+1)%size])
    add(f'Module {side+1} rounded tight back and return arm',vertices,faces)

for side in [-1,1]:
    for t in [side*.25,side*1.15,side*1.72]:
        p,n,_=frame(t)
        for offset in [-.28,.28]:
            foot=trimesh.creation.cylinder(radius=.038,height=.047,sections=16)
            foot.apply_transform(trimesh.transformations.rotation_matrix(np.pi/2,[1,0,0]))
            foot.apply_translation([*(p+offset*n)[:1],.0235,(p+offset*n)[1]])
            foot.visual=trimesh.visual.TextureVisuals(material=feet_mat)
            scene.add_geometry(foot,node_name=f'Plastic foot {side} {t} {offset}')

bounds=scene.bounds
scale=np.array([DIMS['width']*INCH,DIMS['height']*INCH,DIMS['depth']*INCH])/(bounds[1]-bounds[0])
transform=np.eye(4); transform[:3,:3]=np.diag(scale)
transform[:3,3]=-np.array([(bounds[0,0]+bounds[1,0])/2,bounds[0,1],(bounds[0,2]+bounds[1,2])/2])*scale
scene.apply_transform(transform)
for mesh in scene.geometry.values():
    _ = mesh.vertex_normals
scene.export(OUT/'model.glb', include_normals=True)
loaded=trimesh.load(OUT/'model.glb',force='scene')
print('Bounds in inches:',loaded.bounds/INCH)
print('Size in inches:',(loaded.bounds[1]-loaded.bounds[0])/INCH)
print('Faces:',sum(len(m.faces) for m in loaded.geometry.values()))
print('Watertight parts:',sum(m.is_watertight for m in loaded.geometry.values()),'/',len(loaded.geometry))

fig=plt.figure(figsize=(16,6),facecolor='#f3f1ed')
views=[('Front three-quarter',23,57),('Top-down',90,90),('Side',5,0)]
for index,(title,elev,azim) in enumerate(views,1):
    ax=fig.add_subplot(1,3,index,projection='3d')
    for mesh in loaded.geometry.values():
        verts=mesh.vertices[:,[0,2,1]]
        color=np.array(mesh.visual.material.baseColorFactor[:3])/255
        collection=Poly3DCollection(verts[mesh.faces[:,::-1]],facecolors=color,edgecolor='none',linewidth=0,antialiased=False,shade=True,lightsource=matplotlib.colors.LightSource(azdeg=315,altdeg=50))
        ax.add_collection3d(collection)
    bounds=loaded.bounds[:,[0,2,1]]
    center=bounds.mean(axis=0); span=(bounds[1]-bounds[0])
    ax.set_xlim(center[0]-span[0]*.54,center[0]+span[0]*.54)
    ax.set_ylim(center[1]-span[1]*.54,center[1]+span[1]*.54)
    ax.set_zlim(0,span[2]*1.1)
    ax.set_box_aspect([span[0],span[1],span[2]*1.1])
    ax.view_init(elev=elev,azim=azim)
    ax.set_title(title,pad=10,color='#34322f')
    ax.set_axis_off()
    ax.set_facecolor('#f3f1ed')
plt.tight_layout()
fig.savefig(OUT/'preview.png',dpi=160,bbox_inches='tight')
