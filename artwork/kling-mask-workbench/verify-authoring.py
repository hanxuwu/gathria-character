#!/usr/bin/env python3
"""Independent read-only proof for the frozen neckline map and RGB seed files.

Uses its own pixel-center polygon test and archive decoder. It does not invoke
the authoring shader or import the browser compositor. This proves recorded
constraints, not semantic perfection or user visual approval.
"""
from pathlib import Path
import hashlib
import io
import json
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inside(polygon, x, y):
    px,py=x+.5,y+.5
    result=False
    for a,b in zip(polygon[-1:]+polygon[:-1],polygon):
        ax,ay,bx,by=a['x'],a['y'],b['x'],b['y']
        cross=(px-ax)*(by-ay)-(py-ay)*(bx-ax)
        if abs(cross)<1e-9 and min(ax,bx)<=px<=max(ax,bx) and min(ay,by)<=py<=max(ay,by):return True
        if (ay>py)!=(by>py) and px<(bx-ax)*(py-ay)/(by-ay)+ax:result=not result
    return result


def decoded(path, source=False):
    with zipfile.ZipFile(path) as z:
        m=json.loads(z.read('manifest.json'))
        specs=[m['spritesheet'],*m.get('additionalSheets',[])] if source else m['pages']
        pages=[np.array(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA')) for p in specs]
        masks=[] if source else [np.array(Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA'))[:,:,3]>0 for p in specs]
    result={}
    for f in m['frames']:
        if source:
            result[f['id']]=pages[f.get('page',0)][f['y']:f['y']+f['height'],f['x']:f['x']+f['width']].copy()
        else:
            r,o=f['rect'],f['offset'];sl=np.s_[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
            target=np.s_[o['y']:o['y']+r['height'],o['x']:o['x']+r['width']]
            rgba=np.zeros((1056,704,4),np.uint8);mask=np.zeros((1056,704),bool)
            rgba[target]=pages[f['page']][sl];mask[target]=masks[f['page']][sl]
            result[f['frameId']]=(rgba,mask)
    return result


def main():
    profile_path=HERE/'female-neckline-cloth-v1.json';seeds_path=HERE/'female-plum-neckline-seeds.json'
    p=json.loads(profile_path.read_bytes());s=json.loads(seeds_path.read_bytes());a=json.loads((HERE/'authoring-review.json').read_bytes())
    source_path=ROOT/'docs/kling-motion/exports/female.character.zip'
    registration_path=ROOT/'docs/kling-wardrobe/registration/female.json'
    garment_path=ROOT/'docs/kling-wardrobe/garments/female/plum-pintuck-top-v1.zip'
    assert digest(source_path.read_bytes())==s['sourceSha256']==p['sourceSha256']
    assert digest(registration_path.read_bytes())==s['registrationSha256']==p['registrationSha256']
    assert digest(garment_path.read_bytes())==s['baseGarmentSha256']
    assert digest(profile_path.read_bytes())==s['profileSha256']==a['profileSha256']
    assert digest(seeds_path.read_bytes())==a['seedSha256']
    originals=decoded(source_path,True);bank=decoded(garment_path)
    records={f['frameId']:f for f in json.loads(registration_path.read_bytes())['frames']}
    permissions={};rows=[]
    for frame in p['frames']:
        fid=frame['frameId'];allowed=set();last=(-1,-1)
        for run in frame['runs']:
            y,x0,x1=run['y'],run['x0'],run['x1']
            assert all(type(n) is int for n in (y,x0,x1)) and 0<=y<1056 and 0<=x0<=x1<704
            assert (y,x0)>last
            for x in range(x0,x1+1):
                assert (x,y) not in allowed
                assert any(r['label']=='head' and inside(r['polygon'],x,y) for r in records[fid]['protected'])
                assert not any(r['label']!='head' and inside(r['polygon'],x,y) for r in records[fid]['protected'])
                assert originals[fid][y,x,3]==255 and not bank[fid][1][y,x]
                allowed.add((x,y))
            last=(y,x1)
        permissions[fid]=allowed
    probes={89:(400,630),90:(390,550),93:(380,425),101:(390,500),102:(375,575),103:(390,620)}
    for seed in s['frames']:
        fid=seed['frameId'];pixels=seed['pixels'];assert fid in permissions
        original=originals[fid];base,owned=bank[fid]
        before=original.copy();before[owned]=base[owned];after=before.copy();changed=set();protected=0
        png=np.array(Image.open(HERE/f'proposal-{fid:03}.png').convert('RGBA'))
        for pixel in pixels:
            x,y=pixel['x'],pixel['y'];assert (x,y) not in changed
            assert all(type(pixel[k]) is int and 0<=pixel[k]<=255 for k in ('r','g','b'))
            assert 0<=x<704 and 0<=y<1056 and original[y,x,3]==255 and not owned[y,x]
            assert not any(r['label']!='head' and inside(r['polygon'],x,y) for r in records[fid]['protected'])
            is_head=any(r['label']=='head' and inside(r['polygon'],x,y) for r in records[fid]['protected'])
            if is_head:assert (x,y) in permissions[fid];protected+=1
            rgb=[pixel[k] for k in ('r','g','b')]
            assert png[y,x].tolist()==rgb+[255]
            after[y,x,:3]=rgb;changed.add((x,y))
        assert permissions[fid]<=changed
        assert np.count_nonzero(png[:,:,3])==len(changed)
        keep=np.ones((1056,704),bool)
        for x,y in changed:keep[y,x]=False
        assert np.array_equal(before[keep],after[keep])
        assert np.array_equal(before[:,:,3],after[:,:,3])
        x,y=probes[fid];assert (x,y) not in changed and np.array_equal(before[y,x],after[y,x])
        rows.append({'frameId':fid,'profilePixels':len(permissions[fid]),'proposalPixels':len(changed),'protectedProposalPixels':protected,'unauthorizedProtectedChanges':0,'handChanges':0,'sourceAlphaExact':True,'outsideProposalExact':True,'neckSkinProbe':{'x':x,'y':y,'rgba':original[y,x].tolist(),'unchanged':True}})
    assert set(permissions)=={f['frameId'] for f in s['frames']}=={89,90,93,101,102,103}
    report={'format':'gathria-neckline-source-constraint-audit','version':1,'passed':True,'profileSha256':digest(profile_path.read_bytes()),'seedsSha256':digest(seeds_path.read_bytes()),'verifierSha256':digest(Path(__file__).read_bytes()),'method':'Independent source/archive decode and per-pixel polygon-center classification; no authoring shader or runtime compositor imports.','frames':rows,'summary':{'profilePixels':sum(r['profilePixels'] for r in rows),'proposalPixels':sum(r['proposalPixels'] for r in rows),'unprotectedClothPixels':sum(r['proposalPixels']-r['profilePixels'] for r in rows),'unauthorizedProtectedChanges':0,'handChanges':0},'visualAcceptance':'Internal bounded source-trace review only; actual application export and user visual review remain separate.'}
    (HERE/'source-constraint-verification.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report['summary'],indent=2))


if __name__=='__main__':main()
