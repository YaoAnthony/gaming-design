"""物件的图（B1 木作关节剧场：外面一圈炭黑描边、顶上亮边、每种材料一个主色一个阴影，颜色取自设定集色板）。
和砖块（tiles.py）用同一套画法，放在新砖块旁边不跳。

  crate1.png 32x32   小木箱：木作陶土色木框 + X 斜撑，四角木钉
  crate2.png 64x64   大木箱：深一号的木框，四角石墨色铁角，中间一道横板 + X 斜撑（要戴帽子才推得动，一眼分得开）
  key.png 16x16      钥匙（白，按钥匙组染色）：方形钥匙头带孔（设定集里的样子）、两颗齿
  candle.png 12x18   蜡烛：米白蜡身、石墨色烛台、点火色火苗
  hat.png 32x32      高脚帽：石墨色帽筒、危险红帽带
  plate1(_down).png 32x32 / plate2(_down).png 64x32   压板：旧石灰底座 + 架着的灰绿薄面板（素纸白亮边、右上角折角）+ 陶土色木撑（压下去贴平、冒火花）
  door.png 24x32     出口门：奖励金色的拱门框、里面黑
  castle.png 128x112 终点城堡：和岩石一样的砌石墙、陶土色尖顶、窗里透金光、正中底部是门、顶上一面危险红的旗
  tape.png 22x22     胶带：奖励金色的一卷，陶土色纸芯，右边垂下一截胶带头（捡到心的上限 +1；游戏里另外加金光）

用法（在本文件夹里跑）：python items.py <输出目录>（还会出一张 preview.png）
  然后 crate1/crate2/key/candle/hat/plate*/castle 复制到 ../../game-master/src/asset/image/items/，door.png 复制到 .../image/tiles/
  Aseprite 源文件在 ../items/*.aseprite（door 在 ../tiles/door.aseprite）：ASE -b <png> --save-as <aseprite> 存，手改后反过来导出
"""
import os
import sys
from PIL import Image

from tiles import Cell, hexc, CLEAR

INK = hexc('#19191b')


