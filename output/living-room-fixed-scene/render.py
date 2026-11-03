#!/usr/bin/env -S uv run --python 3.11 --with bpy==5.0.1 --with pillow
import argparse
import json
import math
import random
from pathlib import Path

import bpy
from mathutils import Vector
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
INCH = 0.0254
SHELL = {
    'room': [199, 204, 120],
    'tv_wall': [199, 0, 122, 120],
    'column': [62.71, 21.19, 33, 120],
    'south_glass_end': 142.71,
    'island': [75.60, 204, 146.60, 245, 36],
    'balcony_door': [151.01, 193.40],
    'office_door': [203.44, 122, 238.50],
    'recess_east': 251.84,
}
DESIGNS = [
    dict(id='01-kitchen-chaise', title='Kitchen-side chaise · pale oak', sofa=[40, 42, 82, 166], chaise=[82, 128, 112, 166], table=[106, 66, 142, 108], fabric='#bcb09a', wood='#a77b4a', rug='#c6bda9', panel='slats', lamp=[140, 20], plant=[168, 22]),
    dict(id='02-lounge-ottoman', title='Deep lounge + movable ottoman · walnut', sofa=[40, 42, 86, 162], ottoman=[109, 75, 147, 119], side=[108, 137, 126, 155], fabric='#454b4c', wood='#543524', rug='#9b9387', panel='walnut', lamp=[98, 49], plant=[165, 22]),
    dict(id='03-window-chaise', title='Window-side chaise · cream and stone', sofa=[40, 42, 82, 162], chaise=[82, 42, 112, 80], table=[106, 102, 142, 140], fabric='#d1c6b4', wood='#b78b58', rug='#ccc1ae', panel='broad', lamp=[140, 20], plant=[170, 22]),
    dict(id='04-sofa-swivel', title='Sofa + swivel chair · olive and cognac', sofa=[40, 42, 82, 162], chair=[125, 130, 161, 166], table=[105, 50, 141, 94], fabric='#92502a', wood='#775032', rug='#8a7353', panel='olive', lamp=[140, 20], plant=[168, 22]),
]


def rgba(hex_color):
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb) + (1,)


def material(name, color, roughness=.6, metal=0, texture=None):
    m = bpy.data.materials.new(name)
    m.diffuse_color = rgba(color)
    m.use_nodes = True
    n = m.node_tree.nodes
    p = n.get('Principled BSDF')
    p.inputs['Base Color'].default_value = rgba(color)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    if texture:
        tex = n.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = 130 if texture == 'fabric' else 5
        tex.inputs['Detail'].default_value = 3
        coord = n.new('ShaderNodeTexCoord')
        mapping = n.new('ShaderNodeVectorMath')
        mapping.operation = 'MULTIPLY'
        mapping.inputs[1].default_value = (3, 3, .12) if texture == 'wood' else (1, 1, 1)
        m.node_tree.links.new(coord.outputs['Generated'], mapping.inputs[0])
        m.node_tree.links.new(mapping.outputs[0], tex.inputs['Vector'])
        ramp = n.new('ShaderNodeValToRGB')
        base = rgba(color)
        ramp.color_ramp.elements[0].position = .2
        ramp.color_ramp.elements[0].color = tuple(v * .65 for v in base[:3]) + (1,)
        ramp.color_ramp.elements[1].position = .8
        ramp.color_ramp.elements[1].color = tuple(min(v * 1.25, 1) for v in base[:3]) + (1,)
        m.node_tree.links.new(tex.outputs['Fac'], ramp.inputs[0])
        m.node_tree.links.new(ramp.outputs[0], p.inputs['Base Color'])
        bump = n.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .16
        bump.inputs['Distance'].default_value = .0008 if texture == 'fabric' else .0003
        m.node_tree.links.new(tex.outputs['Fac'], bump.inputs['Height'])
        m.node_tree.links.new(bump.outputs[0], p.inputs['Normal'])
    return m


def box(name, bounds, mat, bevel=0):
    x1, y1, z1, x2, y2, z2 = bounds
    bpy.ops.mesh.primitive_cube_add(size=1, location=tuple(v * INCH for v in ((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2)))
    o = bpy.context.object
    o.name = name
    o.dimensions = ((x2 - x1) * INCH, (y2 - y1) * INCH, (z2 - z1) * INCH)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new('Soft edges within bounding box', 'BEVEL')
        mod.width = bevel * INCH
        mod.segments = 5
        o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return o


def cylinder(name, x, y, radius, bottom, height, mat, top_radius=None):
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=radius * INCH, radius2=(top_radius if top_radius is not None else radius) * INCH, depth=height * INCH, location=(x * INCH, y * INCH, (bottom + height / 2) * INCH))
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    mod = o.modifiers.new('Edge rounding', 'BEVEL')
    mod.width = .12 * INCH
    mod.segments = 3
    o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return o


