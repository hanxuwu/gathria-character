#!/usr/bin/env python3
"""Bake real painted wedding cloth over exact native side source poses.

The source, reviewed registration, head/hands, shoes, and existing daily banks
are read-only. Only traced donor cloth RGB is transferred. No generated body
pixel or coarse geometric cloth is used. Ownership is source-visible cloth/arm
surface with exact registered hand/head protection.
"""
from __future__ import annotations
import argparse
from functools import lru_cache
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import zipfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'artwork/kling-landing-production/wedding'
DONOR = ART / 'painted-donor.png'
W,H=512,768
YY,XX=np.indices((H,W),dtype=np.float32)
spec=importlib.util.spec_from_file_location('daily_side_cloth',ROOT/'scripts/prepare-kling-side-male-clothing.py')
cloth=importlib.util.module_from_spec(spec);spec.loader.exec_module(cloth)
from kling_side_authoring import load_context,pack_garment
from kling_side_tools import lint_garment

# Manually traced on the actual 1024x1536 painted donor. These polygons select
# artwork only; they never create output garment geometry.
TRACE={
 'torso':[(432,752),(462,765),(508,780),(529,763),(551,784),(576,805),(593,832),(602,870),(609,913),(617,960),(622,1002),(629,1038),(624,1054),(609,1056),(597,1026),(579,1010),(566,1029),(542,1018),(528,1041),(517,1055),(491,1062),(454,1058),(427,1047),(418,1016),(427,973),(437,933),(448,888),(451,852),(432,827),(410,814),(416,781)],
 'near':[(411,803),(436,817),(453,839),(463,863),(461,885),(449,910),(437,932),(429,960),(426,989),(426,1024),(421,1039),(396,1034),(371,1037),(336,1046),(328,1039),(328,1010),(332,967),(340,934),(350,911),(352,884),(361,851),(381,824)],
 'far':[(592,847),(606,871),(611,908),(620,942),(635,970),(647,993),(665,1016),(658,1024),(635,1035),(626,1039),(615,1002),(608,964),(604,930),(596,895)],
 'trousers':[(432,1048),(472,1058),(506,1058),(528,1045),(543,1020),(565,1030),(579,1013),(599,1031),(612,1048),(624,1058),(624,1095),(619,1136),(616,1177),(614,1217),(611,1252),(616,1280),(608,1286),(582,1286),(558,1298),(531,1306),(504,1305),(496,1296),(498,1258),(493,1220),(490,1184),(501,1150),(509,1106),(487,1157),(475,1190),(466,1229),(469,1263),(476,1305),(463,1304),(439,1313),(414,1322),(383,1321),(361,1317),(358,1299),(361,1268),(365,1227),(376,1197),(386,1167),(384,1129),(391,1105),(417,1107),(429,1089)],
}
ARM_DONOR={'near':{'chain':[[406,848],[385,934],[377,1032]],'width':[48,47,46]},
 'far':{'chain':[[594,871],[619,956],[643,1025]],'width':[17,18,19]}}
# Native source sole-only review: accepted daily pants incorrectly owned a
# small front-sole fragment and transparent pixels under it in frame57.
# This wedding edition restores the exact source here; daily is unchanged.
SOLE_GUARDS={57:[[215,690,326,716]]}
SLEEVE_GUIDES={r['frameId']:r['nearShoulder'] for r in json.loads((ROOT/'artwork/kling-side-fitting/male/sleeve-guides.json').read_text())['frames']}
# Source-observed CLOTH texture guides for two badly compressed arm anchors.
# The exact original registered joints/protection and output silhouette stay.
ARM_SAMPLE_GUIDES={102:[[212,470],[160,501],[170,530]],103:[[220,480],[174,522],[201,547]]}
LEG_DONOR={'near':{'chain':[[457,1091],[421,1200],[420,1310]],'width':[48,49,54]},
 'far':{'chain':[[568,1085],[554,1190],[554,1295]],'width':[47,49,55]}}


def sha(data):return hashlib.sha256(data).hexdigest()
def point(p,k):return np.array([p[k]['x'],p[k]['y']],np.float32)
def trace_mask(poly):
 im=Image.new('L',(1024,1536));ImageDraw.Draw(im).polygon(poly,fill=255);return np.asarray(im)>0

@lru_cache(maxsize=4)
def donor_texture(region):
 raw=np.asarray(Image.open(DONOR).convert('RGBA'));rgb=raw[:,:,:3].astype(np.float32)
 valid=trace_mask(TRACE[region]);r,g,b=rgb.transpose(2,0,1)
 # Only the actual painted fabric: alpha is not geometry and background is
 # excluded even though this generated donor has soft translucent halo pixels.
 navy=(b>r+4)&(b>g-4)&(b>35)
 ivory=(r>160)&(g>145)&(b>115)&((r-g)<40)
 detail=(r>g+24)&(r>b+35)&(r>150)
 if region=='torso':
  # Coral tie and boutonniere are allowed only in separately inspected garment
  # detail windows; identical skin hue outside them is excluded.
  y,x=np.indices(valid.shape)
  detail &= (((x>=514)&(x<=569)&(y>=785)&(y<=883))|((x>=573)&(x<=622)&(y>=807)&(y<=875)))
 else:detail[:]=False
 valid &= (navy|ivory|detail)&(raw[:,:,3]>100)
 # Keep fold/lapel ink from the manually enclosed interior, while excluding
 # warm skin at open cuffs. Fill UV padding from plain navy only.
 interior=nd.binary_erosion(trace_mask(TRACE[region]),iterations=3)
 dark=(rgb.max(axis=2)<100)
 valid |= interior&dark&(raw[:,:,3]>100)
 plain=nd.binary_erosion(valid,iterations=4)&navy
 if region=='trousers':valid &= ~ivory;plain=nd.binary_erosion(valid,iterations=4)&navy
 _,idx=nd.distance_transform_edt(~plain,return_indices=True)
 texture=rgb[tuple(idx)];texture[valid]=rgb[valid]
 # Native artwork is roughly 100px across: cloth-local filtering removes
 # resampling specks without touching source pixels or ownership.
 texture=nd.gaussian_filter(texture,sigma=(.6,.6,0))
 return texture,valid


