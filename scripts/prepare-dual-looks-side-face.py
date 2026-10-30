#!/usr/bin/env python3
"""Author a small native side-view smile using each source mouth's own pixels.

This adapts the released mouth-only gentle-v2 treatment. No generated face,
eyelid, iris, brow, nose, silhouette, source alpha or body pixels are changed.
It produces a face layer for the existing appearance-bank packer; it does not
modify old banks, character sources, registrations or runtime code.
"""
from __future__ import annotations

import argparse
import io
import json
import zipfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

from kling_side_authoring import ROOT, H, W, load_context, runtime_polygon_mask, sha

OUT = ROOT / 'artwork/dual-looks/side-face'
# Native IDs classified from all-source contact sheets. The complete source
# expression is retained through blinks/half blinks and very soft jump drawings.
PRESERVE = {
    'male': {'blink': [62, 63, 64, 65, 66, 67], 'soft-source': [75, 90, 91, 98]},
    'female': {'blink': [57, 58, 59, 60, 61, 62], 'soft-source': [70, 85, 86, 94]},
}
PROVENANCE = (
    'Side gentle v1: native source-mouth-only compact-support resampling, '
    'adapted from scripts/refine-kling-expressions.py gentle-v2. The existing '
    'painted smile is modestly widened and its corners lifted; eyes, brows, nose, ears, '
    'face silhouette, alpha and body are exact. Original half-blinks/blinks '
    'and uncertain soft jump expressions are retained. No new face drawing, '
    'new source frame or timing change. Adjacent mouth strength eases to zero '
    'around source-retained frames. Source classification and native proofs '
    'are recorded under artwork/dual-looks/side-face.'
)


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def png(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(value).save(path)


def ease(value):
    value = np.clip(value, 0, 1)
    return value * value * (3 - 2 * value)


def strengths(identity, animations):
    retained = {fid: kind for kind, ids in PRESERVE[identity].items() for fid in ids}
    weights = {}
    for clip in animations.values():
        ids = clip['frames']
        for i, fid in enumerate(ids):
            if fid in retained:
                weights[fid] = 0.
                continue
            distances = [abs(i - j) for j, other in enumerate(ids) if other in retained]
            # A two-drawing taper reduces a smile strength step around a blink.
            distance = min(distances) if distances else 3
            weights[fid] = min(weights.get(fid, 1.), {1: .35, 2: .75}.get(distance, 1.))
    return weights, retained


def gentle(source, pose, registration, axes, amount):
    if amount == 0:
        return None
    mouth = np.array([pose['anchors']['mouth'][key] for key in ('x', 'y')], np.float32)
    yy, xx = np.indices((H, W), dtype=np.float32)
    inverse = np.linalg.inv(axes)
    px, py = xx - mouth[0], yy - mouth[1]
    u, v = inverse[0, 0] * px + inverse[0, 1] * py, inverse[1, 0] * px + inverse[1, 1] * py

    def falloff(distance, inner, outer):
        return ease((outer - np.abs(distance)) / (outer - inner))

    support = falloff(u, 15, 28) * falloff(v, 7, 16)
    permitted = runtime_polygon_mask(pose['facePolygon']) & (source[:, :, 3] == 255)
    # Profile nose projects toward the mouth support's upper-right corner.
    # Keep that original feature exact even when tiny resampling tails reach it.
    nose = ((u - 17) / 11) ** 2 + ((v + 17) / 11) ** 2 <= 1
    permitted &= ~nose
    for polygon in pose['foreground']:
        permitted &= ~runtime_polygon_mask(polygon)
    for region in registration['protected']:
        if region['label'] != 'head':
            permitted &= ~runtime_polygon_mask(region['polygon'])
    permitted &= support > 0
    edge = ease((cv2.distanceTransform(permitted.astype(np.uint8), cv2.DIST_L2, 5) - 1.5) / 3)
    # Lift the existing corners by translation, not vertical scaling: scaling
    # the tiny profile mouth made its ink stroke noticeably thicker in trial 1.
    local_dx = u * (1 - 1 / 1.12) * support * amount
    local_dy = -1.4 * np.minimum(np.abs(u) / 12, 1) ** 2 * support * amount
    dx = (axes[0, 0] * local_dx + axes[0, 1] * local_dy) * edge
    dy = (axes[1, 0] * local_dx + axes[1, 1] * local_dy) * edge
    result = source.copy()
    result[:, :, :3] = cv2.remap(source[:, :, :3], xx - dx, yy - dy,
                                cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    owned = np.any(result != source, axis=2) & permitted
    result[~owned] = source[~owned]
    patch = np.zeros_like(source)
    patch[owned] = result[owned]
    assert np.array_equal(result[:, :, 3], source[:, :, 3])
    assert not np.any(owned & ~permitted)
    assert not np.any(owned & nose)
    assert not np.any(np.any(result != source, axis=2) & (np.abs(v) >= 16))
    return patch, owned, result, {'maxDisplacement': float(np.hypot(dx, dy).max()),
                                  'referenceSupport': {'halfWidth': 28, 'halfHeight': 16}}


def sheet(path, rows, title, columns=4):
    width, height = 360, 210
    output = Image.new('RGB', (width * columns, 30 + ((len(rows) + columns - 1) // columns) * height), (239, 234, 225))
    draw = ImageDraw.Draw(output)
    draw.text((8, 8), title + ' / source | gentle / native face crop 2x', fill=(25, 35, 30))
    for i, (fid, pose, source, result, amount) in enumerate(rows):
        p = pose['anchors']['mouth']
        cx, cy = round(p['x']), round(p['y'])
        box = (cx - 55, cy - 60, cx + 30, cy + 30)
        x, y = (i % columns) * width, 30 + (i // columns) * height
        draw.text((x + 5, y + 3), f'ID {fid} / strength {amount:.2f}', fill=(25, 35, 30))
        for j, value in enumerate([source, result]):
            crop = Image.fromarray(value).crop(box).resize((170, 180), Image.Resampling.NEAREST)
            bg = Image.new('RGBA', crop.size, (239, 234, 225, 255)); bg.alpha_composite(crop)
            output.paste(bg.convert('RGB'), (x + j * 180, y + 24))
    output.save(path)


def cycle(path, rows, clip, identity, action):
    by_id = {row[0]: row for row in rows}
    entries = [by_id[fid] for fid in clip['frames']]
    bounds = [row[1]['headBounds'] for row in entries]
    x0 = max(0, min(b['x'] for b in bounds) - 8)
    y0 = max(0, min(b['y'] for b in bounds) - 8)
    x1 = min(W, max(b['x'] + b['width'] for b in bounds) + 8)
    y1 = min(H, max(b['y'] + b['height'] for b in bounds) + 8)
    width, height = x1 - x0, y1 - y0
    frames = []
    for fid, pose, source, result, amount in entries:
        image = Image.new('RGB', (2 * width, height + 32), (239, 234, 225))
        draw = ImageDraw.Draw(image)
        draw.text((6, 5), f'{identity} {action} / source | gentle / offline native crop', fill=(25, 35, 30))
        draw.text((6, 18), f'ID {fid}', fill=(25, 35, 30))
        for j, rgba in enumerate([source, result]):
            crop = Image.fromarray(rgba).crop((x0, y0, x1, y1))
            bg = Image.new('RGBA', crop.size, (239, 234, 225, 255)); bg.alpha_composite(crop)
            image.paste(bg.convert('RGB'), (j * width, 32))
        frames.append(image)
    samples = []
    for frame in frames:
        sample = frame.copy(); sample.thumbnail((160, 160)); samples.append(sample)
    training = Image.new('RGB', (160 * len(samples), 160), (239, 234, 225))
    for i, sample in enumerate(samples):
        training.paste(sample, (i * 160, 0))
    palette = training.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    indexed = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    durations = [(round((i + 1) * 100 / clip['fps']) - round(i * 100 / clip['fps'])) * 10 for i in range(len(frames))]
    options = {'loop': 0} if clip['loop'] else {}
    indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=durations,
                    disposal=2, optimize=False, **options)


def prepare(identity, prototype=False):
    target = OUT / identity
    target.mkdir(parents=True, exist_ok=True)
    registration_path = ROOT / f'artwork/kling-side-expansion/templates/{identity}.registration.json'
    ctx = load_context(identity, registration_path=registration_path)
    bank_path = ROOT / f'docs/kling-side-expansion/assets/{identity}.appearance.zip'
    with zipfile.ZipFile(bank_path) as archive:
        manifest = json.loads(archive.read('manifest.json'))
    assert manifest['sourceSha256'] == ctx.source_sha256
    assert manifest['registrationSha256'] == ctx.registration_sha256
    poses = {p['frameId']: p for p in manifest['poses']}
    head_path = ROOT / f'artwork/kling-side-expansion/hair/{identity}-head-registration.json'
    head = json.loads(head_path.read_text())
    assert head['sourceSha256'] == ctx.source_sha256
    transforms = {p['frameId']: np.array(p['featureTransform'], np.float32)[:, :2] for p in head['frames']}
    weights, retained = strengths(identity, ctx.animations)
    selected = ({0, 25, 39, 48, 57, 61, 62, 64, 67, 68, 75, 90, 97, 101}
                if identity == 'male' else {0, 20, 34, 40, 49, 55, 57, 60, 62, 63, 70, 85, 95, 101})
    frames, audit, rows = [], [], []
    for fid, source in ctx.frames.items():
        if prototype and fid not in selected:
            continue
        pose, amount = poses[fid], weights[fid]
        candidate = gentle(source, pose, ctx.registered[fid], transforms[fid], amount)
        if candidate is None:
            result = source.copy()
            frame = {'frameId': fid, 'mode': 'source', 'reason': f"Preserve original {retained.get(fid, 'uncertain')} expression."}
            owned = np.zeros((H, W), bool)
            extra = {}
        else:
            patch, owned, result, extra = candidate
            assert owned.any(), f'Empty gentle paint at {identity} {fid}'
            rgba, mask = f'patches/{fid:04d}.png', f'masks/{fid:04d}.png'
            png(target / rgba, patch)
            ownership = np.zeros_like(source)
            ownership[owned] = 255
            png(target / mask, ownership)
            frame = {'frameId': fid, 'mode': 'paint', 'rgba': rgba, 'ownership': mask}
        frames.append(frame)
        changed = np.any(source != result, axis=2)
        assert np.array_equal(changed, owned)
        audit.append({'frameId': fid, 'sourceFrame': ctx.registered[fid]['sourceFrame'],
                      'action': ctx.audit[fid]['action'], 'strength': amount,
                      'sourceRetained': candidate is None, 'changedPixels': int(owned.sum()),
                      'sourceRgbaSha256': sha(source.tobytes()), 'compositeRgbaSha256': sha(result.tobytes()),
                      'exactOutsideMouthSupport': True, 'exactAlpha': True,
                      'sourceEyesBrowsNoseEarsAndBodyExact': True, **extra})
        rows.append((fid, pose, source, result, amount))
    dump(target / 'layer.json', {'role': 'face', 'frames': frames})
    dump(target / 'audit.json', {'styleId': 'gentle-side-v1', 'name': 'Gentle smile · side',
                                'sourceSha256': ctx.source_sha256, 'registrationSha256': ctx.registration_sha256,
                                'hairBankSha256': sha(bank_path.read_bytes()), 'headRegistrationSha256': sha(head_path.read_bytes()),
                                'provenance': PROVENANCE, 'sourceRetainedClassification': PRESERVE[identity],
                                'prototype': prototype, 'frames': audit})
    sheet(target / 'difficult-mouth-comparison-2x.png', [r for r in rows if r[0] in selected], identity)
    if not prototype:
        for action in ctx.animations:
            ids = set(ctx.animations[action]['frames'])
            sheet(target / f'{action}-mouth-comparison-2x.png', [r for r in rows if r[0] in ids], identity + ' ' + action)
            cycle(target / f'{action}-mouth-comparison.gif', rows, ctx.animations[action], identity, action)
    print(identity, len(frames), 'poses;', sum(f['mode'] == 'paint' for f in frames), 'painted;', sum(f['mode'] == 'source' for f in frames), 'source-retained')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--character', choices=['male', 'female'])
    parser.add_argument('--prototype', action='store_true')
    args = parser.parse_args()
    for identity in [args.character] if args.character else ['male', 'female']:
        prepare(identity, args.prototype)
