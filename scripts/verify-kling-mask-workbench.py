#!/usr/bin/env python3
"""Independent audit of completed real mask-workbench UI downloads.

Uses Pillow/NumPy and the previously independent ZIP/PNG/GIF decoder, never
application rendering/import code. Keep the captured build and both temporary
saved projects until this audit finishes. This verifies pixel/data contracts;
it does not classify ambiguous skin/cloth or substitute for visual review.
"""
from __future__ import annotations
import argparse
import gc
import importlib.util
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / 'scripts/verify-kling-expression-shirt.py'
spec = importlib.util.spec_from_file_location('mask_independent_decoder', HELPER)
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
Archive, require, sha, file_sha, rgba = prior.Archive, prior.require, prior.sha, prior.file_sha, prior.rgba
TARGETS = {89, 90, 93, 101, 102, 103}
PROFILE_PATH = ROOT / 'artwork/kling-mask-workbench/female-neckline-cloth-v1.json'
SEEDS_PATH = ROOT / 'artwork/kling-mask-workbench/female-plum-neckline-seeds.json'


class Project:
    """Source + replacement clothing; this bounded capture uses original head."""
    def __init__(self, path, profile):
        self.zip = zipfile.ZipFile(path)
        self.doc = json.loads(self.zip.read('document.json'))
        data = self.zip.read('source.character.zip')
        require(sha(data) == self.doc['sourceSha256'], 'Saved source mismatch')
        self.source = Archive(data)
        reg = self.zip.read('registration.json')
        require(sha(reg) == self.doc['registrationSha256'], 'Saved registration mismatch')
        self.registration = {f['frameId']: f for f in json.loads(reg)['frames']}
        self.items, self.item_hashes = {}, {}
        for i, item in enumerate(self.doc['items']):
            raw = self.zip.read(f'item-{i}.zip')
            require(sha(raw) == item['sha256'], 'Embedded garment hash mismatch')
            archive = Archive(raw)
            require(archive.manifest['id'] == item['id'], 'Embedded garment ID mismatch')
            require(archive.manifest['sourceSha256'] == self.doc['sourceSha256'] and archive.manifest['registrationSha256'] == self.doc['registrationSha256'], 'Garment source binding changed')
            self.items[item['id']], self.item_hashes[item['id']] = archive, item['sha256']
        appearance = self.doc.get('appearance', {})
        require(not appearance.get('hairId') and not appearance.get('faceId'), 'Primary mask audit must retain original head')
        self.profile = profile
        self.permission = {}
        for frame in profile['frames']:
            mask = np.zeros((profile['frameHeight'], profile['frameWidth']), dtype=bool)
            for run in frame['runs']:
                mask[run['y'], run['x0']:run['x1']+1] = True
            self.permission[frame['frameId']] = mask

    def render(self, fid, selection=None):
        original = self.source.frame(fid)
        dressed = original.copy()
        selection = self.doc['selection'] if selection is None else selection
        for slot in ('shoes', 'bottom', 'top', 'fullBody'):
            name = selection.get(slot)
            if not name:
                continue
            item = self.items[name]
            f = item.frames[fid]
            patch, owned = item.paint(f)
            x, y = f['offset']['x'], f['offset']['y']
            target = dressed[y:y+patch.shape[0], x:x+patch.shape[1]]
            require(target.shape == patch.shape, 'Garment escaped native source frame')
            xx, yy = np.meshgrid(np.arange(x, x+patch.shape[1])+.5, np.arange(y, y+patch.shape[0])+.5)
            head, hands = np.zeros(owned.shape, bool), np.zeros(owned.shape, bool)
            for region in self.registration[fid]['protected']:
                review = next((r for r in item.manifest.get('handProtectionReviews', []) if r['frameId'] == fid and r['label'] == region['label']), region)
                region_mask = prior.inside_polygons([review['polygon']], xx, yy)
                if region['label'] == 'head':
                    head |= region_mask
                else:
                    hands |= region_mask
            if item.manifest['version'] == 3:
                p = self.profile
                require(item.manifest['necklinePermissionProfile'] == p['id'] and item.manifest['sourceSha256'] == p['sourceSha256'] and item.manifest['registrationSha256'] == p['registrationSha256'], 'V3 permission binding changed')
                require(item.manifest['slot'] in ('top', 'fullBody'), 'Neckline profile on wrong garment slot')
                if fid in self.permission:
                    head &= ~self.permission[fid][y:y+patch.shape[0], x:x+patch.shape[1]]
            else:
                require('necklinePermissionProfile' not in item.manifest, 'Old garment opted into new protection implicitly')
            opaque = original[y:y+patch.shape[0], x:x+patch.shape[1], 3] > 0
            require(not np.any(owned & opaque & (head | hands)), f'{name}/{fid} touches protected head/hand pixels')
            target[owned] = patch[owned]
        return dressed


