#!/usr/bin/env python3
"""Independently decode actual browser paint/motion exports. Never edits artwork."""
import io,json,os,hashlib,zipfile,math,importlib.util
from pathlib import Path
import numpy as np
from PIL import Image,ImageOps,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/os.environ.get('KLING_PAINT_REVIEW_DIR','docs/kling-paint-roundtrip/evidence')
spec=importlib.util.spec_from_file_location('helpers',ROOT/'scripts/verify-kling-look-workflow.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
sha=lambda b:hashlib.sha256(b).hexdigest()
def decoded(data):
    with Image.open(io.BytesIO(data)) as im: im.load();return im.convert('RGBA')
def motion(a,b,c,d,threshold):
    def premult(im):
        x=np.asarray(im,dtype=np.float64);x[...,:3]*=x[...,3,None]/255;return x
    aa,bb,cc,dd=map(premult,[a,b,c,d]);delta=np.max(np.abs((dd-cc)-(bb-aa)),axis=2)
    return {'changedPixels':int((delta>threshold).sum()),'meanDelta':float(delta.mean()/510),'maxDelta':float(delta.max()/510)}
def check_gif(raw,a,b,action,facing):
    clip=b.m['animations'][action];w,hh=math.ceil(b.m['spritesheet']['frameWidth']/2),math.ceil(b.m['spritesheet']['frameHeight']/2);errs=[];times=[]
    with Image.open(io.BytesIO(raw)) as gif:
        assert gif.n_frames==len(clip['frames']);assert (gif.info.get('loop')==0)==clip['loop'];assert gif.size==(2*w+8,hh+16)
        for i,fid in enumerate(clip['frames']):
            gif.seek(i);gif.load();t=(math.floor((i+1)*100/clip['fps']+.5)-math.floor(i*100/clip['fps']+.5))*10;assert gif.info['duration']==t;times.append(t)
            for x,pack in [(0,a),(w+8,b)]:
                expected=h.matte(pack.frame(fid),(238,233,223)).resize((w,hh),Image.Resampling.BOX)
                if facing=='left':expected=ImageOps.mirror(expected)
                actual=gif.convert('RGB').crop((x,16,x+w,16+hh));err=float(np.abs(np.array(actual,dtype=float)-np.array(expected,dtype=float)).mean());assert err<4,err;errs.append(err)
    return {'frames':len(times),'durationsMs':times,'loop':clip['loop'],'maxMeanPaletteError':max(errs),'panelsMatchActualPacks':True}
def mirror_gifs(left,right):
    with Image.open(io.BytesIO(left)) as l,Image.open(io.BytesIO(right)) as r:
        assert l.n_frames==r.n_frames;w=(l.width-8)//2
        for i in range(l.n_frames):
            l.seek(i);r.seek(i);a,b=np.array(l.convert('RGB')),np.array(r.convert('RGB'));assert np.array_equal(a[:16],b[:16])
            for x in [0,w+8]:assert np.array_equal(a[16:,x:x+w][:,::-1],b[16:,x:x+w])
def main():
    e=json.loads((OUT/'capture.json').read_text());assert e['passed'];assert len(e['cases'])==4 and len(e['playback'])==40
    for k in ['errors','failedRequests','externalRequests','independentEditorRequests']:assert not e[k]
    for f,digest in e['sourceHashes'].items():assert sha((ROOT/f).read_bytes())==digest,(f,'implementation changed')
    result={'captureSha256':sha((OUT/'capture.json').read_bytes()),'sourceHashesExact':True,'cases':[],'gifs':[],'bundles':[],'projects':[],'pngs':[],'screenshots':[]}
    for r in e['downloads']:
        data=(ROOT/r['file']).read_bytes();assert data and len(data)==r['bytes'] and sha(data)==r['sha256'],r['file']
        if r['file'].endswith('.zip'):h.nested_zip(data)
    review=OUT.parent/'review';review.mkdir(exist_ok=True)
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',17)
    for c in e['cases']:
        key=c['key'];print('Checking',key,flush=True)
        records=[r for r in e['downloads'] if r['key']==key]
        packs={r['stage']:h.Pack(ROOT/r['file']) for r in records if r['kind']=='pack'};a,b=packs['before'],packs['after']
        for field in ['animations','frames','anchor','facing','spritesheet','additionalSheets']:assert a.m.get(field)==b.m.get(field)
        changes=[]
        for fid in a.frames:
            before,after=a.frame(fid),b.frame(fid);aa,bb=np.array(before),np.array(after)
            assert before.mode==after.mode=='RGBA' and before.getchannel('A').getextrema()==after.getchannel('A').getextrema()==(0,255)
            assert np.array_equal(aa[...,3],bb[...,3]);mask=np.any(aa!=bb,axis=2)
            if mask.any():changes.append({'frameId':fid,'pixels':int(mask.sum())})
        expected={r['frameId']:r['changedPixels'] for r in c['replay']['changes'] if r['changedPixels']}
        assert {r['frameId']:r['pixels'] for r in changes}==expected,(key,changes,expected)
        audit=json.loads((OUT/f'{key}-paint-report.json').read_text());assert {p['frameId']:p['changedPixels'] for p in audit['poses'] if p['changedPixels']}==expected
        assert audit['output']['sha256']==sha((OUT/f'{key}.garment.zip').read_bytes())
        assert audit['inputSha256']==c['paintedInputSha256']
        project_record=next(r for r in records if r['kind']=='project')
        with zipfile.ZipFile(ROOT/project_record['file']) as z:
            document=json.loads(z.read('document.json'));assert sha(z.read('source.character.zip'))==document['sourceSha256'];assert sha(z.read('registration.json'))==document['registrationSha256']
            selected=[i for i,x in enumerate(document['items']) if x['id']==c['newId']];assert len(selected)==1
            assert z.read(f'item-{selected[0]}.zip')==(OUT/f'{key}.garment.zip').read_bytes()
            for i,item in enumerate(document['items']):assert sha(z.read(f'item-{i}.zip'))==item['sha256']
        result['projects'].append({'key':key,'savedMaterialExact':True,'nestedFilesDecoded':True})
        groups={}
        for r in records:
            data=(ROOT/r['file']).read_bytes()
            if r['kind']=='frame':
                im=decoded(data);assert im.tobytes()==b.frame(r['frameId']).tobytes();result['pngs'].append({'file':r['file'],'exactToPack':True})
            if r['kind']=='comparison-gif':
                check=check_gif(data,a,b,r['action'],r['facing']);result['gifs'].append({'file':r['file'],**check});groups.setdefault(r['action'],{})[r['facing']]=data
                (review/Path(r['file']).name).write_bytes(data)
            if r['kind']=='motion-bundle':
                with zipfile.ZipFile(io.BytesIO(data)) as z:
                    assert z.testzip() is None;manifest=json.loads(z.read('manifest.json'));scan=json.loads(z.read('motion.json'))
                    assert manifest['reference']['lookSha256']!=manifest['current']['lookSha256'];assert manifest['reference']['sourceSha256']==manifest['current']['sourceSha256']==document['sourceSha256']
                    for entry in manifest['files']:
                        content=z.read(entry['file']);assert len(content)==entry['bytes'] and sha(content)==entry['sha256']
                    clip=b.m['animations'][r['action']];assert scan['fps']==clip['fps'] and scan['frameCount']==len(clip['frames']) and scan['durationMs']==len(clip['frames'])*1000/clip['fps']
                    expected_count=len(clip['frames']) if clip['loop'] else len(clip['frames'])-1;assert len(scan['edges'])==expected_count
                    for index,edge in enumerate(scan['edges']):
                        to=(index+1)%len(clip['frames']);assert edge['fromPosition']==index and edge['toPosition']==to
                        assert edge['fromFrameId']==clip['frames'][index] and edge['toFrameId']==clip['frames'][to]
                        assert edge['loopClosure']==(to==0) and edge['hold']==(edge['fromFrameId']==edge['toFrameId'])
                        if r['facing']=='right':
                            measured=motion(a.frame(edge['fromFrameId']),a.frame(edge['toFrameId']),b.frame(edge['fromFrameId']),b.frame(edge['toFrameId']),scan['threshold'])
                            assert measured['changedPixels']==edge['residual']['changedPixels']
                            for field in ['meanDelta','maxDelta']:assert abs(measured[field]-edge['residual'][field])<1e-10,(field,measured,edge['residual'])
                    for image in manifest['pictures']:
                        expected_image=(a if image['look']=='reference' else b).frame(image['frameId'])
                        if r['facing']=='left':expected_image=ImageOps.mirror(expected_image)
                        actual=decoded(z.read(image['file']));assert actual.tobytes()==expected_image.tobytes();result['pngs'].append({'file':r['file']+'!'+image['file'],'exactToPack':True})
                    gif=z.read('action-comparison.gif');check=check_gif(gif,a,b,r['action'],r['facing']);result['gifs'].append({'file':r['file']+'!action-comparison.gif',**check});groups.setdefault(r['action'],{})[r['facing']]=gif
                    (review/f'{key}-run-{r["facing"]}-comparison.gif').write_bytes(gif)
                    result['bundles'].append({'file':r['file'],'hashedEntriesExact':True,'nativePngPixelsExact':True,'transitionMathIndependentlyVerified':r['facing']=='right','edges':len(scan['edges'])})
        for sides in groups.values():mirror_gifs(sides['left'],sides['right'])
        # Full run timeline at the GIF's unchanged 0.5-native size, current panel only.
        with Image.open(io.BytesIO(groups['run']['right'])) as gif:
            w=(gif.width-8)//2;hh=gif.height-16;columns=4;rows=math.ceil(gif.n_frames/columns)
            sheet=Image.new('RGB',(columns*w,rows*(hh+28)),(238,233,223));draw=ImageDraw.Draw(sheet)
            for i,fid in enumerate(b.m['animations']['run']['frames']):
                gif.seek(i);x=(i%columns)*w;y=(i//columns)*(hh+28)
                sheet.paste(gif.convert('RGB').crop((w+8,16,2*w+8,16+hh)),(x,y+28));draw.text((x+8,y+5),f'#{i+1} pose {fid}',font=font,fill=(42,65,58))
            sheet.save(review/f'{key}-run-keyframes.png')
        # Native same-pose board; transparent source images composited only for presentation.
        fid=c['frameId'];left,right=a.frame(fid),b.frame(fid);w,hh=left.size
        board=Image.new('RGB',(w*2+16,hh+40),(238,234,223));d=ImageDraw.Draw(board)
        for x,label,im in [(0,'Base',left),(w+16,'Browser round-trip',right)]:board.paste(h.matte(im,(238,234,223)),(x,40));d.text((x+8,10),f'{key} / {label} / pose {fid} / native 1x',font=font,fill=(42,65,58))
        board.save(review/f'{key}-native-comparison.png')
        if c['donor']:
            # Same crop at integer zoom, no painting.
            rect=(300+32,630+128,430+32,720+128);size=((rect[2]-rect[0])*3,(rect[3]-rect[1])*3)
            detail=Image.new('RGB',(size[0]*2+16,size[1]+40),(238,234,223));d=ImageDraw.Draw(detail)
            for n,(label,im) in enumerate([('Base V8',left),('Browser replay of V9 repair',right)]):detail.paste(h.matte(im.crop(rect),(238,234,223)).resize(size,Image.Resampling.NEAREST),(n*(size[0]+16),40));d.text((n*(size[0]+16)+8,10),label,font=font,fill=(42,65,58))
            detail.save(review/f'{key}-detail-3x.png')
        result['cases'].append({'key':key,'posesDecoded':len(a.frames)*2,'changedFrames':changes,'allAlphaExact':True,'unmodifiedPosesExact':len(a.frames)-len(changes),'anchorsTimingLayoutExact':True,'leftRightGifPixelsMirroredExactly':True,'importMs':c['importMs'],'scanTimes':c['scans']})
        for pack in packs.values():pack.close()
    for p in OUT.glob('*.png'):
        with Image.open(p) as im:im.load();assert min(im.size)>0
        if p.name.endswith(('-candidate.png','-motion.png','-mobile.png','-independent.png')):result['screenshots'].append(str(p.relative_to(ROOT)))
    result['presentationFiles']=[]
    for p in review.iterdir():
        with Image.open(p) as im:
            for i in range(getattr(im,'n_frames',1)):im.seek(i);im.load()
        result['presentationFiles'].append({'file':str(p.relative_to(ROOT)),'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size})
    result['passed']=True;(OUT.parent/'validation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:len(v) for k,v in result.items() if isinstance(v,list)}))
if __name__=='__main__':main()
