"""夹子桑（替换史莱姆的巡逻怪）：两片木夹板交叉成 X，交叉处的弹簧圈是一只眼睛，上半截是嘴（张开露出红舌头），
下面两条小黑腿。正面对着镜头，默认朝左（游戏里往右走时左右翻转）。
  walk：6 帧，摇摇摆摆地侧着走（两只脚轮流抬、身子左右晃、嘴微微开合）
  attack：4 帧，往后一仰张大嘴 → 往前一扑 → 咔嚓夹住（夹口冒火花）→ 收回来
  carry：6 帧，侧过身用嘴夹住纸，上半截不动、只有腿在走。分前后两层：back = 被纸挡住的那片夹板和后腿（游戏里画在纸后面），
         front = 其余部分；walk / attack 只有 front 层
每帧 40x40，脚底在第 38 行，身体中线在 x = 20。用倒角方块 + 环境光遮蔽渲染（bevel_render）。

在本文件夹里跑（ASE、<abs>、GAME 和 boxman.py 开头一样）：
  1. 渲染帧：   python clip.py frames_clip   → frames_clip/<动作>/f*.png、frames_clip/anims.json
  2. 打包源文件（会覆盖 ../clip.aseprite）：
       ASE -b --script-param spec=<abs>/frames_clip/anims.json --script-param out=<abs>/../clip.aseprite --script pack_anims.lua
  3. 导出到游戏（前后两层各一张，帧和标签一样）：
       ASE -b --layer front ../clip.aseprite --sheet GAME/sprite/clip_sheet.png --data GAME/sprite/clip_sheet.json
           --format json-array --sheet-type rows --sheet-columns 8 --list-tags --filename-format "{frame}"
       ASE -b --layer back ../clip.aseprite --sheet GAME/sprite/clip_back.png --data GAME/sprite/clip_back.json
           --format json-array --sheet-type rows --sheet-columns 8 --list-tags --filename-format "{frame}"
在 Aseprite 里手改过 .aseprite 之后只跑第 3 步。
"""
import json
import math
import os
import sys
import numpy as np
from PIL import ImageDraw

import boxman as B
import bevel_render as R
from boxman import Box, Node, rz, rx, hexc

B.RAMP.update({k: [hexc(c) for c in v] for k, v in {
    # 5 档：亮面 / 基色 / 暗面 / 最暗 / 凹槽里
    "pin":    ["#dd8a5b", "#c0703f", "#a35a31", "#7d4426", "#5a2f1b"],   # 木夹板
    "spring": ["#efe6d0", "#d9cfb6", "#bdb29a", "#8c8270", "#5e574b"],   # 弹簧圈（眼白）
    "boot":   ["#4a403b", "#2e2724", "#221d1b", "#191514", "#100d0c"],   # 腿、靴子
    "tongue": ["#e8594c", "#cc3d35", "#a52d27", "#7d201c", "#561512"],   # 嘴里的红舌头
}.items()})
PUPIL = hexc("#1b1a19")
SPARK = [hexc("#fff3c4"), hexc("#f2c46b")]

SIZE, ORIGIN = (40, 40), (20, 38)        # 稍微俯视：脚前沿会低于地面，往上让 2 像素
PIN = (5, 25, 5)                         # 一片夹板：宽 x 长 x 厚
PIVOT_Y, PIVOT_X = 7 + 14, 3.6           # 弹簧（转轴）离地多高；两片夹板的转轴离中线多远
BELOW = 14                               # 夹板在转轴下面那截的长度（上面那截 = 嘴）
LEG = 5                                  # 腿长（夹板底到靴子顶）


def eye_decal(axis, sign, p, shade):
    """弹簧圈正面中间的黑瞳孔"""
    if axis == 2 and sign > 0 and max(abs(p[0]), abs(p[1])) <= 1.6:
        return PUPIL
    return None


def bev(box, c):
    box.bevel = c
    return box