def artifact_checks(e, index, report):
    require(e.get('passed') and e.get('finishedAt') and e.get('production'), 'Production capture is incomplete')
    require(e['format'] == 'gathria-mask-workbench-browser-evidence', 'Wrong capture type')
    expected = {'matrix': 4, 'gifs': 8, 'projects': 2, 'packs': 1, 'playback': 10, 'screenshots': 6}
    for key, n in expected.items():
        require(len(e[key]) == n, f'Expected {n} {key}')
    require(sum(r['kind'] == 'png' for r in e['downloads']) == 22, 'Expected22 actual native PNGs')
    for field in ('errors','consoleErrors','failedRequests','externalRequests','independentEditorRequests'):
        require(not e[field], f'Browser failure recorded in{field}')
    require(e.get('editorsClosedAt') and all(p['reopenedAt'] < e['editorsClosedAt'] for p in e['packs']), 'Independent playback did not follow editor closure')
    files = e['downloads'] + e['screenshots']
    require(len({r['file'] for r in files}) == len(files), 'Duplicate artifact paths')
    require(all(r['actualUiDownload'] for r in e['downloads']) and all(not r['actualUiDownload'] for r in e['screenshots']), 'Screenshot/download distinction lost')
    cache = {}
    for row in files:
        path = ROOT / row['file']
        require(path.stat().st_size == row['bytes'] and file_sha(path) == row['sha256'], f'Artifact changed:{path}')
        out = {k:row[k] for k in ('file','kind','bytes','sha256')}
        if path.suffix == '.zip':
            out['archive'] = prior.scan_zip(path.read_bytes(), row['file'], cache)
        elif path.suffix == '.png':
            with Image.open(path) as im:
                im.load();out.update(width=im.width,height=im.height,mode=im.mode)
        elif path.suffix == '.gif':
            frames, delays, loop = prior.read_gif(path)
            out.update(frames=len(frames),delaysMs=delays,loop=loop);del frames
        elif path.suffix == '.json':
            json.loads(path.read_bytes());out['jsonDecoded'] = True
        else:
            raise AssertionError(f'Unknown artifact suffix:{path}')
        report['artifacts'].append(out)
    bound = {**e['inputs'], **e['compiledJsSha256'], 'dist/workbench.html':e['productionHtmlSha256'], 'dist/player.html':e['playerHtmlSha256'],
             'docs/kling-wardrobe/catalog.json':e['catalogSha256'], str((index.parent/'capture-script.mjs').relative_to(ROOT)):e['scriptSha256']}
    for name,digest in bound.items():
        require(file_sha(ROOT/name)==digest,f'Captured input/build changed:{name}')
    require(len(e['catalogResponses'])==1 and e['catalogResponses'][0]['sha256']==e['catalogSha256'],'Served catalog mismatch')
    require(e['scriptRequests'] and all(r['compiledSha256'] in e['compiledJsSha256'].values() for r in e['scriptRequests']),'Unrecorded runtime script')
    report['capturedInputsAndBuild'] = bound


