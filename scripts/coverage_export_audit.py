"""Independent export checks for published, reviewed garment revisions.

This is not a new art-approval mechanism. CI's immutable artwork/coverage
verifiers prove each repository revision; this module binds browser downloads
to those exact archives and independently applies their source-bound guards.
It never imports runtime compositor/authoring code or rewrites review hashes.
"""
import hashlib
import io
import json
import subprocess
import zipfile
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASE = '5d63ae233ca83e61dc354e122a8708044f4e2653'


def sha(data):
    return hashlib.sha256(data).hexdigest()


@lru_cache(maxsize=8)
def historical(path):
    return subprocess.check_output(['git', 'show', BASE + ':' + path], cwd=ROOT)


@lru_cache(maxsize=1)
def catalog_items():
    result = {}
    for name in ('dual-view-wardrobe', 'dual-tailored', 'dual-looks-cloth', 'paired-polish'):
        catalog = json.loads((ROOT / f'docs/{name}/assets/catalog.json').read_bytes())
        for row in catalog['representations']:
            for item in row['items']:
                result.setdefault(item['id'], set()).add(item['url'].lstrip('/'))
    return result


def validate_garment(raw, registration):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        manifest = json.loads(archive.read('manifest.json'))
    candidates = catalog_items().get(manifest['id'], set())
    path = next((p for p in candidates if (ROOT / p).read_bytes() == raw), None)
    historical_input = False
    if path is None:
        # A new finish layer may replace the selectable ZIP while saved review
        # projects still embed the previous coverage revision. Its immutable
        # published receipt remains valid; do not reinterpret it as new art.
        receipts = json.loads((ROOT / 'docs/wardrobe-coverage/preservation.json').read_bytes())['changes']
        path = next((r['path'] for r in receipts if r['path'] in candidates
                     and r['id'] == manifest['id'] and r['sha256'] == sha(raw)), None)
    if path is None:
        path = next((p for p in candidates if historical(p) == raw), None)
        historical_input = True
    assert path, 'Export contains an unreviewed garment archive or altered permission manifest: ' + manifest['id']
    assert manifest['sourceSha256'] == registration['sourceSha256']
    assert (manifest['frameWidth'], manifest['frameHeight']) == (registration['frameWidth'], registration['frameHeight'])
    assert {f['frameId'] for f in manifest['frames']} == {f['frameId'] for f in registration['frames']}
    # Remember only audit identity outside the manifest; never alter exported data.
    return {'path': path, 'historical': historical_input, 'sha256': sha(raw)}


@lru_cache(maxsize=1)
def profiles():
    result = {}
    paths = [
        ROOT / 'artwork/kling-mask-workbench/female-neckline-cloth-v1.json',
        ROOT / 'artwork/wardrobe-coverage/neckline-profiles-v1.json',
    ]
    finish = ROOT / 'artwork/wardrobe-finish/female/neckline-profiles-v2.json'
    if finish.exists():
        paths.append(finish)
    for path in paths:
        payload = json.loads(path.read_bytes())
        for profile in payload.get('profiles', [payload]):
            assert profile['id'] not in result
            result[profile['id']] = profile
    return result


def protected_mask(manifest, frame, source, polygon):
    """Yield each exact guard after the garment's reviewed, bounded exceptions."""
    height, width = source.shape[:2]
    reviews = {(r['frameId'], r['label']): r for r in manifest.get('handProtectionReviews', [])}
    assert len(reviews) == len(manifest.get('handProtectionReviews', []))
    profile = None
    if manifest.get('necklinePermissionProfile'):
        assert manifest['version'] == 3 and manifest['slot'] in ('top', 'fullBody')
        profile = profiles()[manifest['necklinePermissionProfile']]
        for key in ('sourceSha256', 'registrationSha256', 'frameWidth', 'frameHeight'):
            assert profile[key] == manifest[key], 'Neckline permission bound to different source: ' + key
    for region in frame['protected']:
        review = reviews.get((frame['frameId'], region['label']))
        original = polygon(region['polygon'], width, height)
        guard = original.copy()
        if review:
            assert manifest['version'] in (2, 3) and manifest['slot'] in ('top', 'bottom', 'fullBody')
            assert region['label'] in ('nearHand', 'farHand')
            guard = polygon(review['polygon'], width, height)
            assert guard.any() and not np.any(guard & ~original), 'Hand review escapes original source guard'
        guard &= source[:, :, 3] > 0
        allowed = 0
        if region['label'] == 'head' and profile:
            for item in profile['frames']:
                if item['frameId'] != frame['frameId']:
                    continue
                for run in item['runs']:
                    y, left, right = run['y'], run['x0'], run['x1']
                    assert 0 <= y < height and 0 <= left <= right < width
                    allowed += int(guard[y, left:right + 1].sum())
                    guard[y, left:right + 1] = False
        yield region['label'], guard, review is not None, allowed


@lru_cache(maxsize=2)
def _prepared_pair(path):
    # A dressed view uses at most top/bottom here. Keep only two decoded pairs,
    # not every bank in the catalog or a full decoded sheet per native frame.
    pairs = []
    for raw in (historical(path), (ROOT / path).read_bytes()):
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            manifest = json.loads(archive.read('manifest.json'))
            pages = []
            for page in manifest['pages']:
                rgba = np.array(Image.open(io.BytesIO(archive.read(page['file']))).convert('RGBA'))
                alpha = np.array(Image.open(io.BytesIO(archive.read(page['maskFile']))).convert('RGBA'))[:, :, 3]
                pages.append((rgba, alpha))
            pairs.append((manifest, {f['frameId']: f for f in manifest['frames']}, pages))
    return pairs


def _native(prepared, frame_id):
    manifest, frames, pages = prepared
    frame = frames[frame_id]
    rect, offset = frame['rect'], frame['offset']
    crop = np.s_[rect['y']:rect['y'] + rect['height'], rect['x']:rect['x'] + rect['width']]
    rgba, alpha = pages[frame['page']]
    result = np.zeros((manifest['frameHeight'], manifest['frameWidth'], 4), np.uint8)
    mask = np.zeros(result.shape[:2], bool)
    area = np.s_[offset['y']:offset['y'] + rect['height'], offset['x']:offset['x'] + rect['width']]
    result[area] = rgba[crop]
    mask[area] = alpha[crop] == 255
    return result, mask


@lru_cache(maxsize=8)
def allowed_coverage_mask(path, frame_id, width, height):
    """Exact published garment delta since the fixed pre-coverage baseline.

    The artwork CI separately checks this delta against frozen review recipes.
    Here it bounds where current baked pixels may differ from old UI captures.
    """
    before = historical(path)
    after = (ROOT / path).read_bytes()
    if before == after:
        return np.zeros((height, width), bool)
    old, new = _prepared_pair(path)
    for manifest, _, _ in (old, new):
        assert (manifest['frameWidth'], manifest['frameHeight']) == (width, height)
    p, po = _native(old, frame_id)
    q, qo = _native(new, frame_id)
    return (po != qo) | ((po | qo) & np.any(p != q, axis=2))
