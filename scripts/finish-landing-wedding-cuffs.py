#!/usr/bin/env python3
"""Fit an explicitly painted curved cuff to reviewed raised-arm poses.

Only cloth RGB and the reviewed near-wrist ownership change. This is an
authoring operation; source frames, registered geometry, motion and other
garments are immutable. All generated anatomy/background is discarded.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
from scipy.interpolate import RBFInterpolator
from kling_side_authoring import load_context, pack_garment, runtime_polygon_mask

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'artwork/kling-landing-production/cuff-finish'
W,H = 512,768
YY,XX = np.indices((H,W),dtype=float)

def sha(data): return hashlib.sha256(data).hexdigest()
def poly_mask(poly, size=(W,H)):
    im=Image.new('L',size); ImageDraw.Draw(im).polygon(poly,fill=255)
    return np.asarray(im)>0

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--output',type=Path,default=Path('/tmp/wardrobe-finish/male/render'));ap.add_argument('--publish',action='store_true');ap.add_argument('--check',action='store_true');args=ap.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    recipe=json.loads((ART/'recipe.json').read_text())
    baseline=ART/'baseline-top.garment.zip';assert sha(baseline.read_bytes())==recipe['baselineSha256']
    donor=np.asarray(Image.open(ART/'painted-cuff-donor.png').convert('RGBA'))
    assert sha((ART/'painted-cuff-donor.png').read_bytes())==recipe['donorSha256']
    spec=importlib.util.spec_from_file_location('wedding_cuff_finish',ROOT/'scripts/prepare-landing-side-wedding.py');wedding=importlib.util.module_from_spec(spec);spec.loader.exec_module(wedding)
    ctx=load_context('male',registration_path=ROOT/'artwork/kling-side-expansion/templates/male.registration.json')
    assert ctx.source_sha256==recipe['sourceSha256'] and ctx.registration_sha256==recipe['registrationSha256']
    manifest,before=wedding.unpack_bank(baseline)
    after={fid:(p.copy(),m.copy()) for fid,(p,m) in before.items()}
    reviews={(r['frameId'],r['label']):dict(r) for r in manifest['handProtectionReviews']}
    valid=poly_mask(recipe['donorTrace'],(donor.shape[1],donor.shape[0]))
    r,g,b=donor[:,:,:3].astype(float).transpose(2,0,1)
    # Exclude both bright generated skin and its dark brown outline at the
    # hand/cuff boundary. Ivory cloth and cool navy ink remain eligible.
    warm=((r>140)&(r-g>35)&(r-b>45))|((r<140)&(r-g>12)&(r-b>20))
    valid &= ~warm & (donor[:,:,3]>128)
    assert valid.sum()>5000
    _,nearest=nd.distance_transform_edt(~valid,return_indices=True)
    tex=donor[:,:,:3][tuple(nearest)].astype(float)
    tex=nd.gaussian_filter(tex,sigma=(.45,.45,0))
    records=[]
    for row in recipe['poses']:
        fid=row['frameId']; label=row.get('handLabel','nearHand'); source=ctx.frames[fid]; old,old_owned=before[fid]
        patch,owned=after[fid]
        polygon=[{'x':x,'y':y} for x,y in row['retainedHandPolygon']]
        original=next(x for x in ctx.registered[fid]['protected'] if x['label']==label)
        retained=runtime_polygon_mask(polygon)
        observed_hand=runtime_polygon_mask([{'x':x,'y':y} for x,y in row['observedHandContour']])
        original_mask=runtime_polygon_mask(original['polygon'])
        assert retained.any() and not (retained&~original_mask).any(), (fid,'hand review must be a subset')
        reviews[(fid,label)]={'frameId':fid,'label':label,'polygon':polygon,'reason':'Native-source wrist contour and complete fist were visually reviewed against the painted curved cuff. This item alone restores source hand pixels at the old straight seam and covers the visible proximal forearm. See artwork/kling-landing-production/cuff-finish/recipe.json.'}
        protection=np.zeros((H,W),bool)
        for region in ctx.registered[fid]['protected']:
            record=reviews.get((fid,region['label']),region)
            protection |= runtime_polygon_mask(record['polygon'])
        protection &= source[:,:,3]>0
        roi=poly_mask(row['clothDomain']) & (source[:,:,3]>0)
        # The domain is a manually observed visible arm, not an inferred joint
        # capsule. Other body/clothing and the original outer alpha stay exact.
        domain=roi & ~protection & ~observed_hand
        restore=(observed_hand|retained) & old_owned
        hand_or_ink=warm_source(source)|(source[:,:,:3].max(axis=2)<135)|(source[:,:,3]<16)
        assert not (restore & ~hand_or_ink).any(),(fid,'restoration must be original hand/skin/outline',[(int(x),int(y),source[y,x].tolist()) for y,x in np.column_stack(np.where(restore&~hand_or_ink))][:20])
        owned[restore]=False;patch[restore]=0
        coords=RBFInterpolator(np.asarray(row['sourceControls'][:5],float),np.asarray(recipe['donorControls'][:5],float),kernel='thin_plate_spline',smoothing=.05)(np.column_stack((XX.ravel(),YY.ravel()))).reshape(H,W,2)
        rgb=np.stack([nd.map_coordinates(tex[:,:,i],[coords[:,:,1],coords[:,:,0]],order=1,mode='nearest') for i in range(3)],axis=-1)
        # Blend only the garment-side shoulder junction into existing cloth;
        # the visible wrist receives the actual painted cuff and fold pixels.
        shoulder=np.asarray(row['sourceControls'][3:5],float).mean(axis=0)
        wrist=np.asarray(row['sourceControls'][:3],float).mean(axis=0)
        axis=shoulder-wrist; phase=((XX-wrist[0])*axis[0]+(YY-wrist[1])*axis[1])/np.dot(axis,axis)
        weight=1-np.clip((phase-.68)/.5,0,1)
        weight=np.where(old_owned,weight,1)
        color=rgb*weight[:,:,None]+old[:,:,:3]*(1-weight[:,:,None])
        patch[domain,:3]=np.rint(np.clip(color[domain],0,255)).astype(np.uint8)
        patch[domain,3]=np.where(old_owned,old[:,:,3],source[:,:,3])[domain]
        owned |= domain
        changed=domain|restore
        assert np.array_equal(patch[~changed],old[~changed])
        assert np.array_equal(owned[~changed],old_owned[~changed])
        assert not (owned&protection).any(),(fid,'protection overlap',np.column_stack(np.where(owned&protection)).tolist())
        assert not patch[~owned].any()
        composite=source.copy();composite[owned]=patch[owned]
        assert np.array_equal(composite[protection],source[protection])
        assert np.array_equal(composite[observed_hand],source[observed_hand])
        before_composite=source.copy();before_composite[old_owned]=old[old_owned]
        Image.fromarray(before_composite).save(args.output/f'before-{fid}.png')
        Image.fromarray(composite).save(args.output/f'after-{fid}.png')
        Image.fromarray((domain.astype(np.uint8)*255)).save(args.output/f'domain-{fid}.png')
        records.append({'frameId':fid,'changedRgbaPixels':int(np.any(composite!=before_composite,axis=2).sum()),'newClothPixels':int((owned&~old_owned).sum()),'restoredHandPixels':int(restore.sum()),'sourceSha256':sha(source.tobytes()),'outsideDomainExact':True,'protectedSourceExact':True,'afterNativeRgbaSha256':sha(composite.tobytes())})
    torso_records=[]
    for row in recipe.get('torsoFits',[]):
        fid=row['frameId']; source=ctx.frames[fid];patch,owned=after[fid]
        old=patch.copy(); old_owned=owned.copy()
        phase=np.clip((YY-row['neckY'])/(row['waistY']-row['neckY']),0,1)
        torso=ctx.masks(fid)['top']&owned
        r,g,b=old[:,:,:3].astype(float).transpose(2,0,1)
        ivory=torso&(r>150)&(g>135)&(b>105)&(r-b>8)&(abs(r-g)<35)&(phase>.15)
        ys=np.where(ivory.any(axis=1))[0];assert len(ys)>15,(fid,'Missing painted waistcoat panel')
        center=np.interp(np.arange(H),ys,[np.median(np.where(ivory[y])[0]) for y in ys])[:,None]
        dx=row['clothOffset']*phase**1.5*np.clip(1-abs(XX-center)/46,0,1)
        domain=torso&(phase>.18)&(abs(XX-center)<46)
        # Refit the already painted front panel in cloth coordinates. The
        # small source-visible panel correction tapers over adjoining poses;
        # silhouette, ownership, alpha and body geometry are never warped.
        _,nearest=nd.distance_transform_edt(~owned,return_indices=True)
        texture=old[:,:,:3][tuple(nearest)].astype(float)
        rgb=np.stack([nd.map_coordinates(texture[:,:,c],[YY,XX-dx],order=1,mode='nearest') for c in range(3)],axis=-1)
        weight=np.clip(nd.distance_transform_edt(torso)/5,0,1)
        fitted=rgb*weight[:,:,None]+old[:,:,:3]*(1-weight[:,:,None])
        patch[domain,:3]=np.rint(np.clip(fitted[domain],0,255)).astype(np.uint8)
        assert np.array_equal(patch[~domain],old[~domain])
        assert np.array_equal(patch[:,:,3],old[:,:,3]) and np.array_equal(owned,old_owned)
        torso_records.append({'frameId':fid,'maximumClothUvOffset':row['clothOffset'],'domainPixels':int(domain.sum()),'ownershipAndAlphaExact':True,'outsideTorsoDomainExact':True,'domainSha256':sha(domain.tobytes())})
        composite=source.copy();composite[owned]=patch[owned]
        base_patch,base_owned=before[fid];baseline_frame=source.copy();baseline_frame[base_owned]=base_patch[base_owned]
        Image.fromarray(baseline_frame).save(args.output/f'before-{fid}.png')
        Image.fromarray(composite).save(args.output/f'after-{fid}.png')
        record=next((r for r in records if r['frameId']==fid),None)
        if record is None:
            record={'frameId':fid,'newClothPixels':0,'restoredHandPixels':0,'sourceSha256':sha(source.tobytes()),'outsideDomainExact':True,'protectedSourceExact':True}
            records.append(record)
        record.update(changedRgbaPixels=int(np.any(composite!=baseline_frame,axis=2).sum()),afterNativeRgbaSha256=sha(composite.tobytes()))
    def scoped(fid):
        out=np.zeros((H,W),bool)
        for region in ctx.registered[fid]['protected']:
            out |= runtime_polygon_mask(reviews.get((fid,region['label']),region)['polygon'])
        return out & (ctx.frames[fid][:,:,3]>0)
    ctx.protected_mask=scoped
    target=args.output/'male-wedding-top.garment.zip'
    provenance=manifest['provenance']+' Curved cuff finish: cloth-only donor replaces reviewed arm seams; exact source fists restored. The compressed waistcoat front is refitted only in cloth RGB, tapering 0/3/7/12/7/3/0px across adjacent poses; alpha/ownership/body/motion unchanged. See artwork/kling-landing-production/cuff-finish/recipe.json.'
    pack_garment(ctx,manifest['id'],manifest['name'],'top',{fid:p for fid,(p,m) in after.items()},target,provenance,ownership={fid:m for fid,(p,m) in after.items()},painting_mode='patch')
    with zipfile.ZipFile(target) as z:files={n:z.read(n) for n in z.namelist()}
    final=json.loads(files['manifest.json']);final.update(version=2,handProtectionReviews=[reviews[k] for k in sorted(reviews)])
    files['manifest.json']=(json.dumps(final,separators=(',',':'))+'\n').encode()
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name,data in sorted(files.items()):
            zi=zipfile.ZipInfo(name,(2026,1,1,0,0,0));zi.compress_type=zipfile.ZIP_DEFLATED;z.writestr(zi,data)
    published=ROOT/'artwork/kling-landing-production/wedding/bases/male-wedding-top.garment.zip'
    if args.check:assert target.read_bytes()==published.read_bytes(),'Current cuff asset is stale'
    if args.publish:published.write_bytes(target.read_bytes())
    changed_ids={r['frameId'] for r in records}
    for fid in before:
        if fid not in changed_ids:
            assert np.array_equal(before[fid][0],after[fid][0])
            assert np.array_equal(before[fid][1],after[fid][1])
    prior=json.loads((ROOT/'artwork/kling-landing-production/coverage/reviewed-cuffs.json').read_text())
    targets=[(e['frameId'],x,y) for e in prior['sourceClothCopies'] for x,y in e['pixels']]
    assert all(after[fid][1][y,x] for fid,x,y in targets),'Previously closed tank-cloth gap reopened'
    amounts={row['frameId']:row['clothOffset'] for row in recipe.get('torsoFits',[])}
    maximum_step=max(abs(amounts.get(fid,0)-amounts.get(fid-1,0)) for fid in range(1,107)) if amounts else 0
    assert maximum_step<=5,'Abrupt cloth correction at a neighboring pose'
    report={'format':'gathria-wedding-curved-cuff-finish','version':1,'baselineSha256':recipe['baselineSha256'],'donorSha256':recipe['donorSha256'],'sourceSha256':ctx.source_sha256,'registrationSha256':ctx.registration_sha256,'resultSha256':sha(target.read_bytes()),'changedFrameIds':sorted(changed_ids),'unchangedFrames':len(before)-len(records),'sourceAndRegistrationUnchanged':True,'previousSourceClothTargetsStillCovered':len(targets),'maximumNeighborClothUvCorrectionStep':maximum_step,'torsoFits':torso_records,'records':sorted(records,key=lambda r:r['frameId']),'visualAcceptance':'candidate-review'}
    (args.output/'audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))

def warm_source(source):
    r,g,b=source[:,:,:3].astype(float).transpose(2,0,1)
    return (r>90)&(r-g>12)&(r-b>20)

if __name__=='__main__':main()
