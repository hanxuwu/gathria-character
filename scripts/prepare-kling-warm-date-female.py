#!/usr/bin/env python3
"""Paint three imagegen donor designs inside exact coral-daydress-v9 geometry.

The masks below delimit donor cloth, never draw substitute garment silhouettes.
Only RGB of already-owned, nontransparent V9 cloth changes. All alpha, masks,
atlas geometry, source bindings and original exposed character pixels are exact.
"""
import argparse
from functools import lru_cache
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

from kling_wardrobe_common import ROOT, load_source, sha, json_bytes, png_bytes

SOURCE = ROOT / 'artwork/kling-collection/source/warm-date-v1'
OUT = ROOT / 'artwork/kling-collection/prepared/warm-date-v1/female'
SPEC = json.loads((SOURCE / 'female-donors.json').read_text())
BASE = ROOT / SPEC['sourceTemplate']
REGISTRATION = ROOT / 'docs/kling-wardrobe/registration/female.json'
YY, XX = np.indices((1056, 704), dtype=np.float32)
KEYS = [0, 35, 51, 55, 58, 63, 78, 86, 89, 95, 104, 112]


def polygon(points, size):
    im = Image.new('L', size)
    ImageDraw.Draw(im).polygon([tuple(p) for p in points], fill=255)
    return np.asarray(im) > 0


@lru_cache(maxsize=6)
def texture(item, region):
    """Keep real painted cloth; pad only unpainted donor space with plain cloth."""
    image = np.asarray(Image.open(SOURCE / SPEC['image']).convert('RGBA'))
    rgb = image[:, :, :3].astype(np.float32)
    definition = SPEC['items'][item]
    inside = polygon(definition[region], (image.shape[1], image.shape[0]))
    inside &= image[:, :, 3] > 220
    # Explicit cloth-only trace; warm cream/apricot pixels are never classified
    # as skin. A one-pixel erosion stays inside painted side ink and avoids a
    # generated antialias pixel from the adjacent body.
    inside = nd.binary_erosion(inside, iterations=1)
    plain = polygon(definition['plain'], (image.shape[1], image.shape[0]))
    assert plain.any() and inside.any()
    nearest = nd.distance_transform_edt(~plain, return_distances=False, return_indices=True)
    padded = nd.gaussian_filter(rgb[tuple(nearest)], sigma=(3, 3, 0))
    padded[inside] = rgb[inside]
    return padded, inside


def sample(item, region, sx, sy):
    field, _ = texture(item, region)
    return np.stack([nd.map_coordinates(field[:, :, c], [sy, sx], order=1, mode='nearest') for c in range(3)], axis=2)


def paint_controls(own, points):
    """Calibrate cloth to the visible neckline; never move source landmarks."""
    rows, _ = np.where(own)
    profile = np.min(np.where(own, YY, 2000), axis=0)
    near, far = points['nearShoulder'], points['farShoulder']
    wl, wr = points['waistLeft'], points['waistRight']
    expected = (near['x'] + far['x']) / 2 + 25
    shoulder = min(near['y'], far['y'])
    eligible = (np.arange(704) > expected - 36) & (np.arange(704) < expected + 36)
    eligible &= (profile > rows.min() + 15) & (profile < min(shoulder + 85, (wl['y'] + wr['y']) / 2 - 40))
    if eligible.any():
        lowest = float(profile[eligible].max())
        dip_x = float(np.median(np.where(eligible & (profile >= lowest - 2))[0]))
    else:
        # Source guides remain frozen. This fallback only selects paint UV.
        lowest = max(float(rows.min()) + 25, float(points['neck']['y']) + 18)
        dip_x = float(points['neck']['x'])
    return {'top': float(rows.min()), 'dipX': dip_x, 'dipY': lowest}


