#!/usr/bin/env python3
"""Check immutable releases and every new source-bound garment PNG payload."""
from pathlib import Path
import hashlib,io,json,zipfile,subprocess
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
def sha(data):return hashlib.sha256(data).hexdigest()
report={'legacy':[],'newGarments':[],'existingPresetsUnchanged':True}
for item in json.loads((ROOT/'docs/kling-refinement/baseline.json').read_text())['files']:
    actual=sha((ROOT/item['file']).read_bytes());assert actual==item['sha256'],item['file'];report['legacy'].append({'file':item['file'],'sha256':actual})
before=json.loads(subprocess.check_output(['git','show','8f2f87f:docs/kling-wardrobe/catalog.json'],cwd=ROOT));after=json.loads((ROOT/'docs/kling-wardrobe/catalog.json').read_text())
for old in before['characters']:
    current=next(c for c in after['characters'] if c['key']==old['key'])
    for preset in old['presets']:assert preset in current['presets']
for char,item in [('male','teal-camp-shirt-v3'),('male','navy-suit-jacket-v3'),('female','coral-daydress-v5'),('female','ivory-wedding-dress-v5'),('male','ocean-linen-shirt-v1')]:
    path=ROOT/f'docs/kling-wardrobe/garments/{char}/{item}.zip'
    source=ROOT/f'docs/kling-motion/exports/{char}.character.zip';reg=ROOT/f'docs/kling-wardrobe/registration/{"male-full-outfits-v1" if char=="male" else "female"}.json'
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None;m=json.loads(z.read('manifest.json'))
        assert m['sourceSha256']==sha(source.read_bytes()) and m['registrationSha256']==sha(reg.read_bytes())
        with zipfile.ZipFile(source) as s:sm=json.loads(s.read('manifest.json'))
        assert [f['frameId'] for f in m['frames']]==[f['id'] for f in sm['frames']]
        pages=[]
        for p in m['pages']:
            patch=Image.open(io.BytesIO(z.read(p['file'])));patch.load();mask=Image.open(io.BytesIO(z.read(p['maskFile'])));mask.load()
            assert patch.mode==mask.mode=='RGBA' and patch.size==mask.size==(p['width'],p['height'])
            pixels=np.asarray(patch);owned=np.asarray(mask)[:,:,3];assert np.isin(owned,[0,255]).all()
            assert not ((owned==0)&(pixels[:,:,3]>0)).any()
            pages.append({'patch':p['file'],'ownership':p['maskFile'],'size':list(patch.size),'rgbaSha256':sha(pixels.tobytes()),'transparentPixels':int((pixels[:,:,3]==0).sum()),'decoded':True})
        if item=='ocean-linen-shirt-v1':
            with zipfile.ZipFile(ROOT/'docs/kling-wardrobe/garments/male/teal-camp-shirt-v3.zip') as b:
                original=json.loads(b.read('manifest.json'))
                for key in ['sourceSha256','registrationSha256','characterId','frameWidth','frameHeight','frames','pages']:assert m[key]==original[key]
                for p in m['pages']:
                    assert z.read(p['maskFile'])==b.read(p['maskFile'])
                    assert np.array_equal(np.asarray(Image.open(io.BytesIO(z.read(p['file']))))[:,:,3],np.asarray(Image.open(io.BytesIO(b.read(p['file']))))[:,:,3])
        report['newGarments'].append({'id':item,'file':str(path.relative_to(ROOT)),'sha256':sha(path.read_bytes()),'sourceAndRegistrationExact':True,'frames':len(m['frames']),'pages':pages})
report['passed']=True
(ROOT/'docs/kling-refinement/final-asset-checks.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'unchangedReleaseFiles':len(report['legacy']),'newGarments':len(report['newGarments']),'passed':True}))
