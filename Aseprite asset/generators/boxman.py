"""主角（方块人）的帧生成器：一堆长方体搭成带关节的骨架（髋-膝-踝、肩-肘），正交相机逐像素打光线，
直接出调色板锁定的像素图（颜色取自 设计稿/art/B1_wood_stage 设定集）。

1 个模型单位 = 1 个像素。角色空间：x 向角色左手边，y 向上，z 向角色正前方，原点在地面。
每帧 40x40，脚底贴着最下面一行，身体中线在 x = 20。动作：idle 4 帧、run 8 帧、jump 5 帧
（jump 里再分 jump_rise / jump_apex / jump_fall，游戏按竖直速度挑帧）、hang 6 帧（被捏着后背拎着挣扎，
后背捏合点固定在 (20, 16)）、getup 8 帧（被放下后坐地、爬起来）、wallslide 2 帧（贴墙滑：面朝墙，手和鞋底贴在第 31 列，
墙在第 32 列 = 碰撞框右边缘；游戏里贴左墙时左右翻转）、push 4 帧（推箱子：上身前压、两手按在箱子面上、腿往后蹬，
手也画到第 31 列 = 箱子面）、pull 4 帧（拉箱子：面朝箱子、往后仰、两手抓着箱子、倒着走；
游戏里不动的时候停在当前帧）。炸碎用的碎块和爆炸特效在 shatter.py。

需要 Python 3 + numpy + Pillow，以及 Aseprite（Steam 版：C:/Program Files (x86)/Steam/steamapps/common/Aseprite/Aseprite.exe）。
在本文件夹里跑（ASE = 上面的 Aseprite.exe，<abs> = 本文件夹的绝对路径，GAME = ../../game-master/src/asset/image）：

  1. 渲染帧：   python boxman.py frames     → frames/<动作>/f*.png、frames/anims.json
                python shatter.py frames    → frames/debris/f*.png + meta.json、frames/boom/f*.png + ms.json
  2. 打包源文件（会覆盖 ../player*.aseprite）：
       ASE -b --script-param spec=<abs>/frames/anims.json --script-param out=<abs>/../player.aseprite --script pack_anims.lua
       debris / boom 同样用 pack_anims.lua 打包成 ../player_debris.aseprite（每块一帧，18x18）和
       ../player_boom.aseprite（标签 hero_boom，64x64）；spec 的写法见 pack_anims.lua 开头
  3. 导出到游戏：
       ASE -b ../player.aseprite --sheet GAME/sprite/player_sheet.png --data GAME/sprite/player_sheet.json
           --format json-array --sheet-type rows --sheet-columns 8 --list-tags --filename-format "{frame}"
       ASE -b ../player.aseprite --frame-range 0,0 --save-as GAME/sprite/player.png        （站姿图：编辑器图标、演出、3D 世界用）
       ASE -b ../player_debris.aseprite --sheet GAME/sprite/player_debris.png --sheet-type horizontal
       复制 frames/debris/meta.json → GAME/sprite/player_debris.json                         （每块碎块的位置、大小、前后顺序）
       ASE -b ../player_boom.aseprite --sheet GAME/fx/player_boom.png --data GAME/fx/player_boom.json
           --format json-array --sheet-type horizontal --list-tags --filename-format "{frame}"

在 Aseprite 里手改过 .aseprite 之后只跑第 3 步；第 1、2 步会重新生成并覆盖。
只加一段新动作、不想覆盖手改过的 player.aseprite：只渲染那一段，再追加进去（同名标签会先删掉旧的那几帧），然后跑第 3 步：
       python boxman.py frames wallslide
       ASE -b --script-param spec=<abs>/frames/anims.json --script-param file=<abs>/../player.aseprite --script append_anims.lua
改了碎块的 .aseprite：每块要留在格子正中，meta.json 里的位置才对得上。
"""
import itertools
import json
import math
import os
import sys
import numpy as np
from PIL import Image


def hexc(h):
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), 255)


# 每个材质 4 档：亮面 / 基色 / 暗面 / 最暗（取自 B1_wood_stage 设定集）
RAMP = {
    "face":  ["#efdcb8", "#ddcbac", "#b8a687", "#9a896f"],
    "plate": ["#6a6e6a", "#535654", "#3f4344", "#2f3233"],
    "wood":  ["#74665a", "#62564c", "#4d443d", "#3a3532"],
    "neck":  ["#3a3532", "#292828", "#201f1f", "#1a1919"],
    "joint": ["#c0805c", "#a56b4f", "#744c3c", "#5a3a2f"],
    "arm":   ["#8a8e7f", "#777b6d", "#5d635a", "#49514d"],
    "hand":  ["#d2bb96", "#bca280", "#9c8468", "#806753"],
    "leg":   ["#6a6c66", "#585a55", "#3f4344", "#313536"],
    "shoe":  ["#8cc6b2", "#62a695", "#4a7f72", "#3c5f57"],
    "sole":  ["#3c4648", "#313b3d", "#262e30", "#1f2527"],
}
RAMP = {k: [hexc(c) for c in v] for k, v in RAMP.items()}
VISOR = hexc("#222325")
GROOVE = hexc("#292828")

