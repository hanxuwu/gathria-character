#!/usr/bin/env python3
"""One cloth-only female top on the released, complete sleeveless ownership bank.

The existing garment recipe provides all 96 source bindings, alpha and ownership.
This offline donor registration authors RGB inside that contract; it cannot fit a
new sleeve or silhouette. Generated anatomy, alpha and background are never used.
"""
import argparse
from functools import lru_cache
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

from kling_wardrobe_common import ROOT, load_source, protected_mask, png_bytes, sha
from kling_garment_recipe import build_variant

ART = ROOT/'artwork/kling-female-top'
SOURCE = ART/'source'
OUT = ART/'prepared'
BASE = ROOT/'docs/kling-wardrobe/garments/female/teal-top.zip'
AUTHORING_BASE = OUT/'female-sleeveless-authoring-v2.zip'
TARGET = ROOT/'docs/kling-wardrobe/garments/female/plum-pintuck-top-v1.zip'
ITEM = 'plum-pintuck-top-v1'
KEYS = [0,39,56,58,62,75,87,89,95,103,107,112]
REVIEW_KEYS = [0,39,56,58,61,62,63,75,87,88,89,90,93,95,101,102,103,104,107,111,112,113]
YY, XX = np.indices((1056,704),dtype=np.float32)
# Explicitly traced generated CLOTH, including its inner binding; no donor skin.
CLOTH = [(417,729),(436,718),(450,717),(475,733),(498,756),
         (524,776),(548,788),(574,794),(597,791),(615,780),
         (626,763),(624,747),(616,732),(604,721),(616,725),
         (636,741),(651,765),(667,790),(679,815),(688,840),
         (684,866),(672,884),(669,911),(672,941),(680,976),
         (657,984),(604,992),(550,993),(494,985),(450,974),
         (426,960),(439,936),(442,916),(430,892),(428,872),
         (448,862),(466,845),(477,824),(478,801),(471,778),
         (458,752),(440,737)]

