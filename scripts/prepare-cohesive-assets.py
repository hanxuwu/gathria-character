"""Offline registration/cutting of the authored V5 expression sheet.

The three face states come from imagegen artwork, not procedural eye erasure.
Existing V1–V4 production banks are read-only. Coordinates are source pixels.
"""
from pathlib import Path
import base64, importlib.util, json, zlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'scripts/prepare-illustrated-assets.py'
spec = importlib.util.spec_from_file_location('original_preparer', path)
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)
SOURCE = Image.open(ROOT / 'artwork/cohesive-source/character-expression-bank.png').convert('RGBA')
W, H = 192, 256
STATES = ['neutral', 'gentle', 'joyful']
# Cell offsets register the jaw/neck, not the varying hair bounding box.
SPECS = {
 'waves': dict(crop=(90, 0, 540, 523), cx=325, top=207, waist=347, sole=519, sx=.42,
   offsets=[(0, 0), (451, 0), (928, 0)],
   shoulder=(284,271,385,271), elbow=(265,330,399,330), wrist=(240,380,425,380),
   hips=(302,359,351,359), knees=(302,420,351,420), ankles=(302,500,351,500),
   upper='#E6D3BD',lower='#E6D3BD',shoe='#D2B89A'),
 'crop': dict(crop=(140,523,474,1018),cx=319,top=711,waist=843,sole=1007,sx=.44,
   offsets=[(0,0),(456,0),(929,0)],
   shoulder=(269,768,367,770),elbow=(245,820,388,821),wrist=(231,866,408,865),
   hips=(293,862,341,862),knees=(278,915,343,915),ankles=(263,977,347,977),
   upper='#35435B',lower='#35435B',shoe='#805039'),
}

def normalize(description, offset=(0,0), source_image=SOURCE):
    pixels = Image.new('RGBA',(W,H)); mat = Image.new('L',(W,H))
    out, ids, src = pixels.load(),mat.load(),source_image.load()
    dx,dy=offset
    for y in range(H):
        sy=round(description['top']+(y-99)*(description['waist']-description['top'])/66) if y<=165 else round(description['waist']+(y-165)*(description['sole']-description['waist'])/74)
        for x in range(W):
            sx=round(description['cx']+(x-96)/description['sx'])
            x0,y0,x1,y1=description['crop']
            if not (x0<=sx<x1 and y0<=sy<y1 and 0<=sx+dx<SOURCE.width and 0<=sy+dy<SOURCE.height):continue
            r,g,b,a=src[sx+dx,sy+dy]
            if a<128:continue
            out[x,y]=(r,g,b,255)
            light=(r+g+b)/3
            if y<112:
                # Hair owns this region by default; anatomical masks below
                # assign skin without mistaking warm hair highlights for skin.
                ids[x,y]=2
                if light>205 and max(r,g,b)-min(r,g,b)<35:ids[x,y]=0
            else:
                skin=r>g*1.18 and g>b*1.09 and r>160 and g<205
                if description is SPECS['waves']:
                    ids[x,y]=1 if skin and y<188 and (x<76 or x>124 or y<127) else (3 if y<=165 else 4)
                else:
                    ids[x,y]=1 if skin and (y<124 or (y>160 and (x<72 or x>126))) else (3 if y<=176 else 4 if y<225 else 5)
                    # Waistcoat, tie, shirt and boutonniere are fixed-color inserts.
                    if y<171 and ((88<x<110 and light>115) or (x>109 and y<140 and r>g*1.16)):ids[x,y]=0
    # Protect authored eyes, lashes and brows from hair recoloring.
    face_poly = [(79,70),(97,62),(119,44),(130,60),(133,94),(122,106),(106,109),(86,102),(81,94)] if description is SPECS['waves'] else [(79,78),(101,60),(113,48),(128,67),(135,90),(132,104),(116,113),(99,111),(83,104),(76,93)]
    face=np.array(old.polygon(face_poly))>0
    material=np.array(mat).copy(); rgba=np.array(pixels)
    yy,xx=np.indices((H,W))
    rgb=rgba[:,:,:3].astype(float);light=rgb.mean(axis=2)
    # Explicit face anatomy owns the skin mask; eye ink and mouth are protected.
    eye=((xx>=86)&(xx<=112)&(yy>=76)&(yy<=95))|((xx>=121)&(xx<=137)&(yy>=74)&(yy<=95))
    mouth=(xx>=99)&(xx<=125)&(yy>=94)&(yy<=111)
    fixed=(eye & ((light<155)|(rgb.max(axis=2)-rgb.min(axis=2)<20)))|(mouth & (rgb[:,:,1]<135)&(rgb[:,:,0]-rgb[:,:,1]>35))
    # A small anatomical margin catches antialiased skin edges without taking
    # ownership of the brown hair strands crossing the forehead.
    face_margin=np.array(Image.fromarray(face.astype(np.uint8)*255).filter(ImageFilter.MaxFilter(9)))>0
    skin_rgb=(rgb[:,:,0]>165)&(rgb[:,:,0]>rgb[:,:,1]+28)&(rgb[:,:,1]>rgb[:,:,2]+10)
    fixed |= eye & ~skin_rgb
    skin_region=face_margin & skin_rgb
    skin_edge=np.array(Image.fromarray(skin_region.astype(np.uint8)*255).filter(ImageFilter.MaxFilter(3)))>0
    material[skin_edge & face_margin]=1;material[face & fixed]=0
    ear=np.array(old.polygon([(58,82),(66,79),(75,83),(79,95),(72,101),(62,99),(57,93)]))>0
    material[ear & (rgba[:,:,3]>0)]=1
    # Skin on both arms includes bright highlights, which hue thresholds alone missed.
    if description is SPECS['waves']:
        arm=old.polygon([(72,140),(81,141),(73,163),(68,180),(60,189),(48,187),(45,178),(58,165),(65,147)])
        ImageDraw.Draw(arm).polygon([(121,140),(129,139),(133,160),(145,177),(146,187),(136,187),(125,169),(120,150)],fill=255)
        warm=(rgb[:,:,0]>rgb[:,:,1]+12)&(rgb[:,:,1]>rgb[:,:,2]+9)
        material[(np.array(arm)>0)&warm&(rgba[:,:,3]>0)]=1
    mat=Image.fromarray(material)
    old.keep_main_component(pixels)
    # Skin blush and mouth are part of the authored whole-face state.
    return pixels,mat

