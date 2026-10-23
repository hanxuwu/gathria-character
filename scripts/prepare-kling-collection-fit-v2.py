#!/usr/bin/env python3
"""Additive, localized revisions of existing generated hair/cloth donors.

Existing banks remain byte-identical. No source face, anatomy or pose generation.
Authoring contact sheets are not actual application-export evidence.
"""
import argparse, copy, importlib.util, io, json, zipfile
from pathlib import Path
import numpy as np
from scipy import ndimage as nd
from PIL import Image, ImageDraw
from kling_wardrobe_common import ROOT, load_source, save_garment, sha, json_bytes

SOURCE = ROOT/'artwork/kling-collection/source/fit-v2'
REPAIRS = json.loads((SOURCE/'repairs.json').read_text())
OUT = Path('/tmp/kling-collection-fit-v2')

def module(name, filename):
    spec=importlib.util.spec_from_file_location(name, ROOT/'scripts'/filename)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def hair(prototype):
    base=module('volume_hair_revision','prepare-kling-volume-hair.py')
    base.OUT=OUT/'hair';base.OUT.mkdir(parents=True,exist_ok=True)
    original=base.donors
    def donors(style):
        result=original(style)
        for role,rgba,fit in result:
            if role=='hair-front':
                roi=base.mask_polygon(REPAIRS['hair']['donorSkinRegion'],rgba.shape[0])>0
                r,g,b=np.moveaxis(rgba[:,:,:3].astype(float),2,0)
                skin=(r>180)&(g>100)&(r-g>38)&(g-b>25)
                remove=nd.binary_dilation(roi&skin,iterations=1)&roi
            else:
                remove=base.mask_polygon(REPAIRS['hair']['rearFragment'],rgba.shape[0])>0
            rgba[remove]=0
            Image.fromarray(rgba).save(base.OUT/f'refined-{role}.png')
        return result
    base.donors=donors
    target=ROOT/'docs/kling-appearance/banks/volume-v2'
    base.build('ribbon-pony',prototype,target)
    if not prototype:
        path=target/'female-ribbon-pony.zip'
        with zipfile.ZipFile(path) as z:files={name:z.read(name) for name in z.namelist()}
        m=json.loads(files['manifest.json']);m['id']='kling-female-ribbon-pony-v2'
        m['provenance']+=' Local revision V2: remove traced donor jaw skin and exposed rear fragment; repairs in artwork/kling-collection/source/fit-v2. Original bank retained unchanged.'
        files['manifest.json']=json_bytes(m)
        with zipfile.ZipFile(path,'w') as z:
            for name,data in sorted(files.items()):
                info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
        print(json.dumps({'hair':str(path.relative_to(ROOT)),'sha256':sha(path.read_bytes())}),flush=True)

def fill_waist(patch,owned,frame,record,masks):
    d=REPAIRS['dress'];yy,xx=np.indices(owned.shape);radius=d['radius']
    py,px=np.mgrid[-radius:radius+1,-radius:radius+1]
    structure=px*px+py*py<=radius*radius
    solid=patch[:,:,3]>32
    closed=nd.binary_closing(solid,structure=structure)
    wl=record['points']['waistLeft'];wr=record['points']['waistRight']
    waist=wl['y']+(xx-wl['x'])*(wr['y']-wl['y'])/max(1,wr['x']-wl['x'])
    region=(yy>waist-d['aboveWaist'])&(yy<waist+d['belowWaist'])
    protected=((frame[:,:,3]>0)&~owned)|masks['head']|masks['nearHand']|masks['farHand']|masks['skin']
    # A body-colored mask is authoritative even when a fitted cloth ROI reaches it.
    gap=closed&~solid&region&~protected
    if not gap.any():return patch.copy(),owned.copy(),0
    inside=nd.distance_transform_edt(solid)>4
    nearest=nd.distance_transform_edt(~inside,return_distances=False,return_indices=True)
    result=patch.copy();own=owned.copy()
    changes=(gap|(nd.binary_dilation(gap,iterations=2)&solid))&region&~protected
    result[changes,:3]=patch[nearest[0][changes],nearest[1][changes],:3]
    new_alpha=np.maximum(patch[:,:,3],nd.gaussian_filter((solid|gap).astype(float),.55)*255)
    result[changes,3]=np.rint(new_alpha[changes]).astype(np.uint8)
    own[changes]=True;result[~own]=0
    assert not (changes&protected).any()
    return result,own,int(changes.sum())