def read_bank(path):
    with zipfile.ZipFile(path) as z:
        manifest=json.loads(z.read('manifest.json'))
        pages=[np.asarray(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA')) for p in manifest['pages']]
        masks=[np.asarray(Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA'))[:,:,3]>0 for p in manifest['pages']]
    frames={}
    for f in manifest['frames']:
        r=f['rect'];o=f['offset'];crop=np.s_[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
        dest=np.s_[o['y']:o['y']+r['height'],o['x']:o['x']+r['width']]
        rgba=np.zeros((1056,704,4),np.uint8);own=np.zeros((1056,704),bool)
        rgba[dest]=pages[f['page']][crop];own[dest]=masks[f['page']][crop]
        frames[f['frameId']]=(rgba,own)
    return manifest,frames

def repair_ownership(fid,original,base,own,rec,bottom_owned):
    definition=json.loads((SOURCE/'ownership-repairs.json').read_text())
    matches=[r for r in definition['repairs'] if r['frameId']==fid]
    if not matches:return base.copy(),own.copy(),None
    mask=Image.new('L',(704,1056));ImageDraw.Draw(mask).polygon([tuple(p) for p in matches[0]['polygon']],fill=255)
    polygon=np.asarray(mask)>0
    r,g,b=np.moveaxis(original[:,:,:3].astype(np.float32),2,0)
    rule=definition['sourceClothRule']
    cloth=(original[:,:,3]>rule['minimumAlpha'])&(r-g<rule['redMinusGreenMaximum'])&(r-b<rule['redMinusBlueMaximum'])&(r-b>rule['redMinusBlueMinimum'])&(r>rule['redMinimum'])&(r<rule['redMaximum'])
    candidate=polygon&cloth&~own&~bottom_owned
    protected=protected_mask(rec)
    added=candidate&~protected
    assert added.any(),fid
    authored=base.copy();authored[added]=original[added]
    y,x=np.where(added)
    audit={'frameId':fid,'addedPixels':int(added.sum()),'bounds':[int(x.min()),int(y.min()),int(x.max()+1),int(y.max()+1)],
           'blockedProtectedPixels':int((candidate&protected).sum()),'reason':matches[0]['reason'],
           'addedOwnershipSha256':sha(added.tobytes()),'sourceAlphaExact':True,'bottomOverlapAddedPixels':0}
    return authored,own|added,audit

def save_authoring_template(repaired,repair_audit):
    """Append repaired crops; preserve all 93 unaffected atlas/frame bindings."""
    with zipfile.ZipFile(BASE) as z:
        files={name:z.read(name) for name in z.namelist()}
    m=json.loads(files['manifest.json']);frames={f['frameId']:f for f in m['frames']}
    pages=[np.asarray(Image.open(io.BytesIO(files[p['file']])).convert('RGBA')).copy() for p in m['pages']]
    masks=[np.asarray(Image.open(io.BytesIO(files[p['maskFile']])).convert('RGBA')).copy() for p in m['pages']]
    changed={r['frameId'] for r in repair_audit};new_page=len(pages);width=1024;x=0;entries=[];height=0
    for fid in sorted(changed):
        previous=frames[fid];r=previous['rect'];sl=np.s_[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
        pages[previous['page']][sl]=0;masks[previous['page']][sl]=0
        rgba,owned=repaired[fid];ys,xs=np.where(owned);left,top,right,bottom=int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)
        w,h=right-left,bottom-top;assert x+w<=width
        entry={'frameId':fid,'page':new_page,'rect':{'x':x,'y':0,'width':w,'height':h},'offset':{'x':left,'y':top}}
        entries.append((entry,rgba[top:bottom,left:right],owned[top:bottom,left:right]));frames[fid]=entry
        x+=w+2;height=max(height,h)
    page=np.zeros((height,width,4),np.uint8);mask=np.zeros_like(page)
    for entry,rgba,owned in entries:
        r=entry['rect'];sl=np.s_[:r['height'],r['x']:r['x']+r['width']]
        page[sl]=rgba
        mask[:r['height'],r['x']:r['x']+r['width'],3]=owned.astype(np.uint8)*255
    for spec,rgba,owned in zip(m['pages'],pages,masks):
        files[spec['file']]=png_bytes(rgba);files[spec['maskFile']]=png_bytes(owned)
    page_name=f'patches-{new_page}.png';mask_name=f'ownership-{new_page}.png'
    files[page_name]=png_bytes(page);files[mask_name]=png_bytes(mask)
    m['pages'].append({'file':page_name,'maskFile':mask_name,'width':width,'height':height})
    m['frames']=[frames[f['frameId']] for f in m['frames']]
    m['id']='female-sleeveless-authoring-v2';m['name']='Female sleeveless authoring V2'
    m['provenance']+=(f' Additive offline authoring derivative of teal-top.zip SHA256 {sha(BASE.read_bytes())}. Only pose-local visible-source-cloth gaps at62,102,112 gain ownership under artwork/kling-female-top/source/ownership-repairs.json. All other93 native crops/frame bindings remain exact. Original source alpha, strict head/hand protection, bottom ownership, old banks and registration are unchanged. Generated donor artwork/kling-female-top/source/plum-pintuck-donor.png SHA256 {sha((SOURCE/"plum-pintuck-donor.png").read_bytes())} supplies only cloth RGB to the subsequent complete-pose recipe. Prompt/provenance are in artwork/kling-female-top/source/.')
    files['manifest.json']=(json.dumps(m,indent=2)+'\n').encode()
    with zipfile.ZipFile(AUTHORING_BASE,'w') as z:
        for name,data in sorted(files.items()):
            info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)

@lru_cache(maxsize=1)
def donor():
    rgb=np.asarray(Image.open(SOURCE/'plum-pintuck-donor.png').convert('RGB'),dtype=np.float32)
    mask=Image.new('L',(rgb.shape[1],rgb.shape[0]));ImageDraw.Draw(mask).polygon(CLOTH,fill=255)
    inside=np.asarray(mask)>0
    # Donor-only bounded exclusions prevent stray generated skin entering cloth.
    r,g,b=np.moveaxis(rgb,2,0)
    skin=(r-g>35)&(g-b>20)&(r>165)
    inside &= ~nd.binary_dilation(skin,iterations=2)
    inner=nd.binary_erosion(inside,iterations=3)
    plain=inner&(b>g+8)&(r>g+8)&(r<210)&(g>45)
    nearest=nd.distance_transform_edt(~plain,return_distances=False,return_indices=True)
    padded=nd.gaussian_filter(rgb[tuple(nearest)],sigma=(4,4,0))
    # A standing donor's cream armhole/neckline cannot define every moving
    # source opening. Keep its three cream buttons but omit its pale binding;
    # the released source contour/ink supplies the compatible plum binding.
    dy,dx=np.indices(inside.shape)
    buttons=(dx>578)&(dx<627)&(dy>792)&(dy<884)
    pale=(r>175)&(g>155)&(b>125)&((r-g)<45)
    detail=inner&(~pale|buttons)
    padded[detail]=rgb[detail]
    return padded,inner

def paint_controls(own,points):
    """Visible neckline contour calibrates cloth paint, never source landmarks.

    The original neck landmark moves onto the chin in crouches. The top-owned
    boundary provides a separate paint dip; crossed arms must not become that dip.
    """
    rows,cols=np.where(own)
    profile=np.min(np.where(own,YY,2000),axis=0)
    near=points['nearShoulder'];far=points['farShoulder'];neck=points['neck']
    wl=points['waistLeft'];wr=points['waistRight']
    expected=(near['x']+far['x'])/2+25
    if far['x']<near['x']:expected=neck['x']
    shoulder=min(near['y'],far['y'])
    eligible=(np.arange(704)>expected-36)&(np.arange(704)<expected+36)
    eligible &= (profile>rows.min()+15)&(profile<min(shoulder+85,(wl['y']+wr['y'])/2-40))
    assert eligible.any(),'Missing reviewed neckline domain'
    lowest=float(profile[eligible].max())
    dip_x=float(np.median(np.where(eligible&(profile>=lowest-2))[0]))
    return {'top':float(rows.min()),'dipX':dip_x,'dipY':lowest,
            'waistLeft':[wl['x'],wl['y']],'waistRight':[wr['x'],wr['y']]}

def prepare_frame(original,base,own,points):
    controls=paint_controls(own,points)
    wl=points['waistLeft'];wr=points['waistRight']
    waist_y=wl['y']+(XX-wl['x'])*(wr['y']-wl['y'])/max(1,wr['x']-wl['x'])+10
    top=controls['top'];dip_y=controls['dipY'];dip_x=controls['dipX']
    lower=np.clip((YY-dip_y)/np.maximum(45,waist_y-dip_y),0,1)
    upper=np.clip((YY-top)/max(25,dip_y-top),0,1)
    sy=np.where(YY<dip_y,715+upper*79,794+lower*199)
    center=dip_x*(1-lower)+(wl['x']+wr['x'])*.5*lower
    width=max(110,wr['x']-wl['x'])
    sx=578*(1-lower)+565*lower+(XX-center)/width*251
    texture,_=donor()
    color=np.stack([nd.map_coordinates(texture[:,:,c],[sy,sx],order=1,mode='nearest') for c in range(3)],axis=2)
    # Keep the approved pose's broad creases; donor supplies the new painted
    # placket/pintucks. Preserve true source ink at existing cloth boundaries.
    lum=original[:,:,:3].astype(np.float32)@np.asarray([.2126,.7152,.0722],np.float32)
    light=np.clip(lum/max(1,float(np.median(lum[own]))),.35,1.4)
    color*=((.73+.27*light)[:,:,None])
    boundary=own&(nd.distance_transform_edt(own)<=2.2)&(lum<68)
    color[boundary]=original[boundary,:3]
    patch=base.copy();patch[own,:3]=np.rint(np.clip(color[own],0,255)).astype(np.uint8)
    assert np.array_equal(patch[:,:,3],base[:,:,3])
    assert np.array_equal(patch[~own],base[~own])
    return patch,controls

def contact(images,path,torso=False):
    cw,ch=(352,550) if not torso else (352,350)
    sheet=Image.new('RGB',(cw*6,ch*((len(images)+5)//6)),'#eee9df');d=ImageDraw.Draw(sheet)
    for i,(fid,image,points) in enumerate(images):
        if torso:
            cx=(points['waistLeft']['x']+points['waistRight']['x'])/2
            top=min(points['nearShoulder']['y'],points['farShoulder']['y'])-75
            image=image.crop((int(cx-150),int(top),int(cx+150),int(top+280)))
        small=image.resize((cw,ch-22),Image.Resampling.LANCZOS)
        x=i%6*cw;y=i//6*ch;sheet.paste(small,(x,y+22),small)
        d.text((x+8,y+4),f'Native source {fid}',fill='#354638')
    sheet.save(path,quality=94)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--prototype',action='store_true');parser.add_argument('--output',type=Path,default=TARGET);args=parser.parse_args()
    target=args.output.resolve()
    if not args.prototype and target.exists():raise SystemExit('Output already exists; choose a new --output path to preserve released banks.')
    OUT.mkdir(parents=True,exist_ok=True)
    _,source_manifest,_,source=load_source('female')
    registration=(ROOT/'docs/kling-wardrobe/registration/female.json').read_bytes()
    records={f['frameId']:f for f in json.loads(registration)['frames']}
    manifest,base=read_bank(BASE)
    _,navy=read_bank(ROOT/'docs/kling-wardrobe/garments/female/navy-shorts.zip')
    _,ochre=read_bank(ROOT/'docs/kling-wardrobe/garments/female/ochre-shorts.zip')
    repaired={};repair_audit=[]
    for fid,(old,own) in base.items():
        authored,owned,entry=repair_ownership(fid,source[fid],old,own,records[fid],navy[fid][1]|ochre[fid][1])
        repaired[fid]=(authored,owned)
        if entry:repair_audit.append(entry)
    ids=REVIEW_KEYS if args.prototype else sorted(base)
    recipe={'format':'gathria-garment-recipe','version':1,'category':'shirt',
            'base':{'file':str(AUTHORING_BASE.relative_to(ROOT)),'sha256':''},
            'output':{'id':ITEM,'name':'Plum pintuck blouse'},'poseOverrides':[]}
    audit=[];images=[];navy_images=[]
    if not args.prototype:(OUT/'paint').mkdir(exist_ok=True)
    if not args.prototype:
        save_authoring_template(repaired,repair_audit)
        recipe['base']['sha256']=sha(AUTHORING_BASE.read_bytes())
    for fid in ids:
        original=source[fid];old,own=repaired[fid];rec=records[fid]
        patch,controls=prepare_frame(original,old,own,rec['points'])
        assert not (own&protected_mask(rec)).any()
        assert np.array_equal(patch[own,3],original[own,3])
        audit.append({'frameId':fid,'ownedPixels':int(own.sum()),'paintedPixels':int(np.any(patch!=old,axis=2).sum()),
                      'paintControls':controls,'rgbaSha256':sha(patch.tobytes()),'ownershipSha256':sha(own.tobytes())})
        if not args.prototype:
            image_path=OUT/'paint'/f'{fid:03}.png';mask_path=OUT/'paint'/f'{fid:03}-mask.png'
            Image.fromarray(patch).save(image_path);Image.fromarray(own.astype(np.uint8)*255).save(mask_path)
            recipe['poseOverrides'].append({'frameId':fid,'image':{'file':str(image_path.relative_to(ROOT)),'sha256':sha(image_path.read_bytes())},'mask':{'file':str(mask_path.relative_to(ROOT)),'sha256':sha(mask_path.read_bytes())}})
        if fid in REVIEW_KEYS or not args.prototype:
            for bank,collection in [(ochre,images),(navy,navy_images)]:
                composed=original.copy();bottom,bo=bank[fid];composed[bo]=bottom[bo];composed[own]=patch[own]
                collection.append((fid,Image.fromarray(composed),rec['points']))
            if args.prototype:Image.fromarray(composed).save(OUT/f'prototype-{fid:03}.png')
    phase='prototype' if args.prototype else 'complete'
    contact(images,OUT/f'{phase}-ochre.jpg');contact(navy_images,OUT/f'{phase}-navy.jpg');contact(navy_images,OUT/f'{phase}-torso.jpg',True)
    if not args.prototype:
        recipe_path=OUT/'plum-pintuck-recipe.json';recipe_path.write_text(json.dumps(recipe,indent=2)+'\n')
        data,recipe_report=build_variant(recipe)
        target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        (OUT/'recipe-build.json').write_text(json.dumps(recipe_report,indent=2)+'\n')
    report={'prototype':args.prototype,'itemId':ITEM,'sourceSha256':manifest['sourceSha256'],
            'baseSha256':sha(BASE.read_bytes()),'registrationSha256':sha(registration),
            'donorSha256':sha((SOURCE/'plum-pintuck-donor.png').read_bytes()),'poses':audit,
            'policy':'All original source/ownership/alpha retained; cloth RGB only; no new silhouette or anatomy.',
            'actions':source_manifest['animations']}
    report['ownershipRepairs']=repair_audit
    report['policy']='Source alpha/silhouette retained; cloth RGB only; explicit new-top-only ownership repairs on existing visible cloth. No new silhouette or anatomy; old template and strict source registration stay frozen.'
    (OUT/f'{phase}-audit.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'phase':phase,'poses':len(audit),'item':ITEM,'target':str(target) if not args.prototype else None}))

if __name__=='__main__':main()
