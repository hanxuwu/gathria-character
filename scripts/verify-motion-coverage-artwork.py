#!/usr/bin/env python3
"""Independently prove motion exports contain only reviewed clothing revisions.

The old baked pack and its original garments remain the visual authority for
all pixels outside the explicit clothing repair layer. Motion exports are not
expected to stay byte-identical after a garment revision. No app compositor or
motion implementation is imported here.
"""
import hashlib
import importlib.util
import io
import json
import math
import subprocess
import sys
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASE = '5d63ae233ca83e61dc354e122a8708044f4e2653'
sha = lambda data: hashlib.sha256(data).hexdigest()
spec = importlib.util.spec_from_file_location('coverage_audit', ROOT / 'scripts/coverage_export_audit.py')
coverage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(coverage)


def opened(data):
    archive = zipfile.ZipFile(io.BytesIO(data))
    assert archive.testzip() is None
    return archive


def image(archive, name):
    im = Image.open(io.BytesIO(archive.read(name)))
    im.load()
    assert im.mode == 'RGBA'
    return im


def pack(archive):
    manifest = json.loads(archive.read('manifest.json'))
    config = json.loads(archive.read('character.json'))
    pages = [image(archive, p['file']) for p in [manifest['spritesheet'], *manifest.get('additionalSheets', [])]]
    return manifest, config, pages


def native(pages, entry):
    x, y, w, h = [entry[k] for k in ['x', 'y', 'width', 'height']]
    return np.array(pages[entry.get('page', 0)].crop((x, y, x + w, y + h)))


def parts(data):
    z = opened(data)
    m = json.loads(z.read('manifest.json'))
    return m, {f['frameId']: f for f in m['frames']}, [(image(z, p['file']), image(z, p['maskFile'])) for p in m['pages']]


def part(pages, entry):
    r = entry['rect']
    box = (r['x'], r['y'], r['x'] + r['width'], r['y'] + r['height'])
    p, mask = pages[entry['page']]
    rgba = np.array(p.crop(box))
    alpha = np.array(mask.crop(box))[:, :, 3]
    assert np.isin(alpha, [0, 255]).all()
    return rgba, alpha == 255


def polygon(points, w, h, dx=0, dy=0):
    ps = [{'x': p['x'] + dx, 'y': p['y'] + dy} for p in points]
    out = np.zeros((h, w), bool)
    for y in range(max(0, math.ceil(min(p['y'] for p in ps) - .5)), min(h - 1, math.floor(max(p['y'] for p in ps) - .5)) + 1):
        cy = y + .5
        crossings, spans = [], []
        for a, b in zip(ps[-1:] + ps[:-1], ps):
            if (a['y'] > cy) != (b['y'] > cy):
                crossings.append(a['x'] + (cy-a['y'])*(b['x']-a['x'])/(b['y']-a['y']))
            if abs(a['y']-cy) < 1e-9 and abs(b['y']-cy) < 1e-9:
                spans.append((a['x'], b['x']))
            elif abs(a['y']-cy) < 1e-9:
                spans.append((a['x'], a['x']))
        crossings.sort()
        spans += list(zip(crossings[::2], crossings[1::2]))
        for a, b in spans:
            lo = max(0, math.ceil(min(a, b)-.5-1e-9))
            hi = min(w-1, math.floor(max(a, b)-.5+1e-9))
            if lo <= hi:
                out[y, lo:hi+1] = True
    return out


def rectangle(r, w, h, dx=0, dy=0):
    x, y = np.arange(w)+.5-dx, np.arange(h)+.5-dy
    return ((y >= r['y']) & (y <= r['y']+r['height']))[:, None] & ((x >= r['x']) & (x <= r['x']+r['width']))[None, :]


