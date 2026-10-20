"""Offline mask/registration compiler. It does not draw replacement character art.
Visible pixels come from the complete master. Hidden joint paint comes from the
separately generated supplement; all source images/prompts remain untouched.
"""
from PIL import Image, ImageDraw
import numpy as np
from scipy.ndimage import label, binary_dilation
from pathlib import Path
import json, hashlib, zipfile
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artwork/reference-mother/prepared'
SRC=ROOT/'artwork/reference-mother/source'
OUT.mkdir(parents=True,exist_ok=True)
SIZE=(1024,1536)
def normalize(im):
 a=np.array(im.convert('RGBA')).copy()
 a[:,:,3]=np.minimum(255,np.rint(a[:,:,3].astype(float)*255/253)).astype('uint8')
 a[a[:,:,3]==0]=0
 return Image.fromarray(a)
master=normalize(Image.open(SRC/'master.png'))
# Remove disconnected low-alpha generation residue, preserving a two-pixel AA
# fringe around the one fully connected approved character, never an RGB key.
a=np.array(master);labels,count=label(a[:,:,3]>=16);sizes=np.bincount(labels.ravel());sizes[0]=0
keep=binary_dilation(labels==sizes.argmax(),iterations=2);a[~keep]=0
master=Image.fromarray(a)
supp=normalize(Image.open(SRC/'hidden-parts.png'))
master.save(OUT/'master-hd.png')
A=np.array(master)
def polygon(points):
 m=Image.new('L',SIZE);ImageDraw.Draw(m).polygon(points,fill=255);return np.array(m)>0
Y,X=np.indices((SIZE[1],SIZE[0]))
head=(Y<668)|polygon([(430,610),(590,640),(588,676),(607,710),(589,725),(537,728),(477,714),(428,684)])
torso=polygon([(355,668),(597,668),(648,703),(675,748),(693,798),(697,841),(684,892),(693,936),(709,984),(366,985),(380,955),(394,919),(394,881),(414,850),(441,822),(449,792),(440,755),(418,722),(390,704)])
# Semantic masks, not colour deletion: skin, cuff and cloth remain owned by anatomy.
# Complete partition under the head: the side boundaries follow the actual
# vest seams, then the shorts/hand separation. No torso pixels travel on arms.
left=np.interp(Y,[660,690,725,770,810,840,865,900,950,980,1020,1100,1148],
 [426,391,426,446,443,422,399,394,379,367,338,331,332])
right=np.interp(Y,[660,690,725,770,810,850,900,950,980,1030,1100,1148],
 [599,625,657,683,696,696,683,697,708,717,719,719])
neararm=(Y>=670)&(Y<1148)&(X<left)&~head
fararm=(Y>=690)&(Y<1148)&(X>right)&~head
torso=(Y>=660)&(Y<984)&~neararm&~fararm
lower=(Y>=973)&~neararm&~fararm
nearleg=lower&(X<(540-(np.clip(Y,1050,1150)-1050)*.12))
farleg=lower&~nearleg
hips=lower&(Y<1080)&(Y<np.minimum(1080,1024+.48*np.minimum(np.maximum(0,X-331),np.maximum(0,720-X))))
nearshoe=nearleg&(Y>=1343)
farshoe=farleg&(Y>=1336)
base_masks={'head':head,'torso':torso,'pelvis':hips,
 'near-arm':neararm,'far-arm':fararm,
 'near-leg':nearleg&((Y>=1080)|(((X-449)/118)**2+((Y-1080)/70)**2<1))&(Y<1380),
 'far-leg':farleg&((Y>=1080)|(((X-620)/99)**2+((Y-1080)/70)**2<1))&(Y<1373),
 'near-shoe':nearshoe,'far-shoe':farshoe}
source_joints={
 'nearArm':[[375,767],[311,911],[255,1035]],
 'farArm':[[679,768],[731,918],[777,1037]],
 'nearLeg':[[449,1062],[424,1222],[371,1362]],
 'farLeg':[[620,1062],[624,1222],[619,1351]]}
# Render joint supplements in source coordinates, behind the original visible art.
# Registration is local only for newly painted hidden caps. Original anatomy uses
# one global transform; no independent scaling of visible head/limbs.
patches={}
def patch(name,box,source_anchor,target_anchor,scale,angle,clip):
 cell=Image.new('RGBA',supp.size);cell.paste(supp.crop(box),box[:2])
 import math
 c,s=math.cos(angle),math.sin(angle)
 # inverse of target=target_anchor + scale R (source-source_anchor)
 aa=c/scale;bb=s/scale;dd=-s/scale;ee=c/scale
 cc=source_anchor[0]-aa*target_anchor[0]-bb*target_anchor[1]
 ff=source_anchor[1]-dd*target_anchor[0]-ee*target_anchor[1]
 im=cell.transform(SIZE,Image.Transform.AFFINE,(aa,bb,cc,dd,ee,ff),resample=Image.Resampling.BICUBIC)
 arr=np.array(im);arr[~clip]=0;patches[name]=Image.fromarray(arr)
