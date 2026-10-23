#!/usr/bin/env python3
"""Remove the lower front curl crossing the source cheek; retain the pony mass.

V2's color subtraction created holes in the fine front lock. This alternative
uses a traced silhouette boundary, retaining the original upper sideburn pixels.
"""
import argparse,importlib.util,json,zipfile
from pathlib import Path
from PIL import Image
from kling_wardrobe_common import ROOT,json_bytes,sha
spec=importlib.util.spec_from_file_location('pony_donor',ROOT/'scripts/prepare-kling-volume-hair.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
repairs=json.loads((ROOT/'artwork/kling-collection/source/fit-v2/repairs.json').read_text())
base.OUT=Path('/tmp/kling-pony-occlusion-v3');base.OUT.mkdir(exist_ok=True)
original=base.donors
def donors(style):
    result=original(style)
    for role,rgba,fit in result:
        # A clean sideburn ends at the source earlobe. The discarded extra curl
        # used to divide the original cheek into an isolated peach triangle.
        polygon=[[324,470],[348,470],[374,492],[415,542],[408,583],[327,576],[317,504]] if role=='hair-front' else repairs['hair']['rearFragment']
        rgba[base.mask_polygon(polygon,rgba.shape[0])>0]=0
        Image.fromarray(rgba).save(base.OUT/f'{role}.png')
    return result
base.donors=donors
p=argparse.ArgumentParser();p.add_argument('--prototype',action='store_true');args=p.parse_args()
target=ROOT/'docs/kling-appearance/banks/volume-v3'
base.build('ribbon-pony',args.prototype,target)
if not args.prototype:
    path=target/'female-ribbon-pony.zip'
    with zipfile.ZipFile(path) as z:files={n:z.read(n) for n in z.namelist()}
    m=json.loads(files['manifest.json']);m['id']='kling-female-ribbon-pony-v3'
    m['provenance']+=' V3 source-cheek occlusion revision: remove the traced lower front curl and rear fragment; preserve the upper sideburn and complete original face. Supersedes the V2 color subtraction that made small holes. No source pixels or character geometry are edited. Exact donor polygons: scripts/prepare-kling-pony-occlusion-v3.py.'
    files['manifest.json']=json_bytes(m)
    with zipfile.ZipFile(path,'w') as z:
        for name,data in sorted(files.items()):
            info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
    print(json.dumps({'bank':str(path.relative_to(ROOT)),'sha256':sha(path.read_bytes())}),flush=True)
