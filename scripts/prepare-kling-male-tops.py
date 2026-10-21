#!/usr/bin/env python3
"""Prepare complete source-bound shirts/jackets from recorded garment artwork.

This offline texture registration never transforms source bodies or poses. Exact
source material masks determine visible torso/arm ownership; generated skin,
faces and backdrop are excluded from the donor. Sleeves follow each source arm
chain, and foreground arms replace the corresponding torso pixels before ZIP
packaging. The browser receives complete RGBA patches, not a new skeletal rig.
"""
import argparse
import io
import json
import zipfile
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as nd

from kling_wardrobe_common import ROOT, load_source, protected_mask, save_garment, sha
from kling_male_limb_ownership import MaleLimbOwnership

DESIGN = ROOT / 'artwork/kling-wardrobe/source/full-outfits-v1/designs.png'
OUT = ROOT / 'artwork/kling-wardrobe/prepared/male-tops-v1'
KEYS = [0, 28, 51, 58, 62, 64, 74, 87, 96, 104, 105, 107, 110, 121]
YY, XX = np.indices((1056, 704), dtype=np.float32)

# Manually traced CLOTH-only donor boundaries. Neck cut-outs, hands and backdrop
# are outside these polygons. This is derived artwork registration, not original
# Kling layers. The same donor pixels are retained in the provenance directory.
DONORS = {
    'teal-camp-shirt-v1': {
        'name': 'Teal camp shirt',
        'torso': [(396,397),(395,419),(429,448),(481,484),(497,452),(496,418),(528,432),(560,449),(573,487),(580,522),(576,568),(582,596),(574,613),(520,619),(399,618),(352,610),(350,588),(365,545),(373,512),(360,450)],
        'near': [(359,442),(374,469),(377,503),(369,540),(355,570),(327,558),(291,542),(266,535),(272,516),(287,491),(300,460),(325,447)],
        'far': [(560,449),(582,465),(600,500),(616,529),(603,542),(577,557),(576,534),(574,488)],
        'axis': [[458,411],[469,605]], 'width': [209,230],
        'nearChain': [[329,471],[316,546]], 'nearWidth': [49,46],
        'farChain': [[576,477],[594,536]], 'farWidth': [28,26],
        'sleeveFraction': .65, 'hem': 0,
    },
    'navy-suit-jacket-v1': {
        'name': 'Navy wedding suit jacket',
        'torso': [(1054,397),(1057,417),(1119,439),(1143,419),(1147,410),(1185,424),(1220,446),(1237,471),(1241,529),(1234,570),(1239,620),(1261,677),(1254,692),(1227,701),(1209,692),(1195,659),(1171,670),(1143,648),(1119,661),(1095,650),(1084,680),(1062,699),(1015,703),(979,691),(983,665),(1000,604),(1014,557),(1016,505),(1005,457)],
        'near': [(1006,442),(1034,461),(1045,493),(1039,524),(1015,556),(992,580),(981,617),(964,670),(934,660),(902,658),(879,663),(890,631),(908,590),(913,551),(931,510),(947,477),(960,458)],
        'far': [(1217,451),(1241,463),(1254,494),(1259,527),(1273,564),(1293,606),(1324,648),(1298,654),(1277,669),(1264,675),(1248,641),(1233,609),(1229,570),(1237,531),(1234,487)],
        'axis': [[1124,409],[1126,700]], 'width': [201,260],
        'nearChain': [[994,481],[948,569],[921,655]], 'nearWidth': [49,44,43],
        'farChain': [[1232,481],[1256,567],[1293,650]], 'farWidth': [32,30,32],
        'sleeveFraction': 1.0, 'hem': 28,
    },
}


def polygon_mask(points, size=(1536,1024)):
    im = Image.new('L', size); ImageDraw.Draw(im).polygon(points, fill=255)
    return np.asarray(im) > 0


