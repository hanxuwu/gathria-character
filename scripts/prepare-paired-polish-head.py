#!/usr/bin/env python3
"""Review a single mistaken hand/scalp assignment, without repainting anatomy.

The source-bound female native 95 nearHand polygon extends above the real fist
and into the rear scalp. Clip its reviewed empty-space boundary, then return
only the previously clipped hair samples to their original front/back layers.
All other hair, face, pose, source and registration values remain exact.
"""
from __future__ import annotations

import argparse
import copy
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image

from kling_side_authoring import ROOT, W, H, load_context, runtime_polygon_mask, sha

spec = importlib.util.spec_from_file_location('matched_hair_authoring', ROOT / 'scripts/prepare-kling-matched-hair.py')
hair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hair)
bank_tools = hair.bank_tools
REG_PATH = ROOT / 'artwork/paired-polish/female-side.registration.json'
BANK_PATH = ROOT / 'docs/paired-polish/assets/female/side.appearance.zip'
AUDIT_PATH = ROOT / 'artwork/paired-polish/female-head-review.json'
OLD_REG = ROOT / 'artwork/kling-side-expansion/templates/female.registration.json'
OLD_BANK = ROOT / 'docs/matched-hair/assets/female-side.appearance.zip'
FID = 95
HAND_OUTLINE = [(112,335),(122,328),(140,322),(157,324),(168,328),(176,335),
                (183,344),(195,350),(198,368),(190,387),(171,395),(146,390),
                (127,378),(114,358)]


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def clip_hand(poly):
    """Reviewed line through the empty gap between scalp and fist: y >= x+160.

    This is an attribution boundary, not a drawn line or a new skin silhouette.
    Its extension outside that local gap is bounded by the old hand polygon.
    """
    result = []
    for a, b in zip(poly[-1:] + poly[:-1], poly):
        da, db = a['y']-a['x']-160, b['y']-b['x']-160
        if (da >= 0) != (db >= 0):
            t = da/(da-db)
            result.append({k: round(a[k]+t*(b[k]-a[k]), 6) for k in ['x','y']})
        if db >= 0:
            result.append(copy.deepcopy(b))
    return result


