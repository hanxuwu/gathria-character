"""Verify and peel the explicitly frozen side-female temporal cloth revision.

Every modified pixel has before/after PNG samples and full-native hashes. The
old manifest is restored for historical checks, which still run independently.
No network or historical Git revision is needed to recover the preceding layer.
"""
from pathlib import Path
from functools import lru_cache
import hashlib
import io
import json

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'docs/wardrobe-finish/side/repair-report.json'
REPORT_SHA256 = '1c525a86e82a8bb87fb39a7238c433595b93f5e1478a1ee5e6504008618d04a7'


def _sha(value):
    return hashlib.sha256(value).hexdigest()


def _path(path):
    p = Path(path)
    if p.is_absolute():
        if str(p).startswith(str(ROOT) + '/'):
            p = p.relative_to(ROOT)
        elif str(p).startswith('/docs/'):
            p = Path(str(p).lstrip('/'))
        else:
            raise ValueError('Finish path must be repository-relative')
    return str(p).lstrip('/')


@lru_cache(maxsize=1)
def _records():
    report = json.loads(REPORT.read_text())
    assert _sha(json.dumps(report, sort_keys=True, separators=(',', ':')).encode()) == REPORT_SHA256, 'Side finish report pin changed'
    assert _sha((ROOT / 'artwork/wardrobe-finish/side/fit-controls.json').read_bytes()) == report['controlsSha256'], 'Cloth-only controls changed'
    assert len(report['items']) == 14
    return {r['path']: r for r in report['items']}


def is_finished(path):
    return _path(path) in _records()


def _record(path):
    path = _path(path)
    assert path in _records(), f'No frozen side finish layer for {path}'
    return _records()[path]


def asset_revision(path):
    r = _record(path)
    return {'beforeSha256': r['beforeSha256'], 'sha256': r['afterSha256'], 'bytes': r['bytes']}


def validated_previous_manifest(path, manifest):
    r = _record(path)
    assert manifest == r['afterManifest'], f'Unexpected finished manifest: {path}'
    for key in ('sourceSha256', 'registrationSha256', 'version', 'handProtectionReviews', 'necklinePermissionProfile'):
        assert manifest.get(key) == r['beforeManifest'].get(key), f'Permission/source binding changed: {key}'
    return json.loads(json.dumps(r['beforeManifest']))


def _crop(record, label):
    data = (ROOT / record[label]['path']).read_bytes()
    assert _sha(data) == record[label]['sha256'], f'Frozen {label} sample changed'
    mode = 'L' if 'ownership' in label else 'RGBA'
    value = np.array(Image.open(io.BytesIO(data)).convert(mode))
    if mode == 'L':
        assert np.isin(value, [0, 255]).all()
        return value == 255
    return value


def undo_finish_frame(path, fid, rgba, owned):
    r = _record(path)
    owned = np.asarray(owned, dtype=bool)
    assert rgba.dtype == np.uint8 and rgba.shape == (768, 512, 4)
    assert owned.shape == rgba.shape[:2]
    expected = next(f for f in r['frames'] if f['frameId'] == fid)
    assert _sha(rgba.tobytes()) == expected['patchSha256'], (path, fid, 'final patch differs')
    assert _sha(owned.tobytes()) == expected['ownershipSha256'], (path, fid, 'final ownership differs')
    change = next((f for f in r['changedFrames'] if f['frameId'] == fid), None)
    if change is None:
        return rgba, owned
    assert fid in (21, 38, 39)
    x0, y0, x1, y1 = change['bbox']
    region = np.s_[y0:y1, x0:x1]
    assert np.array_equal(rgba[region], _crop(change, 'after-patch'))
    assert np.array_equal(owned[region], _crop(change, 'after-ownership'))
    previous, mask = rgba.copy(), owned.copy()
    previous[region] = _crop(change, 'before-patch')
    mask[region] = _crop(change, 'before-ownership')
    assert _sha(previous.tobytes()) == change['beforePatchSha256'], (path, fid, 'previous patch differs')
    assert _sha(mask.tobytes()) == change['beforeOwnershipSha256'], (path, fid, 'previous ownership differs')
    return previous, mask
