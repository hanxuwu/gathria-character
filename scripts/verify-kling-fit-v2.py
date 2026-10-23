#!/usr/bin/env python3
"""Decode both additive revisions, checking geometry and protected cloth pixels."""
import importlib.util, io, json, zipfile, hashlib
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
def module(name,file):
    s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def bank(path):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        m=json.loads(z.read('manifest.json'));pages=[]
        for p in m['pages']:
            pair=[]
            for field in ['file','maskFile']:
                im=Image.open(io.BytesIO(z.read(p[field])));im.load();assert im.size==(p['width'],p['height']);pair.append(np.asarray(im))
            pages.append(pair)
    return m,pages
def crop(pages,f):
    r=f['rect'];return [p[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']] for p in pages[f['page']]]
old=ROOT/'docs/kling-appearance/banks/volume/female-ribbon-pony.zip'
new=ROOT/'docs/kling-appearance/banks/volume-v2/female-ribbon-pony.zip'
if (ROOT/'docs/kling-appearance/banks/volume-v3/female-ribbon-pony.zip').exists():
    new=ROOT/'docs/kling-appearance/banks/volume-v3/female-ribbon-pony.zip'
om,op=bank(old);nm,npages=bank(new)
for k in ['sourceSha256','registrationSha256','frameWidth','frameHeight','padding','poses']:assert om[k]==nm[k],k
gentle=[]
for a,b in zip(next(s for s in om['styles'] if s['id']=='gentle')['layers'],next(s for s in nm['styles'] if s['id']=='gentle')['layers']):
    for f,g in zip(a['frames'],b['frames']):
        assert f['frameId']==g['frameId'] and f['mode']==g['mode']
        if f['mode']=='paint':
            assert f['offset']==g['offset']
            assert all(np.array_equal(x,y) for x,y in zip(crop(op,f),crop(npages,g)))
        gentle.append(f['frameId'])
reader=module('reader','prepare-kling-male-fit-polish.py')
before=reader.read_bank(ROOT/'docs/kling-wardrobe/garments/female/ivory-celebration-dress-v1.zip')
newdress=ROOT/'docs/kling-wardrobe/garments/female/ivory-celebration-dress-v2.zip'
v3dress=ROOT/'docs/kling-wardrobe/garments/female/ivory-celebration-dress-v3.zip'
if v3dress.exists():newdress=v3dress
after=reader.read_bank(newdress)
rows=[]
with zipfile.ZipFile(ROOT/'docs/kling-wardrobe/templates/female.wardrobe-template.zip') as z:
    for fid in before:
        protected=np.zeros(before[fid][1].shape,bool)
        for name in ['head','skin','nearHand','farHand']:
            region=np.asarray(Image.open(io.BytesIO(z.read(f'masks/{fid:03d}/{name}.png'))))>0
            if name=='skin' and newdress==v3dress:region&=~before[fid][1]
            protected|=region
        changes=np.any(before[fid][0]!=after[fid][0],axis=2)
        assert not (changes&protected).any()
        rows.append({'frameId':fid,'changedClothPixels':int(changes.sum()),'protectedChanges':0})
report={'hairPoseGeometryUnchanged':True,'gentleStatesUnchanged':len(gentle),'dressFrames':rows,'assets':[]}
for p in [old,new,ROOT/'docs/kling-wardrobe/garments/female/ivory-celebration-dress-v1.zip',newdress]:
    report['assets'].append({'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
out=ROOT/'docs/kling-sprints';out.mkdir(exist_ok=True)
(out/'asset-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'gentleStates':len(gentle),'dressFrames':len(rows),'protectedChanges':0}))
