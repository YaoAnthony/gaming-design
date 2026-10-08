from pathlib import Path
from PIL import Image
import numpy as np
import json,sys,shutil

ROOT=Path(__file__).resolve().parent
WORK=ROOT/'work'
ASSET=ROOT.parents[5]/'game-master'/'src'/'asset'/'image'/'background'
W,H,S=1536,1024,50
# Neighbor positions relative to the room being extended; order preserves all closed loops.
PLAN={'B':{'left':'A'},'D':{'right':'A'},'K':{'bottom':'A'},'I':{'top':'A'},'C':{'left':'B'},'F':{'right':'D'},'M':{'left':'K','bottom':'B'},'J':{'right':'K','bottom':'D'},'O':{'left':'I','top':'B'},'E':{'right':'I','top':'D'},'N':{'left':'M','bottom':'C'},'H':{'right':'J','bottom':'F'},'G':{'right':'E','top':'F'}}
def filepath(key):return ROOT/('woodland-'+key.lower()+'-v2.png')
def source(key):return Image.open(filepath(key)).convert('RGB')
def prepare(key):
    neighbors=PLAN[key];l=S if 'left' in neighbors else 0;r=S if 'right' in neighbors else 0;t=S if 'top' in neighbors else 0;b=S if 'bottom' in neighbors else 0
    canvas=Image.new('RGBA',(W+l+r,H+t+b),(0,0,0,0))
    for side,neighbor in neighbors.items():
        im=source(neighbor)
        if side=='left':strip=im.crop((W-S,0,W,H));pos=(0,t)
        elif side=='right':strip=im.crop((0,0,S,H));pos=(l+W,t)
        elif side=='top':strip=im.crop((0,H-S,W,H));pos=(l,0)
        else:strip=im.crop((0,0,W,S));pos=(l,t+H)
        canvas.paste(strip,pos)
    canvas.save(WORK/(key+'-seed.png'))
    meta={'room':key,'neighbors':neighbors,'canvas':canvas.size,'crop':[l,t,l+W,t+H],'referenceStrip':S}
    (WORK/(key+'-seed.json')).write_text(json.dumps(meta),encoding='utf8')
    print(json.dumps(meta))
def finalize(key,raw):
    meta=json.loads((WORK/(key+'-seed.json')).read_text())
    raw_image=Image.open(raw).convert('RGB')
    candidate=raw_image.resize(tuple(meta['canvas']),Image.Resampling.NEAREST).crop(tuple(meta['crop']))
    original=np.asarray(candidate).astype(np.float64)
    numerator=original.copy();denominator=np.ones((H,W,1),dtype=np.float64)
    targets={}
    for side,neighbor in PLAN[key].items():
        im=np.asarray(source(neighbor),dtype=np.float64)
        d=np.arange(W if side in ['left','right'] else H,dtype=np.float64)
        if side in ['right','bottom']:d=d[::-1]
        u=np.clip(d/S,0,1);fade=1-(u*u*(3-2*u))
        ratio=fade/np.maximum(1-fade,1e-10)
        offset=np.minimum(d.astype(int),S-1)
        if side=='left':target=im[:,-1];field=im[:,W-1-offset];weight=ratio[None,:,None]
        elif side=='right':target=im[:,0];field=im[:,offset];weight=ratio[None,:,None]
        elif side=='top':target=im[-1];field=im[H-1-offset,:];weight=ratio[:,None,None]
        else:target=im[0];field=im[offset,:];weight=ratio[:,None,None]
        targets[side]=target
        numerator+=field*weight;denominator+=weight
    result=np.clip(np.rint(numerator/denominator),0,255).astype(np.uint8)
    # Enforce exact contact samples, including shared corners, after rounding.
    for side,target in targets.items():
        if side=='left':result[:,0]=target
        elif side=='right':result[:,-1]=target
        elif side=='top':result[0]=target
        else:result[-1]=target
    for side,target in targets.items():
        edge=result[:,0] if side=='left' else result[:,-1] if side=='right' else result[0] if side=='top' else result[-1]
        if not np.array_equal(edge,target.astype(np.uint8)):raise ValueError('Edge validation failed '+key+side)
    Image.fromarray(result).save(filepath(key))
    report={'room':key,'rawSize':raw_image.size,'canvas':meta['canvas'],'finalSize':[W,H],'neighbors':PLAN[key],'boundaryMaxError':0,'localCorrectionWidth':S}
    (WORK/(key+'-report.json')).write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps(report))
if __name__=='__main__':
    WORK.mkdir(exist_ok=True,parents=True)
    if sys.argv[1]=='prepare':prepare(sys.argv[2])
    elif sys.argv[1]=='finalize':finalize(sys.argv[2],sys.argv[3])
