#!/usr/bin/env python3
"""Independently audit warm-date cloth banks and completed browser downloads.

The per-look mode runs before the capture deletes its temporary wardrobe ZIP.
It retains hashes and a full-pose composition result, not another copy of the ZIP.
No application compositor or authoring script is used for pixel reconstruction.
"""
from __future__ import annotations

import argparse
import gc
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'docs/kling-collection/warm-date-v1'
DEFINITIONS = ROOT / 'artwork/kling-collection/source/warm-date-v1/looks.json'
HELPER_PATH = ROOT / 'scripts/verify-kling-expression-shirt.py'
spec = importlib.util.spec_from_file_location('warm_date_independent_pixels', HELPER_PATH)
pixels = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pixels)
require, sha, file_sha = pixels.require, pixels.sha, pixels.file_sha
BASELINES = {'male': 'teal-camp-shirt-v5', 'female': 'coral-daydress-v9'}
COUNTS = {'male': 88, 'female': 96}
ACTIONS = {'idle', 'walk', 'run', 'jump', 'celebrate'}


def path(value):
    return Path(value) if Path(value).is_absolute() else ROOT / value


def relative(value):
    value = Path(value).resolve()
    return str(value.relative_to(ROOT)) if value.is_relative_to(ROOT) else str(value)


def stamp():
    return datetime.now(timezone.utc).isoformat()


def write_report(output, report):
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')


def look_definitions():
    definitions = json.loads(DEFINITIONS.read_bytes())
    require(len(definitions) == 6 and len({d['id'] for d in definitions}) == 6, 'Expected six unique look recipes')
    return {row['id']: row for row in definitions}