# Caps hidden under the shirt/shorts at rest, exposed when limb is raised.
patch('near-arm',(685,0,1005,500),(790,107),(375,767),.91,.72,
 ((X-375)**2+(Y-767)**2<95**2)&(Y>673)&(X<460))
patch('far-arm',(1125,0,1455,510),(1232,107),(679,768),.76,-.18,
 ((X-679)**2+(Y-768)**2<72**2)&(Y>696))
patch('near-leg',(100,620,540,890),(326,770),(537,1062),.9,0,
 base_masks['near-leg']&(Y<1140))
patch('far-leg',(100,620,540,890),(326,770),(537,1062),.9,0,
 base_masks['far-leg']&(Y<1140))
# Ankle allowance is painted skin from the leg supplement, under original shoes.
# Original visible limb pixels overwrite it, maintaining exact shading at rest.
parts={}
for name,mask in base_masks.items():
 arr=A.copy();arr[~mask]=0
 im=patches.get(name,Image.new('RGBA',SIZE)).copy();im.alpha_composite(Image.fromarray(arr))
 parts[name]=im
# Restrict supplementation to the approved standing silhouette, because the cap
# overlaps the opaque torso/pelvis there. This still fills hidden shoulder/hip
# regions inside that silhouette; no extra external bulges are introduced.
for name in patches:
 arr=np.array(parts[name]);arr[A[:,:,3]<128]=0
 if name=='near-arm':arr[(Y<850)&~neararm]=0
 if name=='near-leg':arr[~nearleg]=0
 if name=='far-leg':arr[~farleg]=0
 parts[name]=Image.fromarray(arr)
# Split contiguous limbs with overlapping seams. The runtime merges both pieces
# before two-bone deformation. Separate HD hands are retained for future wrists.
def cut(im,mask):
 a=np.array(im);a[~mask]=0;return Image.fromarray(a)
hd={ 'head':parts['head'],'torso':parts['torso'],'pelvis':parts['pelvis'],
 'near-shoe':parts['near-shoe'],'far-shoe':parts['far-shoe']}
runtime={'torso':parts['torso'],'hips':parts['pelvis']}
for side in ['near','far']:
 arm=parts[side+'-arm'];leg=parts[side+'-leg']
 elbow=source_joints[side+'Arm'][1][1];wrist=source_joints[side+'Arm'][2][1]
 knee=source_joints[side+'Leg'][1][1]
 for suffix,img,mask in [
 ('upper-arm',arm,Y<elbow+22),('forearm',arm,(Y>=elbow-22)&(Y<wrist+15)),
 ('hand',arm,Y>=wrist-15),('thigh',leg,Y<knee+24),('shin',leg,Y>=knee-24)]:
  hd[side+'-'+suffix]=cut(img,mask)
 runtime[side+'-upper-arm']=cut(arm,Y<elbow+22)
 runtime[side+'-forearm']=cut(arm,Y>=elbow-22)
 runtime[side+'-thigh']=hd[side+'-thigh'];runtime[side+'-shin']=hd[side+'-shin']
 runtime[side+'-shoe']=parts[side+'-shoe']
for expression in ['neutral','gentle','joyful']:runtime['head-'+expression]=parts['head']
scale=.1555
translate=[96-517*scale,239-1478*scale]
def point(p):return [round(p[0]*scale+translate[0],4),round(p[1]*scale+translate[1],4)]
records=[]
for name,im in hd.items():
 path=OUT/'parts-hd'/f'{name}.png';path.parent.mkdir(exist_ok=True);im.save(path)
 box=im.getbbox();side='near' if name.startswith('near') else 'far'
 if name=='head':pivot=[517,682];parent='torso'
 elif name=='torso':pivot=[537,1027];parent='pelvis'
 elif name=='pelvis':pivot=[537,1062];parent='root'
 elif 'upper-arm' in name:pivot=source_joints[side+'Arm'][0];parent='torso'
 elif 'forearm' in name:pivot=source_joints[side+'Arm'][1];parent=side+'-upper-arm'
 elif 'hand' in name:pivot=source_joints[side+'Arm'][2];parent=side+'-forearm'
 elif 'thigh' in name:pivot=source_joints[side+'Leg'][0];parent='pelvis'
 elif 'shin' in name:pivot=source_joints[side+'Leg'][1];parent=side+'-thigh'
 else:pivot=source_joints[side+'Leg'][2];parent=side+'-shin'
 records.append({'id':name,'file':'parts-hd/'+name+'.png','canvas':[1024,1536],'offset':[0,0],'bounds':box,'pivot':pivot,'runtimePivot':point(pivot),'parent':parent,'supplemented':name.split('-')[0] in ['near','far'] and any(k in name for k in ['arm','thigh']), 'runtimeNote':'hand compiled into forearm; no independent wrist in current renderer' if 'hand' in name else ''})
