"""Compose review artifacts only from actual Studio downloads and captured canvases.
No source illustration is substituted for a rendered character frame.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps
import hashlib
import io
import json
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs/base-character/final'
OLD = ROOT / 'docs/base-character/iterations/first/base-character'
ACTIONS = ['idle', 'walk', 'run', 'jump']
BG = '#f3eee4'
manifest = json.loads((OUT / 'base-character/manifest.json').read_text())
sheet = Image.open(OUT / 'base-character/spritesheet.png').convert('RGBA')
assert sheet.size == (1536, 1536)
assert set(sheet.getchannel('A').getdata()) == {0, 255}
frames = {f['id']: sheet.crop((f['x'], f['y'], f['x']+192, f['y']+256)) for f in manifest['frames']}
for im in frames.values():
    assert im.getbbox() and im.getbbox()[0] > 0 and im.getbbox()[1] > 0
    assert im.getbbox()[2] < 192 and im.getbbox()[3] < 256

def cell(im, title, scale=1, bones=False):
    w, h = 192*scale, 256*scale
    out = Image.new('RGB', (w+16, h+44), BG)
    draw = ImageDraw.Draw(out)
    draw.text((8, 6), title, fill='#4e514b')
    draw.line((8, 26+240*scale, w+8, 26+240*scale), fill='#c1b7a7')
    draw.line((8+96*scale, 24+240*scale, 8+96*scale, 28+240*scale), fill='#957955')
    im = im.resize((w,h),Image.Resampling.NEAREST)
    out.paste(im,(8,26),im)
    return out

def board(images, columns):
    w,h=images[0].size
    out=Image.new('RGB',(w*columns,h*((len(images)+columns-1)//columns)),BG)
    for i,im in enumerate(images): out.paste(im,((i%columns)*w,(i//columns)*h))
    return out

def key_ids(action): return list(dict.fromkeys(manifest['animations'][action]['frames']))

gif_records=[]
def save_gif(name, images, durations, loop=True):
    # A shared nondithered palette across the whole clip prevents palette shimmer.
    samples=board([im.resize((192,256),Image.Resampling.NEAREST) for im in images],min(6,len(images)))
    palette=samples.quantize(colors=256,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
    quantized=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in images]
    kwargs={'loop':0} if loop else {}
    path=OUT/name
    quantized[0].save(path,save_all=True,append_images=quantized[1:],duration=durations,disposal=1,optimize=False,**kwargs)
    decoded=Image.open(path)
    decoded_frames=[]; actual_durations=[]
    for i in range(decoded.n_frames):
        decoded.seek(i);decoded_frames.append(decoded.convert('RGB').copy());actual_durations.append(decoded.info['duration'])
    assert sum(actual_durations)==sum(durations),name
    # Pillow may combine identical consecutive images. Compare the decoded
    # time-expanded timeline, not just the count of stored image records.
    expected=[]
    for im,d in zip(quantized,durations): expected.extend([im.convert('RGB').tobytes()]*(d//10))
    actual=[]
    for im,d in zip(decoded_frames,actual_durations): actual.extend([im.tobytes()]*(d//10))
    assert expected==actual,name
    gif_records.append({'file':name,'decodedFrames':decoded.n_frames,'durationMs':sum(actual_durations),'sourceEntries':len(images),'decodedTimelineExactAfterPalette':True,'loop':loop})

for facing in ['right','left']:
    for action in ACTIONS:
        clip=manifest['animations'][action]
        ims=[frames[n] if facing=='right' else ImageOps.mirror(frames[n]) for n in clip['frames']]
        durations=[round((i+1)*100/clip['fps'])*10-round(i*100/clip['fps'])*10 for i in range(len(ims))]
        for scale in [1,2]:
            images=[cell(im,f'{action} / {facing} / in place / {scale}x',scale) for im in ims]
            # Jump is a one-shot in the pack; GIF presents one shot then holds.
            save_gif(f'{action}-{facing}-{scale}x.gif',images,durations,clip['loop'])
    # Six seconds on a 10 ms timeline. Each action keeps its own manifest timing.
    # Jump explicitly replays every 2 seconds in this comparison only.
    panels=[]
    for tick in range(600):
        cells=[]
        for action in ACTIONS:
            clip=manifest['animations'][action];t=tick/100
            index=int((t if clip['loop'] else t%2)*clip['fps'])
            index=index%len(clip['frames']) if clip['loop'] else min(index,len(clip['frames'])-1)
            im=frames[clip['frames'][index]]
            if facing=='left':im=ImageOps.mirror(im)
            cells.append(cell(im,action+(' / repeat preview' if action=='jump' else ' / in place'),2))
        panel=board(cells,4)
        # Deduplicate timed holds before quantization to keep the artifact compact.
        if panels and panel.tobytes()==panels[-1][0].tobytes():panels[-1][1]+=10
        else:panels.append([panel,10])
    save_gif(f'four-actions-{facing}-2x.gif',[p[0] for p in panels],[p[1] for p in panels])

for scale in [1,2]:
    board([cell(frames[key_ids(action)[0 if action=='idle' else 5]],action,scale) for action in ACTIONS],4).save(OUT/f'four-actions-{scale}x.png')
    for action in ACTIONS:
        board([cell(frames[n],f'{action} / key {i+1:02d}',scale) for i,n in enumerate(key_ids(action))],4).save(OUT/f'{action}-keyframes-{scale}x.png')

board([cell(Image.open(OUT/f'bones/{a}-2x.png').convert('RGBA').resize((192,256),Image.Resampling.NEAREST),a+' / bones',2) for a in ACTIONS],4).save(OUT/'four-actions-bones-2x.png')
board([cell(Image.open(OUT/f'expressions/{e}.png').convert('RGBA').resize((192,256),Image.Resampling.NEAREST),e,2) for e in ['neutral','gentle','joyful']],3).save(OUT/'expressions-2x.png')
old_manifest=json.loads((OLD/'manifest.json').read_text());old_sheet=Image.open(OLD/'spritesheet.png').convert('RGBA')
selected=[('run',0),('run',4),('run',8),('jump',5)]
comparison=[]
for before in [True,False]:
    for action,key in selected:
        if before:
            n=old_manifest['animations'][action]['frames'][key];f=next(f for f in old_manifest['frames'] if f['id']==n)
            im=old_sheet.crop((f['x'],f['y'],f['x']+192,f['y']+256))
        else:im=frames[manifest['animations'][action]['frames'][key]]
        comparison.append(cell(im,f'{"First" if before else "Final"} / {action} {key+1:02d}',2))
board(comparison,4).save(OUT/'first-final-2x.png')

# Validate every delivered PNG and ZIP member, including actual exports and rig.
pngs=[];archives=[]
for path in sorted(OUT.rglob('*.png')):
    im=Image.open(path);im.load();assert min(im.size)>0 and im.getbbox(),path
    pngs.append({'file':str(path.relative_to(OUT)),'size':im.size,'mode':im.mode})
for path in sorted(OUT.glob('*.zip')):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        for name in z.namelist():
            data=z.read(name);assert data,name
            if name.endswith('.png'):im=Image.open(io.BytesIO(data));im.load();assert im.getbbox()
            if name.endswith('.json'):json.loads(data)
        archives.append({'file':path.name,'members':len(z.namelist()),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(OUT/'artifact-validation.json').write_text(json.dumps({'pngs':pngs,'gifs':gif_records,'archives':archives,'actualAtlasFrames':len(frames),'gifTiming':'Cumulative centisecond rounding; no frame-rate substitution. Jump pack and individual GIF do not loop; comparison explicitly replays.'},indent=2)+'\n')
print(f'Validated {len(pngs)} PNGs, {len(gif_records)} GIF timelines, {len(archives)} ZIPs.')
