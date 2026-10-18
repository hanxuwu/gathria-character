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
D = ROOT / 'docs/theo-passing-poses' / PHASE
BG, STAGE, INK = '#f6f2e9', '#e8ecdf', '#45493d'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = lambda size=13: ImageFont.truetype(FONT, size)
sha = lambda data: hashlib.sha256(data).hexdigest()
IDS = [('before', 'Before / run repair'), ('theo-passing', 'After / passing poses')]
ALL_IDS = ['before', 'legs-only', 'shoes-only', 'theo-passing', 'theo-joyful', 'theo-recolored']
ACTIONS = ['idle', 'walk', 'run', 'jump']
RUN_PHASES = ['Near contact', 'Near load', 'Near toe-off', 'Flight', 'Flight', 'Reach to far contact', 'Far contact', 'Far load', 'Far toe-off', 'Flight', 'Flight', 'Reach to near contact']


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
report = {'source': 'Actual Theo passing-pose Skin Studio-exported CharacterPack PNGs; nearest-neighbor integer scale, neutral review stage only. Source concept images are never substituted for rig outputs.', 'png': [], 'gif': [], 'archives': [], 'frames': [], 'playback': []}


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
        assert [item['frame'] for item in case['transitions']] == list(range(24,36))
    else:
        assert case['finalPosition'] >= len(case['expectedFrames'])
    report['playback'].append({'id':case['id'],'facing':case['facing'],'action':case['action'],'fullNativePngPixelsAndSequenceVerified':True,'loopOrOneShotReplayVerified':True,'timingVerified':True})
assert len(evidence['legacyChecks']) == 2
assert evidence['legacyChecks'][1]['all36FramesExact'] and evidence['legacyChecks'][1]['motionVersion'] == 1
assert evidence['legacyChecks'][0]['all36FramesExact'] and evidence['legacyChecks'][0]['manifestExact']
assert len(evidence['playback']) == 10
assert len(evidence['itemRoundtrips']) == 2
assert len(evidence['roundtrips']) == 2
assert len(evidence['exports']) == 6
assert len(evidence['topDyeChecks']) == 1
assert all(item['pngDecodePixelEquality'] and item['deterministicPixels'] for item in evidence['exports'])
assert evidence['topDyeChecks'][0]['allSourceColorsExact'] and evidence['topDyeChecks'][0]['allAlphasStable']
report['legacyCompatibility'] = evidence['legacyChecks']
report['sourceColorAndOwnership'] = evidence['topDyeChecks']
report['portableRoundtrips'] = {'clothing':evidence['itemRoundtrips'],'projects':evidence['roundtrips']}
report['editorFrameChecks'] = len(evidence['editorFrames'])
for id in ALL_IDS:
    m=manifest(id)
    assert list(m['animations']) == ACTIONS and len(m['frames']) == 36
    assert m['anchor'] == {'x':96,'y':240,'units':'pixels','origin':'top-left'}
    clipped=[]
    for f in m['frames']:
        rgba=frame(id,f['id']); assert rgba.size==(192,256)
        alpha=rgba.getchannel('A'); assert alpha.getbbox() and set(alpha.tobytes())=={0,255}
        for edge in [(0,0,192,1),(0,255,192,256),(0,0,1,256),(191,0,192,256)]:
            if alpha.crop(edge).getbbox() is not None: clipped.append({'frame':f['id'],'edge':edge})
        assert frame(id,f['id'],'left').transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes()==rgba.tobytes()
    assert not clipped, f'{id}: frame boundary pixels {clipped}'
    report['frames'].append({'id':id,'all36FramesDecoded':True,'binaryAlpha':True,'clearBorders':True,'mirrorRoundtripExact':True})

# Report silhouette/pixel changes without mistaking numerical changes for visual approval.
from PIL import ImageChops
regression=[]
for action in ACTIONS:
    for key in set(manifest('theo-passing')['animations'][action]['frames']):
        a,b=frame('before',key),frame('theo-passing',key)
        diff=ImageChops.difference(a,b)
        changed=sum(any(pixel) for pixel in diff.getdata())
        alpha_diff=ImageChops.difference(a.getchannel('A'),b.getchannel('A'))
        regression.append({'action':action,'frameId':key,'changedPixels':changed,'differenceBounds':diff.convert('RGB').getbbox(),'alphaChangedPixels':sum(value!=0 for value in alpha_diff.getdata()),'beforeBounds':a.getbbox(),'afterBounds':b.getbbox(),'top100RowsExact':a.crop((0,0,192,100)).tobytes()==b.crop((0,0,192,100)).tobytes()})
