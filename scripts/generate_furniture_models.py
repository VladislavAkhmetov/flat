"""
Generates high-quality, photorealistic 3D architectural furniture and appliance models
with rich PBR materials (velvet, linen, oak, walnut, marble, leather, porcelain, stainless steel)
and exports them to assets/furniture_library/<catalog_id>.glb
"""

import bpy
import math
import os
import sys

OUTPUT_DIR = os.path.abspath(r"D:\dev\flat\assets\furniture_library")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def clean_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)


def hex_to_rgb(hex_str, alpha=1.0):
    hex_str = hex_str.lstrip('#')
    r = (int(hex_str[0:2], 16) / 255.0) ** 2.2
    g = (int(hex_str[2:4], 16) / 255.0) ** 2.2
    b = (int(hex_str[4:6], 16) / 255.0) ** 2.2
    return (r, g, b, alpha)


def create_mat(name, color, roughness=0.5, metallic=0.0, clearcoat=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    
    out = nodes.new(type='ShaderNodeOutputMaterial')
    bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    
    mat.node_tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


def add_bevel(obj, width=0.015, segments=3):
    bev = obj.modifiers.new(name="Bevel", type='BEVEL')
    bev.width = width
    bev.segments = segments
    bev.limit_method = 'ANGLE'


def export_active_as_glb(filename):
    filepath = os.path.join(OUTPUT_DIR, f"{filename}.glb")
    # Select all mesh objects
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=True,
        export_materials='EXPORT',
        export_apply=True
    )
    print(f"✓ Exported {filename}.glb ({os.path.getsize(filepath) // 1024} KB)")


# --- MODEL GENERATORS ---

def build_sofa(name, width=2.2, depth=0.95, height=0.82, seats=3):
    clean_scene()
    fabric = create_mat("FabricSofa", hex_to_rgb("#303D4C"), roughness=0.85)
    fabric_pillow = create_mat("FabricPillow", hex_to_rgb("#47596E"), roughness=0.85)
    wood = create_mat("WoodLegs", hex_to_rgb("#2A1B10"), roughness=0.35)
    
    # Base frame
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.12))
    base = bpy.context.active_object
    base.scale = (width, depth, 0.20)
    base.data.materials.append(fabric)
    add_bevel(base, 0.02)
    
    # Backrest
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, depth/2 - 0.12, 0.48))
    back = bpy.context.active_object
    back.scale = (width, 0.24, 0.55)
    back.data.materials.append(fabric)
    add_bevel(back, 0.03)
    
    # Armrests
    for sign in [-1, 1]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(sign * (width/2 - 0.1), 0, 0.35))
        arm = bpy.context.active_object
        arm.scale = (0.2, depth, 0.45)
        arm.data.materials.append(fabric)
        add_bevel(arm, 0.03)
        
    # Seat Cushions
    cushion_w = (width - 0.4) / seats
    for i in range(seats):
        cx = -width/2 + 0.2 + (i + 0.5) * cushion_w
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, -0.05, 0.28))
        cush = bpy.context.active_object
        cush.scale = (cushion_w * 0.96, depth * 0.72, 0.16)
        cush.data.materials.append(fabric_pillow)
        add_bevel(cush, 0.025)
        
    # Legs (4 tapered cylinders)
    for dx in [-width/2 + 0.15, width/2 - 0.15]:
        for dy in [-depth/2 + 0.15, depth/2 - 0.15]:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=0.12, location=(dx, dy, 0.06))
            leg = bpy.context.active_object
            leg.data.materials.append(wood)
            
    export_active_as_glb(name)