# ---------- 尺寸 ----------
HEAD = (13, 12, 11)
PLATE_DEPTH = 8          # 头后面深灰挡板的厚度
TORSO = (9, 9.5, 5)
HIP_X = 3.0              # 髋关节离中线
THIGH, SHIN = 3.5, 3.5   # 大腿 / 小腿长
SHOE_W, SHOE_D, SHOE_H, SOLE_H = 5, 10, 3, 1
SHOE_FWD = 2.5           # 鞋子中心在脚踝前面多少
ANKLE_Y = SHOE_H + SOLE_H
SHOULDER_X, SHOULDER_Y = 6.3, 6.0   # 肩膀压低一点，不然像在耸肩


def rx(d):
    a = math.radians(d); c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def ry(d):
    a = math.radians(d); c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rz(d):
    a = math.radians(d); c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


class Box:
    def __init__(self, mat, size, center, decal=None, dim=0):
        self.mat, self.half = mat, np.array(size, float) / 2
        self.center, self.decal, self.dim = np.array(center, float), decal, dim


# 远离镜头那一侧（角色左边，side=+1）的手脚整体压暗一档：不然跑步时分不清哪只手哪只脚在前，看着像同手同脚
FAR_DIM = 1


def limb(side, *boxes):
    if side > 0:
        for b in boxes:
            b.dim = FAR_DIM
    return boxes


class Node:
    def __init__(self, t=(0, 0, 0), R=None):
        self.t, self.R = np.array(t, float), (np.eye(3) if R is None else R)
        self.boxes, self.children = [], []

    def add(self, *boxes):
        self.boxes += boxes
        return self

    def child(self, node):
        self.children.append(node)
        return node

    def walk(self, R=np.eye(3), t=np.zeros(3)):
        Rw, tw = R @ self.R, R @ self.t + t
        for b in self.boxes:
            yield b, Rw, tw + Rw @ b.center
        for c in self.children:
            yield from c.walk(Rw, tw)


# ---------- 贴花 ----------
def head_decal(axis, sign, p, shade):
    w, h, d = (s / 2 for s in HEAD)
    if axis == 2 and sign > 0:                      # 正面
        if -3.5 <= p[0] <= 3.5 and 0 <= p[1] <= 2:   # 面罩缝
            return VISOR
        if -3.5 <= p[0] <= 3.5 and -1 <= p[1] < 0:   # 缝下沿受光
            return RAMP["face"][0]
        if p[0] + p[1] > w + h - 3.5:                # 右上角倒角
            return RAMP["face"][3]
        if p[0] > w - 1.5 and p[1] > -h + 3:         # 右侧倒角带
            return RAMP["face"][2]
        return None
    if axis == 2 and sign < 0:
        return RAMP["plate"][shade]
    if axis != 1 and p[2] < -d + PLATE_DEPTH:        # 侧面靠后的部分是挡板
        return RAMP["plate"][shade]
    return None


def torso_decal(axis, sign, p, shade):
    hh = TORSO[1] / 2
    if axis == 2 and sign > 0:                       # 正面两块竖木板
        if abs(p[0]) < 0.6 or abs(p[0]) > 3.9:
            return GROOVE
        if p[0] < 0 and p[1] > 1:
            return RAMP["wood"][0]
        if p[0] > 0 and -3 < p[1] < 0:
            return RAMP["wood"][0]
    if p[1] < -hh + 1:                               # 最下面一圈压暗
        return GROOVE
    return None


