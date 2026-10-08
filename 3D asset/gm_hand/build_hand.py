"""Game Master（木偶人 Boss）的木手：建模 + 骨骼 + 三个姿势 + 卡通分层材质 + 正交相机和灯。

在 Blender 里跑：Text Editor 打开后 Run Script，或者
    blender -b -P build_hand.py
重复运行会先删掉上一次生成的东西（GM_Hand 集合）再重建。

静止姿势的坐标：+X 朝指尖，+Z 是手背，-Z 是手心，-Y 是拇指那一侧（朝镜头）。
下面的尺寸都按「最终像素」写，乘 U 换成 Blender 单位。
姿势存在动画帧上：第 1 帧 = 指，第 2 帧 = 捏（捏着东西），第 3 帧 = 摊开，第 4 帧 = 握拳，第 5 帧 = 捏布（指尖合拢，拎主角的衣服）（常量插值）。
游戏里要用的东西也在这建好：对准点（anchor_* 空物体，挂在骨头上）、可以拉长的前臂（GMH_arm）；导出 glb 见 export_glb.py。
"""
import math

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

U = 0.1                 # 1 个最终像素 = 0.1 Blender 单位
COLL = "GM_Hand"
HELD_COLL = "GM_Hand_Held"   # 被捏住的东西（绿方块是占位符，之后可以换成主角等）
GAP = 1.6               # 指节之间的缝（像素）

# ---------------------------------------------------------------- 调色板
# 每种材质从亮到暗；STOPS 是对应的明暗阈值（明暗值 >= 阈值就用这一档）
PALETTE = {
    "wood":  ["#d6c4a2", "#b8a688", "#9c8c74", "#776a5a", "#4d453c"],   # 最后一档是凹槽
    "cuff":  ["#d2bf9e", "#b09e80", "#978770", "#786b5b", "#4d453c"],
    "wrist": ["#625e55", "#524f47", "#45433d", "#383631"],
    "knot":  ["#5e5447", "#51483d"],
    "cube":  ["#80836c", "#636655", "#54574a", "#45483d"],
    "frame": ["#6b6254"],
    "boss":  ["#958470"],
}
STOPS = {
    5: [0.84, 0.55, 0.25, 0.11],
    4: [0.82, 0.52, 0.24],
    2: [0.40],
}
AMBIENT = 0.18          # 背光面也留一点亮
AO_DISTANCE = 1.6       # 环境光遮蔽的探测距离（Blender 单位，= 16 像素）
AO_STRENGTH = 1.0       # 遮蔽压暗多少（0 = 不压，1 = 完全按遮蔽值）
AO_POWER = 2.0          # 遮蔽值先取几次方（越大凹槽越黑，平面不受影响）

# ---------------------------------------------------------------- 尺寸（像素）
CUFF = dict(x=(-38, -12), y=19, z=21, r=4.0)
WRIST = dict(x=(-14, 3), radius=14, r=3.0)     # 手腕关节：沿 x 的圆柱（手转动时看起来不变）
HAND_PIVOT = -4.0                                 # 手腕转轴的位置（hand 骨的头）
PALM = dict(x=(0, 46), y=27, z=17, r=6.0, taper=0.84)   # taper：手腕那头缩到多少
FRAME = dict(x=(-33, -17), z=9, depth=1.0)        # 护腕朝镜头那面的方框
BOSS = dict(half=4.0, depth=1.0)                  # 方框中间的小方块
KNUCKLE_X, KNUCKLE_Z = 47.0, 5.0                  # 指根关节（手掌前沿）
FINGERS = {   # y 位置, 三节长度（关节到关节）, 宽, 厚
    "index":  (-20.0, (25, 19, 16), 13.5, 19.0),
    "middle": (-6.7,  (27, 20, 16), 13.5, 19.0),
    "ring":   (6.7,   (25, 19, 15), 13.0, 18.5),
    "pinky":  (20.0,  (20, 16, 13), 12.5, 17.0),
}
THUMB = dict(base=(20, -24, -16), d=(0.75, -0.40, -0.45), up=(-0.25, -0.75, 0.55),
             lengths=(27, 22, 18), w=15.0, t=16.0)
