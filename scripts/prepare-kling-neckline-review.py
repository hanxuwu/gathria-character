#!/usr/bin/env python3
"""Prepare a bounded, source-reviewed cloth permission profile and review seeds.

This is a source-specific authoring decision, not a skin classifier. Polygons
were traced on six native female source neckline crops. The traced contours leave the ambiguous skin/cloth blur boundary outside the
review; a pose-93 local ink exclusion preserves its dark neckline. Frozen source, registration and garment archives stay
unchanged. The proposal keeps the existing plum shader and changes no anatomy.
"""
from pathlib import Path
import importlib.util
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

from kling_wardrobe_common import ROOT, load_source, png_bytes, protected_mask, sha

OUT = ROOT / "artwork/kling-mask-workbench"
PROFILE_ID = "female-neckline-cloth-v1"
REG = ROOT / "docs/kling-wardrobe/registration/female.json"
GARMENT = ROOT / "docs/kling-wardrobe/garments/female/plum-pintuck-top-v1.zip"
SHADER = ROOT / "scripts/prepare-kling-female-top.py"
DONOR = ROOT / "artwork/kling-female-top/source/plum-pintuck-donor.png"

# Source coordinates, traced against native original / old mask overlays.
# These polygons deliberately omit the dark inner neckline and uncertain skin
# blend. They are not the entire head region, a rectangle, or a color removal.
REGIONS = {
    89: [(431,640),(434,641),(435,645),(432,650),(427,654),(425,655),(423,653),(428,648)],
    90: [(365,561),(372,566),(381,569),(393,570),(409,569),(420,565),(425,561),(429,561),(427,569),(421,573),(407,577),(385,577),(371,573),(363,565)],
    93: [(370,438),(380,441),(396,442),(408,441),(415,438),(416,441),(408,445),(389,446),(376,444),(368,441)],
    101: [(356,513),(369,519),(386,523),(405,523),(415,520),(421,515),(426,514),(428,531),(424,537),(420,533),(416,529),(406,530),(384,532),(370,527),(355,519)],
    102: [(357,596),(370,600),(384,602),(398,601),(407,598),(410,600),(402,605),(389,610),(376,611),(367,606),(356,601)],
    103: [(428,596),(435,597),(441,610),(446,628),(453,646),(458,660),(458,674),(449,674),(441,664),(435,657),(426,651),(421,647),(427,637),(429,628),(429,616)],
}
CROPS = {
    89:(310,590,470,685), 90:(310,510,470,605), 93:(310,385,470,480),
    101:(310,465,470,560), 102:(310,535,470,630), 103:(310,590,470,685),
}


def module():
    spec = importlib.util.spec_from_file_location("female_top", SHADER)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def runs(mask):
    result = []
    for y in np.where(mask.any(axis=1))[0]:
        xs = np.where(mask[y])[0]
        start = last = int(xs[0])
        for x in xs[1:]:
            x = int(x)
            if x != last + 1:
                result.append({"y":int(y),"x0":start,"x1":last})
                start = x
            last = x
        result.append({"y":int(y),"x0":start,"x1":last})
    return result


