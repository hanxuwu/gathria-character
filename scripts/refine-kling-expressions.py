#!/usr/bin/env python3
"""Append bounded source-mouth refinements to copies of released Kling banks.

Existing style mappings and atlas pixel regions remain exact. The last atlas
grows downward, avoiding an extra page in the already-eight-page male bank.
"""
from __future__ import annotations

import argparse
import copy
import io
import json
import zipfile

import cv2
import numpy as np
from PIL import Image, ImageDraw

from kling_gentle_face import _point, _polygon_mask
from kling_joyful_face import DONORS
from kling_wardrobe_common import ROOT, json_bytes, load_source, png_bytes, sha

OUT = ROOT / 'docs/kling-expression-refined'
BASELINE = ROOT / 'docs/kling-expression/release-index.json'
BLUR_SIGMA = {88: .9, 89: 2.8, 90: 3.2, 91: 1.1,
              100: 1.0, 101: 2.6, 102: 2.8, 103: 1.0}
STYLES = [('gentle-v2', 'Gentle smile (refined)'), ('joyful-v2', 'Joyful (soft motion)')]
PROVENANCE = (
    'Expression refinement v2: Gentle remaps only each original pose\'s painted '
    'mouth curve, widening and lifting its corners without touching eyes, nose '
    'or brows. Joyful reuses the released frame-78 donor treatment, with bounded '
    'additional mouth softness only on source jump frames 88-91 and 100-103. '
    'Native eye/blink artwork, alpha, silhouette and laughter remain original. '
    'Old styles and their atlas pixel regions are retained exactly. '
    'Authoring: scripts/refine-kling-expressions.py.'
)


def read_bank(path):
    with zipfile.ZipFile(path) as archive:
        files = {name: archive.read(name) for name in archive.namelist()}
    return json.loads(files['manifest.json']), files


def decode_page(files, page):
    return tuple(np.asarray(Image.open(io.BytesIO(files[page[key]])).convert('RGBA')).copy()
                 for key in ['file', 'maskFile'])


def compose(source, manifest, files, style_id, fid, cache):
    style = next(style for style in manifest['styles'] if style['id'] == style_id)
    frame = next(frame for frame in style['layers'][0]['frames'] if frame['frameId'] == fid)
    result = source.copy()
    if frame['mode'] == 'source':
        return result
    page = frame['page']
    if page not in cache:
        cache[page] = decode_page(files, manifest['pages'][page])
    paint, mask = cache[page]
    r, o = frame['rect'], frame['offset']
    x, y, w, h = [r[key] for key in ['x', 'y', 'width', 'height']]
    owned = mask[y:y+h, x:x+w, 3] == 255
    target = result[o['y']:o['y']+h, o['x']:o['x']+w]
    target[owned] = paint[y:y+h, x:x+w][owned]
    return result


def permitted_region(source, pose):
    height, width = source.shape[:2]
    permitted = _polygon_mask(pose['facePolygon'], (width, height)) & (source[:, :, 3] == 255)
    for foreground in pose.get('foreground', []):
        permitted &= ~_polygon_mask(foreground, (width, height))
    yy, xx = np.indices((height, width), dtype=np.float32)
    axes = np.asarray(pose['faceTransform'], np.float32)[:, :2]
    inverse = np.linalg.inv(axes)
    for feature, rx, ry in [('nearEye', 62, 52), ('farEye', 39, 50), ('nose', 14, 16)]:
        center = _point(pose['featureGuides'][feature])
        dx, dy = xx+.5-center[0], yy+.5-center[1]
        u, v = inverse[0, 0]*dx+inverse[0, 1]*dy, inverse[1, 0]*dx+inverse[1, 1]*dy
        permitted &= (u/rx)**2+(v/ry)**2 > 1
    distance = cv2.distanceTransform(permitted.astype(np.uint8), cv2.DIST_L2, 5)
    edge = np.clip((distance-1.5)/4, 0, 1)
    return permitted, edge*edge*(3-2*edge), xx, yy, axes, inverse


def painting(source, result, permitted):
    changed = np.any(source[:, :, :3] != result[:, :, :3], axis=2) & permitted
    patch = np.zeros_like(source)
    patch[changed] = result[changed]
    assert np.array_equal(patch[changed, 3], source[changed, 3])
    return patch, changed


