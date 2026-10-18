"""Compose review media solely from real UI-exported atlases/canvas captures.

Jump is one-shot in the data/player. Its GIF has no loop extension. The action
tour intentionally repeats and labels the reset; source frame timing is retained
with cumulative centisecond rounding. All media and archive members are decoded.
"""
from pathlib import Path
from functools import lru_cache
from collections import deque
from PIL import Image, ImageDraw, ImageFont
import hashlib
import io
import json
import math
import sys
import os
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PHASE = os.environ.get('EVIDENCE_PHASE', 'final')
assert PHASE and all(c.islower() or c.isdigit() or c == '-' for c in PHASE)
D = ROOT / 'docs/generated-traveler' / PHASE
BG, STAGE, INK = '#f6f2e9', '#e8ecdf', '#45493d'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = lambda size=13: ImageFont.truetype(FONT, size)
sha = lambda data: hashlib.sha256(data).hexdigest()
IDS = [('traveler-neutral', 'Generated traveler')]
LOOKS = [('traveler-neutral', 'Generated traveler / neutral'), ('traveler-gentle', 'Generated traveler / gentle'), ('traveler-joyful', 'Generated traveler / joyful'), ('crop-traveler-clothes', 'Crop / generated clothing'), ('waves-traveler-recolored', 'Waves / recolored clothing')]
ACTIONS = ['idle', 'walk', 'run', 'jump']
PHASES = ['Ready', 'Anticipation', 'Compression', 'Takeoff', 'Ascent', 'Apex', 'Float', 'Descent', 'Contact', 'Landing', 'Recovery', 'Ready']


def inventory():
    report = {'scope': 'Every delivered file in this phase directory, excluding this inventory.', 'counts': {}, 'files': []}
    for path in sorted(D.rglob('*')):
        if not path.is_file() or path.name == 'file-integrity.json':
            continue
        data = path.read_bytes()
        assert data, f'{path}: empty file'
        ext = path.suffix.lower().removeprefix('.')
        item = {'file': str(path.relative_to(D)), 'bytes': len(data), 'sha256': sha(data)}
        report['counts'][ext] = report['counts'].get(ext, 0) + 1
        if ext in ('png', 'gif'):
            with Image.open(path) as image:
                durations = []
                for frame in range(image.n_frames):
                    image.seek(frame); image.load()
                    assert image.getbbox() is not None
                    if ext == 'gif':
                        durations.append(image.info['duration'])
                        assert durations[-1] > 0
                item.update(dimensions=list(image.size), decodedFrames=image.n_frames, decodable=True)
                if durations:
                    item.update(frameDurationsMs=durations, durationMs=sum(durations), loop=image.info.get('loop', 'no loop extension; plays once'))
        elif ext == 'zip':
            with zipfile.ZipFile(path) as archive:
                assert archive.testzip() is None
                names = archive.namelist()
                assert names and len(names) == len(set(names))
                members = []
                for name in names:
                    value = archive.read(name)
                    assert value
                    member = {'name': name, 'bytes': len(value), 'sha256': sha(value)}
                    if name.endswith('.png'):
                        with Image.open(io.BytesIO(value)) as image:
                            image.load()
                            assert image.mode == 'RGBA' and image.getbbox() is not None
                            assert set(image.getchannel('A').tobytes()) == {0, 255}
                            member.update(dimensions=list(image.size), decoded=True, binaryAlpha=True)
                    elif name.endswith('.json'):
                        json.loads(value); member['validJson'] = True
                    else:
                        value.decode('utf-8')
                    members.append(member)
                item.update(crcVerified=True, members=members)
        elif ext == 'json':
            json.loads(data); item['validJson'] = True
        else:
            data.decode('utf-8')
        report['files'].append(item)
    (D / 'file-integrity.json').write_text(json.dumps(report, indent=2) + '\n')
    print('All-file integrity:', report['counts'])


if '--inventory-only' in sys.argv:
    inventory()
    raise SystemExit(0)

evidence = json.loads((D / 'evidence-index.json').read_text())
report = {'source': 'Actual newly generated traveler Skin Studio-exported CharacterPack PNGs; nearest-neighbor integer scale, neutral review stage only. Source concept images are never substituted for rig outputs.', 'png': [], 'gif': [], 'archives': [], 'frames': [], 'playback': []}


@lru_cache(None)
def manifest(id):
    return json.loads((D / id / 'manifest.json').read_text())


