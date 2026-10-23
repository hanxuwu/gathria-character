#!/usr/bin/env python3
"""Validate immutable releases and decoded new clothing ownership/alpha."""
import hashlib,importlib.util,json,zipfile
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
baseline=json.loads((ROOT/'docs/kling-fit-workflow/baseline.json').read_text())
for name,digest in baseline['files'].items():assert sha(ROOT/name)==digest,name
spec=importlib.util.spec_from_file_location('fit_reader',ROOT/'scripts/prepare-kling-male-fit-polish.py')
reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
report={'baseline':baseline['commit'],'immutableArchives':len(baseline['files']),'items':[],'femaleV6Retained':True}
for item in ['teal-camp-shirt','navy-suit-jacket']:
    before=ROOT/f'docs/kling-wardrobe/garments/male/{item}-v3.zip'
    after=ROOT/f'docs/kling-wardrobe/garments/male/{item}-v4.zip'
    with zipfile.ZipFile(before) as b,zipfile.ZipFile(after) as a:
        assert a.testzip() is None
        bm=json.loads(b.read('manifest.json'));am=json.loads(a.read('manifest.json'))
        for key in ['sourceSha256','registrationSha256','characterId','frameWidth','frameHeight','slot']:
            assert am[key]==bm[key],(item,key)
    old=reader.read_bank(before);new=reader.read_bank(after);checks=[]
    assert set(old)==set(new) and len(new)==88
    for fid,(art,owned) in new.items():
        previous,previous_owned=old[fid]
        assert np.array_equal(owned,previous_owned),(item,fid,'ownership')
        assert np.array_equal(art[:,:,3],previous[:,:,3]),(item,fid,'alpha')
        assert np.array_equal(art[~owned],previous[~owned]),(item,fid,'outside cloth')
        checks.append({'frameId':fid,'changedClothingPixels':int(np.any(art!=previous,axis=2).sum()),'ownershipAlphaAndUnownedExact':True})
    report['items'].append({'id':am['id'],'sha256':sha(after),'frames':checks})
    del old,new
assert not (ROOT/'docs/kling-wardrobe/garments/female/coral-daydress-v7.zip').exists()
assert not (ROOT/'docs/kling-wardrobe/garments/female/ivory-wedding-dress-v7.zip').exists()
(ROOT/'docs/kling-fit-workflow/asset-checks.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'immutableArchives':report['immutableArchives'],'newGarments':len(report['items']),'decodedPoses':176}))
