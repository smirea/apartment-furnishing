import json
import numpy as np
import trimesh
from scipy.spatial import ConvexHull
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

INCH = 0.0254
scene = trimesh.Scene()
materials = {
    'leather': trimesh.visual.material.PBRMaterial(name='Warm beige brown leathaire', baseColorFactor=[182,173,155,255], roughnessFactor=.78, metallicFactor=0),
    'cushion': trimesh.visual.material.PBRMaterial(name='Soft beige upholstery', baseColorFactor=[194,185,167,255], roughnessFactor=.8, metallicFactor=0),
    'seam': trimesh.visual.material.PBRMaterial(name='Matching upholstery stitching', baseColorFactor=[158,148,130,255], roughnessFactor=.9, metallicFactor=0),
    'black': trimesh.visual.material.PBRMaterial(name='Black feet and recliner chassis', baseColorFactor=[25,25,23,255], roughnessFactor=.48, metallicFactor=.35),
    'chrome': trimesh.visual.material.PBRMaterial(name='Brushed cupholder metal', baseColorFactor=[157,158,152,255], roughnessFactor=.26, metallicFactor=.9),
    'dark': trimesh.visual.material.PBRMaterial(name='Cup recess and control panel', baseColorFactor=[42,41,37,255], roughnessFactor=.33, metallicFactor=.2),
}

def add(mesh, name, material):
    mesh.apply_scale(INCH)
    mesh.visual = trimesh.visual.TextureVisuals(material=materials[material])
    scene.add_geometry(mesh, node_name=name, geom_name=name)

def hull_mesh(points, hull):
    faces = hull.simplices.copy()
    triangles = points[faces]
    normals = np.cross(triangles[:,1]-triangles[:,0], triangles[:,2]-triangles[:,0])
    reverse = np.sum(normals * hull.equations[:,:3], axis=1) < 0
    faces[reverse] = faces[reverse, ::-1]
    return trimesh.Trimesh(points, faces, process=True)

def rounded(size, radius):
    size = np.array(size)
    core = size / 2 - radius
    directions = [[0, 1, 0], [0, -1, 0]]
    for latitude in np.linspace(-np.pi/2, np.pi/2, 9)[1:-1]:
        for longitude in np.linspace(0, 2*np.pi, 16, endpoint=False):
            directions.append([np.cos(latitude)*np.cos(longitude), np.sin(latitude), np.cos(latitude)*np.sin(longitude)])
    points = np.array([np.array([x,y,z])*core + radius*np.array(direction)
                       for x in [-1,1] for y in [-1,1] for z in [-1,1]
                       for direction in directions])
    hull = ConvexHull(points)
    return hull_mesh(points, hull)

def box(name, center, size, radius=1, mat='leather', tilt=0, turn=0):
    mesh = rounded(size, radius)
    transform = trimesh.transformations.euler_matrix(np.deg2rad(tilt), np.deg2rad(turn), 0, axes='sxyz')
    mesh.apply_transform(transform)
    mesh.apply_translation(center)
    add(mesh, name, mat)

def cylinder(name, center, radius, height, mat='black'):
    mesh = trimesh.creation.cylinder(radius=radius, height=height, sections=24)
    mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi/2, [1,0,0]))
    mesh.apply_translation(center)
    add(mesh, name, mat)

def line(name, points, radius=.045, mat='seam'):
    vertices, faces = [], []
    for i, p in enumerate(points):
        tangent = np.array(points[min(i+1,len(points)-1)]) - np.array(points[max(i-1,0)])
        tangent /= np.linalg.norm(tangent)
        ref = np.array([0.,1.,0.])
        if abs(tangent @ ref) > .95:
            ref = np.array([1.,0.,0.])
        u = np.cross(tangent, ref); u /= np.linalg.norm(u)
        v = np.cross(tangent, u)
        for t in np.linspace(0,2*np.pi,6,endpoint=False):
            vertices.append(np.array(p)+radius*(np.cos(t)*u+np.sin(t)*v))
        if i:
            for k in range(6):
                a=(i-1)*6+k; b=(i-1)*6+(k+1)%6; c=i*6+k; d=i*6+(k+1)%6
                faces.extend([[a,b,c],[b,d,c]])
    add(trimesh.Trimesh(vertices, faces, process=False), name, mat)

