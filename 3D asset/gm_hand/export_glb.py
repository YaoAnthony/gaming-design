"""把 Game Master 的木手导成游戏用的 glb：
  1. 用 build_hand.py 重新建一遍（干净的场景），把可编辑的版本存成 gm_hand.blend
  2. 把倒角修改器应用成真的几何，用 Cycles 在静止姿势下把环境光遮蔽烤进顶点色「ao」
  3. 材质换成按名字区分的简单材质（wood / cuff / wrist / knot / frame / boss），颜色由游戏给
  4. 每个姿势一段动画（只有骨骼：pose_point / pose_pinch / pose_open / pose_fist / pose_grip），放在 NLA 轨道上导出
  5. 导出：骨架 + 所有部件 + 对准点（anchor_*）；不带相机、灯、绿方块
  6. 再重新建一遍，Blender 里留下的还是可编辑的版本

用法（Blender 里运行，或命令行）：
    blender -b -P export_glb.py -- [glb 输出路径]
默认输出到 ../../game-master/src/asset/model/gm_hand.glb
"""
import json
import os
import runpy
import struct
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
BLEND = os.path.join(HERE, "gm_hand.blend")
DEFAULT_OUT = os.path.normpath(os.path.join(HERE, "..", "..", "game-master", "src", "asset", "model", "gm_hand.glb"))
AO_SAMPLES = 128
CLIP_FRAMES = 2       # 每段姿势动画几帧（两帧一样：有的读取器不认只有一个关键帧的动画）


def fresh_build():
    g = runpy.run_path(os.path.join(HERE, "build_hand.py"), run_name="__main__")
    arm = bpy.data.objects["GM_Hand_Rig"]
    cube = bpy.data.objects["GMH_cube"]
    return g, arm, cube


def parts(g):
    """要导出的部件：GM_Hand 集合里直接的网格（不含子集合里的绿方块）和空物体"""
    objs = list(bpy.data.collections[g["COLL"]].objects)
    return [o for o in objs if o.type == "MESH"], [o for o in objs if o.type == "EMPTY"]


def apply_modifiers(meshes):
    dg = bpy.context.evaluated_depsgraph_get()
    for o in meshes:
        if not o.modifiers:
            continue
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        me.name = o.data.name + "_final"
        o.modifiers.clear()
        o.data = me


def bake_ao(g, arm, meshes):
    """静止姿势、方块藏起来，每个部件烤一张顶点色 ao（1 = 完全没遮，0 = 全黑）"""
    sc = bpy.context.scene
    for o in meshes:
        attr = o.data.color_attributes.new("ao", "FLOAT_COLOR", "POINT")
        o.data.color_attributes.active_color = attr
        o.data.color_attributes.render_color_index = o.data.color_attributes.find("ao")
    arm.data.pose_position = "REST"
    bpy.data.collections[g["HELD_COLL"]].hide_render = True
    sc.frame_set(1)
    sc.render.engine = "CYCLES"
    sc.cycles.samples = AO_SAMPLES
    sc.cycles.bake_type = "AO"
    sc.render.bake.target = "VERTEX_COLORS"
    sc.world.light_settings.distance = g["AO_DISTANCE"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    bpy.ops.object.select_all(action="DESELECT")


def swap_materials(g, meshes):
    """游戏只认材质名：wood / cuff / ...；基色给个中间档，随便哪个查看器打开都大致对"""
    simple = {}
    for key, colors in g["PALETTE"].items():
        old = bpy.data.materials.get(key)
        if old:
            bpy.data.materials.remove(old)
        m = bpy.data.materials.new(key)
        m.use_nodes = True
        bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = g["lin"](colors[min(1, len(colors) - 1)])
        bsdf.inputs["Roughness"].default_value = 1.0
        simple[key] = m
    for o in meshes:
        for slot in o.material_slots:
            slot.material = simple[slot.material.name.removeprefix("GMH_")]


def pose_tracks(g, arm, cube):
    """每个姿势：先摆好、记下每根骨头的转角；然后各做一个只有骨骼的动作，放到自己的 NLA 轨道上"""
    poses = {}
    for name in g["POSES"]:
        g["apply_pose"](arm, cube, name)
        poses[name] = {pb.name: pb.rotation_euler.copy() for pb in arm.pose.bones}
    arm.rotation_euler = (0, 0, 0)
    arm.scale = (1, 1, 1)
    cube.hide_render = cube.hide_viewport = True
    ad = arm.animation_data_create()
    if ad.action:
        old = ad.action
        ad.action = None
        bpy.data.actions.remove(old)
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    for name, rots in poses.items():
        act = bpy.data.actions.new("pose_" + name)
        ad.action = act
        for pb in arm.pose.bones:
            pb.rotation_euler = rots[pb.name]
            for f in range(1, CLIP_FRAMES + 1):
                pb.keyframe_insert("rotation_euler", frame=f)
        slot = getattr(ad, "action_slot", None)
        ad.action = None
        track = ad.nla_tracks.new()
        track.name = "pose_" + name
        strip = track.strips.new("pose_" + name, 1, act)
        if slot is not None and hasattr(strip, "action_slot"):
            strip.action_slot = slot
    for pb in arm.pose.bones:
        pb.rotation_euler = (0, 0, 0)


def export(arm, meshes, empties, out):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in [arm, *meshes, *empties]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=out, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
        export_cameras=False, export_lights=False, export_extras=False,
        export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True,
        export_optimize_animation_size=False, export_rest_position_armature=True, export_def_bones=False,
        export_skins=True, export_morph=False,
        export_vertex_color="ACTIVE", export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
    )
    bpy.ops.object.select_all(action="DESELECT")


def describe(out, g):
    """读一下导出的 glb，确认该有的都在"""
    with open(out, "rb") as f:
        magic, _version, _length = struct.unpack("<III", f.read(12))
        assert magic == 0x46546C67, "不是 glb"
        chunk_len, chunk_type = struct.unpack("<II", f.read(8))
        assert chunk_type == 0x4E4F534A
        doc = json.loads(f.read(chunk_len))
    names = [n.get("name") for n in doc.get("nodes", [])]
    anims = [(a.get("name"), len(a.get("channels", []))) for a in doc.get("animations", [])]
    mats = [m.get("name") for m in doc.get("materials", [])]
    attrs = sorted({k for m in doc.get("meshes", []) for p in m["primitives"] for k in p["attributes"]})
    print(f"glb {os.path.getsize(out) / 1024:.0f} KB | nodes {len(names)} | meshes {len(doc.get('meshes', []))} | attrs {attrs}")
    print("materials", mats)
    print("animations", anims)
    print("anchors", [n for n in names if n and n.startswith("anchor_")])
    missing = [n for n in ("anchor_tip", "anchor_thumb", "anchor_palm", "anchor_wrist", "GMH_arm") if n not in names]
    assert not missing, f"少了 {missing}"
    assert "COLOR_0" in attrs, "顶点色 ao 没导出来"
    assert len(anims) == len(g["POSES"]), f"应该有 {len(g['POSES'])} 段姿势动画"


def main(out=DEFAULT_OUT):
    g, arm, cube = fresh_build()
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, copy=True)
    print("saved", BLEND)
    meshes, empties = parts(g)
    apply_modifiers(meshes)
    bake_ao(g, arm, meshes)
    swap_materials(g, meshes)
    pose_tracks(g, arm, cube)
    arm.data.pose_position = "POSE"
    export(arm, meshes, empties, out)
    describe(out, g)
    fresh_build()
    print("exported", out)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    main(argv[0] if argv else DEFAULT_OUT)
