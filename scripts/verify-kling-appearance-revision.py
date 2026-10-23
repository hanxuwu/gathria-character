#!/usr/bin/env python3
"""Verify the bounded, metadata-only appearance revision against released Git art.

Writes reproducible evidence without decoding or regenerating character artwork.
Every PNG entry must be byte-identical, and every metadata change must belong to
an explicitly reviewed head-fringe or foreground-hand correction.
"""
import argparse
import copy
import hashlib
import io
import json
from pathlib import Path
import subprocess
import zipfile

from kling_hair_foreground import FEMALE_HAND_FOREGROUND

ROOT = Path(__file__).resolve().parents[1]
# Reviewed source-space additions. Existing polygons must remain byte-for-byte
# equivalent JSON data, including ordering, and only these two may be appended.
REVIEWED_FOREGROUND = {
    ('female', frame): [{'x': x, 'y': y} for x, y in points]
    for frame, points in FEMALE_HAND_FOREGROUND.items()
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def entries(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        assert archive.testzip() is None, 'Invalid ZIP entry CRC'
        names = archive.namelist()
        assert len(set(names)) == len(names), 'Duplicate ZIP entry'
        assert 'manifest.json' in names
        assert all(name == 'manifest.json' or name.endswith('.png') for name in names)
        return {name: archive.read(name) for name in names}


def verify(character, baseline):
    path = f'docs/kling-appearance/banks/{character}.zip'
    before_bytes = subprocess.check_output(['git', 'show', f'{baseline}:{path}'], cwd=ROOT)
    after_bytes = (ROOT / path).read_bytes()
    before_files, after_files = entries(before_bytes), entries(after_bytes)
    assert set(before_files) == set(after_files), 'Bank entry inventory changed'
    pngs = []
    for name in sorted(before_files):
        if name == 'manifest.json':
            continue
        assert before_files[name] == after_files[name], f'{character} {name} bytes changed'
        assert after_files[name].startswith(b'\x89PNG\r\n\x1a\n'), f'{name} is not PNG'
        pngs.append({'file': name, 'sha256': sha(after_files[name])})
    assert len(pngs) == 10, 'Expected five color/ownership page pairs per character'
    before, after = (json.loads(files['manifest.json']) for files in (before_files, after_files))
    assert before['id'] == f'kling-{character}-appearance-v2'
    assert after['id'] == f'kling-{character}-appearance-v3'
    assert after['provenance'].startswith(before['provenance']), 'Existing provenance was removed'
    assert {k: v for k, v in before.items() if k not in ('id', 'provenance', 'poses')} == {
        k: v for k, v in after.items() if k not in ('id', 'provenance', 'poses')
    }, 'Unreviewed top-level metadata change'
    assert len(before['poses']) == len(after['poses']) == (88 if character == 'male' else 96)
    bounds, foreground_changes = [], []
    for old, new in zip(before['poses'], after['poses']):
        assert old['frameId'] == new['frameId'], 'Pose order changed'
        adjusted = copy.deepcopy(new)
        envelope = adjusted.pop('hairOcclusionBounds')
        head = old['headBounds']
        x, y = max(0, head['x'] - 3), max(0, head['y'] - 3)
        right = min(after['frameWidth'], head['x'] + head['width'] + 3)
        bottom = head['y'] + head['height']
        assert envelope == {'x': x, 'y': y, 'width': right - x, 'height': bottom - y}, 'Hair envelope exceeds the reviewed three-pixel top/side correction'
        review = REVIEWED_FOREGROUND.get((character, old['frameId']))
        if review:
            assert new['foreground'] == old['foreground'] + [review], 'Foreground differs from reviewed additive correction'
            foreground_changes.append({'frameId': old['frameId'], 'before': old['foreground'], 'after': new['foreground'], 'added': review})
            adjusted['foreground'] = old['foreground']
        assert adjusted == old, f"Unexpected pose change in {character} {old['frameId']}"
        bounds.append({'frameId': old['frameId'], 'headBounds': head, 'hairOcclusionBounds': envelope})
    expected_foreground = sum(1 for key in REVIEWED_FOREGROUND if key[0] == character)
    assert len(foreground_changes) == expected_foreground, 'A reviewed foreground pose is missing'
    return {
        'character': character,
        'beforeSha256': sha(before_bytes),
        'afterSha256': sha(after_bytes),
        'samePngs': pngs,
        'sourceAndTimingMetadataUnchanged': True,
        'unchangedFaceHeadAndAnchorGuides': len(bounds),
        'unchangedForegroundPoses': len(bounds) - len(foreground_changes),
        'reviewedForegroundChanges': foreground_changes,
        'bounds': bounds,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', default='055e951')
    parser.add_argument('--output', type=Path, default=ROOT / 'docs/kling-appearance/stability-review/bank-revision-validation.json')
    args = parser.parse_args()
    result = {
        'baseline': args.baseline,
        'method': 'Compare released Git banks with current banks: all twenty PNG entries byte-identical; only content identity/provenance, three-pixel hair-only top/side bounds and explicitly reviewed female foreground polygons may change. Face, head, anchor, source-frame, style and timing metadata stay exact. Lower head edge is unchanged.',
        'characters': [verify(character, args.baseline) for character in ('male', 'female')],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({
        'report': str(args.output.relative_to(ROOT)) if args.output.is_relative_to(ROOT) else str(args.output),
        'unchangedPngs': sum(len(c['samePngs']) for c in result['characters']),
        'reviewedBounds': sum(len(c['bounds']) for c in result['characters']),
        'reviewedForegroundPoses': sum(len(c['reviewedForegroundChanges']) for c in result['characters']),
    }))


if __name__ == '__main__':
    main()
