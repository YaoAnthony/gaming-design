from pathlib import Path
from PIL import Image
import numpy as np,json,sys
root=Path(__file__).resolve().parent
key,raw=sys.argv[1:3]
dest=root/('woodland-'+key.lower()+'-v2.png')
old=Image.open(dest).convert('RGB')
new=Image.open(raw).convert('RGB').resize(old.size,Image.Resampling.NEAREST)
a=np.asarray(old,dtype=np.float64);b=np.asarray(new,dtype=np.float64)
h,w=a.shape[:2];x=np.minimum(np.arange(w),np.arange(w)[::-1]);y=np.minimum(np.arange(h),np.arange(h)[::-1])
d=np.minimum(x[None,:],y[:,None]);u=np.clip((d-80)/80,0,1);mask=(u*u*(3-2*u))[:,:,None]
out=np.clip(np.rint(a*(1-mask)+b*mask),0,255).astype(np.uint8)
assert np.array_equal(out[d<=80],a.astype(np.uint8)[d<=80])
old.save(root/'work'/(key+'-before-theme.png'))
Image.fromarray(out).save(dest)
print(json.dumps({'room':key,'outer80px':'unchanged','themeIntegrated':True}))
