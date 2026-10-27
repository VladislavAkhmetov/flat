"""
Blender Headless Pipeline for 3D Floor Plan Baking & 360° Virtual Tour
Usage:
  blender -b -P scripts/blender_bake_pipeline.py -- --scene scene.json --output ./dist --mode both
"""

import sys
import os
import json
import math
import argparse

try:
    import bpy
    import mathutils
except ImportError:
    print("[Error] This script must be executed inside Blender via `blender -b -P blender_bake_pipeline.py -- ...`")
    sys.exit(1)


def parse_args():
    # Split args after '--'
    if "--" in sys.argv:
        args_idx = sys.argv.index("--") + 1
        custom_args = sys.argv[args_idx:]
    else:
        custom_args = []

    parser = argparse.ArgumentParser(description="Bake 3D scene and render 360 panoramas in Blender Headless")
    parser.add_argument("--scene", required=True, help="Path to input scene JSON file")
    parser.add_argument("--output", required=True, help="Directory to save baked artifacts")
    parser.add_argument("--mode", default="both", choices=["both", "glb", "panoramas"], help="Baking mode")
    parser.add_argument("--samples", type=int, default=128, help="Cycles render samples")
    parser.add_argument("--pano-res", type=int, default=2048, help="360 panorama width (height will be width / 2)")
    return parser.parse_args(custom_args)


def configure_cycles(samples=128):
    """Configure Blender Cycles engine for maximum GPU performance (CUDA/OptiX) with Denoise"""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    
    # Cycles settings
    cycles = scene.cycles
    cycles.samples = samples
    cycles.preview_samples = 32
    cycles.use_denoising = True
    cycles.denoiser = 'OPENIMAGEDENOISE'
    cycles.max_bounces = 6
    cycles.diffuse_bounces = 4
    cycles.glossy_bounces = 4
    cycles.transmission_bounces = 6
    cycles.transparent_max_bounces = 8
    
    # Configure Hardware
    preferences = bpy.context.preferences
    cycles_prefs = preferences.addons['cycles'].preferences
    
    # Try CUDA or OptiX
    cuda_found = False
    for dev_type in ['CUDA', 'OPTIX']:
        try:
            cycles_prefs.compute_device_type = dev_type
            cycles_prefs.get_devices()
            devices = cycles_prefs.devices
            for d in devices:
                if d.type in ['CUDA', 'OPTIX']:
                    d.use = True
                    cuda_found = True
                    print(f"[Blender GPU] Enabled device: {d.name} ({dev_type})")
            if cuda_found:
                scene.cycles.device = 'GPU'
                break
        except Exception as e:
            print(f"[Blender GPU] Failed to init {dev_type}: {e}")
            
    if not cuda_found:
        print("[Blender GPU] No CUDA/OptiX GPU device found or fallback to CPU.")
        scene.cycles.device = 'CPU'
        cycles.threads_mode = 'AUTO'


def clean_scene():
    """Remove default cube, lights and cameras"""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)
    for block in bpy.data.lights:
        bpy.data.lights.remove(block)
    for block in bpy.data.cameras:
        bpy.data.cameras.remove(block)


