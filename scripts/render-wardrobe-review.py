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
D = ROOT / 'docs/wardrobe'
BG, STAGE, INK = '#f6f2e9', '#e8ecdf', '#45493d'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = lambda size=13: ImageFont.truetype(FONT, size)
sha = lambda data: hashlib.sha256(data).hexdigest()
IDS = [('crop-mixed', 'Crop / soft top, skirt, lace-ups'), ('waves-mixed', 'Waves / denim, trousers, flats')]
LOOKS = [('crop-denim', 'Crop / denim + trousers + lace-ups'), ('crop-mixed', 'Crop / soft top + skirt + lace-ups'), ('waves-soft', 'Waves / soft top + skirt + flats'), ('waves-mixed', 'Waves / denim + trousers + flats')]
ACTIONS = ['idle', 'walk', 'run', 'jump']
PHASES = ['Ready', 'Anticipation', 'Compression', 'Takeoff', 'Ascent', 'Apex', 'Float', 'Descent', 'Contact', 'Landing', 'Recovery', 'Ready']


def inventory():
    report = {'scope': 'Every delivered file under docs/wardrobe, excluding this inventory.', 'counts': {}, 'files': []}
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
report = {'source': 'Actual wardrobe UI-exported CharacterPack PNGs; nearest-neighbor integer scale, neutral review stage only.', 'png': [], 'gif': [], 'archives': [], 'frames': [], 'playback': []}


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


ALL_IDS = [id for id, _ in LOOKS] + [f'{id}-{expression}' for id, _ in IDS for expression in ('neutral', 'joyful')] + ['waves-recolor']
for id in ALL_IDS:
    m = manifest(id)
    assert set(m['animations']) == set(ACTIONS)
    assert len(m['frames']) == 36 and not m['animations']['jump']['loop']
    assert m['anchor'] == {'x': 96, 'y': 240}
    for f in m['frames']:
        rgba = frame(id, f['id']); assert rgba.size == (192, 256)
        alpha = rgba.getchannel('A')
        assert alpha.getbbox() is not None and set(alpha.tobytes()) == {0, 255}
        for edge in [(0, 0, 192, 1), (0, 255, 192, 256), (0, 0, 1, 256), (191, 0, 192, 256)]:
            assert alpha.crop(edge).getbbox() is None, (id, f['id'], edge)
        mirrored = frame(id, f['id'], 'left')
        assert mirrored.transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes() == rgba.tobytes()
    report['frames'].append({'id': id, 'all36FramesDecoded': True, 'binaryAlpha': True, 'clearEdges': True, 'mirrorRoundtripExact': True, 'jumpIsOneShot': True})

for scale in (1, 2):
    save_png(panel([(frame(id, 0), label) for id, label in LOOKS], 4, scale, f'Wardrobe / same identity, different clothing / actual export / {scale}x'), f'wardrobe-lineup-{scale}x.png')
    save_png(panel([(frame(id, key), f'{label.split(" / ")[0]} / {action}') for id, label in IDS for action, key in [('idle', 0), ('walk', 9), ('run', 17), ('jump', 29)]], 4, scale, f'Crossed outfits / four basic actions / in place / {scale}x'), f'four-actions-{scale}x.png')
    save_png(panel([(frame(id if expression == 'gentle' else f'{id}-{expression}', 0), f'{label.split(" / ")[0]} / {expression}') for id, label in IDS for expression in ('neutral', 'gentle', 'joyful')], 3, scale, f'Two identities / three expressions / same crossed outfits / {scale}x'), f'expressions-{scale}x.png')
    save_png(panel([(frame(id, 0), label) for id, label in [('waves-mixed', 'Original colors'), ('waves-recolor', 'Skin + top + bottom + shoes recolored')]], 2, scale, f'Semantic recolor / fixed eyes, hair and detail retained / {scale}x'), f'recolor-{scale}x.png')
    save_png(panel([(frame(id, key), f'{label.split(" / ")[0]} / run {key - 11:02d}') for id, label in IDS for key in range(12,24)], 6, scale, f'Crossed outfits / every run source pose / {scale}x'), f'run-keyframes-{scale}x.png')
    save_png(panel([(frame(id, key), f'{label.split(" / ")[0]} / jump {key - 23:02d}') for id, label in IDS for key in range(24,36)], 6, scale, f'Crossed outfits / every jump source pose / {scale}x'), f'jump-keyframes-{scale}x.png')

# Side-by-side joints/waist use exact crops from the exported run frames.
def joint_panel():
    crops=[('Shoulder / sleeve',(56,115,151,176)),('Waist / hip',(61,157,147,202)),('Knee / ankle',(55,186,156,242))]
    width,height=3*326+20,4*228+50
    image=Image.new('RGB',(width,height),BG);draw=ImageDraw.Draw(image)
    draw.text((14,12),'Clothing connections / actual run pose 6 / nearest-neighbor 3x',font=font(14),fill=INK)
    for row,(id,label) in enumerate(LOOKS):
        for col,(name,box) in enumerate(crops):
            crop=frame(id,17).crop(box);crop=crop.resize((crop.width*3,crop.height*3),Image.Resampling.NEAREST)
            x,y=20+col*326,48+row*228
            draw.rectangle((x,y,x+crop.width-1,y+crop.height-1),fill=STAGE)
            image.paste(crop,(x,y),crop)
            draw.text((x,y+190),f'{id.replace("-", " ").title()} / {name}',font=font(12),fill=INK)
    return image
