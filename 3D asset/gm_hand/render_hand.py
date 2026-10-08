"""把 GM_Hand 的三个姿势各渲一张 4 倍大的原图（第 1/2/3 帧），之后交给 pixelize.py 缩成像素图。

每个姿势渲两遍：
  1. Cycles + 覆盖材质 GMH_ao_pass → ao_<姿势>.png（环境光遮蔽，同一个正交相机）
  2. EEVEE + 卡通材质（按屏幕坐标读第 1 步的图压暗凹槽）→ raw_<姿势>.png

在 Blender 里跑（场景要先用 build_hand.py 建好）：
    blender -b gm_hand.blend -P render_hand.py -- <输出目录>
"""
import os
import sys

import bpy

POSES = {1: "point", 2: "pinch", 3: "open", 4: "fist", 5: "grip"}
EMPTY_HANDED = {2: "pinch_empty"}     # 再渲一张不带被捏物体的（绿方块只是占位符）
AO_IMAGE, AO_PROP, HELD_COLL = "GMH_AO", "gmh_ao", "GM_Hand_Held"


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def render_all(out_dir, poses=POSES, empty=EMPTY_HANDED):
    os.makedirs(out_dir, exist_ok=True)
    sc = bpy.context.scene
    vl = bpy.context.view_layer
    keep = sc.frame_current, sc.render.engine
    ao_mat = bpy.data.materials["GMH_ao_pass"]
    img = bpy.data.images[AO_IMAGE]
    held = bpy.data.collections[HELD_COLL]
    jobs = [(f, n, False) for f, n in poses.items()] + [(f, n, True) for f, n in (empty or {}).items()]
    try:
        for frame, name, hide_held in jobs:
            held.hide_render = hide_held
            sc.frame_set(frame)
            # 1) Cycles 环境光遮蔽
            sc.render.engine = "CYCLES"
            vl.material_override = ao_mat
            ao_path = os.path.join(out_dir, f"ao_{name}.png")
            render_to(ao_path)
            vl.material_override = None
            img.source = "FILE"
            img.filepath = ao_path
            img.colorspace_settings.name = "sRGB"
            img.reload()
            # 2) EEVEE 卡通着色
            sc.render.engine = "BLENDER_EEVEE"
            sc[AO_PROP] = 1.0
            sc.update_tag()
            render_to(os.path.join(out_dir, f"raw_{name}.png"))
    finally:
        held.hide_render = False
        sc[AO_PROP] = 0.0
        vl.material_override = None
        sc.frame_set(keep[0])
        sc.render.engine = keep[1]


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    render_all(argv[0] if argv else os.path.join(os.path.dirname(bpy.data.filepath), "renders"))
