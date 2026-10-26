#!/usr/bin/env python3
"""Independent Pillow/NumPy audit of real clothing-authoring UI downloads.

No application renderer is imported. Retain the frozen build and temporary
wardrobe projects until this audit finishes. Diagnostic reports are measurements
of sampled positions, never automatic visual approval.
"""
from __future__ import annotations
import argparse
import gc
import importlib.util
import io
import json
import math
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
HELPER=ROOT/'scripts/verify-kling-mask-workbench.py'
spec=importlib.util.spec_from_file_location('authoring_independent_masks',HELPER)
mask=importlib.util.module_from_spec(spec);spec.loader.exec_module(mask)
prior=mask.prior
Archive,require,sha,file_sha,rgba=prior.Archive,prior.require,prior.sha,prior.file_sha,prior.rgba
PROFILE=ROOT/'artwork/kling-mask-workbench/female-neckline-cloth-v1.json'
PROFILE_SHA='9a24590ab1434480c822a577379de7d92479ee1871e44e11d688ab9ef1d5185c'
ACTIONS=['idle','walk','run','jump','celebrate']


def native_cloth(item,fid):
    m=item.manifest;image=np.zeros((m['frameHeight'],m['frameWidth'],4),np.uint8)
    owned=np.zeros(image.shape[:2],bool);f=item.frames[fid];p,o=item.paint(f)
    x,y=f['offset']['x'],f['offset']['y'];image[y:y+p.shape[0],x:x+p.shape[1]]=p
    owned[y:y+p.shape[0],x:x+p.shape[1]]=o
    return image,owned


def material_pixels(patch,owned,rule):
    """Independent vector implementation of the documented chromatic-ratio rule."""
    src=np.array(rule['sourceRgb'],np.float64);target=np.array(rule['targetRgb'],np.float64)
    rgb=patch[:,:,:3].astype(np.float64);mean=np.maximum(1,rgb.mean(axis=2))
    delta=rgb/mean[:,:,None]-src/src.mean()
    distance=np.sqrt((delta*delta).sum(axis=2))
    tol=rule['tolerance']
    weight=np.clip((tol-distance)/(tol*.35),0,1)*np.clip((mean-28)/42,0,1)
    weight*=owned&(patch[:,:,3]>0)
    result=patch.copy()
    mapped=np.clip(rgb*target/src,0,255)
    result[:,:,:3]=np.rint(rgb*(1-weight[:,:,None])+mapped*weight[:,:,None]).astype(np.uint8)
    return result


def color_chunks(data):
    chunks=[];at=8
    while at+12<=len(data):
        length=int.from_bytes(data[at:at+4],'big');kind=data[at+4:at+8]
        require(at+12+length<=len(data),'PNG chunk escaped file')
        if kind in [b'cHRM',b'gAMA',b'iCCP',b'sRGB',b'sBIT']:
            chunks.append((kind,data[at+8:at+8+length]))
        at+=12+length
    return chunks


