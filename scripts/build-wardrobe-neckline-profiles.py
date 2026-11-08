#!/usr/bin/env python3
"""Reproduce three immutable source-bound CLOTH permission maps.

This does not change artwork or shared protection. The side pixel candidates
were visually inspected in native source crops. Only the interior of the
source-bound top-material guide, excluding skin and its one-pixel boundary,
may be released. Exact registered head/hand intersections are checked below.
"""
from pathlib import Path
import argparse, copy, hashlib, json, sys
import numpy as np
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from kling_side_authoring import load_context, runtime_polygon_mask

OUT = ROOT / 'artwork/wardrobe-coverage'
OLD = ROOT / 'artwork/kling-mask-workbench/female-neckline-cloth-v1.json'
OLD_SHA = '9a24590ab1434480c822a577379de7d92479ee1871e44e11d688ab9ef1d5185c'
SIDE_FRAMES = [58,59,60,61,62,70,71,72,73,74,75,76,77,79,85,86,92,93,94,95,96]
BINDINGS = [
 ('female-side-tailored-neckline-cloth-v1', 'artwork/kling-side-expansion/templates/female.registration.json', '7f49437c617e01141622e1ca3d463347edf51adce068a344c01d545e58567cef'),
 ('female-side-polished-neckline-cloth-v1', 'artwork/paired-polish/female-side.registration.json', '82ea84d396c406163b822f4ac393160de268599c4c9d0a758b0686c6da5a7942'),
]

def sha(data): return hashlib.sha256(data).hexdigest()
def encoded(value): return (json.dumps(value, indent=2) + '\n').encode()
def runs(mask):
 result=[]
 for y in np.flatnonzero(mask.any(axis=1)):
  xs=np.flatnonzero(mask[y]); starts=np.r_[0,np.flatnonzero(np.diff(xs)>1)+1]; ends=np.r_[starts[1:]-1,len(xs)-1]
  result.extend({'y':int(y),'x0':int(xs[a]),'x1':int(xs[b])} for a,b in zip(starts,ends))
 return result

def build():
 assert sha(OLD.read_bytes()) == OLD_SHA
 old=json.loads(OLD.read_text())
 original_path=ROOT/'docs/dual-tailored/assets/female/original-tailored-v1.registration.json'
 original_bytes=original_path.read_bytes(); original=json.loads(original_bytes)
 assert sha(original_bytes)=='4d02f18a0a624fd3629cf2853d6c96e28d9cd554b28215a9b694aa56c55c9c21'
 baseline=json.loads((ROOT/'docs/kling-wardrobe/registration/female.json').read_text())
 assert original['sourceSha256']==old['sourceSha256']==baseline['sourceSha256']
 for frame in old['frames']:
  a=next(f for f in baseline['frames'] if f['frameId']==frame['frameId'])
  b=next(f for f in original['frames'] if f['frameId']==frame['frameId'])
  assert a['protected']==b['protected'], 'Paired registration changed an approved source contour'
 paired=copy.deepcopy(old);paired['id']='female-original-tailored-neckline-cloth-v1';paired['registrationSha256']=sha(original_bytes)
 ctx=load_context('female',registration_path=ROOT/BINDINGS[0][1])
 frames=[];audit=[]
 for fid in ctx.frames:
  guides=ctx.masks(fid);head=ctx.protected_mask(fid,'head');source=ctx.frames[fid]
  raw=guides['top']&head&(source[:,:,3]>127)
  cloth=nd.binary_erosion(guides['top'])&head&~nd.binary_dilation(guides['skin'])&(source[:,:,3]>127)
  if not cloth.any():continue
  assert fid in SIDE_FRAMES, 'New candidate frame needs independent visual review'
  assert not (cloth&ctx.protected_mask(fid,'nearHand')).any()
  assert not (cloth&ctx.protected_mask(fid,'farHand')).any()
  frames.append({'frameId':fid,'runs':runs(cloth)})
  audit.append({'frameId':fid,'sourceRgbaSha256':sha(source.tobytes()),'originalHeadClothPixels':int(raw.sum()),'approvedInteriorClothPixels':int(cloth.sum()),'boundaryClothPixelsRetained':int((raw&~cloth).sum()),'skinOrHandsReleased':0})
 assert [f['frameId'] for f in frames]==SIDE_FRAMES
 profiles=[paired]
 for profile_id,path,expected in BINDINGS:
  regbytes=(ROOT/path).read_bytes();reg=json.loads(regbytes)
  assert sha(regbytes)==expected
  assert reg['sourceSha256']==ctx.source_sha256
  for frame in frames:
   registered=next(f for f in reg['frames'] if f['frameId']==frame['frameId'])
   head=np.zeros((768,512),bool);hands=head.copy()
   for region in registered['protected']:
    target=head if region['label']=='head' else hands
    target |= runtime_polygon_mask(region['polygon'])
   for row in frame['runs']:
    assert head[row['y'],row['x0']:row['x1']+1].all()
    assert not hands[row['y'],row['x0']:row['x1']+1].any()
  profiles.append({'format':'gathria-neckline-cloth-permissions','version':1,'id':profile_id,'sourceSha256':ctx.source_sha256,'registrationSha256':sha(regbytes),'frameWidth':512,'frameHeight':768,'frames':copy.deepcopy(frames)})
 document={'format':'gathria-neckline-cloth-profile-set','version':1,'profiles':profiles}
 review={'format':'gathria-wardrobe-neckline-cloth-review','version':1,'baselineCommit':'863d761bbdc927ea65080250c765b9c5c78c8fc4','method':'Visually reviewed source gray undershirt inside oversized head polygons. Side maps use one-pixel-eroded source-bound top guide minus one-pixel-dilated skin proof; every approved pixel lies inside actual head protection and outside both hands. Original paired maps copy the existing immutable six-frame review after asserting identical source and protected polygons. No shared registration, source RGBA, face, neck or skin altered. No automatic permission for other source/registration tuples.','oldProfileSha256':OLD_SHA,'sideBindings':[{'id':i,'registration':p,'sha256':s} for i,p,s in BINDINGS],'sideFrames':audit,'remaining':'Thin original neckline and skin/cloth anti-aliased boundary retained conservatively. No male side permission: source top guide has no head-protected pixels. Material/cotton female bindings already cover their source cloth and remain unchanged.'}
 return {'neckline-profiles-v1.json':encoded(document),'neckline-review.json':encoded(review)}

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args();OUT.mkdir(parents=True,exist_ok=True)
 for name,data in build().items():
  path=OUT/name
  if args.check:assert path.read_bytes()==data,f'Stale immutable review {name}'
  else:path.write_bytes(data)
  print(name,sha(data))
