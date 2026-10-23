#!/usr/bin/env python3
"""Decode actual app downloads and render bounded new-hairstyle review evidence.

No conceptual donor picture is used as output proof. The original frame is only
padded by (32,128), never warped. Native PNG/pack checks precede GIF quantization.
"""
from pathlib import Path
import argparse, hashlib, importlib.util, io, json, zipfile
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'docs/kling-appearance/expansion-review'

def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
helper=module('appearance_review',ROOT/'scripts/render-kling-appearance-review.py')
stability=module('appearance_stability',ROOT/'scripts/render-kling-appearance-stability.py')
sha=helper.sha;decode_pack=helper.decode_pack

def artifact(path):
    with Image.open(path) as im:
        im.load();assert im.width and im.height
        return {'file':str(path.relative_to(ROOT)),'sha256':sha(path),'bytes':path.stat().st_size,'size':list(im.size),'decoded':True}

def padded(im):
    assert im.mode=='RGBA'
    if im.size==(768,1184):return im
    assert im.size==(704,1056),im.size
    out=Image.new('RGBA',(768,1184));out.alpha_composite(im,(32,128));return out

def png(path):
    im=Image.open(path);im.load();assert im.mode=='RGBA';return im

def column(rows):
    out=Image.new('RGB',(max(r.width for r in rows),sum(r.height for r in rows)),helper.BG);y=0
    for row in rows:out.paste(row,(0,y));y+=row.height
    return out

def integer_tile(im,label,scale):
    return helper.sheet_tile(im.resize((im.width*scale,im.height*scale),Image.Resampling.NEAREST),label,1)

def attach_ui(report,ui_run):
    ui_path=DEST/'evidence'/ui_run/'evidence-index.json';ui=json.loads(ui_path.read_text());assert ui['passed'] and ui['uiOnly']
    for path,expected in ui['inputs'].items():assert sha(Path(path) if path.startswith('/') else ROOT/path)==expected
    report['finalUi']={'index':str(ui_path.relative_to(ROOT)),'sha256':sha(ui_path),'selections':ui['selections']}
    for item in ui['screenshots']:
        path=ROOT/item['file'];assert sha(path)==item['sha256']
        if not any(row['file']==item['file'] for row in report['artifacts']):report['artifacts'].append(artifact(path))

