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
import zipfile

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / 'docs/basic-actions'
BG, STAGE, INK = '#f6f2e9', '#e8ecdf', '#45493d'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = lambda size=13: ImageFont.truetype(FONT, size)
sha = lambda data: hashlib.sha256(data).hexdigest()
IDS = [('denim-daytrip', 'Denim daytrip'), ('coral-afternoon', 'Coral afternoon')]
ACTIONS = ['idle', 'walk', 'run', 'jump']
PHASES = ['Ready', 'Anticipation', 'Compression', 'Takeoff', 'Ascent', 'Apex', 'Float', 'Descent', 'Contact', 'Landing', 'Recovery', 'Ready']


def inventory():
    report = {'scope': 'Every delivered file under docs/basic-actions, excluding this inventory.', 'counts': {}, 'files': []}
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
report = {'source': 'Actual UI-exported CharacterPack PNGs and actual skeleton-only UI canvas captures.', 'png': [], 'gif': [], 'archives': [], 'regression': [], 'playback': []}


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


def skeleton(action, key):
    with Image.open(D / 'skeleton' / f'{action}-{key:02d}.png') as image:
        image.load(); assert image.size == (192, 256)
        return image.convert('RGBA')


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
        draw.text((x, y + sprite.height + 5), label, font=font(12), fill=INK)
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


for archive_info in evidence['archives']:
    path = D / archive_info['file']
    assert sha(path.read_bytes()) == archive_info['sha256']
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        assert sorted(archive.namelist()) == sorted(archive_info['members'])
        for name, info in archive_info['members'].items():
            data = archive.read(name); assert data and sha(data) == info['sha256']
            if name.endswith('.png'):
                with Image.open(io.BytesIO(data)) as image:
                    image.load(); assert image.mode == 'RGBA' and set(image.getchannel('A').tobytes()) == {0, 255}
            elif name.endswith('.json'):
                json.loads(data)
    report['archives'].append({'file': archive_info['file'], 'crcVerified': True, 'allMembersDecodedAndHashed': True, 'sha256': archive_info['sha256']})

for id, _ in IDS:
    previous = ROOT / 'docs/reusable-rig' / id
    old_manifest = json.loads((previous / 'manifest.json').read_text())
    with Image.open(previous / 'spritesheet.png') as old:
        old.load(); assert old.tobytes() == sheet(id).crop((0, 0, old.width, old.height)).tobytes()
    assert manifest(id)['frames'][:24] == old_manifest['frames']
    for action in ACTIONS[:3]:
        assert manifest(id)['animations'][action] == old_manifest['animations'][action]
    assert len(manifest(id)['frames']) == 36
    for f in manifest(id)['frames']:
        alpha = frame(id, f['id']).getchannel('A')
        assert alpha.getbbox() is not None and set(alpha.tobytes()) == {0, 255}
        for edge in [(0, 0, 192, 1), (0, 255, 192, 256), (0, 0, 1, 256), (191, 0, 192, 256)]:
            assert alpha.crop(edge).getbbox() is None, (id, f['id'], edge)
    report['regression'].append({'id': id, 'legacy24FramePixelsEqual': True, 'legacyAnimationAndFrameMetadataEqual': True, 'all36FramesDecodedBinaryAlphaAndClearEdges': True, 'jumpIsOneShot': not manifest(id)['animations']['jump']['loop']})

for case in evidence['playback']:
    if case['action'] == 'jump':
        assert case['finalPosition'] == 11 and case['replayStartedAtFirstFrameAndCompleted']
        transitions = case['transitions']
        assert [item['frame'] for item in transitions] == list(range(24, 36))
        intervals = [b['ms'] - a['ms'] for a, b in zip(transitions, transitions[1:])]
        assert all(25 <= value <= 110 for value in intervals), intervals
        assert abs(transitions[-1]['ms'] - 11000 / 15) < 100
        report['playback'].append({'id': case['id'], 'facing': case['facing'], 'action': case['action'], 'fullNativePngPixelsSequenceStopAndReplayVerified': True, 'nominalDurationMs': case['nominalDurationMs'], 'frameTransitionIntervalsMs': intervals, 'lastPoseEnteredMs': transitions[-1]['ms']})
    else:
        report['playback'].append({'id': case['id'], 'facing': case['facing'], 'action': case['action'], 'fullNativePngPixelsSequenceAndWrapVerified': True})

for scale in (1, 2):
    save_png(panel([(frame(id, key), f'{label} / {action}') for id, label in IDS for action, key in [('idle', 0), ('walk', 9), ('run', 17), ('jump', 29)]], 4, scale, f'Four basic actions / actual export / in-place / {scale}x'), f'four-actions-{scale}x.png')
    save_png(panel([(frame(id, 24 + key), f'{label} / {key + 1:02d} {PHASES[key]}') for id, label in IDS for key in range(12)], 6, scale, f'Jump one-shot / 12 phases at 15 FPS / actual export / {scale}x'), f'jump-keyframes-{scale}x.png')
    save_png(panel([(skeleton(action, key), f'{action} / source pose {key + 1}') for action, key in [('idle', 0), ('walk', 5), ('run', 5), ('jump', 5)]], 4, scale, f'Shared skeleton only / actual UI canvas / {scale}x'), f'skeleton-four-actions-{scale}x.png')


