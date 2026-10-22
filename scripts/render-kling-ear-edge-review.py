#!/usr/bin/env python3
"""Hair/ear review from actual wardrobe downloads; no donor artwork in evidence.

Run after capture-kling-ear-edge.mjs. Existing saved projects/packs provide the
unaltered ce31e17 baseline. New transient projects are verified at capture time;
all GIF source packs, captured PNGs, hashes, and validation records are retained.
"""
from pathlib import Path
import argparse, hashlib, importlib.util, io, json, zipfile
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('appearance_review',ROOT/'scripts/render-kling-appearance-review.py')
helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
BG=helper.BG;ACTIONS=helper.ACTIONS
sha=helper.sha;decode_pack=helper.decode_pack;sheet_tile=helper.sheet_tile;join_row=helper.join_row;write_gif=helper.write_gif


def unchanged_face_and_guides(character):
    legacy=ROOT/f'docs/kling-appearance/review/evidence/final-{character}/exports/{character}-day.wardrobe.zip'
    fresh=ROOT/f'docs/kling-appearance/banks/{character}.zip'
    with zipfile.ZipFile(legacy) as project:old_bytes=project.read('appearance.zip')
    new_bytes=fresh.read_bytes()
    with zipfile.ZipFile(io.BytesIO(old_bytes)) as old, zipfile.ZipFile(io.BytesIO(new_bytes)) as new:
        a=json.loads(old.read('manifest.json'));b=json.loads(new.read('manifest.json'))
        poses_a={p['frameId']:p for p in a['poses']};poses_b={p['frameId']:p for p in b['poses']}
        assert poses_a.keys()==poses_b.keys()
        fields=['frameId','sourceFrame','anchors','facePolygon','foreground','headBounds']
        for fid in poses_a:
            for key in fields:assert poses_a[fid][key]==poses_b[fid][key],(character,fid,key)
        def face_frames(m):
            style=next(s for s in m['styles'] if s['id']=='gentle')
            return {f['frameId']:f for l in style['layers'] if l['role']=='face' for f in l['frames']}
        fa=face_frames(a);fb=face_frames(b);assert fa.keys()==fb.keys();pages=[{},{}];checks=[]
        def crop(z,m,f,cache,kind):
            page=f['page'];key=(page,kind)
            if key not in cache:pagespec=m['pages'][page];cache[key]=Image.open(io.BytesIO(z.read(pagespec['file' if kind=='rgba' else 'maskFile']))).convert('RGBA')
            r=f['rect'];return cache[key].crop((r['x'],r['y'],r['x']+r['width'],r['y']+r['height']))
        for fid,left in fa.items():
            right=fb[fid];assert left['mode']==right['mode'],(character,fid,'mode')
            check={'frameId':fid,'mode':left['mode'],'exact':True}
            if left['mode']!='source':
                assert left['offset']==right['offset'],(character,fid,'offset')
                for kind in ['rgba','mask']:
                    im_a=crop(old,a,left,pages[0],kind);im_b=crop(new,b,right,pages[1],kind)
                    assert im_a.size==im_b.size and im_a.tobytes()==im_b.tobytes(),(character,fid,kind)
                    check[kind+'Sha256']=hashlib.sha256(im_a.tobytes()).hexdigest()
            checks.append(check)
    return {'character':character,'oldBankSha256':hashlib.sha256(old_bytes).hexdigest(),'newBankSha256':hashlib.sha256(new_bytes).hexdigest(),'poseFieldsExact':fields,'gentleFaceLayersExact':True,'frames':checks}


