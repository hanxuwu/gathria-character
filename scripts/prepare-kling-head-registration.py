#!/usr/bin/env python3
"""Reproducible offline head guides for the approved native Kling sprite frames.

This does not reconstruct faces or change source pixels. The registration is an
inferred authoring guide, not motion capture. Frame 0/source frame 336 is manually
annotated; unique SIFT/RANSAC correspondences propagate its head transform.
Weak expression/blur matches use reviewed adjacent poses, never a collapsed fit.
Local Farneback residuals refine inner-face guides; closed/laughing eyes retain
source expressions. Run with the same Pillow/numpy/OpenCV dependencies used by
the wardrobe preparation scripts. Output coordinates remain native 704 x 1056.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.optimize import least_squares
from scipy.spatial import cKDTree
from kling_wardrobe_common import ROOT, load_source, protected_mask, sha

OUT = ROOT / 'artwork/kling-appearance/registration'
PADDING = {'left':32, 'top':128, 'right':32, 'bottom':0}
# Manually placed against source sprite frame 0 at native resolution, then viewed
# with a 50px coordinate grid. Ear/neck are structural guides, not face ownership.
REFERENCE = {
 'male': {
  'crown':(359,178),'headCenter':(359,344),'leftTemple':(204,367),'rightTemple':(539,357),
  'ear':(233,423),'earAttach':(267,431),'earTop':(230,388),'earBottom':(246,470),
  'nearEye':(379,398),'farEye':(496,395),
  'nearEyeLine':[(330,391),(406,374)], 'farEyeLine':[(479,377),(524,375)],
  'nearBrow':[(326,343),(378,321),(415,331)], 'farBrow':[(485,335),(511,321),(534,331)],
  'nose':(468,442),'mouth':(435,474),'mouthCorners':[(414,470),(460,473)],
  'nearCheek':(327,442),'farCheek':(505,445),'chin':(430,509),'neck':(360,532),
  'facePolygon':[(305,348),(330,313),(415,302),(466,310),(521,309),(531,343),(521,408),(520,451),(494,473),(454,490),(384,484),(333,466),(296,436)],
  'scalpPolygon':[(268,390),(220,382),(183,372),(171,333),(181,284),(208,245),(244,214),(291,190),(347,177),(405,178),(460,194),(505,224),(534,270),(546,316),(540,353),(526,369),(514,327),(474,308),(429,309),(386,297),(337,304),(293,337)],
  'frontHairEnvelope':[(142,390),(133,276),(206,157),(328,118),(432,127),(535,188),(582,284),(562,374),(530,397),(526,331),(479,313),(429,313),(386,299),(330,309),(288,350),(267,418),(235,449),(204,432)],
 },
 'female': {
  'crown':(355,152),'headCenter':(355,325),'leftTemple':(199,345),'rightTemple':(539,334),
  'ear':(226,409),'earAttach':(273,417),'earTop':(224,375),'earBottom':(241,449),
  'nearEye':(377,376),'farEye':(495,376),
  'nearEyeLine':[(328,369),(405,352)], 'farEyeLine':[(479,357),(528,356)],
  'nearBrow':[(328,321),(377,300),(413,308)], 'farBrow':[(492,310),(516,301),(536,312)],
  'nose':(466,423),'mouth':(436,455),'mouthCorners':[(413,450),(459,452)],
  'nearCheek':(326,421),'farCheek':(503,426),'chin':(428,493),'neck':(387,536),
  'facePolygon':[(300,329),(329,290),(413,281),(466,289),(524,289),(536,323),(524,390),(521,433),(495,457),(456,477),(386,470),(333,451),(292,420)],
  'scalpPolygon':[(266,369),(219,361),(180,352),(163,308),(172,261),(198,223),(241,186),(292,163),(348,153),(395,153),(445,167),(490,191),(523,226),(541,271),(545,313),(534,347),(520,346),(516,308),(474,289),(430,286),(380,277),(334,286),(289,317)],
  'frontHairEnvelope':[(135,370),(128,252),(201,135),(327,92),(433,103),(537,168),(583,262),(562,355),(534,376),(526,312),(477,292),(429,292),(384,279),(330,288),(288,329),(269,404),(231,432),(200,414)],
 },
}

def pt(p): return {'x':round(float(p[0]),2),'y':round(float(p[1]),2)}
def points(ps): return [pt(p) for p in ps]
def transform(m,p): return m[:2,:2]@np.asarray(p,float)+m[:2,2]
def rect(x0,y0,x1,y1): return {'x':int(x0),'y':int(y0),'width':int(x1-x0),'height':int(y1-y0)}
def polyarr(ps): return np.asarray([[p['x'],p['y']] for p in ps],float)

def expression(fid):
    # Reviewed in both complete source head contact sheets. These are action
    # expressions, not newly generated alternatives. Do not replace them.
    if 67 <= fid <= 82: kind='laugh'
    elif fid in [85,86,87,88,89,105,106,107,108,109]: kind='blink'
    elif fid in [83,84,90,91,103,104,110,111]: kind='half'
    else: kind='open'
    return {'kind':kind,'preserveSource':kind!='open' or fid in [101,102],
            'method':'source-contact-sheet-visual-review',
            'confidence':.72 if fid in [89,90,101,102] else .94}

class Tracker:
    def __init__(self, frames, regs):
        self.ids=sorted(frames); self.features={}; self.masks={}; self.cache={}
        self.bf=cv2.BFMatcher(); sift=cv2.SIFT_create(nfeatures=1000,contrastThreshold=.025)
        for fid,rgba in frames.items():
            region=next(p for p in regs[fid]['protected'] if p['label']=='head')
            mask=ndimage.binary_fill_holes(protected_mask({'protected':[region]}))
            self.masks[fid]=mask
            key,desc=sift.detectAndCompute(cv2.cvtColor(rgba[:,:,:3],cv2.COLOR_RGB2GRAY),
                cv2.dilate(mask.astype(np.uint8)*255,np.ones((5,5),np.uint8)))
            self.features[fid]=(key,desc)
    def fit(self,a,b):
        if (a,b) in self.cache:return self.cache[a,b]
        ka,da=self.features[a];kb,db=self.features[b]
        matches=self.bf.knnMatch(da,db,k=2);seen=set();good=[]
        for g in sorted([x for x,y in matches if x.distance<.76*y.distance],key=lambda m:m.distance):
            if g.trainIdx not in seen:good.append(g);seen.add(g.trainIdx)
        if len(good)<6:self.cache[a,b]=None;return None
        src=np.float32([ka[g.queryIdx].pt for g in good]);dst=np.float32([kb[g.trainIdx].pt for g in good])
        cv2.setRNGSeed(20261022)
        mat,ins=cv2.estimateAffinePartial2D(src,dst,method=cv2.RANSAC,
            ransacReprojThreshold=5,maxIters=3000,confidence=.995)
        if mat is None:self.cache[a,b]=None;return None
        ins=ins[:,0]>0;num=int(ins.sum());span=np.ptp(src[ins],axis=0)
        scale=np.sqrt(max(0,np.linalg.det(mat[:,:2])));angle=abs(np.arctan2(mat[1,0],mat[0,0]))
        error=float(np.median(np.linalg.norm(src@mat[:,:2].T+mat[:,2]-dst,axis=1)[ins]))
        valid=num>=6 and min(span)>45 and max(span)>110 and .78<scale<1.25 and angle<.5
        self.cache[a,b]={'matrix':np.vstack([mat,[0,0,1]]),'inliers':num,'error':error,'valid':bool(valid)}
        return self.cache[a,b]
    def solve(self):
        solved={0:np.eye(3)};meta={0:{'via':0,'inliers':len(self.features[0][0]),'error':0,'chain':[]}}
        for fid in self.ids[1:]:
            r=self.fit(0,fid)
            if r and r['valid'] and r['inliers']>=12:
                solved[fid]=r['matrix'];meta[fid]={'via':0,'inliers':r['inliers'],'error':r['error'],'chain':[0]}
        while len(solved)<len(self.ids):
            candidates=[]
            for fid in self.ids:
                if fid in solved:continue
                for seed in sorted(solved,key=lambda i:abs(i-fid))[:12]:
                    r=self.fit(seed,fid)
                    if r and r['valid']:
                        score=r['inliers']-.3*r['error']-.1*abs(seed-fid)
                        candidates.append((score,fid,seed,r))
            if not candidates:raise RuntimeError(f'Unresolved head frames: {set(self.ids)-set(solved)}')
            _,fid,seed,r=max(candidates,key=lambda c:c[0]);solved[fid]=r['matrix']@solved[seed]
            meta[fid]={'via':seed,'inliers':r['inliers'],'error':r['error'],'chain':meta[seed]['chain']+[seed]}
        return solved,meta

def scalp_fit(character,reference_mask,target_mask,matrix):
    """Fit the stable skull, independently from the squash in facial expressions.

    Preserve inferred rotation and only permit a small global scale/translation
    correction. A source jump can squash the eyes/mouth while leaving the scalp
    nearly circular: forcing the same facial transform on hair made it sink into
    the crown by 20-30px. Source silhouette distances remove that drift without
    changing a single character pixel or moving the separately tracked face.
    """
    def contour(mask):
        cs,_=cv2.findContours(mask.astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
        return max(cs,key=cv2.contourArea)[:,0,:].astype(float)
    source=contour(reference_mask)
    source=source[source[:,1]<(365 if character=='male' else 343)][::4]
    tree=cKDTree(contour(target_mask));pred=source@matrix[:2,:2].T+matrix[:2,2];center=pred.mean(axis=0)
    def residual(v):
        v=np.asarray(v);distance,_=tree.query((pred-center)*v[0]+center+v[1:])
        return np.r_[distance,(v[0]-1)*60,v[1:]*.15]
    fit=least_squares(residual,[1,0,0],bounds=([.9,-35,-35],[1.12,35,35]),max_nfev=60,diff_step=1e-3)
    scale,dx,dy=fit.x;corrected=matrix.copy();corrected[:2,:2]*=scale
    corrected[:2,2]=(matrix[:2,2]-center)*scale+center+[dx,dy]
    stats={'scale':round(float(scale),6),'dx':round(float(dx),3),'dy':round(float(dy),3),
        'meanContourErrorBeforePx':round(float(np.mean(residual([1,0,0])[:-3])),3),
        'meanContourErrorAfterPx':round(float(np.mean(residual(fit.x)[:-3])),3),
        'method':'bounded-silhouette-scale-translation; preserve-SIFT-rotation; no-source-pixel-warp'}
    return corrected,stats

def local_guides(character,fid,frame,reference,matrix):
    # Flow is only an offline guide, never used to warp the original drawing.
    # The source image is inverse registered for a small residual refinement of
    # brows, eye lines, nose and mouth (<= 16 native px). Structural anchors stay
    # on the single rigid head fit so hair cannot inherit expression distortion.
    src=REFERENCE[character];m=np.asarray(matrix,np.float32)
    back=cv2.warpAffine(frame[:,:,:3],m[:2],(704,600),flags=cv2.INTER_LINEAR|cv2.WARP_INVERSE_MAP)
    a=cv2.resize(cv2.cvtColor(reference[:600,:,:3],cv2.COLOR_RGB2GRAY),(352,300))
    b=cv2.resize(cv2.cvtColor(back,cv2.COLOR_RGB2GRAY),(352,300))
    flow=cv2.calcOpticalFlowFarneback(a,b,None,.5,4,25,5,7,1.5,0) if fid else np.zeros((300,352,2),np.float32)
    def fit_point(p):
        x,y=int(p[0]/2),int(p[1]/2);delta=np.median(flow[max(0,y-2):y+3,max(0,x-2):x+3].reshape(-1,2),axis=0)*2
        delta=np.clip(delta,-16,16)
        return pt(transform(m,np.asarray(p)+delta))
    out={}
    structural={'crown','headCenter','leftTemple','rightTemple','ear','earAttach','earTop','earBottom','chin','neck'}
    for name,value in src.items():
        if name.endswith('Polygon') or name.endswith('Envelope'):continue
        if isinstance(value[0],(int,float)):
            out[name]=pt(transform(m,value)) if name in structural else fit_point(value)
        else:out[name]=[fit_point(p) for p in value]
    return out

def foreground(reg,head_mask,hair_rect,source):
    # Polygon proposals restore the ORIGINAL/ALREADY-DRESSED foreground pixels
    # after hair. No color deletion: only geometric ownership is authored.
    canvas=np.zeros(head_mask.shape,np.uint8)
    for region in reg['protected']:
        if region['label']!='head':
            cv2.fillPoly(canvas,[np.round(polyarr(region['polygon'])).astype(np.int32)],255)
    for side in ['near','far']:
        p=reg['points'];a=np.array([p[side+'Elbow']['x'],p[side+'Elbow']['y']]);b=np.array([p[side+'Wrist']['x'],p[side+'Wrist']['y']])
        cv2.line(canvas,tuple(np.round(a).astype(int)),tuple(np.round(b).astype(int)),255,60)
        cv2.circle(canvas,tuple(np.round(b).astype(int)),31,255,-1)
    # Keep source head ownership out of the restore mask. Otherwise a generous
    # arm capsule could erase bangs with original scalp pixels on raised poses.
    canvas[head_mask]=0
    canvas[source[:,:,3]==0]=0
    roi=np.zeros_like(canvas);x0=max(0,hair_rect['x']);y0=max(0,hair_rect['y']);x1=min(704,hair_rect['x']+hair_rect['width']);y1=min(1056,hair_rect['y']+hair_rect['height'])
    roi[y0:y1,x0:x1]=255;canvas &= roi
    contours,_=cv2.findContours(canvas,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    contours=sorted([c for c in contours if cv2.contourArea(c)>=12],key=cv2.contourArea,reverse=True)[:8]
    polys=[]
    for c in contours:
        poly=cv2.approxPolyDP(c,1.5,True)[:,0,:]
        if len(poly)>64:poly=cv2.approxPolyDP(c,3,True)[:,0,:]
        if len(poly)>=3:polys.append(points(poly))
    return polys

def reviews(character,frames,rows):
    thumbs=[];large=[];selected={0,51,58,64,67,75,83,89,90,95,104,110}
    for row in rows:
        fid=row['frameId'];h=row['headBounds'];margin=25
        box=(max(0,h['x']-margin),max(0,h['y']-margin),min(704,h['x']+h['width']+margin),min(1056,h['y']+h['height']+margin))
        crop=Image.fromarray(frames[fid]).crop(box);bg=Image.new('RGBA',crop.size,(240,238,228,255));bg.alpha_composite(crop);draw=ImageDraw.Draw(bg)
        def local(p):return (p['x']-box[0],p['y']-box[1])
        face=[local(p) for p in row['facePolygon']];draw.line(face+[face[0]],fill=(56,163,128,255),width=2)
        for name,p in row['anchors'].items():
            x,y=local(p);draw.ellipse((x-3,y-3,x+3,y+3),fill=(186,32,40,255))
        for name in ['nearBrow','farBrow','nearEyeLine','farEyeLine','mouthCorners']:
            draw.line([local(p) for p in row['featureGuides'][name]],fill=(54,94,218,255),width=2)
        bg.thumbnail((224,244));tile=Image.new('RGB',(232,274),'#eee9df');tile.paste(bg,(4,27));d=ImageDraw.Draw(tile)
        d.text((4,3),f"{fid} {row['expression']['kind']} via{row['tracking']['via']} c{row['confidence']:.2f}",fill='black');thumbs.append(tile)
        if fid in selected:
            original=Image.fromarray(frames[fid]).crop(box);large_bg=Image.new('RGBA',original.size,(240,238,228,255));large_bg.alpha_composite(original);ld=ImageDraw.Draw(large_bg)
            ld.line(face+[face[0]],fill=(56,163,128,255),width=2)
            for name,p in row['anchors'].items():
                x,y=local(p);ld.ellipse((x-3,y-3,x+3,y+3),fill=(186,32,40,255));ld.text((x+4,y-10),name,fill=(155,22,22,255))
            for name in ['nearBrow','farBrow','nearEyeLine','farEyeLine','mouthCorners']:
                ld.line([local(p) for p in row['featureGuides'][name]],fill=(54,94,218,255),width=2)
            large_bg.thumbnail((440,450));lt=Image.new('RGB',(450,480),'#eee9df');lt.paste(large_bg,(5,25));ImageDraw.Draw(lt).text((5,4),f'{character} frame{fid} source{row["sourceFrame"]} {row["expression"]["kind"]}',fill='black');large.append(lt)
    sheet=Image.new('RGB',(232*8,274*math.ceil(len(thumbs)/8)),'white')
    for i,t in enumerate(thumbs):sheet.paste(t,((i%8)*232,(i//8)*274))
    sheet.save(OUT/f'{character}-all-heads.jpg',quality=88)
    sheet=Image.new('RGB',(450*4,480*math.ceil(len(large)/4)),'white')
    for i,t in enumerate(large):sheet.paste(t,((i%4)*450,(i//4)*480))
    sheet.save(OUT/f'{character}-selected-guides.jpg',quality=90)


def prepare(character):
    source,manifest,config,frames=load_source(character)
    reg_path=ROOT/'docs/kling-wardrobe/registration'/('male-full-outfits-v1.json' if character=='male' else 'female.json')
    old=json.loads(reg_path.read_text());regs={f['frameId']:f for f in old['frames']}
    tracker=Tracker(frames,regs);transforms,metadata=tracker.solve()
    source_records={f['frameId']:f for f in config['derivation']['frames']}
    result=[]
    for fid in sorted(frames):
        face_mat=transforms[fid];info=metadata[fid];guides=local_guides(character,fid,frames[fid],frames[0],face_mat)
        mask=tracker.masks[fid];ys,xs=np.where(mask);bounds=rect(xs.min(),ys.min(),xs.max()+1,ys.max()+1)
        mat,scalp_stats=scalp_fit(character,tracker.masks[0],mask,face_mat)
        for key in ['crown','headCenter']:
            guides[key]=pt(transform(mat,REFERENCE[character][key]))
        face=points([transform(face_mat,p) for p in REFERENCE[character]['facePolygon']])
        # Defensive bounds keep the authoring polygon within the actual head ROI;
        # the compositor also clips edits to original opaque pixels.
        for p in face:
            p['x']=max(bounds['x'],min(bounds['x']+bounds['width'],p['x']))
            p['y']=max(bounds['y'],min(bounds['y']+bounds['height'],p['y']))
        hair=rect(max(-PADDING['left'],xs.min()-65),max(-PADDING['top'],ys.min()-112),min(704+PADDING['right'],xs.max()+66),min(1056,ys.max()+110))
        confidence=.98 if fid==0 else min(.93,.7+.004*info['inliers']-.012*info['error'])
        if fid in [89,90,101,102]:confidence=min(confidence,.65)
        result.append({'frameId':fid,'sourceFrame':source_records[fid]['sourceFrame'],
            'sourceTimeSeconds':source_records[fid]['timeSeconds'],'sourcePixelSha256':sha(frames[fid].tobytes()),
            'anchors':{k:{'x':max(bounds['x'],min(bounds['x']+bounds['width'],guides[k]['x'])),
                          'y':max(bounds['y'],min(bounds['y']+bounds['height'],guides[k]['y']))}
                       for k in ['headCenter','crown','chin','nearEye','farEye','mouth']},
            'headBounds':bounds,'facePolygon':face,'hairBounds':hair,
            'foreground':foreground(regs[fid],mask,hair,frames[fid]),
            'headTransform':np.round(mat[:2],7).tolist(),'faceTransform':np.round(face_mat[:2],7).tolist(),
            'scalpFit':scalp_stats,'featureGuides':guides,
            'scalpPolygon':points([transform(mat,p) for p in REFERENCE[character]['scalpPolygon']]),
            'frontHairEnvelope':points([transform(mat,p) for p in REFERENCE[character]['frontHairEnvelope']]),
            'expression':expression(fid),'confidence':round(confidence,3),
            'method':'manual-source-frame-zero' if fid==0 else 'unique-SIFT-RANSAC-similarity; adjacent-pose-fallback; bounded-scalp-fit; local-Farneback-feature-guides',
            'tracking':{'via':info['via'],'chain':info['chain'],'inliers':info['inliers'],'medianInlierErrorPx':round(info['error'],3),
                'review':'full-head-contact-sheet-and-selected-native-overlays',
                'limitation':'motion-blurred source; conservative expression preservation' if fid in [89,90,101,102] else None}})
    out={'format':'gathria-kling-head-authoring-registration','version':1,'characterId':old['characterId'],
        'sourceSha256':sha(source),'bodyRegistrationSha256':sha(reg_path.read_bytes()),
        'frameWidth':704,'frameHeight':1056,'canvasPadding':PADDING,
        'reference':{'frameId':0,'sourceFrame':source_records[0]['sourceFrame'],'sourceTimeSeconds':source_records[0]['timeSeconds'],
            'sourcePixelSha256':sha(frames[0].tobytes()),'method':'manual native source-image grid review; no skeleton-candidate assets',
            'featureGuides':result[0]['featureGuides']},
        'conventions':{'headTransform':'2x3 affine maps original source frame0 native scalp coordinates to this source frame; preserves rotation and fits skull contour',
            'faceTransform':'independent pre-scalp similarity for source facial expression tracking; use featureGuides for local edits',
            'foreground':'visible source hand/forearm polygons; restore dressed foreground after hair, not all skin pixels',
            'facePolygon':'conservative inner-face edit envelope; excludes skull outline, ear, jaw boundary and neck',
            'featureGuides':'inferred authoring locations, not generated pixels or anatomical ground truth',
            'anchors':'inferred feature guides projected inside observed source head bounds; source scalp affine remains independent',
            'sourceExpressions':'preserve blink/half/laugh; gentle edits apply only to open-state frames',
            'originalSource':'original pixels, frame order, timing, body registration and ground anchor remain immutable'},
        'frames':result}
    OUT.mkdir(parents=True,exist_ok=True);(OUT/f'{character}.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    reviews(character,frames,result)
    print(f'{character}: {len(result)} frames, source sha256 {sha(source)}, {sum(f["expression"]["preserveSource"] for f in result)} action-expression states preserved',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--character',choices=['male','female','both'],default='both');args=parser.parse_args()
    cv2.setNumThreads(1)
    for character in ['male','female'] if args.character=='both' else [args.character]:prepare(character)
