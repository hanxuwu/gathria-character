#!/usr/bin/env python3
"""Audit packaged full outfits without generating or changing their artwork.

Checks native ownership and immutable identity against the approved source.
This is offline asset verification, not browser playback or visual acceptance.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import io
import json
from pathlib import Path
import subprocess
from zipfile import ZipFile

import numpy as np
from PIL import Image
from scipy import ndimage as nd

from kling_male_limb_ownership import MaleLimbOwnership
from kling_wardrobe_common import ROOT, load_source, protected_mask, sha


BASELINE = '881c7a28957a405b26d0fd29bdbfb9f42df4993f'
MALE_ITEMS = {
    'teal-camp-shirt-v1': 'top',
    'navy-suit-jacket-v1': 'top',
    'ochre-chinos-v1': 'bottom',
    'navy-suit-trousers-v1': 'bottom',
}
FEMALE_ITEMS = ['coral-daydress-v3', 'ivory-wedding-dress-v3']
SIZE = (1056, 704)
BEFORE_SHOE_EDGE_COMMIT = '44d346b'
FOOTWEAR_PROBES = {
    51: [(550, 883, 577, 907), (537, 904, 549, 917), (486, 937, 501, 951)],
    64: [(259, 863, 265, 897)],
}


def relative(path):
    return str(Path(path).relative_to(ROOT))


def image_bytes(data, mode='RGBA'):
    with Image.open(io.BytesIO(data)) as image:
        assert image.format == 'PNG'
        image.load()
        return np.asarray(image.convert(mode)).copy()


class Garment:
    def __init__(self, path, registration_bytes, data=None):
        self.path = path
        self.data = path.read_bytes() if data is None else data
        self.zip = ZipFile(io.BytesIO(self.data))
        names = self.zip.namelist()
        assert len(names) == len(set(names)), f'Duplicate ZIP entry: {path}'
        assert self.zip.testzip() is None, f'ZIP CRC failure: {path}'
        self.manifest = json.loads(self.zip.read('manifest.json'))
        m = self.manifest
        r = json.loads(registration_bytes)
        assert m['format'] == 'gathria-sprite-garment' and m['version'] == 1
        assert (m['frameHeight'], m['frameWidth']) == SIZE
        assert m['sourceSha256'] == r['sourceSha256']
        assert m['registrationSha256'] == sha(registration_bytes)
        assert m['characterId'] == r['characterId']
        self.frames = {frame['frameId']: frame for frame in m['frames']}
        assert len(self.frames) == len(m['frames']) == len(r['frames'])
        assert set(self.frames) == {frame['frameId'] for frame in r['frames']}
        expected = {'manifest.json'}
        self.pages = []
        self.masks = []
        assert 0 < len(m['pages']) <= 4
        for page in m['pages']:
            assert page['file'] != page['maskFile']
            expected.update([page['file'], page['maskFile']])
            pixels = image_bytes(self.zip.read(page['file']))
            mask = image_bytes(self.zip.read(page['maskFile']))
            assert pixels.shape == mask.shape == (page['height'], page['width'], 4)
            assert not np.any(mask[:, :, :3]), 'Ownership RGB must be zero'
            assert set(np.unique(mask[:, :, 3])).issubset({0, 255}), 'Ownership must be binary'
            owned = mask[:, :, 3] == 255
            assert not np.any(pixels[~owned]), 'RGBA outside garment ownership'
            self.pages.append(pixels)
            self.masks.append(owned)
        assert set(names) == expected, f'Unexpected package members: {path}'
        assert len(expected) == 1 + len(m['pages']) * 2, 'Atlas file names must be unique'
        occupied = [[] for _ in self.pages]
        indexed = [np.zeros(mask.shape, bool) for mask in self.masks]
        for frame in m['frames']:
            p = frame['page']
            assert isinstance(p, int) and 0 <= p < len(self.pages)
            rect, offset = frame['rect'], frame['offset']
            x, y, w, h = (rect[key] for key in ['x', 'y', 'width', 'height'])
            assert all(isinstance(value, int) for value in [x, y, w, h, offset['x'], offset['y']])
            assert x >= 0 and y >= 0 and w > 0 and h > 0
            assert x+w <= self.pages[p].shape[1] and y+h <= self.pages[p].shape[0]
            assert offset['x'] >= 0 and offset['y'] >= 0
            assert offset['x']+w <= SIZE[1] and offset['y']+h <= SIZE[0]
            for px, py, pw, ph in occupied[p]:
                assert x+w <= px or px+pw <= x or y+h <= py or py+ph <= y, 'Atlas frame crops overlap'
            occupied[p].append((x, y, w, h))
            indexed[p][y:y+h, x:x+w] = True
        for page, used in enumerate(indexed):
            assert not np.any(self.masks[page][~used]), f'Unindexed ownership pixels: {path}'

    def frame(self, frame_id):
        record = self.frames[frame_id]
        r, o, p = record['rect'], record['offset'], record['page']
        crop = np.s_[r['y']:r['y']+r['height'], r['x']:r['x']+r['width']]
        target = np.s_[o['y']:o['y']+r['height'], o['x']:o['x']+r['width']]
        pixels = np.zeros((*SIZE, 4), np.uint8)
        owned = np.zeros(SIZE, bool)
        pixels[target] = self.pages[p][crop]
        owned[target] = self.masks[p][crop]
        assert owned.any() and (pixels[:, :, 3] > 0).any(), f'Empty garment pose: {frame_id}'
        return pixels, owned

    def summary(self):
        return {'file': relative(self.path), 'sha256': sha(self.data), 'bytes': len(self.data),
                'id': self.manifest['id'], 'pagesDecoded': len(self.pages), 'frames': []}

    def close(self):
        self.zip.close()


def legacy_preservation():
    paths = subprocess.check_output([
        'git', 'ls-tree', '-r', '--name-only', BASELINE, '--', 'docs/kling-wardrobe/garments',
    ], cwd=ROOT, text=True).splitlines()
    paths.extend([
        'docs/kling-motion/exports/male.character.zip',
        'docs/kling-motion/exports/female.character.zip',
        'docs/kling-jump/exports/male.character.zip',
        'docs/kling-jump/exports/female.character.zip',
        'artwork/kling-wardrobe/registration/male/registration.json',
        'artwork/kling-wardrobe/registration/female/registration.json',
        'docs/kling-wardrobe/templates/male.wardrobe-template.zip',
        'docs/kling-wardrobe/templates/female.wardrobe-template.zip',
        'docs/kling-wardrobe/fit-v2/exports/female-day.character.zip',
        'docs/kling-wardrobe/fit-v2/exports/female-wedding.character.zip',
        'docs/kling-wardrobe/fit-v2/exports/female-day.wardrobe.zip',
        'docs/kling-wardrobe/fit-v2/exports/female-wedding.wardrobe.zip',
    ])
    result = []
    for name in paths:
        before = subprocess.check_output(['git', 'show', f'{BASELINE}:{name}'], cwd=ROOT)
        after = (ROOT / name).read_bytes()
        assert before == after, f'Existing deliverable changed: {name}'
        result.append({'file': name, 'bytes': len(after), 'sha256': sha(after)})
    return result


def assert_source_registration(registration, manifest, config, source):
    assert registration['sourceSha256'] == sha(source)
    assert registration['frameWidth'] == 704 and registration['frameHeight'] == 1056
    assert registration['anchor'] == {'x': 352, 'y': 998}
    assert registration['characterId'] == config['characterId']
    assert (manifest['anchor']['x'], manifest['anchor']['y']) == (352, 998)
    source_frames = {frame['id']: frame for frame in manifest['frames']}
    provenance = {frame['frameId']: frame for frame in config['derivation']['frames']}
    assert set(source_frames) == {frame['frameId'] for frame in registration['frames']}
    for frame in registration['frames']:
        expected = source_frames[frame['frameId']]
        assert expected['width'] == 704 and expected['height'] == 1056
        assert provenance[frame['frameId']]['sourceFrame'] == frame['sourceFrame']


def compare_registration(old, new):
    for key in ['format', 'version', 'sourceSha256', 'characterId', 'frameWidth', 'frameHeight', 'anchor']:
        assert old[key] == new[key], f'Registration invariant changed: {key}'
    old_frames = {f['frameId']: f for f in old['frames']}
    assert set(old_frames) == {f['frameId'] for f in new['frames']}
    for frame in new['frames']:
        previous = old_frames[frame['frameId']]
        assert frame['sourceFrame'] == previous['sourceFrame']
        assert frame['points'] == previous['points'], f'Source anchors moved: {frame["frameId"]}'
        assert len(frame['points']) == 17
        old_head = next(r for r in previous['protected'] if r['label'] == 'head')
        new_head = next(r for r in frame['protected'] if r['label'] == 'head')
        assert old_head == new_head, f'Head protection changed: {frame["frameId"]}'
    return old_frames


def check_frame(pixels, owned, original, fixed, expected_coverage=None, context=''):
    visible = original[:, :, 3] > 0
    assert not np.any(owned & fixed & visible), f'{context}: garment owns protected source identity'
    composed = original.copy()
    composed[owned] = pixels[owned]
    assert np.array_equal(composed[fixed & visible], original[fixed & visible])
    assert np.array_equal(composed[~owned], original[~owned])
    if expected_coverage is not None:
        opaque = expected_coverage & (original[:, :, 3] >= 128) & ~fixed
        assert not np.any(opaque & ~owned), f'{context}: required original garment/limb was left uncovered'
        assert not np.any(opaque & (pixels[:, :, 3] == 0)), f'{context}: opaque source coverage contains a hole'
    return {'ownedPixels': int(owned.sum()), 'changedClothPixels': int(np.any(composed != original, axis=2).sum()),
            'protectedChanged': 0, 'outsideOwnershipChanged': 0,
            'ownedSourceAlphaReducedPixels': int(np.sum(owned & visible & (pixels[:, :, 3] < original[:, :, 3])))}


def preserved_source_fragments(original, material, protected, owned, context):
    """Account only for whole, detached native semantic fragments, never holes.

    The authoring contract preserves disconnected regions smaller than 20
    native pixels so clothing allowance cannot inflate source matte flecks.
    Audit each exact component and source pixel; a missing piece connected to
    a normal garment surface receives no exemption from required coverage.
    """
    visible_material = material & (original[:, :, 3] > 0) & ~protected
    labels, count = nd.label(visible_material, structure=np.array([[0,1,0], [1,1,1], [0,1,0]]))
    sizes = np.bincount(labels.ravel())
    small = np.flatnonzero((sizes > 0) & (sizes < 20))
    small = small[small != 0]
    preserved = np.isin(labels, small)
    assert not np.any(owned & preserved), f'{context}: detached source fragment was expanded/repainted'
    details = []
    for label in small:
        yy, xx = np.where(labels == label)
        alpha = original[yy, xx, 3]
        details.append({
            'pixels': int(len(xx)), 'opaquePixels': int((alpha >= 128).sum()),
            'bounds': [int(xx.min()), int(yy.min()), int(xx.max()+1), int(yy.max()+1)],
            'nativeXYAlpha': [[int(x), int(y), int(a)] for x, y, a in zip(xx, yy, alpha)],
            'sourceRGBAsha256': sha(original[yy, xx].tobytes()),
        })
    return preserved, details


def source_supported_trousers(original, semantic, limbs, frame_id):
    """Independently prove which visible surfaces are anatomy/shorts.

    A large dark source sole component is not a leg merely because it is near
    a leg guide. Support requires continuity with a substantial connected warm
    skin core or registered shorts core. No generated garment pixels are read.
    """
    visible = original[:, :, 3] > 0
    legs = (limbs['nearLeg'] | limbs['farLeg']) & visible
    shorts = semantic['shorts'] & visible
    colors = original[:, :, :3].astype(np.int16)
    warm = legs & (colors[:, :, 0] > 150) & (colors[:, :, 1] > 75) & (colors[:, :, 0]-colors[:, :, 1] > 24)
    connectivity = np.array([[0,1,0], [1,1,1], [0,1,0]])
    warm_labels, _ = nd.label(warm, structure=connectivity)
    warm_sizes = np.bincount(warm_labels.ravel())
    warm_seed = (warm_labels > 0) & (warm_sizes[warm_labels] >= 80)
    shorts_labels, _ = nd.label(shorts, structure=connectivity)
    shorts_sizes = np.bincount(shorts_labels.ravel())
    shorts_seed = (shorts_labels > 0) & (shorts_sizes[shorts_labels] >= 80)
    surfaces, _ = nd.label(legs | shorts, structure=connectivity)
    supported_ids = np.unique(surfaces[warm_seed | shorts_seed])
    supported_ids = supported_ids[supported_ids != 0]
    supported = np.isin(surfaces, supported_ids)
    excluded = legs & ~supported
    labels, count = nd.label(excluded, structure=connectivity)
    details = []
    for label in range(1, count+1):
        component = labels == label
        yy, xx = np.where(component)
        cores = np.unique(warm_labels[component])
        cores = cores[cores != 0]
        largest = int(warm_sizes[cores].max()) if len(cores) else 0
        assert largest < 80 and not np.any(component & shorts_seed)
        details.append({
            'pixels': int(component.sum()), 'bounds': [int(xx.min()), int(yy.min()), int(xx.max()+1), int(yy.max()+1)],
            'largestConnectedWarmCorePixels': largest, 'validatedShortsSeedPixels': 0,
            'alphaMin': int(original[component, 3].min()), 'alphaMax': int(original[component, 3].max()),
            'sourcePixelsSha256': sha(original[component].tobytes()),
        })
    report = {'frameId': frame_id, 'excludedSourcePixels': int(excluded.sum()),
              'sourcePixelsSha256': sha(original[excluded].tobytes()), 'components': details}
    return excluded, warm_labels, warm_sizes, report


def check_footwear_revision(frame_id, original, pixels, owned, old_pixels, old_owned,
                            material, protected, excluded, fragments, warm_labels, warm_sizes):
    """Concrete actual-export defect regressions, beyond the component rule."""
    visible = original[:, :, 3] > 0
    retained = material & visible & ~protected & ~excluded & ~fragments
    distance = nd.distance_transform_edt(~retained)
    assert not np.any(owned & ~visible & (distance > 3)), f'{frame_id}: new alpha/ownership outside retained cloth allowance'
    assert not np.any(owned & excluded), f'{frame_id}: source sole/matte fragment recoloured as trousers'
    composed = original.copy(); composed[owned] = pixels[owned]
    old_composed = original.copy(); old_composed[old_owned] = old_pixels[old_owned]
    assert np.array_equal(composed[excluded], original[excluded])
    removed_footprint = np.zeros(SIZE, bool)
    # Removing an unsupported leg outline may leave a connected semantic-shorts
    # remainder below the existing 20px cutoff (frame92: 21 leg +12 shorts
    # pixels). Those exact newly preserved source fragments are an additional
    # causal region, not permission for a wider arbitrary spatial tolerance.
    consequential = fragments & old_owned & visible
    causal_source = excluded | consequential
    removed_visible = old_owned & visible & ~owned
    assert not np.any(removed_visible & ~causal_source), f'{frame_id}: source material removed without component proof'
    changed = np.any(composed != old_composed, axis=2)
    locality = {'changedPixels': int(changed.sum()), 'consequentialSourceFragmentPixels': int(consequential.sum())}
    if causal_source.any():
        exclusion_distance = nd.distance_transform_edt(~excluded) if excluded.any() else np.full(SIZE, np.inf)
        causal_distance = nd.distance_transform_edt(~causal_source)
        removed_footprint = (causal_distance <= 3) & ~visible & (distance > 3)
        assert not np.any(owned & removed_footprint)
        assert not np.any(composed[removed_footprint, 3])
        # Removing a 3px allowance can reveal its thin 2.5px contour. All
        # changes must stay in that source-local neighbourhood; no bodywide
        # resampling or silhouette edit is accepted as part of this repair.
        assert not np.any(changed & (causal_distance > 6)), f'{frame_id}: unrelated trouser pixels changed'
        yy, xx = np.where(consequential)
        locality.update({
            'consequentialNativeXYAlpha': [[int(x),int(y),int(original[y,x,3])] for x,y in zip(xx,yy)],
            'changedBeyondPrimaryExclusion6Pixels': int((changed & (exclusion_distance > 6)).sum()),
            'maximumChangedDistanceFromPrimaryExclusion': float(exclusion_distance[changed].max()) if changed.any() else 0,
            'maximumChangedDistanceFromProvenCausalSource': float(causal_distance[changed].max()) if changed.any() else 0,
        })
    else:
        assert np.array_equal(composed, old_composed), f'{frame_id}: pose without excluded source fragments changed'
    probes = []
    for x0, y0, x1, y1 in FOOTWEAR_PROBES.get(frame_id, []):
        roi = np.zeros(SIZE, bool); roi[y0:y1, x0:x1] = True
        source_pixels = roi & excluded
        assert source_pixels.any(), f'{frame_id}: known sole regression region not identified'
        assert not np.any(owned & source_pixels)
        assert np.array_equal(composed[source_pixels], original[source_pixels])
        assert not np.any(composed[roi & removed_footprint, 3])
        probes.append({'bounds': [x0,y0,x1,y1], 'sourceExactPixels': int(source_pixels.sum()),
                       'sourceRGBAsha256': sha(original[source_pixels].tobytes()),
                       'removedAllowanceTransparentPixels': int((roi & removed_footprint).sum())})
    if frame_id == 51:
        x, y = 560, 895
        assert original[y, x].tolist() == [15,7,12,255]
        assert old_owned[y, x] and not np.array_equal(old_composed[y, x], original[y, x]), 'Before artifact no longer contains recorded sole defect'
        assert not owned[y, x] and np.array_equal(composed[y, x], original[y, x])
        probes.append({'nativeXY': [x,y], 'sourceRGBA': [15,7,12,255], 'beforeWasIncorrectlyClothed': True, 'afterSourceExact': True})
    if frame_id == 64:
        x, y = 360, 877
        core = int(warm_labels[y, x])
        assert core and int(warm_sizes[core]) >= 80, 'Genuine rear-leg wedge lost its source warm core'
        wedge = warm_labels == core
        assert not np.any(excluded & wedge)
        assert np.all(owned[wedge]) and np.all(pixels[wedge, 3] > 0), 'Real rear-leg wedge left unclothed'
        probes.append({'retainedRearLegNativeXY': [x,y], 'connectedWarmPixels': int(warm_sizes[core]), 'entireWarmWedgeClothed': True})
    return {'sourceSolePixelsChanged': 0, 'newAlphaInRemovedIslandFootprints': 0,
            'removedIslandFootprintPixels': int(removed_footprint.sum()), 'concreteRegressionProbes': probes,
            'sourceLocalChangeProof': locality}


def audit_male_garments(author, frames, previous=None):
    """Check decoded assets against source materials, independently of UV fitting.

    Top/bottom material ownership is checked as a semantic contract. No donor
    sampling, pose warping or garment-preparer function is called by this audit.
    The real browser compositor/export is verified separately.
    """
    garments = {}
    before_garments = {}
    reports = {}
    combinations = {'day': [], 'wedding': []}
    prepared = ROOT / 'artwork/kling-wardrobe/prepared/male-trousers-v1'
    exclusion_report_path = prepared / 'source-fringe-exclusions.json'
    exclusion_report = json.loads(exclusion_report_path.read_bytes())
    assert exclusion_report['format'] == 'gathria-source-leg-fringe-exclusions' and exclusion_report['version'] == 1
    assert exclusion_report['sourceSha256'] == author.source_sha256
    assert exclusion_report['registrationSha256'] == sha(author.registration_bytes)
    exclusion_archive_path = prepared / exclusion_report['maskArchive']
    assert sha(exclusion_archive_path.read_bytes()) == exclusion_report['maskArchiveSha256']
    exclusion_records = {r['frameId']: r for r in exclusion_report['frames']}
    assert set(exclusion_records) == set(frames)
    exclusion_archive = ZipFile(exclusion_archive_path)
    assert exclusion_archive.testzip() is None
    previous_items = {item['id']: item for item in previous['garments']} if previous else {}
    source_reviews = []
    try:
        for item, slot in MALE_ITEMS.items():
            garment = Garment(ROOT / f'docs/kling-wardrobe/garments/male/{item}.zip', author.registration_bytes)
            assert garment.manifest['id'] == item and garment.manifest['slot'] == slot
            assert len(garment.frames) == len(frames) == 88
            garments[item] = garment
            reports[item] = garment.summary()
            if slot == 'bottom':
                data = subprocess.check_output(['git', 'show', f'{BEFORE_SHOE_EDGE_COMMIT}:{relative(garment.path)}'], cwd=ROOT)
                before_garments[item] = Garment(garment.path, author.registration_bytes, data=data)
                if previous:
                    assert sha(data) == previous_items[item]['sha256'], 'Before-shoe artifact differs from preserved report'
            elif previous:
                assert sha(garment.data) == previous_items[item]['sha256'], 'Unchanged top was modified'
                reports[item] = {**previous_items[item], 'verificationReuse': 'Exact ZIP hash unchanged from prior ownership report; full top checks not repeated.'}
        for fid, original in frames.items():
            semantic = author.semantic(fid)
            limbs = author.for_frame(fid, original)
            fixed = (limbs['protected'] | semantic['head'] | semantic['nearHand'] |
                     semantic['farHand'] | limbs['neckSkin'] | semantic['shoes'])
            arms = limbs['nearArm'] | limbs['farArm']
            legs = limbs['nearLeg'] | limbs['farLeg']
            visible = original[:, :, 3] > 0
            decoded = {}
            excluded, warm_labels, warm_sizes, source_review = source_supported_trousers(original, semantic, limbs, fid)
            recorded = exclusion_records[fid]
            for name, value in source_review.items():
                assert recorded[name] == value, f'Exclusion source proof mismatch: {fid}/{name}'
            excluded_bytes = exclusion_archive.read(recorded['file'])
            assert sha(excluded_bytes) == recorded['maskSha256']
            excluded_png = image_bytes(excluded_bytes, 'L')
            assert set(np.unique(excluded_png)).issubset({0,255})
            assert np.array_equal(excluded_png > 0, excluded), f'Exclusion mask mismatch: {fid}'
            source_reviews.append({**source_review, 'maskFile': recorded['file'], 'maskSha256': recorded['maskSha256']})
            for item, garment in garments.items():
                pixels, owned = garment.frame(fid)
                decoded[item] = (pixels, owned)
                slot = MALE_ITEMS[item]
                if slot == 'bottom':
                    material = semantic['shorts'] | legs
                    assert not np.any(owned & (arms | limbs['neckSkin']) & visible), f'Trousers own arm/neck: {item}/{fid}'
                    assert not np.any(owned & ~material & visible), f'Trousers own another source material: {item}/{fid}'
                    fragments, fragment_details = preserved_source_fragments(original, material & ~excluded, limbs['protected'], owned, f'{item}/{fid}')
                    entry = check_frame(pixels, owned, original, fixed, material & ~excluded & ~fragments, f'{item}/{fid}')
                    entry['sourceArmAndNeckPixelsChanged'] = 0
                    entry['preservedDisconnectedSourceFragments'] = fragment_details
                    old_pixels, old_owned = before_garments[item].frame(fid)
                    entry['footwearRegression'] = check_footwear_revision(
                        fid, original, pixels, owned, old_pixels, old_owned,
                        material, limbs['protected'], excluded, fragments, warm_labels, warm_sizes)
                else:
                    if previous:
                        continue
                    material = semantic['tank'] | arms
                    if item == 'navy-suit-jacket-v1':
                        # A jacket may overlap trousers at its lower hem. The
                        # upper material contract still excludes visible legs.
                        material |= semantic['shorts']
                    assert not np.any(owned & ~material & visible), f'Top owns another source material: {item}/{fid}'
                    coverage = semantic['tank'].copy()
                    if item == 'navy-suit-jacket-v1':
                        coverage |= arms
                    entry = check_frame(pixels, owned, original, fixed, coverage, f'{item}/{fid}')
                    assert np.array_equal(pixels[owned, 3], original[owned, 3]), f'Top changed source alpha: {item}/{fid}'
                    entry['sourceAlphaIdentical'] = True
                entry['frameId'] = fid
                reports[item]['frames'].append(entry)
            for look, bottom, top in [
                ('day', 'ochre-chinos-v1', 'teal-camp-shirt-v1'),
                ('wedding', 'navy-suit-trousers-v1', 'navy-suit-jacket-v1'),
            ]:
                composed = original.copy()
                union = np.zeros(SIZE, bool)
                for item in [bottom, top]:
                    pixels, owned = decoded[item]
                    composed[owned] = pixels[owned]
                    union |= owned
                assert np.array_equal(composed[fixed & visible], original[fixed & visible]), f'Outfit changed identity: {look}/{fid}'
                assert np.array_equal(composed[~union], original[~union]), f'Outfit changed unowned source: {look}/{fid}'
                combinations[look].append({'frameId': fid, 'protectedChanged': 0, 'outsideOwnershipChanged': 0})
        return {'garments': list(reports.values()), 'combinedOwnershipChecks': combinations,
                'sourceFootwearReview': {'reportFile': relative(exclusion_report_path),
                    'reportSha256': sha(exclusion_report_path.read_bytes()),
                    'maskArchiveFile': relative(exclusion_archive_path), 'maskArchiveSha256': sha(exclusion_archive_path.read_bytes()),
                    'beforeArtifactCommit': BEFORE_SHOE_EDGE_COMMIT, 'frames': source_reviews}}
    finally:
        for garment in garments.values():
            garment.close()
        for garment in before_garments.values():
            garment.close()
        exclusion_archive.close()


def audit_male(registration_path, template_path):
    registration_bytes = registration_path.read_bytes()
    registration = json.loads(registration_bytes)
    old = json.loads((ROOT / 'artwork/kling-wardrobe/registration/male/registration.json').read_bytes())
    old_frames = compare_registration(old, registration)
    author = MaleLimbOwnership(template_path)
    assert author.registration_bytes == registration_bytes
    source, manifest, config, frames = load_source('male')
    assert_source_registration(registration, manifest, config, source)
    records = {f['frameId']: f for f in registration['frames']}
    try:
        protection = audit_protection_review(registration_path, author, old_frames, records, frames, source)
        garments = audit_male_garments(author, frames)
        return {
            'sourceSha256': sha(source), 'sourceFrames': len(frames),
            'sourceDimensions': [704, 1056], 'sourceAnchor': {'x': 352, 'y': 998},
            'registrationFile': relative(registration_path), 'registrationSha256': sha(registration_bytes),
            'templateFile': relative(template_path), 'templateSha256': sha(template_path.read_bytes()),
            'sourceLandmarksAndHeadPolygonsUnchanged': True,
            'protectionReview': protection, **garments,
        }
    finally:
        author.close()


def audit_protection_review(registration_path, author, old_frames, records, frames, source):
    """Verify exact recorded changes, rather than treating weaker masks as a pass.

    The visual classification is the authored contour review's responsibility;
    this audit verifies its exact raster scope, unchanged source/body landmarks,
    and preservation of the resulting visible head/hand regions in every outfit.
    """
    directory = registration_path.parent
    review_path = directory / 'protection-review.json'
    reviewed = json.loads(review_path.read_bytes())
    authored_path = directory / 'authored-corrections.json'
    authored = json.loads(authored_path.read_bytes())
    diff_path = directory / 'protection-differences.zip'
    assert reviewed['format'] == 'gathria-source-protection-review' and reviewed['version'] == 1
    assert reviewed['registrationSha256'] == sha(author.registration_bytes)
    assert reviewed['sourceSha256'] == sha(source)
    assert reviewed['templateSha256'] == sha(author.template_bytes)
    assert reviewed['protectionDifferenceArchiveSha256'] == sha(diff_path.read_bytes())
    corrections = {(r['frameId'], r['label']): r for r in reviewed['corrections']}
    authored_corrections = {(r['frameId'], r['label']): r for r in authored['corrections']}
    assert len(corrections) == len(reviewed['corrections'])
    assert len(authored_corrections) == len(authored['corrections'])
    assert set(corrections) == set(authored_corrections)
    for key, correction in corrections.items():
        assert correction['label'] in ['nearHand', 'farHand']
        assert correction['reassignedTo'] in ['nearLeg', 'farLeg', 'nearArm', 'farArm']
        assert correction['reason'].strip()
        for name, value in authored_corrections[key].items():
            assert correction[name] == value, f'Review disagrees with authored correction: {key}/{name}'
    diffs = []
    with ZipFile(ROOT / 'docs/kling-wardrobe/templates/male.wardrobe-template.zip') as previous, \
            ZipFile(io.BytesIO(author.template_bytes)) as current, ZipFile(diff_path) as changes:
        assert previous.testzip() is None and current.testzip() is None and changes.testzip() is None
        assert previous.read('source.character.zip') == current.read('source.character.zip') == source
        assert reviewed['oldRegistrationSha256'] == sha(previous.read('registration.json'))
        old_registration = json.loads(previous.read('registration.json'))
        new_registration = json.loads(author.registration_bytes)
        assert {k:v for k,v in old_registration.items() if k != 'frames'} == {k:v for k,v in new_registration.items() if k != 'frames'}
        assert set(changes.namelist()) == {r[name] for r in corrections.values() for name in ['removedMask', 'addedMask']}
        for fid, original in frames.items():
            old_frame, new_frame = old_frames[fid], records[fid]
            assert {k:v for k,v in old_frame.items() if k != 'protected'} == {k:v for k,v in new_frame.items() if k != 'protected'}
            old_regions = {r['label']: r for r in old_frame['protected']}
            new_regions = {r['label']: r for r in new_frame['protected']}
            assert set(old_regions) == set(new_regions)
            semantic = author.semantic(fid)
            visible = original[:, :, 3] > 0
            for name in ['tank', 'shorts', 'skin', 'shoes', 'head', 'nearHand', 'farHand']:
                path = f'masks/{fid:03}/{name}.png'
                if (fid, name) not in corrections:
                    assert previous.read(path) == current.read(path), f'Unreviewed semantic mask changed: {fid}/{name}'
            for label, old_region in old_regions.items():
                new_region = new_regions[label]
                if (fid, label) not in corrections:
                    assert old_region == new_region, f'Unreviewed protection changed: {fid}/{label}'
                    continue
                record = corrections[(fid, label)]
                assert new_region == {'label': label, 'polygon': record['polygon']}
                before = protected_mask({'protected': [old_region]})
                after = protected_mask({'protected': [new_region]})
                removed, added = before & ~after, after & ~before
                for kind, expected in [('removed', removed), ('added', added)]:
                    data = changes.read(record[kind+'Mask'])
                    assert sha(data) == record[kind+'MaskSha256']
                    pixels = image_bytes(data, 'L')
                    assert pixels.shape == SIZE and set(np.unique(pixels)).issubset({0, 255})
                    assert np.array_equal(pixels > 0, expected), f'Unrecorded protection difference: {fid}/{label}/{kind}'
                    assert record[kind+'Pixels'] == int(expected.sum())
                    assert record[kind+'VisiblePixels'] == int((expected & visible).sum())
                assert not np.any(removed & semantic['head'] & visible), f'Head removed from protection: {fid}/{label}'
                assert not np.any(semantic[label] & ~after), f'Corrected hand mask exceeds reviewed contour: {fid}/{label}'
                old_semantic = image_bytes(previous.read(f'masks/{fid:03}/{label}.png'), 'L')
                skin = image_bytes(previous.read(f'masks/{fid:03}/skin.png'), 'L')
                expected_hand = np.where(after, np.maximum(old_semantic, skin), 0)
                actual_hand = image_bytes(current.read(f'masks/{fid:03}/{label}.png'), 'L')
                assert np.array_equal(actual_hand, expected_hand), f'Corrected hand pixels differ from reviewed source: {fid}/{label}'
                diffs.append({
                    'frameId': fid, 'label': label, 'reassignedTo': record['reassignedTo'], 'reason': record['reason'],
                    'removedVisiblePixels': int((removed & visible).sum()), 'addedVisiblePixels': int((added & visible).sum()),
                    'removedMaskSha256': record['removedMaskSha256'], 'addedMaskSha256': record['addedMaskSha256'],
                    'correctedVisibleHandPixels': int((semantic[label] & visible).sum()),
                })
        for rebound in reviewed['reboundGarments']:
            with ZipFile(ROOT / rebound['path']) as new, ZipFile(ROOT / f'docs/kling-wardrobe/garments/male/{rebound["id"]}.zip') as old:
                assert new.testzip() is None
                assert set(new.namelist()) == set(old.namelist())
                new_manifest, old_manifest = json.loads(new.read('manifest.json')), json.loads(old.read('manifest.json'))
                assert new_manifest.pop('registrationSha256') == sha(author.registration_bytes)
                old_manifest.pop('registrationSha256')
                assert new_manifest == old_manifest
                expected_pages = [image_bytes(old.read(p['file'])) for p in old_manifest['pages']]
                expected_masks = [image_bytes(old.read(p['maskFile'])) for p in old_manifest['pages']]
                repairs = []
                for frame in old_manifest['frames']:
                    fid, r, o, p = frame['frameId'], frame['rect'], frame['offset'], frame['page']
                    crop = np.s_[r['y']:r['y']+r['height'], r['x']:r['x']+r['width']]
                    source_crop = np.s_[o['y']:o['y']+r['height'], o['x']:o['x']+r['width']]
                    previous_protection = protected_mask(old_frames[fid])
                    current_protection = protected_mask(records[fid])
                    newly_protected = current_protection & ~previous_protection & (frames[fid][:, :, 3] > 0)
                    old_owned = expected_masks[p][crop][:, :, 3] > 0
                    removed = old_owned & newly_protected[source_crop]
                    if removed.any():
                        expected_pages[p][crop][removed] = 0
                        expected_masks[p][crop][removed] = 0
                        repairs.append({'frameId': fid, 'newlyProtectedVisibleHandEdgePixels': int(removed.sum())})
                assert repairs == rebound['handEdgeRepairs'], f'Unrecorded legacy-derived repair: {rebound["id"]}'
                for p, page in enumerate(old_manifest['pages']):
                    actual_page = image_bytes(new.read(page['file']))
                    actual_mask = image_bytes(new.read(page['maskFile']))
                    assert np.array_equal(actual_page, expected_pages[p]), f'Derived RGBA changed outside reviewed hand edge: {rebound["id"]}/{p}'
                    assert np.array_equal(actual_mask, expected_masks[p]), f'Derived ownership changed outside reviewed hand edge: {rebound["id"]}/{p}'
                    assert not np.any(actual_page[actual_mask[:, :, 3] == 0]), f'Derived RGBA remains outside ownership: {rebound["id"]}/{p}'
                assert sha((ROOT / rebound['path']).read_bytes()) == rebound['sha256']
    return {'reviewFile': relative(review_path), 'reviewSha256': sha(review_path.read_bytes()),
            'authoredCorrectionsSha256': sha(authored_path.read_bytes()), 'differences': diffs,
            'reviewedFrames': len({r['frameId'] for r in diffs}),
            'derivedLegacyGarments': [
                {'id': r['id'], 'file': r['path'], 'sha256': r['sha256'],
                 'handEdgeRepairs': r['handEdgeRepairs'], 'allOtherPixelsAndLayoutIdentical': True}
                for r in reviewed['reboundGarments']],
            'classificationNote': 'Hand/skin boundaries are manually reviewed source contours. Recorded thigh and upper-arm/forearm reassignments are explicit, not a blanket relaxation of old identity checks.'}


def audit_female():
    registration_bytes = (ROOT / 'artwork/kling-wardrobe/registration/female/registration.json').read_bytes()
    registration = json.loads(registration_bytes)
    source, manifest, config, frames = load_source('female')
    assert_source_registration(registration, manifest, config, source)
    records = {f['frameId']: f for f in registration['frames']}
    result = []
    with ZipFile(ROOT / 'docs/kling-wardrobe/templates/female.wardrobe-template.zip') as template:
        assert template.read('registration.json') == registration_bytes
        for item in FEMALE_ITEMS:
            after = Garment(ROOT / f'docs/kling-wardrobe/garments/female/{item}.zip', registration_bytes)
            before = Garment(ROOT / f'docs/kling-wardrobe/garments/female/{item[:-1]}2.zip', registration_bytes)
            assert before.manifest['frames'] == after.manifest['frames']
            assert before.manifest['pages'] == after.manifest['pages']
            report = after.summary()
            for fid, original in frames.items():
                patch, owned = after.frame(fid)
                previous, old_owned = before.frame(fid)
                assert np.array_equal(owned, old_owned), f'Female V2 ownership moved: {item}/{fid}'
                assert np.array_equal(patch[:, :, 3], previous[:, :, 3]), f'Female V2 silhouette changed: {item}/{fid}'
                fixed = protected_mask(records[fid])
                for name in ['head', 'nearHand', 'farHand']:
                    fixed |= image_bytes(template.read(f'masks/{fid:03}/{name}.png'), 'L') > 0
                entry = check_frame(patch, owned, original, fixed, context=f'{item}/{fid}')
                entry.update({'frameId': fid, 'v2AlphaAndOwnershipIdentical': True})
                report['frames'].append(entry)
            before.close()
            after.close()
            result.append(report)
    return result


def reuse_unchanged_verification(previous_path, asset_path):
    previous_bytes, asset_bytes = previous_path.read_bytes(), asset_path.read_bytes()
    previous, assets = json.loads(previous_bytes), json.loads(asset_bytes)
    assert previous['passed'] is True and assets['passed'] is True
    assert previous['baselineCommit'] == BASELINE
    allowed = {f'docs/kling-wardrobe/garments/male/{name}.zip' for name, slot in MALE_ITEMS.items() if slot == 'bottom'}
    changed, unchanged = [], []
    for name, before in assets['inputFiles'].items():
        data = (ROOT / name).read_bytes()
        record = {'file': name, 'bytes': len(data), 'sha256': sha(data)}
        if record['sha256'] == before['sha256']:
            assert len(data) == before['bytes']
            unchanged.append(record)
        else:
            assert name in allowed, f'An unrelated prior-asset input changed: {name}'
            changed.append({**record, 'beforeSha256': before['sha256']})
    assert {r['file'] for r in changed} == allowed, 'Expected exactly the two corrected trouser ZIPs'
    for row in previous['legacyFiles']:
        assert sha((ROOT / row['file']).read_bytes()) == row['sha256'], f'Legacy input changed: {row["file"]}'
    for row in previous['male']['garments'] + previous['female']:
        if row['file'] not in allowed:
            assert sha((ROOT / row['file']).read_bytes()) == row['sha256'], f'Unaffected garment changed: {row["file"]}'
    for name, digest in previous['inputFiles'].items():
        if name not in ['scripts/verify-kling-full-outfit-ownership.py', 'scripts/prepare-kling-male-trousers.py']:
            assert sha((ROOT / name).read_bytes()) == digest, f'Unaffected authoring dependency changed: {name}'
    male = previous['male']
    assert sha((ROOT / male['registrationFile']).read_bytes()) == male['registrationSha256']
    assert sha((ROOT / male['templateFile']).read_bytes()) == male['templateSha256']
    protection = male['protectionReview']
    assert sha((ROOT / protection['reviewFile']).read_bytes()) == protection['reviewSha256']
    directory = (ROOT / protection['reviewFile']).parent
    assert sha((directory / 'authored-corrections.json').read_bytes()) == protection['authoredCorrectionsSha256']
    profile_review = json.loads((ROOT / protection['reviewFile']).read_bytes())
    assert sha((directory / 'protection-differences.zip').read_bytes()) == profile_review['protectionDifferenceArchiveSha256']
    for row in protection['derivedLegacyGarments']:
        assert sha((ROOT / row['file']).read_bytes()) == row['sha256']
    proof = {
        'previousOwnershipReport': relative(previous_path), 'previousOwnershipReportSha256': sha(previous_bytes),
        'previousOwnershipCompletedAt': previous['completedAt'],
        'priorAssetReport': relative(asset_path), 'priorAssetReportSha256': sha(asset_bytes),
        'priorAssetChecksCompletedAt': assets['assetChecksCompletedAt'],
        'priorAssetPoseChecks': sum(len(item['frames']) for character in assets['characters'] for item in character['items']),
        'unchangedInputs': unchanged, 'changedGarments': changed,
        'unchangedGarmentArchives': sum('/garments/' in row['file'] for row in unchanged),
        'verificationScope': 'Prior complete asset/ownership checks are reused only for exact-hash unchanged inputs. This run freshly checks the two corrected trousers (176 poses) and both complete outfit compositions; it does not claim to rerun the prior 1464-pose asset suite.',
    }
    return previous, proof


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--male-registration', type=Path, default=ROOT / 'artwork/kling-wardrobe/registration/male-full-outfits-v1/registration.json')
    parser.add_argument('--male-template', type=Path, default=ROOT / 'docs/kling-wardrobe/templates/male-full-outfits-v1.wardrobe-template.zip')
    parser.add_argument('--output', type=Path, default=ROOT / 'docs/kling-wardrobe/full-outfits/verification-ownership.json')
    parser.add_argument('--trousers-only', action='store_true', help='Recheck changed trousers; retain exact-hash provenance for prior unchanged checks.')
    parser.add_argument('--previous-report', type=Path, default=ROOT / 'docs/kling-wardrobe/full-outfits/verification-ownership-before-shoe-edge.json')
    parser.add_argument('--prior-asset-report', type=Path, default=ROOT / 'docs/kling-wardrobe/full-outfits/verification-assets-before-shoe-edge.json')
    args = parser.parse_args()
    report = {'startedAt': datetime.now(timezone.utc).isoformat(), 'scope': __doc__,
              'baselineCommit': BASELINE, 'passed': False, 'inputFiles': {}, 'legacyFiles': [], 'male': {}, 'female': []}
    for name in ['scripts/verify-kling-full-outfit-ownership.py', 'scripts/kling_male_limb_ownership.py',
                 'scripts/kling_wardrobe_common.py', 'scripts/prepare-kling-male-full-profile.py', 'scripts/prepare-kling-male-tops.py',
                 'scripts/prepare-kling-male-trousers.py', 'scripts/kling_dress_fit.py',
                 'scripts/prepare-kling-wardrobe-dresses.py']:
        report['inputFiles'][name] = sha((ROOT / name).read_bytes())
    try:
        if args.trousers_only:
            previous, proof = reuse_unchanged_verification(args.previous_report, args.prior_asset_report)
            report['verificationReuse'] = proof
            report['legacyFiles'] = previous['legacyFiles']
            report['female'] = [{**item, 'verificationReuse': 'Exact ZIP and authoring dependency hashes unchanged from previous ownership report.'} for item in previous['female']]
            author = MaleLimbOwnership(args.male_template)
            try:
                assert author.registration_bytes == args.male_registration.read_bytes()
                assert sha(author.registration_bytes) == previous['male']['registrationSha256']
                source, manifest, config, frames = load_source('male')
                assert_source_registration(json.loads(author.registration_bytes), manifest, config, source)
                assert sha(source) == previous['male']['sourceSha256']
                report['male'] = {**previous['male'], **audit_male_garments(author, frames, previous['male'])}
                report['male']['protectionReview'] = {**previous['male']['protectionReview'], 'verificationReuse': 'Source/profile/template/review/masks/derived copies all exact-hash unchanged.'}
            finally:
                author.close()
        else:
            report['legacyFiles'] = legacy_preservation()
            report['male'] = audit_male(args.male_registration, args.male_template)
            report['female'] = audit_female()
        report['summary'] = {
            'newMaleGarmentPoses': sum(len(item['frames']) for item in report['male']['garments']),
            'femaleV3GarmentPoses': sum(len(item['frames']) for item in report['female']),
            'completeMaleOutfitPoses': sum(len(items) for items in report['male']['combinedOwnershipChecks'].values()),
            'unchangedLegacyFiles': len(report['legacyFiles']),
            'reviewedProtectionBoundaries': len(report['male']['protectionReview']['differences']),
            'reviewedProtectionFrames': report['male']['protectionReview']['reviewedFrames'],
            'derivedLegacyGarments': len(report['male']['protectionReview']['derivedLegacyGarments']),
            'browserPlaybackAndArtAcceptance': 'Not certified by this offline audit; see actual export and visual reviews.',
            'freshlyAuditedGarmentPoses': 176 if args.trousers_only else 544,
            'unchangedTopPosesReused': 176 if args.trousers_only else 0,
            'unchangedFemaleV3PosesReused': 192 if args.trousers_only else 0,
        }
        for name, digest in report['inputFiles'].items():
            assert sha((ROOT / name).read_bytes()) == digest, f'Authoring/audit input changed during verification: {name}'
        report['passed'] = True
    finally:
        report['completedAt'] = datetime.now(timezone.utc).isoformat()
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'passed': report['passed'], 'report': relative(args.output)}, indent=2))


if __name__ == '__main__':
    main()
