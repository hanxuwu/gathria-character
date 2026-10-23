#!/usr/bin/env python3
"""Compare male ear-overlap revision 4 with its retained revision-3 baseline.

Hair paintings and atlas packing may change. Original characters, all face
paintings/ownership, pose registration and the entire female bank must not.
"""
import argparse
from collections import OrderedDict
import hashlib
import io
import json
from pathlib import Path
import subprocess
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git_bytes(baseline, path):
    return subprocess.check_output(['git', 'show', f'{baseline}:{path}'], cwd=ROOT)


def compare_file(baseline, path):
    before, after = git_bytes(baseline, path), (ROOT / path).read_bytes()
    assert before == after, f'Preserved file changed: {path}'
    return {'file': path, 'sha256': sha(after), 'bytes': len(after)}


class Bank:
    def __init__(self, data):
        self.sha256 = sha(data)
        self.archive = zipfile.ZipFile(io.BytesIO(data))
        assert self.archive.testzip() is None
        names = self.archive.namelist()
        assert len(names) == len(set(names))
        self.manifest = json.loads(self.archive.read('manifest.json'))
        expected = {'manifest.json'}
        for page in self.manifest['pages']:
            expected.update((page['file'], page['maskFile']))
        assert set(names) == expected, 'Unexpected appearance bank entries'
        self.pages = OrderedDict()

    def crop(self, frame, mask=False):
        page = self.manifest['pages'][frame['page']]
        name = page['maskFile' if mask else 'file']
        if name not in self.pages:
            with Image.open(io.BytesIO(self.archive.read(name))) as image:
                assert image.size == (page['width'], page['height'])
                assert image.mode == 'RGBA'
                self.pages[name] = image.copy()
            while len(self.pages) > 2:
                _, old = self.pages.popitem(last=False)
                old.close()
        else:
            self.pages.move_to_end(name)
        r = frame['rect']
        return self.pages[name].crop((r['x'], r['y'], r['x'] + r['width'], r['y'] + r['height'])).tobytes()

    def close(self):
        for image in self.pages.values():
            image.close()
        self.pages.clear()
        self.archive.close()


