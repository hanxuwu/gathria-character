#!/usr/bin/env python3
"""Audit revision-3 clothing patches against the accepted revision-2 silhouette.

This checks packaged authoring assets. It is not a browser export or a substitute
for viewing the resulting characters and animation.
"""
import io
import json
import subprocess
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

from kling_wardrobe_common import ROOT, load_source, protected_mask, sha


def read_page(archive, name):
    data = archive.read(name)
    image = np.asarray(Image.open(io.BytesIO(data)).convert('RGBA'))
    assert image.size
    return image


def main():
    baseline = '881c7a28957a405b26d0fd29bdbfb9f42df4993f'
    registration_path = ROOT / 'artwork/kling-wardrobe/registration/female/registration.json'
    registration_bytes = registration_path.read_bytes()
    registration = json.loads(registration_bytes)
    registered = {frame['frameId']: frame for frame in registration['frames']}
    source, _, _, source_frames = load_source('female')
    assert sha(source) == registration['sourceSha256']
    report = {
        'scope': 'Offline clothing-patch audit; browser-export visual evidence is separate.',
        'baselineCommit': baseline,
        'registrationSha256': sha(registration_bytes),
        'sourceSha256': sha(source),
        'inputFiles': {}, 'legacyFiles': [], 'garments': [], 'passed': False,
    }
    for path in ['scripts/kling_dress_fit.py', 'scripts/prepare-kling-wardrobe-dresses.py', 'scripts/test_kling_dress_fit.py', 'scripts/verify-kling-dress-outline.py']:
        report['inputFiles'][path] = sha((ROOT / path).read_bytes())
    for item in ['coral-daydress', 'ivory-wedding-dress']:
        for suffix in ['', '-v2']:
            path = f'docs/kling-wardrobe/garments/female/{item}{suffix}.zip'
            prior = subprocess.check_output(['git', 'show', f'{baseline}:{path}'], cwd=ROOT)
            current = (ROOT / path).read_bytes()
            assert prior == current, f'Existing saved garment changed: {path}'
            report['legacyFiles'].append({'file': path, 'sha256': sha(current), 'bytes': len(current)})
        paths = [ROOT / f'docs/kling-wardrobe/garments/female/{item}-v{v}.zip' for v in [2, 3]]
        with zipfile.ZipFile(paths[0]) as before, zipfile.ZipFile(paths[1]) as after:
            assert before.testzip() is None and after.testzip() is None
            old = json.loads(before.read('manifest.json'))
            new = json.loads(after.read('manifest.json'))
            for key in ['format', 'version', 'slot', 'sourceSha256', 'registrationSha256', 'characterId', 'frameWidth', 'frameHeight', 'frames', 'pages']:
                assert old[key] == new[key], (item, key)
            assert new['id'] == f'{item}-v3'
            assert new['registrationSha256'] == sha(registration_bytes)
            record = {'file': str(paths[1].relative_to(ROOT)), 'sha256': sha(paths[1].read_bytes()), 'frames': []}
            for page_index, page in enumerate(new['pages']):
                old_pixels = read_page(before, page['file'])
                new_pixels = read_page(after, page['file'])
                old_mask = before.read(page['maskFile'])
                new_mask = after.read(page['maskFile'])
                assert old_mask == new_mask, f'Ownership moved: {item} page{page_index}'
                np.testing.assert_array_equal(old_pixels[:, :, 3], new_pixels[:, :, 3], err_msg=f'Alpha moved: {item} page{page_index}')
                mask = read_page(after, page['maskFile'])[:, :, 3] > 0
                assert not np.any(new_pixels[~mask]), 'RGB or alpha escaped ownership'
                for frame in new['frames']:
                    if frame['page'] != page_index:
                        continue
                    r, offset = frame['rect'], frame['offset']
                    x, y, w, h = (r[k] for k in ['x', 'y', 'width', 'height'])
                    changed = np.any(old_pixels[y:y+h, x:x+w] != new_pixels[y:y+h, x:x+w], axis=2)
                    owned = mask[y:y+h, x:x+w]
                    protection = protected_mask(registered[frame['frameId']]) & (source_frames[frame['frameId']][:, :, 3] > 0)
                    protected = protection[offset['y']:offset['y']+h, offset['x']:offset['x']+w]
                    assert not np.any(changed & protected), 'Protected identity pixels changed'
                    assert not np.any(changed & ~owned), 'Change outside garment ownership'
                    record['frames'].append({'frameId': frame['frameId'], 'changedClothPixels': int(changed.sum()), 'alphaAndOwnershipIdentical': True, 'protectedChanged': 0})
            assert len(record['frames']) == len(registered)
            record['changedFrames'] = sum(frame['changedClothPixels'] > 0 for frame in record['frames'])
            report['garments'].append(record)
    report['passed'] = True
    out = ROOT / 'artwork/kling-wardrobe/prepared/female-dresses-v3/verification.json'
    out.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'passed': True, 'checkedFrames': sum(len(g['frames']) for g in report['garments']), 'changedFrames': {g['file']: g['changedFrames'] for g in report['garments']}, 'report': str(out.relative_to(ROOT))}, indent=2))


if __name__ == '__main__':
    main()
