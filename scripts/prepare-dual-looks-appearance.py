#!/usr/bin/env python3
"""Publish two reviewed source-native hairstyles and restrained expressions.

Original-view pixels come from released appearance banks. A new registration
binding is permitted only after proving unchanged source/head/anchors and zero
intersection between changed hand protection and every selected paint mask.
Side-view hair retains its native artwork; its separately reviewed mouth-only
face layer is prepared by prepare-dual-looks-side-face.py. No runtime inference.
"""
from pathlib import Path
import argparse
import copy
import hashlib
import io
import json
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/dual-looks/assets'
ART = ROOT / 'artwork/dual-looks/appearance'
COLORS = ['chestnut', 'espresso', 'copper']
HAIR = {'male': {'original': 'side-part', 'side': 'side-swept-crop'},
        'female': {'original': 'soft-bob', 'side': 'side-tucked-bob'}}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode()


def png_bytes(pixels):
    output = io.BytesIO()
    Image.fromarray(pixels).save(output, format='PNG', compress_level=9)
    return output.getvalue()


def polygon(points, width, height):
    # Independent pixel-centre, boundary-inclusive raster; same declared rule
    # as the runtime, without depending on its renderer or library parser.
    out = np.zeros((height, width), bool)
    if not points:
        return out
    x0 = max(0, int(np.floor(min(p['x'] for p in points))))
    y0 = max(0, int(np.floor(min(p['y'] for p in points))))
    x1 = min(width, int(np.ceil(max(p['x'] for p in points))) + 1)
    y1 = min(height, int(np.ceil(max(p['y'] for p in points))) + 1)
    yy, xx = np.indices((y1-y0, x1-x0), dtype=float)
    xx += x0 + .5
    yy += y0 + .5
    inside = np.zeros(xx.shape, bool)
    boundary = np.zeros(xx.shape, bool)
    for i, b in enumerate(points):
        a = points[i-1]
        cross = (xx-a['x'])*(b['y']-a['y'])-(yy-a['y'])*(b['x']-a['x'])
        boundary |= (abs(cross) < 1e-9) & (xx >= min(a['x'], b['x'])) & (xx <= max(a['x'], b['x'])) & (yy >= min(a['y'], b['y'])) & (yy <= max(a['y'], b['y']))
        if b['y'] != a['y']:
            inside ^= ((a['y'] > yy) != (b['y'] > yy)) & (xx < (b['x']-a['x'])*(yy-a['y'])/(b['y']-a['y'])+a['x'])
    out[y0:y1, x0:x1] = inside | boundary
    return out


def load_bank(path):
    data = path.read_bytes()
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        manifest = json.loads(archive.read('manifest.json'))
        pages = [(np.array(Image.open(io.BytesIO(archive.read(p['file']))).convert('RGBA')),
                  np.array(Image.open(io.BytesIO(archive.read(p['maskFile']))).convert('RGBA')))
                 for p in manifest['pages']]
    return data, manifest, pages


def crop_entry(frame, pages):
    p, m = pages[frame['page']]
    r = frame['rect']
    s = np.s_[r['y']:r['y']+r['height'], r['x']:r['x']+r['width']]
    return p[s].copy(), m[s].copy()


def selected_styles(manifest, pages, ids):
    styles = []
    entries = []
    for style_id in ids:
        style = copy.deepcopy(next(s for s in manifest['styles'] if s['id'] == style_id))
        styles.append(style)
        for layer in style['layers']:
            for frame in layer['frames']:
                if frame['mode'] == 'paint':
                    rgba, mask = crop_entry(frame, pages)
                    entries.append((frame, rgba, mask, style_id, layer['role']))
    return styles, entries


def source_protection_proof(old, new, entries):
    assert {k: v for k, v in old.items() if k != 'frames'} == {k: v for k, v in new.items() if k != 'frames'}
    before = {f['frameId']: f for f in old['frames']}
    after = {f['frameId']: f for f in new['frames']}
    assert before.keys() == after.keys()
    width, height = old['frameWidth'], old['frameHeight']
    rows = []
    for fid, row in before.items():
        revised = after[fid]
        assert {k: v for k, v in row.items() if k != 'protected'} == {k: v for k, v in revised.items() if k != 'protected'}
        a = {r['label']: r['polygon'] for r in row['protected']}
        b = {r['label']: r['polygon'] for r in revised['protected']}
        assert a.keys() == b.keys() and a['head'] == b['head']
        changed = np.zeros((height, width), bool)
        labels = []
        for label in a:
            if a[label] != b[label]:
                assert label in ['nearHand', 'farHand']
                changed |= polygon(a[label], width, height) ^ polygon(b[label], width, height)
                labels.append(label)
        if not labels:
            continue
        owned = np.zeros((height, width), bool)
        for frame, _, mask, _, _ in entries:
            if frame['frameId'] != fid:
                continue
            x, y = frame['offset']['x'], frame['offset']['y']
            h, w = mask.shape[:2]
            x0, y0 = max(0, x), max(0, y)
            x1, y1 = min(width, x+w), min(height, y+h)
            if x0 < x1 and y0 < y1:
                owned[y0:y1, x0:x1] |= mask[y0-y:y1-y, x0-x:x1-x, 3] == 255
        intersections = int(np.count_nonzero(changed & owned))
        assert intersections == 0, f'Appearance intersects changed protection in native frame {fid}'
        rows.append({'frameId': fid, 'changedLabels': labels,
                     'changedProtectionPixels': int(changed.sum()),
                     'selectedAppearanceOwnershipIntersection': intersections})
    return {'sameSourceEnvelopeFrameReferencesAndAnchors': True, 'sameHeadProtection': True,
            'allSelectedPaintDisjointFromChangedProtection': True, 'changedFrames': rows}