# ---------- 搭人 ----------
def build(pose):
    """pose 见 idle_pose / run_pose。返回骨架根节点（骨盆，位于髋关节高度）。"""
    root = Node(pose["root"], pose.get("body_R"))   # body_R：整个人绕骨盆转（倒地、悬空前倾）
    # 跑步时“作弊”：腿拉长一点、鞋缩短一点（侧着看鞋子显得特别长），动起来更好认
    thigh, shin = THIGH * pose.get("leg_scale", 1), SHIN * pose.get("leg_scale", 1)
    shoe_d, shoe_fwd = pose.get("shoe_d", SHOE_D), SHOE_FWD * pose.get("shoe_d", SHOE_D) / SHOE_D
    for side in (-1, 1):                             # -1 = 角色右边（画面左），+1 = 角色左边
        abd, swing, bend, foot, fyaw = pose["legs"][side]
        A = abd * side
        hip = root.child(Node((pose.get("hip_x", HIP_X) * side, 0, 0), rz(A) @ rx(-swing)))
        hip.add(*limb(side, Box("joint", (3.6, 1.6, 3.6), (0, -0.2, 0)),
                      Box("leg", (3.2, thigh + 0.4, 3.2), (0, -thigh / 2 - 0.4, 0))))
        knee = hip.child(Node((0, -thigh, 0), rx(bend)))
        knee.add(*limb(side, Box("leg", (3, shin + 1, 3), (0, -shin / 2, 0))))
        # 脚踝把大腿的外张抵消掉，鞋底才是平的
        ankle = knee.child(Node((0, -shin, 0), rx(foot) @ rz(-A) @ ry(fyaw * side)))
        ankle.add(*limb(side, Box("shoe", (SHOE_W, SHOE_H, shoe_d), (0, -SHOE_H / 2, shoe_fwd)),
                        Box("sole", (SHOE_W, SOLE_H, shoe_d), (0, -SHOE_H - SOLE_H / 2, shoe_fwd))))

    # 躯干：shift = 往前挪，lean = 往前倾（度），twist = 扭腰
    chest_R = ry(pose.get("twist", 0)) @ rx(pose.get("lean", 0))
    chest = root.child(Node((0, 0, pose.get("shift", 0)), chest_R))
    torso = Box("wood", TORSO, (0, TORSO[1] / 2 - 0.5, 0), decal=None if pose.get("plain_torso") else torso_decal)
    torso.tag = "torso"
    chest.add(torso,
              Box("neck", (4, 2.5, 3), (0, 9.5, 0)))
    # 头不跟着躯干倾斜 / 扭转，始终立正（像素画里歪头会让面罩缝变锯齿）；
    # head_yaw 让头比身子少转一点：跑步时身子更侧，脸还是 3/4
    head = chest.child(Node((0, 9 + pose["head_dy"] + pose.get("neck", 0), 0.5),
                            chest_R.T @ (pose["body_R"].T if pose.get("head_upright") and pose.get("body_R") is not None else np.eye(3))
                            @ ry(pose.get("head_yaw", 0)) @ pose.get("head_R", np.eye(3))))
    head.add(Box("face", HEAD, (0, HEAD[1] / 2, 0), decal=head_decal))
    for side in (-1, 1):
        abd, swing, elbow, hand_dy = pose["arms"][side]
        sh = chest.child(Node((SHOULDER_X * side, SHOULDER_Y, 0), rz(abd * side) @ rx(-swing)))
        sh.add(*limb(side, Box("joint", (3.6, 3.6, 3.6), (0, 0, 0)),
                     Box("arm", (3, 3.6, 3), (0.3 * side, -3.0, 0))))
        el = sh.child(Node((0.3 * side, -4.4 - hand_dy, 0), rx(-elbow)))
        el.add(*limb(side, Box("arm", (3, 3.6, 3), (0, -0.8, 0)),
                     Box("joint", (3.6, 1, 3.6), (0, -3, 0)),
                     Box("hand", (3.6, 3.4, 3.6), (0, -5.2, 0))))
    return root


def lowest_sole(root):
    ys = []
    for b, R, c in root.walk():
        if b.mat == "sole":
            for sx in (-1, 1):
                for sy in (-1, 1):
                    for sz in (-1, 1):
                        ys.append((c + R @ (b.half * (sx, sy, sz)))[1])
    return min(ys)


# ---------- 腿的两节 IK：给定髋和脚踝位置，求外张 / 前摆 / 屈膝 ----------
def leg_ik(hip, ankle, side):
    d = np.array(ankle, float) - np.array(hip, float)
    abd = math.degrees(math.atan2(d[0] * side, -d[1]))
    down = math.hypot(d[0], d[1])
    D = min(math.hypot(down, d[2]), THIGH + SHIN - 1e-3)
    a, b = THIGH, SHIN
    knee_in = math.acos((a * a + b * b - D * D) / (2 * a * b))
    alpha = math.acos((a * a + D * D - b * b) / (2 * a * D))
    theta = math.atan2(d[2], down)
    swing = math.degrees(theta + alpha)
    bend = 180 - math.degrees(knee_in)
    return abd, swing, bend, swing - bend


# ---------- 动作 ----------
FOOT_X = 5.5                      # 站姿：脚离中线多远（越大站得越开）
FOOT_Z = {-1: -1.2, 1: 1.2}       # 近脚往后、远脚往前半步
FOOT_YAW = 10                     # 脚尖往外撇
STAND_H = 9.4                     # 骨盆（髋关节）离地高度，越低蹲得越深


