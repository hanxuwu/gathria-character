#!/usr/bin/env python3
"""Author original-view cream blouse/rose skirt from recorded eight-pose cloth art.
Source anatomy is immutable; donor head/skin/shoes/background are discarded.
"""
from pathlib import Path
import argparse,json,io,zipfile,sys
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy import ndimage as nd
from kling_wardrobe_common import ROOT,load_source,protected_mask,save_garment,sha,json_bytes
ART=ROOT/'artwork/dual-tailored/female'
REVIEW=json.loads((ART/'source/hand-foreground-v1.json').read_text())
W,H=704,1056;YY,XX=np.indices((H,W),dtype=float)
IDS=[0,51,58,75,87,95,103,111]
# Hand-reviewed outlines/neck/waist in each 352x528 donor panel, recorded before native fitting.
D={
0:dict(neck=[191,268],waist=[[149,319],[225,320]],top=[(152,251),(166,254),(180,264),(192,268),(200,263),(201,251),(216,256),(229,267),(237,280),(238,293),(228,304),(225,320),(150,319),(148,307),(131,305),(115,298),(110,286),(109,276),(115,266),(126,258),(140,253)]),
51:dict(neck=[199,252],waist=[[155,306],[221,309]],top=[(163,230),(180,239),(199,251),(207,250),(209,237),(224,241),(235,250),(244,261),(238,271),(230,286),(224,309),(154,306),(151,292),(137,286),(129,278),(133,267),(134,251),(127,242),(137,232),(151,230)]),
58:dict(neck=[192,253],waist=[[149,313],[218,313]],top=[(165,235),(181,245),(193,253),(199,250),(201,239),(217,246),(225,259),(222,275),(222,291),(219,312),(149,313),(145,304),(139,294),(135,280),(136,266),(144,252),(151,244)]),
75:dict(neck=[182,246],waist=[[144,304],[219,305]],top=[(139,218),(152,223),(166,237),(183,246),(194,239),(196,229),(209,228),(228,226),(237,236),(241,250),(237,264),(224,271),(222,286),(218,305),(145,304),(139,289),(124,284),(113,276),(109,261),(119,252),(127,241),(128,227)]),
87:dict(neck=[192,326],waist=[[143,368],[215,373]],top=[(147,295),(160,298),(176,318),(192,328),(205,325),(218,320),(235,320),(240,333),(236,348),(227,358),(215,373),(145,369),(134,363),(118,352),(109,338),(109,323),(115,307),(130,299)]),
95:dict(neck=[191,190],waist=[[146,238],[221,239]],top=[(158,169),(170,175),(185,187),(194,192),(203,183),(202,175),(217,175),(234,182),(243,192),(246,205),(240,219),(228,224),(224,238),(148,238),(143,224),(129,222),(122,214),(126,203),(127,189),(120,180),(132,172),(145,168)]),
103:dict(neck=[192,299],waist=[[145,350],[217,352]],top=[(161,277),(178,288),(194,300),(204,299),(206,289),(224,290),(238,296),(247,307),(247,321),(237,333),(226,338),(218,352),(148,350),(140,338),(128,334),(120,326),(126,317),(129,304),(125,289),(139,281),(151,277)]),
111:dict(neck=[189,280],waist=[[146,335],[219,335]],top=[(151,260),(166,267),(183,278),(194,283),(202,275),(202,266),(217,272),(230,280),(240,291),(242,307),(232,318),(221,323),(220,335),(146,335),(141,325),(131,316),(116,307),(105,295),(107,283),(116,272),(132,264)])}
SLEEVES={
0:([137,271],[121,323],[(108,254),(145,249),(162,259),(171,276),(165,296),(150,307),(113,303),(105,285)]),
51:([141,253],[104,285],[(126,229),(154,228),(171,239),(174,264),(167,280),(149,290),(127,284)]),
58:([160,263],[181,295],[(145,237),(166,238),(181,247),(188,267),(179,284),(160,293),(143,286),(133,272)]),
75:([135,246],[90,218],[(131,218),(148,220),(163,232),(165,253),(153,271),(135,282),(115,276),(108,261),(119,250)]),
87:([144,314],[117,343],[(110,303),(142,294),(162,304),(173,322),(161,337),(140,341),(116,336),(107,322)]),
95:([138,193],[100,216],[(123,168),(150,168),(168,181),(170,204),(160,220),(140,228),(119,218)]),
103:([143,303],[106,326],[(125,276),(153,277),(169,290),(172,311),(159,329),(140,335),(119,326)]),
111:([132,284],[112,316],[(110,268),(137,260),(157,270),(165,289),(153,309),(134,316),(109,302),(102,285)])}

