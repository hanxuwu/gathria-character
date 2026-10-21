#!/usr/bin/env python3
"""Four-look GIF overview made exclusively from actual UI-exported packs."""
from io import BytesIO
from pathlib import Path
import hashlib
import json
import zipfile
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/kling-wardrobe/review'
LOOKS = [('male-day', 'Male / everyday'), ('male-wedding', 'Male / wedding'),
         ('female-day', 'Female / everyday'), ('female-wedding', 'Female / wedding')]
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 20)
SMALL = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
packs = []
sources = []
for key, label in LOOKS:
    path = ROOT / f'docs/kling-wardrobe/exports/{key}.character.zip'
    sources.append({'file': str(path.relative_to(ROOT)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        manifest = json.loads(z.read('manifest.json'))
        pages = [Image.open(BytesIO(z.read(p['file']))).convert('RGBA')
                 for p in [manifest['spritesheet'], *manifest.get('additionalSheets', [])]]
        frames = {f['id']: pages[f.get('page', 0)].crop((f['x'], f['y'], f['x'] + f['width'], f['y'] + f['height']))
                  .resize((264, 396), Image.Resampling.LANCZOS) for f in manifest['frames']}
    packs.append((manifest, frames, label))


def render(action, index):
    canvas = Image.new('RGB', (1152, 498), '#f2efe6')
    draw = ImageDraw.Draw(canvas)
    draw.text((20, 12), f'Kling wardrobe  /  {action.upper()}  /  right', font=FONT, fill='#293e34')
    for column, (manifest, frames, label) in enumerate(packs):
        x = column * 288
        draw.rounded_rectangle((x + 8, 48, x + 280, 459), radius=12,
                               fill=('#e6ecdf' if column < 2 else '#eee4dc'))
        draw.text((x + 20, 57), label, font=SMALL, fill='#293e34')
        sprite = frames[manifest['animations'][action]['frames'][index]]
        canvas.paste(sprite, (x + 12, 64), sprite)
    draw.text((20, 475), 'Actual exported sprites / 0.375x / action samples cut between clips / jump plays once per overview',
              font=SMALL, fill='#65705e')
    return canvas


def export(name, sections):
    images, durations, timeline = [], [], []
    elapsed = 0.0
    for action, repeats in sections:
        clip = packs[0][0]['animations'][action]
        for manifest, _, _ in packs:
            other = manifest['animations'][action]
            assert len(other['frames']) == len(clip['frames']) and other['fps'] == clip['fps']
        start = round(elapsed * 1000)
        for _ in range(repeats):
            for i in range(len(clip['frames'])):
                images.append(render(action, i))
                end = elapsed + 1 / clip['fps']
                durations.append((round(end * 100) - round(elapsed * 100)) * 10)
                elapsed = end
        timeline.append({'action': action, 'repeats': repeats, 'startMs': start, 'endMs': round(elapsed * 1000)})
    path = OUT / name
    # One palette avoids flickering colours; delta rectangles keep downloads small.
    samples = [images[round(i * (len(images) - 1) / 11)] for i in range(12)]
    palette_source = Image.new('RGB', (1152, 498 * len(samples)))
    for row, sample in enumerate(samples):
        palette_source.paste(sample, (0, row * 498))
    palette = palette_source.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    indexed = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in images]
    indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=durations,
                    disposal=1, loop=0, optimize=False)
    with Image.open(path) as gif:
        total = 0
        for i in range(gif.n_frames):
            gif.seek(i)
            gif.load()
            total += gif.info['duration']
        assert gif.size == (1152, 498) and gif.n_frames > 1 and total == sum(durations)
        decoded = gif.n_frames
    return {'file': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'decodedFrames': decoded,
            'logicalFrames': len(images), 'totalDurationMs': total, 'sections': timeline}


artifacts = [
    export('four-looks-actions-right.gif', [('idle', 1), ('walk', 2), ('run', 3), ('jump', 1), ('celebrate', 2)]),
    export('four-looks-run-right.gif', [('run', 1)]),
]
(OUT / 'overview-index.json').write_text(json.dumps({
    'source': 'Actual UI-exported CharacterPacks; no new artwork or movement generated.',
    'note': 'GIF is a reduced-size palette preview. Sections are explicit cuts, not a motion-transition demonstration.',
    'displayScale': 0.375, 'sources': sources, 'artifacts': artifacts,
}, indent=2) + '\n')
print(json.dumps(artifacts, indent=2))
