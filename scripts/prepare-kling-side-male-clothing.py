#!/usr/bin/env python3
"""Fit painted shirt and trouser cloth to the frozen 512x768 male side source.

The donor is recorded repository artwork. Only manually traced cloth pixels
are sampled; source heads, skin outside clothing and pose timing stay exact.
"""
from __future__ import annotations

import argparse
from functools import lru_cache
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as nd

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'artwork/kling-side-expansion/male'
OUT = ROOT / 'docs/kling-side-expansion/male'
ASSETS = ROOT / 'docs/kling-side-expansion/assets'
TMP = Path('/tmp/side-expansion/male')
DONOR = ART / 'painted-donor.png'
KEYS = [0, 24, 30, 38, 42, 48, 53, 58, 67, 73, 78, 89, 94, 97, 101, 106]
H, W = 768, 512
YY, XX = np.indices((H, W), dtype=np.float32)
REGIONS = ('nearArm', 'farArm', 'nearLeg', 'farLeg')
TOP_ID = 'side-male-oxford-shirt-v1'
BOTTOM_ID = 'side-male-stone-trousers-v1'
# Source-visible pink calf/thigh islands inspected independently of the shoes.
PINK_LEG_FRAMES = {24, 60, 68, 74, 77, 98, 101}
UPPER_ARM_SUPPORT = {92: [(194,358),(208,358),(208,375),(194,375)]}
# Freeze these source-measured near-leg widths so a local hand-contour repair
# cannot rescale the distant trouser texture. Values are the accepted native
# c41 registration measurements; selected head/hand protection still governs
# every owned pixel. The corresponding source anchors are unchanged.
LEG_WIDTH_HINTS = {47: {'near': 24.733198165893555},
                   56: {'near': 27.461021423339844}}
TRACE = {
 'torso': [(422,775),(437,778),(529,812),(536,798),(547,796),(558,808),(576,835),(589,851),(605,883),(610,925),(608,969),(608,997),(592,1005),(532,1009),(469,1006),(431,998),(435,965),(451,944),(462,913),(463,876),(452,848),(424,832),(402,835),(391,842),(410,810),(416,793)],
 'near': [(399,833),(424,833),(445,847),(458,872),(462,899),(454,931),(448,947),(432,936),(408,926),(382,919),(358,918),(347,913),(355,894),(360,874),(372,854),(389,839)],
 'far': [(399,833),(424,833),(445,847),(458,872),(462,899),(454,931),(448,947),(432,936),(408,926),(382,919),(358,918),(347,913),(355,894),(360,874),(372,854),(389,839)],
 'trousers': [(434,1003),(607,1000),(611,1022),(616,1063),(615,1111),(607,1153),(604,1197),(597,1237),(603,1268),(575,1285),(545,1291),(505,1289),(503,1258),(500,1236),(506,1207),(510,1170),(484,1218),(479,1267),(473,1292),(447,1293),(414,1300),(391,1303),(372,1296),(370,1288),(375,1267),(373,1243),(372,1214),(380,1187),(392,1162),(392,1133),(418,1122),(430,1093),(431,1051),(424,1031)],
}
# Native source shoe-only contours reviewed against coordinate-grid crops.
# These repair incomplete old shoe masks locally; no color flood can retain
# a disconnected patch of skin or an old shorts hem as if it were footwear.
FOOT_TRACES = {
 41: [
  [(254,621),(259,626),(268,630),(282,631),(293,627),(299,625),(308,632),(322,637),(331,644),(334,653),(333,663),(322,667),(304,669),(278,665),(252,656),(241,649),(242,638),(248,628)],
  [(129,637),(129,645),(136,653),(145,657),(160,656),(167,656),(170,663),(182,673),(189,677),(190,693),(183,701),(161,704),(142,700),(122,690),(111,675),(107,661),(109,648),(119,641)]],
 56: [[(168,578),(180,580),(187,591),(184,605),(187,615),(199,620),(192,634),(190,652),(184,663),(171,668),(160,665),(153,654),(151,634),(151,610),(153,590)]],
 59: [
  [(225,627),(234,627),(233,640),(230,654),(223,673),(216,674),(208,663),(204,651),(209,641),(218,635)],
  [(145,660),(152,668),(166,670),(179,668),(191,669),(200,675),(209,677),(220,681),(225,690),(223,702),(207,706),(185,704),(163,699),(146,692),(133,684),(132,676),(137,665)]],
 60: [
  [(121,625),(116,634),(118,644),(127,651),(145,655),(157,652),(170,652),(177,660),(179,670),(188,677),(199,684),(202,696),(197,706),(177,709),(153,705),(133,699),(115,688),(104,674),(96,655),(92,642),(99,632),(111,628)],
  [(255,615),(262,620),(274,625),(289,626),(301,623),(308,626),(311,637),(329,646),(342,655),(344,664),(338,674),(320,675),(302,667),(281,657),(262,648),(246,636),(239,626),(242,617)]],
 97: [
  [(189,460),(190,465),(199,471),(213,474),(227,471),(236,471),(240,478),(249,488),(259,500),(261,508),(256,519),(244,524),(221,522),(202,513),(186,501),(176,489),(171,477),(175,469),(181,464)],
  [(265,458),(267,466),(276,472),(291,476),(306,472),(312,471),(316,482),(332,491),(340,502),(341,514),(332,521),(315,523),(299,519),(280,511),(261,500),(250,490),(249,480),(254,469)]],
}