def build_bed(name, width=1.8, depth=2.1, height=0.95):
    clean_scene()
    wood = create_mat("BedWood", hex_to_rgb("#402816"), roughness=0.35)
    mattress_mat = create_mat("MattressLinen", hex_to_rgb("#F5F3EF"), roughness=0.9)
    duvet_mat = create_mat("DuvetCover", hex_to_rgb("#D5DDD8"), roughness=0.85)
    pillow_mat = create_mat("Pillows", hex_to_rgb("#EAE6E1"), roughness=0.85)
    
    # Wooden Frame Base
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.18))
    frame = bpy.context.active_object
    frame.scale = (width, depth, 0.28)
    frame.data.materials.append(wood)
    add_bevel(frame, 0.015)
    
    # Headboard
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, depth/2 - 0.06, 0.55))
    hb = bpy.context.active_object
    hb.scale = (width, 0.12, 0.90)
    hb.data.materials.append(wood)
    add_bevel(hb, 0.02)
    
    # Mattress
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.05, 0.38))
    matt = bpy.context.active_object
    matt.scale = (width * 0.94, depth * 0.88, 0.26)
    matt.data.materials.append(mattress_mat)
    add_bevel(matt, 0.03)
    
    # Duvet / Blanket (covers lower 65% of mattress)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.3, 0.44))
    duvet = bpy.context.active_object
    duvet.scale = (width * 0.95, depth * 0.58, 0.14)
    duvet.data.materials.append(duvet_mat)
    add_bevel(duvet, 0.035)
    
    # Pillows (2 or 4)
    p_count = 2 if width < 1.3 else 4
    pw = (width * 0.4)
    for i in range(min(p_count, 2)):
        px = -width/4 if i == 0 else width/4
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(px, depth/2 - 0.4, 0.52))
        pill = bpy.context.active_object
        pill.scale = (pw * 0.9, 0.4, 0.14)
        pill.rotation_euler = (-0.15, 0, 0)
        pill.data.materials.append(pillow_mat)
        add_bevel(pill, 0.04)
        
    export_active_as_glb(name)


def build_dining_table(name="table_dining", width=1.5, depth=0.85, height=0.76):
    clean_scene()
    oak = create_mat("TableOak", hex_to_rgb("#6E4726"), roughness=0.3)
    steel = create_mat("SteelLegs", hex_to_rgb("#181B1E"), roughness=0.25, metallic=0.9)
    
    # Tabletop (chamfered solid wood)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, height - 0.02))
    top = bpy.context.active_object
    top.scale = (width, depth, 0.04)
    top.data.materials.append(oak)
    add_bevel(top, 0.01)
    
    # 4 Steel legs with angle
    for dx in [-width/2 + 0.1, width/2 - 0.1]:
        for dy in [-depth/2 + 0.08, depth/2 - 0.08]:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.025, depth=height, location=(dx, dy, height/2))
            leg = bpy.context.active_object
            leg.data.materials.append(steel)
            
    export_active_as_glb(name)


def build_chair(name="chair_dining", width=0.48, depth=0.52, height=0.85):
    clean_scene()
    fabric = create_mat("ChairFabric", hex_to_rgb("#8C5B32"), roughness=0.6) # Cognac leather/fabric
    wood = create_mat("ChairLegs", hex_to_rgb("#1D1815"), roughness=0.35)
    
    # Seat
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.45))
    seat = bpy.context.active_object
    seat.scale = (width, depth * 0.8, 0.06)
    seat.data.materials.append(fabric)
    add_bevel(seat, 0.02)
    
    # Backrest
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, depth/2 - 0.05, 0.68))
    back = bpy.context.active_object
    back.scale = (width * 0.95, 0.05, 0.38)
    back.data.materials.append(fabric)
    add_bevel(back, 0.02)
    
    # Legs
    for dx in [-width/2 + 0.05, width/2 - 0.05]:
        for dy in [-depth/2 + 0.08, depth/2 - 0.08]:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.016, depth=0.45, location=(dx, dy, 0.225))
            leg = bpy.context.active_object
            leg.data.materials.append(wood)
            
    export_active_as_glb(name)


def build_tv_unit(name="tv_stand", width=1.6, depth=0.42, height=0.48):
    clean_scene()
    walnut = create_mat("WalnutCabinet", hex_to_rgb("#3B2618"), roughness=0.35)
    metal = create_mat("MetalBase", hex_to_rgb("#151719"), roughness=0.2, metallic=0.9)
    
    # Body
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, height/2 + 0.06))
    body = bpy.context.active_object
    body.scale = (width, depth, height - 0.12)
    body.data.materials.append(walnut)
    add_bevel(body, 0.01)
    
    # Base frame / feet
    for dx in [-width/2 + 0.15, width/2 - 0.15]:
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(dx, 0, 0.06))
        foot = bpy.context.active_object
        foot.scale = (0.04, depth * 0.85, 0.12)
        foot.data.materials.append(metal)
        
    export_active_as_glb(name)


