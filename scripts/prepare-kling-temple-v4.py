#!/usr/bin/env python3
"""Register supplementary temple artwork without painting the Kling face/ear.

The generated portrait is only a hair donor. Its face/body are discarded. The
released pony's rear mass and original source pose transforms are retained.
"""
import argparse, copy, importlib.util, json, zipfile
from pathlib import Path
import numpy as np
from PIL import Image
from kling_wardrobe_common import ROOT, json_bytes, sha

spec=importlib.util.spec_from_file_location('temple_volume', ROOT/'scripts/prepare-kling-volume-hair.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
SOURCE=ROOT/'artwork/kling-refinement/source'
OUT=Path('/tmp/kling-temple-v4'); OUT.mkdir(parents=True,exist_ok=True)
base.OUT=OUT
original=base.donors
# Boundary follows actual HAIR; it does not trace a replacement cheek or ear.
BOUNDARY=[(0,690),(418,690),(434,680),(455,670),(480,666),(511,668),
 (544,677),(570,694),(588,715),(590,747),(602,771),(622,788),(652,795),
 (637,778),(629,758),(630,731),(638,703),(655,672),(678,642),
 (709,613),(749,584),(791,552),(828,517),(862,473),(885,422),
 (900,389),(916,379),(944,383),(972,400),(995,432),(1008,466),
 (1014,502),(1013,538),(1003,568),(981,594),(967,604),
 (997,596),(1025,574),(1044,545),(1052,526),(1071,549),(1090,576),
 (1106,610),(1114,644),(1114,682),(1118,716),(1137,737),(1178,723),(1254,736)]

def donors(style):
    previous=original(style)
    result=[]
    for role,rgba,fit in previous:
        if role=='hair-back':
            repairs=json.loads((ROOT/'artwork/kling-collection/source/fit-v2/repairs.json').read_text())
            rgba[base.mask_polygon(repairs['hair']['rearFragment'],rgba.shape[0])>0]=0
        else:
            previous_front=rgba.copy();previous_fit=fit.copy()
            rgba=np.asarray(Image.open(SOURCE/'pony-temple-donor.png').convert('RGBA')).copy()
            size=rgba.shape[0]
            mask=base.mask_polygon([(0,0),(size,0),*reversed(BOUNDARY)],size)
            cap=np.asarray(base.DEFINITIONS[style]['frontCap'])*size/724
            mask=np.minimum(mask,base.mask_polygon(cap.tolist(),size))
            rgba[:,:,3]=np.rint(rgba[:,:,3].astype(float)*mask/255).astype(np.uint8)
            # Explicit traced ownership excludes the portrait's skin and brows.
            # No global skin-color erasure is applied to the painted hair.
            sx=120/(1051-832);sy=sx*.98
            new_fit=np.asarray([[sx,0,379-sx*832],[0,sy,377-sy*700]],float)
            # Retain the released crown, fringe and output footprint exactly.
            # Only the local temple supplement is registered into the old donor.
            transform=(np.linalg.inv(np.vstack([previous_fit,[0,0,1]])) @ np.vstack([new_fit,[0,0,1]]))[:2]
            replacement=base.released.original.warp_rgba(rgba,transform,(724,724))
            yy,xx=np.indices((724,724))
            weight=np.minimum(np.clip((yy-345)/28,0,1),np.clip((xx-205)/22,0,1))
            weight*=np.clip((440-xx)/22,0,1)
            weight*=np.clip((605-yy)/20,0,1)
            a=previous_front.astype(float)/255;b=replacement.astype(float)/255
            a[:,:,:3]*=a[:,:,3:4];b[:,:,:3]*=b[:,:,3:4]
            blended=a*(1-weight[:,:,None])+b*weight[:,:,None]
            blended[:,:,:3]=np.divide(blended[:,:,:3],blended[:,:,3:4],out=np.zeros_like(blended[:,:,:3]),where=blended[:,:,3:4]>0)
            rgba=previous_front.copy();region=weight>0
            rgba[region]=np.clip(np.rint(blended[region]*255),0,255).astype(np.uint8)
            fit=previous_fit
        rgba[rgba[:,:,3]==0]=0
        Image.fromarray(rgba).save(OUT/f'{role}.png')
        result.append((role,rgba,fit))
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('--prototype',action='store_true');a=p.parse_args()
    base.donors=donors
    base.DEFINITIONS=copy.deepcopy(base.DEFINITIONS)
    base.DEFINITIONS['ribbon-pony']['overlap']=[2,6]
    target=ROOT/'docs/kling-appearance/banks/volume-v4'
    base.build('ribbon-pony',a.prototype,target)
    if a.prototype:return
    path=target/'female-ribbon-pony.zip'
    with zipfile.ZipFile(path) as z:files={n:z.read(n) for n in z.namelist()}
    m=json.loads(files['manifest.json']);m['id']='kling-female-ribbon-pony-v4'
    m['provenance']=(f'Supplementary OpenAI image edit, 2026-10-23: artwork/kling-refinement/source/pony-temple-donor.png SHA256 {sha((SOURCE/"pony-temple-donor.png").read_bytes())}. Short smoothly tapered temple lock replaces the cut lower curl. Generated face, ear and body discarded. Rear pony mass retained from V3; source face/ear pixels, head registration, all poses and Gentle state retained. Hair-only polygons and fit: scripts/prepare-kling-temple-v4.py. Not an extracted source-video layer. Old banks remain immutable.')
    files['manifest.json']=json_bytes(m)
    with zipfile.ZipFile(path,'w') as z:
        for name,data in sorted(files.items()):
            info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
    print(json.dumps({'bank':str(path.relative_to(ROOT)),'sha256':sha(path.read_bytes())}),flush=True)

if __name__=='__main__':main()
