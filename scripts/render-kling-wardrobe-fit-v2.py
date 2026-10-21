#!/usr/bin/env python3
"""Matched V1/V2 comparisons from actual workbench-exported CharacterPacks."""
from io import BytesIO
from pathlib import Path
import hashlib
import json
import zipfile
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/kling-wardrobe/fit-v2/review'
OUT.mkdir(parents=True, exist_ok=True)
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 20)
SMALL = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
BG = '#f2efe6'
sources, records, packs = [], [], []


def read_pack(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        manifest = json.loads(archive.read('manifest.json'))
        pages = [Image.open(BytesIO(archive.read(p['file']))).convert('RGBA')
                 for p in [manifest['spritesheet'], *manifest.get('additionalSheets', [])]]
        frames = {f['id']: pages[f.get('page', 0)].crop((f['x'], f['y'], f['x'] + f['width'], f['y'] + f['height']))
                  for f in manifest['frames']}
    sources.append({'file': str(path.relative_to(ROOT)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    return manifest, frames


def record(path, **extra):
    with Image.open(path) as image:
        total = 0
        for i in range(image.n_frames):
            image.seek(i)
            image.load()
            total += image.info.get('duration', 0)
        info = {'file': str(path.relative_to(ROOT)), 'size': list(image.size), 'decodedFrames': image.n_frames,
                'durationMs': total, 'loop': image.info.get('loop'), 'bytes': path.stat().st_size,
                'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), **extra}
    if 'expectedDurationMs' in extra:
        assert total == extra['expectedDurationMs']
    records.append(info)


for look in ['day', 'wedding']:
    for revision in [1, 2]:
        directory = 'exports' if revision == 1 else 'fit-v2/exports'
        path = ROOT / f'docs/kling-wardrobe/{directory}/female-{look}.character.zip'
        manifest, frames = read_pack(path)
        if packs:
            for field in ['frames', 'animations', 'anchor', 'facing']:
                assert manifest[field] == packs[0][0][field]
        packs.append((manifest, frames, f'{look} / {"before" if revision == 1 else "refined"}'))


def comparison(frame_id, crop, zoom, name):
    width, height = (crop[2] - crop[0]) * zoom, (crop[3] - crop[1]) * zoom
    sheet = Image.new('RGB', (width * 4, height + 62), BG)
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 8), f'Actual exports / source frame {frame_id} / {zoom}x', font=FONT, fill='#293e34')
    for i, (_, frames, label) in enumerate(packs):
        draw.text((i * width + 12, 36), label, font=SMALL, fill='#293e34')
        sprite = frames[frame_id].crop(crop).resize((width, height), Image.Resampling.NEAREST)
        sheet.paste(sprite, (i * width, 62), sprite)
    path = OUT / name
    sheet.save(path)
    record(path, frameId=frame_id, crop=crop, zoom=zoom)


for fid in [0, 58, 64, 87, 89, 104]:
    comparison(fid, (0, 0, 704, 1056), 1, f'frame-{fid}-native.png')
for fid, crop in [(58, (140, 600, 610, 920)), (89, (170, 670, 545, 920)),
                  (104, (150, 620, 560, 940))]:
    comparison(fid, crop, 2, f'connections-{fid}-2x.png')

for action in ['idle', 'walk', 'run', 'jump', 'celebrate']:
    clip = packs[0][0]['animations'][action]
    for facing in ['right', 'left']:
        images = []
        durations = [(round((i + 1) * 100 / clip['fps']) - round(i * 100 / clip['fps'])) * 10
                     for i in range(len(clip['frames']))]
        for fid in clip['frames']:
            canvas = Image.new('RGB', (1152, 498), BG)
            draw = ImageDraw.Draw(canvas)
            draw.text((16, 10), f'Dress fit comparison / {action.upper()} / {facing}', font=FONT, fill='#293e34')
            for i, (_, frames, label) in enumerate(packs):
                draw.text((i * 288 + 12, 44), label, font=SMALL, fill='#293e34')
                sprite = frames[fid]
                if facing == 'left':
                    sprite = sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                sprite = sprite.resize((264, 396), Image.Resampling.LANCZOS)
                canvas.paste(sprite, (i * 288 + 12, 68), sprite)
            draw.text((16, 476), 'Actual exports / 0.375x preview / unchanged source poses and timing', font=SMALL, fill='#65705e')
            images.append(canvas)
        samples = Image.new('RGB', (1152, 498 * 6))
        for i in range(6):
            samples.paste(images[round(i * (len(images) - 1) / 5)], (0, i * 498))
        palette = samples.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
        indexed = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in images]
        path = OUT / f'{action}-comparison-{facing}.gif'
        indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=durations,
                        disposal=1, optimize=False, **({'loop': 0} if clip['loop'] else {}))
        record(path, action=action, facing=facing, logicalFrames=len(images),
               fps=clip['fps'], expectedDurationMs=sum(durations), displayScale=.375)

(OUT / 'media-index.json').write_text(json.dumps({
    'source': 'Actual UI-exported packs. These images are not garment generation references.',
    'sources': sources, 'artifacts': records,
}, indent=2) + '\n')
print(json.dumps({'decodedArtifacts': len(records), 'files': [r['file'] for r in records]}, indent=2))
