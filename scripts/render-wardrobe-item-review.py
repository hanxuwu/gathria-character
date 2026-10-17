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
import zipfile

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / 'docs/wardrobe-items'
BG, STAGE, INK = '#f6f2e9', '#e8ecdf', '#45493d'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = lambda size=13: ImageFont.truetype(FONT, size)
sha = lambda data: hashlib.sha256(data).hexdigest()
IDS = [('crop-custom', 'Crop / embroidered denim'), ('waves-custom', 'Waves / same item recolored')]
LOOKS = [('crop-baseline', 'Before / original registered jacket'), ('crop-custom', 'After / authored embroidery'), ('waves-custom', 'Waves / same item and new colors'), ('waves-joyful', 'Waves / joyful expression')]
ACTIONS = ['idle', 'walk', 'run', 'jump']
PHASES = ['Ready', 'Anticipation', 'Compression', 'Takeoff', 'Ascent', 'Apex', 'Float', 'Descent', 'Contact', 'Landing', 'Recovery', 'Ready']


def inventory():
    report = {'scope': 'Every delivered file under docs/wardrobe-items, excluding this inventory.', 'counts': {}, 'files': []}
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
    path=D/record['file']; assert sha(path.read_bytes())==record['sha256']
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        assert sorted(archive.namelist())==sorted(record['members'])
        for name,info in record['members'].items():
            data=archive.read(name); assert data and sha(data)==info['sha256']
            if name.endswith('.png'):
                with Image.open(io.BytesIO(data)) as im:
                    im.load(); assert im.mode=='RGBA' and set(im.getchannel('A').tobytes())=={0,255}
            elif name.endswith('.json'):json.loads(data)
    report['archives'].append({'file':record['file'],'crcVerified':True,'allMembersDecodedAndHashed':True,'sha256':record['sha256']})

for item in evidence['legacyChecks']:
    assert item['all36FramePixelsExact'] and item['manifestExact']
report['legacyCompatibility']=evidence['legacyChecks']
for case in evidence['playback']:
    assert sorted(case['expectedFrames'])==sorted(case['matchedFrames'])
    if case['action']=='jump':
        assert case['finalPosition']==11 and case['replayStartedAtFirstFrameAndCompleted']
        assert [item['frame'] for item in case['transitions']]==list(range(24,36))
    else: assert case['finalPosition']>=len(case['expectedFrames'])
    report['playback'].append({'id':case['id'],'facing':case['facing'],'action':case['action'],'fullNativePngPixelsAndSequenceVerified':True,'loopOrOneShotReplayVerified':True})

for id,_ in LOOKS:
    m=manifest(id)
    assert list(m['animations'])==ACTIONS and len(m['frames'])==36
    assert m['anchor']=={'x':96,'y':240,'units':'pixels','origin':'top-left'}
    for f in m['frames']:
        rgba=frame(id,f['id']);assert rgba.size==(192,256)
        alpha=rgba.getchannel('A');assert alpha.getbbox() and set(alpha.tobytes())=={0,255}
        for edge in [(0,0,192,1),(0,255,192,256),(0,0,1,256),(191,0,192,256)]:
            assert alpha.crop(edge).getbbox() is None,(id,f['id'],edge)
        assert frame(id,f['id'],'left').transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes()==rgba.tobytes()
    report['frames'].append({'id':id,'all36FramesDecoded':True,'binaryAlpha':True,'clearBorders':True,'mirrorRoundtripExact':True})

for scale in (1,2):
    save_png(panel([(frame(id,0),label)for id,label in LOOKS],4,scale,f'Reusable custom clothing / actual export / {scale}x'),'item-lineup-'+str(scale)+'x.png')
    save_png(panel([(frame(id,key),f'{label.split(" / ")[0]} / {action}')for id,label in IDS for action,key in [('idle',0),('walk',9),('run',17),('jump',29)]],4,scale,f'One imported top / same four-action skeleton / {scale}x'),'four-actions-'+str(scale)+'x.png')
save_png(panel([(frame(id,key),f'{id.split("-")[0].title()} / run {key-11:02d}')for id,_ in IDS for key in range(12,24)],6,1,'Imported top / every run pose / actual export / 1x'),'run-keyframes-1x.png')

# A matched detail comparison proves source editing; it is not a new full-art claim.
image=Image.new('RGB',(590,360),BG);draw=ImageDraw.Draw(image)
draw.text((14,12),'Original jacket vs imported embroidery / actual export / 4x',font=font(14),fill=INK)
for col,(id,label) in enumerate([('crop-baseline','Original registered source'),('crop-custom','Imported PNG + fixed detail mask')]):
    crop=frame(id,0).crop((65,109,132,181));crop=crop.resize((268,288),Image.Resampling.NEAREST)
    x,y=18+col*288,40;draw.rectangle((x,y,x+267,y+287),fill=STAGE);image.paste(crop,(x,y),crop)
    draw.text((x,y+295),label,font=font(11),fill=INK)
save_png(image,'custom-detail-before-after-4x.png')

