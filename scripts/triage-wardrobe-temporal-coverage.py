#!/usr/bin/env python3
"""Read-only temporal triage of every currently selectable garment.

Native ownership/visible area and RGB statistics use all authored pixels. Motion
residuals use a fixed 4px source-coordinate grid to bound work; no output artwork
is transformed. Scores rank candidates for visual review and are not defects.
"""
from pathlib import Path
import argparse,hashlib,io,json,zipfile
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
STEP=4
sha=lambda b:hashlib.sha256(b).hexdigest()
def load(p):return json.loads((ROOT/p).read_text())
def png(z,p):return np.array(Image.open(io.BytesIO(z.read(p))).convert('RGBA'))
def pm(a):
 a=a.astype(np.float32);a[...,:3]*=a[...,3:4]/255.;return a

def source_frames(path):
 data=(ROOT/path).read_bytes()
 with zipfile.ZipFile(io.BytesIO(data)) as z:
  m=json.loads(z.read('manifest.json'));frames={}
  sheets=[m['spritesheet']]+m.get('additionalSheets',[])
  for pi,sheet in enumerate(sheets):
   page=png(z,sheet['file'])
   for f in m['frames']:
    if f.get('page',0)!=pi:continue
    crop=page[f['y']:f['y']+f['height'],f['x']:f['x']+f['width']]
    frames[f['id']]=pm(crop[::STEP,::STEP].copy())
  return sha(data),m,frames

