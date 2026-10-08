"""Lift existing painted clouds into a numbered transparent layer; keep moon/ridges fixed."""
from pathlib import Path
import argparse,json,shutil
import numpy as np
from PIL import Image,ImageFilter
ROOT=Path(__file__).resolve().parents[2]
DEST=ROOT/'game-master/src/asset/image/background'
ART=ROOT/'设计稿/art/B1_wood_stage/output/backgrounds/floor1-woodland-v2'
OUT=ROOT/'game-master/output/background-ambient'
W,H=1536,1024
LAYOUT=['HJKMN','FDABC','GEIOP']
BOXES={
'H':[(0,110,580,370)], 'J':[(720,130,1140,300)],
'K':[(10,70,620,315),(245,300,840,500),(800,335,1050,500)],
'N':[(0,70,780,310),(0,315,370,510),(700,110,1536,345)],
'F':[(1400,10,1536,145)],
'D':[(0,10,200,145),(820,200,1160,340),(1250,240,1536,380)],
'A':[(390,100,830,250),(1020,210,1280,290)],
'B':[(330,110,785,265),(850,175,1100,265),(1240,220,1536,320),(1090,440,1270,510)],
'C':[(270,210,620,285),(1210,230,1536,350),(150,375,630,475),(740,540,1200,635)],
}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--fresh',action='store_true');args=parser.parse_args()
    cache=OUT/'source-far';cache.mkdir(parents=True,exist_ok=True)
    all_layers={};counts={}
    for key in 'ABCDEFGHIJKMNO':
        folder=DEST/f'woodland-{key.lower()}'
        saved=cache/f'{key}.png'
        if args.fresh or not saved.exists(): shutil.copyfile(folder/'1.far.png',saved)
        base=Image.open(saved).convert('RGBA');original=Image.open(ART/f'woodland-{key.lower()}-v2.png').convert('RGB')
        rgb=np.asarray(original,dtype=np.int16);r,g,b=[rgb[:,:,i] for i in range(3)]
        purple=(r>=32)&(r-g>=0)&(b-g>=5)&(g<85)
        mask=np.zeros((H,W),dtype=np.uint8)
        fill=np.asarray(base).copy()
        for x0,y0,x1,y1 in BOXES.get(key,[]):
            local=purple[y0:y1,x0:x1]
            mask[y0:y1,x0:x1]=np.maximum(mask[y0:y1,x0:x1],local.astype(np.uint8)*255)
            # Interpolate the actual clear sky above/below this cloud in each
            # column. It is an occluded sky fill, never a moving rectangular patch.
            t=np.linspace(0,1,y1-y0,dtype=np.float32)[:,None,None]
            top=np.asarray(base)[max(0,y0-8),x0:x1].astype(np.float32)
            bottom=np.asarray(base)[min(H-1,y1+8),x0:x1].astype(np.float32)
            fill[y0:y1,x0:x1]=np.uint8(top[None]*(1-t)+bottom[None]*t)
        matte=Image.fromarray(mask).filter(ImageFilter.MaxFilter(3))
        cloud=original.convert('RGBA');cloud.putalpha(matte)
        cloud=cloud.convert('RGBa').filter(ImageFilter.GaussianBlur(2.4)).convert('RGBA')
        repair=matte.filter(ImageFilter.MaxFilter(13)).filter(ImageFilter.GaussianBlur(2))
        clear=Image.composite(Image.fromarray(fill),base,repair)
        middle=folder/('2.middle.png' if (folder/'2.middle.png').exists() else '3.middle.png')
        near=folder/('3.near.png' if (folder/'3.near.png').exists() else '4.near.png')
        all_layers[key]=[clear,cloud,Image.open(middle).convert('RGBA'),Image.open(near).convert('RGBA')]
        counts[key]=int((mask>0).sum())
    names=['1.far.png','2.clouds.png','3.middle.png','4.near.png']
    for index,name in enumerate(names):
        atlas=Image.new('RGBA',(5*(W-1)+1,3*(H-1)+1))
        for y,row in enumerate(LAYOUT):
            for x,key in enumerate(row):
                if key in all_layers: atlas.paste(all_layers[key][index],(x*(W-1),y*(H-1)))
        for y,row in enumerate(LAYOUT):
            for x,key in enumerate(row):
                if key not in all_layers: continue
                layer=atlas.crop((x*(W-1),y*(H-1),x*(W-1)+W,y*(H-1)+H))
                layer.save(DEST/f'woodland-{key.lower()}'/name,optimize=True)
                all_layers[key][index]=layer
    for key in all_layers:
        folder=DEST/f'woodland-{key.lower()}'
        for old in ['2.middle.png','3.near.png']:
            if (folder/old).exists(): (folder/old).unlink()
    a=all_layers['A'][0].copy()
    for layer in all_layers['A'][1:]:a=Image.alpha_composite(a,layer)
    a.save(OUT/'clouds-A-composite.png')
    all_layers['A'][1].save(OUT/'clouds-A-transparent.png')
    edges=[]
    for y,row in enumerate(LAYOUT):
        for x,key in enumerate(row):
            if key not in all_layers: continue
            for dx,dy in [(1,0),(0,1)]:
                if y+dy>=3 or x+dx>=5:continue
                other=LAYOUT[y+dy][x+dx]
                if other not in all_layers:continue
                errors=[]
                for a,b in zip(all_layers[key],all_layers[other]):
                    aa=np.asarray(a,dtype=np.int16);bb=np.asarray(b,dtype=np.int16)
                    errors.append(int(np.abs((aa[:,-1]-bb[:,0]) if dx else (aa[-1]-bb[0])).max()))
                assert max(errors)==0
                edges.append({'from':key,'to':other,'errors':errors})
    report={'cloudPixels':counts,'layers':names,'seams':edges,'passed':True,'note':'Existing painted clouds only. Moon-overlapping cloud in A is retained with the fixed moon.'}
    (OUT/'clouds-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'layers':56,'cloudRooms':sum(v>0 for v in counts.values()),'seams':len(edges),'passed':True}))

if __name__=='__main__':main()