def lineup(action,key,facing,scale,note=''):
    image=Image.new('RGB',(40+2*(192*scale+20),256*scale+84),BG);draw=ImageDraw.Draw(image)
    draw.text((14,10),f'{action.title()} / {facing} / in place / {scale}x {note}',font=font(13),fill=INK)
    for col,(id,label) in enumerate(IDS):
        sprite=frame(id,key,facing).resize((192*scale,256*scale),Image.Resampling.NEAREST)
        x,y=20+col*(192*scale+20),40;draw.rectangle((x,y,x+sprite.width-1,y+sprite.height-1),fill=STAGE)
        draw.line((x,y+240*scale,x+sprite.width-1,y+240*scale),fill='#bcc5ac');image.paste(sprite,(x,y),sprite)
        draw.text((x,y+sprite.height+7),label,font=font(12),fill=INK)
    return image
for facing in ('right','left'):
    for scale in (1,2):
        events=[]
        for action in ACTIONS:
            clip=manifest(IDS[0][0])['animations'][action]
            events.extend((lineup(action,key,facing,scale,'/ review tour repeats'),1000/clip['fps'])for key in clip['frames'])
        events.append((lineup('jump',35,facing,scale,'/ finished; tour restarts'),800))
        save_gif(events,f'four-actions-{facing}-{scale}x.gif',loop=True)
    clip=manifest(IDS[0][0])['animations']['jump']
    save_gif([(lineup('jump',key,facing,1,'/ plays once'),1000/clip['fps'])for key in clip['frames']],f'jump-{facing}-1x.gif',loop=False)

(D/'artifact-validation.json').write_text(json.dumps(report,indent=2)+'\n')
(D/'README.md').write_text('''# Imported wardrobe item review

All character images and GIFs are made from CharacterPacks downloaded through the real Skin Studio. Images use nearest-neighbor integer zoom on a neutral preview stage. No new generative artwork is presented as implementation evidence.

- [Native lineup](item-lineup-1x.png) · [2× lineup](item-lineup-2x.png)
- [Original vs authored jacket detail, 4×](custom-detail-before-after-4x.png)
- [Four actions, native](four-actions-1x.png) · [2×](four-actions-2x.png)
- [Four-action tour right, 2×](four-actions-right-2x.gif) · [Left, 2×](four-actions-left-2x.gif)
- [Right native](four-actions-right-1x.gif) · [Left native](four-actions-left-1x.gif)
- [Jump plays once, right](jump-right-1x.gif) · [Left](jump-left-1x.gif)
- [Run keyframes](run-keyframes-1x.png) · [Studio workflow](studio-workflow.png) · [Mobile](studio-mobile.png)

| Download | Portable editable project | Independent CharacterPack |
| --- | --- | --- |
| Crop / custom embroidered denim | [Project ZIP](crop-custom.rig.zip) | [CharacterPack ZIP](crop-custom.character.zip) |
| Waves / same imported item recolored | [Project ZIP](waves-custom.rig.zip) | [CharacterPack ZIP](waves-custom.character.zip) |
| Waves / joyful | [Project ZIP](waves-joyful.rig.zip) | [CharacterPack ZIP](waves-joyful.character.zip) |

The [custom clothing ZIP](embroidered-denim.wardrobe.zip) derives from the application-exported [denim template](denim-top-template.wardrobe.zip). The capture script adds a small embroidered flower badge on existing upper-material torso pixels at (81,138), changes those pixels to fixed material 0, and retains the existing alpha, joints and source extent. This demonstrates a real source-art edit that remains visible while the jacket is recolored, with identical skeleton and motion data. It is a workflow sample, not a full new outfit art batch. No image-generation API was used. Full attribution and derivation remain in item.json, the portable project library, and CharacterPack provenance.

[Registered trousers](bottom-registered.wardrobe.zip) and [registered lace-ups](shoes-registered.wardrobe.zip) are renamed, visually unchanged templates used to verify all three clothing groups. Their saved item ZIPs have identical decoded PNG/mask pixels and metadata after UI import/export. The Waves project embeds all three custom items; it reopened after reloading the editor and exported an identical manifest and spritesheet.

The editor was closed before the independent player loaded the Waves CharacterPack. All four actions were checked in both directions (8 complete playback cases); every native frame matched its exported PNG, loops wrapped, and jump held its last pose and replayed. Authoring/generator modules were blocked, none were requested, and there were no external requests or browser errors. [Right player screenshot](waves-custom/independent-jump-right.png) · [Left](waves-custom/independent-jump-left.png).

Both earlier version-1 wardrobe projects (crop-mixed and waves-mixed) were reopened and re-exported: all 72 frame pixels and both manifests were identical to the prior checked-in exports. Full current results are recorded in [evidence-index.json](evidence-index.json).

GIF timing uses cumulative centisecond rounding. Every decoded GIF frame and duration is compared with the intended palette-converted exported frame. Individual jump GIFs have no loop extension; the four-action review tour deliberately repeats after a labelled hold. All characters animate in place.

- [Browser evidence and source hashes](evidence-index.json)
- [PNG/GIF/ZIP decoding and playback validation](artifact-validation.json)
- [Every-file integrity inventory](file-integrity.json)

This feature accepts registered, split clothing on the existing 192×256 skeleton; it does not automatically segment or rig arbitrary illustrations. The existing collar remnant and bent-knee texture compression remain inherited art limitations. Functional verification and visual acceptance are separate; these previews are available for review.
''')
print(f'Validated {len(report["archives"])} ZIPs, {len(report["gif"])} GIFs, {len(report["playback"])} independent playback cases.')
inventory()