def create_pbr_material(name, color=(0.9, 0.9, 0.9, 1.0), roughness=0.5, metallic=0.0, emission=(0, 0, 0, 1.0), emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    
    nodes.clear()
    node_out = nodes.new(type='ShaderNodeOutputMaterial')
    node_bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
    
    node_bsdf.inputs['Base Color'].default_value = color
    node_bsdf.inputs['Roughness'].default_value = roughness
    node_bsdf.inputs['Metallic'].default_value = metallic
    
    if emission_strength > 0:
        node_bsdf.inputs['Emission Color'].default_value = emission
        node_bsdf.inputs['Emission Strength'].default_value = emission_strength
        
    links.new(node_bsdf.outputs['BSDF'], node_out.inputs['Surface'])
    return mat


def create_glass_material():
    mat = bpy.data.materials.new(name="Glass")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    
    nodes.clear()
    node_out = nodes.new(type='ShaderNodeOutputMaterial')
    node_bsdf = nodes.new(type='ShaderNodeBsdfGlass')
    node_bsdf.inputs['IOR'].default_value = 1.45
    node_bsdf.inputs['Roughness'].default_value = 0.05
    node_bsdf.inputs['Color'].default_value = (0.95, 0.98, 1.0, 1.0)
    
    links.new(node_bsdf.outputs['BSDF'], node_out.inputs['Surface'])
    return mat


def hex_to_rgb(hex_str, alpha=1.0):
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 6:
        r = int(hex_str[0:2], 16) / 255.0
        g = int(hex_str[2:4], 16) / 255.0
        b = int(hex_str[4:6], 16) / 255.0
        # sRGB to linear conversion for Blender
        r = r ** 2.2
        g = g ** 2.2
        b = b ** 2.2
        return (r, g, b, alpha)
    return (0.8, 0.8, 0.8, alpha)


def build_walls_and_openings(scene_data, wall_mat, glass_mat, frame_mat):
    """Builds wall geometry from nodes, edges and cutout openings"""
    nodes_map = {n['id']: n for n in scene_data.get('nodes', [])}
    edges = scene_data.get('edges', [])
    openings = scene_data.get('openings', [])
    
    wall_height_default = 2.7
    
    for edge in edges:
        start_node = nodes_map.get(edge['startNodeId'])
        end_node = nodes_map.get(edge['endNodeId'])
        if not start_node or not end_node:
            continue
            
        x1, y1 = start_node['x'], start_node['y']
        x2, y2 = end_node['x'], end_node['y']
        thickness = edge.get('thickness', 0.15)
        height = edge.get('height', wall_height_default)
        
        dx = x2 - x1
        dy = y2 - y1
        length = math.hypot(dx, dy)
        if length < 0.05:
            continue
            
        angle = math.atan2(dy, dx)
        
        # Check openings on this wall
        wall_openings = [o for o in openings if o.get('wallId') == edge['id']]
        wall_openings.sort(key=lambda o: o.get('t', 0.5))
        
        # Subdivide wall along length
        segments = []
        last_t = 0.0
        for op in wall_openings:
            w = op.get('width', 0.9)
            norm_w = w / length
            t_center = op.get('t', 0.5)
            t0 = max(0.0, t_center - norm_w / 2)
            t1 = min(1.0, t_center + norm_w / 2)
            
            if t0 > last_t:
                segments.append((last_t, t0, False, None))
            segments.append((t0, t1, True, op))
            last_t = t1
            
        if last_t < 1.0:
            segments.append((last_t, 1.0, False, None))
            
        # Build 3D segments
        for seg in segments:
            t0, t1, is_op, op_data = seg
            seg_len = (t1 - t0) * length
            if seg_len <= 0.001:
                continue
                
            seg_center_t = (t0 + t1) / 2
            cx = x1 + dx * seg_center_t
            cy = y1 + dy * seg_center_t
            
            if not is_op:
                # Solid wall block
                bpy.ops.mesh.primitive_cube_add(
                    size=1.0,
                    location=(cx, cy, height / 2.0),
                    rotation=(0, 0, angle)
                )
                cube = bpy.context.active_object
                cube.scale = (seg_len, thickness, height)
                cube.name = f"Wall_{edge['id']}"
                cube.data.materials.append(wall_mat)
                bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            else:
                op_h = op_data.get('height', 2.0)
                sill_h = op_data.get('sillHeight', 0.0)
                kind = op_data.get('kind', 'door')
                
                # Top Lintel (above opening)
                lintel_h = height - (sill_h + op_h)
                if lintel_h > 0.05:
                    lintel_z = sill_h + op_h + lintel_h / 2.0
                    bpy.ops.mesh.primitive_cube_add(
                        size=1.0,
                        location=(cx, cy, lintel_z),
                        rotation=(0, 0, angle)
                    )
                    lintel = bpy.context.active_object
                    lintel.scale = (seg_len, thickness, lintel_h)
                    lintel.name = f"Lintel_{edge['id']}"
                    lintel.data.materials.append(wall_mat)
                    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
                    
                # Bottom Sill (below window)
                if sill_h > 0.05:
                    sill_z = sill_h / 2.0
                    bpy.ops.mesh.primitive_cube_add(
                        size=1.0,
                        location=(cx, cy, sill_z),
                        rotation=(0, 0, angle)
                    )
                    sill = bpy.context.active_object
                    sill.scale = (seg_len, thickness, sill_h)
                    sill.name = f"Sill_{edge['id']}"
                    sill.data.materials.append(wall_mat)
                    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
                    
                # Glass / Frame for Window
                if 'window' in kind:
                    glass_z = sill_h + op_h / 2.0
                    bpy.ops.mesh.primitive_cube_add(
                        size=1.0,
                        location=(cx, cy, glass_z),
                        rotation=(0, 0, angle)
                    )
                    glass = bpy.context.active_object
                    glass.scale = (seg_len * 0.98, thickness * 0.2, op_h * 0.96)
                    glass.name = f"Glass_{edge['id']}"
                    glass.data.materials.append(glass_mat)
                    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
                    
                    # Window Frame
                    bpy.ops.mesh.primitive_cube_add(
                        size=1.0,
                        location=(cx, cy, glass_z),
                        rotation=(0, 0, angle)
                    )
                    frame = bpy.context.active_object
                    frame.scale = (seg_len, thickness * 0.5, op_h)
                    frame.name = f"WindowFrame_{edge['id']}"
                    frame.data.materials.append(frame_mat)
                    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def build_floor_and_ceiling(scene_data, floor_mat, ceiling_mat):
    """Builds floor plane and ceiling plane based on bounding box of nodes"""
    nodes = scene_data.get('nodes', [])
    if not nodes:
        return
        
    xs = [n['x'] for n in nodes]
    ys = [n['y'] for n in nodes]
    
    min_x, max_x = min(xs) - 0.5, max(xs) + 0.5
    min_y, max_y = min(ys) - 0.5, max(ys) + 0.5
    
    width = max_x - min_x
    depth = max_y - min_y
    cx = (min_x + max_x) / 2
    cy = (min_y + max_y) / 2
    
    # Floor
    bpy.ops.mesh.primitive_plane_add(
        size=1.0,
        location=(cx, cy, 0.0)
    )
    floor = bpy.context.active_object
    floor.scale = (width, depth, 1.0)
    floor.name = "Floor"
    floor.data.materials.append(floor_mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    
    # Ceiling (named "Ceiling" so viewer can hide it in orbit view and show in walk mode)
    bpy.ops.mesh.primitive_plane_add(
        size=1.0,
        location=(cx, cy, 2.7)
    )
    ceiling = bpy.context.active_object
    ceiling.scale = (width, depth, 1.0)
    ceiling.name = "Ceiling"
    ceiling.data.materials.append(ceiling_mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

FURNITURE_LIB_DIR = os.path.abspath(r"D:\dev\flat\assets\furniture_library")


def import_furniture_asset(cat_id, pos, rot_y):
    """Attempts to load high-poly GLB furniture model and position/rotate it"""
    if not os.path.exists(FURNITURE_LIB_DIR):
        return False
        
    asset_file = os.path.join(FURNITURE_LIB_DIR, f"{cat_id}.glb")
    if not os.path.exists(asset_file):
        alias_map = {
            'bed': 'bed_double',
            'sofa': 'sofa_3',
            'table': 'table_dining',
            'chair': 'chair_dining',
            'tv': 'tv_stand',
            'wardrobe': 'wardrobe',
            'kitchen': 'kitchen_set',
            'bath': 'bath',
            'toilet': 'toilet',
            'sink': 'sink',
            'refrigerator': 'refrigerator',
            'stove': 'stove'
        }
        for k, v in alias_map.items():
            if k in cat_id.lower():
                alt_file = os.path.join(FURNITURE_LIB_DIR, f"{v}.glb")
                if os.path.exists(alt_file):
                    asset_file = alt_file
                    break

    if not os.path.exists(asset_file):
        return False

    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.import_scene.gltf(filepath=asset_file)
    imported_objs = bpy.context.selected_objects
    if not imported_objs:
        return False

    bx = pos.get('x', 0)
    by = pos.get('z', 0)
    bz = pos.get('y', 0)

    # If multiple mesh primitives in model, attach to empty root
    if len(imported_objs) > 1:
        bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
        root = bpy.context.active_object
        root.name = f"AssetRoot_{cat_id}"
        for o in imported_objs:
            o.parent = root
        parent_obj = root
    else:
        parent_obj = imported_objs[0]

    parent_obj.location = (bx, by, bz)
    parent_obj.rotation_euler = (0, 0, rot_y)
    return True


def build_furniture_objects(scene_data):
    """Places high-poly PBR furniture assets or falls back to procedural meshes"""
    objects = scene_data.get('objects', [])
    
    wood_oak = create_pbr_material("FurnOak", color=hex_to_rgb("#7A5230"), roughness=0.35)
    wood_dark = create_pbr_material("FurnWalnut", color=hex_to_rgb("#3D2718"), roughness=0.35)
    fabric_navy = create_pbr_material("FurnNavyFabric", color=hex_to_rgb("#324253"), roughness=0.8)
    fabric_linen = create_pbr_material("FurnLinen", color=hex_to_rgb("#EDE8DF"), roughness=0.85)
    leather_cognac = create_pbr_material("FurnLeather", color=hex_to_rgb("#8A4E24"), roughness=0.45)
    metal_dark = create_pbr_material("FurnMetalDark", color=hex_to_rgb("#181B1E"), roughness=0.25, metallic=0.8)
    screen_mat = create_pbr_material("TVScreen", color=hex_to_rgb("#0A0C0E"), roughness=0.1, metallic=0.2)
    ceramic_white = create_pbr_material("CeramicWhite", color=hex_to_rgb("#F9F9FB"), roughness=0.15)
    kitchen_cabinet = create_pbr_material("KitchenCabinet", color=hex_to_rgb("#2A333D"), roughness=0.4)
    countertop_marble = create_pbr_material("CountertopMarble", color=hex_to_rgb("#E8ECF0"), roughness=0.2)
    
    for obj in objects:
        cat_id = obj.get('catalogId', '')
        pos = obj.get('pos', {'x': 0, 'y': 0, 'z': 0})
        bx = pos.get('x', 0)
        by = pos.get('z', 0)
        bz = pos.get('y', 0)
        rot_y = -obj.get('rot', 0)
        
        # 1. Try to load high-quality GLB asset from furniture library
        if import_furniture_asset(cat_id, pos, rot_y):
            continue
            
        # 2. Procedural fallback if model not in library
        if 'bed' in cat_id:
            w, d, h = (1.8, 2.1, 0.55) if 'double' in cat_id else (1.0, 2.1, 0.55)
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, bz + h / 2.0), rotation=(0, 0, rot_y))
            frame = bpy.context.active_object
            frame.scale = (w, d, h)
            frame.name = f"BedFrame_{obj.get('id', '')}"
            frame.data.materials.append(wood_oak)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, bz + h + 0.1), rotation=(0, 0, rot_y))
            matt = bpy.context.active_object
            matt.scale = (w * 0.94, d * 0.94, 0.24)
            matt.name = f"BedMattress_{obj.get('id', '')}"
            matt.data.materials.append(fabric_linen)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            
        elif 'sofa' in cat_id:
            w, d, h = (2.2, 0.95, 0.75) if '3' in cat_id or 'corner' in cat_id else (1.6, 0.9, 0.75)
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, bz + 0.22), rotation=(0, 0, rot_y))
            seat = bpy.context.active_object
            seat.scale = (w, d, 0.42)
            seat.name = f"SofaSeat_{obj.get('id', '')}"
            seat.data.materials.append(fabric_navy)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            
        elif 'table' in cat_id:
            w, d, h = (1.5, 0.85, 0.76) if 'dining' in cat_id else (1.2, 0.6, 0.75)
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, bz + h - 0.02), rotation=(0, 0, rot_y))
            top = bpy.context.active_object
            top.scale = (w, d, 0.04)
            top.name = f"TableTop_{obj.get('id', '')}"
            top.data.materials.append(wood_oak)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            
        elif 'chair' in cat_id or 'armchair' in cat_id:
            w, d, h = (0.5, 0.5, 0.85)
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, bz + 0.25), rotation=(0, 0, rot_y))
            ch = bpy.context.active_object
            ch.scale = (w, d, 0.45)
            ch.data.materials.append(leather_cognac)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            
        elif 'tv' in cat_id:
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, bz + 0.25), rotation=(0, 0, rot_y))
            st = bpy.context.active_object
            st.scale = (1.6, 0.42, 0.48)
            st.data.materials.append(wood_dark)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            
        elif 'kitchen' in cat_id or 'refrigerator' in cat_id or 'stove' in cat_id:
            kh = 2.0 if 'refrigerator' in cat_id else 0.9
            km = metal_dark if 'refrigerator' in cat_id or 'stove' in cat_id else kitchen_cabinet
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, bz + kh / 2.0), rotation=(0, 0, rot_y))
            kt = bpy.context.active_object
            kt.scale = (0.8, 0.6, kh)
            kt.data.materials.append(km)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            
        elif 'bath' in cat_id or 'toilet' in cat_id or 'sink' in cat_id:
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=(bx, by, bz + 0.3), rotation=(0, 0, rot_y))
            pl = bpy.context.active_object
            pl.scale = (0.8, 0.6, 0.6)
            pl.data.materials.append(ceramic_white)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)