@lru_cache(None)
def sheet(id):
    with Image.open(D / id / 'spritesheet.png') as image:
        image.load(); assert image.mode == 'RGBA'
        return image.copy()


def frame(id, key, facing='right'):
    f = next(f for f in manifest(id)['frames'] if f['id'] == key)
    image = sheet(id).crop((f['x'], f['y'], f['x'] + f['width'], f['y'] + f['height']))
    return image.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if facing == 'left' else image


def save_png(image, filename):
    path = D / filename; image.save(path)
    with Image.open(path) as decoded:
        decoded.load(); assert decoded.tobytes() == image.tobytes()
    report['png'].append({'file': filename, 'dimensions': list(image.size), 'decodedPixelEquality': True, 'sha256': sha(path.read_bytes())})


def panel(items, columns, scale, title):
    cw, ch = 192 * scale + 20, 256 * scale + 36
    image = Image.new('RGB', (cw * columns + 20, ch * math.ceil(len(items) / columns) + 55), BG)
    draw = ImageDraw.Draw(image); draw.text((14, 12), title, font=font(14), fill=INK)
    for i, (sprite, label) in enumerate(items):
        sprite = sprite.resize((192 * scale, 256 * scale), Image.Resampling.NEAREST)
        x, y = 20 + i % columns * cw, 48 + i // columns * ch
        draw.rectangle((x, y, x + sprite.width - 1, y + sprite.height - 1), fill=STAGE)
        image.paste(sprite, (x, y), sprite)
        lines, line = [], ''
        for word in label.split():
            candidate = f'{line} {word}'.strip()
            if line and draw.textlength(candidate, font=font(12)) > 192 * scale:
                lines.append(line); line = word
            else:
                line = candidate
        lines.append(line)
        draw.multiline_text((x, y + sprite.height + 5), '\n'.join(lines), font=font(12), fill=INK, spacing=1)
    return image


def save_gif(events, filename, loop=False):
    images = [image for image, _ in events]
    assert images and len(set(image.size for image in images)) == 1
    strip = Image.new('RGB', (images[0].width, images[0].height * len(images)))
    for i, image in enumerate(images):
        strip.paste(image, (0, i * image.height))
    palette = strip.quantize(colors=256, dither=Image.Dither.NONE)
    indexed = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in images]
    elapsed, previous, durations = 0, 0, []
    for _, duration in events:
        elapsed += duration; target = round(elapsed / 10) * 10
        durations.append(target - previous); previous = target
    assert min(durations) > 0
    expected = []
    for image, duration in zip(indexed, durations):
        digest = sha(image.convert('RGB').tobytes())
        if expected and expected[-1][0] == digest:
            expected[-1][1] += duration
        else:
            expected.append([digest, duration])
    path = D / filename
    options = {'loop': 0} if loop else {}
    indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=durations, disposal=1, optimize=False, **options)
    decoded = []
    with Image.open(path) as image:
        assert (image.info.get('loop') == 0) if loop else ('loop' not in image.info)
        for index in range(image.n_frames):
            image.seek(index); image.load()
            decoded.append([sha(image.convert('RGB').tobytes()), image.info['duration']])
    assert decoded == expected, f'{filename}: wrong decoded GIF sequence/timing/pixels'
    report['gif'].append({'file': filename, 'logicalFrames': len(events), 'decodedFrames': len(decoded), 'dimensions': list(images[0].size), 'durationMs': sum(t for _, t in decoded), 'idealDurationMs': elapsed, 'frameDurationsMs': [t for _, t in decoded], 'decodedFrameSha256': [h for h, _ in decoded], 'loop': loop, 'sha256': sha(path.read_bytes())})


for record in evidence['archives']:
    path = D / record['file']
    assert sha(path.read_bytes()) == record['sha256']
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        assert sorted(archive.namelist()) == sorted(record['members'])
        for name, info in record['members'].items():
            data = archive.read(name)
            assert data and sha(data) == info['sha256']
            if name.endswith('.png'):
                with Image.open(io.BytesIO(data)) as im:
                    im.load()
                    assert im.mode == 'RGBA' and set(im.getchannel('A').tobytes()) <= {0, 255}
            elif name.endswith('.json'):
                json.loads(data)
    report['archives'].append({'file': record['file'], 'crcVerified': True, 'allMembersDecodedAndHashed': True, 'sha256': record['sha256']})

