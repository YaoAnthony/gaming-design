"""3D 世界的场景件（world3d/LevelView 摆的东西）：木框的梁和角块、桌面的木板条 / 前沿 / 桌裙 / 车木桌腿、
三种比例的木箱、悬空的木板、头顶那盏吊灯。参考设计稿里「桌上的小舞台」那张图。

尺寸单位 = 像素，10 像素 = 游戏里的 1 格（导出后 glb 的 1 单位 = 1 格），1 像素 = 0.1 Blender 单位。
每件东西挂在一个同名的空物体下面，建模时横着排开（烤环境光遮蔽时互不遮挡），导出前再挪回原点；
游戏里按名字取出来克隆、按关卡数据缩放（哪条轴可以拉长见每件的注释）。朝 -Y，+Z 朝上。

    blender -P build_props.py                 建模
    blender -b -P build_props.py -- --export  导出到 game-master/src/asset/model/props.glb
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
import woodkit as W  # noqa: E402

COLL = "Props"
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "game-master", "src", "asset", "model", "props.glb"))
GAP = 90   # 建模时每件东西隔多远（像素）

# 材质名 → 颜色从亮到暗（和 palette.ts 的 PROPS_PALETTE 一致）
PALETTE = {
    "frame": ["#b9805f", "#9a6648", "#754b35"],
    "corner": ["#8f5a44", "#73483a", "#55342a"],
    "nail": ["#4a4440", "#2e2a28"],
    "deck": ["#4c6a63", "#3d5651", "#2d403c"],
    "lip": ["#5f7d75", "#4c6a63", "#3d5651"],
    "leg": ["#8a7355", "#6d5a43", "#4f4131"],
    "crate": ["#cfae80", "#b7956a", "#8f734f"],
    "crate_edge": ["#9a7b55", "#7f6344", "#5c4731"],
    "crate_dark": ["#3a2f24", "#241d17"],
    "plank": ["#c7a678", "#a98a5e", "#806744"],
    "lamp_shade": ["#5d6a5e", "#434d44", "#2d342e"],
    "lamp_inner": ["#f1e6c8", "#d9ccaa"],
    "lamp_cord": ["#2a2826", "#1b1a19"],
    "lamp_bulb": ["#fff3d0"],
    "spool": ["#d8b98c", "#c9a97c", "#a0865e"],
    "thread": ["#b8403a", "#8f2f2b", "#5e1f1c"],
    "steel": ["#b9c0c6", "#8f979e", "#5f666c"],
    "handle": ["#3a3634", "#262322", "#161413"],
    "glass": ["#b9cfd0", "#8fb0b2", "#5f8587"],
    "lid": ["#8a7355", "#6d5a43", "#4f4131"],
    "pin_red": ["#d64b3f", "#a3362e"],
    "pin_blue": ["#3f7fd6", "#2e5ea3"],
    "pin_yellow": ["#e3c04a", "#b09234"],
    "shaving": ["#ecd7ad", "#d8bd8c", "#b29a6c"],
}

PROPS = []   # (名字, 建模函数)


def prop(fn):
    PROPS.append((fn.__name__, fn))
    return fn


def along(axis, r):
    """只给顺着某根轴的边倒圆角（这件东西要沿别的轴拉长时用：拉长的那头不能有圆角）"""
    return lambda a, _sign: r if a == axis else 0.0


def rbox(coll, name, size, at, mat, r, axis=None, rot=(0, 0, 0)):
    m = Matrix.Translation(W.px(*at)) @ W.Euler([math.radians(a) for a in rot], "XYZ").to_matrix().to_4x4()
    return W.rounded_box(coll, name, size, r, mat, m, edge_r=along(axis, r) if axis is not None else None)


def cone(coll, name, r_bottom, r_top, z0, z1, mat, flip=False, segments=24):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=segments, radius1=r_bottom * W.U, radius2=r_top * W.U, depth=(z1 - z0) * W.U)
    if flip:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob.matrix_world = Matrix.Translation(W.px(0, 0, (z0 + z1) / 2))
    return ob


# ---------------------------------------------------------------- 木框
@prop
def frame_beam(c, M):
    """一截梁：顺着 x，长 10（游戏里沿 x 拉成屏幕的宽 / 高），截面 14 高 × 12 厚；正面中间一道凸起的线脚"""
    rbox(c, "beam", (10, 12, 14), (0, 0, 0), M["frame"], 1.6, axis=0)
    rbox(c, "beam_rail", (10, 2.2, 4.5), (0, -6.6, 0), M["frame"], 1.0, axis=0)


@prop
def frame_corner(c, M):
    """角块：20 见方、15 厚，正面一块方板钉四颗钉子"""
    rbox(c, "block", (20, 15, 20), (0, 0, 0), M["corner"], 2.6)
    rbox(c, "plate", (13, 1.6, 13), (0, -8.2, 0), M["corner"], 0.8)
    for x in (-4.6, 4.6):
        for z in (-4.6, 4.6):
            W.sphere(c, f"nail_{x:+.0f}{z:+.0f}", 1.3, (x, -8.8, z), M["nail"], segments=10, rings=6)


# ---------------------------------------------------------------- 桌面
@prop
def deck_plank(c, M):
    """桌面的一条木板：30 宽（x）、12 厚、10 长（沿 y 拉成桌面的进深）；长边倒圆角，拼起来就是板缝"""
    rbox(c, "plank", (30, 10, 12), (0, 0, 0), M["deck"], 1.6, axis=1)


@prop
def deck_lip(c, M):
    """桌面前沿的压条：沿 x 拉长"""
    rbox(c, "lip", (10, 4, 4), (0, 0, 0), M["lip"], 1.3, axis=0)


@prop
def desk_apron(c, M):
    """桌面下面的裙板：沿 x 拉长，底边一道线脚"""
    rbox(c, "apron", (10, 3, 16), (0, 0, 0), M["leg"], 1.0, axis=0)
    rbox(c, "apron_bead", (10, 1.6, 2.4), (0, -2.0, -6.5), M["leg"], 0.7, axis=0)


@prop
def desk_leg(c, M):
    """车木的桌腿（不拉长）：方头、颈、鼓肚、圈、方脚；底在 z = 0"""
    rbox(c, "top", (16, 16, 6), (0, 0, 27), M["leg"], 1.6)
    W.cylinder(c, "neck", 4.6, 5, M["leg"], Matrix.Translation(W.px(0, 0, 21.5)), axis="Z", bevel=1.0)
    W.sphere(c, "belly", 7.2, (0, 0, 14.5), M["leg"], segments=20, rings=12)
    W.cylinder(c, "ring", 6.2, 2.6, M["leg"], Matrix.Translation(W.px(0, 0, 7.5)), axis="Z", bevel=0.8)
    W.cylinder(c, "shank", 4.0, 4, M["leg"], Matrix.Translation(W.px(0, 0, 5)), axis="Z")
    rbox(c, "foot", (14, 14, 4), (0, 0, 2), M["leg"], 1.4)


# ---------------------------------------------------------------- 木箱
E, G, T, P = 3.0, 1.0, 1.6, 0.8   # 边框条宽、板条缝、板条厚、边框比板条凸出多少


def crate(c, M, w, h, d):
    """木箱：暗色的芯，四面钉横板条、顶上钉板条，十二条边包边框，前后左右各一个 X，钉子；底在 z = 0"""
    rbox(c, "core", (w - 1.2, d - 1.2, h - 1.2), (0, 0, h / 2), M["crate_dark"], 0)
    n = max(1, round((h - 2 * E) / 9))
    sh = (h - 2 * E - (n - 1) * G) / n
    for i in range(n):
        z = E + sh / 2 + i * (sh + G)
        for s, y in (("f", -d / 2), ("b", d / 2)):
            rbox(c, f"slat_{s}{i}", (w - 2 * E + 1, T, sh), (0, y, z), M["crate"], 0.5, axis=0)
        for s, x in (("l", -w / 2), ("r", w / 2)):
            rbox(c, f"slat_{s}{i}", (T, d - 2 * E + 1, sh), (x, 0, z), M["crate"], 0.5, axis=1)
    n = max(1, round((w - 2 * E) / 9))
    sw = (w - 2 * E - (n - 1) * G) / n
    for i in range(n):
        rbox(c, f"slat_t{i}", (sw, d - 2 * E + 1, T), (-w / 2 + E + sw / 2 + i * (sw + G), 0, h), M["crate"], 0.5, axis=1)
    es = E + P   # 边框条截面（凸出 P）
    ox, oy = w / 2 - E / 2 + P / 2, d / 2 - E / 2 + P / 2   # 边框条的中线离中心多远
    for x in (-1, 1):
        for y in (-1, 1):
            rbox(c, f"edge_v{x}{y}", (es, es, h + P), (x * ox, y * oy, h / 2 + P / 2), M["crate_edge"], 0.9, axis=2)
    for i, z in enumerate((E / 2 - P / 2, h - E / 2 + P / 2)):
        for y in (-1, 1):
            rbox(c, f"edge_x{i}{y}", (w + 2 * P, es, es), (0, y * oy, z), M["crate_edge"], 0.9, axis=0)
        for x in (-1, 1):
            rbox(c, f"edge_y{i}{x}", (es, d + 2 * P, es), (x * ox, 0, z), M["crate_edge"], 0.9, axis=1)
    # X 条：前后两面绕 y 转，左右两面绕 x 转；两端各一颗钉子
    for s, y, face_w in (("f", -d / 2 - T - T / 2, w), ("b", d / 2 + T + T / 2, w)):
        a = math.degrees(math.atan2(h - 2 * E, face_w - 2 * E))
        ln = math.hypot(face_w - 2 * E, h - 2 * E) - 1.5
        for k in (1, -1):
            rbox(c, f"x_{s}{k}", (ln, T, 2.6), (0, y, h / 2), M["crate_edge"], 0.6, rot=(0, k * a, 0))
            for e in (1, -1):
                W.sphere(c, f"nail_{s}{k}{e}", 0.9, (e * (ln / 2 - 1.5) * math.cos(math.radians(a)), y - T / 2 * (1 if y < 0 else -1), h / 2 - e * k * (ln / 2 - 1.5) * math.sin(math.radians(a))), M["nail"], segments=8, rings=5)
    for s, x, face_w in (("l", -w / 2 - T - T / 2, d), ("r", w / 2 + T + T / 2, d)):
        a = math.degrees(math.atan2(h - 2 * E, face_w - 2 * E))
        ln = math.hypot(face_w - 2 * E, h - 2 * E) - 1.5
        for k in (1, -1):
            rbox(c, f"x_{s}{k}", (T, ln, 2.6), (x, 0, h / 2), M["crate_edge"], 0.6, rot=(k * a, 0, 0))


@prop
def crate_cube(c, M):
    """正方的木箱 30 × 30 × 30（游戏里 3 格）"""
    crate(c, M, 30, 30, 30)


@prop
def crate_half(c, M):
    """矮一点的木箱 30 × 20 × 30"""
    crate(c, M, 30, 20, 30)


@prop
def crate_flat(c, M):
    """扁的木箱 30 × 10 × 30"""
    crate(c, M, 30, 10, 30)


# ---------------------------------------------------------------- 木板
@prop
def plank(c, M):
    """悬空的木板 40 × 40、厚 5：三块板并排，底下两根横档；底在 z = 0"""
    for i, y in enumerate((-14, 14)):
        rbox(c, f"batten{i}", (40, 4, 1.8), (0, y, 0.9), M["crate_edge"], 0.6)
    for i, x in enumerate((-13.3, 0, 13.3)):
        rbox(c, f"board{i}", (12.4, 40, 3.2), (x, 0, 1.8 + 1.6), M["plank"], 0.9)
    for x in (-13.3, 0, 13.3):
        for y in (-14, 14):
            W.sphere(c, f"nail{x:+.0f}{y:+.0f}", 0.8, (x, y, 5.0), M["nail"], segments=8, rings=5)


# ---------------------------------------------------------------- 吊灯
@prop
def lamp(c, M):
    """头顶的吊灯：电线从上面垂下来，珐琅灯罩，灯泡露在罩子下面。原点在灯泡中心（聚光灯挂这）"""
    W.cylinder(c, "cord", 0.7, 60, M["lamp_cord"], Matrix.Translation(W.px(0, 0, 44)), axis="Z", segments=8)
    W.cylinder(c, "cap", 3.2, 5, M["lamp_cord"], Matrix.Translation(W.px(0, 0, 15.5)), axis="Z", bevel=0.8)
    cone(c, "shade", 24, 5, 2, 14, M["lamp_shade"])
    cone(c, "shade_in", 23.4, 4.6, 2.2, 13.8, M["lamp_inner"], flip=True)
    W.cylinder(c, "rim", 24.3, 1.4, M["lamp_shade"], Matrix.Translation(W.px(0, 0, 2.3)), axis="Z", segments=24, bevel=0.5)
    W.cylinder(c, "socket", 2.6, 6, M["lamp_cord"], Matrix.Translation(W.px(0, 0, 4)), axis="Z")
    W.sphere(c, "bulb", 4.2, (0, 0, 0), M["lamp_bulb"], segments=20, rings=12)


# ---------------------------------------------------------------- 桌上的杂物
def torus(coll, name, major, minor, at, mat, rot=(0, 0, 0), segments=24, rings=10):
    """圆环（像素）：剪刀的把手、木屑的卷"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    for i in range(segments):
        a = i / segments * 2 * math.pi
        for j in range(rings):
            b = j / rings * 2 * math.pi
            r = major + minor * math.cos(b)
            bm.verts.new((r * math.cos(a) * W.U, r * math.sin(a) * W.U, minor * math.sin(b) * W.U))
    bm.verts.ensure_lookup_table()
    for i in range(segments):
        for j in range(rings):
            v = [bm.verts[i * rings + j], bm.verts[((i + 1) % segments) * rings + j],
                 bm.verts[((i + 1) % segments) * rings + (j + 1) % rings], bm.verts[i * rings + (j + 1) % rings]]
            bm.faces.new(v)
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob.matrix_world = Matrix.Translation(W.px(*at)) @ W.Euler([math.radians(a) for a in rot], "XYZ").to_matrix().to_4x4()
    return ob


