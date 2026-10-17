"""Validate actual UI downloads and compose a compact authoring demonstration.

Character images exclusively come from downloaded CharacterPack PNGs. The UI
GIF contains real screenshots, with explanatory captions outside the screenshot.
No illustration is generated and the example motion is not an art-improvement claim.
"""
from pathlib import Path
from functools import lru_cache
from PIL import Image, ImageDraw, ImageFont
import hashlib
import io
import json
import math
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / 'docs/authoring-tools'
BG, STAGE, INK = '#f6f2e9', '#e8ecdf', '#45493d'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = lambda size=13: ImageFont.truetype(FONT, size)
sha = lambda data: hashlib.sha256(data).hexdigest()
IDS = [('denim-daytrip', 'Denim daytrip'), ('coral-afternoon', 'Coral afternoon')]


def inventory():
    report = {'scope': 'Every delivered file under docs/authoring-tools, excluding this inventory itself.', 'counts': {}, 'files': []}
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
                    item.update(frameDurationsMs=durations, durationMs=sum(durations))
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
                        json.loads(value)
                        member['validJson'] = True
                    else:
                        value.decode('utf-8')
                    members.append(member)
                item.update(crcVerified=True, members=members)
        elif ext == 'json':
            json.loads(data)
            item['validJson'] = True
        else:
            data.decode('utf-8')
        report['files'].append(item)
    (D / 'file-integrity.json').write_text(json.dumps(report, indent=2) + '\n')
    print('All-file integrity:', report['counts'])


if '--inventory-only' in sys.argv:
    inventory()
    raise SystemExit(0)

evidence = json.loads((D / 'evidence-index.json').read_text())
report = {'source': 'Actual browser UI downloads; character presentation uses only decoded exported PNG frames.', 'png': [], 'gif': [], 'archives': [], 'defaults': [], 'playback': []}


@lru_cache(None)
def manifest(stage):
    return json.loads((D / stage / 'manifest.json').read_text())


@lru_cache(None)
def sheet(stage):
    with Image.open(D / stage / 'spritesheet.png') as image:
        image.load()
        assert image.mode == 'RGBA'
        return image.copy()


def frame(stage, frame_id, facing='right'):
    f = next(f for f in manifest(stage)['frames'] if f['id'] == frame_id)
    image = sheet(stage).crop((f['x'], f['y'], f['x'] + f['width'], f['y'] + f['height']))
    return image.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if facing == 'left' else image


def save_png(image, filename):
    path = D / filename
    image.save(path)
    with Image.open(path) as decoded:
        decoded.load()
        assert decoded.tobytes() == image.tobytes() and decoded.size == image.size
    report['png'].append({'file': filename, 'dimensions': list(image.size), 'decodedPixelEquality': True, 'sha256': sha(path.read_bytes())})


def panel(items, columns, scale, title):
    cw, ch = 192 * scale + 20, 256 * scale + 35
    image = Image.new('RGB', (cw * columns + 20, ch * math.ceil(len(items) / columns) + 55), BG)
    draw = ImageDraw.Draw(image)
    draw.text((14, 12), title, font=font(14), fill=INK)
    for i, (stage, key, label) in enumerate(items):
        sprite = frame(stage, key).resize((192 * scale, 256 * scale), Image.Resampling.NEAREST)
        x, y = 20 + i % columns * cw, 48 + i // columns * ch
        draw.rectangle((x, y, x + sprite.width - 1, y + sprite.height - 1), fill=STAGE)
        image.paste(sprite, (x, y), sprite)
        draw.text((x, y + sprite.height + 5), label, font=font(12), fill=INK)
    return image


def save_gif(events, filename):
    images = [image for image, _ in events]
    assert images and len(set(image.size for image in images)) == 1
    strip = Image.new('RGB', (images[0].width, images[0].height * len(images)))
    for i, image in enumerate(images):
        strip.paste(image, (0, i * image.height))
    palette = strip.quantize(colors=256, dither=Image.Dither.NONE)
    indexed = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in images]
    elapsed, previous, durations = 0, 0, []
    for _, duration in events:
        elapsed += duration
        target = round(elapsed / 10) * 10
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
    indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=durations, loop=0, disposal=1, optimize=False)
    decoded = []
    with Image.open(path) as image:
        assert image.info['loop'] == 0
        for index in range(image.n_frames):
            image.seek(index); image.load()
            decoded.append([sha(image.convert('RGB').tobytes()), image.info['duration']])
    assert decoded == expected, f'{filename}: decoded GIF frame order/pixels/timing differs'
    report['gif'].append({'file': filename, 'logicalFrames': len(events), 'decodedFrames': len(decoded), 'dimensions': list(images[0].size), 'durationMs': sum(t for _, t in decoded), 'idealDurationMs': elapsed, 'frameDurationsMs': [t for _, t in decoded], 'decodedFrameSha256': [h for h, _ in decoded], 'sha256': sha(path.read_bytes())})