@lru_cache(maxsize=8)
def donor_texture(item, region):
    rgb = np.asarray(Image.open(DESIGN).convert('RGB')).astype(np.float32)
    valid = polygon_mask(DONORS[item][region])
    yy,xx=np.indices(valid.shape)
    # Discard warm skin antialiasing along the manually traced open neckline.
    if region=='torso':
        neckline=(yy<490) if item=='teal-camp-shirt-v1' else (yy<444)
        skin=(rgb[:,:,0]-rgb[:,:,1]>32)&(rgb[:,:,0]-rgb[:,:,2]>55)&(rgb[:,:,0]>150)
        valid &= ~(neckline&skin)
    # Fill sampler padding from the nearest actual cloth pixel. No generated
    # face/neck/hand/background can enter a patch outside an authored contour.
    # Padding comes from INNER fabric rather than a dark outer contour. Stretching
    # the contour into the UV padding would paint black strips across an armpit.
    inside=nd.binary_erosion(valid,iterations=6)
    r,g,b=np.moveaxis(rgb,2,0)
    if item=='teal-camp-shirt-v1':
        basecloth=(g>r+8)&(b>r+10)&(g>55)&(b>60)
        cloth=basecloth|((r>170)&(g>150)&(b>105)&(r-b<95))
    else:
        basecloth=(b>r+8)&(g>r-4)&(b>40)
        cloth=basecloth|((r>150)&(g>130)&(b>85)&(r-b<95))
        if region=='torso':
            cloth |= (xx>1145)&(xx<1240)&(yy>445)&(yy<526)&(r>90)&(g>45)
            cloth |= (xx>1120)&(xx<1183)&(yy>429)&(yy<548)&(r>100)&(g>60)
    # Only donor material is filtered; source colors/masks are never deleted.
    # This excludes backdrop and generated skin accidentally straddling a trace.
    inside &= cloth
    # Edge padding must be plain cloth, not ivory cuffs or floral details.
    # Otherwise a nearest rose petal/ivory button can become a long coloured
    # stripe when a crouching torso samples beyond the original garment edge.
    padding=inside&basecloth
    _, indices = nd.distance_transform_edt(~padding, return_indices=True)
    filled = rgb[tuple(indices)]
    filled[inside]=rgb[inside]
    return filled, inside


def sample(item, region, sx, sy):
    tex, _ = donor_texture(item, region)
    return np.stack([nd.map_coordinates(tex[:,:,c], [sy,sx], order=1, mode='nearest') for c in range(3)], axis=2)


def point(p, name):
    return np.array([p[name]['x'],p[name]['y']],dtype=np.float32)


def chain_field(chain):
    """Closest polyline arclength plus signed transverse coordinate, native px."""
    lengths = [float(np.linalg.norm(b-a)) for a,b in zip(chain,chain[1:])]
    total = max(1.,sum(lengths))
    closest = np.full(XX.shape,np.inf,np.float32)
    distance = np.zeros_like(XX); along = np.zeros_like(XX)
    offset = 0.
    for a,b,length in zip(chain,chain[1:],lengths):
        vector=(b-a)/max(length,1); normal=np.array([-vector[1],vector[0]])
        raw=(XX-a[0])*vector[0]+(YY-a[1])*vector[1]
        t=np.clip(raw,0,length)
        qx=a[0]+t*vector[0]; qy=a[1]+t*vector[1]
        d2=(XX-qx)**2+(YY-qy)**2
        pick=d2<closest
        closest[pick]=d2[pick]
        along[pick]=(offset+t[pick])/total
        distance[pick]=((XX-qx)*normal[0]+(YY-qy)*normal[1])[pick]
        offset+=length
    return along,distance,lengths


def donor_chain_xy(chain, widths, progress, transverse):
    chain=np.asarray(chain,dtype=np.float32)
    lengths=np.linalg.norm(np.diff(chain,axis=0),axis=1)
    positions=np.concatenate([[0.],np.cumsum(lengths)]); positions/=positions[-1]
    sx=np.interp(progress,positions,chain[:,0]); sy=np.interp(progress,positions,chain[:,1])
    tangents=np.diff(chain,axis=0)/lengths[:,None]
    # Vertex normals interpolate smoothly through the donor elbow.
    vectors=np.vstack([tangents[0], *[(a+b)/np.linalg.norm(a+b) for a,b in zip(tangents,tangents[1:])],tangents[-1]])
    nx=np.interp(progress,positions,-vectors[:,1]); ny=np.interp(progress,positions,vectors[:,0])
    width=np.interp(progress,positions,widths)
    return sx+transverse*width*nx,sy+transverse*width*ny


