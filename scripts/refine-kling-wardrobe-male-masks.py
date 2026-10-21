#!/usr/bin/env python3
"""Apply reviewed, source-bound male semantic ownership corrections offline.

Run after registration creation. These local contours refine garment ownership
without changing approved source pixels, source animation, or frozen anchors.
"""
from pathlib import Path
import argparse
import hashlib
import json
from io import BytesIO
from zipfile import ZipFile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--registration', type=Path, required=True)
parser.add_argument('--corrections', type=Path, default=ROOT / 'artwork/kling-wardrobe/registration/male/reviewed-mask-corrections.json')
args = parser.parse_args()
review = json.loads(args.corrections.read_text())
registration_bytes = args.registration.read_bytes()
registration = json.loads(registration_bytes)
if hashlib.sha256(registration_bytes).hexdigest() != review['registrationSha256']:
    raise ValueError('Reviewed corrections require the exact reviewed registration.')
if registration['sourceSha256'] != review['sourceSha256']:
    raise ValueError('Reviewed corrections belong to another source CharacterPack.')
source_zip = ROOT / 'docs/kling-motion/exports/male.character.zip'
if hashlib.sha256(source_zip.read_bytes()).hexdigest() != review['sourceSha256']:
    raise ValueError('The source CharacterPack no longer matches these reviewed contours.')
with ZipFile(source_zip) as archive:
    source_manifest = json.loads(archive.read('manifest.json'))
    source_pages = [Image.open(BytesIO(archive.read(meta['file']))).convert('RGBA')
                    for meta in [source_manifest['spritesheet'], *source_manifest.get('additionalSheets', [])]]
source_frames = {f['id']: f for f in source_manifest['frames']}

P = args.output
S = P / 'semantic'
names = ['skin', 'tank', 'shorts', 'shoes']
indices = {name: i + 1 for i, name in enumerate(names)}
frames = {f['frameId']: f for f in registration['frames']}
records = json.loads((S / 'index.json').read_text())
by_id = {f['frameId']: f for f in records}
changed = []

def bounds(mask):
    y, x = np.where(mask)
    return [int(x.min()), int(y.min()), int(x.max()), int(y.max())] if len(x) else None

for correction in review['corrections']:
    fid = correction['frameId']
    source = np.asarray(Image.open(P / f'frame-{fid:03}.png').convert('RGBA'))
    meta = source_frames[fid]
    original = np.asarray(source_pages[meta.get('page', 0)].crop(
        (meta['x'], meta['y'], meta['x'] + meta['width'], meta['y'] + meta['height'])))
    if not np.array_equal(source, original):
        raise ValueError(f'Source frame {fid} differs from the reviewed original RGBA.')
    visible = source[:, :, 3] > 0
    labels = np.zeros(visible.shape, np.uint8)
    for name, value in indices.items():
        labels[np.asarray(Image.open(S / f'{fid:03}-{name}.png')) > 0] = value
    protected = Image.new('L', (704, 1056))
    draw = ImageDraw.Draw(protected)
    for region in frames[fid]['protected']:
        draw.polygon([(p['x'], p['y']) for p in region['polygon']], fill=255)
    proposal = Image.new('L', (704, 1056))
    ImageDraw.Draw(proposal).polygon([tuple(p) for p in correction['polygon']], fill=255)
    ownership = (np.asarray(proposal) > 0) & visible & (np.asarray(protected) == 0)
    count = int((ownership & (labels != indices[correction['region']])).sum())
    labels[ownership] = indices[correction['region']]
    record = by_id[fid]
    for name, value in indices.items():
        mask = labels == value
        Image.fromarray((mask * 255).astype(np.uint8)).save(S / f'{fid:03}-{name}.png')
        record['bounds'][name] = bounds(mask)
        record['pixels'][name] = int(mask.sum())
    record['unclassifiedVisiblePixels'] = int((visible & (labels == 0)).sum())
    record['reviewedCorrections'] = [c['reason'] for c in review['corrections'] if c['frameId'] == fid]
    overlay = np.zeros(source.shape, np.uint8)
    for value, color in [(1, (247, 157, 73, 60)), (2, (34, 193, 228, 150)),
                         (3, (204, 65, 211, 150)), (4, (76, 211, 111, 150))]:
        overlay[labels == value] = color
    Image.alpha_composite(Image.fromarray(source), Image.fromarray(overlay)).save(S / f'{fid:03}-overlay.png')
    changed.append({'frameId': fid, 'region': correction['region'], 'correctedPixels': count})

for probe in review.get('regressionProbes', []):
    fid, x, y = probe['frameId'], probe['x'], probe['y']
    owners = [name for name in names
              if Image.open(S / f'{fid:03}-{name}.png').getpixel((x, y))]
    if owners != [probe['region']]:
        raise AssertionError(f'Reviewed pixel regression: {probe}; actual owners: {owners}')
if args.registration.read_bytes() != registration_bytes:
    raise AssertionError('Semantic refinement must not change the frozen registration.')

(S / 'index.json').write_text(json.dumps(records, indent=2))
manifest = json.loads((P / 'manifest.json').read_text())
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
except OSError:
    font = ImageFont.load_default()
for action, animation in manifest['animations'].items():
    ids = list(dict.fromkeys(animation['frames']))
    sheet = Image.new('RGB', (176 * 8, 288 * ((len(ids) + 7) // 8)), '#e8e7dc')
    draw = ImageDraw.Draw(sheet)
    for i, fid in enumerate(ids):
        preview = Image.open(S / f'{fid:03}-overlay.png').resize((176, 264))
        x, y = (i % 8) * 176, (i // 8) * 288
        sheet.paste(preview, (x, y + 24), preview)
        draw.text((x + 3, y + 3), str(fid), font=font, fill='black')
    sheet.save(S / f'{action}-review.png')
report = {'registrationSha256': review['registrationSha256'], 'corrections': changed,
          'pixelRegressionProbes': review.get('regressionProbes', []),
          'sourceZipHashVerified': True, 'correctedFramesMatchOriginalRgba': True,
          'registrationUnchanged': True}
(S / 'reviewed-corrections-verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
