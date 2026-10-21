#!/usr/bin/env python3
"""Compare real initial/final UI-exported clothing against unchanged source pixels."""
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
from zipfile import ZipFile

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/kling-wardrobe/review/iterations'
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
CASES = [
    ('male', 56, (220, 800, 440, 1010), 'Back shoe ownership'),
    ('male', 64, (230, 800, 455, 1010), 'Shoe and ankle ownership'),
    ('female', 64, (245, 505, 495, 730), 'Cloth beneath crossing arm'),
    ('female', 89, (170, 540, 550, 930), 'Hand protection and skirt join'),
]


def frame(path, frame_id):
    with ZipFile(path) as archive:
        manifest = json.loads(archive.read('manifest.json'))
        meta = next(f for f in manifest['frames'] if f['id'] == frame_id)
        pages = [manifest['spritesheet'], *manifest.get('additionalSheets', [])]
        page = Image.open(BytesIO(archive.read(pages[meta.get('page', 0)]['file'])))
        return page.convert('RGBA').crop((meta['x'], meta['y'],
                                         meta['x'] + meta['width'], meta['y'] + meta['height']))


records = []
for character, fid, crop, title in CASES:
    source_path = ROOT / f'docs/kling-motion/exports/{character}.character.zip'
    final_path = ROOT / f'docs/kling-wardrobe/exports/{character}-wedding.character.zip'
    before_path = OUT / f'{character}-wedding-{fid}-before.png'
    images = [frame(source_path, fid), Image.open(before_path).convert('RGBA'), frame(final_path, fid)]
    width, height = (crop[2] - crop[0]) * 2, (crop[3] - crop[1]) * 2
    comparison = Image.new('RGB', (width * 3, height + 66), '#f2f0e6')
    draw = ImageDraw.Draw(comparison)
    draw.text((10, 7), f'{character} / frame ID {fid} / {title} / 2x', font=FONT, fill='#253f35')
    for index, (label, image) in enumerate(zip(['Original source', 'Initial actual export', 'Corrected actual export'], images)):
        draw.text((index * width + 10, 36), label, font=FONT, fill='#253f35')
        enlarged = image.crop(crop).resize((width, height), Image.Resampling.NEAREST)
        comparison.paste(enlarged, (index * width, 66), enlarged)
    output = OUT / f'{character}-{fid}-correction-2x.png'
    comparison.save(output)
    with Image.open(output) as check:
        check.load()
        assert check.size == (width * 3, height + 66)
    records.append({'character': character, 'frameId': fid, 'crop': crop, 'scale': 2,
                    'file': str(output.relative_to(ROOT)), 'sha256': sha256(output.read_bytes()).hexdigest(),
                    'sourcePackSha256': sha256(source_path.read_bytes()).hexdigest(),
                    'finalPackSha256': sha256(final_path.read_bytes()).hexdigest(),
                    'beforeFrameSha256': sha256(before_path.read_bytes()).hexdigest(), 'decoded': True})
(OUT / 'corrections-index.json').write_text(json.dumps(records, indent=2) + '\n')
print(json.dumps({'comparisons': len(records), 'decoded': True}))
