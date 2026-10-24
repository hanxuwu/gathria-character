#!/usr/bin/env python3
"""Offline cloth-only contour revisions, with original sources left immutable."""
import argparse, importlib.util, json, zipfile
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
from kling_wardrobe_common import ROOT, load_source, protected_mask, save_garment, sha

spec = importlib.util.spec_from_file_location('contour_bank', ROOT/'scripts/prepare-kling-male-fit-polish.py')
bank_reader = importlib.util.module_from_spec(spec); spec.loader.exec_module(bank_reader)
OUT = ROOT/'artwork/kling-contour-review/prepared'
DONOR = ROOT/'artwork/kling-contour-review/source/male-cuff-donor.png'
YY, XX = np.indices((1056,704)); X = XX + .5; Y = YY + .5

def clip_halfplane(polygon, slope, intercept):
    result=[]
    for i,b in enumerate(polygon):
        a=polygon[i-1]; da=a['x']-slope*a['y']-intercept; db=b['x']-slope*b['y']-intercept
        if (da>=0)!=(db>=0):
            t=da/(da-db); result.append({k:round(a[k]+t*(b[k]-a[k]),6) for k in ('x','y')})
        if db>=0: result.append(dict(b))
    return result

def record_preview(character, item, fid, raw, before, after):
    board=Image.new('RGBA',(1408,1092),'#eee9df')
    for i,(art,owned) in enumerate([before,after]):
        im=raw.copy(); im[owned]=art[owned]
        board.alpha_composite(Image.fromarray(im),(i*704,36))
        ImageDraw.Draw(board).text((i*704+12,10),f'OFFLINE {item} / {fid} / {"before" if i==0 else "contour candidate"}',fill='#304036')
    board.save(OUT/f'{item}-{fid:03}-offline.png')