def compose_audit(project_path, pack_path, look_id):
    """Check every native RGBA pixel while the actual saved project still exists."""
    look = look_definitions()[look_id]
    project, pack = pixels.Project(project_path), pixels.Archive(pack_path)
    document, manifest, source = project.doc, pack.manifest, project.source.manifest
    catalog = json.loads((ROOT / 'docs/kling-wardrobe/catalog.json').read_bytes())
    entry = next(c for c in catalog['characters'] if c['key'] == look['character'])
    require(document['sourceSha256'] == file_sha(ROOT / entry['sourceUrl'].lstrip('/')) and
            document['registrationSha256'] == file_sha(ROOT / entry['registrationUrl'].lstrip('/')),
            'Saved project differs from published original source/registration')
    catalog_items = {item['id']: item for item in entry['items']}
    embedded_items = {item['id']: item for item in document['items']}
    for item_id in filter(None, document['selection'].values()):
        require(embedded_items[item_id]['sha256'] == catalog_items[item_id]['sha256'] ==
                file_sha(ROOT / catalog_items[item_id]['url'].lstrip('/')),
                f'{look_id}: selected saved garment differs from published bytes: {item_id}')
    library = next((bank for bank in entry.get('appearanceLibraries', [])
                    if any(style['slot'] == 'hair' and style['id'] == look['hair'] for style in bank['styles'])), None)
    bank_path = ROOT / (library['url'] if library else entry['appearanceBankUrl']).lstrip('/')
    expected_bank_sha = library['sha256'] if library else entry['appearanceRevision']['bankSha256']
    require(document['appearance']['bankSha256'] == expected_bank_sha == file_sha(bank_path),
            'Selected saved appearance differs from published bank bytes')
    require(document['selection'] == look['selection'], 'Project differs from published clothing recipe')
    require({key: document['appearance'][key] for key in ('hairId', 'hairColor', 'faceId')} ==
            {'hairId': look['hair'], 'hairColor': look['color'], 'faceId': look['face']}, 'Project differs from appearance recipe')
    require(set(manifest['animations']) == ACTIONS and manifest['animations'] == source['animations'], 'Source action timeline changed')
    require([f['id'] for f in manifest['frames']] == [f['id'] for f in source['frames']], 'Source frame IDs/order changed')
    require(len(pack.frames) == COUNTS[look['character']], 'Unexpected native frame inventory')
    require(manifest['facing'] == source['facing'] and manifest['scale'] == source['scale'], 'Source facing/scale changed')
    padding = project.padding
    require(manifest['anchor'] == {**source['anchor'], 'x': source['anchor']['x'] + padding['left'],
                                  'y': source['anchor']['y'] + padding['top']}, 'Padded source anchor changed')
    width = source['spritesheet']['frameWidth'] + padding['left'] + padding['right']
    height = source['spritesheet']['frameHeight'] + padding['top'] + padding['bottom']
    require((manifest['spritesheet']['frameWidth'], manifest['spritesheet']['frameHeight']) == (width, height), 'Native output scale changed')
    config = json.loads(pack.zip.read(manifest['configuration']))
    source_config = json.loads(project.source.zip.read(source['configuration']))
    require(config['source'] == source_config['source'] and config['derivation']['frames'] == source_config['derivation']['frames'],
            'Source frame/time provenance changed')
    require(config['sourceMetadata']['wardrobe']['selection'] == document['selection'], 'Pack clothing selection differs from saved project')
    require(config['sourceMetadata']['appearance']['selection'] == document['appearance'], 'Pack appearance differs from saved project')
    # CRC checks include the outer saved project and every embedded asset used.
    for archive in [project.zip, project.source.zip, project.bank.zip, pack.zip] + [a.zip for a in project.items.values()]:
        require(archive.testzip() is None, 'ZIP CRC failure')
    results = []
    for fid in pack.frames:
        actual = pack.frame(fid)
        expected = project.render(fid, document['appearance']['faceId'])
        require(actual.shape == expected.shape == (height, width, 4), f'{look_id}/{fid}: output geometry changed')
        changed = np.any(actual != expected, axis=2)
        require(not changed.any(), f'{look_id}/{fid}: independent composition differs at {int(changed.sum())} pixels')
        require(not actual[0, :, 3].any() and not actual[-1, :, 3].any() and
                not actual[:, 0, 3].any() and not actual[:, -1, 3].any(), f'{look_id}/{fid}: clipped outer edge')
        require(np.any(actual[:, :, 3] == 0) and np.any(actual[:, :, 3] == 255), 'Missing transparency or opaque pixels')
        results.append({'frameId': fid, 'rgbaSha256': sha(actual.tobytes()),
                        'alphaSha256': sha(actual[:, :, 3].tobytes()), 'exactSavedProjectComposition': True})
    return {'format': 'gathria-warm-date-per-look-composition', 'version': 1, 'passed': True,
            'executedAt': stamp(), 'character': look['character'], 'look': look_id,
            'project': relative(project_path), 'projectSha256': file_sha(project_path),
            'pack': relative(pack_path), 'packSha256': file_sha(pack_path),
            'sourceSha256': document['sourceSha256'], 'registrationSha256': document['registrationSha256'],
            'selection': document['selection'], 'appearance': document['appearance'],
            'verifierSha256': file_sha(Path(__file__)), 'independentPixelHelperSha256': file_sha(HELPER_PATH),
            'nativeSize': [width, height], 'padding': padding, 'sourceTimelineAndAnchorExact': True,
            'garmentHeadAndHandProtectionChecked': True, 'faceAlphaAndRegisteredBoundsChecked': True,
            'frames': results,
            'method': 'Independent Pillow/NumPy straight-alpha reconstruction of every frame from the actual saved wardrobe ZIP; includes all selected cloth, hair, color and refined face layers.',
            'limitations': ['Selected existing expression and hairstyle layers intentionally alter registered face/hair pixels; original face is not claimed unchanged under those layers.',
                            'The temporary project can be deleted after this successful audit; its full bytes are not retained in this report.']}


