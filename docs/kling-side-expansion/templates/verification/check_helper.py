import sys,json
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path.cwd()/'scripts'))
from kling_side_authoring import load_context,pack_garment,sha
out=Path('/tmp/side-expansion/templates/verification')
results=[]
for who in ['male','female']:
 c=load_context(who); paintings={}; owned={}; expected=[]
 for fid,s in c.frames.items():
  m=np.zeros(s.shape[:2],bool); p=np.zeros_like(s)
  yy,xx=np.where(c.masks(fid)['top']); y,x=int(yy[len(yy)//2]),int(xx[len(xx)//2])
  m[y,x]=True; p[y,x]=[31,71,119,255]
  y2,x2=int(yy[len(yy)//3]),int(xx[len(xx)//3]); m[y2,x2]=True
  yy2,xx2=np.where(s[:,:,3]==0); dist=(yy2-y)**2+(xx2-x)**2; j=dist.argmin(); ye,xe=int(yy2[j]),int(xx2[j]); m[ye,xe]=True;p[ye,xe]=[61,111,141,193]
  paintings[fid]=p;owned[fid]=m
  rendered=s.copy();rendered[m]=p[m]
  expected.append({'frameId':fid,'sha256':sha(rendered.tobytes()),'protectionSha256':sha(c.protected_mask(fid).astype(np.uint8).tobytes())})
 audit=pack_garment(c,f'{who}-authoring-fixture','Authoring validation fixture','top',paintings,out/f'{who}.garment.zip','Temporary helper verification: replacement, transparent erasure, silhouette extension, exact protected pixels.',ownership=owned,painting_mode='patch')
 (out/f'{who}-expected.json').write_text(json.dumps(expected))
 assert sum(f['extensionPixels'] for f in audit['frames'])==len(c.frames)
 assert sum(f['erasedSourcePixels'] for f in audit['frames'])==len(c.frames)
 fid=min(c.frames)
 failures=[]
 # Protected ownership fails even with unchanged source bytes.
 bad=owned.copy();mask=owned[fid].copy(); y,x=np.argwhere(c.protected_mask(fid))[0];mask[y,x]=True;bad[fid]=mask
 try:pack_garment(c,'bad','Bad','top',paintings,out/'bad.zip','Rejection fixture',ownership=bad,painting_mode='patch')
 except ValueError as e:assert 'protected' in str(e);failures.append('protected ownership')
 else:raise AssertionError('protection accepted')
 # Missing frame does not silently fall back.
 try:pack_garment(c,'bad','Bad','top',{k:v for k,v in paintings.items() if k!=fid},out/'bad.zip','Rejection fixture')
 except ValueError as e:assert 'every registered frame' in str(e);failures.append('missing frame')
 else:raise AssertionError('missing frame accepted')
 # Nonbinary ownership fails.
 bad=owned.copy();mask=owned[fid].astype(np.uint8)*255;mask[0,0]=128;bad[fid]=mask
 try:pack_garment(c,'bad','Bad','top',paintings,out/'bad.zip','Rejection fixture',ownership=bad,painting_mode='patch')
 except ValueError as e:assert 'bool or 0/255' in str(e);failures.append('nonbinary ownership')
 else:raise AssertionError('nonbinary ownership accepted')
 # Dirty pixels outside patch ownership fail.
 bad=paintings.copy();patch=paintings[fid].copy();patch[0,0]=[1,0,0,0];bad[fid]=patch
 try:pack_garment(c,'bad','Bad','top',bad,out/'bad.zip','Rejection fixture',ownership=owned,painting_mode='patch')
 except ValueError as e:assert 'outside ownership' in str(e);failures.append('unowned RGBA')
 else:raise AssertionError('unowned bytes accepted')
 # Fully unchanged frames fit valid sparse1x1 records.
 unchanged=pack_garment(c,f'{who}-no-change','Unchanged fixture','top',c.frames,out/f'{who}-empty.garment.zip','Temporary empty-frame coverage verification.')
 assert all(f['changedPixels']==0 for f in unchanged['frames'])
 results.append({'identity':who,'frames':len(c.frames),'archiveSha256':audit['sha256'],'pages':len(audit['pages']),'pixels':audit['decodedPixelsPerAtlasKind'],'rejected':failures,'unchangedFrames':len(unchanged['frames'])})
 print(results[-1],flush=True)
(out/'python-checks.json').write_text(json.dumps(results,indent=2)+'\n')