# Local seat coordinates have their front toward positive Z.
def seat(name, x, z, turn=0, reclining=False):
    angle=np.deg2rad(turn)
    def pos(a,y,b):
        return [x + np.cos(angle)*a + np.sin(angle)*b, y, z - np.sin(angle)*a + np.cos(angle)*b]
    def part(s, a,y,b, size,r=1,mat='leather',tilt=0):
        box(name+' '+s,pos(a,y,b),size,r,mat,tilt,turn)
    part('lower upholstered plinth',0,9,0,[29.7,13,36.8],1.6)
    part('closed footrest panel',0,10,17.6,[29.2,12,2.5],.9)
    part('seat cushion',0,16.65,5,[29.7,4.7,25],1.9,'cushion')
    part('rear upholstered shell',0,23.6,-14.1,[29.7,36,8.5],2.4,tilt=-7)
    part('lumbar back cushion',0,27.6,-8.3,[29.1,17.7,6.8],2.3,'cushion',-10)
    part('adjustable headrest',0,37,-11.2,[29.5,8,7.2],2.5,'cushion',-9)
    for a in [-11.5,11.5]:
        for b in [-13,13]:
            cylinder(name+' foot '+str((a,b)),pos(a,1.35,b),1,2.7)
    for a in [-8.3,8.3]:
        points=[pos(a+.15*np.sin(t*np.pi),20+t*14,-4.84-2.35*t) for t in np.linspace(0,1,12)]
        line(name+' back stitch '+str(a),points)
    line(name+' front cushion welt',[pos(a,16.4,17.43+.15*np.cos(a/14*np.pi/2)) for a in np.linspace(-13.7,13.7,25)])
    if reclining:
        for a in [-8.5,8.5]:
            line(name+' footrest stitch '+str(a),[pos(a,y,18.88) for y in np.linspace(5.3,13.8,10)])

seat('Left power recliner',-41,-38.5,reclining=True)
seat('Left armless seat',2,-38.5)
seat('Right armless seat',45,4.5,turn=-90)
seat('Right power recliner',45,34.5,turn=-90,reclining=True)

box('Left outside arm',[-60,12.8,-38.5],[8,20.4,38],2)
box('Left arm padded cap',[-60,22,-38.5],[8,3,37.6],1.3,'cushion')
box('Right outside arm',[45,12.8,53.5],[38,20.4,8],2)
box('Right arm padded cap',[45,22,53.5],[37.6,3,8],1.3,'cushion')
for x,z in [(-61,-52),(-61,-25),(31,54.5),(59,54.5)]:
    cylinder('Outer arm support '+str((x,z)),[x,1.3,z],1.1,2.6)

box('Storage console body',[-19.5,12,-38.5],[12.7,19,37.5],1.8)
box('Console rear pad',[-19.5,27.3,-50.3],[12.8,11.7,10],1.6,'cushion')
box('Closed hidden storage lid',[-19.5,24.2,-40],[12.6,2.4,19],1.1,'cushion')
box('Console cup deck',[-19.5,22.2,-24.6],[12.7,2.4,11],1,'cushion')
for x in [-22.6,-16.4]:
    cylinder('Cupholder recess '+str(x),[x,23.43,-24],1.65,.08,'dark')
    ring=trimesh.creation.annulus(r_min=1.44,r_max=1.72,height=.16,sections=32)
    ring.apply_transform(trimesh.transformations.rotation_matrix(np.pi/2,[1,0,0]))
    ring.apply_translation([x,23.45,-24])
    add(ring,'Metal cupholder rim '+str(x),'chrome')
box('Recline control panel',[-26.04,19.7,-25],[.25,1.5,4.1],.12,'dark')
for z in [-26,-24.4]:
    box('Control key '+str(z),[-26.19,19.8,z],[.12,.8,1],.04,'chrome')
box('USB port',[-26.2,19.6,-23.6],[.14,.37,.66],.04,'black')

