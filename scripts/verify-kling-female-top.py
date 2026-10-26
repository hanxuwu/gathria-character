#!/usr/bin/env python3
"""Decode the complete new female top, both bottom mixes and its bound recipe."""
import importlib.util
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageDraw

from kling_wardrobe_common import ROOT, load_source, protected_mask, sha
from kling_garment_recipe import build_variant

spec=importlib.util.spec_from_file_location('female_top',ROOT/'scripts/prepare-kling-female-top.py')
fit=importlib.util.module_from_spec(spec);spec.loader.exec_module(fit)

def main():
    legacy_manifest,legacy=fit.read_bank(fit.BASE)
    base_manifest,base=fit.read_bank(fit.AUTHORING_BASE)
    new_manifest,new=fit.read_bank(fit.TARGET)
    source_bytes,source_manifest,_,source=load_source('female')
    registration=(ROOT/'docs/kling-wardrobe/registration/female.json').read_bytes()
    records={f['frameId']:f for f in json.loads(registration)['frames']}
    repair_definition=json.loads((fit.SOURCE/'ownership-repairs.json').read_text())
    repair_by_id={r['frameId']:r for r in repair_definition['repairs']}
    _,navy=fit.read_bank(ROOT/'docs/kling-wardrobe/garments/female/navy-shorts.zip')
    _,ochre=fit.read_bank(ROOT/'docs/kling-wardrobe/garments/female/ochre-shorts.zip')
    assert len(source)==len(new)==96
    assert set(new)==set(base)==set(source)==set(records)
    assert source_manifest['anchor']=={'x':352,'y':998,'units':'pixels','origin':'top-left'}
    assert new_manifest['sourceSha256']==sha(source_bytes)
    assert new_manifest['registrationSha256']==sha(registration)
    for key in ['slot','sourceSha256','registrationSha256','characterId','frameWidth','frameHeight','pages','frames']:
        assert new_manifest[key]==base_manifest[key],f'Frozen contract changed: {key}'
    assert new_manifest['id']==fit.ITEM
    report=[]
    repair_report=[]
    old_frames={f['frameId']:f for f in legacy_manifest['frames']}
    authored_frames={f['frameId']:f for f in base_manifest['frames']}
    for fid,(patch,own) in new.items():
        old,old_owned=base[fid];original=source[fid]
        legacy_patch,legacy_owned=legacy[fid]
        assert not np.any(legacy_owned&~own),(fid,'legacy cloth coverage removed')
        added=own&~legacy_owned
        assert np.array_equal(old[legacy_owned],legacy_patch[legacy_owned]),(fid,'old paint changed in derivative')
        assert np.array_equal(old[added],original[added]),(fid,'repair was not original source RGBA')
        if fid not in repair_by_id:
            assert not added.any() and np.array_equal(old,legacy_patch)
            assert authored_frames[fid]==old_frames[fid],(fid,'unaffected crop/frame mapping changed')
        else:
            assert added.any(),(fid,'missing source-cloth repair')
            trace=Image.new('L',(704,1056));ImageDraw.Draw(trace).polygon([tuple(p) for p in repair_by_id[fid]['polygon']],fill=255)
            assert not np.any(added&~(np.asarray(trace)>0)),(fid,'repair outside reviewed polygon')
            rgb=original[added,:3].astype(float);rule=repair_definition['sourceClothRule'];r,g,b=rgb.T
            assert np.all((r-g<rule['redMinusGreenMaximum'])&(r-b<rule['redMinusBlueMaximum'])&(r-b>rule['redMinusBlueMinimum'])&(r>rule['redMinimum'])&(r<rule['redMaximum']))
            assert np.all(original[added,3]>rule['minimumAlpha'])
            y,x=np.where(added)
            repair_report.append({'frameId':fid,'addedPixels':int(added.sum()),'bounds':[int(x.min()),int(y.min()),int(x.max()+1),int(y.max()+1)],'sourceRgbaExact':True,'bottomOverlapAddedPixels':0})
        assert not np.any(added&(navy[fid][1]|ochre[fid][1])),(fid,'repair changed bottom ownership')
        assert not np.any(added&protected_mask(records[fid])),(fid,'repair changed protected head/hand')
        assert np.array_equal(own,old_owned),(fid,'ownership changed')
        assert np.array_equal(patch[:,:,3],old[:,:,3]),(fid,'alpha changed')
        assert np.array_equal(patch[own,3],original[own,3]),(fid,'source alpha changed')
        assert not np.any(patch[~own]),(fid,'paint outside ownership')
        assert not np.any(own&protected_mask(records[fid])),(fid,'protected overlap')
        changed=np.any(patch!=old,axis=2)
        assert changed.any() and not np.any(changed&~own)
        composed=original.copy();composed[own]=patch[own]
        assert np.array_equal(composed[~own],original[~own])
        report.append({'frameId':fid,'ownedPixels':int(own.sum()),'changedClothPixels':int(changed.sum()),
                       'protectedPixelChanges':0,'outsideOwnershipChanges':0,
                       'rgbaSha256':sha(patch.tobytes()),'ownershipSha256':sha(own.tobytes())})
    mixes=[]
    for bottom_id in ['navy-shorts','ochre-shorts']:
        bottom_path=ROOT/f'docs/kling-wardrobe/garments/female/{bottom_id}.zip'
        bm,bottom=fit.read_bank(bottom_path)
        assert bm['sourceSha256']==new_manifest['sourceSha256']
        assert bm['registrationSha256']==new_manifest['registrationSha256']
        hashes=[]
        for fid,original in source.items():
            bp,bo=bottom[fid];tp,to=new[fid];composed=original.copy()
            composed[bo]=bp[bo];composed[to]=tp[to]
            assert np.array_equal(composed[to],tp[to])
            assert np.array_equal(composed[bo&~to],bp[bo&~to])
            assert np.array_equal(composed[~(bo|to)],original[~(bo|to)])
            assert np.array_equal(composed[:,:,3],original[:,:,3])
            hashes.append({'frameId':fid,'rgbaSha256':sha(composed.tobytes()),'overlapPixels':int((bo&to).sum())})
        mixes.append({'bottom':bottom_id,'bottomSha256':sha(bottom_path.read_bytes()),'poses':hashes})
    recipe=json.loads((fit.OUT/'plum-pintuck-recipe.json').read_text())
    rebuilt,build_report=build_variant(recipe)
    assert rebuilt==fit.TARGET.read_bytes(),'Recipe rebuild differs from shipped top'
    with zipfile.ZipFile(fit.TARGET) as z:assert z.testzip() is None
    regression_probes={62:[(380,710),(420,710)],102:[(300,636)],112:[(300,672)]}
    for fid,points in regression_probes.items():
        for x,y in points:
            assert new[fid][1][y,x] and not legacy[fid][1][y,x],(fid,x,y,'cloth repair missing')
    blocked=[]
    for row in repair_definition['blockedSourceCloth']:
        fid=row['frameId'];patch,own=new[fid];protection=protected_mask(records[fid])
        composed=source[fid].copy();composed[own]=patch[own]
        for x,y in row['probes']:
            assert protection[y,x] and not own[y,x]
            assert np.array_equal(composed[y,x],source[fid][y,x])
            blocked.append({'frameId':fid,'x':x,'y':y,'sourceRgba':source[fid][y,x].tolist(),'retainedExactly':True})
    output={'itemId':fit.ITEM,'garmentSha256':sha(fit.TARGET.read_bytes()),'baseSha256':sha(fit.AUTHORING_BASE.read_bytes()),'legacyBaseSha256':sha(fit.BASE.read_bytes()),
            'sourceSha256':sha(source_bytes),'registrationSha256':sha(registration),'frames':96,
            'sourceFrameSize':[704,1056],'sourceAnchor':source_manifest['anchor'],
            'actions':source_manifest['animations'],'checks':{'authoredTemplateOwnershipExact':True,'alphaExact':True,
            'protectedPolygonsUntouched':True,'sourceOutsideOwnershipExact':True,'recipeRebuildExact':True,
            'bottomMixes':'192 complete native compositions; top wins the existing cloth seam overlap'},
            'poses':report,'mixes':mixes,'recipeBuild':build_report,'ownershipRepairs':repair_report,'protectedSourceClothRetained':blocked,
            'scope':'Offline decoded-pixel and recipe verification. Actual browser save/reopen and CharacterPack exports are recorded separately.'}
    (fit.OUT/'verification.json').write_text(json.dumps(output,indent=2)+'\n')
    print(json.dumps({'item':fit.ITEM,'poses':96,'bottomMixPoses':192,'recipeRebuildExact':True,'sha256':output['garmentSha256']}))

if __name__=='__main__':main()
