"""主角（方脑袋的小机器人）的 3D 模型：按 player_sheet 的比例用圆角方块搭，带骨骼和四段动作。
尺寸单位 = 精灵图里的像素（人 30 像素高），1 像素 = 0.1 Blender 单位。朝 -Y（前视图正对着看）。

在 Blender 里：
    blender -P build_hero.py                 建模 + 骨骼 + 动作（看一眼）
    blender -b -P build_hero.py -- --export  再导出到 game-master/src/asset/model/hero.glb
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
import woodkit as W  # noqa: E402

COLL = "Hero"
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "game-master", "src", "asset", "model", "hero.glb"))

# 材质名 → 颜色从亮到暗（和 game-master/src/shared/palette.ts 的 HERO_PALETTE 一致；颜色取自 player_sheet.png）
PALETTE = {
    "hero_head": ["#ddcbac", "#b8a687", "#9c8468"],
    "hero_panel": ["#4a4e4f", "#3f4344", "#313536"],
    "hero_visor": ["#222325"],
    "hero_vest": ["#62564c", "#4a423b", "#292828"],
    "hero_stripe": ["#74665a", "#62564c", "#4a423b"],
    "hero_pad": ["#c0805c", "#a56b4f", "#7f5039"],
    "hero_arm": ["#777b6d", "#5d6155", "#454840"],
    "hero_leg": ["#bca280", "#9c8468", "#74665a"],
    "hero_boot": ["#62a695", "#4a7f72", "#3c5f57"],
}

# ---- 尺寸（像素）：脚底 z = 0 ----
BOOT = dict(w=5, h=3, d=7, x=3.5)
SHIN = dict(w=3.6, z0=3, z1=6.5, d=3.6)
THIGH = dict(w=4, z0=6.5, z1=10, d=4)
TORSO = dict(w=10, z0=10, z1=18, d=6)
PAD = dict(w=3, h=3, d=6, x=6.5, z=16.5)
ARM = dict(x=7.2, shoulder=16.5, elbow=12.5, wrist=8.5, w=3)
HAND = dict(w=3.6, h=2.6, d=3.6)
NECK = dict(w=4, z0=18, z1=19, d=4)
HEAD = dict(w=12, z0=19, z1=31, d=10)
PANEL_D = 3          # 脑袋后面那块深灰的盖板多厚
VISOR = dict(w=7, h=2, z=26)
SIDES = (("L", 1), ("R", -1))


def build():
    coll = W.reset(COLL)
    M = W.materials(PALETTE)
    rig = W.Rig(coll, "Hero")
    up = (0, -1, 0)   # 所有骨头的 Z 朝前：绕 X 转正数 = 往前摆
    rig.bone("root", (0, 0, 0), (0, 0, 3), up)
    rig.bone("hips", (0, 0, THIGH["z1"]), (0, 0, 13), up, "root")
    rig.bone("spine", (0, 0, 13), (0, 0, TORSO["z1"]), up, "hips")
    rig.bone("head", (0, 0, HEAD["z0"]), (0, 0, HEAD["z1"]), up, "spine")
    for s, k in SIDES:
        x = ARM["x"] * k
        rig.bone(f"upperarm.{s}", (x, 0, ARM["shoulder"]), (x, 0, ARM["elbow"]), up, "spine")
        rig.bone(f"forearm.{s}", (x, 0, ARM["elbow"]), (x, 0, ARM["wrist"]), up, f"upperarm.{s}", True)
        x = BOOT["x"] * k
        rig.bone(f"thigh.{s}", (x, 0, THIGH["z1"]), (x, 0, THIGH["z0"]), up, "hips")
        rig.bone(f"shin.{s}", (x, 0, SHIN["z1"]), (x, 0, SHIN["z0"]), up, f"thigh.{s}", True)
    rig.build()
    at = rig.attach

    # 身体
    tz = (TORSO["z0"] + TORSO["z1"]) / 2
    at(W.box(coll, "torso", (TORSO["w"], TORSO["d"], TORSO["z1"] - TORSO["z0"]), (0, 0, tz), M["hero_vest"], r=1.2), "spine")
    for x in (-2.2, 2.2):   # 背带似的两条竖纹
        at(W.box(coll, f"stripe{'L' if x < 0 else 'R'}", (1.8, 0.6, 6.5), (x, -TORSO["d"] / 2 - 0.2, tz), M["hero_stripe"], r=0.3), "spine")
    at(W.box(coll, "neck", (NECK["w"], NECK["d"], NECK["z1"] - NECK["z0"]), (0, 0, (NECK["z0"] + NECK["z1"]) / 2), M["hero_panel"], r=0.5), "spine")
    # 脑袋：奶白的方块 + 后面一块深灰盖板 + 正面一道黑缝（眼睛）
    hz = (HEAD["z0"] + HEAD["z1"]) / 2
    at(W.box(coll, "head", (HEAD["w"], HEAD["d"], HEAD["z1"] - HEAD["z0"]), (0, 0, hz), M["hero_head"], r=1.6), "head")
    at(W.box(coll, "head_panel", (HEAD["w"] + 0.4, PANEL_D, HEAD["z1"] - HEAD["z0"] + 0.4), (0, HEAD["d"] / 2 - PANEL_D / 2 + 0.3, hz), M["hero_panel"], r=1.0), "head")
    at(W.box(coll, "visor", (VISOR["w"], 1.0, VISOR["h"]), (0, -HEAD["d"] / 2, VISOR["z"]), M["hero_visor"], r=0.3), "head")
    # 肩垫、手臂、手
    for s, k in SIDES:
        at(W.box(coll, f"pad.{s}", (PAD["w"], PAD["d"], PAD["h"]), (PAD["x"] * k, 0, PAD["z"]), M["hero_pad"], r=0.8), "spine")
        x = ARM["x"] * k
        at(W.box(coll, f"upperarm.{s}", (ARM["w"], ARM["w"], ARM["shoulder"] - ARM["elbow"] - 0.4), (x, 0, (ARM["shoulder"] + ARM["elbow"]) / 2), M["hero_arm"], r=0.8), f"upperarm.{s}")
        at(W.box(coll, f"forearm.{s}", (ARM["w"], ARM["w"], ARM["elbow"] - ARM["wrist"] - 0.4), (x, 0, (ARM["elbow"] + ARM["wrist"]) / 2), M["hero_arm"], r=0.8), f"forearm.{s}")
        at(W.box(coll, f"hand.{s}", (HAND["w"], HAND["d"], HAND["h"]), (x, 0, ARM["wrist"] - HAND["h"] / 2 + 0.2), M["hero_head"], r=1.0), f"forearm.{s}")
        # 腿、靴子
        x = BOOT["x"] * k
        at(W.box(coll, f"thigh.{s}", (THIGH["w"], THIGH["d"], THIGH["z1"] - THIGH["z0"]), (x, 0, (THIGH["z0"] + THIGH["z1"]) / 2), M["hero_leg"], r=0.8), f"thigh.{s}")
        at(W.box(coll, f"shin.{s}", (SHIN["w"], SHIN["d"], SHIN["z1"] - SHIN["z0"]), (x, 0, (SHIN["z0"] + SHIN["z1"]) / 2), M["hero_leg"], r=0.6), f"shin.{s}")
        at(W.box(coll, f"boot.{s}", (BOOT["w"], BOOT["d"], BOOT["h"]), (x, -1.0, BOOT["h"] / 2), M["hero_boot"], r=1.0), f"shin.{s}")
    # 对准点：头顶（戴帽子）、后领（被拎着的地方）
    at(W.empty(coll, "anchor_top", (0, 0, HEAD["z1"])), "head")
    at(W.empty(coll, "anchor_collar", (0, TORSO["d"] / 2, TORSO["z1"])), "spine")
    return coll, rig


# ---- 动作：fn(t 秒) → {骨名: (绕 X 度, 绕 Y 度, 绕 Z 度)}；X 正 = 往前摆 ----
def idle(t):
    s = math.sin(t / 2.0 * 2 * math.pi)
    return {"loc:hips": (0, 0.35 * s, 0), "spine": (1.5 * s, 0, 0), "head": (-1.5 * s, 0, 0),
            "upperarm.L": (3 * s, 0, 4), "upperarm.R": (3 * s, 0, -4), "forearm.L": (6, 0, 0), "forearm.R": (6, 0, 0)}


def run(t):
    p = t / 0.6 * 2 * math.pi
    s, c = math.sin(p), math.cos(p)
    bob = 0.5 * abs(s)
    return {"loc:hips": (0, bob, 0), "spine": (8 + 1.5 * c, 0, 0), "head": (-5, 0, 0),
            "thigh.L": (38 * s, 0, 0), "thigh.R": (-38 * s, 0, 0),
            "shin.L": (-55 * max(0.0, -s) - 8, 0, 0), "shin.R": (-55 * max(0.0, s) - 8, 0, 0),
            "upperarm.L": (-32 * s - 5, 0, 6), "upperarm.R": (32 * s - 5, 0, -6), "forearm.L": (30, 0, 0), "forearm.R": (30, 0, 0)}


def jump(t):
    return {"spine": (4, 0, 0), "head": (-6, 0, 0),
            "thigh.L": (35, 0, 0), "thigh.R": (30, 0, 0), "shin.L": (-70, 0, 0), "shin.R": (-60, 0, 0),
            "upperarm.L": (150, 0, 15), "upperarm.R": (150, 0, -15), "forearm.L": (10, 0, 0), "forearm.R": (10, 0, 0)}


def hang(t):
    s = math.sin(t / 1.2 * 2 * math.pi)
    return {"spine": (-4, 0, 0), "head": (6 + 2 * s, 0, 0),
            "thigh.L": (8 * s - 4, 0, 0), "thigh.R": (-8 * s - 4, 0, 0), "shin.L": (-14, 0, 0), "shin.R": (-14, 0, 0),
            "upperarm.L": (10, 0, 28 + 4 * s), "upperarm.R": (10, 0, -28 - 4 * s), "forearm.L": (12, 0, 0), "forearm.R": (12, 0, 0)}


CLIPS = {"idle": (2.0, idle, True), "run": (0.6, run, True), "jump": (0.25, jump, False), "hang": (1.2, hang, True)}


def animate(rig):
    W.clear_animation(rig)
    for name, (seconds, fn, loop) in CLIPS.items():
        W.clip(rig, name, seconds, fn, loop=loop)


def export(out=OUT):
    coll, rig = build()
    animate(rig)
    W.export_character(coll, rig, out, expect_anims=tuple(CLIPS), expect_nodes=("anchor_top", "anchor_collar", "head", "boot.L"))
    build()   # 导出会改场景，再建一遍干净的


if __name__ == "__main__":
    if "--export" in sys.argv:
        export()
    else:
        coll, rig = build()
        animate(rig)