for case in evidence['playback']:
    assert sorted(case['expectedFrames']) == sorted(case['matchedFrames'])
    assert all(abs(check['errorMs']) <= case['timingAllowanceMs'] for check in case['timingChecks'])
    if case['action'] == 'jump':
        assert case['finalPosition'] == 11 and case['replayStartedAtFirstFrameAndCompleted']
        assert [item['frame'] for item in case['transitions']] == list(range(24, 36))
    else:
        assert case['finalPosition'] >= len(case['expectedFrames'])
    report['playback'].append({'id': case['id'], 'facing': case['facing'], 'action': case['action'], 'fullNativePngPixelsAndSequenceVerified': True, 'loopOrOneShotReplayVerified': True, 'timingVerified': True})

for id, _ in LOOKS:
    m = manifest(id)
    assert list(m['animations']) == ACTIONS and len(m['frames']) == 36
    assert m['anchor'] == {'x': 96, 'y': 240, 'units': 'pixels', 'origin': 'top-left'}
    clipped = []
    for f in m['frames']:
        rgba = frame(id, f['id'])
        assert rgba.size == (192, 256)
        alpha = rgba.getchannel('A')
        assert alpha.getbbox() and set(alpha.tobytes()) == {0, 255}
        for edge in [(0, 0, 192, 1), (0, 255, 192, 256), (0, 0, 1, 256), (191, 0, 192, 256)]:
            if alpha.crop(edge).getbbox() is not None:
                clipped.append({'frame': f['id'], 'edge': edge})
        assert frame(id, f['id'], 'left').transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes() == rgba.tobytes()
    assert not clipped, f'{id}: visible pixels touch export boundary: {clipped}'
    report['frames'].append({'id': id, 'all36FramesDecoded': True, 'binaryAlpha': True, 'clearBorders': True, 'mirrorRoundtripExact': True})

action_examples = [('idle', 0), ('walk', 9), ('run', 17), ('jump', 29)]
for scale in (1, 2):
    save_png(panel([(frame('traveler-neutral', key), f'{action} / {PHASE}') for action, key in action_examples], 4, scale, f'Newly generated traveler / same four-action skeleton / {scale}x'), f'four-actions-{scale}x.png')
    save_png(panel([(frame(id, 0), label) for id, label in LOOKS[:3]], 3, scale, f'Three expressions / same registered identity / {scale}x'), f'expressions-{scale}x.png')
    save_png(panel([(frame(id, 17), label) for id, label in LOOKS if id not in ('traveler-gentle', 'traveler-joyful')], 3, scale, f'Generated clothing on three identities / run pose 06 / {scale}x'), f'reused-clothing-{scale}x.png')
    for action, start, count in [('run', 12, 12), ('jump', 24, 12), ('walk', 4, 8)]:
        save_png(panel([(frame('traveler-neutral', key), f'{action} {key-start+1:02d}') for key in range(start, start + count)], 6 if count == 12 else 4, scale, f'{action.title()} / every key pose / actual export / {scale}x'), f'{action}-keyframes-{scale}x.png')


def detail_panel(items, box, scale, title):
    width, height = (box[2] - box[0]) * scale, (box[3] - box[1]) * scale
    cw = width + 24
    image = Image.new('RGB', (cw * len(items) + 16, height + 86), BG)
    draw = ImageDraw.Draw(image)
    draw.text((14, 12), title, font=font(14), fill=INK)
    for index, (sprite, label) in enumerate(items):
        crop = sprite.crop(box).resize((width, height), Image.Resampling.NEAREST)
        x, y = 16 + index * cw, 42
        draw.rectangle((x, y, x + width - 1, y + height - 1), fill=STAGE)
        image.paste(crop, (x, y), crop)
        draw.text((x, y + height + 8), label, font=font(12), fill=INK)
    return image


save_png(detail_panel([(frame(id, 0), label.split(' / ')[-1]) for id, label in LOOKS[:3]], (52, 43, 146, 128), 4, 'Actual export / face, jaw and collar / 4x'), 'face-neck-4x.png')
save_png(detail_panel([(frame('traveler-neutral', key), f'run pose {key-11:02d}') for key in [13, 17, 21]], (45, 111, 145, 184), 4, 'Actual export / shoulder, elbow, wrist and waist / 4x'), 'arm-waist-4x.png')
save_png(detail_panel([(frame('traveler-neutral', key), f'run pose {key-11:02d}') for key in [13, 17, 21]], (40, 171, 149, 241), 4, 'Actual export / hips, knees and ankles / 4x'), 'leg-joints-4x.png')
save_png(detail_panel([(frame(id, 17), label) for id, label in [('traveler-neutral', 'Original orange top'), ('crop-traveler-clothes', 'Blue top / light skin'), ('waves-traveler-recolored', 'Sage top / deep skin')]], (60, 124, 126, 168), 4, 'Actual export / cuff and skin material ownership / run 06 / 4x'), 'recolor-cuff-4x.png')


