#!/usr/bin/env python3
"""Review boards/GIFs decoded solely from captured application downloads.

The full CharacterPack PNGs remain unscaled. Preview GIFs are explicitly 0.5x
for browser review; native detail boards preserve 1x/2x integer pixel scale.
No source art or conceptual generated portrait is used as implementation proof.
"""
from pathlib import Path
import argparse, hashlib, io, json, zipfile
from PIL import Image, ImageDraw, ImageFont
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
BG='#eee9df';INK='#37453c';ACTIONS=['idle','walk','run','jump','celebrate']
FONT=ImageFont.load_default()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def text(im,xy,value):ImageDraw.Draw(im).text(xy,value,fill=INK,font=FONT)
def decode_pack(path):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        manifest=json.loads(z.read('manifest.json'))
        sheets=[]
        for p in [manifest['spritesheet'],*manifest.get('additionalSheets',[])]:
            image=Image.open(io.BytesIO(z.read(p['file'])));image.load();assert image.mode=='RGBA';assert list(image.size)==[p['width'],p['height']]
            sheets.append(image)
        frames={f['id']:sheets[f.get('page',0)].crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height'])) for f in manifest['frames']}
    return manifest,frames

def sheet_tile(frame,label,scale=0.5):
    w,h=frame.size
    size=(round(w*scale),round(h*scale));tile=Image.new('RGB',(size[0],size[1]+32),BG)
    sprite=frame.resize(size,Image.Resampling.LANCZOS) if scale!=1 else frame
    tile.paste(sprite,(0,32),sprite);text(tile,(10,10),label);return tile

def join_row(tiles):
    out=Image.new('RGB',(sum(t.width for t in tiles),max(t.height for t in tiles)),BG);x=0
    for t in tiles:out.paste(t,(x,0));x+=t.width
    return out

def write_gif(path,frames,durations,report):
    # GIF stores centiseconds: preserve total time by rounding cumulative ticks,
    # avoiding a repeated 40ms approximation for 24fps source footage.
    elapsed=previous=0;ms=[]
    for duration in durations:
        elapsed+=duration;rounded=round(elapsed/10)*10;ms.append(max(10,rounded-previous));previous=rounded
    palette=frames[0].quantize(colors=255,method=Image.Quantize.MEDIANCUT)
    indexed=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in frames]
    combined=[];combined_ms=[]
    for im,duration in zip(indexed,ms):
        if combined and im.tobytes()==combined[-1].tobytes():combined_ms[-1]+=duration
        else:combined.append(im);combined_ms.append(duration)
    source_count=len(indexed);indexed=combined;ms=combined_ms
    indexed[0].save(path,save_all=True,append_images=indexed[1:],duration=ms,loop=0,optimize=False,disposal=2)
    with Image.open(path) as im:
        observed=[]
        for i in range(im.n_frames):im.seek(i);im.load();observed.append(im.info.get('duration',0))
        assert im.n_frames==len(indexed),(path,im.n_frames,len(indexed))
        assert observed==ms and im.info.get('loop')==0
        report.append({'file':str(path.relative_to(ROOT)),'sha256':sha(path),'bytes':path.stat().st_size,'frames':im.n_frames,'sourcePositions':source_count,'consecutiveHoldsCombined':source_count-im.n_frames,'size':list(im.size),'durationMs':sum(ms),'durationsMs':ms,'decodedEveryFrame':True,'previewScale':0.5})