def frame_diff_checks(e, before, after, pack, seeds, report):
    src, m = before.source.manifest, pack.manifest
    require(before.doc['sourceSha256']==after.doc['sourceSha256']==sha(after.zip.read('source.character.zip')),'Source changed')
    require(before.doc['registrationSha256']==after.doc['registrationSha256'],'Registration changed')
    require(m==e['packs'][0]['manifest'],'Recordedpackmanifest differs')
    for key in ('animations','anchor','facing','scale'):
        require(m[key]==src[key],f'Source{key} changed')
    require((m['spritesheet']['frameWidth'],m['spritesheet']['frameHeight'])==(704,1056),'Native size changed')
    require([f['id'] for f in m['frames']]==[f['id'] for f in src['frames']],'Frame IDs/orderchanged')
    source_config=json.loads(before.source.zip.read(src['configuration']))
    config=json.loads(pack.zip.read(m['configuration']))
    require(config['source']==source_config['source'] and config['derivation']['frames']==source_config['derivation']['frames'],'Source time/frameprovenance changed')
    require(config['sourceMetadata']['wardrobe']['selection']==after.doc['selection'],'Export selectedclothing mismatch')
    require(after.doc['selection']=={**before.doc['selection'],'top':'plum-pintuck-neckline-mask-v1'},'Unexpected selectedlook changes')
    require(before.doc['selection']['top']=='plum-pintuck-top-v1' and before.doc['selection']['bottom']=='navy-shorts','Wrongbaseline combination')
    base_top=before.items['plum-pintuck-top-v1'];new_top=after.items[after.doc['selection']['top']]
    require(new_top.manifest['version']==3,'Newgarment didnot optinto V3')
    require(before.item_hashes['plum-pintuck-top-v1']==after.item_hashes['plum-pintuck-top-v1']==seeds['baseGarmentSha256'],'Original garment changed')
    require(new_top.manifest['necklinePermissionProfile']==seeds['profileId'],'Wrongneckline permission')
    seedmap={f['frameId']:f for f in seeds['frames']}
    require(set(seedmap)==TARGETS,'Unexpectedseedpose set')
    for f in src['frames']:
        fid=f['id'];baseline=before.render(fid);actual=pack.frame(fid);expected=after.render(fid)
        require(np.array_equal(actual,expected),f'Independent packreconstruction differs at{fid}')
        require(np.array_equal(actual[:,:,3],baseline[:,:,3]) and np.array_equal(actual[:,:,3],before.source.frame(fid)[:,:,3]),f'Source alpha changed at{fid}')
        intended=baseline.copy();allowed=np.zeros(baseline.shape[:2],bool)
        for p in seedmap.get(fid,{}).get('pixels',[]):
            x,y=p['x'],p['y'];require(baseline[y,x,3]>0,'Authored patch contains transparentbackground')
            intended[y,x,:3]=[p['r'],p['g'],p['b']];allowed[y,x]=True
        require(np.array_equal(actual,intended),f'Actual output differs from explicitly authored accepted pixels at{fid}')
        changed=np.any(actual!=baseline,axis=2)
        require(not np.any(changed&~allowed),f'Pixelschanged outsideacceptedmask at{fid}')
        if fid not in TARGETS:
            require(not changed.any(),f'Unaccepted/unrequestedframe changed at{fid}')
        yy,xx=np.indices(baseline.shape[:2]);head=np.zeros(baseline.shape[:2],bool);hands=np.zeros_like(head)
        for r in before.registration[fid]['protected']:
            dest=head if r['label']=='head' else hands
            dest|=prior.inside_polygons([r['polygon']],xx+.5,yy+.5)
        permission=after.permission.get(fid,np.zeros_like(head))
        require(not np.any(changed & (hands | (head & ~permission))),f'Protectedsourcepixelschanged at{fid}')
        report['frames'].append({'frameId':fid,'actualRgbaSha256':sha(actual.tobytes()),'baselineRgbaSha256':sha(baseline.tobytes()),
          'changedPixels':int(changed.sum()),'sourceAlphaExact':True,'independentCompositionExact':True,'authoredAcceptedPatchExact':True,
          'outsideAcceptedMaskExact':True,'protectedSourceExceptReviewedClothExact':True})
        del baseline,actual,expected,intended,head,hands,permission,yy,xx
    require(len(report['frames'])==96,'Expected96 sourceposes')
    require(sum(r['changedPixels']>0 for r in report['frames'])==6,'Expectedonlysixchangedposes')


