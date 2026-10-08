"""夹子桑（衣夹怪）的 3D 模型：两片木夹板绕中间的弹簧轴张合，底下两条黑腿；带骨骼和三段动作。
尺寸单位 = 精灵图 clip_sheet 里的像素（整个 32 像素高），1 像素 = 0.1 Blender 单位。朝 -Y。
嘴在上面：张嘴是两片夹板的上端分开（设计稿和 clip_attack 里都是上面张开、露出红色的口）。

    blender -P build_clip.py                 建模 + 骨骼 + 动作
    blender -b -P build_clip.py -- --export  导出到 game-master/src/asset/model/clip.glb
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
import woodkit as W  # noqa: E402

COLL = "Clip"
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "game-master", "src", "asset", "model", "clip.glb"))

# 材质名 → 颜色从亮到暗（和 palette.ts 的 CLIP_PALETTE 一致；颜色取自 clip_sheet.png）
PALETTE = {
    "clip_wood": ["#dd8a5b", "#c0703f", "#a35a31", "#7d4426"],
    "clip_ring": ["#efe6d0", "#d9cfb6", "#bdb29a"],
    "clip_core": ["#2a2826", "#1b1a19"],
    "clip_leg": ["#3a332f", "#2e2724", "#221d1b"],
    "clip_foot": ["#4a403b", "#3a332f"],
    "clip_tongue": ["#8a2320", "#561512"],
}

PIVOT_Z = 21                       # 弹簧轴多高（脚底 z = 0）
JAW = dict(w=5.2, d=6, top=32, bottom=8, x=3.3, tilt=9)   # 每片夹板：宽、厚、上下端的高度、在轴那一高度的中线 x、往里倾斜几度
RING = dict(r=5.5, thick=1.8, core=3.2)
TONGUE = dict(w=2.4, h=7, d=3.2, z=25.5)   # 闭嘴时整个藏在夹板之间
LEG = dict(top=(4.6, 8.5), bottom=(6.2, 1.5), w=2.4)
FOOT = dict(w=5, h=1.8, d=4.5)
SIDES = (("L", 1), ("R", -1))


def build():
    coll = W.reset(COLL)
    M = W.materials(PALETTE)
    rig = W.Rig(coll, "Clip")
    up = (0, -1, 0)
    rig.bone("root", (0, 0, 0), (0, 0, 4), up)
    rig.bone("body", (0, 0, JAW["bottom"]), (0, 0, PIVOT_Z), up, "root")
    tilt = math.radians(JAW["tilt"])
    for s, k in SIDES:
        # 夹板的骨头：从轴指向上端（嘴）；绕骨头的 Z（= 弹簧轴）转就是张嘴
        top_x = k * (JAW["x"] - (JAW["top"] - PIVOT_Z) * math.sin(tilt))
        rig.bone(f"jaw.{s}", (0, 0, PIVOT_Z), (top_x, 0, JAW["top"]), up, "body")
        rig.bone(f"leg.{s}", (k * LEG["top"][0], 0, LEG["top"][1]), (k * LEG["bottom"][0], 0, LEG["bottom"][1]), up, "body")
    rig.build()
    at = rig.attach

    for s, k in SIDES:
        # 夹板：一根长方块，中线穿过轴，上端往里倒 tilt 度；稍微做成梯形（上端窄一点）
        length = JAW["top"] - JAW["bottom"]
        center_z = (JAW["top"] + JAW["bottom"]) / 2
        jaw = W.rounded_box(coll, f"jaw.{s}", (length, JAW["d"], JAW["w"]), 1.4, M["clip_wood"],
                            W.Matrix.Translation(W.px(k * JAW["x"], 0, PIVOT_Z))
                            @ W.Euler((0, math.radians(-90 + k * JAW["tilt"]), 0), "XYZ").to_matrix().to_4x4()
                            @ W.Matrix.Translation(W.px(center_z - PIVOT_Z, 0, 0)), segments=4, taper=0.85)
        at(jaw, f"jaw.{s}")
        # 腿和脚
        a, b = (k * LEG["top"][0], 0, LEG["top"][1]), (k * LEG["bottom"][0], 0, LEG["bottom"][1])
        at(W.log(coll, f"leg.{s}", LEG["w"] / 2, a, b, M["clip_leg"], bevel=0.6, segments=10), f"leg.{s}")
        at(W.box(coll, f"foot.{s}", (FOOT["w"], FOOT["d"], FOOT["h"]), (k * LEG["bottom"][0] + k * 0.8, -0.6, FOOT["h"] / 2), M["clip_foot"], r=0.6), f"leg.{s}")
    # 弹簧：前后各一圈奶白的环，中间一截黑芯露出来
    for y in (-JAW["d"] / 2 - RING["thick"] / 2 + 0.3, JAW["d"] / 2 + RING["thick"] / 2 - 0.3):
        at(W.cylinder(coll, f"ring{'F' if y < 0 else 'B'}", RING["r"], RING["thick"], M["clip_ring"],
                      W.Matrix.Translation(W.px(0, y, PIVOT_Z)), segments=24, bevel=0.5, axis="Y"), "body")
    at(W.cylinder(coll, "core", RING["core"], JAW["d"] + 2 * RING["thick"] + 0.8, M["clip_core"],
                  W.Matrix.Translation(W.px(0, 0, PIVOT_Z)), segments=18, axis="Y"), "body")
    # 红舌头：藏在两片夹板之间，张嘴才露出来
    at(W.box(coll, "tongue", (TONGUE["w"], TONGUE["d"], TONGUE["h"]), (0, 0, TONGUE["z"]), M["clip_tongue"], r=0.8), "body")
    at(W.empty(coll, "anchor_mouth", (0, 0, JAW["top"])), "body")
    return coll, rig


# ---- 动作 ----
def smooth(k):
    k = max(0.0, min(1.0, k))
    return k * k * (3 - 2 * k)


def jaws(opening):
    """张嘴多少度：两片夹板绕弹簧轴往两边转（骨头的 Z 就是弹簧轴）"""
    return {"jaw.L": (0, 0, -opening), "jaw.R": (0, 0, opening)}


def walk(t):
    # 它是正面朝着镜头横着走的（和 2D 一样）：腿在画面平面里一张一合（绕骨头的 Z = 前后轴），身子跟着左右晃
    p = t / 0.5 * 2 * math.pi
    s = math.sin(p)
    return {"loc:body": (0, 0.6 * abs(s), 0), "body": (0, 0, 5 * s),
            "leg.L": (0, 0, 26 * s), "leg.R": (0, 0, 26 * s), **jaws(3 + 3 * math.sin(2 * p))}


def attack(t):
    # 0–0.12 秒张开，停到 0.3 秒，0.3–0.4 秒猛地合上；身子往前扑一下
    opening = 38 * (smooth(t / 0.12) if t < 0.3 else 1 - smooth((t - 0.3) / 0.1))
    lunge = smooth(t / 0.3) * (1 - smooth((t - 0.35) / 0.15))
    return {"loc:body": (0, -1.5 * lunge, 2.2 * lunge), "body": (-12 * lunge, 0, 0), **jaws(opening),
            "leg.L": (8 * lunge, 0, 0), "leg.R": (8 * lunge, 0, 0)}


def idle(t):
    s = math.sin(t / 1.5 * 2 * math.pi)
    return {"loc:body": (0, 0.3 * s, 0), **jaws(2 + 2 * s)}


CLIPS = {"idle": (1.5, idle, True), "walk": (0.5, walk, True), "attack": (0.5, attack, False)}


def animate(rig):
    W.clear_animation(rig)
    for name, (seconds, fn, loop) in CLIPS.items():
        W.clip(rig, name, seconds, fn, loop=loop)


def export(out=OUT):
    coll, rig = build()
    animate(rig)
    W.export_character(coll, rig, out, expect_anims=tuple(CLIPS), expect_nodes=("anchor_mouth", "jaw.L", "tongue"))
    build()


if __name__ == "__main__":
    if "--export" in sys.argv:
        export()
    else:
        coll, rig = build()
        animate(rig)
