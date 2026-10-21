#!/usr/bin/env python3
"""Source-preserving male top fitting V2; old archives remain immutable.

Reuses the recorded painted garment donor. Fixes source-shirt interior ink,
separate shoulder coordinate domains and compressed collar/fold registration.
This prepares cloth only; it never transforms a Kling source pixel or anchor.
"""
import argparse
import importlib.util
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as nd

from kling_wardrobe_common import ROOT, load_source, protected_mask, save_garment, sha
from kling_male_limb_ownership import MaleLimbOwnership

spec = importlib.util.spec_from_file_location('frozen_male_tops', ROOT/'scripts/prepare-kling-male-tops.py')
old = importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
OUT=ROOT/'artwork/kling-wardrobe/prepared/fit-polish/male'
XX,YY=old.XX,old.YY
ITEMS={'day':('teal-camp-shirt-v1','teal-camp-shirt-v2','Teal camp shirt'),
       'wedding':('navy-suit-jacket-v1','navy-suit-jacket-v2','Navy wedding suit jacket')}
KEYS=[0,28,51,58,62,64,74,87,96,104,105,107,110,121]


def read_bank(path):
    with zipfile.ZipFile(path) as z:
        m=json.loads(z.read('manifest.json'));pages=[];masks=[]
        for p in m['pages']:
            pages.append(np.asarray(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA')))
            masks.append(np.asarray(Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA'))[:,:,3]>0)
        result={}
        for f in m['frames']:
            r=f['rect'];o=f['offset'];crop=np.s_[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
            dest=np.s_[o['y']:o['y']+r['height'],o['x']:o['x']+r['width']]
            a=np.zeros((1056,704,4),np.uint8);owned=np.zeros((1056,704),bool)
            a[dest]=pages[f['page']][crop];owned[dest]=masks[f['page']][crop]
            result[f['frameId']]=(a,owned)
    return result


def torso(item,original,semantic,points):
    d=old.DONORS[item];mask=semantic['tank'].copy()
    neck=old.point(points,'neck');wl=old.point(points,'waistLeft');wr=old.point(points,'waistRight');waist=(wl+wr)/2
    waist_y=wl[1]+(XX-wl[0])*(wr[1]-wl[1])/max(1,wr[0]-wl[0])
    if d['hem']:mask |= semantic['shorts']&(YY<=waist_y+d['hem'])
    hem_extent=float(np.percentile((YY-waist_y)[mask],99.9))
    progress=np.clip((YY-neck[1]+10)/np.maximum(60,waist_y+hem_extent-neck[1]+10),0,1)
    center=neck[0]*(1-progress)+waist[0]*progress
    width=max(110,wr[0]-wl[0])*(1.06-.06*progress)
    u=(XX-center)/width
    texprogress=progress.copy();width_factor=np.ones_like(progress)
    if item.startswith('teal'):
        # Narrow the spread collar modestly within the immutable tank opening.
        # Do not lift it into the fixed neck: that made a dark shoulder fold
        # visually sharper in the rejected first iteration.
        collar=np.exp(-((progress-.14)/.24)**2)
        width_factor=1+.09*collar
    src=np.asarray(d['axis']);sx=src[0,0]*(1-texprogress)+src[1,0]*texprogress+u*width_factor*(d['width'][0]*(1-texprogress)+d['width'][1]*texprogress)
    sy=src[0,1]*(1-texprogress)+src[1,1]*texprogress
    color=old.sample(item,'torso',sx,sy)
    if d['hem']:
        # The reference jacket has curved tails and an open centre. Only that
        # actual fabric can extend below the old tank; the previous blanket
        # 28px shorts strip repeated UV padding as a second horizontal hem.
        donor_valid=old.polygon_mask(d['torso'])
        donor_inside=nd.map_coordinates(donor_valid.astype(float),[sy,sx],order=0,mode='constant')>.5
        extra=mask&~semantic['tank']
        mask &= ~extra|donor_inside
        # Carry the original drawn jacket edge into the newly limited tails.
        # This uses donor artwork, not a synthetic line across the source waist.
        edge_distance=nd.map_coordinates(nd.distance_transform_edt(donor_valid),[sy,sx],order=1,mode='nearest')
        donor_rgb=np.asarray(Image.open(old.DESIGN).convert('RGB'),dtype=float)
        raw=np.stack([nd.map_coordinates(donor_rgb[:,:,c],[sy,sx],order=1,mode='nearest') for c in range(3)],axis=2)
        edge_cloth=extra&mask&(edge_distance<5)&(sy>620)
        color[edge_cloth]=raw[edge_cloth]
    # The prior implementation retained every dark original tank pixel,
    # including its interior hem. That old tank line cut through the jacket.
    # Retain only actual outside-body ink; source interior material seams do
    # not belong to the replacement clothing.
    outer=nd.distance_transform_edt(original[:,:,3]>0)<=3
    edge=mask&outer&(original[:,:,:3].mean(axis=2)<50)
    color[edge]=original[edge,:3]
    return mask,color,progress


def smooth_chain_field(chain):
    a,b,c=chain;v0=b-a;v1=c-b;l0=max(1,float(np.linalg.norm(v0)));l1=max(1,float(np.linalg.norm(v1)))
    u0=v0/l0;u1=v1/l1;n0=np.array([-u0[1],u0[0]]);n1=np.array([-u1[1],u1[0]])
    t0=np.clip((XX-a[0])*u0[0]+(YY-a[1])*u0[1],0,l0)
    t1=np.clip((XX-b[0])*u1[0]+(YY-b[1])*u1[1],0,l1)
    q0x=XX-a[0]-t0*u0[0];q0y=YY-a[1]-t0*u0[1]
    q1x=XX-b[0]-t1*u1[0];q1y=YY-b[1]-t1*u1[1]
    d0=q0x*q0x+q0y*q0y;d1=q1x*q1x+q1y*q1y
    pick=d1<d0;cross0=q0x*n0[0]+q0y*n0[1];cross1=q1x*n1[0]+q1y*n1[1]
    along=np.where(pick,l0+t1,t0);cross=np.where(pick,cross1,cross0)
    blend=1/(1+np.exp(np.clip((d1-d0)/420,-30,30)))
    joint=(np.hypot(XX-b[0],YY-b[1])<58)&(t0>l0-48)&(t1<48)
    along=np.where(joint,t0*(1-blend)+(l0+t1)*blend,along)
    cross=np.where(joint,cross0*(1-blend)+cross1*blend,cross)
    return along/(l0+l1),cross


def prepare_frame(item,original,guide,semantic,limbs,points):
    torso_mask,color,torso_progress=torso(item,original,semantic,guide['points'])
    owned=torso_mask.copy();rgb=color.copy();d=old.DONORS[item]
    for side in ['far','near']:
        mask,sleeve_color,progress=old.sleeve(item,side,original,limbs,points)
        shoulder=old.point(points,side+'Shoulder');elbow=old.point(points,side+'Elbow');wrist=old.point(points,side+'Wrist')
        if d['sleeveFraction']==1:
            progress,cross=smooth_chain_field([shoulder,elbow,wrist])
            sx,sy=old.donor_chain_xy(d[side+'Chain'],d[side+'Width'],progress,cross/(40 if side=='near' else 30))
            sleeve_color=old.sample(item,side,sx,sy)
        # The source contour is useful only along the external body edge.
        # Its old bare-arm armpit line otherwise becomes a second cloth seam.
        outer=nd.distance_transform_edt(original[:,:,3]>0)<=3
        lum=original[:,:,:3].mean(axis=2)
        outline=mask&outer&(lum<55)
        factor=np.clip(lum/np.maximum(sleeve_color.mean(axis=2),1),.2,.75)
        sleeve_color[outline]*=factor[outline,None]
        rgb[mask]=sleeve_color[mask];owned |= mask
        # Blend separate coordinate domains ONLY at the actual shoulder join.
        # Crossing foreground arms remain governed by their original masks.
        distance_arm=nd.distance_transform_edt(~mask);distance_torso=nd.distance_transform_edt(~torso_mask)
        radius=np.hypot(XX-shoulder[0],YY-shoulder[1])
        local=(radius<72)&(torso_progress<.52)&(mask|torso_mask)
        signed=np.where(mask,distance_torso,-distance_arm)
        weight=np.clip(.5+signed/28,0,1)
        blendcolor=color*(1-weight[...,None])+sleeve_color*weight[...,None]
        transition=local&(np.abs(signed)<14)&~outline
        rgb[transition]=blendcolor[transition]
    protected=(protected_mask(guide)|semantic['head']|semantic['nearHand']|semantic['farHand']|semantic['shoes']|limbs['neckSkin'])
    owned &= ~protected&(original[:,:,3]>0)
    patch=np.zeros_like(original);patch[owned,:3]=np.rint(np.clip(rgb[owned],0,255)).astype(np.uint8);patch[owned,3]=original[owned,3]
    assert not (owned&protected).any()
    return patch,owned


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--preview-only',action='store_true');args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    _,_,_,frames=load_source('male');author=MaleLimbOwnership();audit=[];catalog=[]
    ids=[i for i in KEYS if i in frames] if args.preview_only else list(frames)
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',17)
    for look,(old_id,new_id,name) in ITEMS.items():
        old_bank=read_bank(ROOT/f'docs/kling-wardrobe/garments/male/{old_id}.zip')
        bottom=read_bank(ROOT/f'docs/kling-wardrobe/garments/male/{"ochre-chinos-v1" if look=="day" else "navy-suit-trousers-v1"}.zip')
        shoes=read_bank(ROOT/'docs/kling-wardrobe/garments/male-full-outfits-v1/brown-shoes.zip') if look=='wedding' else None
        patches={};pairs=[]
        for fid in ids:
            original=frames[fid];semantic=author.semantic(fid);limbs=author.for_frame(fid,original)
            patch,owned=prepare_frame(old_id,original,author.guides[fid],semantic,limbs,author.points(fid));patches[fid]=(patch,owned)
            previous,previous_owned=old_bank[fid]
            assert not (owned&~previous_owned).any(),(new_id,fid,'ownership expanded')
            removed=previous_owned&~owned
            assert not (removed&semantic['tank']).any(),(new_id,fid,'old tank lost coverage')
            assert np.array_equal(patch[owned,3],previous[owned,3]),(new_id,fid,'owned source alpha changed')
            audit.append({'id':new_id,'frameId':fid,'ownedPixels':int(owned.sum()),'removedPaddedHemPixels':int(removed.sum()),'addedOwnedPixels':0,'ownedAlphaUnchanged':True,'changedClothingRGB':int(np.any(patch[:,:,:3]!=previous[:,:,:3],axis=2).sum()),'protectedPixelChanges':0})
            if fid in KEYS:
                before=original.copy()
                if shoes is not None:before[shoes[fid][1]]=shoes[fid][0][shoes[fid][1]]
                before[bottom[fid][1]]=bottom[fid][0][bottom[fid][1]]
                after=before.copy();before[old_bank[fid][1]]=old_bank[fid][0][old_bank[fid][1]];after[owned]=patch[owned]
                Image.fromarray(after).save(OUT/f'{look}-{fid:03}.png')
                canvas=Image.new('RGB',(1408,1100),'#eeeade');draw=ImageDraw.Draw(canvas)
                for i,(label,a) in enumerate([('Merged baseline',before),('Fit polish candidate',after)]):
                    im=Image.fromarray(a);canvas.paste(im,(i*704,44),im);draw.text((i*704+12,10),f'{look} source{fid} / {label}',font=font,fill='#354638')
                canvas.save(OUT/f'{look}-{fid:03}-comparison-native.png');pairs.append(canvas)
        if not args.preview_only:
            provenance=(f'Reuses unchanged OpenAI cloth reference full-outfits-v1/designs.png SHA256 {sha(old.DESIGN.read_bytes())}. '
                'Fit polish V2 replaces original-shirt interior ink with donor material, smooths shoulder/elbow UV joins, modestly narrows camp collar sampling and limits jacket tails to the true donor hem. '
                'V1 top ownership never expands; only padded jacket hem ownership is removed to reveal the independently selected bottom. Original tank coverage and owned source alpha retained; source head/neck/hands, proportions, anchors, motion and underlying garments unchanged. '
                'Offline derived pose banks; no new generated anatomy, runtime API or skeleton changes.')
            catalog.append(save_garment('male',new_id,name,'top',author.registration_bytes,patches,provenance))
        sheet=Image.new('RGB',(1408,550*((len(pairs)+1)//2)),'#eeeade')
        for i,pair in enumerate(pairs):sheet.paste(pair.resize((704,550),Image.Resampling.LANCZOS),((i%2)*704,(i//2)*550))
        sheet.save(OUT/f'{look}-contact.png')
    (OUT/'ownership-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
    if catalog:(OUT/'catalog-items.json').write_text(json.dumps(catalog,indent=2)+'\n')
    print(json.dumps({'items':catalog,'previewOnly':args.preview_only,'output':str(OUT)},indent=2))


if __name__=='__main__':main()