def verify(row):
    project = opened(Path(row['project']).read_bytes())
    doc = json.loads(project.read('document.json'))
    source_bytes, reg_bytes = project.read('source.character.zip'), project.read('registration.json')
    reg = json.loads(reg_bytes)
    assert sha(source_bytes) == doc['sourceSha256'] == reg['sourceSha256']
    assert sha(reg_bytes) == doc['registrationSha256']
    sm, sc, sp = pack(opened(source_bytes))
    dm, dc, dp = pack(opened(Path(row['pack']).read_bytes()))
    historical = Path(row['baseline']).read_bytes()
    frozen = subprocess.check_output(['git', 'show', BASE + ':' + row['baseline']], cwd=ROOT)
    assert historical == frozen, 'Historical motion artwork fixture changed'
    bm, bc, bp = pack(opened(historical))
    for config in [bc, dc]:
        assert config['sourceMetadata']['wardrobe']['sourcePackSha256'] == doc['sourceSha256']
        assert config['sourceMetadata']['wardrobe']['registrationSha256'] == doc['registrationSha256']
        assert config['sourceMetadata']['wardrobe']['selection'] == doc['selection']
        assert config['derivation']['frames'] == sc['derivation']['frames']
    # Gameplay selection narrows the source jump, so its existing export note
    # correctly marks actionTimingUnchanged=false; art/binding fields stay exact.
    current_appearance, old_appearance = dc['sourceMetadata']['appearance'], bc['sourceMetadata']['appearance']
    assert {k:v for k,v in current_appearance.items() if k != 'actionTimingUnchanged'} == {k:v for k,v in old_appearance.items() if k != 'actionTimingUnchanged'}, 'Motion revision changed appearance metadata'
    assert old_appearance['actionTimingUnchanged'] is True and current_appearance['actionTimingUnchanged'] is False
    assert dc['sourceMetadata']['gameplayMotion']['actions'] == dm['animations']
    bank_bytes = project.read('appearance.zip')
    appearance = doc['appearance']
    assert appearance == dc['sourceMetadata']['appearance']['selection']
    assert sha(bank_bytes) == appearance['bankSha256'] == bc['sourceMetadata']['appearance']['bankSha256']
    az = opened(bank_bytes)
    am = json.loads(az.read('manifest.json'))
    assert am['sourceSha256'] == doc['sourceSha256'] and am['registrationSha256'] == doc['registrationSha256']
    L, T, R, B = [am['padding'][k] for k in ['left', 'top', 'right', 'bottom']]
    sw, sh = am['frameWidth'], am['frameHeight']
    w, h = sw+L+R, sh+T+B
    assert dm['anchor'] == bm['anchor'] == {**sm['anchor'], 'x':sm['anchor']['x']+L, 'y':sm['anchor']['y']+T}
    assert (dm['spritesheet']['frameWidth'], dm['spritesheet']['frameHeight']) == (w,h)
    assert dm['frames'] == bm['frames']
    ap = [(image(az, p['file']), image(az, p['maskFile'])) for p in am['pages']]
    layers = [(layer['role'], {f['frameId']:f for f in layer['frames']}) for style in am['styles'] if style['id'] in [appearance['hairId'], appearance['faceId']] for layer in style['layers']]
    layers.sort(key=lambda layer: ['hair-back','face','hair-front'].index(layer[0]))
    factors = np.array({'chestnut':[1,1,1], 'espresso':[.63,.65,.69], 'copper':[1.2,1.05,.83]}[appearance['hairColor']])
    poses = {p['frameId']:p for p in am['poses']}
    regs = {f['frameId']:f for f in reg['frames']}
    output_frames = {f['id']:f for f in dm['frames']}
    baseline_frames = {f['id']:f for f in bm['frames']}
    current, old, paths = {}, {}, {}
    selected = {item for item in doc['selection'].values() if item}
    inventory = json.loads((ROOT/'docs/wardrobe-coverage/inventory.json').read_text())['assets']
    previous_items = {item['id']:item for item in bc['sourceMetadata']['wardrobe']['items']}
    current_items = {item['id']:item for item in dc['sourceMetadata']['wardrobe']['items']}
    for i, item in enumerate(doc['items']):
        data = project.read(f'item-{i}.zip')
        assert sha(data) == item['sha256']
        gm, gf, gp = parts(data)
        if gm['id'] not in selected:
            continue
        coverage.validate_garment(data, reg)
        matches = [entry for entry in inventory if entry['id'] == gm['id'] and entry['sha256'] == sha(data)]
        assert len(matches) == 1, f'Unbound current garment {gm["id"]}'
        path = matches[0]['path']
        original_data = subprocess.check_output(['git','show',BASE+':'+path],cwd=ROOT)
        assert sha(original_data) == previous_items[gm['id']]['sha256']
        assert sha(data) == current_items[gm['id']]['sha256']
        current[gm['slot']], old[gm['slot']], paths[gm['slot']] = (gm,gf,gp), parts(original_data), path
    assert {g[0]['id'] for g in current.values()} == selected == set(previous_items) == set(current_items)

    def dress(source, garments, fid):
        result = source.copy()
        for slot in ['shoes','bottom','top','fullBody']:
            if slot not in garments:
                continue
            gm, gf, gp = garments[slot]
            patch, owned = part(gp, gf[fid])
            o = gf[fid]['offset']; rh,rw = owned.shape
            region = np.s_[o['y']:o['y']+rh, o['x']:o['x']+rw]
            if garments is current:
                native_owned = np.zeros((sh,sw),bool);native_owned[region] = owned
                for label,guard,reviewed,permitted in coverage.protected_mask(gm,regs[fid],source,polygon):
                    assert not np.any(native_owned & guard), f'Current garment owns protected {label} {fid}'
            result[region][owned] = patch[owned]
        return result

    def raw_layer(garment, fid):
        _, frames, pages = garment
        f=frames[fid];patch,owned=part(pages,f);o=f['offset'];rh,rw=owned.shape
        rgba=np.zeros((sh,sw,4),np.uint8);mask=np.zeros((sh,sw),bool)
        region=np.s_[o['y']:o['y']+rh,o['x']:o['x']+rw]
        rgba[region]=patch;mask[region]=owned
        assert not rgba[~mask].any(), f'Unowned garment samples {fid}'
        return rgba,mask

    def complete(source, dressed, fid):
        expected = np.zeros((h,w,4),np.uint8)
        region = np.s_[T:T+sh,L:L+sw]
        expected[region] = dressed
        original_pad = np.zeros_like(expected); original_pad[region] = source
        dressed_pad = expected.copy(); pose = poses[fid]
        foreground = np.zeros((h,w),bool)
        for p in pose['foreground'] + [r['polygon'] for r in regs[fid]['protected'] if r['label'] != 'head']:
            foreground |= polygon(p,w,h,L,T)
        foreground &= original_pad[:,:,3] != 0
        for role, frames in layers:
            f = frames[fid]
            if f['mode'] == 'source':
                continue
            patch, owned = part(ap,f); o=f['offset'];rh,rw=owned.shape;x,y=o['x']+L,o['y']+T
            region = np.s_[y:y+rh,x:x+rw];mask=np.zeros((h,w),bool);mask[region]=owned
            if role == 'face':
                permitted = rectangle(pose['headBounds'],w,h,L,T) & polygon(pose['facePolygon'],w,h,L,T) & (original_pad[:,:,3]>0) & ~foreground
                assert not np.any(mask & ~permitted), f'Face escaped native bounds {fid}'
                expected[region][owned] = patch[owned]
            else:
                assert not np.any(mask & ~rectangle(pose['hairBounds'],w,h,L,T)), f'Hair escaped native bounds {fid}'
                if role == 'hair-front':
                    occlusion=rectangle(pose.get('hairOcclusionBounds',pose['headBounds']),w,h,L,T)
                    mask &= ~(foreground | (~occlusion & ((original_pad[:,:,3]>0) | (dressed_pad[:,:,3]>0))))
                active=mask[region] & (patch[:,:,3]>0);dst=expected[region];back=role=='hair-back'
                if back: active &= dst[:,:,3]<255
                sa=patch[:,:,3][active].astype(float)/255;da=dst[:,:,3][active].astype(float)/255
                source_weight=sa*(1-da) if back else sa;dest_weight=da if back else da*(1-sa);alpha=source_weight+dest_weight
                rgb=np.minimum(255,np.floor(patch[:,:,:3][active].astype(float)*factors+.5))
                dst[:,:,:3][active]=np.floor((rgb*source_weight[:,None]+dst[:,:,:3][active]*dest_weight[:,None])/alpha[:,None]+.5).clip(0,255).astype(np.uint8)
                dst[:,:,3][active]=np.floor(alpha*255+.5).astype(np.uint8)
        return expected

    records=[]
    for f in sm['frames']:
        fid=f['id'];source=native(sp,f)
        old_dressed=dress(source,old,fid);new_dressed=dress(source,current,fid)
        allowed=np.zeros((sh,sw),bool)
        for slot in paths:
            # Same exact published delta as coverage.allowed_coverage_mask,
            # using pages already decoded once per archive in this sweep.
            old_rgba,old_owned=raw_layer(old[slot],fid)
            new_rgba,new_owned=raw_layer(current[slot],fid)
            allowed |= (old_owned != new_owned) | ((old_owned | new_owned) & np.any(old_rgba != new_rgba,axis=2))
        assert not np.any(np.any(old_dressed!=new_dressed,axis=2) & ~allowed), f'Unreviewed garment pixels changed {fid}'
        prior=complete(source,old_dressed,fid)
        assert np.array_equal(prior,native(bp,baseline_frames[fid])), f'Historical raw layers no longer reconstruct approved artwork {fid}'
        expected=complete(source,new_dressed,fid);actual=native(dp,output_frames[fid])
        assert np.array_equal(actual,expected), f'Actual motion export differs from independent raw-layer composition {fid}'
        permitted=np.zeros((h,w),bool);permitted[T:T+sh,L:L+sw]=allowed
        delta=np.any(actual!=prior,axis=2)
        assert not np.any(delta & ~permitted), f'Motion changed pixels outside reviewed garment coverage {fid}'
        records.append({'frameId':fid,'changedPixels':int(delta.sum()),'rgbaSha256':sha(actual.tobytes())})
    return {'framesChecked':len(records),'independentCurrentCompositionExact':True,'independentHistoricalCompositionExact':True,'exactOutsideReviewedCoverage':True,'appearanceBankAndSelectionUnchanged':True,'sourceAndRegistrationUnchanged':True,'historicalBaselineSha256':sha(historical),'changedFrames':sum(r['changedPixels']>0 for r in records),'frames':records}


if __name__ == '__main__':
    print(json.dumps(verify(json.loads(sys.argv[1]))))
