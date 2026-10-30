"""Verify frozen actual exports, presentation GIFs, inputs and review links."""

import hashlib
import json
import re
import zipfile
from pathlib import Path

from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / 'docs/kling-side-refinement'
REVIEW = DOC / 'review'


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def main():
    inputs = {}
    for gender in ('male', 'female'):
        report = json.loads((DOC / f'qa/{gender}-final-report.json').read_text())
        assert report['passed'], gender
        for path, expected in report['runtimeAndAssetHashes'].items():
            if path in inputs:
                assert inputs[path] == expected, path
            inputs[path] = expected
    for path, expected in inputs.items():
        assert sha(ROOT / path) == expected, path

    files = json.loads((REVIEW / 'delivery-files.json').read_text())['files']
    for row in files:
        path = REVIEW / row['file']
        assert sha(path) == row['sha256'], path
        assert path.stat().st_size == row['bytes'], path
        if path.suffix == '.zip':
            with zipfile.ZipFile(path) as archive:
                assert archive.testzip() is None, path
        if path.suffix in ('.png', '.gif'):
            with Image.open(path) as image:
                for frame in ImageSequence.Iterator(image):
                    frame.load()

    index = json.loads((REVIEW / 'review-index.json').read_text())
    gifs = []
    for row in index['gifs']:
        path = REVIEW / row['file']
        with Image.open(path) as image:
            assert (image.info.get('loop') == 0) == row['loop'], path
            duration = 0
            for frame in ImageSequence.Iterator(image):
                frame.load()
                duration += frame.info['duration']
            assert duration == row['durationMs'], path
            assert image.n_frames == row['decodedFrames'], path
        gifs.append({
            'file': path.name, 'sha256': sha(path),
            'frames': row['decodedFrames'], 'durationMs': duration,
        })

    missing = []
    for path in DOC.rglob('*.md'):
        for target in re.findall(r'\[[^\]]*\]\(([^)\s]+)\)', path.read_text()):
            if '://' in target or target.startswith('#'):
                continue
            if not (path.parent / target.split('#')[0]).exists():
                missing.append([str(path.relative_to(ROOT)), target])
    assert not missing, missing

    perf = json.loads((DOC / 'performance/summary.json').read_text())
    assert sha(DOC / 'performance/final-workers.json') == perf['rawReportSha256']
    for path, expected in perf['sourceFilesUnchangedAfterMeasurements'].items():
        assert sha(ROOT / path) == expected, path
    changed = {
        'docs/kling-side-expansion/assets/male-shirt.garment.zip',
        'docs/kling-side-expansion/assets/female-skirt.garment.zip',
    }
    baseline = json.loads((DOC / 'baseline.json').read_text())
    for row in baseline['files']:
        if row['path'] not in changed:
            assert sha(ROOT / row['path']) == row['sha256'], row['path']

    result = {
        'passed': True,
        'runtimeAssetInputs': len(inputs),
        'directArtifacts': len(files),
        'comparisonGifs': gifs,
        'zipCrcPassed': True,
        'localMarkdownLinksPassed': True,
        'performanceRawHashPassed': True,
        'baselineSourcesRegistrationAndPriorEvidenceExact': True,
    }
    (DOC / 'checks/delivery.json').write_text(json.dumps(result, indent=2) + '\n')
    print(f'PASS: {len(inputs)} frozen inputs, {len(files)} direct artifacts, '
          f'{len(gifs)} presentation GIFs; ZIP CRC, links and baseline exact.')


if __name__ == '__main__':
    main()
