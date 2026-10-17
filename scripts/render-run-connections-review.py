"""Review contact sheets and timed GIFs from actual browser-exported CharacterPacks."""
from pathlib import Path
from functools import lru_cache
import hashlib,json,os
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'docs/run-connections'
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';BG='#f6f2e9';STAGE='#e8ecdf';INK='#45493d'
font=lambda n=14:ImageFont.truetype(FONT,n)
looks=[(x['id'],x['label']) for x in json.loads((D/'before/exports-validation.json').read_text())['exports']]
phases=['contact','load','push-off','flight','recovery','reach']*2
@lru_cache(None)
def manifest(stage,who):return json.loads((D/stage/who/'manifest.json').read_text())
@lru_cache(None)
def sheet(stage,who):
    with Image.open(D/stage/who/'spritesheet.png') as im:return im.convert('RGBA')
def frame(stage,who,index,facing='right'):
    f=next(x for x in manifest(stage,who)['frames'] if x['id']==index)
    im=sheet(stage,who).crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height']))
    return im.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if facing=='left' else im

def save_png(im,path):
    path=D/path;temp=path.with_suffix('.tmp.png');im.save(temp)
    with Image.open(temp) as check:check.load();assert check.size==im.size
    temp.replace(path)

def panel(items,columns,scale=1,crop=None,title='Actual exported frames'):
    w,h=(crop[2]-crop[0],crop[3]-crop[1]) if crop else (192,256);cw,ch=w*scale+20,h*scale+42
    out=Image.new('RGB',(cw*columns+20,ch*((len(items)+columns-1)//columns)+56),BG);draw=ImageDraw.Draw(out);draw.text((16,12),title,font=font(16),fill=INK)
    for i,(stage,who,label,index) in enumerate(items):
        im=frame(stage,who,index)
        if crop:im=im.crop(crop)
        im=im.resize((w*scale,h*scale),Image.Resampling.NEAREST);x,y=20+i%columns*cw,48+i//columns*ch
        draw.rectangle((x,y,x+w*scale-1,y+h*scale-1),fill=STAGE);out.paste(im,(x,y),im);draw.text((x,y+h*scale+8),label,font=font(13),fill=INK)
    return out

def scene(stage,selected,index,facing,label):
    out=Image.new('RGB',(32+384*len(selected),592),BG);draw=ImageDraw.Draw(out);draw.text((16,10),label,font=font(15),fill=INK)
    draw.line((10,520,out.width-10,520),fill='#aab7a1')
    for col,(who,name) in enumerate(selected):
        im=frame(stage,who,index,facing).resize((384,512),Image.Resampling.NEAREST);out.paste(im,(16+col*384,40),im);draw.text((16+col*384,560),name,font=font(14),fill=INK)
    return out

def save_gif(events,path):
    images=[im for im,_ in events];strip=Image.new('RGB',(images[0].width,images[0].height*len(images)))
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
    target=D/path;temp=target.with_suffix('.tmp.gif');indexed[0].save(temp,save_all=True,append_images=indexed[1:],duration=durations,loop=0,disposal=1,optimize=False)
    actual=[];hashes=[]
    with Image.open(temp) as im:
        assert im.info['loop']==0
        for i in range(im.n_frames):
            im.seek(i);im.load();actual.append(im.info['duration']);hashes.append(hashlib.sha256(im.convert('RGB').tobytes()).hexdigest())
    assert list(zip(hashes,actual))==[tuple(x) for x in expected],str(path)
    assert sum(actual)==sum(durations)
    temp.replace(target)
    return dict(file=str(path),logicalFrames=len(events),decodedFrames=len(actual),durationMs=sum(actual),frameDurationsMs=actual,unquantizedDurationMs=sum(d for _,d in events),decodedFrameSha256=hashes)

iteration=os.environ.get('RUN_CONNECTIONS_ITERATION')
assert not iteration or all(c.isalnum() or c in '_-' for c in iteration)
after_stage=f'iterations/{iteration}' if iteration else 'after'
comparison_dir=f'iterations/{iteration}/' if iteration else ''
loops=[];stages=[stage for stage in ('before',after_stage) if (D/stage/'exports-validation.json').exists()]
for stage in stages:
    for scale in (1,2):
        save_png(panel([(stage,who,f'{name} / {i:02d} {phases[i]}',12+i) for who,name in looks for i in range(12)],6,scale,title=f'{stage.upper()} / complete run / same 192 x 256 frames / {scale}x'),f'{stage}/run-keyframes-{scale}x.png')
    save_png(panel([(stage,who,f'{name} / run {i:02d}',12+i) for who,name in looks for i in (1,3,7,9)],4,3,(30,65,166,243),f'{stage.upper()} / shoulder, wrist, waist, knee, ankle / 3x'),f'{stage}/connections-3x.png')
    for who,name in looks:
        clip=manifest(stage,who)['animations']['run']
        for facing in ('right','left'):
            events=[(scene(stage,[(who,name)],index,facing,f'{stage.upper()} / run {facing} / in place / 2x'),1000/clip['fps']) for index in clip['frames']]
            loops.append(save_gif(events,f'{stage}/{who}-run-{facing}.gif'))
    clip=manifest(stage,looks[0][0])['animations']['run']
    for facing in ('right','left'):
        events=[(scene(stage,looks,index,facing,f'{stage.upper()} / actual exports / run {facing} / 2x'),1000/clip['fps']) for index in clip['frames']]
        loops.append(save_gif(events,f'{stage}/lineup-run-{facing}.gif'))
if stages==['before',after_stage]:
    for scale in (1,2):
        save_png(panel([(stage,who,f'{name} / {stage} / run 03',15) for who,name in looks for stage in stages],2,scale,title=f'Same appearance and run phase / Motion 2 before, Motion 3 after / {scale}x'),f'{comparison_dir}before-after-{scale}x.png')
    for who,name in looks:
        crop=(42,102,163,199) if who=='coral-afternoon' else (47,155,165,246)
        label='wrist, sleeve and waist' if who=='coral-afternoon' else 'knees, cuffs and ankles'
        save_png(panel([(stage,who,f'{stage} / run {i:02d}',12+i) for i in (0,1,2,3,4,5,6,7,8,9,10,11) for stage in stages],4,4,crop,f'{name} / {label} / matched phases / 4x'),f'{comparison_dir}{who}-details-4x.png')
        clip=manifest(after_stage,who)['animations']['run']
        for facing in ('right','left'):
            events=[]
            for index in clip['frames']:
                left=scene('before',[(who,name)],index,facing,f'BEFORE / Motion 2 / {facing}')
                right=scene(after_stage,[(who,name)],index,facing,f'AFTER / Motion 3 / {facing}')
                side=Image.new('RGB',(left.width*2,left.height),BG);side.paste(left,(0,0));side.paste(right,(left.width,0));events.append((side,1000/clip['fps']))
            loops.append(save_gif(events,f'{comparison_dir}{who}-comparison-{facing}.gif'))
if not iteration and (D/'regressions/exports-validation.json').exists():
    regression_looks=[(x['id'],x['label']) for x in json.loads((D/'regressions/exports-validation.json').read_text())['exports']]
    save_png(panel([('regressions',who,f'{name} / {action}',index) for who,name in regression_looks for action,index in [('idle',0),('walk',7),('run',15)]],3,1,title='Actual regression packs / same V6 idle, walk and repaired run / 1x'),'regressions/idle-walk-run-1x.png')
    save_png(panel([('regressions',who,f'{name} / run {i:02d}',12+i) for who,name in regression_looks for i in (1,3,7,9)],4,3,(30,65,166,243),'Wedding / recolor / expression regression / actual exports / 3x'),'regressions/connections-3x.png')
    for facing in ('left','right'):
        clip=manifest('regressions',regression_looks[0][0])['animations']['run']
        events=[(scene('regressions',regression_looks,index,facing,f'Representative regression exports / run {facing} / 2x'),1000/clip['fps']) for index in clip['frames']]
        loops.append(save_gif(events,f'regressions/lineup-run-{facing}.gif'))
prior=json.loads((D/'preview-timelines.json').read_text()) if (D/'preview-timelines.json').exists() else []
updated={x['file']:x for x in prior if (D/x['file']).exists()}
updated.update({x['file']:x for x in loops})
(D/'preview-timelines.json').write_text(json.dumps(list(updated.values()),indent=2)+'\n')
print(f'Rendered {len(stages)} export stages, {len(loops)} GIFs; every decoded frame hash and duration matches the source PNG timeline.')