def main(runs,baseline_run,ui_run=None):
    indexes=[]
    for run in runs:
        p=DEST/'evidence'/run/'evidence-index.json';index=json.loads(p.read_text());assert index['passed'] and not index['baselineOnly'];indexes.append((p,index))
    old_path=DEST/'evidence'/baseline_run/'evidence-index.json';old=json.loads(old_path.read_text());assert old['passed'] and old['baselineOnly']
    review=DEST/'review';review.mkdir(exist_ok=True)
    report={'format':'gathria-appearance-expansion-artifacts','version':1,
        'inputs':[{'file':str(p.relative_to(ROOT)),'sha256':sha(p)} for p,_ in indexes]+[{'file':str(old_path.relative_to(ROOT)),'sha256':sha(old_path)}],
        'packs':[],'oldStylePixelChecks':[],'actualMirrorChecks':[],'sourceLineupChecks':[],'artifacts':[],
        'gifTiming':'Five-action review sequence repeats. CharacterPack action metadata is untouched: jump remains one-shot. GIF uses cumulative centisecond rounding; each encoded frame is decoded and its duration checked.'}
    packs=[p for _,i in indexes for p in i['packs']]
    assert len({p['character'] for p in packs})==len(packs),'Only one final full pack per character.'
    for p in packs:
        character=p['character'];directory=next(path.parent for path,index in indexes if p in index['packs'])
        captured=Path(p['capturedPath']);retained=ROOT/p['file'];project=Path(p['projectPath'])
        assert sha(captured)==sha(retained)==p['sha256'];assert sha(project)==p['projectSha256']
        m,frames=decode_pack(retained);sm,originals=decode_pack(ROOT/f'docs/kling-motion/exports/{character}.character.zip')
        assert m['animations']==sm['animations'];assert list(frames)==list(originals)
        assert m['anchor']=={**sm['anchor'],'x':sm['anchor']['x']+32,'y':sm['anchor']['y']+128}
        report['packs'].append({'character':character,**stability.protected_source(project,retained)})
        with zipfile.ZipFile(ROOT/f'docs/kling-appearance/banks/{character}.zip') as z:bank=json.loads(z.read('manifest.json'))
        styles=[s['id'] for s in bank['styles'] if s['slot']=='hair'];fresh=p['appearance']['hairId'];assert fresh in styles
        guide=json.loads((ROOT/f'artwork/kling-appearance/registration/{character}.json').read_text());poses={p['frameId']:p for p in guide['frames']}
        source0=png(directory/f'{character}-lineup-original-0-right.png')
        assert source0.tobytes()==originals[0].tobytes();assert source0.size==originals[0].size
        report['sourceLineupChecks'].append({'character':character,'actualOriginalPngEqualsNativeSourceRgba':True,'paddedForLineupOnly':[32,128]})
        for style in ['soft-crop','soft-bob']:
            before=old_path.parent/f'{character}-lineup-{style}-0-right.png';after=directory/f'{character}-lineup-{style}-0-right.png'
            a=png(before);b=png(after);assert a.size==b.size and a.tobytes()==b.tobytes(),(character,style,'old style changed')
            report['oldStylePixelChecks'].append({'character':character,'style':style,'before':str(before.relative_to(ROOT)),'beforeSha256':sha(before),'after':str(after.relative_to(ROOT)),'afterSha256':sha(after),'nativeRgbaExact':True,'frameId':0})
        for look,pair in p['mirrorPairs'].items():
            fid=pair['frameId'];a=png(ROOT/pair['left']);b=png(ROOT/pair['right'])
            assert a.tobytes()==b.transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes();assert a.size==b.size
            if look=='everyday':assert b.tobytes()==frames[fid].tobytes()
            report['actualMirrorChecks'].append({'character':character,'outfit':look,'frameId':fid,'leftEqualsExactRightMirror':True,'actualAppPngMatchesPack':look=='everyday'})
        # Match every representative left/right action PNG, not only the pack pair.
        index=next(i for _,i in indexes if p in i['packs']);selection=next(s for s in index['selections'] if s['character']==character)
        representatives=selection['actualFrames']['representative']
        for look in ['everyday','wedding']:
            for action,fid in representatives.items():
                right=png(directory/f'{character}-{look}-{action}-{fid}-right.png');left=png(directory/f'{character}-{look}-{action}-{fid}-left.png')
                assert left.tobytes()==right.transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes()
                if look=='everyday':assert right.tobytes()==frames[fid].tobytes()
        for scale in [1,2]:
            lineup=[];ears=[]
            ear=poses[0]['featureGuides']['ear'];x=round(ear['x'])+32;y=round(ear['y'])+128;box=(x-115,y-130,x+110,y+115)
            for label in ['original',*styles]:
                im=padded(png(directory/f'{character}-lineup-{label}-0-right.png'))
                lineup.append(integer_tile(im,f'{character} / {label} / Original face / {scale}x',scale))
                ears.append(integer_tile(im.crop(box),f'{label} / ear / {scale}x',scale))
            path=review/f'{character}-lineup-{scale}x.png';helper.join_row(lineup).save(path)
            path=review/f'{character}-ear-lineup-{scale}x.png';helper.join_row(ears).save(path)
            rows=[]
            for look in ['everyday','wedding']:
                row=[]
                for action,fid in representatives.items():
                    im=png(directory/f'{character}-{look}-{action}-{fid}-right.png')
                    row.append(integer_tile(im,f'{character} / {look} / {action} {fid} / {scale}x',scale))
                rows.append(helper.join_row(row))
            column(rows).save(review/f'{character}-outfit-actions-{scale}x.png')
            # Moving ears across genuine difficult source poses, full native pixels.
            ears=[]
            for action in ['run','jump','celebrate']:
                fid=representatives[action];ear=poses[fid]['featureGuides']['ear'];x=round(ear['x'])+32;y=round(ear['y'])+128
                crop=frames[fid].crop((x-115,y-130,x+110,y+115))
                ears.append(integer_tile(crop,f'{fresh} / {action} {fid} / {scale}x',scale))
            helper.join_row(ears).save(review/f'{character}-ear-motion-{scale}x.png')
        # Palette/face matrix uses actual Original-outfit PNGs, not donor swatches.
        for fid in [0,representatives['jump']]:
            pose=poses[fid];h=pose['hairBounds'];box=(int(h['x'])+20,int(h['y'])+116,int(h['x']+h['width'])+44,int(pose['anchors']['chin']['y'])+156)
            rows=[]
            for face in ['original','gentle']:
                row=[]
                for color in ['chestnut','espresso','copper']:
                    im=png(directory/f'{character}-palette-{color}-{face}-{fid}-right.png')
                    row.append(integer_tile(im.crop(box),f'{color} / {face} / {fid} / 1x',1))
                rows.append(helper.join_row(row))
            column(rows).save(review/f'{character}-colors-faces-{fid}-1x.png')
        # Fixed native crop across the complete run: no per-frame recentering
        # that could conceal hair/ear drift. Crop union comes from source guides.
        run_clip=m['animations']['run'];run_ids=run_clip['frames']
        run_ears=[poses[fid]['featureGuides']['ear'] for fid in run_ids]
        fixed_box=(min(round(e['x']) for e in run_ears)+32-115,
                   min(round(e['y']) for e in run_ears)+128-130,
                   max(round(e['x']) for e in run_ears)+32+110,
                   max(round(e['y']) for e in run_ears)+128+115)
        ear_frames=[helper.join_row([
            helper.sheet_tile(padded(originals[fid]).crop(fixed_box),'Source / run / 1x',1),
            helper.sheet_tile(frames[fid].crop(fixed_box),f'{fresh} / run / 1x',1)
        ]) for fid in run_ids]
        helper.write_gif(review/f'{character}-ear-run-1x.gif',ear_frames,[1000/run_clip['fps']]*len(run_ids),report['artifacts'])
        report['artifacts'][-1].update(previewScale=1,fixedPaddedCrop=list(fixed_box),sourceFrameIds=run_ids,perFrameTracking=False)
        for facing in ['right','left']:
            images=[];durations=[]
            for action in helper.ACTIONS:
                clip=m['animations'][action]
                for fid in clip['frames']:
                    frame=frames[fid];original=padded(originals[fid])
                    if facing=='left':frame=frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT);original=original.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                    images.append(helper.join_row([helper.sheet_tile(original,f'Original / {action} / {facing} / 0.5x'),helper.sheet_tile(frame,f'{character} {fresh} / {action} / {facing} / 0.5x')]))
                    durations.append(1000/clip['fps'])
            helper.write_gif(review/f'{character}-five-actions-{facing}.gif',images,durations,report['artifacts'])
    for path in sorted(review.glob('*.png')):report['artifacts'].append(artifact(path))
    for _,index in indexes:
        for item in index['downloads']:
            if item['kind']=='png':
                path=ROOT/item['file'];assert sha(path)==item['sha256'];report['artifacts'].append(artifact(path))
        for item in index['screenshots']:
            path=ROOT/item['file'];assert sha(path)==item['sha256'];report['artifacts'].append(artifact(path))
    if ui_run:attach_ui(report,ui_run)
    report['counts']={'packs':len(packs),'nativePackFrames':sum(len(p['frameChecks'])for p in report['packs']),'oldStyleExactFrame0Checks':len(report['oldStylePixelChecks']),'actualMirrorPairs':sum(len(s['actualFrames']['representative'])*2 for _,i in indexes for s in i['selections']),'artifacts':len(report['artifacts'])}
    (DEST/'artifact-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['counts']))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--runs',nargs='+',default=['final-male','final-female']);parser.add_argument('--baseline-run',default='baseline');parser.add_argument('--ui-run');parser.add_argument('--attach-ui-only',action='store_true');args=parser.parse_args()
    if args.attach_ui_only:
        assert args.ui_run,'--ui-run is required'
        path=DEST/'artifact-validation.json';report=json.loads(path.read_text());attach_ui(report,args.ui_run);report['counts']['artifacts']=len(report['artifacts']);path.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['counts']))
    else:main(args.runs,args.baseline_run,args.ui_run)