def build_tv_screen(name="tv", width=1.25, height=0.72):
    clean_scene()
    screen = create_mat("OledScreen", hex_to_rgb("#06080A"), roughness=0.08, metallic=0.1)
    bezel = create_mat("TvBezel", hex_to_rgb("#111315"), roughness=0.2, metallic=0.8)
    
    # Frame
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, height/2 + 0.08))
    tv = bpy.context.active_object
    tv.scale = (width, 0.035, height)
    tv.data.materials.append(bezel)
    add_bevel(tv, 0.005)
    
    # Glass Screen
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.015, height/2 + 0.08))
    scr = bpy.context.active_object
    scr.scale = (width * 0.98, 0.01, height * 0.97)
    scr.data.materials.append(screen)
    
    # Stand
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.02))
    base = bpy.context.active_object
    base.scale = (0.45, 0.22, 0.015)
    base.data.materials.append(bezel)
    
    export_active_as_glb(name)


def build_wardrobe(name="wardrobe", width=1.2, depth=0.6, height=2.2):
    clean_scene()
    wood = create_mat("WardrobeWood", hex_to_rgb("#38271B"), roughness=0.35)
    handle = create_mat("HandleBrass", hex_to_rgb("#8A7038"), roughness=0.25, metallic=0.9)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, height/2))
    body = bpy.context.active_object
    body.scale = (width, depth, height)
    body.data.materials.append(wood)
    add_bevel(body, 0.01)
    
    # Handles (vertical)
    for dx in [-0.03, 0.03]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.008, depth=0.4, location=(dx, -depth/2 - 0.02, height/2))
        hdl = bpy.context.active_object
        hdl.data.materials.append(handle)
        
    export_active_as_glb(name)


def build_kitchen(name="kitchen_set", width=2.4, depth=0.62, height=0.90):
    clean_scene()
    cabinet = create_mat("KitchenCabinet", hex_to_rgb("#232B34"), roughness=0.4) # Dark matte anthracite
    marble = create_mat("QuartzCountertop", hex_to_rgb("#E8ECF0"), roughness=0.18) # Polished white quartz
    steel = create_mat("SinkSteel", hex_to_rgb("#9EA7B0"), roughness=0.2, metallic=0.9)
    hob = create_mat("InductionGlass", hex_to_rgb("#090B0D"), roughness=0.1)
    
    # Base Cabinets
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, (height - 0.04)/2))
    cab = bpy.context.active_object
    cab.scale = (width, depth, height - 0.04)
    cab.data.materials.append(cabinet)
    add_bevel(cab, 0.01)
    
    # Seamless Quartz Countertop
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, height - 0.02))
    ct = bpy.context.active_object
    ct.scale = (width + 0.02, depth + 0.03, 0.04)
    ct.data.materials.append(marble)
    add_bevel(ct, 0.008)
    
    # Induction Cooktop
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-width/4, 0, height + 0.003))
    cook = bpy.context.active_object
    cook.scale = (0.58, 0.50, 0.006)
    cook.data.materials.append(hob)
    
    # Built-in Sink with Faucet
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(width/4, 0, height + 0.002))
    snk = bpy.context.active_object
    snk.scale = (0.55, 0.44, 0.006)
    snk.data.materials.append(steel)
    
    # Gooseneck Faucet
    bpy.ops.mesh.primitive_cylinder_add(radius=0.015, depth=0.35, location=(width/4, depth/4, height + 0.18))
    fauc = bpy.context.active_object
    fauc.data.materials.append(steel)
    
    export_active_as_glb(name)


def build_refrigerator(name="refrigerator", width=0.7, depth=0.68, height=1.9):
    clean_scene()
    steel = create_mat("FridgeSteel", hex_to_rgb("#C2C8CF"), roughness=0.25, metallic=0.85)
    dispenser = create_mat("DispenserBlack", hex_to_rgb("#111315"), roughness=0.2)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, height/2))
    body = bpy.context.active_object
    body.scale = (width, depth, height)
    body.data.materials.append(steel)
    add_bevel(body, 0.02)
    
    # Water dispenser panel
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.12, -depth/2 - 0.01, 1.25))
    disp = bpy.context.active_object
    disp.scale = (0.16, 0.01, 0.28)
    disp.data.materials.append(dispenser)
    
    export_active_as_glb(name)


