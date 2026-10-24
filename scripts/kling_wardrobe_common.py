"""Offline wardrobe packaging. PNGs contain prepared artwork, never a runtime rig.

All patches replace RGBA under a binary ownership mask. Positions remain in the
unaltered 704 x 1056 source coordinate space; alpha is not used as ownership.
"""
from pathlib import Path
import hashlib
import io
import json
import zipfile
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]

def json_bytes(data):
    return (json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n').encode()

def sha(data):
    return hashlib.sha256(data).hexdigest()

def png_bytes(array):
    out = io.BytesIO()
    Image.fromarray(np.asarray(array, dtype=np.uint8), 'RGBA').save(out, format='PNG', compress_level=9)
    return out.getvalue()

def protected_mask(reg_frame, size=(704,1056)):
    # Match the browser compositor's pixel-centre / boundary-inclusive rule.
    result=np.zeros((size[1],size[0]),bool)
    for region in reg_frame['protected']:
        points=region['polygon'];left=max(0,int(min(p['x'] for p in points)));top=max(0,int(min(p['y'] for p in points)))
        right=min(size[0],int(max(p['x'] for p in points))+1);bottom=min(size[1],int(max(p['y'] for p in points))+1)
        yy,xx=np.indices((bottom-top,right-left));x=xx+left+.5;y=yy+top+.5
        inside=np.zeros(x.shape,bool);boundary=np.zeros(x.shape,bool)
        for i,b in enumerate(points):
            a=points[i-1]
            cross=(x-a['x'])*(b['y']-a['y'])-(y-a['y'])*(b['x']-a['x'])
            boundary |= (abs(cross)<1e-9)&(x>=min(a['x'],b['x']))&(x<=max(a['x'],b['x']))&(y>=min(a['y'],b['y']))&(y<=max(a['y'],b['y']))
            if b['y']!=a['y']:
                inside ^= ((a['y']>y)!=(b['y']>y))&(x<((b['x']-a['x'])*(y-a['y'])/(b['y']-a['y'])+a['x']))
        result[top:bottom,left:right] |= inside|boundary
    return result

def load_source(character):
    source = ROOT / f'docs/kling-motion/exports/{character}.character.zip'
    with zipfile.ZipFile(source) as z:
        manifest=json.loads(z.read('manifest.json'))
        config=json.loads(z.read('character.json'))
        pages=[np.asarray(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA')) for p in [manifest['spritesheet'],*manifest.get('additionalSheets',[])]]
    frames={}
    for f in manifest['frames']:
        frames[f['id']]=pages[f.get('page',0)][f['y']:f['y']+f['height'],f['x']:f['x']+f['width']].copy()
    return source.read_bytes(),manifest,config,frames

def save_garment(character, item_id, name, slot, registration_bytes, patches, provenance, output=None, hand_reviews=None):
    """patches = {frameId:(full_native_RGBA, full_native_binary_ownership)}."""
    registration=json.loads(registration_bytes)
    assert set(patches)=={f['frameId'] for f in registration['frames']}
    # Shelf pack integer crops. 2048-wide pages keep transfer/decode bounded.
    width=2048; max_height=4096; shelves=[]; crops=[]; x=y=row_height=0; page=0
    for frame_id in sorted(patches):
        rgba,owned=patches[frame_id]
        owned=np.asarray(owned,dtype=bool)
        assert rgba.shape==(1056,704,4) and owned.shape==(1056,704)
        assert owned.any(), f'Empty garment frame {frame_id}'
        assert not (rgba[~owned,3]>0).any()
        yy,xx=np.where(owned); left,top,right,bottom=xx.min(),yy.min(),xx.max()+1,yy.max()+1
        w,h=int(right-left),int(bottom-top)
        if x+w>width: x=0; y+=row_height; row_height=0
        if y+h>max_height:
            shelves.append(y+row_height); page+=1; x=y=row_height=0
        crops.append((frame_id,page,int(x),int(y),int(left),int(top),int(w),int(h)))
        x+=w+2; row_height=max(row_height,h+2)
    shelves.append(y+row_height)
    assert len(shelves)<=4 and sum(width*h for h in shelves)<=32*1024*1024
    files={}; pages=[]; metadata=[]
    for page,height in enumerate(shelves):
        height=int(height)
        atlas=np.zeros((height,width,4),np.uint8); mask=np.zeros_like(atlas)
        for frame_id,p,x,y,left,top,w,h in crops:
            if p!=page: continue
            rgba,owned=patches[frame_id]
            atlas[y:y+h,x:x+w]=rgba[top:top+h,left:left+w]
            mask[y:y+h,x:x+w,3]=np.asarray(owned[top:top+h,left:left+w],np.uint8)*255
            metadata.append({'frameId':frame_id,'page':page,'rect':{'x':x,'y':y,'width':w,'height':h},'offset':{'x':left,'y':top}})
        file=f'patches-{page}.png'; mask_file=f'ownership-{page}.png'
        files[file]=png_bytes(atlas);files[mask_file]=png_bytes(mask)
        pages.append({'file':file,'maskFile':mask_file,'width':width,'height':height})
    manifest={'format':'gathria-sprite-garment','version':1,'id':item_id,'name':name,'slot':slot,
        'sourceSha256':registration['sourceSha256'],'registrationSha256':sha(registration_bytes),
        'characterId':registration['characterId'],'frameWidth':704,'frameHeight':1056,
        'pages':pages,'frames':sorted(metadata,key=lambda f:f['frameId']),'provenance':provenance}
    if hand_reviews:
        manifest['version']=2
        manifest['handProtectionReviews']=hand_reviews
    files['manifest.json']=json_bytes(manifest)
    output=Path(output) if output else ROOT/f'docs/kling-wardrobe/garments/{character}/{item_id}.zip'
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for name,data in sorted(files.items()):
            info=zipfile.ZipInfo(name,(1980,1,1,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,data)
    return {'id':item_id,'name':manifest['name'],'slot':slot,'url':'/'+str(output.relative_to(ROOT)),'sha256':sha(output.read_bytes()),'bytes':output.stat().st_size}
