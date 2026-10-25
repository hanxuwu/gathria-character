#!/usr/bin/env python3
"""Verify the small completed recommended-look PNG/GIF capture, without new art.

This intentionally performs file/geometry/timing and a PNG-to-GIF keyframe check,
not the saved-project/full-pack reconstruction performed by the main verifier.
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT/'scripts/verify-kling-expression-shirt.py'
spec = importlib.util.spec_from_file_location('expression_verifier', HELPER)
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, default=ROOT/'docs/kling-expression-shirt/evidence/recommended-v1/evidence-index.json')
    parser.add_argument('--output', type=Path, default=ROOT/'docs/kling-expression-shirt/recommended-artifact-validation.json')
    args = parser.parse_args()
    data = args.index.read_bytes()
    capture = json.loads(data)
    v.require(capture.get('passed') is True and capture.get('finishedAt'), 'Supplemental capture is incomplete')
    v.require(capture['mode'] == 'current-recommended-outfits' and capture['production'], 'Expected production recommended-look capture')
    v.require(len(capture['matrix']) == 4 and len(capture['gifs']) == 4 and len(capture['downloads']) == 16, 'Supplemental coverage incomplete')
    v.require(capture['packs'] == capture['projects'] == capture['playback'] == [], 'Unexpected supplemental pack/project/playback records')
    expected = {('male', 'day-soft-cuff'), ('male', 'wedding-curved-cuff'), ('female', 'day-smooth-waist'), ('female', 'wedding-smooth-waist')}
    v.require({(r['character'], r['presetId']) for r in capture['matrix']} == expected, 'Recommended preset coverage mismatch')
    for key in ('errors', 'consoleErrors', 'failedRequests', 'externalRequests', 'independentEditorRequests'):
        v.require(capture[key] == [], f'Capture failure records: {key}')
    catalog_file = ROOT/'docs/kling-wardrobe/catalog.json'
    v.require(v.file_sha(catalog_file) == capture['catalogSha256'], 'Catalog bytes changed')
    catalog = json.loads(catalog_file.read_bytes())
    build_files = {**capture['compiledJsSha256'], 'dist/workbench.html': capture['productionHtmlSha256']}
    snapshot = args.index.parent/'capture-script.mjs'
    script = snapshot if snapshot.is_file() else ROOT/'scripts/capture-kling-expression-shirt.mjs'
    build_files[str(script.relative_to(ROOT))] = capture['scriptSha256']
    for file, digest in {**build_files, **capture['inputs']}.items():
        v.require(v.file_sha(ROOT/file) == digest, f'Captured input/build hash mismatch: {file}')
    v.require(all(r['sha256'] == capture['catalogSha256'] for r in capture['catalogResponses']), 'Served catalog checksum mismatch')
    v.require(all(r['compiledSha256'] in capture['compiledJsSha256'].values() for r in capture['scriptRequests']), 'Unrecorded production script request')
    report = {'format': 'gathria-recommended-look-independent-artifact-verification', 'version': 1, 'passed': False,
              'captureIndex': str(args.index.relative_to(ROOT)), 'captureIndexSha256': v.sha(data),
              'verifierSha256': v.file_sha(Path(__file__)), 'helperSha256': v.file_sha(HELPER),
              'capturedBuildFiles': build_files, 'artifacts': [], 'looks': [],
              'limitations': ['This supplement has no saved projects or CharacterPacks; full-frame project reconstruction belongs to artifact-validation.json for the main capture.',
                              'All GIF frames are decoded and native-clock timing is checked. Only source frame 55 has a corresponding run PNG for direct pixel comparison; other GIF frame identities rely on the recorded capture schedule.',
                              'GIF colors are compared after opaque matte and half-size box averaging with measured lossy-palette error, not exact RGB equality.',
                              'Canvas readback may premultiply and round translucent RGB. Native PNG geometry is checked against capture canvas metadata; its raw RGB hash is not claimed canvas-identical.']}
    rows = capture['downloads']+capture['screenshots']
    v.require(len({r['file'] for r in rows}) == len(rows), 'Duplicate artifact paths')
    gif_cache = {}
    for row in rows:
        path = ROOT/row['file']
        v.require(path.stat().st_size == row['bytes'] and v.file_sha(path) == row['sha256'], f"Artifact hash/size mismatch: {row['file']}")
        result = {k: row[k] for k in ('file', 'kind', 'bytes', 'sha256')}
        if path.suffix == '.png':
            with Image.open(path) as im:
                im.load()
                result.update(width=im.width, height=im.height, mode=im.mode)
        elif path.suffix == '.gif':
            gif_cache[row['file']] = v.read_gif(path)
            frames, delays, loop = gif_cache[row['file']]
            result.update(frames=len(frames), width=frames[0].shape[1], height=frames[0].shape[0], delaysMs=delays, loop=loop)
        else:
            raise AssertionError('Unexpected supplemental artifact type')
        report['artifacts'].append(result)
    v.require(all(r['actualUiDownload'] for r in capture['downloads']), 'Supplement includes non-UI download')
    for row in capture['matrix']:
        entry = next(c for c in catalog['characters'] if c['key'] == row['character'])
        preset = next(p for p in entry['presets'] if p['id'] == row['presetId'])
        v.require(row['selection'] == preset['selection'] and row['presetName'] == preset['name'], 'Recommended preset selection differs from catalog')
        v.require(row['faceId'] == 'joyful', 'Recommended look lost Joyful')
        selected = {value for value in row['selection'].values() if value is not None}
        v.require({i['id'] for i in row['items']} == selected, 'Selected garment provenance incomplete')
        for item in row['items']:
            current = next(i for i in entry['items'] if i['id'] == item['id'])
            v.require(item['sha256'] == current['sha256'] == v.file_sha(ROOT/item['url'].lstrip('/')), 'Selected garment hash mismatch')
        with zipfile.ZipFile(ROOT/entry['sourceUrl'].lstrip('/')) as archive:
            source = json.loads(archive.read('manifest.json'))
        bank = next(b for b in entry['appearanceLibraries'] if any(s['id'] == row['hairId'] for s in b['styles']))
        bank_path = ROOT/bank['url'].lstrip('/')
        v.require(v.file_sha(bank_path) == bank['sha256'], 'Selected appearance bank checksum mismatch')
        with zipfile.ZipFile(bank_path) as archive:
            padding = json.loads(archive.read('manifest.json'))['padding']
        width = source['spritesheet']['frameWidth']+padding['left']+padding['right']
        height = source['spritesheet']['frameHeight']+padding['top']+padding['bottom']
        v.require(len(row['pngs']) == 3 and {(p['action'], p['frameId']) for p in row['pngs']} == {('idle', 0), ('run', 55), ('jump', 86)}, 'Recommended keyframe coverage incomplete')
        pngs = []
        for png in row['pngs']:
            arr = v.rgba((ROOT/png['file']).read_bytes())
            v.require(arr.shape == (height, width, 4) and (png['uiCanvas']['width'], png['uiCanvas']['height']) == (width, height), 'Native PNG geometry changed')
            v.require(np.any(arr[:, :, 3] == 0) and np.any((arr[:, :, 3] > 0) & (arr[:, :, 3] < 255)), 'Native PNG lost transparency/soft alpha')
            v.require(source['animations'][png['action']]['frames'][png['position']] == png['frameId'], 'Native PNG source-clock position mismatch')
            pngs.append({'file': png['file'], 'frameId': png['frameId'], 'rgbaSha256': v.sha(arr.tobytes()), 'nativeGeometryAndSoftAlpha': True})
        key = f"{row['character']}-{row['presetId']}-joyful"
        gif = next(g for g in capture['gifs'] if g['key'] == key)
        v.require(gif['action'] == 'run' and gif['facing'] == 'right' and gif['faceId'] == 'joyful' and gif['hairId'] == row['hairId'], 'Recommended GIF selection mismatch')
        frames, delays, loop = gif_cache[gif['file']]
        clip = source['animations']['run']
        rounded = [(math.floor((i+1)*100/clip['fps']+.5)-math.floor(i*100/clip['fps']+.5))*10 for i in range(len(clip['frames']))]
        v.require(gif['sourceSchedule'] == clip and len(frames) == len(clip['frames']), 'GIF native schedule/frame count mismatch')
        v.require(delays == rounded == gif['delaysMs'] and loop == 0 and clip['loop'], 'GIF timing/loop mismatch')
        v.require(all(f.shape == ((height+1)//2, (width+1)//2, 3) for f in frames), 'GIF half-native dimensions mismatch')
        png = next(p for p in row['pngs'] if p['frameId'] == 55)
        target = v.compact(v.rgba((ROOT/png['file']).read_bytes()))
        actual = frames[clip['frames'].index(55)]
        error = np.abs(actual.astype(float)-target.astype(float))
        foreground = np.max(np.abs(target.astype(float)-v.MATTE), axis=2) > 5
        character_error = float(error[foreground].mean())
        v.require(character_error <= 12, 'GIF frame 55 differs from native PNG beyond palette tolerance')
        report['looks'].append({'character': row['character'], 'presetId': row['presetId'], 'presetName': row['presetName'], 'selection': row['selection'],
                                'items': row['items'], 'appearanceBankSha256': bank['sha256'], 'hairId': row['hairId'], 'faceId': row['faceId'],
                                'pngs': pngs, 'gif': {'file': gif['file'], 'frames': len(frames), 'delaysMs': delays, 'durationMs': sum(delays),
                                                    'nativeClockRoundingExact': True, 'loopFlagExact': True, 'checkedFrameId': 55,
                                                    'keyframeMeanRgbError': round(float(error.mean()), 4), 'keyframeCharacterMeanRgbError': round(character_error, 4)}})
    report['passed'] = True
    report['summary'] = {'looks': len(report['looks']), 'pngDownloads': 12, 'gifDownloads': 4, 'decodedGifFrames': sum(l['gif']['frames'] for l in report['looks']),
                         'screenshots': len(capture['screenshots']), 'artifacts': len(report['artifacts'])}
    args.output.write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'passed': True, **report['summary'], 'output': str(args.output.relative_to(ROOT))}))


if __name__ == '__main__':
    main()