def downloads_checks(e,before,after,pack,report):
    bykey={'before-navy':before,'after-navy':after,'before-ochre':before,'after-ochre':after}
    catalog=json.loads((ROOT/'docs/kling-wardrobe/catalog.json').read_bytes())
    female=next(c for c in catalog['characters'] if c['key']=='female')
    ochre=next(i for i in female['items'] if i['id']=='ochre-shorts')
    path=ROOT/ochre['url'].lstrip('/')
    require(file_sha(path)==ochre['sha256'],'Currentochreshorts changed')
    for p in (before,after):
        p.items['ochre-shorts']=Archive(path)
    for row in e['matrix']:
        p=bykey[row['key']];expected_selection={**p.doc['selection'],'bottom':row['bottom']}
        require(row['selection']==expected_selection,'Matrixselection differs')
        for png in row['pngs']:
            actual=rgba((ROOT/png['file']).read_bytes());expected=p.render(png['frameId'],expected_selection)
            require(np.array_equal(actual,expected),f'Actual PNG mismatch:{png["file"]}')
            require((actual.shape[1],actual.shape[0])==(png['uiCanvas']['width'],png['uiCanvas']['height']),'PNG/UI native dimensions differ')
            report['pngs'].append({'file':png['file'],'frameId':png['frameId'],'independentCompositionExact':True,'canvasDimensionsExact':True})
    for key,p in [('before-navy',before),('after-navy',after)]:
        wanted={fid for action in ('run','jump') for fid in p.source.manifest['animations'][action]['frames']}
        frames={fid:p.render(fid) for fid in wanted}
        for row in [r for r in e['gifs'] if r['key']==key]:
            report['gifs'].append(prior.gif_audit(row,frames,p.source.manifest))
        del frames;gc.collect()
    for key in ('before-navy','after-navy'):
        for action in ('run','jump'):
            pair=[next(r for r in e['gifs'] if (r['key'],r['action'],r['facing'])==(key,action,direction)) for direction in ('right','left')]
            right,rd,rl=prior.read_gif(ROOT/pair[0]['file']);left,ld,ll=prior.read_gif(ROOT/pair[1]['file'])
            require(rd==ld and rl==ll and len(right)==len(left),'MirrorGIFtiming differs')
            require(all(np.array_equal(a[:,::-1],b) for a,b in zip(right,left)),f'LeftGIF isnotexactmirror:{key}/{action}')
            report['mirrorPairs'].append({'key':key,'action':action,'decodedMirrorExact':True,'frames':len(right)})
            del right,left;gc.collect()
    for direction in ('right','left'):
        rows=[next(r for r in e['gifs'] if (r['key'],r['action'],r['facing'])==(key,'run',direction)) for key in ('before-navy','after-navy')]
        a,ad,al=prior.read_gif(ROOT/rows[0]['file']);b,bd,bl=prior.read_gif(ROOT/rows[1]['file'])
        require(ad==bd and al==bl and all(np.array_equal(x,y) for x,y in zip(a,b)),'UnchangedrunGIF regressed')
        report['unchangedRuns'].append({'facing':direction,'decodedFramesExact':True});del a,b