def build_bathtub(name="bath"):
    clean_scene()
    ceramic = create_mat("CeramicWhite", hex_to_rgb("#FAFBFD"), roughness=0.08)
    chrome = create_mat("ChromeTap", hex_to_rgb("#D8DEE4"), roughness=0.15, metallic=0.95)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.3))
    tub = bpy.context.active_object
    tub.scale = (1.7, 0.75, 0.6)
    tub.data.materials.append(ceramic)
    add_bevel(tub, 0.06)
    
    # Chrome faucet
    bpy.ops.mesh.primitive_cylinder_add(radius=0.015, depth=0.25, location=(0.75, 0, 0.65))
    fauc = bpy.context.active_object
    fauc.data.materials.append(chrome)
    
    export_active_as_glb(name)


def build_toilet(name="toilet"):
    clean_scene()
    ceramic = create_mat("CeramicWhite", hex_to_rgb("#FAFBFD"), roughness=0.08)
    chrome = create_mat("ChromeButton", hex_to_rgb("#D8DEE4"), roughness=0.15, metallic=0.95)
    
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.25))
    wc = bpy.context.active_object
    wc.scale = (0.38, 0.58, 0.42)
    wc.data.materials.append(ceramic)
    add_bevel(wc, 0.05)
    
    # Tank / Back
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.22, 0.45))
    tank = bpy.context.active_object
    tank.scale = (0.36, 0.16, 0.45)
    tank.data.materials.append(ceramic)
    add_bevel(tank, 0.02)
    
    export_active_as_glb(name)


def build_sink_vanity(name="sink"):
    clean_scene()
    vanity_wood = create_mat("VanityWood", hex_to_rgb("#2E2822"), roughness=0.35)
    ceramic = create_mat("CeramicWhite", hex_to_rgb("#FAFBFD"), roughness=0.08)
    chrome = create_mat("ChromeFaucet", hex_to_rgb("#D8DEE4"), roughness=0.15, metallic=0.95)
    
    # Cabinet
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.42))
    van = bpy.context.active_object
    van.scale = (0.7, 0.48, 0.45)
    van.data.materials.append(vanity_wood)
    add_bevel(van, 0.01)
    
    # Ceramic Sink Basin
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.68))
    sink_top = bpy.context.active_object
    sink_top.scale = (0.72, 0.50, 0.08)
    sink_top.data.materials.append(ceramic)
    add_bevel(sink_top, 0.02)
    
    # Faucet
    bpy.ops.mesh.primitive_cylinder_add(radius=0.012, depth=0.18, location=(0, 0.16, 0.8))
    fauc = bpy.context.active_object
    fauc.data.materials.append(chrome)
    
    export_active_as_glb(name)


def build_shower(name="shower"):
    clean_scene()
    glass = create_mat("ShowerGlass", hex_to_rgb("#DDF2F8", alpha=0.3), roughness=0.05)
    chrome = create_mat("ShowerChrome", hex_to_rgb("#D8DEE4"), roughness=0.15, metallic=0.95)
    tray_mat = create_mat("ShowerTray", hex_to_rgb("#F4F6F8"), roughness=0.1)
    
    # Base Tray
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.04))
    tray = bpy.context.active_object
    tray.scale = (0.9, 0.9, 0.08)
    tray.data.materials.append(tray_mat)
    
    # Glass Walls
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.05))
    gl_wall = bpy.context.active_object
    gl_wall.scale = (0.88, 0.88, 1.95)
    gl_wall.data.materials.append(glass)
    
    export_active_as_glb(name)


def build_washing_machine(name="washing_machine"):
    clean_scene()
    white_steel = create_mat("WasherBody", hex_to_rgb("#F0F2F5"), roughness=0.25)
    glass_door = create_mat("WasherGlass", hex_to_rgb("#1E242B"), roughness=0.1, metallic=0.2)
    display = create_mat("WasherPanel", hex_to_rgb("#0E1217"), roughness=0.1)
    
    # Body
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.425))
    body = bpy.context.active_object
    body.scale = (0.6, 0.6, 0.85)
    body.data.materials.append(white_steel)
    add_bevel(body, 0.015)
    
    # Round Door
    bpy.ops.mesh.primitive_cylinder_add(radius=0.2, depth=0.02, location=(0, -0.31, 0.42))
    door = bpy.context.active_object
    door.rotation_euler = (math.pi/2, 0, 0)
    door.data.materials.append(glass_door)
    
    # Display Bar
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.29, 0.78))
    pnl = bpy.context.active_object
    pnl.scale = (0.54, 0.02, 0.08)
    pnl.data.materials.append(display)
    
    export_active_as_glb(name)


