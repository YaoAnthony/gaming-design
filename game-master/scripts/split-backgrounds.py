"""Extract three static depth planes from the existing woodland artwork.
No generative calls. Shared boundary pixels occupy one atlas coordinate before
masking/filtering, so every exported plane has identical adjoining RGBA edges.
Hidden far-plane areas get a low-frequency color fill, not invented scenery;
these assets are for depth of field with parallax disabled.
"""
from pathlib import Path
import argparse
import subprocess
import sys
import json
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "设计稿/art/B1_wood_stage/output/backgrounds/floor1-woodland-v2"
DEST = ROOT / "game-master/src/asset/image/background"
REPORT = ROOT / "game-master/output/background-depth"
W, H = 1536, 1024
LAYOUT = [["H","J","K","M","N"],["F","D","A","B","C"],["G","E","I","O",None]]
POSITIONS = {key:(x*(W-1),y*(H-1)) for y,row in enumerate(LAYOUT) for x,key in enumerate(row) if key}


def smooth(a):
    a = np.clip(a, 0, 1)
    return a*a*(3-2*a)


def box_blur_float(a, radius):
    # Float arithmetic matters: quantizing a tiny masked weight to 8-bit before
    # normalization creates black contour bands in the reconstructed backplate.
    out = a
    for axis in (0,1):
        padding=[(0,0)]*out.ndim
        padding[axis]=(radius,radius)
        padded=np.pad(out,padding,mode="edge")
        zero_shape=list(padded.shape); zero_shape[axis]=1
        sums=np.concatenate([np.zeros(zero_shape,dtype=np.float64),np.cumsum(padded,axis=axis,dtype=np.float64)],axis=axis)
        hi=[slice(None)]*out.ndim; lo=hi.copy()
        hi[axis]=slice(2*radius+1,None); lo[axis]=slice(None,-(2*radius+1))
        out=((sums[tuple(hi)]-sums[tuple(lo)])/(2*radius+1)).astype(np.float32)
    return out


