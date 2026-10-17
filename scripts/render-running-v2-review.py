"""Motion 2 review media from application-exported PNGs; prior evidence is read-only."""
from pathlib import Path
import json,hashlib
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'docs/running-v2';B=ROOT/'docs/running'
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

pairs=[]
for index in (12,15):
    for who in ('dress','suit'):
        pairs.extend([(who+'-joyful',f'{who} / motion 1 / frame {index}',index,True),(who+'-joyful',f'{who} / motion 2 / frame {index}',index)])
for scale in (1,2):save_png(panel(pairs,4,scale,title=f'Actual exports / motion 1 -> motion 2 / same frame IDs and V6 identity / {scale}x'),f'before-after-{scale}x.png')
items=[(who+'-joyful',f'{who} / {action}',index) for who in ('dress','suit') for action,index in (('idle',0),('walk',7),('run',15))]
for scale in (1,2):save_png(panel(items,3,scale,title=f'Preserved V6 / idle, walk and motion 2 run / actual exports / {scale}x'),f'idle-walk-run-{scale}x.png')
phases=['contact','load','push-off','flight','recovery','reach']*2
keys=[(who+'-joyful',f'{i:02d} {phases[i]}',12+i) for who in ('dress','suit') for i in range(12)]
save_png(panel(keys,6,title='Motion 2 run / bride rows 1-2, groom rows 3-4 / actual exported frames'),'run-keyframes.png')
save_png(panel([(who+'-joyful',f'{who} / frame {12+i}',12+i) for who in ('dress','suit') for i in (0,3,6,9)],4,3,(30,65,154,195),'Run neck, shoulders, hands and attachment details / 3x'),'run-connections-3x.png')
save_png(panel([(f'{who}-{expression}',who+' / '+expression,15) for who in ('dress','suit') for expression in ('neutral','gentle','joyful')],3,2,title='Three saved V6 expressions / motion 2 run / actual exports / 2x'),'run-expressions-2x.png')
save_png(panel([(f'{who}-dark-skin',who+' / deep skin + blonde',15) for who in ('dress','suit')],2,2,title='Material recolors / actual motion 2 run / 2x'),'run-recolor-2x.png')
save_png(panel([(look,f'{look} / {phase}',12+i) for look in ('dress-shorts','suit-skirt') for i,phase in ((0,'contact'),(3,'flight'),(6,'other contact'))],3,2,title='Exposed-leg garments / actual motion 2 run / 2x'),'run-lower-garments-2x.png')

def scene(who_list,index,facing,label):
    out=Image.new('RGB',(32+384*len(who_list),568),BG);draw=ImageDraw.Draw(out)
    draw.text((16,10),label,font=font(15),fill=INK);draw.line((10,520,out.width-10,520),fill='#aab7a1')
    for col,who in enumerate(who_list):
        im=frame(who+'-joyful',index,facing).resize((384,512),Image.Resampling.NEAREST);out.paste(im,(16+col*384,40),im)
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

loops=[];seq=manifest('dress-joyful')['animations']['run']
for facing in ('left','right'):
    events=[(scene(('dress','suit'),index,facing,f'Actual V6 + motion 2 / run {facing} / in place / 2x'),1000/seq['fps']) for index in seq['frames']]
    loops.append(save_gif(events,f'run-{facing}.gif'))
    for who in ('dress','suit'):
        events=[(scene((who,),index,facing,f'{who} / motion 2 run {facing} / in place / 2x'),1000/seq['fps']) for index in seq['frames']]
        loops.append(save_gif(events,f'{who}-run-{facing}.gif'))
events=[]
for index in seq['frames']:
    out=Image.new('RGB',(848,332),BG);draw=ImageDraw.Draw(out);draw.text((16,10),'Actual exports / V6 motion 1 and motion 2 / matched run timing / 1x',font=font(15),fill=INK)
    for col,(who,before) in enumerate((('dress',True),('dress',False),('suit',True),('suit',False))):
        im=frame(who+'-joyful',index,before=before);x=16+col*208;draw.rectangle((x,42,x+191,297),fill=STAGE);out.paste(im,(x,42),im);draw.text((x,306),f'{who} / motion {1 if before else 2}',font=font(13),fill=INK)
    events.append((out,1000/seq['fps']))
loops.append(save_gif(events,'before-after-run.gif'))
events=[]
for action,facing,repeats in [('idle','right',1),('walk','right',1),('run','right',3),('run','left',3)]:
    clip=manifest('dress-joyful')['animations'][action]
    for _ in range(repeats):events.extend((scene(('dress','suit'),index,facing,f'Action switch / {action.upper()} {facing} / fixed anchor, in place / 2x'),1000/clip['fps']) for index in clip['frames'])
loops.append(save_gif(events,'action-switch.gif'))
(D/'preview-timelines.json').write_text(json.dumps(loops,indent=2)+'\n')
print(f'Rendered actual motion 1/2 comparisons and {len(loops)} decoded GIF previews; pack timing remains exact 18 fps.')
