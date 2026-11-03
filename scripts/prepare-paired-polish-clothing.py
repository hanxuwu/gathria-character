#!/usr/bin/env python3
"""Bounded ownership/edge corrections to the retained painted side-view tops.

This is an offline authoring operation, not a renderer exception. Existing
source, registration, torso folds, palettes and untouched garment pixels stay
exact. Exported UI results are reviewed separately from these diagnostic PNGs.
"""
from pathlib import Path
import argparse
import hashlib
import io
import json
import zipfile

import numpy as np
from PIL import Image
from scipy import ndimage as nd
from scipy.interpolate import PchipInterpolator

from kling_side_authoring import ROOT, load_context, encode_rgba, _color_chunks

ART = ROOT / 'artwork/paired-polish/clothing'
ASSETS = ROOT / 'docs/paired-polish/assets'
Y, X = np.indices((768, 512))
FEMALE_CAP_FRAMES = list(range(19)) + [23, 24, 25, 26, 27, 32, 33]
BASE_CATALOGS = {'male': 'docs/dual-tailored/assets/male/catalog.json',
                 'female': 'docs/dual-looks-cloth/assets/female/catalog.json'}



def sha(data):
    return hashlib.sha256(data).hexdigest()


def load_bank(path):
    with zipfile.ZipFile(path) as z:
        files = {name: z.read(name) for name in z.namelist()}
    manifest = json.loads(files['manifest.json'])
    pages = [np.array(Image.open(io.BytesIO(files[p['file']])).convert('RGBA')) for p in manifest['pages']]
    masks = [np.array(Image.open(io.BytesIO(files[p['maskFile']])).convert('RGBA')) for p in manifest['pages']]
    frames = {}
    for f in manifest['frames']:
        r, o = f['rect'], f['offset']
        patch = np.zeros((768, 512, 4), np.uint8)
        own = np.zeros((768, 512), bool)
        src = np.s_[r['y']:r['y'] + r['height'], r['x']:r['x'] + r['width']]
        dst = np.s_[o['y']:o['y'] + r['height'], o['x']:o['x'] + r['width']]
        patch[dst] = pages[f['page']][src]
        own[dst] = masks[f['page']][src][:, :, 3] > 0
        frames[f['frameId']] = patch, own
    return manifest, files, pages, masks, frames


def mix_with_source(patch, source, weight):
    """Preserve source alpha/color at the one-pixel cloth coverage boundary."""
    a, b, w = patch[:, :, 3:4] / 255, source[:, :, 3:4] / 255, weight[:, :, None]
    alpha = a * w + b * (1 - w)
    rgb = (patch[:, :, :3] * a * w + source[:, :, :3] * b * (1 - w)) / np.maximum(alpha, 1e-9)
    return np.concatenate([np.rint(rgb), np.rint(alpha * 255)], axis=2).astype(np.uint8)


def add_retained_cloth(patch, owned, target, region, protected, source):
    """Continue the nearest one-pixel-inset painted cloth, only in reviewed gaps."""
    add = region & (target > 0) & ~owned & ~protected
    donor = nd.binary_erosion(owned & (patch[:, :, 3] > 240), iterations=1)
    distance, nearest = nd.distance_transform_edt(~donor, return_indices=True)
    if add.any():
        assert distance[add].max() < 9, 'Cloth continuation exceeds the reviewed local edge'
    result = patch.copy()
    sampled = np.zeros_like(patch)
    sampled[add] = patch[nearest[0][add], nearest[1][add]]
    sampled[add, 3] = 255
    covered = mix_with_source(sampled, source, target)
    result[add] = covered[add]
    return result, owned | add


