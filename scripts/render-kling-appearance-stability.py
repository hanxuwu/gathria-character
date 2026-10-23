#!/usr/bin/env python3
"""Review only real browser downloads from capture-kling-appearance-stability.mjs.

Native project/pack pixels retain their original size. Labeled 0.5x GIFs are
compact reviews; exact RGBA/alpha checks use native PNG frames before quantizing.
"""
from pathlib import Path
import argparse,hashlib,importlib.util,io,json,zipfile
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('appearance_review',ROOT/'scripts/render-kling-appearance-review.py')
helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
sha=helper.sha;decode_pack=helper.decode_pack


def protected_source(project_path,pack_path):
    with zipfile.ZipFile(project_path) as z:
        assert z.testzip() is None
        d=json.loads(z.read('document.json'));source_manifest,source_frames=decode_pack(io.BytesIO(z.read('source.character.zip')))
        output_manifest,output_frames=decode_pack(pack_path)
        selected={v for v in d['selection'].values() if v};layers=[]
        def add(data,styles=None):
            with zipfile.ZipFile(io.BytesIO(data)) as bank:
                assert bank.testzip() is None;m=json.loads(bank.read('manifest.json'))
                pages=[np.array(Image.open(io.BytesIO(bank.read(p['maskFile']))).convert('RGBA'))[:,:,3]>0 for p in m['pages']]
                entries=m['frames'] if styles is None else [f for s in m['styles'] if s['id'] in styles for layer in s['layers'] for f in layer['frames']]
                layers.append((pages,entries))
        for i,item in enumerate(d['items']):
            if item['id'] in selected:add(z.read(f'item-{i}.zip'))
        add(z.read('appearance.zip'),{d['appearance']['hairId'],d['appearance']['faceId']})
        checks=[]
        for fid,frame in output_frames.items():
            source=np.array(source_frames[fid]);out=np.array(frame);original=np.zeros_like(out);original[128:1184,32:736]=source
            allowed=np.zeros(out.shape[:2],bool)
            for pages,entries in layers:
                for e in entries:
                    if e['frameId']!=fid or e.get('mode')=='source':continue
                    r=e['rect'];mask=pages[e['page']][r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
                    x=e['offset']['x']+32;y=e['offset']['y']+128
                    allowed[y:y+r['height'],x:x+r['width']] |= mask
            assert not(np.any(out!=original,axis=2)&~allowed).any(),(pack_path,fid,'source protection')
            assert out[:,:,3].min()==0 and out[:,:,3].max()==255
            assert not out[0,:,3].any() and not out[-1,:,3].any() and not out[:,0,3].any() and not out[:,-1,3].any(),(pack_path,fid,'boundary')
            checks.append({'frameId':fid,'unauthorizedChangedPixels':0,'nativeRgbaSha256':hashlib.sha256(frame.tobytes()).hexdigest()})
        assert output_manifest['animations']==source_manifest['animations'];assert output_manifest['anchor']=={**source_manifest['anchor'],'x':source_manifest['anchor']['x']+32,'y':source_manifest['anchor']['y']+128}
        return {'project':str(project_path),'projectSha256':sha(project_path),'pack':str(pack_path),'sourceRgbaOutsideSelectedOwnershipExact':True,'actionsAndTimingUnchanged':True,'transparentFrameBoundaries':True,'frameChecks':checks}


def artifact(path):
    im=Image.open(path);im.load();return {'file':str(path.relative_to(ROOT)),'sha256':sha(path),'bytes':path.stat().st_size,'size':list(im.size),'decoded':True}


def polygon_coverage(polygons,x,y):
    covered=np.zeros(x.shape,bool)
    for polygon in polygons:
        inside=np.zeros(x.shape,bool);boundary=np.zeros(x.shape,bool)
        for a,b in zip(polygon,polygon[1:]+polygon[:1]):
            boundary |= (np.abs((x-a['x'])*(b['y']-a['y'])-(y-a['y'])*(b['x']-a['x']))<1e-9)&(x>=min(a['x'],b['x'])-1e-9)&(x<=max(a['x'],b['x'])+1e-9)&(y>=min(a['y'],b['y'])-1e-9)&(y<=max(a['y'],b['y'])+1e-9)
            if a['y']==b['y']:continue
            crossing=(a['y']>y)!=(b['y']>y)
            edge=a['x']+(y-a['y'])*(b['x']-a['x'])/(b['y']-a['y'])
            inside ^= crossing & (x<edge)
        covered |= inside|boundary
    return covered


def attach_ui_captures(report,dest,ui_runs):
    # Newest final UI capture per screenshot name wins, without repeating exports.
    ui_screenshots={};report['uiCaptureInputs']=[]
    for run in ui_runs:
        path=dest/run/'evidence-index.json';index=json.loads(path.read_text());assert index['passed'] and index['uiOnly']
        report['uiCaptureInputs'].append({'file':str(path.relative_to(ROOT)),'sha256':sha(path)})
        for screenshot in index['screenshots']:ui_screenshots[Path(screenshot['file']).name]=(screenshot,index)
    for screenshot,index in ui_screenshots.values():
        character=Path(screenshot['file']).name.split('-')[0]
        bank_path=f'docs/kling-appearance/banks/{character}.zip'
        assert index['inputs'][bank_path]==sha(ROOT/bank_path)
        path=ROOT/screenshot['file'];assert sha(path)==screenshot['sha256'];report['artifacts'].append(artifact(path))


def main(runs,ui_runs):
    dest=ROOT/'docs/kling-appearance/stability-review/workflow';indexes=[]
    for run in runs:
        path=dest/run/'evidence-index.json';index=json.loads(path.read_text());assert index['passed'];indexes.append((path,index))
    report={'format':'gathria-appearance-stability-artifacts','version':1,'inputs':[{'file':str(p.relative_to(ROOT)),'sha256':sha(p)}for p,_ in indexes],'packs':[],'mirrors':[],'dailyBeforeAfter':[],'guardComparisons':[],'artifacts':[],'gifTimingNote':'Cumulative centisecond rounding preserves total review timing. These repeat the five-action review sequence; original CharacterPack jump remains one-shot.'}
    packs=[p for _,i in indexes for p in i['packs']]
    for character in sorted({p['character'] for p in packs}):
        current={}
        _,original_frames=decode_pack(ROOT/f'docs/kling-motion/exports/{character}.character.zip')
        with zipfile.ZipFile(ROOT/f'docs/kling-appearance/banks/{character}.zip') as bank_zip:bank=json.loads(bank_zip.read('manifest.json'))
        poses={pose['frameId']:pose for pose in bank['poses']}
        prior_manifest=dest/'final-female/iteration1-bank-manifest.json'
        prior_poses={p['frameId']:p for p in json.loads(prior_manifest.read_text())['poses']} if character=='female' and prior_manifest.exists() else {}
        added_foreground={fid:[p for p in pose['foreground'] if p not in prior_poses[fid]['foreground']] for fid,pose in poses.items()} if prior_poses else {}
        assert all(fid in (78,79) for fid,polygons in added_foreground.items() if polygons)
        for look in ['day','wedding']:
            p=next(p for p in packs if p['character']==character and p['look']==look)
            captured=Path(p['capturedPath']);assert sha(captured)==p['sha256']
            if p['file']:
                retained=ROOT/p['file'];assert sha(retained)==p['retainedSha256']
            m,frames=decode_pack(captured);current[look]=(m,frames)
            if p['previousDayPack']:
                previous=ROOT/p['previousDayPack'];rm,rf=decode_pack(previous)
                assert m['animations']==rm['animations'] and m['anchor']==rm['anchor'];assert frames.keys()==rf.keys()
                changes=[]
                for fid in frames:
                    different=np.any(np.array(frames[fid])!=np.array(rf[fid]),axis=2);y,x=np.where(different)
                    head=poses[fid]['headBounds'];guard=poses[fid]['hairOcclusionBounds'];sx=x-32+.5;sy=y-128+.5
                    inside_head=(sx>=head['x'])&(sx<=head['x']+head['width'])&(sy>=head['y'])&(sy<=head['y']+head['height'])
                    inside_guard=(sx>=guard['x'])&(sx<=guard['x']+guard['width'])&(sy>=guard['y'])&(sy<=guard['y']+guard['height'])
                    hand=polygon_coverage(added_foreground.get(fid,[]),sx,sy)
                    assert ((~inside_head & inside_guard)|hand).all(),(character,fid,'guard/hand change bounds')
                    if hand.any():
                        output_pixels=np.array(frames[fid])[y[hand],x[hand]]
                        source_pixels=np.array(original_frames[fid])[y[hand]-128,x[hand]-32]
                        assert np.array_equal(output_pixels,source_pixels),(character,fid,'restored hand source pixels')
                    changes.append({'frameId':fid,'changedPixels':int(different.sum()),'topSideAllowancePixels':int((~hand).sum()),'restoredForegroundPixels':int(hand.sum()),'onlyExplicitTopSideAllowanceOrRestoredHand':True})
                report['dailyBeforeAfter'].append({'character':character,'previousPack':p['previousDayPack'],'previousSha256':sha(previous),'capturedSha256':sha(captured),'frameChanges':changes,'sameActionsAndAnchors':True,'headInteriorExactExceptExplicitRestoredForeground':True})
            report['packs'].append({'character':character,'look':look,**protected_source(Path(p['projectPath']),captured)})
            left=Image.open(ROOT/p['mirrorPair']['left']).convert('RGBA');right=Image.open(ROOT/p['mirrorPair']['right']).convert('RGBA')
            assert left.tobytes()==right.transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes();assert right.tobytes()==frames[86].tobytes()
            report['mirrors'].append({'character':character,'look':look,'frameId':86,'actualAppPngMatchesPack':True,'leftEqualsExactRightMirror':True})
        for facing in ['right','left']:
            images=[];durations=[];m=current['day'][0]
            for action in helper.ACTIONS:
                clip=m['animations'][action]
                for fid in clip['frames']:
                    tiles=[]
                    for look,label in [('day','Everyday'),('wedding','Wedding')]:
                        frame=current[look][1][fid]
                        if facing=='left':frame=frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                        tiles.append(helper.sheet_tile(frame,f'{character} / {label} / {action} / {facing} / 0.5x'))
                    images.append(helper.join_row(tiles));durations.append(1000/clip['fps'])
            helper.write_gif(dest/f'{character}-everyday-wedding-{facing}.gif',images,durations,report['artifacts'])
        # Matched native input and updated-copy output from actual app PNG downloads.
        directory=next(p.parent for p,i in indexes if any(u['character']==character for u in i['upgrades']))
        if character=='female' and any(added_foreground.values()):
            previous_capture=Path('/tmp/gathria-appearance-stability/final-female/female-day.character.zip')
            _,prior_frames=decode_pack(previous_capture);hand_checks=[]
            for fid,polygons in added_foreground.items():
                y,x=np.where(np.any(np.array(current['day'][1][fid])!=np.array(prior_frames[fid]),axis=2))
                assert polygon_coverage(polygons,x-32+.5,y-128+.5).all(),(fid,'iteration1 hand-only delta')
                if len(x):
                    assert np.array_equal(np.array(current['day'][1][fid])[y,x],np.array(original_frames[fid])[y-128,x-32])
                hand_checks.append({'frameId':fid,'changedPixels':len(x),'onlyAddedForeground':True,'changedPixelsEqualSource':True})
            report['femaleHandCorrection']={'priorCapturedPack':str(previous_capture),'priorSha256':sha(previous_capture),'baselineManifest':str(prior_manifest.relative_to(ROOT)),'frameChecks':hand_checks}
        before=Image.open(directory/f'{character}-old-project-86-left.png').convert('RGBA')
        after=Image.open(directory/f'{character}-updated-copy-86-left.png').convert('RGBA')
        guide=json.loads((ROOT/f'artwork/kling-appearance/registration/{character}.json').read_text())
        pose=next(p for p in guide['frames'] if p['frameId']==86);ear=pose['featureGuides']['ear'];x=768-round(ear['x']+32);y=round(ear['y']+128);ear_box=(x-100,y-110,x+90,y+95)
        # Exact old v2 / newly exported v3 pixels at the rectangular cutoff reported by the audit.
        fid,source_box=(90,(580,300,625,350)) if character=='male' else (0,(520,270,585,330))
        box=tuple(v+(32 if i%2==0 else 128) for i,v in enumerate(source_box))
        _,source_frames=decode_pack(ROOT/f'docs/kling-motion/exports/{character}.character.zip')
        source=Image.new('RGBA',(768,1184));source.alpha_composite(source_frames[fid],(32,128))
        guard_rows=[]
        for style in ['soft-crop','soft-bob']:
            previous=ROOT/f'docs/kling-appearance/ear-edge-review/evidence/final-{character}/exports/{character}-{style}.character.zip'
            _,previous_frames=decode_pack(previous)
            exported=directory/(f'{character}-guard-{style}-90-right.png' if character=='male' else f'{character}-thumbnail-{style}-0-right.png')
            current_png=Image.open(exported).convert('RGBA');current_png.load()
            tiles=[]
            for label,im in [('Original source',source),('Previous v2',previous_frames[fid]),('Current v3',current_png)]:
                crop=im.crop(box);crop=crop.resize((crop.width*4,crop.height*4),Image.Resampling.NEAREST)
                tiles.append(helper.sheet_tile(crop,f'{character} {style} / {label} / {fid} / 4x',1))
            guard_rows.append(helper.join_row(tiles))
            changes=int(np.any(np.array(previous_frames[fid].crop(box))!=np.array(current_png.crop(box)),axis=2).sum())
            report['guardComparisons'].append({'character':character,'style':style,'frameId':fid,'sourceBox':list(source_box),'paddedBox':list(box),'changedPixels':changes,'actualExportPng':str(exported.relative_to(ROOT)),'previousPack':str(previous.relative_to(ROOT))})
        path=dest/f'{character}-fringe-guard-v2-v3-4x.png'
        combined=Image.new('RGB',(max(im.width for im in guard_rows),sum(im.height for im in guard_rows)),helper.BG);y=0
        for row in guard_rows:combined.paste(row,(0,y));y+=row.height
        combined.save(path);report['artifacts'].append(artifact(path))
        for scale in [1,2]:
            tiles=[]
            for label,im in [('Embedded original',before),('Saved updated copy',after)]:
                crop=im.crop(ear_box).resize((190*scale,205*scale),Image.Resampling.NEAREST)
                tiles.append(helper.sheet_tile(crop,f'{label} / {character} 86 left / {scale}x',1))
            path=dest/f'{character}-saved-copy-ear-{scale}x.png';helper.join_row(tiles).save(path);report['artifacts'].append(artifact(path))
    for _,index in indexes:
        for s in index['screenshots']:
            path=ROOT/s['file'];assert sha(path)==s['sha256'];report['artifacts'].append(artifact(path))
        for d in index['downloads']:
            if d['kind']=='png':
                path=ROOT/d['file'];assert sha(path)==d['sha256'];report['artifacts'].append(artifact(path))
    attach_ui_captures(report,dest,ui_runs)
    playback=[p for _,i in indexes for p in i['playback']]
    report['playbackSummary']={'combinations':len(playback),'missedPositionObservations':[{'character':p['character'],'look':p['look'],'action':p['action'],'facing':p['facing'],'missingPositions':p['missingPositions']}for p in playback if p['missingPositions']],'maxObservedGapMs':max((b['atMs']-a['atMs'] for p in playback for a,b in zip(p['observations'],p['observations'][1:])),default=0)}
    (dest/'artifact-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'packs':len(report['packs']),'mirrors':len(report['mirrors']),'artifacts':len(report['artifacts']),'playback':report['playbackSummary']},indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--runs',nargs='+',default=['final']);parser.add_argument('--ui-runs',nargs='*',default=[]);parser.add_argument('--ui-only',action='store_true');args=parser.parse_args()
    if args.ui_only:
        assert args.ui_runs
        dest=ROOT/'docs/kling-appearance/stability-review/workflow';path=dest/'artifact-validation.json';report=json.loads(path.read_text())
        for captured in report['inputs']:assert sha(ROOT/captured['file'])==captured['sha256']
        attach_ui_captures(report,dest,args.ui_runs);path.write_text(json.dumps(report,indent=2)+'\n');print('Final UI PNGs decoded and appended; pack checks were not repeated.')
    else:main(args.runs,args.ui_runs)
