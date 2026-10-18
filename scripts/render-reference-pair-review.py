"""Compose review media solely from real UI-exported atlases/canvas captures.

Jump is one-shot in the data/player. Its GIF has no loop extension. The action
tour intentionally repeats and labels the reset; source frame timing is retained
with cumulative centisecond rounding. All media and archive members are decoded.
"""
from pathlib import Path
from functools import lru_cache
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
D = ROOT / 'docs/reference-pair' / PHASE
BG, STAGE, INK = '#f6f2e9', '#e8ecdf', '#45493d'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = lambda size=13: ImageFont.truetype(FONT, size)
sha = lambda data: hashlib.sha256(data).hexdigest()
IDS = [('theo-theo', 'Theo / navy suit'), ('rose-rose', 'Rose / coral dress')]
LOOKS = [(f'{person}-{outfit}', f'{person.title()} / {outfit.title()} clothes') for person in ('theo', 'rose') for outfit in ('theo', 'rose')]
EXTRA_IDS = [f'{person}-{variant}' for person in ('theo', 'rose') for variant in ('gentle', 'joyful', 'recolored')]
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
report = {'source': 'Actual reference-pair Skin Studio-exported CharacterPack PNGs; nearest-neighbor integer scale, neutral review stage only. Source concept images are never substituted for rig outputs.', 'png': [], 'gif': [], 'archives': [], 'frames': [], 'playback': []}


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

assert len(evidence['legacyChecks']) == 2
assert all(case['all36FramesExact'] and case['manifestExact'] for case in evidence['legacyChecks'])
assert len(evidence['playback']) == 20
assert len(evidence['identityChecks']) == 2
assert len(evidence['itemRoundtrips']) == 6
assert len(evidence['roundtrips']) == 6
assert len(evidence['exports']) == 10
assert len(evidence['topDyeChecks']) == 2
assert all(check['upperOwnedPixels'] > 0 and check['changedUpperPixels'] > 0 and check['fixedPixelsUnchanged'] and check['silhouetteUnchanged'] for check in evidence['topDyeChecks'])
assert all(item['pngDecodePixelEquality'] and item['deterministicPixels'] for item in evidence['exports'])
report['legacyCompatibility'] = evidence['legacyChecks']
report['identityAndOutfitRoundtrips'] = {'identities': evidence['identityChecks'], 'clothing': evidence['itemRoundtrips'], 'projects': evidence['roundtrips']}
report['editorFrameChecks'] = len(evidence['editorFrames'])
for id in [id for id, _ in LOOKS] + EXTRA_IDS:
    m = manifest(id)
    assert list(m['animations']) == ACTIONS and len(m['frames']) == 36
    assert m['anchor'] == {'x': 96, 'y': 240, 'units': 'pixels', 'origin': 'top-left'}
    clipped = []
    for f in m['frames']:
        rgba = frame(id, f['id']); assert rgba.size == (192, 256)
        alpha = rgba.getchannel('A'); assert alpha.getbbox() and set(alpha.tobytes()) == {0, 255}
        for edge in [(0, 0, 192, 1), (0, 255, 192, 256), (0, 0, 1, 256), (191, 0, 192, 256)]:
            if alpha.crop(edge).getbbox() is not None:
                clipped.append({'frame': f['id'], 'edge': edge})
        assert frame(id, f['id'], 'left').transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes() == rgba.tobytes()
    assert not clipped, f'{id}: visible pixels touch export boundary: {clipped}'
    report['frames'].append({'id': id, 'all36FramesDecoded': True, 'binaryAlpha': True, 'clearBorders': True, 'mirrorRoundtripExact': True})

