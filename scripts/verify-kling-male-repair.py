#!/usr/bin/env python3
"""Independently check the additive sleeve bank against its shipped parent."""
import importlib.util,json,zipfile,io
import numpy as np
from PIL import Image
from kling_wardrobe_common import ROOT,load_source,protected_mask,sha
OUT=ROOT/'artwork/kling-repair-handoff/male'

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

def main():
    a=json.loads((OUT/'audit.json').read_text());beforepath=ROOT/a['baseline'];afterpath=OUT/'teal-camp-shirt-v5.zip'
    assert sha(beforepath.read_bytes())==a['baselineSha256'];assert sha(afterpath.read_bytes())==a['item']['sha256']
    oldm,old=bank(beforepath);newm,new=bank(afterpath)
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
    result={'passed':True,'decodedFrames':len(new),'unchangedFrames':len(new)-len(changed),'changedFrames':changed,'newlyOwnedSleevePixels':newlyowned,'allBodyAlphaExact':True,'allProtectedAnatomyExact':True,'sourceSha256':sha(source),'registrationSha256':sha(reg),'baselineSha256':sha(beforepath.read_bytes()),'candidateSha256':sha(afterpath.read_bytes()),'applicationVisualReview':'required separately; these are asset invariants'}
    (OUT/'asset-checks.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
if __name__=='__main__':main()
