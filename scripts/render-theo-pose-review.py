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
assert PHASE == 'final' or PHASE.startswith('iterations/') and all(c.islower() or c.isdigit() or c in '-/' for c in PHASE)
D = ROOT / 'docs/theo-pose-study' / PHASE
BG, STAGE, INK = '#f6f2e9', '#e8ecdf', '#45493d'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = lambda size=13: ImageFont.truetype(FONT, size)
sha = lambda data: hashlib.sha256(data).hexdigest()
IDS = [('before', 'Previous Theo'), ('new-art-old-run', 'New art / old run'), ('theo-study', 'New art / tuned run')]
ALL_IDS = ['before', 'new-art-old-run', 'theo-study', 'theo-gentle', 'theo-joyful', 'theo-recolored']
ACTIONS = ['idle', 'walk', 'run', 'jump']
RUN_PHASES = ['Contact', 'Load / down', 'Push', 'Toe-off', 'Lift / flight', 'Fold / recover', 'Rear recovery', 'Pass', 'Advance', 'Extend / flight', 'Reach', 'Pre-contact']


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
report = {'source': 'Actual Theo pose-study Skin Studio-exported CharacterPack PNGs; nearest-neighbor integer scale, neutral review stage only. Source concept images are never substituted for rig outputs.', 'png': [], 'gif': [], 'archives': [], 'frames': [], 'playback': []}


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
assert len(evidence['playback']) == 10
assert len(evidence['identityChecks']) == 1
assert len(evidence['itemRoundtrips']) == 3
assert len(evidence['roundtrips']) == 2
assert len(evidence['exports']) == 6
assert len(evidence['topDyeChecks']) == 1
assert all(item['pngDecodePixelEquality'] and item['deterministicPixels'] for item in evidence['exports'])
assert evidence['topDyeChecks'][0]['allSourceColorsExact'] and evidence['topDyeChecks'][0]['allAlphasStable']
report['legacyCompatibility'] = evidence['legacyChecks']
report['sourceColorAndOwnership'] = evidence['topDyeChecks']
report['portableRoundtrips'] = {'identity': evidence['identityChecks'], 'clothing': evidence['itemRoundtrips'], 'projects': evidence['roundtrips']}
report['editorFrameChecks'] = len(evidence['editorFrames'])
for id in ALL_IDS:
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
    assert not clipped, f'{id}: visible pixels touch frame boundary: {clipped}'
    report['frames'].append({'id': id, 'all36FramesDecoded': True, 'binaryAlpha': True, 'clearBorders': True, 'mirrorRoundtripExact': True})

# Isolate the motion study from the art replacement. Other action changes belong
# to the new study's documented source fit, never the old golden files.
with zipfile.ZipFile(D/'new-art-old-run.rig.zip') as za, zipfile.ZipFile(D/'theo-study.rig.zip') as zb:
    a,b = json.loads(za.read('project.json')),json.loads(zb.read('project.json'))
    assert a['rig'] == b['rig']
    assert a['motions']['clips']['run'] != b['motions']['clips']['run']
    for action in ('idle','walk','jump'):
        assert a['motions']['clips'][action] == b['motions']['clips'][action]
        for key in set(manifest('theo-study')['animations'][action]['frames']):
            assert frame('new-art-old-run',key).tobytes() == frame('theo-study',key).tobytes()
    for name in za.namelist():
        if name.startswith('slots/'):
            ia=Image.open(io.BytesIO(za.read(name))).convert('RGBA')
            ib=Image.open(io.BytesIO(zb.read(name))).convert('RGBA')
            assert ia.tobytes()==ib.tobytes()
report['isolatedMotionComparison']={'sameArtworkAndRig':True,'idleWalkJumpPixelsExactBetweenNewArtVariants':True,'onlyRunClipChanged':True}

for scale in (1,2):
    save_png(panel([(frame(id,0),label) for id,label in (IDS[0],IDS[2])],2,scale,f'Theo / same actual idle frame / before and after / {scale}x'),f'before-after-standing-{scale}x.png')
    keys = [12,13,15,17,20,22]
    save_png(panel([(frame(id,key),f'{label} / run {key-11:02d}') for id,label in IDS for key in keys],6,scale,f'Actual exports / old art, new art, tuned run / matched keys / {scale}x'),f'before-after-run-keyframes-{scale}x.png')
    save_png(panel([(frame('theo-study',12+i),f'{i+1:02d} / {RUN_PHASES[i]}') for i in range(12)],6,scale,f'Theo study / all twelve exported run poses / {scale}x'),f'run-keyframes-{scale}x.png')
    save_png(panel([(frame('theo-study' if ex=='neutral' else f'theo-{ex}',0),ex.title()) for ex in ('neutral','gentle','joyful')],3,scale,f'Three complete expression heads / actual export / {scale}x'),f'expressions-{scale}x.png')
    save_png(panel([(frame('theo-study',key),action.title()) for action,key in [('idle',0),('walk',9),('run',17),('jump',29)]],4,scale,f'Final study / four actions / actual exports / {scale}x'),f'four-actions-{scale}x.png')

