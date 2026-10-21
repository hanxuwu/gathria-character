#!/usr/bin/env python3
"""Derive male per-source-frame garment registration and ownership proposals.

This is offline authoring: no source RGB/alpha, poses, animation timing, or anchor
is modified. It extracts existing frames, labels visible garment/skin/shoe regions,
tracks manually inspected landmarks between nearby keyposes, and produces review
sheets. Hidden joints are inferred and explicitly low confidence. The outputs are
not recovered original rig layers and still require outfit-specific visual review.

Dependencies: Pillow, numpy, scipy, opencv-python-headless.
Example:
  python scripts/prepare-kling-wardrobe-male.py --output /tmp/kling-wardrobe-male \
    --registration artwork/kling-wardrobe/registration/male/registration.json
"""
from pathlib import Path
from zipfile import ZipFile
from io import BytesIO
import argparse
import hashlib
import json
import subprocess
import sys
import cv2
import numpy as np
from scipy import ndimage as nd
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, default=ROOT / 'docs/kling-motion/exports/male.character.zip')
parser.add_argument('--poses', type=Path, default=ROOT / 'artwork/kling-wardrobe/registration/male/reviewed-poses.json')
parser.add_argument('--output', type=Path, default=Path('/tmp/kling-wardrobe-male'))
parser.add_argument('--registration', type=Path)
args = parser.parse_args()
P = args.output
P.mkdir(parents=True, exist_ok=True)
with ZipFile(args.source) as archive:
    manifest = json.loads(archive.read('manifest.json'))
    pages = [Image.open(BytesIO(archive.read(meta['file']))).convert('RGBA')
             for meta in [manifest['spritesheet'], *manifest.get('additionalSheets', [])]]
    for frame in manifest['frames']:
        x, y, w, h = (frame[k] for k in ['x', 'y', 'width', 'height'])
        crop = pages[frame.get('page', 0)].crop((x, y, x + w, y + h))
        crop.save(P / f"frame-{frame['id']:03}.png")
(P / 'manifest.json').write_text(json.dumps(manifest, indent=2))
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
except OSError:
    font = ImageFont.load_default()
O = P / 'semantic'
O.mkdir(exist_ok=True)
def bounds(m):
 y,x=np.where(m)
 return [int(x.min()),int(y.min()),int(x.max()),int(y.max())] if len(x) else None

def components(m,minpixels=20):
 l,n=nd.label(m);cs=np.bincount(l.ravel());cs[0]=0
 return [(l==i,int(cs[i]),bounds(l==i)) for i in np.argsort(cs)[::-1] if cs[i]>=minpixels]

def nearby_components(mask,up=0,down=0,left=0,right=0,min_width_ratio=0):
 cs=components(mask,minpixels=150);base=cs[0][2];m=np.zeros(mask.shape,bool)
 for c,count,b in cs:
  if b[0]>=base[0]-left and b[2]<=base[2]+right and b[1]>=base[1]-up and b[3]<=base[3]+down and b[2]-b[0]>=min_width_ratio*(base[2]-base[0]):m|=c
 return m

