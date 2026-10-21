#!/usr/bin/env python3
"""Offline painted trouser fitting to immutable Kling source poses.

Only RGB inside documented garment donor contours is sampled. Native body
poses/identity are not warped; complete source-bound patches are baked offline.
"""
import argparse
import json
from pathlib import Path
import numpy as np
from scipy import ndimage as nd
from PIL import Image, ImageDraw, ImageFont
from kling_wardrobe_common import ROOT, load_source, protected_mask, save_garment, sha
from kling_male_limb_ownership import MaleLimbOwnership

DESIGN = ROOT / 'artwork/kling-wardrobe/source/full-outfits-v1/designs.png'
OUTPUT = ROOT / 'artwork/kling-wardrobe/prepared/male-trousers-v1'
KEYS = [0, 28, 36, 37, 39, 48, 51, 58, 62, 64, 74, 83, 87, 96, 104, 105, 107, 110, 121]
DONORS = {
 'day': {
  'id':'ochre-chinos-v1', 'name':'Ochre full-length chinos',
  'polygon':[(353,615),(578,615),(595,641),(600,706),(588,778),(587,841),(595,917),(568,904),(541,905),(506,921),(476,921),(468,859),(466,812),(472,760),(490,711),(465,739),(435,819),(404,906),(372,912),(331,923),(286,920),(282,889),(296,815),(315,749),(327,698),(330,654)],
  'near':[(397,681),(353,798),(341,908)],
  'far':[(537,682),(538,796),(538,909)],
  'widths':{'near':[76,62,55],'far':[63,61,57]},
  'waist':[[354,617],[579,617]], 'crotchY':715,
 },
 'wedding': {
  'id':'navy-suit-trousers-v1','name':'Navy full-length suit trousers',
  'polygon':[(998,649),(1238,650),(1250,691),(1246,741),(1234,795),(1234,860),(1244,918),(1200,914),(1171,921),(1137,919),(1134,868),(1121,810),(1129,752),(1130,711),(1102,766),(1074,825),(1055,906),(1034,917),(987,920),(952,923),(946,902),(957,842),(965,793),(978,744),(987,700)],
  'near':[(1057,730),(1021,800),(1005,910)],
  'far':[(1184,730),(1182,800),(1186,911)],
  'widths':{'near':[67,59,59],'far':[59,54,56]},
  'waist':[[1030,711],[1218,711]],'crotchY':752,
 }
}

def poly(points, shape=(1024,1536)):
 im=Image.new('L',(shape[1],shape[0]));ImageDraw.Draw(im).polygon(points,fill=255)
 return np.asarray(im)>0

def xy(point): return np.array([point['x'],point['y']],float)

def chain_field(points,shape):
 """Continuous arclength and signed cross-section, blended near the knee."""
 yy,xx=np.indices(shape);q=np.stack([xx+.5,yy+.5],axis=-1)
 a,b,c=points;v0=b-a;v1=c-b;l0=np.linalg.norm(v0);l1=np.linalg.norm(v1)
 length=l0+l1;d0=v0/max(l0,1);d1=v1/max(l1,1)
 t0=np.clip(np.sum((q-a)*d0,axis=-1),0,l0)
 t1=np.clip(np.sum((q-b)*d1,axis=-1),0,l1)
 e0=q-(a+t0[...,None]*d0);e1=q-(b+t1[...,None]*d1)
 choose=np.sum(e1*e1,axis=-1)<np.sum(e0*e0,axis=-1)
 s=np.where(choose,l0+t1,t0)
 n0=np.array([d0[1],-d0[0]]);n1=np.array([d1[1],-d1[0]])
 cross=np.where(choose,np.sum(e1*n1,axis=-1),np.sum(e0*n0,axis=-1))
 # A hard nearest-segment switch paints a diagonal seam through a bent knee.
 # Blend the coordinate fields only inside its shared joint neighbourhood.
 joint=(np.linalg.norm(q-b,axis=-1)<65)&(t0>l0-55)&(t1<55)
 weight=1/(1+np.exp(np.clip((np.sum(e1*e1,axis=-1)-np.sum(e0*e0,axis=-1))/300,-30,30)))
 s=np.where(joint,t0*(1-weight)+(l0+t1)*weight,s)
 cross=np.where(joint,np.sum(e0*n0,axis=-1)*(1-weight)+np.sum(e1*n1,axis=-1)*weight,cross)
 return s/max(length,1),cross,(l0/max(length,1)),choose