ARM = dict(len=20, y=15, z=16, r=4.0, joint_r=15, joint_len=6)   # 前臂：一截木头（游戏里顺着手臂方向拉长）+ 护腕后面一圈深色关节
# 游戏里对准用的点（手掌坐标，像素）和挂在哪根骨头上：指尖、拇指尖（捏合点 = 两个指尖的中点）、手心、手腕（前臂从这接出去）
ANCHORS = {
    "anchor_tip": ("index_3", None),            # None = 这根骨头的尾端
    "anchor_thumb": ("thumb_3", None),
    "anchor_palm": ("hand", (23, 0, -17)),
    "anchor_wrist": ("root", (-38, 0, 0)),
}
TAPER = 0.93
SEG_R, TIP_R = 3.0, 6.0                           # 指节圆角 / 指尖圆头
JOINT_R = 0.12                                    # 指节两头绕关节轴的圆角（占厚度的比例）
CUBE_SIZE = 28.0


def lin(h):
    """#rrggbb（sRGB）→ 线性 RGBA，ColorRamp 和 Emission 吃线性值"""
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


def px(*v):
    return Vector(v) * U


# ---------------------------------------------------------------- 清场
def reset():
    old = bpy.data.collections.get(COLL)
    if old:
        for o in list(old.all_objects):
            bpy.data.objects.remove(o, do_unlink=True)
        for c in list(old.children_recursive):
            bpy.data.collections.remove(c)
        bpy.data.collections.remove(old)
    for block in (bpy.data.meshes, bpy.data.armatures, bpy.data.cameras, bpy.data.lights):
        for d in [d for d in block if d.users == 0]:
            block.remove(d)
    for m in [m for m in bpy.data.materials if m.name.startswith("GMH_")]:
        bpy.data.materials.remove(m)
    for a in [a for a in bpy.data.actions if a.name.startswith("GMH_")]:
        bpy.data.actions.remove(a)
    for name in ("Cube", "Light", "Camera"):          # 默认场景里的东西
        o = bpy.data.objects.get(name)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)
    coll = bpy.data.collections.new(COLL)
    bpy.context.scene.collection.children.link(coll)
    return coll


# ---------------------------------------------------------------- 材质
AO_IMAGE = "GMH_AO"      # 每个姿势渲染前先用 Cycles 渲一张同机位的 AO 图，卡通材质按屏幕坐标读它
AO_PROP = "gmh_ao"       # 场景自定义属性：1 = 用 AO 图压暗（渲染时），0 = 不用（视口里看）


def ao_image():
    img = bpy.data.images.get(AO_IMAGE)
    if img is None:
        img = bpy.data.images.new(AO_IMAGE, 4, 4)
        img.pixels[:] = [1.0] * 64
    return img


def math_node(nt, op, loc, a=None, b=None):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.location = loc
    for i, v in enumerate((a, b)):
        if v is not None:
            n.inputs[i].default_value = v
    return n


