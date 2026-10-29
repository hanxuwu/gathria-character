"""Read-only native binding diagnostic. Run from any directory.

No garment or registration is changed. The third image column is a rejected
ownership-release hypothesis, not an accepted/installed garment.
"""
from pathlib import Path
import importlib.util
import io
import json
import zipfile

import numpy as np
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]
spec = importlib.util.spec_from_file_location(
    'side', ROOT / 'scripts/prepare-kling-side-male-clothing.py')
side = importlib.util.module_from_spec(spec)
spec.loader.exec_module(side)


def bank(path):
    archive = zipfile.ZipFile(path)
    manifest = json.loads(archive.read('manifest.json'))
    pages = [(Image.open(io.BytesIO(archive.read(p['file']))).convert('RGBA'),
              Image.open(io.BytesIO(archive.read(p['maskFile']))).convert('RGBA'))
             for p in manifest['pages']]
    return manifest, pages


def pose(data, frame):
    manifest, pages = data
    record = next(f for f in manifest['frames'] if f['frameId'] == frame)
    r, o = record['rect'], record['offset']
    bounds = r['x'], r['y'], r['x'] + r['width'], r['y'] + r['height']
    pixels = np.array(pages[record['page']][0].crop(bounds))
    owned = np.array(pages[record['page']][1].crop(bounds))[:, :, 3] > 0
    area = np.s_[o['y']:o['y'] + r['height'], o['x']:o['x'] + r['width']]
    return pixels, owned, area


cotton = {slot: bank(ROOT / f'docs/dual-view-wardrobe/assets/dual-male-side-sea-{slot}-v1.garment.zip')
          for slot in ('top', 'bottom')}
tailored = {slot: bank(ROOT / f'docs/kling-side-expansion/assets/male-{name}.garment.zip')
            for slot, name in [('top', 'shirt'), ('bottom', 'trousers')]}
reviewed = side.NativeContext(ROOT / 'artwork/kling-side-expansion/templates/male.registration.json')
older = side.NativeContext(ROOT / 'docs/kling-side-workspace/assets/male.registration.json')
rows = []
for slot, data in cotton.items():
    for frame in reviewed.frames:
        patch, own, area = pose(data, frame)
        source = reviewed.frames[frame][area]
        collision = own & reviewed.protected_mask(frame)[area]
        if collision.any():
            same = np.all(patch == source, axis=2)
            rows.append({'slot': slot, 'fid': frame, 'count': int(collision.sum()),
                         'noop': int((collision & same).sum()),
                         'rgbdiff': int((collision & ~same).sum())})
(OUT / 'cotton-to-tailored.json').write_text(json.dumps(rows, indent=2))
reverse = []
for slot, data in tailored.items():
    for frame in older.frames:
        patch, own, area = pose(data, frame)
        same = np.all(patch == older.frames[frame][area], axis=2)
        for region in older.registered[frame]['protected']:
            guard = (side.runtime_raster(region['polygon']) & (older.frames[frame][:, :, 3] > 0))[area]
            collision = own & guard
            if collision.any():
                reverse.append({'slot': slot, 'fid': frame, 'region': region['label'],
                                'owned': int(collision.sum()), 'changed': int((collision & ~same).sum())})
(OUT / 'tailored-to-cotton.json').write_text(json.dumps(reverse, indent=2))

frames = [21, 40, 49, 59, 72, 91]
sheet = Image.new('RGB', (990, 370 * len(frames)), '#eee9df')
draw = ImageDraw.Draw(sheet)
for row, frame in enumerate(frames):
    source = reviewed.frames[frame]
    before, after = source.copy(), source.copy()
    changed = np.zeros(source.shape[:2], bool)
    for slot in ('bottom', 'top'):
        patch, own, area = pose(cotton[slot], frame)
        guard = reviewed.protected_mask(frame)[area]
        before[area][own] = patch[own]
        after[area][own & ~guard] = patch[own & ~guard]
        changed[area] |= own & guard
    y, x = np.where(changed)
    bounds = max(0, x.min() - 15), max(0, y.min() - 15), min(512, x.max() + 16), min(768, y.max() + 16)
    for column, (pixels, label) in enumerate(zip((source, before, after), ('source', 'old cotton', 'REJECTED protection trim'))):
        image = Image.fromarray(pixels).crop(bounds)
        image = image.resize((image.width * 2, image.height * 2), Image.Resampling.NEAREST)
        image.thumbnail((320, 330), Image.Resampling.NEAREST)
        sheet.paste(image, (column * 330, row * 370 + 25), image)
        draw.text((column * 330 + 5, row * 370 + 5), f'{frame} / {label}', fill='black')
sheet.save(OUT / 'cotton-protection-trim-rejected.png')
print(json.dumps({'cottonOwnedCollisions': sum(r['count'] for r in rows),
                  'cottonChangedCollisions': sum(r['rgbdiff'] for r in rows),
                  'tailoredOwnedCollisions': sum(r['owned'] for r in reverse)}))
