#!/usr/bin/env python3
"""Offline side-view hair donor masks, rigid head fitting and appearance V1 bank.

Only new RGBA hair is transformed. Source pixels, action ordering and timing are
read from the frozen packs. The generated portrait skin/face/clothes are excluded
by explicit reviewed masks; the bank intentionally contains no face layer.
"""
from __future__ import annotations
import argparse, io, json, math, shutil, zipfile
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.optimize import least_squares
from scipy.spatial import cKDTree
from kling_side_authoring import ROOT, W, H, load_context, sha, encode_rgba, runtime_polygon_mask

ART = ROOT / 'artwork/kling-side-expansion/hair'
DOC = ROOT / 'docs/kling-side-expansion/hair'
TMP = Path('/tmp/side-expansion/hair')
PADDING = dict(left=0, top=0, right=0, bottom=0)
STYLE = {'male': ('side-swept-crop', 'Soft side sweep'), 'female': ('side-tucked-bob', 'Soft tucked bob')}
# Points run around the hair side of the generated skin/hair boundary. They are
# donor mask coordinates, never source-character repaint or replacement pixels.
MALE_LINE = [(445,680),(440,651),(451,623),(430,628),(398,627),(371,618),(349,600),
 (337,578),(332,552),(337,528),(350,507),(371,492),(395,486),(419,490),(439,501),
 (455,518),(466,538),(488,548),(482,519),(496,531),(490,490),(499,456),(511,474),
 (512,435),(534,450),(527,418),(526,399),(561,423),(555,398),(574,360),(594,334),
 (601,358),(615,378),(607,352),(609,318),(621,290),(637,276),(660,281),(665,274),
 (679,279),(704,271),(724,282),(744,308),(760,342),(774,380),(785,403),(880,450)]
FEMALE_FRONT_LINE = [(900,520),(1163,520),(1177,511),(1192,500),(1212,491),(1236,489),
 (1259,493),(1280,501),(1298,511),(1298,550),(1308,588),(1329,621),(1355,639),
 (1339,617),(1328,586),(1321,550),(1322,513),(1328,480),(1366,462),(1403,435),
 (1440,402),(1467,369),(1487,335),(1498,297),(1502,246),(1529,256),(1555,274),
 (1578,298),(1596,331),(1608,371),(1614,408),(1607,447),(1597,477),(1774,520)]
FEMALE_BACK_POLYS = [
 [(900,480),(1168,480),(1171,518),(1162,544),(1162,569),(1169,593),(1186,612),
  (1208,623),(1233,630),(1260,628),(1283,619),(1297,643),(1307,663),(1307,682),
  (1301,696),(1320,701),(1330,698),(1312,710),(1288,716),(1273,725),(1244,731),
  (1228,737),(1205,750),(1155,787),(900,800)],
 [(1396,689),(1440,692),(1485,691),(1518,687),(1548,699),(1596,701),(1577,719),
  (1545,726),(1524,743),(1490,751),(1453,750),(1428,742),(1405,732),(1396,718)]]
REFERENCE = {
 'male': {'headCenter': (239,327), 'crown': (251,232), 'chin': (298,420),
          'nearEye': (293,351), 'farEye': (336,347), 'mouth': (317,397),
          'facePolygon': [(267,315),(282,298),(316,296),(339,310),(333,363),(341,382),(335,404),(317,418),(276,417),(238,404),(225,386),(243,352)]},
 'female': {'headCenter': (245,326), 'crown': (256,230), 'chin': (301,423),
            'nearEye': (297,353), 'farEye': (343,349), 'mouth': (325,398),
            'facePolygon': [(272,313),(292,298),(322,298),(346,317),(339,364),(346,383),(342,403),(324,418),(286,422),(252,413),(229,386),(246,351)]},
}
DONOR_FIT = {'male': [[.332,0,71],[0,.332,190]], 'female': [[.365,0,-247],[0,.365,169.5]]}

def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')

def polygon_mask(size, polygons):
    im = Image.new('L', size)
    for poly in polygons: ImageDraw.Draw(im).polygon(poly, fill=255)
    return np.array(im) > 0

