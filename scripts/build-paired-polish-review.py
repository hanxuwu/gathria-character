#!/usr/bin/env python3
"""Presentation only: decode actual UI packs, never paint replacement pixels.

Before images are committed matched-hair exports. Native originals are linked
rather than duplicated; changed side packs and UI GIFs are copied byte for byte.
"""
import argparse
import hashlib
import io
import json
import math
import shutil
import statistics
import zipfile
from fractions import Fraction
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13)
MATTE = (238, 233, 223, 255)
INK = (43, 61, 52)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_json(path):
    return json.loads(Path(path).read_text())


class Pack:
    def __init__(self, data):
        archive = zipfile.ZipFile(io.BytesIO(data))
        assert archive.testzip() is None
        self.manifest = json.loads(archive.read('manifest.json'))
        self.recipe = json.loads(archive.read('character.json'))
        self.pages = [Image.open(io.BytesIO(archive.read(p['file']))).convert('RGBA')
                      for p in [self.manifest['spritesheet']] + self.manifest.get('additionalSheets', [])]
        self.frames = {f['id']: f for f in self.manifest['frames']}

    def frame(self, fid):
        f = self.frames[fid]
        return self.pages[f.get('page', 0)].crop((f['x'], f['y'], f['x']+f['width'], f['y']+f['height']))


def bounds(image, threshold=128):
    yy, xx = np.where(np.asarray(image)[:, :, 3] >= threshold)
    assert len(xx)
    return [int(xx.min()), int(yy.min()), int(xx.max()+1), int(yy.max()+1)]


def record(row, before):
    project = zipfile.ZipFile(row['project'])
    source = Pack(project.read('source.character.zip'))
    appearance = zipfile.ZipFile(io.BytesIO(project.read('appearance.zip')))
    padding = json.loads(appearance.read('manifest.json'))['padding']
    current = Pack(Path(row['pack']).read_bytes())
    old = Pack(before.read_bytes())
    assert source.manifest['animations'] == current.manifest['animations'] == old.manifest['animations']
    assert source.recipe['derivation']['frames'] == current.recipe['derivation']['frames'] == old.recipe['derivation']['frames']
    assert current.manifest['spritesheet']['frameWidth'] == old.manifest['spritesheet']['frameWidth']
    assert current.manifest['spritesheet']['frameHeight'] == old.manifest['spritesheet']['frameHeight']
    boxes = [bounds(source.frame(fid)) for fid in source.manifest['animations']['idle']['frames']]
    h = statistics.median(b[3]-b[1] for b in boxes)
    return {'source': source, 'before': old, 'after': current, 'padding': padding,
            'scale': 320/h, 'bodyHeight': h,
            'centerX': statistics.median((b[0]+b[2])/2 for b in boxes),
            'baselineY': statistics.median(b[3] for b in boxes)}


def layout(records):
    # One extent for all frames and revisions, never a framewise crop/fit.
    boxes = []
    for r in records:
        for which in ['before', 'after']:
            for fid in r[which].frames:
                b = bounds(r[which].frame(fid), 1)
                p, s = r['padding'], r['scale']
                boxes.append(((b[0]-p['left']-r['centerX'])*s,
                              (b[1]-p['top']-r['baselineY'])*s,
                              (b[2]-p['left']-r['centerX'])*s,
                              (b[3]-p['top']-r['baselineY'])*s))
    half = max(max(abs(b[0]), abs(b[2])) for b in boxes)
    top, bottom = min(b[1] for b in boxes), max(b[3] for b in boxes)
    return {'width': max(250, math.ceil(2*half)+24), 'height': math.ceil(bottom-top)+24,
            'center': max(250, math.ceil(2*half)+24)/2, 'baseline': 12-top}


def pane(r, fid, which, box, facing):
    s, p = r['scale'], r['padding']
    dx = r['centerX']+p['left']-box['center']/s
    dy = r['baselineY']+p['top']-box['baseline']/s
    image = r[which].frame(fid).convert('RGBa').transform(
        (box['width'], box['height']), Image.Transform.AFFINE,
        (1/s, 0, dx, 0, 1/s, dy), resample=Image.Resampling.BICUBIC).convert('RGBA')
    return ImageOps.mirror(image) if facing == 'left' else image


def panel(images, labels, title):
    width, height = images[0].size
    output = Image.new('RGBA', (len(images)*(width+12)+12, height+64), MATTE)
    draw = ImageDraw.Draw(output)
    draw.text((12, 5), title, fill=INK, font=FONT)
    for i, (image, label) in enumerate(zip(images, labels)):
        x = 12+i*(width+12)
        draw.text((x, 25), label, fill=INK, font=FONT)
        output.alpha_composite(image, (x, 48))
    return output.convert('RGB')


