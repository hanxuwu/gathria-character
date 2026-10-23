#!/usr/bin/env python3
"""Audit an append-only hairstyle release against its retained Git baseline.

Old PNG pages must be byte-identical (not just visually similar). Existing style
metadata, face artwork, source bindings and pose guides remain exact; only the
union of old/new hair bounds can grow. New layers are decoded and checked at
native resolution. This verifies asset contracts, not visual approval.
"""
import argparse
from collections import OrderedDict
import hashlib
import io
import json
from pathlib import Path
import subprocess
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 64 * 1024 * 1024
MAX_PIXELS = 64 * 1024 * 1024
EXPECTED = {
    'male': {'before': 'kling-male-appearance-v4', 'after': 'kling-male-appearance-v5',
             'style': 'side-part', 'frames': 88, 'registration': 'male-full-outfits-v1.json'},
    'female': {'before': 'kling-female-appearance-v3', 'after': 'kling-female-appearance-v4',
               'style': 'tucked-bun', 'frames': 96, 'registration': 'female.json'},
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def git_bytes(baseline, path):
    return subprocess.check_output(['git', 'show', f'{baseline}:{path}'], cwd=ROOT)


def preserved_files(baseline):
    paths = [
        'artwork/kling-appearance/source',
        'artwork/kling-appearance/registration',
        'docs/kling-wardrobe/garments',
        'docs/kling-wardrobe/registration',
        'docs/kling-motion/exports/male.character.zip',
        'docs/kling-motion/exports/female.character.zip',
        'src/appearance/render.ts',
        'src/appearance/contract.ts',
        'scripts/kling_gentle_face.py',
        'scripts/kling_hair_ear_fit.py',
        'scripts/kling_hair_ear_overlap.py',
        'scripts/kling_hair_rear_lock.py',
    ]
    tree = subprocess.check_output(['git', 'ls-tree', '-r', '-z', baseline, '--', *paths], cwd=ROOT)
    result = []
    for record in tree.split(b'\0'):
        if not record:
            continue
        meta, name = record.decode().split('\t', 1)
        mode, kind, blob = meta.split()
        require(kind == 'blob' and mode == '100644', f'Unexpected preserved entry: {name}')
        path = ROOT / name
        require(path.is_file(), f'Preserved file is missing: {name}')
        current_blob = subprocess.check_output(['git', 'hash-object', '--', name], cwd=ROOT).decode().strip()
        require(current_blob == blob, f'Preserved file changed: {name}')
        result.append({'file': name, 'sha256': file_sha(path), 'bytes': path.stat().st_size,
                       'gitBlobUnchanged': blob})
    require(len(result) > 20, 'The baseline preserved inventory is incomplete')
    return result


class Bank:
    def __init__(self, data):
        self.bytes = len(data)
        self.sha256 = sha(data)
        self.archive = zipfile.ZipFile(io.BytesIO(data))
        require(self.archive.testzip() is None, 'Appearance ZIP CRC failure')
        names = self.archive.namelist()
        require(len(names) == len(set(names)), 'Duplicate appearance ZIP entry')
        self.manifest = json.loads(self.archive.read('manifest.json'))
        expected = {'manifest.json'}
        for page in self.manifest['pages']:
            expected.update((page['file'], page['maskFile']))
        require(set(names) == expected, 'Unexpected appearance bank entries')
        self.expanded_bytes = sum(info.file_size for info in self.archive.infolist())
        self.decoded = OrderedDict()

    def page(self, index, mask=False):
        meta = self.manifest['pages'][index]
        name = meta['maskFile' if mask else 'file']
        if name not in self.decoded:
            data = self.archive.read(name)
            require(data.startswith(b'\x89PNG\r\n\x1a\n'), f'Not a PNG: {name}')
            with Image.open(io.BytesIO(data)) as image:
                require(image.format == 'PNG' and image.mode == 'RGBA', f'Wrong PNG format: {name}')
                require(image.size == (meta['width'], meta['height']), f'Wrong PNG dimensions: {name}')
                image.load()
                self.decoded[name] = image.copy()
            while len(self.decoded) > 2:
                _, old = self.decoded.popitem(last=False)
                old.close()
        self.decoded.move_to_end(name)
        return self.decoded[name]

    def crop(self, frame, mask=False):
        page = self.page(frame['page'], mask)
        r = frame['rect']
        require(all(isinstance(r[key], int) for key in ('x', 'y', 'width', 'height')), 'Noninteger patch rect')
        require(r['x'] >= 0 and r['y'] >= 0 and r['width'] > 0 and r['height'] > 0,
                f'Invalid patch rect for frame {frame["frameId"]}')
        require(r['x'] + r['width'] <= page.width and r['y'] + r['height'] <= page.height,
                f'Atlas patch exceeds page for frame {frame["frameId"]}')
        return np.array(page.crop((r['x'], r['y'], r['x'] + r['width'], r['y'] + r['height'])))

    def close(self):
        for image in self.decoded.values():
            image.close()
        self.archive.close()


def box(rect):
    return [rect['x'], rect['y'], rect['x'] + rect['width'], rect['y'] + rect['height']]


def rect(bounds):
    x0, y0, x1, y1 = bounds
    return {'x': x0, 'y': y0, 'width': x1-x0, 'height': y1-y0}


def union(a, b):
    return [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]


def verify_bank(character, baseline):
    spec = EXPECTED[character]
    path = f'docs/kling-appearance/banks/{character}.zip'
    before = Bank(git_bytes(baseline, path))
    after = Bank((ROOT / path).read_bytes())
    try:
        old, new = before.manifest, after.manifest
        require(old['id'] == spec['before'] and new['id'] == spec['after'], f'{character} bank identity mismatch')
        require(new['provenance'].startswith(old['provenance']), f'{character} removed earlier provenance')
        mutable = {'id', 'provenance', 'pages', 'poses', 'styles'}
        require({k: v for k, v in old.items() if k not in mutable} ==
                {k: v for k, v in new.items() if k not in mutable}, f'{character} changed non-append metadata')
        old_count = len(old['pages'])
        require(new['pages'][:old_count] == old['pages'], f'{character} repacked old atlas metadata')
        require(old_count < len(new['pages']) <= 8, f'{character} exceeded eight atlas pages or appended none')
        pixels = sum(page['width'] * page['height'] for page in new['pages'])
        require(pixels <= MAX_PIXELS, f'{character} exceeded the 64 Mi-pixel budget')
        require(after.bytes <= MAX_BYTES and after.expanded_bytes <= MAX_BYTES,
                f'{character} exceeded compressed/expanded archive budgets')
        same_pngs, decoded_pngs = [], []
        for index, page in enumerate(new['pages']):
            for mask, field in ((False, 'file'), (True, 'maskFile')):
                name = page[field]
                data = after.archive.read(name)
                if index < old_count:
                    require(before.archive.read(name) == data, f'{character} modified original PNG bytes: {name}')
                    same_pngs.append({'file': name, 'sha256': sha(data), 'bytes': len(data)})
                image = after.page(index, mask)
                if mask:
                    alpha = np.array(image.getchannel('A'))
                    require(np.all((alpha == 0) | (alpha == 255)), f'{character} nonbinary ownership: {name}')
                decoded_pngs.append({'file': name, 'sha256': sha(data), 'width': image.width,
                                     'height': image.height, 'rgbaDecode': True})
        require(new['styles'][:len(old['styles'])] == old['styles'], f'{character} modified an existing style or face')
        require(len(new['styles']) == len(old['styles'])+1, f'{character} must append exactly one style')
        added = new['styles'][-1]
        require(added['id'] == spec['style'] and added['slot'] == 'hair', f'{character} wrong new style')
        roles = [layer['role'] for layer in added['layers']]
        require(roles and len(set(roles)) == len(roles) and 'hair-front' in roles and
                set(roles).issubset({'hair-back', 'hair-front'}), f'{character} invalid new hair layers')
        require(len(old['poses']) == len(new['poses']) == spec['frames'], f'{character} incomplete poses')
        frame_ids = [pose['frameId'] for pose in old['poses']]
        require(len(set(frame_ids)) == len(frame_ids), f'{character} duplicate pose ids')
        old_poses = {pose['frameId']: pose for pose in old['poses']}
        current_poses = {pose['frameId']: pose for pose in new['poses']}
        require(list(current_poses) == frame_ids, f'{character} changed pose ordering')
        unions = {pose['frameId']: box(pose['hairBounds']) for pose in old['poses']}
        coverage = []
        padding = new['padding']
        canvas = [-padding['left'], -padding['top'],
                  new['frameWidth']+padding['right'], new['frameHeight']+padding['bottom']]
        for layer in added['layers']:
            require([frame['frameId'] for frame in layer['frames']] == frame_ids,
                    f'{character}/{layer["role"]} lacks complete ordered frame coverage')
            for frame in layer['frames']:
                fid = frame['frameId']
                require(frame['mode'] == 'paint', f'{character}/{fid} missing the new hair drawing')
                require(old_count <= frame['page'] < len(new['pages']), f'{character}/{fid} new style reuses old page')
                rgba, owned = after.crop(frame), after.crop(frame, True)
                alpha, mask = rgba[:, :, 3], owned[:, :, 3]
                visible = alpha > 0
                alpha_pixels, opaque_pixels = int(visible.sum()), int((alpha >= 128).sum())
                require(alpha_pixels >= 100 and opaque_pixels >= 64, f'{character}/{fid} empty or insignificant new layer')
                require(np.all(mask[visible] == 255), f'{character}/{fid} drawing outside ownership')
                ys, xs = np.nonzero(visible)
                ox, oy = frame['offset']['x'], frame['offset']['y']
                bounds = [int(xs.min())+ox, int(ys.min())+oy,
                          int(xs.max())+1+ox, int(ys.max())+1+oy]
                margins = [bounds[0]-canvas[0], bounds[1]-canvas[1],
                           canvas[2]-bounds[2], canvas[3]-bounds[3]]
                require(min(margins) >= 1, f'{character}/{fid} hair touches or crosses the output edge')
                unions[fid] = union(unions[fid], bounds)
                coverage.append({'frameId': fid, 'sourceFrame': old_poses[fid]['sourceFrame'],
                                 'role': layer['role'], 'alphaPixels': alpha_pixels,
                                 'opaquePixels': opaque_pixels, 'sourceBounds': rect(bounds),
                                 'outputEdgeMargins': margins,
                                 'rgbaSha256': sha(rgba.tobytes()), 'ownershipSha256': sha(owned.tobytes())})
        changed_bounds = []
        for previous, current in zip(old['poses'], new['poses']):
            fid = previous['frameId']
            require({k: v for k, v in previous.items() if k != 'hairBounds'} ==
                    {k: v for k, v in current.items() if k != 'hairBounds'},
                    f'{character}/{fid} changed face, head, foreground or registration metadata')
            require(current['hairBounds'] == rect(unions[fid]),
                    f'{character}/{fid} hair bounds are not the exact union of old/new artwork')
            if current['hairBounds'] != previous['hairBounds']:
                changed_bounds.append({'frameId': fid, 'before': previous['hairBounds'], 'after': current['hairBounds']})
        source_path = ROOT / f'docs/kling-motion/exports/{character}.character.zip'
        registration_path = ROOT / 'docs/kling-wardrobe/registration' / spec['registration']
        registration = json.loads(registration_path.read_text())
        require(new['sourceSha256'] == file_sha(source_path) == registration['sourceSha256'],
                f'{character} source checksum mismatch')
        require(new['registrationSha256'] == file_sha(registration_path), f'{character} registration checksum mismatch')
        require(new['characterId'] == registration['characterId'], f'{character} identity differs from source registration')
        require([r['frameId'] for r in registration['frames']] == frame_ids, f'{character} source pose coverage differs')
        with zipfile.ZipFile(source_path) as source_zip:
            source_manifest = json.loads(source_zip.read('manifest.json'))
        require(source_manifest['spritesheet']['frameWidth'] == new['frameWidth'] and
                source_manifest['spritesheet']['frameHeight'] == new['frameHeight'], f'{character} source dimensions differ')
        catalog = json.loads((ROOT / 'docs/kling-wardrobe/catalog.json').read_text())
        entry = next(entry for entry in catalog['characters'] if entry['key'] == character)
        revision = entry['appearanceRevision']
        require(revision['bankSha256'] == after.sha256 and revision['bankId'] == new['id'], f'{character} stale catalog bank')
        require(before.sha256 in revision['previousBankSha256s'], f'{character} omitted previous bank from explicit-upgrade allowlist')
        require(revision['sourceSha256'] == new['sourceSha256'] and
                revision['registrationSha256'] == new['registrationSha256'], f'{character} catalog source binding differs')
        require(entry['appearanceStyles'] == [{key: style[key] for key in ('id', 'name', 'slot')} for style in new['styles']],
                f'{character} lazy style inventory differs from the exact bank')
        return {
            'character': character, 'beforeBankSha256': before.sha256, 'afterBankSha256': after.sha256,
            'oldPngEntriesByteIdentical': same_pngs, 'oldStylesMetadataExact': [style['id'] for style in old['styles']],
            'originalFaceMetadataAndPngBytesExact': True, 'unchangedPoseMetadataExceptHairBounds': len(frame_ids),
            'changedHairBoundsExactUnion': changed_bounds, 'newStyleId': added['id'],
            'newLayerCoverage': coverage, 'decodedPngs': decoded_pngs,
            'budgets': {'pages': len(new['pages']), 'maxPages': 8, 'atlasPixels': pixels,
                        'maxAtlasPixels': MAX_PIXELS, 'archiveBytes': after.bytes,
                        'expandedEntryBytes': after.expanded_bytes, 'maxArchiveAndExpandedBytes': MAX_BYTES},
            'sourceSha256': new['sourceSha256'], 'registrationSha256': new['registrationSha256'],
            'catalogBindingsAndUpgradePathMatch': True,
        }
    finally:
        before.close()
        after.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', default='4d2efaf')
    parser.add_argument('--output', type=Path, default=ROOT / 'docs/kling-appearance/expansion-review/bank-compatibility-validation.json')
    args = parser.parse_args()
    baseline = subprocess.check_output(['git', 'rev-parse', '--verify', f'{args.baseline}^{{commit}}'], cwd=ROOT).decode().strip()
    result = {
        'baseline': baseline,
        'method': 'Append-only audit: exact old PNG bytes and existing style/face metadata; pose metadata fixed except exact hair-bound unions; all new layer frames decoded with meaningful alpha, owned pixels and clear output margins. Original source, garments, donors, registrations and compositor retained. Numeric/artifact checks do not establish visual acceptance.',
        'unchangedFiles': preserved_files(baseline),
        'characters': [verify_bank(character, baseline) for character in ('male', 'female')],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({'report': str(args.output), 'unchangedFiles': len(result['unchangedFiles']),
                      'oldPngEntriesByteIdentical': sum(len(c['oldPngEntriesByteIdentical']) for c in result['characters']),
                      'unchangedPoseMetadata': sum(c['unchangedPoseMetadataExceptHairBounds'] for c in result['characters']),
                      'newLayerFrames': sum(len(c['newLayerCoverage']) for c in result['characters']),
                      'banks': [{key: c[key] for key in ('character', 'afterBankSha256', 'budgets')} for c in result['characters']]}))


if __name__ == '__main__':
    main()