def source_invariants(project_path, pack_path):
    """Compare exact RGBA, including invisible RGB, outside authored ownership."""
    with zipfile.ZipFile(project_path) as project:
        doc=json.loads(project.read('document.json'));assert doc['version']==2
        source_bytes=project.read('source.character.zip')
        output_manifest,output_frames=decode_pack(pack_path)
        with zipfile.ZipFile(io.BytesIO(source_bytes)) as z:
            sm=json.loads(z.read('manifest.json'));sp=[Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA') for p in [sm['spritesheet'],*sm.get('additionalSheets',[])]]
            sf={f['id']:f for f in sm['frames']}
        layers=[]
        selected={v for v in doc['selection'].values() if v}
        def ownership_layer(data,selected_styles=None):
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                m=json.loads(z.read('manifest.json'))
                pages=[np.array(Image.open(io.BytesIO(z.read(p['maskFile']))))[:,:,3]>0 for p in m['pages']]
                entries=m['frames'] if selected_styles is None else [f for style in m['styles'] if style['id'] in selected_styles for layer in style['layers'] for f in layer['frames']]
                layers.append((pages,entries))
        for i,item in enumerate(doc['items']):
            if item['id'] in selected:ownership_layer(project.read(f'item-{i}.zip'))
        ownership_layer(project.read('appearance.zip'),{doc['appearance']['hairId'],doc['appearance']['faceId']})
        checks=[]
        for fid,frame in output_frames.items():
            f=sf[fid];source=np.array(sp[f.get('page',0)].crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height'])))
            out=np.array(frame);original=np.zeros_like(out);original[128:1184,32:736]=source;allowed=np.zeros(out.shape[:2],bool)
            for pages,entries in layers:
                for e in entries:
                    if e['frameId']!=fid or e.get('mode')=='source':continue
                    r=e['rect'];owned=pages[e['page']][r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
                    x=e['offset']['x']+32;y=e['offset']['y']+128
                    assert x>=0 and y>=0 and x+r['width']<=out.shape[1] and y+r['height']<=out.shape[0]
                    allowed[y:y+r['height'],x:x+r['width']] |= owned
            wrong=np.any(out!=original,axis=2)&~allowed
            assert not wrong.any(),(str(pack_path),fid,int(wrong.sum()))
            checks.append({'frameId':fid,'unauthorizedChangedPixels':0,'rgbaComparedPixels':int((~allowed).sum())})
        assert output_manifest['animations']==sm['animations']
        assert output_manifest['anchor']['x']==sm['anchor']['x']+32 and output_manifest['anchor']['y']==sm['anchor']['y']+128
        return {'project':str(project_path.relative_to(ROOT)),'pack':str(pack_path.relative_to(ROOT)),'sourceSha256':hashlib.sha256(source_bytes).hexdigest(),'sourceRGBAExactOutsideSelectedOwnership':True,'actionsAndTimingUnchanged':True,'frames':checks}

def main(run, characters=("male","female")):
    directory=ROOT/f'docs/kling-appearance/review/evidence/{run}'
    directories={c:(ROOT/f'docs/kling-appearance/review/evidence/{run}-{c}' if not (directory/'evidence-index.json').exists() else directory) for c in characters}
    dest=ROOT/'docs/kling-appearance/review';dest.mkdir(parents=True,exist_ok=True)
    indexes={c:json.loads((d/'evidence-index.json').read_text()) for c,d in directories.items()}
    assert all(i['passed'] and not i['quick'] for i in indexes.values())
    report=[];invariants=[];mirrors=[]
    allpacks={}
    for character in characters:
        directory=directories[character]
        for look in ['day','wedding']:
            path=directory/f'exports/{character}-{look}.character.zip'
            invariants.append(source_invariants(directory/f'exports/{character}-{look}.wardrobe.zip',path))
            manifest,frames=decode_pack(path)
            with zipfile.ZipFile(directory/f'exports/{character}-{look}.wardrobe.zip') as project:
                _,original_frames=decode_pack(io.BytesIO(project.read('source.character.zip')))
            for facing in ['right','left']:
                images=[];durations=[]
                for action in ACTIONS:
                    clip=manifest['animations'][action]
                    # Repeated sequence is a review montage, not a claim that the
                    # one-shot jump/celebrate clip itself loops in the player.
                    for fid in clip['frames']:
                        frame=frames[fid]
                        if facing=='left':frame=frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                        original=Image.new('RGBA',(768,1184));original.alpha_composite(original_frames[fid],(32,128))
                        if facing=='left':original=original.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                        images.append(join_row([sheet_tile(original,f'Original / {action} / {facing} / 0.5x'),sheet_tile(frame,f'{character} / {look} / {action} / {facing} / 0.5x')]))
                        durations.append(1000/clip['fps'])
                write_gif(dest/f'{character}-{look}-five-actions-{facing}.gif',images,durations,report)
            selected=[]
            for action in ACTIONS:
                clip=manifest['animations'][action]
                ids=[clip['frames'][round(i*(len(clip['frames'])-1)/3)] for i in range(4)]
                selected.append(join_row([sheet_tile(frames[f],f'{action} / frame {f} / native 1x',1) for f in ids]))
            board=Image.new('RGB',(selected[0].width,sum(t.height for t in selected)),BG);y=0
            for row in selected:board.paste(row,(0,y));y+=row.height
            board.save(dest/f'{character}-{look}-keyframes-1x.png')
    # Appearance line-up uses original and modified application PNG downloads.
    for character in characters:
        directory=directories[character]
        for look in ['day','wedding']:
            left=directory/f'png/{character}-{look}-51-left.png';right=directory/f'png/{character}-{look}-51-right.png'
            if left.exists():
                a=np.array(Image.open(left).convert('RGBA'));b=np.array(Image.open(right).convert('RGBA'))
                assert np.array_equal(a,b[:,::-1]),f'Actual PNG mirror mismatch: {left}'
                mirrors.append({'left':str(left.relative_to(ROOT)),'right':str(right.relative_to(ROOT)),'exactRgbaHorizontalMirror':True})
        choices=['original','soft-crop-original-face','soft-crop-gentle','soft-bob-original-face','soft-bob-gentle']
        frames=[]
        for label in choices:
            im=Image.open(directory/f'png/{character}-{label}-0-right.png').convert('RGBA');im.load()
            if label=='original':
                padded=Image.new('RGBA',(768,1184));padded.alpha_composite(im,(32,128));im=padded
            frames.append(sheet_tile(im,f'{character} / {label} / 0.5x'))
        join_row(frames).save(dest/f'{character}-appearance-lineup.png')
        color_rows=[]
        for style in ['soft-crop','soft-bob']:
            colors=[]
            for color in ['chestnut','espresso','copper']:
                label=f'{style}-gentle' if color=='chestnut' else f'{style}-{color}'
                im=Image.open(directory/f'png/{character}-{label}-0-right.png').convert('RGBA').crop((95,180,650,700))
                colors.append(sheet_tile(im,f'{style} / {color} / native 1x',1))
            color_rows.append(join_row(colors))
        color_sheet=Image.new('RGB',(color_rows[0].width,sum(row.height for row in color_rows)),BG);y=0
        for row in color_rows:color_sheet.paste(row,(0,y));y+=row.height
        color_sheet.save(dest/f'{character}-hair-colors-1x.png')
        for scale in [1,2]:
            crops=[]
            for label in choices:
                im=Image.open(directory/f'png/{character}-{label}-0-right.png').convert('RGBA')
                if label=='original':
                    padded=Image.new('RGBA',(768,1184));padded.alpha_composite(im,(32,128));im=padded
                crop=im.crop((95,180,650,700));crop=crop.resize((crop.width*scale,crop.height*scale),Image.Resampling.NEAREST)
                crops.append(sheet_tile(crop,f'{label} / {scale}x',1))
            join_row(crops).save(dest/f'{character}-face-detail-{scale}x.png')
    for path in sorted(dest.glob('*.png')):
        with Image.open(path) as im:im.load();assert im.width and im.height;report.append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':sha(path),'size':list(im.size),'decoded':True})
    (dest/'artifact-validation.json').write_text(json.dumps({'inputEvidence':[str((d/'evidence-index.json').relative_to(ROOT)) for d in directories.values()],'sourceInvariants':invariants,'actualPngMirrorChecks':mirrors,'gifTiming':'cumulative centisecond rounding; source fps retained in CharacterPack','artifacts':report},indent=2)+'\n')
    print(json.dumps({'artifacts':len(report),'output':str(dest)}))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--run',default='final');parser.add_argument('--character',choices=['male','female']);args=parser.parse_args();main(args.run,[args.character] if args.character else ['male','female'])
