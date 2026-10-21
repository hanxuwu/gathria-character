#!/usr/bin/env python3
"""Matched fit-polish review media from real UI-exported CharacterPacks.

This script does not create garment artwork or change source poses. Native-size
boards retain every pixel; GIFs are labelled 0.375x viewing copies and preserve
the pack's logical frame sequence and timing (rounded to GIF centiseconds).
"""
from io import BytesIO
from pathlib import Path
import gc
import hashlib
import json
import os
import re
import zipfile
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RUN = os.environ.get('WARDROBE_FIT_RUN', '')
RESUME = os.environ.get('WARDROBE_MEDIA_RESUME') == '1'
assert re.fullmatch(r'[a-z0-9-]*', RUN), 'Invalid evidence run name'
BASE = ROOT / 'docs/kling-wardrobe/fit-polish'
CONFIG = json.loads((ROOT / 'scripts/kling-fit-polish-evidence-config.json').read_text())
BEFORE = ROOT / CONFIG['beforeDirectory']
CATALOG = json.loads((ROOT / 'docs/kling-wardrobe/catalog.json').read_text())
OUT = BASE / 'review' / RUN
EXPORTS = BASE / 'exports' / RUN
FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONT = ImageFont.truetype(FONT_PATH, 20)
SMALL = ImageFont.truetype(FONT_PATH, 15)
NATIVE_FONT = ImageFont.truetype(FONT_PATH, 24)
BG = '#f2efe6'
INK = '#293e34'
ACTIONS = ['idle', 'walk', 'run', 'jump', 'celebrate']
SOURCES, RECORDS = [], []


def digest(data):
    return hashlib.sha256(data).hexdigest()


class PackFrames:
    """At most one decoded atlas page per pack, rather than all native frames."""

    def __init__(self, path, label):
        self.path, self.label = path, label
        self.archive = zipfile.ZipFile(path)
        assert self.archive.testzip() is None, path
        self.manifest = json.loads(self.archive.read('manifest.json'))
        self.frames = {frame['id']: frame for frame in self.manifest['frames']}
        self.pages = [self.manifest['spritesheet'],
                      *self.manifest.get('additionalSheets', [])]
        self.page_index = None
        self.page_image = None
        SOURCES.append({'file': str(path.relative_to(ROOT)),
                        'bytes': path.stat().st_size,
                        'sha256': digest(path.read_bytes())})

    def frame(self, frame_id):
        frame = self.frames[frame_id]
        index = frame.get('page', 0)
        if index != self.page_index:
            if self.page_image is not None:
                self.page_image.close()
            page = self.pages[index]
            self.page_image = Image.open(BytesIO(self.archive.read(page['file']))).convert('RGBA')
            self.page_image.load()
            assert self.page_image.size == (page['width'], page['height'])
            self.page_index = index
        return self.page_image.crop((frame['x'], frame['y'],
                                     frame['x'] + frame['width'],
                                     frame['y'] + frame['height']))

    def close(self):
        if self.page_image is not None:
            self.page_image.close()
        self.archive.close()


def save_static(sheet, path):
    if RESUME and path.exists():
        with Image.open(path) as previous:
            previous.load()
            assert previous.size == sheet.size
            assert previous.convert('RGB').tobytes() == sheet.tobytes(), f'Existing static pixels differ: {path}'
    else:
        sheet.save(path)


def record(path, **extra):
    decoded = []
    with Image.open(path) as image:
        size = image.size
        loop = image.info.get('loop')
        for i in range(image.n_frames):
            image.seek(i)
            image.load()
            decoded.append({'durationMs': image.info.get('duration', 0),
                            'rgbSha256': digest(image.convert('RGB').tobytes())})
        info = {'file': str(path.relative_to(ROOT)), 'size': list(size),
                'decodedFrames': image.n_frames, 'durationMs': sum(f['durationMs'] for f in decoded),
                'loop': loop, 'bytes': path.stat().st_size,
                'sha256': digest(path.read_bytes()), **extra}
    assert path.stat().st_size > 0
    if 'expectedDurationMs' in extra:
        assert info['durationMs'] == extra['expectedDurationMs'], path
    if path.suffix == '.gif':
        assert loop == (0 if extra['sourceLoop'] else None), path
        info['decodedSegments'] = decoded
    RECORDS.append(info)
    return decoded


