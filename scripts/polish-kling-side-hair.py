#!/usr/bin/env python3
"""Apply a source-pinned, idempotent rear-hair fit; never repaint the source.

The accepted PR53 bank supplies all unchanged atlas data. The persisted original
frame67 painted hair supplies the one local correction, so rerunning cannot
compound the deformation. Unrelated atlas content is checked before publication.
"""
from __future__ import annotations
import importlib.util
import io
import json
from pathlib import Path
import zipfile

import cv2
import numpy as np
from PIL import Image, ImageDraw
from kling_side_authoring import ROOT, W, H, load_context, sha, encode_rgba, runtime_polygon_mask

ART = ROOT / 'artwork/kling-side-polish/hair'
DOC = ROOT / 'docs/kling-side-polish/hair'
TMP = Path('/tmp/side-polish/hair')
spec = importlib.util.spec_from_file_location('hair_prepare', ROOT / 'scripts/prepare-kling-side-hair.py')
hair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hair)


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n')


def native_layers(manifest, pages, fid):
    result = {}
    for layer in manifest['styles'][0]['layers']:
        f = next(f for f in layer['frames'] if f['frameId'] == fid)
        pixels = np.zeros((H, W, 4), 'uint8')
        if f['mode'] == 'paint':
            r, o = f['rect'], f['offset']
            pixels[o['y']:o['y']+r['height'], o['x']:o['x']+r['width']] = pages[f['page']][r['y']:r['y']+r['height'], r['x']:r['x']+r['width']]
        result[layer['role']] = pixels
    return result


