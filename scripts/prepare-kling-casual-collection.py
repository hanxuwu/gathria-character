#!/usr/bin/env python3
"""New cloth-only donor banks using the frozen, source-bound fitting rules.

No body redraw, runtime rig change, or legacy bank regeneration. Polygons/axes
are recorded in donors.json; any hidden donor cloth is nearest-cloth completion,
not claimed as an extracted video layer. Source masks own all body occlusion.
"""
import argparse
from functools import lru_cache
import importlib.util
import io
import json
import zipfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

from kling_wardrobe_common import ROOT, load_source, protected_mask, save_garment, sha
from kling_male_limb_ownership import MaleLimbOwnership

SOURCE = ROOT/'artwork/kling-wardrobe/source/casual-collection-v1'
OUT = ROOT/'artwork/kling-wardrobe/prepared/casual-collection-v1'
REVIEW = ROOT/'docs/kling-wardrobe/casual-collection'
DEFINITIONS = json.loads((SOURCE/'donors.json').read_text())
RGB = np.asarray(Image.open(SOURCE/'designs.png').convert('RGB')).astype(np.float32)
YY, XX = np.indices((1056,704),dtype=np.float32)
KEYS = [0,35,51,55,58,62,66,75,78,86,87,104]

def module(filename, name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/filename)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    return mod

def polygon(points, size=None):
    im=Image.new('L',size or (RGB.shape[1],RGB.shape[0]))
    ImageDraw.Draw(im).polygon([tuple(p) for p in points],fill=255)
    return np.asarray(im)>0

@lru_cache(maxsize=12)
def texture(item,region):
    """Padding from plain inner cloth; never extend buttons/ink/skin as stripes."""
    valid=polygon(DEFINITIONS[item][region])
    r,g,b=np.moveaxis(RGB,2,0)
    skin=(r-g>29)&(g-b>22)&(r>145)
    inside=nd.binary_erosion(valid,iterations=3)&~skin
    if item.startswith('cream'):
        plain=inside&(r>170)&(g>155)&(b>135)
    elif item.startswith('forest'):
        plain=inside&(g>r*.93)&(g>b*1.08)&(g>55)&(r<160)
    elif item.startswith('mist'):
        plain=inside&(b>r+14)&(g>r+8)&(b>95)
    else:
        plain=inside&(b>g+8)&(r>g+4)&(g>85)
    assert plain.any(),(item,region)
    indices=nd.distance_transform_edt(~plain,return_distances=False,return_indices=True)
    filled=RGB[tuple(indices)].copy()
    # Discrete nearest donors form Voronoi bands when a bent sleeve samples
    # outside its standing cloth polygon. Smooth only this extrapolated field;
    # every actual inner garment detail remains the generated donor pixel.
    filled=nd.gaussian_filter(filled,sigma=(5,5,0))
    filled[inside]=RGB[inside]
    return filled,inside

def sample(item,region,sx,sy):
    field,_=texture(item,region)
    return np.stack([nd.map_coordinates(field[:,:,c],[sy,sx],order=1,mode='nearest') for c in range(3)],axis=2)

def skirt_source(item):
    d=DEFINITIONS[item];valid=polygon(d['skirt'])
    r,g,b=np.moveaxis(RGB,2,0)
    # These are DONOR-only exclusions inside an authored garment polygon.
    # Original character skin is never deleted by colour.
    skin=(r-g>28)&(g-b>20)&(r>150)
    skin=nd.binary_dilation(skin,iterations=3)
    fabric=((b>r+8)&(g>r+4)) if item.startswith('mist') else ((b>g+5)&(r>g+2))
    keep=valid&~skin
    indices=nd.distance_transform_edt(~keep,return_distances=False,return_indices=True)
    filled=RGB[tuple(indices)].copy()
    sy=np.indices(valid.shape)[0]
    # Retain the real painted hem in a narrow trace envelope, not donor legs.
    edge=nd.binary_dilation(valid&fabric,iterations=2)
    valid[(sy>d['sourceHem'][2]-40)&~edge]=False
    rgba=np.zeros((*valid.shape,4),np.uint8)
    rgba[:,:,:3]=np.clip(filled,0,255).astype(np.uint8)
    rgba[:,:,3]=valid.astype(np.uint8)*255
    return rgba

