// Paired polish: independently audit current UI exports against the reviewed baseline.
// Derived from the existing independent raw-layer verifier, with explicit registration revisions.
// This does not import the application's compositor or authoring implementation.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { unzipSync } from "fflate";
import { parseGIF, decompressFrames } from "gifuct-js";

assert(process.argv[2], "Pass an actual UI exports.json file.");
const input = resolve(process.argv[2]);
const rows = JSON.parse(await readFile(input, "utf8"));
// Match the archive being audited, rather than assuming that today's active
// catalog authored every historical export. Prior review evidence stays valid.
const catalogs = [];
for (const path of [
  "docs/dual-looks/assets/catalog.json",
  "docs/matched-hair/assets/catalog.json",
  "docs/paired-polish/assets/appearance-catalog.json",
]) {
  try {
    catalogs.push({ path, ...JSON.parse(await readFile(path, "utf8")) });
  } catch (error) {
    if (error.code !== "ENOENT" || path.includes("dual-looks")) throw error;
  }
}
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));

const independentlyDecode = String.raw`
import hashlib,io,json,math,sys,zipfile
import numpy as np
from PIL import Image
sha=lambda b:hashlib.sha256(b).hexdigest()
def opened(path):
 z=zipfile.ZipFile(path);assert z.testzip() is None;return z
def image(z,path):
 im=Image.open(io.BytesIO(z.read(path)));im.load();assert im.mode=='RGBA';return im
def pack(z):
 m=json.loads(z.read('manifest.json'));c=json.loads(z.read('character.json'))
 pages=[image(z,s['file']) for s in [m['spritesheet']]+m.get('additionalSheets',[])]
 return m,c,pages
def frame(p,f):return np.array(p[f.get('page',0)].crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height'])))
def polygon(points,w,h,dx=0,dy=0):
 ps=[{'x':p['x']+dx,'y':p['y']+dy} for p in points];out=np.zeros((h,w),bool)
 for y in range(max(0,math.ceil(min(p['y'] for p in ps)-.5)),min(h-1,math.floor(max(p['y'] for p in ps)-.5))+1):
  cy=y+.5;crossings=[];spans=[]
  for a,b in zip(ps[-1:]+ps[:-1],ps):
   if (a['y']>cy)!=(b['y']>cy):crossings.append(a['x']+(cy-a['y'])*(b['x']-a['x'])/(b['y']-a['y']))
   if abs(a['y']-cy)<1e-9 and abs(b['y']-cy)<1e-9:spans.append((a['x'],b['x']))
   elif abs(a['y']-cy)<1e-9:spans.append((a['x'],a['x']))
  crossings.sort();spans+=list(zip(crossings[::2],crossings[1::2]))
  for a,b in spans:
   lo=max(0,math.ceil(min(a,b)-.5-1e-9));hi=min(w-1,math.floor(max(a,b)-.5+1e-9))
   if lo<=hi:out[y,lo:hi+1]=True
 return out
def rectangle(r,w,h,dx=0,dy=0):
 x=np.arange(w)+.5-dx;y=np.arange(h)+.5-dy
 return ((y>=r['y'])&(y<=r['y']+r['height']))[:,None]&((x>=r['x'])&(x<=r['x']+r['width']))[None,:]
def part(pages,f):
 r=f['rect'];box=(r['x'],r['y'],r['x']+r['width'],r['y']+r['height']);p,mask=pages[f['page']]
 rgba=np.array(p.crop(box));alpha=np.array(mask.crop(box))[:,:,3];assert np.isin(alpha,[0,255]).all();return rgba,alpha==255
row=json.loads(sys.argv[1]);project=opened(row['project']);doc=json.loads(project.read('document.json'))
source_bytes=project.read('source.character.zip');reg_bytes=project.read('registration.json');reg=json.loads(reg_bytes)
assert sha(source_bytes)==doc['sourceSha256']==reg['sourceSha256'];assert sha(reg_bytes)==doc['registrationSha256']
sm,sc,sp=pack(opened(io.BytesIO(source_bytes)));dm,dc,dp=pack(opened(row['pack']))
cm,cc,cp=pack(opened(row['baseline']['pack']))
assert cm['animations']==sm['animations'];clothes_frames={f['id']:f for f in cm['frames']}
for key in ['animations','scale','facing']:assert sm.get(key)==dm.get(key),key
assert [f['id'] for f in sm['frames']]==[f['id'] for f in dm['frames']]
assert sc['derivation']['frames']==dc['derivation']['frames']
assert dc['sourceMetadata']['wardrobe']['sourcePackSha256']==doc['sourceSha256']
assert dc['sourceMetadata']['wardrobe']['selection']==doc['selection']
bank_bytes=project.read('appearance.zip');ab=opened(io.BytesIO(bank_bytes));am=json.loads(ab.read('manifest.json'));sel=doc['appearance']
assert sha(bank_bytes)==sel['bankSha256'];assert am['sourceSha256']==doc['sourceSha256'];assert am['registrationSha256']==doc['registrationSha256']
assert sel['hairId'] and sel['faceId'];padding=am['padding'];L,T,R,B=[padding[k] for k in ['left','top','right','bottom']]
sw,sh=am['frameWidth'],am['frameHeight'];w,h=sw+L+R,sh+T+B
assert (dm['spritesheet']['frameWidth'],dm['spritesheet']['frameHeight'])==(w,h)
assert dm['anchor']=={**sm['anchor'],'x':sm['anchor']['x']+L,'y':sm['anchor']['y']+T}
meta=dc['sourceMetadata']['appearance'];assert meta['padding']==padding and meta['selection']==sel and meta['sourcePixelsRescaled'] is False and meta['actionTimingUnchanged'] is True
ap=[(image(ab,p['file']),image(ab,p['maskFile'])) for p in am['pages']]
poses={p['frameId']:p for p in am['poses']};regs={f['frameId']:f for f in reg['frames']};output_frames={f['id']:f for f in dm['frames']}
prior=None;extra_neck={}
if row.get('referenceAppearanceBank'):
 prior_bytes=open(row['referenceAppearanceBank'],'rb').read();prior_bank=opened(io.BytesIO(prior_bytes));prior=json.loads(prior_bank.read('manifest.json'))
 prior_complete=opened(row['referenceCompletePack']);prior_config=json.loads(prior_complete.read('character.json'))
 assert prior_config['sourceMetadata']['wardrobe']['sourcePackSha256']==doc['sourceSha256'],'Source artwork changed'
 if row['view']=='original':
  assert prior_bytes==bank_bytes,'Approved original appearance bank changed'
  assert open(row['referenceCompletePack'],'rb').read()==open(row['pack'],'rb').read(),'Approved original CharacterPack changed'
 else:
  for key in ['sourceSha256','characterId','frameWidth','frameHeight','padding']:
   assert prior[key]==am[key],f'New hair changed {key}'
  prior_poses={p['frameId']:p for p in prior['poses']};assert set(prior_poses)==set(poses)
  assert prior['poses']==am['poses'],'Polish changed head/face/foreground pose metadata'
  for fid,p in poses.items():
   old=prior_poses[fid]
   for key in ['frameId','headBounds','facePolygon']:
    assert old[key]==p[key],f'Polish changed source head/face binding {fid}/{key}'
   # The last foreground entry is the previously reviewed explicit neck guard.
   # Hand-attribution revisions may change other entries, but may not erase it.
   assert old['foreground'][-1] in p['foreground'],f'Reviewed neck guard removed {fid}'
   extra_neck[fid]=[old['foreground'][-1]]
  prior_pages=[(image(prior_bank,p['file']),image(prior_bank,p['maskFile'])) for p in prior['pages']]
  old_faces={s['id']:s for s in prior['styles'] if s['slot']=='face'};new_faces={s['id']:s for s in am['styles'] if s['slot']=='face'}
  assert old_faces.keys()==new_faces.keys(),'Face styles changed'
  for sid,style in old_faces.items():
   new_style=new_faces[sid];assert len(style['layers'])==len(new_style['layers'])
   for layer,new_layer in zip(style['layers'],new_style['layers']):
    assert layer['role']==new_layer['role']=='face';new_frames={f['frameId']:f for f in new_layer['frames']}
    assert {f['frameId'] for f in layer['frames']}==set(new_frames)
    for f in layer['frames']:
     nf=new_frames[f['frameId']]
     assert {k:v for k,v in f.items() if k not in ['rect','page']}=={k:v for k,v in nf.items() if k not in ['rect','page']},f'Face binding changed {f["frameId"]}'
     if f['mode']=='paint':
      op,om=part(prior_pages,f);np_,nm=part(ap,nf)
      assert np.array_equal(op,np_) and np.array_equal(om,nm),f'Face source pixels changed {f["frameId"]}'
layers=[]
for style in am['styles']:
 if style['id'] in [sel['hairId'],sel['faceId']]:
  for layer in style['layers']:layers.append((layer['role'],{f['frameId']:f for f in layer['frames']}))
layers.sort(key=lambda x:['hair-back','face','hair-front'].index(x[0]))
assert set(poses)==set(regs)==set(output_frames)
garments={};selected={v for v in doc['selection'].values() if v}
for i,item in enumerate(doc['items']):
 raw=project.read('item-'+str(i)+'.zip');assert sha(raw)==item['sha256'];z=opened(io.BytesIO(raw));m=json.loads(z.read('manifest.json'))
 assert m['sourceSha256']==doc['sourceSha256'] and m['registrationSha256']==doc['registrationSha256']
 if m['id'] in selected:garments[m['slot']]=(m,{f['frameId']:f for f in m['frames']},[(image(z,p['file']),image(z,p['maskFile'])) for p in m['pages']])
assert {g[0]['id'] for g in garments.values()}==selected
factors=np.array({'chestnut':[1,1,1],'espresso':[.63,.65,.69],'copper':[1.2,1.05,.83]}[sel['hairColor']])
# Rebuild the previous clothing pixels from its actual, byte-verified saved pair.
old_pair=opened(row['referencePair']);old_project=opened(io.BytesIO(old_pair.read(row['view']+'.wardrobe.zip')))
old_doc=json.loads(old_project.read('document.json'));old_reg=json.loads(old_project.read('registration.json'))
assert old_project.read('source.character.zip')==source_bytes,'Original source bytes changed'
assert {k:v for k,v in old_reg.items() if k!='frames'}=={k:v for k,v in reg.items() if k!='frames'}
registration_changes=[];released_hand=np.zeros((sh,sw),bool)
head_review=None
if row['character']=='female' and row['view']=='side':
 head_review=json.load(open('artwork/paired-polish/female-head-review.json'))
 assert head_review['registrationSha256']==sha(reg_bytes) and head_review['bankSha256']==sha(bank_bytes)
for old_frame,new_frame in zip(old_reg['frames'],reg['frames']):
 if old_frame==new_frame:continue
 assert head_review and old_frame['frameId']==new_frame['frameId']==95,'Unexpected registration frame changed'
 assert {k:v for k,v in old_frame.items() if k!='protected'}=={k:v for k,v in new_frame.items() if k!='protected'},'Anchor/geometry changed'
 for old_guard,new_guard in zip(old_frame['protected'],new_frame['protected']):
  if old_guard==new_guard:continue
  assert old_guard['label']==new_guard['label']=='nearHand'
  approved=head_review['changedRegistration'][0]
  assert old_guard['polygon']==approved['before'] and new_guard['polygon']==approved['after']
  old_mask=polygon(old_guard['polygon'],sw,sh);new_mask=polygon(new_guard['polygon'],sw,sh)
  assert not np.any(new_mask&~old_mask),'Hand revision grew outside prior guard'
  released_hand=old_mask&~new_mask
  registration_changes.append({'frameId':95,'label':'nearHand','releasedPixels':int((old_mask&~new_mask).sum())})
assert len(registration_changes)==(1 if head_review else 0)
if row['view']=='side':
 new_styles={style['id']:style for style in am['styles']}
 for old_style in prior['styles']:
  if old_style['slot']!='hair':continue
  new_style=new_styles[old_style['id']]
  assert len(old_style['layers'])==len(new_style['layers'])
  for old_layer,new_layer in zip(old_style['layers'],new_style['layers']):
   assert old_layer['role']==new_layer['role']
   new_frames={f['frameId']:f for f in new_layer['frames']}
   for old_entry in old_layer['frames']:
    new_entry=new_frames[old_entry['frameId']]
    assert {k:v for k,v in old_entry.items() if k not in ['page','rect']}=={k:v for k,v in new_entry.items() if k not in ['page','rect']},'Hair offset/fallback changed'
    if old_entry['mode']!='paint':continue
    old_pixels,old_owned=part(prior_pages,old_entry);new_pixels,new_owned=part(ap,new_entry)
    delta=np.any(old_pixels!=new_pixels,axis=2)|(old_owned!=new_owned)
    if head_review and old_entry['frameId']==95:
     x,y=old_entry['offset']['x'],old_entry['offset']['y'];ph,pw=delta.shape
     assert not np.any(delta&~released_hand[y:y+ph,x:x+pw]),'Hair edit escaped corrected hand attribution'
    else:assert not delta.any(),'Unrelated hair artwork changed'
old_garments={};old_selected={v for v in old_doc['selection'].values() if v}
for i,item in enumerate(old_doc['items']):
 raw=old_project.read('item-'+str(i)+'.zip');assert sha(raw)==item['sha256'];z=opened(io.BytesIO(raw));m=json.loads(z.read('manifest.json'))
 if m['id'] in old_selected:old_garments[m['slot']]=(m,{f['frameId']:f for f in m['frames']},[(image(z,p['file']),image(z,p['maskFile'])) for p in m['pages']])
cloth_review={}
if row['view']=='side':
 cloth_audit=json.load(open('artwork/paired-polish/clothing/audit.json'))
 old_settings=json.loads(old_pair.read('manifest.json'))
 cloth_review=next(r for r in cloth_audit['results'] if r['character']==row['character'] and r['palette']==old_settings['selection']['paletteId'])
 cloth_review={r['frameId']:r for r in cloth_review['records']}
results=[];source_modes=[];clothing_changes=[];reviewed_hand_area=None
hand_review={}
if row['character']=='female' and row['view']=='original':
 review=json.load(open('artwork/dual-tailored/female/source/hand-foreground-v1.json'));assert review['sourceSha256']==doc['sourceSha256']
 hand_review={int(fid):[{'x':x,'y':y} for x,y in pts] for fid,pts in review['foregroundHand'].items()}
for sf in sm['frames']:
 fid=sf['id'];original=frame(sp,sf);dressed=original.copy();cloth_owned=np.zeros((sh,sw),bool)
 for slot in ['shoes','bottom','top','fullBody']:
  if slot not in garments:continue
  m,frames,pages=garments[slot];f=frames[fid];patch,owned=part(pages,f);o=f['offset'];rh,rw=owned.shape
  assert 0<=o['x']<=sw-rw and 0<=o['y']<=sh-rh
  region=np.s_[o['y']:o['y']+rh,o['x']:o['x']+rw]
  assert m['version']==1 and not m.get('handProtectionReviews') and not m.get('necklinePermissionProfile'),'This review expects the scoped V1 daily clothing banks'
  owned_native=np.zeros((sh,sw),bool);owned_native[region]=owned
  for protected in regs[fid]['protected']:
   guard=polygon(protected['polygon'],sw,sh)&(original[:,:,3]>0)
   assert not np.any(owned_native&guard),f'Clothing owns protected {protected["label"]} pixels {fid}'
  dressed[region][owned]=patch[owned];cloth_owned[region]|=owned
 assert np.array_equal(dressed,frame(cp,clothes_frames[fid])),f'Actual clothing-only baseline differs from saved garment pixels {fid}'
 old_dressed=original.copy()
 for slot in ['shoes','bottom','top','fullBody']:
  if slot not in old_garments:continue
  _,old_frames,old_pages=old_garments[slot];old_entry=old_frames[fid];old_patch,old_owned=part(old_pages,old_entry);old_offset=old_entry['offset'];old_h,old_w=old_owned.shape
  old_dressed[old_offset['y']:old_offset['y']+old_h,old_offset['x']:old_offset['x']+old_w][old_owned]=old_patch[old_owned]
 delta=np.any(dressed!=old_dressed,axis=2)
 if delta.any():
  assert fid in cloth_review,'Clothing changed outside reviewed frames'
  proof=cloth_review[fid];mask_bytes=open(proof['changedMask'],'rb').read()
  assert sha(mask_bytes)==proof['changedMaskSha256']
  approved_mask=np.array(Image.open(io.BytesIO(mask_bytes)).convert('RGBA'))[:,:,3]>0
  assert not np.any(delta&~approved_mask),'Clothing escaped the exact reviewed changed-pixel mask'
  yy,xx=np.where(delta);clothing_changes.append({'frameId':fid,'changedPixels':int(delta.sum()),'bounds':[int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)]})
 expected=np.zeros((h,w,4),np.uint8);native=np.s_[T:T+sh,L:L+sw];expected[native]=dressed
 original_pad=np.zeros((h,w,4),np.uint8);original_pad[native]=original
 dressed_pad=expected.copy();allowed=np.zeros((h,w),bool);allowed[native]=cloth_owned
 pose=poses[fid];foreground=np.zeros((h,w),bool)
 for p in pose['foreground']+[r['polygon'] for r in regs[fid]['protected'] if r['label']!='head']:foreground|=polygon(p,w,h,L,T)
 foreground&=original_pad[:,:,3]!=0
 hair_covered=np.zeros((h,w),bool);face_covered=np.zeros((h,w),bool);back_contribution=np.zeros((h,w),bool)
 for role,frames in layers:
  f=frames[fid]
  if f['mode']=='source':source_modes.append({'frameId':fid,'role':role,'reason':f['reason']});continue
  patch,owned=part(ap,f);o=f['offset'];rh,rw=owned.shape;x,y=o['x']+L,o['y']+T
  assert 0<=x<=w-rw and 0<=y<=h-rh
  region=np.s_[y:y+rh,x:x+rw];mask=np.zeros((h,w),bool);mask[region]=owned
  if role=='face':
   permitted=rectangle(pose['headBounds'],w,h,L,T)&polygon(pose['facePolygon'],w,h,L,T)&(original_pad[:,:,3]>0)&~foreground
   assert not np.any(mask&~permitted),f'Face escapes original inner-face area {fid}'
   assert np.array_equal(patch[:,:,3][owned],original_pad[region][:,:,3][owned]),f'Face alpha changes {fid}'
   expected[region][owned]=patch[owned];face_covered|=mask;allowed|=mask
  else:
   assert not np.any(mask&~rectangle(pose['hairBounds'],w,h,L,T)),f'Hair escapes bounds {fid}'
   if role=='hair-front':
    occlusion=rectangle(pose.get('hairOcclusionBounds',pose['headBounds']),w,h,L,T)
    mask&=~(foreground|(~occlusion&((original_pad[:,:,3]>0)|(dressed_pad[:,:,3]>0))))
   active=mask[region]&(patch[:,:,3]>0)
   dst=expected[region];back=role=='hair-back'
   if back:active&=dst[:,:,3]<255
   sa=patch[:,:,3][active].astype(float)/255;da=dst[:,:,3][active].astype(float)/255
   source_weight=sa*(1-da) if back else sa;dest_weight=da if back else da*(1-sa);alpha=source_weight+dest_weight
   rgb=np.minimum(255,np.floor(patch[:,:,:3][active].astype(float)*factors+.5))
   dst[:,:,:3][active]=np.floor((rgb*source_weight[:,None]+dst[:,:,:3][active]*dest_weight[:,None])/alpha[:,None]+.5).clip(0,255).astype(np.uint8)
   dst[:,:,3][active]=np.floor(alpha*255+.5).astype(np.uint8)
   actual_mask=np.zeros((h,w),bool);actual_mask[region]=active;hair_covered|=actual_mask;allowed|=actual_mask
   if back:back_contribution|=actual_mask
 actual=frame(dp,output_frames[fid]);assert np.array_equal(actual,expected),f'Independent raw-layer composite differs at native ID {fid}: '+str(np.any(actual!=expected,axis=2).sum())
 neck_pixels=0
 if fid in extra_neck:
  neck=np.zeros((h,w),bool)
  for p in extra_neck[fid]:neck|=polygon(p,w,h,L,T)
  neck&=(original_pad[:,:,3]==255)&(dressed_pad[:,:,3]==255);neck_pixels=int(neck.sum())
  assert np.array_equal(actual[neck],dressed_pad[neck]),f'Hair covers reviewed opaque neck/collar {fid}'
  if row['character']=='female' and fid==77:
   assert neck[T+505,L+304],'Known neckline defect escaped the explicit neck guard'
   assert np.array_equal(actual[T+505,L+304],dressed[505,304]),'Female native77 still has front hair over the neckline'
 changed=np.any(actual!=original_pad,axis=2);assert not np.any(changed&~allowed),f'Pixels outside authored ownership changed {fid}'
 preserved_foreground=foreground&~back_contribution
 assert np.array_equal(actual[preserved_foreground],dressed_pad[preserved_foreground]),f'Appearance changed foreground without declared back-hair contribution {fid}'
 assert np.array_equal(actual[foreground&(dressed_pad[:,:,3]==255)],dressed_pad[foreground&(dressed_pad[:,:,3]==255)]),f'Appearance changed opaque foreground {fid}'
 for r in regs[fid]['protected']:
  if r['label']=='head':continue
  guard=polygon(r['polygon'],w,h,L,T)&(original_pad[:,:,3]>0)
  exact=guard&~(back_contribution&(original_pad[:,:,3]<255))
  assert np.array_equal(actual[exact],original_pad[exact]),f'Protected source {r["label"]} changed without legitimate translucent back-hair blending {fid}'
 if head_review and fid==95:
  reviewed=polygon(head_review['reviewedNearHandPolygon'],w,h,L,T)&(original_pad[:,:,3]>0)
  prior_manifest=json.loads(prior_complete.read('manifest.json'));prior_frame=next(f for f in prior_manifest['frames'] if f['id']==fid)
  prior_sheet=([prior_manifest['spritesheet']]+prior_manifest.get('additionalSheets',[]))[prior_frame.get('page',0)]
  prior_image=image(prior_complete,prior_sheet['file']);pf=prior_frame
  prior_pixels=np.array(prior_image.crop((pf['x'],pf['y'],pf['x']+pf['width'],pf['y']+pf['height'])))
  # This broad review polygon also contains the already clothed wrist/sleeve.
  # Preserve its entire actual baseline, rather than calling all of it bare skin.
  assert np.array_equal(actual[reviewed],prior_pixels[reviewed]),'Reviewed hand/sleeve area regressed from actual accepted baseline'
  true_hand=reviewed&polygon(head_review['changedRegistration'][0]['after'],w,h,L,T)&(original_pad[:,:,3]==255)
  assert np.array_equal(actual[true_hand],original_pad[true_hand]),'Registered real opaque hand no longer equals source'
  previously_raw=reviewed&np.all(prior_pixels==original_pad,axis=2)
  assert np.array_equal(actual[previously_raw],original_pad[previously_raw]),'Previously untouched hand area changed'
  historical=reviewed&(original_pad[:,:,3]==255)&np.any(prior_pixels!=original_pad,axis=2)
  clothed=historical&np.all(prior_pixels==dressed_pad,axis=2)
  reviewed_hand_area={'frameId':95,'actualBaselineRgbaExact':True,'reviewedSourcePixels':int(reviewed.sum()),'registeredOpaqueHandPixelsExact':int(true_hand.sum()),'previouslyRawPixelsExact':int(previously_raw.sum()),'baselineAlreadyOccludedOpaquePixels':int(historical.sum()),'baselineClothingPixels':int(clothed.sum()),'baselineHairEdgePixels':int((historical&~clothed).sum()),'newChangesWithinBroadHandReview':0}
 reviewed_hand_pixels=0
 if fid in hand_review:
  guard=polygon(hand_review[fid],w,h,L,T)&(original_pad[:,:,3]>0);reviewed_hand_pixels=int(guard.sum())
  assert np.array_equal(actual[guard],original_pad[guard]),f'Reviewed native hand changed {fid}'
 if fid==row['baseline']['frameId']:
  assert np.array_equal(np.array(Image.open(row['baseline']['png']).convert('RGBA')),dressed),'Clothing-only UI baseline differs from saved raw garment layers'
 if fid==row['png']['frameId']:
  assert np.array_equal(np.array(Image.open(row['png']['right']).convert('RGBA')),actual),'UI PNG differs from exported pack'
  assert np.array_equal(np.array(Image.open(row['png']['left']).convert('RGBA')),actual[:,::-1]),'UI PNG is not exact native mirror'
 results.append({'frameId':fid,'changedPixels':int(changed.sum()),'clothOwnedPixels':int(cloth_owned.sum()),'hairCompositedPixels':int(hair_covered.sum()),'faceOwnedPixels':int(face_covered.sum()),'protectedForegroundPixels':int(foreground.sum()),'backHairBehindTranslucentForegroundPixels':int((foreground&back_contribution).sum()),'reviewedHandPixels':reviewed_hand_pixels,'reviewedNeckPixels':neck_pixels})
# Clothes are intentionally revised in this iteration. Record every changed frame
# against the old clothing-only control; the independent composition above still
# enforces the source-bound ownership and exact protected source pixels.
if row['view']=='original':assert not clothing_changes,'Approved original clothing changed'
gif_results=[]
for action,paths in row['gifs'].items():
 a=Image.open(paths['right']);b=Image.open(paths['left']) if paths.get('left') else None;palette=np.array(a.getpalette(),np.int32).reshape(-1,3);clip=dm['animations'][action]
 assert a.n_frames==len(clip['frames']);assert b is None or b.n_frames==a.n_frames;hashes=[]
 for position,fid in enumerate(clip['frames']):
  source=frame(dp,output_frames[fid]);h,w=source.shape[:2];assert w%2==h%2==0
  rgba=source.astype(float);alpha=rgba[:,:,3:4]/255;rgb=rgba[:,:,:3]*alpha+np.array([238,233,223])*(1-alpha)
  total=rgb[0::2,0::2]+rgb[0::2,1::2];total=total+rgb[1::2,0::2];total=total+rgb[1::2,1::2]
  compact=np.floor(total/4+.5).astype(np.int32);flat=compact.reshape(-1,3);keys=((flat[:,0]<<8)&0xf800)|((flat[:,1]<<2)&0x03e0)|(flat[:,2]>>3)
  _,first,inverse=np.unique(keys,return_index=True,return_inverse=True);colors=flat[first];nearest=np.empty(len(colors),np.int32)
  for start in range(0,len(colors),2048):
   delta=colors[start:start+2048,None,:]-palette[None,:,:];distance=np.sum(delta*delta,axis=2);nearest[start:start+2048]=len(palette)-1-np.argmin(distance[:,::-1],axis=1)
  expected=palette[nearest[inverse]].reshape(h//2,w//2,3).astype(np.uint8)
  a.seek(position);right=np.array(a.convert('RGB'))
  if b is not None:b.seek(position);left=np.array(b.convert('RGB'))
  assert np.array_equal(right,expected),f'GIF pixel/frame order differs {action}/{position}/{fid}'
  if b is not None:assert np.array_equal(left,right[:,::-1]),f'GIF mirror differs {action}/{position}'
  hashes.append(sha(right.tobytes()))
 gif_results.append({'action':action,'frames':len(hashes),'exactQuantizedPackPixelsAndOrder':True,'exactLeftMirror':b is not None,'frameRgbSha256':hashes})
print(json.dumps({'framesChecked':len(results),'nativeSourceSize':[sw,sh],'outputSize':[w,h],'padding':padding,'sourcePixelsRescaled':False,'exactSourceTiming':True,'exactIndependentLayerComposition':True,'exactOutsideOwnershipRgba':True,'appearancePreservesOpaqueForegroundRgba':True,'translucentForegroundUsesExactDestinationOverOnly':True,'sourceOpaqueProtectedHandsExact':True,'exactNativePngAndMirror':True,'sourceModeAppearanceFrames':source_modes,'clothingChangesVersusBaseline':clothing_changes,'registrationChanges':registration_changes,'reviewedHandArea':reviewed_hand_area,'hairChangesConfinedToReviewedHandMask':True,'priorAppearance':None if prior is None else {'bankSha256':sha(prior_bytes),'originalBankAndPackByteExact':row['view']=='original','sourcePackUnchanged':True,'sideFacePixelsAndBindingsExact':row['view']=='side','sideNeckForegroundFrames':len(extra_neck),'female77KnownNeckPixelRestored':row['character']=='female' and row['view']=='side'},'frames':results,'gifs':gif_results}))
`;

