#!/usr/bin/env python3
"""Present actual compositor PNGs with a fixed crop, scale and native timing."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser();ap.add_argument('--input',type=Path,default=Path('/tmp/wardrobe-finish/male/actual'));ap.add_argument('--output',type=Path,default=ROOT/'docs/wardrobe-finish/male');args=ap.parse_args();args.output.mkdir(parents=True,exist_ok=True)
actions=json.loads((args.input/'actions.json').read_text());recipe=json.loads((ROOT/'artwork/kling-landing-production/cuff-finish/recipe.json').read_text())
poses={r['frameId']:r for r in recipe['poses']}
bg=(238,233,223)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def flat(im):
    b=Image.new('RGBA',im.size,(*bg,255));b.alpha_composite(im);return b.convert('RGB')
def image(edition,fid):return Image.open(args.input/edition/f'{fid}.png').convert('RGBA')

records=[]
for facing in ['right','left']:
    ids=actions['jump']['frames'];frames=[]
    for fid in ids:
        canvas=Image.new('RGB',(768,602),bg);draw=ImageDraw.Draw(canvas)
        for i,edition in enumerate(['before','after']):
            im=image(edition,fid)
            if facing=='left':im=ImageOps.mirror(im)
            im=flat(im).resize((384,576),Image.Resampling.LANCZOS)
            canvas.paste(im,(i*384,26));draw.text((i*384+12,8),edition.title()+' / one jump',fill=(40,45,43))
        frames.append(canvas)
    # One common palette avoids per-frame palette noise in the review itself.
    samples=Image.new('RGB',(768,602*len(frames)))
    for i,f in enumerate(frames):samples.paste(f,(0,i*602))
    palette=samples.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
    frames=[f.quantize(palette=palette,dither=Image.Dither.NONE) for f in frames]
    durations=[round((i+1)*100/24)*10-round(i*100/24)*10 for i in range(len(frames))]
    target=args.output/f'wedding-single-jump-before-after-{facing}.gif'
    frames[0].save(target,save_all=True,append_images=frames[1:],duration=durations,loop=0,optimize=False,disposal=2)
    with Image.open(target) as gif:
        observed=[]
        for i in range(gif.n_frames):gif.seek(i);observed.append(gif.info['duration'])
        assert gif.n_frames==len(ids) and observed==durations
    records.append({'file':target.name,'sha256':sha(target),'facing':facing,'frameIds':ids,'frames':len(ids),'durationMs':sum(durations),'nativeFps':24,'gifLoopPurpose':'Repeat a single jump for visual comparison; source jump remains non-looping.'})

frames=[63,74,78,97,100,101];canvas=Image.new('RGB',(1000,750),bg);draw=ImageDraw.Draw(canvas)
for j,fid in enumerate(frames):
    pts=poses[fid]['clothDomain'];x0=int(min(x for x,y in pts))-18;y0=int(min(y for x,y in pts))-16
    box=(x0,y0,x0+125,y0+115)
    for i,edition in enumerate(['before','after']):
        crop=flat(image(edition,fid).crop(box)).resize((250,230),Image.Resampling.NEAREST)
        x=(j%2)*500+i*250;y=(j//2)*250;canvas.paste(crop,(x,y+20));draw.text((x+5,y+5),f'{fid} / {edition}',fill=(40,45,43))
canvas.save(args.output/'cuffs-native-2x.png')
registration=json.loads((ROOT/'artwork/kling-side-expansion/templates/male.registration.json').read_text());registered={f['frameId']:f for f in registration['frames']}
canvas=Image.new('RGB',(1200,700),bg);draw=ImageDraw.Draw(canvas)
for j,fid in enumerate([63,74,85,97]):
    p=registered[fid]['points'];x0=round(min(p['waistLeft']['x'],p['neck']['x'])-50);y0=round(p['neck']['y']-15);box=(x0,y0,x0+150,y0+165)
    for i,edition in enumerate(['before','after']):
        crop=flat(image(edition,fid).crop(box)).resize((300,330),Image.Resampling.NEAREST)
        x=(j%2)*600+i*300;y=(j//2)*350;canvas.paste(crop,(x,y+20));draw.text((x+5,y+5),f'{fid} / {edition}',fill=(40,45,43))
canvas.save(args.output/'waistcoat-native-2x.png')
ids=list(range(74,81));canvas=Image.new('RGB',(250*len(ids),760),bg);draw=ImageDraw.Draw(canvas)
for row,edition in enumerate(['before','after']):
    for col,fid in enumerate(ids):
        # Identical native crop in every column; this is a detail filmstrip,
        # not a stabilized or re-centered animation.
        crop=flat(image(edition,fid).crop((70,240,320,600)))
        x=col*250;y=row*380;canvas.paste(crop,(x,y+20));draw.text((x+5,y+5),f'{fid} / {edition} / fixed crop',fill=(40,45,43))
canvas.save(args.output/'adjacent-poses.png')
(args.output/'presentation.json').write_text(json.dumps({'source':'Actual runtime PNGs from scripts/review-wedding-cuff-finish.mjs, with the unchanged matching wedding trousers selected.','fixedNativeCanvas':[512,768],'gifPresentationScale':.75,'sourceFrameRelocation':False,'sourceFrameInterpolation':False,'palette':'One fixed 256-color comparison palette; PNG evidence retains lossless native RGBA.','artifacts':records},indent=2)+'\n')
print(json.dumps(records,indent=2))