class Project(mask.Project):
    def __init__(self,path,profile):
        super().__init__(path,profile)
        self.bank=None
        if 'appearance.zip' in self.zip.namelist():
            raw=self.zip.read('appearance.zip')
            require(sha(raw)==self.doc['appearance']['bankSha256'],'Saved appearance hash mismatch')
            self.bank=Archive(raw)
            require(self.bank.manifest['sourceSha256']==self.doc['sourceSha256'] and self.bank.manifest['registrationSha256']==self.doc['registrationSha256'],'Appearance source binding changed')
            self.poses={p['frameId']:p for p in self.bank.manifest['poses']}

    def look(self,fid,selection=None,appearance=None):
        dressed=self.render(fid,selection)
        if not appearance or not (appearance.get('hairId') or appearance.get('faceId')):
            return dressed
        require(self.bank is not None,'Requested appearance is not embedded')
        original=self.source.frame(fid);h,w=original.shape[:2];padding=self.bank.manifest['padding']
        output=np.zeros((h+padding['top']+padding['bottom'],w+padding['left']+padding['right'],4),np.uint8)
        output[padding['top']:padding['top']+h,padding['left']:padding['left']+w]=dressed
        pose=self.poses[fid]
        styles=[s for s in self.bank.manifest['styles'] if s['id'] in (appearance['hairId'],appearance['faceId'])]
        layers=sorted((l for s in styles for l in s['layers']),key=lambda l:['hair-back','face','hair-front'].index(l['role']))
        for layer in layers:
            f=next(f for f in layer['frames'] if f['frameId']==fid)
            if f['mode']=='source':continue
            patch,owned=self.bank.paint(f);hh,ww=owned.shape;x,y=f['offset']['x'],f['offset']['y']
            xx,yy=np.meshgrid(np.arange(x,x+ww)+.5,np.arange(y,y+hh)+.5)
            native=(xx>=0)&(yy>=0)&(xx<w)&(yy<h)
            sx,sy=np.clip(xx.astype(int),0,w-1),np.clip(yy.astype(int),0,h-1)
            alpha=np.where(native,original[sy,sx,3],0)
            foreground=(alpha>0)&prior.inside_polygons(pose['foreground']+[r['polygon'] for r in self.registration[fid]['protected'] if r['label']!='head'],xx,yy)
            ox,oy=x+padding['left'],y+padding['top'];target=output[oy:oy+hh,ox:ox+ww]
            require(target.shape==patch.shape,'Appearance escaped declared padding')
            if layer['role']=='face':
                legal=prior.inside_rect(pose['headBounds'],xx,yy)&prior.inside_polygons([pose['facePolygon']],xx,yy)&(alpha>0)&~foreground
                require(not np.any(owned&~legal),'Face ownership outside source face')
                require(np.array_equal(patch[:,:,3][owned],alpha[owned]),'Face changes source alpha')
                target[owned]=patch[owned];continue
            require(not np.any(owned&~prior.inside_rect(pose['hairBounds'],xx,yy)),'Hair escaped registered bounds')
            if layer['role']=='hair-front':
                occlusion=prior.inside_rect(pose.get('hairOcclusionBounds',pose['headBounds']),xx,yy)
                owned=owned&~foreground&~((~occlusion)&native&((alpha>0)|(dressed[sy,sx,3]>0)))
            back=layer['role']=='hair-back';owned=owned&(patch[:,:,3]>0)
            if back:owned&=target[:,:,3]<255
            s,d=patch[owned].astype(np.float64),target[owned].astype(np.float64)
            a,b=s[:,3:4]/255,d[:,3:4]/255
            sw,dw=(a*(1-b),b) if back else (a,b*(1-a));total=sw+dw
            factors={'chestnut':[1,1,1],'espresso':[.63,.65,.69],'copper':[1.2,1.05,.83]}[appearance['hairColor']]
            color=np.minimum(255,np.floor(s[:,:3]*factors+.5))
            target[owned]=np.concatenate((np.floor((color*sw+d[:,:3]*dw)/total+.5),np.floor(total*255+.5)),axis=1).astype(np.uint8)
        return output


def artifact_checks(e,index,report):
    require(e.get('passed') and e.get('finishedAt') and e.get('production'),'Production capture incomplete')
    require(e['format']=='gathria-authoring-lab-browser-evidence','Wrong evidence format')
    for key,n in [('matrix',2),('gifs',8),('projects',2),('packs',2),('playback',20),('screenshots',6),('authoring',2),('checks',2)]:
        require(len(e[key])==n,f'Expected {n} {key}')
    require(sum(d['kind']=='png' for d in e['downloads'])==4,'Expected four native PNG downloads')
    for key in ('errors','consoleErrors','failedRequests','externalRequests','independentEditorRequests'):
        require(not e[key],f'Browser failures in {key}')
    require(all(r['actualUiDownload'] for r in e['downloads']) and all(not r['actualUiDownload'] for r in e['screenshots']),'Actual downloads and UI screenshots mislabeled')
    require(e['editorsClosedAt'] and all(p['reopenedAt']<e['editorsClosedAt'] for p in e['packs']),'Player was not independent of editor')
    cache={};records=e['downloads']+e['screenshots'];require(len({r['file'] for r in records})==len(records),'Duplicate artifact path')
    for row in records:
        path=ROOT/row['file'];require(path.stat().st_size==row['bytes'] and file_sha(path)==row['sha256'],f'Artifact changed: {path}')
        out={k:row[k] for k in ['file','kind','bytes','sha256']}
        if path.suffix=='.zip':out['archive']=prior.scan_zip(path.read_bytes(),row['file'],cache)
        elif path.suffix=='.png':
            with Image.open(path) as im:im.load();out.update(width=im.width,height=im.height,mode=im.mode)
        elif path.suffix=='.gif':
            frames,delays,loop=prior.read_gif(path);out.update(frames=len(frames),delaysMs=delays,loop=loop);del frames
        elif path.suffix=='.json':json.loads(path.read_bytes());out['jsonDecoded']=True
        else:raise AssertionError(f'Unknown artifact {path}')
        report['artifacts'].append(out)
    bound={**e['inputs'],**e['compiledJsSha256'],'dist/workbench.html':e['productionHtmlSha256'],'dist/player.html':e['playerHtmlSha256'],'docs/kling-wardrobe/catalog.json':e['catalogSha256'],str((index.parent/'capture-script.mjs').relative_to(ROOT)):e['scriptSha256']}
    for path,digest in bound.items():require(file_sha(ROOT/path)==digest,f'Captured input/build changed: {path}')
    require(len(e['catalogResponses'])==2 and all(r['sha256']==e['catalogSha256'] for r in e['catalogResponses']),'Actual catalog mismatch')
    require(e['scriptRequests'] and all(r['compiledSha256'] in e['compiledJsSha256'].values() for r in e['scriptRequests']),'Unbound runtime script')
    require(e['used']['retained']<=e['budgets']['retained'] and e['used']['temporary']<=e['budgets']['temporary'],'Capture exceeded declared disk budgets')
    report['capturedInputsAndBuild']=bound


