#!/usr/bin/env python3
"""Record the two source-backed female thumb-mask defects in retained exports."""
from pathlib import Path
import importlib.util
import io
import json
import subprocess
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('validation', ROOT / 'scripts/verify-kling-head-boundary-exports.py')
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
h = v.helper
BASELINE = '055e95116cd441be7a630554409738b4a0b67ef9'
source_path = ROOT / 'docs/kling-motion/exports/female.character.zip'
old_path = ROOT / 'docs/kling-appearance/ear-edge-review/evidence/final-female/exports/female-soft-bob.character.zip'
_, sources = h.decode_pack(source_path)
_, old = h.decode_pack(old_path)
with zipfile.ZipFile(io.BytesIO(subprocess.check_output(['git', 'show', f'{BASELINE}:docs/kling-appearance/banks/female.zip'], cwd=ROOT))) as archive:
    bank = json.loads(archive.read('manifest.json'))
poses = {p['frameId']: p for p in bank['poses']}
rows = []
checks = []
for fid, points in v.HAND_REPAIRS.items():
    original = np.array(sources[fid])
    yy, xx = np.mgrid[:original.shape[0], :original.shape[1]]
    patch = v.in_polygon(points, xx + .5, yy + .5)
    prior = np.zeros(patch.shape, bool)
    for polygon in poses[fid]['foreground']:
        prior |= v.in_polygon([(p['x'], p['y']) for p in polygon], xx + .5, yy + .5)
    added = patch & ~prior
    y, x = np.where(added)
    assert (original[patch, 3] == 255).all()
    sample = (152, 413) if fid == 78 else (155, 441)
    checks.append({
        'frameId': fid,
        'additionalSourceForegroundPolygon': [dict(x=x, y=y) for x, y in points],
        'additionalPixelCenterOwnership': int(added.sum()),
        'addedBoundsInclusive': [int(x.min()), int(y.min()), int(x.max()), int(y.max())],
        'everyProtectedSourcePixelOpaque': True,
        'sampleSourcePosition': list(sample),
        'originalRgba': list(sources[fid].getpixel(sample)),
        'beforeRgba': list(old[fid].getpixel((sample[0] + 32, sample[1] + 128))),
    })
    box = (135, 390, 180, 440) if fid == 78 else (135, 425, 180, 475)
    old_box = tuple(value + (32 if i % 2 == 0 else 128) for i, value in enumerate(box))
    tiles = []
    for label, crop in [('Original source', sources[fid].crop(box)), ('Retained before export', old[fid].crop(old_box))]:
        tiles.append(h.sheet_tile(crop.resize((270, 300), Image.Resampling.NEAREST), f'Female {fid} / {label} / 6x', 1))
    rows.append(h.join_row(tiles))
dest = ROOT / 'docs/kling-appearance/stability-review'
board = Image.new('RGB', (540, 664), h.BG)
for i, row in enumerate(rows):
    board.paste(row, (0, i * 332))
image_path = dest / 'hand-foreground-before-6x.png'
board.save(image_path)
report = {
    'baselineCommit': BASELINE,
    'sourcePack': str(source_path.relative_to(ROOT)),
    'sourceSha256': h.sha(source_path),
    'beforePack': str(old_path.relative_to(ROOT)),
    'beforeSha256': h.sha(old_path),
    'review': 'The source has uninterrupted thumb skin. Old foreground polygons cut an inward notch through it, so front hair paints two triangular wedges over the hand. The additions follow that opaque source hand only; no color deletion, alpha fringe changes or repainting.',
    'neighborReview': {'frameIds': [75, 80], 'note': '77 is absent from the selected export frame set. 75 and 80 are the immediate selected neighbors; no analogous interior hair wedge was found in these native hand crops. The partially transparent pale source edge remains a separate limitation.'},
    'frames': checks,
    'diagnosticImage': str(image_path.relative_to(ROOT)),
    'diagnosticImageSha256': h.sha(image_path),
}
(dest / 'hand-foreground-diagnostics.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'frames': len(checks), 'additionalOpaquePixels': sum(c['additionalPixelCenterOwnership'] for c in checks)}))