# Source art is explicitly labelled, never represented as a working rig output.
master_path=ROOT/'artwork/theo-pose-study/prepared/diagnostics/master-native.png'
with Image.open(master_path) as master:
    master.load(); master=master.convert('RGBA')
    assert master.size==(192,256)
    save_png(panel([(master,'Registered gentle source (not rig output)'),(frame('theo-gentle',0),'Actual gentle assembly export')],2,2,'Source master vs assembly / different production stages / same scale'),'source-master-vs-assembly-2x.png')
report['sourceConceptComparison']={'path':str(master_path.relative_to(ROOT)),'sha256':sha(master_path.read_bytes()),'explicitlyLabeledAsNotRigOutput':True,'matchedExpression':'gentle'}


def detail_panel(items, box, scale, title):
    width,height=(box[2]-box[0])*scale,(box[3]-box[1])*scale
    cw=width+24
    image=Image.new('RGB',(cw*len(items)+16,height+86),BG)
    draw=ImageDraw.Draw(image);draw.text((14,12),title,font=font(14),fill=INK)
    for index,(sprite,label) in enumerate(items):
        crop=sprite.crop(box).resize((width,height),Image.Resampling.NEAREST)
        x,y=16+index*cw,42
        draw.rectangle((x,y,x+width-1,y+height-1),fill=STAGE)
        image.paste(crop,(x,y),crop);draw.text((x,y+height+8),label,font=font(12),fill=INK)
    return image

save_png(detail_panel([(frame(id,0),label) for id,label in (IDS[0],IDS[2])],(37,47,155,145),4,'Theo / matched idle / head, jaw, neck, collar and shoulder / 4x'),'head-neck-before-after-4x.png')
save_png(detail_panel([(frame(id,17),label) for id,label in IDS],(35,109,158,189),4,'Theo / matched run key 06 / shoulders, hands, cuffs and waist / 4x'),'arms-waist-before-after-4x.png')
save_png(detail_panel([(frame(id,17),label) for id,label in IDS],(32,158,159,242),3,'Theo / matched run key 06 / pelvis, knees, ankles and shoes / 3x'),'legs-before-after-3x.png')
save_png(detail_panel([(frame('theo-study' if ex=='neutral' else f'theo-{ex}',0),ex.title()) for ex in ('neutral','gentle','joyful')],(38,40,155,128),4,'Theo / three registered complete expressions / actual exports / 4x'),'expressions-closeup-4x.png')
save_png(panel([(frame(id,key),label) for id,label in [('theo-study','Authored source colors'),('theo-recolored','Skin, hair, suit, trousers and shoes recolored')] for key in (0,17)],2,2,'Material ownership / same idle and run poses / actual exports'),'recolor-2x.png')


def pose_panel(action,key,facing,scale,ids=None,note=''):
    ids=ids or [('theo-study','Theo / final study')]
    return panel([(frame(id,key,facing),label) for id,label in ids],len(ids),scale,f'{action.title()} / {facing} / in place / {scale}x {note}')

for facing in ('right','left'):
    clip=manifest('theo-study')['animations']['run']
    for scale in (1,2):
        save_gif([(pose_panel('run',key,facing,scale),1000/clip['fps']) for key in clip['frames']],f'run-{facing}-{scale}x.gif',loop=True)
    assert all(manifest(id)['animations']['run']['fps']==clip['fps'] for id,_ in IDS)
    save_gif([(pose_panel('run',key,facing,1,IDS,'/ same timestamp'),1000/clip['fps']) for key in clip['frames']],f'run-comparison-{facing}-1x.gif',loop=True)
    tour=[]
    for action in ACTIONS:
        clip=manifest('theo-study')['animations'][action]
        tour.extend((pose_panel(action,key,facing,2,note='/ review tour repeats'),1000/clip['fps']) for key in clip['frames'])
    tour.append((pose_panel('jump',35,facing,2,note='/ finished; tour restarts'),800))
    save_gif(tour,f'four-actions-{facing}-2x.gif',loop=True)
for action in ('idle','jump'):
    clip=manifest('theo-study')['animations'][action]
    save_gif([(pose_panel(action,key,'right',2,note='/ plays once' if action=='jump' else ''),1000/clip['fps']) for key in clip['frames']],f'{action}-right-2x.gif',loop=clip['loop'])
(D/'artifact-validation.json').write_text(json.dumps(report,indent=2)+'\n')
inventory()
print(f"Validated {len(report['archives'])} archives, {len(report['frames'])*36} exported poses, {len(report['gif'])} GIFs, {len(report['playback'])} isolated playback cases.")
