#!/usr/bin/env python3
"""Independently decode and verify completed production expression/shirt exports.

Pillow and NumPy only: this does not import the application compositor or rely on
the browser report's passed flag as a pixel-verification result. Temporary saved
projects must still be present. Original evidence is never modified.
"""
from __future__ import annotations

import argparse
import gc
import hashlib
import io
import json
import math
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / 'docs/kling-expression-shirt/evidence/final-v1/evidence-index.json'
ACTIONS = {'idle', 'walk', 'run', 'jump', 'celebrate'}
MATTE = np.array([238, 233, 223], dtype=np.float64)


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def rgba(data):
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        return np.array(image.convert('RGBA'))


def crop(array, rect):
    x, y, w, h = [rect[k] for k in ('x', 'y', 'width', 'height')]
    require(x >= 0 and y >= 0 and x+w <= array.shape[1] and y+h <= array.shape[0], 'Invalid atlas rectangle')
    return array[y:y+h, x:x+w]


class Archive:
    """Read one source/pack page at a time, or small authored mask/patch pages."""
    def __init__(self, data):
        self.zip = zipfile.ZipFile(io.BytesIO(data) if isinstance(data, bytes) else data)
        self.manifest = json.loads(self.zip.read('manifest.json'))
        self.page_key = None
        self.page_array = None
        self.authored = {}
        self.frames = {f.get('id', f.get('frameId')): f for f in self.manifest.get('frames', [])}

    def frame(self, fid):
        f = self.frames[fid]
        pages = [self.manifest['spritesheet']] + self.manifest.get('additionalSheets', [])
        p = pages[f.get('page', 0)]
        if p['file'] != self.page_key:
            self.page_array = rgba(self.zip.read(p['file']))
            self.page_key = p['file']
            require(self.page_array.shape[:2] == (p['height'], p['width']), 'Atlas dimensions disagree with manifest')
        return crop(self.page_array, f).copy()

    def paint(self, f):
        p = self.manifest['pages'][f['page']]
        if f['page'] not in self.authored:
            patch = rgba(self.zip.read(p['file']))
            mask = rgba(self.zip.read(p['maskFile']))[:, :, 3]
            require(patch.shape[:2] == mask.shape == (p['height'], p['width']), 'Authored atlas dimensions differ')
            require(np.all((mask == 0) | (mask == 255)), 'Ownership alpha is not binary')
            require(not np.any((mask == 0) & (patch[:, :, 3] != 0)), 'Paint outside ownership')
            self.authored[f['page']] = patch, mask
        p, m = self.authored[f['page']]
        return crop(p, f['rect']), crop(m, f['rect']) == 255


def inside_polygons(polygons, xx, yy):
    """Pixel-center ray crossings, including vertices and horizontal boundaries."""
    result = np.zeros(xx.shape, dtype=bool)
    for polygon in polygons:
        inside = np.zeros(xx.shape, dtype=bool)
        boundary = np.zeros(xx.shape, dtype=bool)
        for a, b in zip(polygon[-1:] + polygon[:-1], polygon):
            ax, ay, bx, by = a['x'], a['y'], b['x'], b['y']
            if ay != by:
                intersection = ax + (yy-ay) * (bx-ax) / (by-ay)
                inside ^= ((ay > yy) != (by > yy)) & (xx <= intersection)
                boundary |= (np.abs(intersection-xx) < 1e-9) & (yy >= min(ay, by)) & (yy <= max(ay, by))
            else:
                boundary |= (np.abs(yy-ay) < 1e-9) & (xx >= min(ax, bx)-1e-9) & (xx <= max(ax, bx)+1e-9)
        result |= inside | boundary
    return result


def inside_rect(rect, xx, yy):
    return ((xx >= rect['x']) & (yy >= rect['y']) &
            (xx <= rect['x']+rect['width']) & (yy <= rect['y']+rect['height']))


