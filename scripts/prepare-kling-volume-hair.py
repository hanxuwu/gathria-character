#!/usr/bin/env python3
"""Six separately loadable hair banks; released appearance banks stay immutable."""
import argparse
import copy
import importlib.util
import io
import json
import zipfile

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

from kling_wardrobe_common import ROOT, load_source, json_bytes, png_bytes, sha
from kling_hair_ear_fit import fit_ear_hair, blur_hair

SOURCE=ROOT/'artwork/kling-collection/source/volume-v1'
OUT=ROOT/'artwork/kling-collection/prepared/volume-v1'
DEFINITIONS=json.loads((SOURCE/'hair-donors.json').read_text())
spec=importlib.util.spec_from_file_location('released_hair_packing',ROOT/'scripts/append-kling-hair-expansion.py')
released=importlib.util.module_from_spec(spec);spec.loader.exec_module(released)


def bounded_layout(entries, remaining_pages, remaining_pixels, max_page_pixels=24*1024*1024):
    """Choose a bounded shelf layout for NEW patches, retaining original pages."""
    candidates = []
    for width in (1536, 1792, 2048, 2560, 3072, 4096):
        for height_limit in (4096, 6144, 8192):
            packed = []
            heights = []
            x = y = row_h = page = 0
            for index in sorted(range(len(entries)), key=lambda i: (-entries[i][1].shape[0], -entries[i][1].shape[1], i)):
                h, w = entries[index][1].shape[:2]
                if x + w > width:
                    x = 0
                    y += row_h
                    row_h = 0
                if y + h > height_limit:
                    heights.append(y + row_h)
                    page += 1
                    x = y = row_h = 0
                packed.append((index, page, x, y))
                x += w + 2
                row_h = max(row_h, h + 2)
            heights.append(y + row_h)
            pixels = width * sum(heights)
            if len(heights) <= remaining_pages and pixels <= remaining_pixels and max(width*h for h in heights) <= max_page_pixels:
                candidates.append((pixels, len(heights), width, heights, packed))
    if not candidates:
        raise ValueError('New artwork exceeds existing bank limits; do not reduce source resolution or overwrite released pages.')
    return min(candidates, key=lambda item: (item[0], item[1], item[2]))


def mask_polygon(points,size=512):
    im=Image.new('L',(size*4,size*4));ImageDraw.Draw(im).polygon([(round(x*4),round(y*4)) for x,y in points],fill=255)
    return np.asarray(im.resize((size,size),Image.Resampling.BOX))


def donors(style):
    d=DEFINITIONS[style];size=d.get('tileSize',512);x,y=np.asarray(d['tile'])*size
    source=np.asarray(Image.open(SOURCE/d.get('image','hair-design.png')).convert('RGBA'))[y:y+size,x:x+size].copy()
    boundary=d['frontBoundary']
    frontmask=mask_polygon([(0,0),(size,0),*reversed(boundary)],size)
    if d.get('frontCap'):
        # The high tail belongs to the rear layer; do not duplicate it in the
        # front cap or clip its uncompressed silhouette at the left canvas.
        cap=mask_polygon(d['frontCap'],size)
        frontmask=np.minimum(frontmask,cap)
    for p in d.get('frontExtras',[]): frontmask=np.maximum(frontmask,mask_polygon(p,size))
    for p in d.get('frontGaps',[]): frontmask[mask_polygon(p,size)>0]=0
    rearmask=np.zeros_like(frontmask)
    for p in d['rearPolygons']: rearmask=np.maximum(rearmask,mask_polygon(p,size))
    a,b=np.asarray(d['eyes'],float)
    c,e=np.asarray(((380,400),(501,403)) if d['character']=='male' else ((379,377),(499,378)),float)
    sx=(e[0]-c[0])/(b[0]-a[0]); sy=sx*d['verticalScale']
    fit=np.asarray([[sx,0,c[0]-sx*a[0]],[0,sy,c[1]-sy*a[1]]])
    result=[]
    for role,mask in [('hair-back',rearmask),('hair-front',frontmask)]:
        rgba=source.copy()
        rgba[:,:,3]=np.rint(rgba[:,:,3].astype(float)*mask/255).astype(np.uint8)
        # Generated donor skin only: remove trace-edge AA peach remnants, never
        # source skin, eyes, face or ears. Pale ribbon pixels stay unaffected.
        r,g,b=np.moveaxis(rgba[:,:,:3].astype(float),2,0)
        skin=(r>190)&(g>110)&(r-g>38)&(g-b>27)
        inside=mask>0; edge=cv2.distanceTransform(inside.astype(np.uint8),cv2.DIST_L2,5)<10
        rgba[skin&edge,3]=0
        if role=='hair-back' and d.get('rearBridge'):
            # Supplementary hidden hair underneath the original ear: complete
            # the donor's ear cutout using adjacent REAR HAIR only. No donor
            # skin survives and no approved ear is repainted by a back layer.
            bridge=mask_polygon(d['rearBridge'],size)>0
            hair=(rgba[:,:,3]>220)&~skin
            nearest=nd.distance_transform_edt(~hair,return_distances=False,return_indices=True)
            rgba[bridge,:3]=rgba[nearest[0][bridge],nearest[1][bridge],:3]
            rgba[bridge,3]=255
        n,labels,stats,_=cv2.connectedComponentsWithStats((rgba[:,:,3]>8).astype(np.uint8),8)
        if n>1:
            # A front hairstyle is one attached mass. Disconnected generated
            # brow specks/neighbor-cell wisps are not authored hair components.
            keep=(labels==(1+np.argmax(stats[1:,4]))) if role=='hair-front' else (np.isin(labels,np.flatnonzero(stats[:,4]>30))&(labels!=0))
            rgba[~keep]=0
        rgba[rgba[:,:,3]==0]=0
        Image.fromarray(rgba).save(OUT/f'{style}-{role}-cutout.png')
        localfit=fit.copy()
        if role=='hair-back' and d['character']=='male':
            # The donor ear opening is wider than the original ear. Tuck the
            # new rear locks behind that ear instead of leaving a scalp gap.
            localfit[0,2]+=18
        if style=='ribbon-pony' and role=='hair-back':
            # Compact only the new rear ponytail about its tie/root. The
            # approved head/front fringe and native output size stay fixed.
            localfit[0,0]*=.90
            localfit[0,2]+=fit[0,0]*.10*300
        result.append((role,rgba,localfit))
    return result