def supplemental_checks(e,report):
    """Verify the immutable failed real-time attempt and bounded follow-up.

    A cumulative follow-up is not relabeled as the original playback run.
    """
    require(e.get('kind')=='combined-delivery-index','Expected explicitly combined delivery')
    origin=e['captureOrigin'];raw=(ROOT/origin['file']).read_bytes();original=json.loads(raw)
    require(sha(raw)==origin['sha256'] and original['passed'] is False and origin['strictPassed'] is False,'Raw failed capture was altered or hidden')
    require(original['failure']==origin['failure']==e['originalCaptureFailure'] and 'report.playback.every' in original['failure'],'Unexpected original failure')
    bad=[p for p in original['playback'] if p['missingPositions']]
    require(len(bad)==1 and (bad[0]['key'],bad[0]['action'],bad[0]['facing'],bad[0]['missingPositions'])==('female','jump','left',[3]),'Unexpected original coverage gap')
    ref=e['playbackSupplement'];data=(ROOT/ref['file']).read_bytes();s=json.loads(data)
    require(sha(data)==ref['sha256'],'Supplement altered')
    diagnostic=e['supplementConsoleDiagnostic'];diag_raw=(ROOT/diagnostic['file']).read_bytes();diag=json.loads(diag_raw)
    require(sha(diag_raw)==diagnostic['sha256'] and diag['playerHtmlSha256']==e['playerHtmlSha256'],'Console diagnostic bound to different player')
    require(s['passed'] is False and len(s['errors'])==1 and len(diag['events'])==1,'Unexpected supplemental error disposition')
    require(diag['events'][0]['type']=='console' and diag['events'][0]['text']==s['errors'][0]=='Failed to load resource: the server responded with a status of 404 (Not Found)' and diag['events'][0]['location']['url']=='http://127.0.0.1:5241/favicon.ico','Supplement error is not the independently identified optional favicon')
    require(s['original']['sha256']==origin['sha256'] and s['original']['missingCase']==bad[0],'Supplement references another attempt')
    require(file_sha(ROOT/s['script']['file'])==s['script']['sha256'],'Supplement helper changed after capture')
    require(s['compiledJsSha256']==e['compiledJsSha256'] and s['playerHtmlSha256']==e['playerHtmlSha256'],'Supplement used another build')
    pack=next(p for p in e['packs'] if p['key']=='female')
    require(s['pack']=={k:pack[k] for k in ['file','sha256']},'Supplement used another pack')
    require(len(s['attempts'])==3 and s['cumulativeMissingPositions']==[],'Bounded follow-up did not cover schedule')
    require(all(u.startswith('http://127.0.0.1:5241/') and 'workbench' not in u for u in s['requests']),'Supplement was not an independent local player')
    scrub=s['scrub'];require((scrub['action'],scrub['position'],scrub['frameId'],scrub['facing'],scrub['zoom'])==('jump',3,pack['manifest']['animations']['jump']['frames'][3],'left',1),'Missing source position not scrubbed exactly')
    require(scrub['comparedOpaquePixels']>10000 and scrub['differingOpaquePixels']==0,'Actual scrub artwork differs from decoded pack')
    clip=pack['manifest']['animations']['jump'];union=set()
    for a in s['attempts']:
        for o in a['observed']:require(o['frameId']==pack['manifest']['animations'][o['action']]['frames'][o['position']],'Supplement source frame ID changed')
        seen={o['position'] for o in a['observed'] if o['action']=='jump'};union|=seen
        require(a['missingPositions']==[i for i in range(len(clip['frames'])) if i not in seen],'Supplement per-play omission not disclosed')
        require(a['returnedToIdle'] and any(o['action']=='idle' for o in a['observed']),'Supplement one-shot failed to return idle')
    require(union==set(range(len(clip['frames']))),'Cumulative coverage incomplete')
    fields={'kind','captureOrigin','playbackSupplement','supplementConsoleDiagnostic','passed','originalCaptureFailure','failure','combinedAt','playback'}
    require({k:v for k,v in e.items() if k not in fields}=={k:v for k,v in original.items() if k not in fields},'Combined delivery changed original artifacts or checks')
    for old,new in zip(original['playback'],e['playback']):
        if old['missingPositions']:
            expected={**old,'observed':[o for a in s['attempts'] for o in a['observed']],'durationMs':sum(a['durationMs'] for a in s['attempts']),'missingPositions':[],'coverageBasis':'union of three supplemental real-time plays; original real-time attempt retained in captureOrigin','supplementalAttempts':3}
            require(new==expected,'Combined follow-up row lacks exact attempt provenance')
        else:require(new==old,'Combined delivery changed a successful original playback')
    report['deliveryProvenance']={'rawCapture':origin,'supplement':ref,'supplementScript':s['script'],'supplementConsoleDiagnostic':diagnostic,'originalRealtimeCases':20,'originalCasesWithCompleteObservedCoverage':19,'originalMissingCase':{'key':'female','action':'jump','facing':'left','missingPositions':[3]},'supplementalPlays':3,'supplementalEachPlayMissing':[a['missingPositions'] for a in s['attempts']],'nativeScrub':scrub,'cumulativeCoverageComplete':True,'originalCaptureStrictPassed':False}


