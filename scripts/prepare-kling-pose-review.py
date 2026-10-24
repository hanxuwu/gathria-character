#!/usr/bin/env python3
"""Native pose-local clothing corrections; never regenerate source bodies.

The immutable registration's frame 56 nearHand includes a forearm triangle.
A garment V2 review explicitly preserves the traced distal fist while assigning
that forearm to the long sleeve. Other items keep their original protection.
"""
import argparse, importlib.util, json
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
from kling_wardrobe_common import ROOT, load_source, protected_mask, save_garment, sha
from kling_male_limb_ownership import MaleLimbOwnership

spec=importlib.util.spec_from_file_location('pose_reader',ROOT/'scripts/prepare-kling-male-fit-polish.py')
reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
OUT=ROOT/'artwork/kling-pose-review/prepared'
SOURCE=ROOT/'artwork/kling-pose-review/source'
YY,XX=np.indices((1056,704))

def clipped_hand(polygon):
    # Reviewed native wrist line, just behind the visible thumb and fist.
    def distance(p):return p['x']-410-.05*(p['y']-650)
    result=[]
    for i,b in enumerate(polygon):
        a=polygon[i-1];da,db=distance(a),distance(b)
        if (da>=0)!=(db>=0):
            t=da/(da-db)
            result.append({k:round(a[k]+t*(b[k]-a[k]),6) for k in ('x','y')})
        if db>=0:result.append(dict(b))
    return result

def male(prototype):
    author=MaleLimbOwnership();_,_,_,frames=load_source('male')
    path=ROOT/'docs/kling-wardrobe/garments/male/navy-suit-jacket-v4.zip'
    bank=reader.read_bank(path);fid=56;raw=frames[fid]
    base,owned=bank[fid];semantic=author.semantic(fid);limbs=author.for_frame(fid,raw)
    old_hand=next(r for r in author.guides[fid]['protected'] if r['label']=='nearHand')
    review={'frameId':fid,'label':'nearHand','polygon':clipped_hand(old_hand['polygon']),
        'reason':'Native source 56 visible-fist review: the original hand region includes proximal forearm. Keep the distal thumb/fist exact; the long sleeve covers only the reassigned forearm. Source pose and anchors are unchanged.'}
    hand=protected_mask({'protected':[review]})
    before_hand=protected_mask({'protected':[old_hand]})
    assert not (hand&~before_hand).any()
    # Pixel-centre registration plus the legacy traced edge. The old semantic
    # PNG omits a one-pixel diagonal fringe; retain it in sleeve ownership.
    reclaim=(semantic['nearHand']|before_hand)&~hand&(XX+.5<410+.05*(YY+.5-650))&(raw[:,:,3]>0)
    points=author.points(fid);points['nearWrist'].update(x=412.,y=680.)
    chain=[reader.old.point(points,'near'+name) for name in ['Shoulder','Elbow','Wrist']]
    progress,cross=reader.smooth_chain_field(chain);donor=reader.old.DONORS['navy-suit-jacket-v1']
    sx,sy=reader.old.donor_chain_xy(donor['nearChain'],donor['nearWidth'],progress,cross/40)
    colors=reader.old.sample('navy-suit-jacket-v1','near',sx,sy)
    patch=base.copy();patch[reclaim,:3]=np.rint(np.clip(colors[reclaim],0,255)).astype(np.uint8);patch[reclaim,3]=raw[reclaim,3]
    # Remove the previous diagonal inner-cuff stripe when it moves to the real
    # wrist. Include original skin fringe in this small clothing-only blend.
    distance=nd.distance_transform_edt(~reclaim)
    blend=owned&(distance<22)&(YY>650)&(XX<410+.05*(YY-650))
    weight=np.clip((22-distance)/12,0,1)
    patch[blend,:3]=np.rint(patch[blend,:3]*(1-weight[blend,None])+colors[blend]*weight[blend,None]).astype(np.uint8)
    new_owned=owned|reclaim
    assert not (new_owned&hand).any()
    assert np.array_equal(patch[~(reclaim|blend)],base[~(reclaim|blend)])
    assert np.array_equal(patch[new_owned,3],raw[new_owned,3])
    bank[fid]=(patch,new_owned)
    tiles=[]
    for pose in [54,55,56,57,58]:
        after=frames[pose].copy();art,own=bank[pose];after[own]=art[own]
        before=after.copy()
        if pose==fid:before=raw.copy();before[owned]=base[owned]
        board=Image.new('RGBA',(1408,1092),'#eeeadf')
        for i,im in enumerate([before,after]):
            board.alpha_composite(Image.fromarray(im),(i*704,36));ImageDraw.Draw(board).text((i*704+12,10),f'OFFLINE {pose} / {"V4" if i==0 else "V5 reviewed forearm"}',fill='#304036')
        board.save(OUT/f'male-jacket-{pose:03}-offline.png')
        tiles.append(board.resize((704,546)))
    contact=Image.new('RGB',(1408,546*3),'#eeeadf')
    for i,t in enumerate(tiles):contact.paste(t,(i%2*704,i//2*546))
    contact.save(OUT/'male-jacket-contact.jpg',quality=94)
    report={'baseSha256':sha(path.read_bytes()),'sourceSha256':author.source_sha256,'registrationSha256':sha(author.registration_bytes),'handProtectionReviews':[review],
        'reassignedForearmPixels':int(reclaim.sum()),'retainedHandPixels':int(hand.sum()),'changedExistingSleevePixels':int(blend.sum()),'unchangedPoseIds':[p for p in frames if p!=fid],
        'sourceAlphaExact':True,'retainedFistExact':True,'headAndAnchorsUnchanged':True,'prototype':prototype}
    (SOURCE/'male-hand-review.json').write_text(json.dumps(report,indent=2)+'\n')
    if not prototype:
        report['item']=save_garment('male','navy-suit-jacket-v5','Navy reviewed sleeve','top',author.registration_bytes,bank,
            f'Additive native pose review of navy-suit-jacket-v4 SHA256 {sha(path.read_bytes())}. Only source pose 56 changes: a documented handProtectionReviews polygon assigns the proximal forearm to the sleeve; visible fist, head, body silhouette, source alpha and all anchors/timing remain exact. Existing recorded cloth donor {reader.old.DESIGN.relative_to(ROOT)} SHA256 {sha(reader.old.DESIGN.read_bytes())}. No generated body or global color deletion. scripts/prepare-kling-pose-review.py; artwork/kling-pose-review/source/male-hand-review.json. All other poses and old archives retained.',hand_reviews=[review])
    (OUT/'male-audit.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k not in ['handProtectionReviews','unchangedPoseIds']},indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--prototype',action='store_true');args=p.parse_args()
    OUT.mkdir(parents=True,exist_ok=True);SOURCE.mkdir(parents=True,exist_ok=True);male(args.prototype)