def packed(name,image,ids,region,palette):
    if name.endswith(':back'):
        rgba=np.array(image).copy();materials=np.array(ids).copy()
        rgba[np.array(region)==0]=0
        valid=np.argwhere(rgba[:,:,3]>0);y0,x0=valid.min(axis=0);y1,x1=valid.max(axis=0)+1
        materials[rgba[:,:,3]==0]=0
        data=np.concatenate([rgba,materials[:,:,None]],axis=2)[y0:y1,x0:x1]
        old.LAYERS.append(dict(id=name,x=int(x0),y=int(y0),width=int(x1-x0),height=int(y1-y0),data=base64.b64encode(zlib.compress(data.tobytes(),9)).decode(),palette=palette))
        return name
    return old.layer(name,image,ids,region,palette)

def main():
    text=(ROOT/'src/core/illustrated-assets.generated.ts').read_text()
    original=json.loads(text.split('export const ILLUSTRATED_ASSETS = ',1)[1].split(' as unknown as ',1)[0])
    old.LAYERS.clear()
    portraits={}
    for style,description in SPECS.items():
        base,base_ids=normalize(description)
        head_ids=np.array(base_ids).copy();head_ids[(head_ids>2)&(np.indices(head_ids.shape)[0]<118)]=2
        base_ids=Image.fromarray(head_ids)
        head_mask=old.rect(0,0,191,110)
        ImageDraw.Draw(head_mask).polygon([(86,104),(109,107),(109,117),(86,117)],fill=255)
        # Back hair belongs behind the shoulders; its cut follows the torso silhouette.
        if style=='waves':
            back=old.polygon([(0,100),(76,100),(75,119),(65,143),(60,162),(0,168)])
            ImageDraw.Draw(back).polygon([(111,100),(191,100),(191,168),(132,168),(123,138),(116,118)],fill=255)
            back_ids=Image.fromarray(np.where(np.array(base)[:,:,3]>0,2,0).astype(np.uint8))
            back_id=packed('v5:waves:back',base,back_ids,back,{'skin':'#F4BC96','hair':'#795043'})
        states={}
        for state,offset in zip(STATES,description['offsets']):
            image,ids=normalize(description,offset)
            # Each state is a complete authored head, registered by the neck.
            # Do not paste a face patch into a different expression's hair/skin.
            head_material=np.array(ids).copy()
            yy,xx=np.indices((H,W))
            neck=(yy>=104)&(yy<=117)&(xx>=86)&(xx<=109)
            warm=np.array(image)[:,:,0].astype(int)>np.array(image)[:,:,1].astype(int)+15
            head_material[neck & warm]=1
            ids=Image.fromarray(head_material)
            states[state]=packed(f'v5:{style}:{state}',image,ids,head_mask,{'skin':'#F4BC96','hair':'#795043'})
        portraits[style]={'head':states['gentle'],'states':states,'faceCenter':[111,88],'jawStart':99,'eyes':[[87,72,22,18],[123,71,13,18]],**({'backHair':back_id} if style=='waves' else {})}
        # Wedding bodies are cut from the same neutral full-character source.
        if style=='waves':
            # Exclude all hair from the neck-down production image using the
            # anatomical torso/arm envelope; hair has its own rear layer.
            envelope=old.polygon([(86,105),(109,105),(123,120),(130,140),(145,181),(134,191),(122,172),(109,166),(83,166),(70,178),(58,191),(48,182),(65,141),(72,121)])
            body=base.copy(); arr=np.array(body); keep=np.array(envelope)>0
            arr[~keep]=0;body=Image.fromarray(arr)
            old.BODIES['bodice']=(body,base_ids)
            old.SPECS['bodice']={**description}
            gown,gown_ids=normalize(description,source_image=Image.open(ROOT/'artwork/cohesive-source/garment-backplate.png').convert('RGBA'))
            ga=np.array(gown);ga[:165]=0;ga[240:]=0
            gown_material=np.where(ga[:,:,3]>0,4,0).astype(np.uint8)
            old.BODIES['gown']=(Image.fromarray(ga),Image.fromarray(gown_material))
            old.SPECS['gown']={**description}
        else:
            body=base.copy();arr=np.array(body);arr[:111]=0
            old.BODIES['suit']=(Image.fromarray(arr),base_ids)
            old.SPECS['suit']={**description}
    replacements={name:old.upper(name) for name in ('suit','bodice')}
    # The source coat extends below the generic waist cut at row 168. Retain
    # its complete hem so the trousers do not expose a rectangular cutout.
    torso=next(x for x in old.LAYERS if x['id']==replacements['suit']['torso'])
    old.LAYERS.remove(torso)
    torso_mask=Image.new('L',(W,H));raw=np.frombuffer(zlib.decompress(base64.b64decode(torso['data'])),dtype=np.uint8).reshape(torso['height'],torso['width'],5)
    torso_mask.paste(Image.fromarray(raw[:,:,3]),(torso['x'],torso['y']))
    ImageDraw.Draw(torso_mask).polygon([(69,160),(122,160),(124,176),(70,176)],fill=255)
    suit,suit_ids=old.BODIES['suit']
    replacements['suit']['torso']=packed('v5:suit:torso-full',suit,suit_ids,torso_mask,old.palette(SPECS['crop']))
    # Dress uses the existing hidden shorts/legs; its gown is a new source layer.
    dress={**original['lower']['dress']}
    gown,ids=old.BODIES['gown']
    dress['garment']=packed('v5:dress:garment',gown,ids,old.rect(0,163,191,240),{'lower':'#E6D3BD'})
    formal=old.lower('v5-formal','suit')
    # Namespace all replacements so the shared immutable decode cache cannot
    # confuse old and new artwork layers.
    names={layer['id']:'v5:'+layer['id'] for layer in old.LAYERS if not layer['id'].startswith('v5:')}
    def rename(value):
        if isinstance(value,str):return names.get(value,value)
        if isinstance(value,dict):return {k:rename(v) for k,v in value.items()}
        if isinstance(value,list):return [rename(v) for v in value]
        return value
    for item in old.LAYERS:
        if 'skin' in item['palette']:item['palette']['skin']='#F4BC96'
    result=rename({'layers':old.LAYERS,'portraits':portraits,'upper':replacements,'dress':dress,'formalTrousers':formal})
    out=ROOT/'src/core/cohesive-assets.generated.ts'
    out.write_text('// Generated by scripts/prepare-cohesive-assets.py; do not edit packed bytes.\nexport const COHESIVE_ASSETS = '+json.dumps(result,separators=(',',':'))+';\n')
    print(f'Prepared {len(old.LAYERS)} V5 layers, {out.stat().st_size} bytes')

if __name__=='__main__':main()