def idle_pose(drop, head_dy, hand_dy):
    h = STAND_H - drop
    legs = {}
    for side in (-1, 1):
        abd, swing, bend, foot = leg_ik((HIP_X * side, h, 0), (FOOT_X * side, ANKLE_Y, FOOT_Z[side]), side)
        legs[side] = (abd, swing, bend, foot, FOOT_YAW)
    arms = {s: (8, 8, 18, hand_dy) for s in (-1, 1)}
    return {"root": (0, h, 0), "legs": legs, "arms": arms, "head_dy": head_dy}


# (身子下沉, 头相对上抬, 手相对下垂)：身子先沉，头和手晚一拍跟上
IDLE = [idle_pose(0, 0, 0), idle_pose(1, 1, -1), idle_pose(1, 0, 0), idle_pose(0, -1, 1)]
IDLE_MS = [220, 160, 220, 160]


RUN_LEAN = 20        # 跑步时上身前倾（度）


def run_pose(t):
    """一个循环 = 左右各一步。手臂角度先按“世界里看起来多少度”想，再减掉上身前倾换算到胸口坐标"""
    ph = 2 * math.pi * t
    legs, arms = {}, {}
    for side in (-1, 1):
        p = ph + (0 if side < 0 else math.pi)
        s = math.sin(p)                                         # 1 = 这条腿在最前，-1 = 在最后
        swing = 45 * s + 5
        bend = 15 + 100 * max(0.0, math.cos(p + 0.6)) ** 1.2    # 蹬地后小腿往后上方踢，收腿经过身下时脚跟贴近屁股
        foot = swing - bend - (15 if s > 0 else 30) * s         # 前脚脚尖翘，后脚脚尖往下压
        legs[side] = (float(os.environ.get("RUN_ABD", -12)), swing, bend, foot, 0)
        a = -s                                                  # 手和同侧腿反着摆
        # 摆臂以前摆为主：往前抬起握拳，往后只到腰后一点点；大部分时间手在身体侧前方
        if a > 0:
            arm_world, elbow = 10 + 40 * a, 20 + 60 * a
        else:
            arm_world, elbow = 10 + 35 * a, 25
        arms[side] = (10, arm_world - RUN_LEAN, elbow, 0)
    air = round(3 * abs(math.sin(ph)))                          # 两腿一前一后时腾空
    # 两条腿收到中线附近（髋收窄 + 内收），左右两步在画面上才对称
    return {"root": (0, 0, 0), "legs": legs, "arms": arms, "lean": RUN_LEAN, "shift": 0.5,
            "twist": -10 * math.sin(ph), "head_dy": 0, "neck": 0.6, "head_yaw": -(RUN_YAW - YAW),
            "air": air, "hip_x": float(os.environ.get("RUN_HIP", 1.6)),
            "leg_scale": 1.3, "shoe_d": 7.5, "plain_torso": True}   # 侧着跑时木板缝会碎成点，干脆不画


RUN_N = 8
RUN_MS = [65] * RUN_N


# ---------- 跳跃：起跳上升 2 帧 / 最高点 1 帧 / 下落 2 帧。游戏里按竖直速度挑帧，不按时间播 ----------
JUMP_LEAN = 8


def jump_pose(near_leg, far_leg, near_arm, far_arm, lean=JUMP_LEAN):
    """腿 = (前摆, 屈膝, 脚尖往下压多少)；手 = (世界里的前摆角, 外张, 屈肘)。近 = 角色右边（画面左）"""
    legs, arms = {}, {}
    for side, (swing, bend, toe) in ((-1, near_leg), (1, far_leg)):
        legs[side] = (-12, swing, bend, swing - bend + toe, 0)
    for side, (world, abd, elbow) in ((-1, near_arm), (1, far_arm)):
        arms[side] = (abd, world - lean, elbow, 0)
    return {"root": (0, 0, 0), "legs": legs, "arms": arms, "lean": lean, "shift": 0.5,
            "twist": 0, "head_dy": 0, "neck": 0.6, "head_yaw": -(RUN_YAW - YAW),
            "hip_x": 1.6, "leg_scale": 1.3, "shoe_d": 7.5, "plain_torso": True}