def process(path):
 fid=int(path.stem.split('-')[1]);im=Image.open(path).convert('RGBA');a=np.asarray(im).astype(float);r,g,b,alpha=np.moveaxis(a,2,0);yy,xx=np.indices(r.shape);v=alpha>0
 head_top=int(np.where(v)[0].min())
 head_core=components(v&(r-g>34)&(r-b>52)&(r>150)&(g>80)&(yy<head_top+365))[0][0]
 head_region=nd.binary_dilation(nd.binary_fill_holes(head_core),iterations=8)&v&(yy<head_top+365)
 tank=nearby_components(v&(~head_region)&(abs(r-g)<27)&(r-b<58)&(r-b>=0)&(g-b<40)&(g-b>=-4)&(r>70)&(g>75)&(b>55),up=130,down=130,left=40,right=40,min_width_ratio=.35)
 tb=bounds(tank)
 shorts=nearby_components(v&(~head_region)&(~tank)&(yy>tb[3]-50)&(g>=r-3)&(b>=r-7)&(r<115)&(g<120)&(yy>tb[1]+30)&(yy<tb[3]+160),up=50,down=80,left=200,right=200)
 sb=bounds(shorts)
 shoeSeed=v&(~tank)&(~shorts)&(yy>tb[3]+20)&(r>135)&(abs(r-g)<45)&(r-b<85)&(b>95)&(yy>sb[1]+30)
 shoeComponents=components(shoeSeed,100)[:2];shoes=np.zeros(v.shape,bool)
 for s,c,bb in shoeComponents:shoes|=s
 skin=v&(r-g>34)&(r-b>52)
 seeds=np.zeros(v.shape,np.uint8);seeds[skin]=1;seeds[tank]=2;seeds[shorts]=3;seeds[shoes]=4
 dist,idx=nd.distance_transform_edt(seeds==0,return_indices=True);labels=seeds[tuple(idx)];labels[~v]=0
 labels[head_region]=1
 # Shoe structure includes warm shadows/brown sole pixels. Recover the region
 # bounded by each visible white upper rather than deleting warm colors globally.
 for s,c,bb in shoeComponents:
  # pixel rows occupied by the upper; extend down for the sole and laterally for outline.
  footprint=nd.binary_dilation(s,iterations=11)
  local=(yy>=bb[1]-6)&(yy<=bb[3]+16)&(xx>=bb[0]-12)&(xx<=bb[2]+12)
  # Warm lower sole pixels may resemble skin. The exposed ankle above the
  # upper midpoint stays skin; only the lower shoe may override skin seeds.
  sole_or_non_skin=(~skin)|(yy>=(bb[1]+bb[3])/2)
  labels[footprint&local&v&(~tank)&(~shorts)&sole_or_non_skin]=4
 # Complete dark outlines with their nearest seeded material, even where a
 # thick sole exceeds 12 px. Report distant completions for visual review;
 # ownership remains exclusive and never extends beyond source alpha.
 # No alteration to RGB/source alpha: masks are garment ownership proposals.
 masks={name:labels==i for i,name in [(1,'skin'),(2,'tank'),(3,'shorts'),(4,'shoes')]}
 for name,m in masks.items():Image.fromarray((m*255).astype('uint8')).save(O/f'{fid:03}-{name}.png')
 overlay=Image.new('RGBA',im.size);t=np.zeros(a.shape,np.uint8)
 for i,col in [(1,(247,157,73,60)),(2,(34,193,228,150)),(3,(204,65,211,150)),(4,(76,211,111,150))]:t[labels==i]=col
 overlay=Image.alpha_composite(im,Image.fromarray(t));overlay.save(O/f'{fid:03}-overlay.png')
 return {'frameId':fid,'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bounds':{n:bounds(m) for n,m in masks.items()},'pixels':{n:int(m.sum()) for n,m in masks.items()},'unclassifiedVisiblePixels':int((v&(labels==0)).sum()),'outlinePixelsAssignedBeyond12px':int((v&(dist>12)).sum()),'maskStatus':'automated-color-spatial-proposal; outlines and shoes require visual review','shoeComponents':[{'bounds':bb,'pixels':c} for _,c,bb in shoeComponents]}