def torso(item, original, semantic, points):
    d=DONORS[item]; mask=semantic['tank'].copy()
    neck=point(points,'neck'); wl=point(points,'waistLeft'); wr=point(points,'waistRight')
    waist=(wl+wr)/2
    waist_y=wl[1]+(XX-wl[0])*(wr[1]-wl[1])/max(1,wr[0]-wl[0])
    if d['hem']:
        mask |= semantic['shorts'] & (YY<=waist_y+d['hem'])
    # Registered waist guides run through the hem rather than its last pixel.
    # Fit the full visible tank/hem extent so the bottom row is not repeated
    # into a 15px barcode-like band.
    hem_extent=float(np.percentile((YY-waist_y)[mask],99.9))
    progress=np.clip((YY-neck[1]+10)/np.maximum(60,waist_y+hem_extent-neck[1]+10),0,1)
    center=neck[0]*(1-progress)+waist[0]*progress
    width=max(110,wr[0]-wl[0])*(1.06-.06*progress)
    u=(XX-center)/width
    src=np.asarray(d['axis'])
    sx=src[0,0]*(1-progress)+src[1,0]*progress+u*(d['width'][0]*(1-progress)+d['width'][1]*progress)
    sy=src[0,1]*(1-progress)+src[1,1]*progress
    color=sample(item,'torso',sx,sy)
    # Keep the source pose's thin real external seam, never a stretched donor edge.
    edge=mask&(original[:,:,:3].mean(axis=2)<50)
    color[edge]=original[edge,:3]
    return mask,color


def sleeve(item, side, original, masks, points):
    d=DONORS[item]
    shoulder=point(points,side+'Shoulder'); elbow=point(points,side+'Elbow'); wrist=point(points,side+'Wrist')
    whole=masks[side+'Arm']
    if d['sleeveFraction']<1:
        vector=elbow-shoulder; length=max(1,float(np.linalg.norm(vector)))
        unit=vector/length
        forward=(XX-shoulder[0])*unit[0]+(YY-shoulder[1])*unit[1]
        progress=np.clip(forward/(length*d['sleeveFraction']),0,1)
        distance=(XX-shoulder[0])*(-unit[1])+(YY-shoulder[1])*unit[0]
        mask=whole & masks[side+'UpperArm'] & (forward<=length*d['sleeveFraction'])
        # In the source's folded-arm poses, the returning forearm is in front
        # of the upper arm. A nearest-chain split alone paints a triangular
        # sleeve across it. Preserve this visible forearm with its source-sized
        # capsule; this changes only short-sleeve ownership, never source pixels.
        forearm=wrist-elbow; forelength=max(1,float(np.linalg.norm(forearm)))
        if float(unit @ (forearm/forelength)) < .1:
            phase=np.clip(((XX-elbow[0])*forearm[0]+(YY-elbow[1])*forearm[1])/(forelength*forelength),0,1)
            foredistance=np.hypot(XX-elbow[0]-phase*forearm[0],YY-elbow[1]-phase*forearm[1])
            mask &= foredistance > (37 if side=='near' else 28)
    else:
        progress,distance,_=chain_field([shoulder,elbow,wrist])
        mask=whole.copy()
    # Cross sections retain the source character's broad arms. Robust upper-arm
    # width keeps a cropped/occluded elbow from collapsing the texture domain.
    arm_width=40 if side=='near' else 30
    sx,sy=donor_chain_xy(d[side+'Chain'],d[side+'Width'],progress,distance/arm_width)
    rgb=sample(item,side,sx,sy)
    return mask,rgb,progress


