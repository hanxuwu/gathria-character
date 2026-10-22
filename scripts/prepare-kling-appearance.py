#!/usr/bin/env python3
"""Offline head artwork preparation, version 1. No runtime AI or body deformation.

Generated design sheets are hair donors only. Explicit head/ear boundary masks
exclude their generated faces and clothes. Runtime layers are registered to the
unchanged source pose; face pixels come from kling_gentle_face's local remap.
"""
from pathlib import Path
import argparse, io, json, zipfile
import cv2
import numpy as np
from PIL import Image, ImageDraw
from kling_wardrobe_common import ROOT, load_source, json_bytes, sha, png_bytes, protected_mask

ART=ROOT/'artwork/kling-appearance'
PADDING={'left':32,'top':128,'right':32,'bottom':0}
# Reviewed source-sheet coordinates; keep everything above the inner hairline.
# This is a cutout boundary, never a replacement drawing of facial features.
HAIRLINES={
 ('soft-crop','male'):[(0,560),(252,552),(271,505),(301,477),(336,466),(375,467),(404,487),(433,518),(443,524),(431,494),(427,459),(440,416),(480,391),(513,357),(536,307),(546,278),(567,273),(597,290),(625,321),(659,346),(698,365),(730,371),(758,376),(793,386),(813,414),(818,466),(873,450),(900,550)],
 ('soft-crop','female'):[(900,590),(1042,557),(1063,514),(1102,485),(1140,484),(1173,505),(1205,551),(1238,565),(1221,538),(1213,502),(1218,455),(1240,408),(1278,369),(1313,319),(1327,286),(1357,286),(1390,314),(1423,345),(1460,367),(1497,383),(1538,389),(1570,392),(1595,426),(1604,478),(1662,450),(1774,550)],
 ('soft-bob','male'):[(0,700),(218,627),(224,539),(239,493),(276,470),(313,467),(342,479),(353,516),(361,555),(382,589),(415,609),(447,612),(419,591),(408,555),(403,510),(405,458),(445,422),(483,385),(514,342),(539,293),(553,249),(576,245),(598,279),(621,315),(651,345),(686,370),(714,383),(746,388),(772,401),(785,437),(784,478),(771,513),(770,563),(780,606),(772,640),(750,667),(808,660),(900,700)],
 ('soft-bob','female'):[(900,700),(1034,657),(1043,556),(1055,516),(1090,492),(1123,489),(1161,500),(1186,527),(1203,569),(1235,611),(1264,633),(1293,635),(1266,614),(1245,584),(1228,548),(1224,502),(1232,462),(1271,424),(1311,377),(1344,326),(1363,272),(1372,256),(1394,260),(1422,301),(1456,341),(1490,370),(1522,389),(1553,398),(1582,401),(1601,427),(1610,469),(1599,511),(1597,557),(1609,606),(1608,651),(1580,678),(1661,666),(1774,700)],
}
# Source eyes are registration points only. Artwork stays above the face mask.
EYES={('soft-crop','male'):((584,491),(766,495)),('soft-crop','female'):((1363,502),(1544,505)),
      ('soft-bob','male'):((546,501),(732,504)),('soft-bob','female'):((1368,511),(1562,514))}
NATIVE_EYES={'male':((380,400),(501,403)), 'female':((379,377),(499,378))}

def donor(style,character):
    img=np.array(Image.open(ART/f'source/{style}-design.png').convert('RGBA'))
    h,w=img.shape[:2]; boundary=HAIRLINES[(style,character)]
    mask=Image.new('L',(w,h)); ImageDraw.Draw(mask).polygon([(boundary[0][0],0),(boundary[-1][0],0),*reversed(boundary)],fill=255)
    keep=np.array(mask)>0
    # Polygon hugs the hairline. Reject only bright donor skin INSIDE that cutout,
    # never source character colors, eyes or garment pixels.
    skin=(img[:,:,0]>206)&(img[:,:,1]>133)&(img[:,:,2]>87)
    edge=cv2.distanceTransform(keep.astype(np.uint8),cv2.DIST_L2,5)<12
    keep &= ~(skin & edge)
    img[~keep]=0
    # Discard tiny disconnected anti-alias flecks from generated transparent edges.
    n,labels,stats,_=cv2.connectedComponentsWithStats((img[:,:,3]>0).astype('uint8'),8)
    if n>1:
        keep2=np.isin(labels,np.flatnonzero(stats[:,4]>100)); keep2 &= labels!=0
        img[~keep2]=0
    return img