def workflow_checks(e,after,report):
    files={r['file']:r for r in e['downloads']}
    build=json.loads((ROOT/e['buildReport']['file']).read_bytes())
    require(build['output']['sha256']==e['garment']['sha256']==after.item_hashes['plum-pintuck-neckline-mask-v1'],'Builtgarmentdownload mismatch')
    require({p['frameId'] for p in build['accepted']}==TARGETS and all(p['decision']=='accepted' for p in build['accepted']),'Wrongacceptedposes')
    require({'frameId':104,'decision':'pending'} in build['excluded'],'Unacceptedneighbor missing')
    final=next(r for r in e['downloads'] if r['file'].endswith('/reviewed.mask-draft.json'))
    reopened=next(r for r in e['downloads'] if r['file'].endswith('/reviewed-reopened.mask-draft.json'))
    require(final['sha256']==reopened['sha256']==build['draftSha256'],'Draftsave/reopen/build binding mismatch')
    draft=json.loads((ROOT/final['file']).read_bytes())
    require({p['frameId'] for p in draft['poses'] if p['decision']=='accepted'}==TARGETS,'Draftacceptance missing')
    require(next(p for p in draft['poses'] if p['frameId']==104)['decision']=='pending','Neighborautoaccepted')
    require(all(c['origin']=='manual' for p in draft['poses'] if p['decision']=='accepted' for c in p['commands']),'Manualart incorrectlyclaimed propagated')
    suggestions=json.loads((ROOT/next(r for r in e['downloads'] if r['file'].endswith('/seed-neighbor-review.mask-draft.json'))['file']).read_bytes())
    require(any(p['frameId']==102 and p['decision'] in ('rejected','pending') for p in suggestions['poses']),'Neighbor102review missing')
    require(all(p['decision']!='accepted' for p in suggestions['poses'] if p['frameId']!=103),'Suggestionsautoaccepted')
    require(any(r['name']=='real-restore-brush-and-exact-undo' and r['exactUndo'] and r['before']==r['after'] and r['before']!=r['restored'] for r in e['workflow']),'Actualbrushundo proofmissing')
    saved=next(p for p in e['projects'] if p['key']=='after-navy')
    require(saved['exactReopen'] and saved['before']==saved['after'] and saved['preview']=={'action':'jump','facing':'left'},'Exactprojectreopen missing')
    require(saved['selection']==after.doc['selection'] and saved['sourceSha256']==after.doc['sourceSha256'],'Savedproject binding mismatch')
    expected={(a,f) for a in prior.ACTIONS for f in ('right','left')}
    require({(p['action'],p['facing']) for p in e['playback']}==expected,'Missingplayercase')
    for row in e['playback']:
        clip=after.source.manifest['animations'][row['action']]
        observed=[o for o in row['observed'] if o['action']==row['action']]
        require(not row['missingPositions'] and {o['position'] for o in observed}==set(range(len(clip['frames']))),'Playerdidnotobserveallpositions')
        require(all(clip['frames'][o['position']]==o['frameId'] for o in observed),'Playerposition/frame differs')
        require(row['wraps']>0 if clip['loop'] else any(o['action']=='idle' for o in row['observed']),'Playerloop/idle-returnfailed')
        report['playback'].append({'action':row['action'],'facing':row['facing'],'allScheduledPositionsObserved':True,'sourceFrameIdsExact':True,'loopOrIdleReturnVerified':True})
    report['workflow']={'draftReopenExact':True,'actualBrushUndoExact':True,'acceptedManualFrames':sorted(TARGETS),'pendingNeighbor104Excluded':True,'garmentAndProjectHashesExact':True,'projectReopenExact':True}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index',type=Path,default=ROOT/'docs/kling-mask-workbench/evidence/final-v1/evidence-index.json')
    parser.add_argument('--output',type=Path,default=ROOT/'docs/kling-mask-workbench/artifact-validation.json')
    args=parser.parse_args();index=args.index.resolve();raw=index.read_bytes();e=json.loads(raw)
    require(not args.output.exists(),'Preserve earlier audits; choose fresh --output')
    profile=json.loads(PROFILE_PATH.read_bytes());seeds=json.loads(SEEDS_PATH.read_bytes())
    require(seeds['profileSha256']==file_sha(PROFILE_PATH),'Frozen authoredseed/profile mismatch')
    report={'format':'gathria-mask-workbench-independent-audit','version':1,'passed':False,'evidenceIndex':str(index.relative_to(ROOT)),
      'evidenceIndexSha256':sha(raw),'verifierSha256':file_sha(Path(__file__)),'independentDecoder':{'file':str(HELPER.relative_to(ROOT)),'sha256':file_sha(HELPER)},
      'method':'Independent Pillow/NumPy source and garment replacement; application rendering code not imported.',
      'artifacts':[],'frames':[],'pngs':[],'gifs':[],'mirrorPairs':[],'unchangedRuns':[],'playback':[],
      'limits':['Exact source protection excludes only the reviewed cloth permission; that map requires human visual judgment.',
                'Allsix final refinements are authored manual patches, not claimed automatically propagated artwork.',
                'Blurred gray fringes remain; technical validation is not visual acceptance.',
                'GIF uses palette approximation; native PNG/pack comparisons are exact while GIF order/appearance uses stated tolerances.']}
    artifact_checks(e,index,report)
    before=Project(ROOT/next(p for p in e['projects'] if p['key']=='before-navy')['file'],profile)
    after=Project(ROOT/next(p for p in e['projects'] if p['key']=='after-navy')['file'],profile)
    pack=Archive(ROOT/e['packs'][0]['file'])
    print('Reconstructing96packframes and checking exactacceptedpatch/sourceprotection…',flush=True)
    frame_diff_checks(e,before,after,pack,seeds,report)
    print('Checking22PNGs,8GIFs,fourmirrors andunchangedruns…',flush=True)
    downloads_checks(e,before,after,pack,report)
    workflow_checks(e,after,report)
    report['passed']=True
    report['summary']={'artifacts':len(report['artifacts']),'exactPackFrames':len(report['frames']),'changedSourcePoses':sum(r['changedPixels']>0 for r in report['frames']),
      'changedPixels':sum(r['changedPixels'] for r in report['frames']),'exactNativePngs':len(report['pngs']),'gifs':len(report['gifs']),'mirrorPairs':len(report['mirrorPairs']),
      'unchangedRunDirections':len(report['unchangedRuns']),'independentPlayerCases':len(report['playback'])}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'passed':True,'report':str(args.output.relative_to(ROOT)),**report['summary']},indent=2))


if __name__=='__main__':main()