def sample(region,sx,sy):
 rgb,_=donor_texture(region)
 return np.stack([nd.map_coordinates(rgb[:,:,c],[sy,sx],order=1,mode='nearest') for c in range(3)],axis=-1)


def unpack_bank(path):
 with zipfile.ZipFile(path) as z:
  m=json.loads(z.read('manifest.json'));pages=[np.asarray(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA')) for p in m['pages']];masks=[np.asarray(Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA'))[:,:,3]>0 for p in m['pages']]
  out={}
  for f in m['frames']:
   r,o=f['rect'],f['offset'];crop=np.s_[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']];dest=np.s_[o['y']:o['y']+r['height'],o['x']:o['x']+r['width']]
   patch=np.zeros((H,W,4),np.uint8);owned=np.zeros((H,W),bool);patch[dest]=pages[f['page']][crop];owned[dest]=masks[f['page']][crop]
   assert not patch[~owned].any();out[f['frameId']]=(patch,owned)
  return m,out


def chain_sample(region,chain,donor,width,region_mask):
 """Continuous painted cloth coordinate field on the source anchor chain."""
 a,b,c=chain;d0,t0,c0=cloth.segment(a,b);d1,t1,c1=cloth.segment(b,c)
 l0=np.linalg.norm(b-a);l1=np.linalg.norm(c-b);frac=l0/max(l0+l1,1)
 # Forearm wins its true visible domain at a folded elbow; smooth only the
 # cloth's UV field at the join, never the anatomical output silhouette.
 choose=d1<d0
 along=np.where(choose,l0+np.clip(t1,0,1)*l1,np.clip(t0,-.33,1)*l0)
 cross=np.where(choose,c1,c0)
 # Smooth the donor coordinate field at the actual elbow/knee instead of
 # creating a hard nearest-segment texture seam through bent cloth.
 weight=1/(1+np.exp(np.clip((d1*d1-d0*d0)/180,-30,30)))
 joint=(np.hypot(XX-b[0],YY-b[1])<35)&(t0>.4)&(t1<.6)
 along=np.where(joint,np.clip(t0,-.33,1)*l0*(1-weight)+(l0+np.clip(t1,0,1)*l1)*weight,along)/max(l0+l1,1)
 cross=np.where(joint,c0*(1-weight)+c1*weight,cross)
 first=along<=frac
 phase=np.clip(np.where(first,along/max(frac,.01),(along-frac)/max(1-frac,.01)),-.33,1)
 da,db,dc=np.array(donor['chain'],float);v0=db-da;v1=dc-db
 center=np.where(first[:,:,None],da+phase[:,:,None]*v0,db+phase[:,:,None]*v1)
 direction=np.where(first[:,:,None],v0/np.linalg.norm(v0),v1/np.linalg.norm(v1));normal=np.stack([-direction[:,:,1],direction[:,:,0]],axis=-1)
 widths=donor['width'];dw=np.where(first,widths[0]*(1-phase)+widths[1]*phase,widths[1]*(1-phase)+widths[2]*phase)
 coords=center+normal*(np.clip(cross/width,-.94,.94)*dw)[:,:,None]
 return sample(region,coords[:,:,0],coords[:,:,1]),np.minimum(d0,d1),along


def fit_top(ctx,fid,masks,limbs,baseline):
 original=ctx.frames[fid];p=ctx.registered[fid]['points'];protected=ctx.protected_mask(fid)
 daily,daily_owned=baseline;neck=point(p,'neck');wl,wr=point(p,'waistLeft'),point(p,'waistRight');waist=(wl+wr)/2
 wy=wl[1]+(XX-wl[0])*(wr[1]-wl[1])/max(1,wr[0]-wl[0]);torso=masks['top'].copy()
 extent=np.percentile((YY-wy)[torso],99.8)
 # Use the observed top-cloth neckline per column. A scalar neck y would
 # stamp a rectangular collar across the folded shoulder in compressed poses.
 columns=np.flatnonzero(torso.any(axis=0));tops=[np.flatnonzero(torso[:,c])[0] for c in columns]
 top_line=nd.gaussian_filter1d(np.interp(np.arange(W),columns,tops),2)[None,:]
 v=np.clip((YY-top_line)/np.maximum(40,wy+extent-top_line),0,1)
 center=neck[0]*(1-v)+waist[0]*v;width=max(70,wr[0]-wl[0])*(1.15-.15*v);u=(XX-center)/width
 sx=477*(1-v)+525*v+u*(183*(1-v)+190*v)
 # The donor's own ivory neckline also slopes. Sampling a constant y758
 # above its collar repeats navy padding as a false second neck band.
 donor_mask=donor_texture('torso')[1];dc=np.flatnonzero(donor_mask.any(axis=0));dy=[np.flatnonzero(donor_mask[:,c])[0] for c in dc]
 donor_top=np.interp(np.clip(sx,dc.min(),dc.max()),dc,dy)+2
 sy=donor_top*(1-v)+1050*v
 rgb=sample('torso',sx,sy);torso_rgb=rgb.copy()
 arms=limbs['nearArm']|limbs['farArm']
 # Current accepted top ownership preserves the reviewed shoulder silhouette;
 # long sleeves add only the source-visible arm surface ending at protection.
 core=(daily_owned|arms)&~protected&~masks['bottom']&~cloth.shoe_guard(original,masks,fid)
 alpha=daily[:,:,3].copy();new=core&~daily_owned;alpha[new]=original[new,3]
 for side in ('far','near'):
  chain=[point(p,side+n) for n in ('Shoulder','Elbow','Wrist')]
  if side=='near' and fid in SLEEVE_GUIDES: chain[0]=np.array(SLEEVE_GUIDES[fid],np.float32)
  if side=='near' and fid in ARM_SAMPLE_GUIDES:chain=[np.array(v,np.float32) for v in ARM_SAMPLE_GUIDES[fid]]
  region=limbs[side+'Arm']
  if side=='near' and fid not in SLEEVE_GUIDES and fid not in ARM_SAMPLE_GUIDES:
   vector=chain[1]-chain[0];length=max(1,np.linalg.norm(vector))
   # On raised source arms the registered attachment sits below the visible
   # sleeve cap. Measure a CLOTH sampling guide on that visible source cap;
   # never move anatomy, the saved anchor, protection, or owned silhouette.
   if abs(vector[1])/length<.7 or length<35:
    _,upper_phase,_=cloth.segment(chain[0],chain[1]);cap=region&(np.hypot(XX-chain[0][0],YY-chain[0][1])<66)
    if length>=35:cap &= (upper_phase<.45)&(upper_phase>-.4)
    if cap.sum()>80:
     observed=float(np.percentile(YY[cap],10))+9
     if observed<chain[0][1]-24:chain[0]=np.array([chain[0][0]-5,observed],np.float32)
  values=[]
  for a,b in zip(chain,chain[1:]):
   dist,phase,cross=cloth.segment(a,b);sel=region&(phase>=0)&(phase<=1);values.extend(abs(cross[sel]).tolist())
  measured=np.percentile(values,85) if len(values)>30 else (23 if side=='near' else 16)
  measured=float(np.clip(measured,17 if side=='near' else 10,31 if side=='near' else 23))
  color,distance,along=chain_sample(side,chain,ARM_DONOR[side],measured,region)
  # Existing shirt sleeve's small transparent allowance uses the nearest
  # source-visible arm, retaining its established shoulder attachment.
  arm_dist,indices=nd.distance_transform_edt(~region,return_indices=True)
  domain=region|((arm_dist<3)&daily_owned&~torso)
  rgb[domain]=color[domain]
  # Only a source-pinned shoulder cloth seam is blended. Wrist and hand edge
  # pixels remain governed by the exact source protection, never a soft mask.
  ds=nd.distance_transform_edt(~domain);dt=nd.distance_transform_edt(~torso)
  join=(np.hypot(XX-chain[0][0],YY-chain[0][1])<58)&(domain|torso)&(v<.70)
  signed=np.where(domain,dt,-ds);weight=np.clip(.5+signed/28,0,1)
  blend=torso_rgb*(1-weight[:,:,None])+color*weight[:,:,None]
  rgb[join&(abs(signed)<14)]=blend[join&(abs(signed)<14)]
 # Cloth under the retained native anti-aliased contour is painted material.
 # No detached body/hand silhouette is introduced.
 patch=np.zeros_like(original);patch[core,:3]=np.rint(np.clip(rgb[core],0,255)).astype(np.uint8);patch[core,3]=alpha[core]
 assert not (core&protected).any()
 return patch,core



def lower_source_foot_guard(masks,source=None):
 """Protect the observed lower white-shoe contour and its original sole.

 Each local shoe component is handled independently. The guard extends only
 around its lower half, so the calf/ankle attachment above the white upper
 remains available to cloth. It restores source pixels; it paints no shoe.
 """
 labels,count=nd.label(masks['shoes']);guard=np.zeros((H,W),bool)
 for label in range(1,count+1):
  component=labels==label
  if component.sum()<80:continue
  ys,xs=np.where(component);mid=(ys.min()+ys.max())/2
  local=nd.distance_transform_edt(~component)<=9
  guard |= local&(YY>=mid)&(YY<=ys.max()+8)
 if source is not None:
  r,g,b=source[:,:,:3].astype(np.int16).transpose(2,0,1)
  warm=(r>140)&(g>70)&(r-g>25)&(g-b>15)
  # The broad light upper and dark sole boundary belong to the same shoe.
  # Retain original non-skin edge/matte pixels around tilted footwear too.
  guard |= (nd.distance_transform_edt(~masks['shoes'])<=10)&~warm&~masks['skin']
 return guard


def fit_bottom(ctx,fid,masks,limbs,baseline):
 original=ctx.frames[fid];p=ctx.registered[fid]['points'];daily,base_owned=baseline
 owned=base_owned.copy()
 owned &= ~lower_source_foot_guard(masks,original)
 for x0,y0,x1,y1 in SOLE_GUARDS.get(fid,[]):owned[y0:y1,x0:x1]=False
 colors={};distances={}
 for side in ('far','near'):
  chain=[point(p,side+n) for n in ('Hip','Knee','Ankle')]
  s,cross,fraction,d0,d1=cloth.leg_field(chain)
  measured=np.abs(cross[limbs[side+'Leg']]);width=float(np.percentile(measured,92)) if len(measured)>40 else 24
  width=np.clip(width,19,36)
  colors[side],distances[side],_=chain_sample('trousers',chain,LEG_DONOR[side],width,limbs[side+'Leg'])
 near=limbs['nearLeg']|(masks['bottom']&(distances['near']<=distances['far']))
 rgb=np.where(near[:,:,None],colors['near'],colors['far'])
 wl,wr=point(p,'waistLeft'),point(p,'waistRight');wy=(wl[1]+wr[1])/2;hip=(p['nearHip']['y']+p['farHip']['y'])/2
 v=np.clip((YY-wy)/max(35,hip+18-wy),0,1)
 rows=np.flatnonzero(masks['bottom'].any(axis=1));left=[np.flatnonzero(masks['bottom'][r])[0] for r in rows];right=[np.flatnonzero(masks['bottom'][r])[-1] for r in rows]
 l=nd.gaussian_filter1d(np.interp(np.arange(H),rows,left),3)[:,None];r=nd.gaussian_filter1d(np.interp(np.arange(H),rows,right),3)[:,None]
 u=np.clip((XX-l)/np.maximum(r-l,45),.03,.97);pelvis=sample('trousers',430+u*185,1063+v*78)
 blend=np.clip((.78-v)/.36,0,1)*masks['bottom'];rgb=pelvis*blend[:,:,None]+rgb*(1-blend[:,:,None])
 # Exact accepted full-trouser silhouette and every alpha byte are reused.
 patch=np.zeros_like(original);patch[owned,:3]=np.rint(np.clip(rgb[owned],0,255)).astype(np.uint8);patch[owned,3]=daily[owned,3]
 assert not (owned&ctx.protected_mask(fid)).any()
 return patch,owned.copy()



# Raised sleeve revision: actual painted arm cloth, source-visible controls,
# and an authored curved cuff. These guides never move source body pixels.
RAISED_SLEEVE_FRAMES=(63,64,65,66,74,75,76,77,78,79,80,97,98,99,100,101)
RAISED_DONOR=ART/'sleeve-refinement/raised-arm-donor.png'
RAISED_TRACE=[(406,511),(418,525),(427,551),(426,579),(415,609),(403,636),(379,642),(347,637),(322,629),(296,621),(279,622),(274,635),(263,628),(264,611),(251,593),(231,582),(209,576),(188,579),(184,570),(193,554),(210,539),(236,526),(264,517),(294,512),(320,515),(340,517),(358,511),(384,508)]
RAISED_DONOR_CONTROLS=np.array([[188,574],[230,578],[268,605],[274,627],[300,513],[406,511],[424,574],[409,642],[340,634]],float)
RAISED_SOURCE_CONTROLS={
 75:[[153,282],[160,287],[164,305],[158,325],[181,278],[208,278],[221,310],[221,344],[185,328]],
 76:[[155,284],[162,291],[167,317],[160,340],[185,294],[223,313],[231,343],[207,373],[183,349]],
 77:[[146,307],[153,314],[158,340],[152,365],[181,322],[232,350],[238,380],[212,409],[180,379]],
 100:[[193,356],[201,364],[205,389],[200,416],[213,369],[228,372],[242,407],[219,442],[216,428]],
 101:[[184,412],[193,420],[197,445],[191,473],[209,421],[229,424],[244,459],[220,493],[211,480]],
 78:[[160,361],[168,367],[172,387],[166,407],[193,369],[229,387],[245,419],[234,458],[198,418]],
}

@lru_cache(maxsize=1)
def raised_sleeve_texture():
 raw=np.asarray(Image.open(RAISED_DONOR).convert('RGBA'))
 mask=Image.new('L',(1024,1536));ImageDraw.Draw(mask).polygon(RAISED_TRACE,fill=255)
 valid=np.array(mask)>0;r,g,b=raw[:,:,:3].astype(float).transpose(2,0,1)
 # The manual trace selects cloth; exclude warm hand anti-aliasing at its cuff.
 skin=(r-g>40)&(r-b>55)&(r>140);valid &= ~skin&(raw[:,:,3]>100)
 plain=nd.binary_erosion(valid,iterations=4)&(b>r+5)&(g>r-5)
 _,idx=nd.distance_transform_edt(~plain,return_indices=True)
 tex=raw[:,:,:3][tuple(idx)].astype(float);tex[valid]=raw[valid,:3]
 return nd.gaussian_filter(tex,sigma=(.45,.45,0)),valid


def raised_source_controls(region,hand_mask,torso,fid):
 if fid in RAISED_SOURCE_CONTROLS:return np.array(RAISED_SOURCE_CONTROLS[fid],float)
 cuff=region&(nd.distance_transform_edt(~hand_mask)<=2.1)
 edge=region&(nd.distance_transform_edt(~torso)<=2.1)
 if cuff.sum()<8:cuff=region&(nd.distance_transform_edt(~hand_mask)<=5)
 if edge.sum()<8:edge=region&(nd.distance_transform_edt(~torso)<=5)
 assert cuff.sum()>=4 and edge.sum()>=4,(fid,'No observed sleeve attachment')
 def endpoint(mask,high):
  ys=YY[mask];limit=np.percentile(ys,95 if high else 5)
  selected=mask&((YY>=limit) if high else (YY<=limit))
  return np.array([np.mean(XX[selected]),np.mean(YY[selected])])
 ct,cb=endpoint(cuff,False),endpoint(cuff,True);cm=(ct+cb)/2
 st,sb=endpoint(edge,False),endpoint(edge,True)
 st += [-3,-4];sb += [-1,0]
 midy=(st[1]+sb[1])/2;mid=edge&(abs(YY-midy)<5)
 sm=np.array([np.mean(XX[mid]) if mid.any() else (st[0]+sb[0])/2,midy])
 def contour(x,lower):
  local=region&(abs(XX-x)<4)
  if not local.any():return np.array([x,(ct[1]+st[1])/2])
  return np.array([x,np.percentile(YY[local],97 if lower else 3)])
 crown=contour(ct[0]+.4*(st[0]-ct[0]),False)
 lower=contour(cb[0]+.45*(sb[0]-cb[0]),True)
 return np.array([ct+[-5,-6],ct+[3,0],cm+[7,0],cb+[1,0],crown,st,sm,sb,lower])


def refine_raised_sleeve(ctx,fid,masks,limbs,baseline):
 """Transfer the painted raised sleeve only within the existing arm passage.

 The curved cut is the donor's actual cloth contour. It releases old ownership
 beside the wrist to restore exact source skin. A reviewed 32-pixel enclosed
 classification hole in frame78 also receives cloth. Neither operation can
 cover a protected hand, change source geometry, or change unrelated cloth.
 """
 from scipy.interpolate import RBFInterpolator
 patch,owned=baseline
 if fid not in RAISED_SLEEVE_FRAMES:return (patch.copy(),owned.copy()),None
 source=ctx.frames[fid];arms=limbs['nearArm']|limbs['farArm']
 labels,count=nd.label(arms)
 components=[labels==i for i in range(1,count+1) if (labels==i).sum()>80]
 assert components,(fid,'Missing source-visible raised arm')
 # Some old guides call both disconnected arms nearArm. Visible component
 # ownership is unchanged; only the left/near cloth sampling domain is chosen.
 left=[m for m in components if float(np.mean(XX[m]))<ctx.registered[fid]['points']['neck']['x']]
 region=max(left or components,key=lambda m:int(m.sum()))
 hand_mask=np.zeros((H,W),bool)
 for rec in ctx.registered[fid]['protected']:
  if rec['label'].endswith('Hand'):hand_mask |= cloth.runtime_raster(rec['polygon'])
 hand_mask &= source[:,:,3]>0
 points=raised_source_controls(region,hand_mask,masks['top'],fid)
 tex,valid=raised_sleeve_texture()
 coords=RBFInterpolator(points,RAISED_DONOR_CONTROLS,kernel='thin_plate_spline',smoothing=.2)(np.column_stack((XX.ravel(),YY.ravel()))).reshape(H,W,2)
 rgb=np.stack([nd.map_coordinates(tex[:,:,i],[coords[:,:,1],coords[:,:,0]],order=1,mode='nearest') for i in range(3)],axis=-1)
 inside=nd.map_coordinates(valid.astype(float),[coords[:,:,1],coords[:,:,0]],order=1,mode='constant')>.5
 distance=nd.distance_transform_edt(~region)
 domain=owned&(region|((distance<=3)&~masks['top']))
 # Frame78 has a small source-skin classification hole fully enclosed by the
 # jacket. Close only that reviewed hole with this same real donor texture.
 added=np.zeros_like(owned)
 if fid==78:
  reviewed=(XX>=208)&(XX<=219)&(YY>=451)&(YY<=462)
  added=nd.binary_fill_holes(owned)&~owned&reviewed&(source[:,:,3]>0)&~ctx.protected_mask(fid)
  assert 0<int(added.sum())<80
 domain |= added
 # Confine donor-contour release to the cuff's actual hand-side boundary.
 # Clipping its underarm edge would leave an unrelated bare skin wedge.
 cuff_zone=(XX<points[2,0]+1)&(YY<=points[3,1]+2)
 removed=domain&cuff_zone&~inside
 result=patch.copy();after_owned=owned|added;after_owned[removed]=False;result[removed]=0
 result[added,3]=source[added,3]
 use=domain&after_owned
 blend=np.clip(nd.distance_transform_edt(~masks['top'])/8,.3,1)
 fitted=rgb*blend[:,:,None]+patch[:,:,:3]*(1-blend[:,:,None]);fitted[added]=rgb[added]
 result[use,:3]=np.rint(np.clip(fitted[use],0,255)).astype(np.uint8)
 assert not (after_owned&ctx.protected_mask(fid)).any()
 assert not result[~after_owned].any()
 assert np.array_equal(result[~domain],patch[~domain])
 assert np.array_equal(after_owned[~domain],owned[~domain])
 assert np.array_equal(result[use&owned,3],patch[use&owned,3])
 restored=np.where(removed[:,:,None],source,0)
 ys,xs=np.where(domain)
 record={'frameId':fid,'clothSamplingControls':points.tolist(),'domainPixels':int(domain.sum()),'domainBounds':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],'restoredSourceHandAndWristPixels':int(removed.sum()),'newOwnershipPixels':int(added.sum()),'closedSourceClassificationHoleBounds':([208,451,220,463] if added.any() else None),'protectedChanges':0,'outsideSleeveDomainExact':True,'retainedOwnedAlphaExact':True,'restoredSourceRgbaSha256':sha(restored.tobytes())}
 return (result,after_owned),record