BACKDROPS_DIR = os.path.abspath(r"D:\dev\flat\assets\backgrounds")


def setup_lighting(scene_data):
    """Sets up physical Sun, realistic window backdrop HDRI, and interior lighting"""
    world = bpy.context.scene.world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    
    node_out = nodes.new(type='ShaderNodeOutputWorld')
    node_bg = nodes.new(type='ShaderNodeBackground')
    
    # Check for window backdrop setting
    env_cfg = scene_data.get('environment', {})
    backdrop_name = env_cfg.get('backdrop', 'city_day')
    custom_backdrop_path = env_cfg.get('customBackdropPath')
    
    backdrop_img_path = None
    if custom_backdrop_path and os.path.exists(custom_backdrop_path):
        backdrop_img_path = custom_backdrop_path
    else:
        candidate = os.path.join(BACKDROPS_DIR, f"{backdrop_name}.jpg")
        if os.path.exists(candidate):
            backdrop_img_path = candidate
            
    if backdrop_img_path and os.path.exists(backdrop_img_path):
        print(f"[Bake Lighting] Loading 360° window backdrop: {backdrop_img_path}")
        tex_env = nodes.new(type='ShaderNodeTexEnvironment')
        tex_env.image = bpy.data.images.load(backdrop_img_path)
        links.new(tex_env.outputs['Color'], node_bg.inputs['Color'])
        node_bg.inputs['Strength'].default_value = 1.2
        
        # Build 360 Panorama Backdrop Cylinder outside windows
        nodes_list = scene_data.get('nodes', [])
        cx, cy = 0, 0
        if nodes_list:
            xs = [n['x'] for n in nodes_list]
            ys = [n['y'] for n in nodes_list]
            cx = (min(xs) + max(xs)) / 2
            cy = (min(ys) + max(ys)) / 2
            
        bpy.ops.mesh.primitive_cylinder_add(
            radius=32.0,
            depth=22.0,
            location=(cx, cy, 6.0),
            vertices=64
        )
        backdrop_cyl = bpy.context.active_object
        backdrop_cyl.name = "WindowBackdropDome"
        
        # Emissive material with backdrop texture
        mat_bd = bpy.data.materials.new(name="MatWindowBackdrop")
        mat_bd.use_nodes = True
        mnodes = mat_bd.node_tree.nodes
        mlinks = mat_bd.node_tree.links
        mnodes.clear()
        mout = mnodes.new(type='ShaderNodeOutputMaterial')
        memit = mnodes.new(type='ShaderNodeEmission')
        mimg = mnodes.new(type='ShaderNodeTexImage')
        mimg.image = bpy.data.images.load(backdrop_img_path)
        mlinks.new(mimg.outputs['Color'], memit.inputs['Color'])
        memit.inputs['Strength'].default_value = 1.0
        mlinks.new(memit.outputs['Emission'], mout.inputs['Surface'])
        
        backdrop_cyl.data.materials.append(mat_bd)
        # Flip normals inward
        bpy.ops.object.editmode_toggle()
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.flip_normals()
        bpy.ops.object.editmode_toggle()
    else:
        node_bg.inputs['Color'].default_value = (0.82, 0.90, 1.0, 1.0)
        node_bg.inputs['Strength'].default_value = 1.0
        
    links.new(node_bg.outputs['Background'], node_out.inputs['Surface'])
    
    # Physical Sun Light
    sun_data = bpy.data.lights.new(name="SunLight", type='SUN')
    sun_data.energy = 4.5
    sun_data.color = (1.0, 0.96, 0.88)
    sun_data.angle = math.radians(2.0)
    
    sun_obj = bpy.data.objects.new(name="SunLight", object_data=sun_data)
    bpy.context.collection.objects.link(sun_obj)
    sun_obj.location = (10, -10, 15)
    sun_obj.rotation_euler = (math.radians(50), math.radians(20), math.radians(35))
    
    # Soft interior fill lights
    nodes_list = scene_data.get('nodes', [])
    if nodes_list:
        xs = [n['x'] for n in nodes_list]
        ys = [n['y'] for n in nodes_list]
        cx = (min(xs) + max(xs)) / 2
        cy = (min(ys) + max(ys)) / 2
        
        light_data = bpy.data.lights.new(name="InteriorCeilingLight", type='POINT')
        light_data.energy = 140.0
        light_data.color = (1.0, 0.94, 0.86)
        light_data.shadow_soft_size = 0.4
        
        light_obj = bpy.data.objects.new(name="InteriorCeilingLight", object_data=light_data)
        bpy.context.collection.objects.link(light_obj)
        light_obj.location = (cx, cy, 2.45)


