#!/usr/bin/env python3
"""Additive revisions of the four primary outfits, preserving released banks."""
import argparse,importlib.util,io,json,zipfile
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
from kling_wardrobe_common import ROOT,load_source,save_garment,sha,protected_mask
from kling_male_limb_ownership import MaleLimbOwnership
from kling_refined_garments import painted_elbow,round_skirt_sides
from kling_dress_fit import preserve_side_ink

OUT=ROOT/'artwork/kling-refinement/prepared';OUT.mkdir(parents=True,exist_ok=True)
KEYS=[0,51,58,62,64,78,86,88,104]
def provenance(oldid,oldpath,char):
    detail='Bounded curved skirt-side allowance with preserved painted hem ink.'
    if char=='male':
        detail='Fractional source cut-plane coverage at the short sleeve cuff; original shirt donor retained.'
        if oldid.startswith('navy'):
            donor=ROOT/'artwork/kling-refinement/source/crouch-jacket-donor.png'
            detail=f'Bend-weighted, cloth-only elbow supplement from OpenAI image edit {donor.relative_to(ROOT)}, SHA256 {sha(donor.read_bytes())}. Generated face/body/background discarded; original sleeve contour and ownership retained.'
    return f'Source-bound local revision of {oldid}, SHA256 {sha(oldpath.read_bytes())}. {detail} Source anatomy, anchors, action frames and timing unchanged. Offline fitting only, not simulated cloth or new video pixels. Recipe: scripts/prepare-kling-refined-outfits.py.'
