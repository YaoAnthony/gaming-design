"""把 render_hand.py 渲出来的 4 倍原图缩成像素图，并把颜色锁到调色板。

  python pixelize.py <渲染目录> [--super 4] [--pad 1]

每个 4x4 块：不透明像素过半才算不透明；颜色取块里出现最多的那个（同票取更暗的，细缝不容易丢）。
最后每个像素换成调色板里最接近的颜色，再裁掉透明边。
输出 <渲染目录>/<姿势>.png
"""
import argparse
import os

import numpy as np
from PIL import Image

PALETTE = [
    "#d6c4a2", "#b8a688", "#9c8c74", "#776a5a", "#4d453c",   # 木头 + 凹槽
    "#d2bf9e", "#b09e80", "#978770", "#786b5b",              # 护腕
    "#6b6254", "#958470",                                    # 护腕方框 / 中间小方块
    "#625e55", "#524f47", "#45433d", "#383631",              # 手腕关节
    "#5e5447", "#51483d",                                    # 指节暗缝
    "#80836c", "#636655", "#54574a", "#45483d",              # 绿方块
]
PAL = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in PALETTE], dtype=np.int32)


def lock(rgb):
    """每个像素换成调色板里最接近的颜色"""
    d = ((rgb[..., None, :].astype(np.int32) - PAL[None, None]) ** 2).sum(-1)
    return PAL[d.argmin(-1)].astype(np.uint8)


def downsample(img, s):
    a = np.asarray(img.convert("RGBA"))
    h, w = a.shape[0] // s, a.shape[1] // s
    a = a[:h * s, :w * s].reshape(h, s, w, s, 4).transpose(0, 2, 1, 3, 4).reshape(h, w, s * s, 4)
    opaque = a[..., 3] > 127
    out = np.zeros((h, w, 4), np.uint8)
    keys = (a[..., 0].astype(np.int64) << 16) | (a[..., 1].astype(np.int64) << 8) | a[..., 2]
    for y in range(h):
        for x in range(w):
            m = opaque[y, x]
            if m.sum() * 2 < s * s:
                continue
            vals, counts = np.unique(keys[y, x][m], return_counts=True)
            best = counts.max()
            cand = vals[counts == best]
            k = min(cand, key=lambda v: (v >> 16) + ((v >> 8) & 255) + (v & 255))   # 同票取更暗的
            out[y, x] = ((k >> 16) & 255, (k >> 8) & 255, k & 255, 255)
    out[..., :3] = np.where(out[..., 3:] > 0, lock(out[..., :3]), 0)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--super", type=int, default=4)
    ap.add_argument("--pad", type=int, default=1)
    args = ap.parse_args()
    names = sorted(f[4:-4] for f in os.listdir(args.dir) if f.startswith("raw_") and f.endswith(".png"))
    arrs = {n: downsample(Image.open(os.path.join(args.dir, f"raw_{n}.png")), args.super) for n in names}
    for n, a in arrs.items():
        ys, xs = np.nonzero(a[..., 3])
        y0, y1 = max(ys.min() - args.pad, 0), min(ys.max() + 1 + args.pad, a.shape[0])
        x0, x1 = max(xs.min() - args.pad, 0), min(xs.max() + 1 + args.pad, a.shape[1])
        Image.fromarray(a[y0:y1, x0:x1], "RGBA").save(os.path.join(args.dir, f"{n}.png"))
        print(n, f"{x1 - x0}x{y1 - y0}")


if __name__ == "__main__":
    main()
