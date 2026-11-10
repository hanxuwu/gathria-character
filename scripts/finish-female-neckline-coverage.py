#!/usr/bin/env python3
"""Finish six reviewed female source-cloth seams without changing source anatomy.

This is a bounded authoring recipe over exact existing source cloth. The source
color gate proposes pixels only inside six reviewed native crops; their frozen
runs are checked into the immutable profile. No runtime skin classifier or
blanket head exception is introduced. Old profile files remain byte-exact.
"""
from pathlib import Path
import argparse,copy,hashlib,io,json,subprocess,sys,zipfile
import numpy as np
from scipy import ndimage as nd
from PIL import Image,ImageDraw
from kling_wardrobe_common import ROOT,load_source,protected_mask,sha
import kling_wardrobe_common as packaging

BASELINE=ROOT/'artwork/wardrobe-finish/female/baseline.json'
PROFILE=ROOT/'artwork/wardrobe-finish/female/neckline-profiles-v2.json'
REVIEW=ROOT/'artwork/wardrobe-finish/female/neckline-review-v2.json'
REPORT=ROOT/'docs/wardrobe-finish/female/repair-report.json'
CACHE=Path('/tmp/wardrobe-finish/female/baseline')
OLD=ROOT/'artwork/kling-mask-workbench/female-neckline-cloth-v1.json'
OLD_SHA='9a24590ab1434480c822a577379de7d92479ee1871e44e11d688ab9ef1d5185c'
CROPS={89:(310,590,470,685),90:(310,510,470,605),93:(310,385,470,480),101:(310,465,470,560),102:(310,535,470,630),103:(310,590,470,685)}
BINDINGS=[('female-neckline-cloth-v2','docs/kling-wardrobe/registration/female.json','c2b19a7a63aa40619babcc23eaa97d1673e79e82e6f8aa157a733869c7a2f953'),('female-original-tailored-neckline-cloth-v2','docs/dual-tailored/assets/female/original-tailored-v1.registration.json','4d02f18a0a624fd3629cf2853d6c96e28d9cd554b28215a9b694aa56c55c9c21')]

