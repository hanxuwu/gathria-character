#!/usr/bin/env python3
"""Prepare source-registered dress patches, never repainting the source body.

The two garment references were made with image generation during authoring.
Clothing-only skirt cutouts are fitted offline to source-frame waist guides;
the source tank shading is recolored to the generated garment material palette.
Original head, exposed arms/hands, pose pixels and timing are retained. Hidden
cloth under the reference hands is completed from neighbouring garment colours;
these are prepared replacement drawings, not recovered original video layers.
"""
from pathlib import Path
import argparse
import json
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

from kling_wardrobe_common import ROOT, load_source, save_garment, protected_mask, sha

W, H = 704, 1056
YY, XX = np.indices((H, W))
SOURCE = ROOT / 'artwork/kling-wardrobe/source/outfit-designs.png'
OUT = ROOT / 'artwork/kling-wardrobe/prepared/female-dresses'
REVIEW = Path('/tmp/kling-wardrobe-dresses')
DEFINITIONS = {
    'coral-daydress': {
        'name': 'Coral day dress', 'hem': 185, 'flare': 1.88,
        'skirt': [(227,1173),(365,1173),(375,1190),(398,1240),(420,1290),(444,1345),(438,1355),(419,1365),(392,1370),(377,1374),(367,1379),(341,1381),(319,1383),(297,1386),(283,1387),(267,1382),(247,1382),(230,1384),(214,1387),(196,1382),(177,1376),(159,1372),(154,1366),(137,1362),(125,1353),(120,1342),(143,1303),(170,1258),(197,1211)],
        'waist': [227,365,1173], 'sourceHem': [120,444,1389],
    },
    'ivory-wedding-dress': {
        'name': 'Ivory wedding dress', 'hem': 240, 'flare': 2.05,
        'skirt': [(714,1173),(839,1173),(853,1196),(878,1240),(901,1284),(926,1328),(949,1368),(947,1382),(934,1384),(931,1394),(914,1400),(898,1401),(886,1408),(871,1413),(853,1413),(840,1419),(825,1422),(810,1419),(797,1425),(780,1425),(764,1419),(752,1423),(735,1425),(719,1419),(702,1421),(686,1416),(676,1410),(660,1416),(644,1408),(632,1406),(617,1408),(603,1403),(594,1394),(589,1380),(577,1376),(572,1367),(572,1355),(597,1320),(621,1286),(644,1251),(669,1217),(692,1190)],
        'waist': [714,839,1173], 'sourceHem': [572,949,1428],
    },
}


def polygon_mask(shape, points, supersample=3):
    h, w = shape
    im = Image.new('L', (w * supersample, h * supersample))
    ImageDraw.Draw(im).polygon([(round(x*supersample), round(y*supersample)) for x,y in points], fill=255)
    return np.asarray(im.resize((w,h), Image.Resampling.LANCZOS)).copy()


def cutout(rgb, points, skirt=False, ivory=False):
    alpha = polygon_mask(rgb.shape[:2], points)
    valid = alpha > 8
    r,g,b = [rgb[:,:,i].astype(float) for i in range(3)]
    # Original reference hands occlude a narrow skirt edge. Never carry those
    # skin pixels into a moving garment; fill only this occluded cloth region.
    cloth_ivory=(r>105)&(r-g<35)&(g-b<44)
    cloth_coral=(r>80)&(r-g>43)&(g<r*.70)&(g-b<32)
    fabric=cloth_ivory if ivory else (cloth_ivory|cloth_coral)
    if ivory:
        iy,ix=np.indices(valid.shape)
        sash=(iy>1154)&(iy<1192)&(ix>705)&(ix<849)&(r>110)&(g>80)&(r-g<66)&(g-b<38)
        fabric |= sash
    painted=ndi.binary_dilation(fabric&valid,iterations=2)&valid
    if skirt:
        skin = valid & (r-g>33) & (g-b>23) & (r>100)
        if not ivory:
            skin &= (g>140) & (r>205)
        skin = ndi.binary_dilation(skin, iterations=6) & valid
        keep = painted & ~skin
        # At the hem the source legs start immediately below the painted cloth.
        # Preserve the real scallops/folds rather than masking them with a rough
        # tracing polygon (which would bring skin-coloured triangles along).
        if ivory:
            fabric=(r>120)&(r-g<35)&(g-b<42)
            hem_rows=np.indices(valid.shape)[0]>1352
        else:
            fabric=(r>80)&(r-g>40)&(g<r*.73)&(g-b<52)
            hem_rows=np.indices(valid.shape)[0]>1340
        actual_edge=ndi.binary_dilation(fabric&valid,iterations=2)
        alpha[hem_rows&~actual_edge]=0
        valid=alpha>8
        keep &= valid
    else:
        keep = painted
    nearest = ndi.distance_transform_edt(~keep, return_distances=False, return_indices=True)
    filled = rgb[nearest[0], nearest[1]].copy()
    rgba = np.dstack((filled,alpha)).astype(np.uint8)
    # Keep colour extrapolation under zero alpha for correct unpremultiplied
    # offline resampling. Final runtime patches are cleared outside ownership.
    return rgba, filled


