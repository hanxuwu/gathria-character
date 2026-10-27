from pathlib import Path
import hashlib, io, json, zipfile
import numpy as np
from PIL import Image, ImageDraw
ROOT=Path('/workspace/gathria-character')
OUT=Path('/tmp/kling-pixel-refinement/probe')
VARIANTS=['nearest-96','detail-96','detail-128']
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def read_frames(path, ids):
 with zipfile.ZipFile(path) as z:
  manifest=json.loads(z.read('manifest.json'))
  sheets=[manifest['spritesheet']]+manifest.get('additionalSheets',[])
  by_id={f['id']:f for f in manifest['frames']}
  result={}
  for page,sheet in enumerate(sheets):
   selected=[i for i in ids if by_id[i].get('page',0)==page]
   if not selected:continue
   with Image.open(io.BytesIO(z.read(sheet['file']))) as image:
    image.load()
    for i in selected:
     f=by_id[i];result[i]=np.array(image.crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height'])).convert('RGBA'))
  return manifest,result

def reference_projection(frame,mapping):
 pad=mapping['padding']; factor=mapping['factor']
 arr=np.pad(frame,((pad['top'],pad['bottom']),(pad['left'],pad['right']),(0,0))).astype(np.float64)
 h,w=mapping['height'],mapping['width']
 cells=arr.reshape(h,factor,w,factor,4)
 alpha=cells[:,:,:,:,3]
 summed=alpha.sum(axis=(1,3))
 rgb=(cells[:,:,:,:,:3]*alpha[:,:,:,:,None]).sum(axis=(1,3))/np.maximum(summed[:,:,None],1)
 avg_alpha=summed/(factor*factor)
 return rgb,avg_alpha

report={'format':'gathria-pixel-temporal-authoring-diagnostic','version':1,
 'definition':{'reference':'Alpha-weighted source RGB mean in the identical fixed source cells; source alpha mean separately retained. No source palette and no candidate-specific eligibility.',
 'eligible':'Same screen coordinate, both source alpha means >=240; max absolute source RGB mean difference <=2; all three candidate pairs opaque. Original held frame IDs excluded from jump counts.',
 'jump':'Max absolute output RGB channel change >=12.',
 'coverage':'Eligible observations divided by source visible-union observations (source mean alpha >=128 at either endpoint).',
 'scope':'All consecutive run timeline transitions, including final-to-first; each of 3 candidates uses identical eligibility. All repeated-ID holds across all actions checked independently.',
 'limitations':'Screen-pixel diagnostic, not optical-flow correspondence, not a perceptual flicker or art-quality score. Excludes moving edges and most moving details. Output RGB and binary alpha intentionally differ from source.'},'looks':[]}
for look in ['male-wedding','female-day']:
 source=ROOT/'docs/kling-contour-review/evidence'/f'{look}.character.zip'
 with zipfile.ZipFile(source) as z:sm=json.loads(z.read('manifest.json'))
 clip=sm['animations']['run'];ids=clip['frames']
 allids=set(i for a in sm['animations'].values() for i in a['frames'])
 _, sf=read_frames(source,set(ids))
 paths={v:OUT/f'{look}-{v}.character.zip' for v in VARIANTS}
 cand={};manifests={}
 for v,p in paths.items():manifests[v],cand[v]=read_frames(p,allids)
 mapping=json.loads((OUT/f'{look}-detail-128.report.json').read_text())['mapping']
 projected={i:reference_projection(frame,mapping) for i,frame in sf.items()}
 rows=[]; total_eligible=0;union_total=0;totals={v:0 for v in VARIANTS}
 pairs=list(zip(ids,ids[1:]+ids[:1])) if clip['loop'] else list(zip(ids,ids[1:]))
 for pos,(a,b) in enumerate(pairs):
  rgb1,alpha1=projected[a];rgb2,alpha2=projected[b]
  union=(alpha1>=128)|(alpha2>=128)
  eligible=(alpha1>=240)&(alpha2>=240)&(np.max(np.abs(rgb1-rgb2),axis=2)<=2)
  for v in VARIANTS:eligible&=(cand[v][a][:,:,3]==255)&(cand[v][b][:,:,3]==255)
  if a==b:continue
  n=int(eligible.sum());u=int(union.sum());total_eligible+=n;union_total+=u
  jumps={v:int((eligible&(np.max(np.abs(cand[v][a][:,:,:3].astype(np.int16)-cand[v][b][:,:,:3].astype(np.int16)),axis=2)>=12)).sum()) for v in VARIANTS}
  for v in VARIANTS:totals[v]+=jumps[v]
  rows.append({'position':pos,'fromFrame':a,'toFrame':b,'loopSeam':pos==len(pairs)-1 and clip['loop'],'eligible':n,'visibleUnion':u,'jumps':jumps})
 holds=[]
 for action,ac in sm['animations'].items():
  seq=ac['frames'];ps=list(zip(seq,seq[1:]+seq[:1])) if ac['loop'] else list(zip(seq,seq[1:]))
  for pos,(a,b) in enumerate(ps):
   if a!=b:continue
   holds.append({'action':action,'position':pos,'frame':a,'exact':{v:bool(np.array_equal(cand[v][a],cand[v][b])) for v in VARIANTS}})
 result={'look':look,'sourceSha256':sha(source),'candidates':{v:{'sha256':sha(paths[v]),'paletteSize':len(json.loads((OUT/f'{look}-{v}.report.json').read_text())['palette'])} for v in VARIANTS},
  'mapping':mapping,'run':{'positions':len(ids),'fps':clip['fps'],'transitions':len(rows),'eligible':total_eligible,'visibleUnion':union_total,'coverage':total_eligible/max(1,union_total),'jumps':totals,'jumpRate':{v:totals[v]/max(1,total_eligible) for v in VARIANTS},'rows':rows},'holds':holds,'allHoldsExact':all(all(h['exact'].values()) for h in holds)}
 report['looks'].append(result)
 print(look,json.dumps({'eligible':total_eligible,'coverage':result['run']['coverage'],'jumps':totals,'rates':result['run']['jumpRate'],'holds':len(holds)}))
(OUT/'temporal-analysis.json').write_text(json.dumps(report,indent=2)+'\n')
# Layout only: exact exported lossless pixels with integer display zoom.
canvas=Image.new('RGB',(1152,1250),(239,237,225));d=ImageDraw.Draw(canvas)
for row,look in enumerate(['male-wedding','female-day']):
 for col,v in enumerate(VARIANTS):
  im=Image.open(OUT/f'{look}-{v}-jump-19.png').convert('RGBA').resize((384,594),Image.Resampling.NEAREST)
  canvas.paste(im,(col*384,row*625+25),im);d.text((col*384+8,row*625+8),f'{look} jump19 {v}',fill='black')
canvas.save(OUT/'temporal-jump-keyframes.png')