def area(name, position, target, power, color, size, size_y=None):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power
    data.color = color
    data.shape = 'RECTANGLE'
    data.size = size * INCH
    data.size_y = (size_y if size_y else size) * INCH
    o = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(o)
    o.location = Vector(position) * INCH
    o.rotation_euler = (Vector(target) * INCH - o.location).to_track_quat('-Z', 'Y').to_euler()
    o.visible_camera = False
    o.visible_glossy = False
    o.visible_transmission = True


def lamp(x, y, metal, shade):
    cylinder('Lamp base', x, y, 6, 0, 1.2, metal)
    cylinder('Lamp stem', x, y, .45, 1.2, 53, metal)
    cylinder('Warm linen shade', x, y, 7, 48, 16, shade, 6)
    area('2700 K floor lamp', (x, y, 52), (x, y, 10), 32, (1, .64, .34), 8)


def plant(x, y, ceramic, greens):
    cylinder('Plant pot', x, y, 8, 0, 16, ceramic, 9)
    earth = material('Potting soil', '#28231b')
    cylinder('Soil', x, y, 8, 15, .5, earth)
    trunk = material('Plant stems', '#524531')
    random.seed(105)
    for k in range(4):
        angle = k * math.tau / 4
        bx, by = x + 3 * math.cos(angle), y + 3 * math.sin(angle)
        cylinder('Plant stem', bx, by, .35, 15, 34 + k * 4, trunk)
        for j in range(7):
            a = angle + j * 2.1
            z = 27 + j * 4.5 + k
            px, py = bx + math.cos(a) * 5, by + math.sin(a) * 5
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1, location=(px * INCH, py * INCH, z * INCH))
            o = bpy.context.object
            o.name = 'Plant leaf'
            o.scale = (4.8 * INCH, 2.2 * INCH, .45 * INCH)
            o.rotation_euler = (.2, .4, a)
            o.data.materials.append(greens[j % len(greens)])
            for p in o.data.polygons:
                p.use_smooth = True


def sofa(bounds, fabric, dark, chaise=None, chair=False):
    x1, y1, x2, y2 = bounds
    if chair:
        cylinder('Swivel chair circular base', (x1 + x2) / 2, (y1 + y2) / 2, 12, 0, 4, dark)
    else:
        for x in (x1 + 4, x2 - 4):
            for y in (y1 + 4, y2 - 4):
                cylinder('Seat foot', x, y, .7, 0, 4, dark)
    box('Upholstered sofa base', (x1, y1, 3, x2, y2, 13), fabric, 2)
    box('Sofa upholstered back', (x1, y1, 10, x1 + 9, y2, 32), fabric, 3)
    box('South rounded arm', (x1 + 4, y1, 10, x2, y1 + 7, 24), fabric, 3)
    box('North rounded arm', (x1 + 4, y2 - 7, 10, x2, y2, 24), fabric, 3)
    n = 1 if chair else 3
    span = (y2 - y1 - 14) / n
    for i in range(n):
        a, b = y1 + 7 + i * span, y1 + 7 + (i + 1) * span
        box('Seat cushion', (x1 + 9, a + .3, 13, x2 - 1, b - .3, 19), fabric, 2.2)
        box('Back cushion', (x1 + 6, a + .3, 19, x1 + 16, b - .3, 32), fabric, 3)
    if chaise:
        a, b, c, d = chaise
        box('Chaise upholstered base', (a - 1, b, 3, c, d, 13), fabric, 2)
        box('Chaise cushion', (a - 1, b + .3, 13, c, d - .3, 19), fabric, 2)
        for x in (a + 3, c - 4):
            for y in (b + 4, d - 4):
                cylinder('Chaise foot', x, y, .7, 0, 4, dark)


def table(bounds, mat, height=14):
    x1, y1, x2, y2 = bounds
    box('Coffee table top', (x1, y1, height - 3, x2, y2, height), mat, 1.4)
    box('Coffee table pedestal', (x1 + 7, y1 + 7, 0, x2 - 7, y2 - 7, height - 3), mat, 1)