polygon=np.array([[17,-57.5],[64,-57.5],[64,-10.5],[26,-10.5],[17,-19.5]])
def corner_prism(name, y, h, inset, mat):
    center=np.array([43,-35])
    poly=center+(polygon-center)*inset
    points=np.array([[x,yy,z] for yy in [y-h/2,y+h/2] for x,z in poly])
    hull=ConvexHull(points)
    mesh=hull_mesh(points,hull)
    add(mesh,name,mat)
corner_prism('Corner upholstered base',9,13,.995,'leather')
corner_prism('Corner seat cushion core',16.5,4.6,.975,'cushion')
box('Corner seat soft surface',[39.5,17.3,-33],[39,3.4,37],1.5,'cushion')
box('Corner rear shell',[36.8,23.4,-53],[39.6,34.5,8.2],2.6)
box('Corner right shell',[59.7,23.4,-34.5],[8.5,34.5,40],2.6)
box('Corner rear back cushion',[36.3,27.1,-47.6],[37.6,17.2,7.4],2.5,'cushion',-8)
box('Corner side back cushion',[54.2,27.1,-29.7],[29.8,17.2,7.4],2.5,'cushion',-8,-90)
box('Corner rear low headrest',[36.4,36.5,-51],[38.3,6.5,9],2.5,'cushion')
box('Corner side low headrest',[58,36.5,-29.8],[29.7,6.5,9],2.5,'cushion',0,-90)
for x,z in [(20,-53),(59,-53),(59,-14),(28,-16)]:
    cylinder('Corner support '+str((x,z)),[x,1.3,z],1,2.6)

# Normalize to the documented closed-state envelope, with the feet on the ground.
target=np.array([128,41,115])*INCH
bounds=scene.bounds
scale=target/(bounds[1]-bounds[0])
for geom in scene.geometry.values():
    geom.vertices=(geom.vertices-bounds[0])*scale
    geom.vertices[:,0]-=target[0]/2
    geom.vertices[:,2]-=target[2]/2
scene.export('model.glb')
loaded=trimesh.load('model.glb',force='scene')
print('Bounds in inches:',loaded.bounds/INCH)
print('Overall size in inches:',loaded.extents/INCH)
print('Faces:',sum(len(g.faces) for g in loaded.geometry.values()))

fig=plt.figure(figsize=(18,6),facecolor='#f7f6f3')
views=[('Front three-quarter',27,60),('Top-down',90,90),('Side',10,0)]
for i,(title,elev,azim) in enumerate(views):
    ax=fig.add_subplot(1,3,i+1,projection='3d')
    all_faces, all_colors = [], []
    for geom in loaded.geometry.values():
        render_vertices, render_faces = trimesh.remesh.subdivide_to_size(geom.vertices, geom.faces, max_edge=.12, max_iter=6)
        render_mesh = trimesh.Trimesh(render_vertices, render_faces, process=False)
        vertices=render_mesh.vertices[:,[0,2,1]]
        faces=vertices[render_mesh.faces]
        normals=render_mesh.face_normals[:,[0,2,1]]
        light=np.array([-.4,.5,1]); light/=np.linalg.norm(light)
        shade=.62+.38*np.clip(normals@light,0,1)
        color=np.asarray(geom.visual.material.baseColorFactor[:3])/255
        colors=np.clip(shade[:,None]*color,0,1)
        all_faces.extend(faces)
        all_colors.extend(colors)
    ax.add_collection3d(Poly3DCollection(all_faces,facecolors=all_colors,edgecolors='none',linewidths=0,antialiased=False))
    ax.set_xlim(-1.8,1.8); ax.set_ylim(-1.6,1.6); ax.set_zlim(0,1.15)
    ax.invert_xaxis()
    ax.set_box_aspect((3.6,3.2,1.15))
    ax.view_init(elev=elev,azim=azim)
    ax.set_proj_type('ortho'); ax.set_axis_off(); ax.set_title(title,pad=0)
plt.subplots_adjust(left=0,right=1,bottom=0,top=.94,wspace=0)
plt.savefig('preview.png',dpi=150,facecolor=fig.get_facecolor())
