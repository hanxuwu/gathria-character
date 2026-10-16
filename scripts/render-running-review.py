"""Render timed review media from real exported PNGs; no source-art substitution.

GIF time is quantized to 10 ms using cumulative rounding; the pack retains 18 fps.
A twelve-frame run cycle therefore lasts 670 ms in GIF and 666.67 ms in the pack.
"""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'docs/running';B=ROOT/'docs/running-baseline'
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';BG='#f6f2e9';STAGE='#e8ecdf';INK='#45493d'
font=lambda size=15:ImageFont.truetype(FONT,size)

def manifest(who,baseline=False):return json.loads(((B if baseline else D)/who/'manifest.json').read_text())
def frame(who,index=0,facing='right',baseline=False):
    folder=B if baseline else D;m=manifest(who,baseline);f=next(f for f in m['frames'] if f['id']==index)
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
        who,label,index,*extra=item;im=frame(who,index,baseline=bool(extra and extra[0]))
        if crop:im=im.crop(crop)
        im=im.resize((w*scale,h*scale),Image.Resampling.NEAREST);x,y=20+i%columns*cw,48+i//columns*ch
        draw.rectangle((x,y,x+w*scale-1,y+h*scale-1),fill=STAGE);result.paste(im,(x,y),im);draw.text((x,y+h*scale+8),label,font=font(13),fill=INK)
    return result

items=[(who+'-joyful',f'{who} / {action}',index) for who in ('dress','suit') for action,index in (('idle',0),('walk',7),('run',15))]
for scale in (1,2):save_png(panel(items,3,scale,title=f'V6 proportions / actual idle, walk, run exports / {scale}x / in place'),f'idle-walk-run-{scale}x.png')
regression=[]
for who in ('dress','suit'):
    regression.extend([(who,who+' frozen idle',0,True),(who+'-joyful',who+' new idle',0),(who,who+' frozen walk',7,True),(who+'-joyful',who+' new walk',7),(who+'-joyful',who+' run contact',12),(who+'-joyful',who+' run airborne',15)])
save_png(panel(regression,6,title='Frozen V6 compared with running extension / identical idle and walk / 1x'),'baseline-regression-1x.png')
phases=['contact','load','push-off','flight','recovery','reach','contact','load','push-off','flight','recovery','reach']
keys=[(who+'-joyful',f'{i:02d} {phases[i]}',12+i) for who in ('dress','suit') for i in range(12)]
save_png(panel(keys,6,title='Run key poses / bride rows 1-2, groom rows 3-4 / 18 fps / actual exports'),'run-keyframes.png')
save_png(panel([(who+'-joyful',f'{who} / {phases[i]}',12+i) for who in ('dress','suit') for i in (0,3,6,9)],4,3,(35,70,151,195),'Run neck, shoulders, hands and attached details / 3x'),'run-connections-3x.png')
save_png(panel([(f'{who}-{expression}',who+' / '+expression,15) for who in ('dress','suit') for expression in ('neutral','gentle','joyful')],3,2,title='Three expressions remain available while running / actual exports / 2x'),'run-expressions-2x.png')
save_png(panel([(f'{who}-outfit-{outfit}',who+' / '+outfit,15) for who in ('dress','suit') for outfit in ('tee','hoodie','jacket','suit','bodice')],5,title='All five upper garments / same run flight pose / actual exports'),'run-wardrobe-1x.png')
save_png(panel([(f'{who}-{look}',who+' / '+look,15) for who in ('dress','suit') for look in ('dark-skin','light-jacket')],4,2,title='Representative skin, hair and garment combinations / run / 2x'),'run-recolor-2x.png')
save_png(panel([(look,f'{look} / {phase}',12+i) for look in ('dress-shorts','suit-skirt') for i,phase in ((0,'contact'),(3,'flight'),(6,'other contact'))],3,2,title='Exposed-leg garments / contact and flight / actual running exports'),'run-lower-garments-2x.png')

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
    path=D/name;temp=path.with_suffix('.tmp.gif');indexed[0].save(temp,save_all=True,append_images=indexed[1:],duration=durations,loop=0,disposal=1,optimize=False)
    actual=[]
    with Image.open(temp) as im:
        assert im.info['loop']==0
        for i in range(im.n_frames):im.seek(i);im.load();actual.append(im.info['duration'])
    assert sum(actual)==sum(durations),(name,actual,durations)
    temp.replace(path)
    return dict(file=name,logicalFrames=len(events),decodedFrames=len(actual),durationMs=sum(actual),frameDurationsMs=actual,unquantizedDurationMs=sum(d for _,d in events))

loops=[]
for action in ('idle','walk','run'):
    seq=manifest('dress-joyful')['animations'][action]
    for facing in ('left','right'):
        events=[(scene(('dress','suit'),index,facing,f'Actual V6 + motion v1 / {action} {facing} / in place / 2x'),1000/seq['fps']) for index in seq['frames']]
        loops.append(save_gif(events,f'{action}-{facing}.gif'))
        if action=='run':
            for who in ('dress','suit'):
                events=[(scene((who,),index,facing,f'{who} / run {facing} / in place / 2x'),1000/seq['fps']) for index in seq['frames']]
                loops.append(save_gif(events,f'{who}-run-{facing}.gif'))
events=[]
for action,facing,repeats in [('idle','right',1),('walk','right',2),('run','right',3),('run','left',3),('walk','left',2),('idle','left',1)]:
    seq=manifest('dress-joyful')['animations'][action]
    for _ in range(repeats):
        events.extend((scene(('dress','suit'),index,facing,f'Action switch / {action.upper()} {facing} / fixed anchor, in place / 2x'),1000/seq['fps']) for index in seq['frames'])
loops.append(save_gif(events,'action-switch.gif'))
(D/'preview-timelines.json').write_text(json.dumps(loops,indent=2)+'\n')
print(f'Rendered actual exported PNG comparisons and {len(loops)} decoded GIF previews; pack timing remains exact 18 fps, GIF uses cumulative centisecond rounding.')
