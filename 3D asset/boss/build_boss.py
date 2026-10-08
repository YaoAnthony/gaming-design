"""Game Master（木偶人 Boss）的本体，按设定集（设计稿/art/B1_wood_stage，01_cast.png 第二排）的比例：
奶白色的胸甲（顶上一圈领口框、里面是空的——没有头）、胸口两道缝、大圆肩、一节节的粗圆木胳膊垂到腰下、
从腰到脚踝越来越宽的喇叭形围裙（胸口口袋、吊牌、背后交叉的背带和扣子）、分得很开的两只木靴子。
手不在这里建：游戏里把 gm_hand.glb 挂在 anchor_hand.L / anchor_hand.R 上（手很大，约 15 像素长）。
尺寸单位 = 像素（本体约 106 像素高：裙摆下面露出两条长长的细腿，像踩着高跷），1 像素 = 0.1 Blender 单位。朝 -Y。

    blender -P build_boss.py                 建模 + 骨骼 + 动作
    blender -b -P build_boss.py -- --export  导出到 game-master/src/asset/model/boss.glb
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
import woodkit as W  # noqa: E402

COLL = "Boss"
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "game-master", "src", "asset", "model", "boss.glb"))

# 木头的几种和木手一样（palette.ts 的 GM_HAND_PALETTE），其它在 BOSS_PALETTE 里
PALETTE = {
    "wood": ["#d6c4a2", "#b8a688", "#9c8c74", "#776a5a", "#4d453c"],     # 胳膊、肩膀
    "cuff": ["#d2bf9e", "#b09e80", "#978770", "#786b5b", "#4d453c"],     # 靴子、领口框
    "plate": ["#e2d8c0", "#c9bda2", "#a89c84", "#7f7462"],               # 胸甲（奶白，比木头亮一档）
    "wrist": ["#625e55", "#524f47", "#45433d", "#383631"],               # 肘、腕的关节
    "apron": ["#6b7a5c", "#55624a", "#46523e", "#343c30"],
    "strap": ["#55624a", "#46523e", "#343c30"],
    "pocket": ["#c4ad84", "#a8926a", "#85714f"],
    "tag": ["#e0c468", "#c4a74c", "#96803a"],
    "string": ["#b09e80", "#978770"],
    "socket": ["#2a2622", "#1b1816"],                                    # 领口里面的空洞
    "slit": ["#3a342e", "#262220"],
    "buckle": ["#c4ad84", "#a8926a"],
}

# ---- 尺寸（像素），脚底 z = 0；上半身按设定图量的，再整体抬高 34、腿拉长：总高约 106 ----
BOOT = dict(w=11, d=14, h=9, x=16)
LEG = dict(r=3.4, x=13, z0=8, z1=62)                    # 长细腿：从靴子一直伸进裙子里（裙摆 z = 44 以下都露着）
KNEE = dict(z=28, r=4.2)                                # 膝盖一个小圆球，腿才不像两根杆
PLATE = dict(w=30, d=15, z0=78, z1=102, r=4)            # 胸甲
COLLAR = dict(w=17, d=11, rim=2.5, h=4)                 # 领口框：外沿、框多宽、多高；里面是洞
SLITS = dict(w=13, h=2.4, zs=(94, 87))
SHOULDER = dict(r=6.5, x=19.5, z=96)
ELBOW = dict(x=25, y=-1, z=72, size=7)
WRIST = dict(x=28, y=-3, z=50, r=4)
ARM_R = dict(upper=5.2, fore=4.6)
APRON = dict(top=(32, 14), bottom=(58, 21), z0=44, z1=80)
WAIST = dict(w=33, d=15, h=3, z=80)
STRAP = dict(w=5, x=9, d=2.2)
POCKET = dict(w=12, h=13, x=-10, z=62)
TAG = dict(x=10, w=5, h=8, z=71, string=7)
SIDES = (("L", 1), ("R", -1))


def build():
    coll = W.reset(COLL)
    M = W.materials(PALETTE)
    rig = W.Rig(coll, "Boss")
    up = (0, -1, 0)
    rig.bone("root", (0, 0, 0), (0, 0, 8), up)
    rig.bone("hips", (0, 0, LEG["z1"]), (0, 0, PLATE["z0"]), up, "root")
    rig.bone("spine", (0, 0, PLATE["z0"]), (0, 0, PLATE["z1"]), up, "hips")
    for s, k in SIDES:
        sh = (k * SHOULDER["x"], 0, SHOULDER["z"])
        el = (k * ELBOW["x"], ELBOW["y"], ELBOW["z"])
        wr = (k * WRIST["x"], WRIST["y"], WRIST["z"])
        rig.bone(f"shoulder.{s}", (k * (PLATE["w"] / 2 - 2), 0, SHOULDER["z"]), sh, up, "spine")
        rig.bone(f"upperarm.{s}", sh, el, up, f"shoulder.{s}")
        rig.bone(f"forearm.{s}", el, wr, up, f"upperarm.{s}", True)
        rig.bone(f"thigh.{s}", (k * LEG["x"], 0, LEG["z1"]), (k * LEG["x"], 0, KNEE["z"]), up, "hips")
        rig.bone(f"shin.{s}", (k * LEG["x"], 0, KNEE["z"]), (k * BOOT["x"], 0, LEG["z0"]), up, f"thigh.{s}", True)
    rig.build()
    at = rig.attach

    # 胸甲：奶白的厚板，顶上一圈领口框，框里是黑洞（空领口）；胸口两道缝
    pz = (PLATE["z0"] + PLATE["z1"]) / 2
    at(W.box(coll, "plate", (PLATE["w"], PLATE["d"], PLATE["z1"] - PLATE["z0"]), (0, 0, pz), M["plate"], r=PLATE["r"], segments=5), "spine")
    cw, cd, rim, ch = COLLAR["w"], COLLAR["d"], COLLAR["rim"], COLLAR["h"]
    cz = PLATE["z1"] + ch / 2 - 0.5
    for name, size, pos in (("collar_f", (cw, rim, ch), (0, -cd / 2 + rim / 2, cz)), ("collar_b", (cw, rim, ch), (0, cd / 2 - rim / 2, cz)),
                            ("collar_l", (rim, cd, ch), (-cw / 2 + rim / 2, 0, cz)), ("collar_r", (rim, cd, ch), (cw / 2 - rim / 2, 0, cz))):
        at(W.box(coll, name, size, pos, M["cuff"], r=0.8), "spine")
    at(W.box(coll, "socket", (cw - 2 * rim + 0.4, cd - 2 * rim + 0.4, 6), (0, 0, PLATE["z1"] - 2.5), M["socket"], r=0.3), "spine")
    for i, z in enumerate(SLITS["zs"]):
        at(W.box(coll, f"slit{i}", (SLITS["w"], 1.2, SLITS["h"]), (0, -PLATE["d"] / 2 - 0.3, z), M["slit"], r=0.3), "spine")

    # 围裙：腰带一圈，裙子是上窄下宽的方台裹住下半身；胸甲前面两条背带上去，绕过肩顶，背后交叉扣在腰上
    at(W.frustum(coll, "apron", APRON["top"], APRON["bottom"], APRON["z0"], APRON["z1"], (0, 0), M["apron"], r=1.5), "hips")
    at(W.box(coll, "waist", (WAIST["w"], WAIST["d"], WAIST["h"]), (0, 0, WAIST["z"]), M["strap"], r=0.8), "hips")
    y_front, y_back = -PLATE["d"] / 2 - STRAP["d"] / 2 + 0.2, PLATE["d"] / 2 + STRAP["d"] / 2 - 0.2
    for s, k in SIDES:
        x = k * STRAP["x"]
        at(W.box(coll, f"strap_front.{s}", (STRAP["w"], STRAP["d"], PLATE["z1"] - WAIST["z"] + 1), (x, y_front, (WAIST["z"] + PLATE["z1"] + 1) / 2), M["strap"], r=0.6), "spine")
        at(W.box(coll, f"strap_top.{s}", (STRAP["w"], PLATE["d"] + 2 * STRAP["d"], STRAP["d"]), (x, 0, PLATE["z1"] + STRAP["d"] / 2 - 0.3), M["strap"], r=0.6), "spine")
        top, bottom = (x, y_back, PLATE["z1"]), (0, y_back, WAIST["z"] + 1)
        length = math.hypot(top[0] - bottom[0], top[2] - bottom[2])
        angle = math.degrees(math.atan2(top[0] - bottom[0], top[2] - bottom[2]))
        at(W.box(coll, f"strap_back.{s}", (STRAP["w"], STRAP["d"], length), ((top[0] + bottom[0]) / 2, y_back, (top[2] + bottom[2]) / 2), M["strap"], r=0.6, rot=(0, -angle, 0)), "spine")
    at(W.box(coll, "buckle", (6, 1.6, 6), (0, y_back + 0.8, WAIST["z"] + 1), M["buckle"], r=0.5), "spine")
    # 口袋在裙子左边（看的人的左边），吊牌在右边胸甲下面
    front_at = lambda z: -(APRON["top"][1] + (APRON["bottom"][1] - APRON["top"][1]) * (APRON["z1"] - z) / (APRON["z1"] - APRON["z0"])) / 2   # 裙子前面在这一高度有多靠前
    at(W.box(coll, "pocket", (POCKET["w"], 1.6, POCKET["h"]), (POCKET["x"], front_at(POCKET["z"]) - 0.6, POCKET["z"]), M["pocket"], r=1.0), "hips")
    at(W.box(coll, "tag_string", (0.8, 0.8, TAG["string"]), (TAG["x"], front_at(TAG["z"] + TAG["h"] / 2) - 0.8, TAG["z"] + TAG["h"] / 2 + TAG["string"] / 2), M["string"]), "hips")
    at(W.box(coll, "tag", (TAG["w"], 1.0, TAG["h"]), (TAG["x"], front_at(TAG["z"]) - 1.0, TAG["z"]), M["tag"], r=0.6), "hips")

    # 手臂：大圆肩、粗圆木上臂、方的肘关节、前臂、腕；腕的末端是挂手的点
    for s, k in SIDES:
        sh = (k * SHOULDER["x"], 0, SHOULDER["z"])
        el = (k * ELBOW["x"], ELBOW["y"], ELBOW["z"])
        wr = (k * WRIST["x"], WRIST["y"], WRIST["z"])
        at(W.sphere(coll, f"shoulder.{s}", SHOULDER["r"], sh, M["wood"]), f"shoulder.{s}")
        at(W.log(coll, f"upperarm.{s}", ARM_R["upper"], sh, el, M["wood"], bevel=1.6), f"upperarm.{s}")
        at(W.box(coll, f"elbow.{s}", (ELBOW["size"],) * 3, el, M["wrist"], r=1.6), f"forearm.{s}")
        at(W.log(coll, f"forearm.{s}", ARM_R["fore"], el, wr, M["wood"], bevel=1.6), f"forearm.{s}")
        at(W.sphere(coll, f"wrist.{s}", WRIST["r"], wr, M["wrist"], segments=14, rings=8), f"forearm.{s}")
        at(W.empty(coll, f"anchor_hand.{s}", wr), f"forearm.{s}")
        # 长细腿：大腿一截进裙子里，膝盖一个球，小腿一截落到靴子上
        at(W.log(coll, f"thigh.{s}", LEG["r"], (k * LEG["x"], 0, LEG["z1"]), (k * LEG["x"], 0, KNEE["z"]), M["wood"], bevel=1.0), f"thigh.{s}")
        at(W.sphere(coll, f"knee.{s}", KNEE["r"], (k * LEG["x"], 0, KNEE["z"]), M["wrist"], segments=14, rings=8), f"shin.{s}")
        at(W.log(coll, f"shin.{s}", LEG["r"] - 0.3, (k * LEG["x"], 0, KNEE["z"]), (k * BOOT["x"], 0, LEG["z0"]), M["wood"], bevel=1.0), f"shin.{s}")
        at(W.box(coll, f"boot.{s}", (BOOT["w"], BOOT["d"], BOOT["h"]), (k * BOOT["x"], -1.5, BOOT["h"] / 2), M["cuff"], r=2.5), f"shin.{s}")
    at(W.empty(coll, "anchor_socket", (0, 0, PLATE["z1"] + ch)), "spine")
    return coll, rig


# ---- 动作 ----
def idle(t):
    s = math.sin(t / 3.0 * 2 * math.pi)
    s2 = math.sin(t / 3.0 * 2 * math.pi + 1.2)
    return {"loc:hips": (0, 0.5 * s, 0), "spine": (1.2 * s, 0, 0),
            "upperarm.L": (2 * s2, 0, 2), "upperarm.R": (2 * s2, 0, -2), "forearm.L": (4 + 3 * s, 0, 0), "forearm.R": (4 + 3 * s, 0, 0)}


def wave(t):
    """左手（看的人的右边那只）举起来挥两下"""
    k = min(1.0, t / 0.4)
    swing = math.sin(max(0.0, t - 0.4) / 0.5 * 2 * math.pi) * (1 if t < 1.6 else max(0.0, 1 - (t - 1.6) / 0.4))
    return {"spine": (2, 0, 0), "upperarm.L": (150 * k, 0, 25 * k), "forearm.L": (40 * k, 0, 25 * swing),
            "upperarm.R": (0, 0, 2), "forearm.R": (4, 0, 0)}


def reach(t):
    """从黑暗里探过来：身子前倾，左手（看的人的右边那只）抬起来伸向舞台，慢慢呼吸"""
    s = math.sin(t / 3.0 * 2 * math.pi)
    return {"loc:hips": (0, 0.4 * s, 0), "spine": (12 + 1.5 * s, 0, 0),
            "upperarm.L": (72 + 2 * s, 0, 8), "forearm.L": (-6 + 2 * s, 0, 0),
            "upperarm.R": (3 * s, 0, 2), "forearm.R": (6 + 3 * s, 0, 0)}


CLIPS = {"idle": (3.0, idle, True), "wave": (2.0, wave, False), "reach": (3.0, reach, True)}


def animate(rig):
    W.clear_animation(rig)
    for name, (seconds, fn, loop) in CLIPS.items():
        W.clip(rig, name, seconds, fn, loop=loop)


def export(out=OUT):
    coll, rig = build()
    animate(rig)
    W.export_character(coll, rig, out, expect_anims=tuple(CLIPS), expect_nodes=("anchor_hand.L", "anchor_hand.R", "anchor_socket", "plate", "apron"))
    build()


if __name__ == "__main__":
    if "--export" in sys.argv:
        export()
    else:
        coll, rig = build()
        animate(rig)
