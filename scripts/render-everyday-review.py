"""Four everyday looks from application-exported PNGs; all prior evidence is read-only."""
from pathlib import Path
import json,hashlib
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'docs/everyday';B=ROOT/'docs/running'
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';BG='#f6f2e9';STAGE='#e8ecdf';INK='#45493d'
font=lambda size=15:ImageFont.truetype(FONT,size)

def manifest(who,before=False):return json.loads(((B if before else D)/who/'manifest.json').read_text())
def frame(who,index=12,facing='right',before=False):
    folder=B if before else D;m=manifest(who,before);f=next(f for f in m['frames'] if f['id']==index)
    with Image.open(folder/who/'spritesheet.png') as source:im=source.convert('RGBA').crop((f['x'],f['y'],f['x']+192,f['y']+256))
    return im.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if facing=='left' else im

def save_png(im,name):
    path=D/name;temp=path.with_suffix('.tmp.png');im.save(temp)
    with Image.open(temp) as check:check.load();assert check.size==im.size
    temp.replace(path)

def panel(items,columns,scale=1,crop=None,title='Actual exported frames'):
    w,h=(crop[2]-crop[0],crop[3]-crop[1]) if crop else (192,256);cw,ch=w*scale+20,h*scale+42
    result=Image.new('RGB',(cw*columns+20,ch*((len(items)+columns-1)//columns)+56),BG);draw=ImageDraw.Draw(result);draw.text((16,12),title,font=font(16),fill=INK)
    for i,item in enumerate(items):
        who,label,index,*extra=item;im=frame(who,index,before=bool(extra and extra[0]))
        if crop:im=im.crop(crop)
        im=im.resize((w*scale,h*scale),Image.Resampling.NEAREST);x,y=20+i%columns*cw,48+i//columns*ch
        draw.rectangle((x,y,x+w*scale-1,y+h*scale-1),fill=STAGE);result.paste(im,(x,y),im);draw.text((x,y+h*scale+8),label,font=font(13),fill=INK)
    return result

records=json.loads((D/'exports-validation.json').read_text())['exports']
looks=[(item['id'],item['label']) for item in records]
assert len(looks)==4
for action,index in [('idle',0),('run',15)]:
    for scale in (1,2):save_png(panel([(who,label,index) for who,label in looks],4,scale,title=f'Everyday looks / actual exported {action} / {scale}x nearest-neighbor'),f'lineup-{action}-{scale}x.png')
save_png(panel([(who,f'{label} / {action}',index) for who,label in looks for action,index in [('idle',0),('walk',7),('run',15)]],3,title='Everyday looks / actual idle, walk and run / 1x'),'idle-walk-run-1x.png')
phases=['contact','load','push-off','flight','recovery','reach']*2
save_png(panel([(who,f'{label} / {i:02d}',12+i) for who,label in looks for i in range(12)],6,title='Everyday run / each look occupies two rows / 12 actual frames per look'),'run-keyframes.png')
save_png(panel([(who,f'{label} / frame {index}',index) for who,label in looks for index in (12,15)],4,3,(30,65,154,195),'Everyday neckline, shoulder, wrist and waist / actual exports / 3x'),'connections-3x.png')

def scene(index,facing,label):
    out=Image.new('RGB',(32+384*len(looks),592),BG);draw=ImageDraw.Draw(out)
    draw.text((16,10),label,font=font(16),fill=INK);draw.line((10,520,out.width-10,520),fill='#aab7a1')
    for col,(who,name) in enumerate(looks):
        im=frame(who,index,facing).resize((384,512),Image.Resampling.NEAREST);out.paste(im,(16+col*384,40),im);draw.text((16+col*384,560),name,font=font(15),fill=INK)
    return out

def save_gif(events,name):
    images=[event[0] for event in events];strip=Image.new('RGB',(images[0].width,images[0].height*len(images)))
    for i,im in enumerate(images):strip.paste(im,(0,i*im.height))
    palette=strip.quantize(colors=256,dither=Image.Dither.NONE);indexed=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in images]
    cumulative=0;previous=0;durations=[]
    for _,duration in events:
        cumulative+=duration;target=round(cumulative/10)*10;durations.append(target-previous);previous=target
    expected=[]
    for im,duration in zip(indexed,durations):
        digest=hashlib.sha256(im.convert('RGB').tobytes()).hexdigest()
        if expected and expected[-1][0]==digest:expected[-1][1]+=duration
        else:expected.append([digest,duration])
    path=D/name;temp=path.with_suffix('.tmp.gif');indexed[0].save(temp,save_all=True,append_images=indexed[1:],duration=durations,loop=0,disposal=1,optimize=False)
    actual=[];decoded_hashes=[]
    with Image.open(temp) as im:
        assert im.info['loop']==0
        for i in range(im.n_frames):
            im.seek(i);im.load();actual.append(im.info['duration']);decoded_hashes.append(hashlib.sha256(im.convert('RGB').tobytes()).hexdigest())
    assert list(zip(decoded_hashes,actual))==[tuple(x) for x in expected],name
    assert sum(actual)==sum(durations),(name,actual,durations)
    temp.replace(path)
    return dict(file=name,logicalFrames=len(events),decodedFrames=len(actual),durationMs=sum(actual),frameDurationsMs=actual,unquantizedDurationMs=sum(d for _,d in events),decodedFrameSha256=decoded_hashes)

loops=[]
for action in ('idle','walk','run'):
    clip=manifest(looks[0][0])['animations'][action]
    for facing in ('right','left'):
        events=[(scene(index,facing,f'Actual everyday exports / {action} {facing} / in place / 2x'),1000/clip['fps']) for index in clip['frames']]
        loops.append(save_gif(events,f'{action}-{facing}.gif'))
events=[]
for action,facing,repeats in [('idle','right',1),('walk','right',1),('run','right',2),('run','left',2)]:
    clip=manifest(looks[0][0])['animations'][action]
    for _ in range(repeats):events.extend((scene(index,facing,f'Action switch / {action.upper()} {facing} / fixed anchor, in place / 2x'),1000/clip['fps']) for index in clip['frames'])
loops.append(save_gif(events,'action-switch.gif'))
(D/'preview-timelines.json').write_text(json.dumps(loops,indent=2)+'\n')
print(f'Rendered four actual everyday looks and {len(loops)} GIF previews; every decoded frame hash and duration matches the exported source sequence.')