def toon_material(key):
    """Diffuse → Shader to RGB → 明暗值 ×（环境光遮蔽）→ 常量 ColorRamp → Emission"""
    colors = PALETTE[key]
    m = bpy.data.materials.new("GMH_" + key)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (900, 0)
    em = nt.nodes.new("ShaderNodeEmission")
    em.location = (700, 0)
    nt.links.new(em.outputs[0], out.inputs[0])
    if len(colors) == 1:                              # 方框 / 小方块：单色
        em.inputs[0].default_value = lin(colors[0])
        return m
    link = nt.links.new
    diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
    diff.location = (-700, 200)
    diff.inputs[0].default_value = (1, 1, 1, 1)
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    s2r.location = (-500, 200)
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    bw.location = (-300, 200)
    amb = math_node(nt, "ADD", (-100, 200), b=AMBIENT)
    # 环境光遮蔽：屏幕坐标 → AO 图（最近邻）→ 1 - k * (1 - ao)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    tc.location = (-900, -100)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.location = (-700, -100)
    tex.image = ao_image()
    tex.interpolation = "Closest"
    tex.extension = "EXTEND"
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.location = (-700, -350)
    attr.attribute_type = "VIEW_LAYER"
    attr.attribute_name = AO_PROP
    powr = math_node(nt, "POWER", (-450, -100), b=AO_POWER)
    occl = math_node(nt, "SUBTRACT", (-300, -100), a=1.0)
    k = math_node(nt, "MULTIPLY", (-400, -300), b=AO_STRENGTH)
    kx = math_node(nt, "MULTIPLY", (-200, -150))
    aot = math_node(nt, "SUBTRACT", (0, -150), a=1.0)
    mul = math_node(nt, "MULTIPLY", (200, 0))
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.location = (400, 0)
    ramp.color_ramp.interpolation = "CONSTANT"
    els = ramp.color_ramp.elements
    stops = STOPS[len(colors)]
    els[0].position = 0.0
    els[0].color = lin(colors[-1])
    els[1].position = stops[-1]
    els[1].color = lin(colors[-2])
    for pos, c in zip(reversed(stops[:-1]), reversed(colors[:-2])):
        els.new(pos).color = lin(c)
    link(diff.outputs[0], s2r.inputs[0])
    link(s2r.outputs[0], bw.inputs[0])
    link(bw.outputs[0], amb.inputs[0])
    link(tc.outputs["Window"], tex.inputs[0])
    link(tex.outputs[0], powr.inputs[0])
    link(powr.outputs[0], occl.inputs[1])
    link(attr.outputs["Fac"], k.inputs[0])
    link(occl.outputs[0], kx.inputs[0])
    link(k.outputs[0], kx.inputs[1])
    link(kx.outputs[0], aot.inputs[1])
    link(amb.outputs[0], mul.inputs[0])
    link(aot.outputs[0], mul.inputs[1])
    link(mul.outputs[0], ramp.inputs[0])
    link(ramp.outputs[0], em.inputs[0])
    return m


def ao_material():
    """Cycles 用的覆盖材质：直接把环境光遮蔽值当颜色输出"""
    m = bpy.data.materials.new("GMH_ao_pass")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 32
    ao.inputs[1].default_value = AO_DISTANCE
    nt.links.new(ao.outputs[1], em.inputs[0])
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


# ---------------------------------------------------------------- 网格
def rounded_box(coll, name, dims, r, mat, matrix, segments=4, taper=1.0, edge_r=None):
    """dims：局部 x/y/z 全长（像素）；matrix：放到骨架空间的位置朝向（Blender 单位）；
    taper：局部 -x 那头的横截面缩到多少（手掌靠手腕那头细一点）；
    edge_r(轴, 位置符号) → 这条边的圆角半径（像素），不给就全部用 r"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    radii = None
    if edge_r is not None:                            # 按边设圆角：用倒角权重缩放倒角宽度
        wl = bm.edges.layers.float.get("bevel_weight_edge") or bm.edges.layers.float.new("bevel_weight_edge")
        radii = []
        for e in bm.edges:
            a, b = e.verts[0].co, e.verts[1].co
            axis = max(range(3), key=lambda i: abs(a[i] - b[i]))
            radii.append(edge_r(axis, tuple(0 if i == axis else (1 if a[i] > 0 else -1) for i in range(3))))
        r = max(radii)
        for e, ri in zip(bm.edges, radii):
            e[wl] = ri / r
    for v in bm.verts:
        k = taper if v.co.x < 0 else 1.0
        v.co = Vector((v.co.x * dims[0], v.co.y * dims[1] * k, v.co.z * dims[2] * k)) * U
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob.matrix_world = matrix
    bev = ob.modifiers.new("Bevel", "BEVEL")
    bev.width = min(r, min(dims) * taper * 0.49) * U
    bev.segments = segments
    bev.limit_method = "WEIGHT" if radii else "NONE"
    bev.harden_normals = True
    return ob


def cylinder(coll, name, radius, length, mat, matrix, segments=16, bevel=0.0):
    """沿局部 x 轴的圆柱（指节轴、手腕关节）"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius * U, radius2=radius * U,
                          depth=length * U, matrix=Matrix.Rotation(math.pi / 2, 4, "Y"))
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