def sample(rgb,x,y):
 """Nearest cloth completion never samples skin or generated background."""
 return np.stack([nd.map_coordinates(rgb[:,:,i],[y,x],order=1,mode='nearest') for i in range(3)],axis=-1)

def donor_field(source,s,cross,target_fraction,width,donor_side,donor):
 p=np.array(donor[donor_side],float)
 a,b,c=p;v0=b-a;v1=c-b;l0=np.linalg.norm(v0);l1=np.linalg.norm(v1)
 # Preserve the donor knee at the actual source knee, not arbitrary frame rows.
 first=s<=target_fraction
 local=np.where(first,s/max(target_fraction,.01),(s-target_fraction)/max(1-target_fraction,.01))
 local=np.clip(local,0,1)
 center=np.where(first[...,None],a+local[...,None]*v0,b+local[...,None]*v1)
 d=np.where(first[...,None],v0/max(l0,1),v1/max(l1,1))
 normal=np.stack([d[:,:,1],-d[:,:,0]],axis=-1)
 widths=donor['widths'][donor_side]
 dw=np.where(first,widths[0]*(1-local)+widths[1]*local,widths[1]*(1-local)+widths[2]*local)
 coord=center+normal*(np.clip(cross/width,-.82,.82)*dw)[...,None]
 # Keep the irregular source-art outline and shoe edge out of cuff material.
 coord[:,:,1]=np.minimum(coord[:,:,1],896)
 return sample(source,coord[:,:,0],coord[:,:,1])

