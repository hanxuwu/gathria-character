#!/usr/bin/env python3
"""Author matched side-view hair without changing the frozen Kling character.

The generated portraits are donors, never replacement character pixels. Reviewed
hair-side boundary polygons discard their skin, eyes, ears, neck and clothes.
Semantic rear nape / far-side locks remain hair-back through every transform.
Only hair receives donorToReference and persisted source-bound head/feature
transforms. A continuous near-ear field fits the female aperture; both layers
share it. Protected partially transparent source edges receive hair-only rear
backing while their immutable source matte remains in front.
Preview output defaults to /tmp; publishing is a separate explicit operation.
"""
from __future__ import annotations

import argparse
import copy
import importlib.util
import io
import json
import zipfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

from kling_side_authoring import ROOT, W, H, load_context, runtime_polygon_mask, sha

SOURCE = ROOT / 'artwork/matched-hair/source'
TMP = Path('/tmp/kling-hair-match/prototype')
STYLE = {'male': ('side-part-matched-v1', 'Side part · matched side view'),
         'female': ('soft-bob-matched-v1', 'Soft bob · matched side view')}

# These follow the hair side of the donor's inner boundary. The alpha channel
# supplies the original outer contour; no replacement strands are drawn.
INNER = {
    'male': [(550,910),(551,880),(546,855),(528,834),(563,814),(534,823),
             (500,826),(467,822),(438,810),(419,794),(405,770),(398,743),
             (397,714),(404,688),(417,668),(438,654),(463,648),(492,652),
             (519,661),(533,662),(552,680),(565,702),(580,712),(607,720),
             (635,718),(622,706),(617,686),(611,661),(613,632),(620,649),
             (616,622),(623,599),(642,569),(664,546),(690,526),(720,502),
             (711,504),(731,469),(750,432),(764,414),(786,400),(810,397),
             (825,393),(837,397),(850,391),(862,397),(878,398),(899,405),
             (920,422),(936,449),(947,482),(954,519),(956,559),(950,590),
             (980,581),(1254,605)],
    'female': [(620,880),(621,852),(613,829),(598,803),(622,782),(595,794),
               (559,796),(526,792),(496,779),(473,760),(459,738),(450,711),
               (449,681),(453,653),(463,628),(482,611),(508,605),(537,607),
               (566,615),(590,631),(611,656),(626,696),(632,715),(628,690),
               (642,724),(677,763),(747,791),(725,768),(710,743),(700,716),
               (717,735),(705,711),(697,678),(695,647),(699,611),(709,581),
               (739,554),(767,521),(798,476),(821,423),(840,369),(853,318),
               (869,317),(883,327),(903,357),(932,390),(963,422),(1000,448),
               (1046,469),(1060,474),(1057,505),(1049,530),(1042,545),
               (1043,559),(1034,580),(1028,607),(1027,634),(1029,660),
               (1036,681),(1050,691),(1059,699),(1061,712),(1053,731),
               (1057,748),(1058,766),(1065,765),(1323,810)]
}
BACK_REGIONS = {
    'male': [[(0,870),(575,870),(575,940),(0,940)],
             [(954,519),(1254,519),(1254,700),(950,700),(950,590)]],
    'female': [[(0,810),(500,810),(635,830),(635,920),(0,920)],
               [(450,785),(640,785),(640,920),(450,920)],
               [(1060,467),(1323,467),(1323,820),(1024,820),(1024,580)]]
}
# Similarity only: no non-uniform squash and no source/face rescaling. Alternative
# male scale is retained in static review rather than concealed in the renderer.
DONOR_TO_REFERENCE = {
    'male': [[.301207936,.0095032444,46.662342],[-.0095032444,.301207936,157.066304]],
    'female': [[.27247,.01022,45.66603],[-.01022,.27247,192.90871]]
}
LANDMARKS = {
    'female': [
        dict(name='near-ear centre',donor=[542,706],source=[201,379]),
        dict(name='near-eye centre',donor=[904,622],source=[297,353]),
        dict(name='chin',donor=[901,875],source=[301,423])
    ],
    'male': [dict(name='near-ear centre',donor=[490,740],source=[201,374]),
             dict(name='near-eye centre',donor=[802,665],source=[293,351]),
             dict(name='chin',donor=[800,898],source=[298,420])]
}
NECK_FOREGROUND = {
    'female': [(231,405),(244,416),(274,424),(289,427),(302,432),(306,470),(218,472),(217,433)],
    'male': [(222,410),(235,414),(261,419),(282,422),(290,436),(298,465),(211,467),(209,428)]
}
REAR_CAP_WEIGHTS = {66:.5,67:1.,68:.5,78:.275,79:.55,80:.275}
MALE_EAR_REFERENCE = [(184,350),(200,343),(220,350),(231,367),(230,385),(222,395),(205,400),(189,393),(179,378),(179,363)]


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


