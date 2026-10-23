#!/usr/bin/env python3
"""Append two newly authored hairstyles without repacking released paintings.

Male side-part and female tucked-bun are separately registered to the original
Kling heads. Existing styles and atlas PNG bytes come from the pinned baseline.
"""
from pathlib import Path
import argparse
import copy
import importlib.util
import io
import json
import subprocess
import zipfile

import numpy as np
from PIL import Image

from kling_wardrobe_common import ROOT, json_bytes, png_bytes, sha
from kling_hair_ear_fit import fit_ear_hair, blur_hair
from kling_hair_expansion import expansion_layers, expansion_overlap

BASELINE = '4d2efafc6bfcef7185d43c8aac50e3594f505b94'
ART = ROOT / 'artwork/kling-appearance'
STYLES = {'male': ('side-part', 'Side part', 5),
          'female': ('tucked-bun', 'Tucked bun', 4)}
spec = importlib.util.spec_from_file_location('original_hair_preparation', ROOT / 'scripts/prepare-kling-appearance.py')
original = importlib.util.module_from_spec(spec)
spec.loader.exec_module(original)


def layout(entries, remaining_pages, remaining_pixels):
    """Choose a bounded shelf layout for NEW patches, retaining original pages."""
    candidates = []
    for width in (1536, 1792, 2048, 2560, 3072, 4096):
        for height_limit in (4096, 6144, 8192):
            packed = []
            heights = []
            x = y = row_h = page = 0
            for index in sorted(range(len(entries)), key=lambda i: (-entries[i][1].shape[0], -entries[i][1].shape[1], i)):
                h, w = entries[index][1].shape[:2]
                if x + w > width:
                    x = 0
                    y += row_h
                    row_h = 0
                if y + h > height_limit:
                    heights.append(y + row_h)
                    page += 1
                    x = y = row_h = 0
                packed.append((index, page, x, y))
                x += w + 2
                row_h = max(row_h, h + 2)
            heights.append(y + row_h)
            pixels = width * sum(heights)
            if len(heights) <= remaining_pages and pixels <= remaining_pixels:
                candidates.append((pixels, len(heights), width, heights, packed))
    if not candidates:
        raise ValueError('New artwork exceeds existing bank limits; do not reduce source resolution or overwrite released pages.')
    return min(candidates, key=lambda item: (item[0], item[1], item[2]))


