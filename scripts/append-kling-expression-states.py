#!/usr/bin/env python3
"""Prototype and append Joyful to immutable released appearance-bank copies."""
import argparse
import copy
import io
import json
import zipfile

import numpy as np
from PIL import Image, ImageDraw

from kling_wardrobe_common import ROOT, load_source, json_bytes, png_bytes, sha
from kling_gentle_face import prepare_gentle_face
from kling_joyful_face import DONOR_FRAME, DONORS, PROVENANCE, prepare_joyful_face

OUT = ROOT/'docs/kling-expression'
REVIEW = OUT/'review'
BG = (238, 232, 218)


def pack_entries(patches):
    layer = {'role': 'face', 'frames': []}
    entries = []
    for fid, painting in patches.items():
        if painting is None:
            layer['frames'].append({'frameId': fid, 'mode': 'source', 'reason': 'Retain original celebration laughter.'})
            continue
        rgba, owned = painting
        yy, xx = np.where(owned)
        left, top, right, bottom = int(xx.min()), int(yy.min()), int(xx.max()+1), int(yy.max()+1)
        frame = {'frameId': fid, 'mode': 'paint', 'page': 0,
                 'rect': {'x': 0, 'y': 0, 'width': right-left, 'height': bottom-top},
                 'offset': {'x': left, 'y': top}}
        layer['frames'].append(frame)
        entries.append((frame, rgba[top:bottom, left:right].copy(), owned[top:bottom, left:right].copy()))
    return layer, entries


def layout(entries):
    candidates = []
    for width in [1024, 1280, 1536, 1792, 2048]:
        x = y = row_height = 0
        packed = []
        for index in sorted(range(len(entries)), key=lambda i: (-entries[i][1].shape[0], -entries[i][1].shape[1], i)):
            h, w = entries[index][1].shape[:2]
            if x+w > width:
                x = 0
                y += row_height
                row_height = 0
            packed.append((index, x, y))
            x += w+2
            row_height = max(row_height, h+2)
        height = y+row_height
        if height <= 8192:
            candidates.append((width*height, width, height, packed))
    return min(candidates)


def decode_pack(path):
    with zipfile.ZipFile(path) as archive:
        manifest = json.loads(archive.read('manifest.json'))
        sheets = [np.asarray(Image.open(io.BytesIO(archive.read(p['file']))).convert('RGBA'))
                  for p in [manifest['spritesheet'], *manifest.get('additionalSheets', [])]]
    return {f['id']: sheets[f.get('page', 0)][f['y']:f['y']+f['height'], f['x']:f['x']+f['width']].copy()
            for f in manifest['frames']}


def prepare(character):
    source, motion, config, frames = load_source(character)
    registration = json.loads((ROOT/f'artwork/kling-appearance/registration/{character}.json').read_text())
    assert registration['sourceSha256'] == sha(source)
    poses = {p['frameId']: p for p in registration['frames']}
    patches = {fid: prepare_joyful_face(frame, poses[fid], frames[DONOR_FRAME], poses[DONOR_FRAME], character)
               for fid, frame in frames.items()}
    return source, motion, frames, poses, patches