def timeline(clips):
    fps = [Fraction(str(c['fps'])) for c in clips]
    durations = [Fraction(len(c['frames']))/f for c, f in zip(clips, fps)]
    loop = all(c['loop'] for c in clips)
    if loop:
        den = math.lcm(*(d.denominator for d in durations))
        end = Fraction(math.lcm(*(int(d*den) for d in durations)), den)
        assert end <= 12, 'Unexpected long common period: review explicitly'
    else:
        end = max(durations)
    events = {Fraction(0), end}
    for c, f in zip(clips, fps):
        events.update(Fraction(i)/f for i in range(math.ceil(end*f)+1)
                      if Fraction(i)/f < end and (c['loop'] or i < len(c['frames'])))
    times = sorted(events)
    rows = []
    for start, stop in zip(times, times[1:]):
        ids = []
        for c, f in zip(clips, fps):
            n = math.floor(start*f)
            n = n % len(c['frames']) if c['loop'] else min(n, len(c['frames'])-1)
            ids.append(c['frames'][n])
        delay = (math.floor(stop*100+Fraction(1, 2))-math.floor(start*100+Fraction(1, 2)))*10
        assert delay > 0
        rows.append({'frameIds': ids, 'delayMs': delay})
    return rows, loop


def gif(path, frames, rows, loop):
    atlas = Image.new('RGB', (128*min(16, len(frames)), 128*math.ceil(len(frames)/16)))
    for i, frame in enumerate(frames):
        atlas.paste(frame.resize((128, 128), Image.Resampling.BOX), ((i % 16)*128, (i//16)*128))
    palette = atlas.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    frames = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    frames[0].save(path, save_all=True, append_images=frames[1:],
                   duration=[r['delayMs'] for r in rows], disposal=2, optimize=False,
                   **({'loop': 0} if loop else {}))


def collect_evidence(inputs, output):
    receipts = []
    for character in ['male', 'female']:
        audit = load_json(inputs/character/'pixel-verification.json')
        assert audit['passed'] is True
        for row in load_json(inputs/character/'exports.json'):
            delivered = output/character/'side.character.zip' if row['view'] == 'side' else ROOT/'docs/matched-hair/review'/character/'original.character.zip'
            assert sha(row['pack']) == sha(delivered), 'A regenerated UI export differs from reviewed delivery'
        for suffix in ['', '-roundtrip', '-comparison']:
            folder = character+suffix
            for p in sorted((inputs/folder).iterdir()):
                if p.suffix not in ['.json', '.png']:
                    continue
                dest = output/folder/p.name
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(p, dest)
                assert sha(p) == sha(dest)
                receipts.append({'source': str(p.relative_to(inputs)), 'file': str(dest.relative_to(output)), 'sha256': sha(dest)})
    checks = inputs.parent/'checks'
    for p in sorted(checks.iterdir()):
        if p.suffix not in ['.json', '.log']:
            continue
        dest = output/'checks'/p.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(p, dest)
    (output/'evidence-downloads.json').write_text(json.dumps(receipts, indent=2)+'\n')


def verify_media(output):
    files = []
    for p in sorted(output.rglob('*')):
        if not p.is_file() or p.suffix not in ['.png', '.gif', '.zip']:
            continue
        item = {'file': str(p.relative_to(output)), 'bytes': p.stat().st_size, 'sha256': sha(p)}
        if p.suffix == '.zip':
            with zipfile.ZipFile(p) as z:
                assert z.testzip() is None
        else:
            image = Image.open(p)
            duration = 0
            for i in range(image.n_frames):
                image.seek(i)
                image.load()
                duration += image.info.get('duration', 0)
            item.update(width=image.width, height=image.height, frames=image.n_frames, durationMs=duration)
        files.append(item)
    (output/'integrity.json').write_text(json.dumps({'passed': True, 'files': files}, indent=2)+'\n')
    print(json.dumps({'passed': True, 'files': len(files), 'bytes': sum(f['bytes'] for f in files)}))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, default=Path('/tmp/paired-polish/exports'))
    parser.add_argument('--output', type=Path, default=ROOT/'docs/paired-polish/review')
    parser.add_argument('--static-only', action='store_true', help='Inspect diagnostic crops without copying or generating animated deliveries')
    parser.add_argument('--collect-only', action='store_true', help='Refresh completed browser evidence and verify existing presentation deliveries')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    if args.collect_only:
        collect_evidence(args.input, args.output)
        verify_media(args.output)
        return
    report = {'format': 'gathria-paired-polish-review', 'presentationOnly': True,
              'framewiseRescale': False, 'retimedNativeClips': False, 'characters': []}
    actual = []
    for character in ['male', 'female']:
        rows = load_json(args.input/character/'exports.json')
        rows = {r['view']: r for r in rows}
        before_root = ROOT/'docs/matched-hair/review'/character
        records = {v: record(rows[v], before_root/f'{v}.character.zip') for v in ['original', 'side']}
        box = layout(list(records.values()))
        folder = args.output/character
        folder.mkdir(exist_ok=True)
        entry = {'character': character, 'bodyCalibration': {}, 'animations': [], 'closeups': []}
        for view, row in rows.items():
            before = before_root/f'{view}.character.zip'
            if view == 'original':
                assert sha(row['pack']) == sha(before), 'Unchanged original export must remain byte exact'
                actual.append({'role': 'unchanged-original-characterpack', 'path': str(before.relative_to(ROOT)), 'sha256': sha(before)})
            elif not args.static_only:
                target = folder/'side.character.zip'
                shutil.copyfile(row['pack'], target)
                assert sha(target) == sha(row['pack'])
            entry['bodyCalibration'][view] = {k: records[view][k] for k in ['scale', 'bodyHeight', 'centerX', 'baselineY', 'padding']}
            if args.static_only:
                continue
            for action, directions in row['gifs'].items():
                for direction, path in directions.items():
                    if not path:  # Deliberately unexported direction, not a delivered GIF.
                        continue
                    target = folder/f'{view}-{action}-{direction}.gif'
                    shutil.copyfile(path, target)
                    assert sha(target) == sha(path)
                    actual.append({'role': 'actual-application-gif', 'file': str(target.relative_to(args.output)), 'sha256': sha(target)})
        for action in ([] if args.static_only else ['walk', 'run', 'jump']):
            for comparison in ['views', 'before-after']:
                if comparison == 'before-after' and action == 'walk':
                    continue
                selected = [(records[v], 'after', v.title()) for v in ['original', 'side']] if comparison == 'views' else [(records['side'], w, w.title()) for w in ['before', 'after']]
                clips = [r[w].manifest['animations'][action] for r, w, _ in selected]
                events, loop = timeline(clips)
                for direction in ['right', 'left']:
                    frames = [panel([pane(r, fid, w, box, direction) for (r, w, _), fid in zip(selected, event['frameIds'])],
                                    [label+' / ID '+str(fid) for (_, _, label), fid in zip(selected, event['frameIds'])],
                                    f'{character.title()} / {action} / {direction} / {comparison}') for event in events]
                    filename = f'{character}-{comparison}-{action}-{direction}.gif'
                    gif(args.output/filename, frames, events, loop)
                    entry['animations'].append({'file': filename, 'loop': loop, 'timeline': events,
                                                'nonLoopShorterClipHoldsLast': not loop})
        targets = {'male': {82: (300, 480, 410, 600), 100: (175, 315, 251, 385)},
                   'female': {0: (170, 400, 285, 535), 95: (140, 285, 255, 385), 97: (310, 470, 445, 570)}}[character]
        side = records['side']
        for fid, crop in targets.items():
            images = [side[w].frame(fid).crop(crop).resize(((crop[2]-crop[0])*3, (crop[3]-crop[1])*3), Image.Resampling.NEAREST) for w in ['source', 'before', 'after']]
            filename = f'{character}-native{fid}-detail-3x.png'
            panel(images, ['Original source', 'Before', 'After'], f'{character.title()} / native {fid} / 3x nearest').save(args.output/filename)
            entry['closeups'].append({'file': filename, 'nativeFrameId': fid, 'crop': crop, 'scale': 3})
            # Whole native frame at integer 1x: no hiding adjacent changes.
            whole = panel([side[w].frame(fid) for w in ['source', 'before', 'after']],
                          ['Original source', 'Before', 'After'], f'{character.title()} / native {fid} / 1x')
            whole.save(args.output/f'{character}-native{fid}-full-1x.png')
        report['characters'].append(entry)
    (args.output/'presentation.json').write_text(json.dumps(report, indent=2)+'\n')
    (args.output/'actual-downloads.json').write_text(json.dumps(actual, indent=2)+'\n')
    if not args.static_only:
        collect_evidence(args.input, args.output)
    verify_media(args.output)


if __name__ == '__main__':
    main()
