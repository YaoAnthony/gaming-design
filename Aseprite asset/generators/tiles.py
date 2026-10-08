"""地形砖块的帧生成器（B1 木作关节剧场：低细节、粗像素、完整顶边；每种材料一个主色一个阴影，一道接缝 / 安装孔就够）。

一、拼墙模板（游戏里连在一起的同种砖拼成一整块，见 game-master/src/game/terrain/walls.ts）：
  每种材料一张 wall_<材料>.png：4 个「相位」横排，每个相位 5×3 格（一格 32 像素）：
    (0,0) 左上角  (1,0) 上边  (2,0) 右上角 | (3,0) 左上折角  (4,0) 右上折角
    (0,1) 左边    (1,1) 中间  (2,1) 右边   | (3,1) 左下折角  (4,1) 右下折角
    (0,2) 左下角  (1,2) 下边  (2,2) 右下角 | 空着
  相位 = 这一格的列号 mod 4：同一张纹理（砌缝、裂纹、沙粒、纸线）横跨 4 格连续，4 格一循环，
  大片的墙看着是一整面砌好的墙，不是一格一格重复的小方块。游戏启动时按周围 8 格从模板里取四个角拼起来（47 种）。
二、tiles.png：编辑器 / 物品栏 / 不拼墙的砖用的单格图（帧号和 asset/index.ts 的 TILE_FRAMES 对应）。
三、特效：tile_debris.png（被炸碎时飞出去的碎块，每种材料 4 块）、tile_crack.png（岩石被引线烧裂的过程）、
    tile_ghost.png（炸没之后一闪而过的虚线空位）、tile_dust.png（落地扬尘）、fusenode.png（引线头）。

用法（在本文件夹里跑，GAME = ../../game-master/src/asset/image，ASE = Aseprite.exe，见 boxman.py 开头）：
  python tiles.py frames_tiles            → frames_tiles/ 下所有 png（模板、单格图、特效）+ preview.png（拼好的样例房间）
  然后把 frames_tiles/*.png 里除了 preview.png 之外的复制到 GAME/tiles/
  存一份 Aseprite 源文件（会覆盖 ../tiles/*.aseprite，方便手改）：ASE -b frames_tiles/wall_rock.png --save-as ../tiles/wall_rock.aseprite（每张一样）
  在 Aseprite 里手改过之后导出：ASE -b ../tiles/wall_rock.aseprite --save-as GAME/tiles/wall_rock.png
  改模板时注意：同一个相位的 13 格内部纹理要一样（只在朝外的边上不同），相邻相位横着要接得上；边最多画 16 像素厚（游戏按四分之一格拼）
"""
import os
import sys
import numpy as np
from PIL import Image

T = 32
PHASES = 4