def donors():
    source = ART / 'source/design.png'
    image = np.array(Image.open(source).convert('RGBA'))
    shape = (image.shape[1],image.shape[0])
    output = {}
    (TMP/'donors').mkdir(parents=True,exist_ok=True)
    for identity in ['male','female']:
        if identity == 'male':
            all_hair = polygon_mask(shape, [[(0,0),(885,0),*reversed(MALE_LINE),(0,700)]])
            back = all_hair & polygon_mask(shape, [[(0,596),(455,596),(455,710),(0,710)]])
            front = all_hair & ~back
        else:
            front = polygon_mask(shape, [[(900,0),(1774,0),*reversed(FEMALE_FRONT_LINE)]])
            back = polygon_mask(shape, FEMALE_BACK_POLYS) & ~front
        output[identity] = {}
        for role, mask in [('hair-front',front),('hair-back',back)]:
            # The explicit masks discard the generated face and ear. Clean only
            # peach antialias fringe at their inner boundaries, never source skin.
            edge = cv2.distanceTransform(mask.astype('uint8'),cv2.DIST_L2,5) < 18
            rgb=image[:,:,:3].astype('int16')
            peach = (rgb[:,:,0]>210)&(rgb[:,:,1]>95)&(rgb[:,:,2]>55)&((rgb[:,:,0]-rgb[:,:,1])>50)
            mask &= ~(edge & peach)
            pixels = image.copy(); pixels[~mask] = 0
            n, labels, stats, _ = cv2.connectedComponentsWithStats((pixels[:,:,3]>0).astype('uint8'),8)
            pixels[~np.isin(labels,[i for i in range(1,n) if stats[i,4]>40])] = 0
            output[identity][role] = pixels
            Image.fromarray(pixels).save(TMP / f'donors/{identity}-{role}.png')
            Image.fromarray((pixels[:,:,3]>0).astype('uint8')*255).save(ART / f'source/{identity}-{role}-mask.png')
    dump(ART/'source/donor-masks.json', {'maleHairline':MALE_LINE,'femaleFrontHairline':FEMALE_FRONT_LINE,
         'femaleBackPolygons':FEMALE_BACK_POLYS,'donorToReference':DONOR_FIT,
         'method':'Reviewed donor-coordinate polygons; peach antialias rejection within eighteen donor pixels of cut boundary; no generated skin/face/clothing used.'})
    return output