def add(entries,layer,fid,rgba,owned,offset):
    yy,xx=np.where(owned);x,y=int(xx.min()),int(yy.min());w,h=int(xx.max()+1-x),int(yy.max()+1-y)
    crop=rgba[y:y+h,x:x+w].copy();own=owned[y:y+h,x:x+w].copy();crop[~own]=0
    f={'frameId':fid,'mode':'paint','page':0,'rect':{'x':0,'y':0,'width':w,'height':h},'offset':{'x':x+offset[0],'y':y+offset[1]}}
    layer['frames'].append(f);entries.append((f,crop,own))


def build(style,prototype=False):
    d=DEFINITIONS[style];char=d['character'];OUT.mkdir(parents=True,exist_ok=True)
    original_path=ROOT/f'docs/kling-appearance/banks/{char}.zip'
    with zipfile.ZipFile(original_path) as z:
        before=json.loads(z.read('manifest.json'))
        manifest=copy.deepcopy(before); oldpages={}
        gentle=copy.deepcopy(next(s for s in before['styles'] if s['id']=='gentle'))
        for layer in gentle['layers']:
            for f in layer['frames']:
                if f['mode']=='paint' and f['page'] not in oldpages:
                    p=before['pages'][f['page']]
                    oldpages[f['page']]=(np.asarray(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA')),
                                         np.asarray(Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA'))[:,:,3]>0)
    heads=json.loads((ROOT/f'artwork/kling-appearance/registration/{char}.json').read_text())
    reference=next(r for r in heads['frames'] if r['frameId']==0)
    padding=manifest['padding'];size=(768,1184);poses={p['frameId']:p for p in manifest['poses']}
    entries=[];layers=[];previews={}; selected={0,55,78,86,88,104}
    for role,art,fit in donors(style):
        layer={'role':role,'frames':[]}
        for row in heads['frames']:
            fid=row['frameId']
            if prototype and fid not in selected:continue
            transform=(np.vstack([row['headTransform'],[0,0,1]])@np.vstack([fit,[0,0,1]]))[:2]
            transform[:,2]+=[padding['left'],padding['top']]
            rgba=released.original.warp_rgba(art,transform,size)
            ear=reference['featureGuides']['earTop']
            overlap={'center':(ear['x']+2,ear['y']+5),'radii':(100.,120.),'displacement':d['overlap']} if role=='hair-front' else None
            rgba=fit_ear_hair(art,fit,row,reference,padding,size,rgba,overlap)
            blur={88:.65,89:1.6,90:1.8,91:.7,100:.6,101:1.6,102:1.6,103:.65}.get(fid,0)
            rgba=blur_hair(rgba,blur);owned=rgba[:,:,3]>0
            assert owned.any() and not owned[[0,-1],:].any() and not owned[:,[0,-1]].any(),(style,role,fid,'clipped')
            add(entries,layer,fid,rgba,owned,(-32,-128))
            f=layer['frames'][-1];r=f['rect'];o=f['offset'];b=poses[fid]['hairBounds']
            left,top=min(b['x'],o['x']),min(b['y'],o['y']);right=max(b['x']+b['width'],o['x']+r['width']);bottom=max(b['y']+b['height'],o['y']+r['height'])
            poses[fid]['hairBounds']={'x':left,'y':top,'width':right-left,'height':bottom-top}
            if fid in selected:previews.setdefault(fid,{})[role]=rgba
        layers.append(layer)
    _,_,_,source_frames=load_source(char)
    tiles=[]
    for fid,p in previews.items():
        back=Image.fromarray(p['hair-back']);base=Image.new('RGBA',size);base.alpha_composite(back);base.alpha_composite(Image.fromarray(source_frames[fid]),(32,128))
        front=p['hair-front'].copy();pose=poses[fid];h=pose.get('hairOcclusionBounds',pose['headBounds'])
        opaque=np.zeros((1184,768),bool);opaque[128:1184,32:736]=source_frames[fid][:,:,3]>0
        head=np.zeros_like(opaque);head[max(0,int(h['y'])+128):int(h['y']+h['height'])+128,max(0,int(h['x'])+32):int(h['x']+h['width'])+32]=True
        front[opaque&~head,3]=0
        mask=Image.new('L',size);draw=ImageDraw.Draw(mask)
        for poly in pose['foreground']:draw.polygon([(p['x']+32,p['y']+128) for p in poly],fill=255)
        front[(np.asarray(mask)>0)&opaque,3]=0
        base.alpha_composite(Image.fromarray(front));base.save(OUT/f'{style}-{fid:03}-offline.png')
        tile=Image.new('RGB',(384,612),'#eeeadf');small=base.resize((384,592),Image.Resampling.LANCZOS);tile.paste(small,(0,20),small);ImageDraw.Draw(tile).text((8,4),f'{style} / {fid} / OFFLINE',fill='#344438');tiles.append(tile)
    sheet=Image.new('RGB',(384*3,612*((len(tiles)+2)//3)),'#eeeadf')
    for i,tile in enumerate(tiles):sheet.paste(tile,((i%3)*384,(i//3)*612))
    sheet.save(OUT/f'{style}-contact.jpg',quality=94)
    if prototype:return
    # Gentle is copied crop-for-crop, without regenerating its original pixels.
    for layer in gentle['layers']:
        for f in layer['frames']:
            if f['mode']=='source':continue
            patch,mask=oldpages[f['page']];r=f['rect'];s=np.s_[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
            entries.append((f,patch[s].copy(),mask[s].copy()))
    pixels,_,width,heights,packed=bounded_layout(entries,8,64*1024*1024,(12 if char=='female' else 24)*1024*1024)
    # Bound individual decoded pages too, to allow three selected cloth layers
    # alongside hair without increasing the runtime cache.
    if max(width*h for h in heights)>24*1024*1024:
        raise ValueError(f'{style}: page working set needs a smaller layout')
    files={};pages=[]
    for page,height in enumerate(heights):
        atlas=np.zeros((height,width,4),np.uint8);mask=np.zeros_like(atlas)
        for index,target,x,y in packed:
            if target!=page:continue
            f,crop,owned=entries[index];h,w=crop.shape[:2];f['page']=page;f['rect'].update(x=x,y=y)
            atlas[y:y+h,x:x+w]=crop;mask[y:y+h,x:x+w,3]=owned.astype(np.uint8)*255
        file,mfile=f'patches-{page}.png',f'ownership-{page}.png';files[file]=png_bytes(atlas);files[mfile]=png_bytes(mask)
        pages.append({'file':file,'maskFile':mfile,'width':width,'height':height})
    manifest.update(id=f'kling-{char}-{style}-v1',name=d['name']+' and Gentle',pages=pages,styles=[{'id':style,'name':d['name'],'slot':'hair','layers':layers},gentle],
                    provenance=f'OpenAI image generation 2026-10-23; new volume hair only, artwork/kling-collection/source/volume-v1/{d.get("image","hair-design.png")} SHA256 {sha((SOURCE/d.get("image","hair-design.png")).read_bytes())}. Reviewed front/rear donor polygons and source-eye fit in hair-donors.json. Generated faces/ears/body discarded; hidden rear-hair overlap under the original ear supplemented from adjacent donor hair, not recovered video layers. Local near-ear motion fitting and released source head transforms retained. Gentle pixels copied from immutable bank {sha(original_path.read_bytes())}; no original source pixel, body proportion, timing or anchor rescaled. Independently loaded appearance bank schema V1, not a replacement for released banks.')
    files['manifest.json']=json_bytes(manifest);assert sum(map(len,files.values()))<=64*1024*1024
    target=ROOT/f'docs/kling-appearance/banks/volume/{char}-{style}.zip';target.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(target,'w') as z:
        for name,data in sorted(files.items()):
            info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
    print(json.dumps({'style':style,'frames':len(poses),'pages':len(pages),'pixels':pixels,'bytes':target.stat().st_size,'sha256':sha(target.read_bytes())}),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--style',choices=list(DEFINITIONS));p.add_argument('--prototype',action='store_true');args=p.parse_args()
    for style in ([args.style] if args.style else DEFINITIONS):build(style,args.prototype)