# Decode actual downloaded identity masks and project sources. Semantic ownership,
# not a color threshold, determines which pixels may change under recoloring.
report['identitySourceChecks'] = []
first_rig, first_motions = None, None
for person in ('theo', 'rose'):
    with zipfile.ZipFile(D / f'{person}.identity.zip') as identity_zip:
        identity = json.loads(identity_zip.read('identity.json'))
        source = {part['slot']: Image.open(io.BytesIO(identity_zip.read(f"artwork/{part['slot']}.png"))).convert('RGBA') for part in identity['parts']}
        masks = {part['slot']: Image.open(io.BytesIO(identity_zip.read(f"masks/{part['slot']}.png"))).convert('RGBA') for part in identity['parts']}
        source_counts = {'fixed': 0, 'skin': 0, 'hair': 0}
        for slot, mask in masks.items():
            assert mask.getchannel('A').tobytes() == source[slot].getchannel('A').tobytes()
            for r, g, b, a in mask.getdata():
                assert g == b == 0 and r in (0, 1, 2) and a in (0, 255)
                if a: source_counts[['fixed', 'skin', 'hair'][r]] += 1
        unchanged = []
        for outfit in ('theo', 'rose'):
            with zipfile.ZipFile(D / f'{person}-{outfit}.rig.zip') as project_zip:
                project = json.loads(project_zip.read('project.json'))
                first_rig = first_rig or project['rig']; first_motions = first_motions or project['motions']
                assert project['rig'] == first_rig and project['motions'] == first_motions
                assert project['wardrobe']['version'] == 3 and project['wardrobe']['identity'] == identity['id']
                assert len(json.loads(project_zip.read('identities.json'))['identities']) == 2
                assert len(json.loads(project_zip.read('wardrobe.json'))['items']) == 6
                for slot in source:
                    actual = Image.open(io.BytesIO(project_zip.read(f'slots/{slot}.png'))).convert('RGBA')
                    assert actual.tobytes() == source[slot].tobytes(), f'{person}/{outfit}/{slot}: identity drift'
                unchanged.append(outfit)
        changed = {'skin': 0, 'hair': 0}; fixed_checked = 0
        with zipfile.ZipFile(D / f'{person}-recolored.rig.zip') as project_zip:
            for slot in source:
                actual = Image.open(io.BytesIO(project_zip.read(f'slots/{slot}.png'))).convert('RGBA')
                assert actual.getchannel('A').tobytes() == source[slot].getchannel('A').tobytes()
                for before, after, mask in zip(source[slot].getdata(), actual.getdata(), masks[slot].getdata()):
                    if not mask[3]:
                        assert before == after
                    elif mask[0] == 0:
                        fixed_checked += 1; assert before == after, f'{person}/{slot}: fixed eye/accessory pixels recolored'
                    elif before != after:
                        changed[['fixed', 'skin', 'hair'][mask[0]]] += 1
        assert all(count > 0 for count in changed.values())
        report['identitySourceChecks'].append({'person': person, 'sourceMaskPixels': source_counts, 'twoOutfitIdentityPixelsExact': unchanged, 'recolorPreservesAlphaAndFixedEyes': True, 'fixedPixelsChecked': fixed_checked, 'changedMaterialPixels': changed})
report['allFourLooksShareExactRigAndMotionLibrary'] = True
report['torsoDyeChecks'] = []
for person in ('theo', 'rose'):
    with zipfile.ZipFile(D / f'{person}-top.wardrobe.zip') as item, zipfile.ZipFile(D / f'{person}-{person}.rig.zip') as original, zipfile.ZipFile(D / f'{person}-recolored.rig.zip') as recolored:
        mask = Image.open(io.BytesIO(item.read('masks/torso.png'))).convert('RGBA')
        before = Image.open(io.BytesIO(original.read('slots/torso.png'))).convert('RGBA')
        after = Image.open(io.BytesIO(recolored.read('slots/torso.png'))).convert('RGBA')
        assert before.getchannel('A').tobytes() == after.getchannel('A').tobytes()
        upper, changed, fixed = 0, 0, 0
        for a, b, owner in zip(before.getdata(), after.getdata(), mask.getdata()):
            if not owner[3]: continue
            if owner[0] == 3:
                upper += 1; changed += a != b
            elif owner[0] == 0:
                fixed += 1; assert a == b
        assert upper > 0 and changed > 0, f'{person}: body top material must visibly recolor'
        report['torsoDyeChecks'].append({'person': person, 'ownedUpperPixels': upper, 'changedUpperPixels': changed, 'fixedPixelsPreserved': fixed, 'silhouettePreserved': True})

action_examples = [('idle', 0), ('walk', 9), ('run', 17), ('jump', 29)]
for scale in (1, 2):
    save_png(panel([(frame(id, 0), label) for id, label in IDS], 2, scale, f'Reference-inspired pair / actual application export / {scale}x'), f'pair-{scale}x.png')
    save_png(panel([(frame(id, 0), label) for id, label in LOOKS], 2, scale, f'Two imported identities × two outfits / actual export / {scale}x'), f'lineup-{scale}x.png')
    save_png(panel([(frame(id, key), f'{label} / {action}') for id, label in IDS for action, key in action_examples], 4, scale, f'Two identities / same four-action skeleton / {scale}x'), f'four-actions-{scale}x.png')
    save_png(panel([(frame(f'{person}-{person}' if expression == 'neutral' else f'{person}-{expression}', 0), f'{person.title()} / {expression}') for person in ('theo', 'rose') for expression in ('neutral', 'gentle', 'joyful')], 3, scale, f'Three complete expressions per identity / {scale}x'), f'expressions-{scale}x.png')
    for person in ('theo', 'rose'):
        for action, start in [('run', 12), ('jump', 24)]:
            save_png(panel([(frame(f'{person}-{person}', key), f'{action} {key-start+1:02d}') for key in range(start, start+12)], 6, scale, f'{person.title()} / {action} / every actual export pose / {scale}x'), f'{person}-{action}-keyframes-{scale}x.png')


