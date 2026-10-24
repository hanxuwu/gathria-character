#!/usr/bin/env python3
"""Decode actual review downloads and independently check panels, metrics and timing."""
import io, json, os, zipfile, hashlib, math, importlib.util
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/os.environ.get('KLING_REVIEW_WORKBENCH_DIR','docs/kling-review-workbench/evidence')
sha=lambda b:hashlib.sha256(b).hexdigest()
spec=importlib.util.spec_from_file_location('prior_export_helpers',ROOT/'scripts/verify-kling-look-workflow.py')
helpers=importlib.util.module_from_spec(spec);spec.loader.exec_module(helpers)
Pack=helpers.Pack

def compact(frame, facing):
    raw=np.asarray(frame,dtype=np.float64)
    alpha=raw[:,:,3:4]/255
    rgb=raw[:,:,:3]*alpha+np.array([238,233,223])*(1-alpha)
    h,w=rgb.shape[:2]
    # Exact 2x2 box recipe, including odd edge dimensions and JS round semantics.
    out=np.zeros(((h+1)//2,(w+1)//2,3),dtype=np.float64)
    count=np.zeros(out.shape[:2],dtype=np.float64)
    for y in range(2):
        for x in range(2):
            tile=rgb[y::2,x::2]
            out[:tile.shape[0],:tile.shape[1]]+=tile
            count[:tile.shape[0],:tile.shape[1]]+=1
    out=np.floor(out/count[:,:,None]+.5).astype(np.uint8)
    return out[:,::-1] if facing=='left' else out

def metrics(a,b,threshold):
    a=np.asarray(a,dtype=np.float64);b=np.asarray(b,dtype=np.float64)
    delta=np.maximum(np.abs(b[:,:,3]-a[:,:,3]),np.max(np.abs(b[:,:,:3]*b[:,:,3:4]-a[:,:,:3]*a[:,:,3:4])/255,axis=2))
    changed=delta>threshold
    ys,xs=np.nonzero(changed)
    bounds=None if not len(xs) else dict(x=int(xs.min()),y=int(ys.min()),width=int(xs.max()-xs.min()+1),height=int(ys.max()-ys.min()+1))
    return dict(changedPixels=int(changed.sum()),totalPixels=int(changed.size),alphaAdded=int(((b[:,:,3]-a[:,:,3])>threshold).sum()),alphaRemoved=int(((a[:,:,3]-b[:,:,3])>threshold).sum()),meanDelta=float(delta.mean()/255),changedBounds=bounds)

def main():
    ep=OUT/'evidence-index.json'; evidence=json.loads(ep.read_text())
    assert evidence['passed'] and len(evidence['playback'])==20
    for k in ['errors','failedRequests','externalRequests','independentEditorRequests']: assert not evidence[k]
    report={'evidenceSha256':sha(ep.read_bytes()),'packs':[],'bundles':[],'gifs':[],'notes':[],'screenshots':[],'contactSheetPreviews':[]}
    packs={}
    for character in ['male','female']:
        packs[character]={name:Pack(ROOT/'docs/kling-look-workflow/evidence'/f'{character}-{name}.character.zip') for name in ['day','wedding']}
    for p in evidence['packs']:
        raw=(ROOT/p['file']).read_bytes();assert sha(raw)==p['sha256']==sha((ROOT/p['baseline']).read_bytes())
        pack=Pack(ROOT/p['file'])
        for fid in pack.frames:
            im=pack.frame(fid); assert im.mode=='RGBA' and im.getchannel('A').getextrema()==(0,255)
        report['packs'].append({'file':p['file'],'poses':len(pack.frames),'exactZipBytesToMergedBaseline':True,'allFramesDecoded':True});pack.close()
    gif_groups={}
    for record in evidence['downloads']:
        p=ROOT/record['file'];raw=p.read_bytes();assert sha(raw)==record['sha256'] and len(raw)==record['bytes']
        kind=record['kind']; character=record.get('character')
        if kind=='review-notes':
            doc=json.loads(raw);assert doc['format']=='gathria-look-review' and doc['version']==1 and len(doc['issues'])==1
            assert len(doc['binding']['lookSha256'])==64
            report['notes'].append({'file':record['file'],'issues':len(doc['issues']),'decoded':True})
        elif kind=='review-bundle':
            a,b=packs[character]['day'],packs[character]['wedding']
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                assert z.testzip() is None
                manifest=json.loads(z.read('manifest.json'));scan=json.loads(z.read('scan.json'));notes=json.loads(z.read('review.json'))
                assert manifest['format']=='gathria-look-review-bundle' and manifest['version']==1
                assert manifest['current']==notes['binding']
                assert manifest['action']==record['action']==scan['action'] and manifest['facing']==record['facing']
                assert len({e['file'] for e in manifest['files']})==len(manifest['files'])
                assert set(z.namelist())=={'manifest.json',*[e['file'] for e in manifest['files']]}
                for entry in manifest['files']:
                    assert not entry['file'].startswith('/') and '..' not in entry['file'].split('/')
                    payload=z.read(entry['file']);assert len(payload)==entry['bytes'] and sha(payload)==entry['sha256']
                clip=b.m['animations'][record['action']]
                assert scan['frameCount']==len(clip['frames']) and scan['uniqueFrameCount']==len(set(clip['frames']))
                assert scan['loop']==clip['loop'] and scan['fps']==clip['fps']
                assert abs(scan['durationMs']-len(clip['frames'])*1000/clip['fps'])<1e-8
                assert [row['frameId'] for row in scan['rows']]==clip['frames']
                assert (scan['seam'] is not None)==clip['loop']
                checked={}; transitions={}
                for position,row in enumerate(scan['rows']):
                    fid=row['frameId'];assert row['position']==position
                    assert abs(row['startMs']-position*1000/clip['fps'])<1e-8
                    if fid not in checked: checked[fid]=metrics(a.frame(fid),b.frame(fid),manifest['threshold'])
                    expected=checked[fid]
                    if position == 0: assert row['temporalDelta'] is None
                    else:
                        pair=(clip['frames'][position-1],fid)
                        if pair not in transitions: transitions[pair]=metrics(b.frame(pair[0]),b.frame(pair[1]),manifest['threshold'])
                        assert abs(row['temporalDelta']-transitions[pair]['meanDelta'])<1e-10
                    for key,value in expected.items():
                        if key=='meanDelta': assert abs(value-row['metrics'][key])<1e-10,(record['file'],fid,key)
                        else: assert value==row['metrics'][key],(record['file'],fid,key,value,row['metrics'][key])
                if scan['seam']:
                    first,last=clip['frames'][0],clip['frames'][-1]
                    seam=metrics(b.frame(last),b.frame(first),manifest['threshold'])
                    assert scan['seam']['fromFrameId']==last and scan['seam']['toFrameId']==first
                    assert abs(scan['seam']['meanDelta']-seam['meanDelta'])<1e-10
                    assert scan['seam']['changedPixels']==seam['changedPixels']
                positions=[]; max_pixel_error=0
                for page in manifest['pages']:
                    with Image.open(io.BytesIO(z.read(page['file']))) as im:
                        im.load();assert im.mode=='RGBA' and im.size==(page['width'],page['height']) and page['scale']==.5
                        native_w=b.m['spritesheet']['frameWidth'];native_h=b.m['spritesheet']['frameHeight']
                        w,h=(native_w+1)//2,(native_h+1)//2
                        assert im.size==(w*2+12,42+len(page['rows'])*(h+32))
                        for index,row in enumerate(page['rows']):
                            positions.extend(range(row['position'],row['endPosition']+1))
                            assert all(clip['frames'][i]==row['frameId'] for i in range(row['position'],row['endPosition']+1))
                            assert abs(row['holdMs']-(row['endPosition']-row['position']+1)*1000/clip['fps'])<1e-8
                            y=42+index*(h+32)+32
                            for offset,pack in [(0,a),(w+12,b)]:
                                actual=np.asarray(im.convert('RGB').crop((offset,y,offset+w,y+h))).astype(np.int16)
                                expected=compact(pack.frame(row['frameId']),record['facing']).astype(np.int16)
                                error=int(np.abs(actual-expected).max());assert error<=1,(page['file'],row['frameId'],error)
                                max_pixel_error=max(max_pixel_error,error)
                assert positions==list(range(len(clip['frames'])))
                first_page=manifest['pages'][0]['file']
                preview=OUT/f"{character}-{record['action']}-{record['facing']}-contact-sheet.png"
                preview_bytes=z.read(first_page)
                if preview.exists(): assert preview.read_bytes()==preview_bytes
                else: preview.write_bytes(preview_bytes)
                report['contactSheetPreviews'].append({'file':str(preview.relative_to(ROOT)),'fromBundle':record['file'],'entry':first_page,'sha256':sha(preview_bytes),'unchangedExtractedBytes':True})
                report['bundles'].append({'file':record['file'],'pages':len(manifest['pages']),'allFileHashesVerified':True,'allPanelPixelsMatchActualPackRecipe':True,'maxRgbRoundingError':max_pixel_error,'allTimelinePositionsCoveredExactlyOnce':True,'metricsIndependentlyRecomputed':True,'loop':clip['loop']})
        elif kind=='comparison-gif':
            a,b=packs[character]['day'],packs[character]['wedding'];clip=b.m['animations'][record['action']]
            w,h=(b.m['spritesheet']['frameWidth']+1)//2,(b.m['spritesheet']['frameHeight']+1)//2
            max_error=0
            with Image.open(p) as gif:
                assert gif.n_frames==len(clip['frames']) and gif.size==(2*w+8,h+16)
                assert (gif.info.get('loop')==0)==clip['loop']
                durations=[]
                for i,fid in enumerate(clip['frames']):
                    gif.seek(i);gif.load();duration=(math.floor((i+1)*100/clip['fps']+.5)-math.floor(i*100/clip['fps']+.5))*10
                    assert gif.info['duration']==duration;durations.append(duration)
                    for offset,pack in [(0,a),(w+8,b)]:
                        expected=compact(pack.frame(fid),record['facing']).astype(np.float64)
                        actual=np.asarray(gif.convert('RGB').crop((offset,16,offset+w,h+16)),dtype=np.float64)
                        error=float(np.abs(actual-expected).mean());assert error<4,(p.name,fid,error);max_error=max(max_error,error)
            report['gifs'].append({'file':record['file'],'frames':len(clip['frames']),'durationsMs':durations,'loop':clip['loop'],'maxMeanQuantizationError':max_error,'bothPanelsMatchActualPacks':True})
            gif_groups.setdefault((character,record['action']),{})[record['facing']]=p
    for group,sides in gif_groups.items():
        with Image.open(sides['right']) as right,Image.open(sides['left']) as left:
            w=(right.width-8)//2
            for i in range(right.n_frames):
                right.seek(i);left.seek(i);a=np.asarray(right.convert('RGB'));b=np.asarray(left.convert('RGB'))
                assert np.array_equal(a[:16],b[:16]),(group,i,'unmirrored label')
                for x in [0,w+8]: assert np.array_equal(a[16:,x:x+w],b[16:,x:x+w][:,::-1]),(group,i,'body mirror')
    for p in OUT.glob('*.png'):
        with Image.open(p) as im:im.load();assert min(im.size)>0
        report['screenshots'].append(str(p.relative_to(ROOT)))
    for pair in packs.values():
        for pack in pair.values():pack.close()
    report['passed']=True
    (OUT.parent/'export-checks.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({key:len(value) for key,value in report.items() if isinstance(value,list)}))
if __name__=='__main__':main()
