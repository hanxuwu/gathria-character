#!/usr/bin/env python3
"""Audit six city-fashion garments and their actual production UI exports.

The completed warm-date verifier is imported unchanged and hash pinned. Its
independent saved-project compositor and export checks are configured with this
collection's recipes. The asset audit below handles a baseline and slot per
garment, including the female utility top. No historical evidence is rewritten.
"""
from __future__ import annotations

import argparse
import gc
import importlib.util
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'docs/kling-collection/city-fashion-v1'
DEFINITIONS = ROOT / 'artwork/kling-collection/source/city-fashion-v1/looks.json'
BASE_VERIFIER = ROOT / 'scripts/verify-kling-warm-date.py'
BASE_SHA = '31a75e5332ec7812242953ec2167fad8ac1dd55b3fa2fac15f48acc0edb8122e'
PIXEL_SHA = 'c13a325d3e2962ae9efea41ff9a8d0286fc059a9ec851f1fb26fad7700b2d93d'
EXPECTED = {
    'city-ivory-zip-shirt-v1': ('male', 'top', 'teal-camp-shirt-v5'),
    'campus-sky-knit-polo-v1': ('male', 'top', 'teal-camp-shirt-v5'),
    'retro-burgundy-bowling-shirt-v1': ('male', 'top', 'teal-camp-shirt-v5'),
    'city-ink-zip-top-v1': ('female', 'top', 'plum-pintuck-top-v1'),
    'campus-periwinkle-dress-v1': ('female', 'fullBody', 'coral-daydress-v9'),
    'retro-cherry-check-dress-v1': ('female', 'fullBody', 'coral-daydress-v9'),
}


def digest(file):
    import hashlib
    with Path(file).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


if digest(BASE_VERIFIER) != BASE_SHA:
    raise AssertionError('Frozen warm-date verifier changed; review the dependency before reuse.')
spec = importlib.util.spec_from_file_location('city_fashion_frozen_verifier', BASE_VERIFIER)
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
base.DEST, base.DEFINITIONS = DEST, DEFINITIONS
pixels, require, relative = base.pixels, base.require, base.relative
require(digest(base.HELPER_PATH) == PIXEL_SHA, 'Frozen independent pixel decoder changed')


def definitions():
    looks = base.look_definitions()
    require({look['garmentId'] for look in looks.values()} == set(EXPECTED), 'Unexpected city-fashion garment inventory')
    for look in looks.values():
        actual = (look['character'], look['garmentSlot'], look['baseGarmentId'])
        require(actual == EXPECTED[look['garmentId']], f'{look["id"]}: unexpected baseline or slot')
        require(look['selection'][look['garmentSlot']] == look['garmentId'], 'Look does not select its new garment')
        require(look['face'] is None if look['id'] in ('city-ivory', 'city-ink') else look['face'] in ('gentle-v2', 'joyful-v2'),
                'Original/refined expression recipe differs from the collection brief')
    return looks


def dependencies():
    return {'baseVerifier': {'file': relative(BASE_VERIFIER), 'sha256': BASE_SHA, 'modified': False},
            'independentPixels': {'file': relative(base.HELPER_PATH), 'sha256': PIXEL_SHA, 'modified': False},
            'configuration': {'definitions': relative(DEFINITIONS), 'definitionsSha256': digest(DEFINITIONS),
                              'outputRoot': relative(DEST),
                              'perItemBaselineAndSlot': {item: list(value) for item, value in EXPECTED.items()}}}


def confined_output(output):
    output = output.resolve()
    require(output.is_relative_to(DEST.resolve()), 'Write new audit evidence only inside city-fashion-v1')
    return output


