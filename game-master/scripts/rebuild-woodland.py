"""Rebuild room art from the current f2 layout; 50px neighbor references, shared RGBA seams.
Image generation remains external (built-in imagegen); this script crops reference bands,
exports numbered depth planes and checks their joins. Run prepare/import/build/check.
"""
from pathlib import Path
import argparse, json, shutil, os, time
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
ROOT=Path(__file__).resolve().parents[2]
ART=ROOT/'设计稿/art/B1_wood_stage/output/backgrounds/floor1-woodland-v3'
OLD=ART.parent/'floor1-woodland-v2'
DEST=ROOT/'game-master/src/asset/image/background'
W,H,S=1536,1024,50
OW,OH=1920,1280
PLAN=json.loads((ART/'plan.json').read_text())
def source(k):
 p=ART/f'woodland-{k.lower()}-v3.png'
 return Image.open(p if p.exists() else OLD/f'woodland-{k.lower()}-v2.png').convert('RGB')
def prepare(k):
 n=PLAN[k];l=S if 'left'in n else 0;r=S if 'right'in n else 0;t=S if 'top'in n else 0;b=S if 'bottom'in n else 0
 canvas=Image.new('RGBA',(W+l+r,H+t+b))
 if k=='O':canvas.paste(source(k).convert('RGBA'),(l,t))
 for side,key in n.items():
  box,pos={'left':((W-S,0,W,H),(0,t)),'right':((0,0,S,H),(l+W,t)),'top':((0,H-S,W,H),(l,0)),'bottom':((0,0,W,S),(l,t+H))}[side]
  canvas.paste(source(key).crop(box),pos)
 canvas.save(ART/f'work/{k}-seed.png')
 (ART/f'work/{k}-seed.json').write_text(json.dumps({'canvas':canvas.size,'crop':[l,t,l+W,t+H],'neighbors':n}))
def ingest():
 for item in json.loads((ART/'generation.json').read_text(encoding='utf-8-sig')):
  k=item['key'];raw=ART/f'work/{k}-raw.png'
  if Path(item['path']).exists():shutil.copyfile(item['path'],raw)
  if not raw.exists():raise FileNotFoundError(f'Missing archived generation for {k}')
  meta=json.loads((ART/f'work/{k}-seed.json').read_text());im=Image.open(raw).convert('RGB')
  print(k,'native',im.size)
  im=im.resize(tuple(meta['canvas']),Image.Resampling.LANCZOS).crop(meta['crop']);a=np.asarray(im,dtype=np.float32)
  # Extend actual neighbor pixels inward over a narrow transition. The AI provides
  # the scene and matching silhouettes; deterministic contact pixels remove drift.
  num=a.copy();den=np.ones((H,W,1),dtype=np.float32)
  for side,key in meta['neighbors'].items():
   b=np.asarray(source(key),dtype=np.float32);d=np.arange(W if side in ['left','right'] else H)
   if side in ['right','bottom']:d=d[::-1]
   u=np.clip(d/96,0,1);f=1-u*u*(3-2*u);weight=f/np.maximum(1-f,1e-6);off=np.minimum(d,95)
   if side=='left':field=b[:,W-1-off];weight=weight[None,:,None]
   elif side=='right':field=b[:,off];weight=weight[None,:,None]
   elif side=='top':field=b[H-1-off,:];weight=weight[:,None,None]
   else:field=b[off,:];weight=weight[:,None,None]
   num+=field*weight;den+=weight
  Image.fromarray(np.uint8(np.clip(np.rint(num/den),0,255))).save(ART/f'woodland-{k.lower()}-v3.png')
NAMES=['1.far.png','2.clouds.png','3.middle.png','4.near.png']
THEMES={'L':'高处树冠','T':'林间木栈','R':'旧瞭望架','S':'风轮哨林','Q':'城外林缘','O':'水潭石阶','P':'城堡门庭'}
def model():
 return next(f['model'] for f in json.loads((ROOT/'game-master/src/map/world.json').read_text(encoding='utf-8'))['floors'] if f['id']=='f2')
def edges(layout):
 for y,row in enumerate(layout):
  for x,k in enumerate(row):
   if not k:continue
   if x+1<len(row) and row[x+1]:yield k,row[x+1],'h'
   if y+1<len(layout) and x<len(layout[y+1]) and layout[y+1][x]:yield k,layout[y+1][x],'v'
