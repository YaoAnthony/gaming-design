"""倒角方块 + 环境光遮蔽的像素渲染（给木手这种圆润、有凹槽的东西用；主角还是用 boxman.render）。

每个盒子可以有 b.bevel（倒角宽，像素）：盒子 = 6 个面 + 12 条棱的斜切面 + 8 个角的斜切面围成的凸多面体，
光线和一组平面求交（推广的 slab 法）。倒角面有自己的朝向，打光后自然出现亮边 / 暗边。
环境光遮蔽：每个看得见的点沿法线半球撒几个探针，探针落进别的盒子里越多，这里越暗（凹槽、拳心、指缝变深）。
"""
import itertools
import math
import numpy as np
from PIL import Image

import boxman as B


def planes(half, c):
    """倒角盒子的所有平面 (n, d)：n·p <= d"""
    ns, ds = [], []
    for k in range(3):
        for s in (-1, 1):
            n = np.zeros(3); n[k] = s
            ns.append(n); ds.append(half[k])
    if c > 0:
        for a, b in ((0, 1), (0, 2), (1, 2)):
            for sa, sb in itertools.product((-1, 1), repeat=2):
                n = np.zeros(3); n[a], n[b] = sa, sb
                ns.append(n / math.sqrt(2)); ds.append((half[a] + half[b] - c) / math.sqrt(2))
        for s in itertools.product((-1, 1), repeat=3):
            n = np.array(s, float)
            ns.append(n / math.sqrt(3)); ds.append((half.sum() - 2 * c) / math.sqrt(3))
    return np.array(ns), np.array(ds)


def hemisphere(n_view, k=10, spread=55):
    """沿每个法线撒 k 个方向：正法线 + 一圈往外歪 spread 度的"""
    up = np.where(np.abs(n_view[:, 1:2]) < 0.9, np.array([[0, 1, 0]]), np.array([[1, 0, 0]]))
    t1 = np.cross(n_view, up); t1 /= np.linalg.norm(t1, axis=1, keepdims=True)
    t2 = np.cross(n_view, t1)
    dirs = [n_view]
    s, c = math.sin(math.radians(spread)), math.cos(math.radians(spread))
    for i in range(k - 1):
        a = 2 * math.pi * i / (k - 1)
        dirs.append(c * n_view + s * (math.cos(a) * t1 + math.sin(a) * t2))
    return dirs


def render(root, yaw, pitch, size, origin, light=(-0.35, 0.8, 0.5), bands=(0.6, 0.05, -0.45),
           ao_radius=4.0, ao_levels=(0.25, 0.5, 0.7)):
    """ao_levels：被遮住的比例超过这些值时各再暗一档（最多到材质的最后一档，材质可以有 5 档）"""
    W, H = size
    L = np.array(light, float) / np.linalg.norm(light)
    V = B.rx(pitch) @ B.ry(yaw)
    jj, ii = np.mgrid[0:H, 0:W]
    O = np.stack([ii + 0.5 - origin[0], origin[1] - (jj + 0.5), np.full((H, W), 500.0)], -1).reshape(-1, 3)
    N = len(O)
    best_t = np.full(N, np.inf)
    best_k = np.full(N, -1)
    best_n = np.zeros((N, 3))      # 命中面的法线（盒子局部）
    best_main = np.full(N, -1)     # 命中的是 6 个主面里的哪个（0..5），倒角面 = -1
    best_p = np.zeros((N, 3))
    items = list(root.walk())
    prepared = []
    for k, (b, Rw, cw) in enumerate(items):
        A = V @ Rw
        tc = V @ cw
        ns, ds = planes(b.half, getattr(b, "bevel", 0.0))
        prepared.append((A, tc, b.half))
        ol = (O - tc) @ A
        dl = A.T @ np.array([0, 0, -1.0])
        den = ns @ dl                                  # m
        num = ds[None, :] - ol @ ns.T                  # N x m
        with np.errstate(divide="ignore", invalid="ignore"):
            t = num / den[None, :]
        enter = den < -1e-12
        leave = den > 1e-12
        par = ~(enter | leave)
        tn = np.where(enter[None, :], t, -np.inf).max(1)
        which = np.where(enter[None, :], t, -np.inf).argmax(1)
        tf = np.where(leave[None, :], t, np.inf).min(1)
        outside_par = (num[:, par] < 0).any(1) if par.any() else np.zeros(N, bool)
        hit = (tn <= tf) & (tf > 0) & ~outside_par & (tn < best_t - 1e-6)
        best_t[hit], best_k[hit] = tn[hit], k
        best_n[hit] = ns[which[hit]]
        best_main[hit] = np.where(which[hit] < 6, which[hit], -1)
        best_p[hit] = ol[hit] + tn[hit, None] * dl

    idx = np.nonzero(best_k >= 0)[0]
    # 命中点和法线（镜头坐标）
    P = O[idx] + best_t[idx, None] * np.array([0, 0, -1.0])
    Nv = np.stack([prepared[best_k[i]][0] @ best_n[i] for i in idx]) if len(idx) else np.zeros((0, 3))
    # 环境光遮蔽：探针落进任何盒子里的比例
    occl = np.zeros(len(idx))
    if ao_radius > 0 and len(idx):
        dirs = hemisphere(Nv)
        for d in dirs:
            for frac in (0.45, 1.0):                  # 每个方向两个探针：半径一半处、整个半径处
                Q = P + d * (0.3 + frac * ao_radius)
                inside = np.zeros(len(idx), bool)
                for (A, tc, half) in prepared:
                    loc = (Q - tc) @ A
                    inside |= (np.abs(loc) <= half).all(1)
                occl += inside
        occl /= 2 * len(dirs)

    img = Image.new("RGBA", size, (0, 0, 0, 0))
    px = img.load()
    for j, n in enumerate(idx):
        b = items[best_k[n]][0]
        br = float(Nv[j] @ L)
        shade = 0 if br > bands[0] else 1 if br > bands[1] else 2 if br > bands[2] else 3
        shade += sum(1 for lv in ao_levels if occl[j] > lv) + b.dim
        ramp = B.RAMP[b.mat]
        shade = min(len(ramp) - 1, shade)
        c = None
        if b.decal and best_main[n] >= 0:
            m = best_main[n]
            c = b.decal(m // 2, -1 if m % 2 == 0 else 1, best_p[n], shade)
        px[int(n % W), int(n // W)] = c or ramp[shade]
    return img
