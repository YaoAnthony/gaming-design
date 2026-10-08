"""木头风格角色的共用零件（Blender 里跑）：几何（圆角盒子、圆柱、空物体）、骨骼（Rig）、按函数打关键帧的动作（clip）、
烤环境光遮蔽 + 导出 glb（export_character）。主角、Boss 本体、夹子桑的建模脚本都 import 它。

约定（和木手一样）：尺寸按「像素」写，1 个像素 = U 个 Blender 单位；模型朝 -Y（Blender 的前视图），+Z 朝上。
导出时 Blender 的 Z 朝上会换成 glTF 的 Y 朝上，-Y 变成 +Z（朝镜头）。
材质只用名字区分（导出前换成简单材质，颜色由游戏按名字给）；每个部件烤一层顶点色 ao（1 = 没遮，0 = 全黑）。
"""
import json
import math
import os
import struct

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

U = 0.1
AO_SAMPLES = 128
AO_DISTANCE = 1.6           # 环境光遮蔽的探测距离（Blender 单位 = 16 像素）
FPS = 24


def px(*v):
    return Vector(v) * U


def lin(h):
    """#rrggbb（sRGB）→ 线性 RGBA"""
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


# ---------------------------------------------------------------- 场景
def reset(coll_name):
    """删掉之前用这个库生成的所有角色（同一时间场景里只留一个：部件名字一样会被 Blender 改成 .001，导出去就对不上名字），
    再建一个空集合；顺手清掉默认场景的方块灯相机"""
    for old in [c for c in bpy.data.collections if c.get("woodkit") or c.name == coll_name]:
        for o in list(old.all_objects):
            bpy.data.objects.remove(o, do_unlink=True)
        for c in list(old.children_recursive):
            bpy.data.collections.remove(c)
        bpy.data.collections.remove(old)
    for name in ("Cube", "Light", "Camera"):
        o = bpy.data.objects.get(name)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions):
        for d in [d for d in block if d.users == 0]:
            block.remove(d)
    coll = bpy.data.collections.new(coll_name)
    coll["woodkit"] = True
    bpy.context.scene.collection.children.link(coll)
    return coll


def ensure_world():
    sc = bpy.context.scene
    if not sc.world:
        sc.world = bpy.data.worlds.new("World")
    return sc.world


# ---------------------------------------------------------------- 材质
def preview_material(name, hexes):
    """建模时看的简单材质：基色取中间那一档。名字就是游戏里查调色板的 key"""
    m = bpy.data.materials.get(name)
    if m:
        bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = lin(hexes[min(1, len(hexes) - 1)])
    bsdf.inputs["Roughness"].default_value = 1.0
    return m


def materials(palette):
    """{材质名: [颜色从亮到暗]} → {材质名: 材质}"""
    return {k: preview_material(k, v) for k, v in palette.items()}


# ---------------------------------------------------------------- 几何
def frame_matrix(origin, x, y, z):
    m = Matrix.Identity(4)
    for i, axis in enumerate((x, y, z)):
        m[0][i], m[1][i], m[2][i] = axis
    m.translation = origin
    return m


def rounded_box(coll, name, dims, r, mat, matrix, segments=4, taper=1.0, edge_r=None, shift=(0, 0, 0)):
    """dims：局部 x/y/z 全长（像素）；matrix：位置朝向（Blender 单位）；taper：局部 -x 那头的横截面缩到多少；
    edge_r(轴, 位置符号) → 某条边的圆角半径（像素），不给就全用 r；shift：顶点整体挪多少（像素，想把原点放在一头时用）"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    radii = None
    if edge_r is not None:
        wl = bm.edges.layers.float.get("bevel_weight_edge") or bm.edges.layers.float.new("bevel_weight_edge")
        radii = []
        for e in bm.edges:
            a, b = e.verts[0].co, e.verts[1].co
            axis = max(range(3), key=lambda i: abs(a[i] - b[i]))
            radii.append(edge_r(axis, tuple(0 if i == axis else (1 if a[i] > 0 else -1) for i in range(3))))
        rmax = max(radii)
        for e, ri in zip(bm.edges, radii):
            e[wl] = ri / rmax
        r = rmax
    for v in bm.verts:
        k = taper if v.co.x < 0 else 1.0
        v.co = Vector((v.co.x * dims[0] + shift[0], v.co.y * dims[1] * k + shift[1], v.co.z * dims[2] * k + shift[2])) * U
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob.matrix_world = matrix
    if r > 0:
        bev = ob.modifiers.new("Bevel", "BEVEL")
        bev.width = min(r, min(dims) * min(1.0, taper) * 0.49) * U
        bev.segments = segments
        bev.limit_method = "WEIGHT" if radii else "NONE"
        bev.harden_normals = True
    return ob


def box(coll, name, size, at, mat, r=0.0, segments=3, rot=(0, 0, 0), shift=(0, 0, 0)):
    """最常用的写法：全长 size（像素）、中心 at（像素）、绕 XYZ 转 rot（度）"""
    m = Matrix.Translation(px(*at)) @ Euler([math.radians(a) for a in rot], "XYZ").to_matrix().to_4x4()
    return rounded_box(coll, name, size, r, mat, m, segments=segments, shift=shift)


def frustum(coll, name, top, bottom, z0, z1, at, mat, r=1.0, segments=3):
    """上下口不一样大的方台（围裙、裙子）：top / bottom = (宽, 厚)，z0 → z1 从下到上，at = (x, y) 中心（像素）"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        w, d = (top if v.co.z > 0 else bottom)
        v.co = Vector((v.co.x * w, v.co.y * d, (z1 if v.co.z > 0 else z0) - (z0 + z1) / 2)) * U
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob.matrix_world = Matrix.Translation(px(at[0], at[1], (z0 + z1) / 2))
    if r > 0:
        bev = ob.modifiers.new("Bevel", "BEVEL")
        bev.width = r * U
        bev.segments = segments
        bev.limit_method = "NONE"
        bev.harden_normals = True
    return ob