def encoded(v):return (json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode()
def png4(a):
 s=io.BytesIO();Image.fromarray(np.asarray(a,dtype=np.uint8),'RGBA').save(s,format='PNG',compress_level=4);return s.getvalue()
packaging.png_bytes=png4

def runs(mask):
 result=[]
 for y in np.flatnonzero(mask.any(axis=1)):
  xs=np.flatnonzero(mask[y]);starts=np.r_[0,np.flatnonzero(np.diff(xs)>1)+1];ends=np.r_[starts[1:]-1,len(xs)-1]
  result += [{'y':int(y),'x0':int(xs[a]),'x1':int(xs[b])} for a,b in zip(starts,ends)]
 return result

def raster(rows):
 m=np.zeros((1056,704),bool)
 for r in rows:m[r['y'],r['x0']:r['x1']+1]=True
 return m

_CONTEXT=None
def context():
 global _CONTEXT
 if _CONTEXT is not None:return _CONTEXT
 assert sha(OLD.read_bytes())==OLD_SHA
 sourcebytes,manifest,_,source=load_source('female');old=json.loads(OLD.read_text());assert sha(sourcebytes)==old['sourceSha256']
 regbytes=(ROOT/BINDINGS[0][1]).read_bytes();assert sha(regbytes)==BINDINGS[0][2]
 regs={r['frameId']:r for r in json.loads(regbytes)['frames']};oldmaps={r['frameId']:raster(r['runs']) for r in old['frames']}
 masks={};permissions={};frames=[]
 for fid,box in CROPS.items():
  original=source[fid];r,g,b=np.moveaxis(original[:,:,:3].astype(float),2,0)
  roi=np.zeros((1056,704),bool);l,t,rr,bb=box;roi[t:bb,l:rr]=True
  hands=protected_mask({'protected':[x for x in regs[fid]['protected'] if x['label']!='head']})
  head=protected_mask({'protected':[x for x in regs[fid]['protected'] if x['label']=='head']})
  # Fixed source-gray interior criterion, reviewed as a native overlay for all
  # six crops. Warm skin and dark inner-neck ink are retained, not recolored.
  mask=roi&~hands&(original[:,:,3]==255)&(r-g<=29)&(r-b<=48)&(r>80)
  masks[fid]=mask;permissions[fid]=oldmaps[fid]|(mask&head)
  assert not (permissions[fid]&hands).any()
  assert not (permissions[fid]&~head).any()
  frames.append({'frameId':fid,'sourceRgbaSha256':sha(original.tobytes()),'reviewCrop':list(box),'clothRuns':runs(mask),'additionalHeadClothPixels':int((permissions[fid]&~oldmaps[fid]).sum()),'oldPermissionRetained':True,'skinOrHandsReleased':0})
 profiles=[]
 for profileid,path,reghash in BINDINGS:
  regdata=(ROOT/path).read_bytes();assert sha(regdata)==reghash
  paired={r['frameId']:r for r in json.loads(regdata)['frames']}
  for fid in CROPS:assert paired[fid]['protected']==regs[fid]['protected']
  profiles.append({'format':'gathria-neckline-cloth-permissions','version':1,'id':profileid,'sourceSha256':sha(sourcebytes),'registrationSha256':reghash,'frameWidth':704,'frameHeight':1056,'frames':[{'frameId':fid,'runs':runs(m)} for fid,m in permissions.items()]})
 profile={'format':'gathria-neckline-cloth-profile-set','version':1,'profiles':profiles}
 review={'format':'gathria-female-neckline-finish-review','version':1,'baselineCommit':json.loads(BASELINE.read_text())['baselineCommit'],'sourceSha256':sha(sourcebytes),'oldPermissionSha256':OLD_SHA,'method':'Six visually reviewed original source neckline crops. Only opaque, neutral source cloth (R-G <= 29, R-B <= 48, R > 80) outside actual hands is eligible. Fixed runs, not this color rule, are shipped runtime permissions. New head permissions are the old map union the reviewed extra cloth; old profiles remain unchanged. Warm skin, head, facial pixels, source timing and registration bytes stay unchanged.','frames':frames}
 _CONTEXT=(source,manifest,masks,permissions,profile,review)
 return _CONTEXT

def baseline_bytes(path):
 d=json.loads(BASELINE.read_text());row=next(x for x in d['items'] if x['path']==path);CACHE.mkdir(parents=True,exist_ok=True);cache=CACHE/(sha(path.encode())+'.zip')
 if not cache.exists():cache.write_bytes(subprocess.check_output(['git','show',d['baselineCommit']+':'+path],cwd=ROOT))
 data=cache.read_bytes();assert sha(data)==row['sha256'],f'Frozen baseline differs: {path}'
 return data

def read_bank(data):
 z=zipfile.ZipFile(io.BytesIO(data));m=json.loads(z.read('manifest.json'));pages=[np.array(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA')) for p in m['pages']];owns=[np.array(Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA'))[:,:,3]>0 for p in m['pages']];frames={}
 for f in m['frames']:
  r=f['rect'];o=f['offset'];s=np.s_[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']];d=np.s_[o['y']:o['y']+r['height'],o['x']:o['x']+r['width']];patch=np.zeros((1056,704,4),np.uint8);own=np.zeros((1056,704),bool);patch[d]=pages[f['page']][s];own[d]=owns[f['page']][s];frames[f['frameId']]=(patch,own)
 return m,frames

def cloth_color(original,patch,own,add):
 sr=original[:,:,:3].astype(float);pr=patch[:,:,:3].astype(float)
 donor=nd.binary_erosion(own,iterations=2)&(patch[:,:,3]>230)&(original[:,:,3]>230)&(np.max(abs(sr-pr),axis=2)>10)&(sr[:,:,0]-sr[:,:,1]<35)&(sr[:,:,0]-sr[:,:,2]<60)
 assert donor.any()
 ratio=np.clip((pr+16)/(sr+16),.12,3.);weight=nd.gaussian_filter(donor.astype(float),sigma=7)
 local=np.stack([nd.gaussian_filter(ratio[:,:,c]*donor,sigma=7)/np.maximum(weight,1e-9) for c in range(3)],axis=2)
 valid=weight>.035;nearest=nd.distance_transform_edt(~valid,return_distances=False,return_indices=True)
 color=np.rint(np.clip((sr+16)*local[tuple(nearest)]-16,0,255)).astype(np.uint8)
 result=patch.copy();result[add]=original[add];result[add,:3]=color[add]
 return result

def finish_bank(path):
 source,_,masks,_,profiles,_=context();data=baseline_bytes(path);m,frames=read_bank(data);records=[]
 for fid in CROPS:
  patch,own=frames[fid];add=masks[fid]&~own
  if not add.any():continue
  new=cloth_color(source[fid],patch,own,add);newown=own|add;before=source[fid].copy();before[own]=patch[own];after=source[fid].copy();after[newown]=new[newown]
  assert np.array_equal(before[~add],after[~add]);assert np.array_equal(before[:,:,3],after[:,:,3]);assert np.array_equal(patch[own],new[own])
  records.append({'frameId':fid,'addedClothPixels':int(add.sum()),'addedRuns':runs(add),'beforeRgbaSha256':sha(before.tobytes()),'afterRgbaSha256':sha(after.tobytes()),'beforePatchSha256':sha(patch.tobytes()),'afterPatchSha256':sha(new.tobytes()),'beforeOwnershipSha256':sha(own.tobytes()),'afterOwnershipSha256':sha(newown.tobytes()),'sourceAlphaExact':True,'existingOwnedPixelsExact':True,'outsideReviewedClothExact':True})
  frames[fid]=(new,newown)
 return m,frames,records

def verify_finish_archive(path,current=None):
 """Independently validate only the layer after the immutable 2a coverage bank.

 Callers should still validate the prior 5d -> 2a historical coverage layer.
 Returns the exact frozen 2a bytes so existing historical checks can inspect
 that layer without blessing arbitrary changed archives.
 """
 current=(ROOT/path).read_bytes() if current is None else current
 baseline=baseline_bytes(path);old,expected,records=finish_bank(path);new,actual=read_bank(current)
 assert set(actual)==set(expected)
 allowedmeta={'version','necklinePermissionProfile','pages','frames','provenance'}
 for key in set(old)|set(new):
  if key not in allowedmeta:assert old.get(key)==new.get(key),(path,key)
 desired=next(p['id'] for p in context()[4]['profiles'] if p['registrationSha256']==old['registrationSha256'])
 assert new['version']==3 and new['necklinePermissionProfile']==desired
 assert new['provenance']==old['provenance']+PROVENANCE
 for fid in actual:
  assert np.array_equal(actual[fid][0],expected[fid][0]),(path,fid,'patch RGBA')
  assert np.array_equal(actual[fid][1],expected[fid][1]),(path,fid,'ownership')
 return baseline

PROVENANCE=' Neckline finish V2: six source-reviewed neutral-cloth runs close remaining inner collar and strap omissions. Existing cloth pixels, alpha, skin, face, hands, source timing and registrations stay exact. Explicit immutable V2 permission profile retains old V1 maps for old projects.'

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--check',action='store_true');ap.add_argument('--profiles-only',action='store_true');ap.add_argument('--item');ap.add_argument('--output-dir',type=Path,default=Path('/tmp/wardrobe-finish/female/candidate'));args=ap.parse_args()
 source,_,masks,_,profiles,review=context()
 for path,value in [(PROFILE,profiles),(REVIEW,review)]:
  if args.check:assert path.read_bytes()==encoded(value),str(path)
  else:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(encoded(value))
 if args.profiles_only:print('profiles',sha(PROFILE.read_bytes()));return
 report=[];items=json.loads(BASELINE.read_text())['items']
 for row in items:
  if args.item and row['id']!=args.item:continue
  path=row['path'];m,frames,records=finish_bank(path)
  if not records:continue
  if args.check:verify_finish_archive(path,(args.output_dir/path).read_bytes())
  else:
   regpath=next(p for _,p,h in BINDINGS if h==m['registrationSha256']);out=args.output_dir/path;out.parent.mkdir(parents=True,exist_ok=True)
   try:packaging.save_garment('female',m['id'],m['name'],m['slot'],(ROOT/regpath).read_bytes(),frames,m['provenance']+PROVENANCE,output=out,hand_reviews=m.get('handProtectionReviews'))
   except ValueError as e:
    if 'is not in the subpath' not in str(e) or not out.exists():raise
   z=zipfile.ZipFile(out);files={n:z.read(n) for n in z.namelist()};new=json.loads(files['manifest.json']);new['version']=3;new['necklinePermissionProfile']=next(p['id'] for p in profiles['profiles'] if p['registrationSha256']==m['registrationSha256']);files['manifest.json']=(json.dumps(new,separators=(',',':'))+'\n').encode()
   with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as target:
    for n,b in sorted(files.items()):info=zipfile.ZipInfo(n,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;target.writestr(info,b)
  report.append({'path':path,'itemId':m['id'],'beforeSha256':row['sha256'],'afterSha256':sha((args.output_dir/path).read_bytes()),'bytes':(args.output_dir/path).stat().st_size,'beforeManifest':m,'afterManifest':json.loads(zipfile.ZipFile(args.output_dir/path).read('manifest.json')),'afterManifestSha256':sha(zipfile.ZipFile(args.output_dir/path).read('manifest.json')),'frameCount':len(frames),'changedFrames':records})
  print(m['id'],len(records),sum(f['addedClothPixels'] for f in records),'pixels',flush=True)
 if not args.check and not args.item:REPORT.parent.mkdir(parents=True,exist_ok=True);REPORT.write_bytes(encoded({'baselineCommit':json.loads(BASELINE.read_text())['baselineCommit'],'profileSha256':sha(PROFILE.read_bytes()),'changedItems':len(report),'items':report}))

if __name__=='__main__':main()