def refine_raised_sleeve_bank(output,baseline_top=None):
 """Bounded, reproducible revision from the immutable PR62 V1 top bank."""
 import subprocess
 output=Path(output);output.mkdir(parents=True,exist_ok=True)
 if baseline_top is None:
  data=subprocess.run(['git','show','f67235d:artwork/kling-landing-production/wedding/bases/male-wedding-top.garment.zip'],cwd=ROOT,check=True,stdout=subprocess.PIPE).stdout
  baseline_top=output/'before-top.garment.zip';baseline_top.write_bytes(data)
 else:baseline_top=Path(baseline_top);data=baseline_top.read_bytes()
 assert sha(data)=='e2237caebaa728128fee2e0a77e2b96ef6d88e3b60e7b0440fbaee866893254b','Expected immutable PR62 V1 wedding top'
 ctx=cloth.NativeContext(ROOT/'artwork/kling-side-expansion/templates/male.registration.json')
 manifest,before=unpack_bank(baseline_top)
 _,bottom=unpack_bank(ART/'bases/male-wedding-bottom.garment.zip')
 after={fid:(p.copy(),m.copy()) for fid,(p,m) in before.items()};records=[]
 for fid in RAISED_SLEEVE_FRAMES:
  masks=ctx.masks(fid);limbs=cloth.limbs(ctx,fid,masks)
  after[fid],record=refine_raised_sleeve(ctx,fid,masks,limbs,before[fid]);records.append(record)
 composites={};changed=[]
 for fid in ctx.frames:
  a=compose(ctx.frames[fid],before[fid],bottom[fid]);b=compose(ctx.frames[fid],after[fid],bottom[fid])
  assert np.array_equal(a[ctx.protected_mask(fid)],b[ctx.protected_mask(fid)])
  if not np.array_equal(a,b):changed.append(fid)
  composites[fid]=(a,b)
  if fid in RAISED_SLEEVE_FRAMES:
   for name,im in [('before',a),('after',b)]:Image.fromarray(im,'RGBA').save(output/f'{fid}-{name}.png')
   Image.fromarray(after[fid][0],'RGBA').save(output/f'{fid}-patch.png')
   mask=np.zeros_like(after[fid][0]);mask[:,:,3]=after[fid][1].astype(np.uint8)*255;Image.fromarray(mask,'RGBA').save(output/f'{fid}-ownership.png')
 assert changed==list(RAISED_SLEEVE_FRAMES),changed
 for record in records:
  fid=record['frameId'];record['artifactSha256']={name:sha((output/f'{fid}-{name}.png').read_bytes()) for name in ('before','after','patch','ownership')}
  record['patchRgbaSha256']=sha(after[fid][0].tobytes());record['ownershipBinarySha256']=sha(after[fid][1].tobytes())
 shared=load_context('male',root=ROOT,registration_path=ctx.registration_path)
 path=output/'male-wedding-top.garment.zip'
 provenance=manifest['provenance']+' Raised-arm sleeve revision uses a separately generated and manually traced cloth-only donor, source-visible cuff/shoulder controls and its actual curved cloth edge. Source wrist skin is restored where prior ownership formed a squared flap; a reviewed 32-pixel enclosed source-classification hole in frame78 receives cloth. No body, joint, head, hand or source-timing change; unaffected poses remain pixel exact. Reproduce with --refine-raised-sleeves.'
 report=pack_garment(shared,manifest['id'],manifest['name'],manifest['slot'],{fid:v[0] for fid,v in after.items()},path,provenance,ownership={fid:v[1] for fid,v in after.items()},painting_mode='patch')
 lint=lint_garment(shared,path);assert lint['ok'],lint
 _,decoded=unpack_bank(path)
 for fid,(patch,own) in after.items():assert np.array_equal(decoded[fid][0],patch) and np.array_equal(decoded[fid][1],own)
 # Native same-frame contacts include the actual original source for context.
 for index in range(0,len(changed),4):
  ids=changed[index:index+4];sheet=Image.new('RGB',(360*len(ids),3*360),'#eee8dd');draw=ImageDraw.Draw(sheet)
  for col,fid in enumerate(ids):
   points=ctx.registered[fid]['points'];y0=int(points['neck']['y'])-100;box=(60,y0,420,y0+330)
   for row,pixels in enumerate((ctx.frames[fid],*composites[fid])):
    im=Image.fromarray(pixels).crop(box);sheet.paste(im,(col*360,row*360+24),im);draw.text((col*360+6,row*360+5),f'{fid} '+['source','before','after'][row],fill='#171717')
  sheet.save(output/f'contact-{index//4}.png')
 for fid in (75,78):
  y0=int(records[changed.index(fid)]['clothSamplingControls'][0][1])-18;box=(80,y0,280,y0+180)
  sheet=Image.new('RGB',(1200,390),'#eee8dd');draw=ImageDraw.Draw(sheet)
  for col,pixels in enumerate((ctx.frames[fid],*composites[fid])):
   im=Image.fromarray(pixels).crop(box).resize((400,360),Image.Resampling.NEAREST);sheet.paste(im,(col*400,30),im);draw.text((col*400+8,8),f'{fid} '+['source','before','after'][col],fill='#171717')
  sheet.save(output/f'{fid}-comparison-2x.png')
 clip=ctx.manifest['animations']['jump'];frames=[]
 for fid in clip['frames']:
  panel=Image.new('RGB',(512,408),'#eee8dd');draw=ImageDraw.Draw(panel)
  for col,pixels in enumerate(composites[fid]):
   im=Image.fromarray(pixels).resize((256,384),Image.Resampling.LANCZOS);panel.paste(im,(col*256,24),im);draw.text((col*256+6,6),f'{"Before" if col==0 else "After"} / {fid} / 24fps',fill='#171717')
  frames.append(panel)
 palette_board=Image.new('RGB',(512,408*len(frames)))
 for i,im in enumerate(frames):palette_board.paste(im,(0,i*408))
 palette=palette_board.quantize(colors=256);encoded=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in frames]
 durations=[round((i+1)*100/24)*10-round(i*100/24)*10 for i in range(len(frames))]
 encoded[0].save(output/'jump-before-after-24fps.gif',save_all=True,append_images=encoded[1:],duration=durations,loop=0,disposal=2,optimize=False)
 audit={'format':'gathria-wedding-raised-sleeve-refinement','version':1,'baselineCommit':'f67235d','baselineTopSha256':sha(data),'resultTopSha256':report['sha256'],'sourceSha256':sha(ctx.source_bytes),'registrationSha256':sha(ctx.registration_bytes),'donorSha256':sha(RAISED_DONOR.read_bytes()),'changedFrameIds':changed,'unchangedFrameIds':[fid for fid in ctx.frames if fid not in changed],'bottomUnchanged':True,'bottomSha256':sha((ART/'bases/male-wedding-bottom.garment.zip').read_bytes()),'sourceAnatomyAndProtectedPixelsExact':True,'newOwnershipPixels':sum(r['newOwnershipPixels'] for r in records),'records':records,'pack':report,'lint':lint,'gif':{'file':'jump-before-after-24fps.gif','frames':len(frames),'fps':24,'durationMs':sum(durations),'comparisonOnly':True}}
 (output/'audit.json').write_text(json.dumps(audit,indent=2)+'\n')
 print(json.dumps({'changed':changed,'sha256':report['sha256'],'lint':lint['ok'],'output':str(output)}),flush=True)