def outline(c, col=INK):
    """给不透明的像素外面描一圈（只描在透明处）"""
    a = c.a.copy()
    h, w = a.shape[:2]
    for y in range(h):
        for x in range(w):
            if a[y, x, 3]:
                continue
            if any(0 <= x + dx < w and 0 <= y + dy < h and a[y + dy, x + dx, 3] and tuple(a[y + dy, x + dx]) != col
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                c.px(x, y, col)


def line(c, x0, y0, x1, y1, col, w=1):
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(steps + 1):
        x = round(x0 + (x1 - x0) * i / steps)
        y = round(y0 + (y1 - y0) * i / steps)
        c.rect(x - (w - 1) // 2, y - (w - 1) // 2, x + w // 2, y + w // 2, col)


# ---------------- 木箱 ----------------
def crate(size):
    big = size > 32
    frame, frame_hi, frame_lo = (hexc('#6e4636'), hexc('#8f5f4a'), hexc('#553427')) if big else (hexc('#8a5a46'), hexc('#a8735b'), hexc('#6e4636'))
    panel, panel_hi, panel_lo = (hexc('#a8775c'), hexc('#bd8c70'), hexc('#8b5f48')) if big else (hexc('#c08c6c'), hexc('#d6a382'), hexc('#a2725a'))
    metal, metal_hi, metal_lo = hexc('#4c4a53'), hexc('#8d8b93'), hexc('#2c2b31')
    e = 6 if big else 4                                    # 框宽
    c = Cell(size, size)
    c.rect(0, 0, size - 1, size - 1, frame)
    c.rect(e, e, size - 1 - e, size - 1 - e, panel)
    # 板缝
    step = size // 4 if not big else size // 6
    for y in range(e + step, size - e, step):
        c.hline(e, size - 1 - e, y, panel_lo)
        c.hline(e, size - 1 - e, y + 1, panel_hi)
    # 框的立体：上、左亮，下、右暗；内侧一圈暗
    c.hline(0, size - 1, 1, frame_hi); c.vline(1, 1, size - 2, frame_hi)
    c.hline(0, size - 1, size - 2, frame_lo); c.vline(size - 2, 1, size - 2, frame_lo)
    c.hline(e, size - 1 - e, e, frame_lo); c.vline(e, e, size - 1 - e, frame_lo)
    # X 斜撑（3 / 5 像素粗，上面一条亮边）
    bw = 5 if big else 3
    line(c, e + 1, e + 1, size - 2 - e, size - 2 - e, frame, bw)
    line(c, size - 2 - e, e + 1, e + 1, size - 2 - e, frame, bw)
    line(c, e + 1, e - 1 + bw // 2, size - 2 - e - bw // 2, size - 2 - e, frame_hi, 1)
    if big:                                                # 中间一道横板
        m = size // 2
        c.rect(e, m - 3, size - 1 - e, m + 2, frame)
        c.hline(e, size - 1 - e, m - 3, frame_hi); c.hline(e, size - 1 - e, m + 2, frame_lo)
        for (x0, y0, sx, sy) in ((0, 0, 1, 1), (size - 1, 0, -1, 1), (0, size - 1, 1, -1), (size - 1, size - 1, -1, -1)):
            for i in range(12):                            # 铁角（L 形）
                for j in range(4):
                    c.px(x0 + sx * i, y0 + sy * j, metal)
                    c.px(x0 + sx * j, y0 + sy * i, metal)
            c.px(x0 + sx * 2, y0 + sy * 2, metal_hi)
            c.px(x0 + sx * 9, y0 + sy * 1, metal_hi); c.px(x0 + sx * 1, y0 + sy * 9, metal_hi)
            c.px(x0 + sx * 3, y0 + sy * 3, metal_lo)
    else:
        for (x, y) in ((1, 1), (size - 3, 1), (1, size - 3), (size - 3, size - 3)):   # 木钉
            c.rect(x, y, x + 1, y + 1, metal)
            c.px(x, y, metal_hi)
    # 外圈描边，四角圆一点
    c.hline(0, size - 1, 0, INK); c.hline(0, size - 1, size - 1, INK)
    c.vline(0, 0, size - 1, INK); c.vline(size - 1, 0, size - 1, INK)
    for (x, y) in ((0, 0), (size - 1, 0), (0, size - 1), (size - 1, size - 1)):
        c.px(x, y, CLEAR)
    return c


# ---------------- 钥匙（白底，按组染色） ----------------
def key():
    W, L, S, O = hexc('#ffffff'), hexc('#e4e4e4'), hexc('#a9a9a9'), hexc('#2a2a2a')
    c = Cell(16, 16)
    c.rect(1, 4, 7, 10, W)                                  # 方形钥匙头
    c.rect(3, 6, 5, 8, CLEAR)                               # 孔
    c.rect(7, 6, 14, 8, W)                                  # 杆
    c.rect(11, 9, 12, 11, W)                                # 齿
    c.rect(13, 9, 14, 10, W)
    c.hline(1, 7, 10, S); c.vline(7, 4, 5, S); c.hline(8, 14, 8, S); c.px(12, 11, S); c.px(14, 10, S)
    c.hline(1, 6, 4, L) if False else None
    c.px(2, 5, L); c.px(8, 6, L)
    outline(c, O)
    for (x, y) in ((3, 6), (4, 6), (5, 6), (3, 7), (5, 7), (3, 8), (4, 8), (5, 8)):   # 孔里描边
        c.px(x, y, O)
    c.px(4, 7, CLEAR)
    return c


# ---------------- 蜡烛 ----------------
def candle():
    wax, wax_hi, wax_lo = hexc('#e9e2cc'), hexc('#f7f3e6'), hexc('#c9c0a5')
    base, base_hi = hexc('#3a3940'), hexc('#6c6a72')
    fire, fire_hi, core = hexc('#ef8754'), hexc('#ffc58e'), hexc('#fff3dc')
    c = Cell(12, 18)
    c.rect(3, 8, 8, 15, wax)
    c.vline(3, 8, 15, wax_hi); c.vline(8, 8, 15, wax_lo)
    c.px(7, 9, wax_lo); c.px(7, 10, wax_lo)                 # 一道蜡泪
    c.rect(1, 15, 10, 17, base); c.hline(1, 10, 15, base_hi)
    c.rect(5, 6, 6, 7, INK)                                 # 烛芯
    for (x, y, col) in ((5, 0, fire), (6, 1, fire), (4, 2, fire), (5, 2, fire_hi), (6, 2, fire), (7, 2, fire),
                        (4, 3, fire), (5, 3, core), (6, 3, fire_hi), (7, 3, fire), (4, 4, fire), (5, 4, fire_hi), (6, 4, core), (7, 4, fire),
                        (5, 5, fire), (6, 5, fire)):
        c.px(x, y, col)
    outline(c)
    for (x, y) in ((0, 15), (11, 15)):
        c.px(x, y, CLEAR)
    return c


# ---------------- 高脚帽 ----------------
def hat():
    body, body_hi, body_lo = hexc('#333239'), hexc('#4c4a53'), hexc('#26252b')
    band, band_hi = hexc('#c94b52'), hexc('#e07078')
    c = Cell(32, 32)
    c.rect(8, 3, 23, 26, body)
    c.vline(10, 4, 18, body_hi); c.vline(11, 4, 18, body_hi)
    c.vline(22, 4, 26, body_lo)
    c.hline(8, 23, 3, body_hi)
    c.rect(8, 19, 23, 22, band); c.hline(8, 23, 19, band_hi)
    c.rect(2, 26, 29, 29, body_lo); c.hline(2, 29, 26, body)   # 帽檐
    outline(c)
    for (x, y) in ((1, 26), (30, 26), (1, 30), (30, 30), (7, 2), (24, 2)):
        c.px(x, y, CLEAR)
    return c


# ---------------- 压板 ----------------
def plate(w, down):
    """压板（设定集 03_mechanics 右上那排）：旧石灰色的底座，上面架一块刷了灰绿漆的薄面板（顶边素纸白亮边、
    右上角折下来一个小角——和主角头片同一个折角记号），底下两根陶土色小木撑；压下去面板贴平、木撑没了、上面冒火花"""
    base, base_hi, base_lo = hexc('#7d8072'), hexc('#a3a596'), hexc('#5f6258')
    panel, panel_lo, cream = hexc('#596d66'), hexc('#44534d'), hexc('#ddd5bc')
    brace, brace_lo = hexc('#b77a63'), hexc('#8d5a47')
    fire, fire_hi = hexc('#ef8754'), hexc('#ffd2a6')
    c = Cell(w, 32)
    c.rect(1, 27, w - 2, 30, base); c.hline(1, w - 2, 27, base_hi); c.hline(1, w - 2, 30, base_lo)
    x0, x1 = 3, w - 4
    top, bottom = (24, 26) if down else (19, 24)
    c.rect(x0, top, x1, bottom, panel)
    c.hline(x0 + 1, x1 - 1, top, cream)                      # 顶边亮边（可站的边）
    c.hline(x0, x1, bottom, panel_lo)
    c.vline(x1, top + 1, bottom, panel_lo)
    for x, y in ((x0, top), (x0, bottom), (x1, bottom)):     # 圆一下角
        c.px(x, y, CLEAR)
    # 右上角折下来的小角：角缺一块，露出素纸白的背面
    for x, y in ((x1, top), (x1 - 1, top), (x1, top + 1)):
        c.px(x, y, CLEAR)
    c.px(x1 - 1, top + 1, cream); c.px(x1 - 2, top + 1, cream); c.px(x1 - 1, top + 2, cream)
    c.px(x1 - 2, top + 2, panel_lo)
    if not down:
        for x in range(7, w - 8, 16 if w > 32 else w):        # 木撑
            c.rect(x, bottom + 1, x + 1, 26, brace); c.px(x + 1, 26, brace_lo)
        c.rect(w - 9, bottom + 1, w - 8, 26, brace); c.px(w - 8, 26, brace_lo)
    else:
        cx = w // 2                                            # 点着了：面板上方一簇火花
        c.rect(cx - 1, 20, cx, 22, fire); c.px(cx - 1, 21, fire_hi)
        for x, y in ((cx - 3, 19), (cx + 2, 18), (cx, 16), (cx - 2, 17), (cx + 3, 21)):
            c.px(x, y, fire)
        c.px(cx, 17, fire_hi)
    outline(c)
    return c


# ---------------- 出口门 ----------------
def door():
    gold, gold_hi, gold_lo = hexc('#d8c06a'), hexc('#f0dc8f'), hexc('#a8913e')
    hole, hole_lo = hexc('#19191b'), hexc('#2e2a20')
    c = Cell(24, 32)
    for y in range(32):
        for x in range(24):
            dx, dy = x - 11.5, y - 11.5
            outer = y >= 11.5 or (dx * dx + dy * dy) <= 11.6 ** 2
            inner = (y >= 11.5 and 4 <= x <= 19) or (y < 11.5 and dx * dx + dy * dy <= 7.6 ** 2)
            if inner and y >= 4:
                c.px(x, y, hole_lo if y >= 28 else hole)
            elif outer:
                c.px(x, y, gold_hi if (x < 6 and y > 6) or (y < 4) else (gold_lo if x > 18 else gold))
    c.hline(4, 19, 31, gold_lo)
    outline(c, hexc('#2b2410'))
    return c


# ---------------- 终点城堡 ----------------
def castle():
    W, H = 128, 112
    c = Cell(W, H)
    stone, stone_hi, stone_lo, mortar = hexc('#55535c'), hexc('#6b6973'), hexc('#45434c'), hexc('#2a2930')
    cap, cap_hi = hexc('#8d8b93'), hexc('#b9b7bd')
    roof, roof_hi, roof_lo = hexc('#b77a63'), hexc('#d39a80'), hexc('#8a5a48')
    glow, glow_hi = hexc('#d8c06a'), hexc('#f3e3a0')
    dark = hexc('#19191b')
    red, red_hi = hexc('#c94b52'), hexc('#e07078')
    wood = hexc('#8a5a46')

    def wall(x0, y0, x1, y1):
        """一块砌石墙（每层 8 像素，石块 16 像素长、错开半块），顶上一道亮边"""
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                ly = (y - y0) % 8
                off = 8 if ((y - y0) // 8) % 2 else 0
                lx = (x - x0 + off) % 16
                if ly == 7 or lx == 0:
                    col = mortar
                elif ly == 0:
                    col = stone_hi
                elif ly == 6 or lx == 15:
                    col = stone_lo
                else:
                    col = stone
                c.px(x, y, col)
        c.hline(x0, x1, y0, cap_hi); c.hline(x0, x1, y0 + 1, cap)

    def crenel(x0, x1, y):
        for x in range(x0, x1 + 1, 8):
            c.rect(x, y - 5, min(x + 4, x1), y - 1, stone)
            c.hline(x, min(x + 4, x1), y - 5, cap_hi)
            c.vline(min(x + 4, x1), y - 4, y - 1, stone_lo)

    def window(x, y, lit=True):
        c.rect(x, y, x + 5, y + 9, dark)
        c.rect(x + 1, y + 1, x + 4, y + 8, glow if lit else dark)
        if lit:
            c.rect(x + 1, y + 1, x + 2, y + 4, glow_hi)
        c.hline(x - 1, x + 6, y + 10, cap)

    # 后面撑着的两根木架（舞台布景：前台是城堡，背后是木头撑着）
    line(c, 10, 111, 26, 60, wood, 3); line(c, 117, 111, 101, 60, wood, 3)
    # 两侧塔楼
    for tx in (0, 102):
        wall(tx, 30, tx + 25, 111)
        crenel(tx, tx + 25, 30)
        for y in range(4, 25):                              # 陶土色尖顶
            half = (y - 4) * 14 / 21
            for x in range(tx, tx + 26):
                d = x - (tx + 12.5)
                if abs(d) <= half + 0.3:
                    c.px(x, y, roof_hi if d < -half + 2 else (roof_lo if d > 1 else roof))
        c.hline(tx - 1, tx + 26, 25, roof_lo)
        window(tx + 10, 46); window(tx + 10, 74, lit=False)
    # 主体
    wall(22, 52, 105, 111)
    crenel(22, 105, 52)
    window(34, 64); window(88, 64)
    # 正中底部的门（和出口门一样的金色拱门）
    d = door()
    img = c.img()
    img.alpha_composite(d.img().resize((28, 38), Image.NEAREST), (50, 74))
    c.a[:] = __import__('numpy').array(img)
    # 旗杆和旗
    c.vline(63, 16, 46, hexc('#3a3940')); c.vline(64, 16, 46, hexc('#6c6a72'))
    for i in range(12):
        for j in range(-(6 - abs(i - 0)) if False else 0, 7 - i // 2):
            c.px(65 + i, 18 + j, red_hi if j == 0 else red)
    c.px(63, 15, glow); c.px(64, 15, glow)
    outline(c)
    return c


# ---------------- 胶带（捡到心的上限 +1；金光在游戏里另外画：光晕、火星、暖光） ----------------
def tape():
    """一卷奖励金色的胶带，正面对着镜头、稍微俯视：下面露出一截卷的侧面，中间是陶土色的纸芯和黑洞，右边垂下来一截胶带头"""
    gold, gold_hi, gold_lo, gold_dk = hexc('#d8c06a'), hexc('#f3e3a0'), hexc('#b9a050'), hexc('#8f7a34')
    core, core_lo, hole = hexc('#b77a63'), hexc('#8a5a48'), hexc('#19191b')
    ink = hexc('#3a3010')
    c = Cell(22, 22)

    def ell(cx, cy, rx, ry, col, x0=0, x1=21):
        for y in range(22):
            for x in range(x0, x1 + 1):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    c.px(x, y, col)
    ell(10.5, 12.5, 9.2, 7.6, gold_dk)                      # 卷的侧面（下面露出来的那截）
    ell(10.5, 12.0, 9.2, 7.6, gold_lo)
    ell(10.5, 9.5, 9.2, 7.6, gold)                          # 正面
    for y in range(22):                                     # 正面左上一道高光、一圈圈的胶带层
        for x in range(22):
            if c.get(x, y) != gold:
                continue
            dx, dy = (x - 10.5) / 9.2, (y - 9.5) / 7.6
            r = (dx * dx + dy * dy) ** 0.5
            if r > 0.72 and dx < -0.15 and dy < 0.1:
                c.px(x, y, gold_hi)
            elif abs(r - 0.68) < 0.06:
                c.px(x, y, gold_lo)
    ell(10.5, 9.5, 4.2, 3.6, core)                          # 纸芯
    ell(10.5, 9.8, 2.6, 2.1, hole)                          # 中间的洞
    c.px(8, 7, hexc('#d39a80')); c.px(9, 7, hexc('#d39a80'))
    # 垂下来的胶带头：从右下沿出来，往下垂，末端锯齿
    for y in range(13, 21):
        for x in (16, 17, 18):
            c.px(x + (1 if y > 17 else 0), y, gold if x < 18 else gold_lo)
    c.px(16, 21, gold); c.px(18, 21, gold)
    outline(c, ink)
    c.px(17, 21, CLEAR)
    return c


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'frames_items'
    os.makedirs(out, exist_ok=True)
    crate(32).img().save(f'{out}/crate1.png')
    crate(64).img().save(f'{out}/crate2.png')
    key().img().save(f'{out}/key.png')
    candle().img().save(f'{out}/candle.png')
    hat().img().save(f'{out}/hat.png')
    plate(32, False).img().save(f'{out}/plate1.png')
    plate(32, True).img().save(f'{out}/plate1_down.png')
    plate(64, False).img().save(f'{out}/plate2.png')
    plate(64, True).img().save(f'{out}/plate2_down.png')
    door().img().save(f'{out}/door.png')
    castle().img().save(f'{out}/castle.png')
    tape().img().save(f'{out}/tape.png')
    # 预览
    names = ['crate1', 'crate2', 'key', 'candle', 'hat', 'plate1', 'plate1_down', 'plate2', 'plate2_down', 'door', 'castle', 'tape']
    ims = [Image.open(f'{out}/{n}.png') for n in names]
    pv = Image.new('RGBA', (sum(i.width * 2 + 10 for i in ims), max(i.height * 2 for i in ims)), (46, 52, 48, 255))
    x = 0
    for i in ims:
        pv.alpha_composite(i.resize((i.width * 2, i.height * 2), Image.NEAREST), (x, 0))
        x += i.width * 2 + 10
    pv.save(f'{out}/preview.png')
    print('ok', out)
