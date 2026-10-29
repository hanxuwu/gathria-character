"""Independent actual-pack deltas and integer detail layouts; no artwork changes.

Run: python scripts/review-kling-side-refinement-qa.py male /path/to/male-styled.character.zip
The before oracle is the preserved PR54 actual exported CharacterPack.
"""
import hashlib
import io
import json
from pathlib import Path
import sys
import zipfile

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / 'docs/kling-side-refinement/qa'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        manifest = json.loads(archive.read('manifest.json'))
        sheets = [manifest['spritesheet']] + manifest.get('additionalSheets', [])
        pages = [Image.open(io.BytesIO(archive.read(s['file']))).convert('RGBA') for s in sheets]
        frames = {
            f['id']: pages[f.get('page', 0)].crop((f['x'], f['y'], f['x'] + f['width'], f['y'] + f['height']))
            for f in manifest['frames']
        }
        return manifest, frames


def board(gender, before, after, ids, boxes, name):
    width = max((b[2] - b[0]) * 4 for b in boxes)
    height = max((b[3] - b[1]) * 2 for b in boxes) + 30
    sheet = Image.new('RGB', (width, height * len(ids)), (235, 231, 220))
    draw = ImageDraw.Draw(sheet)
    for row, (fid, box) in enumerate(zip(ids, boxes)):
        for col, (label, frames) in enumerate([('PR54 before', before), ('Actual export after', after)]):
            image = frames[fid].crop(box)
            image = image.resize((image.width * 2, image.height * 2), Image.Resampling.NEAREST)
            x, y = col * (width // 2), row * height
            sheet.paste(image, (x, y + 30), image)
            draw.text((x + 8, y + 8), f'{label} / {gender} {fid} / 2x', fill=(30, 40, 35))
    sheet.save(DOC / name, optimize=True)


def main():
    assert len(sys.argv) == 3 and sys.argv[1] in ('male', 'female'), __doc__
    gender, actual = sys.argv[1], Path(sys.argv[2])
    DOC.mkdir(exist_ok=True)
    baseline = ROOT / f'docs/kling-side-fitting/review/{gender}.character.zip'
    old_manifest, before = read(baseline)
    new_manifest, after = read(actual)
    assert old_manifest['animations'] == new_manifest['animations']
    assert old_manifest['anchor'] == new_manifest['anchor']
    assert old_manifest['facing'] == new_manifest['facing']
    assert set(before) == set(after)
    rows = []
    for fid in before:
        a, b = np.asarray(before[fid]), np.asarray(after[fid])
        assert a.shape == b.shape
        changed = np.any(a != b, axis=2)
        rows.append({'frameId': fid, 'changedPixels': int(changed.sum()), 'changedBounds': Image.fromarray(changed).getbbox()})
    report = {
        'baseline': {'path': str(baseline.relative_to(ROOT)), 'sha256': sha(baseline)},
        'actualUiExport': {'path': str(actual), 'sha256': sha(actual)},
        'sourceTimingAndAnchorExact': True,
        'unchangedFrames': sum(not row['changedPixels'] for row in rows),
        'changedFrames': [row['frameId'] for row in rows if row['changedPixels']],
        'frames': rows,
    }
    (DOC / f'{gender}-actual-comparison.json').write_text(json.dumps(report, indent=2) + '\n')
    registration = json.loads((ROOT / f'artwork/kling-side-expansion/templates/{gender}.registration.json').read_text())
    joints = {r['frameId']: r['points'] for r in registration['frames']}
    ids = [0, 26, 40, 67, 89, 91] if gender == 'male' else [39, 40, 41, 42]
    boxes = []
    for fid in ids:
        p = joints[fid]['nearShoulder']
        if gender == 'male':
            boxes.append((int(p['x']) - 30, int(p['y']) - 70, int(p['x']) + 160, int(p['y']) + 100))
        else:
            boxes.append((150, int(p['y']) + 20, 370, int(p['y']) + 180))
    board(gender, before, after, ids, boxes, f'{gender}-actual-contacts-2x.png')
    if gender == 'female':
        ids = [60, 67, 76, 89]
        boxes = []
        for fid in ids:
            p = joints[fid]['waistRight']
            boxes.append((130, int(p['y']) - 30, 390, int(p['y']) + 180))
        board(gender, before, after, ids, boxes, 'female-actual-jump-2x.png')
    print(json.dumps({'gender': gender, 'changedFrames': report['changedFrames'], 'unchangedFrames': report['unchangedFrames']}))


if __name__ == '__main__':
    main()