def lineup(action, key, facing, scale, note=''):
    image = Image.new('RGB', (40 + 2 * (192 * scale + 20), 256 * scale + 84), BG)
    draw = ImageDraw.Draw(image)
    draw.text((14, 10), f'{action.title()} / {facing} / in place / {scale}x {note}', font=font(13), fill=INK)
    for col, (id, label) in enumerate(IDS):
        sprite = frame(id, key, facing).resize((192 * scale, 256 * scale), Image.Resampling.NEAREST)
        x, y = 20 + col * (192 * scale + 20), 40
        draw.rectangle((x, y, x + sprite.width - 1, y + sprite.height - 1), fill=STAGE)
        # Ground guide remains fixed during the actual airborne character motion.
        draw.line((x, y + 240 * scale, x + sprite.width - 1, y + 240 * scale), fill='#bcc5ac')
        image.paste(sprite, (x, y), sprite)
        draw.text((x, y + sprite.height + 7), label, font=font(12), fill=INK)
    return image


for facing in ('right', 'left'):
    for scale in (1, 2):
        save_gif([(lineup('jump', 24 + key, facing, scale, '/ plays once'), 1000 / 15) for key in range(12)], f'jump-{facing}-{scale}x.gif')

events = []
skeleton_events = []
for action in ACTIONS:
    clip = manifest(IDS[0][0])['animations'][action]
    source_clip = evidence['motions']['clips'][action]
    for key, source_key in zip(clip['frames'], source_clip['sequence']):
        events.append((lineup(action, key, 'right', 2, '/ action tour repeats'), 1000 / clip['fps']))
        skeleton_events.append((panel([(skeleton(action, source_key), f'{action} / source pose {source_key + 1}')], 1, 2, 'Skeleton action tour / repeats'), 1000 / clip['fps']))
# Hold the completed jump before the explicitly labelled review tour restarts.
events.append((lineup('jump', 35, 'right', 2, '/ finished; tour restarts'), 800))
skeleton_events.append((panel([(skeleton('jump', 11), 'Jump finished / tour restarts')], 1, 2, 'Skeleton action tour / repeats'), 800))
save_gif(events, 'four-actions-tour-2x.gif', loop=True)
save_gif(skeleton_events, 'skeleton-four-actions-2x.gif', loop=True)

(D / 'artifact-validation.json').write_text(json.dumps(report, indent=2) + '\n')
(D / 'README.md').write_text('''# Four basic skeletal actions

The same project-owned skeleton and motion library now drives **idle, walk, run, and a one-shot jump** on Denim daytrip and Coral afternoon. These are actual Skin Studio downloads and actual skeleton-guide canvas captures. No new illustration was generated.

- [Four-action character tour, 2×](four-actions-tour-2x.gif) · [Skeleton-only action tour, 2×](skeleton-four-actions-2x.gif).
- [Four actions at native size](four-actions-1x.png) · [2×](four-actions-2x.png).
- [Actual skeleton-only UI](skeleton-studio.png) · [Native skeleton poses](skeleton-four-actions-1x.png) · [2×](skeleton-four-actions-2x.png).
- [Jump right, native](jump-right-1x.gif) · [Jump left, native](jump-left-1x.gif) · [Right 2×](jump-right-2x.gif) · [Left 2×](jump-left-2x.gif).
- [12 jump key phases, native](jump-keyframes-1x.png) · [2×](jump-keyframes-2x.png).
- [Desktop](studio-desktop.png) · [Mobile](studio-mobile.png).

| Skin | Editable project | Independent CharacterPack | Player: jump complete |
| --- | --- | --- | --- |
| Denim daytrip | [Project ZIP](denim-daytrip.rig.zip) | [CharacterPack ZIP](denim-daytrip.character.zip) | [Right](denim-daytrip/independent-jump-right.png) · [Left](denim-daytrip/independent-jump-left.png) |
| Coral afternoon | [Project ZIP](coral-afternoon.rig.zip) | [CharacterPack ZIP](coral-afternoon.character.zip) | [Right](coral-afternoon/independent-jump-right.png) · [Left](coral-afternoon/independent-jump-left.png) |

Jump is 12 poses at 15 FPS (800 ms). It plays once, holds the final ready pose, and restarts only on replay or another explicit action selection. The individual jump GIFs have **no loop extension**, preserving that contract; reopen them to replay. The two action-tour GIFs deliberately repeat for review, with a labelled 800 ms end hold. Their playback timing is rounded cumulatively to GIF centiseconds. Characters are animated in place; the ground guide remains fixed. The preview does not simulate movement through a scene.

The previous 24 idle/walk/run source frames and their manifest frame/animation entries were compared with `docs/reusable-rig` and remain exact. The new atlas appends 12 jump frames. Both complete project ZIPs were reopened through the UI, with jump selected, and exported again. The `*-reopened.character.zip` files preserve that roundtrip evidence; their decoded pixels and manifests match.

After closing the authoring page, the independent player loaded the two new packs and exercised all four actions in both directions (16 cases). Every sampled native frame was matched against the actual exported PNG including the player's ground/anchor guide. Idle/walk/run were checked through a wrap. Jump was checked for every phase, sequence, final hold, and replay from the first pose. The identical first/final ready images were disambiguated by their legal sequence position, not by an independently committed text label. Generator and authoring modules were blocked and none were requested.

Every delivered PNG/GIF/ZIP is nonempty and decodable. ZIP members have CRC and SHA256 checks, character frames retain binary alpha and clear borders, and decoded GIF frames/order/durations match their intended palette-converted presentation. Skeleton guide PNGs may contain antialiasing; those guides do not enter exported character art.

- [Browser capture, source hashes and live playback](evidence-index.json)
- [Artifact and timing verification](artifact-validation.json)
- [Complete file integrity inventory](file-integrity.json)

This is a compact reusable skeleton and four basic motions, not a full Spine replacement. Jump is a small in-place hop constrained by the existing 192×256 frame and source art. Existing texture compression at deep bends is retained. These artifacts are for review and do not claim user visual acceptance.
''')
print(f'Validated {len(report["archives"])} downloaded ZIPs, {len(report["gif"])} GIFs, {len(report["playback"])} live playback cases.')
inventory()
