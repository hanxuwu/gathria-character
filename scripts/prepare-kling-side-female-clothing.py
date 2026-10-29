#!/usr/bin/env python3
"""Fit eight blouse and six skirt painted donors to frozen female side frames.

Only authored cloth is sampled. Generated heads, limbs, shoes and background
never enter the patch bank. Cloth deformation is offline, the source stays exact.
"""
from pathlib import Path
import argparse, json, math
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from kling_side_authoring import load_context, pack_garment, sha

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artwork/kling-side-expansion/female'
REVIEW=ROOT/'docs/kling-side-expansion/female'
TMP=Path('/tmp/side-expansion/female')
W,H=512,768
YY,XX=np.indices((H,W))
_SEG_FRAME=None
_SEG_DATA=None
IDS=[0,42,72,79,89,95]
TOP_IDS=IDS+[20,34]
TOP_WAIST={0:504,42:490,72:416,79:537,89:347,95:448,20:461,34:475}
# Explicit generated-skin/background rejection at open neck and sleeve edges.
# These masks are donor isolation, not source ownership permissions.
TOP_EXCLUDE={
0:[[(234,426),(281,433),(281,448),(272,450),(257,447),(244,439)],[(183,490),(222,495),(224,504),(183,504)]],
42:[[(231,404),(274,422),(275,438),(269,442),(251,434)],[(166,430),(179,434),(189,447),(192,460),(188,471),(170,472)],[(185,470),(208,472),(212,483),(192,483)]],
72:[[(229,311),(281,337),(283,359),(275,363),(254,348)],[(193,318),(205,320),(208,337),(204,359),(198,370),(181,372)]],
79:[[(249,437),(307,466),(307,487),(297,491),(278,480),(264,456)],[(166,455),(184,461),(198,473),(209,490),(213,508),(198,510),(177,501)],[(206,512),(224,522),(242,541),(231,551),(214,537)]],
89:[[(222,252),(278,268),(281,291),(272,294),(252,284)],[(143,285),(161,291),(176,305),(181,320),(173,331),(153,330)],[(177,329),(196,331),(202,343),(181,343)]],
95:[[(232,343),(282,369),(285,392),(276,396),(257,380)],[(193,347),(206,352),(208,372),(204,394),(197,405),(183,405)]],
20:[[(245,379),(283,392),(286,409),(275,412),(260,400)],[(219,440),(238,437),(257,439),(263,458),(285,472),(277,481),(237,468),(222,451)]],
34:[[(243,368),(278,380),(284,398),(276,401),(259,389)],[(221,428),(237,417),(258,412),(276,417),(291,417),(308,408),(343,407),(346,453),(313,465),(289,473),(260,474),(239,469),(226,458)],[(178,424),(200,435),(216,449),(212,459),(187,454)]]}
# Hand-traced cloth outlines, in each 512x768 donor panel. Skin holes are
# rejected independently by chroma, then completed from adjacent painted cloth.
DEFS={
0:dict(waist=508,top=[(225,430),(243,435),(277,438),(296,440),(307,451),(314,461),(321,473),(317,487),(307,499),(307,508),(224,508),(223,498),(188,494),(188,487),(181,480),(176,467),(178,458),(187,450),(197,445),(202,436),(214,431)],bottom=[(224,505),(307,505),(309,524),(319,549),(330,579),(337,610),(325,616),(313,621),(296,623),(279,625),(259,625),(240,625),(221,623),(200,619),(185,616),(171,610),(160,603),(153,595),(160,582),(174,560),(192,536),(209,520)]),
42:dict(waist=499,top=[(200,405),(221,408),(240,418),(272,427),(292,430),(303,443),(306,455),(317,465),(309,478),(295,486),(286,501),(214,499),(209,483),(190,470),(177,467),(173,456),(171,435),(177,420),(188,412)],bottom=[(216,496),(285,498),(293,512),(303,522),(315,539),(326,548),(331,558),(327,572),(316,585),(302,590),(295,576),(295,551),(280,545),(266,552),(249,567),(230,584),(212,594),(192,600),(170,600),(153,597),(138,589),(130,579),(124,565),(115,553),(111,541),(116,533),(135,527),(162,520),(189,512)]),
72:dict(waist=423,top=[(211,317),(230,320),(244,329),(274,343),(291,341),(309,347),(319,358),(322,372),(316,387),(306,395),(302,423),(215,420),(213,401),(194,395),(185,385),(182,371),(199,369),(203,358),(204,341),(200,324)],bottom=[(214,419),(304,422),(319,444),(338,462),(353,477),(365,488),(367,497),(358,508),(345,521),(329,527),(311,528),(294,525),(288,511),(291,503),(285,493),(272,490),(257,494),(236,504),(217,517),(201,527),(181,529),(163,525),(151,518),(145,508),(132,503),(121,492),(116,481),(123,470),(144,456),(170,442),(193,428)]),
79:dict(waist=545,top=[(222,437),(241,438),(258,448),(275,465),(304,477),(317,477),(326,490),(330,506),(326,519),(314,525),(304,546),(231,544),(224,533),(211,517),(190,508),(176,500),(178,489),(176,472),(174,462),(184,450),(198,443),(212,440)],bottom=[(230,540),(303,543),(312,552),(324,568),(333,583),(328,600),(315,613),(300,621),(285,623),(278,607),(274,599),(263,599),(249,604),(234,613),(213,626),(192,633),(172,632),(155,626),(144,619),(141,607),(128,603),(119,592),(116,582),(125,572),(144,561),(166,552),(195,546)]),
89:dict(waist=352,top=[(201,257),(220,257),(238,266),(254,277),(276,279),(292,280),(303,289),(310,300),(317,311),(315,321),(306,329),(304,352),(200,351),(198,340),(182,329),(166,328),(157,317),(156,301),(150,290),(158,279),(164,268),(180,261)],bottom=[(201,348),(303,348),(318,366),(332,388),(346,408),(355,426),(348,438),(333,448),(314,453),(296,452),(284,443),(285,432),(278,422),(266,423),(248,432),(228,444),(208,455),(187,462),(166,460),(150,454),(139,446),(135,433),(119,426),(109,415),(104,402),(112,392),(133,380),(156,366),(181,355)]),
95:dict(waist=453,top=[(210,349),(232,349),(250,360),(278,377),(298,376),(316,382),(325,396),(326,409),(316,425),(307,430),(306,453),(225,452),(220,438),(200,431),(188,419),(184,405),(198,403),(203,390),(203,371),(199,355)],bottom=[(225,450),(306,451),(312,469),(325,493),(341,521),(351,538),(347,547),(335,555),(319,560),(303,565),(284,567),(264,568),(241,568),(220,566),(201,563),(185,558),(173,551),(168,544),(157,540),(145,531),(147,523),(162,502),(180,481),(202,461)])}
DEFS[20]=dict(waist=465,neck=[267,399],top=[(242,383),(260,388),(281,397),(295,401),(305,414),(314,432),(315,446),(307,456),(301,465),(275,465),(266,456),(258,442),(240,438),(224,440),(217,447),(210,441),(203,431),(204,420),(214,406),(219,395),(230,387)])
DEFS[34]=dict(waist=478,neck=[269,391],top=[(242,374),(260,377),(277,388),(291,396),(299,413),(285,419),(269,412),(251,414),(236,420),(225,428),(218,440),(222,451),(231,460),(247,467),(266,473),(284,473),(299,469),(299,478),(267,481),(236,477),(217,466),(207,450),(196,440),(184,429),(181,414),(188,402),(191,393),(201,383),(220,377)])