def prepare_frame(item, original, guide, semantic, limbs, garment_points=None):
    points=guide['points']; owned,rgb=torso(item,original,semantic,points)
    patch=np.zeros_like(original)
    patch[owned,:3]=np.rint(np.clip(rgb[owned],0,255)).astype(np.uint8)
    patch[owned,3]=original[owned,3]
    # Visible source arm masks already encode forearm-over-chest occlusion.
    for side in ['far','near']:
        mask,color,progress=sleeve(item,side,original,limbs,garment_points or points)
        # Preserve source-drawn outer contour, while every interior cloth pixel
        # comes from the painted garment source rather than recoloured skin.
        lum=original[:,:,:3].mean(axis=2)
        outline=(lum<55)&mask&(~nd.binary_dilation(semantic['tank'],iterations=4))
        # Keep the source seam's darkness but dye its brown skin outline to the
        # cloth hue, avoiding a flesh-coloured shoulder ring on full sleeves.
        factor=np.clip(lum/np.maximum(color.mean(axis=2),1),.2,.75)
        color[outline]=color[outline]*factor[outline,None]
        patch[mask,:3]=np.rint(np.clip(color[mask],0,255)).astype(np.uint8)
        patch[mask,3]=original[mask,3]
        owned |= mask
    protected=protected_mask(guide)
    owned &= ~protected & (original[:,:,3]>0)
    patch[~owned]=0
    assert not (owned&protected).any()
    return patch,owned