def jump_frames():
    # 侧着看时头又大又靠前，手举过肩就会挡脸，所以空中用“前后平伸”的手，不用“举过头”
    return [
        # 上升①：刚离地，近腿大腿抬平、小腿垂下（提膝），远腿还拖在后下方蹬直；前手往上冲拳，后手在身后
        jump_pose((85, 95, 10), (-15, 15, 25), (-40, 10, 20), (80, 10, 70), lean=6),
        # 上升②：膝盖再高一点，远腿开始往上收，前拳举得更高
        jump_pose((90, 105, 10), (-5, 60, 20), (-30, 12, 25), (100, 10, 60), lean=6),
        # 最高点：两腿都蜷起来，两手前后张开，像飘在空中
        jump_pose((70, 110, 5), (50, 110, 5), (70, 35, 30), (-50, 35, 20), lean=2),
        # 下落①：腿往下伸去够地面，两手前后平伸保持平衡
        jump_pose((30, 30, -5), (-15, 40, 10), (85, 25, 10), (-85, 25, 10), lean=0),
        # 下落②：腿伸得更直，手往上扬一点
        jump_pose((20, 15, -10), (-20, 25, 5), (105, 25, 10), (-105, 25, 10), lean=0),
    ]


JUMP_MS = [80, 120, 150, 100, 120]
JUMP_SUBTAGS = [("jump_rise", 0, 1), ("jump_apex", 2, 2), ("jump_fall", 3, 4)]


# ---------- 被拎起来挣扎 / 放下爬起 / 死掉 ----------
def legs_fk(abd, swing, bend, toe=0, pitch=0):
    """腿直接给角度：toe = 脚尖再往下压多少（0 = 鞋底和地面平行，已经扣掉身体前倾 pitch）"""
    return (abd, swing, bend, swing - bend - pitch + toe, 0)


def body_pose(legs, arms, body_R=None, lean=0, head_yaw=0, ground="soles", root_x=0, air=0, hand_dy=0):
    """legs / arms：{side: ...} 或者两边一样的一组；arms = (外张, 胸口坐标里的前摆, 屈肘)"""
    L = legs if isinstance(legs, dict) else {-1: legs, 1: legs}
    A = arms if isinstance(arms, dict) else {-1: arms, 1: arms}
    return {"root": (root_x, 0, 0), "legs": L, "arms": {s: (*A[s], hand_dy) for s in (-1, 1)},
            "body_R": body_R, "lean": lean, "head_dy": 0, "head_yaw": head_yaw, "ground": ground, "air": air}


HANG_N = 6
HANG_PITCH = 18          # 被捏着后背：重心在捏的地方前面，人往前倾


def hang_pose(t):
    """被骷髅手捏着后背拎在空中：两腿乱蹬（像空中蹬自行车），两手乱挥，头左右甩，整个人跟着晃"""
    ph = 2 * math.pi * t
    legs, arms = {}, {}
    for side in (-1, 1):
        p = ph + (0 if side < 0 else math.pi)
        swing = 15 + 40 * math.sin(p)
        bend = 20 + 75 * max(0.0, math.cos(p))
        legs[side] = legs_fk(10, swing, bend, toe=55, pitch=HANG_PITCH)  # 悬空：脚尖往下耷拉
        q = ph * 2 + (0 if side < 0 else math.pi)                      # 手挥得比腿快一倍
        arms[side] = (30 + 20 * math.cos(q), 55 + 50 * math.sin(q), 35 + 25 * math.sin(q + 1))
    pose = body_pose(legs, arms, body_R=rz(5 * math.sin(ph)) @ rx(HANG_PITCH),
                     head_yaw=14 * math.sin(2 * ph), ground="pinch")
    pose["head_upright"] = True
    return pose


def getup_frames():
    """松手落地：脚一沾地膝盖一软，一屁股坐下，晃晃脑袋，手撑着蹲起来，站直（最后一帧就是 idle 第一帧）。
    坐地的几帧身子转得更侧（腿往前伸才看得出是坐着），头一直保持 3/4"""
    def f(yaw, legs, arms, body_R=None, shake=0, ground="soles"):
        p = body_pose(legs, arms, body_R=body_R, head_yaw=YAW - yaw + shake, ground=ground)
        p["yaw"] = yaw
        p["head_upright"] = True
        return p
    sit = -15
    return [
        # 脚刚沾地：腿还直着，手还举着
        f(30, legs_fk(6, 5, 10, pitch=10), (30, 70, 30), body_R=rx(10)),
        # 膝盖一软蹲下去
        f(38, legs_fk(6, 50, 95, pitch=15), (20, 60, 40), body_R=rx(15)),
        # 一屁股坐地上：膝盖朝上、脚往前伸，手撑在身后，头往一边歪
        f(55, legs_fk(8, 80, 70, pitch=sit), (15, -45, 0), body_R=rx(sit), shake=-15, ground="all"),
        # 坐着晃脑袋
        f(55, legs_fk(8, 80, 75, pitch=sit), (15, -40, 5), body_R=rx(sit), shake=15, ground="all"),
        # 身子往前一扑，蹲起来，手扶膝盖
        f(45, legs_fk(6, 85, 130, pitch=25), (15, 50, 60), body_R=rx(25), ground="all"),
        # 站起来一半
        f(38, legs_fk(6, 45, 80, pitch=15), (12, 30, 40), body_R=rx(15)),
        # 快站直了
        f(32, legs_fk(6, 20, 35, pitch=5), (10, 15, 25), body_R=rx(5)),
        IDLE[0],
    ]