class ExtensionContext:
 """Native garment context for explicitly supplied new poses only.

 Source RGBA and manually reviewed registration are authoritative. Semantic
 masks are derived anew from these pixels; no original video frame mask is
 attached to a new frame ID. This adapter never edits source or registration.
 """
 def __init__(self,source_pngs:dict[int,Path],registration:dict,masks_dir:Path|None=None):
  from kling_side_authoring import runtime_polygon_mask
  self.frames={int(fid):np.array(Image.open(path).convert('RGBA')) for fid,path in source_pngs.items()}
  assert self.frames and all(a.shape==(H,W,4) for a in self.frames.values())
  self.registration=registration
  records=registration['frames'] if isinstance(registration,dict) else registration
  self.registered={r['frameId']:r for r in records if r['frameId'] in self.frames}
  assert set(self.frames)==set(self.registered),'Missing manually reviewed new-frame registration'
  self.source_registered=self.registered
  self.registration_bytes=(json.dumps(registration,separators=(',',':'))+'\n').encode()
  self.source_bytes=b''.join(a.tobytes() for _,a in sorted(self.frames.items()))
  self._protected={};self._masks={};self.mask_audits=[]
  module_spec=importlib.util.spec_from_file_location('side_material_registration',ROOT/'scripts/prepare-kling-side-registration.py')
  material=importlib.util.module_from_spec(module_spec);module_spec.loader.exec_module(material)
  for fid,source in self.frames.items():
   rec=self.registered[fid];protected=np.zeros((H,W),bool)
   for region in rec['protected']:protected |= runtime_polygon_mask(region['polygon'])
   protected &= source[:,:,3]>0
   self._protected[fid]=protected
   if masks_dir:
    masks={}
    for slot in ('top','bottom','shoes','skin'):
     paths=[Path(masks_dir)/f'{fid}-{slot}.png',Path(masks_dir)/f'{fid:04d}-{slot}.png']
     path=next((p for p in paths if p.exists()),None)
     assert path is not None,f'Missing new-frame mask {fid}/{slot}'
     image=np.asarray(Image.open(path).convert('L'));assert image.shape==(H,W) and np.isin(image,[0,255]).all()
     masks[slot]=image>0
   else:
    masks,skin,_,_,_=material.materials(source,rec['points'],[])
    masks['skin']=skin
   for slot in ('top','bottom','shoes'):
    masks[slot] &= ~protected
    assert masks[slot].any(),f'Empty source-observed material {fid}/{slot}'
    assert not (masks[slot]&(source[:,:,3]==0)).any()
   self._masks[fid]=masks
   self.mask_audits.append({'frameId':fid,'sourceRgbaSha256':sha(source.tobytes()),'method':'existing source-native materials() seeds/nearest local outlines on this exact new source; reviewed registration only; no old frame masks','protectedPixels':int(protected.sum()),'counts':{k:int(v.sum()) for k,v in masks.items()}})
 def masks(self,fid):return self._masks[fid]
 def protected_mask(self,fid):return self._protected[fid]
 def write_masks(self,output):
  output=Path(output);output.mkdir(parents=True,exist_ok=True)
  for fid,masks in self._masks.items():
   for slot,mask in masks.items():Image.fromarray(mask.astype(np.uint8)*255,'L').save(output/f'{fid}-{slot}.png')
  (output/'audit.json').write_text(json.dumps(self.mask_audits,indent=2)+'\n')