def sha(data): return hashlib.sha256(data).hexdigest()

def point(points, key):
    return np.array([points[key]['x'], points[key]['y']], np.float32)

def polygon(points, size=(1024,1536)):
    im=Image.new('L',size);ImageDraw.Draw(im).polygon(points,fill=255)
    return np.asarray(im)>0

def segment(a,b):
    v=b-a;length=max(1.,float(np.linalg.norm(v)));unit=v/length
    raw=(XX-a[0])*unit[0]+(YY-a[1])*unit[1]
    t=np.clip(raw,0,length)
    dx=XX-a[0]-t*unit[0];dy=YY-a[1]-t*unit[1]
    return np.hypot(dx,dy),raw/length,dx*(-unit[1])+dy*unit[0]

def runtime_raster(poly):
    # Same pixel-center, inclusive-boundary scanline rule as protection.ts.
    import math
    mask=np.zeros((H,W),bool)
    top=max(0,math.ceil(min(p['y'] for p in poly)-.5));bottom=min(H-1,math.floor(max(p['y'] for p in poly)-.5))
    for y in range(top,bottom+1):
        cy=y+.5;crossings=[]
        def add(a,b):
            left=max(0,math.ceil(min(a,b)-.5-1e-9));right=min(W-1,math.floor(max(a,b)-.5+1e-9))
            if left<=right:mask[y,left:right+1]=True
        for i,b in enumerate(poly):
            a=poly[i-1]
            if (a['y']>cy)!=(b['y']>cy):crossings.append(a['x']+(cy-a['y'])*(b['x']-a['x'])/(b['y']-a['y']))
            if abs(a['y']-cy)<1e-9 and abs(b['y']-cy)<1e-9:add(a['x'],b['x'])
            elif abs(a['y']-cy)<1e-9:add(a['x'],a['x'])
        crossings.sort()
        for i in range(0,len(crossings)-1,2):add(crossings[i],crossings[i+1])
    return mask

class NativeContext:
    """Small read-only fallback while the shared packer builds authoring kits."""
    def __init__(self,registration_path=None):
        p=ROOT/'docs/kling-side-workspace/assets'
        self.source_bytes=(p/'male.source.zip').read_bytes()
        candidate=Path(registration_path) if registration_path else p/'male.registration.json'
        self.registration_bytes=candidate.read_bytes()
        self.registration_path=candidate
        self.registration=json.loads(self.registration_bytes)
        self.registered={f['frameId']:f for f in self.registration['frames']}
        frozen_registration=json.loads((p/'male.registration.json').read_text())
        self.source_registered={f['frameId']:f for f in frozen_registration['frames']}
        self.frames={}
        with zipfile.ZipFile(io.BytesIO(self.source_bytes)) as z:
            self.manifest=json.loads(z.read('manifest.json'))
            pages=[Image.open(io.BytesIO(z.read('spritesheet.png' if i==0 else f'spritesheet-{i}.png'))).convert('RGBA') for i in range(3)]
            for f in self.manifest['frames']:
                self.frames[f['id']]=np.array(pages[f['page']].crop((f['x'],f['y'],f['x']+W,f['y']+H)))
        assert sha(self.source_bytes)==self.registration['sourceSha256']
    def masks(self,fid):
        root=ROOT/'artwork/kling-side-workspace/registration/male/masks'
        return {n:np.array(Image.open(root/f'{fid:04}-{n}.png').convert('L'))>0 for n in ('top','bottom','shoes','skin')}
    def protected_mask(self,fid):
        mask=np.zeros((H,W),bool)
        for r in self.registered[fid]['protected']:mask |= runtime_raster(r['polygon'])
        return mask & (self.frames[fid][:,:,3]>0)