GETUP_MS = [80, 90, 220, 220, 120, 100, 90, 140]


# ---------- 贴墙滑（设定集 01_player 第 10 格）：面朝墙（墙在画面右边），近镜头那只手往上撑在墙上，
# 远的那只手屈肘扶着墙；近腿提膝、鞋底平贴墙面，远腿往下垂、脚尖点着墙。两帧：手和点墙的脚往下蹭一下（在往下滑） ----------
WALL_YAW = 80            # 身子差不多转成侧面（往前伸的手脚才够得到墙、看得清），头转回 3/4
WALL_X = 31              # 帧里贴着墙的那一列：碰撞框右边缘在第 32 列（宽 0.75 格、居中），手脚画到第 31 列正好贴墙


def wallslide_pose(t):
    """t = 0 / 1：撑墙的手和点墙的脚往下蹭一点"""
    d = 5 * t
    legs = {
        -1: legs_fk(-8, 85, 45, toe=-90),                   # 近腿：提膝，鞋底转成竖的平贴墙面
        1: legs_fk(-6, 42 - d, 8 + d, toe=55),              # 远腿：往下垂，脚尖往下点着墙
    }
    arms = {-1: (6, 112 - d, 4 + d), 1: (12, 62, 70)}      # (外张, 胸口坐标里的前摆, 屈肘)：近手往前上方伸、越过头的前沿撑在墙上（再高会挡住面罩），远手屈肘扶墙
    p = body_pose(legs, arms, lean=-12, head_yaw=-(WALL_YAW - YAW), ground="all")
    p["wall_x"] = WALL_X
    p["neck"] = 0.3
    return p


# ---------- 推箱子：上身往前压，两手平伸按在箱子面上，腿一步步往后蹬（脚在身子后面使劲）。4 帧一循环 ----------
PUSH_LEAN = 34           # 上身前倾（度）


def push_pose(t):
    ph = 2 * math.pi * t
    legs, arms = {}, {}
    for side in (-1, 1):
        p = ph + (0 if side < 0 else math.pi)
        s = math.sin(p)
        swing = -16 + 20 * s                                    # 两条腿整体在身后：往后蹬
        bend = 26 + 30 * max(0.0, math.cos(p + 0.5)) ** 1.3     # 两腿都弯着压低身子；往前迈的那条腿再抬一点（抬得不高：一步步挪）
        legs[side] = (-10, swing, bend, swing - bend, 0)        # 鞋底一直平着
        arms[side] = (8, 108 - PUSH_LEAN + 3 * s, 26, 0)        # 手在胸口那么高往前推（世界里略高于平伸；胸口坐标要减掉前倾），跟着步子轻轻前后蹭
    return {"root": (0, 0, 0), "legs": legs, "arms": arms, "lean": PUSH_LEAN, "shift": 1.2,
            "twist": -6 * math.sin(ph), "head_dy": -2, "neck": 0.2, "head_yaw": -(RUN_YAW - YAW),
            "hip_x": 1.6, "leg_scale": 1.3, "shoe_d": 7.5, "plain_torso": True,
            "wall_x": WALL_X, "air": 0}


PUSH_N = 4


# ---------- 拉箱子：面朝箱子（箱子在画面右边），身子往后仰，两手平伸抓住箱子，脚一步步往后退。4 帧一循环 ----------
PULL_LEAN = -30          # 上身往后仰（度）


def pull_pose(t):
    ph = -2 * math.pi * t                                       # 倒着走：步子的相位反过来转
    legs, arms = {}, {}
    for side in (-1, 1):
        p = ph + (0 if side < 0 else math.pi)
        s = math.sin(p)
        swing = 22 + 18 * s                                     # 两条腿整体在身前：往后坐着使劲，脚撑在前面
        bend = 40 + 30 * max(0.0, math.cos(p + 0.5)) ** 1.3     # 两腿弯着坐低；往后退的那条腿再抬起来一点
        legs[side] = (-10, swing, bend, swing - bend, 0)
        arms[side] = (8, 60 + 2 * s, 6, 0)                      # 手平伸、肘伸直（拽着）：胸口往后仰了，胸口坐标里的前摆要比平伸小
    return {"root": (0, 0, 0), "legs": legs, "arms": arms, "lean": PULL_LEAN, "shift": -1.5,
            "twist": 5 * math.sin(ph), "head_dy": 0, "neck": 0.4, "head_yaw": -(RUN_YAW - YAW),
            "hip_x": 1.6, "leg_scale": 1.3, "shoe_d": 7.5, "plain_torso": True,
            "wall_x": WALL_X, "air": 0}


