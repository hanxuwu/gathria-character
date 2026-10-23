#!/usr/bin/env python3
"""Supplement compressed dress joins without changing source anatomy.

Old V5 patches are the baseline, not regenerated donors. A short side seam is
bridged only when the source waist/neck indicate a deep forward crouch. Generated
cloth supplies small compressed folds; original skin, hands and all other art
are protected. This is authoring, not recovered video artwork.
"""
import argparse, importlib.util, io, json, zipfile
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
from kling_wardrobe_common import ROOT, load_source, save_garment, sha, protected_mask

spec = importlib.util.spec_from_file_location('waist_reader', ROOT/'scripts/prepare-kling-male-fit-polish.py')
reader = importlib.util.module_from_spec(spec); spec.loader.exec_module(reader)
OUT = ROOT/'artwork/kling-polish/prepared'
SOURCE = ROOT/'artwork/kling-polish/source/crouch-waist-donor.png'
KEYS = [0,55,62,83,85,86,87,88,89,90,99,100,104]
YY,XX = np.indices((1056,704))

def improve(patch, owned, frame, row, masks, donor, ivory):
    p=row['points']; left,right=p['waistLeft'],p['waistRight']
    wy=(left['y']+right['y'])/2; center=(left['x']+right['x'])/2
    lean=p['neck']['x']-center
    strength=float(np.clip((lean-45)/65,0,1)*np.clip((wy-704)/42,0,1))
    if strength<=0: return patch.copy(),owned.copy(),{'strength':0,'added':0}
    solid=patch[:,:,3]>200
    edge=np.max(np.where(solid,XX,-1),axis=1).astype(float)
    top=int(wy-44);bottom=int(wy+26)
    # Endpoint tangents follow existing cloth. Only the concave gap between
    # them is completed; outside this narrow band is bit-identical to V5.
    t=np.clip((np.arange(1056)-top)/(bottom-top),0,1)
    target=edge[top]*(1-t)+edge[bottom]*t-10*np.sin(np.pi*t)
    extra=np.clip(target-edge,0,40)*strength
    extra[(np.arange(1056)<top)|(np.arange(1056)>bottom)]=0
    protected=(masks['skin']|masks['head']|masks['nearHand']|masks['farHand']|protected_mask(row))&(frame[:,:,3]>0)
    # Move the existing outer ink WITH the cloth. Appending flat pixels outside
    # it leaves a second seam at the old edge (rejected prototype 1).
    band_width=40
    start=edge[:,None]-band_width
    sample_x=start+(XX-start)*band_width/(band_width+extra[:,None])
    remap=(extra[:,None]>0)&(XX>=start)&(XX<=edge[:,None]+extra[:,None]+2)&~protected
    alpha=patch[:,:,3].astype(float)/255
    sampled_a=nd.map_coordinates(alpha,[YY,sample_x],order=1,mode='constant')
    result=patch.copy()
    for c in range(3):
        premul=nd.map_coordinates(patch[:,:,c]*alpha,[YY,sample_x],order=1,mode='constant')
        value=np.divide(premul,sampled_a,out=np.zeros_like(premul),where=sampled_a>1e-6)
        result[remap,c]=np.clip(np.rint(value[remap]),0,255).astype(np.uint8)
    result[remap,3]=np.rint(sampled_a[remap]*255).astype(np.uint8)
    result_owned=owned|(remap&(result[:,:,3]>0))
    # Supplemental folds are sampled solely from the traced cloth island.
    # Their contribution follows crouch strength continuously, not a frame ID.
    slope=np.clip((right['y']-left['y'])/max(1,right['x']-left['x']),-.3,.3)
    height=YY-(wy+slope*(XX-center))
    band=np.clip(1-np.abs(height+6)/28,0,1)*strength
    u=(XX-left['x'])/max(1,right['x']-left['x'])
    band*=np.clip((u-.05)/.18,0,1)*np.clip((.86-u)/.18,0,1)
    region=result_owned&~protected&(result[:,:,3]>200)&(band>0)
    sy=1078+height*.22; sx=430+np.clip(u,0,1)*150
    sampled=np.stack([nd.map_coordinates(donor[:,:,c],[sy,sx],order=1,mode='nearest') for c in range(3)],axis=2)
    # Match the local fabric palette while preserving the painted fold contrast.
    if region.any():
        existing=result[region,:3].astype(float)
        src=sampled[region]
        ratio=np.median(existing,axis=0)/np.maximum(np.median(src,axis=0),1)
        replacement=np.clip(src*ratio,0,255)
        weight=band[region,None]*.35
        result[region,:3]=np.rint(existing*(1-weight)+replacement*weight).astype(np.uint8)
    result[~result_owned]=0
    assert np.array_equal(result[protected],patch[protected])
    return result,result_owned,{'strength':strength,'added':int((result_owned&~owned).sum()),'painted':int(region.sum())}

