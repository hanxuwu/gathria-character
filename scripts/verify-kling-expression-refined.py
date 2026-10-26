#!/usr/bin/env python3
"""Audit refined expression ZIPs independently of their authoring functions.

Original banks are pinned by the previously published release index. Old style
mappings and every old atlas pixel are retained; only the last atlas is taller.
Source-guide checks are conservative annotations, not anatomical segmentation.
Native-size review remains necessary for the unsegmented feature boundaries.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image

from kling_wardrobe_common import ROOT, load_source


OUT = ROOT / 'docs/kling-expression-refined'
PRIOR_INDEX = ROOT / 'docs/kling-expression/release-index.json'
REFINED_STYLES = ('gentle-v2', 'joyful-v2')
BLURRED_FRAMES = {88, 89, 90, 91, 100, 101, 102, 103}
FEATURE_RADII = {'nearEye': (52, 44), 'farEye': (32, 40), 'nose': (13, 15)}
MOUTH_RADII = (85, 60)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def rgba(archive, name):
    return np.asarray(Image.open(io.BytesIO(archive.read(name))).convert('RGBA'))


def polygon(points, width, height):
    """Independent boundary-inclusive pixel-center polygon rasterization."""
    result = np.zeros((height, width), bool)
    left = max(0, int(np.floor(min(p['x'] for p in points))))
    top = max(0, int(np.floor(min(p['y'] for p in points))))
    right = min(width, int(np.ceil(max(p['x'] for p in points))) + 1)
    bottom = min(height, int(np.ceil(max(p['y'] for p in points))) + 1)
    if left >= right or top >= bottom:
        return result
    yy, xx = np.indices((bottom-top, right-left), dtype=float)
    xx += left + .5
    yy += top + .5
    inside = np.zeros(xx.shape, bool)
    boundary = np.zeros(xx.shape, bool)
    for index, b in enumerate(points):
        a = points[index-1]
        cross = (xx-a['x'])*(b['y']-a['y']) - (yy-a['y'])*(b['x']-a['x'])
        boundary |= ((np.abs(cross) < 1e-9) & (xx >= min(a['x'], b['x'])) &
                     (xx <= max(a['x'], b['x'])) & (yy >= min(a['y'], b['y'])) &
                     (yy <= max(a['y'], b['y'])))
        if a['y'] != b['y']:
            inside ^= (((a['y'] > yy) != (b['y'] > yy)) &
                       (xx < (b['x']-a['x'])*(yy-a['y'])/(b['y']-a['y']) + a['x']))
    result[top:bottom, left:right] = inside | boundary
    return result


def local_axes(pose, feature, xx, yy):
    inverse = np.linalg.inv(np.asarray(pose['faceTransform'], float)[:, :2])
    center = pose['featureGuides'][feature]
    dx, dy = xx-center['x'], yy-center['y']
    return inverse[0, 0]*dx+inverse[0, 1]*dy, inverse[1, 0]*dx+inverse[1, 1]*dy


def compose(source, frame, pages, manifest, label):
    output = source.copy()
    owned = np.zeros(source.shape[:2], bool)
    if frame['mode'] == 'source':
        require(set(frame) == {'frameId', 'mode', 'reason'}, f'{label}: source entry has paint metadata')
        return output, owned
    require(frame['mode'] == 'paint', f'{label}: unknown frame mode')
    page_number = frame['page']
    require(page_number in pages, f'{label}: refined expression uses an unexpected page')
    patch, mask = pages[page_number]
    page = manifest['pages'][page_number]
    x, y, w, h = [frame['rect'][k] for k in ('x', 'y', 'width', 'height')]
    left, top = [frame['offset'][k] for k in ('x', 'y')]
    require(all(type(n) is int for n in (x, y, w, h, left, top)), f'{label}: noninteger crop')
    height, width = source.shape[:2]
    require(min(x, y, left, top) >= 0 and min(w, h) > 0 and
            x+w <= page['width'] and y+h <= page['height'] and
            left+w <= width and top+h <= height, f'{label}: invalid native crop bounds')
    ownership = mask[y:y+h, x:x+w, 3] == 255
    require(ownership.any(), f'{label}: empty paint ownership')
    owned[top:top+h, left:left+w] = ownership
    crop = patch[y:y+h, x:x+w]
    target = output[top:top+h, left:left+w]
    target[ownership] = crop[ownership]
    require(np.array_equal(np.any(output != source, axis=2), owned), f'{label}: ownership differs from changed pixels')
    return output, owned


def validate_native(source, output, changed, pose, bank_pose, label):
    height, width = source.shape[:2]
    require(np.array_equal(output[:, :, 3], source[:, :, 3]), f'{label}: source alpha changed')
    require(not np.any(changed & ~polygon(bank_pose['facePolygon'], width, height)), f'{label}: changes outside face')
    for foreground in bank_pose['foreground']:
        require(not np.any(changed & polygon(foreground, width, height)), f'{label}: foreground changed')
    yy, xx = np.indices((height, width), dtype=float)
    xx += .5
    yy += .5
    h = bank_pose['headBounds']
    head = ((xx >= h['x']) & (xx <= h['x']+h['width']) &
            (yy >= h['y']) & (yy <= h['y']+h['height']))
    require(not np.any(changed & ~head), f'{label}: changes outside head')
    feature_counts = {}
    for feature, (rx, ry) in FEATURE_RADII.items():
        u, v = local_axes(pose, feature, xx, yy)
        protected = (u/rx)**2 + (v/ry)**2 <= 1
        require(not np.any(changed & protected), f'{label}: protected {feature} changed')
        feature_counts[feature] = int(np.count_nonzero(protected & (source[:, :, 3] > 0)))
    u, v = local_axes(pose, 'mouth', xx, yy)
    mouth = (np.abs(u) <= MOUTH_RADII[0]) & (np.abs(v) <= MOUTH_RADII[1])
    return feature_counts, mouth


def inspect_character(character, releases, prior_releases):
    source_bytes, source_manifest, _, sources = load_source(character)
    head_path = ROOT / f'artwork/kling-appearance/registration/{character}.json'
    heads = json.loads(head_path.read_text())
    guides = {pose['frameId']: pose for pose in heads['frames']}
    require(heads['sourceSha256'] == digest(source_bytes), f'{character}: head guide source mismatch')
    require(set(guides) == set(sources), f'{character}: source-guide coverage')
    reference_composites = None
    pose_results, bank_results = [], []
    for release in releases:
        previous = prior_releases.get(release['original']['url'])
        require(previous is not None, 'Original bank is not a previously published expression bank')
        require(all(release['original'][key] == previous[key] for key in ('url', 'sha256', 'bankId')),
                f'{character}: original bank identity differs from prior release')
        old_path = ROOT / release['original']['url'].lstrip('/')
        new_path = ROOT / release['release']['url'].lstrip('/')
        label = new_path.name
        require(new_path != old_path, f'{label}: release overwrites original bank')
        old_bytes, new_bytes = old_path.read_bytes(), new_path.read_bytes()
        require(digest(old_bytes) == previous['sha256'], f'{label}: original bank bytes changed')
        require(digest(new_bytes) == release['release']['sha256'], f'{label}: new bank hash mismatch')
        with zipfile.ZipFile(io.BytesIO(old_bytes)) as before, zipfile.ZipFile(io.BytesIO(new_bytes)) as after:
            require(before.testzip() is None and after.testzip() is None, f'{label}: ZIP checksum')
            require(len(after.namelist()) == len(set(after.namelist())), f'{label}: duplicate ZIP entries')
            require(set(before.namelist()) == set(after.namelist()), f'{label}: unexpected ZIP entries')
            old, new = json.loads(before.read('manifest.json')), json.loads(after.read('manifest.json'))
            require(new['id'] == release['release']['bankId'] and old['id'] == previous['bankId'], f'{label}: bank identity')
            require(new['id'] != old['id'] and len(new['id']) <= 64, f'{label}: new bank identity missing/too long')
            require(set(new) == set(old), f'{label}: manifest schema changed')
            for key in set(old) - {'id', 'name', 'provenance', 'styles', 'pages'}:
                require(new[key] == old[key], f'{label}: original {key} changed')
            require(new['sourceSha256'] == digest(source_bytes), f'{label}: source hash mismatch')
            require(new['styles'][:-2] == old['styles'], f'{label}: old style mappings changed')
            require(tuple(s['id'] for s in new['styles'][-2:]) == REFINED_STYLES, f'{label}: refined styles missing')
            require(len(new['styles']) <= 8 and len({s['id'] for s in new['styles']}) == len(new['styles']), f'{label}: style limits')
            require(len(new['pages']) == len(old['pages']) <= 8, f'{label}: page count changed/exceeded')
            require(new['pages'][:-1] == old['pages'][:-1], f'{label}: earlier page metadata changed')
            last = len(new['pages']) - 1
            old_page, new_page = old['pages'][last], new['pages'][last]
            require({k: v for k, v in new_page.items() if k != 'height'} ==
                    {k: v for k, v in old_page.items() if k != 'height'}, f'{label}: extended page metadata changed')
            require(old_page['height'] < new_page['height'] <= 8192, f'{label}: invalid page extension')
            pixels = sum(p['width']*p['height'] for p in new['pages'])
            expanded_bytes = sum(info.file_size for info in after.infolist())
            require(pixels <= 64*1024*1024 and len(new_bytes) <= 64*1024*1024 and
                    expanded_bytes <= 64*1024*1024, f'{label}: bank budget exceeded')
            unchanged_names = sorted(set(before.namelist()) - {'manifest.json', old_page['file'], old_page['maskFile']})
            unchanged_hashes = {}
            for name in unchanged_names:
                original_data = before.read(name)
                require(after.read(name) == original_data, f'{label}: original {name} bytes changed')
                unchanged_hashes[name] = digest(original_data)
            patch, mask = rgba(after, new_page['file']), rgba(after, new_page['maskFile'])
            require(patch.shape == mask.shape == (new_page['height'], new_page['width'], 4), f'{label}: page dimensions')
            require(np.array_equal(patch[:old_page['height']], rgba(before, old_page['file'])), f'{label}: original paint pixel region changed')
            require(np.array_equal(mask[:old_page['height']], rgba(before, old_page['maskFile'])), f'{label}: original ownership pixel region changed')
            require(np.all((mask[:, :, 3] == 0) | (mask[:, :, 3] == 255)), f'{label}: nonbinary ownership')
            require(not np.any(mask[:, :, :3]), f'{label}: ownership RGB changed')
            require(not np.any(patch[mask[:, :, 3] == 0]), f'{label}: paint outside ownership')
            bank_poses = {pose['frameId']: pose for pose in new['poses']}
            old_joyful = next(style for style in old['styles'] if style['id'] == 'joyful')
            old_joyful_frames = {frame['frameId']: frame for frame in old_joyful['layers'][0]['frames']}
            candidate_composites = {}
            for style in new['styles'][-2:]:
                style_id = style['id']
                require(style['slot'] == 'face' and len(style['layers']) == 1 and style['layers'][0]['role'] == 'face',
                        f'{label}/{style_id}: invalid face layer')
                entries = style['layers'][0]['frames']
                require(len(entries) == len(sources) and {entry['frameId'] for entry in entries} == set(sources),
                        f'{label}/{style_id}: missing or repeated source pose')
                for frame in entries:
                    fid = frame['frameId']
                    name = f'{label}/{style_id}/{fid}'
                    source, pose = sources[fid], guides[fid]
                    is_laugh = pose['expression']['kind'] == 'laugh'
                    require(frame['mode'] == ('source' if is_laugh else 'paint'), f'{name}: expression/source mode mismatch')
                    if style_id == 'joyful-v2' and fid not in BLURRED_FRAMES:
                        require(frame == old_joyful_frames[fid], f'{name}: unchanged Joyful frame mapping changed')
                    elif not is_laugh:
                        require(frame['page'] == last and frame['rect']['y'] >= old_page['height'], f'{name}: new paint overwrites retained region')
                    output, changed = compose(source, frame, {last: (patch, mask)}, new, name)
                    candidate_composites[f'{style_id}/{fid}'] = digest(output.tobytes())
                    if reference_composites is not None:
                        continue
                    features, mouth = validate_native(source, output, changed, pose, bank_poses[fid], name)
                    row = {'styleId': style_id, 'frameId': fid, 'expression': pose['expression']['kind'],
                           'mode': frame['mode'], 'changedSourcePixels': int(changed.sum()),
                           'protectedFeaturePixelsExact': features,
                           'compositeRgbaSha256': candidate_composites[f'{style_id}/{fid}']}
                    if style_id == 'gentle-v2':
                        require(not np.any(changed & ~mouth), f'{name}: Gentle changes outside mouth envelope')
                        row['mouthOnlyChange'] = True
                    elif fid in BLURRED_FRAMES:
                        old_output, _ = compose(source, old_joyful_frames[fid], {last: (patch, mask)}, new, name+'/prior')
                        difference = np.any(output != old_output, axis=2)
                        require(difference.any(), f'{name}: declared refinement is unchanged')
                        require(not np.any(difference & ~mouth), f'{name}: Joyful refinement changes outside mouth envelope')
                        row.update(changedPriorJoyfulPixels=int(difference.sum()), mouthOnlyRefinement=True)
                    else:
                        row['priorJoyfulMappingExact'] = True
                    pose_results.append(row)
            if reference_composites is None:
                reference_composites = candidate_composites
            else:
                require(candidate_composites == reference_composites, f'{label}: new expression pixels differ between hairstyle banks')
            bank_results.append({'file': str(new_path.relative_to(ROOT)), 'sha256': digest(new_bytes),
                                 'originalFile': str(old_path.relative_to(ROOT)), 'originalSha256': digest(old_bytes),
                                 'oldStyleMappingsExact': True, 'oldAtlasPixelRegionsExact': True,
                                 'unchangedPngSha256s': unchanged_hashes,
                                 'retainedLastPage': {'width': old_page['width'], 'height': old_page['height'],
                                                      'paintRgbaSha256': digest(patch[:old_page['height']].tobytes()),
                                                      'ownershipRgbaSha256': digest(mask[:old_page['height']].tobytes())},
                                 'posesPaddingSourceRegistrationExact': True,
                                 'allOldStyleCompositesExact': True,
                                 'oldStyleProof': 'All original frame mappings and sampled atlas pixels, source bytes, poses, foreground and padding remain identical.',
                                 'newStylesEquivalentToVerifiedBase': True, 'pageCount': len(new['pages']),
                                 'totalPixels': pixels, 'addedPixels': new_page['width']*(new_page['height']-old_page['height']),
                                 'zipBytes': len(new_bytes), 'expandedArchiveBytes': expanded_bytes})
        print(json.dumps({'verifiedBank': str(new_path.relative_to(ROOT)), 'pageCount': len(new['pages']), 'pixels': pixels}), flush=True)
    return {'character': character, 'sourceSha256': digest(source_bytes),
            'headRegistrationSha256': digest(head_path.read_bytes()),
            'uniqueSourcePoses': len(sources),
            'originalActionSchedulesSha256': digest(json.dumps(source_manifest['animations'], sort_keys=True).encode()),
            'allRefinedStylesEquivalentAcrossBanks': True, 'banks': bank_results, 'poses': pose_results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, default=OUT / 'release-index.json')
    parser.add_argument('--output', type=Path, default=OUT / 'asset-validation.json')
    args = parser.parse_args()
    index_bytes, prior_bytes = args.index.read_bytes(), PRIOR_INDEX.read_bytes()
    index, prior = json.loads(index_bytes), json.loads(prior_bytes)
    require(len(index['banks']) == 8, 'Expected eight refined banks')
    require(len({bank['release']['url'] for bank in index['banks']}) == 8, 'Duplicate refined bank URLs')
    prior_releases = {bank['release']['url']: bank['release'] for bank in prior['banks']}
    results = []
    for character in ('male', 'female'):
        releases = [bank for bank in index['banks'] if bank['character'] == character]
        require(len(releases) == 4 and sum(bank['kind'] == 'base' for bank in releases) == 1,
                f'{character}: expected one base and three hairstyle banks')
        releases.sort(key=lambda bank: bank['kind'] != 'base')
        results.append(inspect_character(character, releases, prior_releases))
    require(sum(row['uniqueSourcePoses'] for row in results) == 184, 'Unexpected original source pose inventory')
    report = {'passed': True, 'releaseIndexSha256': digest(index_bytes), 'priorReleaseIndexSha256': digest(prior_bytes),
              'totalBanks': 8, 'totalUniqueSourcePoses': 184, 'refinedStyles': list(REFINED_STYLES),
              'joyfulRefinedFrameIds': sorted(BLURRED_FRAMES),
              'protectedFeatureCheck': {'coordinates': 'Pixel centers in inverse per-pose faceTransform axes.',
                                       'ellipseRadii': FEATURE_RADII, 'mouthEnvelopeHalfExtents': MOUTH_RADII,
                                       'limitations': 'Source guides are inferred annotations, not anatomical segmentation. Native-size review checks remaining boundaries and appearance.'},
              'characters': results}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'passed': True, 'banks': 8, 'uniqueSourcePoses': 184, 'stylesPerPose': 2,
                      'report': str(args.output.relative_to(ROOT))}), flush=True)


if __name__ == '__main__':
    main()