@lru_cache(maxsize=4)
def donor_texture(region):
    rgb=np.array(Image.open(DONOR).convert('RGB'),np.float32)
    valid=polygon(TRACE[region]);yy,xx=np.indices(valid.shape)
    r,g,b=rgb.transpose(2,0,1)
    if region!='trousers':
        cloth=(r>g+25)&(g>b+12)&(r<240)&(g>40)&(b>20)
        buttons=(r>190)&(g>160)&(b>110)&(r-b<115)
        valid &= cloth|buttons
        # Warm oxide red is applied to painted cotton, preserving highlights,
        # dark seams and the original cream buttons independently.
        lum=rgb@np.array([.2126,.7152,.0722])
        styled=rgb.copy()
        styled[buttons]=rgb[buttons]
        padding=nd.binary_erosion(valid,iterations=5)&cloth
    else:
        # Stone twill retains the donor's folds, pocket ink and brown belt.
        cloth=(r>g)&(g>b+4)&(r>50)&(g>40)&(b>20)&(r-g<45)&~((r>235)&(g>218))
        valid &= cloth
        lum=rgb@np.array([.2126,.7152,.0722])
        styled=rgb.copy()
        padding=nd.binary_erosion(valid,iterations=5)&(yy>1040)&(yy<1280)
    _,near=nd.distance_transform_edt(~padding,return_indices=True)
    texture=styled[tuple(near)];texture[valid]=styled[valid]
    # A native game garment occupies only about a hundred pixels across. Mild
    # cloth-local filtering keeps seams readable without stretched tiny ink.
    texture=nd.gaussian_filter(texture,sigma=(.85,.85,0))
    return np.clip(texture,0,255),valid

def sample(region,sx,sy):
    rgb,_=donor_texture(region)
    return np.stack([nd.map_coordinates(rgb[:,:,i],[sy,sx],order=1,mode='nearest') for i in range(3)],axis=-1)

def shoe_guard(original,masks,frame_id=None):
    """Keep original shoe ink/matte outside its conservative white-material mask."""
    r,g,b=original[:,:,:3].astype(np.int16).transpose(2,0,1)
    strong_skin=(r>150)&(g>80)&(r-g>30)&(g-b>15)
    nearby=nd.distance_transform_edt(~masks['shoes'])<=5
    guard=masks['shoes'] | (nearby&(original[:,:,3]>0)&(~strong_skin|(original[:,:,3]<128)))
    for contour in FOOT_TRACES.get(frame_id,[]):
        guard |= polygon(contour,size=(W,H))&(original[:,:,3]>0)
    return guard

def limbs(ctx,fid,masks):
    original=ctx.frames[fid];points=ctx.registered[fid]['points'];protected=ctx.protected_mask(fid)
    blocked=protected|masks['top']|masks['bottom']|shoe_guard(original,masks,fid)
    eligible=(original[:,:,3]>0)&~blocked
    distances=[];splits={}
    for region in REGIONS:
        side='near' if region.startswith('near') else 'far'
        names=('Shoulder','Elbow','Wrist') if region.endswith('Arm') else ('Hip','Knee','Ankle')
        a,b,c=[point(points,side+n) for n in names]
        d0,t0,_=segment(a,b);d1,t1,_=segment(b,c)
        d=np.minimum(d0,d1)
        if all(points[side+n]['visibility']=='occluded' for n in names):d[:]=np.inf
        d[d>(55 if region.endswith('Arm') else 64)]=np.inf
        distances.append(d);splits[region]=(d0,d1,t1)
    stack=np.stack(distances);winner=stack.argmin(axis=0);local=np.isfinite(stack.min(axis=0))
    r,g,b=original[:,:,:3].astype(np.int16).transpose(2,0,1)
    warm=eligible&local&(r>140)&(g>70)&(r-g>25)&(g>b+15)
    labels,count=nd.label(warm);sizes=np.bincount(labels.ravel());seeds=np.zeros((H,W),np.uint8)
    for label in range(1,count+1):
        if sizes[label]<30:continue
        mask=labels==label;yy,xx=np.where(mask)
        # Guard the residual neck under the exact immutable head contour.
        neck=point(points,'neck')
        is_neck=np.hypot(xx.mean()-neck[0],yy.mean()-neck[1])<26 and np.ptp(xx)<75 and np.ptp(yy)<48
        owner=5 if is_neck else int(np.bincount(winner[mask],minlength=4).argmax())+1
        seeds[mask]=owner
    _,near=nd.distance_transform_edt(seeds==0,return_indices=True)
    owners=seeds[tuple(near)]
    # Fine video matte and shoe-outline pixels are not evidence of exposed
    # limbs. A visible limb must remain contiguous with actual warm skin.
    skin_distance=nd.distance_transform_edt(~warm)
    supported=skin_distance<=4
    result={}
    for i,region in enumerate(REGIONS):
        region_support=supported
        if region.endswith('Leg') and fid in PINK_LEG_FRAMES:
            d0,d1,last_phase=splits[region]
            # Pink video spill can make a genuine calf fail the warm-core
            # color test. The independent source skin proof is sufficient
            # inside the leg, ending before the ankle/foot attachment.
            region_support = supported | (masks['skin']&((d0<=d1)|(last_phase<.9)))
        result[region]=eligible&local&region_support&(owners==i+1)
    if fid in UPPER_ARM_SUPPORT:
        # This small source-observed pink upper-arm island is not clothing,
        # neck or hand. Its color fails the warm-core hint despite lying in
        # the independently supplied source skin proof.
        reviewed=polygon(UPPER_ARM_SUPPORT[fid],size=(W,H))&masks['skin']&eligible&local
        for region in REGIONS:
            result[region] &= ~reviewed
        result['nearArm'] |= reviewed
    for region in REGIONS:
        side='near' if region.startswith('near') else 'far'
        names=('UpperArm','Forearm') if region.endswith('Arm') else ('Thigh','Shin')
        d0,d1,_=splits[region]
        result[side+names[0]]=result[region]&(d0<=d1)
        result[side+names[1]]=result[region]&(d0>d1)
    return result

