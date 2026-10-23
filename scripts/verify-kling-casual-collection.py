#!/usr/bin/env python3
"""Decode every new clothing bank and verify source ownership + legacy hashes."""
import io,json,zipfile,importlib.util
from pathlib import Path
import numpy as np
from PIL import Image
from kling_wardrobe_common import ROOT,load_source,protected_mask,sha
from kling_male_limb_ownership import MaleLimbOwnership
DEST=ROOT/'docs/kling-wardrobe/casual-collection'
S=ROOT/'artwork/kling-wardrobe/source/casual-collection-v1'
defs=json.loads((S/'donors.json').read_text())
baseline=json.loads((DEST/'baseline-hashes.json').read_text())
for p,h in baseline['files'].items():assert sha((ROOT/p).read_bytes())==h,(p,'legacy bytes changed')
spec=importlib.util.spec_from_file_location('bank_reader',ROOT/'scripts/prepare-kling-male-fit-polish.py');reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
report={'format':'gathria-casual-clothing-audit','version':1,'baseline':baseline['commit'],'legacyFilesUnchanged':len(baseline['files']),'donorSha256':sha((S/'designs.png').read_bytes()),'definitionsSha256':sha((S/'donors.json').read_bytes()),'items':[],'projectBudgets':[]}
catalog=json.loads((ROOT/'docs/kling-wardrobe/catalog.json').read_text())
for char in ['male','female']:
 source,sm,config,frames=load_source(char)
 if char=='male':author=MaleLimbOwnership();reg=author.registration;regbytes=author.registration_bytes
 else:
  kit=zipfile.ZipFile(ROOT/'docs/kling-wardrobe/templates/female.wardrobe-template.zip');regbytes=kit.read('registration.json');reg=json.loads(regbytes)
 records={r['frameId']:r for r in reg['frames']}
 for item,d in defs.items():
  if d['character']!=char:continue
  path=ROOT/f'docs/kling-wardrobe/garments/{char}/{item}.zip';bank=reader.read_bank(path);assert set(bank)==set(frames)
  with zipfile.ZipFile(path)as z:
   assert z.testzip()is None;manifest=json.loads(z.read('manifest.json'))
   assert manifest['sourceSha256']==sha(source) and manifest['registrationSha256']==sha(regbytes)
   assert manifest['id']==item and manifest['slot']==d['slot']
   pixels=0
   for page in manifest['pages']:
    rgba=Image.open(io.BytesIO(z.read(page['file'])));rgba.load();mask=Image.open(io.BytesIO(z.read(page['maskFile'])));mask.load()
    assert rgba.mode==mask.mode=='RGBA' and rgba.size==mask.size
    assert set(np.unique(np.asarray(mask)[:,:,3]))<={0,255}
    pixels+=rgba.width*rgba.height
   assert pixels<=32*1024*1024 and len(manifest['pages'])<=4
  checks=[]
  for fid,(patch,owned)in bank.items():
   original=frames[fid];rec=records[fid]
   if char=='male':
    masks=author.semantic(fid);limbs=author.for_frame(fid,original)
    protected=protected_mask(rec)|masks['head']|masks['nearHand']|masks['farHand']|masks['shoes']|limbs['neckSkin'];cloth=masks['tank']
    assert np.array_equal(patch[owned,3],original[owned,3])
   else:
    names=['head','nearHand','farHand','tank','shorts']
    masks={n:np.asarray(Image.open(io.BytesIO(kit.read(f'masks/{fid:03}/{n}.png'))))>0 for n in names}
    protected=(protected_mask(rec)&(original[:,:,3]>0))|masks['head']|masks['nearHand']|masks['farHand'];cloth=masks['tank']|masks['shorts']
   assert not(owned&protected).any(),(item,fid,'protected')
   assert not(patch[~owned]!=0).any(),(item,fid,'unowned RGBA')
   assert not(cloth&owned&(patch[:,:,3]==0)).any(),(item,fid,'uncovered cloth')
   assert not owned[0].any() and not owned[-1].any() and not owned[:,0].any() and not owned[:,-1].any()
   checks.append({'frameId':fid,'protectedOverlapPixels':0,'uncoveredClothPixels':0,'rgbaSha256':sha(patch.tobytes()),'ownershipSha256':sha(owned.tobytes())})
  report['items'].append({'id':item,'file':str(path.relative_to(ROOT)),'sha256':sha(path.read_bytes()),'bytes':path.stat().st_size,'pages':len(manifest['pages']),'pagePixels':pixels,'frames':checks})
  print(f'{item}: {len(checks)} decoded/checked poses',flush=True)
 entry=next(c for c in catalog['characters']if c['key']==char)
 paths=[entry['sourceUrl'],entry['registrationUrl'],entry['appearanceBankUrl'],*[i['url']for i in entry['items']]]
 raw=sum((ROOT/p.lstrip('/')).stat().st_size for p in paths)
 # ZIP overhead and project JSON reserve; actual saved exports also validated in browser.
 reserve=2*1024*1024;limit=128*1024*1024
 assert len(entry['items'])<=16 and raw+reserve<limit
 report['projectBudgets'].append({'character':char,'items':len(entry['items']),'completeInventoryRawBytes':raw,'metadataAndZipReserveBytes':reserve,'limitBytes':limit,'remainingAfterReserveBytes':limit-raw-reserve})
report['checkedPoses']=sum(len(i['frames'])for i in report['items']);report['passed']=True
(DEST/'asset-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'passed':True,'poses':report['checkedPoses'],'legacyFilesUnchanged':report['legacyFilesUnchanged'],'budgets':report['projectBudgets']}))
