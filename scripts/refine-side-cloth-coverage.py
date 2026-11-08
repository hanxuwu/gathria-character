#!/usr/bin/env python3
"""Apply the frozen, source-bound side clothing coverage review.

Only recorded cloth-to-cloth copy pixels and reviewed hand boundaries are used.
The baseline is a pinned existing Git blob, not an inferred current asset. Source
RGBA, registration, face, hands, motion, unlisted pixels and existing cloth stay
exact. The recipe is generated during the visual authoring review, not at runtime.
"""
from __future__ import annotations
import hashlib,io,json,subprocess,zipfile
from pathlib import Path
import numpy as np
from PIL import Image
from kling_side_authoring import load_context, encode_rgba, runtime_polygon_mask
ROOT=Path(__file__).resolve().parents[1]
RECIPE=ROOT/'artwork/wardrobe-coverage/side/recipe.json'
REPORT=ROOT/'docs/wardrobe-coverage/side/repair-report.json'
sha=lambda b:hashlib.sha256(b).hexdigest()

def rewrite(recipe):
    results=[];contexts={}
    profiles=json.loads((ROOT/'artwork/wardrobe-coverage/neckline-profiles-v1.json').read_text())['profiles']
    for item in recipe['items']:
        baseline=subprocess.check_output(['git','show',f"{recipe['baselineCommit']}:{item['path']}"],cwd=ROOT)
        assert sha(baseline)==item['baselineSha256']
        key=(item['identity'],item['registration'])
        if key not in contexts:contexts[key]=load_context(item['identity'],registration_path=ROOT/item['registration'])
        ctx=contexts[key]
        assert ctx.source_sha256==item['sourceSha256'] and ctx.registration_sha256==item['registrationSha256']
        with zipfile.ZipFile(io.BytesIO(baseline)) as z:
            files={n:z.read(n) for n in z.namelist()};manifest=json.loads(files['manifest.json'])
        pages=[np.array(Image.open(io.BytesIO(files[p['file']])).convert('RGBA')) for p in manifest['pages']]
        masks=[np.array(Image.open(io.BytesIO(files[p['maskFile']])).convert('RGBA')) for p in manifest['pages']]
        byframe={f['frameId']:f for f in manifest['frames']};reviews={(r['frameId'],r['label']):r for r in item['handProtectionReviews']}
        rows=[]
        for edit in item['frames']:
            fid=edit['frameId'];source=ctx.frames[fid];spec=byframe[fid];r,o=spec['rect'],spec['offset'];p=pages[spec['page']];mask=masks[spec['page']]
            assert sha(source.tobytes())==edit['sourceRgbaSha256']
            skin=ctx.masks(fid)['skin'];cloth=ctx.masks(fid)[manifest['slot']]
            protected=np.zeros((768,512),bool)
            for region in ctx.registered[fid]['protected']:
                polygon=reviews.get((fid,region['label']),region)['polygon']
                before=runtime_polygon_mask(region['polygon']);after=runtime_polygon_mask(polygon)
                assert not (after&~before).any() and after.any()
                protected|=after
            neck=np.zeros((768,512),bool)
            if item.get('necklinePermissionProfile'):
                profile=next(p for p in profiles if p['id']==item['necklinePermissionProfile'])
                assert profile['sourceSha256']==ctx.source_sha256 and profile['registrationSha256']==ctx.registration_sha256
                for row in profile['frames']:
                    if row['frameId']==fid:
                        for run in row['runs']:neck[run['y'],run['x0']:run['x1']+1]=True
            protected &= ~neck
            protected &= source[:,:,3]>0
            for x,y,sx,sy in edit['copyPixels']:
                assert 0<=x-o['x']<r['width'] and 0<=y-o['y']<r['height']
                px,py=r['x']+x-o['x'],r['y']+y-o['y'];dx,dy=r['x']+sx-o['x'],r['y']+sy-o['y']
                assert cloth[y,x] and not skin[y,x] and not protected[y,x]
                assert mask[py,px,3]==0 and mask[dy,dx,3]==255 and p[dy,dx,3]>=128
                assert abs(x-sx)<=20 and abs(y-sy)<=20
                p[py,px,:3]=p[dy,dx,:3];p[py,px,3]=source[y,x,3];mask[py,px,3]=255
            for x,y in edit.get('releasePixels',[]):
                px,py=r['x']+x-o['x'],r['y']+y-o['y']
                assert item['identity']=='male' and manifest['slot']=='bottom' and fid==57
                assert 215<=x<326 and 690<=y<716
                p[py,px]=0;mask[py,px]=0
            rows.append({'frameId':fid,'newClothPixels':len(edit['copyPixels']),'restoredShoePixels':len(edit.get('releasePixels',[]))})
        for i,page in enumerate(manifest['pages']):files[page['file']]=encode_rgba(pages[i],ctx.color_chunks);files[page['maskFile']]=encode_rgba(masks[i])
        if item['handProtectionReviews']:
            manifest['version']=2;manifest['handProtectionReviews']=item['handProtectionReviews']
        if item.get('necklinePermissionProfile'):
            manifest['version']=3;manifest['necklinePermissionProfile']=item['necklinePermissionProfile']
        manifest['provenance']+=' Coverage review: source-bound original-cloth-only copy map closes false hand-protection gaps; actual source skin, hand ink, head, registration and motion are retained. See artwork/wardrobe-coverage/side/recipe.json; reproduce scripts/refine-side-cloth-coverage.py. This is local continuation of existing painted cloth, not newly extracted video layers.'
        assert len(manifest['provenance'])<=4000
        files['manifest.json']=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_DEFLATED) as z:
            for name,data in sorted(files.items()):
                info=zipfile.ZipInfo(name,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
        data=stream.getvalue();(ROOT/item['path']).write_bytes(data)
        result={'id':manifest['id'],'path':item['path'],'baselineSha256':item['baselineSha256'],'sha256':sha(data),'bytes':len(data),'frames':rows,'reviewedHands':len(item['handProtectionReviews'])};results.append(result)
        print(manifest['id'],sum(r['newClothPixels'] for r in rows),'cloth pixels',len(item['handProtectionReviews']),'hand reviews',flush=True)
    report={'baselineCommit':recipe['baselineCommit'],'items':results,'sourceAndRegistrationUnchanged':True,'skinChangesOnlyRestoreOriginalShoeSole':True,'faceAndHeadSkinUnchanged':True,'headProtectedClothOnlyReviewedProfile':True,'timingAndFrameOrderUnchanged':True,'method':'Explicit source-cloth-only texture-copy recipe; protection reviews apply only to each item. Technical checks are distinct from visual review.'}
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':rewrite(json.loads(RECIPE.read_text()))