def fit_reference(style,character):
    rgba=donor(style,character)
    a,b=np.array(EYES[(style,character)],float); c,d=np.array(NATIVE_EYES[character],float)
    sx=(d[0]-c[0])/(b[0]-a[0]); sy=sx*(.89 if character=='female' else .85)
    # Eye anchored affine keeps bangs above the original brow. Only new hair is
    # fitted, original face/body are never warped or resized.
    M=np.array([[sx,0,c[0]-sx*a[0]],[0,sy,c[1]-sy*a[1]]],float)
    return rgba,M

def warp_rgba(rgba,M,size,sigma=0):
    # Premultiplied interpolation prevents dark fringes around alpha edges.
    f=rgba.astype(np.float32)/255; f[:,:,:3]*=f[:,:,3:4]
    out=cv2.warpAffine(f,M,size,flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    if sigma:out=cv2.GaussianBlur(out,(0,0),sigmaX=sigma,sigmaY=sigma)
    a=out[:,:,3:4];out[:,:,:3]=np.divide(out[:,:,:3],a,out=np.zeros_like(out[:,:,:3]),where=a>0)
    return np.clip(np.rint(out*255),0,255).astype(np.uint8)

def proposal():
    tiles=[]
    for char in ['male','female']:
        source=Image.open(ART/f'source/{char}-reference.png').convert('RGBA')
        for style in ['soft-crop','soft-bob']:
            donor_img,M=fit_reference(style,char)
            Image.fromarray(donor_img).save(ART/f'source/{char}-{style}-cutout.png')
            M[:,2]+=[32,128]
            hair=Image.fromarray(warp_rgba(donor_img,M,(768,1184)))
            canvas=Image.new('RGBA',(768,1184));canvas.alpha_composite(source,(32,128));canvas.alpha_composite(hair)
            bg=Image.new('RGBA',canvas.size,'#eee9df');bg.alpha_composite(canvas)
            bg.thumbnail((384,592));tiles.append(bg)
    sheet=Image.new('RGB',(1536,622),'#eee9df')
    for i,t in enumerate(tiles):sheet.paste(t,(i*384,30));ImageDraw.Draw(sheet).text((i*384+12,10),['male crop','male bob','female crop','female bob'][i],fill='#334238')
    sheet.save('/tmp/kling-head-proposal.png')

def build(character):
    from kling_gentle_face import prepare_gentle_face, PROVENANCE
    source,manifest,config,frames=load_source(character)
    heads=json.loads((ART/f'registration/{character}.json').read_text())
    reg_path=ROOT/('docs/kling-wardrobe/registration/male-full-outfits-v1.json' if character=='male' else 'docs/kling-wardrobe/registration/female.json')
    reg_bytes=reg_path.read_bytes();reg=json.loads(reg_bytes)
    assert heads['sourceSha256']==sha(source) and heads['bodyRegistrationSha256']==sha(reg_bytes)
    poses=[];entries=[];styles=[]
    reg_by={f['frameId']:f for f in reg['frames']}
    for row in heads['frames']:
        pose={k:row[k] for k in ['frameId','sourceFrame','anchors','headBounds','facePolygon','hairBounds','foreground']}
        # Include source polygon anti-alias fringe, within the schema's explicit
        # two-pixel raster tolerance; otherwise it falsely occludes hair as body.
        poly=next(p['polygon'] for p in reg_by[row['frameId']]['protected'] if p['label']=='head')
        x0=max(0,min(p['x'] for p in poly)-2);y0=max(0,min(p['y'] for p in poly)-2)
        x1=min(704,max(p['x'] for p in poly)+2);y1=min(1056,max(p['y'] for p in poly)+2)
        pose['headBounds']={'x':x0,'y':y0,'width':x1-x0,'height':y1-y0}
        poses.append(pose)
    pose_by={p['frameId']:p for p in poses}
    padding=PADDING;W=704+padding['left']+padding['right'];H=1056+padding['top']
    bounds={}
    def add(layer,fid,rgba,owned,offset=(0,0)):
        if not owned.any():layer['frames'].append({'frameId':fid,'mode':'source','reason':'Original action expression retained.'});return
        yy,xx=np.where(owned);x,y=int(xx.min()),int(yy.min());w,h=int(xx.max()+1-x),int(yy.max()+1-y)
        crop=rgba[y:y+h,x:x+w].copy();own=owned[y:y+h,x:x+w].copy();crop[~own]=0
        item={'frameId':fid,'mode':'paint','page':0,'rect':{'x':0,'y':0,'width':w,'height':h},'offset':{'x':x+offset[0],'y':y+offset[1]}}
        layer['frames'].append(item);entries.append((item,crop,own))
    for style,name in [('soft-crop','Soft crop'),('soft-bob','Soft bob')]:
        original,M=fit_reference(style,character);layer={'role':'hair-front','frames':[]}
        Image.fromarray(original).save(ART/f'source/{character}-{style}-cutout.png')
        for row in heads['frames']:
            fid=row['frameId'];T=np.vstack([row['headTransform'],[0,0,1]])@np.vstack([M,[0,0,1]])
            T=T[:2];T[:,2]+=[padding['left'],padding['top']]
            # Match only new hair to the existing source motion blur around jump.
            blur={88:.65,89:1.6,90:1.8,91:.7,100:.6,101:1.6,102:1.6,103:.65}.get(fid,0)
            rgba=warp_rgba(original,T,(W,H),blur);owned=rgba[:,:,3]>0
            assert not owned[[0,-1],:].any() and not owned[:,[0,-1]].any(), f'Hair clipped: {character}/{style}/{fid}'
            yy,xx=np.where(owned);b=(int(xx.min()-padding['left']),int(yy.min()-padding['top']),int(xx.max()+1-padding['left']),int(yy.max()+1-padding['top']))
            old=bounds.get(fid,b);bounds[fid]=(min(old[0],b[0]),min(old[1],b[1]),max(old[2],b[2]),max(old[3],b[3]))
            add(layer,fid,rgba,owned,(-padding['left'],-padding['top']))
        styles.append({'id':style,'name':name,'slot':'hair','layers':[layer]})
    layer={'role':'face','frames':[]}
    for row in heads['frames']:
        result=prepare_gentle_face(frames[row['frameId']],row)
        if result is None:layer['frames'].append({'frameId':row['frameId'],'mode':'source','reason':f"Preserve original {row['expression']['kind']} action expression."})
        else:add(layer,row['frameId'],*result)
    styles.append({'id':'gentle','name':'Gentle','slot':'face','layers':[layer]})
    for fid,b in bounds.items():pose_by[fid]['hairBounds']={'x':b[0],'y':b[1],'width':b[2]-b[0],'height':b[3]-b[1]}
    # Pack cropped patches; never allocate a full per-pose output sheet in memory.
    width=2048;limit=4096;x=y=row_h=page=0;heights=[]
    for item,crop,owned in entries:
        h,w=crop.shape[:2]
        if x+w>width:x=0;y+=row_h;row_h=0
        if y+h>limit:heights.append(y+row_h);page+=1;x=y=row_h=0
        item['page']=page;item['rect'].update(x=x,y=y);x+=w+2;row_h=max(row_h,h+2)
    heights.append(y+row_h)
    assert len(heights)<=8 and sum(width*h for h in heights)<=64*1024*1024,(character,heights)
    files={};pages=[]
    for p,height in enumerate(heights):
        atlas=np.zeros((height,width,4),np.uint8);mask=np.zeros_like(atlas)
        for item,crop,owned in entries:
            if item['page']!=p:continue
            r=item['rect'];x,y,w,h=r['x'],r['y'],r['width'],r['height']
            atlas[y:y+h,x:x+w]=crop;mask[y:y+h,x:x+w,3]=owned.astype(np.uint8)*255
        file=f'patches-{p}.png';mfile=f'ownership-{p}.png'
        files[file]=png_bytes(atlas);files[mfile]=png_bytes(mask)
        pages.append({'file':file,'maskFile':mfile,'width':width,'height':height})
    provenance='Hair: OpenAI image generation, 2026-10-22, approved Kling portraits as reference. Only hair cutouts used; generated faces/clothes discarded. Explicit reviewed hairline masks, premultiplied affine resampling, native pose head registration, new-hair-only blur matching on reviewed fast jump poses; no body rescale. Sources and prompts: artwork/kling-appearance/source. '+PROVENANCE
    bank={'format':'gathria-sprite-appearance-bank','version':1,'id':f'kling-{character}-appearance-v1','name':f'Kling {character} hair and gentle face',
      'sourceSha256':sha(source),'registrationSha256':sha(reg_bytes),'characterId':reg['characterId'],'frameWidth':704,'frameHeight':1056,'padding':PADDING,'poses':poses,'pages':pages,'styles':styles,'provenance':provenance}
    files['manifest.json']=json_bytes(bank)
    target=ROOT/f'docs/kling-appearance/banks/{character}.zip';target.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for name,data in sorted(files.items()):
            info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
    print(json.dumps({'character':character,'poses':len(poses),'pages':len(pages),'pixels':sum(width*h for h in heights),'bytes':target.stat().st_size,'sha256':sha(target.read_bytes())}),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--character',choices=['male','female','both']);args=parser.parse_args()
    if args.character:
        for char in (['male','female'] if args.character=='both' else [args.character]):build(char)
    else:proposal()