def join_layers(images,layout):
 # Premultiplied RGBA prevents transparent-layer seams from darkening the artwork.
 arrays={k:np.asarray(im.convert('RGBa')).copy() for k,im in images.items()}
 h,w=next(iter(arrays.values())).shape[:2];band=48
 for a,b,axis in edges(layout):
  aa,bb=arrays[a],arrays[b]
  edgea=aa[:,-1].copy() if axis=='h' else aa[-1].copy()
  edgeb=bb[:,0].copy() if axis=='h' else bb[0].copy()
  target=np.uint8(np.rint((edgea.astype(float)+edgeb)/2))
  for d in range(band):
   u=d/(band-1);f=1-u*u*(3-2*u)
   if axis=='h':
    aa[:,-1-d]=np.uint8(np.rint(aa[:,-1-d]*(1-f)+target*f));bb[:,d]=np.uint8(np.rint(bb[:,d]*(1-f)+target*f))
   else:
    aa[-1-d]=np.uint8(np.rint(aa[-1-d]*(1-f)+target*f));bb[d]=np.uint8(np.rint(bb[d]*(1-f)+target*f))
 # Four-way contacts share one vertex, independent of processing order.
 vertices={}
 for y,row in enumerate(layout):
  for x,k in enumerate(row):
   if not k:continue
   for dx,dy,ix,iy in [(0,0,0,0),(1,0,w-1,0),(0,1,0,h-1),(1,1,w-1,h-1)]:vertices.setdefault((x+dx,y+dy),[]).append((k,ix,iy))
 for group in vertices.values():
  avg=np.uint8(np.rint(np.mean([arrays[k][iy,ix] for k,ix,iy in group],axis=0)))
  for k,ix,iy in group:arrays[k][iy,ix]=avg
 atlas=Image.new('RGBA',(len(layout[0])*(w-1)+1,len(layout)*(h-1)+1))
 for y,row in enumerate(layout):
  for x,k in enumerate(row):
   if k:atlas.paste(Image.fromarray(arrays[k],'RGBa').convert('RGBA'),(x*(w-1),y*(h-1)))
 return {k:atlas.crop((x*(w-1),y*(h-1),x*(w-1)+w,y*(h-1)+h)) for y,row in enumerate(layout) for x,k in enumerate(row) if k}
