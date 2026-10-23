#!/usr/bin/env python3
"""Review source/V2/final application PNGs at native integer scale, no redrawing."""
from pathlib import Path
import argparse
import importlib.util
import json

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('hand_validation', ROOT / 'scripts/verify-kling-head-boundary-exports.py')
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
h = v.helper


def main(run):
    dest = ROOT / 'docs/kling-appearance/stability-review'
    directory = dest / 'workflow' / run
    source_path = ROOT / 'docs/kling-motion/exports/female.character.zip'
    _, source = h.decode_pack(source_path)
    rows = []
    neighbors = []
    checks = []
    boxes = {75: (125, 365, 205, 435), 78: (120, 380, 200, 450), 79: (120, 415, 200, 485), 80: (125, 425, 205, 495)}
    for style in ['soft-crop', 'soft-bob']:
        old_path = ROOT / f'docs/kling-appearance/ear-edge-review/evidence/final-female/exports/female-{style}.character.zip'
        _, before = h.decode_pack(old_path)
        for fid in ([78, 79] if style == 'soft-crop' else [75, 78, 79, 80]):
            path = directory / f'female-hand-{style}-{fid}-right.png'
            with Image.open(path) as im:
                after = im.convert('RGBA')
                after.load()
            box = boxes[fid]
            padded = tuple(q + (32 if i % 2 == 0 else 128) for i, q in enumerate(box))
            row = h.join_row([h.sheet_tile(im.crop(crop).resize((320, 280), Image.Resampling.NEAREST), f'{style} / {fid} / {label} / 4x', 1) for label, im, crop in [('source', source[fid], box), ('before', before[fid], padded), ('final export', after, padded)]])
            record = {'frameId': fid, 'style': style, 'actualPng': str(path.relative_to(ROOT)), 'actualSha256': h.sha(path), 'sourceCrop': list(box), 'integerScale': 4}
            if fid in v.HAND_REPAIRS:
                rows.append(row)
                x, y = (152, 413) if fid == 78 else (155, 441)
                record['sampleSourcePosition'] = [x, y]
                record['originalRgba'] = list(source[fid].getpixel((x, y)))
                record['beforeRgba'] = list(before[fid].getpixel((x + 32, y + 128)))
                record['finalRgba'] = list(after.getpixel((x + 32, y + 128)))
                assert record['finalRgba'] == record['originalRgba']
            else:
                neighbors.append(row)
            checks.append(record)
    artifacts = []
    for name, selected in [('hand-source-before-after-4x.png', rows), ('hand-neighbors-source-before-after-4x.png', neighbors)]:
        image = Image.new('RGB', (960, 312 * len(selected)), h.BG)
        for i, row in enumerate(selected):
            image.paste(row, (0, i * 312))
        path = dest / name
        image.save(path)
        with Image.open(path) as decoded:
            decoded.load()
            assert decoded.size == image.size
        artifacts.append({'file': str(path.relative_to(ROOT)), 'sha256': h.sha(path), 'size': list(image.size), 'decoded': True})
    (dest / 'hand-review-validation.json').write_text(json.dumps({'scope': 'Actual exported both-style female celebration repairs78/79 and default-style neighbors75/80. Frame77 is not present in selected source frame set. All crops use nearest-neighbor integer4x scaling.', 'actualSamples': checks, 'artifacts': artifacts}, indent=2) + '\n')
    print(json.dumps({'actualSamples': len(checks), 'artifacts': len(artifacts)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', default='final-female-hand-fix')
    main(parser.parse_args().run)