def fitted_bottom(original,guide,masks,semantic,donor,source):
 points=guide['points'];shape=original.shape[:2];yy,xx=np.indices(shape)
 shorts=semantic['shorts'];skinlegs=masks['nearLeg']|masks['farLeg']
 core=(shorts|skinlegs)&(original[:,:,3]>0)
 protected=protected_mask(guide)
 core &= ~protected
 # Source mattes can contain detached sub-pixel flecks near hands/soles. They
 # are not cloth surfaces; preserve them as original pixels instead of growing
 # them into new coloured islands with the garment allowance.
 labels,_=nd.label(core)
 sizes=np.bincount(labels.ravel())
 core &= sizes[labels]>=20
 # Conservative cloth allowance only into transparent space: never across a
 # visible arm, hand, shirt or shoe belonging to a different material.
 distance,index=nd.distance_transform_edt(~core,return_indices=True)
 allowance=(distance<=3)&(original[:,:,3]==0)
 owned=(core|allowance)&~protected
 colors={};near_distance={}
 for side in ['near','far']:
  chain=[xy(points[side+n]) for n in ['Hip','Knee','Ankle']]
  s,cross,fraction,_=chain_field(chain,shape)
  legmask=masks[side+'Leg']
  # Width derives from the source silhouette, with a robust section cap so
  # crossing arms and partly hidden legs do not shrink the garment UV field.
  widths=[]
  for lo,hi in [(0,.35),(.35,.75),(.75,1.1)]:
   values=np.abs(cross[legmask&(s>=lo)&(s<hi)])
   widths.append(float(np.quantile(values,.93)) if len(values)>8 else 40.)
  widths=np.clip(widths,24,70)
  width=np.interp(s,[0,.55,1],widths)*1.07
  colors[side]=donor_field(source,s,cross,fraction,width,side,donor)
  near_distance[side]=np.abs(cross)
 # Clothing owns visible body regions according to source occlusion, not bone
 # distance alone. Distance disambiguates only the original opaque shorts.
 choose=masks['nearLeg']|(shorts&(near_distance['near']<=near_distance['far']))
 rgb=np.where(choose[...,None],colors['near'],colors['far'])
 # Only the uninterrupted pelvis blends the two leg material coordinates.
 # Visible overlapping legs retain their source-specific surface owner.
 near_weight=np.clip(.5+(near_distance['far']-near_distance['near'])/30,0,1)
 pelvis_legs=colors['near']*near_weight[...,None]+colors['far']*(1-near_weight[...,None])
 rgb=np.where(shorts[...,None],pelvis_legs,rgb)
 # Registered waistband/crotch surface preserves belt and pockets. Its
 # influence ends inside the upper thighs, avoiding a painted shorts hem.
 wl,wr=xy(points['waistLeft']),xy(points['waistRight'])
 top=(wl[1]+wr[1])/2;hip=(points['nearHip']['y']+points['farHip']['y'])/2
 height=max(60,hip+30-top)
 slope=(wr[1]-wl[1])/max(wr[0]-wl[0],1)
 v=np.clip((yy-top-(xx-(wl[0]+wr[0])/2)*slope)/height,0,1)
 # Register the complete visible hip surface, rather than clamping every
 # pixel outside the narrow waist to a repeated donor edge/pocket stripe.
 rows=np.flatnonzero(shorts.any(axis=1))
 left=np.array([np.flatnonzero(shorts[row])[0] for row in rows],float)
 right=np.array([np.flatnonzero(shorts[row])[-1] for row in rows],float)
 l=nd.gaussian_filter1d(np.interp(np.arange(shape[0]),rows,left),5)[:,None]
 r=nd.gaussian_filter1d(np.interp(np.arange(shape[0]),rows,right),5)[:,None]
 u=np.clip((xx-l)/np.maximum(r-l,60),.04,.96)
 dl,dr=np.array(donor['waist'])
 tx=dl[0]+u*(dr[0]-dl[0]);ty=dl[1]+v*(donor['crotchY']-dl[1]+15)
 pelvis=sample(source,tx,ty)
 blend=np.clip((.72-v)/.30,0,1)*shorts
 rgb=pelvis*blend[...,None]+rgb*(1-blend[...,None])
 # Retain gentle source pose volume without copying its skin colour or old
 # shorts hem. Painted donor folds provide the cloth material itself.
 lum=np.sum(original[:,:,:3]*np.array([.2126,.7152,.0722]),axis=-1)
 leg_lum=nd.gaussian_filter(lum,3)
 light=np.clip(leg_lum/190,.72,1.12)
 rgb*=np.where(skinlegs,.82+.18*light,1)[...,None]
 # Source contours alone remain readable; interior skin/shorts lines do not
 # survive as spurious material borders.
 rgb=np.rint(np.clip(rgb,0,255)).astype(np.uint8)
 patch=np.zeros_like(original)
 solid=core&(original[:,:,3]>=128)
 outside=nd.distance_transform_edt(~solid)
 silhouette=(outside<=2)&owned
 edge=nd.distance_transform_edt(silhouette)
 alpha=np.clip(2.75-outside,0,1)
 alpha[solid]=1
 # The outline follows the existing pose contour with a small cloth allowance;
 # removing original material fringe prevents double/inset knee outlines.
 color=rgb[tuple(index)]
 edge_tone=np.array([65,43,29] if donor['id'].startswith('ochre') else [21,27,38])
 line=np.clip((2.5-edge)/1.1,0,1)*silhouette
 color=np.rint(color*(1-line[...,None])+edge_tone*line[...,None]).astype(np.uint8)
 patch[owned,:3]=color[owned];patch[owned,3]=np.rint(alpha[owned]*255).astype(np.uint8)
 patch[~owned]=0
 return patch,owned

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--preview-only',action='store_true');args=parser.parse_args()
 OUTPUT.mkdir(parents=True,exist_ok=True)
 source=np.asarray(Image.open(DESIGN).convert('RGB'),dtype=float)
 author=MaleLimbOwnership();_,manifest,_,frames=load_source('male')
 catalog=[];audit=[]
 for look,donor in DONORS.items():
  mask=poly(donor['polygon'])
  # Exclude shoe whites at irregular donor cuffs; this is a clothing-local
  # authoring boundary, never a global colour removal from source characters.
  if look=='day':mask &= (source[:,:,0]-source[:,:,2]>38)&(source[:,:,1]-source[:,:,2]>18)
  else:mask &= (source[:,:,2]>=source[:,:,0])&(source[:,:,0]>=22)&(source[:,:,0]<150)&(source[:,:,2]>=40)
  # Only interior fabric is extrapolated into the fitted cuff. The source-art
  # outer ink and irregular shoe boundary cannot become dark stripes.
  mask=nd.binary_erosion(mask,iterations=7)
  mask[900:]=False
  _,nearest=nd.distance_transform_edt(~mask,return_indices=True)
  cloth=source[tuple(nearest)]
  patches={};previews={}
  for fid,original in frames.items():
   if args.preview_only and fid not in KEYS:continue
   semantic=author.semantic(fid);masks=author.for_frame(fid,original);guide={**author.guides[fid], 'points':author.points(fid)}
   patch,owned=fitted_bottom(original,guide,masks,semantic,donor,cloth)
   protected=protected_mask(guide)&(original[:,:,3]>0)
   assert not (owned&protected).any(),fid
   assert not (owned&(masks['nearArm']|masks['farArm'])).any(),fid
   assert not (patch[~owned,3]>0).any()
   composed=original.copy();composed[owned]=patch[owned]
   patches[fid]=(patch,owned)
   if fid in KEYS:
    Image.fromarray(composed).save(OUTPUT/f'{look}-{fid:03}.png');previews[fid]=composed
   audit.append({'look':look,'frameId':fid,'ownedPixels':int(owned.sum()),'protectedPixelsChanged':0,'sourceArmPixelsChanged':0})
  cell=(352,558);sheet=Image.new('RGB',(cell[0]*5,cell[1]*((len(previews)+4)//5)),'#efece2');draw=ImageDraw.Draw(sheet)
  font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
  for i,(fid,a) in enumerate(previews.items()):
   image=Image.fromarray(a).resize((352,528),Image.Resampling.NEAREST);x=(i%5)*cell[0];y=(i//5)*cell[1]
   sheet.paste(image,(x,y+28),image);draw.text((x+6,y+4),f'{look} / source {fid}',font=font,fill='#303d34')
  sheet.save(OUTPUT/f'{look}-contact.png')
  if not args.preview_only:
   provenance=f'OpenAI image-generation garment reference full-outfits-v1/designs.png SHA256 {sha(DESIGN.read_bytes())}. Manual clothing-only donor contours and continuous registered leg/waist UV fields; only cloth RGB sampled. Original Kling body, head, hands, feet and source poses are not regenerated. Three-pixel cloth allowance only into transparent space; original material ownership determines occlusion. Complete offline pose bank; no runtime image API. See recorded prompt and donor JSON.'
   catalog.append(save_garment('male',donor['id'],donor['name'],'bottom',author.registration_bytes,patches,provenance))
 (OUTPUT/'donors.json').write_text(json.dumps(DONORS,indent=2)+'\n')
 (OUTPUT/'ownership-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
 if not args.preview_only:(OUTPUT/'catalog-items.json').write_text(json.dumps(catalog,indent=2)+'\n')
 print(json.dumps({'previewOnly':args.preview_only,'items':catalog,'output':str(OUTPUT)},indent=2))

if __name__=='__main__':main()