def comparison(packs, character, frame_id, crop, zoom, name, title):
    width, height = (crop[2] - crop[0]) * zoom, (crop[3] - crop[1]) * zoom
    sheet = Image.new('RGB', (width * len(packs), height + 76), BG)
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 8), f'{character} / {title} / source {frame_id} / {zoom}x', font=NATIVE_FONT, fill=INK)
    for i, pack in enumerate(packs):
        draw.text((i * width + 12, 44), pack.label, font=FONT, fill=INK)
        sprite = pack.frame(frame_id).crop(crop).resize((width, height), Image.Resampling.NEAREST)
        sheet.paste(sprite, (i * width, 76), sprite)
    path = OUT / name
    save_static(sheet, path)
    record(path, character=character, frameId=frame_id, crop=list(crop), zoom=zoom,
           comparisonOrder=[p.label for p in packs])


def keyframe_board(packs, character):
    # Two new looks, four unchanged source poses per row, all at native size.
    ids = [0, 28, 58, 96]
    w, h, header = 704, 1056, 54
    sheet = Image.new('RGB', (w * 4, (h + header) * 2 + 42), BG)
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 8), f'{character} / final actual exports / native 1x / idle, walk, run, jump', font=NATIVE_FONT, fill=INK)
    for row, pack in enumerate([packs[1], packs[3]]):
        for col, fid in enumerate(ids):
            x, y = col * w, 42 + row * (h + header)
            draw.text((x + 12, y + 12), f'{pack.label} / source {fid}', font=NATIVE_FONT, fill=INK)
            sprite = pack.frame(fid)
            assert sprite.size == (w, h)
            sheet.paste(sprite, (x, y + header), sprite)
    path = OUT / f'{character}-keyposes-native.png'
    save_static(sheet, path)
    record(path, character=character, frameIds=ids, zoom=1,
           comparisonOrder=[packs[1].label, packs[3].label])


def collapse(segments):
    merged = []
    for segment in segments:
        if merged and merged[-1]['rgbSha256'] == segment['rgbSha256']:
            merged[-1]['durationMs'] += segment['durationMs']
        else:
            merged.append(dict(segment))
    return merged