# Sample each continuous limb BEFORE splitting native slots. Filtering a cropped
# forearm independently brightened its first opaque row and created an elbow seam.
# All overlap pixels now come from one common resample with identical RGB.
nativeY,nativeX=np.indices((256,192));sourceY=(nativeY-translate[1])/scale
for name,im in runtime.items():
 mask=np.ones((256,192),dtype=bool)
 side='near' if name.startswith('near') else 'far'
 if 'arm' in name:
  im=parts[side+'-arm'];elbow=source_joints[side+'Arm'][1][1]
  mask=sourceY<elbow+22 if 'upper' in name else sourceY>=elbow-22
 elif any(t in name for t in ['thigh','shin','shoe']):
  im=parts[side+'-leg'].copy();im.alpha_composite(parts[side+'-shoe'])
  knee=source_joints[side+'Leg'][1][1];ankleCut=1343 if side=='near' else 1336
  if 'thigh' in name:mask=sourceY<knee+24
  elif 'shin' in name:mask=(sourceY>=knee-24)&(sourceY<ankleCut+37)
  else:mask=sourceY>=ankleCut
 out=im.transform((192,256),Image.Transform.AFFINE,(1/scale,0,-translate[0]/scale,0,1/scale,-translate[1]/scale),resample=Image.Resampling.BICUBIC)
 # Existing runtime is crisp binary-alpha pixel composition, while HD keeps AA.
 a=np.array(out);a[(a[:,:,3]<128)|~mask]=0;a[a[:,:,3]>=128,3]=255
 path=OUT/'slots'/f'{name}.png';path.parent.mkdir(exist_ok=True);Image.fromarray(a).save(path)
masterNative=master.transform((192,256),Image.Transform.AFFINE,(1/scale,0,-translate[0]/scale,0,1/scale,-translate[1]/scale),resample=Image.Resampling.BICUBIC)
a=np.array(masterNative);a[a[:,:,3]<128]=0;a[a[:,:,3]>=128,3]=255;Image.fromarray(a).save(OUT/'master-native.png')
# Reassemble HD in the same occlusion order. Source particles outside the masks
# are not silently retained as a flat complete image behind animated parts.
order=['far-arm','far-leg','far-shoe','near-leg','near-shoe','pelvis','torso','near-arm','head']
composite=Image.new('RGBA',SIZE)
for name in order:composite.alpha_composite(parts[name])
composite.save(OUT/'reassembled-hd.png')
registration={'format':'gathria-mother-layer-registration','version':1,'sourceCanvas':[1024,1536],
 'runtimeFrame':[192,256],'anchor':[96,240],'uniformScale':scale,'translation':translate,
 'sourceJoints':source_joints,'chains':{k:[point(p) for p in v] for k,v in source_joints.items()},
 'pivot':point([537,1062]),'neck':point([517,700]),'parts':records,'drawOrder':order,
 'sourceHashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in SRC.iterdir() if p.is_file() and p.name != "README.md"},
 'notes':['Complete generated master retains approved reference identity; generated supplement paints occluded areas, not extracted video layers.',
 'All original visible parts use one uniform source-to-runtime transform. HD is 1024x1536 with smooth alpha; runtime is 192x256 with binary alpha.',
 'Hands are independent HD files but compile into each forearm at runtime. Neutral is the only authored face; required expression slots intentionally alias it.',
 'Skin, face and clothing are painted together within each part, not independently swappable expression/wardrobe layers yet.',
 'Four explicit poses are review stills; existing generic clip library in the project container is not validated as candidate animation.']}
(OUT/'layer-registration.json').write_text(json.dumps(registration,indent=2)+'\n')
with zipfile.ZipFile(OUT/'parts-hd.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted((OUT/'parts-hd').glob('*.png')):z.write(p,p.relative_to(OUT))
 z.write(OUT/'layer-registration.json','layer-registration.json')
print('Prepared',len(hd),'HD parts and',len(runtime),'runtime slots')