def clip(jaw, lean=0.0, dx=0.0, lift=(0.0, 0.0), squash=0.0, tongue=True, reach=0.0, sides=(-1, 1), spring=True):
    """jaw：夹板的张角（度，正 = 嘴闭紧 / 腿叉开，负 = 嘴张开 / 腿并拢）；lean：整个人往左倒多少度；
    dx：往左挪几像素；lift：左右脚抬起多高；squash：往下蹲几像素；reach：腿再伸长几像素（踮脚够高处）；
    sides / spring：只搭哪几片夹板、要不要弹簧圈（夹纸时前后两片分开画，纸夹在中间）"""
    root = Node((-dx, -squash, 0), rz(lean))
    tips = []
    for side in sides:
        a = jaw * side                                  # rz(a)：左片正角 = 顶往中间倒（嘴闭紧、腿叉开）
        plank = root.child(Node((PIVOT_X * side, PIVOT_Y, 0), rz(a)))
        plank.add(bev(Box("pin", PIN, (0, PIN[1] / 2 - BELOW, 0)), 1.0))
        tips.append(plank)
        # 腿挂在夹板底下，始终竖直（抵消夹板和身子的倾斜），抬脚就是腿变短往上收
        foot = plank.child(Node((0, -BELOW, 0), rz(-a) @ rz(-lean)))
        leg = LEG + reach - lift[0 if side < 0 else 1]
        foot.add(Box("boot", (2.2, leg + 0.6, 2.2), (0, -leg / 2, 0)),
                 bev(Box("boot", (5.5, 2.4, 4.5), (0.6 * side, -leg - 1.0, 0.6)), 0.7))   # 靴尖稍微往外撇
    # 弹簧圈（眼睛）盖在交叉处前面；舌头在两片夹板后面，嘴张开才看得见
    if spring:
        root.add(bev(Box("spring", (7.5, 7.5, 3), (0, PIVOT_Y, 3.2), decal=eye_decal), 2.0))
    if tongue:
        root.add(bev(Box("tongue", (4, 9, 2.5), (0, PIVOT_Y + 4.5, -1.2)), 0.8))   # 顶端比嘴尖低一点，闭嘴时藏得住
    return root


def tip_points(jaw, lean, dx, squash):
    """两个夹口尖（夹板顶端中点）在角色坐标里的位置：画咔嚓火花用"""
    out = []
    for side in (-1, 1):
        a = jaw * side
        R1 = rz(lean) @ rz(a)
        p = np.array([-dx, -squash, 0]) + rz(lean) @ np.array([PIVOT_X * side, PIVOT_Y, 0]) + R1 @ np.array([0, PIN[1] - BELOW, 0])
        out.append(p)
    return out


def to_px(p, pitch):
    v = B.rx(pitch) @ p
    return ORIGIN[0] + v[0], ORIGIN[1] - v[1]


WALK_N = 6
PITCH = 10


def walk_pose(t):
    ph = 2 * math.pi * t
    lift = (max(0.0, math.sin(ph)) * 3, max(0.0, -math.sin(ph)) * 3)   # 两只脚轮流抬
    lean = 3 + 5 * math.sin(ph)                                        # 往前（左）带一点，身子左右晃
    jaw = 9 + 3 * math.sin(2 * ph)                                     # 嘴微微一开一合
    bob = -0.8 * abs(math.cos(ph))
    return dict(jaw=jaw, lean=lean, lift=lift, squash=bob)


ATTACK = [
    # 往后一仰、蹲下蓄力，嘴张到最大（露出红舌头）
    dict(jaw=-20, lean=-10, dx=-1, squash=1.5),
    # 往前一扑：身子前倾、离地，嘴还张着
    dict(jaw=-16, lean=22, dx=5, lift=(2.5, 0.5)),
    # 咔嚓！夹紧（闭得比平时还紧），夹口冒火花
    dict(jaw=13, lean=12, dx=4, lift=(0.5, 0)),
    # 收回来
    dict(jaw=10, lean=6, dx=2),
]
WALK_MS = [100] * WALK_N
CARRY_YAW = 35           # 夹纸时侧过来：两片夹板一前一后，纸从中间穿过去（游戏里纸画在两层中间）
CARRY_BITE = 5           # 嘴尖咬进纸底几像素
# 前层：靠镜头的那片夹板（左片）+ 弹簧圈 + 前腿；后层：另一片夹板 + 后腿（上半截被纸挡住）
CARRY_FRONT, CARRY_BACK = dict(sides=(-1,), spring=True), dict(sides=(1,), spring=False)


