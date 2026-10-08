from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np,json
root=Path(__file__).resolve().parent
layout=[['H','J','K','M','N'],['F','D','A','B','C'],['G','E','I','O','P']]
rooms={k:np.array(Image.open(root/('woodland-'+k.lower()+'-v2.png')).convert('RGB')) for row in layout for k in row if k!='P'}
checks=[]
for y,row in enumerate(layout):
 for x,key in enumerate(row):
  if key=='P':continue
  for dx,dy in [(1,0),(0,1)]:
   if y+dy>=3 or x+dx>=5:continue
   neighbor=layout[y+dy][x+dx]
   if neighbor=='P':continue
   a,b=rooms[key],rooms[neighbor]
   edgeA,edgeB=(a[:,-1],b[:,0]) if dx else (a[-1],b[0])
   diff=np.abs(edgeA.astype(int)-edgeB.astype(int))
   checks.append({'from':key,'to':neighbor,'axis':'horizontal' if dx else 'vertical','maxChannelError':int(diff.max()),'differentPixels':int(np.any(diff,axis=1).sum())})
assert len(checks)==20
assert all(c['maxChannelError']==0 for c in checks)
assert all(a.shape==(1024,1536,3) for a in rooms.values())
original=np.array(Image.open(root.parent/'floor1-woodland-v1'/'woodland-a-v1.png').convert('RGB'))
assert np.array_equal(original,rooms['A'])
report={'method':'50px exact neighbor strips -> built-in image_gen outpaint -> crop reference strips -> local 50px edge interpolation; two-edge corners share the same boundary values. Theme edits preserve outer 80px.','rooms':14,'width':1536,'height':1024,'referenceStripPx':50,'AUnchanged':True,'excluded':['P'],'passedSeams':20,'checks':checks}
(root/'seam-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
overview=Image.new('RGB',(1920,768),(25,25,27));draw=ImageDraw.Draw(overview)
themes={'H':'H | Windwheel','J':'J | High canopy','K':'K | Moonwood crowns','M':'M | High branches','N':'N | Observatory','F':'F | Pine valley','D':'D | West woods','A':'A | Moonwood','B':'B | East woods','C':'C | Timber camp','G':'G | Old quarry','E':'E | Fern hollow','I':'I | Root hollow','O':'O | Flooded hollow','P':'P | Unchanged'}
for y,row in enumerate(layout):
 for x,key in enumerate(row):
  if key in rooms:overview.paste(Image.fromarray(rooms[key]).resize((384,256),Image.Resampling.LANCZOS),(384*x,256*y))
  px,py=x*384+7,y*256+6;draw.rectangle((px-3,py-2,px+157,py+17),fill=(25,25,27));draw.text((px,py),themes[key],fill=(221,213,188))
overview.save(root/'overview.png')
# Unlabelled contact sheet to judge continuity without distracting frames.
atlas=Image.new('RGB',(1536*5,1024*3),(25,25,27))
for y,row in enumerate(layout):
 for x,key in enumerate(row):
  if key in rooms:atlas.paste(Image.fromarray(rooms[key]),(1536*x,1024*y))
atlas.resize((1920,768),Image.Resampling.LANCZOS).save(root/'overview-no-labels.png')
# Cross shaped crop around A for closer inspection of both axes.
atlas.crop((1536*2-256,1024-256,1536*3+256,1024*2+256)).resize((1365,1024)).save(root/'A-neighbors.png')
print(json.dumps({'rooms':14,'seams':20,'maxChannelError':0,'AUnchanged':True}))