def gentle(source, pose):
    if pose['expression']['kind'] == 'laugh':
        return None
    permitted, edge, xx, yy, axes, inverse = permitted_region(source, pose)
    center = _point(pose['featureGuides']['mouth'])
    px, py = xx-center[0], yy-center[1]
    u, v = inverse[0, 0]*px+inverse[0, 1]*py, inverse[1, 0]*px+inverse[1, 1]*py
    # A constant inner scale preserves the source curve rather than pulling
    # each corner into a new bend. Only surrounding skin receives the falloff.
    def falloff(distance, inner, outer):
        value = np.clip((outer-np.abs(distance))/(outer-inner), 0, 1)
        return value*value*(3-2*value)
    support = falloff(u, 36, 65)*falloff(v, 16, 33)
    local_dx, local_dy = u*(1-1/1.20)*support, v*(1-1/1.85)*support
    dx = axes[0, 0]*local_dx+axes[0, 1]*local_dy
    dy = axes[1, 0]*local_dx+axes[1, 1]*local_dy
    result = source.copy()
    result[:, :, :3] = cv2.remap(source[:, :, :3], xx-dx*edge, yy-dy*edge,
                                cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return painting(source, result, permitted)


def soft_joyful(source, previous, pose, donor_pose, character):
    """Soften the existing transferred mouth locally; retain all other paint."""
    fid = pose['frameId']
    assert fid in BLUR_SIGMA
    permitted, edge, xx, yy, axes, inverse = permitted_region(source, pose)
    height, width = source.shape[:2]
    annotation = DONORS[character]
    donor_mask = _polygon_mask([{'x': x, 'y': y} for x, y in annotation['polygon']], (width, height))
    donor_mask = cv2.dilate(donor_mask.astype(np.uint8), np.ones((9, 9), np.uint8))
    donor_axes = np.asarray(donor_pose['faceTransform'], np.float32)[:, :2]
    transform_axes = axes @ np.linalg.inv(donor_axes) * .72
    target = _point(pose['featureGuides']['mouth'])-axes[:, 1]*6
    offset = target-transform_axes@np.asarray(annotation['center'], np.float32)
    envelope = cv2.warpAffine(donor_mask, np.column_stack((transform_axes, offset)),
                              (width, height), flags=cv2.INTER_NEAREST).astype(bool) & permitted
    distance = cv2.distanceTransform(envelope.astype(np.uint8), cv2.DIST_L2, 5)
    weight = np.clip(distance/5, 0, 1)
    weight = weight*weight*(3-2*weight)*edge
    blurred = cv2.GaussianBlur(previous[:, :, :3], (0, 0), BLUR_SIGMA[fid])
    result = previous.copy()
    result[:, :, :3] = np.clip(np.rint(previous[:, :, :3]*(1-weight[:, :, None])+
                                      blurred*weight[:, :, None]), 0, 255).astype(np.uint8)
    # Old Joyful's brow/cheek treatment remains exact outside this mouth mask.
    assert not np.any(np.any(result != previous, axis=2) & ~envelope)
    return painting(source, result, permitted | np.any(previous != source, axis=2))


def pack_entries(patches):
    frames, entries = [], []
    for fid, patch in patches.items():
        if patch is None:
            frames.append({'frameId': fid, 'mode': 'source', 'reason': 'Retain original celebration laughter.'})
            continue
        rgba, owned = patch
        yy, xx = np.where(owned)
        left, top, right, bottom = int(xx.min()), int(yy.min()), int(xx.max()+1), int(yy.max()+1)
        frame = {'frameId': fid, 'mode': 'paint', 'page': 0,
                 'rect': {'x': 0, 'y': 0, 'width': right-left, 'height': bottom-top},
                 'offset': {'x': left, 'y': top}}
        frames.append(frame)
        entries.append((frame, rgba[top:bottom, left:right].copy(), owned[top:bottom, left:right].copy()))
    return frames, entries


def layout(entries, width):
    x = y = row_height = 0
    packed = []
    for index in sorted(range(len(entries)), key=lambda i: (-entries[i][1].shape[0], -entries[i][1].shape[1], i)):
        h, w = entries[index][1].shape[:2]
        assert w <= width
        if x+w > width:
            x = 0
            y += row_height
            row_height = 0
        packed.append((index, x, y))
        x += w+2
        row_height = max(row_height, h+2)
    return y+row_height, packed


def source_inputs(character):
    source, motion, config, frames = load_source(character)
    poses_doc = json.loads((ROOT/f'artwork/kling-appearance/registration/{character}.json').read_text())
    assert poses_doc['sourceSha256'] == sha(source)
    poses = {pose['frameId']: pose for pose in poses_doc['frames']}
    inputs = [bank for bank in json.loads(BASELINE.read_text())['banks'] if bank['character'] == character]
    base = next(bank for bank in inputs if bank['kind'] == 'base')['release']
    manifest, files = read_bank(ROOT/base['url'].lstrip('/'))
    return source, motion, frames, poses, inputs, manifest, files


def prototype(character, frames, poses, manifest, files):
    review = OUT/'review'
    review.mkdir(parents=True, exist_ok=True)
    cache = {}
    records = []
    for family, fids in [('gentle', [0, 55, 86, 78]), ('joyful', list(BLUR_SIGMA))]:
        board = Image.new('RGB', (840, len(fids)*230), (238, 232, 218))
        draw = ImageDraw.Draw(board)
        for row, fid in enumerate(fids):
            source, pose = frames[fid], poses[fid]
            previous = compose(source, manifest, files, family, fid, cache)
            patch = gentle(source, pose) if family == 'gentle' else soft_joyful(source, previous, pose, poses[78], character)
            refined = source.copy()
            if patch is not None:
                refined[patch[1]] = patch[0][patch[1]]
            mouth = _point(pose['featureGuides']['mouth'])
            left, top = round(mouth[0])-155, round(mouth[1])-160
            for column, (label, rgba) in enumerate([('Natural source', source), (family+' v1', previous), (family+' v2', refined)]):
                crop = Image.fromarray(rgba).crop((left, top, left+280, top+205))
                board.paste(crop, (column*280, row*230+25), crop)
                draw.text((column*280+6, row*230+6), f'{character} / {label} / {fid} / 1x', fill=(35, 35, 35))
            records.append({'style': family+'-v2', 'frameId': fid,
                            'changedPixelsFromSource': int(patch[1].sum()) if patch else 0,
                            'changedPixelsFromV1': int(np.any(refined != previous, axis=2).sum())})
        path = review/f'{character}-{family}-prototype-1x.png'
        board.save(path)
    (review/f'{character}-prototype.json').write_text(json.dumps({'note': 'Offline native source-pixel prototypes, not application exports.',
        'frames': records}, indent=2)+'\n')
    print(json.dumps({'character': character, 'stage': 'prototype', 'frames': len(records)}), flush=True)


def package(character, source, frames, poses, inputs, manifest, files):
    gentle_frames, gentle_entries = pack_entries({fid: gentle(frame, poses[fid]) for fid, frame in frames.items()})
    cache = {}
    joyful_frames, joyful_entries = pack_entries({fid: soft_joyful(frames[fid],
        compose(frames[fid], manifest, files, 'joyful', fid, cache), poses[fid], poses[78], character) for fid in BLUR_SIGMA})
    entries = gentle_entries+joyful_entries
    output = OUT/'banks'
    output.mkdir(parents=True, exist_ok=True)
    releases = []
    for input_bank in inputs:
        original = input_bank['release']
        path = ROOT/original['url'].lstrip('/')
        assert sha(path.read_bytes()) == original['sha256']
        before, bank_files = read_bank(path)
        assert before['sourceSha256'] == sha(source)
        assert not any(style['id'].endswith('-v2') for style in before['styles'])
        after = copy.deepcopy(before)
        page_id = len(after['pages'])-1
        page = after['pages'][page_id]
        old_height, width = page['height'], page['width']
        extra_height, packed = layout(entries, width)
        height = old_height+2+extra_height
        pixels = sum(p['width']*p['height'] for p in before['pages'])+width*(height-old_height)
        assert height <= 8192 and len(after['pages']) <= 8 and pixels <= 64*1024*1024, (character, pixels, extra_height)
        old_paint, old_mask = decode_page(bank_files, page)
        atlas, mask = np.zeros((height, width, 4), np.uint8), np.zeros((height, width, 4), np.uint8)
        atlas[:old_height], mask[:old_height] = old_paint, old_mask
        for index, x, y in packed:
            frame, crop, owned = entries[index]
            y += old_height+2
            h, w = crop.shape[:2]
            frame['page'] = page_id
            frame['rect'].update(x=x, y=y)
            atlas[y:y+h, x:x+w] = crop
            mask[y:y+h, x:x+w, 3] = owned.astype(np.uint8)*255
        page['height'] = height
        bank_files[page['file']], bank_files[page['maskFile']] = png_bytes(atlas), png_bytes(mask)
        gentle_style = {'id': STYLES[0][0], 'name': STYLES[0][1], 'slot': 'face',
                        'layers': [{'role': 'face', 'frames': copy.deepcopy(gentle_frames)}]}
        joyful_style = copy.deepcopy(next(style for style in before['styles'] if style['id'] == 'joyful'))
        joyful_style.update(id=STYLES[1][0], name=STYLES[1][1])
        replacements = {frame['frameId']: frame for frame in joyful_frames}
        joyful_style['layers'][0]['frames'] = [copy.deepcopy(replacements.get(frame['frameId'], frame))
                                              for frame in joyful_style['layers'][0]['frames']]
        after['styles'].extend([gentle_style, joyful_style])
        stem = path.stem
        after['id'] = 'kling-'+stem+'-expressions-refined-v2'
        after['name'] = before['name']+' / Refined expressions'
        after['provenance'] += ' '+PROVENANCE
        assert len(after['id']) <= 64 and len(after['styles']) <= 8
        assert after['styles'][:-2] == before['styles']
        assert np.array_equal(atlas[:old_height], old_paint) and np.array_equal(mask[:old_height], old_mask)
        bank_files['manifest.json'] = json_bytes(after)
        assert sum(map(len, bank_files.values())) <= 64*1024*1024
        target = output/f'{stem}.zip'
        with zipfile.ZipFile(target, 'w') as archive:
            for name, data in sorted(bank_files.items()):
                info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, data)
        assert target.stat().st_size <= 64*1024*1024
        releases.append({'character': character, 'kind': input_bank['kind'],
            'original': {key: original[key] for key in ['url', 'sha256', 'bankId']},
            'release': {'url': '/'+str(target.relative_to(ROOT)), 'sha256': sha(target.read_bytes()), 'bankId': after['id'],
                        'styles': [{key: style[key] for key in ['id', 'name', 'slot']} for style in after['styles']]},
            'pageCount': len(after['pages']), 'totalPixels': pixels, 'addedPixelCount': width*(height-old_height),
            'bytes': target.stat().st_size, 'appendedStyles': [style[0] for style in STYLES],
            'oldStyleMappingsExact': True, 'oldAtlasPixelRegionsExact': True,
            'expandedPage': {'index': page_id, 'width': width, 'oldHeight': old_height, 'height': height}})
        print(json.dumps(releases[-1]), flush=True)
    return releases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--character', choices=['male', 'female', 'both'], default='both')
    parser.add_argument('--prototype', action='store_true')
    parser.add_argument('--package', action='store_true')
    args = parser.parse_args()
    if not args.prototype and not args.package:
        parser.error('Choose --prototype or --package.')
    releases = []
    for character in (['male', 'female'] if args.character == 'both' else [args.character]):
        source, motion, frames, poses, inputs, manifest, files = source_inputs(character)
        if args.prototype:
            prototype(character, frames, poses, manifest, files)
        if args.package:
            releases.extend(package(character, source, frames, poses, inputs, manifest, files))
    if releases:
        index = {'format': 'gathria-expression-refinement-release', 'version': 1,
                 'baselineIndex': '/'+str(BASELINE.relative_to(ROOT)), 'baselineIndexSha256': sha(BASELINE.read_bytes()),
                 'selection': {'natural': None, 'gentle': 'gentle', 'joyful': 'joyful',
                               'gentleRefined': 'gentle-v2', 'joyfulSoftMotion': 'joyful-v2'},
                 'joyfulChangedFrameIds': list(BLUR_SIGMA), 'banks': releases}
        (OUT/'release-index.json').write_text(json.dumps(index, indent=2)+'\n')


if __name__ == '__main__':
    main()
