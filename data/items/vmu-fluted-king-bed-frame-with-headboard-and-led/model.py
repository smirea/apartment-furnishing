import json
from pathlib import Path

import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial

INCH = 0.0254
W, H, D = np.array([82.3, 44.5, 82.3]) * INCH
PW = 77.4 * INCH
scene = trimesh.Scene()
rng = np.random.default_rng(42)
wood = PBRMaterial(name='Warm walnut', baseColorFactor=[91, 57, 32, 255], roughnessFactor=0.53, metallicFactor=0.0)
basewood = PBRMaterial(name='Walnut recessed plinth', baseColorFactor=[132, 78, 35, 255], roughnessFactor=0.5, metallicFactor=0.0)
steel = PBRMaterial(name='Black powder coated steel', baseColorFactor=[24, 25, 24, 255], roughnessFactor=0.42, metallicFactor=0.65)
led = PBRMaterial(name='Warm amber LED diffuser', baseColorFactor=[255, 203, 106, 255], emissiveFactor=[1.0, 0.51, 0.12], roughnessFactor=0.4, metallicFactor=0.0)
flute_mats = [PBRMaterial(name=f'Walnut grain tone {i}', baseColorFactor=[int(96*s), int(62*s), int(36*s), 255], roughnessFactor=0.5, metallicFactor=0.0) for i,s in enumerate(np.linspace(0.88,1.12,11))]


def add(mesh, material, name):
    mesh.visual = trimesh.visual.TextureVisuals(material=material)
    scene.add_geometry(mesh, node_name=name, geom_name=name)


def box(name, size, center, mat=wood):
    mesh = trimesh.creation.box(extents=size)
    mesh.apply_translation(center)
    add(mesh, mat, name)


def cylinder(name, radius, height, center, mat, sections=12):
    mesh = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi/2, [1,0,0]))
    mesh.apply_translation(center)
    add(mesh, mat, name)


def contour(width, depth, radius, n=10):
    points = []
    for cx,cz,start in [(width/2-radius,depth/2-radius,0),(width/2-radius,-depth/2+radius,90),(-width/2+radius,-depth/2+radius,180),(-width/2+radius,depth/2-radius,270)]:
        for angle in np.linspace(start,start+90,n,endpoint=False):
            t = np.radians(angle)
            points.append([cx+radius*np.sin(t), cz+radius*np.cos(t)])
    return np.array(points)


def ring(name, width, depth, radius, thickness, bottom, top, zcenter, mat):
    outer = contour(width,depth,radius)
    inner = contour(width-2*thickness,depth-2*thickness,max(radius-thickness,0.002))
    loops = [outer,inner,outer,inner]
    verts = [[x,y,z+zcenter] for points,y in zip(loops,[bottom,bottom,top,top]) for x,z in points]
    n = len(outer)
    faces=[]
    for i in range(n):
        j=(i+1)%n
        for a,b,c,d in [(i,j,2*n+j,2*n+i),(n+j,n+i,3*n+i,3*n+j),(2*n+i,2*n+j,3*n+j,3*n+i),(j,i,n+i,n+j)]:
            faces.extend([[a,b,c],[a,c,d]])
    mesh=trimesh.Trimesh(vertices=verts, faces=faces, process=True)
    mesh.fix_normals()
    add(mesh,mat,name)


rail_top=11.8*INCH
base_top=2.8*INCH
head_thick=0.055
rear=-D/2+head_thick
front=D/2
length=front-rear
zc=(front+rear)/2
r=0.038
ring('Rounded fluted rail core',PW-0.010,length-0.010,r,0.033,base_top,rail_top,zc,wood)
ring('Inset supporting walnut plinth',PW-0.060,length-0.060,0.035,0.040,0,base_top,zc,basewood)
ring('Continuous recessed warm LED strip',PW-0.054,length-0.054,0.035,0.004,0.012,0.019,zc,led)

# The flutes follow the rounded perimeter, preserving the smooth front corners.
path=contour(PW-0.015,length-0.015,0.035,24)
closed=np.vstack([path,path[0]])
segments=np.linalg.norm(np.diff(closed,axis=0),axis=1)
cumulative=np.r_[0,np.cumsum(segments)]
count=round(cumulative[-1]/0.0182)
for i,s in enumerate(np.linspace(0,cumulative[-1],count,endpoint=False)):
    k=min(np.searchsorted(cumulative,s,side='right')-1,len(segments)-1)
    p=closed[k]+(closed[k+1]-closed[k])*(s-cumulative[k])/segments[k]
    cylinder(f'Rail flute {i:03}',0.0075,rail_top-base_top,[p[0],(rail_top+base_top)/2,p[1]+zc],flute_mats[int(rng.integers(11))])

