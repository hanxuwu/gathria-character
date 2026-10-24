#!/usr/bin/env python3
"""Correct the bodice/skirt blend domain at a crossing forearm.

V2 join_bodice treated a column's arm-occluded tank edge as a waist hem.
Restore already painted V1 bodice RGB there; retain V8 alpha and ownership,
all original anatomy, and every waist/skirt correction outside the small domain.
"""
import argparse, importlib.util, io, json, zipfile
import numpy as np
from PIL import Image, ImageDraw
from kling_wardrobe_common import ROOT, load_source, protected_mask, save_garment, sha

spec=importlib.util.spec_from_file_location('reader',ROOT/'scripts/prepare-kling-male-fit-polish.py')
reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
OUT=ROOT/'artwork/kling-repair-handoff/female'
YY,XX=np.indices((1056,704))
POSES=[55,63]

def repair(base,old,owned,old_owned,row,masks):
    tank=masks['tank'];arm=masks['nearArm']|masks['nearHand']
    p=row['points'];wl,wr=p['waistLeft'],p['waistRight']
    waist=wl['y']+(np.arange(704)-wl['x'])*(wr['y']-wl['y'])/(wr['x']-wl['x'])
    bottom=np.max(np.where(tank,YY,-1),axis=0)
    xs=np.arange(704)
    # A source forearm directly below the tank edge distinguishes occlusion
    # from the real waist hem. Source masks are immutable authoring evidence.
    below=np.zeros(704,bool)
    for step in range(1,15):below |= arm[np.clip(bottom+step,0,1055),xs]&(bottom>=0)
    margin=waist-bottom
    weight=np.clip((margin-12)/12,0,1)
    weight=weight*weight*(3-2*weight)
    weight*=below
    region=owned&old_owned&tank&(YY>=waist[None,:]-48)&(YY<=waist[None,:]-8)
    region &= (XX>p['nearElbow']['x']-24)&(XX<p['nearWrist']['x']+65)
    region &= ~protected_mask(row)
    patch=base.copy()
    w=weight[None,:,None]
    rgb=np.rint(base[:,:,:3]*(1-w)+old[:,:,:3]*w).astype(np.uint8)
    patch[region,:3]=rgb[region]
    changed=np.any(patch!=base,axis=2)
    return patch,changed,{'sourceOccludedColumns':int((below&(weight>0)).sum()),'candidatePixels':int(region.sum()),'changedPixels':int(changed.sum()),'bounds':None if not changed.any() else [int(np.where(changed)[1].min()),int(np.where(changed)[0].min()),int(np.where(changed)[1].max()+1),int(np.where(changed)[0].max()+1)]}