def swivel(bounds, fabric, dark):
    x = (bounds[0] + bounds[2]) / 2
    y = (bounds[1] + bounds[3]) / 2
    cylinder('Swivel circular base', x, y, 12, 0, 4, dark)
    cylinder('Barrel chair upholstered base', x, y, 15, 4, 9, fabric)
    cylinder('Barrel chair seat cushion', x, y, 14.5, 13, 6, fabric)
    direction = math.atan2(61 - y, 195 - x)
    vertices, faces = [], []
    for i in range(49):
        theta = math.radians(60 + 240 * i / 48)
        a = theta + direction
        top = 24 + 8 * math.sin(math.pi * i / 48)
        for radius, z in ((18, 10), (18, top), (14, top), (14, 10)):
            vertices.append(((x + radius * math.cos(a)) * INCH, (y + radius * math.sin(a)) * INCH, z * INCH))
        if i:
            for j in range(4):
                faces.append(((i - 1) * 4 + j, (i - 1) * 4 + (j + 1) % 4, i * 4 + (j + 1) % 4, i * 4 + j))
    faces.extend(((3, 2, 1, 0), (192, 193, 194, 195)))
    mesh = bpy.data.meshes.new('Bounded 36 inch barrel chair mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(fabric)
    o = bpy.data.objects.new('36 inch swivel chair curved back', mesh)
    bpy.context.collection.objects.link(o)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    bevel = o.modifiers.new('Soft upholstered barrel edge', 'BEVEL')
    bevel.width = .5 * INCH
    bevel.segments = 4


def shell(mats):
    white, dark, wood, concrete = (mats[k] for k in ('white', 'dark', 'floor', 'concrete'))
    box('Floor foundation', (-61, -1, -2, 320, 320, -.12), wood)
    random.seed(22)
    floor_mats = [material('Oak plank ' + str(i), c, .52, texture='wood') for i, c in enumerate(('#c1a780', '#c5ad87', '#bba27c', '#cab28c', '#bfa581'))]
    for ix in range(42):
        x = ix * 8
        start = -80 + (ix % 3) * 24
        for iy in range(6):
            y = start + iy * 72
            lo, hi = max(y, 0), min(y + 71.97, 320)
            if hi > lo:
                box('Existing oak floorboard', (x, lo, -.1, x + 7.97, hi, 0), floor_mats[(ix * 3 + iy) % 5], .015)
    box('Existing ceiling', (-3, -3, 120, 320, 330, 125), white)
    box('Measured 122 inch TV wall', (199, 0, 0, 204, 122, 120), white)
    box('South opaque return', (142.71, -5, 0, 272, 0, 120), white)
    box('Office south end pier', (320, -5, 0, 331, 0, 120), white)
    box('Office east wall', (331, 0, 0, 336, 122, 120), white)
    box('Office side wall', (251.84, 122, 0, 257, 190, 120), white)
    box('Office crosswall west jamb', (199, 122, 0, 203.44, 127, 120), white)
    box('Office crosswall east jamb', (238.5, 122, 0, 251.84, 127, 120), white)
    box('Office door header', (203.44, 122, 84, 238.5, 127, 120), white)
    box('Office open door leaf', (203.44, 86.94, 0, 205, 122, 84), white, .1)
    box('Recess bath return', (199, 189.16, 0, 257, 194.16, 120), white)
    box('Kitchen-east wall', (199, 189.16, 0, 204, 330, 120), white)
    box('TV baseboard', (198.4, 0, 0, 199, 122, 5), white)
    box('South baseboard', (142.71, 0, 0, 199, .6, 5), white)
    cylinder('Structural column diameter33', 62.71, 21.19, 16.5, 0, 120, concrete)
    cylinder('Column base trim', 62.71, 21.19, 16.8, 0, 3.8, white)
    glass = material('Clear existing glazing', '#e4eff5', .005)
    p = glass.node_tree.nodes.get('Principled BSDF')
    p.inputs['Transmission Weight'].default_value = 1
    p.inputs['IOR'].default_value = 1.45
    nodes = glass.node_tree.nodes
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    transparent.inputs[0].default_value = (.97, .99, 1, 1)
    mix = nodes.new('ShaderNodeMixShader')
    mix.inputs[0].default_value = .025
    glass.node_tree.links.new(transparent.outputs[0], mix.inputs[1])
    glass.node_tree.links.new(p.outputs[0], mix.inputs[2])
    glass.node_tree.links.new(mix.outputs[0], nodes.get('Material Output').inputs['Surface'])
    box('Office existing south window', (272, -.18, 0, 320, 0, 120), glass)
    for y1, y2 in ((0, 151.01), (193.40, 255)):
        box('West glazing', (-.18, y1, 0, 0, y2, 120), glass)
    box('West balcony glazed door', (-.18, 151.01, 0, 0, 193.40, 120), glass)
    for y in (0, 50.34, 100.67, 151.01, 193.40, 242):
        box('West fixed mullion', (-1, y - 1, 0, 1, y + 1, 120), dark)
    for z in (0, 100, 118):
        box('West frame horizontal', (-1, 0, z, 1, 255, z + 2), dark)
    box('West door handle', (1, 185, 39, 2, 191, 40), dark, .3)
    box('South glazing', (0, -.18, 0, 142.71, 0, 120), glass)
    for x in (0, 48, 96, 142.71):
        box('South 48 inch mullion', (x - 1, -1, 0, x + 1, 1, 120), dark)
    for z in (0, 100, 118):
        box('South frame horizontal', (0, -1, z, 142.71, 1, z + 2), dark)
    box('Balcony slab', (-61, -1, -4, 0, 206, 0), concrete)
    for y in (0, 204):
        box('Balcony rail cap', (-61, y, 42, 0, y + 1, 43), dark)
    box('Balcony exterior railing', (-62, 0, 42, -61, 206, 43), dark)
    box('Balcony glass railing', (-62, 0, 0, -61.8, 206, 42), glass)
    box('Original island cabinet', (76.6, 205, 0, 145.6, 244, 34.7), mats['kitchen'], .1)
    box('Original 71 by41 island top', (75.6, 204, 34.7, 146.6, 245, 36), mats['stone'], .3)
    for x in (75.6, 145.3):
        box('Island waterfall end', (x, 204, 0, x + 1.3, 245, 35), mats['stone'], .15)
    for x in (95, 128):
        cylinder('Original pendant cord', x, 225, .13, 84, 36, dark)
        cylinder('Original kitchen pendant shade', x, 225, 8, 76, 8, white, 4)
        area('Existing kitchen pendant', (x, 225, 78), (x, 225, 0), 30, (1, .71, .43), 8)
    box('Existing switch plate', (198.6, 114.25, 45, 199, 116.75, 49.5), white, .15)
    box('Existing light switch', (198.1, 115, 46, 198.6, 116, 48), white, .1)
    alarm = cylinder('Existing smoke alarm', 0, 0, 2.6, 0, 1, white)
    alarm.rotation_euler.y = math.pi / 2
    alarm.location = (198.4 * INCH, 94 * INCH, 105 * INCH)
    box('Existing outlet data plates', (198.4, 59, 13.75, 199, 67, 18.25), white)
    cylinder('Existing fan stem', 100, 77, .6, 109, 11, dark)
    cylinder('Existing fan motor', 100, 77, 4, 106, 4, dark)
    for i in range(5):
        a = i * math.tau / 5
        o = box('Existing ceiling fan blade', (102, 74, 109, 125, 80, 109.6), dark, .5)
        # Rotate the blade around the fan axis, not its own center.
        from mathutils import Matrix
        o.matrix_world = Matrix.Translation(Vector((100, 77, 109)) * INCH) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation(-Vector((100, 77, 109)) * INCH) @ o.matrix_world
    glow = material('Fan light diffuser', '#fff1d4')
    p = glow.node_tree.nodes.get('Principled BSDF')
    p.inputs['Emission Color'].default_value = (1, .74, .46, 1)
    p.inputs['Emission Strength'].default_value = 2
    cylinder('Fan light', 100, 77, 3.6, 104.5, 1.5, glow)
    area('Existing fan light', (100, 77, 105), (100, 77, 0), 40, (1, .72, .45), 10)


def outside():
    m = bpy.data.materials.new('Actual neighboring tower photograph')
    m.use_nodes = True
    n = m.node_tree.nodes
    n.clear()
    out = n.new('ShaderNodeOutputMaterial')
    emission = n.new('ShaderNodeEmission')
    emission.inputs['Strength'].default_value = .8
    img = n.new('ShaderNodeTexImage')
    img.image = bpy.data.images.load(str(REPO / 'listing/photos/unit/view-neighboring-tower-1.jpg'))
    m.node_tree.links.new(img.outputs['Color'], emission.inputs['Color'])
    m.node_tree.links.new(emission.outputs[0], out.inputs[0])
    for loc, rotation in (((70, -130, 95), (math.pi / 2, 0, 0)), ((-150, 90, 95), (math.pi / 2, 0, math.pi / 2))):
        bpy.ops.mesh.primitive_plane_add(size=2, location=Vector(loc) * INCH, rotation=rotation)
        o = bpy.context.object
        o.name = 'Exterior photo context only'
        o.scale = (235 * INCH, 200 * INCH, 1)
        o.data.materials.append(m)
        for uv in o.data.uv_layers.active.data:
            uv.uv.x = .11 + uv.uv.x * .89
    area('South daylight', (85, -100, 230), (100, 95, 35), 1500, (.88, .91, 1), 135, 100)
    area('West daylight', (-100, 90, 210), (130, 100, 30), 1800, (1, .88, .72), 165, 90)


def furniture(d, m):
    wood = material('Selected console wood', d['wood'], .42, texture='wood')
    fabric = material('Selected sofa upholstery', d['fabric'], .86, texture='fabric')
    if d['panel'] == 'olive':
        fabric.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .4
    rug = material('Woven wool rug', d['rug'], .96, texture='fabric')
    box('Area rug', (30, 40, .1, 174, 174, .4), rug, .1)
    sofa(d['sofa'], fabric, m['dark'], d.get('chaise'))
    if 'chair' in d:
        swivel(d['chair'], material('Olive swivel chair upholstery', '#697054', .9, texture='fabric'), m['dark'])
    if 'table' in d:
        table(d['table'], m['stone'] if d['panel'] == 'broad' else wood)
    if 'ottoman' in d:
        a, b, c, e = d['ottoman']
        box('Movable upholstered ottoman', (a, b, 2, c, e, 18), fabric, 3)
        box('Ottoman removable wood tray', (a + 7, b + 9, 18, c - 7, e - 9, 19), wood, .4)
    if 'side' in d:
        table(d['side'], wood, 20)
    if d['panel'] == 'slats':
        box('Slat backing', (197.6, 0, 5, 199, 110, 98), wood)
        for i in range(55):
            box('Vertical oak slat', (197.0, i * 2, 5, 197.6, i * 2 + 1.2, 98), wood, .08)
    elif d['panel'] == 'walnut':
        for i in range(4):
            box('Broad walnut panel', (198, i * 27.5, 5, 199, (i + 1) * 27.5 - .12, 99), wood, .05)
    elif d['panel'] == 'broad':
        box('Broad oak panel tall', (198, 0, 5, 199, 49.8, 98), wood, .07)
        box('Broad oak panel low', (198, 50.1, 5, 199, 110, 86), wood, .07)
    else:
        olive = material('Olive plaster', '#68694f', .9, texture='fabric')
        box('Olive plaster TV wall', (198.9, 0, 5, 199, 122, 120), olive)
        box('Oak south accent', (198, 0, 5, 198.9, 14, 100), wood)
    box('Floating console envelope', (181, 6, 9, 197, 116, 21), wood, .35)
    for i in range(4):
        y = 6 + i * 27.5
        box('Console flush door', (180.7, y + .07, 9.1, 181, y + 27.43, 20.9), wood, .05)
    screen = material('TV dark reflective screen', '#10161a', .21, .25)
    box('98 inch TV outer panel', (194.5, 18.1, 27, 197, 103.9, 75), m['dark'], .12)
    box('98 inch TV screen', (194.43, 18.45, 27.35, 194.5, 103.55, 74.65), screen, .04)
    box('Soundbar on console', (185, 37, 21, 190, 85, 24), m['speaker'], .45)
    led = material('Warm underside LED', '#ffe5b0')
    p = led.node_tree.nodes.get('Principled BSDF')
    p.inputs['Emission Color'].default_value = (1, .57, .22, 1)
    p.inputs['Emission Strength'].default_value = 5
    box('Console underside LED', (183, 9, 8.95, 183.5, 113, 9), led)
    area('Console warm wash', (183, 61, 8.5), (176, 61, 0), 10, (1, .58, .25), 100, 1)
    lamp(*d['lamp'], m['metal'], m['linen'])
    plant(*d['plant'], m['ceramic'], [m['green1'], m['green2']])


def validate(d):
    x1, y1, x2, y2 = d['sofa']
    checks = {'island_to_sofa': 204 - y2, 'west_route': x1, 'column_to_sofa': y1 - 37.69, 'tv_side_margin': (122 - 85.8) / 2, 'console_side_margin': 6, 'soundbar_gap': 3, 'office_route': 36}
    assert checks['island_to_sofa'] >= 36 and checks['west_route'] >= 36
    assert checks['column_to_sofa'] > 0
    footprints = {'sofa': d['sofa']}
    for key in ('chaise', 'table', 'ottoman', 'chair', 'side'):
        if key in d:
            footprints[key] = d[key]
    lx, ly = d['lamp']
    footprints['lamp'] = [lx - 7, ly - 7, lx + 7, ly + 7]
    px, py = d['plant']
    footprints['plant_pot'] = [px - 9, py - 9, px + 9, py + 9]
    footprints['console'] = [180.7, 6, 197, 116]
    items = list(footprints.items())
    for i, (an, a) in enumerate(items):
        assert a[0] >= 0 and a[2] <= 199 and a[1] >= 0 and a[3] <= 204, an
        assert not (a[2] > 163 and a[3] > 122), f'Office route: {an}'
        for bn, b in items[i + 1:]:
            overlap = min(a[2], b[2]) - max(a[0], b[0]) > .01 and min(a[3], b[3]) - max(a[1], b[1]) > .01
            assert not overlap, f'Furniture collision: {an} / {bn}'
    if 'table' in d:
        checks['sofa_table'] = d['table'][0] - x2
        assert checks['sofa_table'] >= 18
    checks['east_clearance_above_tv_wall'] = 199 - max(r[2] for r in footprints.values() if r[3] > 122)
    if 'chair' in d:
        checks['sofa_chair_gap'] = d['chair'][0] - x2
        checks['table_chair_cross_route'] = d['chair'][1] - d['table'][3]
        checks['island_to_chair'] = 204 - d['chair'][3]
        assert checks['sofa_chair_gap'] >= 36 and checks['table_chair_cross_route'] >= 36
    return footprints, checks


def schedule(d, footprints, checks):
    heights = dict(sofa=32, chaise=19, chair=32, table=14, ottoman=19, side=20, lamp=64, plant_pot=16, console='9–21')
    rows = '\n'.join(f'| {name} | {rect} | {heights[name]} |' for name, rect in footprints.items())
    text = f"""# {d['title']}

This schedule is written and checked before rendering. All dimensions are inches. Origin: southwest glass corner; x east, y north, z up.

## Immutable geometry

- Living room: 199 × 204, ceiling 120. East TV wall: x199, y0–122, height120.
- Concrete column: diameter33, center (62.71,21.19), height120.
- South glass ends at x142.71; opaque living-room return56.29.
- Kitchen island: 71 × 41, x75.60–146.60, y204–245, top36.
- West balcony opening: y151.01–193.40, opens outward. Balcony nominal61 × 206.
- Office door: on perpendicular east-west cross-wall at y122, x203.44–238.50; opens south into office. Recess east edge251.84, north return189.16.
- Existing switch: y115.5, bottom45. Alarm: y94, z105. Outlet/data: y63, z16. Controls remain exposed and accessible.
- Existing fan, white ceiling, pale oak floor, black glazing frames, island and kitchen pendants remain in the model.

Measured: room spans, TV wall, column diameter, island size and fixture offsets. Calibrated trace: column center, glass return, balcony opening and recess width. Reconciliation assumption: office cross-wall anchored at measured TV-wall north end122; resulting unmeasured landing depth67.16. Mullions, fan and pendant positions are approximate. The island13′3″ note has unspecified endpoints and is not used as a second exact anchor. Exterior photograph is context only.

## Every added furnishing

Footprint columns are [x1,y1,x2,y2]. Sofa and chaise meet at their module seam. All other hard furniture footprints are disjoint.

| Item | Footprint | Overall height / elevation |
| --- | --- | --- |
{rows}

- TV: nominal98-inch class,85.8 wide ×48 high, y18.1–103.9, z27–75, depth2.5.
- Soundbar:48 ×5 ×3, centered on the console, z21–24.
- Floating console:110 along y, depth16.3 including fronts, y6–116, frontx180.7, rear197, z9–21. Rear mounting gap accommodates the wood treatment and cables.
- Rug:144 ×134, x30–174, y40–174, z0.1–0.4.
- Floor lamp:14-inch shade diameter,64 total height,12-inch base diameter,0.9-inch stem; warm2700K light.
- Plant:18-inch pot diameter,16-inch pot height; foliage bounded approximately26 diameter and64 total height.
- Wood treatment: TV-wall only, ending at y110 and height98/99, below the alarm and before the switch. Olive option paints the full122 ×115 wall surface, retains exposed fixtures and uses a14-inch oak strip ending at z100.
- Furniture colors, exact panel construction and all coordinates are in scene.json and render.py. The generic proposed furniture sizes are not retailer product guarantees.

## Numeric fit checks

```json
{json.dumps(checks, indent=2)}
```

The4.31-inch column/sofa gap is separation, not a walkway. Use the40-inch west bypass. The reserved office route x163–199, y>122 is empty. For the chair plan, the checked passages are43 between sofa and chair,36 between table and chair,38 east of chair and38 to the island.

## Camera and rendering

Fixed kitchen-side camera (48,250,68), horizontal target (115,80,68), lens20.5mm on36mm sensor, vertical lens shift−0.18. Image1600 ×1100, straight verticals. Same camera and shell for all designs. East TV wall is image LEFT; west glazing and sofa are RIGHT. The original island remains in the foreground and causes physically correct occlusion.

Actual Blender mesh dimensions, footprint collisions and camera projection checks are exported to validation.json before rendering. Editable scene.blend contains the geometry and packed exterior texture. See inspection.md for final picture-by-picture findings and source uncertainties.
"""
    (ROOT / d['id'] / 'dimensions.md').write_text(text)


def plan(d, footprints):
    scale = 3
    im = Image.new('RGB', (1040, 1050), '#f5f2eb')
    dr = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 18)
        small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 15)
    except OSError:
        font = small = ImageFont.load_default()
    def pt(x, y):
        return (int(220 + x * scale), int(840 - y * scale))
    def line(a, b, color='#383a38', width=5):
        dr.line([pt(*a), pt(*b)], fill=color, width=width)
    dr.text((40, 25), d['title'], fill='#272923', font=font)
    dr.text((40, 56), 'Measured model · all dimensions in inches · north/kitchen at top', fill='#5e625a', font=small)
    dr.rectangle([pt(-1, 245), pt(252, -1)], fill='#e6ddcc')
    dr.rectangle([pt(-61, 206), pt(0, 0)], fill='#d7d8d1', outline='#949b94', width=2)
    dr.text(pt(-56, 115), 'Balcony', fill='#444a43', font=small)
    dr.text(pt(-56, 105), '61″ wide', fill='#444a43', font=small)
    line((199, 0), (199, 122), width=10)
    line((142.71, 0), (252, 0), width=10)
    line((199, 122), (203.44, 122), width=8)
    line((238.5, 122), (251.84, 122), width=8)
    line((251.84, 122), (251.84, 189.16), width=8)
    line((199, 189.16), (251.84, 189.16), width=8)
    line((203.44, 122), (203.44, 86.94), width=3)
    line((0, 0), (142.71, 0), '#5e9baf', 5)
    line((0, 0), (0, 151.01), '#5e9baf', 5)
    line((0, 193.40), (0, 245), '#5e9baf', 5)
    line((0, 151.01), (-42.39, 151.01), '#5e9baf', 3)
    c = SHELL['column']
    dr.ellipse([pt(c[0] - 16.5, c[1] + 16.5), pt(c[0] + 16.5, c[1] - 16.5)], fill='#a8a49c', outline='#656660', width=2)
    dr.text(pt(45, 25), 'Ø33', fill='#252723', font=small)
    dr.rectangle([pt(75.6, 245), pt(146.6, 204)], fill='#eee8dc', outline='#8b806c', width=3)
    dr.text(pt(83, 230), '71 × 41 island', fill='#42433a', font=small)
    dr.rectangle([pt(30, 174), pt(174, 40)], fill='#d2c6ad')
    for name, r in footprints.items():
        color = d['fabric'] if name in ('sofa', 'chaise', 'ottoman', 'chair') else d['wood']
        if name == 'chair':
            color = '#697054'
        if name == 'plant_pot':
            color = '#638156'
        if name == 'lamp':
            color = '#baa05b'
        dr.rounded_rectangle([pt(r[0], r[3]), pt(r[2], r[1])], radius=8, fill=color, outline='#4d4c42', width=2)
        text = name.replace('_pot', '')
        dr.text(pt(r[0] + 2, r[3] - 5), text, fill='#ffffff' if name in ('sofa', 'console', 'chair') else '#26271e', font=small)
    line((194.5, 18.1), (194.5, 103.9), '#080c0d', 7)
    dr.text(pt(204, 64), '98″ TV', fill='#171a15', font=font)
    dr.text(pt(205, 154), 'Office recess', fill='#32372e', font=small)
    line((0, -17), (199, -17), width=1)
    dr.text(pt(75, -23), '199″ / 16′7″', fill='#252823', font=font)
    dr.text((45, 600), 'Room: 204″', fill='#252823', font=font)
    dr.text((45, 625), '17′0″', fill='#252823', font=font)
    dr.text((40, 965), 'Blue = existing glazing. Office door is perpendicular to the TV wall.', fill='#3d443c', font=small)
    dr.text((40, 991), 'Trace-derived positions and reconciled recess dimensions remain approximate.', fill='#686b60', font=small)
    im.save(ROOT / d['id'] / 'plan.png')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--design', type=int, default=1, choices=range(1, 5))
    ap.add_argument('--draft', action='store_true')
    ap.add_argument('--validate-only', action='store_true')
    args = ap.parse_args()
    d = DESIGNS[args.design - 1]
    dest = ROOT / d['id']
    dest.mkdir(parents=True, exist_ok=True)
    footprints, checks = validate(d)
    schedule(d, footprints, checks)
    plan(d, footprints)
    (dest / 'scene.json').write_text(json.dumps(dict(shell=SHELL, design=d, footprints=footprints, checks=checks), indent=2) + '\n')
    if args.validate_only:
        print(json.dumps(checks))
        return
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    m = dict(white=material('Existing warm white', '#eeeae0'), dark=material('Black anodized frames', '#252a2c', .38, .4), floor=material('Existing oak', '#c7ad86'), concrete=material('Existing concrete', '#b8b7b0', .93, texture='fabric'), kitchen=material('Existing kitchen pale oak', '#b29b78', .55, texture='wood'), stone=material('Warm travertine', '#c0ac89', .65, texture='wood'), speaker=material('Soundbar textile', '#1a1d1e', .9, texture='fabric'), metal=material('Lamp brushed bronze', '#a98648', .3, .7), linen=material('Warm linen shade', '#e8d8ae', .8, texture='fabric'), ceramic=material('Matte ceramic pot', '#b2a38d', .9), green1=material('Plant green', '#36522c', .7), green2=material('Plant lighter green', '#59743c', .7))
    shell(m)
    outside()
    furniture(d, m)
    scene = bpy.context.scene
    world = bpy.data.worlds.new('Soft daylight world')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.6, .7, .85, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .25
    camera_data = bpy.data.cameras.new('Fixed kitchen camera')
    camera = bpy.data.objects.new('Fixed kitchen camera', camera_data)
    scene.collection.objects.link(camera)
    camera.location = Vector((48, 250, 68)) * INCH
    camera.rotation_euler = (Vector((115, 80, 68)) * INCH - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.lens = 20.5
    camera_data.shift_y = -.18
    camera_data.sensor_width = 36
    camera_data.clip_start = .01
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 12 if args.draft else 48
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.cycles.transparent_max_bounces = 6
    scene.render.resolution_x = 1000 if args.draft else 1600
    scene.render.resolution_y = 688 if args.draft else 1100
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(dest / ('draft.png' if args.draft else 'render.png'))
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = .7
    bpy.context.view_layer.update()
    from bpy_extras.object_utils import world_to_camera_view
    metrics = {}
    for name in ('Measured 122 inch TV wall', '98 inch TV outer panel', 'Floating console envelope', 'Structural column diameter33', 'Original 71 by41 island top'):
        o = bpy.data.objects[name]
        corners = [o.matrix_world @ Vector(c) for c in o.bound_box]
        metrics[name] = dict(dimensions_inches=[round(v / INCH, 4) for v in o.dimensions], corners_ndc=[list(world_to_camera_view(scene, camera, p)) for p in corners])
    expected = {'Measured 122 inch TV wall': [5, 122, 120], '98 inch TV outer panel': [2.5, 85.8, 48], 'Floating console envelope': [16, 110, 12], 'Structural column diameter33': [33, 33, 120], 'Original 71 by41 island top': [71, 41, 1.3]}
    for name, dims in expected.items():
        assert all(abs(a - b) < .001 for a, b in zip(metrics[name]['dimensions_inches'], dims)), name
    visibility = {}
    for name, bounds in footprints.items():
        x1, y1, x2, y2 = bounds
        height = 64 if name in ('lamp', 'plant_pot') else 32
        points = [world_to_camera_view(scene, camera, Vector((x, y, z)) * INCH) for x in (x1, x2) for y in (y1, y2) for z in (0, height)]
        visibility[name] = all(0 <= p.x <= 1 and 0 <= p.y <= 1 and p.z > 0 for p in points)
        if not visibility[name]:
            print(name, [(round(p.x, 3), round(p.y, 3)) for p in points], flush=True)
    assert all(visibility.values()), f'Furniture outside camera: {visibility}'
    (dest / 'validation.json').write_text(json.dumps(dict(checks=checks, model=metrics, inside_frame=visibility, camera=dict(position=[48, 250, 68], target=[115, 80, 68], shift_y=-.18, lens_mm=20.5)), indent=2) + '\n')
    print('PRE-RENDER VALIDATION:', json.dumps(checks), flush=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(dest / 'scene.blend'))
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