def describe(z,m):
 descriptors={};samples={}
 for pi,p in enumerate(m['pages']):
  art=png(z,p['file']);own=png(z,p['maskFile'])[...,3]
  for f in m['frames']:
   if f['page']!=pi:continue
   r=f['rect'];x,y,w,h=r['x'],r['y'],r['width'],r['height'];ox,oy=f['offset']['x'],f['offset']['y']
   a=art[y:y+h,x:x+w];o=own[y:y+h,x:x+w]==255;visible=o&(a[...,3]>=128)
   yy,xx=np.nonzero(visible)
   area=int(visible.sum());rgb=a[visible,:3].astype(np.float32)
   if area:
    color=rgb.mean(axis=0).tolist();bins=(rgb.astype(np.uint16)//64);idx=bins[:,0]*16+bins[:,1]*4+bins[:,2];hist=np.bincount(idx,minlength=64).astype(float)/area
    bounds=[int(xx.min()+ox),int(yy.min()+oy),int(xx.max()+ox+1),int(yy.max()+oy+1)]
    center=[float(xx.mean()+ox),float(yy.mean()+oy)]
   else:color=[0.,0.,0.];hist=np.zeros(64);bounds=None;center=None
   descriptors[f['frameId']]={'ownedPixels':int(o.sum()),'visiblePixels':area,'meanRgb':[round(v,4) for v in color],'visibleBounds':bounds,'visibleCentroid':[round(v,4) for v in center] if center else None,'histogram':hist}
   # Sample using the same native (0,0) grid in all frames. Offset phases matter.
   sh=(m['frameHeight']+STEP-1)//STEP;sw=(m['frameWidth']+STEP-1)//STEP
   canvas=np.zeros((sh,sw,4),np.float32);mask=np.zeros((sh,sw),bool)
   lx=(-ox)%STEP;ly=(-oy)%STEP;patch=a[ly::STEP,lx::STEP];mo=o[ly::STEP,lx::STEP];sy=(oy+ly)//STEP;sx=(ox+lx)//STEP
   if len(patch) and patch.shape[1]:
    canvas[sy:sy+patch.shape[0],sx:sx+patch.shape[1]]=pm(patch)
    mask[sy:sy+patch.shape[0],sx:sx+patch.shape[1]]=mo
   samples[f['frameId']]=(canvas,mask)
 return descriptors,samples

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--inventory',default='docs/wardrobe-coverage/inventory.json');ap.add_argument('--plan',default='docs/wardrobe-finish/mixed/plan.json');ap.add_argument('--out',default='docs/wardrobe-finish/mixed/temporal.json');ap.add_argument('--assets',help='Optional comma-separated garment IDs for a bounded development run');args=ap.parse_args()
 inv=load(args.inventory);plan=load(args.plan);assert not inv['issues'];gmap={g['id']:g for g in plan['groups']};sources={};records=[];all_edges=[]
 selected=set(args.assets.split(',')) if args.assets else None
 for item in inv['assets']:
  if selected and item['id'] not in selected:continue
  group=next((gmap[g] for g in item['groups'] if g in gmap),None)
  if not group:continue
  sp=group['sourceUrl']
  if sp not in sources:sources[sp]=source_frames(sp)
  source_sha,manifest,source=sources[sp];assert source_sha==item['sourceSha256']
  b=(ROOT/item['path']).read_bytes();assert sha(b)==item['sha256'],f"Stale inventory: {item['path']}"
  with zipfile.ZipFile(io.BytesIO(b)) as z:
   m=json.loads(z.read('manifest.json'));stats,samples=describe(z,m)
  assert any(s['ownedPixels'] for s in stats.values()), f"No ownership pixels decoded: {item['path']}"
  edges=[];gameplay_pairs=set()
  clips=[('gameplay',action,clip) for action,clip in group['actions'].items()]
  # Kept source clips can contain celebration or approach frames omitted by
  # the gameplay selector. Scan their unseen adjacent pairs explicitly too.
  clips += [('nativeSourceSupplement',action,dict(clip,loop=False if action=='jump' else clip['loop'])) for action,clip in manifest['animations'].items()]
  for clip_set,action,clip in clips:
   ids=clip['frames'];assert all(i in stats and i in source for i in ids)
   if action=='jump':assert not clip['loop'],'Basic jump must not receive a fabricated closure edge'
   for i in range(len(ids) if clip['loop'] else len(ids)-1):
    j=(i+1)%len(ids);fid,nid=ids[i],ids[j]
    pair=(action,fid,nid,j==0)
    if clip_set=='nativeSourceSupplement' and pair in gameplay_pairs:continue
    if clip_set=='gameplay':gameplay_pairs.add(pair)
    a,am=samples[fid];b,bm=samples[nid];sa,sb=source[fid],source[nid];union=am|bm
    current_a=np.where(am[...,None],a,sa);current_b=np.where(bm[...,None],b,sb)
    if union.any():
     source_delta=np.abs(sb-sa).max(axis=2)[union];current_delta=np.abs(current_b-current_a).max(axis=2)[union]
     residual=np.abs((current_b-current_a)-(sb-sa)).max(axis=2)[union]
     src=float(source_delta.mean()/255);cur=float(current_delta.mean()/255);res=float(residual.mean()/510);res_count=int((residual>8).sum());max_res=float(residual.max()/510)
    else:src=cur=res=max_res=0.;res_count=0
    a_stat,b_stat=stats[fid],stats[nid];aa,ba=a_stat['visiblePixels'],b_stat['visiblePixels'];area=abs(ba-aa)/max(aa,ba,1)
    hist=float(np.abs(a_stat['histogram']-b_stat['histogram']).sum()/2)
    outline=float(np.logical_xor(am,bm).sum()/max(union.sum(),1))
    score=.45*area+.25*hist+.2*res+.1*outline
    row={'clipSet':clip_set,'action':action,'fromPosition':i,'toPosition':j,'fromFrameId':fid,'toFrameId':nid,'loopClosure':j==0,'hold':fid==nid,'durationMs':1000/clip['fps'],'ownershipAreaChange':round(area,6),'rgbHistogramChange':round(hist,6),'sampledOwnershipBoundaryChange':round(outline,6),'sampledSourceMotion':round(src,6),'sampledDressedMotion':round(cur,6),'sampledSourceRelativeResidual':round(res,6),'sampledResidualAbove8':res_count,'sampledMaxResidual':round(max_res,6),'triageScore':round(score,6)}
    edges.append(row)
  for st in stats.values():st.pop('histogram')
  gameplay_ids={fid for clip in group['actions'].values() for fid in clip['frames']}
  record={'nativeFramesOutsideGameplayActions':sorted(set(stats)-gameplay_ids),'gameplayUniqueFrameCount':len(gameplay_ids),'path':item['path'],'id':item['id'],'sha256':item['sha256'],'groups':item['groups'],'sourceSha256':item['sourceSha256'],'registrationSha256':item['registrationSha256'],'motionProfile':group['motionProfile'],'nativeFrames':len(stats),'frameStatistics':stats,'edges':edges}
  records.append(record)
  all_edges.extend(dict(row,assetPath=item['path'],garmentId=item['id'],group=group['id']) for row in edges)
  print(f"{item['id']}: {len(stats)} frames, {len(edges)} action edges",flush=True)
 all_edges.sort(key=lambda e:(-e['triageScore'],e['assetPath'],e['action'],e['fromPosition']))
 representatives=[];seen_risks=set();by_path={a['path']:a for a in inv['assets']}
 for e in all_edges:
  g=gmap[e['group']];key=(g['character'],g['view'],by_path[e['assetPath']]['slot'],e['action'])
  if key not in seen_risks:
   seen_risks.add(key);representatives.append(e)
 out={'format':'gathria-wardrobe-temporal-triage','version':1,'generatorSha256':sha(Path(__file__).read_bytes()),'inventorySha256':sha((ROOT/args.inventory).read_bytes()),'planSha256':sha((ROOT/args.plan).read_bytes()),'scope':'Every scoped garment native frame and every adjacent pair in the current reviewed gameplay actions. Hold edges and real loop closure are retained; basic jump is non-looping. No source/asset pixels or frame positions are changed.','method':{'nativeMetrics':'Exact ownership/visible area, bounds, centroid and visible cloth RGB statistics.','motionGridStep':STEP,'motionGrid':'Fixed native coordinates, identical phase in all frames. This diagnostic sampling does not downsample output assets.','score':'0.45*visibleAreaChange + 0.25*RGBHistogramDistance + 0.2*sourceRelativeResidual + 0.1*ownershipBoundaryChange','interpretation':'A high score is a review candidate, not a defect or quality grade. Legitimate moving sleeves, skirt motion, occlusion and source pose changes can all score high. Smaller seam or one-pixel defects may score low. Source-relative residual does not remove all expected clothing motion.'},'summary':{'uniqueGarments':len(records),'nativeFrames':sum(r['nativeFrames'] for r in records),'nativeFramesOutsideGameplayActions':sum(len(r['nativeFramesOutsideGameplayActions']) for r in records),'actionEdges':len(all_edges),'loopClosureEdges':sum(e['loopClosure'] for e in all_edges),'jumpLoopClosureEdges':sum(e['loopClosure'] and e['action']=='jump' for e in all_edges),'holdEdges':sum(e['hold'] for e in all_edges)},'highestRiskEdges':all_edges[:80],'representativeRiskEdges':representatives,'garments':records,'visualAcceptance':'requires-viewing-selected-candidates'}
 out['scope']='Every scoped garment native frame and every adjacent pair in current gameplay actions, plus unseen adjacent pairs retained in original source clips. Hold edges and actual loops are retained; neither gameplay nor source jump receives a fabricated closure. No output pixels or positions are changed.'
 out['summary']['gameplayEdges']=sum(e['clipSet']=='gameplay' for e in all_edges)
 out['summary']['nativeSourceSupplementEdges']=sum(e['clipSet']=='nativeSourceSupplement' for e in all_edges)
 if not selected:assert len(records)==inv['summary']['uniqueActiveGarmentFiles'];assert out['summary']['nativeFrames']==inv['summary']['uniqueGarmentFramePairs']
 path=ROOT/args.out;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out['summary']))

if __name__=='__main__':main()