panel_bottom=rail_top+9*INCH
hz=-D/2+head_thick/2
box('Headboard panel backing',[W-0.07,H-panel_bottom,0.031],[0,(H+panel_bottom)/2,hz-0.005])
for side in [-1,1]:
    box(f'Headboard full height post {side}',[0.035,H,head_thick],[side*(W/2-0.0175),H/2,hz])
head_count=112
for i,x in enumerate(np.linspace(-W/2+0.042,W/2-0.042,head_count)):
    cylinder(f'Headboard vertical flute {i:03}',0.0081,H-panel_bottom,[x,(H+panel_bottom)/2,hz+0.012],flute_mats[int(rng.integers(11))])
box('Headboard top edge',[W-0.07,0.009,0.043],[0,H-0.0045,hz])

inner_width=PW-0.075
slat_y=rail_top-0.024
for x in [-inner_width/2,0,inner_width/2]:
    box(f'Longitudinal steel support {x:.3f}',[0.032,0.038,length-0.048],[x,slat_y-0.012,zc],steel)
for i,z in enumerate(np.linspace(rear+0.045,front-0.045,17)):
    box(f'Transverse steel slat {i:02}',[inner_width,0.018,0.027],[0,slat_y+0.010,z],steel)
for i,z in enumerate(np.linspace(rear+0.08,front-0.08,4)):
    box(f'Center support leg {i}',[0.030,slat_y-0.031,0.030],[0,(slat_y-0.031)/2,z],steel)
for x in [-inner_width/2,inner_width/2]:
    for z in [rear+0.04,front-0.04]:
        box(f'Steel corner leg {x:.2f} {z:.2f}',[0.028,slat_y-0.031,0.028],[x,(slat_y-0.031)/2,z],steel)

scene.export('model.glb')
loaded=trimesh.load('model.glb',force='scene')
bounds=loaded.bounds/INCH
print('Reloaded bounds in inches:',bounds.tolist())
print('Overall dimensions in inches:',(bounds[1]-bounds[0]).round(3).tolist())
faces=sum(len(m.faces) for m in loaded.geometry.values())
print('Faces:',faces)
assert faces<60000
expected=np.array([json.loads(Path('dimensions.json').read_text())[k] for k in ['width','height','depth']])
assert np.all(np.abs((bounds[1]-bounds[0])-expected)/expected<0.02)

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

fig=plt.figure(figsize=(18,7),facecolor='#eeebe5')
for index,(title,elev,azim) in enumerate([('Front three-quarter',23,57),('Top-down',90,90),('Side',8,0)],1):
    ax=fig.add_subplot(1,3,index,projection='3d',computed_zorder=False)
    all_triangles=[]
    all_colors=[]
    for geom in loaded.geometry.values():
        preview_vertices, preview_faces = trimesh.remesh.subdivide_to_size(geom.vertices, geom.faces, max_edge=0.085, max_iter=6)
        preview_mesh = trimesh.Trimesh(vertices=preview_vertices, faces=preview_faces, process=False)
        vertices=preview_mesh.vertices[:,[0,2,1]]
        triangles=vertices[preview_mesh.faces]
        normals=preview_mesh.face_normals[:,[0,2,1]]
        light=np.array([0.35,0.45,0.82]); light/=np.linalg.norm(light)
        shade=0.48+0.52*np.maximum(0,normals@light)
        mat=geom.visual.material
        rgb=np.asarray(mat.baseColorFactor[:3])/255
        if mat.name=='Warm amber LED diffuser':
            shade=np.ones_like(shade)
        colors=np.column_stack([np.clip(shade[:,None]*rgb,0,1),np.ones(len(shade))])
        all_triangles.append(triangles)
        all_colors.append(colors)
    poly=Poly3DCollection(np.concatenate(all_triangles),facecolors=np.concatenate(all_colors),linewidths=0,rasterized=True,zsort='average')
    ax.add_collection3d(poly)
    ax.set_xlim(-W/2-0.05,W/2+0.05)
    ax.set_ylim(-D/2-0.05,D/2+0.05)
    ax.set_zlim(0,H+0.05)
    ax.set_box_aspect((W,D,H))
    ax.view_init(elev=elev,azim=azim)
    ax.set_title(title,pad=8,color='#46392d',fontsize=15)
    ax.set_axis_off()
    ax.set_facecolor('#eeebe5')
fig.subplots_adjust(left=0,right=1,bottom=0,top=0.93,wspace=0.02)
fig.savefig('preview.png',dpi=170,facecolor=fig.get_facecolor())
plt.close(fig)
print('Saved model.glb and preview.png')
