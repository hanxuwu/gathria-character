#!/usr/bin/env python3
"""Refit three reviewed side-female cloth poses, preserving all source pixels.

Uses the existing painted donors and the existing near-sleeve fit. Only local
cloth control points differ. Frozen before ZIPs are required to author this
revision; verification/peeling uses the committed reversible PNG proof instead.
"""
from pathlib import Path
import argparse
import copy
import importlib.util
import io
import json
import zipfile

import numpy as np
from PIL import Image

from kling_side_authoring import ROOT, load_context, pack_garment, sha

CONTROLS = ROOT / 'artwork/wardrobe-finish/side/fit-controls.json'
OUT = ROOT / 'docs/wardrobe-finish/side'
BASE = {'top': 'side-female-cream-blouse-v1', 'bottom': 'side-female-rose-skirt-v1'}
PROVENANCE = ' Three reviewed clothing-only waist controls (walk21/run38/run39) refitted from the existing painted donors; near run sleeve retained. Exact reversible pixel proof: docs/wardrobe-finish/side/repair-report.json. Original source and registration are unchanged.'


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


bank = module('finish_side_bank', 'prepare-dual-looks-cloth.py')
fit = module('finish_side_fit', 'prepare-kling-side-female-clothing.py')
polish = module('finish_side_sleeve', 'polish-kling-side-female-sleeves.py')


def png(array):
    output = io.BytesIO()
    Image.fromarray(array).save(output, format='PNG', compress_level=9)
    return output.getvalue()


def recolor(patch, slot, palette):
    if palette is None:
        return patch.copy()
    source = np.array([241, 225, 202] if slot == 'top' else [201, 130, 137], float)
    targets = {'sea': {'top': [80, 139, 158], 'bottom': [139, 117, 88]},
               'apricot': {'top': [204, 135, 120], 'bottom': [75, 104, 128]}}
    target = np.array(targets[palette][slot], float)
    result = patch.copy()
    visible = patch[:, :, 3] > 0
    rgb = patch[visible, :3].astype(float)
    mean = np.maximum(1, rgb.mean(axis=-1))
    distance = np.linalg.norm(rgb / mean[:, None] - source / source.mean(), axis=-1)
    weight = np.clip((.5 - distance) / (.5 * .35), 0, 1) * np.clip((mean - 28) / 42, 0, 1)
    result[visible, :3] = np.rint(rgb * (1 - weight[:, None]) + np.clip(rgb * target / source, 0, 255) * weight[:, None]).astype(np.uint8)
    return result


def corrected_base(ctx, previous, controls):
    result = {}
    ctx.cloth_fit_controls = controls
    for slot in ('top', 'bottom'):
        composites = {}
        for fid in controls['frames'][slot]:
            old, owned = previous[slot][fid]
            source = ctx.frames[fid]
            before = source.copy()
            before[owned] = old[owned]
            did = fit.select(ctx, fid, slot)
            donor_path = ROOT / f'artwork/kling-side-expansion/female/source/{did:03d}-{slot}-cloth.png'
            donor = np.array(Image.open(donor_path).convert('RGBA'))
            cloth = fit.fit_top(ctx, fid, did, donor) if slot == 'top' else fit.fit_bottom(ctx, fid, did, donor)
            candidate = fit.composite(ctx, fid, cloth, slot)
            candidate[ctx.protected_mask(fid)] = before[ctx.protected_mask(fid)]
            composites[fid] = candidate
        if slot == 'top':
            proxy = copy.copy(ctx)
            proxy.manifest = copy.deepcopy(ctx.manifest)
            proxy.manifest['animations']['run']['frames'] = [38, 39]
            sleeve = np.array(Image.open(ROOT / 'artwork/kling-side-fitting/female-arm/near-puff-sleeve.png').convert('RGBA'))
            recipe = json.loads((ROOT / 'artwork/kling-side-fitting/female-arm/sleeve-fit.json').read_text())
            composites, _ = polish.fit(proxy, composites, sleeve, recipe)
        for fid in controls['frames'][slot]:
            old, owned = previous[slot][fid]
            source = ctx.frames[fid]
            before = source.copy()
            before[owned] = old[owned]
            # The donor affine fit can sample a donor edge outside the body.
            # The explicitly reviewed clothing ROI rejects those unrelated pixels.
            bounds = controls['localBounds'][slot]
            x0, y0, x1, y1 = bounds
            local = np.zeros(owned.shape, bool)
            local[y0:y1, x0:x1] = True
            local &= ~ctx.protected_mask(fid)
            candidate = before.copy()
            candidate[local] = composites[fid][local]
            new_owned = owned.copy()
            new_owned[local] = np.any(candidate[local] != source[local], axis=1)
            patch = old.copy()
            patch[local] = 0
            use = local & new_owned
            patch[use] = candidate[use]
            delta = np.any(patch != old, axis=2) | (owned != new_owned)
            assert not (delta & ~local).any()
            assert not (delta & ctx.protected_mask(fid)).any()
            result[(slot, fid)] = patch, new_owned, delta
    return result