def male(prototype):
    raw_bytes,_,_,frames=load_source('male')
    path=ROOT/'docs/kling-wardrobe/garments/male/navy-suit-jacket-v5.zip'
    bank=bank_reader.read_bank(path)
    with zipfile.ZipFile(ROOT/'docs/kling-wardrobe/templates/male-full-outfits-v1.wardrobe-template.zip') as z: reg=z.read('registration.json')
    rows={f['frameId']:f for f in json.loads(reg)['frames']}; fid=56
    with zipfile.ZipFile(path) as z:
        manifest=json.loads(z.read('manifest.json')); old_review=manifest['handProtectionReviews'][0]
        assert manifest['registrationSha256']==sha(reg) and manifest['sourceSha256']==sha(raw_bytes)
    original=next(r for r in rows[fid]['protected'] if r['label']=='nearHand')
    # Native curved wrist traced from the painted cuff. The wider protected hand
    # retains every previously protected fist pixel; no generated skin is used.
    ys=np.array([649,653,662,676,694,708,719],float)
    edges=np.array([410,407,402,398,398,402,410],float)
    polygon=original['polygon']
    for y0,y1,x0,x1 in zip(ys[:-1],ys[1:],edges[:-1],edges[1:]):
        m=(x1-x0)/(y1-y0); polygon=clip_halfplane(polygon,m,x0-m*y0)
    review={'frameId':fid,'label':'nearHand','polygon':polygon,'reason':'Curved native cuff review. Preserve the original distal fist and a small curved wrist rim; sample only newly painted cloth. The full original hand-region boundary remains the containment limit.'}
    hand=protected_mask({'protected':[review]}); previous_hand=protected_mask({'protected':[old_review]})
    assert not (previous_hand & ~hand).any()
    assert not (hand & ~protected_mask({'protected':[original]})).any()
    base,owned=bank[fid]; patch=base.copy(); new_owned=owned&~hand
    patch[~new_owned]=0
    edge=np.interp(Y,ys,edges)
    donor=np.asarray(Image.open(DONOR).convert('RGB'),dtype=float)
    sy=1036+(Y-649)*(1120-1036)/(719-649)
    # Visible inner edge of the generated ivory cuff, traced in donor pixels.
    dx=np.interp(sy,[1036,1045,1060,1080,1100,1115,1120],[599,591,582,578,580,585,593])
    sx=dx+(X-edge)*1.24
    colors=np.stack([nd.map_coordinates(donor[:,:,c],[sy,sx],order=1,mode='nearest') for c in range(3)],2)
    weight=np.clip((X-edge+57)/30,0,1)*np.clip((Y-646)/5,0,1)*np.clip((722-Y)/4,0,1)
    local=new_owned&(X>edge-57)&(X<edge)&(Y>646)&(Y<722)
    patch[local,:3]=np.rint(patch[local,:3]*(1-weight[local,None])+colors[local]*weight[local,None]).clip(0,255).astype('uint8')
    bank[fid]=(patch,new_owned)
    assert np.array_equal(patch[new_owned,3],base[new_owned,3])
    for pose in [55,56,57]: record_preview('male','navy-suit-jacket-v6',pose,frames[pose],(base,owned) if pose==fid else bank[pose],bank[pose])
    audit={'sourceSha256':sha(raw_bytes),'registrationSha256':sha(reg),'baselineSha256':sha(path.read_bytes()),'donorSha256':sha(DONOR.read_bytes()),'prototype':prototype,'handProtectionReviews':[review],
        'restoredOriginalWristPixels':int((owned&~new_owned).sum()),'paintedClothPixels':int(local.sum()),'priorProtectedFistExact':True,'changedFrameIds':[56]}
    if not prototype:
        audit['item']=save_garment('male','navy-suit-jacket-v6','Navy curved cuff','top',reg,bank,
            f'Cloth-only curved cuff revision over navy-suit-jacket-v5 SHA256 {sha(path.read_bytes())}. OpenAI image edit donor {DONOR.relative_to(ROOT)} SHA256 {sha(DONOR.read_bytes())}; only navy/ivory sleeve pixels sampled in native pose 56. Generated anatomy discarded; original protected fist retained and a curved original wrist rim restored. All other poses, source silhouette, anchors, timing and old banks exact. scripts/prepare-kling-contours.py.',hand_reviews=[review])
    (OUT/'male-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
    print(json.dumps(audit))

def female(prototype):
    raw_bytes,_,_,frames=load_source('female')
    with zipfile.ZipFile(ROOT/'docs/kling-wardrobe/templates/female.wardrobe-template.zip') as z: reg=z.read('registration.json')
    rows={f['frameId']:f for f in json.loads(reg)['frames']}
    audit={'sourceSha256':sha(raw_bytes),'registrationSha256':sha(reg),'prototype':prototype,'items':[]}
    for prefix,name in [('coral-daydress','Coral smooth waist'),('ivory-wedding-dress','Ivory smooth waist')]:
        path=ROOT/f'docs/kling-wardrobe/garments/female/{prefix}-v7.zip'; bank=bank_reader.read_bank(path); checks=[]
        with zipfile.ZipFile(path) as z:
            manifest=json.loads(z.read('manifest.json'))
            assert manifest['registrationSha256']==sha(reg) and manifest['sourceSha256']==sha(raw_bytes)
        for fid,(base,owned) in list(bank.items()):
            row=rows[fid]; p=row['points']; wl,wr=p['waistLeft'],p['waistRight']; wy=(wl['y']+wr['y'])/2; cx=(wl['x']+wr['x'])/2
            strength=float(np.clip((p['neck']['x']-cx-45)/65,0,1)*np.clip((wy-704)/42,0,1))
            if strength<=0: continue
            # Repair only the old right-waist cut. A local row-edge fit removes
            # registration steps; scanline resampling carries the existing
            # painted edge/alpha with it instead of blurring the whole dress.
            visible=(base[:,:,3]>127)&(XX>wr['x'])
            has=visible.any(axis=1); edge=np.where(has,703-visible[:,::-1].argmax(axis=1),np.nan)
            valid=np.where(has)[0]; filled=np.interp(np.arange(1056),valid,edge[has])
            smooth=nd.gaussian_filter1d(filled,4)
            t=np.clip((np.arange(1056)-(wr['y']-62))/14,0,1)*np.clip((wr['y']+36-np.arange(1056))/14,0,1)*strength
            delta=np.clip(smooth-filled,-6,6)*t
            # Do not shift an unrelated arm or a disconnected lower hem.
            local=(abs(X-filled[:,None])<13)&(t[:,None]>0)&has[:,None]
            protected=protected_mask(row)
            local &= ~protected & (owned | (frames[fid][:,:,3]==0))
            sample_x=XX-delta[:,None]
            sampled=np.stack([nd.map_coordinates(base[:,:,c].astype(float),[YY,sample_x],order=1,mode='constant',cval=0) for c in range(4)],2)
            patch=base.copy(); patch[local]=np.rint(sampled[local]).clip(0,255).astype('uint8')
            # Keep ownership on erased cloth too: replacement must not reveal
            # the source tank/shorts. Only transparent background may be added.
            changed=np.any(patch!=base,axis=2); new_owned=owned|changed
            assert not (changed&protected).any(); assert not ((new_owned&~owned)&(frames[fid][:,:,3]>0)).any()
            bank[fid]=(patch,new_owned)
            checks.append({'frameId':fid,'strength':strength,'changedPixels':int(changed.sum()),'maxEdgeShift':float(abs(delta).max()),'protectedChanges':0,'sourceAnatomyNewlyOwned':0})
            if fid in [83,86,89,104,107,109]: record_preview('female',prefix+'-v8',fid,frames[fid],(base,owned),bank[fid])
        packed=None
        if not prototype:
            packed=save_garment('female',prefix+'-v8',name,'fullBody',reg,bank,
                f'Local native contour repair over {prefix}-v7 SHA256 {sha(path.read_bytes())}. Existing traced OpenAI cloth donor from artwork/kling-pose-review; no new anatomy or artwork generation. A bounded right-waist row-edge fit resamples cloth RGBA only during source compression poses, preserving underlying body, protected hands/head and all anchors/timing. Ownership retains erased old cloth and expands only into empty background. All other poses and old banks exact. scripts/prepare-kling-contours.py.')
        audit['items'].append({'id':prefix+'-v8','baselineSha256':sha(path.read_bytes()),'poses':checks,'item':packed})
    (OUT/'female-audit.json').write_text(json.dumps(audit,indent=2)+'\n'); print(json.dumps(audit))

if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--character',choices=['male','female'],required=True); p.add_argument('--prototype',action='store_true'); args=p.parse_args()
    OUT.mkdir(parents=True,exist_ok=True); (male if args.character=='male' else female)(args.prototype)