def build(character):
    relative = f'docs/kling-appearance/banks/{character}.zip'
    baseline_bytes = subprocess.check_output(['git', 'show', f'{BASELINE}:{relative}'], cwd=ROOT)
    with zipfile.ZipFile(io.BytesIO(baseline_bytes)) as archive:
        assert archive.testzip() is None
        files = {name: archive.read(name) for name in archive.namelist()}
    manifest = json.loads(files['manifest.json'])
    before = copy.deepcopy(manifest)
    style_id, name, revision = STYLES[character]
    heads = json.loads((ART / f'registration/{character}.json').read_text())
    assert heads['sourceSha256'] == manifest['sourceSha256']
    assert heads['bodyRegistrationSha256'] == manifest['registrationSha256']
    reference = next(row for row in heads['frames'] if row['frameId'] == 0)
    padding = manifest['padding']
    size = (manifest['frameWidth'] + padding['left'] + padding['right'],
            manifest['frameHeight'] + padding['top'] + padding['bottom'])
    poses = {pose['frameId']: pose for pose in manifest['poses']}
    entries = []
    layers = []
    for role, donor, fit in expansion_layers(character):
        Image.fromarray(donor).save(ART / f'source/{character}-{style_id}-{role}-cutout.png')
        layer = {'role': role, 'frames': []}
        for row in heads['frames']:
            frame_id = row['frameId']
            transform = (np.vstack([row['headTransform'], [0, 0, 1]]) @ np.vstack([fit, [0, 0, 1]]))[:2]
            transform[:, 2] += [padding['left'], padding['top']]
            rgba = original.warp_rgba(donor, transform, size)
            rgba = fit_ear_hair(donor, fit, row, reference, padding, size, rgba,
                                expansion_overlap(character, reference, role))
            blur = {88: .65, 89: 1.6, 90: 1.8, 91: .7, 100: .6, 101: 1.6, 102: 1.6, 103: .65}.get(frame_id, 0)
            rgba = blur_hair(rgba, blur)
            owned = rgba[:, :, 3] > 0
            assert owned.any() and not owned[[0, -1], :].any() and not owned[:, [0, -1]].any(), (character, role, frame_id, 'clipped')
            yy, xx = np.where(owned)
            x, y = int(xx.min()), int(yy.min())
            w, h = int(xx.max() + 1 - x), int(yy.max() + 1 - y)
            crop = rgba[y:y+h, x:x+w].copy()
            ownership = owned[y:y+h, x:x+w].copy()
            crop[~ownership] = 0
            offset = {'x': x - padding['left'], 'y': y - padding['top']}
            frame = {'frameId': frame_id, 'mode': 'paint', 'page': 0,
                     'rect': {'x': 0, 'y': 0, 'width': w, 'height': h}, 'offset': offset}
            layer['frames'].append(frame)
            entries.append((frame, crop, ownership))
            bounds = poses[frame_id]['hairBounds']
            left, top = min(bounds['x'], offset['x']), min(bounds['y'], offset['y'])
            right = max(bounds['x'] + bounds['width'], offset['x'] + w)
            bottom = max(bounds['y'] + bounds['height'], offset['y'] + h)
            poses[frame_id]['hairBounds'] = {'x': left, 'y': top, 'width': right-left, 'height': bottom-top}
        layers.append(layer)
    first_page = len(manifest['pages'])
    old_pixels = sum(p['width'] * p['height'] for p in manifest['pages'])
    pixels, _, width, heights, packed = layout(entries, 8-first_page, 64*1024*1024-old_pixels)
    for page, height in enumerate(heights):
        atlas = np.zeros((height, width, 4), np.uint8)
        mask = np.zeros_like(atlas)
        for index, target, x, y in packed:
            if target != page:
                continue
            frame, crop, owned = entries[index]
            h, w = crop.shape[:2]
            frame['page'] = first_page + page
            frame['rect'].update(x=x, y=y)
            atlas[y:y+h, x:x+w] = crop
            mask[y:y+h, x:x+w, 3] = owned.astype(np.uint8) * 255
        file, mask_file = f'patches-{first_page+page}.png', f'ownership-{first_page+page}.png'
        files[file], files[mask_file] = png_bytes(atlas), png_bytes(mask)
        manifest['pages'].append({'file': file, 'maskFile': mask_file, 'width': width, 'height': height})
    manifest['styles'].append({'id': style_id, 'name': name, 'slot': 'hair', 'layers': layers})
    manifest['id'] = f'kling-{character}-appearance-v{revision}'
    manifest['provenance'] += f' Expansion 2026-10-23: {name} hair donor generated with OpenAI image generation from original Kling references, only reviewed hair pixels retained. New registered front/back hair layers appended; all previous atlas PNG entries and style mappings retained byte-for-byte. Original face/body/source timing unchanged. Prompt, donor and cutout provenance: artwork/kling-appearance/source/expansion-prompt.txt.'
    assert manifest['styles'][:-1] == before['styles']
    assert manifest['pages'][:first_page] == before['pages']
    files['manifest.json'] = json_bytes(manifest)
    assert sum(map(len, files.values())) <= 64*1024*1024
    target = ROOT / relative
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for file, data in sorted(files.items()):
            info = zipfile.ZipInfo(file, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
    assert target.stat().st_size <= 64*1024*1024
    print(json.dumps({'character': character, 'style': style_id, 'frames': len(poses),
                      'pages': len(manifest['pages']), 'newPageSizes': [[width, h] for h in heights],
                      'pixels': old_pixels+pixels, 'bytes': target.stat().st_size,
                      'sha256': sha(target.read_bytes()), 'baselineSha256': sha(baseline_bytes)}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--character', choices=('male', 'female', 'both'), default='both')
    args = parser.parse_args()
    for character in ('male', 'female') if args.character == 'both' else (args.character,):
        build(character)
    record_path = ART / 'source-hashes.json'
    records = json.loads(record_path.read_text())
    indexed = {row['file'] for row in records}
    paths = [ART/'source/expansion-design.png', ART/'source/expansion-prompt.txt',
             *ART.glob('source/*-side-part-*-cutout.png'), *ART.glob('source/*-tucked-bun-*-cutout.png')]
    for path in paths:
        relative = str(path.relative_to(ROOT))
        record = {'file': relative, 'sha256': sha(path.read_bytes()), 'bytes': path.stat().st_size}
        if relative in indexed:
            next(row for row in records if row['file'] == relative).update(record)
        else:
            records.append(record)
    records.sort(key=lambda row: row['file'])
    record_path.write_text(json.dumps(records, indent=2)+'\n')
