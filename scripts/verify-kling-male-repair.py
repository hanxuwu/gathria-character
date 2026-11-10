#!/usr/bin/env python3
"""Independently check the additive sleeve bank against its shipped parent."""
import argparse,json,zipfile,io,subprocess
import numpy as np
from PIL import Image
from kling_wardrobe_common import ROOT,load_source,protected_mask,sha
OUT=ROOT/'artwork/kling-repair-handoff/male'
PUBLISHED=ROOT/'docs/kling-wardrobe/garments/male/teal-camp-shirt-v5.zip'
PINNED_SHA256='a41b45869fe0a3b63c613f8ade0b188a7e8b9040fee618fb3e9800c05543145e'
BASELINE_PATH='docs/kling-wardrobe/garments/male/teal-camp-shirt-v4.zip'
BASELINE_COMMIT='5d63ae233ca83e61dc354e122a8708044f4e2653'
BASELINE_SHA256='6d5d229351ab269687f24571a2b548e069adab6ada417c218569f9d89c3e5557'
COVERAGE_REVIEW=ROOT/'artwork/kling-coverage/male-original-hand-cloth-review.json'
COVERAGE_REVIEW_SHA256='a25ba3055a53c5833f91aef7700bc4f16552866a71ad5e4ef072609f3f15a3a4'

def historical_baseline():
    """The V4 parent also received the later coverage fix. Keep its old audit
    pinned to the exact already-merged bytes, never the mutable served parent.
    CI fetches full history; this operation only reads the local object store.
    """
    current=(ROOT/BASELINE_PATH).read_bytes()
    if sha(current)==BASELINE_SHA256:
        return current
    original=subprocess.check_output(['git','show',f'{BASELINE_COMMIT}:{BASELINE_PATH}'],cwd=ROOT)
    assert sha(original)==BASELINE_SHA256, 'Historical Teal V4 parent changed.'
    return original