def fill_occluded(image, mask):
    size=(image.width//4,image.height//4)
    rgb=np.asarray(image.resize(size,Image.Resampling.BOX),dtype=np.float32)
    known=np.asarray(mask.resize(size,Image.Resampling.BOX),dtype=np.float32)/255
    result=rgb.copy()
    for radius in (6,18,48,128,384):
        den=box_blur_float(known,radius)
        num=box_blur_float(result*known[:,:,None],radius)
        valid=(known < 0.5) & (den > 0.001)
        result[valid]=np.clip(num[valid]/den[valid,None],0,255)
        known[valid]=1
    result[known < 0.5]=[28,29,33]
    return Image.fromarray(np.uint8(np.clip(result,0,255))).resize(image.size,Image.Resampling.BILINEAR)


def solid_matte(bits, size):
    # Work below the grain scale to keep whole painted objects in one layer.
    small=Image.fromarray(np.uint8(np.clip(bits*255,0,255))).resize((size[0]//4,size[1]//4),Image.Resampling.BOX)
    small=small.filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    return small.resize(size,Image.Resampling.BILINEAR)


def filtered_cutout(source, alpha, radius):
    rgba = source.convert("RGBA")
    rgba.putalpha(alpha)
    # Premultiplied blur prevents dark borders around transparent foliage.
    if radius:
        rgba = rgba.convert("RGBa").filter(ImageFilter.GaussianBlur(radius)).convert("RGBA")
    return rgba


def composite(layers):
    result = layers[0].copy()
    for layer in layers[1:]:
        result = Image.alpha_composite(result, layer)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--far-blur", type=float, default=2.4, help="Native image pixels, 1.5 game pixels at 960x640")
    parser.add_argument("--middle-blur", type=float, default=0.65)
    args = parser.parse_args()
    REPORT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((SOURCE/"manifest.json").read_text(encoding="utf-8-sig"))
    atlas = Image.new("RGB", (5*(W-1)+1, 3*(H-1)+1), (25,25,27))
    for key, (x,y) in POSITIONS.items():
        original = Image.open(SOURCE/f"woodland-{key.lower()}-v2.png").convert("RGB")
        assert original.size == (W,H)
        atlas.paste(original,(x,y))
    # B1 artwork uses violet/charcoal for sky and distant ridges, green for
    # cutout trees, warm brown for timber. Material mattes follow those contours.
    rgb = np.asarray(atlas.filter(ImageFilter.MedianFilter(3)),dtype=np.int16)
    r,g,b = (rgb[:,:,i] for i in range(3))
    green = (g-r >= 2) & (g-b >= -3)
    timber = (r-g >= 6) & (g-b >= 5) & (r < 140)
    # Nearly black, green-tinted leaf silhouettes occupy the closest plane.
    dark_leaf = (b-g <= 4) & (g-r >= -1) & (g < 31) & (r < 30)
    rows = np.arange(atlas.height,dtype=np.float32)[:,None]
    lower = smooth((rows-(H-1)*2)/((H-1)*0.65))
    # Root/cave rooms contain neutral stone as well as vegetation.
    rock = (np.abs(r-g) < 7) & (g-b >= 1) & (g > 29) & (lower > 0.25)
    band = np.maximum.reduce([
        smooth((rows-H*0.72)/(H*0.15))*(1-smooth((rows-H*1.00)/(H*0.20))),
        smooth((rows-H*1.60)/(H*0.16))*(1-smooth((rows-H*2.00)/(H*0.20))),
        smooth((rows-H*2.55)/(H*0.24)),
    ])
    objects = green | timber | (dark_leaf & (band > 0.05)) | rock
    object_mask = solid_matte(objects,atlas.size)
    # Feather only the depth assignment between overlapping planes. Source
    # image colors stay intact; no rectangular foreground cut lines.
    near_seed = np.maximum.reduce([dark_leaf*band, green*band*0.75, (green | rock)*smooth((lower-0.65)/0.3)])
    near_alpha = solid_matte(near_seed,atlas.size)
    # Nearby coverage is also part of the midplane, forming an overlap rather
    # than a transparent crack when its antialiased edge is composited.
    object_mask=Image.fromarray(np.maximum(np.asarray(object_mask),np.asarray(near_alpha)))
    far_mask = Image.fromarray(255-np.asarray(object_mask.filter(ImageFilter.MaxFilter(7))))
    far_fill = fill_occluded(atlas,far_mask)
    far = Image.composite(atlas,far_fill,far_mask).filter(ImageFilter.GaussianBlur(args.far_blur)).convert("RGBA")
    mid = filtered_cutout(atlas,object_mask,args.middle_blur)
    close = filtered_cutout(atlas,near_alpha,0)
    objects=np.asarray(object_mask)>127
    near=np.asarray(near_alpha)>127
    middle=objects & ~near
    layers = [far,mid,close]
    names = ["1.far.png","2.middle.png","3.near.png"]
    room_reports = []
    for room in manifest["rooms"]:
        key=room["room"]
        x,y=POSITIONS[key]
        folder=DEST/f"woodland-{key.lower()}"
        folder.mkdir(parents=True,exist_ok=True)
        cropped=[layer.crop((x,y,x+W,y+H)) for layer in layers]
        for name,layer in zip(names,cropped): layer.save(folder/name,optimize=True)
        (folder/"background.json").write_text(json.dumps({"id":room["backgroundId"],"name":f"木作森林 · {key} {room['theme']}","pixelated":True,"ambient":"woodland"},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        coverage=[round(float((np.asarray(layer.getchannel("A"))>0).mean()),4) for layer in cropped]
        room_reports.append({"room":key,"folder":str(folder.relative_to(ROOT)),"size":[W,H],"layers":names,"coverage":coverage})
        if key in ("A","G","N"):
            composite(cropped).save(REPORT/f"{key}-composite.png")
            board=Image.new("RGB",(W, H+48),(35,37,42))
            for i,layer in enumerate(cropped):
                tile=Image.new("RGBA",layer.size,(78,78,83,255))
                tile.alpha_composite(layer)
                tile.thumbnail((W//3,H))
                board.paste(tile.convert("RGB"),(i*W//3,48))
            draw=ImageDraw.Draw(board)
            for i,label in enumerate(["1 FAR", "2 MIDDLE", "3 NEAR"]): draw.text((i*W//3+15,15),label,fill="white")
            board.crop((0,0,W,48+H//3)).save(REPORT/f"{key}-layers.png")
    # A compact composite overview for review; source artwork remains untouched.
    combined=composite(layers)
    combined.thumbnail((1920,768))
    combined.save(REPORT/"overview.png")
    depth=np.zeros((atlas.height,atlas.width,3),dtype=np.uint8)
    depth[~objects]=[68,92,141]; depth[middle]=[111,159,137]; depth[near]=[228,190,129]
    depth_image=Image.fromarray(depth); depth_image.thumbnail((1920,768)); depth_image.save(REPORT/"depth-regions.png")
    del depth,rgb,objects,middle,near
    checks=[]
    for row in LAYOUT:
        for left,right in zip(row,row[1:]):
            if left and right: checks.append((left,right,"horizontal"))
    for upper,lower_row in zip(LAYOUT,LAYOUT[1:]):
        for top,bottom in zip(upper,lower_row):
            if top and bottom: checks.append((top,bottom,"vertical"))
    seams=[]
    for a,b,axis in checks:
        errors=[]
        for name in names:
            ia=np.asarray(Image.open(DEST/f"woodland-{a.lower()}"/name),dtype=np.int16)
            ib=np.asarray(Image.open(DEST/f"woodland-{b.lower()}"/name),dtype=np.int16)
            edge_a,edge_b=(ia[:,-1],ib[:,0]) if axis=="horizontal" else (ia[-1],ib[0])
            errors.append(int(np.abs(edge_a-edge_b).max()))
        assert max(errors)==0, (a,b,errors)
        seams.append({"from":a,"to":b,"axis":axis,"layerMaxErrors":errors})
    report={"method":"Original-pixel palette/contour matting; shared atlas coordinates; offline premultiplied blur", "note":"Approximate depth planes for static depth of field. Hidden regions use color fill, not semantic reconstruction; parallax must remain zero.","farBlurNativePx":args.far_blur,"middleBlurNativePx":args.middle_blur,"nearBlurNativePx":0,"rooms":room_reports,"seams":seams,"passed":True}
    (REPORT/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"rooms":len(room_reports),"images":len(room_reports)*3,"seams":len(seams),"passed":True}))
    subprocess.run([sys.executable, str(Path(__file__).with_name("split-clouds.py")), "--fresh"], check=True)

if __name__ == "__main__": main()
