from pathlib import Path
import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

OUT = Path(__file__).parent
W, H, D = np.array([85.8, 48, 16.5]) * .0254
scene = trimesh.Scene()


def material(name, color, roughness, metalness=0):
    return PBRMaterial(name=name, baseColorFactor=color, roughnessFactor=roughness, metallicFactor=metalness)


frame = material('Graphite aluminum bezel', [25, 27, 30, 255], .25, .72)
rear = material('Textured black rear enclosure', [24, 25, 27, 255], .78)
screen = material('Glossy near-black glass', [10, 16, 24, 255], .105, .22)
foot = material('Dark brushed metal feet', [36, 39, 43, 255], .28, .8)
rubber = material('Rubber foot pads', [13, 14, 15, 255], .95)
seam = material('Black bezel inset', [7, 8, 10, 255], .4)
silver = material('Silver TCL badge', [174, 178, 180, 255], .32, .8)


def add(name, mesh, mat):
    mesh.visual = trimesh.visual.TextureVisuals(material=mat)
    scene.add_geometry(mesh, node_name=name, geom_name=name)
    return mesh


def rounded_box(name, width, height, depth, radius, center, mat, bevel=.001):
    # Four inset rings give the enclosure soft corners and a small machined edge.
    rings = []
    for z, inset in [(-depth/2, bevel), (-depth/2+bevel, 0), (depth/2-bevel, 0), (depth/2, bevel)]:
        r = max(radius-inset, .0002)
        points = []
        for cx, cy, start in [(width/2-radius, height/2-radius, 0), (-width/2+radius,height/2-radius,90), (-width/2+radius,-height/2+radius,180), (width/2-radius,-height/2+radius,270)]:
            angles = np.deg2rad(np.linspace(start, start+90, 9))
            points.extend([[cx+r*np.cos(a),cy+r*np.sin(a),z] for a in angles])
        rings.append(points)
    n = len(rings[0])
    vertices = np.array(rings).reshape(-1,3)
    faces = []
    for j in range(3):
        for i in range(n):
            k=(i+1)%n
            faces.extend([[j*n+i,j*n+k,(j+1)*n+k],[j*n+i,(j+1)*n+k,(j+1)*n+i]])
    vertices = np.vstack([vertices, [0,0,-depth/2], [0,0,depth/2]])
    for i in range(n):
        k=(i+1)%n
        faces.extend([[4*n,k,i],[4*n+1,3*n+i,3*n+k]])
    mesh=trimesh.Trimesh(vertices=vertices+center,faces=faces,process=True)
    mesh.fix_normals()
    return add(name,mesh,mat)


def bar(name, start, end, width, thickness, mat):
    start,end=np.asarray(start),np.asarray(end)
    direction=end-start
    mesh=trimesh.creation.box(extents=[width,thickness,np.linalg.norm(direction)])
    transform=trimesh.geometry.align_vectors([0,0,1],direction)
    mesh.apply_transform(transform)
    mesh.apply_translation((start+end)/2)
    return add(name,mesh,mat)


bottom=.05
panel_h=H-bottom
cy=bottom+panel_h/2
rounded_box('Full slim display frame',W,panel_h,.042,.009,[0,cy,.040],frame)
rounded_box('Rear panel shell',W-.025,panel_h-.025,.029,.013,[0,cy,.007],rear)
rounded_box('Lower rear electronics housing',W*.73,.35,.055,.018,[0,bottom+.235,-.027],rear)
rounded_box('Inner black glass border',W-.008,panel_h-.008,.004,.006,[0,cy,.062],seam, .0004)
rounded_box('Display glass',W-.024,panel_h-.029,.003,.004,[0,cy+.003,.0655],screen,.0003)
rounded_box('Bottom chin',W-.012,.012,.007,.002,[0,bottom+.007,.065],frame,.0004)

for side,sign in [('Left',-1),('Right',1)]:
    x=sign*W*.388
    rounded_box(f'{side} stand attachment',.064,.069,.044,.006,[x,.068,.007],rear)
    bar(f'{side} front swept foot',[x,.067,.019],[x+sign*.092,.015,D/2-.014],.031,.018,foot)
    bar(f'{side} rear swept foot',[x,.065,-.006],[x+sign*.060,.015,-D/2+.014],.027,.018,foot)
    for end,z,offset in [('front',D/2-.018,.092),('rear',-D/2+.018,.060)]:
        pad=trimesh.creation.box(extents=[.036,.004,.036])
        pad.apply_translation([x+sign*offset,.002,z])
        add(f'{side} {end} rubber pad',pad,rubber)

# Subtle lower-edge brand lettering, formed from solid strokes.
logo_y=bottom+.007
logo_z=.0692
for name,a,b,w in [('T top',(-.016,.003),(-.006,.003),.0012),('T stem',(-.011,.003),(-.011,-.003),.0012),('C top',(-.003,.003),(.004,.003),.0011),('C side',(-.003,.003),(-.003,-.003),.0011),('C bottom',(-.003,-.003),(.004,-.003),.0011),('L stem',(.008,.003),(.008,-.003),.0011),('L base',(.008,-.003),(.015,-.003),.0011)]:
    bar('TCL '+name,[a[0],logo_y+a[1],logo_z],[b[0],logo_y+b[1],logo_z],w,.0005,silver)
rounded_box('IR receiver',.022,.006,.006,.002,[W*.34,bottom+.001,.050],seam,.0004)

path=OUT/'model.glb'
scene.export(path)
loaded=trimesh.load(path,force='scene')
print('Bounds in inches:',np.round(loaded.bounds/.0254,3))
print('Size in inches:',np.round(loaded.extents/.0254,3))
print('Faces:',sum(len(g.faces) for g in loaded.geometry.values()))
assert np.all(np.abs(loaded.extents/[W,H,D]-1)<.02)
assert sum(len(g.faces) for g in loaded.geometry.values())<60000

fig=plt.figure(figsize=(12,8),facecolor='#e6e7e9')
ax=fig.add_subplot(111,projection='3d')
ax.set_facecolor('#e6e7e9')
for mesh in loaded.dump():
    color=np.asarray(mesh.visual.material.baseColorFactor[:3])/255
    triangles=mesh.vertices[mesh.faces][:,:,[0,2,1]]
    normals=mesh.face_normals
    light=np.array([-.35,.6,.72]);light/=np.linalg.norm(light)
    shade=.78+.22*np.maximum(normals@light,0)
    colors=np.clip(color[None,:]*shade[:,None],0,1)
    collection=Poly3DCollection(triangles,facecolors=colors,linewidths=0,zsort='average')
    ax.add_collection3d(collection)
ax.set_xlim(-W*.55,W*.55)
ax.set_ylim(-D*.70,D*.70)
ax.set_zlim(-.015,H*1.04)
ax.set_box_aspect([W*1.1,D*1.4,H*1.055])
ax.view_init(elev=12,azim=67)
ax.set_axis_off()
plt.subplots_adjust(left=0,right=1,bottom=0,top=1)
plt.savefig(OUT/'preview.png',dpi=160,facecolor=fig.get_facecolor())
plt.close(fig)
