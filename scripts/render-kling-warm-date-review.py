#!/usr/bin/env python3
"""Build a compact review gallery solely from verified actual app downloads.

PNG boards and GIF comparisons are presentation derivatives. Every source is
hash checked, linked unchanged, and named in review-index.json. No poses, face
pixels, garment paint, action frames or timing are invented by this renderer.
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
import zipfile

from PIL import Image, ImageDraw, ImageFont, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'docs/kling-collection/warm-date-v1'
MATTE = (238, 233, 223)
INK = (46, 40, 42)
MAX_BYTES = 70 * 1024 * 1024
PALETTE = 128


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def relative(path):
    return str(path.resolve().relative_to(ROOT))


def font(size):
    for filename in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
                     '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'):
        if Path(filename).exists():
            return ImageFont.truetype(filename, size)
    return ImageFont.load_default()


def opaque(image):
    base = Image.new('RGBA', image.size, MATTE + (255,))
    base.alpha_composite(image.convert('RGBA'))
    return base.convert('RGB')


def fitted(image, size):
    """One constant, aspect-preserving resize; no pose-dependent crop/recentering."""
    result = Image.new('RGB', size, MATTE)
    image = image.copy()
    image.thumbnail(size, Image.Resampling.LANCZOS)
    result.paste(image, ((size[0]-image.width)//2, (size[1]-image.height)//2))
    return result


class Review:
    def __init__(self, index_path, audit_path, output):
        self.index_path, self.audit_path, self.output = index_path, audit_path, output
        self.evidence = json.loads(index_path.read_bytes())
        self.audit = json.loads(audit_path.read_bytes())
        require(self.evidence.get('passed') is True and self.evidence.get('finishedAt') and
                self.evidence.get('production') is True, 'Use a completed production capture')
        require(self.audit.get('passed') is True and self.audit['evidence']['evidenceIndexSha256'] == digest(index_path),
                'The independent completed audit must bind this exact capture index')
        self.packs = self.evidence['packs']
        require(len(self.packs) == 6 and {p['character'] for p in self.packs} == {'male', 'female'}, 'Expected six styled looks')
        self.downloads = {d['file']: d for d in self.evidence['downloads'] if not d.get('deletedAfterExactReopen')}
        self.sources, self.outputs = {}, []
        require(not output.exists(), 'Preserve existing review output; use a fresh --output directory')
        output.mkdir(parents=True)

    def source(self, row):
        require(row['file'] in self.downloads, 'Review source is not an actual captured UI download')
        download = self.downloads[row['file']]
        local = ROOT / row['file']
        require(local.stat().st_size == download['bytes'] and digest(local) == download['sha256'], 'Review source bytes changed')
        self.sources[row['file']] = {key: download[key] for key in ('file', 'kind', 'sha256', 'bytes')}
        return local

    def png(self, pack, action='idle', facing='right'):
        row = next(d for d in self.downloads.values() if d['kind'] == 'png' and
                   d['look'] == pack['look'] and d['action'] == action and d['facing'] == facing)
        with Image.open(self.source(row)) as image:
            image.load()
            return opaque(image), row

    def record(self, local, source_rows, **metadata):
        with Image.open(local) as image:
            image.load()
            dimensions = [image.width, image.height]
        self.outputs.append({'file': relative(local), 'sha256': digest(local), 'bytes': local.stat().st_size,
                             'size': dimensions, 'actualUiDownload': False,
                             'sources': [row['file'] for row in source_rows], **metadata})

    def overview(self):
        width, height, label = 352, 528, 38
        canvas = Image.new('RGB', (width*3, (height+label)*2), MATTE)
        draw, rows = ImageDraw.Draw(canvas), []
        for index, pack in enumerate(self.packs):
            image, row = self.png(pack)
            x, y = index % 3 * width, index // 3 * (height+label)
            canvas.paste(fitted(image, (width, height)), (x, y+label))
            draw.text((x+12, y+8), pack['name'], font=font(19), fill=INK)
            rows.append(row)
        local = self.output / 'six-looks-overview.png'
        canvas.save(local, optimize=True)
        self.record(local, rows, title='Six warm-date looks', frameId=0, characterPanel=[width, height],
                    presentation='Actual native PNG downloads, alpha composited on a neutral matte and uniformly resized to fit. No pose crop or recentering.')

    def faces(self):
        crop = (175, 345, 615, 685)
        width, height, label = crop[2]-crop[0], crop[3]-crop[1], 38
        canvas = Image.new('RGB', (width*3, (height+label)*2), MATTE)
        draw, rows = ImageDraw.Draw(canvas), []
        for index, pack in enumerate(self.packs):
            image, row = self.png(pack)
            x, y = index % 3 * width, index // 3 * (height+label)
            canvas.paste(image.crop(crop), (x, y+label))
            draw.text((x+12, y+8), pack['name'], font=font(19), fill=INK)
            rows.append(row)
        local = self.output / 'six-faces-native.png'
        canvas.save(local, optimize=True)
        self.record(local, rows, title='Faces at native pixel size', frameId=0, sourceCrop=list(crop), scale=1,
                    presentation='Fixed identical native-coordinate crop of actual PNG downloads; no resizing or face edits.')

    def comparison(self, character, action, facing):
        packs = [p for p in self.packs if p['character'] == character]
        require(len(packs) == 3, 'Expected three looks for each character')
        rows = [next(g for g in self.evidence['gifs'] if g['look'] == p['look'] and
                     g['action'] == action and g['facing'] == facing) for p in packs]
        panels, timeline, loop = [], None, None
        for row in rows:
            decoded, delays = [], []
            with Image.open(self.source(row)) as image:
                this_loop = image.info.get('loop')
                for frame in ImageSequence.Iterator(image):
                    frame.load()
                    decoded.append(frame.convert('RGB'))
                    delays.append(frame.info.get('duration', 0))
            require(len(decoded) == len(row['sourceSchedule']['frames']) and delays == row['delaysMs'], 'Actual GIF schedule differs from capture')
            if timeline is None:
                timeline, loop = delays, this_loop
            require(delays == timeline and this_loop == loop and row['sourceSchedule'] == rows[0]['sourceSchedule'],
                    'Do not synchronize incompatible source schedules')
            panels.append(decoded)
        width, height, label, footer = 352, 528, 38, 25
        frames = []
        for position, fid in enumerate(rows[0]['sourceSchedule']['frames']):
            canvas = Image.new('RGB', (3*width, label+height+footer), MATTE)
            draw = ImageDraw.Draw(canvas)
            for column, pack in enumerate(packs):
                x = column*width
                draw.text((x+10, 9), pack['name'], font=font(18), fill=INK)
                canvas.paste(fitted(panels[column][position], (width, height)), (x, label))
            # Position labels keep repeated native holds as distinct GIF records.
            draw.text((10, label+height+3), f'{character.title()} · {action} {facing} · source frame {fid} · position {position+1}/{len(timeline)}',
                      font=font(14), fill=INK)
            frames.append(canvas)
        del panels
        samples = [frame.resize((264, 148), Image.Resampling.BOX) for frame in frames]
        sheet = Image.new('RGB', (264, 148*len(samples)), MATTE)
        for position, sample in enumerate(samples):
            sheet.paste(sample, (0, position*148))
        palette = sheet.quantize(colors=PALETTE, method=Image.Quantize.MEDIANCUT)
        indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
        local = self.output / f'{character}-three-looks-{action}-{facing}.gif'
        options = {'loop': loop} if loop is not None else {}
        indexed[0].save(local, save_all=True, append_images=indexed[1:], duration=timeline,
                        disposal=1, optimize=False, **options)
        with Image.open(local) as image:
            observed = []
            require(image.info.get('loop') == loop, 'Review GIF loop flag changed')
            for frame in ImageSequence.Iterator(image):
                frame.load()
                observed.append(frame.info.get('duration', 0))
            require(observed == timeline, 'Review GIF changed frame count or delays')
        self.record(local, rows, title=f'{character.title()} · {action} {facing}', frames=len(timeline), delaysMs=timeline,
                    loop=loop, sourceFrameIds=rows[0]['sourceSchedule']['frames'], characterPanel=[width, height], paletteColors=PALETTE,
                    presentation='Actual app GIF pixels arranged together with aspect-preserving resize and one shared 128-color review palette. Original frame order, delays and loop flag are exact; linked originals retain unchanged bytes.')

    def run_contact(self, character):
        packs = [pack for pack in self.packs if pack['character'] == character]
        clip = packs[0]['manifest']['animations']['run']
        require(all(pack['manifest']['animations']['run'] == clip for pack in packs), 'Run contact requires matching source timelines')
        columns, width, height, label, heading = 8, 192, 296, 24, 38
        rows_per_look = math.ceil(len(clip['frames']) / columns)
        group_height = heading + rows_per_look*(height+label)
        canvas = Image.new('RGB', (columns*width, len(packs)*group_height), MATTE)
        draw = ImageDraw.Draw(canvas)
        hashes = []
        for group, pack in enumerate(packs):
            origin = group*group_height
            draw.text((10, origin+8), f'{pack["name"]} · complete run right · native pixels at 1/4 size', font=font(19), fill=INK)
            with zipfile.ZipFile(self.source(pack)) as archive:
                manifest = json.loads(archive.read('manifest.json'))
                require(manifest == pack['manifest'], 'Contact source manifest differs from verified pack')
                frame_by_id = {frame['id']: frame for frame in manifest['frames']}
                sheets = [manifest['spritesheet']] + manifest.get('additionalSheets', [])
                current_page, page = None, None
                for position, fid in enumerate(clip['frames']):
                    frame = frame_by_id[fid]
                    page_index = frame.get('page', 0)
                    if current_page != page_index:
                        with Image.open(io.BytesIO(archive.read(sheets[page_index]['file']))) as image:
                            page = image.convert('RGBA')
                        current_page = page_index
                    crop = page.crop((frame['x'], frame['y'], frame['x']+frame['width'], frame['y']+frame['height']))
                    require(crop.size == (width*4, height*4), 'Run contact expects exact native 768×1184 frames')
                    hashes.append({'look': pack['look'], 'position': position, 'frameId': fid,
                                   'sourceRgbaSha256': hashlib.sha256(crop.tobytes()).hexdigest()})
                    x = (position % columns)*width
                    y = origin + heading + (position // columns)*(height+label)
                    draw.text((x+6, y+3), f'{position+1:02d} · source {fid}', font=font(14), fill=INK)
                    canvas.paste(opaque(crop).resize((width, height), Image.Resampling.LANCZOS), (x, y+label))
        local = self.output / f'{character}-complete-run-frames.png'
        canvas.save(local, optimize=True)
        self.record(local, packs, title=f'{character.title()} · every run frame', action='run', facing='right',
                    scale=0.25, sourceFrameIds=clip['frames'], sourceFrameHashes=hashes, characterPanel=[width, height],
                    presentation='Every run-frame occurrence extracted from actual verified CharacterPacks, in source order, at exact quarter size. Fixed native canvas and source coordinates; no pose recentering or synthesized in-between frames.')

    def html(self):
        def href(file):
            return html.escape(os.path.relpath(ROOT / file, self.output), quote=True)
        pieces = ['''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Warm-date character collection</title><style>
body{max-width:1160px;margin:0 auto;padding:28px;background:#eee9df;color:#2e282a;font:16px/1.55 system-ui,sans-serif}
h1{font-size:32px;line-height:1.15}h2{font-size:21px}section{background:#faf8f3;border:1px solid #d9d0c3;border-radius:12px;padding:18px;margin:24px 0}
img{display:block;max-width:100%;height:auto;margin:auto}a{color:#6f4145}small{color:#655c55}.files{overflow-wrap:anywhere;font-size:13px}li{margin:12px 0}
</style><h1>Warm-date character collection</h1>
<p>Six new clothing designs on the original Kling motion, paired with existing hairstyles and refined expressions. These review boards use completed app downloads. Full-size PNGs, action GIFs and all-action CharacterPacks remain linked below.</p>
<p>Clothing keeps the reviewed source pose ownership and alpha. The gallery checks appearance; the linked audit checks source bindings, exact exported pixels and playback records. Comparison GIFs retain the original frame order, timing and repeat behavior. Jump plays once; open its file again to replay it.</p>''']
        for item in self.outputs:
            filename = Path(item['file']).name
            links = ' · '.join(f'<a href="{href(source)}">{html.escape(Path(source).name)}</a>' for source in item['sources'])
            pieces.append(f'<section><h2>{html.escape(item["title"])}</h2><a href="{filename}"><img src="{filename}" alt="{html.escape(item["title"])}" loading="lazy"></a>'
                          f'<small>{html.escape(item["presentation"])}</small><details><summary>Unchanged app downloads</summary><p class="files">{links}</p></details></section>')
        pieces.append('<section><h2>Complete character exports</h2><ul>')
        for pack in self.packs:
            self.source(pack)
            selections = ', '.join(value for value in pack['selection'].values() if value)
            appearance = pack['appearance']
            pieces.append(f'<li><a href="{href(pack["file"])}">{html.escape(pack["name"])} · all five actions</a><br><small>'
                          f'{html.escape(selections)} · {html.escape(appearance["hairId"])} · {html.escape(appearance["hairColor"])} · {html.escape(appearance["faceId"])}</small></li>')
        pieces.append(f'</ul></section><p><a href="review-index.json">Review provenance</a> · <a href="{href(relative(self.audit_path))}">Independent verification</a> · '
                      f'<a href="{href(relative(self.index_path))}">Browser capture evidence</a></p></html>\n')
        (self.output / 'index.html').write_text(''.join(pieces))

    def run(self):
        self.overview()
        self.faces()
        for character in ('male', 'female'):
            for action, facing in (('run', 'right'), ('run', 'left'), ('jump', 'right')):
                self.comparison(character, action, facing)
            self.run_contact(character)
        self.html()
        report = {'format': 'gathria-warm-date-review', 'version': 1, 'actualUiDownload': False,
                  'captureIndex': relative(self.index_path), 'captureIndexSha256': digest(self.index_path),
                  'captureFinishedAt': self.evidence['finishedAt'], 'independentAudit': relative(self.audit_path),
                  'independentAuditSha256': digest(self.audit_path), 'rendererSha256': digest(Path(__file__)),
                  'scope': 'Presentation derivatives of independently verified actual app downloads. No new artwork, pose synthesis or timing edits.',
                  'sources': self.sources, 'outputs': self.outputs, 'budgetBytes': MAX_BYTES,
                  'limitations': ['GIF review boards are resized and requantized; use unchanged original GIFs or exact native PNGs for pixel inspection.',
                                  'The gallery does not replace a human judgment of clothing and face aesthetics.']}
        index = self.output / 'review-index.json'
        index.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
        total = sum(p.stat().st_size for p in self.output.iterdir() if p.is_file())
        require(total < MAX_BYTES, f'Review exceeds 70 MiB output budget: {total}')
        print(json.dumps({'review': relative(self.output / 'index.html'), 'outputs': len(self.outputs),
                          'sourceDownloads': len(self.sources), 'bytes': total, 'budgetBytes': MAX_BYTES}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, default=DEST / 'evidence/final-v1/evidence-index.json')
    parser.add_argument('--audit', type=Path, default=DEST / 'artifact-validation.json')
    parser.add_argument('--output', type=Path, default=DEST / 'review')
    args = parser.parse_args()
    Review(args.index.resolve(), args.audit.resolve(), args.output.resolve()).run()


if __name__ == '__main__':
    main()
