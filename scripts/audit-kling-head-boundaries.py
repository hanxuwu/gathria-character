#!/usr/bin/env python3
"""Measure the baseline head-fringe defect without changing artwork.

Uses retained actual source exports and the exact appearance bank at the
pre-correction commit. The new hair-occlusion allowance is deliberately ignored:
this records why three source pixels were chosen, not a visual pass assertion.
Pillow foreground rasterization is diagnostic; the runtime has pixel-center
polygon coverage. Source hand edges are reported separately from scalp edges.
"""
from pathlib import Path
import importlib.util,json,io,zipfile,subprocess,hashlib,collections
from PIL import Image,ImageDraw
import numpy as np
R=Path(__file__).resolve().parents[1];s=importlib.util.spec_from_file_location('h',R/'scripts/render-kling-appearance-review.py');h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
BASELINE='055e95116cd441be7a630554409738b4a0b67ef9'
records=[];inputs=[]
for c in ['male','female']:
 _,source=h.decode_pack(R/f'docs/kling-motion/exports/{c}.character.zip')
 with zipfile.ZipFile(R/f'docs/kling-appearance/review/evidence/final-{c}/exports/{c}-day.wardrobe.zip') as z:reg=json.loads(z.read('registration.json'))
 protected={f['frameId']:f['protected'] for f in reg['frames']}
 bank_bytes=subprocess.run(['git','show',f'{BASELINE}:docs/kling-appearance/banks/{c}.zip'],cwd=R,check=True,capture_output=True).stdout
 inputs.append({'character':c,'bankBaselineCommit':BASELINE,'bankSha256':hashlib.sha256(bank_bytes).hexdigest(),'sourcePack':f'docs/kling-motion/exports/{c}.character.zip','sourcePackSha256':h.sha(R/f'docs/kling-motion/exports/{c}.character.zip')})
 with zipfile.ZipFile(io.BytesIO(bank_bytes)) as z:
  bank=json.loads(z.read('manifest.json'));poses={p['frameId']:p for p in bank['poses']}
  pages=[np.array(Image.open(io.BytesIO(z.read(p['file'])))) for p in bank['pages']];masks=[np.array(Image.open(io.BytesIO(z.read(p['maskFile'])))) for p in bank['pages']]
  for style in bank['styles']:
   if style['slot']!='hair':continue
   for f in style['layers'][0]['frames']:
    fid=f['frameId'];p=poses[fid];hb=p['headBounds'];a=np.array(source[fid]);fg=Image.new('1',source[fid].size);d=ImageDraw.Draw(fg)
    polys=p['foreground']+[r['polygon'] for r in protected[fid] if r['label']!='head']
    for poly in polys:d.polygon([(v['x'],v['y']) for v in poly],fill=1)
    r=f['rect'];patch=pages[f['page']][r['y']:r['y']+r['height'],r['x']:r['x']+r['width']];mask=masks[f['page']][r['y']:r['y']+r['height'],r['x']:r['x']+r['width'],3]
    ys,xs=np.indices((r['height'],r['width']));xs+=f['offset']['x'];ys+=f['offset']['y'];native=(xs>=0)&(ys>=0)&(xs<a.shape[1])&(ys<a.shape[0]);clx=np.clip(xs,0,a.shape[1]-1);cly=np.clip(ys,0,a.shape[0]-1)
    dist=np.maximum.reduce([hb['x']-(xs+.5),xs+.5-(hb['x']+hb['width']),hb['y']-(ys+.5),np.zeros_like(xs)])
    relevant=native&(mask==255)&(patch[:,:,3]>0)&(a[cly,clx,3]>0)&~np.array(fg)[cly,clx]&(ys+.5<=hb['y']+hb['height'])&(dist>0)
    y,x=np.where(relevant);hist={}
    for distance in np.ceil(dist[y,x]).astype(int):hist[int(distance)]=hist.get(int(distance),0)+1
    worst=[]
    for k in np.argsort(dist[y,x])[-8:]:worst.append({'x':int(xs[y[k],x[k]]),'y':int(ys[y[k],x[k]]),'distance':float(dist[y[k],x[k]]),'source':a[cly[y[k],x[k]],clx[y[k],x[k]]].tolist(),'patchAlpha':int(patch[y[k],x[k],3])})
    records.append({'character':c,'style':style['id'],'frameId':fid,'headBounds':hb,'pixelCount':int(relevant.sum()),'maxDistance':float(dist[relevant].max()) if relevant.any() else 0,'distanceHistogram':hist,'worst':worst})
summary={}
for c in ['male','female']:
 items=[r for r in records if r['character']==c and not 67<=r['frameId']<=82]
 histogram=collections.Counter()
 for record in items:histogram.update({int(k):v for k,v in record['distanceHistogram'].items()})
 summary[c]={'maxNonCelebrateTopSideDistance':max(r['maxDistance'] for r in items),'affectedStylePosePairs':sum(r['pixelCount']>0 for r in items),'distanceHistogram':dict(sorted(histogram.items()))}
report={'baselineCommit':BASELINE,'inputs':inputs,'method':'All currently blocked front-hair ownership pixels above headBounds bottom; source alpha>0 and patch alpha>0, outside headBounds on top/sides; explicit foreground hands/arms excluded using Pillow polygon rasterization (diagnostic; runtime uses pixel-center rasterization). No donor threshold or alpha deletion.','conclusion':{'nonCelebrate':summary,'reviewedMarginNativePixels':3,'bottomExtension':0,'warning':'Celebration candidates farther outside the head rectangle include source hand edges, not scalp. Do not enlarge toward them. Pixel-center runtime geometry differs from the Pillow foreground polygon used here; final runtime exports must verify exact behavior.'},'records':records}
output=R/'docs/kling-appearance/stability-review/head-boundary-diagnostics.json'
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'output':str(output.relative_to(R)),'stylePosePairs':len(records),'nonCelebrate':summary}))