def side_face(character):
    directory = ROOT / f'artwork/dual-looks/side-face/{character}'
    layer = json.loads((directory / 'layer.json').read_text())
    audit = json.loads((directory / 'audit.json').read_text())
    style = {'id': 'gentle-side-v1', 'name': 'Gentle smile · side view', 'slot': 'face',
             'layers': [{'role': 'face', 'frames': []}]}
    entries = []
    for record in layer['frames']:
        fid = record['frameId']
        if record['mode'] == 'source':
            style['layers'][0]['frames'].append({'frameId': fid, 'mode': 'source', 'reason': record['reason']})
            continue
        rgba = np.array(Image.open(directory / record['rgba']).convert('RGBA'))
        mask_image = np.array(Image.open(directory / record['ownership']).convert('RGBA'))
        owned = mask_image[:, :, 3] == 255
        yy, xx = np.where(owned)
        x0, y0, x1, y1 = int(xx.min()), int(yy.min()), int(xx.max()+1), int(yy.max()+1)
        frame = {'frameId': fid, 'mode': 'paint', 'page': 0,
                 'rect': {'x': 0, 'y': 0, 'width': x1-x0, 'height': y1-y0},
                 'offset': {'x': x0, 'y': y0}}
        style['layers'][0]['frames'].append(frame)
        entries.append((frame, rgba[y0:y1, x0:x1], mask_image[y0:y1, x0:x1], style['id'], 'face'))
    return style, entries, audit


def pack(manifest, entries):
    width, maximum = 2048, 8192
    layouts = [[]]
    x = y = row_height = 0
    for i in sorted(range(len(entries)), key=lambda i: (-entries[i][1].shape[0], -entries[i][1].shape[1], i)):
        h, w = entries[i][1].shape[:2]
        assert w <= width and h <= maximum
        if x+w > width:
            x = 0
            y += row_height
            row_height = 0
        if y+h > maximum:
            layouts.append([])
            x = y = row_height = 0
        layouts[-1].append((i, x, y))
        x += w+2
        row_height = max(row_height, h+2)
    files = {}
    manifest['pages'] = []
    pixels = 0
    for page, layout in enumerate(layouts):
        height = max(y+entries[i][1].shape[0] for i, x, y in layout)
        rgba = np.zeros((height, width, 4), np.uint8)
        mask = np.zeros_like(rgba)
        for i, x, y in layout:
            frame, patch, own, _, _ = entries[i]
            h, w = patch.shape[:2]
            rgba[y:y+h, x:x+w] = patch
            mask[y:y+h, x:x+w] = own
            frame['page'] = page
            frame['rect'].update(x=x, y=y, width=w, height=h)
            assert np.array_equal(rgba[y:y+h, x:x+w], patch)
            assert np.array_equal(mask[y:y+h, x:x+w], own)
        spec = {'file': f'patches-{page}.png', 'maskFile': f'ownership-{page}.png', 'width': width, 'height': height}
        manifest['pages'].append(spec)
        files[spec['file']] = png_bytes(rgba)
        files[spec['maskFile']] = png_bytes(mask)
        pixels += width*height
    assert pixels <= 64*1024*1024 and len(layouts) <= 8
    files['manifest.json'] = json_bytes(manifest)
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
    return output.getvalue(), pixels