def bodice(item,frame,tank,points):
    """Painted bodice detail on the existing tank domain and neckline."""
    d=DEFINITIONS[item];wl=points['waistLeft'];wr=points['waistRight'];neck=points['neck']
    wy=wl['y']+(XX-wl['x'])*(wr['y']-wl['y'])/max(1,wr['x']-wl['x'])
    extent=float(np.percentile((YY-wy)[tank],99.9))
    v=np.clip((YY-neck['y']+10)/np.maximum(60,wy+extent-neck['y']+10),0,1)
    center=neck['x']*(1-v)+(wl['x']+wr['x'])*.5*v
    width=max(110,wr['x']-wl['x'])*(1.06-.06*v)
    axis=np.asarray(d['axis']);u=(XX-center)/width
    sx=axis[0,0]*(1-v)+axis[1,0]*v+u*(d['width'][0]*(1-v)+d['width'][1]*v)
    sy=axis[0,1]*(1-v)+axis[1,1]*v
    color=sample(item,'torso',sx,sy)
    # Keep the source-drawn neckline/armhole ink, excluding the old waist hem.
    edge=tank&(nd.distance_transform_edt(tank)<=2)&(v<.85)&(frame[:,:,:3].mean(axis=2)<65)
    color[edge]=frame[edge,:3]
    patch=np.zeros_like(frame);patch[tank,:3]=np.rint(np.clip(color[tank],0,255)).astype(np.uint8);patch[tank,3]=frame[tank,3]
    return patch

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--prototype',action='store_true');parser.add_argument('--character',choices=['male','female']);parser.add_argument('--item',choices=list(DEFINITIONS));args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(parents=True,exist_ok=True)
    provenance=(f'OpenAI image generation clothing donor designs.png SHA256 {sha((SOURCE/"designs.png").read_bytes())}; prompt and tracing axes in artwork/kling-wardrobe/source/casual-collection-v1. '
        'Only generated cloth is fitted offline; generated heads, anatomy, footwear and backdrop are discarded. '
        'Occluded donor cloth is completed from neighbouring garment pixels, not extracted video layers. '
        'Frozen V2 male sleeve ownership and V4 female dress overlap/hem fitting; new painted bodices. '
        'Original source anchors, head, exposed hands, body pixels and animation timing are unchanged. '
        'Per-pose 2D cloth registration, not simulated cloth or a new skeleton; all old banks preserved.')
    audit=[];catalog=[]
    for character in ([args.character] if args.character else ['male','female']):
        source,manifest,config,frames=load_source(character)
        ids=[fid for fid in KEYS if fid in frames] if args.prototype else list(frames)
        if character=='male':
            fit=module('prepare-kling-male-fit-polish.py','casual_male_fit')
            fit.old.DESIGN=SOURCE/'designs.png';fit.old.DONORS=DEFINITIONS
            fit.old.polygon_mask=polygon;fit.old.donor_texture=texture;fit.old.sample=sample
            author=MaleLimbOwnership();registration_bytes=author.registration_bytes;records=author.guides
            bottom_banks={k:fit.read_bank(ROOT/f'docs/kling-wardrobe/garments/male/{k}.zip') for k in ['ochre-chinos-v1','navy-suit-trousers-v1']}
        else:
            fit=module('prepare-kling-dress-fit-v4.py','casual_dress_fit')
            template=zipfile.ZipFile(ROOT/'docs/kling-wardrobe/templates/female.wardrobe-template.zip')
            registration_bytes=template.read('registration.json');registration=json.loads(registration_bytes)
            assert template.read('source.character.zip')==source
            records={r['frameId']:r for r in registration['frames']}
        for item,d in DEFINITIONS.items():
            if d['character']!=character or (args.item and item!=args.item):continue
            prepared={};images=[]
            if character=='female':
                skirt=skirt_source(item);Image.fromarray(skirt).save(OUT/f'{item}-donor-skirt.png')
            for index,fid in enumerate(ids):
                original=frames[fid];rec=records[fid]
                if character=='male':
                    semantic=author.semantic(fid);limbs=author.for_frame(fid,original)
                    patch,owned=fit.prepare_frame(item,original,rec,semantic,limbs,author.points(fid))
                    cloth=semantic['tank'];protected=protected_mask(rec)|semantic['head']|semantic['nearHand']|semantic['farHand']|semantic['shoes']|limbs['neckSkin']
                else:
                    names=['tank','shorts','skin','headNeck','nearArm','farArm','nearHand','farHand']
                    masks={n:np.asarray(Image.open(io.BytesIO(template.read(f'masks/{fid:03d}/{"head" if n=="headNeck" else n}.png'))))>0 for n in names}
                    fit.bodice_patch=lambda frame,tank,material:bodice(item,frame,tank,rec['points'])
                    patch,owned=fit.prepare_frame(original,rec,masks,d,skirt,np.asarray(d['material']))
                    cloth=masks['tank']|masks['shorts'];protected=(protected_mask(rec)&(original[:,:,3]>0))|masks['headNeck']|masks['nearHand']|masks['farHand']
                holes=cloth&owned&(patch[:,:,3]==0)
                # A traced skirt edge may just miss a faint original shorts
                # matte pixel (female source 114 has alpha 25). Cover only that
                # existing cloth fringe from its immediately adjacent new cloth,
                # at its original alpha. Never fill a genuine missing surface.
                edge_coverage=0
                if holes.any():
                    distance,nearest=nd.distance_transform_edt(patch[:,:,3]==0,return_indices=True)
                    fringe=holes&(original[:,:,3]>0)&(original[:,:,3]<=64)&(distance<=2)
                    patch[fringe,:3]=patch[nearest[0][fringe],nearest[1][fringe],:3]
                    patch[fringe,3]=original[fringe,3]
                    edge_coverage=int(fringe.sum());holes=cloth&owned&(patch[:,:,3]==0)
                assert not holes.any(),(item,fid,'uncovered clothing',int(holes.sum()))
                assert not (owned&protected).any(),(item,fid,'protected overlap')
                prepared[fid]=(patch,owned)
                audit.append({'item':item,'frameId':fid,'ownedPixels':int(owned.sum()),'protectedPixelChanges':0,'uncoveredOriginalClothPixels':0,'sourceClothFringeCovered':edge_coverage})
                if fid in KEYS:
                    preview=original.copy()
                    if character=='male':
                        bottom=bottom_banks['navy-suit-trousers-v1' if item.startswith('cream') else 'ochre-chinos-v1'][fid]
                        preview[bottom[1]]=bottom[0][bottom[1]]
                    preview[owned]=patch[owned]
                    image=Image.fromarray(preview);image.save(OUT/f'{item}-{fid:03}.png')
                    images.append((fid,image))
                if index%16==0:print(f'{item}: {index+1}/{len(ids)}',flush=True)
            board=Image.new('RGB',(352*4,550*((len(images)+3)//4)),'#eee9df');draw=ImageDraw.Draw(board)
            for i,(fid,im) in enumerate(images):
                x=i%4*352;y=i//4*550;small=im.resize((352,528),Image.Resampling.LANCZOS);board.paste(small,(x,y+22),small);draw.text((x+8,y+4),f'{item} / {fid}',fill='#354638')
            board.save(OUT/f'{item}-contact.jpg',quality=95)
            if not args.prototype:
                result=save_garment(character,item,d['name'],d['slot'],registration_bytes,prepared,provenance)
                # Decode every saved crop and assert it is exactly the authored RGBA and ownership.
                reader=module('prepare-kling-male-fit-polish.py','casual_bank_reader')
                written=reader.read_bank(ROOT/f'docs/kling-wardrobe/garments/{character}/{item}.zip')
                assert set(written)==set(prepared)
                for fid in written:
                    assert np.array_equal(written[fid][0],prepared[fid][0])
                    assert np.array_equal(written[fid][1],prepared[fid][1])
                catalog.append(result)
    report={'prototype':args.prototype,'donorSha256':sha((SOURCE/'designs.png').read_bytes()),'definitionsSha256':sha((SOURCE/'donors.json').read_bytes()),'items':catalog,'poses':audit}
    (OUT/('prototype-audit.json' if args.prototype else f'asset-audit-{args.item or args.character or "all"}.json')).write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'prototype':args.prototype,'items':catalog,'checkedPoses':len(audit)}),flush=True)

if __name__=='__main__':main()