def finish_patch(original,rgb,core,blocked,extra=2.0,edge_color=(73,38,28)):
    """Small true cloth allowance extends only into empty source canvas."""
    core=core&~blocked
    labels,_=nd.label(core);sizes=np.bincount(labels.ravel())
    core &= sizes[labels]>=12
    distance,near=nd.distance_transform_edt(~core,return_indices=True)
    owned=(core|((distance<=extra)&(original[:,:,3]==0)))&~blocked
    color=rgb[tuple(near)].copy()
    # Preserve smooth source coverage, add a restrained painted cloth contour.
    solid=core&(original[:,:,3]>=128)
    outside=nd.distance_transform_edt(~solid)
    alpha=np.clip(extra+.75-outside,0,1)
    edge=nd.distance_transform_edt(owned)
    ink=np.clip((1.9-edge)/1.0,0,1)
    color=color*(1-ink[:,:,None])+np.array(edge_color)*ink[:,:,None]
    patch=np.zeros_like(original);patch[owned,:3]=np.rint(np.clip(color[owned],0,255)).astype(np.uint8);patch[owned,3]=np.rint(alpha[owned]*255).astype(np.uint8)
    return patch,owned

@lru_cache(maxsize=1)
def retained_cloth_pixels():
    return json.loads((ART/'stable-outer-cloth-pixels.json').read_text())

def preserve_outer_cloth(ctx,fid,slot,result):
    """Keep accepted cloth outside frame56's narrowly reviewed hand repair."""
    if fid!=56:return result
    record=retained_cloth_pixels()
    assert sha(ctx.source_bytes)==record['sourceSha256']
    assert sha(ctx.frames[fid].tobytes())==record['sourceFrameRgbaSha256']
    patch,owned=result;protected=ctx.protected_mask(fid)
    for x,y,r,g,b,a,owns in record['slots'][slot]:
        assert not protected[y,x],(fid,slot,x,y)
        patch[y,x]=[r,g,b,a];owned[y,x]=owns
    return patch,owned

