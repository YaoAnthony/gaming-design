"""上排参考图（设计稿 01_cast.png 最下面一排左边三只手），下排像素图，放大到同一像素尺度并排。
  python compare.py <像素图目录> <设计稿 01_cast.png> <输出.png> [--zoom 4]
"""
import argparse
import os

from PIL import Image

POSES = ["point", "pinch", "open"]
REF_BOX = {"point": (15, 650, 405, 880), "pinch": (410, 640, 750, 880), "open": (780, 660, 1150, 880)}
REF_PX = 2.6          # 设计稿里一个「像素」大约 2.6 个图片像素
BG = (237, 229, 209, 255)

ap = argparse.ArgumentParser()
ap.add_argument("dir")
ap.add_argument("ref")
ap.add_argument("out")
ap.add_argument("--zoom", type=int, default=4)
ap.add_argument("--extra", nargs="*", default=[], help="下排再加几张没有参考图的（例如 pinch_empty）")
a = ap.parse_args()
Z = a.zoom
ref = Image.open(a.ref).convert("RGBA")
tops, bots = [], []
for n in POSES:
    r = ref.crop(REF_BOX[n])
    tops.append(r.resize((round(r.width / REF_PX * Z), round(r.height / REF_PX * Z)), Image.LANCZOS))
    im = Image.open(os.path.join(a.dir, f"{n}.png")).convert("RGBA")
    b = Image.new("RGBA", im.size, BG)
    b.alpha_composite(im)
    bots.append(b.resize((im.width * Z, im.height * Z), Image.NEAREST))
for n in a.extra:
    im = Image.open(os.path.join(a.dir, f"{n}.png")).convert("RGBA")
    b = Image.new("RGBA", im.size, BG)
    b.alpha_composite(im)
    tops.append(Image.new("RGBA", (1, 1), BG))
    bots.append(b.resize((im.width * Z, im.height * Z), Image.NEAREST))
cw = [max(t.width, b.width) + 16 for t, b in zip(tops, bots)]
th, bh = max(t.height for t in tops), max(b.height for b in bots)
out = Image.new("RGBA", (sum(cw), th + bh + 24), BG)
x = 0
for t, b, w in zip(tops, bots, cw):
    out.paste(t, (x + (w - t.width) // 2, (th - t.height) // 2))
    out.paste(b, (x + (w - b.width) // 2, th + 24 + (bh - b.height) // 2))
    x += w
for y in range(th + 10, th + 13):
    for xx in range(out.width):
        out.putpixel((xx, y), (120, 110, 95, 255))
out.convert("RGB").save(a.out)
print("saved", a.out, out.size)