def paint_frame(item, original, base, owned, points, tank, shorts):
    d = SPEC['items'][item]
    active = owned & (base[:, :, 3] > 0)
    bodice = tank & active
    assert bodice.any()
    controls = paint_controls(bodice, points)
    wl, wr = points['waistLeft'], points['waistRight']
    slope = np.clip((wr['y'] - wl['y']) / max(1, wr['x'] - wl['x']), -.48, .48)
    center = (wl['x'] + wr['x']) / 2
    waist_y = wl['y'] + (XX - wl['x']) * slope + 7
    top, dip_y, dip_x = controls['top'], controls['dipY'], controls['dipX']
    lower = np.clip((YY - dip_y) / np.maximum(45, waist_y - dip_y), 0, 1)
    upper = np.clip((YY - top) / max(20, dip_y - top), 0, 1)
    donor_dip_x, donor_dip_y = d['neckDip']
    donor_waist_x = (d['waist'][0] + d['waist'][1]) / 2
    ty = np.where(YY < dip_y, d['neckTop'] + upper * (donor_dip_y - d['neckTop']), donor_dip_y + lower * (d['waist'][2] - donor_dip_y))
    target_center = dip_x * (1 - lower) + center * lower
    tx = donor_dip_x * (1 - lower) + donor_waist_x * lower + (XX - target_center) / max(110, wr['x'] - wl['x']) * d['torsoWidth']
    top_color = sample(item, 'torso', tx, ty)
    # Small amount of native, pose-specific cloth shading; no source anatomy is
    # sampled as a replacement drawing. New collar/buttons/pockets remain art.
    lum = original[:, :, :3].astype(np.float32) @ np.asarray([.2126, .7152, .0722], np.float32)
    light = np.clip(lum / max(1, float(np.median(lum[bodice]))), .45, 1.35)
    top_color *= (.86 + .14 * light)[:, :, None]

    # Use the released waist/hip fitting coordinates but retain V9 silhouette.
    # The target has the original coral skirt length/flare; new donor skirts
    # contribute only their broad folds, painted pocket/sash/hem details.
    sy, sx = np.where(shorts)
    waist = (wl['y'] + wr['y']) / 2 + 7
    length = max(85, min(waist + 175, 984) - waist)
    hip_center = float(sx.min() + sx.max()) / 2
    shoulders = (points['nearShoulder']['x'] + points['farShoulder']['x']) / 2
    shift = np.clip((hip_center - center) * 1.5 + (center - shoulders) * .12, -55, 55)
    v = np.clip((YY - waist - slope * (XX - center)) / (length - slope * (XX - center)), 0, 1)
    short_v = v[sy, sx]
    width = max(135, wr['x'] - wl['x'] + 12, float(np.max(2 * abs(sx - center - shift * short_v) / (1 + .88 * short_v))) * 1.055 + 4)
    target_width = width * (1 + .88 * v)
    target_center = center + shift * v
    left, right, donor_top = d['waist']
    hem_left, hem_right, donor_bottom = d['sourceHem']
    donor_width = (right - left) * (1 - v) + (hem_right - hem_left) * v
    donor_center = (left + right) / 2 * (1 - v) + (hem_left + hem_right) / 2 * v
    skirt_x = (XX - target_center) / target_width * donor_width + donor_center
    # The bodice supplies the waistband. Skirt-only side cloth starts below
    # that band, so the fixed V9 waist overlap cannot become floating belt ends.
    skirt_y = donor_top + 10 + v * (donor_bottom - donor_top - 12)
    if 'hemLine' in d:
        # Cocoa edging follows the reviewed target hem rather than disappearing
        # where the new donor's curved hem differs from the old coral drawing.
        bottom_rows = np.max(np.where(active & (base[:, :, 3] > 127), YY, -1), axis=0)
        good = bottom_rows > waist + 50
        target_hem = np.interp(np.arange(704), np.where(good)[0], bottom_rows[good])
        hem_v = np.clip((YY - waist_y) / np.maximum(60, target_hem[None, :] - waist_y), 0, 1)
        line = np.asarray(d['hemLine'])
        source_hem = np.interp(skirt_x, line[:, 0], line[:, 1]) - 2
        skirt_y = donor_top + 10 + hem_v * (source_hem - donor_top - 10)
    # The generated sash curls slightly lower at its far end. Native skirt
    # overlaps above the tank hem must sample cloth below that entire curl,
    # otherwise the far end becomes a disconnected little gold rectangle.
    skirt_y = np.where(~tank & (YY < waist_y + 16), np.maximum(skirt_y, donor_top + 25), skirt_y)
    # Complete only narrow donor-boundary sampling with adjacent painted cloth,
    # not the flat plain torso field. This keeps upper skirt overlaps textured.
    _, skirt_inside = texture(item, 'skirt')
    donor_yy, donor_xx = np.indices(skirt_inside.shape)
    row_left = np.min(np.where(skirt_inside, donor_xx, 100000), axis=1).astype(float)
    row_right = np.max(np.where(skirt_inside, donor_xx, -1), axis=1).astype(float)
    valid_rows = row_right >= row_left
    rows = np.arange(skirt_inside.shape[0])
    row_left = np.interp(rows, rows[valid_rows], row_left[valid_rows])
    row_right = np.interp(rows, rows[valid_rows], row_right[valid_rows])
    left_sample = np.interp(skirt_y, rows, row_left) + 2
    right_sample = np.interp(skirt_y, rows, row_right) - 2
    skirt_x = np.clip(skirt_x, left_sample, right_sample)
    lower_color = sample(item, 'skirt', skirt_x, skirt_y)
    blend = np.clip((YY - waist_y + 2) / 5, 0, 1)
    blend[~tank] = 1
    color = top_color * (1 - blend[:, :, None]) + lower_color * blend[:, :, None]
    # Exact original cloth contour ink, only at the already-owned tank edge.
    boundary = bodice & (nd.distance_transform_edt(tank) <= 1.5) & (lum < 60)
    color[boundary] = original[boundary, :3]
    result = base.copy()
    result[active, :3] = np.rint(np.clip(color[active], 0, 255)).astype(np.uint8)
    assert np.array_equal(result[:, :, 3], base[:, :, 3])
    assert np.array_equal(result[~active], base[~active])
    return result, controls