def warp_rgba(pixels, matrix, sigma=0):
    f=pixels.astype(np.float32)/255; f[:,:,:3]*=f[:,:,3:4]
    out=cv2.warpAffine(f,np.array(matrix,dtype=np.float32)[:2],(W,H),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    if sigma: out=cv2.GaussianBlur(out,(0,0),sigma)
    a=out[:,:,3:4]
    out[:,:,:3]=np.divide(out[:,:,:3],a,out=np.zeros_like(out[:,:,:3]),where=a>0)
    return np.rint(np.clip(out,0,1)*255).astype('uint8')

def point(matrix, xy):
    return np.asarray(matrix)[:2,:2] @ np.asarray(xy) + np.asarray(matrix)[:2,2]

def native_head_mask(ctx, fid):
    region=next(r for r in ctx.registered[fid]['protected'] if r['label']=='head')
    return runtime_polygon_mask(region['polygon']) & (ctx.frames[fid][:,:,3] > 0)

def fit_heads(ctx):
    """SIFT feature rigid fit, with reviewed jump poses checked in contact sheets."""
    # Prefer the persisted, source-bound reviewed guide on reproduction; scratch
    # caches are only useful while authoring a candidate that is not yet saved.
    reviewed=ART/f'{ctx.identity}-head-registration.json'
    cache_path=reviewed if reviewed.exists() else TMP/ctx.identity/'head-registration.json'
    if cache_path.exists():
        previous=json.loads(cache_path.read_text())
        if previous['sourceSha256']==ctx.source_sha256 and previous['registrationSha256']==ctx.registration_sha256:
            audit={row['frameId']:{k:v for k,v in row.items() if k not in ['frameId','sourceFrame']} for row in previous['frames']}
            return {fid:np.vstack([row.get('featureTransform',row['headTransform']),[0,0,1]]) for fid,row in audit.items()},audit
    sift=cv2.SIFT_create(nfeatures=900,contrastThreshold=.018)
    features={}; masks={}
    for fid, rgba in ctx.frames.items():
        mask=native_head_mask(ctx,fid); masks[fid]=mask
        gray=cv2.cvtColor(rgba[:,:,:3],cv2.COLOR_RGB2GRAY)
        features[fid]=sift.detectAndCompute(gray,mask.astype('uint8')*255)
    bf=cv2.BFMatcher(); cache={}
    def match(a,b):
        if (a,b) in cache: return cache[a,b]
        ka,da=features[a];kb,db=features[b]
        good=[];seen=set()
        if da is None or db is None:return None
        for pair in bf.knnMatch(da,db,k=2):
            if len(pair)!=2: continue
            g,h=pair
            if g.distance < .77*h.distance and g.trainIdx not in seen:
                good.append(g);seen.add(g.trainIdx)
        if len(good)<5:cache[a,b]=None;return None
        src=np.float32([ka[m.queryIdx].pt for m in good]);dst=np.float32([kb[m.trainIdx].pt for m in good])
        cv2.setRNGSeed(20261029)
        m,keep=cv2.estimateAffinePartial2D(src,dst,method=cv2.RANSAC,ransacReprojThreshold=3.3,maxIters=3000,confidence=.995)
        if m is None:return None
        inside=keep[:,0]>0;num=int(inside.sum());span=np.ptp(src[inside],axis=0)
        scale=math.sqrt(max(0,np.linalg.det(m[:,:2])));angle=abs(math.atan2(m[1,0],m[0,0]))
        error=float(np.median(np.linalg.norm(src@m[:,:2].T+m[:,2]-dst,axis=1)[inside]))
        result={'matrix':np.vstack([m,[0,0,1]]),'inliers':num,'error':error,
                'valid':num>=5 and max(span)>70 and .74<scale<1.35 and angle<.55}
        cache[a,b]=result;return result
    solved={0:np.eye(3)};audit={0:dict(via=0,inliers=len(features[0][0]),error=0)}
    for fid in ctx.frames:
        if not fid: continue
        r=match(0,fid)
        if r and r['valid'] and r['inliers']>=10:
            solved[fid]=r['matrix'];audit[fid]={k:r[k] for k in ['inliers','error']};audit[fid]['via']=0
    while len(solved)<len(ctx.frames):
        candidates=[]
        for fid in ctx.frames:
            if fid in solved: continue
            for seed in sorted(solved,key=lambda n:abs(n-fid))[:12]:
                r=match(seed,fid)
                if r and r['valid']: candidates.append((r['inliers']-.5*r['error']-.1*abs(seed-fid),fid,seed,r))
        if not candidates: raise ValueError(f'Unresolved head registration: {set(ctx.frames)-set(solved)}')
        _,fid,seed,r=max(candidates,key=lambda x:x[0])
        solved[fid]=r['matrix']@solved[seed]
        audit[fid]={k:r[k] for k in ['inliers','error']};audit[fid]['via']=seed
    for fid in ctx.frames:
        audit[fid]['headTransform']=solved[fid][:2].round(6).tolist()
    return solved,audit

def refine_scalp(ctx, transforms, audit):
    """Hair-only bounded skull silhouette fit, independent of facial squash."""
    def contour(mask):
        cs,_=cv2.findContours(mask.astype('uint8'),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
        return max(cs,key=cv2.contourArea)[:,0,:].astype(float)
    ref=contour(native_head_mask(ctx,0))
    # Stable bald crown/rear outline. Exclude expression-changing cheeks/jaw.
    ref=ref[(ref[:,1]<365)&(ref[:,0]<335)][::3]
    fitted={}
    for fid,matrix in transforms.items():
        pred=ref@matrix[:2,:2].T+matrix[:2,2]
        target=contour(native_head_mask(ctx,fid));tree=cKDTree(target)
        center=point(matrix,REFERENCE[ctx.identity]['headCenter'])
        def residual(v):
            distance,_=tree.query((pred-center)*v[0]+center+v[1:])
            return np.r_[distance,(v[0]-1)*28,np.asarray(v[1:])*.07]
        if fid:
            fit=least_squares(residual,[1,0,0],bounds=([.9,-32,-32],[1.2,32,32]),max_nfev=100,diff_step=1e-3)
            scale,dx,dy=fit.x
        else:scale,dx,dy=1.,0.,0.
        adjusted=matrix.copy();adjusted[:2,:2]*=scale
        adjusted[:2,2]=(matrix[:2,2]-center)*scale+center+[dx,dy]
        audit[fid]['featureTransform']=matrix[:2].round(6).tolist()
        audit[fid]['headTransform']=adjusted[:2].round(6).tolist()
        audit[fid]['scalpFit']=dict(scale=round(float(scale),5),dx=round(float(dx),3),dy=round(float(dy),3),
          beforeMeanPx=round(float(np.mean(residual([1,0,0])[:-3])),3),afterMeanPx=round(float(np.mean(residual([scale,dx,dy])[:-3])),3),
          method='Bounded similarity fit of source crown outline; new hair only; separate feature registration retains original facial core.')
        fitted[fid]=adjusted
    return fitted

def rect_mask(mask):
    yy,xx=np.where(mask)
    return dict(x=int(xx.min()),y=int(yy.min()),width=int(xx.max()+1-xx.min()),height=int(yy.max()+1-yy.min()))

def foreground_polygons(ctx,fid,hair_bounds):
    """Actual original non-head silhouette keeps shoulders/arms before hair.

    Two pixels around the reviewed head contour exclude scalp raster fringe.
    Existing protected hand polygons remain an independent runtime foreground.
    """
    head=native_head_mask(ctx,fid).astype('uint8')
    head=cv2.dilate(head,np.ones((5,5),'uint8'))>0
    body=(ctx.frames[fid][:,:,3]>0)&~head
    x,y,w,h=(hair_bounds[k] for k in ['x','y','width','height'])
    bound=np.zeros((H,W),bool);bound[max(0,y-2):min(H,y+h+3),max(0,x-2):min(W,x+w+3)]=True
    body &=bound
    contours,_=cv2.findContours(body.astype('uint8'),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    polys=[]
    for contour in sorted(contours,key=cv2.contourArea,reverse=True):
        if cv2.contourArea(contour)<12:continue
        epsilon=.45
        poly=cv2.approxPolyDP(contour,epsilon,True)[:,0,:]
        while len(poly)>64:
            epsilon+=.1;poly=cv2.approxPolyDP(contour,epsilon,True)[:,0,:]
        if len(poly)<3:continue
        polys.append([dict(x=float(p[0]),y=float(p[1])) for p in poly])
    assert len(polys)<=8, (ctx.identity,fid,len(polys))
    return polys

def over(base, top, back=False):
    b=base.astype(np.float64)/255;t=top.astype(np.float64)/255
    ta=t[:,:,3:4];ba=b[:,:,3:4]
    tw=ta*(1-ba) if back else ta;bw=ba if back else ba*(1-ta)
    a=tw+bw;rgb=np.divide(t[:,:,:3]*tw+b[:,:,:3]*bw,a,out=np.zeros_like(t[:,:,:3]),where=a>0)
    result=np.rint(np.clip(np.concatenate([rgb,a],axis=2),0,1)*255).astype('uint8')
    # Runtime visits authored ownership only and retains invisible source RGB.
    untouched=(top[:,:,3]==0)|((base[:,:,3]==255) if back else False)
    result[untouched]=base[untouched]
    return result

def render(ctx,fid,layers,pose):
    base=ctx.frames[fid].copy(); source=base.copy()
    foreground=np.zeros((H,W),bool)
    for p in pose['foreground']: foreground|=runtime_polygon_mask(p)
    for r in ctx.registered[fid]['protected']:
        if r['label']!='head':foreground|=runtime_polygon_mask(r['polygon'])
    foreground &=source[:,:,3]>0
    h=pose.get('hairOcclusionBounds',pose['headBounds'])
    head=np.zeros((H,W),bool);head[h['y']:h['y']+h['height'],h['x']:h['x']+h['width']]=True
    for role in ['hair-back','hair-front']:
        layer=layers[role].copy()
        if role=='hair-front':layer[foreground|((source[:,:,3]>0)&~head)]=0
        base=over(base,layer,back=role=='hair-back')
    return base

def prepare(identity, donor, prototype=False):
    candidate=ROOT/f'artwork/kling-side-expansion/templates/{identity}.registration.json'
    if not candidate.exists() and not prototype: raise ValueError(f'Candidate registration missing: {candidate}')
    ctx=load_context(identity,registration_path=candidate if candidate.exists() else None)
    transforms,audit=fit_heads(ctx)
    hair_transforms=refine_scalp(ctx,transforms,audit)
    layers={};poses=[];register=[]
    matrix=np.vstack([DONOR_FIT[identity],[0,0,1]])
    for fid,rgba in ctx.frames.items():
        transform=transforms[fid]
        row=ctx.registered[fid]
        head=next(p['polygon'] for p in row['protected'] if p['label']=='head')
        x0=max(0,math.floor(min(p['x'] for p in head))-2);y0=max(0,math.floor(min(p['y'] for p in head))-2)
        x1=min(W,math.ceil(max(p['x'] for p in head))+2);y1=min(H,math.ceil(max(p['y'] for p in head))+2)
        bounds=dict(x=x0,y=y0,width=x1-x0,height=y1-y0)
        anchors={}
        for key,xy in REFERENCE[identity].items():
            if key=='facePolygon':continue
            p=point(transform,xy);anchors[key]=dict(x=round(float(np.clip(p[0],x0,x1)),3),y=round(float(np.clip(p[1],y0,y1)),3))
        poly=[]
        for xy in REFERENCE[identity]['facePolygon']:
            p=point(transform,xy);poly.append(dict(x=round(float(np.clip(p[0],x0,x1)),3),y=round(float(np.clip(p[1],y0,y1)),3)))
        pose=dict(frameId=fid,sourceFrame=row['sourceFrame'],anchors=anchors,headBounds=bounds,
                  facePolygon=poly,foreground=[])
        # Donor front/back masks are independent extraction regions. Native
        # layer assignment follows actual source visibility so a rectangular
        # donor split cannot expose a triangular piece of bald scalp at the ear.
        full=donor['hair-front'].copy()
        take=donor['hair-back'][:,:,3]>0;full[take]=donor['hair-back'][take]
        hair=warp_rgba(full,hair_transforms[fid]@matrix)
        # Two-level RGB rounding changes authored hair by at most one 8-bit
        # channel value and keeps the complete paired banks/evidence compact.
        # It never touches source RGB or alpha and precedes exact-face proof.
        hair[:,:,:3]=np.minimum(((hair[:,:,:3].astype('uint16')+1)//2)*2,255).astype('uint8')
        # Facial-core ownership is narrower than the skull/ear envelope and is
        # explicit in each pose. It includes brows, eyes, nose, mouth and cheeks.
        # Its opaque original RGBA must remain byte exact, even where a generated
        # donor forelock was originally too long for the source forehead.
        face_core=runtime_polygon_mask(poly)&(rgba[:,:,3]==255)
        clear=cv2.distanceTransform((~face_core).astype('uint8'),cv2.DIST_L2,5)
        hair[:,:,3]=np.rint(hair[:,:,3]*np.minimum(clear/1.5,1)).astype('uint8')
        hair[hair[:,:,3]==0]=0
        yy,xx=np.mgrid[:H,:W]
        ear_bottom=point(transform,(205,394) if identity=='male' else (203,395))[1]
        rear=(yy>=ear_bottom)&~native_head_mask(ctx,fid)
        layers[fid]={}
        for role,keep in [('hair-back',rear),('hair-front',~rear)]:
            part=hair.copy();part[~keep]=0;layers[fid][role]=part
        union=np.zeros((H,W),bool)
        for pixels in layers[fid].values():union|=pixels[:,:,3]>0
        if union[[0,-1],:].any() or union[:,[0,-1]].any():raise ValueError(f'Hair clipping: {identity}/{fid}')
        pose['hairBounds']=rect_mask(union)
        pose['foreground']=foreground_polygons(ctx,fid,pose['hairBounds'])
        poses.append(pose)
        register.append(dict(frameId=fid,sourceFrame=row['sourceFrame'],**audit[fid]))
    out=TMP/identity;out.mkdir(parents=True,exist_ok=True)
    dump(out/'head-registration.json',dict(sourceSha256=ctx.source_sha256,registrationSha256=ctx.registration_sha256,frames=register))
    proof=[];boundary_proof=[]
    for fid in ctx.frames:
        result=render(ctx,fid,layers[fid],poses[fid])
        core=runtime_polygon_mask(poses[fid]['facePolygon'])&(ctx.frames[fid][:,:,3]==255)
        changed=int(np.any(result!=ctx.frames[fid],axis=2)[core].sum())
        assert changed==0, f'Facial core changed: {identity}/{fid}/{changed}'
        hand=np.zeros((H,W),bool)
        for r in ctx.registered[fid]['protected']:
            if r['label']!='head':hand|=runtime_polygon_mask(r['polygon'])
        for p in poses[fid]['foreground']:hand|=runtime_polygon_mask(p)
        hand &=ctx.frames[fid][:,:,3]==255
        changed_foreground=int(np.any(result!=ctx.frames[fid],axis=2)[hand].sum())
        assert changed_foreground==0, f'Original foreground changed: {identity}/{fid}/{changed_foreground}'
        owned=np.zeros((H,W),bool)
        for pixels in layers[fid].values():owned|=pixels[:,:,3]>0
        changed_mask=np.any(result!=ctx.frames[fid],axis=2)
        outside=int((changed_mask&~owned).sum())
        assert outside==0, f'Pixels outside authored hair changed: {identity}/{fid}/{outside}'
        yy,xx=np.where(owned)
        boundary_proof.append(dict(frameId=fid,sourceFrame=ctx.registered[fid]['sourceFrame'],hairBounds=poses[fid]['hairBounds'],
          authoredHairPixels=int(owned.sum()),changedRgbaPixels=int(changed_mask.sum()),outsideHairChangedRgbaPixels=outside,
          nativeCanvasEdgeClearance=dict(left=int(xx.min()),top=int(yy.min()),right=int(W-1-xx.max()),bottom=int(H-1-yy.max())),
          originalFrameRgbaSha256=sha(ctx.frames[fid].tobytes()),renderFrameRgbaSha256=sha(result.tobytes()),
          originalOutsideHairRgbaSha256=sha(ctx.frames[fid][~owned].tobytes()),renderOutsideHairRgbaSha256=sha(result[~owned].tobytes())))
        proof.append(dict(frameId=fid,facialCorePolygon=poses[fid]['facePolygon'],opaqueSourcePixels=int(core.sum()),
                     sourceRgbaSha256=sha(ctx.frames[fid][core].tobytes()),renderRgbaSha256=sha(result[core].tobytes()),changedRgbaPixels=changed,
                     originalForegroundOpaquePixels=int(hand.sum()),changedForegroundRgbaPixels=changed_foreground))
        Image.fromarray(result).save(out/f'{fid:04d}.png')
    dump(out/'face-preservation.json',dict(sourceSha256=ctx.source_sha256,registrationSha256=ctx.registration_sha256,
          rule='Explicit per-pose facial core includes brows, eyes, nose, mouth and cheeks. Verify original opaque source RGBA byte-for-byte; source antialias silhouette pixels are outside this core proof.',frames=proof))
    dump(out/'boundary-preservation.json',dict(sourceSha256=ctx.source_sha256,registrationSha256=ctx.registration_sha256,
          rule='All original RGBA outside nonzero authored hair pixels must remain byte exact. This verifies the complete native canvas, including invisible RGB, and reports every hair boundary and native edge clearance.',frames=boundary_proof))
    sheets=[]
    for action,animation in ctx.animations.items():
        ids=animation['frames']; cols=min(10,len(ids));rows=math.ceil(len(ids)/cols)
        sheet=Image.new('RGB',(cols*256,rows*404),'#eeebe4');draw=ImageDraw.Draw(sheet)
        for i,fid in enumerate(ids):
            im=Image.open(out/f'{fid:04d}.png');im.thumbnail((256,384))
            x=(i%cols)*256;y=(i//cols)*404;sheet.paste(im,(x,y+20),im)
            draw.text((x+5,y+4),f'{identity} {action} {fid}',fill='#273b36')
        sheet.save(out/f'{action}-contact.jpg',quality=88)
        sheets.append(out/f'{action}-contact.jpg')
    hard=[0,39,48,57,80,97,101] if identity=='male' else [0,34,40,49,52,90,95]
    strip=Image.new('RGB',(len(hard)*300,445),'#eeebe4');draw=ImageDraw.Draw(strip)
    for i,fid in enumerate(hard):
        im=Image.open(out/f'{fid:04d}.png');hb=poses[fid]['hairBounds']
        crop=im.crop((max(0,hb['x']-12),max(0,hb['y']-12),min(W,hb['x']+hb['width']+12),min(H,max(hb['y']+hb['height']+40,poses[fid]['headBounds']['y']+poses[fid]['headBounds']['height']+12))))
        crop.thumbnail((300,415));strip.paste(crop,(i*300,25),crop);draw.text((i*300+5,5),f'{identity} {fid}',fill='#263b36')
    strip.save(out/'hard-heads.jpg',quality=94)
    compare_ids=[0,48,63,67,97,101] if identity=='male' else [0,40,58,62,90,95]
    comparison=Image.new('RGB',(1200,960),'#eeebe4');draw=ImageDraw.Draw(comparison)
    for i,fid in enumerate(compare_ids):
        hb=poses[fid]['hairBounds'];head=poses[fid]['headBounds']
        box=(max(0,hb['x']-12),max(0,hb['y']-12),min(W,hb['x']+hb['width']+12),min(H,max(hb['y']+hb['height']+25,head['y']+head['height']+12)))
        px=(i%2)*600;py=(i//2)*320
        for j,(label,im) in enumerate([('original',Image.fromarray(ctx.frames[fid])),('hair',Image.open(out/f'{fid:04d}.png'))]):
            crop=im.crop(box);crop.thumbnail((298,292))
            comparison.paste(crop,(px+j*300,py+25),crop)
            draw.text((px+j*300+4,py+5),f'{identity} {fid} {label}',fill='#263b36')
    comparison.save(out/'hard-before-after.jpg',quality=86,optimize=True)
    if prototype:return
    build_bank(ctx,poses,layers)
    final=DOC/identity;final.mkdir(parents=True,exist_ok=True)
    shutil.copy2(out/'head-registration.json',ART/f'{identity}-head-registration.json')
    shutil.copy2(out/'face-preservation.json',final/'face-preservation.json')
    shutil.copy2(out/'boundary-preservation.json',final/'boundary-preservation.json')
    shutil.copy2(out/'hard-heads.jpg',final/'hard-heads.jpg')
    shutil.copy2(out/'hard-before-after.jpg',final/'hard-before-after.jpg')
    for path in sheets:
        compact=Image.open(path);compact.thumbnail((1600,1600))
        compact.save(final/path.name,quality=80,optimize=True)

def build_bank(ctx,poses,layers):
    entries=[];style_id,style_name=STYLE[ctx.identity]
    style=dict(id=style_id,name=style_name,slot='hair',layers=[])
    for role in ['hair-back','hair-front']:
        layer=dict(role=role,frames=[]);style['layers'].append(layer)
        for fid in ctx.frames:
            pixels=layers[fid][role];owned=pixels[:,:,3]>0
            if not owned.any():
                layer['frames'].append(dict(frameId=fid,mode='source',reason='This pose has no visible authored hair in this layer.'));continue
            r=rect_mask(owned);x,y,w,h=(r[k] for k in ['x','y','width','height'])
            crop=pixels[y:y+h,x:x+w].copy();mask=owned[y:y+h,x:x+w]
            item=dict(frameId=fid,mode='paint',page=0,rect=dict(x=0,y=0,width=w,height=h),offset=dict(x=x,y=y))
            layer['frames'].append(item);entries.append((item,crop,mask))
    width=2048;limit=4096;x=y=row_h=page=0;heights=[]
    for item,crop,owned in entries:
        h,w=crop.shape[:2]
        if x+w>width:x=0;y+=row_h;row_h=0
        if y+h>limit:heights.append(y+row_h);page+=1;x=y=row_h=0
        item['page']=page;item['rect'].update(x=x,y=y);x+=w+2;row_h=max(row_h,h+2)
    heights.append(y+row_h);files={};pages=[]
    for page,height in enumerate(heights):
        atlas=np.zeros((height,width,4),'uint8');mask=np.zeros_like(atlas)
        for item,crop,owned in entries:
            if item['page']!=page:continue
            r=item['rect'];x,y,w,h=(r[k] for k in ['x','y','width','height'])
            atlas[y:y+h,x:x+w]=crop;mask[y:y+h,x:x+w,3]=owned.astype('uint8')*255
        file=f'patches-{page}.png';mfile=f'ownership-{page}.png'
        files[file]=encode_rgba(atlas,ctx.color_chunks);files[mfile]=encode_rgba(mask)
        pages.append(dict(file=file,maskFile=mfile,width=width,height=height))
    manifest=dict(format='gathria-sprite-appearance-bank',version=1,id=f'kling-side-{ctx.identity}-hair-v1',
      name=f'Kling side {ctx.identity} hair',sourceSha256=ctx.source_sha256,registrationSha256=ctx.registration_sha256,
      characterId=ctx.registration['characterId'],frameWidth=W,frameHeight=H,padding=PADDING,poses=poses,pages=pages,styles=[style],
      provenance='OpenAI image generation 2026-10-29, exact frozen side sprite references. Reviewed explicit donor-coordinate hair masks exclude generated faces, ears, skin and clothes. Only new hair is rigidly fitted offline to each original head pose; source anatomy, face, pixels, scale, animation order and timing are unchanged. No face layer. Source-transparent rear hair and foreground arm/hand polygons retain original overlaps. Native 512x768 envelope; zero padding. Source/prompt/masks and review: artwork/kling-side-expansion/hair, docs/kling-side-expansion/hair. Chestnut is original donor color; espresso and copper use the existing deterministic runtime hair tint.')
    files['manifest.json']=(json.dumps(manifest,indent=2)+'\n').encode()
    target=ROOT/f'docs/kling-side-expansion/assets/{ctx.identity}.appearance.zip';target.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for name,data in sorted(files.items()):
            info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
    dump(DOC/f'{ctx.identity}-audit.json',dict(bankId=manifest['id'],styleId=style_id,bankSha256=sha(target.read_bytes()),
         sourceSha256=ctx.source_sha256,registrationSha256=ctx.registration_sha256,poses=len(poses),
         layerFrames={r['role']:len(r['frames']) for r in style['layers']},padding=PADDING,
         pages=len(pages),atlasPixels=sum(p['width']*p['height'] for p in pages),bytes=target.stat().st_size))
    print(json.dumps(dict(character=ctx.identity,poses=len(poses),pages=len(pages),bytes=target.stat().st_size)),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--character',choices=['male','female','both'],default='both')
    parser.add_argument('--prototype',action='store_true');args=parser.parse_args()
    art=donors()
    for identity in (['male','female'] if args.character=='both' else [args.character]): prepare(identity,art[identity],args.prototype)