def write_extension_wedding(ctx,daily_dir,output):
 """Write full-native patches for the final 109-frame binder to append."""
 output=Path(output);output.mkdir(parents=True,exist_ok=True);daily_dir=Path(daily_dir);report=[]
 for fid,source in ctx.frames.items():
  baseline={}
  for slot in ('top','bottom'):
   patch=np.array(Image.open(daily_dir/f'{fid}-{slot}-patch.png').convert('RGBA'))
   image=Image.open(daily_dir/f'{fid}-{slot}-ownership.png')
   own=np.array(image.getchannel('A') if image.mode=='RGBA' else image.convert('L'))>0
   assert patch.shape==(H,W,4) and own.shape==(H,W) and not patch[~own].any()
   baseline[slot]=(patch,own)
  masks=ctx.masks(fid);limbs=cloth.limbs(ctx,fid,masks)
  top=fit_top(ctx,fid,masks,limbs,baseline['top']);bottom=fit_bottom(ctx,fid,masks,limbs,baseline['bottom'])
  composite=compose(source,top,bottom);union=top[1]|bottom[1]
  assert np.array_equal(composite[ctx.protected_mask(fid)],source[ctx.protected_mask(fid)])
  assert np.array_equal(composite[~union],source[~union])
  slots={}
  for slot,(patch,owned) in [('top',top),('bottom',bottom)]:
   path=output/f'{fid}-{slot}-patch.png';mask_path=output/f'{fid}-{slot}-ownership.png'
   Image.fromarray(patch,'RGBA').save(path)
   binary=np.zeros_like(patch);binary[:,:,3]=owned.astype(np.uint8)*255;Image.fromarray(binary,'RGBA').save(mask_path)
   slots[slot]={'frameId':fid,'patch':str(path),'ownership':str(mask_path),'offset':{'x':0,'y':0},'ownedPixels':int(owned.sum())}
  Image.fromarray(composite,'RGBA').save(output/f'{fid}-wedding.png')
  report.append({'frameId':fid,'sourceSha256':ctx.registration.get('sourceSha256'),'registrationSha256':sha(ctx.registration_bytes),'sourceRgbaSha256':sha(source.tobytes()),'protectedAndUnownedExact':True,'slots':slots})
 (output/'extension-audit.json').write_text(json.dumps(report,indent=2)+'\n')
 return report