def validate_package(item, patches, originals, author):
    """Decode the written deliverable and compare every atlas crop to authorship."""
    path=ROOT/f'docs/kling-wardrobe/garments/male/{item}.zip'
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        manifest=json.loads(archive.read('manifest.json'))
        assert manifest['registrationSha256']==sha(author.registration_bytes)
        assert manifest['sourceSha256']==author.registration['sourceSha256']
        assert set(f['frameId'] for f in manifest['frames'])==set(originals)
        assert len(manifest['frames'])==len(originals)==88
        pages=[]; ownership=[]
        for page in manifest['pages']:
            rgba=np.asarray(Image.open(io.BytesIO(archive.read(page['file']))).convert('RGBA'))
            mask=np.asarray(Image.open(io.BytesIO(archive.read(page['maskFile']))).convert('RGBA'))[:,:,3]>0
            assert rgba.shape==(page['height'],page['width'],4) and mask.shape==rgba.shape[:2]
            pages.append(rgba);ownership.append(mask)
        protected_changes=0
        for frame in manifest['frames']:
            fid=frame['frameId'];r=frame['rect'];offset=frame['offset'];p=frame['page']
            full=np.zeros_like(originals[fid]);owned=np.zeros(full.shape[:2],bool)
            crop=(slice(r['y'],r['y']+r['height']),slice(r['x'],r['x']+r['width']))
            dest=(slice(offset['y'],offset['y']+r['height']),slice(offset['x'],offset['x']+r['width']))
            full[dest]=pages[p][crop];owned[dest]=ownership[p][crop]
            assert np.array_equal(full,patches[fid][0]) and np.array_equal(owned,patches[fid][1])
            assert not np.any(full[~owned])
            assert np.array_equal(full[owned,3],originals[fid][owned,3])
            protected_changes+=int((owned&protected_mask(author.guides[fid])).sum())
        assert protected_changes==0
    return {'id':item,'sha256':sha(path.read_bytes()),'bytes':path.stat().st_size,
        'zipCRC':'passed','decodedFrames':88,'decodedPNGs':len(pages)*2,
        'atlasRoundTrip':'exact RGBA and ownership','sourceAlpha':'exact for all owned pixels',
        'protectedHeadHandPixelsChanged':protected_changes,
        'outsideOwnership':'all RGBA zero','sourceRegistration':'exact hashes',
        'visualReview':'14 native preparation keyposes, including folded wrists; application-export review is separate'}


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--preview-only',action='store_true')
    args=parser.parse_args(); OUT.mkdir(parents=True,exist_ok=True)
    source_bytes,manifest,_,frames=load_source('male'); author=MaleLimbOwnership()
    ids=[i for i in KEYS if i in frames] if args.preview_only else list(frames)
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',17)
    catalog=[]; audit=[]; validation=[]
    for item,d in DONORS.items():
        patches={}; previews={}
        for fid in ids:
            original=frames[fid]; semantic=author.semantic(fid)
            limbs=author.for_frame(fid,original)
            patch,owned=prepare_frame(item,original,author.guides[fid],semantic,limbs,author.points(fid))
            patches[fid]=(patch,owned)
            audit.append({'item':item,'frameId':fid,'ownedPixels':int(owned.sum()),'protectedHeadHandOwnershipPixels':int((owned&protected_mask(author.guides[fid])).sum())})
            if fid in KEYS:
                dressed=original.copy(); dressed[owned]=patch[owned]; previews[fid]=dressed
                Image.fromarray(dressed).save(OUT/f'{item}-{fid:03}.png')
        sheet=Image.new('RGB',(352*4,556*((len(previews)+3)//4)),'#eeeade'); draw=ImageDraw.Draw(sheet)
        for i,(fid,pixels) in enumerate(previews.items()):
            x=(i%4)*352;y=(i//4)*556
            im=Image.fromarray(pixels).resize((352,528),Image.Resampling.LANCZOS)
            sheet.paste(im,(x,y+28),im);draw.text((x+5,y+5),f'{item} / {fid}',font=font,fill='#354638')
        sheet.save(OUT/f'{item}-contact.png')
        if not args.preview_only:
            provenance=(f'Development-time OpenAI garment design artwork/kling-wardrobe/source/full-outfits-v1/designs.png SHA256 {sha(DESIGN.read_bytes())}. '
                'Manually delimited garment RGB only; generated head, skin, hands and backdrop discarded. '
                'Offline native torso/sleeve texture registration uses approved source-pose material/limb ownership and existing guides. '
                'Occluded anatomy is not reconstructed. Original source head/hands, body coordinates, action frames, timing and anchor are unchanged; browser composition is deterministic and local.')
            catalog.append(save_garment('male',item,d['name'],'top',author.registration_bytes,patches,provenance))
            validation.append(validate_package(item,patches,frames,author))
    (OUT/'donor-registration.json').write_text(json.dumps({'sourceSha256':sha(DESIGN.read_bytes()),'donors':DONORS,'sampling':'cloth-only padded donor RGB; source visible ownership and RGBA alpha', 'ownershipHelperSha256':sha((ROOT/'scripts/kling_male_limb_ownership.py').read_bytes()), 'sourceRegistrationSha256':sha(author.registration_bytes), 'sourceFrameCount':88, 'sourceFrameSize':[704,1056], 'anchor':{'x':352,'y':998}, 'shortSleeveForearmPriority':{'trigger':'upper-arm and forearm dot product < 0.1','nearRadiusPixels':37,'farRadiusPixels':28}, 'limitations':['Clothing follows the existing source body silhouette; no new loose sleeve silhouette.','Folded-arm short sleeves use an authored conservative source-forearm occlusion rule.','Donor folds are texture-registered, not independently redrawn for every pose.','Source face, neck, protected hands, pose, timing and alpha remain unchanged.']},indent=2)+'\n')
    (OUT/'ownership-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
    if catalog:(OUT/'catalog-items.json').write_text(json.dumps(catalog,indent=2)+'\n')
    if validation:(OUT/'package-validation.json').write_text(json.dumps(validation,indent=2)+'\n')
    for item in DONORS:
        for region in ['torso','near','far']:
            _,mask=donor_texture(item,region)
            rgba=np.zeros((1024,1536,4),np.uint8);rgba[mask,:3]=np.asarray(Image.open(DESIGN).convert('RGB'))[mask];rgba[mask,3]=255
            Image.fromarray(rgba).save(OUT/f'{item}-{region}-donor.png')
    print(json.dumps({'items':catalog,'preview':str(OUT)},indent=2))


if __name__=='__main__':main()
