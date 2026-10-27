from pathlib import Path
import hashlib, io, json, zipfile, os
import numpy as np
from PIL import Image,ImageDraw
OUT=Path(os.environ.get('PIXEL_STUDY_DIR','/tmp/kling-strong-pixels/study'))
SOURCE=Path(os.environ.get('PIXEL_STUDY_SOURCE_DIR','/tmp/kling-pixel-refinement/final-v1'))
VARIANTS=['legacy4','plain6','cluster6']
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def frames(path,ids=None):
 with zipfile.ZipFile(path) as z:
  m=json.loads(z.read('manifest.json')); sheets=[m['spritesheet']]+m.get('additionalSheets',[])
  byid={f['id']:f for f in m['frames']};ids=set(byid) if ids is None else set(ids);out={}
  for page,sheet in enumerate(sheets):
   chosen=[i for i in ids if byid[i].get('page',0)==page]
   if not chosen:continue
   with Image.open(io.BytesIO(z.read(sheet['file']))) as im:
    im.load()
    for i in chosen:
     f=byid[i];out[i]=np.array(im.crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height'])).convert('RGBA'))
  return m,out

def projection(frame,g):
 p=g['padding'];f=g['factor'];a=np.pad(frame,((p['top'],p['bottom']),(p['left'],p['right']),(0,0))).astype(np.float64)
 c=a.reshape(g['height'],f,g['width'],f,4);alpha=c[:,:,:,:,3];s=alpha.sum(axis=(1,3))
 rgb=(c[:,:,:,:,:3]*alpha[:,:,:,:,None]).sum(axis=(1,3))/np.maximum(1,s[:,:,None])
 return rgb,s/(f*f)

result={'format':'gathria-strong-pixel-offline-probe','version':1,'provenance':'Offline API conversions from retained actual application source CharacterPacks, not new browser exports.',
 'metric':{'eligibility':'Identical screen coordinate, source alpha-weighted cell RGB channel change <=2, both source mean alpha >=240 and both plain/cluster target frames opaque. Same eligibility for plain6 and cluster6.', 'jump':'Output maximum RGB channel change >=12.', 'coverage':'Eligible observations divided by source visible union observations (mean alpha >=128 at either endpoint).','scope':'All consecutive run positions including loop closure; no candidate timing changed. Legacy4 is a different resolution and is NOT assigned a directly comparable temporal score.','limitations':'Screen-space observation only, not optical flow or a full perceptual flicker score. Most moving edges/details are outside eligibility. Alpha is checked independently on every target pixel.'},'looks':[]}
for look in ['male-wedding','female-everyday']:
 reports={v:json.loads((OUT/f'{look}-{v}.report.json').read_text()) for v in VARIANTS}
 mp,plain=frames(OUT/f'{look}-plain6.character.zip');mc,cluster=frames(OUT/f'{look}-cluster6.character.zip')
 assert mp['animations']==mc['animations'];assert mp['anchor']==mc['anchor'];assert reports['plain6']['palette']==reports['cluster6']['palette']
 palette=set(tuple(c) for c in reports['cluster6']['palette']);changes=[];totalvisible=0
 for i in plain:
  a,b=plain[i],cluster[i];assert np.array_equal(a[:,:,3],b[:,:,3]); assert np.array_equal(a[a[:,:,3]==0],b[b[:,:,3]==0])
  mask=np.any(a[:,:,:3]!=b[:,:,:3],axis=2);n=int(mask.sum());changes.append({'frameId':i,'changedPixels':n})
  if n:
   diff=np.max(np.abs(a[:,:,:3].astype(np.int16)-b[:,:,:3].astype(np.int16)),axis=2)
   assert diff[mask].max()<=28
  totalvisible+=int((a[:,:,3]>0).sum())
  assert all(tuple(c) in palette for c in np.unique(b[b[:,:,3]>0][:,:3],axis=0))
 changed=sum(c['changedPixels'] for c in changes)
 assert changed==reports['cluster6']['cleanup']['changedPixels']
 ids=mp['animations']['run']['frames'];sm,sf=frames(SOURCE/f'{look}.source.character.zip',ids)
 projected={i:projection(im,reports['plain6']['mapping']) for i,im in sf.items()}
 rows=[];eligible_total=0;union_total=0;counts={'plain6':0,'cluster6':0}
 for pos,(a,b) in enumerate(zip(ids,ids[1:]+ids[:1])):
  if a==b:continue
  r1,alpha1=projected[a];r2,alpha2=projected[b]
  union=(alpha1>=128)|(alpha2>=128)
  eligible=(alpha1>=240)&(alpha2>=240)&(np.max(np.abs(r1-r2),axis=2)<=2)&(plain[a][:,:,3]==255)&(plain[b][:,:,3]==255)
  n=int(eligible.sum());u=int(union.sum());eligible_total+=n;union_total+=u
  jumps={}
  for v,ff in [('plain6',plain),('cluster6',cluster)]:
   jumps[v]=int((eligible&(np.max(np.abs(ff[a][:,:,:3].astype(np.int16)-ff[b][:,:,:3].astype(np.int16)),axis=2)>=12)).sum());counts[v]+=jumps[v]
  rows.append({'position':pos,'fromFrame':a,'toFrame':b,'loopSeam':pos==len(ids)-1,'eligible':n,'visibleUnion':u,'jumps':jumps})
 entry={'look':look,'sourceSha256':sha(SOURCE/f'{look}.source.character.zip'),'variants':{v:{'sha256':reports[v]['outputSha256'],'settings':reports[v]['settings'],'mapping':reports[v]['mapping']} for v in VARIANTS},'cleanup':{'changedPixels':changed,'opaquePixels':totalvisible,'changedFraction':changed/totalvisible,'alphaExact':True,'transparentRgbaExact':True,'paletteUnchanged':True,'allNewRgbInPalette':True,'maxChangedChannelBound':28,'frames':changes},'run':{'positions':len(ids),'fps':mp['animations']['run']['fps'],'eligible':eligible_total,'visibleUnion':union_total,'coverage':eligible_total/union_total,'jumps':counts,'jumpRates':{v:n/eligible_total for v,n in counts.items()},'rows':rows}}
 result['looks'].append(entry);print(look,json.dumps({'changedPixels':changed,'changedFraction':changed/totalvisible,'eligible':eligible_total,'coverage':eligible_total/union_total,'jumps':counts}))
 # Same displayed scale with integer zoom only: factor4@2x == factor6@3x.
 for action,pos in [('run',0),('run',8),('jump',19)]:
  board=Image.new('RGB',(1152,650),(239,237,225));d=ImageDraw.Draw(board)
  d.text((8,8),'OFFLINE STUDY - same source pose, same display scale; not browser capture',fill='black')
  for col,v in enumerate(VARIANTS):
   im=Image.open(OUT/f'{look}-{v}-{action}-{pos}.png').convert('RGBA');s=2 if v=='legacy4' else 3
   im=im.resize((im.width*s,im.height*s),Image.Resampling.NEAREST)
   board.paste(im,(col*384,50),im);d.text((col*384+8,30),f'{look} {action}:{pos} {v} x{s}',fill='black')
  board.save(OUT/f'{look}-{action}-{pos}-same-display.png')
 # True native resolution, aligned canvases by bottom center; no resampling.
 board=Image.new('RGB',(600,335),(239,237,225));d=ImageDraw.Draw(board)
 d.text((8,6),'OFFLINE STUDY - native pixels (sizes intentionally differ)',fill='black')
 for col,v in enumerate(VARIANTS):
  im=Image.open(OUT/f'{look}-{v}-run-0.png').convert('RGBA')
  board.paste(im,(col*200+(200-im.width)//2,330-im.height),im);d.text((col*200+8,22),v,fill='black')
 board.save(OUT/f'{look}-native.png')
(OUT/'analysis.json').write_text(json.dumps(result,indent=2)+'\n')