def garment_checks(e,row,p,report):
    key=row['key'];base=Archive(ROOT/row['baseFile']);new=Archive(ROOT/row['garment']['file'])
    built=json.loads((ROOT/row['report']['file']).read_bytes())
    require(built['algorithm']=='owned-chromatic-ratio-v1' and built['format']=='gathria-garment-authoring' and built['version']==1,'Unsupported creation report')
    require(built['base']['sha256']==row['baseSha256']==file_sha(ROOT/row['baseFile']),'Base bytes changed')
    require(built['output']['sha256']==file_sha(ROOT/row['garment']['file'])==p.item_hashes[built['output']['id']],'New garment bytes mismatch')
    require(built['sourceSha256']==p.doc['sourceSha256'] and built['registrationSha256']==p.doc['registrationSha256'],'Authoring source binding changed')
    for k in base.manifest:
        if k not in ('id','name','provenance'):require(new.manifest[k]==base.manifest[k],f'{key}: geometry/ownership metadata changed {k}')
    require(set(base.manifest)==set(new.manifest),'Unexpected garment fields')
    changes=0
    for spec in base.manifest['pages']:
        require(base.zip.read(spec['maskFile'])==new.zip.read(spec['maskFile']),'Ownership PNG bytes changed')
        require(color_chunks(base.zip.read(spec['file']))==color_chunks(new.zip.read(spec['file'])),'Material changed PNG color profile')
        a=rgba(base.zip.read(spec['file']));b=rgba(new.zip.read(spec['file']));o=rgba(base.zip.read(spec['maskFile']))[:,:,3]==255
        expected=material_pixels(a,o,built['configuration']['material'])
        require(np.array_equal(b,expected),f'{key}: independent material transform differs on {spec["file"]}')
        require(np.array_equal(a[:,:,3],b[:,:,3]),'Material changed atlas alpha')
        require(np.array_equal(a[~o],b[~o]),'Material changed unowned pixels')
        changes+=int(np.any(a!=b,axis=2).sum())
    require(changes==built['changedAtlasPixels']>0,'Unique atlas change count mismatch')
    for measured in built['poses']:
        fid=measured['frameId'];a,o=native_cloth(base,fid);b,oo=native_cloth(new,fid)
        require(np.array_equal(o,oo),'Native ownership changed')
        require(sha(a.tobytes())==measured['beforeRgbaSha256'] and sha(b.tobytes())==measured['afterRgbaSha256'],'Per-pose raw clothing hash mismatch')
        require(int(np.any(a!=b,axis=2).sum())==measured['changedPixels'],'Per-pose material count mismatch')
    sample=row['sample'];a,o=native_cloth(base,sample['frameId']);x,y=sample['x'],sample['y']
    require(o[y,x] and a[y,x,3]>0 and a[y,x,:3].tolist()==sample['rgb']==built['configuration']['material']['sourceRgb'],'Actual sampled cloth color mismatch')
    with zipfile.ZipFile(ROOT/row['draft']['file']) as z:
        design=json.loads(z.read('design.json'))
        require(sha(z.read('base.garment.zip'))==built['base']['sha256'],'Draft base differs')
        require(sha(z.read('reference.png'))==built['reference']['sha256']==row['reference']['sha256'],'Reference provenance differs')
        require(design['configuration']==built['configuration'] and design['review']['outputSha256']==built['output']['sha256'],'Draft does not reproduce actual output')
        require(design['sourceSha256']==p.doc['sourceSha256'] and design['registrationSha256']==p.doc['registrationSha256'],'Draft source binding changed')
        require(design['review']['poses']==[{k:r[k] for k in ('frameId','decision','note')} for r in built['hardPoses']],'Reviewed output decisions changed')
        require(all(r['decision']=='accepted' and 'not user visual approval' in r['note'] for r in built['hardPoses']),'Scripted workflow decisions mislabeled as user acceptance')
    require(row['draftReopenExact'] and row['explicitApply'],'Authoring save/reopen/apply missing')
    p.items[base.manifest['id']]=base
    report['authoring'].append({'key':key,'baseSha256':row['baseSha256'],'outputSha256':built['output']['sha256'],'sourceRgb':sample['rgb'],'targetRgb':built['configuration']['material']['targetRgb'],'sample':sample,'exactAtlasTransform':True,'ownershipBytesExact':True,'alphaExact':True,'changedAtlasPixels':changes,'verifiedNativePoses':len(built['poses']),'draftOutputAndReviewExact':True})
    return base,new,built