def carry_reach():
    """腿要伸长多少，嘴尖才比一格高再高 CARRY_BITE 像素"""
    root = clip(jaw=CARRY_JAW)
    low = min((c + Rm @ (b.half * np.array(s)))[1] for b, Rm, c in root.walk() if b.mat == "boot"
              for s in ((-1, -1, -1), (1, -1, -1), (-1, -1, 1), (1, -1, 1)))
    return 32 + CARRY_BITE - (tip_points(CARRY_JAW, 0, 0, 0)[0][1] - low)


CARRY_JAW = 11           # 嘴闭紧夹住


def carry_pose(t):
    """夹着纸走：上半截（夹板）固定夹住不动，只有两条腿轮流抬着走"""
    ph = 2 * math.pi * t
    lift = (max(0.0, math.sin(ph)) * 2.5, max(0.0, -math.sin(ph)) * 2.5)
    return dict(jaw=CARRY_JAW, lift=lift, reach=carry_reach(), tongue=False)


ATTACK_MS = [220, 70, 160, 140]
SNAP_FRAME = 2


def render(pose, snap=False, yaw=0, part=None):
    """part：只画一部分（夹纸时的前后两层），dict(sides=..., spring=...)；贴地照整个人算"""
    kw = dict(pose)
    keys = ("jaw", "lean", "dx", "lift", "squash", "reach", "tongue")
    root = clip(**{k: kw[k] for k in keys if k in kw})
    # 贴地：最低的靴底放到地面
    low = min((c + Rm @ (b.half * s))[1] for b, Rm, c in root.walk() if b.mat == "boot"
              for s in [np.array(v) for v in ((-1, -1, -1), (1, -1, -1), (-1, -1, 1), (1, -1, 1))])
    air = sum(kw.get("lift", (0, 0))) * 0.3 if kw.get("lift") and min(kw["lift"]) > 0 else 0
    kw["squash"] = kw.get("squash", 0) + low - air
    root = clip(**{k: kw[k] for k in keys if k in kw}, **(part or {}))
    img = B.cleanup(R.render(root, yaw, PITCH, size=SIZE, origin=ORIGIN, light=(-0.35, 0.8, 0.5),
                             bands=(0.6, 0.05, -0.45), ao_radius=2.5))
    if snap:                                        # 咔嚓：两个夹口尖中间往外迸几道短线
        tips = tip_points(kw["jaw"], kw.get("lean", 0), kw.get("dx", 0), kw["squash"])
        mid = (tips[0] + tips[1]) / 2
        x, y = to_px(mid, PITCH)
        g = ImageDraw.Draw(img)
        for ang in (100, 140, 180, 220, 60):
            a = math.radians(ang)
            x0, y0 = x + math.cos(a) * 3, y - math.sin(a) * 3
            x1, y1 = x + math.cos(a) * 6, y - math.sin(a) * 6
            g.line((x0, y0, x1, y1), fill=SPARK[0])
        g.point((int(x), int(y)), fill=SPARK[1])
    return img


if __name__ == "__main__":
    out = sys.argv[1]
    anims = []
    for name, poses, ms in (("walk", [walk_pose(i / WALK_N) for i in range(WALK_N)], WALK_MS), ("attack", ATTACK, ATTACK_MS),
                            ("carry", [carry_pose(i / WALK_N) for i in range(WALK_N)], WALK_MS)):
        os.makedirs(f"{out}/{name}", exist_ok=True)
        files = []
        for i, pose in enumerate(poses):
            if name == "carry":                     # 前后两层分开存
                entry = {}
                for layer, part in (("back", CARRY_BACK), ("front", CARRY_FRONT)):
                    path = f"{out}/{name}/f{i}_{layer}.png"
                    render(pose, yaw=CARRY_YAW, part=part).save(path)
                    entry[layer] = os.path.abspath(path).replace("\\", "/")
                files.append(entry)
                continue
            path = f"{out}/{name}/f{i}.png"
            render(pose, snap=(name == "attack" and i == SNAP_FRAME)).save(path)
            files.append({"front": os.path.abspath(path).replace("\\", "/")})
        anims.append({"tag": f"clip_{name}", "files": files, "ms": ms})
    json.dump({"w": SIZE[0], "h": SIZE[1], "layers": ["back", "front"], "anims": anims}, open(f"{out}/anims.json", "w"), indent=1)
    print("ok", [(a["tag"], len(a["files"])) for a in anims])