def assets_audit():
    definitions = look_definitions()
    catalog = json.loads((ROOT / 'docs/kling-wardrobe/catalog.json').read_bytes())
    report = {'items': [], 'donors': [], 'sourceFiles': []}
    for character in ('male', 'female'):
        entry = next(c for c in catalog['characters'] if c['key'] == character)
        source_path, registration_path = [ROOT / entry[k].lstrip('/') for k in ('sourceUrl', 'registrationUrl')]
        source = pixels.Archive(source_path)
        registration = json.loads(registration_path.read_bytes())
        records = {r['frameId']: r for r in registration['frames']}
        require(len(source.frames) == COUNTS[character] and set(source.frames) == set(records), 'Source/registration inventory mismatch')
        baseline_path = ROOT / f'docs/kling-wardrobe/garments/{character}/{BASELINES[character]}.zip'
        baseline = pixels.Archive(baseline_path)
        require(baseline.zip.testzip() is None, 'Baseline ZIP CRC failure')
        report['sourceFiles'].append({'character': character, 'source': relative(source_path), 'sourceSha256': file_sha(source_path),
                                      'registration': relative(registration_path), 'registrationSha256': file_sha(registration_path),
                                      'baseline': relative(baseline_path), 'baselineSha256': file_sha(baseline_path)})
        donor_path = DEFINITIONS.parent / f'{character}-donors.json'
        donor = json.loads(donor_path.read_bytes())
        donor_image = donor_path.parent / donor['image']
        with Image.open(donor_image) as image:
            image.load()
            require(list(image.size) == donor.get('imageSize', donor.get('traceSize')), 'Donor image dimensions differ from traced definition')
        report['donors'].append({'character': character, 'definition': relative(donor_path), 'definitionSha256': file_sha(donor_path),
                                 'image': relative(donor_image), 'imageSha256': file_sha(donor_image),
                                 'note': 'Retained donor hash and dimensions checked; polygon quality is a separate visual review.'})
        for look in [d for d in definitions.values() if d['character'] == character]:
            item_id = look['garmentId']
            item_path = ROOT / f'docs/kling-wardrobe/garments/{character}/{item_id}.zip'
            bank = pixels.Archive(item_path)
            require(bank.zip.testzip() is None, f'{item_id}: ZIP CRC failure')
            manifest = bank.manifest
            require(manifest['id'] == item_id, 'Garment identity mismatch')
            require(item_path.stat().st_size <= 64*1024*1024 and len(manifest['pages']) <= 4 and
                    sum(p['width']*p['height'] for p in manifest['pages']) <= 32*1024*1024,
                    'Garment archive/page budgets exceeded')
            require(manifest['sourceSha256'] == file_sha(source_path) and
                    manifest['registrationSha256'] == file_sha(registration_path), 'Garment source/registration mismatch')
            require(set(manifest) == set(baseline.manifest), 'Unexpected garment manifest schema')
            for key in set(manifest) - {'id', 'name', 'provenance'}:
                require(manifest[key] == baseline.manifest[key], f'{item_id}: baseline {key} changed')
            require(set(bank.frames) == set(source.frames), 'Missing or extra garment pose')
            require(len(manifest['frames']) == len(bank.frames), 'Duplicate garment pose')
            catalog_item = next(i for i in entry['items'] if i['id'] == item_id)
            require(catalog_item['sha256'] == file_sha(item_path), 'Catalog garment hash differs')
            preset = next(p for p in entry['presets'] if p['id'] == look['id'])
            require(preset == {key: look[key] for key in ('id', 'name', 'selection')}, 'Catalog preset differs from recipe')
            pages = []
            for page in manifest['pages']:
                require(bank.zip.read(page['maskFile']) == baseline.zip.read(page['maskFile']), 'Ownership mask bytes changed')
                before, after = [pixels.rgba(a.zip.read(page['file'])) for a in (baseline, bank)]
                mask = pixels.rgba(bank.zip.read(page['maskFile']))[:, :, 3]
                require(after.shape == before.shape == (page['height'], page['width'], 4), 'Atlas dimensions changed')
                require(np.array_equal(after[:, :, 3], before[:, :, 3]), 'Atlas alpha changed')
                require(np.all((mask == 0) | (mask == 255)), 'Nonbinary ownership')
                require(np.array_equal(after[mask == 0], before[mask == 0]) and not after[mask == 0].any(), 'Unowned atlas RGBA changed')
                pages.append({'file': page['file'], 'alphaExact': True, 'ownershipBytesExact': True,
                              'changedClothRgbPixels': int(np.any(after[:, :, :3] != before[:, :, :3], axis=2).sum())})
                del before, after, mask
            frames = []
            for fid, frame in bank.frames.items():
                native = source.frame(fid)
                patch, owned = bank.paint(frame)
                old_patch, old_owned = baseline.paint(baseline.frames[fid])
                require(np.array_equal(owned, old_owned) and np.array_equal(patch[:, :, 3], old_patch[:, :, 3]), 'Pose alpha/ownership changed')
                x, y = frame['offset']['x'], frame['offset']['y']
                h, w = owned.shape
                require(x >= 0 and y >= 0 and y+h <= native.shape[0] and x+w <= native.shape[1], 'Garment lies outside native source')
                xx, yy = np.meshgrid(np.arange(x, x+w)+.5, np.arange(y, y+h)+.5)
                protected = pixels.inside_polygons([r['polygon'] for r in records[fid]['protected']], xx, yy)
                original = native[y:y+h, x:x+w]
                require(not np.any(owned & protected & (original[:, :, 3] > 0)), f'{item_id}/{fid}: protected source ownership')
                changed = np.any(patch != old_patch, axis=2)
                require(not np.any(changed & ~owned), 'Changed pixels outside original cloth ownership')
                require(changed.any(), f'{item_id}/{fid}: donor contributes no new cloth pixels')
                frames.append({'frameId': fid, 'rgbaSha256': sha(patch.tobytes()), 'ownershipSha256': sha(owned.tobytes()),
                               'changedClothPixels': int(changed.sum()), 'baselineAlphaOwnershipGeometryExact': True,
                               'sourceHeadAndHandsOutsideClothExact': True})
            report['items'].append({'id': item_id, 'character': character, 'look': look['id'], 'file': relative(item_path),
                                    'sha256': file_sha(item_path), 'bytes': item_path.stat().st_size, 'pages': pages, 'frames': frames})
            print(f'Asset audit: {item_id}, {len(frames)} source poses', flush=True)
            del bank
            gc.collect()
        del source, baseline
        gc.collect()
    require(sum(len(item['frames']) for item in report['items']) == 552, 'Expected 552 clothed source poses')
    report['passed'] = True
    return report