def frame_checks(e,key,p,pack,base,built,report):
    src=p.source.manifest;m=pack.manifest
    for k in ['animations','anchor','facing','scale']:require(m[k]==src[k],f'{key}: source {k} changed')
    require([f['id'] for f in m['frames']]==[f['id'] for f in src['frames']],'Source IDs/order changed')
    require((m['spritesheet']['frameWidth'],m['spritesheet']['frameHeight'])==(src['spritesheet']['frameWidth'],src['spritesheet']['frameHeight']),'Source frame size changed')
    scfg=json.loads(p.source.zip.read(src['configuration']));cfg=json.loads(pack.zip.read(m['configuration']))
    require(cfg['source']==scfg['source'] and cfg['derivation']['frames']==scfg['derivation']['frames'],'Source time/frame provenance changed')
    require(cfg['sourceMetadata']['wardrobe']['selection']==p.doc['selection'],'Exported selection mismatch')
    baseline={**p.doc['selection'],'top':base.manifest['id']}
    for f in src['frames']:
        fid=f['id'];actual=pack.frame(fid);expected=p.render(fid);before=p.render(fid,baseline);original=p.source.frame(fid)
        require(np.array_equal(actual,expected),f'{key}/{fid}: independent pack reconstruction differs')
        require(np.array_equal(actual[:,:,3],before[:,:,3]),f'{key}/{fid}: material changed composed alpha')
        _,allowed=native_cloth(base,fid);changed=np.any(actual!=before,axis=2)
        require(not np.any(changed&~allowed),'Material changed pixels outside original garment ownership')
        yy,xx=np.indices(actual.shape[:2]);head=np.zeros(actual.shape[:2],bool);hands=np.zeros_like(head)
        for region in p.registration[fid]['protected']:
            target=head if region['label']=='head' else hands;target|=prior.inside_polygons([region['polygon']],xx+.5,yy+.5)
        permission=p.permission.get(fid,np.zeros_like(head)) if base.manifest.get('necklinePermissionProfile') else np.zeros_like(head)
        require(not np.any(changed&(hands|(head&~permission))),'Material changed protected head or hands')
        report['frames'].append({'key':key,'frameId':fid,'rgbaSha256':sha(actual.tobytes()),'changedMaterialPixels':int(changed.sum()),'independentCompositionExact':True,'materialAlphaExact':True,'outsideTemplateOwnershipExact':True,'protectedSourceExceptExplicitClothExact':True})
    for row in next(r for r in e['matrix'] if r['key']==key)['pngs']:
        expected=p.render(row['frameId'],baseline if row['stage']=='before' else p.doc['selection'])
        require(np.array_equal(rgba((ROOT/row['file']).read_bytes()),expected),'Actual native PNG differs from independent composition')
        report['pngs'].append({'key':key,'file':row['file'],'stage':row['stage'],'independentCompositionExact':True})
    ids={fid for action in ['run','jump'] for fid in src['animations'][action]['frames']};frames={fid:p.render(fid) for fid in ids}
    for row in (r for r in e['gifs'] if r['key']==key):report['gifs'].append(prior.gif_audit(row,frames,src))
    del frames;gc.collect()
    for action in ['run','jump']:
        rows=[next(r for r in e['gifs'] if (r['key'],r['action'],r['facing'])==(key,action,face)) for face in ['right','left']]
        right,rd,rl=prior.read_gif(ROOT/rows[0]['file']);left,ld,ll=prior.read_gif(ROOT/rows[1]['file'])
        require(rd==ld and rl==ll and len(right)==len(left) and all(np.array_equal(a[:,::-1],b) for a,b in zip(right,left)),'GIF mirror/order/timing differs')
        report['mirrors'].append({'key':key,'action':action,'decodedMirrorExact':True});del right,left;gc.collect()


def js_hash(value):
    return sha(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode())


def look_binding(p,selection,appearance):
    clothing=[]
    for slot in ['top','bottom','fullBody','shoes']:
        name=selection[slot]
        clothing.append([slot,None] if name is None else [slot,name,p.item_hashes[name]])
    active=None
    if appearance['hairId'] is not None or appearance['faceId'] is not None:
        active={'bankSha256':p.doc['appearance']['bankSha256'],'hairId':appearance['hairId'],'faceId':appearance['faceId'],'hairColor':None if appearance['hairId'] is None else appearance['hairColor']}
    value={'version':1,'sourceSha256':p.doc['sourceSha256'],'registrationSha256':p.doc['registrationSha256'],'clothing':clothing,'appearance':active}
    return {'sourceSha256':value['sourceSha256'],'registrationSha256':value['registrationSha256'],'lookSha256':js_hash(value)}


