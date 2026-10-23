#!/usr/bin/env python3
"""Additive clothing-only revisions. No original body pixel or anchor changes."""
import argparse, importlib.util, json, zipfile
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
from kling_wardrobe_common import ROOT, load_source, save_garment, sha
from kling_male_limb_ownership import MaleLimbOwnership
from kling_refined_garments import painted_elbow

def module(name, file):
    spec=importlib.util.spec_from_file_location(name, ROOT/'scripts'/file)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

reader=module('fit_reader', 'prepare-kling-male-fit-polish.py')
OUT=ROOT/'artwork/kling-fit-workflow/prepared'
SOURCE=ROOT/'artwork/kling-fit-workflow/source'
YY,XX=np.indices((1056,704))
KEYS=[0,51,55,58,62,64,78,83,85,86,87,88,89,90,99,104]

def sleeve(patch, owned, points, limbs, semantic, donor, ref_points, ref_limbs, suit):
    result=painted_elbow(patch,owned,points,limbs,donor,ref_points,ref_limbs) if suit else patch.copy()
    count=0
    for side in ['far','near']:
        a,b,c=[reader.old.point(points,side+s) for s in ['Shoulder','Elbow','Wrist']]
        u=(b-a)/max(1,np.linalg.norm(b-a));v=(c-b)/max(1,np.linalg.norm(c-b))
        arm=limbs[side+'Arm']&owned
        if suit:
            # Sample a traced ivory cuff stripe from the supplementary painting.
            # The source hand mask, never a generated hand, locates its edge.
            distance=nd.distance_transform_edt(~semantic[side+'Hand'])
            wrist=np.hypot(XX-c[0],YY-c[1])
            along=(XX-c[0])*v[0]+(YY-c[1])*v[1]
            band=arm&(distance<4)&(wrist<65)&(along<0)&(patch[:,:,3]>200)
            transverse=(XX-c[0])*(-v[1])+(YY-c[1])*v[0]
            # These source coordinates stay wholly inside the painted near cuff.
            sy=658+np.clip((transverse+35)/70,0,1)*42
            sx=288+(sy-658)*.27
            colors=np.stack([nd.map_coordinates(donor[:,:,i],[sy,sx],order=1,mode='nearest') for i in range(3)],axis=2)
            # Inner ink separates the cuff from navy; outer source hand is exact.
            weight=np.clip((4-distance)/1.5,0,1)*np.clip(-along/5,0,1)*.8
            result[band,:3]=np.rint(result[band,:3]*(1-weight[band,None])+colors[band]*weight[band,None]).astype(np.uint8)
        else:
            # Add hem depth on the clothing side of the existing short-sleeve
            # boundary. Returning forearm and exposed source upper arm are not
            # owned and cannot be painted by this operation.
            forward=(XX-a[0])*u[0]+(YY-a[1])*u[1]
            end=np.linalg.norm(b-a)*.65
            distance=end-forward
            band=arm&(distance>=0)&(distance<9)&~semantic['tank']
            # Source donor cloth retains its grain; a narrow continuous rolled
            # hem changes its luminance, not silhouette, alpha or skin boundary.
            shade=1-.22*np.exp(-((distance-1.4)/1.5)**2)+.09*np.exp(-((distance-5)/2.4)**2)
            result[band,:3]=np.clip(np.rint(result[band,:3]*shade[band,None]),0,255).astype(np.uint8)
        count+=int(band.sum())
    return result,{'cuffPixels':count}