def shirt(ctx,fid,masks,limb):
    original=ctx.frames[fid];p=ctx.registered[fid]['points'];neck=point(p,'neck')
    wl,wr=point(p,'waistLeft'),point(p,'waistRight');waist=(wl+wr)/2
    mask=masks['top'].copy();wy=wl[1]+(XX-wl[0])*(wr[1]-wl[1])/max(1,wr[0]-wl[0])
    extent=np.percentile((YY-wy)[mask],99.8)
    v=np.clip((YY-neck[1]+8)/np.maximum(45,wy+extent-neck[1]+8),0,1)
    # Side view: centre placket is toward the facing-right front edge.
    center=neck[0]*(1-v)+waist[0]*v
    width=max(70,wr[0]-wl[0])*(1.15-.15*v)
    u=(XX-center)/width
    sx=499*(1-v)+522*v+u*(175*(1-v)+180*v)
    sy=787*(1-v)+1003*v
    rgb=sample('torso',sx,sy)
    top_mask=mask.copy()
    for side in ('far','near'):
        shoulder,elbow,wrist=[point(p,side+n) for n in ('Shoulder','Elbow','Wrist')]
        # Candidate wrist anchors describe the newly traced palm attachment.
        # The source's original forearm axis remains the better cloth-occlusion
        # guide on compressed limbs; neither the source nor protection moves.
        wrist=point(ctx.source_registered[fid]['points'],side+'Wrist')
        d,phase,cross=segment(shoulder,elbow)
        sleeve_length=.65
        # The source shoulder is a broad rounded cap above its estimated
        # anchor. Do not truncate it with a longitudinal lower bound.
        sleeve=limb[side+'Arm']&(phase<=sleeve_length)
        # A folded returning forearm stays bare in front of its sleeve.
        fore,forephase,_=segment(elbow,wrist)
        v0=elbow-shoulder;v1=wrist-elbow
        folded=float(v0@v1)/(max(1,np.linalg.norm(v0))*max(1,np.linalg.norm(v1)))<.15
        if folded:
            sleeve &= (fore> (17 if side=='near' else 13)) | (forephase<.05)
        progress=np.clip(phase/sleeve_length,0,1)
        axis=np.array([[409,855],[398,925]],float)
        vector=axis[1]-axis[0];vector/=np.linalg.norm(vector);normal=np.array([-vector[1],vector[0]])
        arm_width=24 if side=='near' else 17
        dw=49*(1-progress)+52*progress
        dsx=axis[0,0]*(1-progress)+axis[1,0]*progress+normal[0]*cross/arm_width*dw
        dsy=axis[0,1]*(1-progress)+axis[1,1]*progress+normal[1]*cross/arm_width*dw
        color=sample(side,dsx,dsy)*(1 if side=='near' else .94)
        # The final donor cuff is painted as a narrow folded fabric hem.
        # The donor already contains a folded cuff; keep its actual painted
        # seam instead of drawing a second heavy transverse band on the arm.
        rgb[sleeve]=color[sleeve];mask |= sleeve
        # Blend only shoulder cloth domains. Forearm occlusion remains exact.
        ds=nd.distance_transform_edt(~sleeve);dt=nd.distance_transform_edt(~top_mask)
        near_join=(np.hypot(XX-shoulder[0],YY-shoulder[1])<34)&(sleeve|top_mask)&(v<.5)
        signed=np.where(sleeve,dt,-ds);weight=np.clip(.5+signed/13,0,1)
        basecolor=sample('torso',sx,sy)
        blend=basecolor*(1-weight[:,:,None])+color*weight[:,:,None]
        rgb[near_join&(np.abs(signed)<6)]=blend[near_join&(np.abs(signed)<6)]
    blocked=ctx.protected_mask(fid)|masks['shoes']|masks['bottom']
    return preserve_outer_cloth(ctx,fid,'top',finish_patch(original,rgb,mask,blocked,extra=2.2))

def leg_field(chain):
    a,b,c=chain;d0,t0,c0=segment(a,b);d1,t1,c1=segment(b,c)
    l0=np.linalg.norm(b-a);l1=np.linalg.norm(c-b);fraction=l0/max(l0+l1,1)
    choose=d1<d0
    along=np.where(choose,l0+np.clip(t1,0,1)*l1,np.clip(t0,0,1)*l0)/(l0+l1)
    cross=np.where(choose,c1,c0)
    return along,cross,fraction,d0,d1

def trousers(ctx,fid,masks,limb):
    original=ctx.frames[fid];p=ctx.registered[fid]['points'];legs=limb['nearLeg']|limb['farLeg']
    core=masks['bottom']|legs
    colors={};distances={}
    for side in ('far','near'):
        chain=[point(p,side+n) for n in ('Hip','Knee','Ankle')]
        s,cross,fraction,d0,d1=leg_field(chain)
        first=s<=fraction;local=np.clip(np.where(first,s/max(fraction,.01),(s-fraction)/max(1-fraction,.01)),0,1)
        donor=np.array([[457,1090],[430,1192],[419,1290]] if side=='near' else [[568,1084],[554,1195],[551,1280]],float)
        a,b,c=donor;v0=b-a;v1=c-b
        center=np.where(first[:,:,None],a+local[:,:,None]*v0,b+local[:,:,None]*v1)
        direction=np.where(first[:,:,None],v0/np.linalg.norm(v0),v1/np.linalg.norm(v1));normal=np.stack([-direction[:,:,1],direction[:,:,0]],axis=-1)
        measured=np.abs(cross[limb[side+'Leg']]);width=float(np.percentile(measured,92)) if len(measured)>40 else 24.
        width=np.clip(width,19,36)
        width=LEG_WIDTH_HINTS.get(fid,{}).get(side,width)
        dw=np.where(first,45*(1-local)+41*local,41*(1-local)+45*local)
        coords=center+normal*(np.clip(cross/width,-.88,.88)*dw)[:,:,None]
        color=sample('trousers',coords[:,:,0],coords[:,:,1])
        # Source leg value contributes a little pose volume, no skin hue.
        lum=nd.gaussian_filter(original[:,:,:3].mean(axis=2),2)
        color*=np.clip(.9+.1*lum/180,.87,1.06)[:,:,None]
        colors[side]=color;distances[side]=np.minimum(d0,d1)
    near=limb['nearLeg']|(masks['bottom']&(distances['near']<=distances['far']))
    rgb=np.where(near[:,:,None],colors['near'],colors['far'])
    wl,wr=point(p,'waistLeft'),point(p,'waistRight');wy=(wl[1]+wr[1])/2
    hip=(p['nearHip']['y']+p['farHip']['y'])/2
    v=np.clip((YY-wy)/max(35,hip+18-wy),0,1)
    rows=np.flatnonzero(masks['bottom'].any(axis=1))
    left=[np.flatnonzero(masks['bottom'][r])[0] for r in rows];right=[np.flatnonzero(masks['bottom'][r])[-1] for r in rows]
    l=nd.gaussian_filter1d(np.interp(np.arange(H),rows,left),3)[:,None];r=nd.gaussian_filter1d(np.interp(np.arange(H),rows,right),3)[:,None]
    u=np.clip((XX-l)/np.maximum(r-l,45),.03,.97)
    pelvis=sample('trousers',434+u*(607-434),1011+v*(1108-1011))
    blend=np.clip((.78-v)/.36,0,1)*masks['bottom']
    rgb=pelvis*blend[:,:,None]+rgb*(1-blend[:,:,None])
    blocked=ctx.protected_mask(fid)|masks['top']|shoe_guard(original,masks,fid)|limb['nearArm']|limb['farArm']
    return preserve_outer_cloth(ctx,fid,'bottom',finish_patch(original,rgb,core,blocked,extra=2.6,edge_color=(66,54,41)))