def bank(path):
    result={}
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        m=json.loads(z.read('manifest.json'))
        pages=[]
        for p in m['pages']:
            pair=[]
            for name in [p['file'],p['maskFile']]:
                im=Image.open(io.BytesIO(z.read(name)));im.load();assert im.mode=='RGBA'
                pair.append(np.asarray(im))
            pages.append(pair)
        for f in m['frames']:
            r=f['rect'];o=f['offset'];target=np.s_[o['y']:o['y']+r['height'],o['x']:o['x']+r['width']]
            crop=np.s_[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
            rgba=np.zeros((1056,704,4),np.uint8);own=np.zeros((1056,704),bool)
            rgba[target]=pages[f['page']][0][crop];own[target]=pages[f['page']][1][crop][:,:,3]>0
            assert not rgba[~own,3].any();result[f['frameId']]=(rgba,own)
    return m,result

def check_published_coverage(candidate_manifest,candidate,rows,frames,source_hash,registration_hash):
    """Independently bound the served successor to five frozen cloth-only runs.

    This does not call the repair generator or trust its output report. The old
    authored candidate stays pinned above, including its frame59 sleeve repair.
    """
    review_bytes=COVERAGE_REVIEW.read_bytes()
    assert sha(review_bytes)==COVERAGE_REVIEW_SHA256, 'Approved coverage review changed.'
    review=json.loads(review_bytes)
    assert review['sourceSha256']==source_hash
    assert (review['frameWidth'],review['frameHeight'])==(704,1056)
    assert [(r['frameId'],r['clothPixelCount']) for r in review['frames']]==[(106,38),(107,55),(108,35),(109,106),(110,71)]
    item=next(i for i in review['items'] if i['id']=='teal-camp-shirt-v5')
    assert item['baselineSha256']==PINNED_SHA256
    assert item['url']=='/'+str(PUBLISHED.relative_to(ROOT))
    assert item['registrationUrl']=='/docs/kling-wardrobe/registration/male-full-outfits-v1.json'
    assert sha((ROOT/item['registrationUrl'].lstrip('/')).read_bytes())==registration_hash
    current_manifest,current=bank(PUBLISHED)
    assert current_manifest['sourceSha256']==source_hash
    assert current_manifest['registrationSha256']==registration_hash
    expected_reviews=[{k:r[k] for k in ('frameId','label','polygon','reason')} for r in review['frames']]
    assert current_manifest['version']==2
    assert current_manifest['handProtectionReviews']==expected_reviews, 'Published hand reviews exceed the frozen review.'
    normalized=dict(current_manifest)
    normalized.pop('handProtectionReviews')
    normalized['version']=candidate_manifest['version']
    assert normalized==candidate_manifest, 'Unreviewed garment metadata changed.'
    assert set(current)==set(candidate)==set(frames)
    corrections={r['frameId']:r for r in review['frames']}
    changed=[]
    for fid in sorted(candidate):
        before,before_owned=candidate[fid]
        after,after_owned=current[fid]
        correction=corrections.get(fid)
        if correction is None:
            assert np.array_equal(before,after) and np.array_equal(before_owned,after_owned),('Unreviewed published pose changed',fid)
            continue
        allowed=np.zeros((1056,704),bool)
        for run in correction['clothRuns']:
            allowed[run['y'],run['x0']:run['x1']+1]=True
        assert int(allowed.sum())==correction['clothPixelCount']
        raw=frames[fid]
        assert sha(raw[allowed].tobytes())==correction['sourceClothSha256'],('Source cloth changed',fid)
        original_hand=next(r for r in rows[fid]['protected'] if r['label']==correction['label'])
        old_protection=protected_mask({'protected':[original_hand]})
        reviewed_protection=protected_mask({'protected':[{'label':correction['label'],'polygon':correction['polygon']}]})
        assert not (reviewed_protection&~old_protection).any(),('Hand review escaped original',fid)
        assert not (reviewed_protection&allowed).any(),('Cloth still protected',fid)
        assert not (allowed&~old_protection).any(),('Cloth review escaped original hand',fid)
        other_protection=protected_mask({'protected':[r for r in rows[fid]['protected'] if r['label']!=correction['label']]})
        assert not (allowed&other_protection).any(),('Head or other hand changed',fid)
        assert not (before_owned&allowed).any()
        assert np.array_equal(after_owned,before_owned|allowed),('Ownership changed outside approved cloth',fid)
        assert np.array_equal(after[~allowed],before[~allowed]),('Artwork changed outside approved cloth',fid)
        lhs=raw.copy();lhs[before_owned]=before[before_owned]
        rhs=raw.copy();rhs[after_owned]=after[after_owned]
        assert np.array_equal(lhs[:,:,3],rhs[:,:,3]),('Published body alpha changed',fid)
        delta=np.any(lhs!=rhs,axis=2)
        assert np.array_equal(delta,allowed),('Published RGBA changes differ from approved cloth',fid)
        changed.append({'frameId':fid,'clothPixels':int(delta.sum()),'nonClothRgbaChanges':0,'alphaChanges':0})
    assert len(changed)==5 and sum(r['clothPixels'] for r in changed)==305
    return {'reviewSha256':COVERAGE_REVIEW_SHA256,'decodedFrames':len(current),'unchangedFrames':len(current)-5,
            'changedFrames':changed,'changedClothPixels':305,'allNonReviewedRgbaExact':True,
            'allSourceAlphaExact':True,'publishedSha256':sha(PUBLISHED.read_bytes())}

def main(write_report=False):
    a=json.loads((OUT/'audit.json').read_text());afterpath=OUT/'teal-camp-shirt-v5.zip'
    assert a['baseline']==BASELINE_PATH and a['baselineSha256']==BASELINE_SHA256
    baseline_bytes=historical_baseline()
    assert sha(baseline_bytes)==a['baselineSha256'];assert sha(afterpath.read_bytes())==a['item']['sha256']
    # Bind the actually served archive to the reviewed authoring candidate,
    # independently of mutable catalog/audit metadata. This check only reads.
    assert sha(afterpath.read_bytes())==PINNED_SHA256, 'Reviewed candidate changed; publish a new revision instead.'
    oldm,old=bank(io.BytesIO(baseline_bytes));newm,new=bank(afterpath)
    with zipfile.ZipFile(ROOT/'docs/kling-wardrobe/templates/male-full-outfits-v1.wardrobe-template.zip') as z:reg=z.read('registration.json')
    rows={r['frameId']:r for r in json.loads(reg)['frames']}
    source,manifest,_,frames=load_source('male')
    assert oldm['sourceSha256']==newm['sourceSha256']==sha(source)==a['sourceSha256']
    assert oldm['registrationSha256']==newm['registrationSha256']==sha(reg)==a['registrationSha256']
    assert set(old)==set(new)==set(frames);changed=[];newlyowned=0
    for fid in sorted(old):
        x,xm=old[fid];y,ym=new[fid];mask=protected_mask(rows[fid]);raw=frames[fid]
        lhs=raw.copy();lhs[xm]=x[xm];rhs=raw.copy();rhs[ym]=y[ym]
        assert np.array_equal(lhs[:,:,3],rhs[:,:,3]),('body alpha',fid)
        assert np.array_equal(lhs[mask],rhs[mask]),('protected anatomy',fid)
        assert not (xm&~ym).any(),('lost original ownership',fid)
        delta=np.any(lhs!=rhs,axis=2)
        if delta.any():
            ys,xs=np.where(delta)
            assert fid==59 and xs.min()>=373 and xs.max()<=395 and ys.min()>=511 and ys.max()<=562
            changed.append({'frameId':fid,'rgbaPixels':int(delta.sum()),'bounds':{'x':int(xs.min()),'y':int(ys.min()),'width':int(xs.max()-xs.min()+1),'height':int(ys.max()-ys.min()+1)}})
            newlyowned+=int((ym&~xm).sum())
        else:assert np.array_equal(x,y) and np.array_equal(xm,ym)
    assert len(changed)==1 and newlyowned==217
    result={'passed':True,'decodedFrames':len(new),'unchangedFrames':len(new)-len(changed),'changedFrames':changed,'newlyOwnedSleevePixels':newlyowned,'allBodyAlphaExact':True,'allProtectedAnatomyExact':True,'sourceSha256':sha(source),'registrationSha256':sha(reg),'baselineSha256':sha(baseline_bytes),'candidateSha256':sha(afterpath.read_bytes()),'applicationVisualReview':'required separately; these are asset invariants'}
    result['publishedCoverageRevision']=check_published_coverage(newm,new,rows,frames,sha(source),sha(reg))
    result['publishedArchiveExactToCandidate']=False
    result['publishedArchive']=str(PUBLISHED.relative_to(ROOT))
    if write_report:
        (OUT/'asset-checks.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write-report',action='store_true',help='Explicitly update the authoring audit; default CI mode is read-only.')
    main(parser.parse_args().write_report)