def animation(packs, character, action, facing):
    clip = packs[0].manifest['animations'][action]
    durations = [(round((i + 1) * 100 / clip['fps']) - round(i * 100 / clip['fps'])) * 10
                 for i in range(len(clip['frames']))]
    assert all(duration > 0 for duration in durations)
    images = []
    for fid in clip['frames']:
        canvas = Image.new('RGB', (288 * len(packs), 498), BG)
        draw = ImageDraw.Draw(canvas)
        draw.text((16, 10), f'{character} / {action.upper()} / {facing} / original, before and current', font=FONT, fill=INK)
        for i, pack in enumerate(packs):
            draw.text((i * 288 + 12, 44), pack.label, font=SMALL, fill=INK)
            sprite = pack.frame(fid)
            if facing == 'left':
                # Anchor352 is the exact center of the immutable704px frame.
                assert pack.manifest['anchor']['x'] == 352
                sprite = sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            sprite = sprite.resize((264, 396), Image.Resampling.LANCZOS)
            canvas.paste(sprite, (i * 288 + 12, 68), sprite)
        draw.text((16, 476), 'Actual UI exports / 0.375x / in place / original source sequence and timing', font=SMALL, fill='#65705e')
        images.append(canvas)
    samples = Image.new('RGB', (288 * len(packs), 498 * 6))
    for i in range(6):
        samples.paste(images[round(i * (len(images) - 1) / 5)], (0, i * 498))
    palette = samples.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    indexed = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in images]
    expected = [{'durationMs': duration, 'rgbSha256': digest(image.convert('RGB').tobytes())}
                for image, duration in zip(indexed, durations)]
    path = OUT / f'{character}-{action}-comparison-{facing}.gif'
    if not (RESUME and path.exists()):
        indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=durations,
                        disposal=1, optimize=False, **({'loop': 0} if clip['loop'] else {}))
    decoded = record(path, character=character, action=action, facing=facing,
                     logicalFrames=len(images), sourceFrameIds=clip['frames'],
                     gifDurationsMs=durations, sourceDurationMs=len(images) * 1000 / clip['fps'],
                     gifRoundingMs=sum(durations) - len(images) * 1000 / clip['fps'],
                     fps=clip['fps'], sourceLoop=clip['loop'],
                     expectedDurationMs=sum(durations), displayScale=.375,
                     comparisonOrder=[p.label for p in packs])
    # GIF writers may coalesce unchanged hold frames. Compare the complete
    # decoded pixel/time sequence, not a misleading raw frame-count equality.
    assert collapse(decoded) == collapse(expected), f'GIF pixel/time sequence changed: {path}'
    RECORDS[-1]['decodedPixelTimeSequenceExact'] = True


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    baseline_path = BASE / 'baseline.json'
    baseline = json.loads(baseline_path.read_text())
    assert baseline['baselineCommit'] == CONFIG['baselineCommit']
    for item in baseline['files']:
        path = ROOT / item['file']
        assert path.stat().st_size == item['bytes'] and digest(path.read_bytes()) == item['sha256'], path
    report_path = BASE / 'browser' / RUN / 'evidence-index.json'
    report = json.loads(report_path.read_text())
    assert report['passed'] is True and report['format'] == 'gathria-wardrobe-fit-polish-browser-evidence'
    for item in report['downloads']:
        path = ROOT / item['file']
        assert path.stat().st_size == item['bytes'] and digest(path.read_bytes()) == item['sha256'], path
    SOURCES.append({'file':str(report_path.relative_to(ROOT)), 'bytes':report_path.stat().st_size, 'sha256':digest(report_path.read_bytes())})
    assert not (OUT / 'media-index.json').exists(), 'Preserve previous media evidence; choose a new WARDROBE_FIT_RUN.'
    for character in ['male', 'female']:
        packs = []
        try:
            for look in ['day', 'wedding']:
                for revision, directory in [('before', BEFORE), ('current', EXPORTS)]:
                    pack = PackFrames(directory / f'{character}-{look}.character.zip', f'{look} / {revision}')
                    if packs:
                        for field in ['frames', 'animations', 'anchor', 'facing']:
                            assert pack.manifest[field] == packs[0].manifest[field], (character, look, field)
                    packs.append(pack)
            ids = [0, 28, 51, 58, 64, 74, 87, 96, 104, 121] if character == 'male' else [0, 58, 89, 104]
            for fid in ids:
                comparison(packs, character, fid, (0, 0, 704, 1056), 1,
                           f'{character}-frame-{fid}-native.png', 'matched full pose')
            crops = [(0, (240, 470, 520, 730), 'collar-shoulders'),
                     (0, (180, 650, 540, 990), 'waist-cuffs'),
                     (104, (150, 500, 600, 850), 'crouched-shoulders-waist'),
                     (87, (165, 605, 590, 995), 'bent-elbows-knees'),
                     (64, (170, 580, 625, 785), 'hand-protection')]
            if character == 'female':
                crops = [(58, (140, 600, 610, 920), 'skirt-outline'),
                         (89, (170, 670, 545, 920), 'waist'),
                         (104, (150, 620, 560, 940), 'raised-skirt')]
            for fid, crop, detail in crops:
                comparison(packs, character, fid, crop, 2,
                           f'{character}-{detail}-{fid}-2x.png', detail)
            keyframe_board(packs, character)
            entry = next(entry for entry in CATALOG['characters'] if entry['key'] == character)
            original = PackFrames(ROOT / entry['sourceUrl'].lstrip('/'), 'Kling original')
            try:
                for field in ['frames', 'animations', 'anchor', 'facing']:
                    assert original.manifest[field] == packs[0].manifest[field]
                for action in ACTIONS:
                    for facing in ['right', 'left']:
                        animation([original, *packs], character, action, facing)
                        print(f'Validated {character}/{action}/{facing}', flush=True)
            finally:
                original.close()
            print(f'{character}: native poses, 2x details and ten decoded animations complete', flush=True)
        finally:
            for pack in packs:
                pack.close()
            gc.collect()
    (OUT / 'media-index.json').write_text(json.dumps({
        'source': 'Before/current clothes come from actual UI-exported CharacterPacks. The original column is the immutable Kling source pack embedded by the corresponding wardrobe projects. No generated design reference substitutes for implemented output.',
        'baselineCommit': CONFIG['baselineCommit'],
        'historicalBaseline': 'docs/kling-wardrobe/fit-polish/baseline.json',
        'technicalValidation': 'Every PNG/GIF decoded; GIF decoded pixel/time sequence equals the quantized source sequence, with original one-shot/loop behavior.',
        'visualAcceptance': 'Requires visual review. Successful decoding does not certify natural motion or garment quality.',
        'sources': SOURCES, 'artifacts': RECORDS,
    }, indent=2) + '\n')
    print(json.dumps({'decodedArtifacts': len(RECORDS), 'output': str(OUT.relative_to(ROOT))}))


if __name__ == '__main__':
    main()
