#!/usr/bin/env python3
"""Bake source-faithful sleeveless separates for the two registered Kling bodies.

No face, arm, leg, silhouette, timing or source image is repainted. Top artwork
comes from the recorded imagegen design, sampled in a registered torso surface.
Shorts and shoe variants retain the original material contours and shading.
"""
import argparse
import json
from functools import lru_cache
from pathlib import Path
import numpy as np
from scipy import ndimage as nd
from PIL import Image, ImageDraw, ImageFont
from kling_wardrobe_common import ROOT, load_source, protected_mask, save_garment, sha

DESIGN=ROOT/'artwork/kling-wardrobe/source/outfit-designs.png'
@lru_cache(maxsize=1)
def formal_detail():
    x0,y0,x1,y1=(675,305,853,499)
    tex=np.asarray(Image.open(DESIGN).convert('RGB'))[y0:y1,x0:x1].astype(float)
    detail=Image.new('L',(1024,1536));d=ImageDraw.Draw(detail)
    d.polygon([(742,322),(786,322),(807,332),(803,355),(786,385),(763,363),(741,342)],fill=255)
    d.polygon([(783,393),(798,395),(799,473),(780,473),(779,399)],fill=255)
    d.rectangle((708,437,749,453),fill=255)
    d.rectangle((818,438,837,449),fill=255)
    return tex,np.asarray(detail)[y0:y1,x0:x1].astype(float)/255

def masked_rgb(original, mask, target, exponent):
    """Material remap, preserving drawn seams/contours and each pose's shading."""
    rgb=original[:,:,:3].astype(np.float32); luma=rgb[:,:,0]*.2126+rgb[:,:,1]*.7152+rgb[:,:,2]*.0722
    median=float(np.median(luma[mask])); brightness=np.clip(luma/max(median,1),.08,1.8)**exponent
    mapped=np.minimum(255,np.array(target)[None,None,:]*brightness[:,:,None])
    # Original dark outlines keep their line weight and near-neutral warm hue.
    dark=np.clip((luma-16)/15,0,1)[:,:,None]
    return np.rint(mapped*dark+rgb*(1-dark)).astype(np.uint8)

def top_rgb(original,mask,points,item):
    if item=='teal-top':
        return masked_rgb(original,mask,(84,130,135),.85)
    # Keep source-drawn garment volume. Transfer only the designed front panel
    # and tailoring details, not an extrapolated standing silhouette/armhole.
    tex,detail=formal_detail();h,w=tex.shape[:2]
    yy,xx=np.indices(mask.shape); ys,xs=np.where(mask)
    wl=points['waistLeft'];wr=points['waistRight'];neck=points['neck']
    # Coordinate field follows the chest axis. Foreground arms may split the
    # mask into islands, but do not change this mapping or move printed details.
    bottom=(wl['y']+wr['y'])/2+8; top=min(float(ys.min()),neck['y']-8)
    v=np.clip((yy-top)/max(55,bottom-top),0,1)
    waist_center=(wl['x']+wr['x'])/2
    center=(neck['x']-5)*(1-v)+waist_center*v
    width=max(115,wr['x']-wl['x'])
    u=np.clip((xx-center)/width+.5,0,1)
    tv=v*1.13-.18
    sampled=np.stack([nd.map_coordinates(tex[:,:,c],[tv*(h-1),u*(w-1)],order=1,mode='nearest') for c in range(3)],axis=2)
    blend=nd.map_coordinates(detail,[tv*(h-1),u*(w-1)],order=1,mode='constant',cval=0)[:,:,None]
    rgb=original[:,:,:3].astype(np.float32);luma=rgb[:,:,0]*.2126+rgb[:,:,1]*.7152+rgb[:,:,2]*.0722
    median=float(np.median(luma[mask]));light=np.clip(luma/max(median,1),.55,1.12)
    # Keep moving source creases, while source-art buttons/collar/piping supply
    # the garment design. This avoids a flat pasted texture over a moving body.
    sampled*=((.68+.32*light)[:,:,None])
    # Keep the actual outer/occluding dark lines, never change skin-owned pixels.
    base=masked_rgb(original,mask,(43,53,75),.9)
    return np.rint(np.clip(sampled*blend+base*(1-blend),0,255)).astype(np.uint8)

