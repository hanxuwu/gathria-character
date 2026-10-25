#!/usr/bin/env python3
"""Independently inspect appended expression banks and immutable source pixels.

This reads the shipped ZIPs, not the authoring function's in-memory result.
Eye/nose guides are inferred authoring annotations, so the explicit sampled
regions supplement the native-size visual review rather than proving anatomy.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageDraw

from kling_wardrobe_common import ROOT, load_source


OUT = ROOT / 'docs/kling-expression'
BLURRED_REVIEW_FRAMES = [89, 90, 101, 102, 103]


def digest(value):
    return hashlib.sha256(value).hexdigest()


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def polygon(points, size):
    """Boundary-inclusive pixel-center rasterization, independent of authoring."""
    width, height = size
    left = max(0, int(np.floor(min(p['x'] for p in points))))
    top = max(0, int(np.floor(min(p['y'] for p in points))))
    right = min(width, int(np.ceil(max(p['x'] for p in points)))+1)
    bottom = min(height, int(np.ceil(max(p['y'] for p in points)))+1)
    result = np.zeros((height, width), dtype=bool)
    if right <= left or bottom <= top:
        return result
    yy, xx = np.indices((bottom-top, right-left), dtype=float)
    xx += left+.5
    yy += top+.5
    inside = np.zeros(xx.shape, dtype=bool)
    boundary = np.zeros_like(inside)
    for index, current in enumerate(points):
        previous = points[index-1]
        ax, ay, bx, by = previous['x'], previous['y'], current['x'], current['y']
        cross = (xx-ax)*(by-ay)-(yy-ay)*(bx-ax)
        boundary |= ((np.abs(cross) < 1e-9) & (xx >= min(ax, bx)) &
                     (xx <= max(ax, bx)) & (yy >= min(ay, by)) & (yy <= max(ay, by)))
        if ay != by:
            inside ^= ((ay > yy) != (by > yy)) & (xx < (bx-ax)*(yy-ay)/(by-ay)+ax)
    result[top:bottom, left:right] = inside | boundary
    return result


def protected_features(pose, width, height):
    """Conservative source-guide ellipses, expressed in native head axes."""
    yy, xx = np.indices((height, width), dtype=float)
    xx += .5
    yy += .5
    inverse = np.linalg.inv(np.asarray(pose['faceTransform'], dtype=float)[:, :2])
    masks = {}
    for feature, rx, ry in [('nearEye', 52, 44), ('farEye', 32, 40), ('nose', 13, 15)]:
        center = pose['featureGuides'][feature]
        dx, dy = xx-center['x'], yy-center['y']
        u = inverse[0, 0]*dx+inverse[0, 1]*dy
        v = inverse[1, 0]*dx+inverse[1, 1]*dy
        masks[feature] = (u/rx)**2+(v/ry)**2 <= 1
    return masks


def rgba(archive, name):
    return np.asarray(Image.open(io.BytesIO(archive.read(name))).convert('RGBA'))


def blurred_review(character, source_frames, composites, guides):
    background = (238, 232, 218)
    board = Image.new('RGB', (280*len(BLURRED_REVIEW_FRAMES), 520), background)
    draw = ImageDraw.Draw(board)
    for column, fid in enumerate(BLURRED_REVIEW_FRAMES):
        pose = guides[fid]['featureGuides']
        left = round((pose['nearEye']['x']+pose['farEye']['x'])/2)-140
        top = round(min(pose['nearEye']['y'], pose['farEye']['y']))-60
        for row, (label, pixels) in enumerate([('Natural source', source_frames[fid]), ('Joyful shipped bank', composites[fid])]):
            crop = Image.fromarray(pixels).crop((left, top, left+280, top+230))
            board.paste(crop, (column*280, row*260+30), crop)
            draw.text((column*280+6, row*260+7), f'{character} / {label} / {fid} / 1x', fill=(35, 35, 35))
    path = OUT / f'review/{character}-blurred-source-joyful-1x.png'
    path.parent.mkdir(parents=True, exist_ok=True)
    board.save(path)
    return {'file': str(path.relative_to(ROOT)), 'sha256': digest(path.read_bytes()),
            'frameIds': BLURRED_REVIEW_FRAMES, 'scale': 1,
            'note': 'Native crops of original source and the shipped Joyful bank composited over that same source; no hairstyle/context substitution.'}


def inspect_character(character, releases):
    source, source_manifest, source_config, frames = load_source(character)
    head_path = ROOT / f'artwork/kling-appearance/registration/{character}.json'
    heads = json.loads(head_path.read_text())
    guides = {p['frameId']: p for p in heads['frames']}
    require(heads['sourceSha256'] == digest(source), f'{character}: head registration source mismatch')
    require(set(guides) == set(frames), f'{character}: missing original source guides')
    banks, frame_results, reference_paints = [], [], None
    review_composites = {}
    for release in releases:
        old_path = ROOT / release['original']['url'].lstrip('/')
        new_path = ROOT / release['release']['url'].lstrip('/')
        old_bytes, new_bytes = old_path.read_bytes(), new_path.read_bytes()
        label = new_path.name
        require(digest(old_bytes) == release['original']['sha256'], f'{label}: original ZIP hash changed')
        require(digest(new_bytes) == release['release']['sha256'], f'{label}: release ZIP hash mismatch')
        with zipfile.ZipFile(io.BytesIO(old_bytes)) as before, zipfile.ZipFile(io.BytesIO(new_bytes)) as after:
            require(before.testzip() is None and after.testzip() is None, f'{label}: ZIP checksum')
            old, new = json.loads(before.read('manifest.json')), json.loads(after.read('manifest.json'))
            require(new['id'] == release['release']['bankId'], f'{label}: release identity')
            require(old['id'] == release['original']['bankId'], f'{label}: original identity')
            for key in set(old)-{'id', 'name', 'provenance', 'styles', 'pages'}:
                require(old[key] == new[key], f'{label}: original {key} changed')
            require(new['styles'][:-1] == old['styles'], f'{label}: original style mappings changed')
            require(new['pages'][:-1] == old['pages'], f'{label}: original page mappings changed')
            require(new['sourceSha256'] == digest(source), f'{label}: source bytes mismatch')
            old_files = [name for name in before.namelist() if name != 'manifest.json']
            require(all(before.read(name) == after.read(name) for name in old_files), f'{label}: original PNG bytes changed')
            require(len(new['pages']) <= 8, f'{label}: page limit')
            pixels = sum(p['width']*p['height'] for p in new['pages'])
            require(pixels <= 64*1024*1024 and len(new_bytes) <= 64*1024*1024, f'{label}: bank limits')
            require(sum(info.file_size for info in after.infolist()) <= 64*1024*1024, f'{label}: decoded file-byte limit')
            style = new['styles'][-1]
            require(style['id'] == 'joyful' and style['slot'] == 'face', f'{label}: missing appended Joyful')
            require(len(style['layers']) == 1 and style['layers'][0]['role'] == 'face', f'{label}: unexpected Joyful layers')
            paint_frames = style['layers'][0]['frames']
            require(len(paint_frames) == len(frames) and {f['frameId'] for f in paint_frames} == set(frames), f'{label}: complete unique source poses')
            page = new['pages'][-1]
            patch, mask = rgba(after, page['file']), rgba(after, page['maskFile'])
            require(patch.shape == mask.shape == (page['height'], page['width'], 4), f'{label}: new page dimensions')
            require(np.all((mask[:, :, 3] == 0) | (mask[:, :, 3] == 255)), f'{label}: nonbinary ownership')
            require(not np.any(mask[:, :, :3]), f'{label}: ownership RGB must be empty')
            require(not np.any(patch[mask[:, :, 3] == 0]), f'{label}: paint outside new-page ownership')
            poses = {p['frameId']: p for p in new['poses']}
            candidate_paints = {}
            for frame in paint_frames:
                fid = frame['frameId']
                original = frames[fid]
                height, width = original.shape[:2]
                name = f'{label}/frame{fid}'
                if guides[fid]['expression']['kind'] == 'laugh':
                    require(frame['mode'] == 'source', f'{name}: original celebration altered')
                    candidate_paints[fid] = None
                    if reference_paints is None:
                        frame_results.append({'frameId': fid, 'expression': 'laugh', 'mode': 'source', 'changedPixels': 0})
                    continue
                require(frame['mode'] == 'paint', f'{name}: Joyful lost on nonlaugh pose')
                require(frame['page'] == len(new['pages'])-1, f'{name}: reused original page')
                rect, offset = frame['rect'], frame['offset']
                x, y, w, h = [rect[k] for k in ['x', 'y', 'width', 'height']]
                left, top = offset['x'], offset['y']
                require(min(x, y, left, top) >= 0 and x+w <= page['width'] and y+h <= page['height'] and left+w <= width and top+h <= height, f'{name}: invalid patch bounds')
                crop = patch[y:y+h, x:x+w]
                ownership = mask[y:y+h, x:x+w, 3] == 255
                owned = np.zeros((height, width), bool)
                owned[top:top+h, left:left+w] = ownership
                composed = original.copy()
                target = composed[top:top+h, left:left+w]
                target[ownership] = crop[ownership]
                changed = np.any(composed != original, axis=2)
                require(np.array_equal(changed, owned), f'{name}: ownership not exact changed-pixel set')
                require(np.array_equal(composed[:, :, 3], original[:, :, 3]), f'{name}: source alpha changed')
                face = polygon(poses[fid]['facePolygon'], (width, height))
                require(not np.any(owned & ~face), f'{name}: ownership outside face')
                bounds = poses[fid]['headBounds']
                yy, xx = np.indices((height, width))
                head = ((xx+.5 >= bounds['x']) & (xx+.5 <= bounds['x']+bounds['width']) &
                        (yy+.5 >= bounds['y']) & (yy+.5 <= bounds['y']+bounds['height']))
                require(not np.any(owned & ~head), f'{name}: ownership outside head')
                for foreground in poses[fid]['foreground']:
                    require(not np.any(owned & polygon(foreground, (width, height))), f'{name}: changed foreground')
                feature_counts = {}
                for feature, protected in protected_features(guides[fid], width, height).items():
                    feature_counts[feature] = int(np.count_nonzero(protected & (original[:, :, 3] > 0)))
                    require(not np.any(changed & protected), f'{name}: changed protected {feature} guide area')
                candidate_paints[fid] = digest(composed.tobytes())
                if reference_paints is None:
                    if fid in BLURRED_REVIEW_FRAMES:
                        review_composites[fid] = composed
                    frame_results.append({'frameId': fid, 'expression': guides[fid]['expression']['kind'], 'mode': 'paint',
                                          'changedPixels': int(owned.sum()), 'protectedFeaturePixelsExact': feature_counts,
                                          'compositeRgbaSha256': candidate_paints[fid]})
            if reference_paints is not None:
                require(candidate_paints == reference_paints, f'{label}: Joyful differs between hairstyle banks')
            else:
                reference_paints = candidate_paints
            banks.append({'file': str(new_path.relative_to(ROOT)), 'sha256': digest(new_bytes),
                          'originalFile': str(old_path.relative_to(ROOT)), 'originalSha256': digest(old_bytes),
                          'oldStylesExact': True, 'oldPageMappingsExact': True, 'oldPngBytesExact': old_files,
                          'sourceRegistrationPosesPaddingExact': True, 'joyfulFullPoseCoverage': len(paint_frames),
                          'pageCount': len(new['pages']), 'totalPixels': pixels, 'zipBytes': len(new_bytes),
                          'naturalAndGentleCompositesExact': True,
                          'naturalAndGentleProof': 'Source bytes, pose/foreground/padding metadata, original style mappings and all original PNG bytes remain exact; unchanged compositor therefore receives identical inputs.'})
    donor = guides[78]
    require(digest(frames[78].tobytes()) == donor['sourcePixelSha256'], f'{character}: donor source pixels mismatch')
    return {'character': character, 'sourceSha256': digest(source), 'headRegistrationSha256': digest(head_path.read_bytes()),
            'mouthDonor': {'frameId': 78, 'sourceFrame': donor['sourceFrame'], 'sourceTimeSeconds': donor['sourceTimeSeconds'],
                           'sourcePixelSha256': donor['sourcePixelSha256']},
            'uniqueSourcePoses': len(frames), 'originalActionSchedulesSha256': digest(json.dumps(source_manifest['animations'], sort_keys=True).encode()),
            'allJoyfulBanksEquivalent': True, 'blurredVisualReview': blurred_review(character, frames, review_composites, guides),
            'banks': banks, 'poses': frame_results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, default=OUT/'release-index.json')
    parser.add_argument('--output', type=Path, default=OUT/'asset-validation.json')
    args = parser.parse_args()
    index_bytes = args.index.read_bytes()
    index = json.loads(index_bytes)
    require(len(index['banks']) == 8, 'Expected two base and six hairstyle expression banks')
    results = []
    for character in ['male', 'female']:
        releases = [bank for bank in index['banks'] if bank['character'] == character]
        require(len(releases) == 4, f'{character}: expected base and three hairstyle banks')
        results.append(inspect_character(character, releases))
    report = {'passed': True, 'releaseIndexSha256': digest(index_bytes),
              'totalBanks': 8, 'totalUniqueSourcePoses': sum(row['uniqueSourcePoses'] for row in results),
              'protectedFeatureCheck': {'coordinates': 'Pixel centers in the inverse per-pose faceTransform axes about each registered featureGuide.',
                  'ellipseRadii': {'nearEye': [52, 44], 'farEye': [32, 40], 'nose': [13, 15]},
                  'limitations': 'Guides are inferred authoring annotations, not anatomical segmentation. Exact original pixels are asserted throughout these conservative regions; the remaining eye/nose boundary and visual seams require native-size visual review.'},
              'characters': results}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'passed': True, 'banks': report['totalBanks'], 'sourcePoses': report['totalUniqueSourcePoses'], 'report': str(args.output.relative_to(ROOT))}))


if __name__ == '__main__':
    main()
