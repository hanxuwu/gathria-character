#!/usr/bin/env python3
"""New city cloth donors using the unchanged, reviewed warm-date sampler.

The imported implementation retains its repaired waist overlap and hem fitting.
This wrapper supplies new traced artwork, output paths and accurate provenance;
it does not modify the shared implementation or Coral V9's RGBA ownership.
"""
import importlib.util
import json
from pathlib import Path
import sys

import numpy as np
from scipy import ndimage as nd

from kling_wardrobe_common import ROOT, sha

SOURCE = ROOT / 'artwork/kling-collection/source/city-fashion-v1'
OUT = ROOT / 'artwork/kling-collection/prepared/city-fashion-v1/female'
SAMPLER = ROOT / 'scripts/prepare-kling-warm-date-female.py'


def main():
    spec = importlib.util.spec_from_file_location('city_female_reviewed_sampler', SAMPLER)
    fitting = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fitting)
    fitting.SOURCE = SOURCE
    fitting.OUT = OUT
    fitting.SPEC = json.loads((SOURCE / 'female-donors.json').read_text())
    sampler_hash = sha(SAMPLER.read_bytes())
    donor_hash = sha((SOURCE / fitting.SPEC['image']).read_bytes())
    serialize = fitting.json_bytes
    dress_paint = fitting.paint_frame
    definitions = fitting.SPEC['items']

    def paint(item, original, base, owned, points, tank, shorts):
        if definitions[item]['slot'] != 'top':
            return dress_paint(item, original, base, owned, points, tank, shorts)
        # The reviewed separate-top baseline has no skirt. Register only the
        # new painted utility cloth inside its exact source-bound ownership.
        d = definitions[item]
        active = owned & (base[:, :, 3] > 0)
        controls = fitting.paint_controls(active, points)
        wl, wr = points['waistLeft'], points['waistRight']
        xx, yy = fitting.XX, fitting.YY
        waist = wl['y'] + (xx - wl['x']) * (wr['y'] - wl['y']) / max(1, wr['x'] - wl['x']) + 10
        top, dip_y, dip_x = controls['top'], controls['dipY'], controls['dipX']
        lower = np.clip((yy - dip_y) / np.maximum(45, waist - dip_y), 0, 1)
        upper = np.clip((yy - top) / max(20, dip_y - top), 0, 1)
        donor_x, donor_y = d['neckDip']
        ty = np.where(yy < dip_y, d['neckTop'] + upper * (donor_y - d['neckTop']), donor_y + lower * (d['waist'][2] - donor_y))
        center = dip_x * (1 - lower) + (wl['x'] + wr['x']) / 2 * lower
        tx = donor_x * (1 - lower) + (d['waist'][0] + d['waist'][1]) / 2 * lower + (xx - center) / max(110, wr['x'] - wl['x']) * d['torsoWidth']
        color = fitting.sample(item, 'torso', tx, ty)
        lum = original[:, :, :3].astype(np.float32) @ np.asarray([.2126, .7152, .0722], np.float32)
        light = np.clip(lum / max(1, float(np.median(lum[active]))), .45, 1.35)
        color *= (.86 + .14 * light)[:, :, None]
        boundary = active & (nd.distance_transform_edt(active) <= 1.5) & (lum < 60)
        color[boundary] = original[boundary, :3]
        result = base.copy()
        result[active, :3] = np.rint(np.clip(color[active], 0, 255)).astype(np.uint8)
        assert np.array_equal(result[:, :, 3], base[:, :, 3])
        assert np.array_equal(result[~active], base[~active])
        return result, controls

    def city_metadata(value):
        if isinstance(value, dict) and value.get('format') == 'gathria-sprite-garment' and value.get('id') in fitting.SPEC['items']:
            value = dict(value)
            value['provenance'] = (
                'OpenAI image generation 2026-10-27, new city fashion cloth donor '
                f'artwork/kling-collection/source/city-fashion-v1/female-designs.png SHA256 {donor_hash}. '
                'Exact prompt and manually traced cloth-only donor boundaries are retained beside the source PNG. '
                f'RGB-only derivative of immutable {fitting.BASE.stem} SHA256 {sha(fitting.BASE.read_bytes())}. '
                'All 96 source pose bindings, atlas geometry, binary ownership PNGs and every alpha byte remain exact; '
                'generated heads, skin, hands, limbs, shoes and background are discarded. '
                'New painted zipper/pocket, periwinkle piping and large cherry gingham/bow details are sampled only '
                'inside the selected existing sleeveless top or A-line dress cut. No skin-color classifier, artificial polygon garment, '
                'new anatomy, source rescaling, source motion changes or runtime generation. '
                'The completed warm-date donor sampler is imported without modification, including its reviewed '
                'skirt-side material and detached-waistband prevention. '
                f'Sampler SHA256 {sampler_hash}; authoring scripts/prepare-kling-city-fashion-female.py.')
        return serialize(value)

    fitting.json_bytes = city_metadata
    fitting.paint_frame = paint
    original_args = sys.argv.copy()
    selected = [original_args[original_args.index('--item') + 1]] if '--item' in original_args else list(definitions)
    assert all(item in definitions for item in selected)
    prototype = '--prototype' in original_args
    report_path = OUT / ('prototype-audit.json' if '--prototype' in sys.argv else 'asset-audit.json')
    combined = None
    for item in selected:
        fitting.BASE = ROOT / definitions[item]['sourceTemplate']
        sys.argv = [original_args[0], '--item', item] + (['--prototype'] if prototype else [])
        fitting.main()
        report = json.loads(report_path.read_text())
        baseline = {'path': report['base'], 'sha256': report['baseSha256'], 'slot': definitions[item]['slot']}
        if combined is None:
            combined = {k: v for k, v in report.items() if k not in ('base', 'baseSha256', 'items')}
            combined.update(baselines={}, items=[])
        combined['baselines'][item] = baseline
        entry = report['items'][0]
        entry.update(slot=baseline['slot'], base=baseline['path'], baseSha256=baseline['sha256'])
        combined['items'].append(entry)
    sys.argv = original_args
    report = combined
    report['sampler'] = {'path': str(SAMPLER.relative_to(ROOT)), 'sha256': sampler_hash, 'modified': False}
    report['authoringScript'] = {'path': str(Path(__file__).resolve().relative_to(ROOT)), 'sha256': sha(Path(__file__).read_bytes())}
    assert sha(SAMPLER.read_bytes()) == sampler_hash
    report_path.write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