bank_tools = module('matched_bank_tools', 'prepare-dual-looks-appearance.py')


def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def donor_polygon(size, points):
    im = Image.new('L', size)
    ImageDraw.Draw(im).polygon(points, fill=255)
    return np.array(im) > 0


def extract_donor(identity, output):
    version='v2' if identity=='male' else 'v1'
    path = SOURCE / f'{identity}-side-design-{version}.png'
    pixels = np.array(Image.open(path).convert('RGBA'))
    height, width = pixels.shape[:2]
    all_hair = donor_polygon((width, height), [(0,0),(width,0),*reversed(INNER[identity]),(0,940)])
    rear = np.zeros((height,width), bool)
    for polygon in BACK_REGIONS[identity]:
        rear |= donor_polygon((width,height), polygon)
    # Restrict peach rejection to a narrow cut fringe. It cannot alter the outer
    # hair silhouette, highlights in its interior, or any frozen source pixel.
    edge = cv2.distanceTransform(all_hair.astype('uint8'),cv2.DIST_L2,5) < 4
    rgb = pixels[:,:,:3].astype('int16')
    peach = (rgb[:,:,0]>210)&(rgb[:,:,1]>105)&(rgb[:,:,2]>75)&(rgb[:,:,0]-rgb[:,:,1]>45)
    excluded = all_hair & edge & peach
    if identity=='male':
        # The v2 donor's lower ear/neck cut contains a small peach skin sliver.
        # This reviewed shadow-only hair region has no bright copper highlight.
        # Remove the donor skin; never replace it or paint over source anatomy.
        nape=np.zeros((height,width),bool);nape[800:920,480:580]=True
        nape_skin=(rgb[:,:,0]>190)&(rgb[:,:,1]>95)&(rgb[:,:,2]>55)&(rgb[:,:,0]-rgb[:,:,1]>45)
        excluded |= all_hair & nape & nape_skin
    all_hair &= ~excluded
    result = {}
    for role, keep in [('hair-front',all_hair & ~rear),('hair-back',all_hair & rear)]:
        layer = pixels.copy(); layer[~keep] = 0
        result[role] = layer
        output.mkdir(parents=True,exist_ok=True)
        Image.fromarray(layer).save(output / f'{identity}-{role}-donor.png')
    return result, dict(source=str(path.relative_to(ROOT)),sha256=sha(path.read_bytes()),
        innerBoundary=INNER[identity],semanticBackRegions=BACK_REGIONS[identity],
        cutFringeRejectedPixels=int(excluded.sum()),donorToReference=DONOR_TO_REFERENCE[identity],
        reviewedLandmarks=LANDMARKS[identity],
        fittingRule='A single similarity transforms only donor hair into native pose 0. Other poses use persisted source-bound headTransform; female near-ear aperture continuously blends toward featureTransform inside reference ellipse center(201,379), radii(72,66), cubic smoothstep full weight within normalized radius .55 and zero at radius 1, eight inverse iterations, shared by both semantic layers. Protected partial-alpha samples receive hair-back backing only at clipped source 0<alpha<255 pixels. Source anatomy/pixels never receive these transforms or repaint.'+(' Male rear-cap correction is a further shared continuous native sampling field, reference center(162,390), radii(40,38), delta(-7,3), weights native66/67/68=.5/1/.5 and78/79/80=.275/.55/.275, zero at source-ear/neck and outside the local ellipse; other101 poses remain exact.' if identity=='male' else ''))