def main():
    p=argparse.ArgumentParser();p.add_argument('--prototype',action='store_true');args=p.parse_args();OUT.mkdir(parents=True,exist_ok=True)
    source,manifest,_,frames=load_source('female')
    template_path=ROOT/'docs/kling-wardrobe/templates/female.wardrobe-template.zip'
    with zipfile.ZipFile(template_path) as z:
        reg=z.read('registration.json');rows={f['frameId']:f for f in json.loads(reg)['frames']}
        masks={fid:{n:np.asarray(Image.open(io.BytesIO(z.read(f'masks/{fid:03d}/{n}.png'))))>0 for n in ['tank','nearArm','nearHand']} for fid in POSES}
    report={'sourceSha256':sha(source),'registrationSha256':sha(reg),'prototype':args.prototype,'method':'V1 bodice RGB restored only above arm-occluded tank edge; V8 ownership/alpha/pose/anchors preserved.','items':[]}
    for prefix,label in [('coral-daydress','Coral reviewed arm join'),('ivory-wedding-dress','Ivory reviewed arm join')]:
        basepath=ROOT/f'docs/kling-wardrobe/garments/female/{prefix}-v8.zip'
        oldpath=ROOT/f'docs/kling-wardrobe/garments/female/{prefix}.zip'
        basebank=reader.read_bank(basepath);oldbank=reader.read_bank(oldpath);checks=[]
        baseline_digests={fid:(sha(rgba.tobytes()),sha(owned.tobytes()),sha(rgba[:,:,3].tobytes())) for fid,(rgba,owned) in basebank.items()}
        for fid in POSES:
            base,owned=basebank[fid];old,old_owned=oldbank[fid]
            patch,changed,detail=repair(base,old,owned,old_owned,rows[fid],masks[fid])
            assert np.array_equal(base[:,:,3],patch[:,:,3])
            assert not (changed&~owned).any() and not (changed&protected_mask(rows[fid])).any()
            before=frames[fid].copy();before[owned]=base[owned]
            after=frames[fid].copy();after[owned]=patch[owned]
            assert np.array_equal(before[~owned],after[~owned])
            for suffix,im in [('before',before),('candidate',after)]:Image.fromarray(im).save(OUT/f'{prefix}-{fid}-{suffix}.png')
            board=Image.new('RGBA',(1408,1092),'#eee9df')
            for i,im in enumerate([before,after]):
                board.alpha_composite(Image.fromarray(im),(i*704,36));ImageDraw.Draw(board).text((i*704+10,10),f'OFFLINE DIAGNOSTIC / {prefix} / pose {fid} / {"V8" if i==0 else "V9 candidate"}',fill='#304036')
            board.save(OUT/f'{prefix}-{fid}-comparison.png')
            # Integer crop for inspection, not a rewritten artwork asset.
            crop=(220,610,465,750) if fid==55 else (180,590,460,750)
            cb=Image.new('RGBA',((crop[2]-crop[0])*6,(crop[3]-crop[1])*3+30),'#eee9df')
            for i,im in enumerate([before,after]):
                cut=Image.fromarray(im).crop(crop).resize(((crop[2]-crop[0])*3,(crop[3]-crop[1])*3),Image.Resampling.NEAREST);cb.alpha_composite(cut,(i*(crop[2]-crop[0])*3,30))
            cb.save(OUT/f'{prefix}-{fid}-detail-3x.png')
            basebank[fid]=(patch,owned);checks.append({'frameId':fid,**detail,'alphaExact':True,'ownershipExact':True,'protectedChanges':0})
        item=None
        if not args.prototype:
            item=save_garment('female',prefix+'-v9',label,'fullBody',reg,basebank,
                f'Local bodice occlusion repair over {prefix}-v8 SHA256 {sha(basepath.read_bytes())}, reusing existing V1 painted bodice RGB from {prefix}.zip SHA256 {sha(oldpath.read_bytes())}. Only native source poses 55 and 63, arm-occluded tank edge domain, using immutable template semantic masks and waist anchors. V8 skirt, waist repairs, alpha and binary ownership unchanged; original head/hands/skin and all other 94 poses exact. No new generated image or anatomy. scripts/prepare-kling-female-repair.py; artwork/kling-repair-handoff/female/README.md.',output=OUT/f'{prefix}-v9.zip')
            # Independently decode the saved ZIP: verify serialization as well as
            # the in-memory delta, including every untouched source pose.
            decoded=reader.read_bank(OUT/f'{prefix}-v9.zip')
            assert set(decoded)==set(basebank)
            for fid,(actual,ownership) in decoded.items():
                expected,expected_owned=basebank[fid]
                assert np.array_equal(actual,expected) and np.array_equal(ownership,expected_owned)
                old_rgba,old_ownership,old_alpha=baseline_digests[fid]
                assert sha(ownership.tobytes())==old_ownership
                assert sha(actual[:,:,3].tobytes())==old_alpha
                if fid not in POSES:assert sha(actual.tobytes())==old_rgba
            del decoded
        report['items'].append({'id':prefix+'-v9','baseline':str(basepath.relative_to(ROOT)),'baselineSha256':sha(basepath.read_bytes()),'donor':str(oldpath.relative_to(ROOT)),'donorSha256':sha(oldpath.read_bytes()),'checks':checks,'unchangedPoseCount':len(basebank)-len(POSES),'decodedFramesChecked':0 if args.prototype else len(basebank),'allOwnershipAndAlphaExact':True,'serializedPixelsExact':not args.prototype,'item':item})
        del oldbank,basebank
    (OUT/('prototype-audit.json' if args.prototype else 'asset-audit.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__':main()