class Project:
    """Independent replacement and straight-alpha reconstruction from saved ZIP."""
    def __init__(self, path):
        self.zip = zipfile.ZipFile(path)
        self.doc = json.loads(self.zip.read('document.json'))
        self.source_bytes = self.zip.read('source.character.zip')
        require(sha(self.source_bytes) == self.doc['sourceSha256'], 'Project source hash mismatch')
        self.source = Archive(self.source_bytes)
        reg = self.zip.read('registration.json')
        require(sha(reg) == self.doc['registrationSha256'], 'Project registration hash mismatch')
        self.registration = {f['frameId']: f for f in json.loads(reg)['frames']}
        bank_bytes = self.zip.read('appearance.zip')
        require(sha(bank_bytes) == self.doc['appearance']['bankSha256'], 'Project appearance hash mismatch')
        self.bank = Archive(bank_bytes)
        self.poses = {p['frameId']: p for p in self.bank.manifest['poses']}
        self.items = {}
        for i, item in enumerate(self.doc['items']):
            data = self.zip.read(f'item-{i}.zip')
            require(sha(data) == item['sha256'], 'Embedded garment hash mismatch')
            archive = Archive(data)
            require(archive.manifest['id'] == item['id'], 'Embedded garment ID mismatch')
            self.items[item['id']] = archive
        for a in [self.bank] + list(self.items.values()):
            require(a.manifest['sourceSha256'] == self.doc['sourceSha256'], 'Asset bound to different source')
            require(a.manifest['registrationSha256'] == self.doc['registrationSha256'], 'Asset bound to different registration')
        self.padding = self.bank.manifest['padding']

    def render(self, fid, face='joyful'):
        original = self.source.frame(fid)
        h, w = original.shape[:2]
        dressed = original.copy()
        # Authored garments replace owned RGBA; selected slot order is explicit.
        for slot in ('shoes', 'bottom', 'top', 'fullBody'):
            name = self.doc['selection'].get(slot)
            if not name:
                continue
            item = self.items[name]
            f = item.frames[fid]
            patch, owned = item.paint(f)
            x, y = f['offset']['x'], f['offset']['y']
            target = dressed[y:y+patch.shape[0], x:x+patch.shape[1]]
            require(target.shape == patch.shape, 'Garment outside native frame')
            xx, yy = np.meshgrid(np.arange(x, x+patch.shape[1])+.5, np.arange(y, y+patch.shape[0])+.5)
            regions = []
            for region in self.registration[fid]['protected']:
                review = next((r for r in item.manifest.get('handProtectionReviews', []) if r['frameId'] == fid and r['label'] == region['label']), region)
                regions.append(review['polygon'])
            protected = inside_polygons(regions, xx, yy)
            require(not np.any(owned & protected & (original[y:y+patch.shape[0], x:x+patch.shape[1], 3] > 0)),
                    f'{name}/{fid}: garment changes protected source head/hand pixels')
            target[owned] = patch[owned]
        p = self.padding
        output = np.zeros((h+p['top']+p['bottom'], w+p['left']+p['right'], 4), np.uint8)
        output[p['top']:p['top']+h, p['left']:p['left']+w] = dressed
        pose = self.poses[fid]
        selection = self.doc['appearance']
        styles = [s for s in self.bank.manifest['styles'] if s['id'] in (selection['hairId'], face)]
        layers = sorted((layer for s in styles for layer in s['layers']),
                        key=lambda l: ['hair-back', 'face', 'hair-front'].index(l['role']))
        for layer in layers:
            f = next(f for f in layer['frames'] if f['frameId'] == fid)
            if f['mode'] == 'source':
                continue
            patch, owned = self.bank.paint(f)
            hh, ww = owned.shape
            x, y = f['offset']['x'], f['offset']['y']
            xx, yy = np.meshgrid(np.arange(x, x+ww)+.5, np.arange(y, y+hh)+.5)
            native = (xx >= 0) & (yy >= 0) & (xx < w) & (yy < h)
            sx, sy = np.clip(xx.astype(int), 0, w-1), np.clip(yy.astype(int), 0, h-1)
            sa = np.where(native, original[sy, sx, 3], 0)
            foreground = (sa > 0) & inside_polygons(
                pose['foreground'] + [r['polygon'] for r in self.registration[fid]['protected'] if r['label'] != 'head'], xx, yy)
            ox, oy = x+p['left'], y+p['top']
            require(ox >= 0 and oy >= 0 and ox+ww <= output.shape[1] and oy+hh <= output.shape[0], 'Appearance clips padding')
            target = output[oy:oy+hh, ox:ox+ww]
            if layer['role'] == 'face':
                legal = inside_rect(pose['headBounds'], xx, yy) & inside_polygons([pose['facePolygon']], xx, yy) & (sa > 0) & ~foreground
                require(not np.any(owned & ~legal), f'Face ownership outside protected bounds: {fid}')
                require(np.array_equal(patch[:, :, 3][owned], sa[owned]), f'Face changes source alpha: {fid}')
                target[owned] = patch[owned]
                continue
            require(not np.any(owned & ~inside_rect(pose['hairBounds'], xx, yy)), 'Hair outside registered bounds')
            if layer['role'] == 'hair-front':
                occlusion = inside_rect(pose.get('hairOcclusionBounds', pose['headBounds']), xx, yy)
                owned = owned & ~foreground & ~((~occlusion) & native & ((sa > 0) | (dressed[sy, sx, 3] > 0)))
            back = layer['role'] == 'hair-back'
            owned = owned & (patch[:, :, 3] > 0)
            if back:
                owned &= target[:, :, 3] < 255
            s, d = patch[owned].astype(np.float64), target[owned].astype(np.float64)
            a, b = s[:, 3:4]/255, d[:, 3:4]/255
            sw, dw = (a*(1-b), b) if back else (a, b*(1-a))
            alpha = sw+dw
            factors = {'chestnut': [1, 1, 1], 'espresso': [.63, .65, .69], 'copper': [1.2, 1.05, .83]}[selection['hairColor']]
            color = np.minimum(255, np.floor(s[:, :3]*factors+.5))
            result = np.concatenate((np.floor((color*sw+d[:, :3]*dw)/alpha+.5), np.floor(alpha*255+.5)), axis=1)
            target[owned] = result.astype(np.uint8)
        return output