PULL_N = 4


def snap_to_wall(img, x):
    """整张图横着挪，让最右边的不透明像素落在第 x 列（手脚贴着墙）"""
    a = np.array(img)
    cols = np.nonzero(a[:, :, 3].max(0))[0]
    if not len(cols):
        return img
    dx = x - int(cols.max())
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (dx, 0))
    return out


def place_on_ground(pose):
    """骨盆高度 = 让最低的鞋底贴地，再加上腾空"""
    probe = build(pose)
    y = pose["root"][1] - lowest_sole(probe) + pose.get("air", 0)
    pose = dict(pose, root=(pose["root"][0], y, pose["root"][2]))
    return build(pose)


def lowest_any(root):
    """身上所有盒子最低的那个角（坐着、躺着时贴地用）"""
    ys = []
    for b, R, c in root.walk():
        for s in itertools.product((-1, 1), repeat=3):
            ys.append((c + R @ (b.half * s))[1])
    return min(ys)


# 被拎起来时捏的地方：后背上部（躯干盒子局部坐标，盒子中心在躯干中间）；在帧里固定对准这个像素
PINCH_LOCAL = np.array([0, 3.25, -TORSO[2] / 2 - 0.3])
PINCH_PX = (20, 16)


def pinch_point(root):
    for b, R, c in root.walk():
        if getattr(b, "tag", None) == "torso":
            return c + R @ PINCH_LOCAL
    raise ValueError("no torso")


def place(pose, yaw, pitch=0):
    """按 pose["ground"] 摆：soles = 鞋底贴地（默认），all = 身上最低点贴地，pinch = 后背捏合点对准 PINCH_PX"""
    mode = pose.get("ground", "soles")
    if mode == "soles":
        return place_on_ground(pose)
    if mode == "all":
        y = pose["root"][1] - lowest_any(build(pose)) + pose.get("air", 0)
        return build(dict(pose, root=(pose["root"][0], y, pose["root"][2])))
    V = rx(pitch) @ ry(yaw)
    pv = V @ pinch_point(build(pose))
    target = np.array([PINCH_PX[0] - 20, 40 - PINCH_PX[1], pv[2]])   # 画布原点 (20, 40)
    shift = V.T @ (target - pv)
    return build(dict(pose, root=tuple(np.array(pose["root"], float) + shift)))


# ---------- 光线 ----------
LIGHT = np.array([0.5, 0.75, 0.45]) / np.linalg.norm([0.5, 0.75, 0.45])