def verify_male(baseline):
    path = 'docs/kling-appearance/banks/male.zip'
    before = Bank(git_bytes(baseline, path))
    after = Bank((ROOT / path).read_bytes())
    a, b = before.manifest, after.manifest
    assert a['id'] == 'kling-male-appearance-v3'
    assert b['id'] == 'kling-male-appearance-v4'
    assert b['provenance'].startswith(a['provenance'])
    mutable = {'id', 'provenance', 'pages', 'poses', 'styles'}
    assert {k: v for k, v in a.items() if k not in mutable} == {k: v for k, v in b.items() if k not in mutable}, 'Unexpected common metadata change'
    assert len(a['poses']) == len(b['poses']) == 88
    changed_bounds = []
    for old, new in zip(a['poses'], b['poses']):
        assert {k: v for k, v in old.items() if k != 'hairBounds'} == {k: v for k, v in new.items() if k != 'hairBounds'}, f"Non-hair pose data changed: {old['frameId']}"
        h, p = new['hairBounds'], b['padding']
        assert h['x'] >= -p['left'] and h['y'] >= -p['top']
        assert h['x'] + h['width'] <= b['frameWidth'] + p['right']
        assert h['y'] + h['height'] <= b['frameHeight'] + p['bottom']
        if old['hairBounds'] != h:
            changed_bounds.append({'frameId': old['frameId'], 'before': old['hairBounds'], 'after': h})
    assert [(s['id'], s['name'], s['slot']) for s in a['styles']] == [(s['id'], s['name'], s['slot']) for s in b['styles']]
    old_face = next(s for s in a['styles'] if s['slot'] == 'face')
    new_face = next(s for s in b['styles'] if s['slot'] == 'face')
    assert len(old_face['layers']) == len(new_face['layers']) == 1
    assert old_face['layers'][0]['role'] == new_face['layers'][0]['role'] == 'face'
    old_frames, new_frames = old_face['layers'][0]['frames'], new_face['layers'][0]['frames']
    assert len(old_frames) == len(new_frames) == 88
    faces, source_count = [], 0
    for old, new in zip(old_frames, new_frames):
        assert old['frameId'] == new['frameId'] and old['mode'] == new['mode']
        if old['mode'] == 'source':
            assert old == new, f"Source expression changed: {old['frameId']}"
            source_count += 1
            continue
        assert old['offset'] == new['offset']
        assert (old['rect']['width'], old['rect']['height']) == (new['rect']['width'], new['rect']['height'])
        old_pixels, new_pixels = before.crop(old), after.crop(new)
        old_owned, new_owned = before.crop(old, True), after.crop(new, True)
        assert old_pixels == new_pixels, f"Face painting changed: {old['frameId']}"
        assert old_owned == new_owned, f"Face ownership changed: {old['frameId']}"
        faces.append({'frameId': old['frameId'], 'rgbaSha256': sha(new_pixels), 'ownershipSha256': sha(new_owned)})
    expected_roles = {'soft-crop': ['hair-front'], 'soft-bob': ['hair-back', 'hair-front']}
    hair_layers = []
    expected_frames = [pose['frameId'] for pose in b['poses']]
    for style in b['styles']:
        if style['slot'] != 'hair':
            continue
        assert [layer['role'] for layer in style['layers']] == expected_roles[style['id']]
        for layer in style['layers']:
            assert [f['frameId'] for f in layer['frames']] == expected_frames
            hair_layers.append({'style': style['id'], 'role': layer['role'], 'frames': len(layer['frames'])})
    result = {
        'beforeSha256': before.sha256,
        'afterSha256': after.sha256,
        'unchangedPoseRegistrations': len(b['poses']),
        'unchangedSourceFaceStates': source_count,
        'unchangedFacePaintings': faces,
        'changedHairBounds': changed_bounds,
        'hairLayers': hair_layers,
        'sourceBindingsPaddingAndFrameGeometryUnchanged': True,
    }
    before.close()
    after.close()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', default='d6a50f0')
    parser.add_argument('--output', type=Path, default=ROOT / 'docs/kling-appearance/ear-overlap-review/bank-compatibility-validation.json')
    args = parser.parse_args()
    preserved = [
        'docs/kling-appearance/banks/female.zip',
        'artwork/kling-appearance/source/soft-crop-design.png',
        'artwork/kling-appearance/source/soft-bob-design.png',
        'artwork/kling-appearance/source/male-reference.png',
        'artwork/kling-appearance/source/female-reference.png',
        'artwork/kling-appearance/source/female-soft-crop-cutout.png',
        'artwork/kling-appearance/source/female-soft-bob-cutout.png',
        'artwork/kling-appearance/registration/male.json',
        'artwork/kling-appearance/registration/female.json',
        'docs/kling-motion/exports/male.character.zip',
        'docs/kling-motion/exports/female.character.zip',
        'docs/kling-wardrobe/registration/male-full-outfits-v1.json',
        'docs/kling-wardrobe/registration/female.json',
        'src/appearance/render.ts',
        'src/appearance/contract.ts',
    ]
    result = {
        'baseline': args.baseline,
        'method': 'Exact baseline comparison: female bank, source characters, raw hair donors, source registrations and runtime renderer unchanged. Male face crops are compared as decoded RGBA/ownership at original offsets despite atlas repacking. Every pose field except hairBounds remains exact.',
        'unchangedFiles': [compare_file(args.baseline, path) for path in preserved],
        'male': verify_male(args.baseline),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'unchangedFiles': len(preserved), 'unchangedMalePoses': result['male']['unchangedPoseRegistrations'], 'unchangedFacePaintings': len(result['male']['unchangedFacePaintings']), 'unchangedSourceFaceStates': result['male']['unchangedSourceFaceStates'], 'maleBankSha256': result['male']['afterSha256']}))


if __name__ == '__main__':
    main()
