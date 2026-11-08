#!/usr/bin/env python3
"""Read-only native-pixel proof of the later coverage layer over paired polish.

Historical seam/hair reproduction stays in assemble-paired-polish-catalog.mjs.
This check neither regenerates nor updates archives, catalogs or audit receipts.
"""
import hashlib,io,json,subprocess,zipfile
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
BASE='5d63ae233ca83e61dc354e122a8708044f4e2653'
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda p:(ROOT/p.lstrip('/')).read_bytes()
load=lambda p:json.loads(read(p))
side=load('artwork/wardrobe-coverage/side/recipe.json')
assert side['baselineCommit']==BASE
side={i['path']:i for i in side['items']}
male=load('artwork/kling-coverage/male-original-hand-cloth-review.json')
male_items={i['url'].lstrip('/'):i for i in male['items']}
female={i['url'].lstrip('/'):i for i in load('docs/wardrobe-coverage/original-female/repair-report.json')}
paths={}
for catalog in ['dual-tailored','dual-looks-cloth','paired-polish']:
 for row in load(f'docs/{catalog}/assets/catalog.json')['representations']:
  for item in row['items']:
   path=item['url'].lstrip('/')
   if path in side or path in male_items or path in female:paths[path]=row

def opened(data):
 with zipfile.ZipFile(io.BytesIO(data)) as z:
  assert z.testzip() is None
  m=json.loads(z.read('manifest.json'))
  pages=[np.array(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA')) for p in m['pages']]
  masks=[np.array(Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA'))[:,:,3] for p in m['pages']]
 return m,pages,masks

def native(m,pages,masks,f):
 r,o=f['rect'],f['offset'];crop=np.s_[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']];dest=np.s_[o['y']:o['y']+r['height'],o['x']:o['x']+r['width']]
 rgba=np.zeros((m['frameHeight'],m['frameWidth'],4),np.uint8);own=np.zeros(rgba.shape[:2],np.uint8)
 rgba[dest]=pages[f['page']][crop];own[dest]=masks[f['page']][crop]
 assert np.isin(own,[0,255]).all() and not rgba[own==0].any()
 return rgba,own==255

source_key=None;source_frames={}
def sources(path,expected):
 global source_key,source_frames
 if path==source_key:return source_frames
 data=read(path);assert sha(data)==expected
 with zipfile.ZipFile(io.BytesIO(data)) as z:
  m=json.loads(z.read('manifest.json'));pages=[np.array(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA')) for p in [m['spritesheet'],*m.get('additionalSheets',[])]]
  source_frames={f['id']:pages[f.get('page',0)][f['y']:f['y']+f['height'],f['x']:f['x']+f['width']].copy() for f in m['frames']}
 source_key=path;return source_frames

checked=0
for path,row in sorted(paths.items(),key=lambda kv:(kv[1]['sourceUrl'],kv[0])):
 raw=subprocess.check_output(['git','show',BASE+':'+path],cwd=ROOT)
 old,op,om=opened(raw);new,npages,nmasks=opened(read(path))
 assert set(old)-{'pages','frames','provenance','version','handProtectionReviews','necklinePermissionProfile'}==set(new)-{'pages','frames','provenance','version','handProtectionReviews','necklinePermissionProfile'}
 for key in old:
  if key not in {'pages','frames','provenance','version','handProtectionReviews','necklinePermissionProfile'}:assert old[key]==new[key],(path,key)
 assert [f['frameId'] for f in old['frames']]==[f['frameId'] for f in new['frames']],path
 # The later layer may not silently change review semantics or grants while
 # preserving the visible samples. Match exact per-item frozen permissions.
 if path in side:
  expected=side[path]
  assert new.get('handProtectionReviews',[])==expected['handProtectionReviews']
  assert new.get('necklinePermissionProfile')==expected.get('necklinePermissionProfile')
  assert new['version']==(3 if expected.get('necklinePermissionProfile') else 2 if expected['handProtectionReviews'] else old['version'])
 elif path in male_items:
  expected={(r['frameId'],r['label']):r for r in old.get('handProtectionReviews',[])}
  for r in male['frames']:expected[(r['frameId'],r['label'])]={k:r[k] for k in ('frameId','label','polygon','reason')}
  assert new.get('handProtectionReviews',[])==sorted(expected.values(),key=lambda r:(r['frameId'],r['label']))
  assert new.get('necklinePermissionProfile')==old.get('necklinePermissionProfile')
  assert new['version']==max(2,old['version'])
 else:
  expected=female[path]
  assert new.get('handProtectionReviews',[])==old.get('handProtectionReviews',[])
  assert new.get('necklinePermissionProfile')==expected.get('necklinePermission')
  assert new['version']==(3 if expected.get('necklinePermission') else 2 if old.get('handProtectionReviews') else 1)
 source=sources(row['sourceUrl'],row['sourceSha256'])
 if path in side:
  review=side[path];assert sha(raw)==review['baselineSha256'];edits={e['frameId']:e for e in review['frames']}
 elif path in male_items:
  assert sha(raw)==male_items[path]['baselineSha256'];edits={e['frameId']:e for e in male['frames']}
 else:
  review=female[path];assert sha(raw)==review['beforeSha256'];edits={e['frameId']:e for e in review['changedFrames']}
 for f,g in zip(old['frames'],new['frames']):
  fid=f['frameId'];p,own=native(old,op,om,f);q,nown=native(new,npages,nmasks,g);src=source[fid]
  before=src.copy();before[own]=p[own];after=src.copy();after[nown]=q[nown]
  edit=edits.get(fid);allowed=np.zeros(own.shape,bool);release=np.zeros_like(own)
  if edit is None:
   assert np.array_equal(p,q) and np.array_equal(own,nown),(path,fid,'unexpected frame change')
  elif path in side:
   assert sha(src.tobytes())==edit['sourceRgbaSha256']
   expected=p.copy();expected_owned=own.copy()
   for x,y,sx,sy in edit['copyPixels']:
    assert 0<=x<old['frameWidth'] and 0<=y<old['frameHeight'] and 0<=sx<old['frameWidth'] and 0<=sy<old['frameHeight']
    assert not allowed[y,x] and not own[y,x] and own[sy,sx]
    allowed[y,x]=True;expected[y,x,:3]=p[sy,sx,:3];expected[y,x,3]=src[y,x,3];expected_owned[y,x]=True
   for x,y in edit.get('releasePixels',[]):
    assert not allowed[y,x] and not release[y,x] and own[y,x]
    release[y,x]=True;expected[y,x]=0;expected_owned[y,x]=False
   assert np.array_equal(q,expected) and np.array_equal(nown,expected_owned),(path,fid,'copy map mismatch')
  elif path in male_items:
   for run in edit['clothRuns']:allowed[run['y'],run['x0']:run['x1']+1]=True
   assert int(allowed.sum())==edit['clothPixelCount'] and sha(src[allowed].tobytes())==edit['sourceClothSha256']
   assert not (allowed&own).any() and np.array_equal(nown,own|allowed)
   assert np.array_equal(p[~allowed],q[~allowed]) and np.array_equal(src[allowed,3],q[allowed,3]),(path,fid)
  else:
   allowed=nown&~own
   assert not (own&~nown).any()
   assert sha(allowed.tobytes())==edit['maskSha256'] and int(allowed.sum())==edit['addedPixels'],(path,fid,'unreviewed ownership')
   assert sha(before.tobytes())==edit['beforeRgbaSha256'] and sha(after.tobytes())==edit['afterRgbaSha256']
   assert np.array_equal(p[~allowed],q[~allowed]) and np.array_equal(src[allowed,3],q[allowed,3]),(path,fid)
  assert np.array_equal(before[~(allowed|release)],after[~(allowed|release)]),(path,fid,'changed outside reviewed pixels')
  checked+=1
 print(new['id'],len(new['frames']),'native frames: exact scoped coverage layer',flush=True)
print(f'Verified {len(paths)} paired coverage garments / {checked} native frames; archives and historical audits were read-only.')