def build_decor():
    # 1. Indoor Plant in Ceramic Pot
    clean_scene()
    pot_mat = create_mat("PlantPot", hex_to_rgb("#E6E0D8"), roughness=0.3)
    leaf_mat = create_mat("PlantLeaves", hex_to_rgb("#234828"), roughness=0.4)
    stem_mat = create_mat("PlantStem", hex_to_rgb("#3B2B1B"), roughness=0.6)
    
    # Pot
    bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=0.35, location=(0, 0, 0.175))
    pot = bpy.context.active_object
    pot.data.materials.append(pot_mat)
    
    # Foliage (lush sphere/cubes)
    for i in range(5):
        ang = i * (math.pi * 2 / 5)
        lx = math.cos(ang) * 0.12
        ly = math.sin(ang) * 0.12
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(lx, ly, 0.55 + i*0.06))
        leaf = bpy.context.active_object
        leaf.scale = (0.18, 0.18, 0.28)
        leaf.rotation_euler = (0.2 * math.cos(ang), 0.2 * math.sin(ang), ang)
        leaf.data.materials.append(leaf_mat)
        add_bevel(leaf, 0.04)
        
    export_active_as_glb("plant_indoor")
    
    # 2. Minimalist Floor Lamp
    clean_scene()
    metal = create_mat("LampMetal", hex_to_rgb("#181B1E"), roughness=0.25, metallic=0.9)
    shade = create_mat("LampShade", hex_to_rgb("#F7F5F0"), roughness=0.8)
    
    # Base
    bpy.ops.mesh.primitive_cylinder_add(radius=0.16, depth=0.02, location=(0, 0, 0.01))
    base = bpy.context.active_object
    base.data.materials.append(metal)
    
    # Pole
    bpy.ops.mesh.primitive_cylinder_add(radius=0.012, depth=1.45, location=(0, 0, 0.73))
    pole = bpy.context.active_object
    pole.data.materials.append(metal)
    
    # Drum Shade
    bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.28, location=(0, 0, 1.48))
    shd = bpy.context.active_object
    shd.data.materials.append(shade)
    
    export_active_as_glb("floor_lamp")


def main():
    print("=" * 60)
    print("🎨 GENERATING HIGH-QUALITY 3D FURNITURE & APPLIANCE LIBRARY")
    print("=" * 60)
    
    build_sofa("sofa_3", width=2.2, depth=0.95, height=0.82, seats=3)
    build_sofa("sofa_2", width=1.6, depth=0.90, height=0.82, seats=2)
    build_sofa("sofa_corner", width=2.3, depth=1.6, height=0.82, seats=3)
    build_sofa("armchair", width=0.88, depth=0.85, height=0.80, seats=1)
    
    build_bed("bed_double", width=1.8, depth=2.1, height=0.95)
    build_bed("bed_single", width=1.0, depth=2.05, height=0.90)
    
    build_dining_table("table_dining", width=1.5, depth=0.85, height=0.76)
    build_dining_table("table_desk", width=1.3, depth=0.65, height=0.75)
    build_chair("chair_dining", width=0.48, depth=0.52, height=0.85)
    build_chair("chair_office", width=0.60, depth=0.60, height=0.92)
    
    build_tv_unit("tv_stand", width=1.6, depth=0.42, height=0.48)
    build_tv_screen("tv", width=1.25, height=0.72)
    build_wardrobe("wardrobe", width=1.2, depth=0.6, height=2.2)
    build_wardrobe("bedside_table", width=0.5, depth=0.45, height=0.5)
    
    build_kitchen("kitchen_set", width=2.2, depth=0.62, height=0.90)
    build_kitchen("kitchen_module", width=0.6, depth=0.62, height=0.90)
    build_refrigerator("refrigerator", width=0.7, depth=0.68, height=1.9)
    build_kitchen("stove", width=0.6, depth=0.62, height=0.90)
    build_kitchen("sink_kitchen", width=0.8, depth=0.62, height=0.90)
    
    build_bathtub("bath")
    build_toilet("toilet")
    build_sink_vanity("sink")
    build_shower("shower")
    build_washing_machine("washing_machine")
    
    build_decor()
    
    print("\n🎉 ALL ASSETS GENERATED SUCCESSFULLY IN:", OUTPUT_DIR)


if __name__ == '__main__':
    main()