def lineup(action, key, facing, scale, note=''):
    image = Image.new('RGB', (40 + (192 * scale + 20) * len(IDS), 256 * scale + 84), BG)
    draw = ImageDraw.Draw(image)
    draw.text((14, 10), f'{action.title()} / {facing} / in place / {scale}x {note}', font=font(13), fill=INK)
    for col, (id, label) in enumerate(IDS):
        sprite = frame(id, key, facing).resize((192 * scale, 256 * scale), Image.Resampling.NEAREST)
        x, y = 20 + col * (192 * scale + 20), 40
        draw.rectangle((x, y, x + sprite.width - 1, y + sprite.height - 1), fill=STAGE)
        draw.line((x, y + 240 * scale, x + sprite.width - 1, y + 240 * scale), fill='#bcc5ac')
        image.paste(sprite, (x, y), sprite)
        draw.text((x, y + sprite.height + 7), label, font=font(12), fill=INK)
    return image


for facing in ('right', 'left'):
    for scale in (1, 2):
        tour = []
        for action in ACTIONS:
            clip = manifest('traveler-neutral')['animations'][action]
            events = [(lineup(action, key, facing, scale, '/ plays once' if not clip['loop'] else ''), 1000 / clip['fps']) for key in clip['frames']]
            save_gif(events, f'{action}-{facing}-{scale}x.gif', loop=clip['loop'])
            tour.extend((lineup(action, key, facing, scale, '/ review tour repeats'), 1000 / clip['fps']) for key in clip['frames'])
        tour.append((lineup('jump', 35, facing, scale, '/ finished; tour restarts'), 800))
        save_gif(tour, f'four-actions-{facing}-{scale}x.gif', loop=True)


@lru_cache(None)
def phase_frame(directory, id, key):
    m = json.loads((directory / id / 'manifest.json').read_text())
    f = next(f for f in m['frames'] if f['id'] == key)
    with Image.open(directory / id / 'spritesheet.png') as image:
        image.load()
        return image.crop((f['x'], f['y'], f['x'] + f['width'], f['y'] + f['height']))


before = ROOT / 'docs/generated-traveler/phase-1'
if PHASE != 'phase-1' and (before / 'traveler-neutral/manifest.json').exists():
    with zipfile.ZipFile(before / 'traveler-neutral.rig.zip') as old, zipfile.ZipFile(D / 'traveler-neutral.rig.zip') as new:
        old_project = json.loads(old.read('project.json'))
        new_project = json.loads(new.read('project.json'))
        assert old_project['rig'] == new_project['rig'] and old_project['motions'] == new_project['motions']
        changes = {}
        for name in old.namelist():
            if not name.startswith('slots/') or not name.endswith('.png'):
                continue
            old_image = Image.open(io.BytesIO(old.read(name))).convert('RGBA')
            new_image = Image.open(io.BytesIO(new.read(name))).convert('RGBA')
            assert old_image.size == new_image.size
            old_bytes, new_bytes = old_image.tobytes(), new_image.tobytes()
            changes[name] = sum(old_bytes[i:i+4] != new_bytes[i:i+4] for i in range(0, len(old_bytes), 4))
        assert all(changes[f'slots/head-{expression}.png'] == 0 for expression in ('neutral', 'gentle', 'joyful'))
        report['iterationComparison'] = {'before': 'phase-1', 'after': PHASE, 'sameSkeletonAndMotions': True, 'threeHeadSourcesExact': True, 'changedSourcePixelsByAttachment': changes}
    for scale in (1, 2):
        pairs = [(phase_frame(directory, 'traveler-neutral', key), f'{label} / {action}') for directory, label in [(before, 'Before'), (D, 'After')] for action, key in action_examples]
        save_png(panel(pairs, 4, scale, f'Identical pose, background and zoom / actual exports / {scale}x'), f'before-after-{scale}x.png')
    for name, box, key, title in [
        ('before-after-face-neck-4x.png', (52, 43, 146, 128), 0, 'Face / jaw / collar'),
        ('before-after-arm-waist-4x.png', (45, 111, 145, 184), 17, 'Shoulder / wrist / waist / run 06'),
        ('before-after-leg-joints-4x.png', (40, 171, 149, 241), 17, 'Hips / knee / ankle / run 06'),
    ]:
        items = [(phase_frame(directory, 'traveler-neutral', key), label) for directory, label in [(before, 'Before'), (D, 'After')]]
        save_png(detail_panel(items, box, 4, title + ' / same exported frame / 4x'), name)
    for facing in ('right', 'left'):
        for scale in (1, 2):
            clip = manifest('traveler-neutral')['animations']['run']
            events = []
            for key in clip['frames']:
                items = []
                for directory, label in [(before, 'Before'), (D, 'After')]:
                    sprite = phase_frame(directory, 'traveler-neutral', key)
                    if facing == 'left':
                        sprite = sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                    items.append((sprite, label))
                events.append((panel(items, 2, scale, f'Run / {facing} / before and after / {scale}x / in place'), 1000 / clip['fps']))
            save_gif(events, f'before-after-run-{facing}-{scale}x.gif', loop=True)

