#!/usr/bin/env python3
"""Decode actual candidate exports and prove selected-pose changes preserve the base."""
import io,json,os,hashlib,zipfile,math,importlib.util
from pathlib import Path
import numpy as np
from PIL import Image,ImageOps,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/os.environ.get('KLING_REPAIR_REVIEW_DIR','docs/kling-repair-handoff/evidence')
spec=importlib.util.spec_from_file_location('review_helpers',ROOT/'scripts/verify-kling-look-workflow.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
sha=lambda b:hashlib.sha256(b).hexdigest()

def make_details(case,pair,e,changed,report):
 """Crop decoded application packs only; preserve source pixels at integer scale."""
 expected_native={59:(374,512,396,562)} if case['character']=='male' else {55:(324,668,388,685),63:(328,662,384,676)}
 audit_path=ROOT/('artwork/kling-repair-handoff/male/audit.json' if case['character']=='male' else 'artwork/kling-repair-handoff/female/asset-audit.json')
 font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',17)
 for change in changed:
  fid=change['frameId']; native=expected_native[fid]; expected=(native[0]+32,native[1]+128,native[2]+32,native[3]+128)
  b=change['bounds'];assert expected[0]<=b['x'] and expected[1]<=b['y'] and b['x']+b['width']<=expected[2] and b['y']+b['height']<=expected[3]
  before,after=pair['before'].frame(fid),pair['after'].frame(fid)
  margin=48;rect=(max(0,expected[0]-margin),max(0,expected[1]-margin),min(before.width,expected[2]+margin),min(before.height,expected[3]+margin))
  size=((rect[2]-rect[0])*3,(rect[3]-rect[1])*3);gap=16;title=40
  board=Image.new('RGB',(size[0]*2+gap,size[1]+title),(238,234,223));draw=ImageDraw.Draw(board)
  for n,(label,im) in enumerate([('Before',before),('After',after)]):
   detail=h.matte(im.crop(rect),(238,234,223)).resize(size,Image.Resampling.NEAREST)
   board.paste(detail,(n*(size[0]+gap),title));draw.text((n*(size[0]+gap)+8,10),f'{label} - pose {fid} - 3x',font=font,fill=(42,65,58))
  path=OUT/f"{case['key']}-pose-{fid}-detail-3x.png";board.save(path)
  with Image.open(path) as check:check.load();assert check.size==board.size and check.tobytes()==board.tobytes()
  sources=[{'file':r['file'],'sha256':r['sha256'],'stage':r['stage'],'frameId':fid} for r in e['packs'] if r['key']==case['key']]
  report['derivedDetails'].append({'file':str(path.relative_to(ROOT)),'sha256':sha(path.read_bytes()),'sources':sources,'nativeAudit':str(audit_path.relative_to(ROOT)),'nativeAuditSha256':sha(audit_path.read_bytes()),'nativeAuditBoundsExclusive':native,'appearancePadding':{'left':32,'top':128},'cropBoundsExclusive':rect,'scale':3,'sampling':'nearest-neighbor','backgroundRgb':[238,234,223],'sourcePixelsRepainted':False})

def main():
 epath=OUT/'evidence-index.json'; e=json.loads(epath.read_text());assert e['passed']
 assert len(e['playback'])==len(e['cases'])*10
 for k in ['errors','externalRequests','failedRequests','independentEditorRequests']:assert not e[k]
 report={'evidenceSha256':sha(epath.read_bytes()),'packs':[],'frames':[],'comparisons':[],'gifs':[],'projects':[],'screenshots':[],'repairs':[],'notes':[],'derivedDetails':[]}
 packs={}
 for file,digest in e['sourceHashes'].items():assert sha((ROOT/file).read_bytes())==digest,(file,'source changed after capture')
 report['capturedSourceHashesStillExact']=True
 for r in e['packs']:
  p=ROOT/r['file'];assert sha(p.read_bytes())==r['sha256'];pack=h.Pack(p);packs[r['file']]=pack
  if r.get('baseline'):assert p.read_bytes()==(ROOT/r['baseline']).read_bytes()
  for fid in pack.frames:
   im=pack.frame(fid);assert im.mode=='RGBA' and im.getchannel('A').getextrema()==(0,255)
  report['packs'].append({'file':r['file'],'poses':len(pack.frames),'allFramesDecoded':True})
 for case in e['cases']:
  pair={r['stage']:packs[r['file']] for r in e['packs'] if r['key']==case['key']}
  a,b=pair['before'],pair['after']
  for key in ['animations','frames','anchor','facing','spritesheet','additionalSheets']:assert a.m.get(key)==b.m.get(key)
  changed=[]
  for fid in a.frames:
   aa=np.asarray(a.frame(fid));bb=np.asarray(b.frame(fid));assert np.array_equal(aa[...,3],bb[...,3]),(case['key'],fid,'alpha changed');mask=np.any(aa!=bb,axis=2)
   if mask.any():
    ys,xs=np.where(mask);changed.append({'frameId':fid,'pixels':int(mask.sum()),'bounds':{'x':int(xs.min()),'y':int(ys.min()),'width':int(xs.max()-xs.min()+1),'height':int(ys.max()-ys.min()+1)}})
  assert changed,(case['key'],'candidate should improve a recorded pose rather than produce no output change')
  if 'changedFrameIds' in case:assert sorted(x['frameId'] for x in changed)==sorted(case['changedFrameIds'])
  report['repairs'].append({'key':case['key'],'changedFrames':changed,'unchangedFrames':len(a.frames)-len(changed),'anchorsFramesTimingsExact':True,'allFrameAlphaExact':True})
  make_details(case,pair,e,changed,report)
 groups={}
 for r in e['downloads']:
  p=ROOT/r['file'];raw=p.read_bytes();assert sha(raw)==r['sha256'] and len(raw)==r['bytes']
  if r['kind']=='frame':
   expected=packs[r['pack']].frame(r['frameId'])
   if r['facing']=='left':expected=ImageOps.mirror(expected)
   with Image.open(p) as im:im.load();assert im.mode=='RGBA' and im.size==expected.size and im.tobytes()==expected.tobytes()
   report['frames'].append({'file':r['file'],'rgbaExactToPack':True})
  elif r['kind']=='look-png':
   delta=h.check_png_panels(p,packs[r['reference']].frame(r['frameId']),packs[r['current']].frame(r['frameId']),r['facing'])
   report['comparisons'].append({'file':r['file'],'meanAlphaRoundtripError':delta,'bothPanelsMatch':True})
  elif r['kind']=='look-gif':
   a,b=packs[r['reference']],packs[r['current']];clip=b.m['animations'][r['action']]
   w,hh=math.ceil(b.m['spritesheet']['frameWidth']/2),math.ceil(b.m['spritesheet']['frameHeight']/2)
   errors=[];times=[]
   with Image.open(p) as gif:
    assert gif.n_frames==len(clip['frames']);assert (gif.info.get('loop')==0)==clip['loop'];assert gif.size==(2*w+8,hh+16)
    for i,fid in enumerate(clip['frames']):
     gif.seek(i);gif.load();t=(math.floor((i+1)*100/clip['fps']+.5)-math.floor(i*100/clip['fps']+.5))*10;assert gif.info['duration']==t;times.append(t)
     for offset,pack in [(0,a),(w+8,b)]:
      expected=h.matte(pack.frame(fid),(238,233,223)).resize((w,hh),Image.Resampling.BOX)
      if r['facing']=='left':expected=ImageOps.mirror(expected)
      actual=gif.convert('RGB').crop((offset,16,offset+w,16+hh))
      error=float(np.abs(np.asarray(actual).astype(float)-np.asarray(expected).astype(float)).mean());assert error<4;errors.append(error)
   groups.setdefault((r['key'],r['action']),{})[r['facing']]=p
   report['gifs'].append({'file':r['file'],'frames':len(times),'durationsMs':times,'loop':clip['loop'],'panelsMatchPacks':True,'maxMeanQuantizationError':max(errors)})
  elif r['kind'] in ['review-notes','review-handoff']:
   doc=json.loads(raw)
   if r['kind']=='review-handoff':
    assert doc['format']=='gathria-review-transfer' and doc['version']==1
    assert doc['from']['sourceSha256']==doc['to']['sourceSha256'] and doc['from']['registrationSha256']==doc['to']['registrationSha256'] and doc['from']['lookSha256']!=doc['to']['lookSha256']
   else:assert doc['format']=='gathria-look-review' and doc['version']==1
   report['notes'].append({'file':r['file'],'decoded':True})
  elif r['kind']=='project':
   h.nested_zip(raw)
   with zipfile.ZipFile(io.BytesIO(raw)) as z:
    doc=json.loads(z.read('document.json'));assert sha(z.read('source.character.zip'))==doc['sourceSha256'];assert sha(z.read('registration.json'))==doc['registrationSha256']
    for i,item in enumerate(doc['items']):assert sha(z.read(f'item-{i}.zip'))==item['sha256']
   report['projects'].append({'file':r['file'],'nestedAssetsDecodedAndHashesExact':True})
 for key,sides in groups.items():
  assert set(sides)=={'left','right'}
  with Image.open(sides['left']) as l,Image.open(sides['right']) as r:
   w=(l.width-8)//2
   for i in range(l.n_frames):
    l.seek(i);r.seek(i);a=np.asarray(l.convert('RGB'));b=np.asarray(r.convert('RGB'));assert np.array_equal(a[:16],b[:16])
    for x in [0,w+8]:assert np.array_equal(a[16:,x:x+w][:,::-1],b[16:,x:x+w])
 for p in OUT.glob('*.png'):
  with Image.open(p) as im:im.load();assert min(im.size)>0
  if p.name.endswith(('-desktop.png','-mobile.png','-independent.png','-candidate-jump.png','-handoff.png')):report['screenshots'].append(str(p.relative_to(ROOT)))
 for p in packs.values():p.close()
 report['passed']=True;(OUT.parent/'export-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:len(v) for k,v in report.items() if isinstance(v,list)}))
if __name__=='__main__':main()