def compact(frame, facing='right'):
    h, w = frame.shape[:2]
    require(h % 2 == w % 2 == 0, 'This verifier expects the captured even native dimensions')
    a = frame[:, :, 3:4].astype(np.float64)/255
    rgb = frame[:, :, :3]*a + MATTE*(1-a)
    rgb = np.floor(rgb.reshape(h//2, 2, w//2, 2, 3).mean(axis=(1, 3))+.5).astype(np.uint8)
    return rgb[:, ::-1] if facing == 'left' else rgb


def scan_zip(data, label, cache):
    digest = sha(data)
    if digest in cache:
        return {'sha256': digest, 'sameArchiveAs': cache[digest]}
    cache[digest] = label
    members = []
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        require(len(z.namelist()) == len(set(z.namelist())), f'Duplicate ZIP names: {label}')
        for info in z.infolist():
            blob = z.read(info.filename)  # Also validates each member CRC.
            row = {'file': info.filename, 'bytes': len(blob), 'sha256': sha(blob)}
            if info.filename.endswith('.png'):
                with Image.open(io.BytesIO(blob)) as im:
                    im.load()
                    row.update(width=im.width, height=im.height, mode=im.mode)
            elif info.filename.endswith('.zip'):
                row['archive'] = scan_zip(blob, label+'!'+info.filename, cache)
            elif info.filename.endswith('.json'):
                json.loads(blob)
            members.append(row)
    return {'sha256': digest, 'members': members, 'crcAndPngDecode': True}


def read_gif(path):
    with Image.open(path) as im:
        loop = im.info.get('loop')
        frames, delays = [], []
        for frame in ImageSequence.Iterator(im):
            frame.load()
            frames.append(np.array(frame.convert('RGB')))
            delays.append(frame.info.get('duration', 0))
        return frames, delays, loop


def gif_audit(row, expected_frames, source):
    frames, delays, loop = read_gif(ROOT/row['file'])
    clip = source['animations'][row['action']]
    expected_delays = [(math.floor((i+1)*100/clip['fps']+.5)-math.floor(i*100/clip['fps']+.5))*10 for i in range(len(clip['frames']))]
    require(clip == row['sourceSchedule'], f"GIF schedule metadata changed: {row['file']}")
    require(delays == expected_delays == row['delaysMs'], f"GIF native-clock rounding failed: {row['file']}")
    require(len(frames) == len(clip['frames']) == row['frames'], 'GIF frame count mismatch')
    require((loop == 0) if clip['loop'] else (loop is None), 'GIF loop flag mismatch')
    candidates = {fid: compact(expected_frames[fid], row['facing']) for fid in set(clip['frames'])}
    # Grayscale nearest-pose checks tolerate the actual GIF's lossy palette.
    samples = {fid: c[::3, ::3].mean(axis=2).astype(np.float32) for fid, c in candidates.items()}
    rows = []
    for index, (actual, fid) in enumerate(zip(frames, clip['frames'])):
        expected = candidates[fid]
        require(actual.shape == expected.shape, 'GIF dimensions changed')
        mask = np.max(np.abs(expected.astype(float)-MATTE), axis=2) > 5
        error = np.abs(actual.astype(float)-expected.astype(float))
        gray = actual[::3, ::3].mean(axis=2)
        distances = {candidate: float(np.abs(gray-sample).mean()) for candidate, sample in samples.items()}
        closest = min(distances.values())
        require(distances[fid] <= closest+.15, f"GIF source order mismatch at {row['file']}:{index}")
        foreground_error = float(error[mask].mean()) if mask.any() else 0.0
        require(foreground_error <= 12, f"GIF palette error exceeds declared tolerance: {row['file']}:{index}")
        rows.append({'position': index, 'expectedFrameId': fid, 'closestFrameIds': [f for f, d in distances.items() if d <= closest+.15],
                     'meanRgbError': round(float(error.mean()), 4), 'characterMeanRgbError': round(foreground_error, 4),
                     'meanGrayscaleError': round(distances[fid], 4)})
    return {'file': row['file'], 'frames': len(frames), 'delaysMs': delays, 'durationMs': sum(delays),
            'nativeClockRoundingExact': True, 'loopFlagExact': True, 'sourceOrderWithinPaletteTolerance': True, 'comparisons': rows}


def png_expression_audit(rows):
    release = json.loads((ROOT/'docs/kling-expression/release-index.json').read_bytes())
    results = []
    for character, look, hair in sorted({(r['character'], r['look'], r['hairId']) for r in rows}):
        bank_info = next(b['release'] for b in release['banks'] if b['character'] == character and any(s['id'] == hair for s in b['release']['styles']))
        path = ROOT/bank_info['url'].lstrip('/')
        require(file_sha(path) == bank_info['sha256'], 'Expression bank changed since release')
        bank = Archive(path)
        p = bank.manifest['padding']
        selection = [r for r in rows if (r['character'], r['look'], r['hairId']) == (character, look, hair)]
        for natural in [r for r in selection if r['faceId'] is None]:
            original = rgba((ROOT/natural['file']).read_bytes())
            for face in ('gentle', 'joyful'):
                row = next(r for r in selection if r['faceId'] == face and r['frameId'] == natural['frameId'])
                actual = rgba((ROOT/row['file']).read_bytes())
                require(actual.shape == original.shape, 'Expression PNG geometry changed')
                require(np.array_equal(actual[:, :, 3], original[:, :, 3]), 'Expression PNG alpha changed')
                allowed = np.zeros(original.shape[:2], dtype=bool)
                style = next(s for s in bank.manifest['styles'] if s['id'] == face)
                for layer in style['layers']:
                    f = next(f for f in layer['frames'] if f['frameId'] == row['frameId'])
                    if f['mode'] == 'source':
                        continue
                    _, owned = bank.paint(f)
                    x, y = f['offset']['x']+p['left'], f['offset']['y']+p['top']
                    allowed[y:y+owned.shape[0], x:x+owned.shape[1]] |= owned
                changed = np.any(actual != original, axis=2)
                require(not np.any(changed & ~allowed), f"Expression changed pixels outside face ownership: {row['file']}")
                results.append({'file': row['file'], 'reference': natural['file'], 'bankSha256': bank_info['sha256'],
                                'alphaExact': True, 'pixelsOutsideFaceOwnershipExact': True, 'changedPixels': int(changed.sum())})
        del bank
        gc.collect()
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, default=DEFAULT)
    parser.add_argument('--output', type=Path, default=ROOT/'docs/kling-expression-shirt/artifact-validation.json')
    args = parser.parse_args()
    index_bytes = args.index.read_bytes()
    evidence = json.loads(index_bytes)
    require(evidence.get('passed') is True and evidence.get('finishedAt'), 'Capture is incomplete; leave original evidence alone and retry after finishedAt/passed')
    require(evidence['mode'] == 'final-looks' and evidence['production'] is True, 'Expected final production capture')
    require(len(evidence['matrix']) == 24 and len(evidence['packs']) == 5 and len(evidence['projects']) == 5 and len(evidence['gifs']) == 24 and len(evidence['playback']) == 50, 'Final capture coverage incomplete')
    hairs = {'male': ('side-part', 'airy-tousle'), 'female': ('tucked-bun', 'ribbon-pony')}
    expected_matrix = {(c, look, hair, face) for c, styles in hairs.items() for hair in styles
                       for look in ('day', 'wedding') for face in (None, 'gentle', 'joyful')}
    require({(r['character'], r['look'], r['hairId'], r['faceId']) for r in evidence['matrix']} == expected_matrix,
            'Expression/hair/look matrix is incomplete')
    for row in evidence['matrix']:
        require(len(row['pngs']) == 4 and {(p['action'], p['frameId']) for p in row['pngs']} == {('idle', 0), ('run', 55), ('jump', 86), ('celebrate', 78)}, 'Native keyframe matrix is incomplete')
    expected_keys = {f'{c}-{look}-joyful' for c in hairs for look in ('day', 'wedding')} | {'male-midnight-sailor-joyful'}
    require({p['key'] for p in evidence['packs']} == {p['key'] for p in evidence['projects']} == expected_keys, 'Missing expected saved look/pack')
    for key in ('errors', 'consoleErrors', 'failedRequests', 'externalRequests', 'independentEditorRequests'):
        require(evidence[key] == [], f'Browser failure records: {key}')
    report = {'format': 'gathria-expression-shirt-independent-artifact-verification', 'version': 1, 'passed': False,
              'evidenceIndex': str(args.index.relative_to(ROOT)), 'evidenceIndexSha256': sha(index_bytes),
              'verifierSha256': file_sha(Path(__file__)),
              'method': 'Independent Pillow/NumPy decode and saved-project reconstruction; no application rendering imports.',
              'limitations': ['Browser execution chronology is recorded by the capture; this offline audit independently checks its files and observations, not the historical browser process.',
                              'GIF uses opaque matte, half-size box averaging and a lossy palette. Color comparison uses measured grayscale/RGB errors; it is not claimed palette-exact to PNG.',
                              'GIF nearest-pose matching checks temporal pose order, not exact tiny facial features. Lossless expression PNG ownership checks and pack reconstruction provide the stronger facial-pixel evidence.',
                              'Browser canvas readback may round translucent RGB through premultiplied alpha; the recorded canvas digest is reported separately from the lossless PNG digest. Native PNG/pack comparisons use straight RGBA.',
                              'Reconstruction checks exported pixels against saved inputs. Anatomical and artistic quality still requires visual review; independent full-pose face ownership audit is linked separately.',
                              'Temporary wardrobe ZIPs must remain present to reproduce this audit.'],
              'artifacts': [], 'packs': [], 'gifs': [], 'mirrorPairs': [], 'pngs': [], 'playback': []}
    cache = {}
    downloads = {row['file']: row for row in evidence['downloads']}
    require(len(downloads) == len(evidence['downloads']), 'Duplicate download paths')
    require(all(row['actualUiDownload'] is True for row in evidence['downloads']), 'Non-UI artifact mislabeled as a download')
    for row in evidence['downloads'] + evidence['screenshots']:
        path = ROOT/row['file']
        require(path.stat().st_size == row['bytes'] and file_sha(path) == row['sha256'], f"Artifact size/hash mismatch: {row['file']}")
        result = {k: row[k] for k in ('file', 'kind', 'bytes', 'sha256')}
        if path.suffix == '.zip':
            result['archive'] = scan_zip(path.read_bytes(), row['file'], cache)
        elif path.suffix == '.png':
            with Image.open(path) as im:
                im.load()
                result.update(width=im.width, height=im.height, mode=im.mode)
        elif path.suffix == '.gif':
            frames, delays, loop = read_gif(path)
            result.update(frames=len(frames), width=frames[0].shape[1], height=frames[0].shape[0], delaysMs=delays, loop=loop)
            del frames
        else:
            raise AssertionError(f'Unexpected final artifact kind: {path}')
        report['artifacts'].append(result)
    for file, digest in evidence['inputs'].items():
        require(file_sha(ROOT/file) == digest, f'Source input hash changed: {file}')
    script_snapshot = args.index.parent/'capture-script.mjs'
    script_file = script_snapshot if script_snapshot.is_file() else ROOT/'scripts/capture-kling-expression-shirt.mjs'
    build_files = {**evidence['compiledJsSha256'],
                   'dist/workbench.html': evidence['productionHtmlSha256'],
                   str(script_file.relative_to(ROOT)): evidence['scriptSha256'],
                   'docs/kling-wardrobe/catalog.json': evidence['catalogSha256']}
    for file, digest in build_files.items():
        require(file_sha(ROOT/file) == digest, f'Captured build/input changed: {file}')
    require(all(r['sha256'] == evidence['catalogSha256'] for r in evidence['catalogResponses']), 'Served catalog mismatch')
    require(all(r['compiledSha256'] in evidence['compiledJsSha256'].values() for r in evidence['scriptRequests']), 'Unrecorded production JavaScript')
    report['capturedBuildFiles'] = build_files
    png_rows = [p for row in evidence['matrix'] for p in row['pngs']]
    for row in png_rows:
        arr = rgba((ROOT/row['file']).read_bytes())
        require(arr.shape[:2] == (row['uiCanvas']['height'], row['uiCanvas']['width']), 'PNG canvas geometry mismatch')
        digest = sha(arr.tobytes())
        report['pngs'].append({'file': row['file'], 'rgbaSha256': digest, 'recordedUiCanvasRgbaSha256': row['uiCanvas']['rgbaSha256'],
                               'rawRgbaEqualsCanvasReadback': digest == row['uiCanvas']['rgbaSha256'], 'canvasGeometryExact': True})
    report['pngExpressionInvariants'] = png_expression_audit(png_rows)
    projects = {p['key']: p for p in evidence['projects']}
    all_gif_files = set()
    for row in evidence['packs']:
        key = row['key']
        print(f'Independently reconstructing {key}', flush=True)
        project_row = projects[key]
        project = Project(ROOT/project_row['file'])
        pack = Archive(ROOT/row['file'])
        m, sm, doc = pack.manifest, project.source.manifest, project.doc
        require(m == row['manifest'], 'Recorded manifest differs from actual ZIP')
        require(set(m['animations']) == ACTIONS and m['animations'] == sm['animations'], 'Action schedules changed')
        require([f['id'] for f in m['frames']] == [f['id'] for f in sm['frames']], 'Source frame IDs/order changed')
        require(m['facing'] == sm['facing'], 'Facing changed')
        require(m['scale'] == sm['scale'], 'Source scaling metadata changed')
        require(doc['sourceSha256'] == row['sourceSha256'] == project_row['sourceSha256'], 'Pack/project source mismatch')
        p = project.padding
        require(m['anchor'] == {**sm['anchor'], 'x': sm['anchor']['x']+p['left'], 'y': sm['anchor']['y']+p['top']}, 'Anchor is not exact padded source anchor')
        width = sm['spritesheet']['frameWidth']+p['left']+p['right']
        height = sm['spritesheet']['frameHeight']+p['top']+p['bottom']
        require((m['spritesheet']['frameWidth'], m['spritesheet']['frameHeight']) == (width, height), 'Native scale changed')
        cfg = json.loads(pack.zip.read(m['configuration']))
        scfg = json.loads(project.source.zip.read(sm['configuration']))
        require(cfg['source'] == scfg['source'] and cfg['derivation']['frames'] == scfg['derivation']['frames'], 'Source-frame/time provenance changed')
        require(cfg['sourceMetadata']['wardrobe']['selection'] == doc['selection'] == row['selection'] == project_row['selection'], 'Saved clothing selection mismatch')
        require(cfg['sourceMetadata']['appearance']['selection'] == doc['appearance'] == row['appearance'] == project_row['appearance'], 'Saved face/hair selection mismatch')
        require(doc['preview'] == project_row['preview'] == {'action': 'run', 'facing': 'left'}, 'Saved preview mismatch')
        relevant = [g for g in evidence['gifs'] if g['key'] == key]
        if key.endswith('-day-joyful'):
            relevant += [g for g in evidence['gifs'] if g['key'].startswith(row['character']+'-day-') and g['faceId'] != 'joyful']
        needed = set(fid for g in relevant for fid in g['sourceSchedule']['frames'])
        frames = {}
        results = []
        for f in m['frames']:
            fid = f['id']
            actual, expected = pack.frame(fid), project.render(fid)
            require(actual.shape == expected.shape == (height, width, 4), 'Per-frame output geometry changed')
            difference = np.any(actual != expected, axis=2)
            require(not difference.any(), f'{key}/{fid}: independent saved-project composition differs at {int(difference.sum())} pixels')
            require(np.any(actual[:, :, 3] == 0) and np.any(actual[:, :, 3] == 255), 'Export lost transparent/opaque pixels')
            results.append({'frameId': fid, 'rgbaSha256': sha(actual.tobytes()), 'alphaSha256': sha(actual[:, :, 3].tobytes()), 'exactProjectComposition': True})
            if fid in needed:
                frames[fid] = actual
            if fid == project_row['focusFrame']:
                # Canvas put/get premultiplication may round edge RGB; compare actual
                # saved PNGs separately, while direct pack RGBA remains lossless.
                require(project_row['before'] == project_row['after'], 'Saved-project reopen canvas hashes changed')
        selected_pngs = [r for r in png_rows if r['character'] == row['character'] and r['faceId'] == 'joyful' and r['hairId'] == doc['appearance']['hairId'] and r['look'] == ('wedding' if '-wedding-' in key else 'day')]
        if 'midnight-sailor' in key:
            selected_pngs = [r for r in evidence['downloads'] if r['kind'] == 'png' and '-midnight-sailor-default-' in r['file']]
        png_checks = []
        for png in selected_pngs:
            actual = rgba((ROOT/png['file']).read_bytes())
            expected = pack.frame(png['frameId'])
            # Native PNG downloads use the encoder's straight RGBA, not canvas serialization.
            require(np.array_equal(actual, expected), f"Native PNG/pack mismatch: {png['file']}")
            png_checks.append(png['file'])
        require(len(png_checks) == 4, f'{key}: missing native keyframe PNG checks')
        mixed_checks = []
        if 'midnight-sailor' in key:
            catalog = json.loads((ROOT/'docs/kling-wardrobe/catalog.json').read_bytes())
            male = next(c for c in catalog['characters'] if c['key'] == 'male')
            previous = doc['selection']['bottom']
            for png in [r for r in evidence['downloads'] if r['kind'] == 'png' and '-midnight-sailor-mixed-' in r['file']]:
                item = next(i for i in male['items'] if i['id'] == png['bottomId'])
                item_path = ROOT/item['url'].lstrip('/')
                require(file_sha(item_path) == item['sha256'], 'Mixed pants catalog hash mismatch')
                if item['id'] not in project.items:
                    project.items[item['id']] = Archive(item_path)
                mixed_manifest = project.items[item['id']].manifest
                require(mixed_manifest['sourceSha256'] == doc['sourceSha256'] and mixed_manifest['registrationSha256'] == doc['registrationSha256'],
                        'Mixed pants bound to different source/registration')
                doc['selection']['bottom'] = item['id']
                require(np.array_equal(rgba((ROOT/png['file']).read_bytes()), project.render(png['frameId'])), 'Mixed pants native PNG does not match selected registered garment')
                mixed_checks.append({'file': png['file'], 'bottomId': item['id'], 'bottomSha256': item['sha256'], 'exactRegisteredComposition': True})
            doc['selection']['bottom'] = previous
            require(len(mixed_checks) == 4, 'Missing mixed-pants keyframe evidence')
        for gif in relevant:
            face = gif['faceId']
            expected = frames if face == 'joyful' else {fid: project.render(fid, face) for fid in set(gif['sourceSchedule']['frames'])}
            report['gifs'].append(gif_audit(gif, expected, sm))
            all_gif_files.add(gif['file'])
            if face != 'joyful':
                expected = None
        report['packs'].append({'file': row['file'], 'key': key, 'project': project_row['file'], 'sourceSha256': doc['sourceSha256'],
                                'allFiveActionsExact': True, 'frameIdsExact': True, 'sourceFrameTimeProvenanceExact': True,
                                'geometryAndAnchorExact': True, 'padding': p, 'nativeSize': [width, height],
                                'rgbaAndAlphaExactForEveryProjectComposite': True, 'frames': results,
                                'nativePngsExact': png_checks, 'mixedPantsNativePngs': mixed_checks, 'savedPreviewAndAppearanceExact': True})
        del frames, project, pack, actual, expected
        gc.collect()
    require(all_gif_files == {g['file'] for g in evidence['gifs']}, 'Some GIFs were not independently compared')
    for left in [g for g in evidence['gifs'] if g['facing'] == 'left']:
        right = next(g for g in evidence['gifs'] if g['key'] == left['key'] and g['action'] == left['action'] and g['facing'] == 'right')
        lf, ld, ll = read_gif(ROOT/left['file'])
        rf, rd, rl = read_gif(ROOT/right['file'])
        require(ld == rd and ll == rl and len(lf) == len(rf), 'Mirrored GIF schedules differ')
        require(all(np.array_equal(l, r[:, ::-1]) for l, r in zip(lf, rf)), 'Left GIF is not exact pixel mirror of right character rows')
        report['mirrorPairs'].append({'left': left['file'], 'right': right['file'], 'allCharacterRowsExactMirror': True})
    seen = set()
    pack_by_key = {p['key']: p for p in evidence['packs']}
    for row in evidence['playback']:
        identity = (row['key'], row['action'], row['facing'])
        require(identity not in seen, 'Duplicate playback case')
        seen.add(identity)
        m = pack_by_key[row['key']]['manifest']
        for observed in row['observed']:
            require(observed['frameId'] == m['animations'][observed['action']]['frames'][observed['position']], 'Player observation has wrong source frame')
        selected = [o for o in row['observed'] if o['action'] == row['action']]
        require(len({o['position'] for o in selected}) >= 3, 'Insufficient observed player progress')
        wraps = sum(b['position'] < a['position'] for a, b in zip(selected, selected[1:]))
        clip = m['animations'][row['action']]
        require(wraps > 0 if clip['loop'] else any(o['action'] == 'idle' for o in row['observed']), 'Player loop/one-shot transition failed')
        report['playback'].append({'key': row['key'], 'action': row['action'], 'facing': row['facing'], 'observedPositions': len({o['position'] for o in selected}),
                                   'totalPositions': len(clip['frames']), 'missingPositions': row['missingPositions'], 'loopOrReturnObserved': True})
    require(seen == {(p['key'], a, f) for p in evidence['packs'] for a in ACTIONS for f in ('left', 'right')}, 'Player action/facing coverage incomplete')
    face_audit = ROOT/'docs/kling-expression/asset-validation.json'
    audit = json.loads(face_audit.read_bytes())
    require(audit['passed'] and audit['totalUniqueSourcePoses'] == 184, 'Full source face audit missing')
    for character in audit['characters']:
        for bank in character['banks']:
            require(file_sha(ROOT/bank['file']) == bank['sha256'], 'Audited expression bank bytes changed')
    report['faceOwnershipAudit'] = {'file': str(face_audit.relative_to(ROOT)), 'sha256': file_sha(face_audit), 'sourcePoses': 184,
                                  'scope': 'Separate independent source/face audit; current verifier also enforces source alpha and face/foreground bounds during every saved-project reconstruction.'}
    report['summary'] = {'artifacts': len(report['artifacts']), 'packs': len(report['packs']), 'exactProjectFrames': sum(len(p['frames']) for p in report['packs']),
                         'decodedMatrixPngs': len(report['pngs']), 'exactExpressionAlphaAndOwnershipComparisons': len(report['pngExpressionInvariants']),
                         'rawPngRgbaMatchingCanvasReadback': sum(p['rawRgbaEqualsCanvasReadback'] for p in report['pngs']),
                         'gifs': len(report['gifs']), 'exactMirroredRunPairs': len(report['mirrorPairs']), 'playbackCases': len(report['playback'])}
    report['passed'] = True
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'passed': True, **report['summary'], 'output': str(args.output.relative_to(ROOT))}))


if __name__ == '__main__':
    main()