def assets_audit():
    looks = definitions()
    catalog = json.loads((ROOT / 'docs/kling-wardrobe/catalog.json').read_bytes())
    report = {'items': [], 'donors': [], 'sourceFiles': []}
    for character in ('male', 'female'):
        entry = next(c for c in catalog['characters'] if c['key'] == character)
        source_path, reg_path = [ROOT / entry[key].lstrip('/') for key in ('sourceUrl', 'registrationUrl')]
        source = pixels.Archive(source_path)
        records = {frame['frameId']: frame for frame in json.loads(reg_path.read_bytes())['frames']}
        source_sha, reg_sha = digest(source_path), digest(reg_path)
        require(len(source.frames) == base.COUNTS[character] and set(source.frames) == set(records), 'Original source/registration pose inventory differs')
        report['sourceFiles'].append({'character': character, 'source': relative(source_path), 'sourceSha256': source_sha,
                                      'registration': relative(reg_path), 'registrationSha256': reg_sha})
        donor_path = DEFINITIONS.parent / f'{character}-donors.json'
        donor = json.loads(donor_path.read_bytes())
        image_path = donor_path.parent / donor['image']
        with Image.open(image_path) as image:
            image.load()
            require(list(image.size) == donor.get('imageSize', donor.get('traceSize')), 'Donor PNG differs from traced dimensions')
        report['donors'].append({'character': character, 'definition': relative(donor_path), 'definitionSha256': digest(donor_path),
                                 'image': relative(image_path), 'imageSha256': digest(image_path),
                                 'scope': 'Retained donor bytes/dimensions; traced material boundaries require visual review.'})
        for look in [item for item in looks.values() if item['character'] == character]:
            item_id, baseline_id = look['garmentId'], look['baseGarmentId']
            bank_path = ROOT / f'docs/kling-wardrobe/garments/{character}/{item_id}.zip'
            baseline_path = ROOT / f'docs/kling-wardrobe/garments/{character}/{baseline_id}.zip'
            require(digest(baseline_path) == look['baseGarmentSha256'], f'{item_id}: reviewed baseline bytes changed')
            bank, baseline = pixels.Archive(bank_path), pixels.Archive(baseline_path)
            manifest = bank.manifest
            require(bank.zip.testzip() is None and baseline.zip.testzip() is None, 'Garment/baseline ZIP CRC failure')
            require(manifest['id'] == item_id and manifest['slot'] == look['garmentSlot'] == baseline.manifest['slot'], 'Garment identity/slot differs')
            require(manifest['sourceSha256'] == source_sha and manifest['registrationSha256'] == reg_sha, 'Garment source/registration binding differs')
            require(set(manifest) == set(baseline.manifest), 'Garment manifest schema differs from its reviewed cut')
            for key in set(manifest) - {'id', 'name', 'provenance'}:
                require(manifest[key] == baseline.manifest[key], f'{item_id}: baseline {key} changed')
            require(set(bank.frames) == set(source.frames) and len(manifest['frames']) == len(bank.frames), 'Missing, extra or duplicate garment pose')
            require(bank_path.stat().st_size <= 64*1024*1024 and len(manifest['pages']) <= 4 and
                    sum(page['width']*page['height'] for page in manifest['pages']) <= 32*1024*1024, 'Garment archive/page budget exceeded')
            catalog_item = next(item for item in entry['items'] if item['id'] == item_id)
            require(catalog_item['sha256'] == digest(bank_path) and catalog_item['slot'] == look['garmentSlot'], 'Published catalog garment differs')
            preset = next(item for item in entry['presets'] if item['id'] == look['id'])
            require(preset == {key: look[key] for key in ('id', 'name', 'selection')}, 'Published preset differs from recipe')
            pages, frames = [], []
            for page in manifest['pages']:
                require(bank.zip.read(page['maskFile']) == baseline.zip.read(page['maskFile']), 'Original ownership PNG bytes changed')
                before, after = [pixels.rgba(archive.zip.read(page['file'])) for archive in (baseline, bank)]
                mask = pixels.rgba(bank.zip.read(page['maskFile']))[:, :, 3]
                require(before.shape == after.shape == (page['height'], page['width'], 4), 'Atlas dimensions changed')
                require(np.array_equal(before[:, :, 3], after[:, :, 3]), 'Original atlas alpha changed')
                require(np.all((mask == 0) | (mask == 255)) and not after[mask == 0].any(), 'Ownership nonbinary or unowned RGBA nonzero')
                require(np.array_equal(before[mask == 0], after[mask == 0]), 'Unowned source atlas pixels changed')
                pages.append({'file': page['file'], 'alphaExact': True, 'ownershipPngBytesExact': True,
                              'changedClothRgbPixels': int(np.any(before[:, :, :3] != after[:, :, :3], axis=2).sum())})
                del before, after, mask
            for fid, frame in bank.frames.items():
                native = source.frame(fid)
                patch, owned = bank.paint(frame)
                before, before_owned = baseline.paint(baseline.frames[fid])
                require(np.array_equal(owned, before_owned) and np.array_equal(patch[:, :, 3], before[:, :, 3]), 'Pose alpha/ownership changed')
                x, y = frame['offset']['x'], frame['offset']['y']
                h, w = owned.shape
                require(x >= 0 and y >= 0 and x+w <= native.shape[1] and y+h <= native.shape[0], 'Patch outside native source frame')
                xx, yy = np.meshgrid(np.arange(x, x+w)+.5, np.arange(y, y+h)+.5)
                regions = [next((review for review in manifest.get('handProtectionReviews', [])
                                 if review['frameId'] == fid and review['label'] == region['label']), region)['polygon']
                           for region in records[fid]['protected']]
                protected = pixels.inside_polygons(regions, xx, yy)
                require(not np.any(owned & protected & (native[y:y+h, x:x+w, 3] > 0)), f'{item_id}/{fid}: registered head/hand ownership')
                changed = np.any(patch != before, axis=2)
                require(changed.any() and not np.any(changed & ~owned), 'Missing new cloth or changes outside original ownership')
                frames.append({'frameId': fid, 'rgbaSha256': pixels.sha(patch.tobytes()), 'ownershipSha256': pixels.sha(owned.tobytes()),
                               'changedClothPixels': int(changed.sum()), 'baselineAlphaOwnershipGeometryExact': True,
                               'registeredHeadAndHandsOutsideCloth': True})
            report['items'].append({'id': item_id, 'character': character, 'look': look['id'], 'slot': look['garmentSlot'],
                                    'file': relative(bank_path), 'sha256': digest(bank_path), 'bytes': bank_path.stat().st_size,
                                    'baseline': {'id': baseline_id, 'file': relative(baseline_path), 'sha256': digest(baseline_path)},
                                    'pages': pages, 'frames': frames})
            print(f'Asset audit: {item_id}, {look["garmentSlot"]}, {len(frames)} poses', flush=True)
            del bank, baseline
            gc.collect()
        del source
        gc.collect()
    require(len(report['items']) == 6 and sum(len(item['frames']) for item in report['items']) == 552, 'Expected six garments / 552 poses')
    report['passed'] = True
    return report