def detail_panel(items, box, scale, title):
    width, height = (box[2] - box[0]) * scale, (box[3] - box[1]) * scale
    cw = width + 24
    image = Image.new('RGB', (cw * len(items) + 16, height + 86), BG)
    draw = ImageDraw.Draw(image); draw.text((14, 12), title, font=font(14), fill=INK)
    for index, (sprite, label) in enumerate(items):
        crop = sprite.crop(box).resize((width, height), Image.Resampling.NEAREST)
        x, y = 16 + index * cw, 42
        draw.rectangle((x, y, x + width - 1, y + height - 1), fill=STAGE)
        image.paste(crop, (x, y), crop); draw.text((x, y+height+8), label, font=font(12), fill=INK)
    return image


for person in ('theo', 'rose'):
    save_png(detail_panel([(frame(f'{person}-{outfit}', 0), outfit.title()) for outfit in ('theo', 'rose')], (48, 67, 148, 143), 4, f'{person.title()} / jaw, neck, collar and shoulder / two outfits / 4x'), f'{person}-neck-shoulder-4x.png')
    save_png(detail_panel([(frame(f'{person}-{outfit}', 17), outfit.title()) for outfit in ('theo', 'rose')], (44, 113, 150, 182), 4, f'{person.title()} / run 06 / cuff, wrists and waist / 4x'), f'{person}-cuff-waist-4x.png')
    save_png(detail_panel([(frame(id, 0), label) for id, label in [(f'{person}-{person}', 'Authored colors'), (f'{person}-recolored', 'Skin + hair recolored')]], (46, 35, 149, 134), 4, f'{person.title()} / source masks preserve eyes and accessories / 4x'), f'{person}-head-recolor-4x.png')
    save_png(detail_panel([(frame(f'{person}-{person}' if expression == 'neutral' else f'{person}-{expression}', 0), expression) for expression in ('neutral','gentle','joyful')], (48, 52, 148, 126), 4, f'{person.title()} / actual expression head registration / 4x'), f'{person}-expressions-4x.png')
save_png(panel([(frame(f'{person}-{person}', 17), f'{person.title()} authored colors') for person in ('theo','rose')] + [(frame(f'{person}-recolored',17), f'{person.title()} recolored') for person in ('theo','rose')], 2, 2, 'Run pose 06 / identity and outfit recolor / 2x'), 'recolor-2x.png')


def lineup(action, key, facing, scale, note='', looks=IDS):
    columns = len(looks) if len(looks) <= 2 else 2
    return panel([(frame(id,key,facing), label) for id,label in looks], columns, scale, f'{action.title()} / {facing} / in place / {scale}x {note}')


for facing in ('right', 'left'):
    for scale in (1, 2):
        for action in ACTIONS:
            clip = manifest('theo-theo')['animations'][action]
            events = [(lineup(action,key,facing,scale,'/ plays once' if not clip['loop'] else ''),1000/clip['fps']) for key in clip['frames']]
            save_gif(events, f'{action}-{facing}-{scale}x.gif', loop=clip['loop'])
    tour = []
    for action in ACTIONS:
        clip = manifest('theo-theo')['animations'][action]
        tour.extend((lineup(action,key,facing,2,'/ review tour repeats'),1000/clip['fps']) for key in clip['frames'])
    tour.append((lineup('jump',35,facing,2,'/ finished; tour restarts'),800))
    save_gif(tour, f'four-actions-{facing}-2x.gif', loop=True)
    clip = manifest('theo-theo')['animations']['run']
    save_gif([(lineup('run',key,facing,1,'/ four interchangeable looks',LOOKS),1000/clip['fps']) for key in clip['frames']], f'outfits-run-{facing}-1x.gif', loop=True)

# Hair, dress and leg occlusion are shown from baked assets; no concept art.
save_png(detail_panel([(frame('rose-rose', key), f'Run {key-11:02d}') for key in (12, 14, 17, 20)], (34, 86, 161, 239), 3, 'Rose / back hair, dress hem and legs / actual run keys / 3x'), 'rose-hair-skirt-3x.png')

