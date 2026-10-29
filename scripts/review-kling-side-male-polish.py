#!/usr/bin/env python3
"""Independently decode the before/after garment ZIPs for male hand-contact QA.

This does not produce garment artwork. Supply the retained PR53 baseline directory
containing male.registration.json and the two male garment ZIPs. Current ZIPs are
read from the repository. The default review outputs are PNG/JSON, not UI exports;
actual workbench exports are verified separately.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import sys
import zipfile
from copy import deepcopy
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from kling_side_authoring import load_context, runtime_polygon_mask

EXPECTED={24,25,26,27,28,29,31,32,34,36,37,38}

def sha(data):return hashlib.sha256(data).hexdigest()

def unpack(path):
    frames={}
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        manifest=json.loads(archive.read('manifest.json'))
        pages={}
        for frame in manifest['frames']:
            p=frame['page']
            if p not in pages:
                pages[p]=(Image.open(io.BytesIO(archive.read(f'patches-{p}.png'))).convert('RGBA'),Image.open(io.BytesIO(archive.read(f'ownership-{p}.png'))).convert('RGBA').getchannel('A'))
            rect=frame['rect'];box=(rect['x'],rect['y'],rect['x']+rect['width'],rect['y']+rect['height'])
            x,y=frame['offset']['x'],frame['offset']['y'];w,h=rect['width'],rect['height']
            patch=np.zeros((768,512,4),np.uint8);owned=np.zeros((768,512),bool)
            patch[y:y+h,x:x+w]=np.array(pages[p][0].crop(box));owned[y:y+h,x:x+w]=np.array(pages[p][1].crop(box))>0
            assert not patch[~owned].any()
            frames[frame['frameId']]=(patch,owned)
    return manifest,frames

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--before',required=True,type=Path);ap.add_argument('--output',type=Path,default=ROOT/'docs/kling-side-polish/male');args=ap.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    registration=ROOT/'artwork/kling-side-expansion/templates/male.registration.json';oldbytes=(args.before/'male.registration.json').read_bytes();newbytes=registration.read_bytes();old=json.loads(oldbytes);new=json.loads(newbytes)
    ctx=load_context('male',registration_path=registration);assert old['sourceSha256']==new['sourceSha256']==ctx.source_sha256
    changed_reg=set()
    for previous,current in zip(old['frames'],new['frames']):
        if previous!=current:
            fid=current['frameId'];changed_reg.add(fid);p,c=deepcopy(previous),deepcopy(current)
            p['protected']=[r for r in p['protected'] if r['label']!='nearHand'];c['protected']=[r for r in c['protected'] if r['label']!='nearHand'];assert p==c
    assert changed_reg==EXPECTED
    assets=ROOT/'docs/kling-side-expansion/assets';banks={};rows=[]
    for slot,filename in [('top','male-shirt.garment.zip'),('bottom','male-trousers.garment.zip')]:
        bm,b=unpack(args.before/filename);am,a=unpack(assets/filename);assert bm['registrationSha256']==sha(oldbytes);assert am['registrationSha256']==sha(newbytes);assert set(a)==set(b)==set(ctx.frames)
        banks[slot]=(b,a);rows.append({'slot':slot,'filename':filename,'beforeSha256':sha((args.before/filename).read_bytes()),'afterSha256':sha((assets/filename).read_bytes())})
    records=[];composites={};all_changed=[]
    for fid,source in ctx.frames.items():
        before=source.copy();after=source.copy();ownership=np.zeros((768,512),bool);bank_changed=np.zeros((768,512),bool)
        for slot in ['bottom','top']:
            b,a=banks[slot];bp,bo=b[fid];ap,ao=a[fid];before[bo]=bp[bo];after[ao]=ap[ao];ownership |= ao;bank_changed |= np.any(bp!=ap,axis=2)|(bo!=ao)
        protected=ctx.protected_mask(fid);assert np.array_equal(after[protected],source[protected]);assert np.array_equal(after[~ownership],source[~ownership])
        changed=np.any(before!=after,axis=2)
        if fid not in EXPECTED:assert not bank_changed.any(),f'Unrelated frame changed: {fid}'
        else:
            oldhand=next(r for r in old['frames'][fid]['protected'] if r['label']=='nearHand');newhand=next(r for r in new['frames'][fid]['protected'] if r['label']=='nearHand');om=runtime_polygon_mask(oldhand['polygon']);nm=runtime_polygon_mask(newhand['polygon']);delta=om^nm
            # Contour ink/coverage may change immediately beside a released old
            # cloth region, never a distant limb or a second source body region.
            distance=nd.distance_transform_edt(~delta);assert not (bank_changed&(distance>4)).any(),f'Non-local fitting drift: {fid}'
            r,g,b=source[:,:,:3].astype(np.int16).transpose(2,0,1);witness=om&(r>75)&(r-g>27)&(r-b>35)&(source[:,:,3]>0)
            assert np.array_equal(after[witness],source[witness]),f'Visible source hand witness changed: {fid}'
            records.append({'frameId':fid,'sourceFrame':new['frames'][fid]['sourceFrame'],'removedProtectionPixels':int((om&~nm).sum()),'addedProtectionPixels':int((nm&~om).sum()),'changedBankPixels':int(bank_changed.sum()),'changedCompositePixels':int(changed.sum()),'changedBounds':Image.fromarray(changed).getbbox(),'maxDistanceFromRegistrationChange':float(distance[bank_changed].max()) if bank_changed.any() else 0,'visibleHandWitnessPixels':int(witness.sum()),'visibleHandWitnessChanges':0})
        if changed.any():all_changed.append(fid)
        composites[fid]=(source,before,after)
    # Individually reviewed hand-ink witnesses omitted by the first trial trace.
    for x,y in [(209,545),(210,546),(211,547),(212,548),(213,549),(267,573),(266,574),(267,574)]:assert np.array_equal(composites[26][2][y,x],ctx.frames[26][y,x])
    # Broad old-shorts samples now belong to real trousers. The immediate
    # dark hand ink/AA fringe remains original, rather than sharpening anatomy.
    repaired=[]
    for x,y in [(209,552),(210,560),(212,576)]:
        assert not np.array_equal(composites[26][2][y,x],ctx.frames[26][y,x]);assert banks['bottom'][1][26][1][y,x]
        repaired.append({'x':x,'y':y,'sourceRgba':ctx.frames[26][y,x].tolist(),'afterRgba':composites[26][2][y,x].tolist()})
    ids=sorted(EXPECTED);cw,ch=252,194;sheet=Image.new('RGB',(cw*3,ch*len(ids)),'#eee8dd');d=ImageDraw.Draw(sheet)
    for row,fid in enumerate(ids):
        poly=next(r['polygon'] for r in old['frames'][fid]['protected'] if r['label']=='nearHand');xs=[p['x'] for p in poly];ys=[p['y'] for p in poly];box=(int(min(xs)-7),int(min(ys)-8),int(max(xs)+8),int(max(ys)+9))
        for col,(label,pixels) in enumerate(zip(['Frozen source','Before PR53','Repaired'],composites[fid])):
            im=Image.fromarray(pixels).crop(box);im=im.resize((im.width*2,im.height*2),Image.Resampling.NEAREST);sheet.paste(im,(col*cw+8,row*ch+24),im);d.text((col*cw+8,row*ch+5),f'Walk pack {fid} / {label}',fill='#403629')
    sheet.save(args.output/'walk-contact-review.png',optimize=True)
    Image.fromarray(composites[26][2]).save(args.output/'walk-26-native.png',optimize=True)
    report={'format':'gathria-male-contact-polish-review','version':1,'sourceSha256':ctx.source_sha256,'beforeRegistrationSha256':sha(oldbytes),'registrationSha256':sha(newbytes),'sourceFramesChecked':len(ctx.frames),'modifiedRegistrationFrames':sorted(changed_reg),'changedCompositeFrames':all_changed,'unaffectedFramesByteExact':len(ctx.frames)-len(EXPECTED),'onlyNearHandContoursChanged':True,'allAnchorsAndHeadContoursUnchanged':True,'originalSourceZipUnchanged':True,'strictProtectedAndOutsideOwnershipPreservation':True,'visibleHandWitnessPreservation':True,'maximumBankChangeRadius':4,'banks':rows,'frames':records,'repairedOldShortsSamples':repaired,'visualReview':'Twelve native source / previous / repaired contact crops visually reviewed. Broad old-shorts wedges removed; original dark hand ink and narrow source antialias fringe retained. Warm witnesses complement, not replace, anatomical review. These PNGs decode actual garment banks offline; workbench CharacterPack/GIF validation is separate.'}
    (args.output/'audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['sourceFramesChecked','unaffectedFramesByteExact','changedCompositeFrames','registrationSha256']}))
if __name__=='__main__':main()