records = [process(P / f"frame-{f['id']:03}.png") for f in manifest['frames']]
(O / 'index.json').write_text(json.dumps(records, indent=2))
for action, animation in manifest['animations'].items():
    ids = list(dict.fromkeys(animation['frames']))
    sheet = Image.new('RGB', (176 * 8, 288 * ((len(ids) + 7) // 8)), '#e8e7dc')
    draw = ImageDraw.Draw(sheet)
    for i, fid in enumerate(ids):
        preview = Image.open(O / f'{fid:03}-overlay.png').resize((176, 264))
        x, y = (i % 8) * 176, (i // 8) * 288
        sheet.paste(preview, (x, y + 24), preview)
        draw.text((x + 3, y + 3), str(fid), font=font, fill='black')
    sheet.save(O / f'{action}-review.png')
S = O
O = P / 'registration'
O.mkdir(exist_ok=True)
manual=json.loads(args.poses.read_text())
if manual.get('sourceSha256') != hashlib.sha256(args.source.read_bytes()).hexdigest():
 raise ValueError('Reviewed male poses belong to a different source CharacterPack; review new frames first.')
names=manual['anchorNames'];poses={int(k):v['points'] for k,v in manual['poses'].items()}
manifest=json.loads((P/'manifest.json').read_text());actions={k:list(dict.fromkeys(v['frames'])) for k,v in manifest['animations'].items()};images={fid:np.array(Image.open(P/f'frame-{fid:03}.png').convert('RGBA')) for fid in set(sum(actions.values(),[]))}
small={fid:cv2.cvtColor(cv2.resize(a[:,:,:3],(352,528)),cv2.COLOR_RGB2GRAY) for fid,a in images.items()}
flows={}
def flow(a,b):
 key=(a,b)
 if key not in flows: flows[key]=cv2.calcOpticalFlowFarneback(small[a],small[b],None,.5,5,35,6,7,1.5,0)
 return flows[key]
def propagate(seed,fid,ids):
 coords=np.array([[poses[seed][n]['x'],poses[seed][n]['y']] for n in names],float)/2
 i,j=ids.index(seed),ids.index(fid);step=1 if j>i else -1
 for k in range(i,j,step):
  f=flow(ids[k],ids[k+step]);updated=[]
  for p in coords:
   x,y=np.round(p).astype(int);x=np.clip(x,3,348);y=np.clip(y,3,524);delta=np.median(f[y-3:y+4,x-3:x+4],axis=(0,1));updated.append(p+delta)
  coords=np.array(updated)
 return coords*2

def largest(m):
 l,n=nd.label(m);c=np.bincount(l.ravel());c[0]=0;return l==np.argmax(c)
def polygon(m):
 contours,_=cv2.findContours(m.astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
 if not contours:return []
 c=max(contours,key=cv2.contourArea);area=cv2.contourArea(c)
 if area<20:return []
 original=c;epsilon=1.5;c=cv2.approxPolyDP(original,epsilon,True)
 while len(c)>64:
  epsilon+=1;c=cv2.approxPolyDP(original,epsilon,True)
 return [{'x':int(p[0][0]),'y':int(p[0][1])} for p in c]

def protections(fid,points):
 a=images[fid];r,g,b,alpha=np.moveaxis(a.astype(float),2,0);yy,xx=np.indices(alpha.shape);v=alpha>0
 skin=np.array(Image.open(S/f'{fid:03}-skin.png'))>0
 garment=np.logical_or.reduce([np.array(Image.open(S/f'{fid:03}-{name}.png'))>0 for name in ['tank','shorts','shoes']])
 garment_margin=nd.binary_dilation(garment,iterations=4)
 neck=points['neck'];headseed=v&(r-g>34)&(r-b>52)&(r>150)&(g>80)&(yy<neck['y']-10)
 head=nd.binary_fill_holes(largest(headseed));head=nd.binary_dilation(head,iterations=8)&v&(yy<neck['y']+6)
 # Fill internal eyes/brows/mouth; unlike polygon hull this does not include
 # another limb merely because the hand passes near the head.
 head=nd.binary_fill_holes(head)&(~garment_margin)
 out=[{'label':'head','polygon':polygon(head)}];masks={'head':head}
 for side in ['near','far']:
  wrist=points[side+'Wrist'];elbow=points[side+'Elbow']
  if wrist['visibility']=='occluded':masks[side+'Hand']=np.zeros(v.shape,bool);continue
  w=np.array([wrist['x'],wrist['y']]);e=np.array([elbow['x'],elbow['y']]);u=(w-e)/max(np.linalg.norm(w-e),1)
  along=(xx-w[0])*u[0]+(yy-w[1])*u[1];radius=(xx-w[0])**2+(yy-w[1])**2
  mask=skin&(along>=-6)&(radius<110**2)&(~head)
  if mask.sum()>30:
   mask=largest(mask);mask=nd.binary_fill_holes(mask)&(~garment_margin);pol=polygon(mask)
   if pol:out.append({'label':side+'Hand','polygon':pol})
  masks[side+'Hand']=mask
 for name,mask in masks.items():Image.fromarray((mask*255).astype('uint8')).save(O/f'{fid:03}-{name}.png')
 return out

pack=args.source
with ZipFile(pack) as z: config=json.loads(z.read('character.json'))
sourceFrames={f['frameId']:f['sourceFrame'] for f in config['derivation']['frames']}
records=[]
for action,ids in actions.items():
 seeds=[fid for fid in poses if fid in ids]
 for fid in ids:
  nearest=min(seeds,key=lambda seed:abs(seed-fid));distance=abs(ids.index(nearest)-ids.index(fid));coords=propagate(nearest,fid,ids) if fid!=nearest else np.array([[poses[fid][n]['x'],poses[fid][n]['y']] for n in names])
  points={}
  for n,p in zip(names,coords):
   source=poses[nearest][n];points[n]={'x':round(float(p[0]),1),'y':round(float(p[1]),1),'visibility':source['visibility'],'confidence':source['confidence'] if fid==nearest else round(max(.25,source['confidence']-.12-distance*.02),2),'method':source['method'] if fid==nearest else 'optical-flow-from-reviewed-pose-proposal'}
  # Garment hem attachment comes from each actual visible tank contour.
  tank=np.array(Image.open(S/f'{fid:03}-tank.png'))>0
  ty,tx=np.where(tank);hem=tank&(np.indices(tank.shape)[0]>=ty.max()-18);hy,hx=np.where(hem)
  for name,q in [('waistLeft',.02),('waistRight',.98)]:
   x=float(np.quantile(hx,q)); y=float(np.median(hy[abs(hx-x)<=12]))
   points[name]={'x':round(x,1),'y':round(y,1),'visibility':'visible','confidence':.88,'method':'visible-garment-hem-contour'}
  if fid in [56,57,61,62]:
   for name in ['farShoulder','farElbow','farWrist']:points[name]['visibility']='occluded';points[name]['confidence']=min(points[name]['confidence'],.35)
  for name, correction in manual.get('overrides', {}).get(str(fid), {}).items():
   points[name].update(correction)
  protected=protections(fid,points)
  records.append({'frameId':fid,'sourceFrame':sourceFrames[fid],'points':points,'protected':protected})
  im=Image.fromarray(images[fid]);draw=ImageDraw.Draw(im)
  for label in protected:
   p=[(v['x'],v['y']) for v in label['polygon']];draw.line(p+p[:1],fill='#22dd66',width=3)
  for side in ['near','far']:
   for chain in [[side+'Shoulder',side+'Elbow',side+'Wrist'],[side+'Hip',side+'Knee',side+'Ankle',side+'Toe']]:draw.line([(points[n]['x'],points[n]['y']) for n in chain],fill='#dd00aa' if side=='near' else '#00aadd',width=3)
  for n,p in points.items():x,y=p['x'],p['y'];draw.ellipse((x-5,y-5,x+5,y+5),fill='#dd00aa' if p['visibility']=='visible' else '#cccc00')
  im.save(O/f'{fid:03}-overlay.png')
pack=args.source
registration={'format':'gathria-wardrobe-registration','version':1,'sourceSha256':hashlib.sha256(pack.read_bytes()).hexdigest(),'characterId':config['characterId'],'frameWidth':704,'frameHeight':1056,'anchor':{'x':352,'y':998},'frames':sorted(records,key=lambda r:r['frameId'])}
registration_text=json.dumps(registration,separators=(',',':'))+'\n'
(O/'male.registration.json').write_text(registration_text)
if args.registration:
 args.registration.parent.mkdir(parents=True,exist_ok=True)
 args.registration.write_text(registration_text)
# Use the portable font selected above.
for action,ids in actions.items():
 w,h=176,288;sheet=Image.new('RGB',(w*8,h*((len(ids)+7)//8)),'#e8e7dc');d=ImageDraw.Draw(sheet)
 for i,fid in enumerate(ids):
  im=Image.open(O/f'{fid:03}-overlay.png').resize((176,264));x,y=(i%8)*w,(i//8)*h;sheet.paste(im,(x,y+24),im);d.text((x+3,y+3),str(fid),font=font,fill='black')
 sheet.save(O/f'{action}-anchors-review.png')
print('Prepared',len(records),'proposed registrations; 23 manually inspected poses, remaining visible joints flow tracked; hidden joints inferred.')
subprocess.run([
 sys.executable,str(ROOT/'scripts/refine-kling-wardrobe-male-masks.py'),
 '--output',str(P),'--registration',str(O/'male.registration.json')
],check=True)