def module(name,file):
    s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def main():
    p=argparse.ArgumentParser();p.add_argument('--prototype',action='store_true');p.add_argument('--character',choices=['male','female']);a=p.parse_args()
    reader=module('refinement_male','prepare-kling-male-fit-polish.py')
    reports=[]
    for char in ([a.character] if a.character else ['male','female']):
        _,_,_,frames=load_source(char);ids=[f for f in KEYS if f in frames] if a.prototype else sorted(frames)
        if char=='male':
            author=MaleLimbOwnership();registration=author.registration_bytes
            items=[('teal-camp-shirt-v2','teal-camp-shirt-v3','Teal camp shirt refined'),('navy-suit-jacket-v2','navy-suit-jacket-v3','Navy jacket refined')]
            donor=np.asarray(Image.open(ROOT/'artwork/kling-refinement/source/crouch-jacket-donor.png').convert('RGBA').resize((704,1056),Image.Resampling.LANCZOS))
            reference_points=author.points(86);reference_limbs=author.for_frame(86,frames[86])
        else:
            fit=module('refinement_dress','prepare-kling-dress-fit-v4.py')
            template=zipfile.ZipFile(ROOT/'docs/kling-wardrobe/templates/female.wardrobe-template.zip')
            registration=template.read('registration.json');rows={r['frameId']:r for r in json.loads(registration)['frames']}
            old_skirt=fit.skirt_patch
            def skirt(*args,**kwargs):
                return round_skirt_sides(old_skirt(*args,**kwargs),args[2],preserve_side_ink)
            fit.skirt_patch=skirt
            rgb=np.asarray(Image.open(fit.SOURCE).convert('RGB'))
            items=[('coral-daydress-v4','coral-daydress-v5','Coral dress refined'),('ivory-wedding-dress-v4','ivory-wedding-dress-v5','Ivory wedding refined')]
        for oldid,newid,name in items:
            oldpath=ROOT/f'docs/kling-wardrobe/garments/{char}/{oldid}.zip';before=reader.read_bank(oldpath);prepared={};audit=[];tiles=[]
            if char=='female':
                definition=fit.DEFINITIONS[oldid[:-3]];skirt_donor,_=fit.cutout(rgb,definition['skirt'],True,oldid.startswith('ivory'))
                region=rgb[1106:1147,250:350] if oldid.startswith('coral') else rgb[1106:1147,735:826]
                material=np.median(region.reshape(-1,3),axis=0)
            for index,fid in enumerate(ids):
                original=frames[fid]
                if char=='male':
                    semantic=author.semantic(fid);limbs=author.for_frame(fid,original);points=author.points(fid)
                    patch,owned=reader.prepare_frame(oldid.replace('-v2','-v1'),original,author.guides[fid],semantic,limbs,points)
                    if oldid.startswith('navy'):
                        patch=painted_elbow(patch,owned,points,limbs,donor,reference_points,reference_limbs)
                    if oldid.startswith('teal'):
                        # Coverage of the true sleeve cut plane is fractional;
                        # hard boolean cutting previously left a staircase edge.
                        yy,xx=np.indices(owned.shape)
                        for side in ['far','near']:
                            shoulder=reader.old.point(points,side+'Shoulder');elbow=reader.old.point(points,side+'Elbow')
                            direction=elbow-shoulder;length=np.linalg.norm(direction);unit=direction/max(1,length)
                            forward=(xx-shoulder[0])*unit[0]+(yy-shoulder[1])*unit[1]
                            coverage=np.clip(length*.65-forward+.5,0,1)
                            boundary=owned&limbs[side+'UpperArm']&(coverage>0)&(coverage<1)&~semantic['tank']
                            patch[boundary,:3]=np.rint(patch[boundary,:3]*coverage[boundary,None]+original[boundary,:3]*(1-coverage[boundary,None])).astype(np.uint8)
                    protected=protected_mask(author.guides[fid])|semantic['head']|semantic['nearHand']|semantic['farHand']|limbs['neckSkin']
                    # The released ownership includes the precise approved cuff
                    # and waist boundary; texture refinements must stay inside it.
                    assert np.array_equal(owned,before[fid][1])
                else:
                    masks={n:np.asarray(Image.open(io.BytesIO(template.read(f'masks/{fid:03d}/{"head" if n=="headNeck" else n}.png'))))>0 for n in ['tank','shorts','skin','headNeck','nearArm','farArm','nearHand','farHand']}
                    patch,owned=fit.prepare_frame(original,rows[fid],masks,definition,skirt_donor,material)
                    protected=(protected_mask(rows[fid])&(original[:,:,3]>0))|masks['headNeck']|masks['nearHand']|masks['farHand']
                    assert not (masks['tank']|masks['shorts'])[~owned&before[fid][1]].any()
                assert not (owned&protected).any(),(newid,fid,'protected overlap')
                prepared[fid]=(patch,owned);audit.append({'frameId':fid,'changedPixels':int(np.any(patch!=before[fid][0],axis=2).sum()),'addedOwnership':int((owned&~before[fid][1]).sum()),'protectedChanges':0})
                if fid in KEYS:
                    pair=Image.new('RGB',(1408,1100),'#eee9df');draw=ImageDraw.Draw(pair)
                    for i,(label,data,own) in enumerate([('Before',*before[fid]),('Candidate',patch,owned)]):
                        out=original.copy();out[own]=data[own];im=Image.fromarray(out);pair.paste(im,(i*704,44),im);draw.text((i*704+10,12),f'{newid} / {fid} / {label} / OFFLINE',fill='#354638')
                    pair.save(OUT/f'{newid}-{fid:03}-offline.png');tiles.append(pair.resize((704,550),Image.Resampling.LANCZOS))
                if index%20==0:print(f'{newid}: {index+1}/{len(ids)}',flush=True)
            board=Image.new('RGB',(1408,550*((len(tiles)+1)//2)),'#eee9df')
            for i,t in enumerate(tiles):board.paste(t,(i%2*704,i//2*550))
            board.save(OUT/f'{newid}-contact.jpg',quality=94)
            result=None
            if not a.prototype:
                result=save_garment(char,newid,name,'top' if char=='male' else 'fullBody',registration,prepared,provenance(oldid,oldpath,char))
            reports.append({'id':newid,'baseline':str(oldpath.relative_to(ROOT)),'baselineSha256':sha(oldpath.read_bytes()),'result':result,'poses':audit})
    (OUT/('prototype-audit.json' if a.prototype else f'{a.character or "all"}-audit.json')).write_text(json.dumps({'prototype':a.prototype,'items':reports},indent=2)+'\n')

if __name__=='__main__':main()