def freeze_crop(output, item_id, fid, label, array, bbox):
    x0, y0, x1, y1 = bbox
    data = png(array[y0:y1, x0:x1])
    path = output / 'proof' / item_id / f'{fid:03d}-{label}.png'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {'path': str(path.relative_to(ROOT)), 'sha256': sha(data)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    controls = json.loads(CONTROLS.read_text())
    recipe = json.loads((ROOT / 'artwork/wardrobe-coverage/side/recipe.json').read_text())
    entries = [i for i in recipe['items'] if i['identity'] == 'female']
    previous_report = json.loads((ROOT / 'docs/wardrobe-coverage/side/repair-report.json').read_text())
    previous_hashes = {i['id']: i['sha256'] for i in previous_report['items']}
    ctx = load_context('female', registration_path=ROOT / 'artwork/kling-side-expansion/templates/female.registration.json')
    assert ctx.source_sha256 == controls['sourceSha256']
    assert ctx.registration_sha256 == controls['registrationSha256']
    baseline = {}
    for slot, item_id in BASE.items():
        path = args.baseline / f'{item_id}.zip'
        assert sha(path.read_bytes()) == previous_hashes[item_id]
        baseline[slot] = bank.read_bank(path)[4]
    revisions = corrected_base(ctx, baseline, controls)
    output = OUT if args.publish else ROOT / 'tmp-side-finish-review'
    output.mkdir(parents=True, exist_ok=True)
    report = {'format': 'gathria-side-cloth-temporal-finish', 'version': 1,
              'sourceSha256': ctx.source_sha256, 'controlsSha256': sha(CONTROLS.read_bytes()),
              'scope': 'Female side blouse and skirt, native frames 21/38/39 only; old source/registration/timing unchanged. Palette variants share the same cloth-local delta. Diagnostic metrics do not replace visual review.',
              'items': []}
    for entry in entries:
        original_path = args.baseline / f"{entry['id']}.zip"
        original_bytes = original_path.read_bytes()
        assert sha(original_bytes) == previous_hashes[entry['id']]
        manifest, _, _, _, pairs = bank.read_bank(original_path)
        before_pairs = {fid: (p.copy(), o.copy()) for fid, (p, o) in pairs.items()}
        slot = manifest['slot']
        palette = 'sea' if '-sea-' in entry['id'] else 'apricot' if '-apricot-' in entry['id'] else None
        changed_records = []
        for fid in controls['frames'][slot]:
            p, o = pairs[fid]
            new_patch, new_owned, delta = revisions[(slot, fid)]
            transformed = recolor(new_patch, slot, palette)
            p[delta] = transformed[delta]
            o[delta] = new_owned[delta]
            before_p, before_o = before_pairs[fid]
            changed = np.any(p != before_p, axis=2) | (o != before_o)
            ys, xs = np.where(changed)
            bbox = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
            record = {'frameId': fid, 'bbox': bbox, 'changedPixels': int(changed.sum()),
                      'beforePatchSha256': sha(before_p.tobytes()), 'afterPatchSha256': sha(p.tobytes()),
                      'beforeOwnershipSha256': sha(before_o.tobytes()), 'afterOwnershipSha256': sha(o.tobytes()),
                      'addedOwnershipPixels': int((o & ~before_o).sum()), 'releasedOwnershipPixels': int((before_o & ~o).sum())}
            for label, array in [('before-patch', before_p), ('after-patch', p),
                                 ('before-ownership', before_o.astype(np.uint8) * 255), ('after-ownership', o.astype(np.uint8) * 255)]:
                record[label] = freeze_crop(output, entry['id'], fid, label, array, bbox)
            changed_records.append(record)
        # Retain the old reviewed ownership permissions; every newly changed
        # protected source pixel was already rejected in corrected_base above.
        pack_ctx = copy.copy(ctx)
        if manifest['registrationSha256'] != ctx.registration_sha256:
            pack_ctx = load_context('female', registration_path=ROOT / entry['registration'])
        pack_ctx.protected_mask = lambda fid, label=None, c=ctx, b=before_pairs: c.protected_mask(fid, label) & ~b[fid][1]
        target = ROOT / entry['path'] if args.publish else output / f"{entry['id']}.zip"
        pack_garment(pack_ctx, manifest['id'], manifest['name'], slot,
                     {fid: p for fid, (p, _) in pairs.items()}, target, manifest['provenance'] + PROVENANCE,
                     ownership={fid: o for fid, (_, o) in pairs.items()}, painting_mode='patch')
        generated_manifest, files, _, _, roundtrip = bank.read_bank(target)
        final_manifest = copy.deepcopy(manifest)
        for key in ('frames', 'pages', 'provenance'):
            final_manifest[key] = generated_manifest[key]
        files['manifest.json'] = (json.dumps(final_manifest, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for filename, data in sorted(files.items()):
                info = zipfile.ZipInfo(filename, (2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, data)
        final_bytes = buffer.getvalue()
        target.write_bytes(final_bytes)
        frame_hashes = []
        for fid, (patch, owned) in roundtrip.items():
            assert np.array_equal(patch, pairs[fid][0]) and np.array_equal(owned, pairs[fid][1])
            if fid not in controls['frames'][slot]:
                assert np.array_equal(patch, before_pairs[fid][0]) and np.array_equal(owned, before_pairs[fid][1])
            frame_hashes.append({'frameId': fid, 'patchSha256': sha(patch.tobytes()), 'ownershipSha256': sha(owned.tobytes())})
        report['items'].append({'id': entry['id'], 'path': entry['path'], 'slot': slot, 'palette': palette,
                                'beforeSha256': sha(original_bytes), 'afterSha256': sha(final_bytes), 'bytes': len(final_bytes),
                                'beforeManifest': manifest, 'afterManifest': final_manifest,
                                'changedFrames': changed_records, 'frames': frame_hashes})
        print(entry['id'], [r['changedPixels'] for r in changed_records], flush=True)
    (output / 'repair-report.json').write_text(json.dumps(report, ensure_ascii=False, separators=(',', ':')) + '\n')
    print('canonicalReportSha256', sha(json.dumps(report, sort_keys=True, separators=(',', ':')).encode()))


if __name__ == '__main__':
    main()