def rear_fit(original, recipe):
    yy, xx = np.mgrid[:H, :W].astype('float32')
    up = np.clip((yy-recipe['yStart'])/recipe['yRamp'], 0, 1)
    down = np.clip((recipe['yEnd']-yy)/recipe['yRamp'], 0, 1)
    weight = up*up*(3-2*up) * down*down*(3-2*down)
    dx = np.zeros_like(xx)
    for y in range(recipe['yStart'], recipe['yEnd']):
        xs = np.where(original[y, :, 3] >= 128)[0]
        xs = xs[xs < recipe['rightLimit']]
        if len(xs) < 5:
            continue
        segments = np.split(xs, np.where(np.diff(xs)>1)[0]+1)
        segment = max(segments, key=len)
        left, right = float(segment[0]), float(segment[-1])
        if right-left < 6:
            continue
        move = min(recipe['maxDisplacementPx']*float(weight[y, 0]), (right-left)*recipe['maxStretchFraction'])
        start = left-move
        affected = (xx[y]>=start)&(xx[y]<=right)
        dx[y, affected] = left+(xx[y, affected]-start)*(right-left)/(right-start)-xx[y, affected]
    # Premultiplication prevents hidden transparent RGB contaminating the edge.
    f = original.astype('float32')/255
    f[:, :, :3] *= f[:, :, 3:4]
    corrected = cv2.remap(f, xx+dx, yy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    alpha = corrected[:, :, 3:4]
    corrected[:, :, :3] = np.divide(corrected[:, :, :3], alpha, out=np.zeros_like(corrected[:, :, :3]), where=alpha>0)
    corrected = np.rint(np.clip(corrected, 0, 1)*255).astype('uint8')
    # Unmapped pixels stay byte exact, including invisible RGB.
    corrected[dx==0] = original[dx==0]
    return corrected


def main():
    DOC.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)
    recipe = json.loads((ART/'male-67-fit.json').read_text())
    target = ROOT/'docs/kling-side-expansion/assets/male.appearance.zip'
    before_bytes = target.read_bytes()
    with zipfile.ZipFile(io.BytesIO(before_bytes)) as z:
        files = {name:z.read(name) for name in z.namelist()}
    manifest = json.loads(files['manifest.json'])
    assert manifest['sourceSha256'] == recipe['sourceSha256']
    ctx = load_context('male', registration_path=ROOT/'artwork/kling-side-expansion/templates/male.registration.json')
    pages = [np.array(Image.open(io.BytesIO(files[p['file']])).convert('RGBA')) for p in manifest['pages']]
    native = {fid:native_layers(manifest, pages, fid) for fid in ctx.frames}
    fid = recipe['frameId']
    original = np.array(Image.open(ART/'male-67-original-hair.png').convert('RGBA'))
    expected = {(r['frameId'],r['role']):r['sha256'] for r in recipe['layerRgba']}
    assert sha(original.tobytes()) == expected[fid, recipe['role']]
    for frame_id, layers in native.items():
        for role, pixels in layers.items():
            if (frame_id, role) != (fid, recipe['role']):
                assert sha(pixels.tobytes()) == expected[frame_id, role], f'Unreviewed unrelated hair changed: {frame_id}/{role}'
    corrected = rear_fit(original, recipe)
    native[fid][recipe['role']] = corrected
    # Repack from exact native RGBA so the rear extension has real atlas space.
    # Existing poses and all 106 unrelated native hair frames stay unchanged.
    union=np.logical_or.reduce([part[:,:,3]>0 for part in native[fid].values()])
    manifest['poses'][fid]['hairBounds']=hair.rect_mask(union)
    hair.build_bank(ctx,manifest['poses'],native)
    with zipfile.ZipFile(target) as z:
        files={name:z.read(name) for name in z.namelist()}
    manifest=json.loads(files['manifest.json'])
    manifest['provenance'] += ' Local source-frame210 rear-hair strip fit: original painted hair resampled with fixed ear-side boundaries; no source pixels warped. Reproduction: scripts/polish-kling-side-hair.py.'
    files['manifest.json']=(json.dumps(manifest,indent=2)+'\n').encode()
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for name,data in sorted(files.items()):
            info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
    audit=[];face_proof=[];boundary_proof=[]
    for frame_id in ctx.frames:
        pose=manifest['poses'][frame_id]
        result=hair.render(ctx,frame_id,native[frame_id],pose)
        baseline_layers={k:v.copy() for k,v in native[frame_id].items()}
        if frame_id==fid:baseline_layers[recipe['role']]=original
        baseline=hair.render(ctx,frame_id,baseline_layers,pose)
        source=ctx.frames[frame_id]
        core=runtime_polygon_mask(pose['facePolygon'])&(source[:,:,3]==255)
        foreground=np.zeros((H,W),bool)
        for region in ctx.registered[frame_id]['protected']:
            if region['label']!='head':foreground|=runtime_polygon_mask(region['polygon'])
        for polygon in pose['foreground']:foreground|=runtime_polygon_mask(polygon)
        foreground &=source[:,:,3]==255
        owned=np.logical_or.reduce([p[:,:,3]>0 for p in native[frame_id].values()])
        change=np.any(result!=source,axis=2)
        assert not np.any(change&core)
        assert not np.any(change&foreground)
        assert not np.any(change&~owned)
        delta=int(np.any(result!=baseline,axis=2).sum())
        if frame_id!=fid:assert delta==0
        yy,xx=np.where(owned)
        audit.append(dict(frameId=frame_id,sourceFrame=ctx.registered[frame_id]['sourceFrame'],changedAgainstBaselinePixels=delta,
          originalFaceCoreChangedPixels=0,originalForegroundChangedPixels=0,outsideAuthoredHairChangedPixels=0,
          sourceRgbaSha256=sha(source.tobytes()),renderRgbaSha256=sha(result.tobytes()),minimumEdgeClearance=int(min(xx.min(),yy.min(),W-1-xx.max(),H-1-yy.max()))))
        face_proof.append(dict(frameId=frame_id,facialCorePolygon=pose['facePolygon'],opaqueSourcePixels=int(core.sum()),
          sourceRgbaSha256=sha(source[core].tobytes()),renderRgbaSha256=sha(result[core].tobytes()),changedRgbaPixels=0,
          originalForegroundOpaquePixels=int(foreground.sum()),changedForegroundRgbaPixels=0))
        boundary_proof.append(dict(frameId=frame_id,sourceFrame=ctx.registered[frame_id]['sourceFrame'],hairBounds=pose['hairBounds'],
          authoredHairPixels=int(owned.sum()),changedRgbaPixels=int(change.sum()),outsideHairChangedRgbaPixels=0,
          nativeCanvasEdgeClearance=dict(left=int(xx.min()),top=int(yy.min()),right=int(W-1-xx.max()),bottom=int(H-1-yy.max())),
          originalFrameRgbaSha256=sha(source.tobytes()),renderFrameRgbaSha256=sha(result.tobytes()),
          originalOutsideHairRgbaSha256=sha(source[~owned].tobytes()),renderOutsideHairRgbaSha256=sha(result[~owned].tobytes())))
        Image.fromarray(result).save(TMP/f'male-final-{frame_id:04d}.png')
        if frame_id==fid:
            Image.fromarray(baseline).save(TMP/'male-67-before.png')
            Image.fromarray(result).save(TMP/'male-67-after.png')
    for filename,frames in [('face-preservation.json',face_proof),('boundary-preservation.json',boundary_proof)]:
        path=ROOT/'docs/kling-side-expansion/hair/male'/filename
        previous=json.loads(path.read_text())
        previous.update(registrationSha256=ctx.registration_sha256,frames=frames)
        dump(path,previous)
    finalsha=sha(target.read_bytes())
    dump(DOC/'male-fit-audit.json',dict(sourceSha256=ctx.source_sha256,registrationSha256=ctx.registration_sha256,
      baselineBankSha256=recipe['baselineBankSha256'],bankSha256=finalsha,recipeSha256=sha((ART/'male-67-fit.json').read_bytes()),
      originalHairSha256=sha(original.tobytes()),correctedHairSha256=sha(corrected.tobytes()),frames=audit,
      method=recipe['method'],opencvVersion=cv2.__version__,maximumRearDisplacementPx=recipe['maxDisplacementPx'],
      unchangedNativeHairFrameCount=len(audit)-1,sourcePixelsWarped=0))
    # Rebind existing reviewed head transforms; a hand correction does not rerun fitting.
    headpath=ROOT/'artwork/kling-side-expansion/hair/male-head-registration.json'
    head=json.loads(headpath.read_text());head['registrationSha256']=ctx.registration_sha256;dump(headpath,head)
    bank_audit=ROOT/'docs/kling-side-expansion/hair/male-audit.json'
    a=json.loads(bank_audit.read_text());a.update(bankSha256=finalsha,registrationSha256=ctx.registration_sha256,bytes=target.stat().st_size);dump(bank_audit,a)
    print(json.dumps({'bankSha256':finalsha,'registrationSha256':ctx.registration_sha256,'unchangedNativeHairFrames':len(audit)-1,'changedPixels':audit[fid]['changedAgainstBaselinePixels']}))


if __name__=='__main__':main()