def frame_matrix(origin, x, y, z):
    m = Matrix.Identity(4)
    for i, axis in enumerate((x, y, z)):
        m[0][i], m[1][i], m[2][i] = axis
    m.translation = origin
    return m


def segment_edges(w, t, body, last):
    """指节的圆角：两头绕关节轴的那两条边圆得厉害（弯的时候缝不会张开），指尖那头四条边都圆"""
    joint_r = min(JOINT_R * t, 0.45 * body)
    tip_r = min(TIP_R, 0.45 * min(w, t), 0.45 * body)

    def r(axis, sign):
        if axis == 1:                                 # 沿手指方向的四条长边
            return SEG_R
        if last and sign[1] > 0:                      # 指尖那头
            return tip_r
        return joint_r if axis == 0 else SEG_R        # axis 0 = 平行于关节轴
    return r


# ---------------------------------------------------------------- 骨骼
def chain_axes(d, up):
    d = Vector(d).normalized()
    up = Vector(up)
    up = (up - d * up.dot(d)).normalized()
    return d, up, d.cross(up)                         # 骨骼的 Y（沿指）、Z（指背）、X（弯曲轴）


def build():
    coll = reset()
    mats = {k: toon_material(k) for k in PALETTE}
    ao_material()

    arm_data = bpy.data.armatures.new("GMH_Rig")
    arm = bpy.data.objects.new("GM_Hand_Rig", arm_data)
    coll.objects.link(arm)
    arm.show_in_front = True
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    root = eb.new("root")
    root.head, root.tail = px(0, 0, 0), px(20, 0, 0)
    root.align_roll(Vector((0, 0, 1)))
    hand = eb.new("hand")                              # 手腕：手掌和手指都挂在它下面，护腕不动
    hand.head, hand.tail = px(HAND_PIVOT, 0, 0), px(HAND_PIVOT + 20, 0, 0)
    hand.align_roll(Vector((0, 0, 1)))
    hand.parent = root

    chains = {}                                        # 名字 → [(骨名, 头, d, up, x轴, 长度, 宽, 厚)]
    def add_chain(name, base, d, up, lengths, w, t):
        d, up, hx = chain_axes(d, up)
        p = Vector(base)
        parent = hand
        segs = []
        for i, L in enumerate(lengths, 1):
            b = eb.new(f"{name}_{i}")
            b.head, b.tail = p * U, (p + d * L) * U
            b.align_roll(up)
            b.parent = parent
            b.use_connect = i > 1
            k = TAPER ** (i - 1)
            segs.append((b.name, p.copy(), d, up, hx, L, w * k, t * k))
            parent, p = b, p + d * L
        chains[name] = segs

    for name, (y, lengths, w, t) in FINGERS.items():
        add_chain(name, (KNUCKLE_X, y, KNUCKLE_Z), (1, 0, 0), (0, 0, 1), lengths, w, t)
    add_chain("thumb", THUMB["base"], THUMB["d"], THUMB["up"], THUMB["lengths"], THUMB["w"], THUMB["t"])
    bpy.ops.object.mode_set(mode="OBJECT")

    def attach(ob, bone):
        """把物体挂到骨头上，保持现在的世界位置（骨骼此时是静止姿势）"""
        pb = arm.pose.bones[bone]
        world = ob.matrix_world.copy()
        ob.parent = arm
        ob.parent_type = "BONE"
        ob.parent_bone = bone
        ob.matrix_parent_inverse = (arm.matrix_world @ pb.matrix @ Matrix.Translation((0, pb.bone.length, 0))).inverted()
        ob.matrix_world = world

    # 护腕、手腕、手掌挂在 root 上
    def centered(x0, x1, y, z):
        return Matrix.Translation(px((x0 + x1) / 2, 0, 0)), ((x1 - x0), 2 * y, 2 * z)
    for nm, spec, mat, bone in (("cuff", CUFF, "cuff", "root"), ("palm", PALM, "wood", "hand")):
        mtx, dims = centered(*spec["x"], spec["y"], spec["z"])
        attach(rounded_box(coll, "GMH_" + nm, dims, spec["r"], mats[mat], mtx, taper=spec.get("taper", 1.0)), bone)
    wx = WRIST["x"]
    attach(cylinder(coll, "GMH_wrist", WRIST["radius"], wx[1] - wx[0], mats["wrist"],
                    Matrix.Translation(px((wx[0] + wx[1]) / 2, 0, 0)), segments=32, bevel=WRIST["r"]), "root")
    fx = (FRAME["x"][0] + FRAME["x"][1]) / 2
    fw = FRAME["x"][1] - FRAME["x"][0]
    face_y = -CUFF["y"]
    attach(rounded_box(coll, "GMH_cuff_frame", (fw, 2 * FRAME["depth"], 2 * FRAME["z"]), 0.6, mats["frame"],
                       Matrix.Translation(px(fx, face_y, 0)), segments=1), "root")
    attach(rounded_box(coll, "GMH_cuff_boss", (2 * BOSS["half"], 2 * (FRAME["depth"] + BOSS["depth"]), 2 * BOSS["half"]),
                       0.6, mats["boss"], Matrix.Translation(px(fx, face_y, 0)), segments=1), "root")

    # 手指：每节一个圆角盒子 + 关节处一根暗色的轴
    for name, segs in chains.items():
        for i, (bone, head, d, up, hx, L, w, t) in enumerate(segs):
            last = i == len(segs) - 1
            body = L - GAP / 2 if last else L - GAP
            center = head + d * (GAP / 2 + body / 2)
            ob = rounded_box(coll, f"GMH_{bone}", (w, body, t), SEG_R, mats["wood"],
                             frame_matrix(center * U, hx, d, up), segments=5,
                             edge_r=segment_edges(w, t, body, last))
            attach(ob, bone)
            pin = cylinder(coll, f"GMH_{bone}_pin", 0.30 * t, 0.78 * w, mats["knot"], frame_matrix(head * U, hx, d, up))
            attach(pin, bone)

    # 前臂：护腕后面一圈深色关节，再接一截木头；木头的原点在靠护腕那头，游戏里把它沿 -X 拉长到画面外
    ax = CUFF["x"][0]
    attach(cylinder(coll, "GMH_arm_joint", ARM["joint_r"], ARM["joint_len"], mats["wrist"],
                    Matrix.Translation(px(ax - ARM["joint_len"] / 2, 0, 0)), segments=32, bevel=2.0), "root")
    log = rounded_box(coll, "GMH_arm", (ARM["len"], 2 * ARM["y"], 2 * ARM["z"]), ARM["r"], mats["wood"],
                      Matrix.Translation(px(ax - ARM["joint_len"], 0, 0)))
    for v in log.data.vertices:
        v.co.x -= ARM["len"] / 2 * U
    attach(log, "root")

    # 对准点：空物体挂在骨头上，跟着姿势走；游戏从 glb 里按名字读
    for name, (bone, at) in ANCHORS.items():
        e = bpy.data.objects.new(name, None)
        e.empty_display_type = "SPHERE"
        e.empty_display_size = 2 * U
        coll.objects.link(e)
        pb = arm.pose.bones[bone]
        e.matrix_world = Matrix.Translation(px(*at) if at else arm.matrix_world @ pb.tail)
        attach(e, bone)

    # 被捏住的绿方块：不挂骨头，每个姿势按手掌坐标摆位置
    held = bpy.data.collections.new(HELD_COLL)       # 单独一个集合：渲「空手捏」时整个关掉
    coll.children.link(held)
    cube = rounded_box(held, "GMH_cube", (CUBE_SIZE,) * 3, 2.5, mats["cube"], Matrix.Identity(4))
    return arm, cube, chains


