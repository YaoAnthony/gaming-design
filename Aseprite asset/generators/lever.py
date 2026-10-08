"""拉杆：一格（32x32），关 = 手柄竖直，开 = 手柄往右倒。中间几帧是扳过去的过程（扳到头稍微过一点再弹回来）。
石板底座 + 木色方块（正面一个深色方框、中间一块浅色小方块，和木手护腕同一种做法）+ 锈橙色手柄（杆细、顶头粗）。
用倒角方块 + 环境光遮蔽渲染（bevel_render），正对镜头、稍微俯视，横平竖直的边不会出锯齿。
用法: python lever.py <输出目录>   → <dir>/lever/f*.png + ms.json
"""
import json
import os
import sys
import numpy as np

import boxman as B
import bevel_render as R
from boxman import Box, Node, rz, hexc

B.RAMP.update({k: [hexc(c) for c in v] for k, v in {
    # 5 档：亮面 / 基色 / 暗面 / 最暗 / 凹槽里
    "slab":  ["#c3c6c9", "#9a9fa4", "#7c8186", "#5e6267", "#45484c"],   # 石板
    "block": ["#ddcdab", "#c2b08e", "#a59478", "#857762", "#5f5446"],   # 木色底座
    "rust":  ["#de9466", "#c06a3f", "#9c5232", "#7a3f27", "#552c1c"],   # 手柄
    "slot":  ["#4a4642", "#36332f", "#2a2825", "#201e1c", "#181715"],   # 手柄插进去的槽
}.items()})
FRAME_DARK, FRAME_LIGHT = hexc("#2e3033"), hexc("#dfe2dc")             # 正面的方框、中间的小方块

SIZE, ORIGIN = (32, 32), (16, 29)          # 俯视时石板前沿会低于地面，往上让 3 像素
SLAB = (30, 3, 14)
BLOCK = (14, 10, 12)
TOP = SLAB[1] + BLOCK[1]                 # 底座顶面离地多高（手柄转轴在这）


def block_decal(axis, sign, p, shade):
    """正面（+z）：深色方框里嵌一块浅色小方块；顶面：手柄插进去的槽"""
    if axis == 2 and sign > 0:
        m = max(abs(p[0]), abs(p[1] - 0.8))           # 方框比正面中线略高一点
        if m <= 1.4:
            return FRAME_LIGHT
        if m <= 3.4:
            return FRAME_DARK
    if axis == 1 and sign > 0 and abs(p[0]) <= 2.2 and abs(p[2]) <= 1.6:
        return B.RAMP["slot"][min(shade + 1, 4)]
    return None


def bev(box, c):
    box.bevel = c
    return box


def lever(angle):
    """angle：手柄往右倒多少度（0 = 竖直）"""
    root = Node()
    root.add(bev(Box("slab", SLAB, (0, SLAB[1] / 2, 0)), 0.8),
             bev(Box("block", BLOCK, (0, SLAB[1] + BLOCK[1] / 2, 0), decal=block_decal), 1.2))
    handle = root.child(Node((0, TOP - 0.5, 0), rz(-angle)))      # 转轴在顶面中间，往下埋一点
    handle.add(bev(Box("rust", (3, 10, 3), (0, 5, 0)), 0.6),
               bev(Box("rust", (5, 4.5, 5), (0, 10.5, 0)), 1.1))   # 顶上的握把粗一圈
    return root


ANGLES = [0, 18, 34, 48, 58, 52]          # 关 → 开：扳到头过一点（58）再弹回来停在 52
MS = [120, 50, 50, 50, 70, 120]

if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(f"{out}/lever", exist_ok=True)
    for i, a in enumerate(ANGLES):
        img = R.render(lever(a), 0, 18, size=SIZE, origin=ORIGIN, light=(-0.35, 0.8, 0.5),
                       bands=(0.6, 0.05, -0.45), ao_radius=2.5)
        B.cleanup(img).save(f"{out}/lever/f{i}.png")
    json.dump(MS, open(f"{out}/lever/ms.json", "w"))
    print("ok", len(ANGLES), "frames")
