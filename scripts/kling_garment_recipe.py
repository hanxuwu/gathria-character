"""Versioned offline recipes for native, source-bound clothing variants.

This is a derivative-material/pose-paint workflow, not automatic fitting of one
standing PNG. Every output inherits the complete source pose and ownership bank.
"""
from pathlib import Path
import hashlib,io,json,re,zipfile
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
CATEGORIES={'shirt':'top','jacket':'top','trousers':'bottom','dress':'fullBody'}
def digest(data):return hashlib.sha256(data).hexdigest()
def checked_file(root,record):
    if not isinstance(record,dict) or set(record)!={'file','sha256'}:raise ValueError('Expected exact file and sha256 binding')
    path=(root/record['file']).resolve()
    if not path.is_relative_to(root.resolve()):raise ValueError('Recipe files must stay under their project root')
    data=path.read_bytes()
    if digest(data)!=record['sha256']:raise ValueError(f'SHA256 mismatch: {record["file"]}')
    return data

def validate_recipe(recipe):
    allowed={'format','version','category','base','output','material','poseOverrides'}
    if not isinstance(recipe,dict) or set(recipe)-allowed:raise ValueError('Unknown recipe fields')
    if recipe.get('format')!='gathria-garment-recipe' or recipe.get('version')!=1:raise ValueError('Unsupported garment recipe')
    if recipe.get('category') not in CATEGORIES:raise ValueError('Unknown clothing category')
    out=recipe.get('output',{})
    if set(out)!={'id','name'} or not isinstance(out['id'],str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,63}',out['id']):raise ValueError('Invalid output item id')
    if not isinstance(out['name'],str) or not out['name'].strip() or len(out['name'])>120:raise ValueError('Invalid output item name')
    material=recipe.get('material')
    if material is not None:
        if not isinstance(material,dict) or set(material)!={'sourceRgb','targetRgb','tolerance'}:raise ValueError('Invalid material rule')
        for key in ['sourceRgb','targetRgb']:
            if not isinstance(material[key],list) or len(material[key])!=3 or any(type(v) is not int or not 1<=v<=255 for v in material[key]):raise ValueError('Invalid material RGB')
        if type(material['tolerance']) not in (int,float) or not .02<=material['tolerance']<=.5:raise ValueError('Invalid material tolerance')
    overrides=recipe.get('poseOverrides',[])
    if not isinstance(overrides,list) or len(overrides)>128:raise ValueError('Invalid pose overrides')
    ids=set()
    for o in overrides:
        if not isinstance(o,dict) or set(o)!={'frameId','image','mask'} or type(o['frameId']) is not int or o['frameId'] in ids:raise ValueError('Pose override IDs must be unique')
        ids.add(o['frameId'])
    return recipe

def tint_material(rgba,owned,rule):
    if rule is None:return rgba.copy(),0
    rgb=rgba[:,:,:3].astype(float);source=np.asarray(rule['sourceRgb'],float);target=np.asarray(rule['targetRgb'],float)
    mean=np.maximum(rgb.mean(axis=2),1);distance=np.linalg.norm(rgb/mean[:,:,None]-source/source.mean(),axis=2)
    tolerance=rule['tolerance'];weight=np.clip((tolerance-distance)/(tolerance*.35),0,1)
    weight*=np.clip((mean-28)/42,0,1);weight*=owned&(rgba[:,:,3]>0)
    tinted=np.clip(rgb*(target/source),0,255)
    out=rgba.copy();out[:,:,:3]=np.rint(rgb*(1-weight[:,:,None])+tinted*weight[:,:,None]).astype(np.uint8)
    return out,int((weight>0).sum())

def apply_pose_paint(base,owned,painting,mask):
    if painting.shape!=base.shape or mask.shape!=base.shape[:2]:raise ValueError('Pose painting must use the exact native frame dimensions')
    if not np.isin(mask,[0,255]).all():raise ValueError('Pose mask must be binary')
    selected=mask>0
    if not selected.any() or (selected&~owned).any():raise ValueError('Pose paint must stay inside existing clothing ownership')
    if not np.array_equal(painting[selected,3],base[selected,3]):raise ValueError('Pose paint must retain the original clothing alpha')
    out=base.copy();out[selected,:3]=painting[selected,:3];return out,int(selected.sum())