# ---------------------------------------------------------------- 姿势
# 每节 (弯曲, 张开, 扭转) 角度：弯曲 > 0 朝手心，< 0 往手背翘；扭转 > 0 手背转向镜头
# 也可以写 {"aim": (x, y, z)}：让这一节指向手掌坐标里的这个方向（+X 指尖、+Z 手背、-Y 拇指侧）
# hand 是手腕（整只手相对护腕转），rot 是整个骨架（连护腕）的朝向，mirror 是上下镜像（手心朝上）
FIST = [(85, 0, 0), (100, 0, 0), (65, 0, 0)]
POSES = {
    "point": dict(frame=1, bones={
        "hand": [(10, 0, -45)],                       # 手心朝镜头翻一点，看得到拳心
        "index": [(-3, 0, 0), (2, 0, 0), (2, 0, 0)],
        "middle": FIST, "ring": FIST, "pinky": FIST,
        "thumb": {"reach": (62, -27, -16), "tip": (1, 0.3, 0), "pole": (0, -1, -0.5)},   # 横压在拳头上
    }, rot=(0, 0, 0), mirror=False, cube=None),
    "pinch": dict(frame=2, bones={
        "hand": [(-15, 0, -10)],
        "index": {"reach": (84, -20, -4), "tip": (0.35, 0, -1), "pole": (0, 0, 1)},
        "middle": FIST, "ring": FIST, "pinky": FIST,
        "thumb": {"reach": (78, -22, -30), "tip": (1, 0, 0.25), "pole": (0, -0.4, -1)},
    }, rot=(0, 0, 0), mirror=False, cube=(95, -20, -18)),
    "open": dict(frame=3, bones={
        "hand": [(0, 8, -14)],
        "index": [(4, -10, 0), (12, 0, 0), (20, 0, 0)],
        "middle": [(4, -3, 0), (12, 0, 0), (20, 0, 0)],
        "ring": [(4, 4, 0), (12, 0, 0), (20, 0, 0)],
        "pinky": [(4, 11, 0), (12, 0, 0), (20, 0, 0)],
        # 这个姿势整体上下镜像（手心朝上），所以 aim 的 z 要反着写：-z 是镜像后的「上」
        "thumb": [{"aim": (0.55, -0.25, -0.8)}, {"aim": (0.85, -0.1, -0.5)}, {"aim": (0.97, 0, -0.15)}],
    }, rot=(-12, 0, 0), mirror=True, cube=None),
    "fist": dict(frame=4, bones={
        "hand": [(0, 0, -30)],
        "index": FIST, "middle": FIST, "ring": FIST, "pinky": FIST,
        "thumb": {"reach": (50, -22, -31), "tip": (1, 0.3, -0.2), "pole": (0, -1, -0.6)},   # 横压在攥起来的四根手指前面
    }, rot=(0, 0, 0), mirror=False, cube=None),
    # 捏布：食指往手心弯，拇指尖迎上来和食指尖合拢（中间夹着一层布）；其它三根松松地弯着。游戏里从上面伸下来拎主角的后领
    "grip": dict(frame=5, bones={
        "hand": [(0, 0, -20)],
        "index": [(20, 0, 0), (35, 0, 0), (40, 0, 0)],
        "middle": [(55, 0, 0), (70, 0, 0), (45, 0, 0)],
        "ring": [(60, 0, 0), (75, 0, 0), (45, 0, 0)],
        "pinky": [(65, 0, 0), (80, 0, 0), (45, 0, 0)],
        "thumb": {"reach": (79, -24, -33), "tip": (1, 0.15, -0.5), "pole": (0, -1, -0.3)},
    }, rot=(0, 0, 0), mirror=False, cube=None),
}