def build():
 import importlib.util
 spec=importlib.util.spec_from_file_location('depth',ROOT/'game-master/scripts/split-backgrounds.py');depth=importlib.util.module_from_spec(spec);spec.loader.exec_module(depth)
 cloudspec=importlib.util.spec_from_file_location('cloudrefs',ROOT/'game-master/scripts/split-clouds.py');cloudrefs=importlib.util.module_from_spec(cloudspec);cloudspec.loader.exec_module(cloudrefs)
 boxes={**cloudrefs.BOXES,'L':[(0,30,W,580),(730,580,W,960)],'T':[(350,80,1200,930)],'R':[(300,40,W,990)],'S':[(0,180,W,940)],'Q':[(0,60,W,465)]}
 m=model();layout=m['layout'];keys=[k for row in layout for k in row if k]
 # Source images stay separate per room. Only the preview is a reduced atlas.
 output={}; report=[]
 for k in keys:
  original=source(k); original.save(ART/f'woodland-{k.lower()}-v3.png')
  rgb=np.asarray(original.filter(ImageFilter.MedianFilter(3)),dtype=np.int16);r,g,b=[rgb[:,:,i] for i in range(3)]
  row=np.arange(H,dtype=np.float32)[:,None];lower=depth.smooth((row-H*.65)/(H*.30))
  green=(g-r>=2)&(g-b>=-3);timber=(r-g>=6)&(g-b>=5)&(r<140)
  dark=(b-g<=4)&(g-r>=-1)&(g<31)&(r<30)
  rock=(np.abs(r-g)<7)&(g-b>=-2)&(g>29) if k in 'GEIOP' else np.zeros((H,W),bool)
  mask=depth.solid_matte(green|timber|rock|(dark&(lower>.05)),original.size)
  near=depth.solid_matte(np.maximum(dark*lower,(green|rock)*lower*.8),original.size)
  mask=Image.fromarray(np.maximum(np.asarray(mask),np.asarray(near)))
  region=np.zeros((H,W),bool)
  for x0,y0,x1,y1 in boxes.get(k,[]):region[y0:y1,x0:x1]=True
  clouds=(r>=32)&(r-g>=0)&(r-g<8)&(b-g>=5)&(g<85)&region&(np.asarray(mask)<32)
  # Preserve the established moon crossing in A; a cloud intersecting it stays static.
  if k=='A':clouds[0:260,650:930]=False
  cloudmask=Image.fromarray(clouds.astype('uint8')*255).filter(ImageFilter.MaxFilter(3))
  hidden=Image.fromarray(np.maximum(np.asarray(mask),np.asarray(cloudmask))).filter(ImageFilter.MaxFilter(7))
  known=Image.fromarray(255-np.asarray(hidden));fill=depth.fill_occluded(original,known)
  far=Image.composite(original,fill,known).filter(ImageFilter.GaussianBlur(2.4)).convert('RGBA')
  layers=[far,depth.filtered_cutout(original,cloudmask,2.4),depth.filtered_cutout(original,mask,.65),depth.filtered_cutout(original,near,0)]
  output[k]=[im.resize((OW,OH),Image.Resampling.LANCZOS) for im in layers]
  report.append({'room':k,'exportSize':[OW,OH],'sourceSize':list(original.size),'cloudPixels':int(clouds.sum())})
  print('split',k,flush=True)
 for i,name in enumerate(NAMES):
  joined=join_layers({k:ls[i] for k,ls in output.items()},layout)
  for k,im in joined.items():
   folder=DEST/f'woodland-{k.lower()}';folder.mkdir(exist_ok=True)
   target=folder/name;temporary=folder/(name+'.tmp')
   im.save(temporary,format='PNG',optimize=True)
   for attempt in range(5):
    try:os.replace(temporary,target);break
    except OSError:
     if attempt==4:raise
     time.sleep(.2)
   output[k][i]=im
 for k in keys:
  folder=DEST/f'woodland-{k.lower()}';metadata=folder/'background.json'
  info=json.loads(metadata.read_text(encoding='utf-8')) if metadata.exists() else {}
  info.update(id=f'woodland-{k.lower()}-v1',pixelated=True,ambient='woodland')
  if k in THEMES:info['name']=f'木作森林 · {k} {THEMES[k]}'
  metadata.write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  merged=output[k][0].copy()
  for im in output[k][1:]:merged=Image.alpha_composite(merged,im)
  merged.convert('RGB').save(ART/f'work/{k}-composite.jpg',quality=94)
 preview=Image.new('RGB',(len(layout[0])*320,len(layout)*232),(16,17,20));draw=ImageDraw.Draw(preview)
 for y,row in enumerate(layout):
  for x,k in enumerate(row):
   if not k:continue
   im=Image.open(ART/f'work/{k}-composite.jpg').resize((320,212));preview.paste(im,(x*320,y*232+20));draw.text((x*320+5,y*232+4),k,fill='white')
 preview.save(ART/'overview.jpg',quality=95)
 (ART/'layers.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
 check()
def check():
 layout=model()['layout'];checks=[]
 for name in NAMES:
  ims={k:np.asarray(Image.open(DEST/f'woodland-{k.lower()}'/name)) for row in layout for k in row if k}
  for a,b,axis in edges(layout):
   x=ims[a][:,-1] if axis=='h' else ims[a][-1];y=ims[b][:,0] if axis=='h' else ims[b][0]
   error=int(np.max(np.abs(x.astype(int)-y.astype(int))));checks.append({'a':a,'b':b,'axis':axis,'layer':name,'maxError':error})
 (ART/'seam-report.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
 assert all(c['maxError']==0 for c in checks),[c for c in checks if c['maxError']]
 print('PASS',len(checks),'RGBA edge checks',flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('command',choices=['prepare','import','build','check']);p.add_argument('room',nargs='?');a=p.parse_args()
 if a.command=='prepare':prepare(a.room)
 elif a.command=='import':ingest()
 elif a.command=='build':build()
 else:check()