def bodice_patch(frame, tank, material):
    # Keep the source neckline, armhole contours and pose-specific shading.
    # A standing garment UV stretched over a partly occluded tank can sample
    # its neckline cutout and turn it into brown stripes or floating straps.
    # Recolor only the source garment material here; the generated skirt
    # supplies the new silhouette, waistband and painted folds.
    patch=np.zeros((H,W,4),np.uint8)
    original=frame[tank,:3].astype(float)
    value=original.mean(axis=1)
    shade=np.clip(value/180,0,1.09)
    recolored=np.clip(material[None,:]*shade[:,None],0,255)
    # Retain the dark source ink and smoothly join it to the new fabric tone.
    blend=np.clip((value-38)/42,0,1)
    patch[tank,:3]=np.round(original*(1-blend[:,None])+recolored*blend[:,None]).astype(np.uint8)
    patch[tank,3]=frame[tank,3]
    return patch


def skirt_patch(definition, template, points, tank, shorts, frame_id, exposed_legs=None):
    wl=points['waistLeft']; wr=points['waistRight']
    left,right=float(wl['x']),float(wr['x'])
    waist_y=(float(wl['y'])+float(wr['y']))*.5
    # A dress hangs from the waist, not from moving shoes. Floor contact limits
    # the length during a crouch; it stays hanging in an airborne tuck.
    sy,sx=np.where(shorts)
    # Visible tank bottom pixels do not span the full waist when the near arm
    # crosses it. Fit the complete existing hip garment envelope as well.
    top=waist_y-4
    width=max(135,right-left+12)
    bottom=min(top+definition['hem'],984)
    length=max(85,bottom-top)
    # Natural modest trailing offset follows torso lean without new oscillation.
    sh=(points['nearShoulder']['x']+points['farShoulder']['x'])*.5
    center=(left+right)*.5
    hip_center=float(sx.min()+sx.max())*.5
    shift=np.clip((hip_center-center)*1.5+(center-sh)*.12,-55,55)
    slope=np.clip((wr['y']-wl['y'])/max(1,right-left),-.48,.48)
    # The waistband follows the tilted pelvis; gravity brings the hem back to
    # horizontal. This avoids a straight pasted stripe on a running side pose.
    top_correction=min(0,float(np.min(sy-(top+slope*(sx-center))))-2)
    top += max(-18,top_correction)
    v=(YY-top-slope*(XX-center))/(length-slope*(XX-center))
    short_v=np.clip(v[sy,sx],0,1)
    flare=definition['flare']
    required_width=2*np.abs(sx-center-shift*short_v)/(1+(flare-1)*short_v)
    # Keep the designed flare stable across a cycle. A changing flare angle
    # magnifies one occluded waist estimate into a fluttering paper triangle.
    # Fit a modest extra hip allowance instead, as a real loose skirt would.
    width=max(width,float(np.max(required_width))*1.055+4)
    target_width=width*(1+(flare-1)*np.clip(v,0,1))
    target_center=center+shift*np.clip(v,0,1)
    sleft,sright,stop=definition['waist']; hleft,hright,hbottom=definition['sourceHem']
    # Crouched shorts can rise above an inferred waistband on one side. Add
    # painted waistband overlap only inside that source garment silhouette;
    # lifting the entire skirt would create a floating triangular side flap.
    texture_v=np.clip(v,0,1)
    source_width=(sright-sleft)+(hright-hleft-(sright-sleft))*texture_v
    source_center=(sleft+sright)*.5+(((hleft+hright)*.5)-((sleft+sright)*.5))*texture_v
    source_x=(XX-target_center)/target_width*source_width+source_center
    source_y=stop+3+texture_v*(hbottom-stop-3)
    region=(((v>=0)&(v<=1))|(shorts&(v<0)))&(abs(XX-target_center)<=target_width*.55)
    patch=np.zeros((H,W,4),np.uint8)
    for c in range(4):
        sampled=ndi.map_coordinates(template[:,:,c].astype(float),[source_y,source_x],order=1,mode='constant',cval=0)
        patch[:,:,c]=np.where(region,sampled,0).astype(np.uint8)
    if exposed_legs is not None:
        patch=cover_thigh_slivers(patch,exposed_legs,waist_y)
    return patch