def render(root, yaw, pitch, size=(40, 40), origin=(20, 40), light=None, bands=(0.7, 0.3, -0.5)):   # 脚底 = 画布最下面一行（游戏里精灵底边就是碰撞框底边）
    """light：光从哪来（镜头坐标，默认 LIGHT）；bands：亮面 / 基色 / 暗面 三条分界（再往下是最暗）"""
    W, H = size
    L = LIGHT if light is None else np.array(light, float) / np.linalg.norm(light)
    V = rx(pitch) @ ry(yaw)                          # 先转身（正 = 面朝画面右），再俯视
    jj, ii = np.mgrid[0:H, 0:W]
    O = np.stack([ii + 0.5 - origin[0], origin[1] - (jj + 0.5), np.full((H, W), 500.0)], -1).reshape(-1, 3)
    N = len(O)
    best_t = np.full(N, np.inf)
    best_k = np.full(N, -1)
    best_ax = np.zeros(N, int)
    best_sg = np.zeros(N)
    best_p = np.zeros((N, 3))
    items = list(root.walk())
    mats = []
    for k, (b, Rw, cw) in enumerate(items):
        A = V @ Rw
        mats.append(A)
        ol = (O - V @ cw) @ A                       # 每个像素的光线起点，换到盒子局部坐标
        dl = A.T @ np.array([0, 0, -1.0])
        tmin = np.empty((N, 3)); tmax = np.empty((N, 3))
        for a in range(3):
            if abs(dl[a]) < 1e-9:
                inside = np.abs(ol[:, a]) <= b.half[a]
                tmin[:, a] = np.where(inside, -np.inf, np.inf)
                tmax[:, a] = np.where(inside, np.inf, -np.inf)
            else:
                t1 = (-b.half[a] - ol[:, a]) / dl[a]
                t2 = (b.half[a] - ol[:, a]) / dl[a]
                tmin[:, a] = np.minimum(t1, t2)
                tmax[:, a] = np.maximum(t1, t2)
        tn, ax, tf = tmin.max(1), tmin.argmax(1), tmax.min(1)
        hit = (tn <= tf) & (tf > 0) & (tn < best_t - 1e-6)
        best_t[hit], best_k[hit], best_ax[hit] = tn[hit], k, ax[hit]
        best_sg[hit] = -np.sign(dl[ax[hit]])
        best_p[hit] = ol[hit] + tn[hit, None] * dl
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    px = img.load()
    for n in np.nonzero(best_k >= 0)[0]:
        b = items[best_k[n]][0]
        nl = np.zeros(3); nl[best_ax[n]] = best_sg[n]
        br = float((mats[best_k[n]] @ nl) @ L)
        shade = min(3, (0 if br > bands[0] else 1 if br > bands[1] else 2 if br > bands[2] else 3) + b.dim)
        c = b.decal(best_ax[n], best_sg[n], best_p[n], shade) if b.decal else None
        px[int(n % W), int(n // W)] = c or RAMP[b.mat][shade]
    return img


def cleanup(img):
    """轮廓上只挂着一个邻居的孤点删掉；四周同色包围的单个杂色点抹平"""
    w, h = img.size
    src = img.load()
    out = img.copy()
    dst = out.load()

    def at(x, y):
        return src[x, y] if 0 <= x < w and 0 <= y < h else (0, 0, 0, 0)
    for y in range(h):
        for x in range(w):
            c = src[x, y]
            if c[3] == 0:
                continue
            nb = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)]
            if sum(1 for n in nb if n[3]) <= 1:
                dst[x, y] = (0, 0, 0, 0)
            elif nb[0] == nb[1] == nb[2] == nb[3] != c and nb[0][3]:
                dst[x, y] = nb[0]
    return out


YAW, PITCH = 30, 0   # 平视：水平线不会被斜成锯齿
RUN_YAW = float(os.environ.get("RUN_YAW", 70))   # 跑起来身子转得更侧，步幅才看得清（头单独转回 3/4）
RUN = [run_pose(i / RUN_N) for i in range(RUN_N)]
JUMP = jump_frames()
HANG = [hang_pose(i / HANG_N) for i in range(HANG_N)]
HANG_MS = [90] * HANG_N
GETUP = getup_frames()
WALLSLIDE = [wallslide_pose(0), wallslide_pose(1)]
WALLSLIDE_MS = [120, 120]
PUSH = [push_pose(i / PUSH_N) for i in range(PUSH_N)]
PUSH_MS = [150] * PUSH_N
PULL = [pull_pose(i / PULL_N) for i in range(PULL_N)]
PULL_MS = [170] * PULL_N

if __name__ == "__main__":
    out = sys.argv[1]
    only = set(sys.argv[2:])          # 后面写了动作名就只渲染这几段（追加用，见开头的 append_anims.lua）
    anims = []
    for name, poses, ms, yaw in (("idle", IDLE, IDLE_MS, YAW), ("run", RUN, RUN_MS, RUN_YAW),
                                 ("jump", JUMP, JUMP_MS, RUN_YAW), ("hang", HANG, HANG_MS, YAW),
                                 ("getup", GETUP, GETUP_MS, YAW), ("wallslide", WALLSLIDE, WALLSLIDE_MS, WALL_YAW),
                                 ("push", PUSH, PUSH_MS, RUN_YAW), ("pull", PULL, PULL_MS, RUN_YAW)):
        if only and name not in only:
            continue
        os.makedirs(f"{out}/{name}", exist_ok=True)
        files = []
        for f, pose in enumerate(poses):
            path = f"{out}/{name}/f{f}.png"
            fy = pose.get("yaw", yaw)
            img = cleanup(render(place(pose, fy, PITCH), fy, PITCH))
            if "wall_x" in pose:
                img = snap_to_wall(img, pose["wall_x"])
            img.save(path)
            files.append(os.path.abspath(path).replace("\\", "/"))
        anim = {"tag": name, "files": files, "ms": ms}
        if name == "jump":
            anim["subtags"] = [{"tag": t, "from": a, "to": b} for t, a, b in JUMP_SUBTAGS]
        anims.append(anim)
    json.dump({"w": 40, "h": 40, "anims": anims}, open(f"{out}/anims.json", "w"), indent=1)
    print("ok", [(a["tag"], len(a["files"])) for a in anims])
