#!/usr/bin/env python3
"""Present same-coordinate native cloth crops; check all exported GIF frames."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
import side_finish_audit

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/wardrobe-finish/side'


def main():
    runtime = json.loads((OUT / 'runtime.json').read_text())
    native = Path(runtime['nativeReviewDirectory'])
    boards = []
    for ids, name in [([19, 20, 21, 22, 23], 'walk'), ([36, 37, 38, 39, 40], 'run')]:
        board = Image.new('RGB', (300 * len(ids), 360 * 3), '#eee9df')
        draw = ImageDraw.Draw(board)
        for row, kind in enumerate(['source', 'before', 'after']):
            for col, fid in enumerate(ids):
                crop = Image.open(native / f'{fid}-{kind}.png').convert('RGBA').crop((120, 390, 420, 720))
                board.paste(crop, (col * 300, row * 360 + 24), crop)
                draw.text((col * 300 + 8, row * 360 + 8), f'{kind} frame {fid}', fill='black')
        file = f'review/{name}-native-cloth-neighbors.png'
        board.save(OUT / file)
        boards.append({'file': file, 'sha256': hashlib.sha256((OUT / file).read_bytes()).hexdigest(), 'frames': ids, 'nativeCrop': [120, 390, 420, 720], 'scale': 1})
    verified = []
    for result in runtime['results']:
        for right in [g for g in result['gifs'] if g['facing'] == 'right']:
            left = next(g for g in result['gifs'] if g['action'] == right['action'] and g['facing'] == 'left')
            for g in (right, left):
                assert hashlib.sha256((OUT / g['file']).read_bytes()).hexdigest() == g['sha256']
            durations = []
            with Image.open(OUT / right['file']) as a, Image.open(OUT / left['file']) as b:
                assert a.n_frames == b.n_frames == len(right['frames'])
                assert (a.info.get('loop') == 0) == right['loop']
                assert (b.info.get('loop') == 0) == right['loop']
                width = (a.width - 8) // 2
                for index in range(a.n_frames):
                    a.seek(index)
                    b.seek(index)
                    aa, bb = np.array(a.convert('RGB')), np.array(b.convert('RGB'))
                    expected = aa.copy()
                    for x in (0, width + 8):
                        expected[16:, x:x + width] = aa[16:, x:x + width][:, ::-1]
                    assert np.array_equal(expected, bb), 'Exported facing is not an exact panel reflection'
                    want = (math.floor((index + 1) * 100 / right['fps'] + .5) - math.floor(index * 100 / right['fps'] + .5)) * 10
                    assert a.info['duration'] == b.info['duration'] == want
                    durations.append(want)
            verified.append({'right': right['file'], 'left': left['file'], 'durationsMs': durations, 'sourceFrames': right['frames'], 'everyDecodedFrameExactReflection': True, 'panelLabelsStayReadable': True})
    report = {'format': 'gathria-side-cloth-finish-presentation', 'version': 1, 'nativeBoards': boards, 'verifiedGifPairs': verified,
              'visualReview': 'walk21 sleeve/torso shrink and run38/39 skirt rise visibly reduced in same-frame native comparison. Existing donor transitions at walk23/run40 and old hard waist edges remain visible; this is a bounded repair, not a flawless-clothing claim.'}
    (OUT / 'presentation.json').write_text(json.dumps(report, indent=2) + '\n')
    spec = importlib.util.spec_from_file_location('finish_side_bank', ROOT / 'scripts/prepare-dual-looks-cloth.py')
    bank = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bank)
    metrics = []
    for slot, path in [('top', 'docs/kling-side-expansion/assets/female-blouse.garment.zip'), ('bottom', 'docs/kling-side-expansion/assets/female-skirt.garment.zip')]:
        current = bank.read_bank(ROOT / path)[4]
        for first, second in [(20, 21), (21, 22), (37, 38), (38, 39), (39, 40)]:
            values = {'before': [], 'after': []}
            for fid in (first, second):
                patch, owned = current[fid]
                old_patch, old_owned = side_finish_audit.undo_finish_frame(path, fid, patch, owned)
                values['before'].append(int((old_owned & (old_patch[:, :, 3] >= 128)).sum()))
                values['after'].append(int((owned & (patch[:, :, 3] >= 128)).sum()))
            row = {'slot': slot, 'fromFrameId': first, 'toFrameId': second}
            for key, areas in values.items():
                row[key] = {'visiblePixels': areas, 'symmetricAreaChange': round(abs(areas[1] - areas[0]) / max(1, sum(areas) / 2), 5)}
            metrics.append(row)
    (OUT / 'metrics.json').write_text(json.dumps({'format': 'gathria-bounded-cloth-area-comparison', 'note': 'Owned visible cloth area measures shape change, not pose correctness. Same source frames and timing on both sides; no pass threshold.', 'edges': metrics}, indent=2) + '\n')
    print(json.dumps({'nativeBoards': len(boards), 'gifsVerified': len(verified) * 2, 'status': 'PASS'}))


if __name__ == '__main__':
    main()
