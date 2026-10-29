#!/usr/bin/env python3
"""Restore reviewed missing neckline cloth using exact accepted garment pixels.

The source-specific recipe is an authoring copy map, not a protection exception.
It never owns head/hands, changes source alpha, or touches the source skin proof.
No RGB classification or geometric fitting runs during production reproduction.
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
from kling_side_authoring import load_context, pack_garment

ROOT = Path(__file__).resolve().parents[1]
RECIPE = ROOT/'artwork/kling-side-refinement/male/neckline-cloth-copy.json'
DOC = ROOT/'docs/kling-side-refinement/male'
ASSET = ROOT/'docs/kling-side-expansion/assets/male-shirt.garment.zip'
spec = importlib.util.spec_from_file_location('male_baseline', ROOT/'scripts/refine-kling-side-male-sleeves.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
sha = lambda data: hashlib.sha256(data).hexdigest()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ASSET)
    parser.add_argument('--review', type=Path, default=DOC)
    args=parser.parse_args()
    recipe=json.loads(RECIPE.read_text())
    with zipfile.ZipFile(ROOT/recipe['baselineArchive']) as z:
        assert z.testzip() is None
        baseline=z.read(recipe['baselineEntry'])
        trousers_bytes=z.read('item-1.zip')
    assert sha(baseline)==recipe['baselineGarmentSha256']
    manifest,before=base.unpack(baseline)
    _,trousers=base.unpack(trousers_bytes)
    ctx=load_context('male',registration_path=ROOT/'artwork/kling-side-expansion/templates/male.registration.json')
    assert ctx.source_sha256==recipe['sourceSha256']==manifest['sourceSha256']
    assert ctx.registration_sha256==recipe['registrationSha256']==manifest['registrationSha256']
    after={fid:(patch.copy(),owner.copy()) for fid,(patch,owner) in before.items()}
    audit=[]
    changed_masks={}
    for record in recipe['frames']:
        fid=record['frameId'];source=ctx.frames[fid];patch,owner=before[fid]
        assert record['sourceFrame']==ctx.registered[fid]['sourceFrame']
        assert sha(source.tobytes())==record['sourceRgbaSha256']
        skin=ctx.masks(fid)['skin'];protected=ctx.protected_mask(fid)
        assert sha(skin.astype(np.uint8).tobytes())==record['sourceSkinMaskSha256']
        result,result_owner=after[fid];changed=np.zeros(owner.shape,bool)
        for x,y,sx,sy in record['copyPixels']:
            assert 0<=x<512 and 0<=y<768 and 0<=sx<512 and 0<=sy<768
            assert not changed[y,x] and not owner[y,x]
            assert not protected[y,x] and not skin[y,x]
            assert source[y,x,3]>=128
            assert owner[sy,sx] and patch[sy,sx,3]==255
            result[y,x,:3]=patch[sy,sx,:3]
            result[y,x,3]=source[y,x,3]
            result_owner[y,x]=True
            changed[y,x]=True
        assert np.array_equal(result[~changed],patch[~changed])
        assert np.array_equal(result_owner[~changed],owner[~changed])
        changed_masks[fid]=changed
        audit.append({'frameId':fid,'sourceFrame':record['sourceFrame'],
                      'copiedClothPixels':int(changed.sum()),'bounds':Image.fromarray(changed).getbbox(),
                      'protectedPixelChanges':0,'sourceSkinProofChanges':0,
                      'existingGarmentPixelsExact':True})
    args.review.mkdir(parents=True,exist_ok=True)
    provenance=manifest['provenance']+' Follow-up: explicit reviewed neckline cloth-copy map fills missing original-top ownership using existing shirt interior pixels; full head/hand protection, source skin proof, source alpha and all previously painted garment pixels remain exact. No new protection profile or registration changes. Reproduce scripts/refine-kling-side-male-neckline.py.'
    packed=pack_garment(ctx,manifest['id'],manifest['name'],'top',
                        {fid:p for fid,(p,_) in after.items()},args.output,
                        provenance,ownership={fid:o for fid,(_,o) in after.items()},painting_mode='patch')
    _,decoded=base.unpack(args.output.read_bytes())
    composites={};changed_ids=[]
    for fid,source in ctx.frames.items():
        assert np.array_equal(decoded[fid][0],after[fid][0]) and np.array_equal(decoded[fid][1],after[fid][1])
        old=base.compose(source,[trousers[fid],before[fid]])
        new=base.compose(source,[trousers[fid],decoded[fid]])
        delta=np.any(old!=new,axis=2)
        if delta.any():changed_ids.append(fid)
        assert not (delta&ctx.protected_mask(fid)).any()
        assert not (delta&ctx.masks(fid)['skin']).any()
        assert np.array_equal(old[:,:,3],new[:,:,3])
        assert np.array_equal(old[~changed_masks.get(fid,np.zeros(delta.shape,bool))],new[~changed_masks.get(fid,np.zeros(delta.shape,bool))])
        composites[fid]=(old,new)
    ids=[0,24,42,48,67,78,89,91,97,106]
    # Native and integer zoom diagnostics, not application export evidence.
    for scale in (1,2):
        sheet=Image.new('RGB',(3*180*scale,len(ids)*120*scale),'#eee8dd');d=ImageDraw.Draw(sheet)
        for i,fid in enumerate(ids):
            neck=ctx.registered[fid]['points']['neck']
            bounds=(int(neck['x'])-100,int(neck['y'])-48,int(neck['x'])+80,int(neck['y'])+52)
            for col,(label,pixels) in enumerate([('Original',ctx.frames[fid]),('Before',composites[fid][0]),('After',composites[fid][1])]):
                image=Image.fromarray(pixels).crop(bounds)
                if scale!=1:image=image.resize((180*scale,100*scale),Image.Resampling.NEAREST)
                sheet.paste(image,(col*180*scale,(i*120+20)*scale),image)
                d.text(((col*180+4)*scale,(i*120+4)*scale),f'{fid} {label} {scale}x',fill='#332a25')
        sheet.save(args.review/f'neckline-details-{scale}x.png',optimize=True)
    for fid in (0,42,67,91):
        for label,pixels in zip(('before','after'),composites[fid]):
            Image.fromarray(pixels).save(args.review/f'{label}-{fid}.png',optimize=True)
    for action in ('idle','walk','run','jump'):
        clip=ctx.animations[action];frames=[];durations=[];elapsed=0
        for index,fid in enumerate(clip['frames']):
            panel=Image.new('RGB',(512,408),'#eee8dd');d=ImageDraw.Draw(panel)
            for col,pixels in enumerate(composites[fid]):
                image=Image.fromarray(pixels).resize((256,384),Image.Resampling.LANCZOS)
                panel.paste(image,(col*256,24),image)
                d.text((col*256+6,6),f'{"Before" if col==0 else "After"} {action} {fid}',fill='#332a25')
            frames.append(panel)
            end=round((index+1)*100/clip['fps'])*10;durations.append(end-elapsed);elapsed=end
        frames[0].save(args.review/f'{action}-diagnostic.gif',save_all=True,append_images=frames[1:],duration=durations,disposal=2,**({'loop':0} if clip['loop'] else {}))
        with Image.open(args.review/f'{action}-diagnostic.gif') as gif:
            total=0
            for i in range(gif.n_frames):gif.seek(i);total+=gif.info['duration'];gif.convert('RGBA').load()
            assert total==sum(durations) and ('loop' in gif.info)==bool(clip['loop'])
    report={'format':'gathria-side-male-neckline-audit','version':1,
            'sourceSha256':ctx.source_sha256,'registrationSha256':ctx.registration_sha256,
            'baselineGarmentSha256':sha(baseline),'resultGarmentSha256':packed['sha256'],
            'recipeSha256':sha(RECIPE.read_bytes()),'frameCount':len(ctx.frames),
            'changedFrames':changed_ids,'unchangedFrames':[fid for fid in ctx.frames if fid not in changed_ids],
            'newClothPixels':sum(r['copiedClothPixels'] for r in audit),
            'allPreviouslyPaintedGarmentPixelsExact':True,'sourceAlphaExact':True,
            'fullHeadAndHandsExact':True,'sourceSkinProofExact':True,
            'registrationAndSourceUnchanged':True,'garmentVersion':1,'records':audit,
            'evidence':'Offline decoded garment diagnostics. Main review uses separately verified application downloads.',
            'limits':'Thin gray neckline bands improve. Ambiguous blurred shoulder/neck cloth in 67/91 and original armpit notches remain; protected and source-skin-proof pixels are intentionally retained. No unrestricted clothing/head release.'}
    (args.review/'audit.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({key:report[key] for key in ('resultGarmentSha256','newClothPixels','changedFrames','unchangedFrames')}))

if __name__=='__main__':main()