cuff_before = ROOT / 'docs/generated-traveler/cuff-mask-before'
if PHASE != 'phase-1' and (cuff_before / 'evidence-index.json').exists():
    preserved = json.loads((cuff_before / 'evidence-index.json').read_text())
    for entry in preserved['files']:
        path = cuff_before / entry['file']
        data = path.read_bytes()
        assert len(data) == entry['bytes'] and sha(data) == entry['sha256']
        if path.suffix == '.png':
            with Image.open(io.BytesIO(data)) as image:
                image.load()
                assert image.getbbox() is not None
        elif path.suffix == '.zip':
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                assert archive.testzip() is None
                for name in archive.namelist():
                    value = archive.read(name)
                    assert value
                    if name.endswith('.png'):
                        with Image.open(io.BytesIO(value)) as image:
                            image.load()
                            assert image.mode == 'RGBA' and set(image.getchannel('A').tobytes()) <= {0, 255}
                    elif name.endswith('.json'):
                        json.loads(value)
        elif path.suffix == '.json':
            json.loads(data)
    details = []
    for id, label in [('crop-traveler-clothes', 'Blue'), ('waves-traveler-recolored', 'Sage')]:
        details.extend((phase_frame(directory, id, 17), f'{stage} / {label}') for directory, stage in [(cuff_before, 'Before'), (D, 'After')])
    save_png(detail_panel(details, (60, 124, 126, 168), 4, 'Cuff material correction / identical exported run 06 / 4x'), 'cuff-mask-before-after-4x.png')
    semantic = []
    with zipfile.ZipFile(cuff_before / 'traveler-top.wardrobe.zip') as old, zipfile.ZipFile(D / 'traveler-top.wardrobe.zip') as new:
        for name in old.namelist():
            if not name.startswith('artwork/') or not name.endswith('.png'):
                continue
            old_art = Image.open(io.BytesIO(old.read(name))).convert('RGBA').tobytes()
            new_art = Image.open(io.BytesIO(new.read(name))).convert('RGBA').tobytes()
            assert old_art == new_art, f'Cuff fix altered source artwork {name}'
            mask_name = name.replace('artwork/', 'masks/')
            old_mask = Image.open(io.BytesIO(old.read(mask_name))).convert('RGBA').tobytes()
            new_mask = Image.open(io.BytesIO(new.read(mask_name))).convert('RGBA').tobytes()
            transitions = {}
            strong_orange = 0
            for offset in range(0, len(old_art), 4):
                if old_mask[offset] != new_mask[offset]:
                    pair = f'{old_mask[offset]} -> {new_mask[offset]}'
                    transitions[pair] = transitions.get(pair, 0) + 1
                r, g, b, alpha = new_art[offset:offset+4]
                if alpha and new_mask[offset] == 0 and r > 130 and g > 40 and r > 1.55 * g and g > 1.3 * b:
                    strong_orange += 1
            if 'forearm' in name:
                assert strong_orange == 0, f'{name}: {strong_orange} fixed-material orange sleeve pixels remain'
            semantic.append({'slot': name.removeprefix('artwork/').removesuffix('.png'), 'sourceArtworkExact': True, 'materialTransitions': transitions, 'remainingStrongOrangeFixedPixels': strong_orange})
    report['cuffMaterialCorrection'] = {'beforeExportFilesVerified': True, 'sameSourceArtworkAllParts': True, 'diagnosticThreshold': 'Visible material0 pixels with r>130,g>40,r>1.55*g,g>1.3*b; diagnostic assertion only, not the repair method.', 'parts': semantic}

