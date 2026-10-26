#!/usr/bin/env python3
"""Arrange actual authoring-lab UI exports after their independent audit passes.

No new character art, repainting, compositing of clothing, frame interpolation or
new application renders happen here. Four GIFs are exact copies. Two PNG boards
arrange existing exported pixels and explicitly labelled integer detail crops.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import math
import os
from pathlib import Path
import textwrap
import zipfile

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'docs/kling-authoring-lab'
MATTE = (238, 233, 223)
INK = (38, 52, 47)
MAX_BYTES = 10 * 1024 * 1024


def require(value, message):
    if not value:
        raise AssertionError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def rel(path):
    return str(path.resolve().relative_to(ROOT))


def font(size=16):
    path = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    return ImageFont.truetype(str(path), size) if path.is_file() else ImageFont.load_default()


def opaque(image):
    canvas = Image.new('RGBA', image.size, MATTE + (255,))
    canvas.alpha_composite(image.convert('RGBA'))
    return canvas.convert('RGB')


class Review:
    def __init__(self, index, audit_path, output):
        raw = index.read_bytes()
        self.capture = json.loads(raw)
        c = self.capture
        require(c.get('passed') is True and c.get('finishedAt'), 'Wait for completed passing delivery evidence.')
        require(c.get('production') is True and c.get('format') == 'gathria-authoring-lab-browser-evidence', 'Wrong production capture format.')
        require(len(c['gifs']) == 8 and len(c['matrix']) == 2 and len(c['packs']) == 2 and len(c['playback']) == 20, 'Incomplete production capture.')
        require({r['key']: len(r['manifest']['frames']) for r in c['packs']} == {'male': 88, 'female': 96}, 'Unexpected source-frame inventories.')
        audit_bytes = audit_path.read_bytes()
        audit = json.loads(audit_bytes)
        require(audit.get('passed') is True and audit.get('evidenceIndexSha256') == sha(raw), 'Wait for the matching passing independent artifact audit.')
        self.audit = audit
        require(not output.exists() or not list(output.iterdir()), 'Preserve existing review; choose an empty output directory.')
        output.mkdir(parents=True, exist_ok=True)
        self.output, self.index, self.audit_path = output, index, audit_path
        self.downloads = {row['file']: row for row in c['downloads']}
        require(len(self.downloads) == len(c['downloads']), 'Duplicate download path.')
        self.sources, self.outputs, self.links = {}, [], []
        evidence_refs = {}
        if c.get('kind') == 'combined-delivery-index':
            for field in ('captureOrigin', 'playbackSupplement', 'supplementConsoleDiagnostic'):
                reference = c[field]
                path = (ROOT / reference['file']).resolve()
                require(path.is_relative_to(ROOT), 'Referenced evidence must stay inside the repository.')
                data = path.read_bytes()
                require(sha(data) == reference['sha256'], 'Referenced raw or supplemental evidence changed.')
                original = json.loads(data)
                evidence_refs[field] = {**reference, 'strictPassed': original.get('passed'), 'failure': original.get('failure')}
                self.sources[reference['file']] = {'kind': 'referenced-raw-evidence', 'sha256': sha(data), 'bytes': len(data), 'actualUiDownload': False}
                if field == 'captureOrigin':
                    require(original.get('passed') is False and reference['failure'] == original.get('failure'), 'The raw capture failure must be retained honestly.')
                    for array in ('downloads', 'screenshots', 'matrix', 'gifs', 'projects', 'packs', 'authoring', 'checks'):
                        require(c[array] == original[array], 'Combined evidence changed original exported artifacts.')
        self.metadata = {
            'format': 'gathria-authoring-lab-review', 'version': 1,
            'deliveryEvidenceIndex': rel(index), 'deliveryEvidenceIndexSha256': sha(raw),
            'captureFinishedAt': c['finishedAt'], 'captureScriptSha256': c['scriptSha256'],
            'deliveryKind': c.get('kind', 'strict-production-capture'),
            'deliveryCombinedAt': c.get('combinedAt'), 'referencedEvidence': evidence_refs,
            'sourceFrameCounts': {row['key']: len(row['manifest']['frames']) for row in c['packs']},
            'reviewScriptSha256': sha(Path(__file__).read_bytes()),
            'independentArtifactAudit': {'file': rel(audit_path), 'sha256': sha(audit_bytes)},
            'scope': 'Presentation of independently verified actual UI downloads. Existing silhouettes, original head/body pixels, frame inventory and action timing remain the source of truth. These material variants do not create new clothing cuts.',
            'sources': self.sources, 'outputs': self.outputs, 'links': self.links,
        }

    def source(self, filename):
        row = self.downloads[filename]
        require(row.get('actualUiDownload') is True and not row.get('temporary'), f'Not a retained actual UI download: {filename}')
        path = (ROOT / filename).resolve()
        require(path.is_relative_to(ROOT), 'Review source must be inside this repository.')
        data = path.read_bytes()
        require(sha(data) == row['sha256'] and len(data) == row['bytes'], f'Changed UI download: {filename}')
        self.sources[filename] = {key: row[key] for key in ('kind', 'bytes', 'sha256', 'actualUiDownload')}
        return data

    def record(self, path, **details):
        data = path.read_bytes()
        with Image.open(path) as image:
            image.load()
            dimensions = list(image.size)
        self.outputs.append({'file': rel(path), 'sha256': sha(data), 'bytes': len(data), 'dimensions': dimensions, **details})

    def animations(self):
        for key in ('male', 'female'):
            for action in ('run', 'jump'):
                rows = [r for r in self.capture['gifs'] if (r['key'], r['action'], r['facing']) == (key, action, 'right')]
                require(len(rows) == 1, f'Missing actual {key}/{action}/right GIF.')
                row = rows[0]
                data = self.source(row['file'])
                with Image.open(io.BytesIO(data)) as image:
                    size, loop = image.size, image.info.get('loop')
                    delays = []
                    for frame in range(image.n_frames):
                        image.seek(frame); image.load(); delays.append(image.info.get('duration', 0))
                    require(size == (row['width'], row['height']) and delays == row['delaysMs'] and image.n_frames == row['frames'], 'Actual GIF dimensions, frames or delays changed.')
                    require((loop == 0) == row['loop'], 'Actual GIF repeat mode changed.')
                    require(len(row['sourceSchedule']['frames']) == len(delays), 'GIF lost original source timeline positions.')
                path = self.output / f'{key}-{action}-right.gif'
                path.write_bytes(data)
                self.record(path, title=f'{key.title()} · {action} right', source=row['file'], actualUiDownload=True,
                    presentation='Byte-for-byte copy of an actual UI export; no re-encoding.',
                    frames=row['frames'], delaysMs=delays, sourceSchedule=row['sourceSchedule'],
                    originalLoop=row['loop'], outputLoop=row['loop'], scaleFromNativeExport=0.5,
                    note='The application exported this GIF at half native size on a neutral matte. One-shot jumps stay one-shot; reopen the original file to replay.')

    def native_pair(self, key):
        rows = [r for r in self.capture['matrix'] if r['key'] == key]
        require(len(rows) == 1, 'Missing native PNG matrix row.')
        stages, records = {}, {}
        for row in rows[0]['pngs']:
            require(row['action'] == 'jump' and row['frameId'] == 103 and row['facing'] == 'right', 'Different poses cannot be presented as a material-only comparison.')
            require(row['stage'] in ('before', 'after'), 'Unlabelled native PNG.')
            data = self.source(row['file'])
            image = Image.open(io.BytesIO(data)).convert('RGBA')
            require(image.size == (704, 1056), 'Expected unpadded original-appearance native PNG.')
            audited = [r for r in self.audit['pngs'] if r['file'] == row['file']]
            require(len(audited) == 1 and audited[0].get('independentCompositionExact') is True, 'Native PNG lacks exact independent compositor verification.')
            self.sources[row['file']]['decodedExportRgbaSha256'] = sha(image.tobytes())
            self.sources[row['file']]['observedPreviewCanvasRgbaSha256'] = row['uiCanvas']['rgbaSha256']
            self.sources[row['file']]['pixelEvidence'] = 'The gallery uses the independently reconstructed native export. Preview canvas readback is a separately recorded observation, not assumed bit-identical to export RGBA.'
            stages[row['stage']], records[row['stage']] = image, row
        require(set(stages) == {'before', 'after'}, 'Native comparison is incomplete.')
        require(ImageChops.difference(stages['before'].getchannel('A'), stages['after'].getchannel('A')).getbbox() is None, 'Material comparison changed silhouette/alpha.')
        before, after = records['before']['selection'], records['after']['selection']
        # Captured selection also includes appearance fields; only the top slot may change.
        require({k: v for k, v in before.items() if k != 'top'} == {k: v for k, v in after.items() if k != 'top'}, 'Before/after differs outside the selected top.')
        return stages, records

    def registration(self, key):
        catalog_path = ROOT / 'docs/kling-wardrobe/catalog.json'
        raw = catalog_path.read_bytes()
        require(sha(raw) == self.capture['catalogSha256'], 'Captured registration catalog changed.')
        catalog = json.loads(raw)
        entry = next(r for r in catalog['characters'] if r['key'] == key)
        path = ROOT / entry['registrationUrl'].lstrip('/')
        data = path.read_bytes()
        require(self.capture['inputs'].get(rel(path)) == sha(data), 'Registration is not bound to this capture.')
        self.sources[rel(path)] = {'kind': 'captured-registration', 'sha256': sha(data), 'bytes': len(data), 'actualUiDownload': False}
        return json.loads(data)

    def material_board(self):
        pairs = []
        for key in ('male', 'female'):
            images, rows = self.native_pair(key)
            registration = self.registration(key)
            pose = next(f for f in registration['frames'] if f['frameId'] == 103)
            neck = pose['points']['neck']
            # Fixed source-coordinate rectangle around each character's captured neck.
            # Anchors only choose the inspection window; they never alter artwork.
            x = max(0, min(704 - 240, math.floor(neck['x']) - 120))
            y = max(0, min(1056 - 160, math.floor(neck['y']) - 80))
            crop = (x, y, x + 240, y + 160)
            bounds = ImageChops.lighter(images['before'].getchannel('A'), images['after'].getchannel('A')).getbbox()
            require(bounds is not None, 'Native PNG is empty.')
            pairs.append((key, images, rows, crop, bounds))
        width = max(1020, max((bounds[2] - bounds[0]) * 2 + 56 for *_, bounds in pairs))
        row_heights = [(bounds[3] - bounds[1]) + 432 for *_, bounds in pairs]
        board = Image.new('RGB', (width, 82 + sum(row_heights)), MATTE)
        draw = ImageDraw.Draw(board)
        draw.text((18, 12), 'Actual material variants · native character pixels + integer 2× neckline crops', fill=INK, font=font(20))
        draw.text((18, 43), 'Pose 103 / jump / right. Same head, body, pose and alpha; only existing owned-cloth RGB changes.', fill=INK, font=font(14))
        provenance = []; y = 82
        for (key, images, rows, crop, bounds), row_height in zip(pairs, row_heights):
            name = next(r['outputName'] for r in self.capture['plan']['cases'] if r['key'] == key)
            draw.text((18, y), f'{key.title()} · {name}', fill=INK, font=font(18))
            body_width, body_height = bounds[2] - bounds[0], bounds[3] - bounds[1]
            for i, stage in enumerate(('before', 'after')):
                bx = 18 + i * (body_width + 20)
                draw.text((bx, y + 27), f'{stage.title()} · native 1×', fill=INK, font=font(14))
                board.paste(opaque(images[stage].crop(bounds)), (bx, y + 50))
                cx = 18 + i * 500
                cy = y + 50 + body_height + 14
                draw.text((cx, cy), f'{stage.title()} neckline · 2× nearest neighbor', fill=INK, font=font(13))
                board.paste(opaque(images[stage].crop(crop)).resize((480, 320), Image.Resampling.NEAREST), (cx, cy + 24))
                provenance.append({'character': key, 'stage': stage, 'file': rows[stage]['file'], 'frameId': 103, 'action': 'jump', 'facing': 'right', 'nativeCharacterCrop': list(bounds), 'characterScale': 1, 'necklineCrop': list(crop), 'necklineScale': 2, 'alphaUnchangedBetweenStages': True})
            y += row_height
        path = self.output / 'material-native-and-neckline-2x.png'; board.save(path, optimize=True)
        self.record(path, title='Material changes at native size, with 2× neckline detail', actualUiDownload=False,
            presentation='Offline arrangement of exact captured UI PNGs. Shared same-pose crops, alpha composited onto a neutral matte; no art edits.', crops=provenance, matte=list(MATTE))

    def combinations(self):
        panels, provenance = [], []
        for key in ('male', 'female'):
            check = next(r for r in self.capture['checks'] if r['key'] == key)
            raw = self.source(check['contact']['file'])
            report = json.loads(self.source(check['reviewed']['file']))
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                require(len(archive.namelist()) == len(set(archive.namelist())), 'Duplicate contact ZIP member.')
                manifest = json.loads(archive.read('manifest.json'))
                require(manifest['planId'] == report['plan']['id'] and manifest['region'] == 'full', 'Contact sheet is not the full-body verified report.')
                require(len(manifest['samples']) == 8 and len({r['caseId'] for r in manifest['samples']}) == 8, 'Expected one actual contact sample per requested look.')
                files = {f['file']: f for f in manifest['files']}
                for sample in manifest['samples']:
                    require(sample['action'] == 'jump' and sample['facing'] == 'right', 'Contact comparison mixes actions/directions.')
                    candidate = next(c for c in report['plan']['cases'] if c['id'] == sample['caseId'])
                    name = sample['after']; data = archive.read(name)
                    require(name in files and sha(data) == files[name]['sha256'] and len(data) == files[name]['bytes'], 'Contact PNG hash changed.')
                    image = Image.open(io.BytesIO(data)).convert('RGBA')
                    require(image.size == (sample['width'], sample['height']) and image.width <= 176 and image.height <= 264, 'Unexpected contact thumbnail size.')
                    hair = candidate['appearance']['hairId'] or 'original hair'
                    face = candidate['appearance']['faceId'] or 'original face'
                    bottom = candidate['selection']['bottom'] or 'original bottom'
                    label = f'{hair} / {face}'
                    panels.append((key, image, label, bottom, sample))
                    provenance.append({'character': key, 'archive': check['contact']['file'], 'archiveSha256': sha(raw), 'member': name, 'memberSha256': sha(data), 'caseId': sample['caseId'], 'selection': candidate['selection'], 'appearance': candidate['appearance'], 'frameId': sample['frameId'], 'position': sample['position'], 'startMs': sample['startMs'], 'durationMs': sample['durationMs'], 'nativeCrop': sample['nativeCrop'], 'integerReduction': sample['integerReduction'], 'displayedAtContactPixelScale': 1})
        cell_width, cell_height, margin, header = 224, 360, 16, 98
        board = Image.new('RGB', (margin * 2 + cell_width * 4, header + cell_height * 4), MATTE)
        draw = ImageDraw.Draw(board)
        draw.text((margin, 12), 'Actual combination contact exports · 8 looks per character', fill=INK, font=font(19))
        draw.text((margin, 42), 'Two bottoms × original/custom hair × original/gentle face. Each PNG is displayed unchanged.', fill=INK, font=font(13))
        draw.text((margin, 65), 'UI thumbnails use labelled integer reduction; appearance padding can change display size. Review frames only.', fill=INK, font=font(12))
        for i, (key, image, label, bottom, sample) in enumerate(panels):
            x, y = margin + (i % 4) * cell_width, header + (i // 4) * cell_height
            draw.text((x, y), f'{key.title()} {i % 8 + 1} · pose {sample["frameId"]} · ÷{sample["integerReduction"]}', fill=INK, font=font(12))
            board.paste(opaque(image), (x, y + 24))
            for j, line in enumerate(textwrap.wrap(label, width=28)[:2]):
                draw.text((x, y + 292 + j * 15), line, fill=INK, font=font(11))
            for j, line in enumerate(textwrap.wrap(bottom, width=28)[:2]):
                draw.text((x, y + 325 + j * 15), line, fill=INK, font=font(11))
        path = self.output / 'actual-combination-variations.png'; board.save(path, optimize=True)
        self.record(path, title='Sixteen actual exported combination previews', actualUiDownload=False,
            presentation='Contact ZIP after-PNG members arranged at their original exported size, unchanged except neutral matte. The labelled integer reduction can vary with appearance padding, so these thumbnails are not a same-size anatomy comparison. No additional downsampling or rendering.', samples=provenance, matte=list(MATTE))

    def gallery(self):
        def link(path, label):
            path = (ROOT / path).resolve()
            require(path.is_relative_to(ROOT) and path.is_file(), f'Missing gallery link: {path}')
            filename = rel(path)
            if filename not in self.links: self.links.append(filename)
            href = html.escape(os.path.relpath(path, self.output), quote=True)
            return f'<a href="{href}">{html.escape(label)}</a>'
        sections = []
        for row in self.outputs:
            name = Path(row['file']).name
            desc = row['presentation']
            if name.endswith('.gif'):
                desc += ' ' + ('This source action loops.' if row['originalLoop'] else 'This source action is one-shot; open or refresh the linked GIF to replay it.')
            sections.append(f'<section><h2>{html.escape(row["title"])}</h2><p>{html.escape(desc)}</p><a href="{html.escape(name,quote=True)}"><img src="{html.escape(name,quote=True)}" alt="{html.escape(row["title"],quote=True)}" loading="lazy"></a></section>')
        groups = []
        for key in ('male', 'female'):
            items = []
            for row in self.capture['downloads']:
                if row.get('key') == key and not row.get('temporary'):
                    self.source(row['file'])
                    items.append('<li>' + link(row['file'], Path(row['file']).name) + '</li>')
            shots = [row for row in self.capture['screenshots'] if Path(row['file']).name.startswith(key)]
            for row in shots:
                data = (ROOT / row['file']).read_bytes()
                require(sha(data) == row['sha256'] and len(data) == row['bytes'], 'Workflow screenshot changed.')
                self.sources[row['file']] = {'kind': 'actual-ui-screenshot', 'sha256': sha(data), 'bytes': len(data), 'actualUiDownload': False}
                with Image.open(io.BytesIO(data)) as screenshot:
                    tall_inspector = 'combination-inspector' in Path(row['file']).name and screenshot.height > screenshot.width * 1.5
                limitation = ' — this tall UI capture may include dialog clipping or the underlying editor; use native PNG/contact downloads for unobstructed full-body inspection.' if tall_inspector else ''
                items.append('<li>' + link(row['file'], 'UI screenshot: ' + Path(row['file']).name) + html.escape(limitation) + '</li>')
            check = next(r for r in self.capture['checks'] if r['key'] == key)
            review_file = check['visualReview']['file']
            data = (ROOT / review_file).read_bytes()
            require(sha(data) == check['visualReview']['sha256'], 'Recorded visual review note changed.')
            self.sources[review_file] = {'kind': 'captured-human-review-note', 'sha256': sha(data), 'bytes': len(data), 'actualUiDownload': False}
            note = json.loads(data)
            items.append('<li>' + link(review_file, 'Recorded manual observation') + ': ' + html.escape(note['note']) + '</li>')
            coverage = check['coverage']
            groups.append(f'<section><h2>{key.title()} downloads and review trail</h2><p>{coverage["selectedCombinations"]}/{coverage["totalCombinations"]} requested looks; {coverage["plannedPositions"]}/{coverage["totalPositions"]} static samples. Five actions and both directions were sampled. Uninspected frames and combinations are not visually approved.</p><ul>{"".join(items)}</ul></section>')
        # Retained project ZIPs, if root has copied exact UI downloads, are links only.
        delivered_path = BASE / 'projects/delivered-projects.json'
        if delivered_path.is_file():
            delivered_data = delivered_path.read_bytes()
            self.sources[rel(delivered_path)] = {'kind': 'ui-project-delivery-record', 'sha256': sha(delivered_data), 'bytes': len(delivered_data), 'actualUiDownload': False}
            project_links = []
            for path in sorted(delivered_path.parent.glob('*.zip')):
                data = path.read_bytes()
                originals = [row for row in self.capture['projects'] if row['sha256'] == sha(data) and row['bytes'] == len(data)]
                require(len(originals) == 1, 'Retained project is not an exact captured UI download.')
                self.sources[rel(path)] = {'kind': 'exact-retained-ui-project', 'sha256': sha(data), 'bytes': len(data), 'actualUiDownload': True, 'originalCapturePath': originals[0]['file']}
                project_links.append('<li>' + link(rel(path), path.name) + '</li>')
            groups.append('<section><h2>Saved wardrobe projects</h2><p>' + link(rel(delivered_path), 'Exact UI project delivery record') + '</p><ul>' + ''.join(project_links) + '</ul></section>')
        evidence = link(rel(self.index), 'Delivery evidence index') + ' · ' + link(rel(self.audit_path), 'Independent artifact audit') + ' · ' + link('scripts/render-kling-authoring-review.py', 'Reproducible gallery script')
        playback_note = ''
        if self.capture.get('kind') == 'combined-delivery-index':
            references = ' · '.join(link(self.capture[field]['file'], label) for field, label in (
                ('captureOrigin', 'Original strict capture record'),
                ('playbackSupplement', 'Native frame check and three real-time plays'),
                ('supplementConsoleDiagnostic', 'Supplemental console diagnostic')))
            playback_note = '<p>The raw capture missed observation of female jump/left position 3 during a browser sampling gap. A separately recorded native-frame check and three real-time plays cover that position; all three plays observed the full jump. The supplemental strict assertion also recorded a missing optional favicon. Both raw failure records and the exact diagnostic remain available: ' + references + '.</p>'
        title = 'Kling clothing authoring and combination review'
        page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title><style>body{{font:16px/1.6 system-ui,sans-serif;background:#f6f3eb;color:#294135;margin:0}}main{{max-width:1120px;margin:auto;padding:24px}}h1{{font-size:2rem;line-height:1.2}}section{{margin:28px 0;padding:18px;background:#fffdf8;border:1px solid #d5d9cb;border-radius:12px}}img{{display:block;max-width:100%;height:auto;background:#eee9df}}a{{color:#245c72}}li{{overflow-wrap:anywhere}}.limits{{padding:18px;background:#f4ead9;border-radius:10px}}</style><main><h1>{title}</h1><p>Two material variants made through the real clothing wizard, then inspected with the real combination checker and exported through the application.</p><p class="limits">This batch reuses existing garment shapes: sand male shirt and sage female top. It does not create new cuts or repair all neckline artifacts. Existing cool teal creases and stepped sleeve edges remain in the male material variant. The female base retains its previously reviewed partial gray-fringe limitations. Automated checks establish data and playback behavior; the recorded manual observations and actual pictures describe visual limits.</p><p>{evidence} · <a href="index.json">Gallery provenance</a></p>{playback_note}{''.join(sections)}{''.join(groups)}<p>GIFs are unchanged actual downloads; PNG boards are labeled offline arrangements of actual exports. Original left-facing GIFs, native PNGs, contact archives and reports are linked above. Saved wardrobe reopening was exercised during capture; the large self-contained project ZIPs remained temporary and are not included. Repeating the full independent audit after cloning requires a fresh production capture.</p></main></html>'''
        path = self.output / 'index.html'; path.write_text(page)
        require(len(self.outputs) == 6, 'Expected exactly six gallery visuals.')
        total = sum(row['bytes'] for row in self.outputs)
        require(total < MAX_BYTES, f'Gallery visuals exceed 10 MiB: {total}. Preserve captures; revise presentation, never silently recompress actual GIFs.')
        self.metadata['visualCount'], self.metadata['visualBytes'] = len(self.outputs), total
        self.metadata['galleryHtml'] = {'file': rel(path), 'sha256': sha(path.read_bytes())}
        (self.output / 'index.json').write_text(json.dumps(self.metadata, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, default=BASE / 'evidence/final-v3/delivery-index.json')
    parser.add_argument('--audit', type=Path, default=BASE / 'artifact-validation.json')
    parser.add_argument('--output', type=Path, default=BASE / 'review')
    args = parser.parse_args()
    review = Review(args.index.resolve(), args.audit.resolve(), args.output.resolve())
    review.animations(); review.material_board(); review.combinations(); review.gallery()
    print(json.dumps({'passed': True, 'gallery': rel(review.output / 'index.html'), 'visualCount': len(review.outputs), 'visualBytes': sum(r['bytes'] for r in review.outputs), 'sources': len(review.sources), 'links': len(review.links)}, indent=2))


if __name__ == '__main__':
    main()
