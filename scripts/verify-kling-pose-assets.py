#!/usr/bin/env python3
"""Asset invariants for this batch, independent of browser/export evidence."""
import importlib.util,json,zipfile,io,hashlib,subprocess,copy
import numpy as np
from PIL import Image
from kling_wardrobe_common import ROOT,load_source,protected_mask
sha=lambda b:hashlib.sha256(b).hexdigest()
report={'oldArchives':[],'sourceFiles':[],'garments':[]}
baseline=json.loads((ROOT/'docs/kling-pose-review/baseline.json').read_text())
for file,digest in baseline['archives'].items():
 assert sha((ROOT/file).read_bytes())==digest,file;report['oldArchives'].append({'file':file,'sha256':digest})
for file in ['docs/kling-motion/exports/male.character.zip','docs/kling-motion/exports/female.character.zip','docs/kling-wardrobe/registration/male-full-outfits-v1.json','docs/kling-wardrobe/registration/female.json']:
 data=(ROOT/file).read_bytes();old=subprocess.check_output(['git','show',baseline['commit']+':'+file],cwd=ROOT);assert data==old,file;report['sourceFiles'].append({'file':file,'sha256':sha(data)})
spec=importlib.util.spec_from_file_location('reader',ROOT/'scripts/prepare-kling-male-fit-polish.py');reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
for character,prefix,before,after in [('male','navy-suit-jacket',4,5),('female','coral-daydress',6,7),('female','ivory-wedding-dress',6,7)]:
 path=ROOT/f'docs/kling-wardrobe/garments/{character}/{prefix}-v{after}.zip';oldpath=path.with_name(f'{prefix}-v{before}.zip')
 old=reader.read_bank(oldpath);new=reader.read_bank(path);source,sm,_,frames=load_source(character)
 regfile=ROOT/f'docs/kling-wardrobe/registration/{"male-full-outfits-v1" if character=="male" else "female"}.json';regbytes=regfile.read_bytes();rows={f['frameId']:f for f in json.loads(regbytes)['frames']}
 with zipfile.ZipFile(path) as z:
  assert z.testzip() is None;manifest=json.loads(z.read('manifest.json'))
  for n in z.namelist():
   if n.endswith('.png'):
    im=Image.open(io.BytesIO(z.read(n)));im.load();assert im.mode=='RGBA'
 assert manifest['sourceSha256']==sha(source) and manifest['registrationSha256']==sha(regbytes)
 assert set(new)==set(old)==set(frames);checks=[]
 for fid,(patch,own) in new.items():
  prior,oldown=old[fid];row=copy.deepcopy(rows[fid]);changed=np.any(patch!=prior,axis=2)|(own!=oldown)
  for review in manifest.get('handProtectionReviews',[]):
   if review['frameId']==fid:
    region=next(r for r in row['protected'] if r['label']==review['label']);newmask=protected_mask({'protected':[review]});oldmask=protected_mask({'protected':[region]});assert newmask.any() and not (newmask&~oldmask).any();region['polygon']=review['polygon']
  protected=protected_mask(row)&(frames[fid][:,:,3]>0)
  assert not (own&protected).any(),(character,fid,'protected ownership')
  assert np.array_equal(patch[protected],prior[protected]),(character,fid,'protected pixels')
  if character=='female':
   assert np.array_equal(own,oldown) and np.array_equal(patch[:,:,3],prior[:,:,3]),fid
  else:
   if fid!=56:assert not changed.any(),fid
   assert np.array_equal(patch[own,3],frames[fid][own,3]),fid
  assert not (patch[~own,3]>0).any()
  checks.append({'frameId':fid,'changedPixels':int(changed.sum()),'protectedChanges':0})
 assert any(c['changedPixels'] for c in checks)
 report['garments'].append({'file':str(path.relative_to(ROOT)),'sha256':sha(path.read_bytes()),'frames':len(checks),'changedFrames':[c for c in checks if c['changedPixels']],'sourceAndRegistrationExact':True,'protectedHeadAndReviewedHandsExact':True,'alphaAndOwnershipExact':character=='female'})
 del old,new,frames
report['passed']=True;(ROOT/'docs/kling-pose-review/asset-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:len(v) for k,v in report.items() if isinstance(v,list)}))
