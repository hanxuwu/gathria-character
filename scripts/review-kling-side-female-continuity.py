#!/usr/bin/env python3
"""Compare source-bound female garment ZIPs against a saved Git baseline.

These are exact offline compositor diagnostics, not UI export acceptance.
The root review harness separately checks actual browser downloads.
"""
from pathlib import Path
import sys, importlib.util, json, zipfile, io, subprocess, argparse
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
s=importlib.util.spec_from_file_location('female',ROOT/'scripts/prepare-kling-side-female-clothing.py')
f=importlib.util.module_from_spec(s);s.loader.exec_module(f)
ap=argparse.ArgumentParser();ap.add_argument('--baseline',default='4fd27f9f21009af556734ae87e52d82b94c6d5f4');ap.add_argument('--output',type=Path,default=ROOT/'docs/kling-side-polish/female');args=ap.parse_args()
ctx=f.load_context('female',registration_path=ROOT/'artwork/kling-side-expansion/templates/female.registration.json')
def baseline(relative):
 return subprocess.run(['git','show',f'{args.baseline}:{relative}'],cwd=ROOT,check=True,stdout=subprocess.PIPE).stdout
def unpack(data):
 if isinstance(data,(Path,str)):data=Path(data).read_bytes()
 with zipfile.ZipFile(io.BytesIO(data)) as z:
  assert z.testzip() is None
  m=json.loads(z.read('manifest.json'));assert m['sourceSha256']==ctx.source_sha256 and m['registrationSha256']==ctx.registration_sha256
  pages=[np.array(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA')) for p in m['pages']]
  masks=[np.array(Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA'))[:,:,3]>0 for p in m['pages']];out={}
  for e in m['frames']:
   page=e['page'];r=e['rect'];x,y,w,h=[r[k] for k in ['x','y','width','height']];a,b=e['offset']['x'],e['offset']['y'];v=ctx.frames[e['frameId']].copy();local=v[b:b+h,a:a+w];owned=masks[page][y:y+h,x:x+w];local[owned]=pages[page][y:y+h,x:x+w][owned];out[e['frameId']]=v
  assert set(out)==set(ctx.frames)
  return out
beforebytes={s:baseline(f'docs/kling-side-expansion/assets/female-{n}.garment.zip') for s,n in [('top','blouse'),('bottom','skirt')]}
before={s:unpack(data) for s,data in beforebytes.items()}
import hashlib
from PIL import ImageDraw,ImageFont
from scipy import ndimage as ndi
out=args.output;out.mkdir(parents=True,exist_ok=True)
new={s:unpack(f.ROOT/f'docs/kling-side-expansion/assets/female-{n}.garment.zip') for s,n in [('top','blouse'),('bottom','skirt')]}
report={'baselineCommit':args.baseline,'sourceSha256':ctx.source_sha256,'registrationSha256':ctx.registration_sha256,'scope':'cloth-only offline donor continuity; no source/body/face/frame/timing/registration changes','assets':{},'frames':{},'actions':{},'limitations':'Continuity proxy aligns cloth to the rounded source waist and measures RGBA changes inside the actual changed-pixel garment masks; it is not a physical cloth metric or visual acceptance. Blouse donor transitions and inter-action skirt-shape changes remain.'}
for slot,name in [('top','blouse'),('bottom','skirt')]:
 p=f.ROOT/f'docs/kling-side-expansion/assets/female-{name}.garment.zip';report['assets'][slot]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size,'baselineSha256':hashlib.sha256(beforebytes[slot]).hexdigest()}
 changed=[fid for fid in ctx.frames if not np.array_equal(before[slot][fid],new[slot][fid])];report['frames'][slot]={'changed':changed,'unchangedCount':len(ctx.frames)-len(changed),'protectedChanged':sum(int(np.any(new[slot][i]!=ctx.frames[i],axis=2)[ctx.protected_mask(i)].sum()) for i in ctx.frames)}
 def aligned(frames,fid):
  v=frames[fid];m=np.any(v!=ctx.frames[fid],axis=2);a=f.cloth_waist(ctx,fid);x,y=int(round(a[0])),int(round(a[1]));p=np.zeros((768,512,4),np.uint8);p[m]=v[m];return p[y:y+155,x-130:x+130]
 if slot=='bottom':
  oldaudit=json.loads(baseline('artwork/kling-side-expansion/female/fit-audit.json'));donors={v['frameId']:v['donors']['bottom'] for v in oldaudit['poses']};newaudit=json.loads((ROOT/'artwork/kling-side-expansion/female/fit-audit.json').read_text());newdonors={v['frameId']:v['donors']['bottom'] for v in newaudit['poses']}
  for action,clip in ctx.animations.items():
   ids=clip['frames'];pairs=list(zip(ids,ids[1:]));pairs+=([(ids[-1],ids[0])] if clip['loop'] else [])
   dat={}
   for label,frames in [('before',before[slot]),('after',new[slot])]:
    ad={i:aligned(frames,i) for i in ids};values=[]
    for a,b in pairs:
     p,q=ad[a],ad[b];m=p[:,:,3]>0;n=q[:,:,3]>0;union=m|n;common=m&n
     values.append({'from':a,'to':b,'silhouetteXor':float((m^n).sum()/max(1,union.sum())),'rgbMAE':float(np.abs(p[:,:,:3].astype(float)-q[:,:,:3]).mean(axis=2)[common].mean())})
    dat[label]={'meanAlignedSilhouetteXor':round(np.mean([v['silhouetteXor'] for v in values]),5),'maxAlignedSilhouetteXor':round(max(v['silhouetteXor'] for v in values),5),'meanAlignedRgbMAE':round(np.mean([v['rgbMAE'] for v in values]),3),'pairs':values}
   dat['donorSwitchesBefore']=sum(donors[a]!=donors[b] for a,b in pairs);dat['donorSwitchesAfter']=sum(newdonors[a]!=newdonors[b] for a,b in pairs);dat['actionDonors']=sorted({newdonors[i] for i in ids});report['actions'][action]=dat
combined={label:{} for label in ['before','after']}
for label,layers in [('before',before),('after',new)]:
 for fid in ctx.frames:
  p=layers['bottom'][fid].copy();m=np.any(layers['top'][fid]!=ctx.frames[fid],axis=2);p[m]=layers['top'][fid][m];combined[label][fid]=p
for action,clip in ctx.animations.items():
 if action=='idle':continue
 pics=[]
 for fid in clip['frames']:
  p=Image.new('RGB',(512,408),(235,231,220));d=ImageDraw.Draw(p)
  for col,label in enumerate(['before','after']):
   im=Image.fromarray(combined[label][fid]).resize((256,384),Image.Resampling.LANCZOS);p.paste(im,(col*256,24),im);d.text((col*256+8,6),f'{label} / {action} / pack {fid}',fill=(35,40,40))
  pics.append(p)
 palette=Image.new('RGB',(512,408*len(pics)));[palette.paste(p,(0,408*i)) for i,p in enumerate(pics)];palette=palette.quantize(colors=256)
 pics=[p.quantize(palette=palette,dither=Image.Dither.NONE) for p in pics];dur=[round((i+1)*100/24)*10-round(i*100/24)*10 for i in range(len(pics))]
 target=out/f'{action}-compositor-before-after.gif';pics[0].save(target,save_all=True,append_images=pics[1:],duration=dur,disposal=2,optimize=False,**({'loop':0} if clip['loop'] else {}))
 with Image.open(target) as im:
  got=[]
  for i in range(im.n_frames):im.seek(i);im.load();got.append(im.info.get('duration',0))
  assert len(got)==len(clip['frames']) and sum(got)==sum(dur)
# Native body/cloth reference: include crouch, apex and landing in one exact-size strip.
ids=[38,40,63,72,79,89,95]
board=Image.new('RGB',(512*len(ids),768*3+90),(235,231,220));d=ImageDraw.Draw(board)
for row,label in enumerate(['source','before','after']):
 for col,fid in enumerate(ids):
  a=ctx.frames[fid] if label=='source' else combined[label][fid];im=Image.fromarray(a);x,y=col*512,row*798;board.paste(im,(x,y+30),im);d.text((x+10,y+8),f'{label} / pack {fid}',fill=(30,40,40))
board.save(out/'difficult-poses-native.png')
# Waist/cuff local compare, 2x integer nearest-neighbor, fixed same-frame crop.
ids=[38,40,47,63,72,79,95];tilew,tileh=400,420
board=Image.new('RGB',(tilew*len(ids),tileh*2),(235,231,220));d=ImageDraw.Draw(board)
for row,label in enumerate(['before','after']):
 for col,fid in enumerate(ids):
  waist=f.cloth_waist(ctx,fid);x=int(round(waist[0]))-100;y=int(round(waist[1]))-55
  im=Image.fromarray(combined[label][fid]).crop((x,y,x+200,y+195)).resize((400,390),Image.Resampling.NEAREST);bx,by=col*tilew,row*tileh;board.paste(im,(bx,by+30),im);d.text((bx+8,by+8),f'{label} / {fid} / integer 2x',fill=(30,40,40))
board.save(out/'cloth-details-2x.png')
(out/'continuity-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:{n:v for n,v in vv.items() if n not in ['before','after']}|{n:{a:b for a,b in vv[n].items() if a!='pairs'} for n in ['before','after']} for k,vv in report['actions'].items()},indent=2))