@prop
def spool(c, M):
    """线轴：上下两片木盘，中间缠着红线；底在 z = 0，16 高"""
    W.cylinder(c, "flange_b", 9, 2, M["spool"], Matrix.Translation(W.px(0, 0, 1)), axis="Z", segments=24, bevel=0.6)
    W.cylinder(c, "flange_t", 9, 2, M["spool"], Matrix.Translation(W.px(0, 0, 15)), axis="Z", segments=24, bevel=0.6)
    W.cylinder(c, "barrel", 4.5, 12, M["spool"], Matrix.Translation(W.px(0, 0, 8)), axis="Z", segments=16)
    for i in range(6):
        W.cylinder(c, f"thread{i}", 6.4 - 0.15 * (i % 2), 1.6, M["thread"], Matrix.Translation(W.px(0, 0, 3 + i * 1.9)), axis="Z", segments=20, bevel=0.5)
    W.cylinder(c, "tail", 0.5, 14, M["thread"], Matrix.Translation(W.px(10, -6, 0.5)) @ W.Euler((0, math.radians(90), math.radians(-30)), "XYZ").to_matrix().to_4x4(), axis="X", segments=6)


@prop
def scissors(c, M):
    """剪刀：平放在桌上、半张着；两片刀叶在枢轴上交叉，尾端两个圆环把手。42 长"""
    for k, (name, z) in enumerate((("blade_a", 0.7), ("blade_b", 1.9))):
        a = 9 * (1 if k == 0 else -1)
        m = Matrix.Translation(W.px(0, 0, z)) @ Matrix.Rotation(math.radians(a), 4, "Z")
        W.rounded_box(c, name, (24, 3.6, 1.2), 0.5, M["steel"], m @ Matrix.Translation(W.px(-12, 0, 0)), taper=0.2)
        W.rounded_box(c, f"{name}_shank", (7, 2.4, 1.2), 0.5, M["steel"], m @ Matrix.Translation(W.px(3.5, 0, 0)))
        ring = torus(c, f"{name}_ring", 4.2, 1.1, (11.5, 0, z), M["handle"])
        ring.matrix_world = m @ Matrix.Translation(W.px(11.5, 0, 0))
    W.sphere(c, "pivot", 1.3, (0, 0, 1.9), M["handle"], segments=10, rings=6)
    W.cylinder(c, "pivot_shaft", 0.8, 2.6, M["handle"], Matrix.Translation(W.px(0, 0, 1.3)), axis="Z", segments=8)