def donor_provenance():
    ART.mkdir(parents=True,exist_ok=True)
    record={'format':'gathria-painted-cloth-donor','version':1,'source':str(DONOR.relative_to(ROOT)),
        'sourceSha256':sha(DONOR.read_bytes()),'generationDate':'2026-10-29','generator':'OpenAI image-generation tool',
        'promptFile':'donor-prompt.txt','manualClothOnlyContours':TRACE,
        'referenceSource':'docs/kling-side-workspace/assets/male.source.zip','referenceSourceSha256':sha((ROOT/'docs/kling-side-workspace/assets/male.source.zip').read_bytes()),'referenceFrameId':0,
        'manuallyReviewedNativeSourceFootContours':FOOT_TRACES,
        'reviewedSourcePinkLegSupportFrames':sorted(PINK_LEG_FRAMES),
        'reviewedNativeUpperArmSkinSupport':UPPER_ARM_SUPPORT,
        'stableSourceLegWidthHints':LEG_WIDTH_HINTS,
        'stableSourceLegWidthMeasurementRegistrationSha256':'c41aa37b45e314d48740d7b5148bde4bc71d54282c9f21e13d7376802464c366',
        'retainedOuterClothPixels':{'file':'stable-outer-cloth-pixels.json','sha256':sha((ART/'stable-outer-cloth-pixels.json').read_bytes()),'frameId':56,'shirtPixels':27,'trousersPixels':2},
        'palette':'Fresh painted terracotta cotton / warm stone twill donor. Collar, cuff, placket, pocket and fold artwork retained.',
        'exclusions':'Generated head, face, neck, skin, hands, shoes and background are never sampled. Padding is nearest interior cloth.',
        'donorPixelsAreNotSourceBody':True}
    for region in TRACE:
        rgb,valid=donor_texture(region);rgba=np.zeros((*valid.shape,4),np.uint8)
        rgba[valid,:3]=rgb[valid];rgba[valid,3]=255
        image=Image.fromarray(rgba);bbox=image.getbbox();image=image.crop(bbox)
        path=ART/f'cloth-only-{region}.png';image.save(path,optimize=True)
        record.setdefault('cutouts',{})[region]={'file':path.name,'sourceCrop':bbox,'sha256':sha(path.read_bytes()),'clothPixels':int(valid.sum())}
    (ART/'provenance.json').write_text(json.dumps(record,indent=2)+'\n')
    return record

def preview(ctx,styled,ids,name):
    OUT.mkdir(parents=True,exist_ok=True);TMP.mkdir(parents=True,exist_ok=True)
    scale=.8;cellw=410;cellh=660
    canvas=Image.new('RGB',(cellw*len(ids),cellh),'#eee8dd');draw=ImageDraw.Draw(canvas)
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',16)
    for i,fid in enumerate(ids):
        im=Image.fromarray(styled[fid]);im=im.resize((410,614),Image.Resampling.LANCZOS)
        canvas.paste(im,(cellw*i,30),im);draw.text((cellw*i+16,10),f'FRAME {fid:03} · native right',fill='#49362d',font=font)
    canvas.save(OUT/name,optimize=True)