report['sameFramePixelComparisons']=regression
assert all(r['changedPixels']==0 for r in regression if r['action']!='run'), 'Non-run rendered pixels changed'
report['nonRunChangeScope']='All 15 existing base RGBA arrays, anatomical bindings, and all motion clips remain exact. Idle/walk/jump rendered pixels are exact; new registered variants apply only to run.'
assert evidence['regression'][0]['motionsExact'] and evidence['regression'][0]['bindingsExact']
assert len(evidence['regression'][0]['unchangedSourceSlots']) >= 15
report['isolatedContributions']=[]
for id in ('legs-only','shoes-only'):
    for action in ACTIONS:
        changes=[]
        for key in sorted(set(manifest(id)['animations'][action]['frames'])):
            a,b=frame('before',key),frame(id,key);diff=ImageChops.difference(a,b)
            count=sum(any(pixel) for pixel in diff.getdata());changes.append({'frameId':key,'changedPixels':count,'bounds':diff.convert('RGB').getbbox()})
        if action!='run': assert all(r['changedPixels']==0 for r in changes), f'{id}/{action}: non-run changed'
        report['isolatedContributions'].append({'id':id,'action':action,'frames':changes})
report['sourceIdentityUnchanged']=evidence['regression'][0]['unchangedSourceSlots']

geometry=[]
for record in evidence['regression'][0]['records']:
    keys=[]
    for pose in record['keys']:
        limbs={limb['id']:limb['bones'] for limb in pose['limbs']}
        legs=[]
        for side in ('near','far'):
            hip,knee,ankle=limbs[side+'Leg']
            length=math.dist(hip,knee)+math.dist(knee,ankle)
            distance=math.dist(hip,ankle)
            legs.append({'side':side,'hip':hip,'knee':knee,'ankle':ankle,'chainLength':length,'hipAnkleDistance':distance,'extensionRatio':distance/length})
        keys.append({'key':pose['index'],'nearFarAnkleDistance':math.dist(limbs['nearLeg'][2],limbs['farLeg'][2]),'nearMinusFarAnkleX':limbs['nearLeg'][2][0]-limbs['farLeg'][2][0],'legs':legs})
    deltas={}
    for side in ('near','far'):
        ankles=[next(leg['ankle'] for leg in key['legs'] if leg['side']==side) for key in keys]
        changes=[(ankles[(i+1)%12][0]-a[0],ankles[(i+1)%12][1]-a[1]) for i,a in enumerate(ankles)]
        deltas[side]={'maxConsecutiveAbsDeltaX':max(abs(x) for x,y in changes),'maxConsecutiveAbsDeltaY':max(abs(y) for x,y in changes),'loopClosingDelta':changes[-1]}
    geometry.append({'id':record['id'],'source':'Renderer inspection of same imported/exported project, accompanies actual PNGs; joint metrics alone do not imply clean silhouettes.','keys':keys,'ankleStepDeltas':deltas})
report['runJointGeometry']=geometry
report['actualRunSoleBounds']=[]
final_keys=next(record for record in evidence['regression'][0]['records'] if record['id']=='theo-passing')['run']['keys']
for i,key in enumerate(final_keys):
    actual=frame('theo-passing',12+i).getbbox()[3]-1
    target=239-min(key['footLift'],final_keys[(i+6)%12]['footLift'])
    report['actualRunSoleBounds'].append({'key':i,'actualLowestOpaquePixelY':actual,'targetLowestSoleY':target,'difference':actual-target})

for scale in (1,2):
    save_png(panel([(frame(id,0),label) for id,label in IDS],2,scale,f'Same idle pose / before and after / {scale}x'),'before-after-standing-%dx.png'%scale)
    save_png(panel([(frame(id,12+i),f'{label} / pose {i+1:02d}') for id,label in IDS for i in range(12)],6,scale,f'Actual exports / all twelve matched run poses / {scale}x'),f'before-after-run-keyframes-{scale}x.png')
    save_png(panel([(frame('theo-passing',12+i),f'{i+1:02d} / {RUN_PHASES[i]}') for i in range(12)],6,scale,f'Passing poses / actual exported key poses / {scale}x'),f'run-keyframes-{scale}x.png')
    save_png(panel([(frame('theo-passing',key),action.title()) for action,key in [('idle',0),('walk',9),('run',17),('jump',29)]],4,scale,f'Actual exports / same character / four actions / {scale}x'),f'four-actions-{scale}x.png')
with Image.open(D/'editor/theo-gentle/idle-right-1x.png') as gentle:
    gentle.load();gentle=gentle.convert('RGBA');assert gentle.size==(192,256)
    save_png(panel([(frame('theo-passing',0),'Neutral / exported pack'),(gentle,'Gentle / actual Studio canvas'),(frame('theo-joyful',0),'Joyful / exported pack')],3,2,'Three expressions / actual application output / 2x'),'expressions-2x.png')