def main():
    p=argparse.ArgumentParser();p.add_argument('--prototype',action='store_true');args=p.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    donor=np.asarray(Image.open(SOURCE).convert('RGBA')).copy()
    # Explicit clothing-only trace excludes generated hands, skin and backdrop.
    mask=Image.new('L',(donor.shape[1],donor.shape[0]));ImageDraw.Draw(mask).polygon([(380,1046),(448,1060),(538,1074),(636,1055),(641,1081),(622,1101),(541,1100),(450,1084),(395,1068)],fill=255)
    valid=np.asarray(mask)>0
    nearest=nd.distance_transform_edt(~valid,return_distances=False,return_indices=True)
    donor=donor[tuple(nearest)]
    source,manifest,_,frames=load_source('female')
    with zipfile.ZipFile(ROOT/'docs/kling-wardrobe/templates/female.wardrobe-template.zip') as template:
        registration=template.read('registration.json');rows={r['frameId']:r for r in json.loads(registration)['frames']}
        report={'sourceSha256':sha(source),'donorSha256':sha(SOURCE.read_bytes()),'prototype':args.prototype,'items':[]}
        for item,name in [('coral-daydress','Coral soft waist'),('ivory-wedding-dress','Ivory soft waist')]:
            oldpath=ROOT/f'docs/kling-wardrobe/garments/female/{item}-v5.zip';before=reader.read_bank(oldpath)
            prepared={};audit=[];tiles=[]
            for fid in (KEYS if args.prototype else sorted(frames)):
                if fid not in frames: continue
                masks={n:np.asarray(Image.open(io.BytesIO(template.read(f'masks/{fid:03d}/{n}.png'))))>0 for n in ['skin','head','nearHand','farHand']}
                patch,owned,detail=improve(*before[fid],frames[fid],rows[fid],masks,donor,item.startswith('ivory'))
                prepared[fid]=(patch,owned);audit.append({'frameId':fid,**detail})
                if fid in KEYS:
                    board=Image.new('RGBA',(1408,1092),'#eee9df')
                    for i,(art,own) in enumerate([before[fid],(patch,owned)]):
                        out=frames[fid].copy();out[own]=art[own];board.alpha_composite(Image.fromarray(out),(i*704,36))
                        ImageDraw.Draw(board).text((i*704+10,10),f'OFFLINE {item} / {fid} / {"V5" if i==0 else "V6 candidate"}',fill='#304036')
                    board.save(OUT/f'{item}-{fid:03}-offline.png');tiles.append(board.resize((704,546)))
            contact=Image.new('RGB',(1408,546*((len(tiles)+1)//2)),'#eee9df')
            for i,tile in enumerate(tiles):contact.paste(tile,(i%2*704,i//2*546))
            contact.save(OUT/f'{item}-contact.jpg',quality=94)
            packed=None
            if not args.prototype:
                packed=save_garment('female',item+'-v6',name,'fullBody',registration,prepared,
                    f'Clothing-only local revision of {oldpath.name} SHA256 {sha(oldpath.read_bytes())}. Supplementary OpenAI image edit 2026-10-23, {SOURCE.relative_to(ROOT)} SHA256 {sha(SOURCE.read_bytes())}; only traced waist fabric sampled, generated anatomy/background discarded. Source-bound seam allowance and continuously weighted folds: scripts/prepare-kling-waist-v6.py. Approved anatomy, original source pixels outside clothing ownership, timing and anchors unchanged. Old versions retained.')
            report['items'].append({'id':item+'-v6','baselineSha256':sha(oldpath.read_bytes()),'poses':audit,'packed':packed})
    (OUT/('waist-prototype.json' if args.prototype else 'waist-audit.json')).write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__':main()