def proposal_rgb(author, original, owned, points):
    """Same registered donor coordinates as the shipped plum top, evaluated
    outside its old ownership solely for the reviewed permission pixels."""
    controls = author.paint_controls(owned, points)
    yy, xx = author.YY, author.XX
    wl, wr = points['waistLeft'], points['waistRight']
    waist_y = wl['y']+(xx-wl['x'])*(wr['y']-wl['y'])/max(1,wr['x']-wl['x'])+10
    top, dip_y, dip_x = controls['top'], controls['dipY'], controls['dipX']
    lower = np.clip((yy-dip_y)/np.maximum(45,waist_y-dip_y),0,1)
    upper = np.clip((yy-top)/max(25,dip_y-top),0,1)
    sy = np.where(yy<dip_y,715+upper*79,794+lower*199)
    center = dip_x*(1-lower)+(wl['x']+wr['x'])*.5*lower
    sx = 578*(1-lower)+565*lower+(xx-center)/max(110,wr['x']-wl['x'])*251
    texture,_ = author.donor()
    color = np.stack([nd.map_coordinates(texture[:,:,c],[sy,sx],order=1,mode='nearest') for c in range(3)],axis=2)
    lum = original[:,:,:3].astype(np.float32) @ np.array([.2126,.7152,.0722],np.float32)
    light = np.clip(lum/max(1,float(np.median(lum[owned]))),.35,1.4)
    color *= (.73+.27*light)[:,:,None]
    return np.rint(np.clip(color,0,255)).astype(np.uint8)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    source_bytes, _, _, source = load_source('female')
    reg_bytes = REG.read_bytes()
    records = {r['frameId']:r for r in json.loads(reg_bytes)['frames']}
    author = module()
    _, bank = author.read_bank(GARMENT)
    profile = {
        'format':'gathria-neckline-cloth-permissions', 'version':1,
        'id':PROFILE_ID, 'sourceSha256':sha(source_bytes),
        'registrationSha256':sha(reg_bytes), 'frameWidth':704,
        'frameHeight':1056, 'frames':[],
    }
    audit = {
        'format':'gathria-reviewed-neckline-authoring', 'version':1,
        'profileId':PROFILE_ID, 'sourceSha256':sha(source_bytes),
        'registrationSha256':sha(reg_bytes), 'baseGarmentSha256':sha(GARMENT.read_bytes()),
        'donorSha256':sha(DONOR.read_bytes()), 'shaderSha256':sha(SHADER.read_bytes()),
        'method':'Hand-traced native cloth polygons intersected with opaque source and original head protection. Pose93 alone retains a local R-G <= 32 and R > 100 gate to preserve its dark inner neckline. No unrestricted head exemption or global color deletion.',
        'limitations':[
            'These are conservative cloth interiors, not complete neckline fixes. Ambiguous source blur and dark neckline edges remain protected.',
            'The same existing donor shader supplies candidate cloth RGB; proposals need actual browser review before acceptance.',
            'Anchor-guided transfer only proposes locations. Neck and shoulder guides drift during crouch; every destination must be clipped to its own fixed permission map and explicitly reviewed.',
        ],
        'frames':[],
    }
    seeds = {'format':'gathria-neckline-review-seeds','version':1,'profileId':PROFILE_ID,'sourceSha256':sha(source_bytes),'registrationSha256':sha(reg_bytes),'baseGarmentSha256':sha(GARMENT.read_bytes()),'baseGarmentId':'plum-pintuck-top-v1','frames':[]}
    board = Image.new('RGB',(1280,6*230),'#eee9df')
    draw = ImageDraw.Draw(board)
    for row,(fid,polygon) in enumerate(REGIONS.items()):
        original = source[fid]
        base,owned = bank[fid]
        traced = Image.new('L',(704,1056));ImageDraw.Draw(traced).polygon(polygon,fill=255)
        traced = np.asarray(traced)>0
        head = protected_mask({'protected':[r for r in records[fid]['protected'] if r['label']=='head']})
        hands = protected_mask({'protected':[r for r in records[fid]['protected'] if r['label']!='head']})
        rgba = original.astype(np.int16)
        conservative = ((rgba[:,:,0]-rgba[:,:,1] <= 32) & (rgba[:,:,0] > 100)) if fid==93 else np.ones(head.shape,bool)
        proposed = traced & (original[:,:,3]==255) & conservative & ~hands & ~owned
        permitted = proposed & head
        assert permitted.any(),fid
        assert not (permitted & owned).any()
        assert not (permitted & hands).any()
        assert np.all(original[permitted,3]==255)
        frame_runs = runs(permitted)
        profile['frames'].append({'frameId':fid,'runs':frame_runs})
        color = proposal_rgb(author, original, owned, records[fid]['points'])
        patch = np.zeros_like(original);patch[proposed] = original[proposed];patch[proposed,:3] = color[proposed]
        mask = np.zeros_like(original);mask[permitted,3]=255
        mask_path = OUT/f'permission-{fid:03}.png'
        patch_path = OUT/f'proposal-{fid:03}.png'
        mask_path.write_bytes(png_bytes(mask));patch_path.write_bytes(png_bytes(patch))
        before = original.copy();before[owned] = base[owned]
        after = before.copy();after[proposed] = patch[proposed]
        overlay = before.copy()
        overlay[permitted,:3] = (overlay[permitted,:3].astype(np.float32)*.3+np.array([30,220,180])*.7).astype(np.uint8)
        ys,xs=np.where(permitted)
        audit['frames'].append({
            'frameId':fid,'tracedPolygon':polygon,'permittedPixels':int(permitted.sum()),
            'bounds':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],
            'excludedLocalInkPixels':int((traced & head & ~conservative).sum()),
            'mask':mask_path.name,'maskSha256':sha(mask_path.read_bytes()),
            'proposal':patch_path.name,'proposalSha256':sha(patch_path.read_bytes()),
            'sourceRgbaSha256':sha(original.tobytes()),
            'proposedPixels':int(proposed.sum()),
            'onlyNewClothInteriorsChanged':bool(np.array_equal(before[~proposed],after[~proposed])),
            'sourceAlphaExact':bool(np.array_equal(before[:,:,3],after[:,:,3])),
            'crop':CROPS[fid],
        })
        py,px=np.where(proposed)
        seeds['frames'].append({'frameId':fid,'reason':'Native-source-reviewed visible original vest cloth; existing plum donor coordinates; source alpha and outside-patch pixels unchanged. Ambiguous blur and dark neckline kept.', 'pixels':[{'x':int(x),'y':int(y),'r':int(color[y,x,0]),'g':int(color[y,x,1]),'b':int(color[y,x,2])} for y,x in zip(py,px)]})
        if fid==103:
            detail=Image.new('RGB',(540,174),'#eee9df');detail_draw=ImageDraw.Draw(detail)
            for i,(label,arr) in enumerate([('Original source',original),('Current plum',before),('Second proposal',after)]):
                im=Image.fromarray(arr).crop((300,550,480,700));bg=Image.new('RGBA',im.size,'#eee9df');bg.alpha_composite(im)
                detail.paste(bg.convert('RGB'),(i*180,24));detail_draw.text((i*180+3,5),label,fill='#263e36')
            detail.save(OUT/'source-103-comparison-1x.png')
            detail.resize((1080,348),Image.Resampling.NEAREST).save(OUT/'source-103-comparison-2x.png')
        for col,(label,arr) in enumerate([('Original source',original),('Current plum',before),('Authorized cloth only',overlay),('Donor RGB proposal',after)]):
            im=Image.fromarray(arr).crop(CROPS[fid]);bg=Image.new('RGBA',im.size,'#eee9df');bg.alpha_composite(im)
            im=bg.convert('RGB').resize((320,190),Image.Resampling.NEAREST)
            board.paste(im,(col*320,row*230+30));draw.text((col*320+4,row*230+5),f'{fid}: {label}',fill='#263e36')
    (OUT/f'{PROFILE_ID}.json').write_text(json.dumps(profile,indent=2)+'\n')
    audit['profileSha256']=sha((OUT/f'{PROFILE_ID}.json').read_bytes())
    seeds['profileSha256']=audit['profileSha256']
    (OUT/'female-plum-neckline-seeds.json').write_text(json.dumps(seeds,indent=2)+'\n')
    audit['seedFile']='female-plum-neckline-seeds.json'
    audit['seedSha256']=sha((OUT/'female-plum-neckline-seeds.json').read_bytes())
    audit['totalPermittedPixels']=sum(f['permittedPixels'] for f in audit['frames'])
    (OUT/'authoring-review.json').write_text(json.dumps(audit,indent=2)+'\n')
    board.save(OUT/'cloth-permissions-and-proposals-2x.png')
    # Neighbors are source-only context. No source pose is retimed or regenerated.
    ids=sorted({n for fid in REGIONS for n in (fid-1,fid,fid+1) if n in source})
    neighbor=Image.new('RGB',(352*5,300*((len(ids)+4)//5)),'#eee9df');d=ImageDraw.Draw(neighbor)
    for i,fid in enumerate(ids):
        p=records[fid]['points'];x=(p['nearShoulder']['x']+p['farShoulder']['x'])/2;y=min(p['nearShoulder']['y'],p['farShoulder']['y'])
        bounds=(round(x-150),round(y-80),round(x+150),round(y+160))
        im=Image.fromarray(source[fid]).crop(bounds);bg=Image.new('RGBA',im.size,'#eee9df');bg.alpha_composite(im)
        im=bg.convert('RGB');neighbor.paste(im,(i%5*352+24,i//5*300+30));d.text((i%5*352+8,i//5*300+8),f'Source pose {fid}; native crop',fill='#263e36')
    neighbor.save(OUT/'neighbor-source-context-1x.png')
    print(json.dumps({'profile':str(OUT/f'{PROFILE_ID}.json'),'pixels':audit['totalPermittedPixels'],'frames':[{k:f[k] for k in ['frameId','permittedPixels','bounds']} for f in audit['frames']]},indent=2))


if __name__=='__main__':main()