def get_mask(base,frame_id,name):
    candidates=[base/f'{frame_id:03}-{name}.png',base/f'{frame_id:03d}'/f'{name}.png',base/f'{frame_id}'/f'{name}.png']
    for p in candidates:
        if p.exists(): return np.asarray(Image.open(p).convert('L'))>0
    raise FileNotFoundError(candidates)

def main():
    p=argparse.ArgumentParser();p.add_argument('--character',choices=['male','female'],default='male');p.add_argument('--registration');p.add_argument('--masks');p.add_argument('--preview-only',action='store_true');args=p.parse_args()
    char=args.character
    reg_path=Path(args.registration) if args.registration else ROOT/f'docs/kling-wardrobe/registration/{char}.json'
    reg_bytes=reg_path.read_bytes();reg=json.loads(reg_bytes)
    masks=Path(args.masks) if args.masks else ROOT/f'artwork/kling-wardrobe/registration/{char}/masks'
    _,manifest,_,frames=load_source(char); guides={f['frameId']:f for f in reg['frames']}
    output=ROOT/f'artwork/kling-wardrobe/prepared/{char}-separates';output.mkdir(parents=True,exist_ok=True)
    preview_ids=[0,28,39,51,58,62,74,87,96,104,121]
    preview_ids=[i for i in preview_ids if i in frames]
    previews={i:frames[i].copy() for i in preview_ids};formal={i:frames[i].copy() for i in preview_ids}
    items=[('ochre-shorts','Ochre cotton shorts','bottom','shorts',(197,137,61),.7),('navy-shorts','Navy tailored shorts','bottom','shorts',(39,48,67),.9),('brown-shoes','Brown formal shoes','shoes','shoes',(127,80,49),1.9),('teal-top','Teal cotton top','top','tank',None,None),('navy-waistcoat','Navy wedding waistcoat','top','tank',None,None)]
    catalog=[];audit=[]
    for item_id,name,slot,region,target,exponent in items:
        patches={}
        for frame_id,original in frames.items():
            guide=guides[frame_id];owned=get_mask(masks,frame_id,region)
            protected=protected_mask(guide)
            owned &= ~protected # visible head/hand protection wins, even at a mask edge
            owned &= original[:,:,3]>0
            assert owned.any(),(frame_id,region)
            rgb=top_rgb(original,owned,guide['points'],item_id) if slot=='top' else masked_rgb(original,owned,target,exponent)
            patch=np.zeros_like(original);patch[owned,:3]=rgb[owned];patch[owned,3]=original[owned,3]
            patches[frame_id]=(patch,owned)
            if frame_id in previews:
                destination=previews if item_id in ('ochre-shorts','teal-top') else formal
                destination[frame_id][owned]=patch[owned]
            audit.append({'item':item_id,'frameId':frame_id,'ownedPixels':int(owned.sum()),'protectedPixelsChanged':0})
        provenance=(f'Offline wardrobe preparation for unchanged Kling {char} source sprites. '
            f'OpenAI image-generation garment reference artwork/kling-wardrobe/source/outfit-designs.png SHA256 {sha(DESIGN.read_bytes())}; '
            'generated faces/bodies/background are discarded. The waistcoat samples recorded garment details into frame-specific torso ownership; the teal top, shorts and shoes are explicitly palette/material variants of original contours. '
            'Native RGBA silhouette, face, skin, frame order/timing and source anchor remain unchanged. '
            'Registered guide points include observed and inferred estimates, not original skeletal data. No runtime drawing API.')
        if not args.preview_only:catalog.append(save_garment(char,item_id,name,slot,reg_bytes,patches,provenance))
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
    for label,collection in [('day',previews),('wedding',formal)]:
        cell=(352,560);sheet=Image.new('RGB',(cell[0]*4,cell[1]*((len(collection)+3)//4)),'#efece2');d=ImageDraw.Draw(sheet)
        for i,(fid,a) in enumerate(collection.items()):
            im=Image.fromarray(a);im.save(output/f'{label}-{fid:03}.png');im=im.resize((352,528),Image.Resampling.NEAREST)
            x=(i%4)*cell[0];y=(i//4)*cell[1];sheet.paste(im,(x,y+28),im);d.text((x+8,y+4),f'{char} {label} / source {fid}',fill='#303d34',font=font)
        sheet.save(output/f'{label}-contact.png')
    (output/'catalog-items.json').write_text(json.dumps(catalog,indent=2)+'\n')
    (output/'ownership-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
    print(json.dumps({'character':char,'items':catalog,'review':str(output)},indent=2))

if __name__=='__main__':main()