(D / 'artifact-validation.json').write_text(json.dumps(report, indent=2) + '\n')
(D / 'README.md').write_text(f'''# Generated traveler / {PHASE}

These previews use actual Skin Studio-exported CharacterPack spritesheets, on a labelled neutral stage at native or nearest-neighbor integer zoom. The original generated illustration is documented separately and is not substituted for the posed outputs.

- [Four actions, native](four-actions-1x.png) · [2×](four-actions-2x.png)
- [Expressions, native](expressions-1x.png) · [2×](expressions-2x.png) · [Face and neck, 4×](face-neck-4x.png)
- [Run right, native](run-right-1x.gif) · [Left](run-left-1x.gif) · [2× right](run-right-2x.gif)
- [Walk right](walk-right-1x.gif) · [Left](walk-left-1x.gif)
- [Idle right](idle-right-1x.gif) · [Left](idle-left-1x.gif)
- [Jump right](jump-right-1x.gif) · [Left](jump-left-1x.gif): plays once and holds the last pose.
- [Four-action tour, right](four-actions-right-2x.gif) · [Left](four-actions-left-2x.gif): explicitly repeats after a labelled hold.
- [Run keyframes](run-keyframes-1x.png) · [Jump keyframes](jump-keyframes-1x.png) · [Walk keyframes](walk-keyframes-1x.png)
- [Shoulder, wrist and waist](arm-waist-4x.png) · [Hip, knee and ankle](leg-joints-4x.png)
- [Generated clothing reused on built-in identities](reused-clothing-1x.png)
- [Cuff and skin recolor ownership, 4×](recolor-cuff-4x.png)
- [Studio and source binding](studio-binding-inspection.png) · [Studio workflow](studio-workflow.png)
- [Independent player, right](traveler-neutral/independent-jump-right.png) · [Left](traveler-neutral/independent-jump-left.png)

## Portable files

| Look | Editable project | Independent CharacterPack |
| --- | --- | --- |
| Traveler neutral | [Project](traveler-neutral.rig.zip) | [CharacterPack](traveler-neutral.character.zip) |
| Traveler gentle | [Project](traveler-gentle.rig.zip) | [CharacterPack](traveler-gentle.character.zip) |
| Traveler joyful | [Project](traveler-joyful.rig.zip) | [CharacterPack](traveler-joyful.character.zip) |
| Crop with generated clothing | [Project](crop-traveler-clothes.rig.zip) | [CharacterPack](crop-traveler-clothes.character.zip) |
| Waves with recolored clothing | [Project](waves-traveler-recolored.rig.zip) | [CharacterPack](waves-traveler-recolored.character.zip) |

[Full skin](traveler.skin.zip) · [Top item](traveler-top.wardrobe.zip) · [Bottom item](traveler-bottom.wardrobe.zip) · [Shoes item](traveler-shoes.wardrobe.zip).

The actual imported source attachments are saved under `isolated/`. These diagnose ownership before deformation; they are not separate finished characters. The editor PNGs under `editor/` were sampled through the actual preview controls and verified against exported frames.

Every delivery ZIP is decoded with member hashes and CRC checks. Every PNG is decoded; every GIF's decoded palette-converted frame pixels, order and centisecond timing are compared with its source events. Mirroring, full-frame transparency and edge clearance are checked. Editor close, independent playback, project reopen, item roundtrip and recolor checks are recorded in [evidence-index.json](evidence-index.json).

[Media validation](artifact-validation.json) · [Every-file integrity inventory](file-integrity.json).

Functional checks do not establish visual acceptance. Remaining source/skeleton defects and the limits of one-view joint deformation are documented in the parent review.
''')
if 'cuffMaterialCorrection' in report:
    with (D / 'README.md').open('a') as file:
        file.write('\n[Before/after cuff recolor ownership, 4×](cuff-mask-before-after-4x.png) compares the preserved real exports with the corrected masks. The source artwork pixels are identical; only semantic material assignments changed. The final sleeve follows top color while the ivory cuff remains fixed and the hand follows skin color.\n')
print(f'Validated {len(report["archives"])} ZIPs, {len(report["gif"])} GIFs, {len(report["playback"])} independent playback cases.')
inventory()