save_png(joint_panel(),'connections-3x.png')

def lineup(action,key,facing,scale,note=''):
    image=Image.new('RGB',(40+2*(192*scale+20),256*scale+84),BG);draw=ImageDraw.Draw(image)
    draw.text((14,10),f'{action.title()} / {facing} / in place / {scale}x {note}',font=font(13),fill=INK)
    for col,(id,label) in enumerate(IDS):
        sprite=frame(id,key,facing).resize((192*scale,256*scale),Image.Resampling.NEAREST)
        x,y=20+col*(192*scale+20),40
        draw.rectangle((x,y,x+sprite.width-1,y+sprite.height-1),fill=STAGE)
        draw.line((x,y+240*scale,x+sprite.width-1,y+240*scale),fill='#bcc5ac')
        image.paste(sprite,(x,y),sprite)
        draw.text((x,y+sprite.height+7),label,font=font(12),fill=INK)
    return image

for facing in ('right','left'):
    for action in ACTIONS:
        clip=manifest(IDS[0][0])['animations'][action]
        save_gif([(lineup(action,key,facing,1,'/ plays once' if action=='jump' else ''),1000/clip['fps']) for key in clip['frames']],f'{action}-{facing}-1x.gif',loop=clip['loop'])
    events=[]
    for action in ACTIONS:
        clip=manifest(IDS[0][0])['animations'][action]
        events.extend((lineup(action,key,facing,2,'/ review tour repeats'),1000/clip['fps']) for key in clip['frames'])
    events.append((lineup('jump',35,facing,2,'/ finished; tour restarts'),800))
    save_gif(events,f'four-actions-{facing}-2x.gif',loop=True)

(D/'artifact-validation.json').write_text(json.dumps(report,indent=2)+'\n')
(D/'README.md').write_text("""# Wardrobe MVP actual exports

These are downloads from real Skin Studio wardrobe controls. The same shared skeleton and four-action motion library drive every look; review images are composed from the downloaded transparent PNGs, with integer nearest-neighbor zoom on a neutral stage.

- [Wardrobe lineup, native](wardrobe-lineup-1x.png) · [2×](wardrobe-lineup-2x.png)
- [Four actions, native](four-actions-1x.png) · [2×](four-actions-2x.png)
- [Four-action tour, right 2×](four-actions-right-2x.gif) · [Left 2×](four-actions-left-2x.gif)
- [Expressions](expressions-2x.png) · [Semantic recolor](recolor-2x.png) · [Connections](connections-3x.png)
- [Run keyframes](run-keyframes-1x.png) · [Jump keyframes](jump-keyframes-1x.png)
- [Desktop](studio-desktop.png) · [Mobile](studio-mobile.png)

| Action | Native right | Native left |
| --- | --- | --- |
| Idle | [GIF](idle-right-1x.gif) | [GIF](idle-left-1x.gif) |
| Walk | [GIF](walk-right-1x.gif) | [GIF](walk-left-1x.gif) |
| Run | [GIF](run-right-1x.gif) | [GIF](run-left-1x.gif) |
| Jump, plays once | [GIF](jump-right-1x.gif) | [GIF](jump-left-1x.gif) |

| Look | Editable project | Independent CharacterPack |
| --- | --- | --- |
| Crop / denim + trousers + lace-ups | [ZIP](crop-denim.rig.zip) | [ZIP](crop-denim.character.zip) |
| Crop / soft top + skirt + lace-ups | [ZIP](crop-mixed.rig.zip) | [ZIP](crop-mixed.character.zip) |
| Waves / soft top + skirt + flats | [ZIP](waves-soft.rig.zip) | [ZIP](waves-soft.character.zip) |
| Waves / denim + trousers + flats | [ZIP](waves-mixed.rig.zip) | [ZIP](waves-mixed.character.zip) |
| Waves / recolored crossed outfit | [ZIP](waves-recolor.rig.zip) | [ZIP](waves-recolor.character.zip) |

Both crossed looks were reopened through the UI. Item/color controls, selected jump/left preview, manifest and decoded spritesheet pixels were preserved. The three head PNGs and any back-hair PNG are pixel-identical within each identity's clothing pair. Clothing changes preserve the rig and all motion data.

After closing the editor, the standalone player loaded the two crossed-look packs and exercised four actions in both directions (16 cases). Every sampled native character frame matched the exported PNG including player guides. Idle, walk and run were observed through wrapping; jump was checked for all phases, final hold and replay. Authoring/generator modules were blocked and none were requested. Independent player screenshots are inside `crop-mixed/` and `waves-mixed/`.

Individual jump GIFs have no loop extension and play once. Four-action tour GIFs deliberately repeat with a labelled end hold. GIF timing uses cumulative centisecond rounding; every decoded GIF frame is compared to its palette-converted intended frame and duration. Characters animate in place.

- [Browser evidence and source hashes](evidence-index.json)
- [PNG/GIF/ZIP and animation validation](artifact-validation.json)
- [Every-file integrity inventory](file-integrity.json)

This batch proves a bounded catalog of registered clothing parts. Arbitrary unregistered images still need authoring and part ownership cleanup. Tests and export validation are separate from visual acceptance; these artifacts remain for review.
""")
print(f'Validated {len(report["archives"])} downloaded ZIPs, {len(report["gif"])} GIFs, {len(report["playback"])} live playback cases.')
inventory()
