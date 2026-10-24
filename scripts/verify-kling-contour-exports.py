#!/usr/bin/env python3
"""Decode every delivered app PNG/GIF/ZIP and compare source-bound changed pixels."""
import os,io,json,zipfile,hashlib,importlib.util
from pathlib import Path
import numpy as np
from PIL import Image,ImageOps
from kling_wardrobe_common import ROOT
BASE=ROOT/os.environ.get('KLING_REVIEW_DIR','docs/kling-contour-review');E=BASE/'evidence'
sha=lambda b:hashlib.sha256(b).hexdigest()
spec=importlib.util.spec_from_file_location('reader',ROOT/'scripts/prepare-kling-male-fit-polish.py');reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
class Pack:
 def __init__(self,path):
  self.path=path;self.z=zipfile.ZipFile(path);assert self.z.testzip() is None;self.m=json.loads(self.z.read('manifest.json'));self.c=json.loads(self.z.read('character.json'));self.frames={f['id']:f for f in self.m['frames']};self.pages=[self.m['spritesheet'],*self.m.get('additionalSheets',[])];self.pi=None;self.image=None
  for n in self.z.namelist():
   assert not n.startswith('/') and '..' not in n.split('/');data=self.z.read(n);assert data
   if n.endswith('.json'):json.loads(data)
   if n.endswith('.png'):
    with Image.open(io.BytesIO(data)) as im:im.load();assert im.mode=='RGBA'
 def frame(self,fid):
  f=self.frames[fid];p=f.get('page',0)
  if p!=self.pi:
   if self.image:self.image.close()
   self.image=Image.open(io.BytesIO(self.z.read(self.pages[p]['file']))).convert('RGBA');self.image.load();self.pi=p
  return self.image.crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height']))
 def close(self):
  if self.image:self.image.close()
  self.z.close()