def contact(images, path):
    columns = 4
    sheet = Image.new('RGB', (352 * columns, 550 * ((len(images) + columns - 1) // columns)), '#eee9df')
    draw = ImageDraw.Draw(sheet)
    for i, (fid, rgba) in enumerate(images):
        image = Image.fromarray(rgba).resize((352, 528), Image.Resampling.LANCZOS)
        x, y = i % columns * 352, i // columns * 550
        sheet.paste(image, (x, y + 22), image)
        draw.text((x + 10, y + 5), f'OFFLINE donor fit / native pose {fid} / 0.5x', fill='#344b3f')
    sheet.save(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prototype', action='store_true')
    parser.add_argument('--item', choices=list(SPEC['items']))
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    source, source_manifest, _, frames = load_source('female')
    registration = REGISTRATION.read_bytes()
    records = {r['frameId']: r for r in json.loads(registration)['frames']}
    with zipfile.ZipFile(BASE) as archive:
        original_files = {name: archive.read(name) for name in archive.namelist()}
    manifest = json.loads(original_files['manifest.json'])
    assert sha(source) == manifest['sourceSha256']
    assert sha(registration) == manifest['registrationSha256']
    assert set(records) == {f['frameId'] for f in manifest['frames']} == set(frames)
    source_hash, base_hash = sha(source), sha(BASE.read_bytes())
    donor_hash = sha((SOURCE / SPEC['image']).read_bytes())
    report = {'sourceSha256': source_hash, 'base': str(BASE.relative_to(ROOT)), 'baseSha256': base_hash,
              'donorSha256': donor_hash, 'donorTraceSha256': sha((SOURCE / 'female-donors.json').read_bytes()),
              'registrationSha256': sha(registration), 'prototype': args.prototype, 'items': []}
    selected = [args.item] if args.item else list(SPEC['items'])
    with zipfile.ZipFile(ROOT / 'docs/kling-wardrobe/templates/female.wardrobe-template.zip') as template:
        assert template.read('registration.json') == registration
        for item in selected:
            pages = [np.asarray(Image.open(io.BytesIO(original_files[p['file']])).convert('RGBA')).copy() for p in manifest['pages']]
            masks = [np.asarray(Image.open(io.BytesIO(original_files[p['maskFile']])).convert('RGBA'))[:, :, 3] > 0 for p in manifest['pages']]
            images, audit = [], []
            for entry in manifest['frames']:
                fid, page = entry['frameId'], entry['page']
                if args.prototype and fid not in KEYS:
                    continue
                r, o = entry['rect'], entry['offset']
                crop = np.s_[r['y']:r['y'] + r['height'], r['x']:r['x'] + r['width']]
                dest = np.s_[o['y']:o['y'] + r['height'], o['x']:o['x'] + r['width']]
                base = np.zeros((1056, 704, 4), np.uint8)
                own = np.zeros((1056, 704), bool)
                base[dest] = pages[page][crop]
                own[dest] = masks[page][crop]
                tank, shorts = [np.asarray(Image.open(io.BytesIO(template.read(f'masks/{fid:03}/{name}.png')))) > 0 for name in ('tank', 'shorts')]
                patch, controls = paint_frame(item, frames[fid], base, own, records[fid]['points'], tank, shorts)
                pages[page][crop] = patch[dest]
                changed = np.any(patch != base, axis=2)
                assert not (changed & ~own).any()
                composed = frames[fid].copy()
                composed[own] = patch[own]
                assert np.array_equal(composed[~own], frames[fid][~own])
                audit.append({'frameId': fid, 'changedOwnedRgbPixels': int(changed.sum()), 'alphaChanges': 0,
                              'ownershipChanges': 0, 'sourceOutsideOwnershipChanges': 0,
                              'rgbaSha256': sha(patch.tobytes()), 'ownershipSha256': sha(own.tobytes()),
                              'paintControls': controls})
                if fid in KEYS:
                    images.append((fid, composed))
                    if fid in (0, 55, 86, 104):
                        Image.fromarray(composed).save(OUT / f'{item}-{fid:03}-offline.png')
            contact(images, OUT / f'{item}-contact.png')
            result = {'id': item, 'name': SPEC['items'][item]['name'], 'frames': audit}
            if not args.prototype:
                files = original_files.copy()
                for i, page in enumerate(manifest['pages']):
                    files[page['file']] = png_bytes(pages[i])
                updated = json.loads(original_files['manifest.json'])
                updated.update(id=item, name=SPEC['items'][item]['name'])
                updated['provenance'] = (f'OpenAI image generation 2026-10-27 clothing donor artwork/kling-collection/source/warm-date-v1/female-designs.png SHA256 {donor_hash}; exact prompt and hand-traced cloth-only donor polygons in the same directory. '
                    f'RGB-only derivative of immutable coral-daydress-v9 SHA256 {base_hash}. Generated heads, anatomy, arms, hands, shoes and backdrop are discarded. '
                    'All 96 original pose bindings, atlas geometry, binary ownership and every alpha byte stay exact. Plain adjacent generated cloth completes only unpainted donor space; no skin-colour classifier, replacement polygon garment, new silhouette, source-body rescale or runtime image generation. '
                    'New painted collar/bow/buttons, inset pockets, waistband and hem piping are fitted within the existing sleeveless A-line cut. Source figures, actions, timing and exposed head/skin remain unchanged. scripts/prepare-kling-warm-date-female.py.')
                files['manifest.json'] = json_bytes(updated)
                target = OUT / f'{item}.zip'
                with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                    for name, value in sorted(files.items()):
                        info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                        info.compress_type = zipfile.ZIP_DEFLATED
                        archive.writestr(info, value)
                result.update(path=str(target.relative_to(ROOT)), sha256=sha(target.read_bytes()), bytes=target.stat().st_size)
            report['items'].append(result)
            print(json.dumps({'item': item, 'poses': len(audit), 'prototype': args.prototype, 'bytes': result.get('bytes')}), flush=True)
    assert sha(BASE.read_bytes()) == base_hash
    assert sha((ROOT / 'docs/kling-motion/exports/female.character.zip').read_bytes()) == source_hash
    (OUT / ('prototype-audit.json' if args.prototype else 'asset-audit.json')).write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