def cylinder(coll, name, radius, length, mat, matrix, segments=16, bevel=0.0, axis="X"):
    """沿局部某根轴的圆柱；radius / length 是像素"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rot = {"X": Matrix.Rotation(math.pi / 2, 4, "Y"), "Y": Matrix.Rotation(-math.pi / 2, 4, "X"), "Z": Matrix.Identity(4)}[axis]
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius * U, radius2=radius * U, depth=length * U, matrix=rot)
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob.matrix_world = matrix
    if bevel:
        bev = ob.modifiers.new("Bevel", "BEVEL")
        bev.width = bevel * U
        bev.segments = 3
        bev.limit_method = "ANGLE"
        bev.harden_normals = True
    return ob


def log(coll, name, radius, a, b, mat, bevel=2.0, segments=16):
    """一截圆木：从 a 到 b（像素）"""
    a, b = Vector(a), Vector(b)
    d = b - a
    m = Matrix.Translation(px(*((a + b) / 2))) @ d.to_track_quat("X", "Z").to_matrix().to_4x4()
    return cylinder(coll, name, radius, d.length, mat, m, segments=segments, bevel=bevel)


def sphere(coll, name, radius, at, mat, segments=16, rings=10):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius * U)
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob.matrix_world = Matrix.Translation(px(*at))
    return ob


def empty(coll, name, at, rot=(0, 0, 0), size=2.0):
    """对准点 / 挂东西的点：空物体，游戏里按名字找"""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "ARROWS"
    e.empty_display_size = size * U
    coll.objects.link(e)
    e.matrix_world = Matrix.Translation(px(*at)) @ Euler([math.radians(a) for a in rot], "XYZ").to_matrix().to_4x4()
    return e


# ---------------------------------------------------------------- 骨骼
class Rig:
    """先用 bone() 登记骨头（像素坐标），build() 一次建好；attach() 把部件挂上去（保持世界位置）"""

    def __init__(self, coll, name):
        self.data = bpy.data.armatures.new(name + "_rig")
        self.arm = bpy.data.objects.new(name, self.data)
        coll.objects.link(self.arm)
        self.arm.show_in_front = True
        self.specs = []

    def bone(self, name, head, tail, up=(0, 0, 1), parent=None, connect=False):
        """up = 骨头的 Z 轴（roll）朝哪；旋转都按骨头自己的轴：X = 和骨头、up 都垂直的那根（四肢的弯曲轴）"""
        self.specs.append((name, head, tail, up, parent, connect))
        return name

    def build(self):
        bpy.context.view_layer.objects.active = self.arm
        bpy.ops.object.mode_set(mode="EDIT")
        eb = self.data.edit_bones
        for name, head, tail, up, parent, connect in self.specs:
            b = eb.new(name)
            b.head, b.tail = px(*head), px(*tail)
            b.align_roll(Vector(up))
            if parent:
                b.parent = eb[parent]
                b.use_connect = connect
        bpy.ops.object.mode_set(mode="OBJECT")
        for pb in self.arm.pose.bones:
            pb.rotation_mode = "XYZ"
        return self.arm

    def attach(self, ob, bone):
        arm = self.arm
        pb = arm.pose.bones[bone]
        world = ob.matrix_world.copy()
        ob.parent = arm
        ob.parent_type = "BONE"
        ob.parent_bone = bone
        ob.matrix_parent_inverse = (arm.matrix_world @ pb.matrix @ Matrix.Translation((0, pb.bone.length, 0))).inverted()
        ob.matrix_world = world
        return ob

    def reset_pose(self):
        for pb in self.arm.pose.bones:
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)

    def apply(self, pose):
        """pose = {骨名: (x, y, z) 度} 或 {"loc:骨名": (x, y, z) 像素（骨头自己的轴）}"""
        self.reset_pose()
        for key, val in pose.items():
            if key.startswith("loc:"):
                self.arm.pose.bones[key[4:]].location = px(*val)
            else:
                self.arm.pose.bones[key].rotation_euler = Euler([math.radians(a) for a in val], "XYZ")
        bpy.context.view_layer.update()


def clear_animation(rig):
    ad = rig.arm.animation_data
    if not ad:
        return
    if ad.action:
        old = ad.action
        ad.action = None
        bpy.data.actions.remove(old)
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)


def clip(rig, name, seconds, fn, fps=FPS, loop=True):
    """一段动作：fn(t 秒) → pose（见 Rig.apply）。每帧打关键帧，放到自己的 NLA 轨道上（导出时每段一个 glTF 动画）。
    loop 时最后一帧和第一帧一样，游戏里循环播放不跳"""
    arm = rig.arm
    ad = arm.animation_data_create()
    ad.use_nla = False
    act = bpy.data.actions.new(name)
    ad.action = act
    n = max(1, round(seconds * fps))
    for f in range(n + 1 if loop else n):
        rig.apply(fn((f / fps) % seconds if loop else f / fps))
        for pb in arm.pose.bones:
            pb.keyframe_insert("rotation_euler", frame=f + 1)
            pb.keyframe_insert("location", frame=f + 1)
    slot = getattr(ad, "action_slot", None)
    ad.action = None
    track = ad.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, act)
    if slot is not None and hasattr(strip, "action_slot"):
        strip.action_slot = slot
    ad.use_nla = True
    rig.reset_pose()
    return act


def pose_clip(rig, name, pose):
    """一个静止姿势也当一段动画（两帧一样）"""
    return clip(rig, name, 2 / FPS, lambda t: pose, loop=False)


def preview_frames(rig, name, seconds, fn, fps=FPS):
    """建模时看动作：在时间线上按帧打关键帧（不进 NLA），场景帧范围设成这段"""
    clear_animation(rig)
    arm = rig.arm
    ad = arm.animation_data_create()
    act = bpy.data.actions.new("preview_" + name)
    ad.action = act
    n = max(1, round(seconds * fps))
    for f in range(n + 1):
        rig.apply(fn((f / fps) % seconds))
        for pb in arm.pose.bones:
            pb.keyframe_insert("rotation_euler", frame=f + 1)
            pb.keyframe_insert("location", frame=f + 1)
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, n + 1
    sc.frame_set(1)


# ---------------------------------------------------------------- 导出
def apply_modifiers(meshes):
    dg = bpy.context.evaluated_depsgraph_get()
    for o in meshes:
        if not o.modifiers:
            continue
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        me.name = o.data.name + "_final"
        o.modifiers.clear()
        o.data = me


def bake_ao(arm, meshes, coll):
    """静止姿势、只留这个角色自己的集合，每个部件烤一张顶点色 ao"""
    sc = bpy.context.scene
    for o in meshes:
        attr = o.data.color_attributes.new("ao", "FLOAT_COLOR", "POINT")
        o.data.color_attributes.active_color = attr
        o.data.color_attributes.render_color_index = o.data.color_attributes.find("ao")
    hidden = []
    for c in sc.collection.children:
        if c is not coll and not c.hide_render:
            c.hide_render = True
            hidden.append(c)
    if arm:
        arm.data.pose_position = "REST"
    engine = sc.render.engine
    sc.render.engine = "CYCLES"
    sc.cycles.samples = AO_SAMPLES
    sc.cycles.bake_type = "AO"
    sc.render.bake.target = "VERTEX_COLORS"
    ensure_world().light_settings.distance = AO_DISTANCE
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    bpy.ops.object.select_all(action="DESELECT")
    for c in hidden:
        c.hide_render = False
    if arm:
        arm.data.pose_position = "POSE"
    sc.render.engine = engine


def export_glb(objects, out):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=out, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
        export_cameras=False, export_lights=False, export_extras=False,
        export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True,
        export_optimize_animation_size=False, export_rest_position_armature=True, export_def_bones=False,
        export_skins=True, export_morph=False,
        export_vertex_color="ACTIVE", export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
    )
    bpy.ops.object.select_all(action="DESELECT")


def describe(out):
    """读一下导出的 glb，返回 (节点名, 材质名, [(动画名, 通道数)], 属性名)"""
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
    return names, mats, anims, attrs


def export_character(coll, rig, out, expect_anims=(), expect_nodes=()):
    """把一个角色导出成 glb：应用修改器 → 烤 AO → 导出 → 检查。会改场景里的东西，导完请重新 build 一遍"""
    objs = list(coll.all_objects)
    meshes = [o for o in objs if o.type == "MESH"]
    empties = [o for o in objs if o.type == "EMPTY"]
    arm = rig.arm if rig else None
    apply_modifiers(meshes)
    bake_ao(arm, meshes, coll)
    if arm:
        arm.data.pose_position = "POSE"
        rig.reset_pose()
    export_glb(([arm] if arm else []) + meshes + empties, out)
    names, mats, anims, attrs = describe(out)
    assert "COLOR_0" in attrs, "顶点色 ao 没导出来"
    missing = [n for n in expect_nodes if n not in names]
    assert not missing, f"少了 {missing}"
    got = {a for a, _ in anims}
    missing = [a for a in expect_anims if a not in got]
    assert not missing, f"少了动画 {missing}"
    print("exported", out)