def metric(a,b):
    aa=a[:,:,3].astype(np.float64);ba=b[:,:,3].astype(np.float64)
    rgb=np.abs(b[:,:,:3].astype(np.float64)*ba[:,:,None]-a[:,:,:3].astype(np.float64)*aa[:,:,None])/255
    delta=np.maximum(np.abs(ba-aa),rgb.max(axis=2));changed=delta>8
    yy,xx=np.where(changed)
    return {'changedPixels':int(changed.sum()),'totalPixels':int(changed.size),'alphaAdded':int(((ba-aa)>8).sum()),'alphaRemoved':int(((aa-ba)>8).sum()),'meanDelta':float(delta.sum()/(changed.size*255)),'changedBounds':None if not len(xx) else {'x':int(xx.min()),'y':int(yy.min()),'width':int(xx.max()-xx.min()+1),'height':int(yy.max()-yy.min()+1)}}


def close_measurements(actual,expected,label):
    require(actual.keys()==expected.keys(),f'{label}: measurement fields differ')
    for key,value in expected.items():
        if isinstance(value,float):require(math.isclose(actual[key],value,rel_tol=2e-10,abs_tol=2e-12),f'{label}/{key}: measurement differs')
        else:require(actual[key]==value,f'{label}/{key}: measurement differs')


def premultiplied(frame):
    a=frame.astype(np.float64);a[:,:,:3]=a[:,:,:3]*a[:,:,3:4]/255;return a


def motion_metric(r0,r1,c0,c1):
    delta=np.max(np.abs((premultiplied(c1)-premultiplied(c0))-(premultiplied(r1)-premultiplied(r0))),axis=2)
    return {'reference':metric(r0,r1),'current':metric(c0,c1),'residual':{'changedPixels':int((delta>8).sum()),'meanDelta':float(delta.sum()/(delta.size*510)),'maxDelta':float(delta.max()/510)}}