def refine(ctx, fid, before_patch, before_own):
    patch, own = before_patch.copy(), before_own.copy()
    source, protected = ctx.frames[fid], ctx.protected_mask(fid)
    neck = ctx.registered[fid]['points']['neck']
    weight = np.ones((768, 512), float)
    region = np.zeros((768, 512), bool)
    reason = None
    if ctx.identity == 'male' and fid in [81, 82]:
        # Source-reviewed far-shoulder silhouette: remove the floating upper
        # cloth tongue and join the collar to the cuff with continuous tangents.
        # Frame81's actual front arm is 10px farther right; it is not a skin
        # recolor or an animation interpolation of the source body.
        oy = neck['y'] - 524.9
        ox = 10 if fid == 81 else 0
        curve = PchipInterpolator([500, 506, 514, 522, 530, 536, 541, 546],
                                  [332, 338, 342, 343, 343.5, 346, 350, 346])
        edge = curve(np.clip(Y - oy, 500, 546)) + ox
        region = (Y >= 504 + oy) & (Y <= 543 + oy) & (X > 325 + ox)
        target = np.clip(edge - .5 - X, 0, 1)
        patch, own = add_retained_cloth(patch, own, target, region, protected, source)
        # Only adjust old owned samples here; new edge samples already contain
        # the exact source-over coverage generated above.
        trim = region & before_own
        weight[trim] = np.minimum(1, target[trim] / np.maximum(patch[trim, 3] / 255, 1e-5))
        reason = 'Far-shoulder cloth tongue/notch: local continuous silhouette using retained adjacent cloth.'
    elif ctx.identity == 'female' and fid in FEMALE_CAP_FRAMES:
        # One bounded rule for every frame using the same standing puff sleeve
        # donor, including the idle wrap. No per-frame color or fold redesign.
        binary = own & (patch[:, :, 3] >= 128)
        radius = 14
        yy, xx = np.indices((radius * 2 + 1, radius * 2 + 1))
        disk = (xx - radius) ** 2 + (yy - radius) ** 2 <= radius ** 2
        closed = nd.binary_closing(binary, structure=disk)
        signed = nd.distance_transform_edt(closed) - nd.distance_transform_edt(~closed)
        target = np.clip(nd.gaussian_filter(signed, 2.5) + .5, 0, 1)
        cx, cy = neck['x'] - 56, neck['y'] - 15
        region = ((X - cx) / 30) ** 2 + ((Y - cy) / 30) ** 2 < 1
        patch, own = add_retained_cloth(patch, own, target, region, protected, source)
        trim = region & before_own
        weight[trim] = np.minimum(1, target[trim] / np.maximum(patch[trim, 3] / 255, 1e-5))
        reason = 'Rear puff-sleeve stepped matte: bounded rounded contour; original sleeve volume/folds retained.'
    elif ctx.identity == 'female' and fid == 97:
        region = (X >= 340) & (X < 357) & (Y >= 503) & (Y < 523)
        weight[region] = 0
        reason = 'Release isolated top ownership on the visible front forearm; exact native skin returns.'
    changed_old = before_own & (weight < 1)
    patch[changed_old] = mix_with_source(patch, source, weight)[changed_old]
    own[weight <= 0] = False
    patch[~own] = 0
    delta = np.any(patch != before_patch, axis=2) | (own != before_own)
    assert not np.any(delta & ~region)
    assert not np.any(own & protected)
    assert not np.any(patch[~own])
    return patch, own, delta, reason