def cover_thigh_slivers(patch, exposed_legs, waist_y):
    # A narrow skin island hugging the skirt side above its hem is a coverage
    # slit, unlike a real leg emerging below or moving away from the garment.
    cloth=patch[:,:,3]>8
    hem=int(np.where(cloth)[0].max())
    exposed=exposed_legs&~cloth&(YY>waist_y+15)
    labels,n=ndi.label(exposed)
    counts=np.bincount(labels.ravel())
    distance=ndi.distance_transform_edt(~cloth)
    fill=np.zeros_like(cloth)
    for i,bounds in enumerate(ndi.find_objects(labels),1):
        if not bounds or not 150<=counts[i]<=1800:continue
        ys,xs=bounds
        if xs.stop-xs.start>60 or ys.stop-ys.start>110 or ys.stop>hem-35:continue
        component=labels==i
        if distance[component].max()>30:continue
        fill |= ndi.binary_dilation(component,iterations=5)
    if not fill.any():return patch
    valid_rows=cloth.any(axis=1)
    left=np.where(cloth,XX,W).min(axis=1).astype(float)
    right=np.where(cloth,XX,-1).max(axis=1).astype(float)
    extra_left=np.max(np.where(fill,left[:,None]-XX,0),axis=1)
    extra_right=np.max(np.where(fill,XX-right[:,None],0),axis=1)
    extra_left=ndi.gaussian_filter1d(ndi.maximum_filter1d(extra_left,13),3)
    extra_right=ndi.gaussian_filter1d(ndi.maximum_filter1d(extra_right,13),3)
    extra_left[~valid_rows]=0;extra_right[~valid_rows]=0
    # Stretch only the outer24 cloth pixels, keeping every interior fold at
    # its original coordinates. Whole-row UV expansion makes folds wavy.
    sample_x=XX.astype(float)
    band=24
    left_start=left[:,None]+band
    right_start=right[:,None]-band
    new_left=left[:,None]-extra_left[:,None]
    new_right=right[:,None]+extra_right[:,None]
    stretch_left=valid_rows[:,None]&(XX<left_start)&(extra_left[:,None]>.01)
    stretch_right=valid_rows[:,None]&(XX>right_start)&(extra_right[:,None]>.01)
    sample_x=np.where(stretch_left,left[:,None]+(XX-new_left)*band/(band+extra_left[:,None]),sample_x)
    sample_x=np.where(stretch_right,right_start+(XX-right_start)*band/(band+extra_right[:,None]),sample_x)
    result=np.zeros_like(patch)
    for c in range(4):
        result[:,:,c]=ndi.map_coordinates(patch[:,:,c].astype(float),[YY,sample_x],order=1,mode='constant',cval=0).astype(np.uint8)
    return result