def combination_checks(e,key,p,report):
    record=next(r for r in e['checks'] if r['key']==key)
    scan=json.loads((ROOT/record['scan']['file']).read_bytes());reviewed=json.loads((ROOT/record['reviewed']['file']).read_bytes())
    plan=scan['plan'];require(plan==reviewed['plan'],'Reopened review changed plan')
    require(plan['id']==js_hash({k:v for k,v in plan.items() if k!='id'}),'Plan content hash mismatch')
    require(plan['binding']['sourceSha256']==p.doc['sourceSha256'] and plan['binding']['registrationSha256']==p.doc['registrationSha256'],'Plan bound to different source')
    require(scan['status']=='complete' and scan['completedSamples']==240 and scan['failedSamples']==0 and len(scan['rows'])==240,'Incomplete actual combination scan')
    require(len(plan['cases'])==8 and plan['coverage']['mode']=='exhaustive' and plan['coverage']['totalCombinations']==plan['coverage']['selectedCombinations']==8,'Wrong factor coverage')
    require(plan['request']['actions']==ACTIONS and plan['request']['facings']==['right','left'],'Incomplete action/facing factors')
    require(plan['request']['referenceSelection']=={'top':None,'bottom':None,'fullBody':None,'shoes':None},'Capture must explicitly report original-clothing baseline')
    require(plan['coverage']['plannedPositions']==240 and plan['coverage']['totalPositions']>240,'Sampled coverage falsely claims entire motion')
    catalog=json.loads((ROOT/'docs/kling-wardrobe/catalog.json').read_bytes());entry=next(c for c in catalog['characters'] if c['key']==key)
    for case in plan['cases']:
        for name in case['selection'].values():
            if name and name not in p.items:
                item=next(i for i in entry['items'] if i['id']==name);path=ROOT/item['url'].lstrip('/')
                require(file_sha(path)==item['sha256'],'Checker extra garment changed')
                p.items[name]=Archive(path);p.item_hashes[name]=item['sha256']
        require(case['candidateBinding']==look_binding(p,case['selection'],case['appearance']),'Candidate combination binding mismatch')
        require(case['referenceBinding']==look_binding(p,plan['request']['referenceSelection'],case['appearance']),'Reference must have the same appearance context')
    for coverage in plan['coverage']['positionCoverage']:
        action=coverage['action'];clip=p.source.manifest['animations'][action];unique=[];seen=set()
        for pos,fid in enumerate(clip['frames']):
            if fid not in seen:unique.append(pos);seen.add(fid)
        count=min(3,len(unique));positions=[unique[int(math.floor(i*(len(unique)-1)/(count-1)+.5))] for i in range(count)]
        require(coverage['sampledPositions']==positions,'Checker representative source positions changed')
        require(coverage['untestedPositions']==[i for i in range(len(clip['frames'])) if i not in positions],'Untested timeline positions not disclosed exactly')
        endpoints=sorted({j for i in positions for j in ([i,(i+1)%len(clip['frames'])] if i+1<len(clip['frames']) or clip['loop'] else [])})
        require(coverage['motionTestedPositions']==endpoints,'Adjacent motion endpoints mislabeled')
    require(len(scan['rows'])==len(reviewed['rows']),'Reviewed row count changed')
    note=record['visualReview'];changed_review=0
    for a,b in zip(scan['rows'],reviewed['rows']):
        require({k:v for k,v in a.items() if k not in ('manualReview','note')}=={k:v for k,v in b.items() if k not in ('manualReview','note')},'Manual note edited measured data')
        require(a['manualReview']=='unreviewed' and not a['note'],'Fresh scan already visually approved')
        if b['manualReview']!='unreviewed':
            changed_review+=1
            require(b['caseId']==note['caseId'] and b['action']==note['action'] and b['position']==note['position'] and b['facing']==note['facing'] and b['manualReview']==note['decision'] and b['note']==note['note'],'Screenshot-bound observation differs')
    require(changed_review==1 and record['wrongSourceRejected'] and record['reopenNoteExact'] and record['acceptedLookUnchanged'],'Bound review/rejection workflow missing')
    bad=json.loads((ROOT/record['tamperedInput']['file']).read_bytes());require(bad['plan']['binding']['sourceSha256']=='0'*64,'Wrong-source rejection input missing')
    # Independently reconstruct each measured static frame. Cache only this
    # case's at most15 source pairs; facing is a mirror of those exact pixels.
    for case in plan['cases']:
        cache={}
        def pair(fid):
            if fid not in cache:
                cache[fid]=(p.look(fid,plan['request']['referenceSelection'],case['appearance']),p.look(fid,case['selection'],case['appearance']))
            return cache[fid]
        for row in [r for r in scan['rows'] if r['caseId']==case['id']]:
            clip=p.source.manifest['animations'][row['action']]
            require(clip['frames'][row['position']]==row['frameId'] and math.isclose(row['startMs'],row['position']*1000/clip['fps']) and math.isclose(row['durationMs'],1000/clip['fps']),'Sample source clock/pose changed')
            a,b=pair(row['frameId']);left=row['facing']=='left';a=a[:,::-1] if left else a;b=b[:,::-1] if left else b
            close_measurements(row['metrics'],metric(a,b),f'{key}/{case["id"]}/{row["action"]}/{row["position"]}/{row["facing"]}')
            if row['motion'] is not None:
                motion=row['motion'];pos=(row['position']+1)%len(clip['frames'])
                require((motion['toPosition'],motion['toFrameId'],motion['loopClosure'])==(pos,clip['frames'][pos],pos==0),'Motion timing/hold/loop endpoint changed')
                ar,br=pair(motion['toFrameId']);ar=ar[:,::-1] if left else ar;br=br[:,::-1] if left else br
                expected=motion_metric(a,ar,b,br)
                for part in ['reference','current','residual']:close_measurements(motion['metrics'][part],expected[part],f'{key}/motion/{part}')
            else:require(not clip['loop'] and row['position']==len(clip['frames'])-1,'Missing adjacent motion measurement')
        del cache;gc.collect()
    with zipfile.ZipFile(ROOT/record['contact']['file']) as z:
        manifest=json.loads(z.read('manifest.json'));require(manifest['format']=='gathria-combination-contact-review' and manifest['planId']==plan['id'] and manifest['binding']==plan['binding'],'Contact sheets bound to wrong report')
        require(len(manifest['samples'])==8 and len({s['caseId'] for s in manifest['samples']})==8,'Contact samples do not cover eight distinct looks')
        for record_file in manifest['files']:
            data=z.read(record_file['file']);require(sha(data)==record_file['sha256'] and len(data)==record_file['bytes'],'Contact member hash mismatch')
        cases={c['id']:c for c in plan['cases']}
        for sample in manifest['samples']:
            c=cases[sample['caseId']];require(sample['candidateBinding']==c['candidateBinding'] and sample['referenceBinding']==c['referenceBinding'],'Contact sample context changed')
            crop=sample['nativeCrop'];factor=sample['integerReduction'];require(isinstance(factor,int) and factor>=1,'Invalid declared contact reduction')
            require(sample['frameId']==p.source.manifest['animations'][sample['action']]['frames'][sample['position']],'Contact frame ID mismatch')
            for label,selection in [('before',plan['request']['referenceSelection']),('after',c['selection'])]:
                native=p.look(sample['frameId'],selection,c['appearance']);x,y,w,h=[crop[k] for k in ['x','y','width','height']]
                require(x>=0 and y>=0 and x+w<=native.shape[1] and y+h<=native.shape[0],'Contact native crop outside frame')
                xx=x+(np.arange(0,w,factor) if sample['facing']=='right' else w-1-np.arange(0,w,factor));yy=y+np.arange(0,h,factor)
                expected=native[yy[:,None],xx];actual=rgba(z.read(sample[label]));require(np.array_equal(actual,expected),'Actual contact thumbnail differs from independent frame/reduction')
        contact_count=len(manifest['samples'])
    report['combinations'].append({'key':key,'requestedLooks':8,'sampledRows':240,'allRequestedFactorCombinationsCovered':True,'allMotionFramesVisuallyChecked':False,'untestedPositionsDisclosed':True,'sourceClocksExact':True,'selectedCaseBindingsRecomputed':True,'staticAndAdjacentMotionMeasurementsRecomputed':True,'contactPairs':contact_count,'actualContactPixelsExact':True,'sameAppearanceReferenceVerified':True,'wrongSourceReportRejectedWithoutMutation':True,'reviewNotesReopenedExact':True,'manualObservedSamples':changed_review})