def playback_review(ctx,styled):
    """Offline cloth review, native facing plus exact mirrored composition."""
    for action,clip in ctx.manifest['animations'].items():
        frames=[]
        for fid in clip['frames']:
            im=Image.fromarray(styled[fid]).resize((256,384),Image.Resampling.LANCZOS)
            canvas=Image.new('RGB',(512,410),'#eee8dd');draw=ImageDraw.Draw(canvas)
            canvas.paste(im,(0,24),im);mirror=im.transpose(Image.Transpose.FLIP_LEFT_RIGHT);canvas.paste(mirror,(256,24),mirror)
            draw.text((8,6),f'{action} {fid:03} / supplied right',fill='#49362d');draw.text((264,6),'exact mirror / left',fill='#49362d')
            frames.append(canvas)
        # GIF stores centiseconds. Distribute 40/50 ms samples to retain the
        # 24-fps action duration; source/garment ZIP cadence stays untouched.
        times=[round(i*100/clip['fps'])*10 for i in range(len(frames)+1)]
        durations=[b-a for a,b in zip(times,times[1:])]
        loop={'loop':0} if clip['loop'] else {}
        frames[0].save(OUT/f'{action}-review.gif',save_all=True,append_images=frames[1:],duration=durations,disposal=2,**loop)
    contact_review(ctx,styled)