# Compare the same actual exported idle frame before/after the final collar repair.
prior = ROOT / 'docs/reference-pair/iterations/02-before-collar'
with zipfile.ZipFile(prior / 'rose-rose.character.zip') as archive:
    prior_manifest = json.loads(archive.read('manifest.json'))
    prior_sheet = Image.open(io.BytesIO(archive.read('spritesheet.png'))).convert('RGBA')
    info = next(item for item in prior_manifest['frames'] if item['id'] == 0)
    prior_frame = prior_sheet.crop((info['x'], info['y'], info['x'] + 192, info['y'] + 256))
save_png(detail_panel([(prior_frame, 'Before / actual export'), (frame('rose-rose', 0), 'After / actual export')], (48, 67, 148, 143), 4, 'Rose / same idle frame, crop, stage and 4x scale / collar ownership repair'), 'rose-collar-before-after-4x.png')

with zipfile.ZipFile(prior / 'rose-rose.rig.zip') as old_project, zipfile.ZipFile(D / 'rose-rose.rig.zip') as current_project, zipfile.ZipFile(D / 'rose-top.wardrobe.zip') as top_item:
    old_head = Image.open(io.BytesIO(old_project.read('slots/head-neutral.png'))).convert('RGBA')
    old_torso = Image.open(io.BytesIO(old_project.read('slots/torso.png'))).convert('RGBA')
    torso = Image.open(io.BytesIO(current_project.read('slots/torso.png'))).convert('RGBA')
    mask = Image.open(io.BytesIO(top_item.read('masks/torso.png'))).convert('RGBA')
    old_gap = [(x,y) for y in range(116,124) for x in range(90,113) if old_head.getpixel((x,y))[3] == 0 and old_torso.getpixel((x,y))[3] == 0]
    assert len(old_gap) == 59, 'Retained visual-defect baseline changed'
    actual = frame('rose-rose', 0)
    for pixel in old_gap:
        assert mask.getpixel(pixel) == (1,0,0,255), f'Rose neckline repair does not own skin at {pixel}'
        assert torso.getpixel(pixel)[3] == 255
        assert actual.getpixel(pixel) == torso.getpixel(pixel), f'Rose neckline still exposes rear hair at {pixel}'
    original_owned = [pixel for pixel in zip(old_torso.getdata(), torso.getdata()) if pixel[0][3]]
    assert all(a == b for a,b in original_owned), 'Neck underlay modified pre-existing opaque torso/collar pixels'
report['roseCollarRepair'] = {'retainedActualBeforePack': str((prior/'rose-rose.character.zip').relative_to(ROOT)), 'knownOpeningPixels': len(old_gap), 'allFormerOpeningPixelsNowTorsoOwnedSkin': True, 'actualExportMatchesTorsoAtFormerOpening': True, 'allOriginalOpaqueTorsoPixelsPreserved': len(original_owned)}

retained = {'scope': 'Every retained before-collar artifact, excluding this inventory. This is an intentionally partial snapshot of the first completed actual UI capture.', 'files': []}
for path in sorted(prior.iterdir()):
    if not path.is_file() or path.name == 'file-integrity.json': continue
    data = path.read_bytes(); assert data
    record = {'file': path.name, 'bytes': len(data), 'sha256': sha(data)}
    if path.suffix == '.zip':
        with zipfile.ZipFile(path) as archive:
            assert archive.testzip() is None
            members = []
            for name in archive.namelist():
                value = archive.read(name); assert value
                member = {'name': name, 'bytes': len(value), 'sha256': sha(value)}
                if name.endswith('.png'):
                    image = Image.open(io.BytesIO(value)); image.load()
                    assert image.mode == 'RGBA' and image.getbbox()
                    assert set(image.getchannel('A').tobytes()) == {0,255}
                    member.update(decoded=True, dimensions=list(image.size), binaryAlpha=True)
                elif name.endswith('.json'): json.loads(value); member['validJson'] = True
                else: value.decode('utf-8')
                members.append(member)
            record.update(crcVerified=True, members=members)
    elif path.suffix == '.png':
        image = Image.open(path); image.load(); assert image.getbbox()
        record.update(decoded=True, dimensions=list(image.size))
    elif path.suffix == '.json': json.loads(data); record['validJson'] = True
    else: data.decode('utf-8')
    retained['files'].append(record)
(prior/'file-integrity.json').write_text(json.dumps(retained,indent=2)+'\n')
report['retainedBeforeEvidence'] = {'path': str(prior.relative_to(ROOT)), 'filesDecodedAndHashed': len(retained['files']), 'source': 'Actual pre-correction Studio exports; not source concept art'}

(D/'artifact-validation.json').write_text(json.dumps(report,indent=2)+'\n')
inventory()
print(f"Validated {len(report['archives'])} archives, {len(report['frames'])*36} poses, {len(report['gif'])} GIFs, {len(report['playback'])} isolated playback cases.")