@prop
def pin_jar(c, M):
    """图钉罐：一只玻璃罐，里面插着几枚图钉露出来；底在 z = 0，22 高"""
    W.cylinder(c, "jar", 9, 20, M["glass"], Matrix.Translation(W.px(0, 0, 10)), axis="Z", segments=24, bevel=1.2)
    W.cylinder(c, "jar_rim", 9.6, 2.4, M["glass"], Matrix.Translation(W.px(0, 0, 19.2)), axis="Z", segments=24, bevel=0.6)
    W.cylinder(c, "jar_base", 8.2, 1.2, M["lid"], Matrix.Translation(W.px(0, 0, 0.6)), axis="Z", segments=24)
    heads = ["pin_red", "pin_blue", "pin_yellow", "pin_red", "pin_blue", "pin_yellow", "pin_red"]
    for i, hm in enumerate(heads):
        a = i / len(heads) * 2 * math.pi
        r = 3.5 if i % 2 else 5.5
        tilt = 18 + 8 * (i % 3)
        base = (r * math.cos(a), r * math.sin(a), 13)
        m = Matrix.Translation(W.px(*base)) @ Matrix.Rotation(a, 4, "Z") @ Matrix.Rotation(math.radians(tilt), 4, "Y")
        W.cylinder(c, f"pin{i}", 0.45, 11, M["steel"], m @ Matrix.Translation(W.px(0, 0, 5.5)), axis="Z", segments=6)
        W.cylinder(c, f"pinhead{i}", 1.6, 2.2, M[hm], m @ Matrix.Translation(W.px(0, 0, 12.1)), axis="Z", segments=12, bevel=0.5)


