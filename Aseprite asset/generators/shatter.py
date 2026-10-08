"""主角炸碎用的美术：
  1. 碎块：站姿（idle 第一帧）按骨骼节点拆开，每块单独渲染（头、躯干、肩+上臂、前臂+手、髋+大腿、小腿、鞋，左右各一），
     放进一格一格的图里（每格 CELL x CELL，碎块在格子正中）。meta.json 记下每块格子中心在 40x40 主角帧里的位置
     （相对脚底中点）、碎块本身的宽高、前后顺序：游戏里按这个把碎块拼回原样，再交给物理引擎炸开。
  2. 爆炸特效：星芒闪光 + 火星 + 烟雾，64x64，中心就是炸点（胸口）。
用法: python shatter.py <输出目录>   → <dir>/debris/f*.png + meta.json，<dir>/boom/f*.png + ms.json
"""
import json
import math
import os
import random
import sys
import numpy as np
from PIL import Image, ImageDraw

import boxman as B
from boxman import Box, Node, hexc

FRAME, ANCHOR = (40, 40), (20, 40)      # 主角帧大小、脚底中点
CHEST = np.array([0, 13.0, 0])          # 炸点：胸口（模型坐标，离地 13）


def groups(node, R=np.eye(3), t=np.zeros(3)):
    """按骨骼节点分块：同一个节点上的盒子是一块刚体"""
    Rw, tw = R @ node.R, R @ node.t + t
    out = []
    if node.boxes:
        out.append([(b, Rw, tw + Rw @ b.center) for b in node.boxes])
    for c in node.children:
        out += groups(c, Rw, tw)
    return out


def piece_image(boxes):
    root = Node()
    for b, R, c in boxes:
        root.child(Node(c, R)).add(Box(b.mat, b.half * 2, (0, 0, 0), decal=b.decal, dim=b.dim))
    return B.render(root, B.YAW, 0, size=FRAME, origin=ANCHOR)


def debris():
    root = B.place(B.IDLE[0], B.YAW)
    V = B.ry(B.YAW)
    parts = []
    for boxes in groups(root):
        img = piece_image(boxes)
        bb = img.getbbox()
        if not bb:
            continue                                     # 整块被挡住看不见（不会发生，保险）
        crop = img.crop(bb)
        depth = float(np.mean([(V @ c)[2] for _, _, c in boxes]))   # 离镜头多近：大 = 在前面
        name = next((b.mat for b, _, _ in boxes if b.mat in ("face", "wood", "hand", "shoe")), boxes[0][0].mat)
        parts.append({"img": crop, "bb": bb, "depth": depth, "name": name})
    cell = max(max(p["img"].size) for p in parts)
    cell += cell % 2
    frames, meta = [], []
    for p in sorted(parts, key=lambda p: p["depth"]):    # 从后往前：游戏里按这个顺序叠
        w, h = p["img"].size
        px, py = (cell - w) // 2, (cell - h) // 2
        f = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
        f.paste(p["img"], (px, py))
        frames.append(f)
        x0, y0 = p["bb"][0], p["bb"][1]
        meta.append({"name": p["name"], "w": w, "h": h,
                     # 格子中心在主角帧里的位置，相对脚底中点（像素，向右 / 向下为正）
                     "x": x0 - px + cell / 2 - ANCHOR[0], "y": y0 - py + cell / 2 - ANCHOR[1]})
    chest = (V @ CHEST)
    return frames, {"cell": cell, "chest": [float(chest[0]), float(-chest[1])], "pieces": meta}


# ---------- 爆炸特效 ----------
BOOM_SIZE = (64, 64)
FLASH_CORE, FLASH_RING = hexc("#fff8e6"), hexc("#e8a066")
SMOKE = [hexc("#e2d8c2"), hexc("#c9bca2"), hexc("#a99c84")]
SPARK = [hexc("#f6d28a"), hexc("#c0805c")]


def disc(img, cx, cy, r, colors, mask=None):
    """像素圆：左上亮、右下暗；mask(x, y) 返回 False 的像素不画（做抖动淡出）"""
    px = img.load()
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            if dx * dx + dy * dy > r * r or not (0 <= x < img.width and 0 <= y < img.height):
                continue
            if mask and not mask(x, y):
                continue
            k = 0 if dx + dy < -r * 0.4 else 2 if dx + dy > r * 0.6 else 1
            px[x, y] = colors[min(k, len(colors) - 1)]


def dither(level):
    """level 0~1：留下多少像素（4x4 有序抖动）"""
    bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
    return lambda x, y: bayer[y % 4][x % 4] < level * 16


def starburst(img, cx, cy, r, n=9, seed=5):
    """不规则的爆炸星：n 根长短不一的尖刺（橙），中间一团亮白"""
    rnd = random.Random(seed)
    g = ImageDraw.Draw(img)
    pts = []
    for i in range(n * 2):
        a = math.pi * 2 * i / (n * 2) + rnd.uniform(-0.12, 0.12)
        rr = r * (rnd.uniform(1.0, 1.45) if i % 2 == 0 else rnd.uniform(0.45, 0.6))
        pts.append((cx + math.cos(a) * rr, cy - math.sin(a) * rr))
    g.polygon(pts, fill=FLASH_RING)
    disc(img, cx, cy, r * 0.55, [FLASH_CORE])


def boom():
    cx, cy = BOOM_SIZE[0] / 2, BOOM_SIZE[1] / 2
    rnd = random.Random(3)
    puffs = [(rnd.uniform(-9, 9), rnd.uniform(-8, 6), rnd.uniform(3.5, 5.5)) for _ in range(6)]
    sparks = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(1.6, 3.0)) for _ in range(10)]
    # (星芒半径, 烟的大小, 烟留下多少, 火星走了多远)
    plan = [(11, 0, 0, 1.0), (7, 0.6, 1, 1.9), (0, 0.9, 1, 2.8), (0, 1.15, 0.85, 3.6),
            (0, 1.4, 0.6, 4.3), (0, 1.6, 0.35, 0), (0, 1.75, 0.15, 0)]
    out = []
    for i, (flash_r, k, left, st) in enumerate(plan):
        img = Image.new("RGBA", BOOM_SIZE, (0, 0, 0, 0))
        if k and left:
            for ox, oy, r in puffs:
                disc(img, cx + ox * k, cy + oy * k - i * 1.2, r * min(k, 1.6) * 0.9, SMOKE,
                     mask=dither(left) if left < 1 else None)
        if flash_r:
            starburst(img, cx, cy, flash_r)
        if st:
            g = ImageDraw.Draw(img)
            for a, sp in sparks:
                x = cx + math.cos(a) * sp * st * 3
                y = cy - math.sin(a) * sp * st * 3 + 0.4 * st * st
                g.point((int(x), int(y)), fill=SPARK[0])
                g.point((int(x - math.cos(a)), int(y + math.sin(a))), fill=SPARK[1])
        out.append(img)
    return out, [60, 60, 70, 70, 80, 90, 100]


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(f"{out}/debris", exist_ok=True)
    os.makedirs(f"{out}/boom", exist_ok=True)
    frames, meta = debris()
    for i, f in enumerate(frames):
        f.save(f"{out}/debris/f{i}.png")
    json.dump(meta, open(f"{out}/debris/meta.json", "w"), indent=1)
    imgs, ms = boom()
    for i, f in enumerate(imgs):
        f.save(f"{out}/boom/f{i}.png")
    json.dump(ms, open(f"{out}/boom/ms.json", "w"))
    print("debris", len(frames), "pieces, cell", meta["cell"], "| boom", len(imgs), "frames")