def hexc(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


CLEAR = (0, 0, 0, 0)


class Cell:
    """一格 RGBA 画布（x 向右、y 向下）"""

    def __init__(self, w=T, h=T):
        self.a = np.zeros((h, w, 4), np.uint8)
        self.w, self.h = w, h

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.a[y, x] = c

    def get(self, x, y):
        return tuple(self.a[y, x])

    def rect(self, x0, y0, x1, y1, c):          # 含两端
        for y in range(max(0, y0), min(self.h - 1, y1) + 1):
            for x in range(max(0, x0), min(self.w - 1, x1) + 1):
                self.a[y, x] = c

    def hline(self, x0, x1, y, c):
        self.rect(x0, y, x1, y, c)

    def vline(self, x, y0, y1, c):
        self.rect(x, y0, x, y1, c)

    def copy(self):
        n = Cell(self.w, self.h)
        n.a = self.a.copy()
        return n

    def img(self):
        return Image.fromarray(self.a, 'RGBA')


def hash2(*v):
    """确定的小哈希（同样的输入每次一样）"""
    h = 2166136261
    for x in v:
        h = ((h ^ (int(x) & 0xffffffff)) * 16777619) & 0xffffffff
    h ^= h >> 13
    h = (h * 1274126177) & 0xffffffff
    return h ^ (h >> 16)


# ---------------- 拼墙模板的格子 ----------------
# 每格：哪几面朝外（N 上 E 右 S 下 W 左），哪个斜角是凹进去的内角
CELLS = {
    'TL': ((0, 0), {'N', 'W'}, None), 'T': ((1, 0), {'N'}, None), 'TR': ((2, 0), {'N', 'E'}, None),
    'iTL': ((3, 0), set(), 'NW'), 'iTR': ((4, 0), set(), 'NE'),
    'L': ((0, 1), {'W'}, None), 'C': ((1, 1), set(), None), 'R': ((2, 1), {'E'}, None),
    'iBL': ((3, 1), set(), 'SW'), 'iBR': ((4, 1), set(), 'SE'),
    'BL': ((0, 2), {'S', 'W'}, None), 'B': ((1, 2), {'S'}, None), 'BR': ((2, 2), {'S', 'E'}, None),
}


class Material:
    """一种拼墙材料：interior(相位) 画内部纹理，edges() 在朝外的那几面画边"""
    name = ''

    def interior(self, phase):
        raise NotImplementedError

    def edges(self, c, out, concave, phase):
        raise NotImplementedError

    def cell(self, phase, out, concave=None):
        c = self.interior(phase)
        self.edges(c, out, concave, phase)
        return c

    def template(self):
        sheet = Image.new('RGBA', (PHASES * 5 * T, 3 * T), CLEAR)
        for p in range(PHASES):
            for (col, row), out, concave in CELLS.values():
                sheet.paste(self.cell(p, out, concave).img(), ((p * 5 + col) * T, row * T))
        return sheet

    def single(self):
        """单独一块（编辑器 / 物品栏）：四面朝外"""
        return self.cell(0, {'N', 'E', 'S', 'W'})


def frame_edges(c, out, concave, col):
    """通用的外框：朝外的那面画 1 像素描边，四个外角缺一个像素（圆一点），内角补一个描边像素。
    col = dict(outline, rim, cap1, cap2, under, side_hi, side_lo)，cap 画几行由 col['cap'] 决定"""
    N, E, S, W = ('N' in out), ('E' in out), ('S' in out), ('W' in out)
    cap = col.get('cap', [])
    if N:
        for i, cc in enumerate(cap):
            c.hline(0, T - 1, i, cc)
        c.hline(0, T - 1, 0, col['outline'])
        if col.get('rim'):
            c.hline(0, T - 1, 1, col['rim'])
    if S:
        for i, cc in enumerate(col.get('under', [])):
            c.hline(0, T - 1, T - 2 - i, cc)
        c.hline(0, T - 1, T - 1, col['outline'])
    top = len(cap) if N else 0
    if W:
        c.vline(1, top if N else 0, T - 2 if S else T - 1, col['side_hi'])
        c.vline(0, 0, T - 1, col['outline'])
    if E:
        c.vline(T - 2, top if N else 0, T - 2 if S else T - 1, col['side_lo'])
        c.vline(T - 1, 0, T - 1, col['outline'])
    # 朝外的顶边接到左右两边的竖边：顶面那几行在侧边也是亮的（看得出是一块的上表面）
    if N and W:
        for i in range(1, len(cap)):
            c.px(1, i, cap[i])
    if N and E:
        for i in range(1, len(cap)):
            c.px(T - 2, i, cap[i])
    # 外角：圆角（缺一个像素），再在里面补一个描边像素
    for cx, cy, a, b in ((0, 0, N, W), (T - 1, 0, N, E), (0, T - 1, S, W), (T - 1, T - 1, S, E)):
        if a and b:
            c.px(cx, cy, CLEAR)
            c.px(cx + (1 if cx == 0 else -1), cy + (1 if cy == 0 else -1), col['outline'])
    # 内角：凹进去的那个斜角上点一个描边像素，接上两边邻居的描边
    if concave:
        cx = 0 if 'W' in concave else T - 1
        cy = 0 if 'N' in concave else T - 1
        c.px(cx, cy, col['outline'])


# ---------------- 岩石：石墨色的砌石墙，亮的完整顶边 ----------------
# 两层石块一格（每层 16 像素），每层的砌缝在 4 格（128 像素）里错开排：一面墙看着是一块块长条石砌起来的
COURSES = [(0, [0, 40, 76, 104]), (16, [18, 58, 90])]


def stone_at(gx, y):
    """砌石：第几层、这层里第几块、在这块里的横向位置、这块多长；在砌缝上返回 None"""
    ci = 0 if y < 16 else 1
    y0, seams = COURSES[ci]
    gx %= PHASES * T
    pts = seams + [seams[0] + PHASES * T]
    for k in range(len(seams)):
        a, b = pts[k], pts[k + 1]
        for gg in (gx, gx + PHASES * T):
            if a <= gg < b:
                if gg == a:
                    return None
                return ci, k, gg - a, b - a
    return None


class Masonry(Material):
    def __init__(self, name, pal, cracks=False):
        self.name, self.p, self.cracks = name, pal, cracks

    def interior(self, phase):
        p = self.p
        c = Cell()
        for y in range(T):
            for x in range(T):
                gx = phase * T + x
                ly = y % 16
                if ly == 15:
                    c.px(x, y, p['mortar'])
                    continue
                s = stone_at(gx, y)
                if s is None:
                    c.px(x, y, p['mortar'])
                    continue
                ci, k, sx, ln = s
                tone = p['stone'][hash2(ci, k, 7) % len(p['stone'])]
                col = tone
                if ly == 0:
                    col = p['hi']                         # 每块石头的上沿亮一点
                elif ly == 14:
                    col = p['lo']                         # 下沿暗一点
                elif sx == 1:
                    col = p['hi']
                elif sx == ln - 1:
                    col = p['lo']
                c.px(x, y, col)
        if self.cracks:
            self.draw_cracks(c, phase)
        return c

    def draw_cracks(self, c, phase):
        """碎岩：每块石头自己裂开——大多数石头从上沿到下沿一道折线裂纹（裂纹的位置跟着石头走，石头横跨两格也是同一道），
        有的石头缺一个角；裂纹在石头里，所以整片看着是一面裂开的墙，不是画上去的线"""
        p = self.p
        for y0 in (0, 16):
            ci = 0 if y0 == 0 else 1
            seams = COURSES[ci][1]
            pts = seams + [seams[0] + PHASES * T]
            for k in range(len(seams)):
                a, b = pts[k], pts[k + 1]
                h = hash2(ci, k, 31)
                kind = h % 4                                # 0、1 = 裂开，2 = 缺角，3 = 完好
                if kind <= 1:
                    # 一道折线：从石头上沿某处往下折两下到下沿
                    sx = a + 6 + (h >> 4) % max(1, (b - a - 12))
                    path = [(sx, y0), (sx + (2 if kind else -2), y0 + 4), (sx + (-1 if kind else 1), y0 + 8), (sx + (3 if kind else -3), y0 + 14)]
                    for (x0_, yA), (x1_, yB) in zip(path, path[1:]):
                        steps = max(abs(x1_ - x0_), abs(yB - yA))
                        for i in range(steps + 1):
                            gx = round(x0_ + (x1_ - x0_) * i / steps)
                            yy = round(yA + (yB - yA) * i / steps)
                            lx = gx - phase * T
                            for off in (0, PHASES * T, -PHASES * T):
                                if 0 <= lx + off < T:
                                    c.px(lx + off, yy, p['crack'])
                                    if i % 2 == 0 and 0 <= lx + off + 1 < T and yy > y0:
                                        c.px(lx + off + 1, yy, p['crack_hi'])
                elif kind == 2:
                    # 缺角：石头右上角崩掉一块（露出砌缝颜色，下面一圈暗边）
                    cx0 = b - 6
                    for dy in range(4):
                        for dx in range(4 - dy):
                            gx = cx0 + 1 + dx + dy
                            lx = gx - phase * T
                            for off in (0, PHASES * T, -PHASES * T):
                                if 0 <= lx + off < T:
                                    c.px(lx + off, y0 + dy, p['mortar'])
                    for i in range(5):
                        lx = cx0 + i - phase * T
                        for off in (0, PHASES * T, -PHASES * T):
                            if 0 <= lx + off < T and y0 + 4 - i >= y0:
                                c.px(lx + off, y0 + max(0, 4 - i), p['lo'])

    def edges(self, c, out, concave, phase):
        frame_edges(c, out, concave, self.p)


ROCK = Masonry('rock', dict(
    outline=hexc('#141317'), mortar=hexc('#26252b'),
    stone=[hexc('#4c4a53'), hexc('#4f4d56'), hexc('#48464f')], hi=hexc('#5c5a64'), lo=hexc('#403e47'),
    cap=[hexc('#141317'), hexc('#b9b7bd'), hexc('#8d8b93'), hexc('#6c6a73'), hexc('#26252b')], rim=None,
    under=[hexc('#2c2b31')], side_hi=hexc('#5e5c66'), side_lo=hexc('#34323a'),
))
CRACKED = Masonry('cracked', dict(
    outline=hexc('#17150f'), mortar=hexc('#2e2b27'),
    stone=[hexc('#6f6a62'), hexc('#736e66'), hexc('#6a655e')], hi=hexc('#847f76'), lo=hexc('#5d5952'),
    cap=[hexc('#17150f'), hexc('#cfc8ba'), hexc('#a7a094'), hexc('#888277'), hexc('#2e2b27')], rim=None,
    under=[hexc('#433f39')], side_hi=hexc('#8a857b'), side_lo=hexc('#4c4842'),
    crack=hexc('#141210'), crack_hi=hexc('#9d978b'),
), cracks=True)


# ---------------- 脆岩：吊着的石灰色大板，四个外角有安装孔（螺栓）；松脱掉下来时螺栓没了 ----------------
class Panel(Material):
    def __init__(self, name, pal, bolts=True):
        self.name, self.p, self.bolts = name, pal, bolts

    def interior(self, phase):
        p = self.p
        c = Cell()
        c.rect(0, 0, T - 1, T - 1, p['face'])
        # 每两格一道竖接缝（相位 0、2 的左边）：大板是一块块拼起来的
        if phase % 2 == 0:
            c.vline(0, 0, T - 1, p['seam'])
            c.vline(1, 0, T - 1, p['hi'])
        # 中间一道横向的浅槽（板厚）：每格都有，连成一条线
        c.hline(0, T - 1, 15, p['groove'])
        c.hline(0, T - 1, 16, p['hi'])
        return c

    def edges(self, c, out, concave, phase):
        p = self.p
        frame_edges(c, out, concave, p)
        if not self.bolts:
            return
        # 螺栓只钉在整块的外角上
        for (cx, cy, a, b) in ((5, 5, 'N', 'W'), (T - 7, 5, 'N', 'E'), (5, T - 8, 'S', 'W'), (T - 7, T - 8, 'S', 'E')):
            if a in out and b in out:
                c.rect(cx, cy, cx + 2, cy + 2, p['bolt'])
                c.px(cx, cy, p['bolt_hi'])
                c.px(cx + 2, cy + 2, p['bolt_lo'])


BRITTLE_PAL = dict(
    outline=hexc('#1b1d18'), face=hexc('#8b8e7d'), hi=hexc('#a1a492'), lo=hexc('#6f7263'),
    seam=hexc('#4f5246'), groove=hexc('#767969'),
    cap=[hexc('#1b1d18'), hexc('#c6c9b5'), hexc('#a9ac99')], rim=None,
    under=[hexc('#5a5d50'), hexc('#6c6f61')], side_hi=hexc('#a6a996'), side_lo=hexc('#626557'),
    bolt=hexc('#2c2e28'), bolt_hi=hexc('#c9ccb6'), bolt_lo=hexc('#151612'),
)
BRITTLE = Panel('brittle', BRITTLE_PAL)
BRITTLE_LOOSE = Panel('brittle_loose', BRITTLE_PAL, bolts=False)


# ---------------- 沙土：暖沙色，松散的沙粒，上沿一圈起伏 ----------------
class Sand(Material):
    name = 'sand'
    p = dict(
        outline=hexc('#3a2e20'), face=hexc('#c4a77a'), hi=hexc('#d8bf94'), lo=hexc('#a88b60'),
        grain=hexc('#8d724d'), grain_hi=hexc('#e6d3ac'),
        cap=[hexc('#3a2e20'), hexc('#ead9b3'), hexc('#d6c095')], rim=None,
        under=[hexc('#8e7552'), hexc('#a3875e')], side_hi=hexc('#d3ba8e'), side_lo=hexc('#9a7f57'),
    )

    def interior(self, phase):
        p = self.p
        c = Cell()
        c.rect(0, 0, T - 1, T - 1, p['face'])
        # 大一点的明暗斑（几个像素一团，按全局坐标，4 格一循环）：松散、不规则，和砌石、纸的横线分得开
        for y in range(T):
            for x in range(T):
                gx = phase * T + x
                v = (hash2(gx // 3, y // 3, 5) % 9)
                if v == 0:
                    c.px(x, y, p['lo'])
                elif v == 1 and (x + y) % 2 == 0:
                    c.px(x, y, p['hi'])
        # 小石子：深色 2x1，上面一个亮点
        for y in range(1, T):
            for x in range(T - 1):
                if hash2(phase * T + x, y, 11) % 97 == 0:
                    c.px(x, y, p['grain']); c.px(x + 1, y, p['grain'])
                    c.px(x, y - 1, p['grain_hi'])
        return c

    def edges(self, c, out, concave, phase):
        p = self.p
        frame_edges(c, out, concave, p)
        if 'N' in out:   # 顶上一圈小起伏（沙堆的边，不是刀切的）
            for x in range(1, T - 1):
                if hash2(phase * T + x, 5) % 7 == 0:
                    c.px(x, 0, CLEAR)
                    c.px(x, 1, p['outline'])
                    c.px(x, 2, p['cap'][1])


SAND = Sand()


# ---------------- 纸：米白一沓纸，侧面一层层纸边，外右上角折一个角 ----------------
class Paper(Material):
    name = 'paper'
    p = dict(
        outline=hexc('#5f5747'), face=hexc('#e7e0c9'), hi=hexc('#f4efdf'), lo=hexc('#cdc4a8'), line=hexc('#d9d1b7'),
        cap=[hexc('#5f5747'), hexc('#fbf8ee'), hexc('#efe9d6')], rim=None,
        under=[hexc('#b5ab8e'), hexc('#cfc6aa')], side_hi=hexc('#f6f2e4'), side_lo=hexc('#c2b99d'),
        fold=hexc('#c9bf9f'), fold_lo=hexc('#a69c7e'),
    )

    def interior(self, phase):
        p = self.p
        c = Cell()
        c.rect(0, 0, T - 1, T - 1, p['face'])
        for y in (9, 19, 29):                              # 一张张叠起来的纸边
            c.hline(0, T - 1, y, p['line'])
        # 偶尔一道写过的笔迹（淡），4 格里只出现一次
        if phase == 1:
            for x in range(6, 22):
                if hash2(x, 9) % 4:
                    c.px(x, 14 + (x // 3) % 2, p['lo'])
        return c

    def edges(self, c, out, concave, phase):
        p = self.p
        frame_edges(c, out, concave, p)
        if 'N' in out and 'E' in out:                     # 右上角折起来
            for i in range(7):
                for j in range(7 - i):
                    c.px(T - 1 - j, i, CLEAR)
                c.px(T - 7 + i, i, p['outline'])
            for i in range(1, 7):
                for j in range(1, i + 1):
                    c.px(T - 8 + j, i, p['fold'] if j < i else p['fold_lo'])
            c.vline(T - 8, 1, 7, p['outline'])
            c.hline(T - 8, T - 1, 7, p['outline'])


PAPER = Paper()


# ---------------- 字块：淡紫色（校改色）的实心字，拼在一起就是一个个粗笔画的字 ----------------
class Letter(Material):
    name = 'letter'
    p = dict(
        outline=hexc('#2a2435'), face=hexc('#b6a6d1'), hi=hexc('#cdc1e3'), lo=hexc('#9585b3'),
        cap=[hexc('#2a2435'), hexc('#e4dcf1'), hexc('#cdc1e3')], rim=None,
        under=[hexc('#7a6b98'), hexc('#8a7ba8')], side_hi=hexc('#d3c8e6'), side_lo=hexc('#8475a3'),
    )

    def interior(self, phase):
        c = Cell()
        c.rect(0, 0, T - 1, T - 1, self.p['face'])
        return c

    def edges(self, c, out, concave, phase):
        frame_edges(c, out, concave, self.p)


LETTER = Letter()


# ---------------- 门（白底，游戏里按钥匙组染色）：竖着的木板门，两道铁箍，最上面一格有锁孔 ----------------
class Door(Material):
    name = 'door'
    p = dict(
        outline=hexc('#3c3c3c'), face=hexc('#e9e9e9'), hi=hexc('#ffffff'), lo=hexc('#c4c4c4'), seam=hexc('#8f8f8f'),
        band=hexc('#9c9c9c'), band_hi=hexc('#d0d0d0'), rivet=hexc('#5a5a5a'), hole=hexc('#1c1c1c'),
        cap=[hexc('#3c3c3c'), hexc('#ffffff')], rim=None,
        under=[hexc('#a8a8a8')], side_hi=hexc('#ffffff'), side_lo=hexc('#b4b4b4'),
    )

    def interior(self, phase):
        p = self.p
        c = Cell()
        c.rect(0, 0, T - 1, T - 1, p['face'])
        for x0 in (0, 16):                                 # 两条竖木板
            c.vline(x0, 0, T - 1, p['seam'])
            c.vline(x0 + 1, 0, T - 1, p['hi'])
            c.vline(x0 + 14, 0, T - 1, p['lo'])
        for y in (6, 24):                                  # 铁箍
            c.hline(0, T - 1, y, p['band_hi'])
            c.rect(0, y + 1, T - 1, y + 2, p['band'])
            for x in (4, 12, 20, 28):
                c.px(x, y + 1, p['rivet'])
        return c

    def edges(self, c, out, concave, phase):
        p = self.p
        frame_edges(c, out, concave, p)
        if 'N' in out and 'W' in out:                      # 锁孔：只在整扇门的左上角那一格（整个在左上四分之一里，拼的时候不会切掉一半）
            c.rect(6, 9, 11, 15, p['band'])                # 锁片
            c.hline(6, 11, 9, p['band_hi'])
            c.rect(8, 10, 9, 12, p['hole'])                # 锁孔：圆头 + 竖缝
            c.px(7, 11, p['hole']); c.px(10, 11, p['hole'])
            c.rect(8, 13, 9, 14, p['hole'])


DOOR = Door()

WALLS = [ROCK, CRACKED, BRITTLE, BRITTLE_LOOSE, SAND, PAPER, LETTER, DOOR]


# ---------------- 不拼墙的单格图 ----------------
def spikes(kind):
    """尖刺：危险红的三角，左面亮、右面暗，底下一条石墨底座。kind = up / left / right / both"""
    red_hi, red, red_lo, ink = hexc('#e9767d'), hexc('#c94b52'), hexc('#97323b'), hexc('#2b0f13')
    base, base_hi, base_lo, outline = hexc('#3a3940'), hexc('#6c6a72'), hexc('#26252b'), hexc('#141317')
    c = Cell()

    def spike_up(c, x0, w, tip_y, base_y):
        """一根朝上的刺：底边 x0..x0+w-1 在 base_y，尖在 tip_y"""
        h = base_y - tip_y
        mid = x0 + (w - 1) / 2
        for y in range(tip_y, base_y + 1):
            half = (y - tip_y) / h * (w / 2)
            for x in range(x0, x0 + w):
                d = x - mid
                if abs(d) <= half + 0.01:
                    edge = abs(d) > half - 1.0
                    c.px(x, y, ink if edge else (red_hi if d < -0.5 else (red if d < 1 else red_lo)))
        c.px(int(round(mid)), tip_y, red_hi)

    if kind == 'up':
        for i in range(3):
            spike_up(c, 1 + i * 10, 10, 15, 28)
        c.rect(0, 28, T - 1, 31, base)
        c.hline(0, T - 1, 28, base_hi)
        c.hline(0, T - 1, 31, outline)
        c.hline(0, T - 1, 30, base_lo)
        return c
    if kind in ('left', 'right'):
        # 先画朝上的再转：挂左墙 = 刺朝右；刺伸出 14 像素（hazard 0..12）
        u = Cell()
        for i in range(3):
            spike_up(u, 1 + i * 10, 10, 18, 28)
        u.rect(0, 28, T - 1, 31, base)
        u.hline(0, T - 1, 28, base_hi)
        u.hline(0, T - 1, 31, outline)
        img = u.img().crop((0, 14, T, T))                  # 18 行高：刺 + 底座
        canvas = Image.new('RGBA', (T, T), CLEAR)
        rot = img.rotate(-90 if kind == 'left' else 90, expand=True)   # 底座贴墙
        canvas.paste(rot, (0 if kind == 'left' else T - rot.width, 0))
        c.a = np.array(canvas)
        return c
    # both：两边各挂一排小刺（缩小一半）
    small = Cell()
    for i in range(4):
        spike_up(small, i * 8, 8, 24, 30)
    small.rect(0, 30, T - 1, 31, base)
    small.hline(0, T - 1, 30, base_hi)
    strip = small.img().crop((0, 23, T, T))                # 9 行
    canvas = Image.new('RGBA', (T, T), CLEAR)
    left = strip.rotate(-90, expand=True)
    right = strip.rotate(90, expand=True)
    canvas.paste(left, (0, 0), left)
    canvas.paste(right, (T - right.width, 0), right)
    c.a = np.array(canvas)
    return c


def plank(mask):
    """薄木板（木作陶土色）：上面 9 行是板子，左右没有邻居的那头有一个节块（关节）和木钉。mask：右=2 左=8"""
    face, hi, lo, outline, joint, joint_hi, peg = (hexc('#b97c64'), hexc('#d59b81'), hexc('#8d5a47'), hexc('#2b1c17'),
                                                  hexc('#6e4536'), hexc('#9a6550'), hexc('#2b1c17'))
    c = Cell()
    left, right = bool(mask & 8), bool(mask & 2)
    c.rect(0, 0, T - 1, 8, face)
    c.hline(0, T - 1, 0, outline)
    c.hline(0, T - 1, 1, hi)
    c.hline(0, T - 1, 7, lo)
    c.hline(0, T - 1, 8, outline)
    if not left:
        c.vline(0, 0, 8, outline)
        c.px(0, 0, CLEAR); c.px(0, 8, CLEAR)
        c.rect(1, 2, 5, 6, joint); c.hline(1, 5, 2, joint_hi)
        c.px(3, 4, peg)
        c.rect(2, 9, 4, 12, joint); c.hline(2, 4, 12, outline); c.vline(1, 9, 12, outline); c.vline(5, 9, 12, outline)   # 短支脚
    if not right:
        c.vline(T - 1, 0, 8, outline)
        c.px(T - 1, 0, CLEAR); c.px(T - 1, 8, CLEAR)
        c.rect(T - 6, 2, T - 2, 6, joint); c.hline(T - 6, T - 2, 2, joint_hi)
        c.px(T - 4, 4, peg)
        c.rect(T - 5, 9, T - 3, 12, joint); c.hline(T - 5, T - 3, 12, outline); c.vline(T - 6, 9, 12, outline); c.vline(T - 2, 9, 12, outline)
    if left and right or (left != right):
        c.px(16, 4, lo); c.px(17, 4, lo)                   # 中间两颗钉子
    return c


def charge():
    """王之炸药：深色木框箱子，中间一颗危险红的炸药，顶上一截点火色的引信"""
    ink, frame, frame_hi, panel, panel_lo = hexc('#1d1412'), hexc('#6e4536'), hexc('#9a6550'), hexc('#b77a63'), hexc('#94604c')
    red, red_hi, red_lo, fire, fire_hi = hexc('#c94b52'), hexc('#ec8a8f'), hexc('#8c2b33'), hexc('#ef8754'), hexc('#ffd2a6')
    c = Cell()
    c.rect(0, 0, T - 1, T - 1, ink)
    c.rect(1, 1, T - 2, T - 2, frame)
    c.hline(1, T - 2, 1, frame_hi); c.vline(1, 1, T - 2, frame_hi)
    c.rect(4, 4, T - 5, T - 5, panel)
    c.hline(4, T - 5, T - 5, panel_lo); c.vline(T - 5, 4, T - 5, panel_lo)
    for i in range(4, T - 4):                              # 斜撑
        c.px(i, i, panel_lo); c.px(i, T - 1 - i, panel_lo)
    for (x, y) in ((2, 2), (T - 3, 2), (2, T - 3), (T - 3, T - 3)):
        c.px(x, y, ink)
    cx, cy, r = 15.5, 17.5, 6.5                            # 炸药
    for y in range(T):
        for x in range(T):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d <= r:
                c.px(x, y, red_lo if d > r - 1.2 else (red_hi if (x - cx) + (y - cy) < -5 else red))
            elif d <= r + 1:
                c.px(x, y, ink)
    c.rect(14, 8, 17, 10, ink); c.rect(15, 9, 16, 10, frame_hi)   # 引信口
    c.px(16, 6, fire); c.px(17, 5, fire_hi); c.px(15, 7, fire); c.px(18, 6, fire)
    return c


def fuse_frame(mask):
    """编辑器里的引线（白，按颜色染色）：粗绳子，有一节节的纹；端点（只有一个邻居或没有）是一个圆头"""
    rope, rope_lo, ink = hexc('#f4f4f4'), hexc('#bdbdbd'), hexc('#2a2a2a')
    c = Cell()
    up, right, down, left = mask & 1, mask & 2, mask & 4, mask & 8
    lo_, hi_ = 13, 18                                      # 绳子占 13..18（6 像素粗）

    def seg(x0, y0, x1, y1):
        c.rect(x0, y0, x1, y1, ink)
    if up: seg(lo_, 0, hi_, 18)
    if down: seg(lo_, 13, hi_, T - 1)
    if left: seg(0, lo_, 18, hi_)
    if right: seg(13, lo_, T - 1, hi_)
    # 里面填白，留 1 像素描边
    for y in range(T):
        for x in range(T):
            if c.get(x, y) == ink:
                inner = all(0 <= x + dx < T and 0 <= y + dy < T and c.get(x + dx, y + dy) != CLEAR
                            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
                edge_cut = (x in (0, T - 1) and lo_ < y < hi_) or (y in (0, T - 1) and lo_ < x < hi_)
                if inner or edge_cut:
                    c.px(x, y, rope)
    for y in range(T):                                     # 一节节的纹
        for x in range(T):
            if c.get(x, y) == rope and (x + y) % 5 == 0:
                c.px(x, y, rope_lo)
    n = bin(mask).count('1')
    if n <= 1:                                             # 端点：圆头
        for y in range(9, 23):
            for x in range(9, 23):
                d = ((x - 15.5) ** 2 + (y - 15.5) ** 2) ** 0.5
                if d <= 6.5:
                    c.px(x, y, rope if d < 5.5 else ink)
        c.rect(14, 14, 17, 17, ink)
        c.rect(15, 15, 16, 16, rope_lo)
    return c


def fusenode():
    """游戏里的引线头（12x12）：石墨色的小插座，中间一截暗暗的引信头。引线是藏着的谜题，端点要看得到、但不抢眼"""
    c = Cell(12, 12)
    for y in range(12):
        for x in range(12):
            d = ((x - 5.5) ** 2 + (y - 5.5) ** 2) ** 0.5
            if d <= 5.6:
                c.px(x, y, hexc('#141317') if d > 4.7 else (hexc('#46444c') if d > 3.2 else hexc('#7a3a26')))
    c.rect(5, 5, 6, 6, hexc('#b8603a'))
    c.px(5, 5, hexc('#d98a5c'))
    return c


def dirt():
    """（旧的泥土帧，没有砖用它了；留个和沙土一样的单块，帧号不挪）"""
    return SAND.single()


def letter_single():
    return LETTER.single()


def door_single():
    return DOOR.single()


# ---------------- 特效 ----------------
DEBRIS_MATS = ['rock', 'cracked', 'brittle', 'sand', 'paper', 'letter', 'plank', 'spikes']


def debris_sheet():
    """被炸碎飞出去的碎块：每种材料 4 块（12x12 一格），从那种材料的单块上切下来，再修成圆一点的块"""
    src = {
        'rock': ROCK.single(), 'cracked': CRACKED.single(), 'brittle': BRITTLE.single(), 'sand': SAND.single(),
        'paper': PAPER.single(), 'letter': LETTER.single(), 'plank': plank(0), 'spikes': spikes('up'),
    }
    shapes = [  # 每块的轮廓（12x12 里哪些像素留着）：大块、长条、小块、三角
        lambda x, y: 2 <= x <= 9 and 2 <= y <= 9 and not ((x, y) in ((2, 2), (9, 2), (2, 9), (9, 9))),
        lambda x, y: 1 <= x <= 10 and 4 <= y <= 8 and not ((x, y) in ((1, 4), (10, 8))),
        lambda x, y: 3 <= x <= 8 and 3 <= y <= 8 and not ((x, y) in ((3, 3), (8, 8))),
        lambda x, y: 2 <= y <= 9 and 2 <= x <= 2 + (y - 2) * 1.1,
    ]
    offs = [(4, 6), (16, 18), (10, 3), (18, 8)]           # 从单块上哪里切
    sheet = Image.new('RGBA', (12 * 4, 12 * len(DEBRIS_MATS)), CLEAR)
    for mi, m in enumerate(DEBRIS_MATS):
        s = src[m]
        for k, (shape, (ox, oy)) in enumerate(zip(shapes, offs)):
            if m == 'plank':
                oy = 0
            if m == 'spikes':
                ox, oy = 2 + k * 6, 16
            piece = Cell(12, 12)
            for y in range(12):
                for x in range(12):
                    if shape(x, y):
                        col = s.get(min(T - 1, ox + x), min(T - 1, oy + y))
                        if col[3] == 0:
                            continue
                        piece.px(x, y, col)
            # 描一圈暗边
            outline = hexc('#141317')
            pa = piece.a.copy()
            for y in range(12):
                for x in range(12):
                    if pa[y, x, 3] and any(not (0 <= x + dx < 12 and 0 <= y + dy < 12) or pa[y + dy, x + dx, 3] == 0
                                           for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                        piece.px(x, y, outline)
            sheet.paste(piece.img(), (k * 12, mi * 12))
    return sheet


def crack_sheet():
    """岩石被引线烧裂（R → r）：6 帧 32x32 叠在那一格上——白闪、裂纹从中间往外裂开、崩出两块小碎屑、淡掉"""
    ink, hi, flash = hexc('#141210'), hexc('#d8d2c4'), (255, 244, 220, 255)
    path = [(16, 15), (13, 17), (11, 16), (8, 19), (5, 18), (2, 21), (0, 22)]
    path2 = [(16, 15), (19, 13), (21, 14), (24, 11), (27, 12), (30, 9), (31, 9)]
    branch = [(13, 17), (13, 20), (12, 23), (13, 26)]
    sheet = Image.new('RGBA', (T * 6, T), CLEAR)

    def line(c, pts, n, col):
        for (x0, y0), (x1, y1) in list(zip(pts, pts[1:]))[:n]:
            steps = max(abs(x1 - x0), abs(y1 - y0), 1)
            for i in range(steps + 1):
                c.px(round(x0 + (x1 - x0) * i / steps), round(y0 + (y1 - y0) * i / steps), col)
    for f in range(6):
        c = Cell()
        if f == 0:
            for y in range(T):
                for x in range(T):
                    if (x + y) % 2 == 0:
                        c.px(x, y, (flash[0], flash[1], flash[2], 120))
        n = [1, 2, 4, 6, 6, 6][f]
        line(c, path, n, ink); line(c, path2, n, ink)
        if f >= 2:
            line(c, branch, f - 1, ink)
        for (x, y) in ((16, 14), (15, 16)):
            c.px(x, y, hi)
        if f in (3, 4):                                    # 崩出来的碎屑
            for (x, y) in ((14 - f, 9 - f), (20 + f, 8 - f), (9, 25 - f)):
                c.rect(x, y, x + 1, y + 1, hi)
                c.px(x + 1, y + 1, ink)
        if f == 5:
            c.a[:, :, 3] = (c.a[:, :, 3] * 0.45).astype(np.uint8)
        sheet.paste(c.img(), (f * T, 0))
    return sheet


def ghost():
    """炸没之后那一格一闪的虚线空位（白，游戏里淡出）"""
    c = Cell()
    col = (255, 255, 255, 230)
    for i in range(2, T - 2):
        if (i // 3) % 2 == 0:
            for (x, y) in ((i, 2), (i, T - 3), (2, i), (T - 3, i)):
                c.px(x, y, col)
    return c


def dust_sheet():
    """落地扬尘：5 帧 16x16，一小团灰从地面鼓起来散开"""
    sheet = Image.new('RGBA', (16 * 5, 16), CLEAR)
    cols = [hexc('#d9d3c3'), hexc('#b9b3a4'), hexc('#8f8a7e')]
    for f in range(5):
        c = Cell(16, 16)
        r = 3 + f * 1.4
        cy = 13 - f * 0.8
        for y in range(16):
            for x in range(16):
                for (ox, oy, rr) in ((-3, 0, r * 0.8), (3, 0, r * 0.8), (0, -2, r)):
                    d = ((x - 7.5 - ox) ** 2 + (y - cy - oy) ** 2) ** 0.5
                    if d <= rr and y <= 14:
                        k = 0 if d < rr * 0.5 else (1 if d < rr * 0.8 else 2)
                        if f >= 3 and (x + y + f) % (6 - f + 2) == 0:
                            continue
                        if c.get(x, y)[3] == 0 or k < 2:
                            c.px(x, y, cols[k])
        if f >= 3:
            c.a[:, :, 3] = (c.a[:, :, 3] * (0.75 if f == 3 else 0.45)).astype(np.uint8)
        sheet.paste(c.img(), (f * 16, 0))
    return sheet


# ---------------- tiles.png（单格图集，帧号见 asset/index.ts 的 TILE_FRAMES） ----------------
def tiles_atlas():
    frames = [None] * 46
    frames[0] = dirt()
    frames[1] = ROCK.single()
    frames[2] = BRITTLE.single()
    frames[3] = SAND.single()
    frames[4] = spikes('up')
    for m in range(16):
        frames[5 + m] = fuse_frame(m)
    frames[21] = PAPER.single()
    frames[22] = LETTER.single()
    frames[23] = DOOR.single()
    frames[24] = plank(0)
    frames[25] = CRACKED.single()
    frames[26] = spikes('left')
    frames[27] = spikes('right')
    frames[28] = spikes('both')
    frames[29] = charge()
    for m in range(16):                                    # 30..45：木板按左右邻居拼（只看 右=2 左=8）
        frames[30 + m] = plank(m)
    sheet = Image.new('RGBA', (T * len(frames), T), CLEAR)
    for i, f in enumerate(frames):
        sheet.paste(f.img(), (i * T, 0))
    return sheet


# ---------------- 样例房间预览（和游戏里一样按四个角拼） ----------------
N_, NE_, E_, SE_, S_, SW_, W_, NW_ = 1, 2, 4, 8, 16, 32, 64, 128
DIRS = [(0, -1, N_), (1, -1, NE_), (1, 0, E_), (1, 1, SE_), (0, 1, S_), (-1, 1, SW_), (-1, 0, W_), (-1, -1, NW_)]


def quarters(m):
    has = lambda b: (m & b) != 0

    def pick(v, h, d, corner, hEdge, vEdge, inner):
        if not has(v) and not has(h): return corner
        if not has(v): return hEdge
        if not has(h): return vEdge
        return 'C' if has(d) else inner
    return [pick(N_, W_, NW_, 'TL', 'T', 'L', 'iTL'), pick(N_, E_, NE_, 'TR', 'T', 'R', 'iTR'),
            pick(S_, W_, SW_, 'BL', 'B', 'L', 'iBL'), pick(S_, E_, SE_, 'BR', 'B', 'R', 'iBR')]


def compose(template, mask, phase):
    out = Image.new('RGBA', (T, T), CLEAR)
    h = T // 2
    for q, cell in enumerate(quarters(mask)):
        (cx, cy), _, _ = CELLS[cell]
        qx, qy = (q % 2) * h, (q // 2) * h
        sx = (phase * 5 + cx) * T + qx
        out.paste(template.crop((sx, cy * T + qy, sx + h, cy * T + qy + h)), (qx, qy))
    return out


SAMPLE = [
    "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
    "R............................R",
    "R............................R",
    "R...........ZZZ.......=.=.=..R",
    "R...BBBB....ZZZ.......=.=.=..R",
    "R...BBBB..............===.=..R",
    "R.....................=.=.=..R",
    "R..........____.......=.=.=..R",
    "R............................R",
    "RRRRR..rrrr........SSSS....RRR",
    "RRRRR..rrrr...R....SSSSS...RRR",
    "RRRRRRRRRRRRRRRXXXXRRRRRRRRRRR",
    "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
]
KEYS = {'R': 'rock', 'r': 'cracked', 'B': 'brittle', 'S': 'sand', 'Z': 'paper', '=': 'letter', '%': 'door'}


def preview(templates, atlas, bg=(46, 52, 48, 255)):
    g = [list(r) for r in SAMPLE]
    H, W = len(g), len(g[0])
    img = Image.new('RGBA', (W * T, H * T), bg)
    for y in range(H):
        for x in range(W):
            ch = g[y][x]
            if ch in KEYS:
                m = 0
                for dx, dy, b in DIRS:
                    nx, ny = x + dx, y + dy
                    if nx < 0 or ny < 0 or nx >= W or ny >= H or g[ny][nx] == ch:
                        m |= b
                tile = compose(templates[KEYS[ch]], m, x % PHASES)
                img.alpha_composite(tile, (x * T, y * T))
            elif ch == 'X':
                img.alpha_composite(atlas.crop((4 * T, 0, 5 * T, T)), (x * T, y * T))
            elif ch == '_':
                m = (2 if x + 1 < W and g[y][x + 1] == '_' else 0) | (8 if x > 0 and g[y][x - 1] == '_' else 0)
                img.alpha_composite(atlas.crop(((30 + m) * T, 0, (31 + m) * T, T)), (x * T, y * T))
    return img


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'frames_tiles'
    os.makedirs(out, exist_ok=True)
    templates = {}
    for m in WALLS:
        t = m.template()
        templates[m.name] = t
        t.save(f'{out}/wall_{m.name}.png')
    atlas = tiles_atlas()
    atlas.save(f'{out}/tiles.png')
    fusenode().img().save(f'{out}/fusenode.png')
    debris_sheet().save(f'{out}/tile_debris.png')
    crack_sheet().save(f'{out}/tile_crack.png')
    ghost().img().save(f'{out}/tile_ghost.png')
    dust_sheet().save(f'{out}/tile_dust.png')
    pv = preview(templates, atlas)
    pv.save(f'{out}/preview.png')
    print('ok', out)