def calculate_rooms(scene_data):
    """Calculates room centers and names from objects and geometry"""
    objects = scene_data.get('objects', [])
    nodes = scene_data.get('nodes', [])
    
    zones = []
    
    sofas = [o for o in objects if 'sofa' in o.get('catalogId', '') or 'tv' in o.get('catalogId', '')]
    if sofas:
        avg_x = sum(o['pos']['x'] for o in sofas) / len(sofas)
        avg_y = sum(o['pos']['z'] for o in sofas) / len(sofas)
        zones.append({
            'id': 'living_room',
            'name': 'Гостиная',
            'pos': (avg_x, avg_y, 1.55)
        })
        
    beds = [o for o in objects if 'bed' in o.get('catalogId', '')]
    if beds:
        avg_x = sum(o['pos']['x'] for o in beds) / len(beds)
        avg_y = sum(o['pos']['z'] for o in beds) / len(beds)
        zones.append({
            'id': 'bedroom',
            'name': 'Спальня',
            'pos': (avg_x, avg_y, 1.55)
        })
        
    kitchen = [o for o in objects if 'kitchen' in o.get('catalogId', '') or 'table' in o.get('catalogId', '')]
    if kitchen:
        avg_x = sum(o['pos']['x'] for o in kitchen) / len(kitchen)
        avg_y = sum(o['pos']['z'] for o in kitchen) / len(kitchen)
        zones.append({
            'id': 'kitchen',
            'name': 'Кухня',
            'pos': (avg_x, avg_y, 1.55)
        })
        
    baths = [o for o in objects if 'bath' in o.get('catalogId', '') or 'toilet' in o.get('catalogId', '')]
    if baths:
        avg_x = sum(o['pos']['x'] for o in baths) / len(baths)
        avg_y = sum(o['pos']['z'] for o in baths) / len(baths)
        zones.append({
            'id': 'bathroom',
            'name': 'Ванная комната',
            'pos': (avg_x, avg_y, 1.55)
        })
        
    if not zones and nodes:
        xs = [n['x'] for n in nodes]
        ys = [n['y'] for n in nodes]
        cx = (min(xs) + max(xs)) / 2
        cy = (min(ys) + max(ys)) / 2
        zones.append({
            'id': 'main_room',
            'name': 'Комната',
            'pos': (cx, cy, 1.55)
        })
        
    return zones