def detail_panel(items,box,scale,title,columns=None):
    width,height=(box[2]-box[0])*scale,(box[3]-box[1])*scale
    columns=columns or len(items);cw,ch=width+24,height+44
    image=Image.new('RGB',(cw*columns+16,ch*math.ceil(len(items)/columns)+50),BG)
    draw=ImageDraw.Draw(image);draw.text((14,12),title,font=font(14),fill=INK)
    for index,(sprite,label) in enumerate(items):
        crop=sprite.crop(box).resize((width,height),Image.Resampling.NEAREST)
        x,y=16+(index%columns)*cw,42+(index//columns)*ch
        draw.rectangle((x,y,x+width-1,y+height-1),fill=STAGE)
        image.paste(crop,(x,y),crop);draw.text((x,y+height+8),label,font=font(12),fill=INK)
    return image
save_png(detail_panel([(frame(id,0),label) for id,label in IDS],(35,45,158,146),4,'Unchanged head/neck / actual same idle pose / 4x'),'head-neck-before-after-4x.png')
for name,box,scale in [('shoulder-cuff',(28,111,165,188),4),('knee-ankle',(29,164,165,244),3)]:
    save_png(detail_panel([(frame(id,12+i),f'{label} / {i+1:02d}') for i in (0,3,6,8,9,11) for id,label in IDS],box,scale,f'{name} / matched actual exported poses / {scale}x',4),f'{name}-before-after-{scale}x.png')
save_png(detail_panel([(frame(id,12+i),f'{label} / {i+1:02d}') for i in (6,7,8,9) for id,label in IDS],(24,161,173,246),4,'Passing and deep-bend poses / matched actual exports / 4x',4),'passing-07-10-before-after-4x.png')
for scale in (1,2):
    save_png(panel([(frame(id,12+i),f'{label} / {i+1:02d}') for i in (6,7,8,9) for id,label in [('before','Baseline'),('legs-only','Bent legs only'),('shoes-only','Run shoes only'),('theo-passing','Both alternatives')]],4,scale,f'Isolated contributions / actual UI exports / {scale}x'),f'isolated-contributions-{scale}x.png')
source_items=[]
for side in ('near','far'):
    def source(slot):
        with Image.open(D/'isolated/theo-passing'/f'{slot}-1x.png') as im:
            im.load();return im.convert('RGBA')
    base=Image.alpha_composite(source(side+'-thigh'),source(side+'-shin'))
    source_items += [(base,side+' / base thigh + shin'),(source(side+'-leg-bent'),side+' / authored bent leg'),(source(side+'-shoe'),side+' / base shoe'),(source(side+'-shoe-run'),side+' / authored run shoe')]
save_png(detail_panel(source_items,(20,150,175,250),3,'Registered source attachments / actual Studio source canvas / not posed output',4),'source-variants-vs-base-3x.png')
save_png(panel([(frame(id,key),label) for id,label in [('theo-passing','Authored colors'),('theo-recolored','Recolored / same geometry')] for key in (0,17)],2,2,'Five material channels / actual exports'),'recolor-2x.png')

def pose_panel(action,key,facing,scale,ids=None,note=''):
    ids=ids or [('theo-passing','Theo / passing poses')]
    return panel([(frame(id,key,facing),label) for id,label in ids],len(ids),scale,f'{action.title()} / {facing} / in place / {scale}x {note}')
for facing in ('right','left'):
    clip=manifest('theo-passing')['animations']['run'];old=manifest('before')['animations']['run']
    assert clip['fps']==old['fps'] and clip['frames']==old['frames'],'Matched comparison requires same frame order and rhythm'
    for scale in (1,2):
        save_gif([(pose_panel('run',key,facing,scale),1000/clip['fps']) for key in clip['frames']],f'run-{facing}-{scale}x.gif',loop=True)
        save_gif([(pose_panel('run',key,facing,scale,[IDS[0]]),1000/old['fps']) for key in old['frames']],f'before-run-{facing}-{scale}x.gif',loop=True)
        save_gif([(pose_panel('run',key,facing,scale,IDS,'/ same timestamp'),1000/clip['fps']) for key in clip['frames']],f'run-comparison-{facing}-{scale}x.gif',loop=True)
    tour=[]
    for action in ACTIONS:
        clip=manifest('theo-passing')['animations'][action]
        tour.extend((pose_panel(action,key,facing,2,note='/ review tour repeats'),1000/clip['fps']) for key in clip['frames'])
    tour.append((pose_panel('jump',35,facing,2,note='/ finished; tour restarts'),800))
    save_gif(tour,f'four-actions-{facing}-2x.gif',loop=True)
for action in ('idle','jump'):
    clip=manifest('theo-passing')['animations'][action]
    save_gif([(pose_panel(action,key,'right',2,note='/ plays once' if action=='jump' else ''),1000/clip['fps']) for key in clip['frames']],f'{action}-right-2x.gif',loop=clip['loop'])
(D/'artifact-validation.json').write_text(json.dumps(report,indent=2)+'\n')
inventory()
print(f"Validated {len(report['archives'])} archives, {len(report['frames'])*36} exported poses, {len(report['gif'])} GIFs, {len(report['playback'])} isolated playback cases.")