def waist(patch, owned, points, donor):
    p=points;left,right=p['waistLeft'],p['waistRight']
    wy=(left['y']+right['y'])/2;cx=(left['x']+right['x'])/2
    lean=p['neck']['x']-cx
    strength=float(np.clip((lean-45)/65,0,1)*np.clip((wy-704)/42,0,1))
    if not strength:return patch.copy(),{'strength':0}
    slope=np.clip((right['y']-left['y'])/max(1,right['x']-left['x']),-.3,.3)
    height=YY-(wy+slope*(XX-cx));u=(XX-left['x'])/max(1,right['x']-left['x'])
    # Native-coordinate cloth trace: excludes the generated neck, hands, arms,
    # ground glow and all anatomy. Only compressed fabric provides new detail.
    trace=Image.new('L',(704,1056));ImageDraw.Draw(trace).polygon([(246,721),(279,716),(333,735),(404,739),(441,727),(442,755),(462,788),(380,792),(285,774)],fill=255)
    # Reject the generated outer ink/background even inside the coarse traced
    # polygon. They are not interior cloth and otherwise become dark wedges.
    rgb=donor[:,:,:3].astype(float)
    valid=(np.asarray(trace)>0)&(rgb[:,:,0]>145)&(rgb[:,:,1]>80)&(rgb[:,:,1]<rgb[:,:,0]*.88)&(rgb[:,:,2]>60)
    nearest=nd.distance_transform_edt(~valid,return_distances=False,return_indices=True)
    cloth=donor[:,:,:3][tuple(nearest)]
    sx=246+np.clip(u,0,1.2)*180
    sy=750+height*.72
    sampled=np.stack([nd.map_coordinates(cloth[:,:,i],[sy,sx],order=1,mode='nearest') for i in range(3)],axis=2)
    distance=nd.distance_transform_edt(owned&(patch[:,:,3]>200))
    weight=strength*.70*np.clip((48-np.abs(height+6))/30,0,1)*np.clip((distance-2)/6,0,1)
    weight*=np.clip((u+.10)/.18,0,1)*np.clip((1.27-u)/.15,0,1)
    region=weight>0
    result=patch.copy()
    if region.any():
        # Per-channel matching permits the same coral fold structure to supply
        # the ivory material without introducing coral-colored wedding cloth.
        ratio=np.median(patch[region,:3],axis=0)/np.maximum(np.median(sampled[region],axis=0),1)
        replacement=np.clip(sampled[region]*ratio,0,255)
        result[region,:3]=np.rint(patch[region,:3]*(1-weight[region,None])+replacement*weight[region,None]).astype(np.uint8)
    return result,{'strength':strength,'clothPixels':int(region.sum())}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--character',choices=['male','female'],required=True);parser.add_argument('--prototype',action='store_true');args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True);char=args.character
    if char=='female' and not args.prototype:
        parser.error('Both waist trials rejected. Retain released V6; female authoring is prototype-only.')
    _,_,_,frames=load_source(char)
    if char=='male':
        author=MaleLimbOwnership();registration=author.registration_bytes
        items=[('teal-camp-shirt-v3','teal-camp-shirt-v4','Teal soft cuff'),('navy-suit-jacket-v3','navy-suit-jacket-v4','Navy soft cuff')]
        donorpath=SOURCE/'sleeve-donor.png';ref_points=author.points(86);ref_limbs=author.for_frame(86,frames[86])
    else:
        with zipfile.ZipFile(ROOT/'docs/kling-wardrobe/templates/female.wardrobe-template.zip') as z:registration=z.read('registration.json')
        rows={r['frameId']:r for r in json.loads(registration)['frames']}
        items=[('coral-daydress-v6','coral-daydress-v7','Coral gathered waist'),('ivory-wedding-dress-v6','ivory-wedding-dress-v7','Ivory gathered waist')]
        donorpath=SOURCE/'waist-donor.png'
    donor=np.asarray(Image.open(donorpath).convert('RGBA').resize((704,1056),Image.Resampling.LANCZOS))
    reports=[]
    for oldid,newid,name in items:
        beforepath=ROOT/f'docs/kling-wardrobe/garments/{char}/{oldid}.zip';before=reader.read_bank(beforepath);prepared={};audit=[];tiles=[]
        for fid in ([f for f in KEYS if f in frames] if args.prototype else sorted(frames)):
            patch,owned=before[fid]
            if char=='male':
                result,detail=sleeve(patch,owned,author.points(fid),author.for_frame(fid,frames[fid]),author.semantic(fid),donor,ref_points,ref_limbs,newid.startswith('navy'))
            else:result,detail=waist(patch,owned,rows[fid]['points'],donor)
            assert np.array_equal(result[:,:,3],patch[:,:,3])
            assert np.array_equal(result[~owned],patch[~owned])
            prepared[fid]=(result,owned)
            audit.append({'frameId':fid,'changedPixels':int(np.any(result!=patch,axis=2).sum()),'ownershipAndAlphaExact':True,**detail})
            if fid in KEYS:
                board=Image.new('RGBA',(1408,1092),'#eee9df')
                for i,art in enumerate([patch,result]):
                    out=frames[fid].copy();out[owned]=art[owned];board.alpha_composite(Image.fromarray(out),(i*704,36))
                    ImageDraw.Draw(board).text((i*704+10,10),f'OFFLINE {newid} / {fid} / {"before" if i==0 else "candidate"}',fill='#304036')
                board.save(OUT/f'{newid}-{fid:03}-offline.png');tiles.append(board.resize((704,546)))
        contact=Image.new('RGB',(1408,546*((len(tiles)+1)//2)),'#eee9df')
        for i,t in enumerate(tiles):contact.paste(t,(i%2*704,i//2*546))
        contact.save(OUT/f'{newid}-contact.jpg',quality=94)
        packed=None
        if not args.prototype:
            origin=(f'OpenAI supplementary cloth painting 2026-10-23: {donorpath.relative_to(ROOT)} SHA256 {sha(donorpath.read_bytes())}. Generated anatomy/background discarded; bounded sleeve/cuff sampling.' if newid.startswith('navy') else 'Original shipped teal cloth retained; only narrow clothing-side cuff shading is adjusted. No generated donor pixels are used for this shirt.')
            packed=save_garment(char,newid,name,'top' if char=='male' else 'fullBody',registration,prepared,
                f'Additive revision of {oldid} SHA256 {sha(beforepath.read_bytes())}. Source ownership, RGBA alpha, anatomy, anchors and timing unchanged. {origin} Recipe: scripts/prepare-kling-fit-workflow.py. Old banks retained.')
        reports.append({'id':newid,'baseline':str(beforepath.relative_to(ROOT)),'baselineSha256':sha(beforepath.read_bytes()),'packed':packed,'poses':audit})
    (OUT/f'{char}-{"prototype" if args.prototype else "audit"}.json').write_text(json.dumps(reports,indent=2)+'\n')

if __name__=='__main__':main()