SKIRT=[(148,316),(164,320),(187,322),(210,320),(226,317),(230,330),(237,343),(246,361),(253,375),(244,381),(230,384),(219,390),(201,392),(190,391),(180,385),(166,388),(151,389),(136,386),(123,381),(116,375),(121,361),(127,347),(137,329)]

def poly(points,scale=2):
 im=Image.new('L',(W,H));ImageDraw.Draw(im).polygon([(round(x*scale),round(y*scale)) for x,y in points],fill=255);return np.array(im)>0

def read_bank(path):
 with zipfile.ZipFile(path) as z:
  m=json.loads(z.read('manifest.json'));ps=[np.array(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA')) for p in m['pages']];ms=[np.array(Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA'))[:,:,3]>0 for p in m['pages']]
 result={}
 for f in m['frames']:
  r,o=f['rect'],f['offset'];sl=np.s_[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']];ds=np.s_[o['y']:o['y']+r['height'],o['x']:o['x']+r['width']]
  rgba=np.zeros((H,W,4),np.uint8);own=np.zeros((H,W),bool);rgba[ds]=ps[f['page']][sl];own[ds]=ms[f['page']][sl];result[f['frameId']]=(rgba,own)
 return result

def source_point(rec,name):
 p=rec['points'][name];return np.array([p['x'],p['y']],float)
def reviewed_shoe(fid):
 points=REVIEW['foregroundShoe'].get(str(fid))
 return protected_mask({'protected':[{'polygon':[{'x':x,'y':y} for x,y in points]}]}) if points else np.zeros((H,W),bool)
def reviewed_hand(fid):
 points=REVIEW.get('foregroundHand',{}).get(str(fid))
 return protected_mask({'protected':[{'polygon':[{'x':x,'y':y} for x,y in points]}]}) if points else np.zeros((H,W),bool)
def arm_foreground(fid,original,rec,tank,shorts):
 rgb=original[:,:,:3].astype(float);skin=(rgb[:,:,0]-rgb[:,:,1]>18)&(rgb[:,:,1]-rgb[:,:,2]>12)&(original[:,:,3]>0);arm=np.zeros((H,W),bool)
 walking=24<=fid<=50;wl,wr=cloth_waist(rec,tank)
 waist=wl[1]+(XX-wl[0])*(wr[1]-wl[1])/max(50,wr[0]-wl[0])
 for side in ['near','far']:
  shoulder,elbow,wrist=[source_point(rec,side+n) for n in ['Shoulder','Elbow','Wrist']]
  forearm=segment(elbow,wrist)<40
  if walking:
   # Real hands have their own reviewed source regions. A round capsule end
   # beyond the wrist must not reserve neighboring thigh skin as forearm.
   v=wrist-elbow;forearm &= (XX-wrist[0])*v[0]+(YY-wrist[1])*v[1]<=0
  region=(segment(shoulder,elbow)<40)|forearm
  if walking and side=='far' and not any(g['label']=='farHand' for g in rec['protected']):
   # No visible far hand: below the waist the back arm is behind the skirt.
   region &= YY<=waist+2
  arm |= region
 return nd.binary_dilation(arm&skin,iterations=2)&~shorts&~tank

def fit_walk_far_panel(patch,shorts,wc):
 # Waist guides can underestimate an occluded hip. Follow the actual source
 # shorts envelope, extending the same donor cloth continuously instead of
 # filling a rectangular material-union strip with its nearest edge texel.
 rows=np.where(shorts.any(axis=1))[0]
 if not len(rows):return patch
 edge=np.max(np.where(patch[:,:,3]>0,XX,-1),axis=1)
 hip=np.max(np.where(shorts,XX,-1),axis=1)
 observed=np.maximum.accumulate(hip[rows]);y=np.arange(H)
 desired=np.interp(y,rows,observed)+1
 desired+=np.maximum(0,y-rows[-1])*.25
 extra=np.clip(desired-edge,0,40)*np.clip((y-rows[0])/10,0,1)
 extra[edge<=wc[0]+20]=0;extra=nd.gaussian_filter1d(extra,3)
 extra[edge<=wc[0]+20]=0
 factor=1+extra/np.maximum(20,edge-wc[0]);sx=np.where(XX>wc[0],wc[0]+(XX-wc[0])/factor[:,None],XX)
 return sample(patch,sx,YY)
def sample(im,x,y):return np.stack([nd.map_coordinates(im[:,:,c].astype(float),[y,x],order=1,mode='constant',cval=0) for c in range(4)],axis=2).round().clip(0,255).astype(np.uint8)
def segment(a,b):
 v=b-a;t=np.clip(((XX-a[0])*v[0]+(YY-a[1])*v[1])/(v@v+1e-8),0,1);return np.hypot(XX-a[0]-t*v[0],YY-a[1]-t*v[1])

def prepare_donors():
 donors={}
 for fid,d in D.items():
  rgb=np.array(Image.open(ART/f'source/donor-{fid}.png').convert('RGB').resize((W,H),Image.Resampling.LANCZOS));a=poly(d['top']);r,g,b=np.moveaxis(rgb.astype(float),2,0)
  # Cloth shadows are warm brown too; color-key removal would punch holes
  # through sleeves and folds. Only explicitly traced donor skin is excluded.
  bg=np.linalg.norm(rgb.astype(float)-np.array([235,231,220]),axis=2)<13
  labels,n=nd.label(bg);edge=np.unique(np.concatenate([labels[0],labels[-1],labels[:,0],labels[:,-1]]));outside=np.isin(labels,edge[edge!=0])
  keep=a&~outside
  holes={58:[[(159,275),(180,269),(217,264),(233,265),(254,261),(264,273),(264,291),(252,301),(220,307),(189,308),(171,296)]],87:[[(101,320),(127,315),(149,305),(170,307),(180,322),(174,339),(150,347),(119,354),(101,348)],[(230,316),(252,311),(266,323),(261,345),(246,355),(226,345)]],111:[[(102,291),(126,304),(135,320),(154,334),(159,349),(146,363),(129,355),(118,344),(102,327)]]}
  for hole in holes.get(fid,[]):keep[poly(hole)]=False
  rgba=np.zeros((H,W,4),np.uint8);rgba[keep,:3]=rgb[keep];rgba[keep,3]=255
  donors[fid]=rgba
 # Complete only occluded bodice interiors from the standing donor's real cloth.
 for fid in [58,87,111]:
  d=D[fid]; neck=np.array(d['neck'])*2;wa=np.array(d['waist'])*2;wc=wa.mean(axis=0)
  sd=D[0]; sn=np.array(sd['neck'])*2;sw=np.array(sd['waist'])*2
  src=np.array([sn,sw[0],sw[1]]);dst=np.array([neck,wa[0],wa[1]])
  t=np.linalg.solve(np.column_stack([dst,np.ones(3)]),src);coords=np.column_stack([XX.ravel(),YY.ravel(),np.ones(W*H)])@t
  under=sample(donors[0],coords[:,0].reshape(H,W),coords[:,1].reshape(H,W))
  left=np.minimum(wa[0,0]+12,neck[0]-38);right=np.maximum(wa[1,0]-8,neck[0]+25)
  inner=(XX>left)&(XX<right)&(YY>neck[1]+22)&(YY<wc[1]+2)
  hole=inner&(donors[fid][:,:,3]==0)&(under[:,:,3]>230)
  donors[fid][hole]=under[hole]
 # One complete original-view skirt preserves its painted folds across clips.
 rgb=np.array(Image.open(ART/'source/donor-0.png').convert('RGB').resize((W,H),Image.Resampling.LANCZOS));mask=poly(SKIRT)
 skirt=np.zeros((H,W,4),np.uint8);skirt[mask,:3]=rgb[mask];skirt[mask,3]=255
 for fid,p in donors.items():Image.fromarray(p).save(ART/f'source/{fid:03d}-top-cloth.png')
 Image.fromarray(skirt).save(ART/'source/original-skirt-cloth.png')
 return donors,skirt

def cloth_waist(rec,tank):
 wl,wr=source_point(rec,'waistLeft'),source_point(rec,'waistRight')
 cols=np.where(tank.any(axis=0))[0];cols=cols[(cols>=min(wl[0],wr[0]))&(cols<=max(wl[0],wr[0]))]
 cols=np.array([x for x in cols if np.count_nonzero(tank[:,x])>8])
 if len(cols)<15:return wl,wr
 ys=np.array([np.where(tank[:,x])[0].max() for x in cols]);keep=np.abs(ys-np.median(ys))<40
 if np.count_nonzero(keep)<12:return wl,wr
 slope,intercept=np.polyfit(cols[keep],ys[keep],1);slope=float(np.clip(slope,-.5,.5));intercept=float(np.median(ys[keep]-slope*cols[keep]))
 pred=np.array([slope*wl[0]+intercept,slope*wr[0]+intercept]);old=np.array([wl[1],wr[1]])
 if np.max(np.abs(pred-old))>35:return wl,wr
 pred=np.clip(pred,old-8,old+24)
 return np.array([wl[0],pred[0]]),np.array([wr[0],pred[1]])

def select_donor(rec,regs):
 names=['nearShoulder','nearElbow','farShoulder','farElbow']
 def vectors(r):
  v=[]
  for a,b in [('nearShoulder','nearElbow'),('farShoulder','farElbow')]:
   p=source_point(r,b)-source_point(r,a);v.extend(p/max(1,np.linalg.norm(p)))
  return np.array(v)
 q=vectors(rec)
 return min(IDS,key=lambda i:np.linalg.norm(q-vectors(regs[i])))

def fit_top(fid,original,rec,regs,donors,tank):
 did=0;template=donors[did];wl,wr=cloth_waist(rec,tank)
 # The cuff follows its own upper-arm attachment; a compressed torso must not
 # drag a painted puff sleeve down over the original elbow/forearm.
 ss,se,outline=SLEEVES[did];ss=np.array(ss)*2;se=np.array(se)*2;sv=se-ss
 ds=source_point(rec,'nearShoulder');de=source_point(rec,'nearElbow');dv=de-ds
 angle=np.arctan2(sv[1],sv[0])-np.arctan2(dv[1],dv[0]);scale=np.clip(np.linalg.norm(dv)/np.linalg.norm(sv),.85,1.2)
 dx=(XX-ds[0])/scale;dy=(YY-ds[1])/scale;xs=np.cos(angle)*dx-np.sin(angle)*dy+ss[0];ys=np.sin(angle)*dx+np.cos(angle)*dy+ss[1]
 sm=poly(outline);sleeve=template.copy();sleeve[~sm]=0;fitted=sample(sleeve,xs,ys)
 # Far-side puff uses the same painted sleeve construction with foreshortening,
 # reflected only within cloth-local space; source limb/pose is never mirrored.
 fs=np.array(SLEEVES[0][0])*2;fe=np.array(SLEEVES[0][1])*2;su=(fe-fs)/np.linalg.norm(fe-fs);sp=np.array([-su[1],su[0]])
 ds=source_point(rec,'farShoulder');de=source_point(rec,'farElbow');dv=de-ds;du=dv/max(1,np.linalg.norm(dv));dp=np.array([-du[1],du[0]])
 scale=np.clip(np.linalg.norm(dv)/np.linalg.norm(fe-fs),.85,1.15);dx=XX-ds[0];dy=YY-ds[1]
 along=(dx*du[0]+dy*du[1])/scale;across=(dx*dp[0]+dy*dp[1])/(scale*.72)
 xs=fs[0]+su[0]*along-sp[0]*across;ys=fs[1]+su[1]*along-sp[1]*across
 far=donors[0].copy();far[~poly(SLEEVES[0][2])]=0;ffitted=sample(far,xs,ys)
 patch=fitted.copy();faronly=(ffitted[:,:,3]>0)&(fitted[:,:,3]==0);patch[faronly]=ffitted[faronly]
 # Fit the painted collar/placket inside the actual source bodice contour.
 # This avoids transferring donor neck skin and squared neckline holes when an
 # approximate neck landmark drifts. Sleeve caps retain their own attachments.
 rows,cols=np.where(tank);profile=np.min(np.where(tank,YY,2000),axis=0)
 ns,fs=source_point(rec,'nearShoulder'),source_point(rec,'farShoulder');expected=(ns[0]+fs[0])*.5+25
 if fs[0]<ns[0]:expected=source_point(rec,'neck')[0]
 eligible=(np.arange(W)>expected-36)&(np.arange(W)<expected+36)&(profile>rows.min()+15)&(profile<min(ns[1],fs[1])+85)
 eligible &= profile<(wl[1]+wr[1])*.5-40
 if eligible.any():
  dip=float(profile[eligible].max());dipx=float(np.median(np.where(eligible&(profile>=dip-2))[0]));top=float(rows.min())
 else:dip=float(rows.min()+35);dipx=expected;top=float(rows.min())
 waist_y=wl[1]+(XX-wl[0])*(wr[1]-wl[1])/max(50,wr[0]-wl[0])+3
 lower=np.clip((YY-dip)/np.maximum(35,waist_y-dip),0,1);upper=np.clip((YY-top)/max(20,dip-top),0,1)
 sy=np.where(YY<dip,500+upper*52,552+lower*87);center=dipx*(1-lower)+(wl[0]+wr[0])*.5*lower
 sx=384*(1-lower)+374*lower+(XX-center)/max(110,wr[0]-wl[0])*152
 tex=donors[0].copy();valid=tex[:,:,3]>240;nn=nd.distance_transform_edt(~valid,return_distances=False,return_indices=True);tex[~valid]=tex[nn[0][~valid],nn[1][~valid]]
 body=sample(tex,sx,sy);body[:,:,3]=original[:,:,3]
 lum=original[:,:,:3].astype(float)@np.array([.2126,.7152,.0722]);light=np.clip(lum/max(1,float(np.median(lum[tank]))),.5,1.25)
 body[:,:,:3]=(body[:,:,:3]*(.82+.18*light[:,:,None])).round().clip(0,255).astype(np.uint8)
 edge=tank&(nd.distance_transform_edt(tank)<=2)&(lum<65);body[edge,:3]=original[edge,:3]
 cap_allowed=(fitted[:,:,3]>0)|(ffitted[:,:,3]>0)
 farsh,fael=source_point(rec,'farShoulder'),source_point(rec,'farElbow');v=fael-farsh;t=((XX-farsh[0])*v[0]+(YY-farsh[1])*v[1])/(v@v+1e-8)
 cap_allowed|=(segment(farsh,fael)<43)&(t>-.3)&(t<.65)
 patch[~tank&~cap_allowed]=0;patch[tank]=body[tank]
 rgb=original[:,:,:3].astype(float);skin=(rgb[:,:,0]-rgb[:,:,1]>18)&(rgb[:,:,1]-rgb[:,:,2]>12)&(original[:,:,3]>0)
 distances=[]
 for a,b in [('nearShoulder','nearElbow'),('nearElbow','nearWrist'),('farShoulder','farElbow'),('farElbow','farWrist')]:distances.append(segment(source_point(rec,a),source_point(rec,b)))
 near=np.argmin(distances,axis=0);forearm=skin&(np.minimum(distances[1],distances[3])<np.minimum(distances[0],distances[2])+24)&(np.minimum(distances[1],distances[3])<48)
 forearm=nd.binary_dilation(forearm,iterations=2)&~tank
 allowed=nd.binary_dilation(tank,iterations=18)|(fitted[:,:,3]>0)|(ffitted[:,:,3]>0)
 patch[~allowed|forearm]=0
 # Source wardrobe edge is authoritative; fill only its missing garment cells.
 protected=protected_mask(rec)&(original[:,:,3]>0);need=tank&(patch[:,:,3]<220)&~protected
 valid=nd.binary_erosion(patch[:,:,3]>240,iterations=3)
 if need.any() and valid.any():
  mid=np.median(original[tank,:3].astype(float),axis=0); mapped=original[:,:,:3].astype(float)*np.array([241,225,202])/np.maximum(mid,1);dark=np.max(original[:,:,:3],axis=2)<55;mapped[dark]=original[dark,:3];patch[need,:3]=mapped.clip(0,255).round().astype(np.uint8)[need];patch[need,3]=original[need,3]
 patch[protected|reviewed_hand(fid)]=0
 return patch,did,forearm

def fit_skirt(fid,original,rec,template,shorts,geometry,arm_foreground,tank):
 wl,wr=cloth_waist(rec,tank);wc=(wl+wr)/2;length,width=geometry[fid]
 slope=(wr[1]-wl[1])/max(50,wr[0]-wl[0]);xnorm=(XX-wc[0])/width
 ytop=wc[1]-1+(XX-wc[0])*slope
 # Painted waist/hem run from native donor y638 to784, x232..506.
 srcx=373+(XX-wc[0])/width*274
 srcy=638+(YY-ytop)/length*146
 # Front hem rises smoothly with the nearer knee rather than clipped flat.
 kn=source_point(rec,'nearKnee');compression=max(0,120-length);lift=compression*0.5*np.clip(xnorm+.4,0,1)**2*np.clip((YY-ytop)/length,0,1)**2
 srcy+=lift/length*146
 patch=sample(template,srcx,srcy)
 if 24<=fid<=50:patch=fit_walk_far_panel(patch,shorts,wc)
 protected=protected_mask(rec)&(original[:,:,3]>0);patch[protected|arm_foreground]=0
 need=shorts&(patch[:,:,3]<220)&~protected&~arm_foreground
 valid=nd.binary_erosion(patch[:,:,3]>240,iterations=3)
 if need.any() and valid.any():
  nn=nd.distance_transform_edt(~valid,return_distances=False,return_indices=True);patch[need]=patch[nn[0][need],nn[1][need]];patch[need,3]=original[need,3]
 # The raised rear shoes are foreground in53/54. Correcting a mistaken hand
 # label must not cause new cloth to paint over their original white pixels.
 patch[reviewed_shoe(fid)|reviewed_hand(fid)]=0
 return patch

def compose(original,patch):
 a=patch[:,:,3:4].astype(float)/255;oa=original[:,:,3:4].astype(float)/255;na=a+oa*(1-a)
 rgb=(patch[:,:,:3]*a+original[:,:,:3]*oa*(1-a))/np.maximum(na,1e-8)
 out=np.dstack((rgb,na[:,:,0]*255)).round().clip(0,255).astype(np.uint8);owned=patch[:,:,3]>0;rgba=np.zeros_like(original);rgba[owned]=out[owned]
 return rgba,owned

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--prototype',action='store_true');ap.add_argument('--output',type=Path,default=ART/'staged');args=ap.parse_args();output=args.output.resolve()
 if not output.is_relative_to(ROOT):ap.error('--output must be inside the repository so the seed manifest can record a project URL')
 output.mkdir(parents=True,exist_ok=True)
 (ART/'prepared').mkdir(parents=True,exist_ok=True)
 source,manifest,config,frames=load_source('female');basepath=ROOT/'docs/kling-wardrobe/registration/female.json';basebytes=basepath.read_bytes();reg=json.loads(basebytes)
 for frame in reg['frames']:
  points=REVIEW['nearHand'].get(str(frame['frameId']))
  if points:
   for region in frame['protected']:
    if region['label']=='nearHand':region['polygon']=[{'x':x,'y':y} for x,y in points]
 regbytes=json_bytes(reg);regpath=output/'original-tailored-v1.registration.json';regpath.write_bytes(regbytes);regs={r['frameId']:r for r in reg['frames']}
 tanks=read_bank(ROOT/'docs/kling-wardrobe/garments/female/teal-top.zip');shorts=read_bank(ROOT/'docs/kling-wardrobe/garments/female/ochre-shorts.zip')
 donors,skirt=prepare_donors();geometry={}
 for action,clip in manifest['animations'].items():
  values=[]
  for fid in clip['frames']:
   r=regs[fid];wl,wr=cloth_waist(r,tanks[fid][1]);wc=(wl+wr)/2;k=(source_point(r,'nearKnee')+source_point(r,'farKnee'))/2
   length=float(np.clip((k[1]-wc[1])*.9+15,115,165));width=float(np.clip((wr[0]-wl[0])*1.5,230,285));values.append([length,width])
  sm=nd.gaussian_filter1d(np.array(values),1,axis=0,mode='wrap' if clip['loop'] else 'nearest')
  for fid,g in zip(clip['frames'],sm):geometry[fid]=g
 keys=[0,28,39,51,55,58,62,67,75,87,95,103,111]
 selected=keys if args.prototype else sorted(frames);patches={'top':{},'bottom':{}};audit=[];previews={};motion={}
 for fid in selected:
  original=frames[fid];r=regs[fid];tank=tanks[fid][1];short=shorts[fid][1]
  top,did,forearms=fit_top(fid,original,r,regs,donors,tank)
  # All visible source arm/hand pixels around the waist stay in front of skirt.
  arm=arm_foreground(fid,original,r,tank,short)
  bottom=fit_skirt(fid,original,r,skirt,short,geometry,arm,tank)
  for slot,p in [('top',top),('bottom',bottom)]:patches[slot][fid]=compose(original,p)
  merged=original.copy()
  for slot in ['bottom','top']:
   p,o=patches[slot][fid];merged[o]=p[o]
  protected=protected_mask(r)&(original[:,:,3]>0);assert not np.any(merged[protected]!=original[protected]),fid
  shoe=reviewed_shoe(fid)&(original[:,:,3]>0);assert not np.any(merged[shoe]!=original[shoe]),fid
  hand=reviewed_hand(fid);assert not np.any(merged[hand]!=original[hand]),fid
  assert not np.any(hand&(patches['top'][fid][1]|patches['bottom'][fid][1])),fid
  both=patches['top'][fid][1]|patches['bottom'][fid][1];assert not np.any(merged[~both]!=original[~both]),fid
  motion[fid]=Image.fromarray(merged).resize((352,528),Image.Resampling.LANCZOS)
  audit.append({'frameId':fid,'topDonor':did,'protectedPixelsChanged':0,'outsideOwnershipChanged':0,'foregroundShoePixelsChanged':0,'foregroundShoePixels':int(shoe.sum()),'foregroundHandPixelsChanged':0,'foregroundHandPixels':int(hand.sum()),'topOwned':int(patches['top'][fid][1].sum()),'bottomOwned':int(patches['bottom'][fid][1].sum())})
  if fid in keys:previews[fid]=merged;Image.fromarray(merged).save(ART/f'prepared/original-{fid:03d}.png')
 font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14);sheet=Image.new('RGB',(352*4,560*((len(previews)+3)//4)),'#eee9df');dr=ImageDraw.Draw(sheet)
 for n,(fid,p) in enumerate(previews.items()):
  im=Image.fromarray(p).resize((352,528),Image.Resampling.LANCZOS);x=n%4*352;y=n//4*560;sheet.paste(im,(x,y+25),im);dr.text((x+5,y+4),f'Original / {fid} / donor 0',fill='#364438',font=font)
 sheet.save(ART/'prepared/original-hardposes.jpg')
 (ART/'prepared/audit.json').write_text(json.dumps({'sourceSha256':sha(source),'baseRegistrationSha256':sha(basebytes),'registrationSha256':sha(regbytes),'correctedHandFrames':list(map(int,REVIEW['nearHand'])),'completedSourceHandFrames':list(map(int,REVIEW.get('foregroundHand',{}))),'handForegroundReviewSha256':sha((ART/'source/hand-foreground-v1.json').read_bytes()),'poses':audit},indent=2)+'\n')
 if not args.prototype:
  items=[]
  provenance='Original-view cream blouse and rose shortskirt artwork generated with OpenAI imagegen; source references, generated donor image and processing provenance recorded in artwork/dual-tailored/female. The exact generation prompt was not retained. Eight donor poses were explored; the final bank uses the standing donor cloth continuously to avoid donor-switch flicker. Only traced clothing is used; generated faces, anatomy, shoes and background are discarded. One coherent painted bodice, independently anchored near/far puff sleeves and one continuous skirt fold layout are fitted offline to each unchanged source pose. Head/hand protection and uncovered source RGBA remain exact. Cloth alpha may extend the silhouette within explicit ownership; no runtime AI, source/body warp or timing changes.'
  for slot,name in [('top','Cream gathered-sleeve blouse'),('bottom','Rose gathered short skirt')]:
   item=save_garment('female',f'dual-female-original-{slot}-seed-v1',name,slot,regbytes,patches[slot],provenance,output/f'original-{slot}.garment.zip');items.append(item)
  (output/'seed-items.json').write_text(json.dumps({'sourceUrl':'/docs/kling-motion/exports/female.character.zip','registrationUrl':'/'+str(regpath.relative_to(ROOT)),'sourceSha256':sha(source),'registrationSha256':sha(regbytes),'items':items},indent=2)+'\n')
 if not args.prototype:
  for action,clip in manifest['animations'].items():
   pictures=[]
   for fid in clip['frames']:
    im=Image.new('RGB',(352,552),'#eee9df');im.paste(motion[fid],(0,24),motion[fid]);ImageDraw.Draw(im).text((8,5),f'Female original · {action} · source {fid}',font=font,fill='#364438');pictures.append(im)
   palette_sheet=Image.new('RGB',(352*len(pictures),552))
   for i,im in enumerate(pictures):palette_sheet.paste(im,(352*i,0))
   palette=palette_sheet.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
   pal=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in pictures]
   fps=clip['fps'];duration=[round((i+1)*100/fps)*10-round(i*100/fps)*10 for i in range(len(pictures))]
   pal[0].save(ART/f'prepared/original-{action}.gif',save_all=True,append_images=pal[1:],duration=duration,loop=0,disposal=2,optimize=False)
   ids=list(dict.fromkeys(clip['frames']));grid=Image.new('RGB',(176*8,288*((len(ids)+7)//8)),'#eee9df');dr=ImageDraw.Draw(grid)
   for i,fid in enumerate(ids):
    im=motion[fid].resize((176,264),Image.Resampling.LANCZOS);x=i%8*176;y=i//8*288;grid.paste(im,(x,y+24),im);dr.text((x+3,y+3),f'{action} {fid}',fill='#364438',font=font)
   grid.save(ART/f'prepared/original-{action}-all.jpg')
 print(json.dumps({'frames':len(selected),'review':str(ART/'prepared/original-hardposes.jpg')}))
if __name__=='__main__':main()