for archive_info in evidence['archives']:
    path = D / archive_info['file']
    assert sha(path.read_bytes()) == archive_info['sha256']
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        assert sorted(archive.namelist()) == sorted(archive_info['members'])
        for name, info in archive_info['members'].items():
            data = archive.read(name)
            assert data and sha(data) == info['sha256']
            if name.endswith('.png'):
                with Image.open(io.BytesIO(data)) as image:
                    image.load()
                    assert image.mode == 'RGBA' and set(image.getchannel('A').tobytes()) == {0, 255}
            elif name.endswith('.json'):
                json.loads(data)
    report['archives'].append({'file': archive_info['file'], 'crcVerified': True, 'allMembersDecodedAndHashed': True, 'sha256': archive_info['sha256']})

for id, _ in IDS:
    previous = ROOT / 'docs/reusable-rig' / id / 'spritesheet.png'
    with Image.open(previous) as old:
        old.load()
        assert old.tobytes() == sheet(id + '/default').tobytes()
    changes = []
    for f in manifest(id)['frames']:
        sprite = frame(id, f['id'])
        alpha = sprite.getchannel('A')
        assert alpha.getbbox() is not None and set(alpha.tobytes()) == {0, 255}
        for edge in [(0, 0, 192, 1), (0, 255, 192, 256), (0, 0, 1, 256), (191, 0, 192, 256)]:
            assert alpha.crop(edge).getbbox() is None
        if sprite.tobytes() != frame(id + '/default', f['id']).tobytes():
            changes.append(f['id'])
    assert changes and all(f >= 12 for f in changes), 'Technical run edit must preserve every idle/walk frame'
    assert manifest(id)['animations']['run'] == {'frames': [12, 12] + list(range(13, 24)), 'fps': 15, 'loop': True}
    report['defaults'].append({'id': id, 'allDefaultFramesEqualPriorExport': True, 'editedProjectIdleWalkPixelsUnchanged': True, 'changedRunFrameIds': changes, 'allFramesDecodedAndBinaryAlpha': True, 'frameEdgesTransparent': True})

for case in evidence['playback']:
    transitions = case['transitions']
    loops = [transitions[i + 12]['ms'] - transitions[i]['ms'] for i in range(1, len(transitions) - 12)]
    assert loops and max(abs(ms - case['nominalLoopMs']) for ms in loops) < 90
    holds = [transitions[i + 1]['ms'] - event['ms'] for i, event in enumerate(transitions[:-1]) if event['frame'] == 12 and i > 0]
    assert len(holds) >= 2 and all(95 <= value <= 180 for value in holds)
    report['playback'].append({'id': case['id'], 'facing': case['facing'], 'fullNativeFramePixelsMatchPng': True, 'nominalLoopMs': case['nominalLoopMs'], 'observedLoopMs': loops, 'repeatedFirstPoseDurationMs': holds, 'timingVerified': True})

for scale in (1, 2):
    save_png(panel([(id, key, f'{label} / pose {key - 11:02d}') for id, label in IDS for key in range(12, 24)], 6, scale, f'Technical motion example / existing artwork / {scale}x'), f'run-keyposes-{scale}x.png')
    save_png(panel([(stage, 12, f'{label} / {version}') for id, label in IDS for stage, version in [(id + '/default', 'default'), (id, 'bob +1 px')]], 4, scale, f'Same exported pose / motion-edit demonstration, not new artwork / {scale}x'), f'pose-edit-comparison-{scale}x.png')


def lineup(sequence_index, facing, scale):
    image = Image.new('RGB', (40 + 2 * (192 * scale + 20), 256 * scale + 84), BG)
    draw = ImageDraw.Draw(image)
    draw.text((14, 10), f'Edited shared run / {facing} / 15 FPS / in place / {scale}x', font=font(13), fill=INK)
    for col, (id, label) in enumerate(IDS):
        clip = manifest(id)['animations']['run']
        sprite = frame(id, clip['frames'][sequence_index], facing).resize((192 * scale, 256 * scale), Image.Resampling.NEAREST)
        x, y = 20 + col * (192 * scale + 20), 40
        draw.rectangle((x, y, x + sprite.width - 1, y + sprite.height - 1), fill=STAGE)
        image.paste(sprite, (x, y), sprite)
        draw.text((x, y + sprite.height + 7), label, font=font(12), fill=INK)
    return image