def build(character, view, representation, check):
    original = view == 'original'
    bank_path = ROOT / (f'docs/kling-expression-refined/banks/{character}-base.zip' if original else f'docs/kling-side-expansion/assets/{character}.appearance.zip')
    old_bytes, old, pages = load_bank(bank_path)
    reg_path = ROOT / representation['registrationUrl'].lstrip('/')
    reg_bytes = reg_path.read_bytes()
    registration = json.loads(reg_bytes)
    assert sha(reg_bytes) == representation['registrationSha256']
    assert old['sourceSha256'] == representation['sourceSha256']
    ids = [HAIR[character][view]] + (['gentle-v2'] if original else [])
    styles, entries = selected_styles(old, pages, ids)
    if original:
        previous = ROOT / ('docs/kling-wardrobe/registration/male-full-outfits-v1.json' if character == 'male' else 'docs/kling-wardrobe/registration/female.json')
        assert sha(previous.read_bytes()) == old['registrationSha256']
        proof = source_protection_proof(json.loads(previous.read_text()), registration, entries)
        face_audit = None
    else:
        assert old['registrationSha256'] == sha(reg_bytes)
        proof = source_protection_proof(registration, registration, entries)
        face, face_entries, face_audit = side_face(character)
        assert face_audit['sourceSha256'] == old['sourceSha256']
        assert face_audit['registrationSha256'] == sha(reg_bytes)
        assert {f['frameId'] for f in face['layers'][0]['frames']} == {p['frameId'] for p in old['poses']}
        styles.append(face)
        entries.extend(face_entries)
    manifest = copy.deepcopy(old)
    manifest.update(id=f'dual-looks-{character}-{view}-v1', name=f'Kling {character} {view} daily appearance',
                    registrationSha256=sha(reg_bytes), styles=styles,
                    provenance=f'Offline source-bound selection of existing {HAIR[character][view]} artwork from {bank_path.relative_to(ROOT)}. Original hair and existing refined-face patch RGBA/ownership are copied losslessly; source-native poses are retained exactly. Registration migration, where required, is permitted only after per-frame changed-protection disjointness proof. Side gentle is a separately reviewed compact mouth-only derivative of the native source, preserving other features and action expressions. No runtime retargeting or image generation. Provenance and review: artwork/dual-looks/appearance and artwork/dual-looks/side-face.')
    data, pixels = pack(manifest, entries)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        packed_pages = [(np.array(Image.open(io.BytesIO(archive.read(p['file']))).convert('RGBA')),
                         np.array(Image.open(io.BytesIO(archive.read(p['maskFile']))).convert('RGBA')))
                        for p in manifest['pages']]
    for frame, patch, own, _, _ in entries:
        actual_patch, actual_own = crop_entry(frame, packed_pages)
        assert np.array_equal(actual_patch, patch) and np.array_equal(actual_own, own)
    destination = OUT / f'{character}-{view}.appearance.zip'
    if check:
        assert destination.read_bytes() == data, f'Byte reproduction differs: {destination}'
    else:
        OUT.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    report = {'character': character, 'view': view, 'sourceBank': str(bank_path.relative_to(ROOT)),
              'sourceBankSha256': sha(old_bytes), 'sourceSha256': old['sourceSha256'],
              'oldRegistrationSha256': old['registrationSha256'], 'registrationSha256': sha(reg_bytes),
              'bankSha256': sha(data), 'nativePoseMetadataExact': manifest['poses'] == old['poses'],
              'selectedExistingPatchRgbaAndOwnershipExact': True, 'registrationProof': proof,
              'styles': [{'id': s['id'], 'sourceModes': sum(f['mode'] == 'source' for l in s['layers'] for f in l['frames'])} for s in styles],
              'frameCount': len(manifest['poses']), 'atlasPixels': pixels, 'bytes': len(data),
              'sideFaceAudit': face_audit}
    if not check:
        ART.mkdir(parents=True, exist_ok=True)
        (ART / f'{character}-{view}-binding.json').write_bytes(json_bytes(report))
    descriptor = {k: representation[k] for k in ['character', 'view', 'sourceUrl', 'sourceSha256', 'registrationUrl', 'registrationSha256', 'frameWidth', 'frameHeight', 'frameCount']}
    descriptor.update(url='/' + str(destination.relative_to(ROOT)), bankId=manifest['id'], bankSha256=sha(data), bytes=len(data),
                      hairId=HAIR[character][view], faceId='gentle-v2' if original else 'gentle-side-v1',
                      hairName='柔软侧分短发' if character == 'male' else '轻盈短波波', faceName='柔和微笑',
                      hairColors=COLORS, padding=manifest['padding'])
    print(f'{character}/{view}: {len(manifest["poses"])} source poses, {len(styles)} styles, {len(data)} bytes; binding and exact-copy proof passed', flush=True)
    return descriptor


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--view', choices=['original', 'side'])
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    catalog = json.loads((ROOT / 'docs/dual-tailored/assets/catalog.json').read_text())
    rows = [build(r['character'], r['view'], r, args.check) for r in catalog['representations'] if args.view is None or r['view'] == args.view]
    if args.view is None:
        data = json_bytes({'format': 'gathria-dual-looks-assets', 'version': 1, 'representations': rows})
        if args.check:
            assert (OUT/'catalog.json').read_bytes() == data
        else:
            (OUT/'catalog.json').write_bytes(data)


if __name__ == '__main__':
    main()