def aim_rotation(arm, pb, direction, twist=0.0):
    """让这节指向某个方向（按手掌的坐标：+X 指尖、+Z 手背、-Y 拇指侧），返回骨骼的局部旋转"""
    pb.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    hb = arm.pose.bones["hand"]
    r_hand = hb.matrix.to_3x3().normalized() @ hb.bone.matrix_local.to_3x3().normalized().inverted()
    m0 = pb.matrix.to_3x3().normalized()
    rw = m0.col[1].rotation_difference(r_hand @ Vector(direction).normalized()).to_matrix()
    local = m0.inverted() @ rw @ m0
    return (local @ Matrix.Rotation(math.radians(twist), 3, "Y")).to_euler("XYZ")


def chain_base(name):
    if name == "thumb":
        return Vector(THUMB["base"]), THUMB["lengths"]
    y, lengths, _, _ = FINGERS[name]
    return Vector((KNUCKLE_X, y, KNUCKLE_Z)), lengths


def reach(name, target, tip, pole):
    """三节的链：指尖落在 target、最后一节朝 tip 方向，中间关节往 pole 那边拱，返回三节的朝向"""
    base, (l1, l2, l3) = chain_base(name)
    d3 = Vector(tip).normalized()
    p2 = Vector(target) - d3 * l3
    v = p2 - base
    dist = min(v.length, l1 + l2 - 1e-3)
    vn = v.normalized()
    pole = Vector(pole)
    side = (pole - vn * pole.dot(vn)).normalized()
    a = math.acos(max(-1.0, min(1.0, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist))))
    d1 = vn * math.cos(a) + side * math.sin(a)
    d2 = (p2 - (base + d1 * l1)).normalized()
    return [{"aim": tuple(d)} for d in (d1, d2, d3)]