def warp_rgba(pixels, matrix):
    f = pixels.astype(np.float32)/255
    f[:,:,:3] *= f[:,:,3:4]
    out = cv2.warpAffine(f,np.asarray(matrix,dtype=np.float32)[:2],(W,H),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    a=out[:,:,3:4]
    out[:,:,:3]=np.divide(out[:,:,:3],a,out=np.zeros_like(out[:,:,:3]),where=a>0)
    return np.rint(np.clip(out,0,1)*255).astype('uint8')


def warp_hair_layers(identity, donor, registration):
    head=np.vstack([registration['headTransform'],[0,0,1]])
    fit=np.vstack([DONOR_TO_REFERENCE[identity],[0,0,1]])
    if identity!='female':
        return {role:warp_rgba(pixels,head@fit) for role,pixels in donor.items()}
    # Scalp fitting may enlarge the crown while the original ear/face contracts
    # during a crouch. Register the near-ear aperture to featureTransform with a
    # continuous local field, leaving the crown and far-side outline on headTransform.
    # Both semantic layers use the SAME field, so their authored split cannot open.
    feature=np.vstack([registration['featureTransform'],[0,0,1]])
    inverse=np.linalg.inv(head);delta=feature-head
    yy,xx=np.mgrid[:H,:W]
    points=np.stack([xx,yy,np.ones_like(xx)],axis=-1).astype(np.float64)
    reference=points@inverse.T
    for _ in range(8):
        radius=np.sqrt(((reference[:,:,0]-201)/72)**2+((reference[:,:,1]-379)/66)**2)
        phase=np.clip((radius-.55)/.45,0,1)
        weight=1-phase*phase*(3-2*phase)
        offset=reference@delta.T
        reference=(points-offset*weight[:,:,None])@inverse.T
    coords=reference@np.linalg.inv(fit).T
    map_x=coords[:,:,0].astype('float32');map_y=coords[:,:,1].astype('float32')
    layers={}
    for role,pixels in donor.items():
        f=pixels.astype(np.float32)/255;f[:,:,:3]*=f[:,:,3:4]
        out=cv2.remap(f,map_x,map_y,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
        a=out[:,:,3:4];out[:,:,:3]=np.divide(out[:,:,:3],a,out=np.zeros_like(out[:,:,:3]),where=a>0)
        layers[role]=np.rint(np.clip(out,0,1)*255).astype('uint8')
    return layers


def fit_rear_cap(layers, registration, frame_id):
    """Small continuous hair-only extension for two reviewed crouch contours.

    The two adjacent frames ease the displacement. Original ear and neck regions
    receive exactly zero displacement. Both semantic layers use one sampling map;
    no flat-color fill, source repaint, global rescale or crown movement occurs.
    """
    amount=REAR_CAP_WEIGHTS.get(frame_id,0)
    if not amount:return layers
    head=np.vstack([registration['headTransform'],[0,0,1]])
    feature=np.asarray(registration['featureTransform'])
    yy,xx=np.mgrid[:H,:W]
    points=np.stack([xx,yy,np.ones_like(xx)],axis=-1).astype(float)
    reference=points@np.linalg.inv(head).T
    radius=np.sqrt(((reference[:,:,0]-162)/40)**2+((reference[:,:,1]-390)/38)**2)
    phase=np.clip(radius,0,1)
    weight=(1-phase*phase*(3-2*phase))*amount
    protected=np.zeros((H,W),bool)
    for polygon in [MALE_EAR_REFERENCE,NECK_FOREGROUND['male']]:
        coords=np.asarray(polygon)@feature[:,:2].T+feature[:,2]
        protected|=runtime_polygon_mask([dict(x=float(x),y=float(y)) for x,y in coords])
    clearance=cv2.distanceTransform((~protected).astype('uint8'),cv2.DIST_L2,5)
    p=np.clip(clearance/10,0,1);weight*=p*p*(3-2*p)
    displacement=head[:2,:2]@np.array([-7.,3.])
    map_x=(xx-displacement[0]*weight).astype('float32')
    map_y=(yy-displacement[1]*weight).astype('float32')
    output={}
    for role,pixels in layers.items():
        f=pixels.astype(np.float32)/255;f[:,:,:3]*=f[:,:,3:4]
        out=cv2.remap(f,map_x,map_y,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
        a=out[:,:,3:4];out[:,:,:3]=np.divide(out[:,:,:3],a,out=np.zeros_like(out[:,:,:3]),where=a>0)
        output[role]=np.rint(np.clip(out,0,1)*255).astype('uint8')
        output[role][weight==0]=pixels[weight==0]
    return output


def over(base, top, back=False):
    b=base.astype(np.float64)/255; t=top.astype(np.float64)/255
    ta=t[:,:,3:4]; ba=b[:,:,3:4]
    tw=ta*(1-ba) if back else ta; bw=ba if back else ba*(1-ta)
    a=tw+bw; rgb=np.divide(t[:,:,:3]*tw+b[:,:,:3]*bw,a,out=np.zeros_like(t[:,:,:3]),where=a>0)
    out=np.rint(np.clip(np.concatenate([rgb,a],axis=2),0,1)*255).astype('uint8')
    untouched=(top[:,:,3]==0)|((base[:,:,3]==255) if back else False)
    out[untouched]=base[untouched]
    return out


def layers_and_pose(ctx, fid, donor, old_pose, registration):
    pose=copy.deepcopy(old_pose)
    # Preserve headBounds/anchors/facePolygon exactly. An added foreground guard
    # protects existing neck/upper collar pixels, rather than shortening the head.
    feature=np.asarray(registration['featureTransform'])
    points=np.asarray(NECK_FOREGROUND[ctx.identity])@feature[:,:2].T+feature[:,2]
    guard=[dict(x=round(float(x),3),y=round(float(y),3)) for x,y in points]
    pose['foreground']=[*pose['foreground'],guard]
    assert len(pose['foreground'])<=8
    layers=warp_hair_layers(ctx.identity,donor,registration)
    if ctx.identity=='male':layers=fit_rear_cap(layers,registration,fid)
    face=runtime_polygon_mask(pose['facePolygon'])&(ctx.frames[fid][:,:,3]==255)
    clearance=cv2.distanceTransform((~face).astype('uint8'),cv2.DIST_L2,5)
    for pixels in layers.values():
        pixels[:,:,3]=np.rint(pixels[:,:,3]*np.minimum(clearance/1.5,1)).astype('uint8')
        pixels[pixels[:,:,3]==0]=0
    # A partially transparent protected source edge still needs hair behind it.
    # Moving only the clipped front sample to back implements normal occlusion
    # without altering source matte pixels or duplicating outer hair alpha.
    foreground=np.zeros((H,W),bool)
    for poly in pose['foreground']:foreground|=runtime_polygon_mask(poly)
    for region in ctx.registered[fid]['protected']:
        if region['label']!='head':foreground|=runtime_polygon_mask(region['polygon'])
    h=pose.get('hairOcclusionBounds',pose['headBounds'])
    head=np.zeros((H,W),bool);head[h['y']:h['y']+h['height'],h['x']:h['x']+h['width']]=True
    alpha=ctx.frames[fid][:,:,3]
    backing=(foreground|~head)&(alpha>0)&(alpha<255)&(layers['hair-front'][:,:,3]>0)
    composite=over(layers['hair-back'],layers['hair-front'])
    layers['hair-back'][backing]=composite[backing]
    layers['hair-front'][backing]=0
    union=np.zeros((H,W),bool)
    for pixels in layers.values():union|=pixels[:,:,3]>0
    yy,xx=np.where(union)
    pose['hairBounds']=dict(x=int(xx.min()),y=int(yy.min()),width=int(xx.max()+1-xx.min()),height=int(yy.max()+1-yy.min()))
    return layers,pose,guard,int(backing.sum())


def render(ctx,fid,layers,pose):
    source=ctx.frames[fid]; result=source.copy()
    foreground=np.zeros((H,W),bool)
    for poly in pose['foreground']:foreground|=runtime_polygon_mask(poly)
    for region in ctx.registered[fid]['protected']:
        if region['label']!='head':foreground|=runtime_polygon_mask(region['polygon'])
    foreground &= source[:,:,3]>0
    h=pose.get('hairOcclusionBounds',pose['headBounds'])
    head=np.zeros((H,W),bool);head[h['y']:h['y']+h['height'],h['x']:h['x']+h['width']]=True
    for role in ['hair-back','hair-front']:
        layer=layers[role].copy()
        if role=='hair-front':layer[foreground|((source[:,:,3]>0)&~head)]=0
        result=over(result,layer,back=role=='hair-back')
    return result


def preview(identity, output, frame_ids):
    donor, extraction=extract_donor(identity,output/'donors')
    ctx=load_context(identity,registration_path=ROOT/f'artwork/kling-side-expansion/templates/{identity}.registration.json')
    _,manifest,_=bank_tools.load_bank(ROOT/f'docs/dual-looks/assets/{identity}-side.appearance.zip')
    poses={p['frameId']:p for p in manifest['poses']}
    registration=json.loads((ROOT/f'artwork/kling-side-expansion/hair/{identity}-head-registration.json').read_text())
    assert registration['sourceSha256']==ctx.source_sha256
    assert registration['registrationSha256']==ctx.registration_sha256
    rows={r['frameId']:r for r in registration['frames']}
    proof=[]
    sheet=Image.new('RGBA',(W*2,H*len(frame_ids)),'#eee9df')
    for n,fid in enumerate(frame_ids):
        layers,pose,guard,backing_count=layers_and_pose(ctx,fid,donor,poses[fid],rows[fid])
        result=render(ctx,fid,layers,pose)
        for role,pixels in layers.items():Image.fromarray(pixels).save(output/f'{identity}-{fid:04d}-{role}.png')
        Image.fromarray(result).save(output/f'{identity}-{fid:04d}-matched.png')
        sheet.alpha_composite(Image.fromarray(ctx.frames[fid]),(0,n*H))
        sheet.alpha_composite(Image.fromarray(result),(W,n*H))
        face=runtime_polygon_mask(pose['facePolygon'])&(ctx.frames[fid][:,:,3]==255)
        neck=runtime_polygon_mask(guard)&(ctx.frames[fid][:,:,3]==255)
        changed=np.any(result!=ctx.frames[fid],axis=2)
        assert not changed[face].any()
        assert not changed[neck].any()
        proof.append(dict(frameId=fid,sourceFrame=rows[fid]['sourceFrame'],pose=pose,neckForeground=guard,partialAlphaForegroundBackingPixels=backing_count,
            sourceRgbaSha256=sha(ctx.frames[fid].tobytes()),renderRgbaSha256=sha(result.tobytes()),
            changedFacePixels=int(changed[face].sum()),changedNeckPixels=int(changed[neck].sum())))
    sheet.convert('RGB').save(output/f'{identity}-static-source-matched.png')
    dump(output/f'{identity}-prototype.json',dict(extraction=extraction,sourceSha256=ctx.source_sha256,
        registrationSha256=ctx.registration_sha256,frames=proof))


def build_bank(identity, output, publish=False):
    """Build the full source-bound candidate while retaining the old face bank.

    Default output is a review artifact in /tmp. --publish writes only the new
    docs/matched-hair bank and authoring audit; it never modifies old banks.
    """
    donor, extraction=extract_donor(identity,output/'donors')
    ctx=load_context(identity,registration_path=ROOT/f'artwork/kling-side-expansion/templates/{identity}.registration.json')
    old_bytes,old,pages=bank_tools.load_bank(ROOT/f'docs/dual-looks/assets/{identity}-side.appearance.zip')
    old_poses={p['frameId']:p for p in old['poses']}
    registration=json.loads((ROOT/f'artwork/kling-side-expansion/hair/{identity}-head-registration.json').read_text())
    assert registration['sourceSha256']==ctx.source_sha256==old['sourceSha256']
    assert registration['registrationSha256']==ctx.registration_sha256==old['registrationSha256']
    registered={r['frameId']:r for r in registration['frames']}
    assert set(registered)==set(ctx.frames)==set(old_poses)
    styles,entries=bank_tools.selected_styles(old,pages,['gentle-side-v1'])
    style_id,style_name=STYLE[identity]
    style=dict(id=style_id,name=style_name,slot='hair',layers=[dict(role=role,frames=[]) for role in ['hair-back','hair-front']])
    styles.insert(0,style)
    poses=[];proof=[]
    for fid,source in ctx.frames.items():
        layers,pose,guard,backing_count=layers_and_pose(ctx,fid,donor,old_poses[fid],registered[fid])
        assert {k:v for k,v in pose.items() if k not in ['hairBounds','foreground']}=={k:v for k,v in old_poses[fid].items() if k not in ['hairBounds','foreground']}
        assert pose['foreground'][:-1]==old_poses[fid]['foreground']
        assert pose['sourceFrame']==registered[fid]['sourceFrame']==ctx.registered[fid]['sourceFrame']
        result=render(ctx,fid,layers,pose)
        face=runtime_polygon_mask(pose['facePolygon'])&(source[:,:,3]==255)
        neck=runtime_polygon_mask(guard)&(source[:,:,3]==255)
        union=np.zeros((H,W),bool)
        for layer in style['layers']:
            pixels=layers[layer['role']];owned=pixels[:,:,3]>0;union|=owned
            if not owned.any():
                layer['frames'].append(dict(frameId=fid,mode='source',reason='This pose has no visible authored hair in this layer.'))
                continue
            yy,xx=np.where(owned);x0,y0,x1,y1=int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)
            assert x0>0 and y0>0 and x1<W and y1<H, f'Clipped hair: {identity}/{fid}/{layer["role"]}'
            patch=pixels[y0:y1,x0:x1].copy();mask=np.zeros_like(patch);mask[:,:,3]=owned[y0:y1,x0:x1].astype('uint8')*255
            entry=dict(frameId=fid,mode='paint',page=0,rect=dict(x=0,y=0,width=x1-x0,height=y1-y0),offset=dict(x=x0,y=y0))
            layer['frames'].append(entry);entries.append((entry,patch,mask,style_id,layer['role']))
        changed=np.any(source!=result,axis=2)
        assert not changed[face].any(),f'Changed original face: {identity}/{fid}'
        assert not changed[neck].any(),f'Changed original neck: {identity}/{fid}'
        assert not changed[~union].any(),f'Changed pixels outside authored hair: {identity}/{fid}'
        # Diagnostic only: a legacy hand polygon can overlap the rear scalp.
        # Preserve every opaque protected pixel and report these candidates for
        # visual review instead of silently weakening hand protection.
        hands=np.zeros((H,W),bool);source_head=np.zeros((H,W),bool)
        for region in ctx.registered[fid]['protected']:
            if region['label']=='head':source_head|=runtime_polygon_mask(region['polygon'])
            else:hands|=runtime_polygon_mask(region['polygon'])
        yy,xx=np.mgrid[:H,:W]
        reference=np.stack([xx,yy,np.ones_like(xx)],axis=-1)@np.linalg.inv(np.vstack([registered[fid]['featureTransform'],[0,0,1]])).T
        rear_zone=(reference[:,:,0]>=130)&(reference[:,:,0]<=218)&(reference[:,:,1]>=320)&(reference[:,:,1]<=414)
        protected_rear=hands&source_head&rear_zone&(source[:,:,3]==255)&(layers['hair-front'][:,:,3]>128)
        ry,rx=np.where(protected_rear)
        proof.append(dict(frameId=fid,sourceFrame=pose['sourceFrame'],neckForeground=guard,partialAlphaForegroundBackingPixels=backing_count,
            faceChangedPixels=int(changed[face].sum()),neckChangedPixels=int(changed[neck].sum()),
            outsideHairChangedPixels=int(changed[~union].sum()),sourceRgbaSha256=sha(source.tobytes()),
            renderRgbaSha256=sha(result.tobytes()),headTransform=registered[fid]['headTransform'],
            featureTransform=registered[fid]['featureTransform'],hairBounds=pose['hairBounds'],
            protectedOpaqueRearScalpReviewPixels=int(protected_rear.sum()),
            protectedOpaqueRearScalpReviewCoordinates=[[int(x),int(y)] for x,y in zip(rx,ry)],
            rearCapFitWeight=REAR_CAP_WEIGHTS.get(fid,0) if identity=='male' else 0))
        poses.append(pose)
        (output/identity/'frames').mkdir(parents=True,exist_ok=True)
        Image.fromarray(result).save(output/identity/'frames'/f'{fid:04d}.png')
    manifest=copy.deepcopy(old)
    manifest.update(id=f'matched-hair-{identity}-side-v1',name=f'Kling {identity} matched side hairstyle',styles=styles,poses=poses,
        provenance='Same-style side-view hair authored from the accepted original side-part (male) or soft-bob (female) visual authority. Generated portrait skin/face/ears/neck/clothes are discarded by reviewed donor hair boundaries. Semantic rear nape and far-face locks stay hair-back. Source-bound persisted head transforms move only new hair. Female near-ear aperture uses a continuous local blend toward the feature transform so scalp refinement cannot enlarge its ear hole; both semantic layers share the same field. Front samples blocked by protected source matte with 0<alpha<255 move to hair-back only at those pixels, providing normal destination-over backing without double-alpha outer edges. Opaque source protection is unchanged; legacy hand/scalp overlaps remain explicitly documented. All original source/registration references, anchors, headBounds, facePolygon, frame mapping and timing are retained. The existing gentle-side-v1 face patches/ownership/offsets/source modes are copied losslessly. Added feature-registered neck foreground protects the actual source neck and collar; no scalp/face/body edits. Source and audit: artwork/matched-hair; review: docs/matched-hair.')
    if identity=='male':
        manifest['provenance']+=' Reviewed local continuous rear-cap displacement extends existing hair texture in native 66/67/68 and 78/79/80 only; both layers share the field, source ear/neck and crown receive zero displacement. Reference delta(-7,3), center(162,390), radii(40,38), eased weights .5/1/.5 and .275/.55/.275. The other 101 native hair poses are unchanged by this correction.'
    data,atlas_pixels=bank_tools.pack(manifest,entries)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        packed=[(np.array(Image.open(io.BytesIO(archive.read(p['file']))).convert('RGBA')),
                 np.array(Image.open(io.BytesIO(archive.read(p['maskFile']))).convert('RGBA'))) for p in manifest['pages']]
    for frame,patch,mask,_,_ in entries:
        actual,actual_mask=bank_tools.crop_entry(frame,packed)
        assert np.array_equal(actual,patch) and np.array_equal(actual_mask,mask)
    target=(ROOT/'docs/matched-hair/assets' if publish else output/'assets')/f'{identity}-side.appearance.zip'
    target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    audit=dict(character=identity,view='side',sourceSha256=ctx.source_sha256,registrationSha256=ctx.registration_sha256,
        oldBankSha256=sha(old_bytes),bankSha256=sha(data),bankId=manifest['id'],hairId=style_id,faceId='gentle-side-v1',
        bytes=len(data),frameCount=len(poses),atlasPixels=atlas_pixels,extraction=extraction,
        localEarFit=(dict(center=[201,379],radii=[72,66],fullFeatureRadius=.55,zeroFeatureRadius=1,
            transition='cubic smoothstep',inverseIterations=8,rolesShareField=True) if identity=='female' else None),
        rearCapFit=(dict(center=[162,390],radii=[40,38],referenceDisplacement=[-7,3],
            frameWeights=REAR_CAP_WEIGHTS,unchangedNativeFrames=101,earReference=MALE_EAR_REFERENCE,
            zeroDisplacementRegions=['feature-mapped original ear','feature-mapped original neck','outside reference rear-cap ellipse'],
            protectionFalloffPx=10,transition='cubic smoothstep',rolesShareField=True) if identity=='male' else None),
        protectedPartialAlphaRule='Only blocked authored hair-front samples at source 0<alpha<255 are moved to hair-back for destination-over; opaque source/protection and outer hair alpha are unchanged.',
        legacyOpaqueOverlapNote='Rear-scalp review candidates are opaque source pixels in both existing head and hand protection, within reference x130..218/y320..414, with authored hair-front alpha>128. They remain unchanged and require human anatomical review; counts are diagnostics, not permission to erase source protection.',
        existingFaceRgbaOwnershipOffsetsSourceModesExact=True,sourcePoseMetadataExceptHairBoundsAndForegroundExact=True,
        frameProof=proof)
    dump(output/f'{identity}-binding.json',audit)
    if publish:dump(ROOT/f'artwork/matched-hair/{identity}-binding.json',audit)
    print(json.dumps(dict(character=identity,bank=str(target),bytes=len(data),frames=len(poses))),flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=TMP)
    parser.add_argument('--identity',choices=['male','female','both'],default='both')
    parser.add_argument('--frames',default='0,77')
    parser.add_argument('--build-bank',action='store_true',help='Prepare all native frames and a candidate bank in --output.')
    parser.add_argument('--publish',action='store_true',help='Publish only the new matched-hair bank and audit after visual acceptance.')
    args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    for identity in (['male','female'] if args.identity=='both' else [args.identity]):
        if args.build_bank or args.publish:build_bank(identity,args.output,args.publish)
        else:preview(identity,args.output,[int(fid) for fid in args.frames.split(',')])


if __name__=='__main__':main()