def dresses(prototype,revision=2):
    folder=OUT/'dress';folder.mkdir(parents=True,exist_ok=True)
    reader=module('waist_bank_reader','prepare-kling-male-fit-polish.py')
    d=copy.deepcopy(REPAIRS['dress'])
    if revision==3:d['id']='ivory-celebration-dress-v3'
    oldpath=ROOT/f'docs/kling-wardrobe/garments/female/{d["base"]}.zip'
    bank=reader.read_bank(oldpath);_,_,_,frames=load_source('female')
    volume=module('waist_volume_donor','prepare-kling-volume-clothes.py')
    definition=volume.definition(d['base'])
    volume.base.DEFINITIONS={d['base']:definition};volume.base.sample=volume.sample
    fitter=module('waist_source_fitter','prepare-kling-dress-fit-v4.py')
    skirt=volume.skirt_source(d['base'])
    sy,sx=np.indices(skirt.shape[:2]);rgb=skirt[:,:,:3].astype(float)
    top_band=(sy>=definition['waist'][2]-8)&(sy<=definition['waist'][2]+38)&(skirt[:,:,3]>0)
    # The original donor skin classifier also excludes warm ivory sash pixels.
    # Its nearest-fill extrapolates the remaining dark boundary ink into brown
    # triangles. Repair ONLY that donor waist band from adjacent ivory cloth.
    bad=top_band&(rgb.mean(axis=2)<145)
    good=(skirt[:,:,3]>240)&(rgb[:,:,1]>160)&(rgb[:,:,2]>125)&~bad
    nearest=nd.distance_transform_edt(~good,return_distances=False,return_indices=True)
    skirt[bad,:3]=skirt[nearest[0][bad],nearest[1][bad],:3]
    Image.fromarray(skirt).save(folder/'waist-donor-refined.png')
    with zipfile.ZipFile(ROOT/'docs/kling-wardrobe/templates/female.wardrobe-template.zip') as z:
        registration=z.read('registration.json');rows={r['frameId']:r for r in json.loads(registration)['frames']}
        prepared={};audit=[];tiles=[]
        for fid in ([0,51,55,62,78,86] if prototype else sorted(bank)):
            patch,owned=bank[fid]
            masks={name:np.asarray(Image.open(io.BytesIO(z.read(f'masks/{fid:03d}/{name}.png'))))>0 for name in ['tank','shorts','skin','head','nearArm','farArm','nearHand','farHand']}
            masks['headNeck']=masks['head']
            fitter.bodice_patch=lambda frame,tank,material:volume.base.bodice(d['base'],frame,tank,rows[fid]['points'])
            material,material_owned=fitter.prepare_frame(frames[fid],rows[fid],masks,definition,skirt,np.asarray(definition['material']))
            yy,xx=np.indices(owned.shape);p=rows[fid]['points'];wl,wr=p['waistLeft'],p['waistRight']
            wy=wl['y']+(xx-wl['x'])*(wr['y']-wl['y'])/max(1,wr['x']-wl['x'])
            protected=masks['head']|masks['nearHand']|masks['farHand']|masks['skin']
            if revision==3:
                # Existing cloth already covers some original leg pixels. Those
                # are cloth material, not visible skin. Freezing that hidden skin
                # also froze the brown donor artifact. Original visible skin and
                # all head/hand regions remain protected.
                protected=masks['head']|masks['nearHand']|masks['farHand']|(masks['skin']&~owned)
            band=(yy>wy-28)&(yy<wy+50)&owned&material_owned&~protected
            corrected=patch.copy();corrected[band]=material[band]
            new,own,_=fill_waist(corrected,owned,frames[fid],rows[fid],masks)
            changed=np.any(new!=patch,axis=2)
            protected_count=int((changed&protected).sum())
            assert protected_count==0
            count=int(changed.sum())
            prepared[fid]=(new,own);audit.append({'frameId':fid,'changedClothPixels':count,'protectedChanges':protected_count})
            if fid in [0,51,55,62,78,86]:
                pictures=[]
                for label,p,o in [('Before',patch,owned),('Candidate',new,own)]:
                    out=frames[fid].copy();out[o]=p[o]
                    image=Image.fromarray(out);image.save(folder/f'{fid}-{label.lower()}-offline.png')
                    waist=(rows[fid]['points']['waistLeft']['y']+rows[fid]['points']['waistRight']['y'])/2
                    crop=image.crop((140,int(waist)-90,610,int(waist)+120))
                    tile=Image.new('RGB',(470,235),'#eeeadf');tile.paste(crop,(0,25),crop);ImageDraw.Draw(tile).text((8,5),f'{label} / {fid} / OFFLINE',fill='#344b3f');pictures.append(tile)
                row=Image.new('RGB',(940,235));row.paste(pictures[0],(0,0));row.paste(pictures[1],(470,0));tiles.append(row)
    board=Image.new('RGB',(940,len(tiles)*235));
    for i,tile in enumerate(tiles):board.paste(tile,(0,i*235))
    board.save(folder/'waist-before-after-offline.png')
    if not prototype:
        result=save_garment('female',d['id'],d['name'],'fullBody',registration,prepared,
          (f'Local correction of immutable {d["base"]} SHA256 {sha(oldpath.read_bytes())}. Original OpenAI cloth donor and source fitting retained. Upper-sash boundary ink extrapolation replaced by adjacent ivory material; bounded waist concavities completed with adjacent existing cloth. Visible original skin, head, hands, source frame geometry and timing protected. Revision {revision}: protection follows existing ownership for skin already hidden by cloth. Parameters: artwork/kling-collection/source/fit-v2/repairs.json. Supplementary cloth completion, not recovered video pixels.' if revision==3 else f'Local correction of immutable {d["base"]} SHA256 {sha(oldpath.read_bytes())}. Original OpenAI cloth donor and source fitting retained. Upper-sash boundary ink extrapolation replaced by adjacent ivory material; bounded waist concavities completed with adjacent existing cloth. Original skin, head, hands, source frame geometry and timing protected. Parameters: artwork/kling-collection/source/fit-v2/repairs.json. Supplementary cloth completion, not recovered video pixels.'))
        print(json.dumps(result),flush=True)
    (folder/'audit.json').write_text(json.dumps({'prototype':prototype,'baselineSha256':sha(oldpath.read_bytes()),'frames':audit},indent=2)+'\n')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--prototype',action='store_true');p.add_argument('--part',choices=['hair','dress','all'],default='all');p.add_argument('--dress-version',type=int,choices=[2,3],default=2);a=p.parse_args()
    if a.part in ['hair','all']:hair(a.prototype)
    if a.part in ['dress','all']:dresses(a.prototype,a.dress_version)
