#!/usr/bin/env python3
"""Decode new banks and protect prior releases, source registration and anatomy."""
import importlib.util, io, json, zipfile, hashlib
from pathlib import Path
import numpy as np
from PIL import Image
from kling_wardrobe_common import ROOT, load_source, protected_mask

def sha(data):return hashlib.sha256(data).hexdigest()
report={'immutable':[],'garments':[],'hair':[]}
for r in json.loads((ROOT/'docs/kling-polish/baseline.json').read_text())['files']:
    assert sha((ROOT/r['file']).read_bytes())==r['sha256'],r['file']
    report['immutable'].append(r)
spec=importlib.util.spec_from_file_location('polish_bank_reader',ROOT/'scripts/prepare-kling-male-fit-polish.py')
reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
_,sm,_,source=load_source('female')
with zipfile.ZipFile(ROOT/'docs/kling-wardrobe/templates/female.wardrobe-template.zip') as z:
    rb=z.read('registration.json');regs={r['frameId']:r for r in json.loads(rb)['frames']}
    for item in ['coral-daydress','ivory-wedding-dress']:
        old=reader.read_bank(ROOT/f'docs/kling-wardrobe/garments/female/{item}-v5.zip')
        path=ROOT/f'docs/kling-wardrobe/garments/female/{item}-v6.zip';new=reader.read_bank(path)
        assert set(new)==set(source)
        checks=[]
        for fid,(paint,own) in new.items():
            original=source[fid];prior,old_own=old[fid]
            masks={n:np.asarray(Image.open(io.BytesIO(z.read(f'masks/{fid:03d}/{n}.png'))))>0 for n in ['skin','head','nearHand','farHand']}
            protection=(masks['skin']|masks['head']|masks['nearHand']|masks['farHand']|protected_mask(regs[fid]))&(original[:,:,3]>0)
            assert np.array_equal(paint[protection],prior[protection])
            assert not (own&protected_mask(regs[fid])&(original[:,:,3]>0)).any()
            assert not (paint[~own,3]>0).any()
            wy=(regs[fid]['points']['waistLeft']['y']+regs[fid]['points']['waistRight']['y'])/2
            yy=np.indices(own.shape)[0];allowed=(yy>=int(wy-44))&(yy<=int(wy+35))
            changed=np.any(paint!=prior,axis=2)|(own!=old_own)
            assert not (changed&~allowed).any(),(item,fid,'outside waist')
            checks.append({'frameId':fid,'changed':int(changed.sum()),'added':int((own&~old_own).sum()),'protectedChanges':0})
        with zipfile.ZipFile(path) as b:
            assert b.testzip() is None;m=json.loads(b.read('manifest.json'))
            assert m['registrationSha256']==sha(rb)
        report['garments'].append({'file':str(path.relative_to(ROOT)),'sha256':sha(path.read_bytes()),'poses':checks})

def hair_frames(path):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None;m=json.loads(z.read('manifest.json'))
        pages=[np.asarray(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA')) for p in m['pages']]
        masks=[np.asarray(Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA')) for p in m['pages']]
        result={}
        for s in m['styles']:
            for layer in s['layers']:
                for f in layer['frames']:
                    if f['mode']=='source':continue
                    r=f['rect'];sl=np.s_[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
                    result[s['id'],layer['role'],f['frameId']]=(pages[f['page']][sl].copy(),masks[f['page']][sl].copy(),f['offset'])
        return m,result
for char,style,revision in [('male','airy-tousle','volume'),('female','ribbon-pony','volume-v4')]:
    old,of=hair_frames(ROOT/f'docs/kling-appearance/banks/{revision}/{char}-{style}.zip')
    path=ROOT/f'docs/kling-appearance/banks/volume-v5/{char}-{style}.zip';new,nf=hair_frames(path)
    for k in ['poses','padding','sourceSha256','registrationSha256','characterId']:assert new[k]==old[k],k
    assert of.keys()==nf.keys()
    changes=0
    for key,(image,mask,offset) in nf.items():
        before,oldmask,oldoffset=of[key]
        assert offset==oldoffset and np.array_equal(mask,oldmask) and np.array_equal(image[:,:,3],before[:,:,3]),key
        if key[1]=='hair-back' or key[0]=='gentle': assert np.array_equal(image,before),key
        changes+=int(np.any(image!=before,axis=2).sum())
    assert changes>0
    report['hair'].append({'file':str(path.relative_to(ROOT)),'sha256':sha(path.read_bytes()),'alphaOwnershipAndRegistrationExact':True,'rearAndFaceExact':True,'changedPixels':changes,'frames':len(new['poses'])})
report['passed']=True
(ROOT/'docs/kling-polish/asset-checks.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:len(v) for k,v in report.items() if isinstance(v,list)}))