def playback_checks(e,key,p,report):
    project=next(r for r in e['projects'] if r['key']==key)
    require(project['exactReopen'] and project['before']==project['after'],'Saved project did not reopen exactly')
    require(project['selection']==p.doc['selection'] and project['sourceSha256']==p.doc['sourceSha256'],'Saved selection/source changed')
    rows=[r for r in e['playback'] if r['key']==key]
    require({(r['action'],r['facing']) for r in rows}=={(a,f) for a in ACTIONS for f in ['right','left']},'Incomplete independent playback matrix')
    for row in rows:
        clip=p.source.manifest['animations'][row['action']];observed=[r for r in row['observed'] if r['action']==row['action']]
        require(not row['missingPositions'] and {r['position'] for r in observed}==set(range(len(clip['frames']))),'Independent player skipped scheduled source positions')
        require(all(clip['frames'][r['position']]==r['frameId'] for r in observed),'Independent player source IDs differ')
        require(row['wraps']>0 if clip['loop'] else any(r['action']=='idle' for r in row['observed']),'Player loop/idle return failed')
        report['playback'].append({'key':key,'action':row['action'],'facing':row['facing'],'everyScheduledPositionCovered':True,'coverageBasis':row.get('coverageBasis','single original real-time observation interval'),'sourceFrameIdsExact':True,'loopOrIdleReturnVerified':True})


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index',type=Path,default=ROOT/'docs/kling-authoring-lab/evidence/final-v3/delivery-index.json')
    parser.add_argument('--output',type=Path,default=ROOT/'docs/kling-authoring-lab/artifact-validation.json')
    args=parser.parse_args();index=args.index.resolve();output=args.output.resolve()
    require(not output.exists(),'Preserve earlier audit; choose a fresh output path')
    raw=index.read_bytes();e=json.loads(raw);profile=json.loads(PROFILE.read_bytes())
    require(file_sha(PROFILE)==PROFILE_SHA,'Previously reviewed neckline permission profile changed')
    report={'format':'gathria-authoring-lab-independent-audit','version':1,'passed':False,'evidenceIndex':str(index.relative_to(ROOT)),'evidenceIndexSha256':sha(raw),'verifierSha256':file_sha(Path(__file__)),'independentHelpers':{str(p.relative_to(ROOT)):file_sha(p) for p in [HELPER,mask.HELPER]},'method':'Independent Pillow/NumPy material transform, source/garment/appearance composition and archive/frame decoding; application renderer not imported.','artifacts':[],'authoring':[],'frames':[],'pngs':[],'gifs':[],'mirrors':[],'combinations':[],'playback':[],'limits':['Material creation retains the existing clothing silhouette and ownership; reference PNG is color context only.','All requested factor combinations are sampled, but most animation positions are not checker samples.','Explicit UI review notes are bound observations, not automatic defect scoring or user visual acceptance.','Palette GIFs use stated color tolerances; native frames and garment material transforms require exact pixels.']}
    try:
        supplemental_checks(e,report)
        artifact_checks(e,index,report)
        for key in ['male','female']:
            print(f'Auditing {key}: material, native frames, GIFs and combination artifacts…',flush=True)
            p=Project(ROOT/next(r for r in e['projects'] if r['key']==key)['file'],profile)
            pack=Archive(ROOT/next(r for r in e['packs'] if r['key']==key)['file'])
            row=next(r for r in e['authoring'] if r['key']==key)
            base,new,built=garment_checks(e,row,p,report)
            frame_checks(e,key,p,pack,base,built,report)
            combination_checks(e,key,p,report)
            playback_checks(e,key,p,report)
            del p,pack,base,new;gc.collect()
        require(len(report['frames'])==184,'Expected all88 male +96 female source drawings')
        report['passed']=True
        report['summary']={'artifacts':len(report['artifacts']),'exactNativePackFrames':len(report['frames']),'nativePngs':len(report['pngs']),'gifs':len(report['gifs']),'mirrorPairs':len(report['mirrors']),'checkerSamples':sum(r['sampledRows'] for r in report['combinations']),'contactPairs':sum(r['contactPairs'] for r in report['combinations']),'independentPlayerCases':len(report['playback'])}
    except Exception as error:
        report['failure']=f'{type(error).__name__}: {error}';raise
    finally:
        output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'passed':True,'report':str(output.relative_to(ROOT)),**report['summary']},indent=2))


if __name__=='__main__':main()
