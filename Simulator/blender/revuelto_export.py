"""revuelto_export.py -- prepare a Lamborghini Revuelto model for REVUELTO SIM.

Run from a terminal (Blender 3.6+ / 4.x):

    blender --background --python Simulator/blender/revuelto_export.py -- model.fbx revuelto.glb
    blender --background scene.blend --python Simulator/blender/revuelto_export.py -- - revuelto.glb
    blender --background --python Simulator/blender/revuelto_export.py -- model.fbx revuelto.glb --render hero.png

or paste it into Blender's Scripting tab with your car selected and press Run.

What it does
  1. imports the model (fbx / obj / gltf / glb / dae / usd) unless the input is '-'
  2. applies transforms, scales the car to 4.947 m long, rests it on Z = 0, centres it
  3. assumes the car faces -Y (Blender's front view).  Override with --front=+Y|-X|+X
  4. finds wheel objects (name contains wheel / tyre / tire / rim / brake) and groups
     them under empties named wheel_fl / wheel_fr / wheel_rl / wheel_rr so the sim can
     spin and steer them
  5. gives paint materials (name contains paint / body / carrosserie / exterior) a
     Principled clearcoat so they read as car paint; the sim recolours them with P
  6. exports a Y-up GLB with materials and embedded textures (no Draco)
  7. optionally renders a Cycles hero still (--render out.png)

Then drop revuelto.glb onto the sim window, or place it next to index.html.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

CAR_LENGTH = 4.947
WHEEL_WORDS = ("wheel", "tyre", "tire", "rim", "brake", "caliper", "disc")
PAINT_WORDS = ("paint", "body", "carrosserie", "carroceria", "exterior", "shell")


def args():
    argv = sys.argv
    if "--" not in argv:
        return {"input": "-", "output": "revuelto.glb", "front": "-Y", "render": None}
    argv = argv[argv.index("--") + 1:]
    a = {"input": argv[0] if argv else "-", "output": argv[1] if len(argv) > 1 else "revuelto.glb", "front": "-Y", "render": None}
    for x in argv[2:]:
        if x.startswith("--front="):
            a["front"] = x.split("=", 1)[1].upper()
        elif x.startswith("--render="):
            a["render"] = x.split("=", 1)[1]
        elif x == "--render":
            a["render"] = "hero.png"
    return a


def import_model(path):
    ext = os.path.splitext(path)[1].lower()
    before = set(bpy.data.objects)
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".obj":
        if hasattr(bpy.ops.wm, "obj_import"):
            bpy.ops.wm.obj_import(filepath=path)
        else:
            bpy.ops.import_scene.obj(filepath=path)
    elif ext in (".gltf", ".glb"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".dae":
        bpy.ops.wm.collada_import(filepath=path)
    elif ext in (".usd", ".usdc", ".usda", ".usdz"):
        bpy.ops.wm.usd_import(filepath=path)
    else:
        raise SystemExit("unsupported input: " + path)
    return [o for o in bpy.data.objects if o not in before]


def car_objects():
    sel = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    if sel:
        return sel
    return [o for o in bpy.data.objects if o.type == "MESH"]


def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def root_of(o):
    while o.parent is not None:
        o = o.parent
    return o


def main():
    a = args()
    if a["input"] != "-":
        new = import_model(os.path.abspath(a["input"]))
        for o in new:
            o.select_set(True)
    meshes = car_objects()
    if not meshes:
        raise SystemExit("no meshes found")
    roots = {root_of(o) for o in meshes}

    # one parent for the whole car so we can orient / scale it as a unit
    car = bpy.data.objects.new("REVUELTO", None)
    bpy.context.scene.collection.objects.link(car)
    for r in roots:
        r.parent = car

    # orientation: rotate so the car faces -Y
    yaw = {"-Y": 0.0, "+X": math.pi / 2, "+Y": math.pi, "-X": -math.pi / 2}[a["front"]]
    car.rotation_euler = (0, 0, yaw)
    bpy.context.view_layer.update()

    # scale to real length, rest on the ground, centre
    lo, hi = bounds(meshes)
    length = max(hi.x - lo.x, hi.y - lo.y)
    s = CAR_LENGTH / length if length > 0 else 1.0
    car.scale = (s, s, s)
    bpy.context.view_layer.update()
    lo, hi = bounds(meshes)
    car.location = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    bpy.context.view_layer.update()

    # wheels: classify by position (front = -Y, left = +X when facing -Y)
    lo, hi = bounds(meshes)
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    groups = {"fl": [], "fr": [], "rl": [], "rr": []}
    for o in meshes:
        n = o.name.lower()
        if not any(w in n for w in WHEEL_WORDS):
            continue
        blo, bhi = bounds([o])
        c = (blo + bhi) / 2
        key = ("f" if c.y < cy else "r") + ("l" if c.x > cx else "r")
        groups[key].append(o)
    for key, objs in groups.items():
        if not objs:
            continue
        blo, bhi = bounds(objs)
        centre = (blo + bhi) / 2
        pivot = bpy.data.objects.new("wheel_" + key, None)
        bpy.context.scene.collection.objects.link(pivot)
        pivot.parent = car
        pivot.matrix_world = car.matrix_world.copy()
        pivot.matrix_world.translation = centre
        for o in objs:
            mw = o.matrix_world.copy()
            o.parent = pivot
            o.matrix_world = mw
    print("wheels:", {k: len(v) for k, v in groups.items()})

    # shading + paint materials
    for o in meshes:
        if o.data and hasattr(o.data, "polygons"):
            for p in o.data.polygons:
                p.use_smooth = True
            if hasattr(o.data, "use_auto_smooth"):
                o.data.use_auto_smooth = True
                o.data.auto_smooth_angle = math.radians(30)
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.use_nodes:
                continue
            if any(w in (m.name or "").lower() for w in PAINT_WORDS):
                bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                if bsdf:
                    for name, val in (("Metallic", 0.55), ("Roughness", 0.32), ("Coat Weight", 1.0), ("Clearcoat", 1.0), ("Coat Roughness", 0.05), ("Clearcoat Roughness", 0.05)):
                        if name in bsdf.inputs:
                            bsdf.inputs[name].default_value = val
                if "paint" not in m.name.lower():
                    m.name = "paint_" + m.name

    out = os.path.abspath(a["output"])
    kw = dict(filepath=out, export_format="GLB", export_apply=True, export_yup=True, export_materials="EXPORT", export_animations=False, use_selection=False)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw.pop("use_selection", None)
        bpy.ops.export_scene.gltf(**kw)
    print("exported", out)

    if a["render"]:
        render_hero(car, meshes, os.path.abspath(a["render"]))


def render_hero(car, meshes, path):
    """Quick Cycles beauty shot: Nishita sky, sun, shadow-catcher ground, 3/4 front camera."""
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    scn.cycles.samples = 128
    scn.cycles.use_denoising = True
    scn.render.resolution_x, scn.render.resolution_y = 1920, 1080
    scn.render.film_transparent = False
    world = scn.world or bpy.data.worlds.new("World")
    scn.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "NISHITA"
    sky.sun_elevation = math.radians(14)
    sky.sun_rotation = math.radians(35)
    sky.sun_intensity = 0.6
    bg = nt.nodes.new("ShaderNodeBackground")
    outn = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs[0], bg.inputs[0])
    nt.links.new(bg.outputs[0], outn.inputs[0])
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "ground"
    ground.is_shadow_catcher = True
    cam_data = bpy.data.cameras.new("HeroCam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("HeroCam", cam_data)
    scn.collection.objects.link(cam)
    cam.location = Vector((5.5, -7.5, 1.6))
    cam.rotation_euler = (math.radians(80), 0, math.radians(36))
    scn.camera = cam
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


if __name__ == "__main__":
    main()