def compose(source,top,bottom):
 out=source.copy()
 for patch,owned in (bottom,top):out[owned]=patch[owned]
 return out


def board(ctx,frames,ids,path):
 cw,ch=320,500;out=Image.new('RGB',(cw*len(ids),ch*2),'#eee8dd');d=ImageDraw.Draw(out)
 for row,(label,bank) in enumerate([('source',ctx.frames),('wedding',frames)]):
  for col,fid in enumerate(ids):
   im=Image.fromarray(bank[fid]);im.thumbnail((cw,480),Image.Resampling.LANCZOS);out.paste(im,(col*cw,row*ch+20),im);d.text((col*cw+5,row*ch+4),f'{label} {fid}',fill='#332a25')
 out.save(path)


def main():
 ap=argparse.ArgumentParser();ap.add_argument('--output',type=Path,default=Path('/tmp/landing-production/wedding'));ap.add_argument('--preview',action='store_true');ap.add_argument('--frames',type=int,nargs='+');ap.add_argument('--extension-daily',type=Path);ap.add_argument('--registration',type=Path);ap.add_argument('--refine-raised-sleeves',action='store_true');ap.add_argument('--baseline-top',type=Path);args=ap.parse_args();args.output.mkdir(parents=True,exist_ok=True)
 if args.refine_raised_sleeves:
  refine_raised_sleeve_bank(args.output,args.baseline_top)
  return
 if args.extension_daily:
  assert args.registration,'--extension-daily requires the frozen candidate --registration'
  daily=args.extension_daily;registration=json.loads(args.registration.read_text());ctx=ExtensionContext({fid:daily/f'source-{fid}.png' for fid in (107,108)},registration,masks_dir=daily/'masks')
  ctx.registration_bytes=args.registration.read_bytes();write_extension_wedding(ctx,daily,args.output)
  return
 ctx=cloth.NativeContext(ROOT/'artwork/kling-side-expansion/templates/male.registration.json')
 _,daily_top=unpack_bank(ROOT/'docs/kling-side-expansion/assets/male-shirt.garment.zip');_,daily_bottom=unpack_bank(ROOT/'docs/kling-side-expansion/assets/male-trousers.garment.zip')
 ids=args.frames or ([0,39,43,48,49,57,64,75,85,89,97,106] if args.preview else list(ctx.frames))
 top={};bottom={};styled={};audits=[]
 for fid in ids:
  masks=ctx.masks(fid);limbs=cloth.limbs(ctx,fid,masks)
  top[fid]=fit_top(ctx,fid,masks,limbs,daily_top[fid]);bottom[fid]=fit_bottom(ctx,fid,masks,limbs,daily_bottom[fid]);styled[fid]=compose(ctx.frames[fid],top[fid],bottom[fid])
  union=top[fid][1]|bottom[fid][1];protected=ctx.protected_mask(fid)
  assert np.array_equal(styled[fid][protected],ctx.frames[fid][protected])
  assert np.array_equal(styled[fid][~union],ctx.frames[fid][~union])
  keep=~lower_source_foot_guard(masks,ctx.frames[fid])
  for x0,y0,x1,y1 in SOLE_GUARDS.get(fid,[]):keep[y0:y1,x0:x1]=False
  assert np.array_equal(bottom[fid][1][keep],daily_bottom[fid][1][keep]) and np.array_equal(bottom[fid][0][:,:,3][keep],daily_bottom[fid][0][:,:,3][keep])
  assert np.array_equal(styled[fid][~keep],ctx.frames[fid][~keep])
  Image.fromarray(styled[fid]).save(args.output/f'wedding-{fid:03}.png')
  audits.append({'frameId':fid,'protectedPixelChanges':0,'outsideOwnershipChanges':0,'bottomOwnershipAndAlphaExactOutsideSourceShoeGuard':True,'removedShoeOwnershipPixels':int((daily_bottom[fid][1]&~bottom[fid][1]).sum()),'sourceSoleGuard':SOLE_GUARDS.get(fid,[]),'topOwnedPixels':int(top[fid][1].sum()),'bottomOwnedPixels':int(bottom[fid][1].sum())})
  print('fit',fid,flush=True)
 for i,group in enumerate(([0,48,49,85,89,97],[39,43,57,64,75,106])):
  selection=[fid for fid in group if fid in styled]
  if selection:board(ctx,styled,selection,args.output/f'keyposes-{i}.png')
 recipe={'format':'gathria-landing-wedding-cloth-authoring','version':1,'sourceSha256':sha(ctx.source_bytes),'registrationSha256':sha(ctx.registration_bytes),'donorSha256':sha(DONOR.read_bytes()),'donor':str(DONOR.relative_to(ROOT)),'manualClothOnlyTraces':TRACE,'sourceSoleGuards':SOLE_GUARDS,'sourceFootEdgeGuard':'9px lower-half component margin plus10px non-skin observed-shoe edge restoration; source pixels restored only; no new shoe painting','clothOnlyArmSamplingGuides':ARM_SAMPLE_GUIDES,'armDonorChains':ARM_DONOR,'legDonorChains':LEG_DONOR,'frames':audits,'limits':'Generated head, skin, hands, shoes and geometry never sampled. Only painted cloth is transferred. Existing source and registration unchanged. Original white shoes retained.'}
 (ART/'recipe.json').write_text(json.dumps(recipe,indent=2)+'\n')
 if args.preview:return
 for region in TRACE:
  texture,valid=donor_texture(region);cutout=np.zeros((1536,1024,4),np.uint8);cutout[valid,:3]=np.rint(texture[valid]).astype(np.uint8);cutout[valid,3]=255
  Image.fromarray(cutout,'RGBA').save(ART/f'cloth-only-{region}.png')
  Image.fromarray(valid.astype(np.uint8)*255,'L').save(ART/f'cloth-mask-{region}.png')
 # Review every native source action after fitting; these are offline cloth
 # diagnostics, not runtime or source motion substitutions.
 for action,clip in ctx.manifest['animations'].items():
  frames=clip['frames'];cw,ch=260,310;contact=Image.new('RGB',(7*cw,((len(frames)+6)//7)*ch),'#eee8dd');draw=ImageDraw.Draw(contact)
  for i,fid in enumerate(frames):
   y0=max(0,int(ctx.registered[fid]['points']['neck']['y'])-45);im=Image.fromarray(styled[fid]);alpha=np.asarray(im)[:,:,3];ys,xs=np.where(alpha>0);im=im.crop((max(0,int(xs.min())-7),y0,min(W,int(xs.max())+8),min(H,int(ys.max())+8)));im.thumbnail((cw-12,ch-26),Image.Resampling.LANCZOS);x=(i%7)*cw+(cw-im.width)//2;y=(i//7)*ch+22;contact.paste(im,(x,y),im);draw.text(((i%7)*cw+8,(i//7)*ch+5),f'{action} {fid}',fill='#332a25')
  contact.save(args.output/f'{action}-contact.png')
 shared=load_context('male',root=ROOT,registration_path=ctx.registration_path)
 provenance=f"Real painted right-facing wedding donor {DONOR.relative_to(ROOT)} SHA256 {recipe['donorSha256']}; exact generation prompt and manually traced cloth-only masks recorded in artwork/kling-landing-production/wedding. Navy jacket, ivory waistcoat, coral tie, navy trousers. Generated anatomy, head, hands, skin, shoes and background excluded. Full native source frame/registration binding; source body, face, motion, original white footwear and outside garment pixels unchanged. Navy trouser ownership/alpha reuse accepted daily fit except documented original sole/foot-edge restorations; long sleeve coverage only source-visible arms outside exact protected head/hands."
 for slot,bank in [('top',top),('bottom',bottom)]:
  path=args.output/f'male-wedding-{slot}.garment.zip'
  report=pack_garment(shared,f'side-male-wedding-{slot}-v1',f'Navy wedding {slot}',slot,{fid:x[0] for fid,x in bank.items()},path,provenance,ownership={fid:x[1] for fid,x in bank.items()},painting_mode='patch')
  lint=lint_garment(shared,path);assert lint['ok'],lint
  (args.output/f'{slot}-audit.json').write_text(json.dumps({'pack':report,'lint':lint},indent=2)+'\n')
 print('Packed and linted 107-frame wedding top/bottom',flush=True)

if __name__=='__main__':main()