def layers_for(manifest, pages, fid):
    result = {}
    for layer in manifest['styles'][0]['layers']:
        entry = next(f for f in layer['frames'] if f['frameId'] == fid)
        canvas = np.zeros((H,W,4), np.uint8)
        if entry['mode'] == 'paint':
            patch, mask = bank_tools.crop_entry(entry,pages)
            patch[mask[:,:,3] != 255] = 0
            x,y = entry['offset']['x'],entry['offset']['y']
            height,width = patch.shape[:2]
            canvas[y:y+height,x:x+width] = patch
        result[layer['role']] = canvas
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    parser.add_argument('--output',type=Path,default=Path('/tmp/paired-polish/head'))
    args=parser.parse_args(); args.output.mkdir(parents=True,exist_ok=True)
    ctx=load_context('female',registration_path=OLD_REG)
    assert ctx.registration_sha256 == '7f49437c617e01141622e1ca3d463347edf51adce068a344c01d545e58567cef'
    old_bytes,old,pages=bank_tools.load_bank(OLD_BANK)
    assert sha(old_bytes) == '8b394def4ea02f97e72b1a2f1248af496cf1025e6566c8689913b93a74541e62'
    new_reg=copy.deepcopy(ctx.registration)
    row=next(f for f in new_reg['frames'] if f['frameId']==FID)
    hand=next(r for r in row['protected'] if r['label']=='nearHand')
    old_polygon=copy.deepcopy(hand['polygon']);hand['polygon']=clip_hand(old_polygon)
    before_mask=runtime_polygon_mask(old_polygon);after_mask=runtime_polygon_mask(hand['polygon'])
    assert not (after_mask & ~before_mask).any()
    released=before_mask & ~after_mask
    for a,b in zip(ctx.registration['frames'],new_reg['frames']):
        if a['frameId'] != FID:
            assert a==b
        else:
            assert {k:v for k,v in a.items() if k!='protected'}=={k:v for k,v in b.items() if k!='protected'}
            for ar,br in zip(a['protected'],b['protected']):
                if ar['label']!='nearHand':assert ar==br
    # The strict runtime caps registration metadata at 1 MiB. Pretty printing
    # dense source contours exceeded that cap although the semantics were valid.
    # Keep the portable registration compact and the human audit readable.
    reg_bytes=(json.dumps(new_reg,ensure_ascii=False,separators=(',',':'))+'\n').encode()
    assert len(reg_bytes)<=1024*1024,'Registration exceeds the unchanged runtime 1 MiB cap'
    poses={p['frameId']:p for p in old['poses']}
    old_layers=layers_for(old,pages,FID)
    before=hair.render(ctx,FID,old_layers,poses[FID])
    # Only this independent context changes. The checked-in baseline is intact.
    ctx.registration=new_reg;ctx.registration_bytes=reg_bytes
    ctx.registered={r['frameId']:r for r in new_reg['frames']}
    donor,_=hair.extract_donor('female',args.output/'donors')
    _,earlier,_=bank_tools.load_bank(ROOT/'docs/dual-looks/assets/female-side.appearance.zip')
    original_pose=next(p for p in earlier['poses'] if p['frameId']==FID)
    native_registration=json.loads((ROOT/'artwork/kling-side-expansion/hair/female-head-registration.json').read_bytes())
    native_row=next(r for r in native_registration['frames'] if r['frameId']==FID)
    authored,pose,_,_=hair.layers_and_pose(ctx,FID,donor,original_pose,native_row)
    assert pose==poses[FID]
    new_layers={role:pixels.copy() for role,pixels in old_layers.items()}
    for role in new_layers:
        new_layers[role][released]=authored[role][released]
    after=hair.render(ctx,FID,new_layers,poses[FID])
    changed=np.any(before!=after,axis=2)
    assert not changed[~released].any()
    source=ctx.frames[FID]
    hand_review=[dict(x=x,y=y) for x,y in HAND_OUTLINE]
    hand_mask=runtime_polygon_mask(hand_review)&(source[:,:,3]>0)
    face_mask=runtime_polygon_mask(poses[FID]['facePolygon'])&(source[:,:,3]>0)
    neck_mask=runtime_polygon_mask(poses[FID]['foreground'][-1])&(source[:,:,3]>0)
    for mask in [hand_mask,face_mask,neck_mask]:
        assert not changed[mask].any()
    # Existing compositing includes source-alpha edge coverage from the hair
    # behind the fist. Preserve it exactly; compare opaque hand INTERIOR to
    # raw source separately instead of claiming those edge composites are raw.
    hand_interior=hand_mask & (hair.cv2.erode((source[:,:,3]==255).astype('uint8'),np.ones((3,3),'uint8'))>0)
    assert np.array_equal(before[hand_interior],source[hand_interior])
    assert np.array_equal(after[hand_interior],source[hand_interior])
    styles,entries=bank_tools.selected_styles(old,pages,[s['id'] for s in old['styles']])
    patch_changes=[]
    for entry,rgba,ownership,style_id,role in entries:
        if entry['frameId']!=FID or role=='face':continue
        x,y=entry['offset']['x'],entry['offset']['y'];height,width=rgba.shape[:2]
        candidate=new_layers[role][y:y+height,x:x+width]
        covered=np.zeros((H,W),bool);covered[y:y+height,x:x+width]=True
        assert not (new_layers[role][:,:,3]>0)[~covered].any()
        old_rgba=rgba.copy();old_ownership=ownership.copy()
        rgba[:]=candidate
        ownership[:]=0;ownership[:,:,3]=(candidate[:,:,3]>0).astype('uint8')*255
        patch_changes.append(dict(frameId=FID,role=role,
            changedRgbaPixels=int(np.any(old_rgba!=rgba,axis=2).sum()),
            changedOwnershipPixels=int(np.any(old_ownership!=ownership,axis=2).sum())))
    manifest=copy.deepcopy(old)
    manifest.update(id='polished-hair-female-side-v1',name='Kling female matched side hairstyle · reviewed hand occlusion',
                    registrationSha256=sha(reg_bytes),styles=styles,
                    provenance=old['provenance']+' Paired-polish revision: native95 nearHand polygon is clipped only at its reviewed empty-space boundary above the real fist (y>=x+160), removing a false scalp assignment. Released hair samples return to their original semantic front/back roles; no new artwork or anatomy is generated. The other101 native hair poses, all102 face entries (92 painted patches and10 source fallbacks), pose metadata and source pixels remain exact. Audit: artwork/paired-polish/female-head-review.json.')
    data,atlas_pixels=bank_tools.pack(manifest,entries)
    output=args.output/'candidate.appearance.zip';output.write_bytes(data)
    _,packed,new_pages=bank_tools.load_bank(output)
    assert packed['poses']==old['poses']
    exact_faces=exact_hair=0
    for old_style,new_style in zip(old['styles'],packed['styles']):
        assert {k:v for k,v in old_style.items() if k!='layers'}=={k:v for k,v in new_style.items() if k!='layers'}
        for old_layer,new_layer in zip(old_style['layers'],new_style['layers']):
            assert old_layer['role']==new_layer['role']
            for a,b in zip(old_layer['frames'],new_layer['frames']):
                assert {k:v for k,v in a.items() if k not in ['page','rect']}=={k:v for k,v in b.items() if k not in ['page','rect']}
                if a['mode']=='paint':
                    p,pm=bank_tools.crop_entry(a,pages);q,qm=bank_tools.crop_entry(b,new_pages)
                    if a['frameId']!=FID or old_layer['role']=='face':
                        assert np.array_equal(p,q) and np.array_equal(pm,qm)
                    if old_layer['role']=='face':exact_faces+=1
                    elif a['frameId']!=FID:exact_hair+=1
    assert np.array_equal(after,hair.render(ctx,FID,layers_for(packed,new_pages,FID),poses[FID]))
    yy,xx=np.where(changed)
    audit=dict(character='female',view='side',frameId=FID,sourceSha256=ctx.source_sha256,
        previousRegistrationSha256=old['registrationSha256'],registrationSha256=sha(reg_bytes),
        previousBankSha256=sha(old_bytes),bankSha256=sha(data),bankId=manifest['id'],
        bankBytes=len(data),atlasPixels=atlas_pixels,
        registrationUrl='/artwork/paired-polish/female-side.registration.json',
        bankUrl='/docs/paired-polish/assets/female/side.appearance.zip',
        sameSourceFramesTimingAndAnchors=True,sameHeadProtection=True,sameAppearancePoses=True,
        sameFaceRgbaOwnershipOffsetsAndFallbacks=True,exactFacePaintEntries=exact_faces,
        unchangedHairNativeFrames=101,exactOtherHairPaintEntries=exact_hair,
        changedRegistration=[dict(frameId=FID,label='nearHand',before=old_polygon,after=hand['polygon'],
            boundary='The old polygon intersected with y >= x+160; this line lies in the actual empty source gap above the near fist, not across the fist.',
            releasedMaskPixels=int(released.sum()),releasedSourceOpaquePixels=int((released&(source[:,:,3]==255)).sum()),
            releasedSourcePartialPixels=int((released&(source[:,:,3]>0)&(source[:,:,3]<255)).sum()))],
        changedAppearanceLayers=patch_changes,changedForegroundPoseEntries=[],
        compositeChangedPixels=int(changed.sum()),compositeChangedBounds=[int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)],
        changedFacePixels=int(changed[face_mask].sum()),changedNeckPixels=int(changed[neck_mask].sum()),
        reviewedNearHandPolygon=hand_review,reviewedNearHandSourcePixels=int(hand_mask.sum()),
        changedReviewedHandPixels=int(changed[hand_mask].sum()),reviewedHandEqualsPriorRender=True,
        reviewedHandOpaqueInteriorPixels=int(hand_interior.sum()),reviewedOpaqueHandInteriorEqualsSource=True,
        oldHandPixelSha256=sha(before[hand_mask].tobytes()),newHandPixelSha256=sha(after[hand_mask].tobytes()),
        beforeRenderSha256=sha(before.tobytes()),afterRenderSha256=sha(after.tobytes()),
        note='Offline authoring proof, not an application export. Actual application GIF/PNG/CharacterPack review is separate. Existing source ear, face, neck, green-matte artifacts and frame rhythm remain unchanged.')
    for path,content in [(REG_PATH,reg_bytes),(BANK_PATH,data),(AUDIT_PATH,json_bytes(audit))]:
        if args.check:assert path.read_bytes()==content,f'Reproduction mismatch: {path}'
        else:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(content)
    for name,pixels in [('source',source),('before',before),('after',after)]:
        Image.fromarray(pixels).save(args.output/f'female95-{name}.png')
    print(json.dumps({k:audit[k] for k in ['registrationSha256','bankSha256','bankBytes','compositeChangedPixels','changedReviewedHandPixels']},indent=2))


if __name__=='__main__':main()