def prototype(character, frames, poses, patches):
    REVIEW.mkdir(parents=True, exist_ok=True)
    context_path = ROOT/f'docs/kling-polish/evidence/hair-v5/{character}-{character}-hair-after.character.zip'
    context = decode_pack(context_path)
    inputs = {'contextPack': str(context_path.relative_to(ROOT)), 'contextPackSha256': sha(context_path.read_bytes()),
              'donorFrameId': DONOR_FRAME, 'donor': DONORS[character], 'frames': []}
    for frame_id in [0, 55, 78, 86]:
        source = frames[frame_id]
        gentle = prepare_gentle_face(source, poses[frame_id])
        h = poses[frame_id]['headBounds']
        left, top = round(h['x'])-25, round(h['y'])-35
        bounds = (left+32, top+128, left+32+440, top+128+440)
        choices = []
        for label, patch in [('Natural', None), ('Gentle smile', gentle), ('Joyful', patches[frame_id])]:
            rgba = context[frame_id].copy()
            if patch is not None:
                painting, owned = patch
                target = rgba[128:128+1056, 32:32+704]
                # Existing app export supplies accepted hairstyle/context only.
                # Keep its hair pixels in front as the runtime compositor does.
                clear = np.all(target == source, axis=2)
                target[owned & clear] = painting[owned & clear]
            image = Image.fromarray(rgba)
            image.save(REVIEW/f'{character}-{label.lower().replace(" ", "-")}-{frame_id}-prototype.png')
            tile = Image.new('RGB', (440, 465), BG)
            crop = image.crop(bounds)
            tile.paste(crop, (0, 25), crop)
            ImageDraw.Draw(tile).text((8, 7), f'{character} / {label} / source {frame_id} / 1x prototype', fill=(40, 40, 40))
            choices.append(tile)
        row = Image.new('RGB', (1320, 465), BG)
        for index, tile in enumerate(choices):
            row.paste(tile, (index*440, 0))
        row.save(REVIEW/f'{character}-states-{frame_id}-1x.png')
        large = row.resize((2640, 930), Image.Resampling.NEAREST)
        draw = ImageDraw.Draw(large)
        draw.rectangle((0, 0, 2640, 49), fill=BG)
        for i, label in enumerate(['Natural', 'Gentle smile', 'Joyful']):
            draw.text((i*880+16, 15), f'{character} / {label} / source {frame_id} / 2x prototype', fill=(40, 40, 40))
        large.save(REVIEW/f'{character}-states-{frame_id}-2x.png')
        inputs['frames'].append({'frameId': frame_id, 'sourceExpression': poses[frame_id]['expression']['kind'],
                                 'joyfulChangedPixels': int(patches[frame_id][1].sum()) if patches[frame_id] else 0})
    inputs['note'] = 'Offline authoring prototype. App-exported hairstyle context is frozen; new face is composited locally for review. Browser proof is captured separately after packaging.'
    pixels, width, height, _ = layout(pack_entries(patches)[1])
    inputs['newPage'] = {'width': width, 'height': height, 'pixels': pixels}
    (REVIEW/f'{character}-prototype.json').write_text(json.dumps(inputs, indent=2)+'\n')
    print(json.dumps(inputs), flush=True)


