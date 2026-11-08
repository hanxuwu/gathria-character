#!/usr/bin/env python3
"""Read-only historical contour regression plus current coverage revision guards.

Historical archive pins and contour assertions remain unchanged. Reviewed older
banks are read from an immutable merged ancestor when later coverage repairs
change their served paths. CI fetches history explicitly. --write-report is the
only mode that writes evidence; no mode modifies any character/garment asset.
"""
import importlib.util,json,zipfile,io,hashlib,subprocess,copy,argparse,tempfile,atexit
from pathlib import Path
import numpy as np
from PIL import Image
from kling_wardrobe_common import ROOT,load_source,protected_mask
sha=lambda b:hashlib.sha256(b).hexdigest()
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--write-report',action='store_true')
args=parser.parse_args()
HISTORICAL_REVISION='5d63ae233ca83e61dc354e122a8708044f4e2653'
report={'historicalRevision':HISTORICAL_REVISION,'oldArchives':[],'sourceFiles':[],'garments':[],'currentCoverageBindings':[],'currentCandidateCoverage':[]}
workspace=tempfile.TemporaryDirectory(prefix='gathria-contour-history-')
atexit.register(workspace.cleanup)
coverage=json.loads((ROOT/'docs/wardrobe-coverage/preservation.json').read_text())
coverage_changes={item['path']:item for item in coverage['changes']}
inventory=json.loads((ROOT/'docs/wardrobe-coverage/inventory.json').read_text())
active_assets={item['path']:item for item in inventory['assets']}
def historical_bytes(file):
 return subprocess.check_output(['git','show',f'{HISTORICAL_REVISION}:{file}'],cwd=ROOT)
def historical_path(file):
 path=Path(workspace.name)/file;path.parent.mkdir(parents=True,exist_ok=True)
 if not path.exists():path.write_bytes(historical_bytes(file))
 return path
def check_current_revision(file,historical):
 current=(ROOT/file).read_bytes()
 if sha(current)==sha(historical):return
 change=coverage_changes[file];assert change['beforeSha256']==sha(historical),(file,'coverage baseline drift')
 assert change['sha256']==sha(current)==active_assets[file]['sha256'],(file,'current coverage/catalog inventory drift')
 with zipfile.ZipFile(io.BytesIO(historical)) as oldzip,zipfile.ZipFile(io.BytesIO(current)) as newzip:
  before=json.loads(oldzip.read('manifest.json'));after=json.loads(newzip.read('manifest.json'))
  for key in ['id','name','slot','characterId','sourceSha256','registrationSha256','frameWidth','frameHeight']:
   assert before[key]==after[key],(file,key,'source binding or identity changed')
  assert sorted(f['frameId'] for f in before['frames'])==sorted(f['frameId'] for f in after['frames']),(file,'motion frame IDs changed')
 report['currentCoverageBindings'].append({'file':file,'historicalSha256':sha(historical),'servedSha256':sha(current),'sourceBindingAndNativeFrameIdsExact':True})
def check_male_current_coverage(file,baseline_path,baseline_manifest,prior_frames,source_frames,rows):
 review_bytes=(ROOT/'artwork/kling-coverage/male-original-hand-cloth-review.json').read_bytes()
 assert sha(review_bytes)=='a25ba3055a53c5833f91aef7700bc4f16552866a71ad5e4ef072609f3f15a3a4','Approved source cloth review changed'
 review=json.loads(review_bytes);item=next(i for i in review['items'] if i['id']==baseline_manifest['id'])
 assert item['baselineSha256']==sha(baseline_path.read_bytes()) and item['url']=='/'+file
 assert review['sourceSha256']==baseline_manifest['sourceSha256']
 corrections={r['frameId']:r for r in review['frames']}
 assert [(r['frameId'],r['clothPixelCount']) for r in review['frames']]==[(106,38),(107,55),(108,35),(109,106),(110,71)]
 with zipfile.ZipFile(ROOT/file) as archive:current_manifest=json.loads(archive.read('manifest.json'))
 expected=copy.deepcopy(baseline_manifest);reviews=expected.get('handProtectionReviews',[])
 for correction in review['frames']:
  reviews=[r for r in reviews if (r['frameId'],r['label'])!=(correction['frameId'],correction['label'])]
  reviews.append({k:correction[k] for k in ('frameId','label','polygon','reason')})
 expected['version']=max(2,expected['version']);expected['handProtectionReviews']=sorted(reviews,key=lambda r:(r['frameId'],r['label']))
 assert current_manifest==expected,'Unreviewed male contour candidate metadata changed'
 current=reader.read_bank(ROOT/file);assert set(current)==set(prior_frames)==set(source_frames)
 checks=[]
 for fid,(prior,prior_owned) in prior_frames.items():
  after,owned=current[fid];allowed=np.zeros(prior_owned.shape,bool);correction=corrections.get(fid)
  if correction:
   for run in correction['clothRuns']:allowed[run['y'],run['x0']:run['x1']+1]=True
   assert int(allowed.sum())==correction['clothPixelCount']
   assert sha(source_frames[fid][allowed].tobytes())==correction['sourceClothSha256']
   hand=next(r for r in rows[fid]['protected'] if r['label']==correction['label'])
   old_hand=protected_mask({'protected':[hand]});new_hand=protected_mask({'protected':[correction]})
   other=protected_mask({'protected':[r for r in rows[fid]['protected'] if r['label']!=correction['label']]})
   assert not (new_hand&~old_hand).any() and not (new_hand&allowed).any()
   assert not (allowed&~old_hand).any() and not (allowed&other).any()
  assert not (prior_owned&allowed).any()
  assert np.array_equal(owned,prior_owned|allowed),(fid,'ownership outside frozen cloth runs changed')
  assert np.array_equal(after[~allowed],prior[~allowed]),(fid,'artwork outside frozen cloth runs changed')
  before_composed=source_frames[fid].copy();before_composed[prior_owned]=prior[prior_owned]
  after_composed=source_frames[fid].copy();after_composed[owned]=after[owned]
  assert np.array_equal(before_composed[:,:,3],after_composed[:,:,3]),(fid,'body alpha changed')
  assert np.array_equal(np.any(before_composed!=after_composed,axis=2),allowed),(fid,'changed pixels differ from approved cloth')
  if correction:checks.append({'frameId':fid,'clothPixels':int(allowed.sum()),'outsideClothExact':True,'bodyAlphaExact':True})
 assert sum(c['clothPixels'] for c in checks)==305
 return {'itemId':baseline_manifest['id'],'decodedFrames':len(current),'changedFrames':checks,'changedClothPixels':305,'historicalSha256':sha(baseline_path.read_bytes()),'servedSha256':sha((ROOT/file).read_bytes())}

