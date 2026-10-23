#!/usr/bin/env python3
"""Nine cloth donors fitted by the released source-bound garment pipeline.

Only traced generated cloth is sampled. Faces, anatomy and motion stay sourced
from the immutable Kling packs. Occluded donor cloth is authored completion.
"""
import argparse
from functools import lru_cache
import importlib.util
import json
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

from kling_wardrobe_common import ROOT, save_garment, sha

SOURCE = ROOT/'artwork/kling-collection/source/volume-v1'
OUT = ROOT/'artwork/kling-collection/prepared/volume-v1'
REVIEW = ROOT/'docs/kling-collection/volume-v1'
RAW = json.loads((SOURCE/'cloth-donors.json').read_text())
spec = importlib.util.spec_from_file_location('released_casual_fitting', ROOT/'scripts/prepare-kling-casual-collection.py')
base = importlib.util.module_from_spec(spec); spec.loader.exec_module(base)


def definition(item):
    d = dict(RAW[item])
    im = Image.open(SOURCE/d['image'])
    sx, sy = np.asarray(im.size)/np.asarray(d['traceSize'])
    for key in ('torso','near','far','axis','nearChain','farChain','skirt'):
        if key in d: d[key] = [[x*sx,y*sy] for x,y in d[key]]
    for key in ('width','nearWidth','farWidth'):
        if key in d: d[key] = [v*sx for v in d[key]]
    for key in ('waist','sourceHem'):
        if key in d: d[key] = [d[key][0]*sx,d[key][1]*sx,d[key][2]*sy]
    d['exclude'] = [[[x*sx,y*sy] for x,y in p] for p in d.get('exclude',[])]
    return d


@lru_cache(maxsize=9)
def image(item):
    return np.asarray(Image.open(SOURCE/RAW[item]['image']).convert('RGBA'))


def polygon(item, points):
    h,w=image(item).shape[:2]
    mask=Image.new('L',(w,h)); ImageDraw.Draw(mask).polygon([tuple(p) for p in points],fill=255)
    return np.asarray(mask)>0


@lru_cache(maxsize=27)
def texture(item,region):
    rgba=image(item); rgb=rgba[:,:,:3].astype(np.float32); d=definition(item)
    valid=polygon(item,d[region])&(rgba[:,:,3]>200)
    inside=nd.binary_erosion(valid,iterations=3)
    # Plain material fills ONLY beyond the traced donor surface. Real collar,
    # cables, piping, embroidery and placket pixels remain inside that surface.
    distance=np.linalg.norm(rgb-np.asarray(d['material']),axis=2)
    plain=inside&(distance<65)
    if plain.sum()<20: plain=inside&(rgb.mean(axis=2)>80)
    assert plain.any(),(item,region)
    indices=nd.distance_transform_edt(~plain,return_distances=False,return_indices=True)
    filled=nd.gaussian_filter(rgb[tuple(indices)],sigma=(5,5,0))
    filled[inside]=rgb[inside]
    return filled,inside


def sample(item,region,sx,sy):
    field,_=texture(item,region)
    return np.stack([nd.map_coordinates(field[:,:,c],[sy,sx],order=1,mode='nearest') for c in range(3)],axis=2)


def skirt_source(item):
    rgba=image(item); rgb=rgba[:,:,:3].astype(float); d=definition(item)
    valid=polygon(item,d['skirt'])
    excluded=np.zeros(valid.shape,bool)
    for p in d['exclude']: excluded |= polygon(item,p)
    # Explicit donor-hand traces avoid color-based deletion of honey/rose cloth.
    r,g,b=np.moveaxis(rgb,2,0)
    skin=(r>190)&(g>105)&(r-g>32)&(g-b>24)&(g-b<80)
    skin=nd.binary_dilation(skin,iterations=2)
    keep=valid&~nd.binary_dilation(excluded,iterations=2)&~skin&(rgba[:,:,3]>200)
    # The lowest scallops touch donor legs. Refine only that traced hem, never
    # the approved source body; do not carry peach donor triangles into cloth.
    yy=np.indices(valid.shape)[0]
    valid[(yy>d['sourceHem'][2]-32)&skin]=False
    nearest=nd.distance_transform_edt(~keep,return_distances=False,return_indices=True)
    filled=rgb[tuple(nearest)]
    result=np.zeros_like(rgba); result[:,:,:3]=np.rint(filled).astype(np.uint8)
    result[:,:,3]=valid.astype(np.uint8)*255
    # Retain anti-aliased exterior hem where the source actually has alpha.
    hem_edge=(yy>d['sourceHem'][2]-30)&valid&~excluded
    result[hem_edge,3]=rgba[hem_edge,3]
    return result


def main():
    p=argparse.ArgumentParser(); p.add_argument('--item',choices=list(RAW)); p.add_argument('--prototype',action='store_true'); args=p.parse_args()
    OUT.mkdir(parents=True,exist_ok=True); REVIEW.mkdir(parents=True,exist_ok=True)
    base.OUT=OUT; base.REVIEW=REVIEW
    def save(character,item,name,slot,registration,prepared,_legacy_provenance):
        donor=SOURCE/RAW[item]['image']
        provenance=(f'OpenAI image generation 2026-10-23, cloth donor {donor.relative_to(ROOT)} SHA256 {sha(donor.read_bytes())}. '
                    'Exact prompt and reviewed cloth-only polygons/axes: artwork/kling-collection/source/volume-v1. '
                    'Generated anatomy and background discarded; hidden donor cloth completed from adjacent cloth pixels. '
                    'Released male V2 sleeve ownership and female V4 skirt fitting, new painted bodices. '
                    'Original source head, exposed hands, body proportions, anchors and animation timing unchanged. '
                    'Offline registered 2D cloth drawings, not video-extracted layers or simulated cloth.')
        return save_garment(character,item,name,slot,registration,prepared,provenance)
    base.save_garment=save
    # Released fitting records provenance using designs.png. A temporary source
    # view points at the exact per-character donor; original donor files stay put.
    for item in ([args.item] if args.item else RAW):
        d=definition(item); folder=OUT/('source-'+d['character']); folder.mkdir(exist_ok=True)
        (folder/'designs.png').write_bytes((SOURCE/d['image']).read_bytes())
        (folder/'donors.json').write_text(json.dumps({item:d},indent=2)+'\n')
        base.SOURCE=folder; base.DEFINITIONS={item:d}
        base.RGB=image(item)[:,:,:3].astype(np.float32)
        base.texture=texture; base.sample=sample; base.skirt_source=skirt_source
        sys.argv=['prepare-kling-volume-clothes.py','--character',d['character'],'--item',item]+(['--prototype'] if args.prototype else [])
        base.main()


if __name__=='__main__': main()