def polygon(points):
    im=Image.new('L',(W*3,H*3));ImageDraw.Draw(im).polygon([(round(x*3),round(y*3)) for x,y in points],fill=255)
    return np.array(im.resize((W,H),Image.Resampling.LANCZOS))

def donors():
    source=Image.open(OUT/'source/cream-rose-donors.png').convert('RGB').resize((1536,1536),Image.Resampling.LANCZOS)
    result={}
    forward=Image.open(OUT/'source/cream-rose-forward-donors.png').convert('RGB').resize((1024,768),Image.Resampling.LANCZOS)
    for n,fid in enumerate(TOP_IDS):
        rgb=np.array(source.crop((n%3*512,n//3*768,n%3*512+512,n//3*768+768))) if fid in IDS else np.array(forward.crop(((n-6)*512,0,(n-6)*512+512,768)))
        r,g,b=[rgb[:,:,c].astype(float) for c in range(3)]
        result[fid]={}
        for slot in (['top','bottom'] if fid in IDS else ['top']):
            a=polygon(DEFS[fid][slot]); valid=a>0
            if slot=='top':
                # The manually traced cloth cut retains warm shadow folds.
                # A chroma key would confuse these painted folds with skin.
                keep=valid
                for hole in TOP_EXCLUDE[fid]:a[polygon(hole)>0]=0
                # Crop at the last complete painted cream row and register
                # that real cloth edge to the target waist. No donor skirt
                # band or generated gap-filling is stretched into the blouse.
                a[YY>TOP_WAIST[fid]]=0
                rose=(r-g>32)&(g-b<23)&(YY>DEFS[fid]['waist']-16)
                # The blouse is tucked above a separate skirt. Complete the
                # donor's narrow rose overlap with adjacent cream material;
                # cutting these individual pixels would leave a jagged seam.
                keep=(a>0)&~rose
            else:
                # Painted rose includes shaded folds and the original hem ink.
                skin=(r-g>35)&(g-b>27)&(r>140)
                keep=valid&~ndi.binary_dilation(skin,iterations=3)
                holes={0:[(168,530,230,603),(308,519,342,593)],42:[(142,475,209,546)],79:[(173,505,241,573)],89:[(130,338,204,406),(310,342,371,414)]}
                for x0,y0,x1,y1 in holes.get(fid,[]):keep[y0:y1,x0:x1]=False
                # Reference hands on the skirt are occlusions; complete only
                # their enclosed cloth silhouette from adjacent actual cloth.
            material=keep if slot=='top' else keep&(r>120)&(r-g>30)&(g-b<28)
            nearest=ndi.distance_transform_edt(~material,return_distances=False,return_indices=True)
            filled=rgb.copy();filled[~keep]=rgb[nearest[0][~keep],nearest[1][~keep]]
            patch=np.dstack((filled,a)).astype(np.uint8)
            patch[a==0]=0;result[fid][slot]=patch
            Image.fromarray(patch).save(OUT/f'source/{fid:03d}-{slot}-cloth.png')
            Image.fromarray(a).save(OUT/f'source/{fid:03d}-{slot}-mask.png')
    # The forward arm hides part of each reference blouse. Complete that
    # underlying cloth using the original standing blouse's painted bodice;
    # the source forearm is composited in front in every destination pose.
    for fid in [20,34]:
        left,right=(218,303) if fid==20 else (215,299)
        top=DEFS[fid]['neck'][1]+7;bottom=TOP_WAIST[fid]
        sx=225+(XX-left)/(right-left)*80
        sy=451+(YY-top)/max(1,bottom-top)*(TOP_WAIST[0]-451)
        under=sample(result[0]['top'],sx,sy)
        shape=polygon([(left+18,top),(right-5,top+3),(right+2,top+30),(right,bottom),(left,bottom),(left-2,top+30)])>0
        valid=(under[:,:,3]>200)&shape
        nearest=ndi.distance_transform_edt(~valid,return_distances=False,return_indices=True)
        missing=shape&~valid;under[missing]=under[nearest[0][missing],nearest[1][missing]]
        under[~shape]=0;under[shape,3]=255
        patch=Image.alpha_composite(Image.fromarray(under),Image.fromarray(result[fid]['top']))
        result[fid]['top']=np.array(patch);patch.save(OUT/f'source/{fid:03d}-top-cloth.png');patch.getchannel('A').save(OUT/f'source/{fid:03d}-top-mask.png')
    # Final skirts are separately repainted COMPLETE cloth sprites. This
    # removes reference-hand occlusions with real continuous painted folds,
    # rather than carrying an interpolated hand-shaped patch into animation.
    clean=Image.open(OUT/'source/rose-skirt-clean-donors.png').convert('RGBA')
    cw,ch=clean.width//3,clean.height//2
    for n,fid in enumerate(IDS):
        p=np.array(clean.crop((n%3*cw,n//3*ch,(n%3+1)*cw,(n//3+1)*ch)))
        labels,count=ndi.label(p[:,:,3]>10);counts=np.bincount(labels.ravel());counts[0]=0
        body=labels==np.argmax(counts);body=ndi.binary_dilation(body,iterations=2)
        p[~body]=0;im=Image.fromarray(p);box=im.getbbox();im=im.crop(box)
        original_box=Image.fromarray(polygon(DEFS[fid]['bottom'])).getbbox()
        x0,y0,x1,y1=original_box
        patch=Image.new('RGBA',(W,H));patch.alpha_composite(im.resize((x1-x0,y1-y0),Image.Resampling.LANCZOS),(x0,y0))
        result[fid]['bottom']=np.array(patch)
        patch.save(OUT/f'source/{fid:03d}-bottom-cloth.png')
        patch.getchannel('A').save(OUT/f'source/{fid:03d}-bottom-mask.png')
    return result

def point(rec,key):
    p=rec['points'][key];return np.array([p['x'],p['y']],float)

def cloth_waist(ctx,fid):
    if fid==31:return np.array([258.5,540.0])
    rec=ctx.registered[fid]
    return (point(rec,'waistLeft')+point(rec,'waistRight'))*.5

def segments(ctx,fid):
    global _SEG_FRAME,_SEG_DATA
    if _SEG_FRAME!=fid:
        _SEG_FRAME=fid;_SEG_DATA=ctx.source_visible_segments(fid)['masks']
    return _SEG_DATA

def select(ctx,fid,slot):
    # Visually reviewed near-arm depth order overrides ambiguous hidden-arm
    # anchor distances during the forward half of the native run cycle.
    if slot=='top' and fid in [34,35,36,37,51,55]:return 34
    if slot=='top' and fid in [38,39,48,49,50]:return 20
    rec=ctx.registered[fid]; neck=point(rec,'neck'); waist=cloth_waist(ctx,fid)
    keys=['nearShoulder','farShoulder','nearElbow','farElbow','nearWrist','farWrist'] if slot=='top' else ['nearKnee','farKnee','nearAnkle','farAnkle']
    origin=neck if slot=='top' else waist
    f=np.array([point(rec,k)-origin for k in keys])
    scores=[]
    choices=TOP_IDS if slot=='top' else IDS
    for did in choices:
        rr=ctx.registered[did];o=point(rr,'neck') if slot=='top' else (point(rr,'waistLeft')+point(rr,'waistRight'))*.5
        q=np.array([point(rr,k)-o for k in keys]);scores.append(np.mean((f-q)**2))
    return choices[int(np.argmin(scores))]

def sample(template,sx,sy):
    a=template[:,:,3].astype(float)/255
    aa=ndi.map_coordinates(a,[sy,sx],order=1,mode='constant',cval=0)
    result=np.zeros((H,W,4),np.uint8)
    for c in range(3):
        values=ndi.map_coordinates(template[:,:,c].astype(float)*a,[sy,sx],order=1,mode='constant',cval=0)
        result[:,:,c]=np.clip(np.rint(values/np.maximum(aa,1e-8)),0,255).astype(np.uint8)
    result[:,:,3]=np.rint(aa*255).astype(np.uint8);result[aa<.02]=0
    return result

def fit_top(ctx,fid,did,template):
    src=ctx.registered[did]; dst=ctx.registered[fid]
    names=['neck','nearShoulder','farShoulder','nearElbow','farElbow','nearWrist','farWrist','waistLeft','waistRight']
    srcp=np.array([point(src,k) for k in names]);dstp=np.array([point(dst,k) for k in names])
    if fid==55:dstp[0,1]-=8  # inspected shoulder crown above the tracked neckline guide
    if 'neck' in DEFS[did]:srcp[0]=DEFS[did]['neck']
    waists={0:[224,307],42:[214,286],72:[215,302],79:[231,304],89:[200,304],95:[225,306],20:[218,303],34:[215,299]}
    srcp[-2:]=[[waists[did][0],TOP_WAIST[did]],[waists[did][1],TOP_WAIST[did]]]
    m=ctx.masks(fid)['top'];wy=np.mean(dstp[-2:,1]);all_y,all_x=np.where(m)
    # Foreground wrists can hide almost the whole visible waist row (f50).
    # Use the actual source garment envelope for that occluded attachment.
    if all_y.max()-wy>12:wy=float(all_y.max()-3)
    ys,xs=np.where((m|ctx.masks(fid)['bottom'])&(YY>=wy-6)&(YY<=wy+3))
    if len(xs)<12 or xs.max()-xs.min()<40 or xs.max()-xs.min()>(all_x.max()-all_x.min())*1.15:xs=all_x
    if len(xs):dstp[-2:]=[[xs.min(),wy],[xs.max(),wy]]
    if fid==31:dstp[-2:]=[[218,539],[299,541]]
    # Skin landmarks only guide cloth; generated limb pixels are never sampled.
    # One bounded torso affine per authored pose. Keeping the original painted
    # folds coherent avoids the foldovers a global nonlinear inverse can create
    # when foreground wrists cross the torso. Sleeve pose comes from selection.
    controls=[0,7,8]
    transform=np.linalg.solve(np.column_stack([dstp[controls],np.ones(3)]),srcp[controls])
    coords=(np.column_stack([XX.ravel(),YY.ravel(),np.ones(W*H)])@transform).reshape(H,W,2)
    patch=sample(template,coords[:,:,0],coords[:,:,1])
    # Constrain the fitted garment to its anatomical neighborhood, with
    # allowance for painted sleeves and a loose cloth silhouette.
    seg=segments(ctx,fid)
    body=ndi.binary_dilation(m,iterations=24)
    sleeves=ndi.binary_dilation(seg['nearUpperArm']|seg['farUpperArm'],iterations=18)
    bottom=np.where(m)[0].max()+5
    patch[~((body|sleeves)&(YY<=bottom))]=0
    return patch

def fit_bottom(ctx,fid,did,template):
    rec=ctx.registered[fid];rr=ctx.registered[did];m=ctx.masks(fid)
    waist=cloth_waist(ctx,fid)
    old=(point(rr,'waistLeft')+point(rr,'waistRight'))*.5;old[1]=DEFS[did]['waist']
    sy,sx=np.where(m['bottom']);rsy,rsx=np.where(ctx.masks(did)['bottom'])
    # Stable authored silhouettes are selected by actual leg configuration.
    # A continuous scale/translation moves the entire original painted hem.
    if not hasattr(ctx,'_skirt_geometry'):
        ctx._skirt_geometry={}
        for action,clip in ctx.animations.items():
            lengths=[];widths=[]
            for ff in clip['frames']:
                rp=ctx.registered[ff];ww=cloth_waist(ctx,ff)
                knees=(point(rp,'nearKnee')+point(rp,'farKnee'))*.5
                lengths.append(np.clip(80+(knees[1]-ww[1])*.3,85,110))
                widths.append(np.clip(185+abs(point(rp,'nearKnee')[0]-point(rp,'farKnee')[0])*.25,188,220))
            mode='wrap' if clip['loop'] else 'nearest'
            ll=ndi.gaussian_filter1d(np.array(lengths),1.1,mode=mode);ww=ndi.gaussian_filter1d(np.array(widths),1.1,mode=mode)
            ctx._skirt_geometry.update({ff:(float(l),float(w)) for ff,l,w in zip(clip['frames'],ll,ww)})
    length,width=ctx._skirt_geometry[fid]
    ty,tx=np.where(template[:,:,3]>20)
    scale_x=width/(tx.max()-tx.min()+1)
    scale_y=length/(ty.max()-old[1]+3)
    target_top=waist[1]-4
    source_top=old[1]-3
    lean=np.clip((waist[0]-point(rec,'neck')[0])-(old[0]-point(rr,'neck')[0]),-24,24)
    source_y=(YY-target_top)/scale_y+source_top
    frac=np.clip((YY-target_top)/130,0,1)
    source_x=(XX-waist[0]-lean*frac*.3)/scale_x+old[0]
    return sample(template,source_x,source_y)

def composite(ctx,fid,patch,slot):
    original=ctx.frames[fid];m=ctx.masks(fid);protected=ctx.protected_mask(fid)
    original_cloth=m[slot]
    if fid==31 and slot=='top':
        # The inherited top guide includes part of this frame's far forearm.
        # Restrict replacement to the inspected visible source tank envelope.
        torso=polygon([(237,442),(280,444),(304,451),(319,483),(319,500),(303,511),(300,545),(214,544),(211,527),(219,501),(239,487),(245,467)])>0
        original_cloth=original_cloth&torso
    foreground=protected.copy()
    seg=segments(ctx,fid)
    if slot=='bottom':
        arm=seg['nearUpperArm']|seg['nearForearm']|seg['farUpperArm']|seg['farForearm']
        wrist_y=max(point(ctx.registered[fid],'nearWrist')[1],point(ctx.registered[fid],'farWrist')[1])
        foreground |= arm&(YY<wrist_y+4)
    else:
        # Forearms crossing a blouse remain exact; the sleeves own upperarms.
        foreground |= seg['nearForearm']|seg['farForearm']
        if fid==55:
            # In this source frame the elbow guides follow the opposite arm,
            # making nearest-segment hints cut horizontal holes in a sleeve.
            # These source-inspected foreground contours retain the actual
            # crossing forearm and the small visible far forearm behind it.
            near=polygon([(260,465),(293,452),(332,438),(369,438),(379,470),(360,494),(320,505),(280,501)])>0
            far=polygon([(182,475),(205,475),(212,495),(196,516),(178,511)])>0
            foreground=protected|((near|far)&(original[:,:,3]>0))
    foreground &= ~original_cloth
    if fid==31 and slot=='top':
        far=polygon([(310,498),(340,501),(385,507),(390,550),(350,553),(303,530),(301,512)])>0
        foreground |= far&(original[:,:,3]>0)&~original_cloth
    patch[foreground]=0
    # Fill any original garment sliver using adjacent painted fabric, always
    # excluding protected source pixels and preserving continuous cloth edges.
    need=original_cloth&(patch[:,:,3]<230)&~protected
    valid=ndi.binary_erosion(patch[:,:,3]>240,iterations=3)
    if not valid.any():raise ValueError(f'No opaque painted {slot} material in frame {fid}')
    if need.any():
        nearest=ndi.distance_transform_edt(~valid,return_distances=False,return_indices=True)
        patch[need]=patch[nearest[0][need],nearest[1][need]]
        patch[need,3]=original[need,3]
    a=patch[:,:,3:4].astype(float)/255;oa=original[:,:,3:4].astype(float)/255
    na=a+oa*(1-a);rgb=(patch[:,:,:3]*a+original[:,:,:3]*oa*(1-a))/np.maximum(na,1e-8)
    out=np.dstack((np.rint(rgb),np.rint(na[:,:,0]*255))).astype(np.uint8)
    use=patch[:,:,3]>0;result=original.copy();result[use]=out[use];result[protected]=original[protected]
    return result

def board(frames,ids,path,title):
    cols=4; cw,ch=256,408
    out=Image.new('RGB',(cols*cw,math.ceil(len(ids)/cols)*ch),(235,231,220));d=ImageDraw.Draw(out)
    for i,fid in enumerate(ids):
        x=i%cols*cw;y=i//cols*ch;im=Image.fromarray(frames[fid]).resize((256,384),Image.Resampling.LANCZOS)
        out.paste(im,(x,y+24),im);d.text((x+8,y+6),f'{title} / {fid}',fill=(30,40,40))
    out.save(path,quality=94)

def review_gif(frames,clip,path):
    # Review only: GIF timing is quantized to 10ms. Runtime source stays 24fps.
    pictures=[]
    for fid in clip['frames']:
        p=Image.new('RGB',(256,384),(235,231,220));im=Image.fromarray(frames[fid]).resize((256,384),Image.Resampling.LANCZOS);p.paste(im,(0,0),im);pictures.append(p)
    palette=pictures[0].quantize(colors=256)
    pictures=[p.quantize(palette=palette,dither=Image.Dither.NONE) for p in pictures]
    durations=[round((i+1)*100/24)*10-round(i*100/24)*10 for i in range(len(pictures))]
    opts={'loop':0} if clip['loop'] else {}
    pictures[0].save(path,save_all=True,append_images=pictures[1:],duration=durations,disposal=2,optimize=True,**opts)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--prototype',action='store_true');ap.add_argument('--registration',type=Path);args=ap.parse_args()
    OUT.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(parents=True,exist_ok=True);TMP.mkdir(parents=True,exist_ok=True)
    candidate=ROOT/'artwork/kling-side-expansion/templates/female.registration.json'
    registration=args.registration or (candidate if candidate.exists() else None)
    ctx=load_context('female',registration_path=registration);ref=donors();ids=[0,20,31,34,42,49,50,55,67,72,79,89,95,101] if args.prototype else list(ctx.frames)
    paintings={'top':{},'bottom':{}};combined={};audit=[]
    for fid in ids:
        choices={slot:select(ctx,fid,slot) for slot in paintings}
        for slot in paintings:
            did=choices[slot];patch=fit_top(ctx,fid,did,ref[did][slot]) if slot=='top' else fit_bottom(ctx,fid,did,ref[did][slot])
            paintings[slot][fid]=composite(ctx,fid,patch,slot)
        combo=paintings['bottom'][fid].copy();changed=np.any(paintings['top'][fid]!=ctx.frames[fid],axis=2);combo[changed]=paintings['top'][fid][changed]
        combined[fid]=combo;Image.fromarray(combo).save(TMP/f'combined-{fid:03d}.png')
        audit.append({'frameId':fid,'donors':choices,'protectedChanged':int(np.any(combo!=ctx.frames[fid],axis=2)[ctx.protected_mask(fid)].sum())})
    board(combined,ids if args.prototype else [0,20,31,34,42,49,50,55,67,72,79,85,89,95,101],REVIEW/'hardposes.jpg','Cream blouse / rose skirt')
    (OUT/'fit-audit.json').write_text(json.dumps({'sourceSha256':ctx.source_sha256,'registrationSha256':ctx.registration_sha256,'poses':audit},indent=2)+'\n')
    if not args.prototype:
        for action,clip in ctx.animations.items():
            board(combined,clip['frames'],REVIEW/f'{action}-frames.jpg',action)
            review_gif(combined,clip,REVIEW/f'{action}-motion.gif')
        provenance='Original painted eight-pose cream blouse donors and six complete rose skirt sprites made using OpenAI image generation. Exact prompts, source art, SHA256 values and cloth-only masks are saved in artwork/kling-side-expansion/female/source. Generated heads, skin, shoes and background are discarded. Complete skirts were repainted as isolated cloth to replace donor-hand occlusions with continuous painted folds. Separate cloth-only masks are fitted offline to each frozen source pose, with original source head/hands and uncovered body retained exactly. Painted hem shape is carried continuously with pose-specific donor selection; no runtime body deformation or AI.'
        for slot,item,name in [('top','side-female-cream-blouse-v1','Cream puff-sleeve blouse'),('bottom','side-female-rose-skirt-v1','Rose gathered skirt')]:
            filename='female-blouse.garment.zip' if slot=='top' else 'female-skirt.garment.zip'
            report=pack_garment(ctx,item,name,slot,paintings[slot],ROOT/'docs/kling-side-expansion/assets'/filename,provenance)
            (OUT/f'{slot}-pack-audit.json').write_text(json.dumps(report,indent=2)+'\n')
        files={p.name:sha(p.read_bytes()) for p in (OUT/'source').iterdir() if p.is_file() and p.name!='provenance.json'}
        (OUT/'source/provenance.json').write_text(json.dumps({'method':'OpenAI image generation; cloth-only extraction; source-registered offline painted donor fitting','sourceSha256':ctx.source_sha256,'registrationSha256':ctx.registration_sha256,'frames':len(ids),'files':files},indent=2)+'\n')
    print(json.dumps({'frames':len(ids),'protectedChanged':sum(a['protectedChanged'] for a in audit),'preview':str(REVIEW/'hardposes.jpg')}))

if __name__=='__main__':main()