def package_banks(character, source, frames, poses, patches, catalog):
    character_entry = next(c for c in catalog['characters'] if c['key'] == character)
    inputs = [{'url': character_entry['appearanceBankUrl'], 'sha256': character_entry['appearanceRevision']['bankSha256'],
               'bankId': character_entry['appearanceRevision']['bankId'], 'kind': 'base'},
              *[{**bank, 'kind': 'library'} for bank in character_entry['appearanceLibraries']]]
    release_index = OUT/'release-index.json'
    if release_index.exists():
        # Reproduce from the frozen inputs even after the live catalog points
        # to these new releases. Never append a second Joyful to a released copy.
        inputs = [{**bank['original'], 'kind': bank['kind']}
                  for bank in json.loads(release_index.read_text())['banks'] if bank['character'] == character]
        assert len(inputs) == 4
    layer, entries = pack_entries(patches)
    pixels, width, height, packed = layout(entries)
    atlas = np.zeros((height, width, 4), np.uint8)
    mask = np.zeros_like(atlas)
    for index, x, y in packed:
        frame, crop, owned = entries[index]
        h, w = crop.shape[:2]
        frame['rect'].update(x=x, y=y)
        atlas[y:y+h, x:x+w] = crop
        mask[y:y+h, x:x+w, 3] = owned.astype(np.uint8)*255
    patch_bytes, mask_bytes = png_bytes(atlas), png_bytes(mask)
    output = OUT/'banks'
    output.mkdir(parents=True, exist_ok=True)
    releases = []
    for entry in inputs:
        original_path = ROOT/entry['url'].lstrip('/')
        original_bytes = original_path.read_bytes()
        assert sha(original_bytes) == entry['sha256'], original_path
        with zipfile.ZipFile(io.BytesIO(original_bytes)) as archive:
            assert archive.testzip() is None
            files = {n: archive.read(n) for n in archive.namelist()}
        before = json.loads(files['manifest.json'])
        assert before['id'] == entry['bankId']
        assert before['sourceSha256'] == sha(source)
        assert not any(s['id'] == 'joyful' for s in before['styles'])
        manifest = copy.deepcopy(before)
        first_page = len(before['pages'])
        old_pixels = sum(p['width']*p['height'] for p in before['pages'])
        assert first_page+1 <= 8 and old_pixels+pixels <= 64*1024*1024
        file, mask_file = f'patches-{first_page}.png', f'ownership-{first_page}.png'
        files[file], files[mask_file] = patch_bytes, mask_bytes
        manifest['pages'].append({'file': file, 'maskFile': mask_file, 'width': width, 'height': height})
        new_layer = copy.deepcopy(layer)
        for frame in new_layer['frames']:
            if frame['mode'] == 'paint':
                frame['page'] = first_page
        manifest['styles'].append({'id': 'joyful', 'name': 'Joyful', 'slot': 'face', 'layers': [new_layer]})
        manifest['id'] = before['id']+'-expressions-v1'
        manifest['name'] = before['name']+' / Joyful'
        manifest['provenance'] += ' '+PROVENANCE
        assert manifest['styles'][:-1] == before['styles']
        assert manifest['poses'] == before['poses']
        assert manifest['padding'] == before['padding']
        files['manifest.json'] = json_bytes(manifest)
        assert sum(map(len, files.values())) <= 64*1024*1024
        stem = f'{character}-base' if entry['kind'] == 'base' else f'{character}-'+next(s['id'] for s in before['styles'] if s['slot'] == 'hair')
        target = output/f'{stem}.zip'
        with zipfile.ZipFile(target, 'w') as archive:
            for name, data in sorted(files.items()):
                info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, data)
        assert target.stat().st_size <= 64*1024*1024
        assert original_path.read_bytes() == original_bytes
        with zipfile.ZipFile(target) as archive, zipfile.ZipFile(io.BytesIO(original_bytes)) as previous:
            assert archive.testzip() is None
            unchanged = [n for n in previous.namelist() if n != 'manifest.json']
            assert all(archive.read(n) == previous.read(n) for n in unchanged)
        releases.append({'character': character, 'kind': entry['kind'],
                         'original': {'url': entry['url'], 'sha256': entry['sha256'], 'bankId': before['id']},
                         'release': {'url': '/'+str(target.relative_to(ROOT)), 'sha256': sha(target.read_bytes()), 'bankId': manifest['id'],
                                     'styles': [{k: s[k] for k in ['id', 'name', 'slot']} for s in manifest['styles']]},
                         'oldStylesExact': True, 'oldPagesExact': unchanged, 'posesAndPaddingExact': True,
                         'pageCount': len(manifest['pages']), 'totalPixels': old_pixels+pixels, 'newPagePixels': pixels,
                         'bytes': target.stat().st_size})
        print(json.dumps(releases[-1]), flush=True)
    return releases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--character', choices=['male', 'female', 'both'], default='both')
    parser.add_argument('--prototype', action='store_true')
    parser.add_argument('--package', action='store_true', help='Append reviewed artwork to new bank copies; originals stay immutable.')
    args = parser.parse_args()
    catalog = json.loads((ROOT/'docs/kling-wardrobe/catalog.json').read_text())
    releases = []
    for character in (['male', 'female'] if args.character == 'both' else [args.character]):
        source, motion, frames, poses, patches = prepare(character)
        if args.prototype:
            prototype(character, frames, poses, patches)
        if args.package:
            releases.extend(package_banks(character, source, frames, poses, patches, catalog))
        if not args.prototype and not args.package:
            raise ValueError('Choose --prototype or --package.')
    if releases:
        index_path = OUT/'release-index.json'
        if index_path.exists():
            rebuilt = {bank['character'] for bank in releases}
            releases += [bank for bank in json.loads(index_path.read_text())['banks'] if bank['character'] not in rebuilt]
        releases.sort(key=lambda bank: (bank['character'] != 'male', bank['kind'] != 'base', bank['release']['bankId']))
        index_path.write_text(json.dumps({'format': 'gathria-expression-release', 'version': 1,
            'selection': {'natural': None, 'gentleSmile': 'gentle', 'joyful': 'joyful'},
            'sourceDonorFrame': DONOR_FRAME, 'banks': releases}, indent=2)+'\n')


if __name__ == '__main__':
    main()
