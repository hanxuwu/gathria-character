#!/usr/bin/env python3
"""Review real browser exports; no offline donor composites are used as evidence."""
from pathlib import Path
import importlib.util,io,json,zipfile,hashlib
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
def mod(name,file):
    s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
h=mod('sprint_review','render-kling-appearance-review.py')
check=mod('sprint_check','render-kling-appearance-stability.py')
OUT=ROOT/'docs/kling-refinement/review';OUT.mkdir(parents=True,exist_ok=True)
indexes=[json.loads(p.read_text()) for p in sorted((ROOT/'docs/kling-refinement/evidence').glob('*/evidence-index.json'))]
indexes=[i for i in indexes if i.get('passed')]
packs={p['look']:p for i in indexes for p in i['packs']}
assert 'pony-before' in packs and 'pony-after' in packs
report={'packs':[],'pngs':[],'gifs':[],'beforeAfter':[],'actualDownloadChecks':[]}
def protected_source(project_path,pack_path):
    with zipfile.ZipFile(project_path) as z:
        assert z.testzip() is None
        d=json.loads(z.read('document.json'));sm,sf=h.decode_pack(io.BytesIO(z.read('source.character.zip')))
        om,of=h.decode_pack(pack_path);dx=om['anchor']['x']-sm['anchor']['x'];dy=om['anchor']['y']-sm['anchor']['y'];layers=[]
        def add(data,styles=None):
            with zipfile.ZipFile(io.BytesIO(data)) as bank:
                assert bank.testzip() is None;m=json.loads(bank.read('manifest.json'))
                pages=[np.asarray(Image.open(io.BytesIO(bank.read(p['maskFile']))).convert('RGBA'))[:,:,3]>0 for p in m['pages']]
                entries=m['frames'] if styles is None else [f for s in m['styles'] if s['id'] in styles for layer in s['layers'] for f in layer['frames']]
                layers.append((pages,entries))
        for i,item in enumerate(d['items']):
            if item['id'] in d['selection'].values():add(z.read(f'item-{i}.zip'))
        if 'appearance.zip' in z.namelist():add(z.read('appearance.zip'),{d['appearance']['hairId'],d['appearance']['faceId']})
        checks=[]
        for fid,frame in of.items():
            source=np.asarray(sf[fid]);out=np.asarray(frame);original=np.zeros_like(out);original[dy:dy+source.shape[0],dx:dx+source.shape[1]]=source;allowed=np.zeros(out.shape[:2],bool)
            for pages,entries in layers:
                for e in entries:
                    if e['frameId']!=fid or e.get('mode')=='source':continue
                    r=e['rect'];mask=pages[e['page']][r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
                    x=e['offset']['x']+dx;y=e['offset']['y']+dy;allowed[y:y+r['height'],x:x+r['width']] |= mask
            assert not (np.any(out!=original,axis=2)&~allowed).any(),(pack_path,fid,'source protection')
            assert out[:,:,3].min()==0 and out[:,:,3].max()==255
            assert not out[0,:,3].any() and not out[-1,:,3].any() and not out[:,0,3].any() and not out[:,-1,3].any(),(pack_path,fid,'boundary')
            checks.append({'frameId':fid,'unauthorizedChangedPixels':0,'nativeRgbaSha256':hashlib.sha256(frame.tobytes()).hexdigest()})
        assert om['animations']==sm['animations']
        assert (dx,dy) in [(0,0),(32,128)]
        return {'project':str(project_path),'projectSha256':h.sha(project_path),'pack':str(pack_path),'sourceRgbaOutsideSelectedOwnershipExact':True,'actionsAndTimingUnchanged':True,'transparentFrameBoundaries':True,'frameChecks':checks}
for key,p in packs.items():
    path=ROOT/p['file'];assert h.sha(path)==p['sha256']
    report['packs'].append({'look':key,**protected_source(Path(p['project']),path)})
    m,frames=h.decode_pack(path)
    for f in path.parent.glob(f'{p["character"]}-{key}-*-*.png'):
        parts=f.stem.split('-')
        if parts[-1] not in ['left','right'] or not parts[-2].isdigit():continue
        fid=int(parts[-2]);actual=Image.open(f).convert('RGBA');expected=frames[fid]
        if parts[-1]=='left':expected=expected.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        assert np.array_equal(np.asarray(actual),np.asarray(expected)),f
        report['actualDownloadChecks'].append({'file':str(f.relative_to(ROOT)),'exactToPackFrame':True})
    del frames

def save(image,name):
    p=OUT/name;image.save(p);report['pngs'].append(check.artifact(p))
def board(rows):
    output=Image.new('RGB',(max(r.width for r in rows),sum(r.height for r in rows)),h.BG);y=0
    for r in rows:output.paste(r,(0,y));y+=r.height
    return output
for study in sorted(key[:-6] for key in packs if key.endswith('-after') and key[:-6]+'-before' in packs):
    bm,before=h.decode_pack(ROOT/packs[f'{study}-before']['file'])
    am,after=h.decode_pack(ROOT/packs[f'{study}-after']['file'])
    assert bm['animations']==am['animations'] and bm['anchor']==am['anchor']
    # Exact-pixel boards are integer scale. Compact GIFs are explicitly 0.5x.
    for scale in [1,2]:
        row=h.join_row([h.sheet_tile(before[0],f'Before / {scale}x',1),h.sheet_tile(after[0],f'After / {scale}x',1)])
        if scale==2:row=row.resize((row.width*2,row.height*2),Image.Resampling.NEAREST)
        save(row,f'{study}-before-after-{scale}x.png')
    project=Path(packs[f'{study}-after']['project'])
    with zipfile.ZipFile(project) as z:
        ap=None
        if 'appearance.zip' in z.namelist():
            with zipfile.ZipFile(io.BytesIO(z.read('appearance.zip'))) as a:ap=json.loads(a.read('manifest.json'))
        registration=json.loads(z.read('registration.json'))
    poses={p['frameId']:p for p in ap['poses']} if ap else {};regs={p['frameId']:p for p in registration['frames']}
    rows=[]
    for fid in [0,55,62,86]:
        if study=='pony':
            b=poses[fid]['headBounds'];left=b['x']+32-35;top=b['y']+128+b['height']*.40
            region=(int(left),int(top),int(left+260),int(top+270))
        elif study.startswith('male') or study=='ocean':
            p=regs[fid]['points'];wy=(p['waistLeft']['y']+p['waistRight']['y'])/2
            region=(100,int(wy)-220,660,int(wy)+75)
        else:
            p=regs[fid]['points'];wy=(p['waistLeft']['y']+p['waistRight']['y'])/2+(128 if ap else 0)
            region=((172 if ap else 140),int(wy)-150,(642 if ap else 610),int(wy)+130)
        crops=[h.sheet_tile(frames[fid].crop(region),f'{label} / source {fid} / 2x',1) for label,frames in [('Before',before),('After',after)]]
        r=h.join_row(crops);rows.append(r.resize((r.width*2,r.height*2),Image.Resampling.NEAREST))
    save(board(rows),f'{study}-connections-2x.png')
    for facing in ['right','left']:
        for group,actions in [('five-actions',h.ACTIONS),('run',['run'])]:
            images=[];durations=[]
            for action in actions:
                clip=am['animations'][action]
                for fid in clip['frames']:
                    pair=[]
                    for label,frames in [('Before',before),('After',after)]:
                        frame=frames[fid]
                        if facing=='left':frame=frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                        pair.append(h.sheet_tile(frame,f'{label} / {action} / {facing} / 0.5x'))
                    images.append(h.join_row(pair));durations.append(1000/clip['fps'])
            h.write_gif(OUT/f'{study}-{group}-{facing}.gif',images,durations,report['gifs'])
    keyframes=[]
    for action in h.ACTIONS:
        clip=am['animations'][action]
        positions=sorted(set([0,len(clip['frames'])//3,2*len(clip['frames'])//3,len(clip['frames'])-1]))
        keyframes.append(h.join_row([h.sheet_tile(after[clip['frames'][i]],f'{action} / {i} / source {clip["frames"][i]} / 1x',1) for i in positions]))
    save(board(keyframes),f'{study}-keyframes-1x.png')
    report['beforeAfter'].append({'study':study,'sameFrameGeometry':True,'sameActionTiming':True,'frames':len(after)})
    del before,after

report['notes']=['All review pixels originate from actual application downloads.', 'Five-action GIFs are repeating review montages; the player retains one-shot jump/celebrate semantics.', 'GIF durations round cumulative time to centiseconds; native PNG alpha and timing are checked before quantization.', 'Technical checks are not user visual acceptance.']
(OUT.parent/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'packs':len(report['packs']),'gifs':len(report['gifs']),'pngs':len(report['pngs']),'exactDownloadedFrames':len(report['actualDownloadChecks'])}))
