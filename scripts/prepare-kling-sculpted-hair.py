#!/usr/bin/env python3
"""Register new crown painting inside immutable front-hair silhouettes.

Only colour above the temple transitions changes. Ear/fringe alpha, rear hair,
source transforms and Gentle face pixels come from the prior accepted banks.
"""
import argparse, copy, importlib.util, json, zipfile
import numpy as np
from PIL import Image
from scipy import ndimage as nd
from kling_wardrobe_common import ROOT, json_bytes, sha

def module(name,path):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/path)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

temple=module('polish_temple','prepare-kling-temple-v4.py')
base=temple.base
old_donors=base.donors
OUT=ROOT/'artwork/kling-polish/prepared/hair'
OUT.mkdir(parents=True,exist_ok=True)
base.OUT=OUT
INPUTS={'airy-tousle':('airy-volume-donor.png',275,330),'ribbon-pony':('pony-volume-donor.png',335,400)}

def donors(style):
    prior=temple.donors(style) if style=='ribbon-pony' else old_donors(style)
    filename,fade_start,fade_end=INPUTS[style]
    source=Image.open(ROOT/'artwork/kling-polish/source'/filename).convert('RGBA')
    result=[]
    for role,rgba,fit in prior:
        if role=='hair-front':
            candidate=np.asarray(source.resize((rgba.shape[1],rgba.shape[0]),Image.Resampling.LANCZOS))
            yy,xx=np.indices(rgba.shape[:2])
            # Retain all ear, temple, face-opening and silhouette pixels. Only
            # interior painted crown bundles receive the supplementary shading.
            distance=nd.distance_transform_edt(rgba[:,:,3]>220)
            weight=np.clip((fade_end-yy)/(fade_end-fade_start),0,1)*np.clip((distance-5)/12,0,1)
            weight*=np.clip((candidate[:,:,3].astype(float)-220)/35,0,1)
            # Ribbon remains its original white, without a copper-hair tint.
            old_rgb=rgba[:,:,:3].astype(float)
            hair=(old_rgb[:,:,0]-old_rgb[:,:,2]>20)&(old_rgb[:,:,2]<135)
            weight*=hair
            changed=rgba.copy()
            changed[:,:,:3]=np.rint(old_rgb*(1-weight[:,:,None])+candidate[:,:,:3]*weight[:,:,None]).astype(np.uint8)
            assert np.array_equal(changed[:,:,3],rgba[:,:,3])
            assert np.array_equal(changed[yy>=fade_end],rgba[yy>=fade_end])
            rgba=changed
        Image.fromarray(rgba).save(OUT/f'{style}-{role}-prepared.png')
        result.append((role,rgba,fit))
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('--prototype',action='store_true');p.add_argument('--style',choices=list(INPUTS));args=p.parse_args()
    base.donors=donors
    base.DEFINITIONS=copy.deepcopy(base.DEFINITIONS)
    base.DEFINITIONS['ribbon-pony']['overlap']=[2,6]
    target=ROOT/'docs/kling-appearance/banks/volume-v5'
    for style in ([args.style] if args.style else INPUTS):
        base.build(style,args.prototype,target)
        if args.prototype:continue
        char=base.DEFINITIONS[style]['character'];path=target/f'{char}-{style}.zip'
        with zipfile.ZipFile(path) as z:files={n:z.read(n) for n in z.namelist()}
        m=json.loads(files['manifest.json']);m['id']=f'kling-{char}-{style}-v5'
        filename=INPUTS[style][0]
        m['provenance']=f'OpenAI supplementary hair edit 2026-10-23, artwork/kling-polish/source/{filename}, SHA256 {sha((ROOT/"artwork/kling-polish/source"/filename).read_bytes())}. Original hair silhouette, alpha, lower temple/fringe and rear mass retained; new crown colour only. Original Kling face, ear, anatomy, source anchors and animation timing untouched. Gentle copied from immutable base. scripts/prepare-kling-sculpted-hair.py records registration and paint blend. Not a new source-video layer. Previous banks remain available.'
        files['manifest.json']=json_bytes(m)
        with zipfile.ZipFile(path,'w') as z:
            for name,data in sorted(files.items()):
                info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
        print(json.dumps({'bank':str(path.relative_to(ROOT)),'sha256':sha(path.read_bytes())}),flush=True)

if __name__=='__main__':main()
