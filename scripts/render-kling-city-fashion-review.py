#!/usr/bin/env python3
"""Review actual city-fashion downloads using the frozen warm-date renderer.

All image/GIF decoding, exact timing checks, contact-sheet extraction and palette
handling are inherited unchanged. Only collection presentation, report metadata
and labels for the original (null) face option are specialized here.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import importlib.util
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'docs/kling-collection/city-fashion-v1'
BASE_RENDERER = ROOT / 'scripts/render-kling-warm-date-review.py'
BASE_SHA = '55f1057a1a318c4515d136ed187e56b5ef869d32053bde9534e6fececd268df3'


def digest(file):
    with Path(file).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


if digest(BASE_RENDERER) != BASE_SHA:
    raise AssertionError('Frozen warm-date renderer changed; review the dependency before reuse.')
spec = importlib.util.spec_from_file_location('city_fashion_frozen_review', BASE_RENDERER)
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
base.DEST = DEST
require, relative = base.require, base.relative


class CityReview(base.Review):
    def __init__(self, index_path, audit_path, output):
        require(all(path.resolve().is_relative_to(DEST.resolve()) for path in (index_path, audit_path, output)),
                'Use only city-fashion-v1 capture, audit and review paths')
        super().__init__(index_path, audit_path, output)
        require(self.audit['format'] == 'gathria-city-fashion-independent-verification', 'Expected the completed city-fashion audit')

    def overview(self):
        super().overview()
        require(self.outputs[-1]['title'] == 'Six warm-date looks', 'Frozen overview metadata contract changed')
        self.outputs[-1]['title'] = 'Six city-fashion looks'

    def html(self):
        def href(file):
            return html.escape(os.path.relpath(ROOT / file, self.output), quote=True)

        pieces = ['''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>City fashion character collection</title><style>
body{max-width:1160px;margin:0 auto;padding:28px;background:#eee9df;color:#2e282a;font:16px/1.55 system-ui,sans-serif}
h1{font-size:32px;line-height:1.15}h2{font-size:21px}section{background:#faf8f3;border:1px solid #d9d0c3;border-radius:12px;padding:18px;margin:24px 0}
img{display:block;max-width:100%;height:auto;margin:auto}a{color:#6f4145}small{color:#655c55}.files{overflow-wrap:anywhere;font-size:13px}li{margin:12px 0}
</style><h1>City fashion character collection</h1>
<p>City utility, campus knitwear and retro bowling styles: three directions for each original Kling character. Six new clothing designs use the reviewed motion and clothing cuts. City ivory and City ink retain the original source face option; the campus and retro looks use existing refined expressions.</p>
<p>These boards use completed app downloads. Open the unchanged full-size PNGs, action GIFs and all-action CharacterPacks below for closer inspection. Comparison GIFs retain the downloaded frame order, delays and repeat behavior; jump plays once and can be reopened to replay.</p>''']
        for item in self.outputs:
            filename = Path(item['file']).name
            links = ' · '.join(f'<a href="{href(source)}">{html.escape(Path(source).name)}</a>' for source in item['sources'])
            pieces.append(f'<section><h2>{html.escape(item["title"])}</h2><a href="{filename}"><img src="{filename}" alt="{html.escape(item["title"])}" loading="lazy"></a>'
                          f'<small>{html.escape(item["presentation"])}</small><details><summary>Unchanged app downloads</summary><p class="files">{links}</p></details></section>')
        pieces.append('<section><h2>Complete character exports</h2><ul>')
        for pack in self.packs:
            self.source(pack)
            selection = ', '.join(value for value in pack['selection'].values() if value)
            appearance = pack['appearance']
            face = appearance['faceId'] or 'Original source face'
            hair = appearance['hairId'] or 'Original source hair'
            pieces.append(f'<li><a href="{href(pack["file"])}">{html.escape(pack["name"])} · all five actions</a><br><small>'
                          f'{html.escape(selection)} · {html.escape(hair)} · {html.escape(appearance["hairColor"])} · {html.escape(face)}</small></li>')
        pieces.append(f'</ul></section><p><a href="review-index.json">Review provenance</a> · <a href="{href(relative(self.audit_path))}">Independent verification</a> · '
                      f'<a href="{href(relative(self.index_path))}">Capture evidence index</a></p>')
        if self.evidence.get('sourceCaptures'):
            links = ' · '.join(f'<a href="{href(source["file"])}">{html.escape(source["character"].title())} capture</a>'
                               for source in self.evidence['sourceCaptures'])
            pieces.append(f'<p class="files">{links}<br>Two independent capture timelines are retained. Each capture closed its own editors before its own player checks; no ordering across the two captures is asserted.</p>')
        pieces.append('</html>\n')
        (self.output / 'index.html').write_text(''.join(pieces))

    def run(self):
        self.overview()
        self.faces()
        for character in ('male', 'female'):
            for action, facing in (('run', 'right'), ('run', 'left'), ('jump', 'right')):
                self.comparison(character, action, facing)
            self.run_contact(character)
        self.html()
        report = {'format': 'gathria-city-fashion-review', 'version': 1, 'actualUiDownload': False,
                  'captureIndex': relative(self.index_path), 'captureIndexSha256': digest(self.index_path),
                  'captureFinishedAt': self.evidence['finishedAt'], 'independentAudit': relative(self.audit_path),
                  'sourceCaptures': self.evidence.get('sourceCaptures', []),
                  'timelineScope': self.audit.get('timelineScope', 'One completed capture timeline.'),
                  'independentAuditSha256': digest(self.audit_path), 'rendererSha256': digest(__file__),
                  'rendererDependency': {'file': relative(BASE_RENDERER), 'sha256': BASE_SHA, 'modified': False},
                  'capturedFaces': {pack['look']: pack['appearance']['faceId'] for pack in self.packs},
                  'scope': 'Presentation derivatives of independently verified actual downloads. No new artwork, synthesized poses or timing changes.',
                  'sources': self.sources, 'outputs': self.outputs, 'budgetBytes': base.MAX_BYTES,
                  'limitations': ['GIF boards are resized and requantized; unchanged actual GIFs and native PNGs are linked for pixel inspection.',
                                  'Null face means no authored expression layer was selected; existing selected hair can cover registered forehead/hair pixels.',
                                  'Technical verification does not replace visual judgment of the clothing and styling.']}
        (self.output / 'review-index.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
        total = sum(file.stat().st_size for file in self.output.iterdir() if file.is_file())
        require(total < base.MAX_BYTES, f'Review exceeds its 70 MiB budget: {total}')
        print(json.dumps({'review': relative(self.output / 'index.html'), 'outputs': len(self.outputs),
                          'sourceDownloads': len(self.sources), 'bytes': total, 'budgetBytes': base.MAX_BYTES}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, default=DEST / 'evidence/final-v1/evidence-index.json')
    parser.add_argument('--audit', type=Path, default=DEST / 'artifact-validation.json')
    parser.add_argument('--output', type=Path, default=DEST / 'review')
    args = parser.parse_args()
    CityReview(args.index.resolve(), args.audit.resolve(), args.output.resolve()).run()


if __name__ == '__main__':
    main()
