#!/usr/bin/env python3
"""Refine source-bound skirt ownership and jump fit without regenerating blouse.

The immutable PR53 bank supplies every untouched pose. Complete existing painted
pleats are sampled for jump; no anatomy, video timing or registration is changed.
Review pictures are offline garment diagnostics, not browser export evidence.
"""
from __future__ import annotations
import argparse
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import zipfile

import numpy as np
from PIL import Image, ImageDraw
from kling_side_authoring import ROOT, sha, pack_garment

BASELINE = '220ea2fd7588c1fe784c8454d66469d60fba096a'
ASSET = 'docs/kling-side-expansion/assets/female-skirt.garment.zip'
DOC = ROOT/'docs/kling-side-fitting/skirt'
spec = importlib.util.spec_from_file_location('female_fit', ROOT/'scripts/prepare-kling-side-female-clothing.py')
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)


def from_git(path):
    return subprocess.run(['git','show',f'{BASELINE}:{path}'],cwd=ROOT,check=True,stdout=subprocess.PIPE).stdout


def unpack(ctx, data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert z.testzip() is None
        m=json.loads(z.read('manifest.json'))
        assert m['sourceSha256']==ctx.source_sha256 and m['registrationSha256']==ctx.registration_sha256
        pages=[np.array(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA')) for p in m['pages']]
        masks=[np.array(Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA'))[:,:,3]>0 for p in m['pages']]
        out={}
        for e in m['frames']:
            r=e['rect'];x,y,w,h=[r[k] for k in ['x','y','width','height']];a,b=e['offset']['x'],e['offset']['y']
            v=ctx.frames[e['frameId']].copy();owned=masks[e['page']][y:y+h,x:x+w]
            v[b:b+h,a:a+w][owned]=pages[e['page']][y:y+h,x:x+w][owned];out[e['frameId']]=v
        assert set(out)==set(ctx.frames)
        return out


def combine(ctx,bottom,top):
    result={}
    for fid in ctx.frames:
        p=bottom[fid].copy();changed=np.any(top[fid]!=ctx.frames[fid],axis=2);p[changed]=top[fid][changed];result[fid]=p
    return result


def gif(before,after,clip,path):
    pictures=[]
    for fid in clip['frames']:
        p=Image.new('RGB',(512,412),(235,231,220));d=ImageDraw.Draw(p)
        for col,(label,frames) in enumerate([('PR53',before),('retained',after)]):
            im=Image.fromarray(frames[fid]).resize((256,384),Image.Resampling.LANCZOS)
            p.paste(im,(col*256,28),im);d.text((col*256+6,5),f'{label} / offline / frame {fid}',fill=(30,40,40))
        pictures.append(p)
    atlas=Image.new('RGB',(512,412*len(pictures)))
    for i,p in enumerate(pictures):atlas.paste(p,(0,412*i))
    palette=atlas.quantize(colors=256)
    pictures=[p.quantize(palette=palette,dither=Image.Dither.NONE) for p in pictures]
    durations=[round((i+1)*100/clip['fps'])*10-round(i*100/clip['fps'])*10 for i in range(len(pictures))]
    pictures[0].save(path,save_all=True,append_images=pictures[1:],duration=durations,disposal=2,optimize=False,**({'loop':0} if clip['loop'] else {}))
    with Image.open(path) as im:
        observed=[]
        for i in range(im.n_frames):im.seek(i);im.load();observed.append(im.info['duration'])
        assert observed==durations and (im.info.get('loop')==0)==clip['loop']
    return {'file':path.name,'frames':len(pictures),'durationMs':sum(durations),'loop':clip['loop'],'sha256':sha(path.read_bytes())}


def board(ctx,before,after,ids,path,crop=False):
    width,height=(440,370) if crop else (512,796)
    result=Image.new('RGB',(len(ids)*width,height*2),(235,231,220));d=ImageDraw.Draw(result)
    for row,(label,frames) in enumerate([('PR53',before),('retained',after)]):
        for col,fid in enumerate(ids):
            im=Image.fromarray(frames[fid])
            if crop:
                w=f.cloth_waist(ctx,fid);x=int(round(w[0]))-110;y=int(round(w[1]))-45
                im=im.crop((x,y,x+220,y+170)).resize((440,340),Image.Resampling.NEAREST)
            result.paste(im,(col*width,row*height+28),im)
            d.text((col*width+7,row*height+6),f'{label} / frame {fid} / {"2x" if crop else "native"} offline',fill=(30,40,40))
    result.save(path)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path('/tmp/side-fitting/skirt/female-skirt.garment.zip'));args=parser.parse_args()
    DOC.mkdir(parents=True,exist_ok=True)
    ctx=f.load_context('female',registration_path=ROOT/'artwork/kling-side-expansion/templates/female.registration.json')
    original=from_git(ASSET)
    assert sha(original)=='04ec7d1ec4868974f5946766e81f1f92ee185846689585f4c8222883ee92df2c'
    before=unpack(ctx,original);after={fid:im.copy() for fid,im in before.items()}
    donor_path=ROOT/'artwork/kling-side-expansion/female/source/000-bottom-cloth.png';donor=np.array(Image.open(donor_path).convert('RGBA'))
    assert sha(donor_path.read_bytes())=='e5e7ebb56c7e6b5087bf658a82320434892a440e16cc60de9b3f21008a9d3e20'
    jump=ctx.animations['jump']['frames']
    for fid in jump:
        after[fid]=f.composite(ctx,fid,f.fit_bottom(ctx,fid,0,donor),'bottom')
    restored={}
    for fid in (39,49):
        mask=f.skirt_foreground_review(ctx,fid);changed=mask&np.any(before[fid]!=ctx.frames[fid],axis=2)
        after[fid][mask]=ctx.frames[fid][mask];restored[str(fid)]=int(changed.sum())
        assert np.array_equal(after[fid][mask],ctx.frames[fid][mask])
        assert np.array_equal(after[fid][~mask],before[fid][~mask])
    changed_ids=[fid for fid in ctx.frames if not np.array_equal(before[fid],after[fid])]
    assert set(changed_ids)<=set(jump)|{39,49}
    for fid in ctx.frames:assert np.array_equal(after[fid][ctx.protected_mask(fid)],ctx.frames[fid][ctx.protected_mask(fid)])
    provenance='Existing generated complete pleated rose skirt donor 0 retained across actions. Offline source-knee-guided jump hem compression/front lift preserves one fold identity. A broad monotonic upper-hip fit replaces inherited flat shorts-edge fill, clipped at the actual source front waist. Run frames39/49 release skirt ownership at manually source-traced lower forearms, restoring exact source skin/ink/AA. No source, face, body, timing, registration or blouse changes. Recipe: scripts/refine-kling-side-skirt.py; foreground contours: artwork/kling-side-fitting/skirt/foreground-contours.json. Bounded fitting, not physical cloth simulation.'
    pack=pack_garment(ctx,'side-female-rose-skirt-v1','Rose gathered skirt','bottom',after,args.output,provenance)
    decoded=unpack(ctx,args.output.read_bytes())
    assert all(np.array_equal(decoded[i],after[i]) for i in ctx.frames)
    # Freeze the old blouse for a controlled skirt-only comparison even when
    # a separate parallel task improves the current blouse bank.
    top=unpack(ctx,from_git('docs/kling-side-expansion/assets/female-blouse.garment.zip'))
    old_combo=combine(ctx,before,top);new_combo=combine(ctx,after,top)
    clips=[gif(old_combo,new_combo,ctx.animations[action],DOC/f'{action}-offline-before-after.gif') for action in ('run','jump')]
    board(ctx,old_combo,new_combo,[51,52,101,0],DOC/'action-boundaries-native.png')
    board(ctx,old_combo,new_combo,[39,49,60,67,76,89],DOC/'contacts-crouch-2x.png',True)
    board(ctx,old_combo,new_combo,[52,56,60,63,67,72,76,79,85,89,95,101],Path('/tmp/side-fitting/skirt/jump-keyposes-native.png'))
    report={'baselineCommit':BASELINE,'sourceSha256':ctx.source_sha256,'registrationSha256':ctx.registration_sha256,'baselineGarmentSha256':sha(original),'garmentSha256':sha(args.output.read_bytes()),'donorSha256':sha(donor_path.read_bytes()),'foregroundRecipeSha256':sha((ROOT/'artwork/kling-side-fitting/skirt/foreground-contours.json').read_bytes()),'changedFrames':changed_ids,'unchangedFrameCount':len(ctx.frames)-len(changed_ids),'restoredSourcePixels':restored,'protectedPixelsChanged':0,'jumpInverseMapMinimumJacobian':min(ctx._skirt_map_jacobians.values()),'jumpInverseMapJacobians':ctx._skirt_map_jacobians,'sourceTimingUnchanged':ctx.animations,'gifChecks':clips,'pack':pack,'limits':'Offline exact garment/source composites, not browser exports. Same fold identity improves action continuity; less flutter than lifted donor79. Source clip boundaries still differ in pose; no new transition frames or physics. Source blur and matte remain.'}
    (DOC/'audit.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'file':str(args.output),'sha256':report['garmentSha256'],'changedFrames':len(changed_ids),'unchangedFrames':report['unchangedFrameCount'],'restoredSourcePixels':restored}))


if __name__=='__main__':main()