def composite(frame, patch, owned):
    out=frame.copy();out[owned]=patch[owned];return out


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--masks',type=Path,default=Path('/tmp/kling-wardrobe-female/masks'))
    parser.add_argument('--registration',type=Path,default=ROOT/'artwork/kling-wardrobe/registration/female/registration.json')
    parser.add_argument('--prototype',action='store_true')
    args=parser.parse_args()
    registration_bytes=args.registration.read_bytes()
    registration=json.loads(registration_bytes)
    source,manifest,config,frames=load_source('female')
    assert sha(source)==registration['sourceSha256']
    records={f['frameId']:f for f in registration['frames']}
    rgb=np.asarray(Image.open(SOURCE).convert('RGB'))
    OUT.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(parents=True,exist_ok=True)
    representatives=[0,28,40,51,58,62,64,75,87,89,95,104,121]
    use=list(dict.fromkeys(representatives+manifest['animations']['run']['frames'])) if args.prototype else list(frames)
    catalog=[];audit=[];failed=[]
    for item,definition in DEFINITIONS.items():
        skirt,_=cutout(rgb,definition['skirt'],True,item.startswith('ivory'))
        Image.fromarray(skirt).save(OUT/f'{item}-skirt-source.png')
        material_crop=rgb[1106:1147,250:350] if item=='coral-daydress' else rgb[1106:1147,735:826]
        material=np.median(material_crop.reshape(-1,3),axis=0)
        prepared={}; previews={}
        for frame_id in use:
            frame=frames[frame_id];rec=records[frame_id];md=args.masks/str(frame_id)
            masks={name:np.asarray(Image.open(md/f'{name}.png'))>0 for name in ['tank','shorts','skin','headNeck','nearArm','farArm','nearHand','farHand']}
            tank=masks['tank'];shorts=masks['shorts']
            top=bodice_patch(frame,tank,material)
            exposed_legs=masks['skin']&~masks['nearArm']&~masks['farArm']&~masks['nearHand']&~masks['farHand']&~masks['headNeck']
            lower=skirt_patch(definition,skirt,rec['points'],tank,shorts,frame_id,exposed_legs)
            # Soften only the cloth-to-cloth waist overlap. Source tank masks
            # can have stepped lower edges in blurred crouches; their colour
            # must join the skirt without exposing or changing body pixels.
            waist_y=(rec['points']['waistLeft']['y']+rec['points']['waistRight']['y'])*.5
            bottom_rows=np.max(np.where(tank,YY,-1),axis=0)
            distance=bottom_rows[None,:]-YY
            seam=tank&(lower[:,:,3]>0)&(YY>waist_y-30)&(distance>=0)&(distance<7)
            if seam.any():
                weight=(1-distance[seam]/7)*.85
                top[seam,:3]=np.round(top[seam,:3]*(1-weight[:,None])+lower[seam,:3]*weight[:,None]).astype(np.uint8)
            patch=top.copy()
            # The skirt joins under the waist sash. A source-derived torso mask
            # is composited last over its upper overlap to retain the waistline.
            lower_alpha=lower[:,:,3]>0
            patch[lower_alpha]=lower[lower_alpha]
            top_visible=top[:,:,3]>0
            patch[top_visible]=top[top_visible]
            original_cloth=tank|shorts
            owned=original_cloth|(patch[:,:,3]>0)
            protected=protected_mask(rec)&(frame[:,:,3]>0)
            # Exposed original arms are in front of this sleeveless dress,
            # including elbows crossing the bodice and hands covering the sash.
            arm_foreground=(masks['nearArm']|masks['farArm'])&~ndi.binary_erosion(tank,iterations=1)&~shorts
            foreground=masks['headNeck']|arm_foreground|masks['nearHand']|masks['farHand']|protected
            owned &= ~foreground
            # Antialiased cloth over exposed legs includes the original skin
            # under that fractional boundary. Other clothing/shoes are excluded
            # so their selected material is never baked into a dress edge.
            skin_edge=owned&masks['skin']&~original_cloth&(patch[:,:,3]>0)&(patch[:,:,3]<255)
            if skin_edge.any():
                foreground_a=patch[skin_edge,3].astype(float)/255
                background_a=frame[skin_edge,3].astype(float)/255
                out_a=foreground_a+background_a*(1-foreground_a)
                rgb_a=(patch[skin_edge,:3]*foreground_a[:,None]+frame[skin_edge,:3]*(background_a*(1-foreground_a))[:,None])/np.maximum(out_a[:,None],1e-8)
                patch[skin_edge,:3]=np.round(rgb_a).astype(np.uint8)
                patch[skin_edge,3]=np.round(out_a*255).astype(np.uint8)
            patch[~owned]=0
            # No cloth hole may erase the source shorts. Detect this before any
            # atlas is accepted; a candidate requires registration/art revision.
            holes=(original_cloth & ~foreground)&(patch[:,:,3]==0)
            audit.append({'item':item,'frameId':frame_id,'uncoveredOriginalClothPixels':int(holes.sum()),'protectedChanged':int((owned&protected).sum())})
            prepared[frame_id]=(patch,owned)
            previews[frame_id]=composite(frame,patch,owned)
            preview_dir=REVIEW/'frames'/item;preview_dir.mkdir(parents=True,exist_ok=True)
            Image.fromarray(previews[frame_id]).save(preview_dir/f'{frame_id}.png')
            if frame_id in representatives:
                Image.fromarray(previews[frame_id]).save(REVIEW/f'{item}-{frame_id}.png')
                if holes.any():
                    h=previews[frame_id].copy();h[holes]=[255,0,255,255]
                    Image.fromarray(h).save(REVIEW/f'{item}-{frame_id}-holes.png')
        font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',15)
        cols=4;cellw=352;cellh=552
        board=Image.new('RGBA',(cols*cellw,math.ceil(len(representatives)/cols)*cellh),'#eee9df');draw=ImageDraw.Draw(board)
        for j,k in enumerate(representatives):
            if k not in previews:continue
            x=j%cols*cellw;y=j//cols*cellh
            board.alpha_composite(Image.fromarray(previews[k]).resize((352,528),Image.Resampling.LANCZOS),(x,y+24));draw.text((x+8,y+3),f'{item} / frame {k}',fill='#26453c',font=font)
        board.convert('RGB').save(REVIEW/f'{item}-contact.jpg',quality=95)
        for action,clip in manifest['animations'].items():
            if not all(k in previews for k in clip['frames']):continue
            animation=[]
            for k in clip['frames']:
                canvas=Image.new('RGBA',(W,H),'#eee9df');canvas.alpha_composite(Image.fromarray(previews[k]))
                animation.append(canvas.convert('RGB'))
            palette=board.convert('RGB').quantize(colors=256)
            animation=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in animation]
            durations=[round((i+1)*100/clip['fps'])*10-round(i*100/clip['fps'])*10 for i in range(len(animation))]
            loop_options={'loop':0} if clip['loop'] else {}
            animation[0].save(REVIEW/f'{item}-{action}.gif',save_all=True,append_images=animation[1:],duration=durations,disposal=2,optimize=False,**loop_options)
            cols=8;cellw=176;cellh=284
            contact=Image.new('RGBA',(cols*cellw,math.ceil(len(clip['frames'])/cols)*cellh),'#eee9df');cd=ImageDraw.Draw(contact)
            for j,k in enumerate(clip['frames']):
                x=j%cols*cellw;y=j//cols*cellh
                contact.alpha_composite(Image.fromarray(previews[k]).resize((176,264),Image.Resampling.LANCZOS),(x,y+20));cd.text((x+3,y+2),f'{action} / {k}',fill='#26453c',font=font)
            contact.convert('RGB').save(REVIEW/f'{item}-{action}-frames.jpg',quality=94)
        if not args.prototype:
            (REVIEW/'audit.json').write_text(json.dumps(audit,indent=2))
            item_failures=[a for a in audit if a['item']==item and a['uncoveredOriginalClothPixels']]
            if item_failures:
                failed.extend(item_failures)
                continue
            provenance=('Clothing-only cutouts from artwork/kling-wardrobe/source/outfit-designs.png, generated with OpenAI image generation during development. '
                'Generated skirt pixels and garment palette are used; generated heads, skin and shoes are discarded. Hidden reference-hand cloth is completed from neighbouring cloth samples. '
                'The source tank material is recolored to the generated garment palette while retaining its original neckline, contours and shading. Generated skirt folds are fitted offline to each original Kling female frame, with source arms/head/hands kept in front; no runtime AI or body rig deformation. '
                'Broad skirt folds use a registered 2D fitting approximation, not new individually drawn motion poses. See scripts/prepare-kling-wardrobe-dresses.py.')
            catalog.append(save_garment('female',item,definition['name'],'fullBody',registration_bytes,prepared,provenance))
    (REVIEW/'audit.json').write_text(json.dumps(audit,indent=2))
    if catalog:(OUT/'catalog-items.json').write_text(json.dumps(catalog,indent=2))
    print(json.dumps({'registrationSha256':sha(registration_bytes),'frames':len(use),'worstUncovered':max(a['uncoveredOriginalClothPixels'] for a in audit),'catalog':catalog},indent=2))
    if failed:
        raise SystemExit('Uncovered original clothing remains; no affected garment archive was published. Inspect /tmp/kling-wardrobe-dresses/audit.json.')


if __name__=='__main__':main()