def compose_audit(project, pack, look_id, output):
    look = definitions()[look_id]
    report = base.compose_audit(project.resolve(), pack.resolve(), look_id)
    report.update(format='gathria-city-fashion-per-look-composition', verifierSha256=digest(__file__),
                  dependencies=dependencies(), faceStyleId=look['face'], originalFaceSelection=look['face'] is None,
                  faceAlphaAndRegisteredBoundsChecked=True if look['face'] else None,
                  method='Independent full-pose Pillow/NumPy reconstruction from the actual saved project through the frozen verifier. Selected clothing/hair and the optional face layer are included.',
                  limitations=['A null face selection adds no face layer; selected hairstyles may cover registered forehead/hair pixels.',
                               'The temporary project may be deleted after this successful hash-bound audit.'])
    snapshot = output.parent / f'composition-verifier-{report["verifierSha256"][:16]}.py'
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    if snapshot.exists():
        require(digest(snapshot) == report['verifierSha256'], 'Verifier snapshot bytes differ')
    else:
        snapshot.write_bytes(Path(__file__).read_bytes())
    report['verifierSnapshot'] = relative(snapshot)
    base.write_report(output, report)
    return report


def aggregate_capture_indexes(index_paths, output, *, write=True):
    """Combine references after validating two genuine character capture runs.

    This is an evidence index, not a third browser capture. The two original
    indexes, origins and editor/player timelines remain individually identified.
    """
    require(len(index_paths) == 2, 'Aggregation requires exactly two completed character indexes')
    output = confined_output(output)
    if write:
        require(not output.exists(), 'Preserve an existing aggregate index; choose a fresh --index path')
    looks, runs, source_rows = definitions(), [], []
    seen_characters = set()
    for index_path in index_paths:
        index_path = index_path.resolve()
        require(index_path.is_relative_to(DEST.resolve()), 'Aggregate only this collection’s capture indexes')
        run = json.loads(index_path.read_bytes())
        require(run.get('passed') is True and run.get('production') is True and run.get('finishedAt'), 'Character capture is incomplete')
        characters = {pack['character'] for pack in run['packs']}
        require(len(characters) == 1, 'Each source index must represent one character')
        character = next(iter(characters))
        require(character in base.COUNTS and character not in seen_characters, 'Duplicate or unknown character capture')
        seen_characters.add(character)
        expected_looks = {look['id'] for look in looks.values() if look['character'] == character}
        require(len(run['packs']) == 3 and {pack['look'] for pack in run['packs']} == expected_looks, 'Character capture must contain its three exact looks')
        for field in ('reopened', 'mixes', 'compositionAudits'):
            require(len(run[field]) == 3 and {row['look'] for row in run[field]} == expected_looks, f'Character capture incomplete: {field}')
        require(len(run['gifs']) == 9 and len([row for row in run['downloads'] if row['kind'] == 'png']) == 18 and
                len([row for row in run['downloads'] if row['kind'] == 'mix-png']) == 3, 'Expected 21 PNGs and nine GIFs per character capture')
        cases = {(row['look'], row['action'], row['facing']) for row in run['playback']}
        require(len(run['playback']) == 30 and cases == {(look, action, facing) for look in expected_looks
                for action in base.ACTIONS for facing in ('right', 'left')}, 'Expected 30 distinct player cases per source capture')
        for field in ('errors', 'consoleErrors', 'failedRequests', 'externalRequests', 'independentEditorRequests'):
            require(run[field] == [], f'Character capture errors: {field}')
        times = [datetime.fromisoformat(run[key].replace('Z', '+00:00')) for key in ('startedAt', 'editorsClosedAt', 'finishedAt')]
        require(times[0] <= times[1] <= times[2], 'Invalid per-capture editor closure timeline')
        require(digest(base.path(run['scriptSnapshot'])) == run['scriptSha256'] and
                digest(base.path(run['definitionsSnapshot'])) == run['definitionsSha256'] == digest(DEFINITIONS),
                'Character capture script/recipe snapshot hash differs')
        source_rows.append({'character': character, 'file': relative(index_path), 'sha256': digest(index_path),
                            'run': run['run'], 'server': run['server'], 'startedAt': run['startedAt'],
                            'editorsClosedAt': run['editorsClosedAt'], 'finishedAt': run['finishedAt'],
                            'lookCount': 3, 'playerCases': 30,
                            'timelineScope': 'Editor closure is recorded for this capture only, before its own player loop.'})
        runs.append(run)
    require(seen_characters == {'male', 'female'}, 'Need both character capture timelines')
    shared = ('catalogSha256', 'definitionsSha256', 'scriptSha256', 'compiledJsSha256', 'productionHtmlSha256')
    for field in shared:
        require(runs[0][field] == runs[1][field], f'Character captures used different pinned {field}')
    aggregate = {'format': 'gathria-city-fashion-capture-aggregation', 'version': 1, 'passed': True, 'production': True,
                 'run': output.parent.name, 'actualBrowserCapture': False, 'aggregatedAt': base.stamp(),
                 'startedAt': min(run['startedAt'] for run in runs), 'finishedAt': max(run['finishedAt'] for run in runs),
                 'timeRangeMeaning': 'The envelope of the two source capture timelines, not a new browser run.',
                 'scope': 'References to two independently completed character captures. No global editor-closure ordering is asserted.',
                 'sourceCaptures': source_rows, 'aggregatorSha256': digest(__file__),
                 **{field: runs[0][field] for field in shared}}
    for field in ('expectedAssets', 'productionAssets'):
        merged = {}
        for run in runs:
            for key, row in run[field].items():
                if key in merged:
                    require(all(merged[key][value] == row[value] for value in ('sha256', 'bytes')), 'Shared production asset bytes differ')
                    if field == 'productionAssets':
                        merged[key]['logicalUrls'] = sorted(set(merged[key]['logicalUrls']) | set(row['logicalUrls']))
                else:
                    merged[key] = dict(row)
        aggregate[field] = merged
    for field in ('downloads', 'gifs', 'screenshots', 'reopened', 'packs', 'playback', 'compositionAudits', 'mixes',
                  'assetResponses', 'scriptResponses', 'htmlResponses', 'errors', 'consoleErrors', 'failedRequests',
                  'externalRequests', 'independentEditorRequests'):
        aggregate[field] = [{**row, 'captureEvidenceIndex': source['file']} if isinstance(row, dict) else row
                            for source, run in zip(source_rows, runs) for row in run[field]]
    order = {look_id: position for position, look_id in enumerate(looks)}
    aggregate['packs'].sort(key=lambda row: order[row['look']])
    require(len({row['file'] for row in aggregate['downloads']}) == len(aggregate['downloads']), 'Capture downloads overlap')
    aggregate['retainedBytes'] = sum(run['retainedBytes'] for run in runs)
    if write:
        output.parent.mkdir(parents=True, exist_ok=True)
    for key, filename in (('scriptSnapshot', 'capture-script.mjs'), ('definitionsSnapshot', 'looks.json')):
        target = output.parent / filename
        original = base.path(runs[0][key])
        if write:
            require(not target.exists(), 'Preserve existing aggregate snapshot; choose a fresh --index directory')
            target.write_bytes(original.read_bytes())
        else:
            require(digest(target) == digest(original), 'Aggregate snapshot differs from the original capture')
        aggregate[key] = relative(target)
    if write:
        base.write_report(output, aggregate)
    return aggregate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, default=DEST / 'evidence/final-v1/evidence-index.json')
    parser.add_argument('--indexes', nargs=2, type=Path,
                        help='Two completed male/female capture indexes; write their reference-only aggregate to --index before verification.')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--assets-only', action='store_true')
    parser.add_argument('--project', type=Path)
    parser.add_argument('--pack', type=Path)
    parser.add_argument('--look')
    args = parser.parse_args()
    require(not args.indexes or not (args.assets_only or args.project or args.pack or args.look), 'Aggregation is a full-evidence mode')
    if args.project or args.pack or args.look:
        require(all((args.project, args.pack, args.look, args.output)), 'Per-look mode requires --project --pack --look --output')
        report = compose_audit(args.project, args.pack, args.look, confined_output(args.output))
        print(json.dumps({'passed': True, 'look': args.look, 'exactCompositionFrames': len(report['frames']), 'output': relative(args.output)}))
        return
    if args.indexes:
        aggregate_capture_indexes(args.indexes, args.index)
    output = confined_output(args.output or DEST / ('asset-validation.json' if args.assets_only else 'artifact-validation.json'))
    report = {'format': 'gathria-city-fashion-independent-verification', 'version': 1, 'passed': False,
              'executedAt': base.stamp(), 'verifierSha256': digest(__file__), 'dependencies': dependencies(),
              'assets': assets_audit(), 'browserEvidenceChecked': not args.assets_only,
              'limitations': ['Exact cut/alpha/ownership/source binding checks do not establish aesthetic acceptance.',
                              'Asset-only execution does not establish completed browser exports or playback.']}
    if not args.assets_only:
        require(args.index.resolve().is_relative_to(DEST.resolve()), 'Use this collection’s capture index')
        report['evidence'] = base.evidence_audit(args.index.resolve())
        evidence = report['evidence']
        require(len(evidence['pngs']) == 36 and len(evidence['mixes']) == 6 and len(evidence['gifs']) == 18 and
                sum(pack['frames'] for pack in evidence['packs']) == 552 and len(evidence['playback']) == 60,
                'Final city-fashion export coverage differs')
        for pack in evidence['packs']:
            audit = json.loads(base.path(pack['compositionAudit']['file']).read_bytes())
            require(audit['dependencies'] == report['dependencies'], 'Per-look reconstruction used different dependency/configuration bytes')
        capture = json.loads(args.index.read_bytes())
        city_mix = next(row for row in capture['mixes'] if row['look'] == 'city-ink')
        require((city_mix['slot'], city_mix['from'], city_mix['to']) == ('bottom', 'ochre-shorts', 'navy-shorts'),
                'City ink must demonstrate the alternate shorts combination')
        city_png = next(row for row in capture['downloads'] if row['kind'] == 'mix-png' and row['look'] == 'city-ink')
        require(city_png['selection'] == {**definitions()['city-ink']['selection'], 'bottom': 'navy-shorts'},
                'City ink mixed PNG selection differs from the declared alternate shorts')
        next(row for row in evidence['mixes'] if row['look'] == 'city-ink')['declaredAlternateShortsSelectionChecked'] = True
        if capture.get('sourceCaptures'):
            require('editorsClosedAt' not in capture, 'Aggregate must not invent a global editor-closure timestamp')
            reconstructed = aggregate_capture_indexes([base.path(source['file']) for source in capture['sourceCaptures']],
                                                       args.index, write=False)
            require({key: value for key, value in capture.items() if key != 'aggregatedAt'} ==
                    {key: value for key, value in reconstructed.items() if key != 'aggregatedAt'},
                    'Aggregate rows, coverage or pinned build differ from the original capture indexes')
            report['sourceCaptures'] = capture['sourceCaptures']
            report['timelineScope'] = 'Each source capture closed its own editors before its own player checks. No cross-capture ordering is asserted.'
        report['limitations'] = [report['limitations'][0],
                                'Saved-project reconstruction ran per look before temporary project deletion; native PNG/pack comparisons are exact RGBA.',
                                'GIF palette comparisons use measured tolerance; timing and mirror comparisons are exact.',
                                'Recorded browser observations establish capture chronology; this offline audit independently checks their artifacts and schedules.']
    report['passed'] = True
    base.write_report(output, report)
    print(json.dumps({'passed': True, 'garments': 6, 'clothedSourcePoses': 552,
                      'browserEvidenceChecked': not args.assets_only, 'output': relative(output)}))


if __name__ == '__main__':
    main()