def render_360_panoramas(rooms, output_dir, pano_res=2048):
    """Renders high-resolution 360° spherical equirectangular panoramas for each room"""
    scene = bpy.context.scene
    scene.render.resolution_x = pano_res
    scene.render.resolution_y = pano_res // 2
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 90
    
    cam_data = bpy.data.cameras.new(name="PanoCamera")
    cam_data.type = 'PANO'
    cam_data.panorama_type = 'EQUIRECTANGULAR'
    
    cam_obj = bpy.data.objects.new(name="PanoCamera", object_data=cam_data)
    bpy.context.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    
    panoramas_meta = []
    
    for i, room in enumerate(rooms):
        rx, ry, rz = room['pos']
        cam_obj.location = (rx, ry, rz)
        cam_obj.rotation_euler = (math.radians(90), 0, math.radians(0))
        
        file_name = f"pano_{room['id']}.jpg"
        file_path = os.path.join(output_dir, file_name)
        
        scene.render.filepath = file_path
        print(f"[Blender 360] Rendering panorama {i+1}/{len(rooms)}: {room['name']} -> {file_name}")
        bpy.ops.render.render(write_still=True)
        
        hotspots = []
        for other in rooms:
            if other['id'] == room['id']:
                continue
            ox, oy, oz = other['pos']
            dx = ox - rx
            dy = oy - ry
            dist = math.hypot(dx, dy)
            if dist > 0.1:
                yaw_deg = math.degrees(math.atan2(dx, dy))
                hotspots.append({
                    'targetRoomId': other['id'],
                    'targetRoomName': other['name'],
                    'yaw': round(yaw_deg, 1),
                    'pitch': 0.0,
                    'distance': round(dist, 2)
                })
                
        panoramas_meta.append({
            'id': room['id'],
            'name': room['name'],
            'file': file_name,
            'position': [rx, ry, rz],
            'hotspots': hotspots
        })
        
    return panoramas_meta