def apply_pose(arm, cube, name, key=False):
    """segs 里每节可以写 (弯曲, 张开, 扭转)，也可以写 {"aim": 方向, "twist": 角度}"""
    p = POSES[name]
    f = p["frame"]
    arm.rotation_euler = (0, 0, 0)
    arm.scale = (1, 1, 1)
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)
    for chain, segs in p["bones"].items():
        if isinstance(segs, dict):                    # {"reach": 指尖位置, "tip": 最后一节朝向, "pole": 拱的方向}
            segs = reach(chain, segs["reach"], segs["tip"], segs["pole"])
        for i, seg in enumerate(segs, 1):
            pb = arm.pose.bones[chain if chain == "hand" else f"{chain}_{i}"]
            if isinstance(seg, dict):
                pb.rotation_euler = aim_rotation(arm, pb, seg["aim"], seg.get("twist", 0.0))
            else:
                flex, spread, twist = seg
                pb.rotation_euler = Euler((math.radians(-flex), math.radians(twist), math.radians(spread)), "XYZ")
    arm.rotation_euler = Euler([math.radians(a) for a in p["rot"]], "XYZ")
    arm.scale = (1, 1, -1) if p["mirror"] else (1, 1, 1)
    bpy.context.view_layer.update()
    cube.hide_render = cube.hide_viewport = p["cube"] is None
    if p["cube"] is not None:                         # 方块的位置按手掌坐标写，朝向只跟整个骨架走（不跟手腕歪）
        hb = arm.pose.bones["hand"]
        at = arm.matrix_world @ hb.matrix @ hb.bone.matrix_local.inverted() @ px(*p["cube"])
        rot = arm.rotation_euler.to_matrix() @ Euler(
            [math.radians(a) for a in p.get("cube_rot", (0, 0, 0))], "XYZ").to_matrix()
        cube.matrix_world = Matrix.Translation(at) @ rot.to_4x4()
    if key:
        for pb in arm.pose.bones:
            pb.keyframe_insert("rotation_euler", frame=f)
        arm.keyframe_insert("rotation_euler", frame=f)
        arm.keyframe_insert("scale", frame=f)
        cube.keyframe_insert("location", frame=f)
        cube.keyframe_insert("rotation_euler", frame=f)
        cube.keyframe_insert("hide_render", frame=f)
        cube.keyframe_insert("hide_viewport", frame=f)


