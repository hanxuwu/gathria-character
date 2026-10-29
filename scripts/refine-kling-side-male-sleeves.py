#!/usr/bin/env python3
"""Re-fit a bounded sleeve passage from retained painted cloth, never body pixels.

Uses the exact garment embedded in the historical actual workbench export as
its idempotent baseline. Only pixels whose fitting changes under the reviewed
cloth cap guide are transferred; unrelated numeric sampling stays byte exact.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import zipfile
import numpy as np
from PIL import Image, ImageDraw
from kling_side_authoring import load_context, pack_garment

ROOT = Path(__file__).resolve().parents[1]
RECIPE = ROOT / 'artwork/kling-side-fitting/male/sleeve-guides.json'
DOC = ROOT / 'docs/kling-side-fitting/male'
ASSET = ROOT / 'docs/kling-side-expansion/assets/male-shirt.garment.zip'
spec = importlib.util.spec_from_file_location('male_cloth', ROOT/'scripts/prepare-kling-side-male-clothing.py')
cloth = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cloth)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def unpack(data):
    frames = {}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        assert z.testzip() is None
        manifest = json.loads(z.read('manifest.json'))
        pages = {}
        for frame in manifest['frames']:
            page = frame['page']
            if page not in pages:
                pages[page] = tuple(Image.open(io.BytesIO(z.read(f'{kind}-{page}.png'))).convert('RGBA') for kind in ('patches', 'ownership'))
            r, o = frame['rect'], frame['offset']
            box = r['x'], r['y'], r['x']+r['width'], r['y']+r['height']
            patch = np.zeros((768, 512, 4), np.uint8)
            owned = np.zeros((768, 512), bool)
            target = np.s_[o['y']:o['y']+r['height'], o['x']:o['x']+r['width']]
            patch[target] = np.array(pages[page][0].crop(box))
            owned[target] = np.array(pages[page][1].crop(box))[:, :, 3] > 0
            assert not patch[~owned].any()
            frames[frame['frameId']] = patch, owned
    return manifest, frames


def compose(source, layers):
    result = source.copy()
    for patch, ownership in layers:
        result[ownership] = patch[ownership]
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ASSET)
    parser.add_argument('--review', type=Path, default=DOC)
    args = parser.parse_args()
    args.review.mkdir(parents=True, exist_ok=True)
    recipe = json.loads(RECIPE.read_text())
    with zipfile.ZipFile(ROOT/recipe['baselineArchive']) as z:
        before_bytes = z.read(recipe['baselineEntry'])
        bottom_bytes = z.read('item-1.zip')
    assert sha(before_bytes) == recipe['baselineGarmentSha256']
    manifest, before = unpack(before_bytes)
    _, trousers = unpack(bottom_bytes)
    ctx = cloth.NativeContext(ROOT/'artwork/kling-side-expansion/templates/male.registration.json')
    assert sha(ctx.source_bytes) == recipe['sourceSha256'] == manifest['sourceSha256']
    assert sha(ctx.registration_bytes) == recipe['registrationSha256'] == manifest['registrationSha256']
    after = {fid: (p.copy(), o.copy()) for fid, (p, o) in before.items()}
    records = []
    for record in recipe['frames']:
        fid = record['frameId']
        assert ctx.registered[fid]['sourceFrame'] == record['sourceFrame']
        assert cloth.point(ctx.registered[fid]['points'], 'nearShoulder').tolist() == record['originalShoulder']
        masks = ctx.masks(fid)
        limbs = cloth.limbs(ctx, fid, masks)
        old_patch, old_owned = cloth.shirt(ctx, fid, masks, limbs)
        new_patch, new_owned = cloth.shirt(ctx, fid, masks, limbs, {'near': record['nearShoulder']})
        delta = np.any(old_patch != new_patch, axis=2) | (old_owned != new_owned)
        bp, bo = before[fid]
        ap, ao = after[fid]
        ap[delta] = new_patch[delta]
        ao[delta] = new_owned[delta]
        protected = ctx.protected_mask(fid)
        assert not (ao & protected).any()
        assert not ap[~ao].any()
        assert np.array_equal(ap[~delta], bp[~delta]) and np.array_equal(ao[~delta], bo[~delta])
        cap = np.array(record['originalShoulder'])
        radius = np.hypot(cloth.XX-cap[0], cloth.YY-cap[1])
        assert not (delta & (radius > 95)).any(), (fid, 'Non-local sleeve change')
        records.append({
            'frameId': fid, 'sourceFrame': record['sourceFrame'],
            'guide': record['nearShoulder'],
            'changedPixels': int(delta.sum()),
            'changedBounds': Image.fromarray(delta).getbbox(),
            'maximumDistanceFromShoulder': float(radius[delta].max()),
            'unrelatedBaselineSamplingDifferencesIgnored': int((np.any(old_patch != bp, axis=2) & ~delta).sum()),
            'protectedChanges': 0,
        })
    shared = load_context('male', registration_path=ctx.registration_path)
    provenance = manifest['provenance'] + ' Compressed second-jump shoulder-cap fitting uses source-pinned cloth-only guides at frames80-95; original anatomy, registered joints, forearm occlusion and all unrelated garment pixels stay exact. Reproduce with scripts/refine-kling-side-male-sleeves.py.'
    packed = pack_garment(shared, manifest['id'], manifest['name'], 'top',
                          {fid: p for fid, (p, _) in after.items()}, args.output,
                          provenance, ownership={fid: o for fid, (_, o) in after.items()}, painting_mode='patch')
    _, decoded = unpack(args.output.read_bytes())
    changed = []
    composites = {}
    for fid in ctx.frames:
        assert np.array_equal(decoded[fid][0], after[fid][0])
        assert np.array_equal(decoded[fid][1], after[fid][1])
        bp, bo = before[fid]; ap, ao = decoded[fid]
        if not np.array_equal(bp, ap) or not np.array_equal(bo, ao):
            changed.append(fid)
        source = ctx.frames[fid]
        old = compose(source, [trousers[fid], before[fid]])
        new = compose(source, [trousers[fid], decoded[fid]])
        assert np.array_equal(new[shared.protected_mask(fid)], source[shared.protected_mask(fid)])
        union = ao | trousers[fid][1]
        assert np.array_equal(new[~union], source[~union])
        composites[fid] = old, new
    expected = [r['frameId'] for r in recipe['frames']]
    assert changed == expected
    # Diagnostic crops decode the final garment. Root QA supplies separate
    # actual UI exports; these layouts are never used as authored assets.
    ids = [80, 82, 84, 86, 89, 91, 93, 95]
    sheet = Image.new('RGB', (720, len(ids)*260), '#eee8dd')
    draw = ImageDraw.Draw(sheet)
    for row, fid in enumerate(ids):
        p = ctx.registered[fid]['points']['nearShoulder']
        box = (int(p['x'])-75, int(p['y'])-70, int(p['x'])+105, int(p['y'])+50)
        for col, pixels in enumerate(composites[fid]):
            im = Image.fromarray(pixels).crop(box).resize((360, 240), Image.Resampling.NEAREST)
            sheet.paste(im, (col*360, row*260+20), im)
            draw.text((col*360+8, row*260+4), f'Pack {fid} / {"Before" if col==0 else "Fitted cap"} / 2x', fill='#332a25')
    sheet.save(args.review/'sleeves-before-after-2x.png', optimize=True)
    for fid in [82, 86, 89, 91]:
        for label, pixels in zip(['before', 'after'], composites[fid]):
            Image.fromarray(pixels).save(args.review/f'{label}-{fid}.png', optimize=True)
    for action in ['run', 'jump']:
        clip = ctx.manifest['animations'][action]
        frames = []
        elapsed = 0
        durations = []
        for index, fid in enumerate(clip['frames']):
            panel = Image.new('RGB', (512, 402), '#eee8dd')
            draw = ImageDraw.Draw(panel)
            for col, pixels in enumerate(composites[fid]):
                im = Image.fromarray(pixels).resize((256, 384), Image.Resampling.LANCZOS)
                panel.paste(im, (col*256, 18), im)
                draw.text((col*256+6, 3), f'{"Before" if col==0 else "After"} / {action} / {fid}', fill='#332a25')
            frames.append(panel)
            end = round((index+1)*1000/clip['fps']/10)*10
            durations.append(end-elapsed); elapsed=end
        frames[0].save(args.review/f'{action}-before-after.gif', save_all=True, append_images=frames[1:], duration=durations, disposal=2, **({'loop':0} if clip['loop'] else {}))
        with Image.open(args.review/f'{action}-before-after.gif') as gif:
            total=0
            for i in range(gif.n_frames): gif.seek(i); total+=gif.info['duration']; gif.convert('RGBA').load()
            assert total == sum(durations)
            assert ('loop' in gif.info) == bool(clip['loop'])
    report = {
        'format': 'gathria-side-male-sleeve-review', 'version': 1,
        'sourceSha256': recipe['sourceSha256'], 'registrationSha256': recipe['registrationSha256'],
        'recipeSha256': sha(RECIPE.read_bytes()), 'baselineGarmentSha256': sha(before_bytes),
        'resultGarmentSha256': sha(args.output.read_bytes()), 'sourceFramesChecked': len(ctx.frames),
        'changedFrames': changed, 'unrelatedFramesExact': len(ctx.frames)-len(changed),
        'sourceAndRegistrationUnchanged': True, 'protectedAndUnownedSourceExact': True,
        'forearmDepthUsesCanonicalJoints': True, 'records': records,
        'evidence': 'Offline decode of final garment bank; actual workbench exports are verified separately.',
        'limitations': 'Improves compressed second-jump sleeve rectangles. Raised-arm and other sleeves retain the existing fit; source blur and matte edges remain. No claim of new cloth simulation.',
    }
    (args.review/'audit.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'changedFrames': changed, 'unrelatedFramesExact': report['unrelatedFramesExact'], 'sha256': packed['sha256']}))

if __name__ == '__main__':
    main()