def encode_bank(manifest, files, pages, masks, changed_pages):
    files = dict(files)
    files['manifest.json'] = (json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
    for index in changed_pages:
        page = manifest['pages'][index]
        for key, pixels in [('file', pages[index]), ('maskFile', masks[index])]:
            name = page[key]
            files[name] = encode_rgba(pixels, _color_chunks(files[name]))
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    return out.getvalue()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    ART.mkdir(parents=True, exist_ok=True)
    report = {'format': 'gathria-paired-polish-clothing-audit', 'version': 1,
              'sourceAndRegistrationUnchanged': True,
              'technique': 'Local source-reviewed ownership correction and continuation of existing painted cloth; no generated anatomy or new color palette.',
              'limitations': 'Original donor fold and sleeve-pose transitions remain, including female walk24 forearm-cut cuff and reddish waist wedge. Only the named front-shoulder/rear-cap edges and forearm speck are revised. This is not a new cloth simulation or a claim that every existing cloth pose is flawless. UI exports receive separate visual acceptance.',
              'items': [], 'results': []}
    for sex in ['male', 'female']:
        ctx = load_context(sex, registration_path=ROOT / 'artwork/kling-side-expansion/templates' / f'{sex}.registration.json')
        row = next(r for r in json.loads((ROOT / BASE_CATALOGS[sex]).read_text())['representations'] if r['view'] == 'side')
        for palette in ['sea', 'apricot']:
            item = next(i for i in row['items'] if i['slot'] == 'top' and i['palette'] == palette)
            source_path = ROOT / item['url'].lstrip('/')
            assert sha(source_path.read_bytes()) == item['sha256']
            manifest, files, pages, masks, frames = load_bank(source_path)
            assert manifest['sourceSha256'] == ctx.source_sha256
            assert manifest['registrationSha256'] == ctx.registration_sha256
            records, changed_pages, after = [], set(), {}
            for fid, (old, old_own) in frames.items():
                new, own, delta, reason = refine(ctx, fid, old, old_own)
                after[fid] = new, own
                if not delta.any():
                    continue
                box = Image.fromarray(delta).getbbox()
                f = next(f for f in manifest['frames'] if f['frameId'] == fid)
                r, o = f['rect'], f['offset']
                assert box[0] >= o['x'] and box[1] >= o['y'] and box[2] <= o['x'] + r['width'] and box[3] <= o['y'] + r['height']
                yy, xx = np.where(delta)
                ay, ax = yy - o['y'] + r['y'], xx - o['x'] + r['x']
                pages[f['page']][ay, ax] = new[delta]
                masks[f['page']][ay, ax] = np.stack([own[delta].astype(np.uint8) * 255] * 4, axis=1)
                changed_pages.add(f['page'])
                mask_path = ART / 'changed-masks' / f'{sex}-{palette}-{fid:03d}.png'
                mask_path.parent.mkdir(parents=True, exist_ok=True)
                png = encode_rgba(np.stack([delta.astype(np.uint8) * 255] * 4, axis=2))
                if args.check:
                    assert mask_path.read_bytes() == png
                else:
                    mask_path.write_bytes(png)
                records.append({'frameId': fid, 'bounds': list(box), 'changedPixels': int(delta.sum()),
                                'newOwnedPixels': int((own & ~old_own).sum()), 'releasedOwnedPixels': int((old_own & ~own).sum()),
                                'protectedChanges': 0, 'outsideReviewedRegionChanges': 0,
                                'beforeRgbaSha256': sha(old.tobytes()), 'afterRgbaSha256': sha(new.tobytes()),
                                'beforeOwnershipSha256': sha(old_own.tobytes()), 'afterOwnershipSha256': sha(own.tobytes()),
                                'changedMask': str(mask_path.relative_to(ROOT)), 'changedMaskSha256': sha(png), 'reason': reason})
            ident = f'polished-{sex}-side-{palette}-top-v1'
            manifest = {**manifest, 'id': ident, 'name': manifest['name'] + ' · 接缝修订',
                        'provenance': manifest['provenance'] + ' Bounded paired-polish ownership/edge revision; scripts/prepare-paired-polish-clothing.py and artwork/paired-polish/clothing/audit.json. Native source, registration and timing unchanged.'}
            path = ASSETS / sex / f'{ident}.garment.zip'
            data = encode_bank(manifest, files, pages, masks, changed_pages)
            path.parent.mkdir(parents=True, exist_ok=True)
            if args.check:
                assert path.read_bytes() == data, f'Reproduction differs: {path}'
            else:
                path.write_bytes(data)
            _, _, _, _, decoded = load_bank(path)
            for fid, (rgba, owned) in decoded.items():
                assert np.array_equal(rgba, after[fid][0]) and np.array_equal(owned, after[fid][1])
            report['items'].append({'character': sex, 'slot': 'top', 'palette': palette, 'logicalId': item['logicalId'],
                                    'id': ident, 'url': '/' + str(path.relative_to(ROOT)), 'sha256': sha(data), 'bytes': len(data),
                                    'baselineUrl': item['url'], 'baselineSha256': item['sha256'],
                                    'sourceSha256': ctx.source_sha256, 'registrationSha256': ctx.registration_sha256})
            report['results'].append({'character': sex, 'palette': palette, 'checkedFrames': len(frames),
                                      'changedFrames': [r['frameId'] for r in records], 'unchangedFramesExact': len(frames) - len(records), 'records': records})
            print(sex, palette, len(records), len(data), sha(data), flush=True)
    encoded = (json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode()
    if args.check:
        assert (ART / 'audit.json').read_bytes() == encoded
    else:
        (ART / 'audit.json').write_bytes(encoded)


if __name__ == '__main__':
    main()