def export_baked_glb(output_dir):
    """Exports clean, complete 3D scene to GLB with embedded PBR materials"""
    glb_filename = "scene_baked.glb"
    glb_path = os.path.join(output_dir, glb_filename)
    
    print(f"[Blender GLB] Exporting baked GLTF/GLB to {glb_path}...")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        use_selection=False,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_apply=True
    )
    return glb_filename


def main():
    args = parse_args()
    output_dir = os.path.abspath(args.output)
    scene_file = os.path.abspath(args.scene)
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"[Bake Pipeline] Loading scene data from {scene_file}...")
    with open(scene_file, 'r', encoding='utf-8') as f:
        scene_data = json.load(f)
        
    if 'data' in scene_data and isinstance(scene_data['data'], dict):
        scene_data = scene_data['data']
        
    print("[Bake Pipeline] Configuring Cycles & Hardware...")
    configure_cycles(samples=args.samples)
    clean_scene()
    
    wall_mat = create_pbr_material("MatWall", color=hex_to_rgb("#DCD7CE"), roughness=0.8)
    floor_mat = create_pbr_material("MatFloor", color=hex_to_rgb("#7E5531"), roughness=0.35)
    ceiling_mat = create_pbr_material("MatCeiling", color=hex_to_rgb("#E8E4DC"), roughness=0.85)
    glass_mat = create_glass_material()
    frame_mat = create_pbr_material("MatFrame", color=hex_to_rgb("#22252A"), roughness=0.3)
    
    print("[Bake Pipeline] Generating procedural walls and openings...")
    build_walls_and_openings(scene_data, wall_mat, glass_mat, frame_mat)
    
    print("[Bake Pipeline] Generating floor and ceiling...")
    build_floor_and_ceiling(scene_data, floor_mat, ceiling_mat)
    
    print("[Bake Pipeline] Placing 3D furniture models...")
    build_furniture_objects(scene_data)
    
    print("[Bake Pipeline] Setting up physical lights and environment...")
    setup_lighting(scene_data)
    
    rooms = calculate_rooms(scene_data)
    print(f"[Bake Pipeline] Identified {len(rooms)} rooms: {[r['name'] for r in rooms]}")
    
    panoramas_data = []
    glb_filename = None
    
    if args.mode in ["both", "panoramas"]:
        panoramas_data = render_360_panoramas(rooms, output_dir, pano_res=args.pano_res)
        
    if args.mode in ["both", "glb"]:
        glb_filename = export_baked_glb(output_dir)
        
    manifest = {
        'status': 'ready',
        'bakedGlb': glb_filename,
        'panoramas': panoramas_data,
        'roomCount': len(rooms)
    }
    
    manifest_path = os.path.join(output_dir, "manifest.json")
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        
    print(f"[Bake Pipeline] Finished successfully! Manifest written to {manifest_path}")


if __name__ == '__main__':
    main()