const report = {
  format: "gathria-paired-polish-export-audit",
  version: 1,
  passed: false,
  results: [],
};
for (const row of rows) {
  const nativeBytes = await readFile(row.project),
    native = unzipSync(nativeBytes),
    document = json(native["document.json"]);
  const matches = catalogs.flatMap((catalog) =>
    catalog.representations
      .filter(
        (r) =>
          r.character === row.character &&
          r.view === row.view &&
          r.bankSha256 === sha(native["appearance.zip"]) &&
          r.sourceSha256 === document.sourceSha256 &&
          r.registrationSha256 === document.registrationSha256,
      )
      .map((spec) => ({ spec, path: catalog.path })),
  );
  assert(
    matches.length,
    "Missing catalog row bound to this exact appearance archive",
  );
  const spec = matches[0].spec;
  for (const match of matches)
    for (const key of [
      "hairId",
      "faceId",
      "frameCount",
      "frameWidth",
      "frameHeight",
      "padding",
    ])
      assert.deepEqual(
        match.spec[key],
        spec[key],
        `Ambiguous catalog binding: ${key}`,
      );
  const packBytes = await readFile(row.pack),
    pack = unzipSync(packBytes),
    manifest = json(pack["manifest.json"]);
  assert.equal(document.sourceSha256, spec.sourceSha256);
  assert.equal(document.registrationSha256, spec.registrationSha256);
  assert.equal(sha(native["appearance.zip"]), spec.bankSha256);
  assert.deepEqual(document.appearance, {
    bankSha256: spec.bankSha256,
    hairId: spec.hairId,
    faceId: spec.faceId,
    hairColor: "chestnut",
  });
  assert.equal(manifest.frames.length, spec.frameCount);
  const gifs = [];
  for (const [action, paths] of Object.entries(row.gifs)) {
    const clip = manifest.animations[action];
    assert(clip);
    for (const facing of ["right", "left"].filter((f) => paths[f])) {
      const bytes = await readFile(paths[facing]),
        parsed = parseGIF(new Uint8Array(bytes).buffer),
        frames = decompressFrames(parsed, true);
      assert.deepEqual(
        [parsed.lsd.width, parsed.lsd.height],
        [
          manifest.spritesheet.frameWidth / 2,
          manifest.spritesheet.frameHeight / 2,
        ],
      );
      assert.equal(frames.length, clip.frames.length);
      const delays = clip.frames.map(
        (_, i) =>
          (Math.round(((i + 1) * 100) / clip.fps) -
            Math.round((i * 100) / clip.fps)) *
          10,
      );
      assert.deepEqual(
        frames.map((f) => f.delay),
        delays,
      );
      assert.equal(bytes.includes(Buffer.from("NETSCAPE2.0")), clip.loop);
      gifs.push({
        action,
        facing,
        frames: frames.length,
        delaysMs: delays,
        sha256: sha(bytes),
      });
    }
  }
  const pixels = JSON.parse(
    execFileSync("python", ["-c", independentlyDecode, JSON.stringify(row)], {
      encoding: "utf8",
      timeout: 300_000,
      maxBuffer: 8 * 1024 * 1024,
    }),
  );
  report.results.push({
    character: row.character,
    view: row.view,
    sourceSha256: spec.sourceSha256,
    registrationSha256: spec.registrationSha256,
    appearanceSha256: spec.bankSha256,
    matchedCatalogs: matches.map((match) => match.path),
    projectSha256: sha(nativeBytes),
    packSha256: sha(packBytes),
    ...pixels,
    gifFiles: gifs,
  });
}
report.passed = true;
const output = resolve(dirname(input), "pixel-verification.json");
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
process.stdout.write(
  JSON.stringify({
    passed: true,
    views: rows.length,
    frames: report.results.reduce((n, r) => n + r.framesChecked, 0),
    gifs: report.results.reduce((n, r) => n + r.gifFiles.length, 0),
    output,
  }) + "\n",
);
