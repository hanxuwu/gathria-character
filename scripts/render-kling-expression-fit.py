#!/usr/bin/env python3
"""Arrange completed production downloads into eight traceable review visuals.

This creates presentation derivatives, never character artwork or browser-export
evidence. GIF pixels are placed at their downloaded scale and requantized once;
PNG/pack crops use native pixels and an explicitly labeled neutral matte.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import os
from pathlib import Path
import zipfile

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INDEX = ROOT / 'docs/kling-expression-fit/evidence/final-v1/evidence-index.json'
DEFAULT_OUTPUT = ROOT / 'docs/kling-expression-fit/review'
MATTE = (238, 233, 223)
INK = (36, 38, 43)
MAX_BYTES = 20 * 1024 * 1024
FACE_IDS = (None, 'gentle', 'gentle-v2', 'joyful', 'joyful-v2')
FACE_LABELS = ('Natural', 'Gentle v1', 'Gentle v2', 'Joyful v1', 'Joyful v2')
FACE_CROPS = {'male': (282, 315, 582, 545), 'female': (282, 292, 582, 522)}
# Source coordinates from the reviewed protected-neckline disclosure. These
# rectangles select actual download pixels; no overlay changes the artwork.
NECK_CROPS = {89: (275, 534, 475, 699), 90: (275, 445, 475, 610),
             93: (275, 348, 475, 513), 101: (275, 422, 475, 587),
             102: (275, 486, 475, 651), 103: (275, 543, 475, 708)}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def rel(path):
    return str(path.resolve().relative_to(ROOT))


def font(size=18):
    path = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    return ImageFont.truetype(str(path), size) if path.is_file() else ImageFont.load_default()


def opaque(image):
    output = Image.new('RGBA', image.size, MATTE + (255,))
    output.alpha_composite(image.convert('RGBA'))
    return output.convert('RGB')


class Review:
    def __init__(self, index, output):
        self.index, self.output = index, output
        data = index.read_bytes()
        self.capture = json.loads(data)
        require(self.capture.get('passed') is True and self.capture.get('finishedAt'), 'Wait for a passing completed capture.')
        require(self.capture.get('production') is True and self.capture['format'] == 'gathria-expression-fit-browser-evidence', 'Expected the final production expression/fit capture.')
        require(len(self.capture['matrix']) == 24 and len(self.capture['gifs']) == 30 and len(self.capture['packs']) == 3, 'Incomplete review matrix.')
        require(sum(row['kind'] == 'png' for row in self.capture['downloads']) == 122, 'Expected all 122 actual native PNGs.')
        require(not output.exists() or not list(output.iterdir()), 'Preserve prior review; choose an empty output directory.')
        self.downloads = {row['file']: row for row in self.capture['downloads']}
        require(len(self.downloads) == len(self.capture['downloads']), 'Duplicate actual-download paths.')
        self.sources, self.outputs = {}, []
        self.metadata = {'format': 'gathria-expression-fit-review', 'version': 1,
                         'captureIndex': rel(index), 'captureIndexSha256': sha(data),
                         'captureFinishedAt': self.capture['finishedAt'],
                         'captureScriptSha256': self.capture['scriptSha256'],
                         'reviewScriptSha256': sha(Path(__file__).read_bytes()),
                         'catalogSha256': self.capture['catalogSha256'],
                         'actualUiDownload': False,
                         'scope': 'Offline arrangements of hash-checked actual production downloads; no new authoring or browser-export claims.',
                         'sources': self.sources, 'outputs': self.outputs}
        audit_path = ROOT / 'docs/kling-expression-fit/artifact-validation.json'
        if audit_path.is_file():
            audit_bytes = audit_path.read_bytes()
            audit = json.loads(audit_bytes)
            require(audit.get('passed') is True and audit['evidenceIndexSha256'] == sha(data), 'Independent artifact audit belongs to a different/incomplete capture.')
            self.metadata['independentArtifactAudit'] = {'file': rel(audit_path), 'sha256': sha(audit_bytes)}
        self.padding = {row['character']: row['padding'] for row in self.capture['packs']}
        output.mkdir(parents=True, exist_ok=True)

    def source(self, filename):
        row = self.downloads[filename]
        require(row.get('actualUiDownload') is True, f'Not an actual UI download: {filename}')
        path = (ROOT / filename).resolve()
        data = path.read_bytes()
        require(sha(data) == row['sha256'] and len(data) == row['bytes'], f'Captured download changed: {filename}')
        self.sources[filename] = {key: row[key] for key in ('kind', 'bytes', 'sha256', 'actualUiDownload')}
        return data

    def row(self, **selection):
        matches = [row for row in self.capture['matrix'] if all(row.get(key) == value for key, value in selection.items())]
        require(len(matches) == 1, f'Ambiguous/missing captured row: {selection}')
        return matches[0]

    def png(self, row, action, frame):
        matches = [p for p in row['pngs'] if p['action'] == action and p['frameId'] == frame and p['facing'] == 'right']
        require(len(matches) == 1, f'Missing actual PNG: {row["key"]}/{action}/{frame}')
        entry = matches[0]
        image = Image.open(io.BytesIO(self.source(entry['file']))).convert('RGBA')
        return image, entry['file']

    def crop(self, row, action, frame, bounds):
        image, filename = self.png(row, action, frame)
        p = self.padding[row['character']]
        box = (bounds[0]+p['left'], bounds[1]+p['top'], bounds[2]+p['left'], bounds[3]+p['top'])
        require(box[0] >= 0 and box[1] >= 0 and box[2] <= image.width and box[3] <= image.height, 'Native crop exceeds the actual export.')
        return opaque(image.crop(box)), {'file': filename, 'sourceFrameId': frame, 'sourceCoordinateCrop': bounds,
                                        'exportCoordinateCrop': box, 'kind': 'actual-png-crop'}

    def pack_crop(self, character, key, frame_id, bounds):
        pack = next(row for row in self.capture['packs'] if row['character'] == character and row['key'] == key)
        data = self.source(pack['file'])
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            manifest = json.loads(archive.read('manifest.json'))
            require(manifest == pack['manifest'], 'Captured pack manifest changed.')
            frame = next(f for f in manifest['frames'] if f['id'] == frame_id)
            page = [manifest['spritesheet'], *manifest.get('additionalSheets', [])][frame.get('page', 0)]
            atlas = Image.open(io.BytesIO(archive.read(page['file']))).convert('RGBA')
            p = pack['padding']
            require(bounds[0]+p['left'] >= 0 and bounds[1]+p['top'] >= 0 and
                    bounds[2]+p['left'] <= frame['width'] and bounds[3]+p['top'] <= frame['height'],
                    'Pack crop exceeds its selected actual frame.')
            box = (frame['x']+bounds[0]+p['left'], frame['y']+bounds[1]+p['top'],
                   frame['x']+bounds[2]+p['left'], frame['y']+bounds[3]+p['top'])
            image = opaque(atlas.crop(box))
        return image, {'file': pack['file'], 'sourceFrameId': frame_id, 'sourceCoordinateCrop': bounds,
                       'atlasFile': page['file'], 'atlasCoordinateCrop': box, 'kind': 'actual-characterpack-frame-crop'}

    def gif(self, row, action, facing='right'):
        matches = [g for g in self.capture['gifs'] if g['key'] == row['key'] and g['action'] == action and g['facing'] == facing]
        require(len(matches) == 1, f'Missing actual GIF: {row["key"]}/{action}/{facing}')
        entry = matches[0]
        frames, delays = [], []
        with Image.open(io.BytesIO(self.source(entry['file']))) as image:
            loop = image.info.get('loop')
            for position in range(image.n_frames):
                image.seek(position)
                frames.append(image.convert('RGB'))
                delays.append(image.info.get('duration', 0))
        require(delays == entry['delaysMs'] and len(frames) == entry['frames'], 'Actual GIF frame count/durations changed.')
        require((loop == 0) == entry['loop'], 'Actual GIF loop flag changed.')
        return {'row': entry, 'frames': frames, 'delays': delays, 'sourceLoop': loop}

    def record(self, path, **details):
        data = path.read_bytes()
        with Image.open(path) as image:
            dimensions = list(image.size)
        self.outputs.append({'file': rel(path), 'sha256': sha(data), 'bytes': len(data),
                             'dimensions': dimensions, 'actualUiDownload': False,
                             'kind': 'offline-review-arrangement', **details})

    def animation(self, name, title, panels, segments, columns, crop=None):
        """Keep each original action's order and durations; label preview looping."""
        decoded = [[self.gif(row, action) for _, row in panels] for action in segments]
        frames, delays, source_steps, segment_notes = [], [], [], []
        margin, gap, header, label_height, footer = 12, 10, 46, 28, 28
        for segment, action in zip(decoded, segments):
            first = segment[0]
            schedule = first['row']['sourceSchedule']
            require(all(part['delays'] == first['delays'] and part['row']['sourceSchedule'] == schedule for part in segment), 'Comparison action clocks differ.')
            size = first['frames'][0].size if crop is None else (crop[2]-crop[0], crop[3]-crop[1])
            require(all(f.size == first['frames'][0].size for part in segment for f in part['frames']), 'GIF panel sizes differ.')
            rows = (len(panels)+columns-1)//columns
            width = margin*2 + columns*size[0] + (columns-1)*gap
            height = header + rows*(label_height+size[1]+gap) + footer
            start = len(frames)
            for position, duration in enumerate(first['delays']):
                canvas = Image.new('RGB', (width, height), MATTE)
                draw = ImageDraw.Draw(canvas)
                draw.text((margin, 8), title, fill=INK, font=font(18))
                for index, (label, _) in enumerate(panels):
                    x = margin + (index % columns)*(size[0]+gap)
                    y = header + (index // columns)*(label_height+size[1]+gap)
                    draw.text((x+2, y+2), label, fill=INK, font=font(15))
                    image = segment[index]['frames'][position]
                    canvas.paste(image if crop is None else image.crop(crop), (x, y+label_height))
                draw.text((margin, height-footer+3), f'{action} · native frame {schedule["frames"][position]} · step {position+1}/{len(first["delays"])} · {duration} ms', fill=INK, font=font(14))
                frames.append(canvas)
                delays.append(duration)
                source_steps.append({'action': action, 'position': position, 'frameId': schedule['frames'][position], 'durationMs': duration})
            segment_notes.append({'action': action, 'firstOutputFrame': start, 'frameCount': len(first['frames']),
                                  'originalLoopFlags': [part['sourceLoop'] for part in segment],
                                  'sources': [part['row']['file'] for part in segment]})
        require(len({frame.size for frame in frames}) == 1, 'Montage segments have different geometry.')
        # GIF has one presentation palette. Original download bytes remain
        # linked separately; panel coordinates and scale are never resampled.
        samples = [frame.resize((max(1, frame.width//4), max(1, frame.height//4)), Image.Resampling.BOX) for frame in frames]
        sample = Image.new('RGB', (samples[0].width, sum(f.height for f in samples)), MATTE)
        y = 0
        for item in samples:
            sample.paste(item, (0, y))
            y += item.height
        palette = sample.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
        indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
        path = self.output / name
        indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=delays, loop=0, disposal=1, optimize=False)
        with Image.open(path) as check:
            observed = []
            for position in range(check.n_frames):
                check.seek(position)
                observed.append(check.info.get('duration', 0))
            require(observed == delays and check.info.get('loop') == 0, 'Presentation changed GIF frame count/durations.')
        self.record(path, title=title, panels=[label for label, _ in panels], columns=columns,
                    segments=segment_notes, frameSteps=source_steps, frames=len(frames), delaysMs=delays,
                    cropInDownloadedGifPixels=crop, scaleFromDownloadedGif=1, scaleFromNativeExport=.5,
                    outputLoop=0, montage=len(segments)>1,
                    playbackNote='Review repeats the complete action sequence. Original one-shot jump/celebrate GIFs remain one-shot; frames and delays within every segment are unchanged.',
                    colorNote='Decoded actual GIF pixels placed at 1:1, then requantized into one shared review palette. No pose or feature retouching.')

    def details(self):
        sections = []
        for character in ('male', 'female'):
            cells = []
            for label, face in zip(FACE_LABELS, FACE_IDS):
                row = self.row(character=character, look='day', faceId=face)
                crop, provenance = self.crop(row, 'idle', 0, FACE_CROPS[character])
                cells.append((f'{character.title()} · {label} · frame 0', crop, provenance))
            sections.append((f'{character.title()} expressions · native PNG face details', cells))
        cells = []
        for action, frame, bounds in [('run', 59, (220, 470, 520, 680)), ('celebrate', 78, (210, 460, 510, 670))]:
            for version in ('v1', 'v2'):
                row = self.row(key=f'male-midnight-sailor-{version}-gentle-v2')
                crop, provenance = self.crop(row, action, frame, bounds)
                cells.append((f'Sailor {version} · {action} {frame}', crop, provenance))
        sections.append(('Male shoulder/collar · matched actual PNG details', cells))
        cells = []
        female_key = 'female-plum-pintuck-top-v1-navy-shorts-joyful-v2'
        row = self.row(key=female_key)
        for frame, bounds in NECK_CROPS.items():
            if frame in (90, 93):
                crop, provenance = self.pack_crop('female', female_key, frame, bounds)
            else:
                crop, provenance = self.crop(row, 'jump', frame, bounds)
            kind = 'pack' if frame in (90, 93) else 'PNG'
            cells.append((f'Plum · frame {frame} · {kind}', crop, provenance))
        sections.append(('Known limit: original gray neckline remains in protected source pixels, including frame 103', cells))
        margin, gap, section_header, label_height = 14, 10, 34, 28
        width = max(sum(image.width for _, image, _ in cells)+gap*(len(cells)-1) for _, cells in sections)+2*margin
        height = 52 + sum(section_header+label_height+max(image.height for _, image, _ in cells)+18 for _, cells in sections)
        canvas = Image.new('RGB', (width, height), MATTE)
        draw = ImageDraw.Draw(canvas)
        draw.text((margin, 12), 'Actual exported pixels · native 1× detail crops · no retouching', fill=INK, font=font(21))
        y, crops = 52, []
        for title, cells in sections:
            draw.text((margin, y+5), title, fill=INK, font=font(17))
            x = margin
            for label, image, provenance in cells:
                draw.text((x, y+section_header+3), label, fill=INK, font=font(14))
                canvas.paste(image, (x, y+section_header+label_height))
                crops.append({'label': label, **provenance})
                x += image.width+gap
            y += section_header+label_height+max(image.height for _, image, _ in cells)+18
        for scale in (1, 2):
            image = canvas.copy() if scale == 1 else canvas.resize((canvas.width*2, canvas.height*2), Image.Resampling.NEAREST)
            heading = ImageDraw.Draw(image)
            heading.rectangle((0, 0, image.width, 51*scale), fill=MATTE)
            heading.text((margin*scale, 12*scale), f'Actual exported pixels · detail crops at {scale}× native · no retouching', fill=INK, font=font(21*scale))
            path = self.output / f'actual-details-{scale}x.png'
            image.save(path, optimize=True)
            self.record(path, title=f'Native detail crops at {scale}×', scaleFromNativeExport=scale,
                        resize='none' if scale == 1 else 'integer nearest-neighbor; includes labels',
                        matte=list(MATTE), crops=crops,
                        note='Alpha composited on neutral matte. Gray neckline fragments are retained source/protection limits, not claimed fixed. PNG and CharacterPack crop origins are explicit.')

    def gallery(self):
        def url(path):
            return html.escape(os.path.relpath(ROOT/path, self.output), quote=True)

        def link(path, text):
            return f'<a href="{url(path)}">{html.escape(text)}</a>'

        descriptions = {
            'male-gentle-run.gif': 'Natural, retained Gentle v1 and additive Gentle v2 use the same current everyday outfit and native run clock. The GIF is half native size.',
            'female-gentle-run.gif': 'The same five-expression capture supplies this three-way comparison. Gentle v1 is retained as its old style; Gentle v2 changes the mouth while protecting the original eyes.',
            'joyful-jump.gif': 'Male above, female below. Fixed head/neck crops from the half-size actual GIFs; no resize. The one-shot jump repeats here for comparison. Only native poses 88–91 and 100–103 have refined mouth softness.',
            'sailor-run.gif': 'Same Airy tousle, Gentle v2 and trousers. V1 and v2 run on the same source clock; this is a half-native presentation.',
            'sailor-jump-celebrate.gif': 'A labeled jump → celebrate review montage repeats. Each original one-shot clip keeps its complete frame order and durations; the source action schedules are not joined in the exported packs.',
            'female-plum-run.gif': 'The new separate plum top with retained navy and ochre shorts, Ribbon pony and Joyful v2. Original run timing is synchronized; this is a half-native presentation.',
        }
        figures = []
        for output in self.outputs:
            name = Path(output['file']).name
            if name.endswith('.gif'):
                source_links = []
                for segment in output['segments']:
                    for i, path in enumerate(segment['sources']):
                        source_links.append(link(path, f'{output["panels"][i]} · original {segment["action"]} GIF'))
                figures.append(f'<section><h2>{html.escape(output["title"])}</h2><p>{html.escape(descriptions[name])}</p><a href="{name}"><img src="{name}" alt="{html.escape(output["title"], quote=True)}" loading="lazy"></a><p class="downloads">'+ ' · '.join(source_links)+'</p></section>')
        crop_inputs = next(row['crops'] for row in self.outputs if Path(row['file']).name == 'actual-details-1x.png')
        crop_links = ''.join('<li>'+link(row['file'], row['label']+' · original '+('CharacterPack' if row['kind'] == 'actual-characterpack-frame-crop' else 'PNG'))+'</li>' for row in crop_inputs)
        details = '<section><h2>Native pixels and the remaining neckline limit</h2><p>The same actual face, shoulder and neckline crops are available at native size and integer 2×. Frame 103 is shown alongside 89, 90, 93, 101 and 102: original gray neckline fragments remain where the source protection contract blocks new cloth. Some legacy shoulder/boundary flecks also remain. These are visible limitations of the additive plum review garment.</p><p><a href="actual-details-1x.png">Open native 1× board</a> · <a href="actual-details-2x.png">Open integer 2× board</a></p><a href="actual-details-1x.png"><img src="actual-details-1x.png" alt="Actual native face, shoulder and protected neckline crops, including female frame 103" loading="lazy"></a><details><summary>Original PNG and CharacterPack crop inputs</summary><ul>'+crop_links+'</ul></details></section>'
        packs, delivered_links = [], []
        project_dir = ROOT / 'docs/kling-expression-fit/projects'
        for pack in self.capture['packs']:
            project = next(row for row in self.capture['projects'] if row['key'] == pack['key'])
            delivered = [p for p in project_dir.glob('*.zip') if sha(p.read_bytes()) == project['sha256']] if project_dir.exists() else []
            project_link = link(rel(delivered[0]), 'Editable project download') if delivered else 'Saved/reopened project verified; temporary download is not published here.'
            if delivered:
                delivered_links.append(rel(delivered[0]))
            packs.append('<li>'+html.escape(pack['key'])+'<br>'+link(pack['file'], 'Actual CharacterPack download')+' · '+project_link+'</li>')
        self.metadata['deliveredProjectLinks'] = delivered_links
        page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kling expression and fit review</title><style>body{max-width:1320px;margin:32px auto;padding:0 20px;background:#f6f1e7;color:#24262b;font:16px/1.5 system-ui,sans-serif}h1{font-size:30px}h2{font-size:22px;margin-top:32px}a{color:#215d77}img{display:block;max-width:100%;height:auto;background:#eee9df;border:1px solid #d9d3c5}section{padding:8px 0 22px;border-bottom:1px solid #d9d3c5}.downloads{font-size:14px}li{margin:12px 0}.note{padding:16px;background:#fff9ed;border-left:4px solid #956d42}</style><main><h1>Kling expression and fit review</h1><p>Same-build comparisons from actual production PNG, GIF and CharacterPack downloads. These eight images are offline review arrangements; they are not additional application exports. Character pixels are not retouched. GIFs use the application's half-native matte export and a shared review palette; original download links preserve the untouched bytes.</p><p class="note">Natural remains the original source face. Gentle v1 and Joyful v1 remain available beside the additive v2 choices. Old banks and saved-project bytes stay intact; updating appearance requires the existing explicit copy flow. Original celebration laughter remains source artwork.</p>'''
        page += ''.join(figures[:3]) + details + ''.join(figures[3:])
        page += '<section><h2>Actual exports and saved projects</h2><p>All three packs were exported after an exact project reopen and loaded in a separate player after the editors closed. Download links below are original artifacts, separate from the review montages.</p><ul>'+''.join(packs)+'</ul></section>'
        page += '<section><h2>Evidence and context</h2><p>'+ ' · '.join([
            link(rel(self.index), 'Browser capture index'), link('docs/kling-expression-fit/artifact-validation.json', 'Independent artifact audit'),
            link('docs/kling-expression-refined/asset-validation.json', 'All-184-pose expression bank audit'),
            link('docs/kling-expression-refined/README.md', 'Additive bank compatibility'),
            link('docs/kling-expression-shirt/review/index.html', 'Previous release review'),
            '<a href="index.json">Review input hashes, crops and frame timings</a>'])+'</p><p>The current everyday presets are day-soft-cuff (male) and day-smooth-waist (female). The plum top is an additive review garment with the disclosed protected neckline limit; no default wardrobe replacement or general cloth/face editor is claimed. Technical reconstruction and this review do not establish user artistic acceptance.</p></section></main></html>\n'
        (self.output / 'index.html').write_text(page)

    def render(self):
        for character in ('male', 'female'):
            panels = [(label, self.row(character=character, look='day', faceId=face))
                      for label, face in [('Natural', None), ('Gentle v1', 'gentle'), ('Gentle v2', 'gentle-v2')]]
            self.animation(f'{character}-gentle-run.gif', f'{character.title()} · Natural / Gentle v1 / Gentle v2', panels, ['run'], 3)
        panels = [(f'{character.title()} · Joyful {version}', self.row(character=character, look='day', faceId='joyful' if version == 'v1' else 'joyful-v2'))
                  for character in ('male', 'female') for version in ('v1', 'v2')]
        self.animation('joyful-jump.gif', 'Joyful v1 / v2 · synchronized jump detail', panels, ['jump'], 2, crop=(80, 35, 340, 420))
        panels = [(f'Sailor {version}', self.row(key=f'male-midnight-sailor-{version}-gentle-v2')) for version in ('v1', 'v2')]
        self.animation('sailor-run.gif', 'Midnight sailor v1 / v2 · run', panels, ['run'], 2)
        self.animation('sailor-jump-celebrate.gif', 'Midnight sailor v1 / v2 · jump then celebrate', panels, ['jump', 'celebrate'], 2)
        panels = [(f'Plum + {bottom} shorts', self.row(key=f'female-plum-pintuck-top-v1-{bottom}-shorts-joyful-v2')) for bottom in ('navy', 'ochre')]
        self.animation('female-plum-run.gif', 'Plum top · navy / ochre shorts', panels, ['run'], 2)
        self.details()
        require(len(self.outputs) == 8, 'Expected exactly eight generated review visuals.')
        total = sum(row['bytes'] for row in self.outputs)
        require(total < MAX_BYTES, f'Review images exceed 20 MiB: {total}')
        self.metadata['totalVisualBytes'] = total
        self.metadata['visualCount'] = len(self.outputs)
        self.gallery()
        (self.output / 'index.json').write_text(json.dumps(self.metadata, indent=2)+'\n')
        print(json.dumps({'visuals': len(self.outputs), 'bytes': total, 'gallery': rel(self.output / 'index.html')}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, default=DEFAULT_INDEX)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    Review(args.index, args.output).render()


if __name__ == '__main__':
    main()