def source_invariants(character,style,pack_path):
    """Exact RGBA and unchanged sequences, using selected source-owned masks."""
    baseline=ROOT/f'docs/kling-appearance/review/evidence/final-{character}/exports/{character}-day.wardrobe.zip'
    bank_path=ROOT/f'docs/kling-appearance/banks/{character}.zip'
    with zipfile.ZipFile(baseline) as project:
        doc=json.loads(project.read('document.json'))
        source_bytes=project.read('source.character.zip')
        source_manifest,source_frames=decode_pack(io.BytesIO(source_bytes))
        output_manifest,output_frames=decode_pack(pack_path)
        selected={v for v in doc['selection'].values() if v};layers=[]
        def layer(data,selected_styles=None):
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                m=json.loads(z.read('manifest.json'))
                pages=[np.array(Image.open(io.BytesIO(z.read(p['maskFile']))))[:,:,3]>0 for p in m['pages']]
                entries=m['frames'] if selected_styles is None else [f for s in m['styles'] if s['id'] in selected_styles for l in s['layers'] for f in l['frames']]
                layers.append((pages,entries))
        for i,item in enumerate(doc['items']):
            if item['id'] in selected:layer(project.read(f'item-{i}.zip'))
        layer(bank_path.read_bytes(),{style,'gentle'})
        checks=[]
        for fid,frame in output_frames.items():
            source=np.array(source_frames[fid]);out=np.array(frame)
            original=np.zeros_like(out);original[128:1184,32:736]=source
            allowed=np.zeros(out.shape[:2],bool)
            for pages,entries in layers:
                for e in entries:
                    if e['frameId']!=fid or e.get('mode')=='source':continue
                    r=e['rect'];owned=pages[e['page']][r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
                    x=e['offset']['x']+32;y=e['offset']['y']+128
                    assert x>=0 and y>=0 and x+r['width']<=out.shape[1] and y+r['height']<=out.shape[0]
                    allowed[y:y+r['height'],x:x+r['width']] |= owned
            assert not (np.any(out!=original,axis=2)&~allowed).any(),(str(pack_path),fid)
            checks.append({'frameId':fid,'unauthorizedChangedPixels':0,'rgbaComparedPixels':int((~allowed).sum())})
        assert output_manifest['animations']==source_manifest['animations']
        assert output_manifest['anchor']['x']==source_manifest['anchor']['x']+32
        assert output_manifest['anchor']['y']==source_manifest['anchor']['y']+128
        return {'pack':str(pack_path.relative_to(ROOT)),'baselineProject':str(baseline.relative_to(ROOT)),'appearanceBank':str(bank_path.relative_to(ROOT)),'appearanceBankSha256':sha(bank_path),'selectedHair':style,'sourceRGBAExactOutsideSelectedOwnership':True,'actionsAndTimingUnchanged':True,'frames':checks}


def grid(rows,path):
    out=Image.new('RGB',(max(r.width for r in rows),sum(r.height for r in rows)),BG);y=0
    for row in rows:out.paste(row,(0,y));y+=row.height
    out.save(path)


def main(run,characters):
    dest=ROOT/'docs/kling-appearance/ear-edge-review';dest.mkdir(parents=True,exist_ok=True)
    directories={c:dest/f'evidence/{run}-{c}' for c in characters}
    indexes={c:json.loads((d/'evidence-index.json').read_text()) for c,d in directories.items()}
    assert all(i['passed'] and not i['quick'] for i in indexes.values())
    artifacts=[];invariants=[];mirrors=[];pose_counts=[];screenshot_pose=[];preservation=[]
    for character,directory in directories.items():
        preservation.append(unchanged_face_and_guides(character))
        manifest,source_frames=decode_pack(ROOT/f'docs/kling-motion/exports/{character}.character.zip')
        _,previous_default=decode_pack(ROOT/f'docs/kling-appearance/review/evidence/final-{character}/exports/{character}-day.character.zip')
        heads=json.loads((ROOT/f'artwork/kling-appearance/registration/{character}.json').read_text())
        by_id={r['frameId']:r for r in heads['frames']}
        default='soft-crop' if character=='male' else 'soft-bob'
        crop_rows={1:[],2:[]};full_rows=[];all_head_tiles=[]
        for style in ['soft-crop','soft-bob']:
            pack=directory/f'exports/{character}-{style}.character.zip'
            invariants.append(source_invariants(character,style,pack))
            pm,frames=decode_pack(pack)
            for facing in ['right','left']:
                images=[];durations=[]
                for action in ACTIONS:
                    clip=pm['animations'][action]
                    for fid in clip['frames']:
                        after=frames[fid]
                        if style==default:
                            before=previous_default[fid];label='Previous hair / same outfit'
                        else:
                            before=Image.new('RGBA',(768,1184));before.alpha_composite(source_frames[fid],(32,128));label='Original / no hair'
                        if facing=='left':after=after.transpose(Image.Transpose.FLIP_LEFT_RIGHT);before=before.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                        images.append(join_row([sheet_tile(before,f'{label} / {action} / {facing} / 0.5x'),sheet_tile(after,f'Ear fit / {character} {style} / {action} / {facing} / 0.5x')]))
                        durations.append(1000/clip['fps'])
                write_gif(dest/f'{character}-{style}-five-actions-{facing}.gif',images,durations,artifacts)
            if character=='male' and style=='soft-crop':
                for scale in [1,2]:
                    images=[];durations=[];clip=pm['animations']['jump'];crop_records=[]
                    for fid in clip['frames']:
                        guide=by_id[fid]['featureGuides']['ear'];x=round(guide['x'])+32;y=round(guide['y'])+128
                        box=(x-85,y-105,x+100,y+95);crop_records.append({'frameId':fid,'box':list(box)})
                        tiles=[]
                        for label,im in [('Previous',previous_default[fid]),('Fixed',frames[fid])]:
                            crop=im.crop(box).resize((185*scale,200*scale),Image.Resampling.NEAREST)
                            tiles.append(sheet_tile(crop,f'{label} / jump {fid} / {scale}x',1))
                        row=join_row(tiles);captioned=Image.new('RGB',(row.width,row.height+24),BG);captioned.paste(row,(0,24))
                        ImageDraw.Draw(captioned).text((8,6),'Ear-stabilized inspection / repeated review',fill=helper.INK,font=helper.FONT)
                        images.append(captioned);durations.append(1000/clip['fps'])
                    write_gif(dest/f'male-soft-crop-ear-jump-{scale}x.gif',images,durations,artifacts)
                    artifacts[-1].update(previewScale=scale,inspectionCrop='Same source ear guide per frame, stabilized only for edge inspection; full-body GIFs retain actual placement.',cropRecords=crop_records,reviewLoop='Repeats the original one-shot jump sequence for inspection only.')
            for fid in [0,51,86,87,88,104,105,107,109]:
                before_path=directory/f'png/{character}-before-{style}-{fid}-right.png'
                after_path=directory/f'png/{character}-after-{style}-{fid}-right.png'
                if not before_path.exists():continue
                before=Image.open(before_path).convert('RGBA');after=Image.open(after_path).convert('RGBA');after.load()
                assert after.tobytes()==frames[fid].tobytes(),(character,style,fid,'app PNG vs pack')
                original=Image.new('RGBA',(768,1184));original.alpha_composite(source_frames[fid],(32,128))
                guide=by_id[fid]['featureGuides']['ear'];x=round(guide['x'])+32;y=round(guide['y'])+128
                rect=(x-65,y-85,x+65,y+65)
                for scale in [1,2]:
                    crops=[sheet_tile(im.crop(rect).resize((130*scale,150*scale),Image.Resampling.NEAREST),f'{label} / {scale}x',1) for label,im in [('source',original),('previous',before),('fixed',after)]]
                    comparison=join_row(crops);captioned=Image.new('RGB',(comparison.width,comparison.height+24),BG);captioned.paste(comparison,(0,24))
                    ImageDraw.Draw(captioned).text((10,6),f'{character} / {style} / frame {fid}',fill=helper.INK,font=helper.FONT)
                    crop_rows[scale].append(captioned)
                    if fid==86 and scale==2:screenshot_pose.append(captioned)
                if fid in [86,107]:
                    # Full heads use identical source-coordinate bounds, not separate fitted crops.
                    h=by_id[fid]['headBounds'];rect=(max(0,h['x']-80+32),max(0,h['y']-140+128),min(768,h['x']+h['width']+80+32),min(1184,h['y']+h['height']+40+128))
                    full_rows.append(join_row([sheet_tile(im.crop(rect),f'{style} / {fid} / {label} / native 1x',1) for label,im in [('source',original),('previous',before),('fixed',after)]]))
            left=Image.open(directory/f'png/{character}-after-{style}-86-left.png').convert('RGBA')
            right=Image.open(directory/f'png/{character}-after-{style}-86-right.png').convert('RGBA')
            assert left.tobytes()==right.transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes()
            mirrors.append({'character':character,'style':style,'frameId':86,'exactRgbaHorizontalMirror':True})
            for fid in sorted(frames):
                row=by_id[fid];h=row['headBounds'];rect=(max(0,h['x']-80+32),max(0,h['y']-140+128),min(768,h['x']+h['width']+80+32),min(1184,h['y']+h['height']+40+128))
                im=frames[fid].crop(rect);im.thumbnail((220,230),Image.Resampling.LANCZOS)
                tile=Image.new('RGB',(232,260),BG);tile.paste(im,(6,26),im);ImageDraw.Draw(tile).text((6,6),f'{style} / {fid}',fill=helper.INK,font=helper.FONT);all_head_tiles.append(tile)
            pose_counts.append({'character':character,'style':style,'poses':len(frames)})
        for scale,rows in crop_rows.items():grid(rows,dest/f'{character}-ear-comparison-{scale}x.png')
        grid(full_rows,dest/f'{character}-head-comparison-1x.png')
        grid([join_row(all_head_tiles[i:i+8]) for i in range(0,len(all_head_tiles),8)],dest/f'{character}-all-heads.png')
        colors=[]
        for style in ['soft-crop','soft-bob']:
            guide=by_id[86]['featureGuides']['ear'];x=round(guide['x'])+32;y=round(guide['y'])+128;rect=(x-85,y-110,x+100,y+90)
            colors.append(join_row([sheet_tile(Image.open(directory/f'png/{character}-after-{style}{suffix}-86-right.png').convert('RGBA').crop(rect).resize((370,400),Image.Resampling.NEAREST),f'{style} / {label} / 86 / 2x',1) for suffix,label in [('', 'Chestnut'),('-espresso','Espresso')]]))
        grid(colors,dest/f'{character}-ear-colors-2x.png')
    if screenshot_pose:grid(screenshot_pose,dest/'screenshot-pose-ear-2x.png')
    for p in sorted(dest.glob('*.png')):
        with Image.open(p) as im:im.load();assert im.width and im.height;artifacts.append({'file':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':sha(p),'size':list(im.size),'decoded':True})
    playback=[p for i in indexes.values() for p in i['playback']];rechecks=[];observed_rechecks=[]
    for character in characters:
        path=dest/f'evidence/recheck-{character}/evidence-index.json'
        if path.exists():
            r=json.loads(path.read_text());assert r['passed'];assert sha(ROOT/r['playbackRecheckOf']['file'])==r['playbackRecheckOf']['sha256']
            rechecks.append({'file':str(path.relative_to(ROOT)),'sha256':sha(path),'warmupSequences':len(r['warmupPlayback']),'targetedSequences':len(r['playback'])});observed_rechecks.extend(r['playback'])
    unresolved=[]
    for p in playback:
        if not p['missingPositions']:continue
        retry=next((r for r in observed_rechecks if all(r[k]==p[k] for k in ['character','look','action','facing'])),None)
        if retry is None or retry['missingPositions']:unresolved.append({'character':p['character'],'style':p['look'],'action':p['action'],'facing':p['facing'],'missingPositions':p['missingPositions'] if retry is None else retry['missingPositions']})
    observer={'initialCombinations':len(playback),'initialUnobservedPositions':sum(len(p['missingPositions']) for p in playback),'targetedRechecks':rechecks,'remainingUnobservedCombinations':unresolved,'scope':'Initial scheduling misses remain in original captures; only the affected combinations were observed again after an explicitly recorded warmup. This is not a guarantee of perfect realtime playback.'}
    report={'playbackObserverSummary':observer,'inputEvidence':[str((d/'evidence-index.json').relative_to(ROOT)) for d in directories.values()],'unchangedFacesAndGuides':preservation,'sourceInvariants':invariants,'actualPngMirrorChecks':mirrors,'renderedPoseCoverage':pose_counts,'gifTiming':'cumulative centisecond rounding; source fps remains in CharacterPack','artifacts':artifacts}
    (dest/'artifact-validation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'artifacts':len(artifacts),'output':str(dest)}))

def quick_boards(run):
    dest=ROOT/'docs/kling-appearance/ear-edge-review'
    directory=dest/f'evidence/{run}'
    index=json.loads((directory/'evidence-index.json').read_text());assert index['passed'] and index['quick']
    for character in ['male','female']:
        heads=json.loads((ROOT/f'artwork/kling-appearance/registration/{character}.json').read_text())
        by_id={r['frameId']:r for r in heads['frames']}
        rows=[]
        for style in ['soft-crop','soft-bob']:
            for fid in [0,86,87,107]:
                before_path=directory/f'png/{character}-before-{style}-{fid}-right.png'
                after_path=directory/f'png/{character}-after-{style}-{fid}-right.png'
                if not before_path.exists() or not after_path.exists():continue
                guide=by_id[fid]['featureGuides']['ear'];x=round(guide['x'])+32;y=round(guide['y'])+128
                box=(x-85,y-110,x+100,y+90)
                rows.append(join_row([sheet_tile(Image.open(p).convert('RGBA').crop(box).resize((370,400),Image.Resampling.NEAREST),f'{character} / {style} / {fid} / {label} / 2x',1) for label,p in [('before',before_path),('after',after_path)]]))
        if rows:grid(rows,directory/f'{character}-ear-quick-2x.png')
    print(str(directory))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--run',default='final');p.add_argument('--character',choices=['male','female']);p.add_argument('--quick',action='store_true');a=p.parse_args()
    if a.quick:quick_boards(a.run)
    else:main(a.run,[a.character] if a.character else ['male','female'])
