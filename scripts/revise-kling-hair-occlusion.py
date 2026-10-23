#!/usr/bin/env python3
"""Metadata-only revision: all original PNG/ownership bytes remain exact.

Read current revision 2 banks (or rerun idempotently on revision 3); add an
explicit hair-only three-pixel top/side fringe. No drawing/resampling occurs.
"""
import hashlib
import json
from pathlib import Path
import zipfile
from kling_hair_occlusion import hair_occlusion_bounds
from kling_hair_foreground import HAND_PROVENANCE, reviewed_hand_foreground

ROOT = Path(__file__).resolve().parents[1]
NOTE = (' Revision 3 adds an explicit three-source-pixel top/side hair occlusion '
        'envelope for original scalp raster remnants. The lower head edge, '
        'foreground masks, face ownership and all atlas PNG bytes remain unchanged.')
for character in ('male', 'female'):
    path = ROOT / f'docs/kling-appearance/banks/{character}.zip'
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    with zipfile.ZipFile(path) as archive:
        files = {name: archive.read(name) for name in archive.namelist()}
    manifest = json.loads(files['manifest.json'])
    assert manifest['id'] in (f'kling-{character}-appearance-v2', f'kling-{character}-appearance-v3')
    manifest['id'] = f'kling-{character}-appearance-v3'
    for pose in manifest['poses']:
        pose['hairOcclusionBounds'] = hair_occlusion_bounds(
            pose['headBounds'], manifest['frameWidth'], manifest['frameHeight'])
        pose['foreground'] = reviewed_hand_foreground(character, pose)
    if NOTE not in manifest['provenance']:
        manifest['provenance'] += NOTE
    if character == 'female' and HAND_PROVENANCE not in manifest['provenance']:
        manifest['provenance'] += HAND_PROVENANCE
    files['manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    temporary = path.with_suffix('.tmp.zip')
    with zipfile.ZipFile(temporary, 'w') as archive:
        for name, data in sorted(files.items()):
            entry = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, data)
    with zipfile.ZipFile(temporary) as archive:
        assert archive.testzip() is None
        assert all(archive.read(name) == data for name, data in files.items())
    temporary.replace(path)
    print(json.dumps({'character': character, 'before': before,
                     'after': hashlib.sha256(path.read_bytes()).hexdigest(),
                     'unchangedPngs': len(files) - 1, 'poses': len(manifest['poses'])}), flush=True)