baseline=json.loads((ROOT/'docs/kling-contour-review/baseline.json').read_text())
for file,digest in baseline['files'].items():
 current=(ROOT/file).read_bytes();frozen=current if sha(current)==digest else historical_bytes(file)
 assert sha(frozen)==digest,file;report['oldArchives'].append({'file':file,'sha256':digest})
 check_current_revision(file,frozen)
for file in ['docs/kling-motion/exports/male.character.zip','docs/kling-motion/exports/female.character.zip','docs/kling-wardrobe/registration/male-full-outfits-v1.json','docs/kling-wardrobe/registration/female.json']:
 data=(ROOT/file).read_bytes();assert sha(data)==baseline['sourceFiles'][file],file;report['sourceFiles'].append({'file':file,'sha256':sha(data)})
spec=importlib.util.spec_from_file_location('reader',ROOT/'scripts/prepare-kling-male-fit-polish.py');reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
for character,prefix,before,after in [('male','navy-suit-jacket',5,6),('female','coral-daydress',7,8),('female','ivory-wedding-dress',7,8)]:
 relative=f'docs/kling-wardrobe/garments/{character}/{prefix}-v{after}.zip'
 path=historical_path(relative);oldpath=historical_path(f'docs/kling-wardrobe/garments/{character}/{prefix}-v{before}.zip')
 check_current_revision(relative,path.read_bytes())
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
  if character=='female':assert np.array_equal(patch[protected],prior[protected]),(character,fid,'protected pixels')
  if character=='female':
   assert not ((own&~oldown)&(frames[fid][:,:,3]>0)).any(),(fid,'new body ownership')
   if fid not in [*range(83,90),*range(102,110)]:assert not changed.any(),fid
  else:
   if fid!=56:assert not changed.any(),fid
   assert np.array_equal(patch[own,3],frames[fid][own,3]),fid
   assert not (own&~oldown).any(),(fid,'male ownership grows')
  assert not (patch[~own,3]>0).any()
  checks.append({'frameId':fid,'changedPixels':int(changed.sum()),'protectedChanges':0})
 assert any(c['changedPixels'] for c in checks)
 report['garments'].append({'file':relative,'sha256':sha(path.read_bytes()),'frames':len(checks),'changedFrames':[c for c in checks if c['changedPixels']],'sourceAndRegistrationExact':True,'protectedHeadAndReviewedHandsExact':True,'bodyAlphaExact':character=='male','clothingOnlyContourChange':character=='female'})
 if character=='male':report['currentCandidateCoverage'].append(check_male_current_coverage(relative,path,manifest,new,frames,rows))
 del old,new,frames
 if character=='female':
  spec=importlib.util.spec_from_file_location('female_coverage_guard',ROOT/'scripts/verify-kling-female-repair.py');female=importlib.util.module_from_spec(spec);spec.loader.exec_module(female)
  report['currentCandidateCoverage'].append(female.verify_current_coverage_pair(f'{prefix}-v{after}',path,ROOT/relative))
report['passed']=True
if args.write_report:(ROOT/'docs/kling-contour-review/asset-checks.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:len(v) for k,v in report.items() if isinstance(v,list)}))