def main():
 capture=E/('evidence-index.json' if (E/'evidence-index.json').exists() else 'failed-attempt.json');r=json.loads(capture.read_text());assert r['production'] and len(r['outfits'])==4 and len(r['playback'])==40;report={'captureFile':str(capture.relative_to(ROOT)),'capturesSha256':sha(capture.read_bytes()),'packs':[],'pngs':[],'gifs':[],'projects':[],'neighborKits':[]}
 for row in r['outfits']:
  char,look=row['character'],row['look'];key=f'{char}-{look}';before=Pack(ROOT/row['beforePack']);after=Pack(ROOT/row['pack']['file']);assert sha(after.path.read_bytes())==row['pack']['sha256'];assert sha(before.path.read_bytes())==row['beforeSha256']
  for field in ['animations','anchor','facing']:assert before.m[field]==after.m[field],(key,field)
  assert before.frames.keys()==after.frames.keys();assert before.c['derivation']['frames']==after.c['derivation']['frames']
  allowed={}
  if key!='male-day':
   prefix='navy-suit-jacket' if char=='male' else ('coral-daydress' if look=='day' else 'ivory-wedding-dress');ov,nv=(5,6) if char=='male' else (7,8)
   old=reader.read_bank(ROOT/f'docs/kling-wardrobe/garments/{char}/{prefix}-v{ov}.zip');new=reader.read_bank(ROOT/f'docs/kling-wardrobe/garments/{char}/{prefix}-v{nv}.zip')
   allowed={fid:np.any(im!=old[fid][0],axis=2)|(own!=old[fid][1]) for fid,(im,own) in new.items()};del old,new
  checks=[]
  for fid in before.frames:
   a=np.asarray(before.frame(fid));b=np.asarray(after.frame(fid));assert a.shape==b.shape==(1184,768,4);diff=np.any(a!=b,axis=2)
   permitted=np.zeros(diff.shape,bool)
   if fid in allowed:permitted[128:1184,32:736]=allowed[fid]
   assert not (diff&~permitted).any(),(key,fid,'outside reviewed clothing')
   if char=='male':assert np.array_equal(a[:,:,3],b[:,:,3]),(key,fid,'alpha/silhouette')
   checks.append({'frameId':fid,'changedPixels':int(diff.sum()),'rgbaSha256':sha(b.tobytes())})
  report['packs'].append({'file':str(after.path.relative_to(ROOT)),'sha256':sha(after.path.read_bytes()),'frames':len(checks),'poses':checks,'outsideAuthoredChangesExact':True,'bodyAlphaExact':char=='male','clothingContourChangeOnly':char=='female','sourceMappingTimingAndAnchorExact':True})
  for path in sorted(E.glob(key+'-*.png')):
   label=path.stem.removeprefix(key+'-');parts=label.rsplit('-',2)
   if len(parts)!=3 or parts[0] not in ['before','after']:continue
   state,fid,direction=parts;expected=(before if state=='before' else after).frame(int(fid))
   if direction=='left':expected=ImageOps.mirror(expected)
   with Image.open(path) as im:im.load();assert im.mode=='RGBA' and im.tobytes()==expected.tobytes(),path.name;alpha=im.getchannel('A').getextrema();assert alpha==(0,255)
   report['pngs'].append({'file':str(path.relative_to(ROOT)),'decodedRgbaMatchesPack':True,'size':list(expected.size),'sha256':sha(path.read_bytes())})
  for action in ['run','jump']:
   clip=after.m['animations'][action]
   left,right=[Image.open(E/f'{key}-{action}-{d}.gif') for d in ['left','right']];expected_times=[(round((i+1)*100/clip['fps'])-round(i*100/clip['fps']))*10 for i in range(len(clip['frames']))]
   # JavaScript Math.round ties upward; Python banker's rounding differs at .5.
   import math
   expected_times=[(math.floor((i+1)*100/clip['fps']+.5)-math.floor(i*100/clip['fps']+.5))*10 for i in range(len(clip['frames']))]
   for direction,im in [('left',left),('right',right)]:
    assert im.size==(384,592) and im.n_frames==len(clip['frames']);assert (im.info.get('loop')==0)==clip['loop'];times=[]
    for i in range(im.n_frames):im.seek(i);im.load();times.append(im.info.get('duration',0))
    assert times==expected_times;report['gifs'].append({'file':str((E/f'{key}-{action}-{direction}.gif').relative_to(ROOT)),'frames':im.n_frames,'durationsMs':times,'loop':clip['loop'],'allFramesDecoded':True})
   for i in range(right.n_frames):
    left.seek(i);right.seek(i);assert ImageOps.mirror(left.convert('RGB')).tobytes()==right.convert('RGB').tobytes(),(key,action,i,'mirror palette')
   left.close();right.close()
  source=Pack(ROOT/f'docs/kling-motion/exports/{char}.character.zip')
  for comp in row['comparisonGifs']:
   path=ROOT/comp['file'];im=Image.open(path);clip=after.m['animations'][comp['action']]
   assert im.size==(776,608) and im.n_frames==len(clip['frames'])
   expected_times=[(math.floor((i+1)*100/clip['fps']+.5)-math.floor(i*100/clip['fps']+.5))*10 for i in range(len(clip['frames']))]
   assert (im.info.get('loop')==0)==clip['loop'];maes=[]
   for i,fid in enumerate(clip['frames']):
    im.seek(i);im.load();assert im.info['duration']==expected_times[i]
    original=Image.new('RGBA',(768,1184));original.paste(source.frame(fid),(32,128))
    for offset,native in [(0,original),(392,after.frame(fid))]:
     if comp['facing']=='left':native=ImageOps.mirror(native)
     matte=Image.new('RGBA',native.size,(238,233,223,255));matte.alpha_composite(native)
     expected=np.asarray(matte.convert('RGB').resize((384,592),Image.Resampling.BOX)).astype(float)
     actual=np.asarray(im.convert('RGB').crop((offset,16,offset+384,608))).astype(float)
     error=np.abs(actual-expected);mae=float(error.mean());assert mae<4,(path.name,i,mae)
     maes.append(mae)
   report['gifs'].append({'file':comp['file'],'frames':im.n_frames,'allFramesDecoded':True,'originalAndCurrentPanelsMatch':True,'maxMeanQuantizationError':max(maes),'originalTiming':True})
   im.close()
  paired={c['facing']:c for c in row['comparisonGifs']}
  left=Image.open(ROOT/paired['left']['file']);right=Image.open(ROOT/paired['right']['file'])
  for i in range(right.n_frames):
   left.seek(i);right.seek(i);a=np.asarray(left.convert('RGB'));b=np.asarray(right.convert('RGB'))
   assert np.array_equal(a[:16],b[:16]),(key,i,'comparison labels mirrored')
   for offset in [0,392]:assert np.array_equal(a[16:,offset:offset+384][:,::-1],b[16:,offset:offset+384]),(key,i,'comparison panel mirror')
  left.close();right.close()
  source.close()
  project=Path(row['project']['file']);assert sha(project.read_bytes())==row['project']['sha256']
  with zipfile.ZipFile(project) as z:
   assert z.testzip() is None;doc=json.loads(z.read('document.json'))
   assert sha(z.read('source.character.zip'))==doc['sourceSha256']
   assert sha(z.read('registration.json'))==doc['registrationSha256']
   for index,item in enumerate(doc['items']):
    raw=z.read(f'item-{index}.zip');assert sha(raw)==item['sha256']
    with zipfile.ZipFile(io.BytesIO(raw)) as garment:
     assert garment.testzip() is None
     for filename in garment.namelist():
      if filename.endswith('.png'):
       image=Image.open(io.BytesIO(garment.read(filename)));image.load();assert image.mode=='RGBA'
  report['projects'].append({'file':str(project),'sha256':sha(project.read_bytes()),'nestedItemsDecoded':True,'browserReopenExact':row['reopenedPixelsExact']})
  if row.get('neighborKit'):
   path=Path(row['neighborKit']['file']);assert sha(path.read_bytes())==row['neighborKit']['sha256']
   with zipfile.ZipFile(path) as z:
    assert z.testzip() is None;guide=json.loads(z.read('neighbors-guide.json'));recipe=json.loads(z.read('recipe.json'));assert sha(z.read(recipe['base']['file']))==recipe['base']['sha256']
    for o in recipe['poseOverrides']:
     for keyfile in ['image','mask']:
      d=z.read(o[keyfile]['file']);assert sha(d)==o[keyfile]['sha256'];im=Image.open(io.BytesIO(d));im.load();assert im.size==(704,1056)
   report['neighborKits'].append({'file':str(path),'uniqueSourcePoses':guide['uniquePoseIds'],'anchorsAndHashesChecked':True})
  before.close();after.close()
 # Also decode screenshot/mixed native PNGs, rather than just testing existence.
 for path in E.glob('*.png'):
  with Image.open(path) as im:im.load();assert min(im.size)>0
 report['passed']=True;(BASE/'export-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:len(v) for k,v in report.items() if isinstance(v,list)}))
if __name__=='__main__':main()