for facing in ('right', 'left'):
    for scale in (1, 2):
        save_gif([(lineup(i, facing, scale), 1000 / 15) for i in range(13)], f'edited-run-{facing}-{scale}x.gif')

ui_events = []
for step in evidence['steps']:
    with Image.open(D / step['file']) as screenshot:
        screenshot.load()
        image = Image.new('RGB', (screenshot.width, screenshot.height + 48), BG)
        image.paste(screenshot.convert('RGB'), (0, 48))
        ImageDraw.Draw(image).text((18, 13), step['label'], font=font(18), fill=INK)
        ui_events.append((image, step['durationMs']))
save_gif(ui_events, 'authoring-workflow.gif')

(D / 'artifact-validation.json').write_text(json.dumps(report, indent=2) + '\n')
(D / 'README.md').write_text('''# Visual binding and shared motion authoring evidence

These are actual Skin Studio UI downloads and screenshots. No new illustration was generated. The small timing/pose change is a **technical editing example**, not a claim that the artwork or run cycle is better.

- [Actual UI workflow GIF](authoring-workflow.gif): choose forearm → drag elbow +2 px → undo → redo → restore binding → edit shared motion → swap skin.
- [Desktop screenshot](studio-desktop.png) · [Mobile screenshot](studio-mobile.png).
- [Run right 2×](edited-run-right-2x.gif) · [Run left 2×](edited-run-left-2x.gif), with [native right](edited-run-right-1x.gif) and [native left](edited-run-left-1x.gif).
- [Native key poses](run-keyposes-1x.png) · [2× key poses](run-keyposes-2x.png).
- [Native same-pose comparison](pose-edit-comparison-1x.png) · [2× comparison](pose-edit-comparison-2x.png).

| Skin | Editable project | Independent CharacterPack | Independent player |
| --- | --- | --- | --- |
| Denim daytrip | [Project ZIP](denim-daytrip.rig.zip) | [CharacterPack ZIP](denim-daytrip.character.zip) | [Screenshot](denim-daytrip/independent-player.png) |
| Coral afternoon | [Project ZIP](coral-afternoon.rig.zip) | [CharacterPack ZIP](coral-afternoon.character.zip) | [Screenshot](coral-afternoon/independent-player.png) |

The exported example retains each skin's default joint bindings. Both projects share exactly the same skeleton and motion data: run 15 FPS, first pose body bob 3 px instead of 2 px, and the first pose held for two playback entries. There are 12 unique run poses and 13 timed entries, so the intended loop is 866.67 ms. GIF timing is rounded cumulatively to 870 ms because GIF stores centiseconds; duplicate first frames may be merged by the encoder. Idle and walk pixels are unchanged.

The capture first exported unedited defaults and compared every decoded pixel and manifest with the prior checked-in reusable-rig evidence. It then used real pointer/keyboard controls and download buttons for the edited files. Reopening each project through the UI and exporting again preserved every decoded atlas pixel and manifest. The two `*-default.character.zip` and `*-reopened.character.zip` files retain these checks for review.

After closing the authoring page, the independent player loaded each edited ZIP and played run right and left (4 cases). Every unique native 192×256 frame, including feet, matched the exported PNG after reproducing only the player's ground/anchor guides. Frame order, loop duration, and the held first pose were measured. Generator/authoring imports were blocked and none were requested. Screenshots are supplemental; measured results are in the JSON records.

Capture-method note: the first attempt stopped because it compared each canvas paint with React's independently committed frame label. The completed capture identifies each sampled pose by its unique full-frame RGBA match against exported PNGs, then verifies all 12 poses, order, holds, and loop timing. It accepts no unmatched pixels; this was an observer synchronization correction, with no app-code change.

Every delivered PNG/GIF/ZIP is nonempty and decoded. ZIP members have CRC and SHA256 checks; exported character frames retain binary transparency and clear edges. GIFs are decoded back and compared with their intended palette-converted frames, ordering, and duration.

- [Browser workflow and source hashes](evidence-index.json)
- [PNG/GIF/ZIP and timing verification](artifact-validation.json)
- [Complete file inventory](file-integrity.json)

This batch adds authoring tools. It does not redraw characters, remove existing deep-joint texture compression, add arbitrary bone topology, or claim user visual acceptance. Character packs are baked playback assets; keep the full project ZIP to continue editing.
''')
print(f'Validated {len(report["archives"])} downloaded ZIPs, {len(report["gif"])} GIFs, {len(report["playback"])} live playback cases.')
inventory()