def key_all_poses(arm, cube):
    prefs = bpy.context.preferences.edit
    old = prefs.keyframe_new_interpolation_type
    prefs.keyframe_new_interpolation_type = "CONSTANT"
    try:
        for name in POSES:
            apply_pose(arm, cube, name, key=True)
    finally:
        prefs.keyframe_new_interpolation_type = old
    for ob, nm in ((arm, "GMH_poses_rig"), (cube, "GMH_poses_cube")):
        if ob.animation_data and ob.animation_data.action:
            ob.animation_data.action.name = nm
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, len(POSES)
    sc.frame_set(1)


# ---------------------------------------------------------------- 相机、灯、渲染设置
CANVAS = (200, 144)          # 最终像素画布（之后再裁边）
SUPER = 4                    # 先按 4 倍渲染，再 4x4 一块缩小
CAM_TARGET = (34, 0, -2)     # 像素
CAM_ELEV = 18                # 相机往下看的角度
KEY_DIR = (-0.45, 0.60, 0.65)   # 主光（相机坐标：左 / 上 / 朝镜头）：左上前方
FILL_DIR = (0.50, -0.10, 1.0)   # 补光：从镜头方向略偏右下，不投影
KEY_POWER, FILL_POWER = math.pi * 0.95, math.pi * 0.20   # 太阳强度要乘 π，正对光的面明暗值才是 1


def setup_scene(coll):
    sc = bpy.context.scene
    cam_data = bpy.data.cameras.new("GMH_Cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = CANVAS[0] * U
    cam_data.clip_start, cam_data.clip_end = 0.1, 200
    cam = bpy.data.objects.new("GMH_Cam", cam_data)
    coll.objects.link(cam)
    e = math.radians(CAM_ELEV)
    cam.rotation_euler = Euler((math.pi / 2 - e, 0, 0), "XYZ")
    cam.location = px(*CAM_TARGET) + Vector((0, -40 * math.cos(e), 40 * math.sin(e)))
    sc.camera = cam
    cam_rot = cam.rotation_euler.to_matrix()

    def sun(name, d, power, shadow):
        ld = bpy.data.lights.new(name, "SUN")
        ld.energy = power
        ld.angle = 0.0                                   # 硬阴影，单采样也没有噪点
        ld.use_shadow = shadow
        ob = bpy.data.objects.new(name, ld)
        coll.objects.link(ob)
        w = (cam_rot @ Vector(d)).normalized()          # 相机坐标 → 世界坐标（指向光源）
        ob.rotation_euler = w.to_track_quat("Z", "Y").to_euler()
        ob.location = px(*CAM_TARGET) + w * 10
        return ob
    sun("GMH_Key", KEY_DIR, KEY_POWER, True)
    sun("GMH_Fill", FILL_DIR, FILL_POWER, False)

    world = sc.world or bpy.data.worlds.new("World")
    sc.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0, 0, 0, 1)
    bg.inputs[1].default_value = 0.0

    r = sc.render
    r.engine = "BLENDER_EEVEE"
    r.resolution_x, r.resolution_y = CANVAS[0] * SUPER, CANVAS[1] * SUPER
    r.resolution_percentage = 100
    r.film_transparent = True
    r.filter_size = 0.0
    r.dither_intensity = 0.0
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGBA"
    r.image_settings.color_depth = "8"
    sc.eevee.taa_render_samples = 1
    sc[AO_PROP] = 0.0
    sc.cycles.samples = 64
    sc.cycles.use_denoising = False
    sc.cycles.filter_width = 0.01                    # Cycles 也按像素中心采样，和 EEVEE 的像素对齐
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0
    sc.view_settings.gamma = 1
    return cam


if __name__ == "__main__":
    arm, cube, _ = build()
    setup_scene(bpy.data.collections[COLL])
    key_all_poses(arm, cube)
    print("built")