def contact_review(ctx,styled):
    """Large garment crops make every frame's cuff and contour reviewable."""
    for action,clip in ctx.manifest['animations'].items():
        ids=clip['frames'];cols=min(7,len(ids));cw,ch=260,300
        sheet=Image.new('RGB',(cols*cw,((len(ids)+cols-1)//cols)*ch),'#eee8dd');d=ImageDraw.Draw(sheet)
        for i,fid in enumerate(ids):
            p=ctx.registered[fid]['points'];source=styled[fid];start=max(0,int(p['neck']['y'])-16)
            visible=source[:,:,3]>0;visible[:start]=False;yy,xx=np.where(visible)
            crop=Image.fromarray(source).crop((max(0,int(xx.min())-8),start,min(W,int(xx.max())+9),min(H,int(yy.max())+9)))
            crop.thumbnail((cw-12,ch-27),Image.Resampling.LANCZOS)
            x=(i%cols)*cw+(cw-crop.width)//2;y=(i//cols)*ch+24
            sheet.paste(crop,(x,y),crop);d.text(((i%cols)*cw+8,(i//cols)*ch+7),f'{action} / {fid:03}',fill='#49362d')
        sheet.save(OUT/f'{action}-contact.png',optimize=True)

def protection_review(ctx):
    frozen=json.loads((ROOT/'docs/kling-side-workspace/assets/male.registration.json').read_text())
    frozen_frames={f['frameId']:f for f in frozen['frames']}
    examples=[(42,'farHand','Frozen far-hand polygon overlaps rear thigh skin.',(160,555,194,575)),
              (48,'nearHand','Frozen near-hand polygon overlaps bent knee skin.',(236,558,280,590)),
              (97,'head','Frozen head polygon extends into near shoulder skin.',(151,279,233,323))]
    records=[];sheet=Image.new('RGB',(W*3,H),'#eee8dd')
    for column,(fid,label,reason,bbox) in enumerate(examples):
        source=ctx.frames[fid];region=next(r for r in frozen_frames[fid]['protected'] if r['label']==label)
        mask=runtime_raster(region['polygon'])&(source[:,:,3]>0)
        x0,y0,x1,y1=bbox;box=np.zeros((H,W),bool);box[y0:y1+1,x0:x1+1]=True;overlap=mask&box
        overlay=source.copy();overlay[mask,:3]=np.rint(overlay[mask,:3]*.3+np.array([215,40,95])*.7)
        im=Image.fromarray(overlay);sheet.paste(im,(column*W,0),im);d=ImageDraw.Draw(sheet)
        d.rectangle((column*W+x0,y0,column*W+x1,y1),outline='#38b8cc',width=3)
        d.text((column*W+15,20),f'frame {fid}: {label} frozen protection',fill='#49362d')
        remaining=ctx.protected_mask(fid)&overlap
        records.append({'frameId':fid,'protectedLabel':label,'reason':reason,'reviewBounds':bbox,'frozenProtectedSourcePixelsInBounds':int(overlap.sum()),'candidateProtectedSourcePixelsInBounds':int(remaining.sum()),'status':'See separate reviewed registration; original registration is immutable.'})
    sheet.save(OUT/'protection-review.png',optimize=True)
    registration_file=str(ctx.registration_path.relative_to(ROOT)) if ctx.registration_path.is_relative_to(ROOT) else str(ctx.registration_path)
    (OUT/'protection-limitations.json').write_text(json.dumps({'format':'gathria-frozen-protection-review','sourceSha256':sha(ctx.source_bytes),'registrationSha256':sha(ctx.registration_bytes),'registrationFile':registration_file,'policy':'Frozen source and original registration are immutable. A separately reviewed clothing registration may correct false-positive shoulder/knee regions. Strict protected-pixel checks use the exact selected registration without bypass.','examples':records},indent=2)+'\n')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--preview-only',action='store_true');parser.add_argument('--registration',type=Path);args=parser.parse_args()
    candidate=ROOT/'artwork/kling-side-expansion/templates/male.registration.json'
    registration=args.registration or (candidate if candidate.exists() else None)
    if not args.preview_only and registration is None:
        raise SystemExit('Full clothing banks require the separately reviewed male.registration.json candidate.')
    ctx=NativeContext(registration);provenance=donor_provenance()
    ids=KEYS if args.preview_only else list(ctx.frames)
    tops={};bottoms={};owners_top={};owners_bottom={};styled={};audit=[]
    for fid in ids:
        masks=ctx.masks(fid);limb=limbs(ctx,fid,masks)
        top,top_owned=shirt(ctx,fid,masks,limb);bottom,bottom_owned=trousers(ctx,fid,masks,limb)
        original=ctx.frames[fid];after=original.copy();after[bottom_owned]=bottom[bottom_owned];after[top_owned]=top[top_owned]
        protected=ctx.protected_mask(fid)
        assert np.array_equal(after[protected],original[protected]),fid
        assert np.array_equal(after[~(top_owned|bottom_owned)],original[~(top_owned|bottom_owned)]),fid
        tops[fid]=top;bottoms[fid]=bottom;owners_top[fid]=top_owned;owners_bottom[fid]=bottom_owned;styled[fid]=after
        audit.append({'frameId':fid,'shirtOwnedPixels':int(top_owned.sum()),'trousersOwnedPixels':int(bottom_owned.sum()),'shirtNewSleevePixels':int((top_owned&~masks['top']).sum()),'trousersNewLegPixels':int((bottom_owned&~masks['bottom']).sum()),'protectedPixelChanges':0,'outsideOwnershipChanges':0})
        if fid in KEYS:Image.fromarray(after).save(TMP/f'fitted-{fid:03}.png')
        print(f'fit {fid}',flush=True)
    preview(ctx,styled,[0,42,48,97],'difficult-poses.png')
    for label,selection in [('walk',[24,30,38]),('jump',[58,67,73,78,89,94,97,101,106])]:preview(ctx,styled,selection,f'{label}-poses.png')
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'paint-audit.json').write_text(json.dumps({'sourceSha256':sha(ctx.source_bytes),'registrationSha256':sha(ctx.registration_bytes),'frames':audit,'sourceFrameCount':107,'newArtwork':True},indent=2)+'\n')
    protection_review(ctx)
    if not args.preview_only:
        playback_review(ctx,styled)
        from kling_side_authoring import load_context,pack_garment
        shared=load_context('male',registration_path=ctx.registration_path);ASSETS.mkdir(parents=True,exist_ok=True)
        provenance.update(sourcePackSha256=sha(ctx.source_bytes),registrationSha256=sha(ctx.registration_bytes),authoringScript='scripts/prepare-kling-side-male-clothing.py')
        (ART/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
        provenance_text=(f"Painted cloth-only fit from {provenance['source']} (SHA256 {provenance['sourceSha256']}); manual cloth traces and exact recorded image-generation prompt are in artwork/kling-side-expansion/male/provenance.json. The donor's generated body, head, skin, hands, shoes and background are excluded. Warm terracotta cotton / stone twill; new sleeves and full trouser coverage follow source-visible limbs. Exact native male source and selected registration; no body warp, retiming or changed facing. Original source/registration remain immutable. A separately reviewed new-cut registration corrects false-positive shoulder/knee protection; strict head/hand pixel checks remain enabled. See docs/kling-side-expansion/male/protection-limitations.json.")
        for item,name,slot,paintings,ownership in [(TOP_ID,'Terracotta short-sleeve shirt','top',tops,owners_top),(BOTTOM_ID,'Warm stone trousers','bottom',bottoms,owners_bottom)]:
            filename='male-shirt.garment.zip' if slot=='top' else 'male-trousers.garment.zip'
            result=pack_garment(shared,item,name,slot,paintings,ASSETS/filename,provenance_text,ownership=ownership,painting_mode='patch')
            (OUT/f'{slot}-audit.json').write_text(json.dumps(result,indent=2)+'\n')
            print(json.dumps({k:result[k] for k in ('id','file','sha256','bytes','decodedPixelsPerAtlasKind')}),flush=True)

if __name__=='__main__':main()
