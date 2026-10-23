#!/usr/bin/env python3
"""Small UI style examples from checked, actual wardrobe PNG exports.

No donor illustration or new character rendering is used. Crops/resizing are
presentation only; source PNGs, bank bytes and runtime artwork stay unchanged.
"""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--run', default='final', help='Actual stability capture prefix; expects <run>-male and <run>-female.')
parser.add_argument('--male-run', help='Exact male capture directory, overriding --run.')
parser.add_argument('--female-run', help='Exact female capture directory, overriding --run.')
parser.add_argument('--character', choices=('male', 'female', 'both'), default='both')
parser.add_argument('--evidence-root', default='docs/kling-appearance/stability-review/workflow',
                    help='Directory containing the checked actual capture runs.')
parser.add_argument('--source-prefix', default='thumbnail',
                    help='Frame-0 export label in the capture, e.g. thumbnail or detail.')
args = parser.parse_args()
DEST = ROOT / 'src/appearance/previews'
DEST.mkdir(exist_ok=True)
characters = ('male', 'female') if args.character == 'both' else (args.character,)
record_path = DEST / 'provenance.json'
records = [row for row in json.loads(record_path.read_text())
           if not any(row['file'].startswith(character + '-') for character in characters)] if record_path.exists() else []
for character in characters:
    bank = ROOT / f'docs/kling-appearance/banks/{character}.zip'
    run = getattr(args, f'{character}_run') or f'{args.run}-{character}'
    evidence_dir = ROOT / args.evidence_root / run
    evidence = json.loads((evidence_dir / 'evidence-index.json').read_text())
    if evidence.get('passed') is not True:
        raise ValueError(f'{character}: actual capture is incomplete or failed')
    bank_sha = hashlib.sha256(bank.read_bytes()).hexdigest()
    if evidence['inputs'][str(bank.relative_to(ROOT))] != bank_sha:
        raise ValueError(f'{character}: evidence bank differs from current bank; capture again before updating thumbnails')
    with zipfile.ZipFile(bank) as archive:
        manifest = json.loads(archive.read('manifest.json'))
    pose = next(p for p in manifest['poses'] if p['frameId'] == 0)
    padding = manifest['padding']
    head, hair = pose['headBounds'], pose['hairBounds']
    left = min(head['x'], hair['x']) + padding['left'] - 12
    top = min(head['y'], hair['y']) + padding['top'] - 12
    right = max(head['x'] + head['width'], hair['x'] + hair['width']) + padding['left'] + 12
    bottom = pose['anchors']['chin']['y'] + padding['top'] + 12
    crop = tuple(map(int, (left, top, right, bottom)))
    for style in ('soft-crop', 'soft-bob'):
        source = evidence_dir / f'{character}-{args.source_prefix}-{style}-0-right.png'
        source_sha = hashlib.sha256(source.read_bytes()).hexdigest()
        captured = next(row for row in evidence['downloads'] if row['file'] == str(source.relative_to(ROOT)))
        if captured['sha256'] != source_sha:
            raise ValueError(f'{source}: PNG differs from its actual browser download record')
        with Image.open(source) as image:
            expected = (manifest['frameWidth'] + padding['left'] + padding['right'],
                        manifest['frameHeight'] + padding['top'] + padding['bottom'])
            if image.size != expected:
                raise ValueError(f'{source}: export dimensions do not match bank padding')
            image = image.convert('RGBA').crop(crop)
            image.thumbnail((152, 128), Image.Resampling.LANCZOS)
            thumb = Image.new('RGBA', (152, 128))
            thumb.alpha_composite(image, ((152 - image.width) // 2, (128 - image.height) // 2))
            output = DEST / f'{character}-{style}.png'
            thumb.save(output, optimize=True)
        records.append({
            'file': output.name,
            'source': str(source.relative_to(ROOT)),
            'sourceSha256': source_sha,
            'bankSha256': bank_sha,
            'evidence': str((evidence_dir / 'evidence-index.json').relative_to(ROOT)),
            'sourceFrame': pose['sourceFrame'],
            'frameId': 0,
            'crop': list(crop),
            'size': [152, 128],
            'resampling': 'Lanczos display thumbnail only',
            'appearance': {'hairId': style, 'faceId': 'gentle', 'hairColor': 'chestnut'},
        })
records.sort(key=lambda row: (0 if row['file'].startswith('male-') else 1,
                              0 if 'soft-crop' in row['file'] else 1))
record_path.write_text(json.dumps(records, indent=2) + '\n')
print(f'Updated {len(characters) * 2} real-export style thumbnails.')