@prop
def shavings(c, M):
    """地上散的木屑：一小片（30 × 30），几根薄木条和几个卷；没有碰撞"""
    import random
    rnd = random.Random(7)
    for i in range(7):
        x, y = rnd.uniform(-12, 12), rnd.uniform(-12, 12)
        W.rounded_box(c, f"strip{i}", (rnd.uniform(5, 9), rnd.uniform(1.6, 2.6), 0.5), 0.2, M["shaving"],
                      Matrix.Translation(W.px(x, y, 0.25)) @ Matrix.Rotation(rnd.uniform(0, math.pi), 4, "Z"))
    for i in range(5):
        x, y = rnd.uniform(-12, 12), rnd.uniform(-12, 12)
        torus(c, f"curl{i}", rnd.uniform(1.6, 2.6), 0.45, (x, y, 2.2), M["shaving"], rot=(90, 0, rnd.uniform(0, 180)), segments=16, rings=6)


# ---------------------------------------------------------------- 组装 / 导出
def build():
    coll = W.reset(COLL)
    M = W.materials(PALETTE)
    for i, (name, fn) in enumerate(PROPS):
        sub = bpy.data.collections.new(name)
        coll.children.link(sub)
        root = W.empty(sub, name, (i * GAP, 0, 0), size=4)
        before = set(sub.objects)
        fn(sub, M)
        for ob in sub.objects:
            if ob is not root and ob not in before:
                ob.parent = root
    return coll


def export():
    coll = build()
    objs = list(coll.all_objects)
    meshes = [o for o in objs if o.type == "MESH"]
    roots = [o for o in objs if o.type == "EMPTY"]
    W.apply_modifiers(meshes)
    W.bake_ao(None, meshes, coll)
    for r in roots:
        r.location = (0, 0, 0)
    W.export_glb(roots + meshes, OUT)
    names, mats, _anims, attrs = W.describe(OUT)
    assert "COLOR_0" in attrs, "顶点色 ao 没导出来"
    missing = [n for n, _ in PROPS if n not in names]
    assert not missing, f"少了 {missing}"
    print("exported", OUT)


if __name__ == "__main__":
    if "--export" in sys.argv:
        export()
    else:
        build()
