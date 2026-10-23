#!/usr/bin/env python3
"""Review real male ear-overlap browser exports against retained baseline downloads."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import io
import json
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'docs/kling-appearance/ear-overlap-review'

def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

review = module('ear_review_helpers', 'scripts/render-kling-appearance-review.py')
stability = module('ear_review_invariants', 'scripts/render-kling-appearance-stability.py')
sha, decode = review.sha, review.decode_pack

def checked_png(path):
    with Image.open(path) as image:
        image.load()
        return {'file':str(path.relative_to(ROOT)), 'sha256':sha(path), 'bytes':path.stat().st_size,
                'size':list(image.size), 'decoded':True}

def project(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        document=json.loads(archive.read('document.json'))
        bank=archive.read('appearance.zip')
    return document, bank

def hair_masks(bank_bytes, style_id):
    with zipfile.ZipFile(io.BytesIO(bank_bytes)) as archive:
        m=json.loads(archive.read('manifest.json'))
        pages=[np.array(Image.open(io.BytesIO(archive.read(p['maskFile']))).convert('RGBA'))[:,:,3]>0 for p in m['pages']]
    style=next(style for style in m['styles'] if style['id']==style_id)
    frames={}
    for layer in style['layers']:
        for f in layer['frames']:
            if f.get('mode')=='source':continue
            mask=frames.setdefault(f['frameId'],np.zeros((1184,768),bool))
            r=f['rect'];x=f['offset']['x']+32;y=f['offset']['y']+128
            mask[y:y+r['height'],x:x+r['width']] |= pages[f['page']][r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
    return frames

def padded_source(frame):
    image=Image.new('RGBA',(768,1184));image.alpha_composite(frame,(32,128));return image

def crop_ear(image, pose, scale=1):
    ear=pose['featureGuides']['ear'];x=round(ear['x']+32);y=round(ear['y']+128)
    crop=image.crop((x-75,y-85,x+100,y+85))
    return crop.resize((crop.width*scale,crop.height*scale),Image.Resampling.NEAREST)

def join_rows(rows):
    result=Image.new('RGB',(max(row.width for row in rows),sum(row.height for row in rows)),review.BG);y=0
    for row in rows:result.paste(row,(0,y));y+=row.height
    return result

def main(run):
    index_path=DEST/'evidence'/run/'evidence-index.json'
    index=json.loads(index_path.read_text());assert index['passed']
    baseline_path=DEST/'baseline-inputs.json';baseline=json.loads(baseline_path.read_text())
    by_look={p['look']:p for p in baseline['packs']}
    source_manifest,source_frames=decode(ROOT/'docs/kling-motion/exports/male.character.zip')
    poses={p['frameId']:p for p in json.loads((ROOT/'artwork/kling-appearance/registration/male.json').read_text())['frames']}
    report={'format':'gathria-ear-overlap-artifact-validation','version':1,
        'baselineCommit':baseline['baselineCommit'],
        'baselineHistoricalCapture':baseline['sourceCaptureIndex'],
        'newCapture':str(index_path.relative_to(ROOT)), 'newCaptureSha256':sha(index_path),
        'packs':[], 'artifacts':[], 'mirrors':[],
        'reviewLimits':'Original source is shown as reference. Ear crops track the original ear at integer offsets. Full-body GIFs preserve exported placement at labeled 0.5x. GIF centisecond timing and palette differ from native RGBA; source clip timing/loop flags remain exact in the packs.'}
    for captured in index['packs']:
        look=captured['look'];old=by_look[look]
        current_path=Path(captured['capturedPath']);old_path=Path(old['pack']['path'])
        assert sha(current_path)==captured['sha256'] and sha(old_path)==old['pack']['sha256']
        published=ROOT/captured['file'];assert sha(published)==captured['sha256']
        m,frames=decode(current_path);old_m,old_frames=decode(old_path)
        assert m['animations']==old_m['animations']==source_manifest['animations']
        assert m['anchor']==old_m['anchor']
        assert frames.keys()==old_frames.keys()==source_frames.keys()
        d,bank=project(Path(captured['projectPath']));old_d,old_bank=project(Path(old['project']['path']))
        assert d['selection']==old_d['selection'];assert d['items']==old_d['items']
        assert {k:v for k,v in d['appearance'].items() if k!='bankSha256'}=={k:v for k,v in old_d['appearance'].items() if k!='bankSha256'}
        style=d['appearance']['hairId'];allowed=hair_masks(bank,style);old_allowed=hair_masks(old_bank,style)
        changes=[]
        for fid,frame in frames.items():
            diff=np.any(np.array(frame)!=np.array(old_frames[fid]),axis=2)
            union=allowed[fid]|old_allowed[fid]
            assert not (diff&~union).any(),(look,fid,'change outside old/new selected hair ownership')
            y,x=np.where(diff)
            changes.append({'frameId':fid,'changedPixels':int(diff.sum()),'outsideSelectedHairChanges':0,
                'bounds':[int(x.min()),int(y.min()),int(x.max()),int(y.max())] if len(x) else None,
                'finalRgbaSha256':hashlib.sha256(frame.tobytes()).hexdigest()})
        protected=stability.protected_source(Path(captured['projectPath']),current_path)
        report['packs'].append({'look':look,'style':style,'baselinePackSha256':old['pack']['sha256'],
            'finalPack':captured['file'],'finalPackSha256':captured['sha256'],
            'frameChanges':changes,'sameActionsTimingAnchorsAndSelection':True,**protected})
        right=Image.open(ROOT/captured['mirrorPair']['right']).convert('RGBA')
        left=Image.open(ROOT/captured['mirrorPair']['left']).convert('RGBA')
        assert right.tobytes()==frames[index['focusFrame']].tobytes()
        assert left.tobytes()==right.transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes()
        report['mirrors'].append({'look':look,'frameId':index['focusFrame'],'actualAppPngMatchesPack':True,'leftExactlyMirrorsRight':True})
        if look=='day':
            before_png=Image.open(index_path.parent/f"male-old-project-{index['focusFrame']}-left.png").convert('RGBA')
            copy_png=Image.open(index_path.parent/f"male-updated-copy-{index['focusFrame']}-left.png").convert('RGBA')
            assert before_png.tobytes()==old_frames[index['focusFrame']].transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes()
            assert copy_png.tobytes()==left.tobytes()
            report['oldProjectReproduction']={'frameId':index['focusFrame'],'facing':'left','freshOldProjectPngMatchesHistoricalPack':True,'reopenedUpdatedCopyMatchesFinalPack':True}
        sources=[('Original source',source_frames),('Before',old_frames),('After',frames)]
        for facing in ['right','left']:
            sequence=[];durations=[]
            for action in review.ACTIONS:
                clip=m['animations'][action]
                for fid in clip['frames']:
                    tiles=[]
                    for label,rows in sources:
                        frame=padded_source(rows[fid]) if label=='Original source' else rows[fid]
                        if facing=='left':frame=frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                        tiles.append(review.sheet_tile(frame,f'{style} / {look} / {label} / {action} / {facing} / 0.5x'))
                    sequence.append(review.join_row(tiles));durations.append(1000/clip['fps'])
            review.write_gif(DEST/f'{style}-five-actions-{facing}.gif',sequence,durations,report['artifacts'])
        for scale in [1,2]:
            sequence=[];durations=[]
            for fid in m['animations']['run']['frames']:
                tiles=[]
                for label,rows in sources:
                    frame=padded_source(rows[fid]) if label=='Original source' else rows[fid]
                    tiles.append(review.sheet_tile(crop_ear(frame,poses[fid],scale),f'{style.removeprefix("soft-").title()} / {label.replace("Original source","Source")} / {fid} / {scale}x',1))
                sequence.append(review.join_row(tiles));durations.append(1000/m['animations']['run']['fps'])
            review.write_gif(DEST/f'{style}-ear-run-{scale}x.gif',sequence,durations,report['artifacts'])
            report['artifacts'][-1]['previewScale']=scale
            report['artifacts'][-1]['earTrackingCrop']=True
            # Native and nearest-neighbor detail stills use the exact same poses.
            rows=[]
            for fid in index['detailFrames']:
                tiles=[]
                for label,source in sources:
                    frame=padded_source(source[fid]) if label=='Original source' else source[fid]
                    tiles.append(review.sheet_tile(crop_ear(frame,poses[fid],scale),f'{style.removeprefix("soft-").title()} / {label.replace("Original source","Source")} / {fid} / {scale}x',1))
                rows.append(review.join_row(tiles))
            path=DEST/f'{style}-ear-keyframes-{scale}x.png';join_rows(rows).save(path);report['artifacts'].append(checked_png(path))
    for row in [*index['screenshots'],*[d for d in index['downloads'] if d['kind']=='png']]:
        path=ROOT/row['file'];assert sha(path)==row['sha256'];report['artifacts'].append(checked_png(path))
    report['playback']={'combinations':len(index['playback']),
        'missedPositions':[p for p in index['playback'] if p['missingPositions']],
        'maxObservedGapMs':max((b['atMs']-a['atMs'] for p in index['playback'] for a,b in zip(p['observations'],p['observations'][1:])),default=0)}
    (DEST/'artifact-validation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'packs':len(report['packs']),'nativeFrameChecks':sum(len(p['frameChanges'])for p in report['packs']),
        'artifacts':len(report['artifacts']),'playback':report['playback']},indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--run',default='final');args=parser.parse_args();main(args.run)
