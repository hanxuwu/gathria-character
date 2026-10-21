#!/usr/bin/env python3
"""Review media from CharacterPacks downloaded by the real wardrobe UI.

Never reads generated garment concept art. Native PNGs retain 704x1056 frames;
GIF previews are explicitly labelled 0.5x, with quantized GIF colour only.
"""
from pathlib import Path
from io import BytesIO
import hashlib,json,zipfile,math
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/kling-wardrobe/review';OUT.mkdir(parents=True,exist_ok=True)
FONT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22)
SMALL_FONT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14)
BG='#f2efe6';inventory=[]

def pack(path):
    with zipfile.ZipFile(path) as z:
        m=json.loads(z.read('manifest.json'))
        pages=[Image.open(BytesIO(z.read(p['file']))).convert('RGBA') for p in [m['spritesheet'],*m.get('additionalSheets',[])]]
        frames={f['id']:pages[f.get('page',0)].crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height'])) for f in m['frames']}
    return m,frames

def record(path,kind,extra=None):
    data=path.read_bytes();item={'file':str(path.relative_to(ROOT)),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'kind':kind}
    assert data
    with Image.open(path) as im:
        item['size']=list(im.size)
        if kind=='gif':
            total=0
            for k in range(im.n_frames):im.seek(k);im.load();total+=im.info.get('duration',0)
            item.update(decodedFrames=im.n_frames,totalDurationMs=total,loop=im.info.get('loop'))
            assert total>0 and im.n_frames>1
        else:im.load()
    if extra:item.update(extra)
    inventory.append(item)

def panel(images,labels,path,zoom=1):
    w,h=images[0].size;sheet=Image.new('RGB',(w*len(images),h+40),BG);d=ImageDraw.Draw(sheet)
    for i,(im,label) in enumerate(zip(images,labels)):
        sheet.paste(im,(i*w,40),im);d.text((i*w+12,8),label,font=FONT,fill='#293e34')
    if zoom>1:sheet=sheet.resize((sheet.width*zoom,sheet.height*zoom),Image.Resampling.NEAREST)
    sheet.save(path);record(path,'png',{'zoom':zoom,'nativeFrame':[704,1056]})

def gif(m,frames,action,facing,path,label):
    clip=m['animations'][action];ids=clip['frames'];fps=clip['fps'];images=[];durations=[]
    for i,fid in enumerate(ids):
        image=frames[fid]
        if facing=='left':image=image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        image=image.resize((352,528),Image.Resampling.LANCZOS)
        canvas=Image.new('RGB',(384,580),BG);canvas.paste(image,(16,38),image)
        d=ImageDraw.Draw(canvas);d.text((12,8),label,font=SMALL_FONT,fill='#293e34');d.text((12,558),'0.5x preview / actual exported sprites',font=SMALL_FONT,fill='#65705e')
        images.append(canvas)
        durations.append((round((i+1)*100/fps)-round(i*100/fps))*10)
    kwargs={'loop':0} if clip['loop'] else {}
    images[0].save(path,save_all=True,append_images=images[1:],duration=durations,disposal=2,optimize=False,**kwargs)
    record(path,'gif',{'action':action,'facing':facing,'logicalFrameCount':len(ids),'fps':fps,'expectedDurationMs':sum(durations),'displayScale':.5,'sourcePack':m['name']})
    assert inventory[-1]['totalDurationMs']==sum(durations)

for char in ['male','female']:
    originals,base=pack(ROOT/f'docs/kling-motion/exports/{char}.character.zip')
    looks={}
    for look in ['day','wedding']:
        file=ROOT/f'docs/kling-wardrobe/exports/{char}-{look}.character.zip'
        m,frames=pack(file);looks[look]=(m,frames)
        assert m['anchor']==originals['anchor'] and m['animations']==originals['animations'] and m['frames']==originals['frames']
        for action in ['idle','walk','run','jump','celebrate']:
            for facing in ['right','left']:
                gif(m,frames,action,facing,OUT/f'{char}-{look}-{action}-{facing}.gif',f'{char} / {look} / {action} / {facing}')
        ids=list(dict.fromkeys(m['animations']['run']['frames']));cols=4;cw,ch=704,1096
        sheet=Image.new('RGB',(cw*cols,ch*math.ceil(len(ids)/cols)),BG);d=ImageDraw.Draw(sheet)
        for i,fid in enumerate(ids):
            x=i%cols*cw;y=i//cols*ch;im=frames[fid];sheet.paste(im,(x,y+40),im);d.text((x+12,y+8),f'{char} {look} / run / frame ID {fid}',font=FONT,fill='#293e34')
        path=OUT/f'{char}-{look}-run-keyframes-native.png';sheet.save(path);record(path,'png',{'nativeFrame':[704,1056]})
    fid=originals['animations']['idle']['frames'][0]
    imgs=[base[fid],looks['day'][1][fid],looks['wedding'][1][fid]]
    labels=[f'{char} original',f'{char} everyday',f'{char} wedding']
    for zoom in [1,2]:panel(imgs,labels,OUT/f'{char}-comparison-{zoom}x.png',zoom)
    for fid in [51,98]:
        if fid not in base:continue
        reg=json.loads((ROOT/f'docs/kling-wardrobe/registration/{char}.json').read_text())
        p=next(f for f in reg['frames'] if f['frameId']==fid)['points']
        feet=[p[k] for k in ['nearAnkle','farAnkle','nearToe','farToe']]
        crop=(max(0,int(min(q['x'] for q in feet)-100)),max(0,int(min(q['y'] for q in feet)-100)),min(704,int(max(q['x'] for q in feet)+110)),min(1056,int(max(q['y'] for q in feet)+55)))
        panel([base[fid].crop(crop),looks['day'][1][fid].crop(crop),looks['wedding'][1][fid].crop(crop)],labels,OUT/f'{char}-ankles-{fid}-2x.png',2)
    for fid in [58,87,96,104]:
        if fid not in base:continue
        # A common fixed crop across all looks for this actual source frame.
        reg=json.loads((ROOT/f'docs/kling-wardrobe/registration/{char}.json').read_text())
        f=next(f for f in reg['frames'] if f['frameId']==fid);p=f['points']
        top=max(0,int(min(p['nearShoulder']['y'],p['farShoulder']['y'])-55));bottom=min(1056,int(max(p['waistLeft']['y'],p['waistRight']['y'])+180))
        crop=(105,top,620,bottom)
        panel([base[fid].crop(crop),looks['day'][1][fid].crop(crop),looks['wedding'][1][fid].crop(crop)],labels,OUT/f'{char}-connections-{fid}-2x.png',2)

(OUT/'media-index.json').write_text(json.dumps({'source':'Actual CharacterPack ZIP downloads from the wardrobe UI; no concept art used.','gifNote':'0.5x display with GIF palette quantization; native PNG and source PNG atlas are lossless. Duration uses centisecond rounding preserving each complete clip total. Jump is one-shot, other clips loop as exported.','artifacts':inventory},indent=2)+'\n')
print(json.dumps({'artifacts':len(inventory),'decodedGIFs':sum(x['kind']=='gif' for x in inventory),'decodedPNGs':sum(x['kind']=='png' for x in inventory)},indent=2))