def build_variant(recipe,root=ROOT):
    validate_recipe(recipe);raw=checked_file(root,recipe['base'])
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        if z.testzip() is not None:raise ValueError('Broken base ZIP')
        files={n:z.read(n) for n in z.namelist()};manifest=json.loads(files['manifest.json'])
    if manifest['slot']!=CATEGORIES[recipe['category']]:raise ValueError('Recipe category does not match the base clothing slot')
    if manifest['id']==recipe['output']['id']:raise ValueError('A derived item needs a distinct id')
    pages=[np.asarray(Image.open(io.BytesIO(files[p['file']])).convert('RGBA')).copy() for p in manifest['pages']]
    ownership=[np.asarray(Image.open(io.BytesIO(files[p['maskFile']])).convert('RGBA'))[:,:,3] for p in manifest['pages']]
    for pixels,mask in zip(pages,ownership):
        if not np.isin(mask,[0,255]).all() or ((mask==0)&(pixels[:,:,3]>0)).any():raise ValueError('Invalid base ownership')
    overrides={o['frameId']:o for o in recipe.get('poseOverrides',[])}
    if set(overrides)-{f['frameId'] for f in manifest['frames']}:raise ValueError('Pose override is absent from the original source')
    report=[]
    for frame in manifest['frames']:
        r=frame['rect'];sl=np.s_[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']];page=frame['page'];mask=ownership[page][sl]>0
        crop=pages[page][sl].copy();out,tinted=tint_material(crop,mask,recipe.get('material'));painted=0
        if frame['frameId'] in overrides:
            override=overrides[frame['frameId']];paint=Image.open(io.BytesIO(checked_file(root,override['image']))).convert('RGBA');mask_image=Image.open(io.BytesIO(checked_file(root,override['mask']))).convert('L')
            expected=(manifest['frameWidth'],manifest['frameHeight'])
            if paint.size!=expected or mask_image.size!=expected:raise ValueError('Pose files must have native dimensions')
            offset=frame['offset'];box=(offset['x'],offset['y'],offset['x']+r['width'],offset['y']+r['height'])
            all_mask=np.asarray(mask_image);inside=np.zeros_like(all_mask,bool);inside[box[1]:box[3],box[0]:box[2]]=True
            if (all_mask[~inside]>0).any():raise ValueError('Pose paint exceeds the base frame crop')
            out,painted=apply_pose_paint(out,mask,np.asarray(paint.crop(box)),np.asarray(mask_image.crop(box)))
        assert np.array_equal(crop[:,:,3],out[:,:,3])
        assert np.array_equal(crop[~mask],out[~mask])
        pages[page][sl]=out;report.append({'frameId':frame['frameId'],'tintedClothPixels':tinted,'paintedClothPixels':painted})
    manifest.update(id=recipe['output']['id'],name=recipe['output']['name'])
    manifest['provenance']+=f' Derived by gathria-garment-recipe V1, base SHA256 {digest(raw)}, recipe SHA256 {digest(json.dumps(recipe,sort_keys=True,separators=(",",":")).encode())}. All source bindings, anchors, frames, ownership and alpha retained. Material-only variant and explicit native pose overrides; no new body drawing or automatic silhouette fitting.'
    files['manifest.json']=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
    for spec,pixels in zip(manifest['pages'],pages):
        output=io.BytesIO();Image.fromarray(pixels).save(output,format='PNG',optimize=False);files[spec['file']]=output.getvalue()
    result=io.BytesIO()
    with zipfile.ZipFile(result,'w') as z:
        for name,data in sorted(files.items()):
            info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
    return result.getvalue(),{'baseSha256':digest(raw),'sourceSha256':manifest['sourceSha256'],'registrationSha256':manifest['registrationSha256'],'outputId':manifest['id'],'poses':report,'ownershipAndAlphaUnchanged':True}