def evidence_audit(index_path):
    evidence = json.loads(index_path.read_bytes())
    require(evidence.get('passed') is True and evidence.get('finishedAt') and evidence.get('production') is True,
            'Capture is incomplete or not production; no planned checks count as execution')
    definitions = look_definitions()
    require({r['look'] for r in evidence['packs']} == set(definitions) and len(evidence['packs']) == 6, 'Six-look capture incomplete')
    for field in ('errors', 'consoleErrors', 'failedRequests', 'externalRequests', 'independentEditorRequests'):
        require(evidence[field] == [], f'Browser error records: {field}')
    for url, expected in evidence['expectedAssets'].items():
        local = ROOT / url.lstrip('/')
        require(file_sha(local) == expected['sha256'] and local.stat().st_size == expected['bytes'], 'Captured asset changed')
    capture_script = index_path.parent / 'capture-script.mjs'
    if not capture_script.is_file():
        capture_script = ROOT / 'scripts/capture-kling-warm-date-collection.mjs'
    require(file_sha(capture_script) == evidence['scriptSha256'], 'Captured browser script changed')
    require(file_sha(path(evidence['definitionsSnapshot'])) == evidence['definitionsSha256'] == file_sha(DEFINITIONS),
            'Captured look recipes changed')
    for url, expected in evidence['compiledJsSha256'].items():
        require(file_sha(ROOT / 'dist' / url.lstrip('/')) == expected, 'Captured production JavaScript changed')
    for url, expected in evidence['productionHtmlSha256'].items():
        require(file_sha(ROOT / 'dist' / url.lstrip('/')) == expected, 'Captured production HTML changed')
    for response in evidence['scriptResponses']:
        require(response['sha256'] == evidence['compiledJsSha256'][urlsplit(response['url']).path], 'Served script hash not in captured production build')
    for response in evidence['assetResponses']:
        expected = evidence['productionAssets'][urlsplit(response['url']).path]
        require(response['sha256'] == expected['sha256'] and response['bytes'] == expected['bytes'], 'Served asset differs from production mapping')
    for logical in evidence['expectedAssets']:
        require(any(logical in response['logicalUrls'] for response in evidence['assetResponses']), 'A required published asset was not observed in browser responses')
    report = {'evidenceIndex': relative(index_path), 'evidenceIndexSha256': file_sha(index_path),
              'captureFinishedAt': evidence['finishedAt'], 'downloads': [], 'packs': [], 'pngs': [], 'gifs': [],
              'mirrorPairs': [], 'mixes': [], 'playback': []}
    downloads = evidence['downloads']
    require(len({d['file'] for d in downloads}) == len(downloads), 'Duplicate download paths')
    cache = {}
    for row in downloads + evidence['screenshots']:
        if row.get('deletedAfterExactReopen'):
            require(row['kind'] == 'project', 'Only temporary saved projects may be deleted')
            continue
        local = path(row['file'])
        require(local.stat().st_size == row['bytes'] and file_sha(local) == row['sha256'], f'Artifact hash/size differs: {local}')
        result = {'file': row['file'], 'sha256': row['sha256'], 'bytes': row['bytes']}
        if local.suffix == '.zip':
            result['archive'] = pixels.scan_zip(local.read_bytes(), row['file'], cache)
        elif local.suffix == '.png':
            with Image.open(local) as image:
                image.load()
                result.update(width=image.width, height=image.height, mode=image.mode)
        elif local.suffix == '.gif':
            frames, delays, loop = pixels.read_gif(local)
            result.update(frames=len(frames), delaysMs=delays, loop=loop)
            del frames
        else:
            raise AssertionError(f'Unexpected download kind: {local}')
        report['downloads'].append(result)
    for row in evidence['packs']:
        look_id, pack_path = row['look'], path(row['file'])
        look = definitions[look_id]
        audit_row = row.get('compositionAudit') or next(a for a in evidence['compositionAudits'] if a['look'] == look_id)
        audit_path = path(audit_row['file'])
        require(file_sha(audit_path) == audit_row['sha256'], 'Per-look composition audit hash differs')
        audit = json.loads(audit_path.read_bytes())
        require(audit['passed'] and audit['packSha256'] == row['sha256'] == file_sha(pack_path) and
                audit['projectSha256'] == row['projectSha256'], 'Composition audit input hashes differ')
        require(audit['independentPixelHelperSha256'] == file_sha(HELPER_PATH), 'Independent reconstruction helper changed')
        require(file_sha(path(audit['verifierSnapshot'])) == audit['verifierSha256'], 'Per-look verifier snapshot hash differs')
        require(audit['selection'] == row['selection'] == look['selection'] and audit['appearance'] == row['appearance'], 'Captured look selection differs')
        pack = pixels.Archive(pack_path)
        require(pack.manifest == row['manifest'], 'Recorded pack manifest differs')
        saved = next(r for r in evidence['reopened'] if r['look'] == look_id)
        require(saved['sha256'] == audit['projectSha256'] and saved['exactRgbaAfterReopen'] is True and
                saved['selection'] == audit['selection'] and saved['appearance'] == audit['appearance'], 'Exact saved-project reopen evidence differs')
        require(len(audit['frames']) == COUNTS[look['character']], 'Composition audit frame count differs')
        for frame in audit['frames']:
            actual = pack.frame(frame['frameId'])
            require(sha(actual.tobytes()) == frame['rgbaSha256'] and sha(actual[:, :, 3].tobytes()) == frame['alphaSha256'], 'Pack differs from audited full-pose composition')
        pngs = [p for p in downloads if p['kind'] == 'png' and p['look'] == look_id]
        require(len(pngs) == 6 and {(p['action'], p['facing']) for p in pngs} ==
                {(a, 'right') for a in ACTIONS} | {('run', 'left')}, 'PNG action/facing coverage differs')
        for png in pngs:
            expected = pack.frame(png['frameId'])
            if png['facing'] == 'left':
                expected = expected[:, ::-1]
            actual = pixels.rgba(path(png['file']).read_bytes())
            require(np.array_equal(actual, expected), f'Actual PNG differs from full pack RGBA: {png["file"]}')
            report['pngs'].append({'file': png['file'], 'frameId': png['frameId'], 'facing': png['facing'],
                                   'exactPackRgba': True, 'rgbaSha256': sha(actual.tobytes())})
        gifs = [g for g in evidence['gifs'] if g['look'] == look_id]
        require({(g['action'], g['facing']) for g in gifs} == {('run', 'right'), ('run', 'left'), ('jump', 'right')}, 'GIF coverage differs')
        for gif in gifs:
            clip = pack.manifest['animations'][gif['action']]
            expected = {fid: pack.frame(fid) for fid in set(clip['frames'])}
            report['gifs'].append(pixels.gif_audit(gif, expected, pack.manifest))
            del expected
        right, left = [next(g for g in gifs if g['action'] == 'run' and g['facing'] == facing) for facing in ('right', 'left')]
        rf, rd, rl = pixels.read_gif(path(right['file']))
        lf, ld, ll = pixels.read_gif(path(left['file']))
        require(rd == ld and rl == ll and len(rf) == len(lf), 'Run GIF mirror schedules differ')
        require(all(np.array_equal(l, r[:, ::-1]) for l, r in zip(lf, rf)), 'Run GIF left/right pixels are not exact mirrors')
        report['mirrorPairs'].append({'look': look_id, 'right': right['file'], 'left': left['file'], 'allDecodedFramesExactMirror': True})
        del rf, lf
        report['packs'].append({'look': look_id, 'character': look['character'], 'file': row['file'], 'sha256': row['sha256'],
                                'compositionAudit': audit_row, 'frames': len(audit['frames']), 'selection': row['selection'],
                                'appearance': row['appearance'], 'allPackFrameHashesMatchIndependentComposition': True,
                                'exactSavedProjectReopenRecorded': True})
        del pack
        gc.collect()
    require(len(evidence['mixes']) == 6 and {m['look'] for m in evidence['mixes']} == set(definitions), 'Six supplemental mix cases are required')
    for mixed in evidence['mixes']:
        require(mixed['exactRgbaAfterRestore'] is True and mixed['appearancePreserved'] is True,
                'Supplemental clothing mix failed exact restore or appearance preservation')
        download = next(d for d in downloads if d['kind'] == 'mix-png' and d['look'] == mixed['look'])
        require(download['file'] == mixed['png'] and download['sha256'] == mixed['pngSha256'], 'Mixed PNG capture hashes differ')
        report['mixes'].append({'look': mixed['look'], 'file': mixed['png'], 'sha256': mixed['pngSha256'],
                                'slot': mixed['slot'], 'from': mixed['from'], 'to': mixed['to'],
                                'decodedAndHashChecked': True, 'exactRestoreAndAppearancePreservationRecorded': True,
                                'scope': 'Supplemental actual PNG and browser restore observation; not independently reconstructed as a second full CharacterPack.'})
    seen = set()
    packs = {p['look']: p for p in evidence['packs']}
    for row in evidence['playback']:
        identity = row['look'], row['action'], row['facing']
        require(identity not in seen, 'Duplicate player action/facing case')
        seen.add(identity)
        manifest = packs[row['look']]['manifest']
        for observation in row['observed']:
            require(observation['frameId'] == manifest['animations'][observation['action']]['frames'][observation['position']], 'Observed player frame does not follow source schedule')
        selected = [o for o in row['observed'] if o['action'] == row['action']]
        require(len({o['position'] for o in selected}) >= 3, 'Insufficient player progress observed')
        wraps = sum(b['position'] < a['position'] for a, b in zip(selected, selected[1:]))
        clip = manifest['animations'][row['action']]
        require(wraps > 0 if clip['loop'] else any(o['action'] == 'idle' for o in row['observed']), 'Loop/one-shot return not observed')
        report['playback'].append({'look': row['look'], 'action': row['action'], 'facing': row['facing'],
                                   'observedPositions': len({o['position'] for o in selected}), 'loopOrReturnObserved': True})
    require(seen == {(look, action, facing) for look in definitions for action in ACTIONS for facing in ('right', 'left')}, 'Expected 60 player cases')
    report['passed'] = True
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, default=DEST / 'evidence/final-v1/evidence-index.json')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--assets-only', action='store_true')
    parser.add_argument('--project', type=Path)
    parser.add_argument('--pack', type=Path)
    parser.add_argument('--look')
    args = parser.parse_args()
    if args.project or args.pack or args.look:
        require(all((args.project, args.pack, args.look, args.output)), 'Per-look audit requires --project, --pack, --look, --output')
        report = compose_audit(args.project.resolve(), args.pack.resolve(), args.look)
        snapshot = args.output.parent / f'composition-verifier-{report["verifierSha256"][:16]}.py'
        snapshot.parent.mkdir(parents=True, exist_ok=True)
        if snapshot.exists():
            require(file_sha(snapshot) == report['verifierSha256'], 'Existing verifier snapshot differs')
        else:
            snapshot.write_bytes(Path(__file__).read_bytes())
        report['verifierSnapshot'] = relative(snapshot)
        write_report(args.output, report)
        print(json.dumps({'passed': True, 'look': args.look, 'exactCompositionFrames': len(report['frames']), 'output': relative(args.output)}))
        return
    report = {'format': 'gathria-warm-date-independent-verification', 'version': 1, 'passed': False,
              'executedAt': stamp(), 'verifierSha256': file_sha(Path(__file__)),
              'independentPixelHelperSha256': file_sha(HELPER_PATH), 'assets': assets_audit(),
              'limitations': ['Asset checks establish exact original garment cut/alpha/ownership and source bindings, not aesthetic acceptance.',
                              'Asset-only execution does not establish completed browser downloads, saved-project reconstruction or playback.']}
    if not args.assets_only:
        report['evidence'] = evidence_audit(args.index.resolve())
        report['limitations'] = [report['limitations'][0],
                                'Saved project pixels were independently reconstructed per look before the temporary project was deleted.',
                                'Browser execution is evidenced by the capture records; this offline audit checks their files and observations.',
                                'GIF palette comparisons are tolerance based; PNG and native CharacterPack comparisons are exact RGBA.']
    report['passed'] = True
    output = args.output or DEST / ('asset-validation.json' if args.assets_only else 'artifact-validation.json')
    write_report(output, report)
    print(json.dumps({'passed': True, 'garments': len(report['assets']['items']), 'clothedSourcePoses': 552,
                      'browserEvidenceChecked': not args.assets_only, 'output': relative(output)}))


if __name__ == '__main__':
    main()
