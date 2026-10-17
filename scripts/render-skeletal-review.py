"""Native/integer-zoom review art from actual exported skeletal-trial packs.

No concept artwork is substituted. GIF RGB palettes are shared per clip and
validated after decoding; PNG/ZIP checks refer to the original RGBA sprites.
"""
from pathlib import Path
from functools import lru_cache
import hashlib
import json
import math
import os
import zipfile
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
iteration = os.environ.get('SKELETAL_ITERATION')
assert not iteration or all(c.isascii() and (c.isalnum() or c in '_-') for c in iteration)
D = ROOT / 'docs/skeletal-rig'
if iteration:
    D = D / 'iterations' / iteration
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BG, STAGE, INK = '#f6f2e9', '#e8ecdf', '#45493d'
font = lambda size=13: ImageFont.truetype(FONT, size)
STAGES = [('baseline', 'Production Motion 3'), ('experimental', 'Own skeletal trial')]
report = {'source': 'Actual browser-exported CharacterPack PNGs; nearest-neighbor integer zoom; neutral preview background.', 'iteration': iteration, 'packs': [], 'png': [], 'gif': []}
sha = lambda data: hashlib.sha256(data).hexdigest()

@lru_cache(None)
def manifest(stage):
    return json.loads((D / stage / 'manifest.json').read_text())

@lru_cache(None)
def sheet(stage):
    with Image.open(D / stage / 'spritesheet.png') as image:
        image.load()
        assert image.mode == 'RGBA', f'{stage}: spritesheet must retain alpha'
        return image.copy()

def frame(stage, frame_id, facing='right'):
    f = next(f for f in manifest(stage)['frames'] if f['id'] == frame_id)
    image = sheet(stage).crop((f['x'], f['y'], f['x'] + f['width'], f['y'] + f['height']))
    return image.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if facing == 'left' else image

def save_png(image, filename):
    target = D / filename
    temp = target.with_suffix('.tmp.png')
    image.save(temp)
    with Image.open(temp) as check:
        check.load()
        assert check.size == image.size and check.tobytes() == image.tobytes(), filename
    temp.replace(target)
    report['png'].append({'file': filename, 'dimensions': list(image.size), 'bytes': target.stat().st_size, 'sha256': sha(target.read_bytes()), 'decodedPixelEquality': True})

def panel(items, columns, scale=1, crop=None, title='Actual exports'):
    w, h = (crop[2] - crop[0], crop[3] - crop[1]) if crop else (192, 256)
    cw, ch = w * scale + 20, h * scale + 38
    result = Image.new('RGB', (cw * columns + 20, ch * math.ceil(len(items) / columns) + 54), BG)
    draw = ImageDraw.Draw(result)
    draw.text((14, 12), title, font=font(15), fill=INK)
    for i, (stage, frame_id, label) in enumerate(items):
        image = frame(stage, frame_id)
        if crop:
            image = image.crop(crop)
        image = image.resize((w * scale, h * scale), Image.Resampling.NEAREST)
        x, y = 20 + (i % columns) * cw, 48 + (i // columns) * ch
        draw.rectangle((x, y, x + image.width - 1, y + image.height - 1), fill=STAGE)
        result.paste(image, (x, y), image)
        draw.text((x, y + image.height + 6), label, font=font(12), fill=INK)
    return result

def pair_scene(frame_id, facing, scale=2):
    w, h = 192 * scale, 256 * scale
    result = Image.new('RGB', (40 + (w + 16) * 2, h + 70), BG)
    draw = ImageDraw.Draw(result)
    for column, (stage, label) in enumerate(STAGES):
        x, y = 20 + column * (w + 16), 35
        draw.text((x, 11), label, font=font(14), fill=INK)
        draw.rectangle((x, y, x + w - 1, y + h - 1), fill=STAGE)
        image = frame(stage, frame_id, facing).resize((w, h), Image.Resampling.NEAREST)
        result.paste(image, (x, y), image)
        draw.text((x, h + 42), f'Run {facing} / key {frame_id - 12:02d} / {scale}x / in place', font=font(12), fill=INK)
    return result

def save_gif(events, filename):
    images = [image for image, _ in events]
    assert images and len(set(image.size for image in images)) == 1
    # One palette across the clip prevents palette changes from imitating shimmer.
    strip = Image.new('RGB', (images[0].width, images[0].height * len(images)))
    for i, image in enumerate(images):
        strip.paste(image, (0, i * image.height))
    palette = strip.quantize(colors=256, dither=Image.Dither.NONE)
    indexed = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in images]
    total, prior, durations = 0, 0, []
    for _, duration in events:
        total += duration
        target = round(total / 10) * 10
        durations.append(target - prior)
        prior = target
    assert min(durations) > 0, 'GIF event shorter than representable duration'
    expected = []
    for image, duration in zip(indexed, durations):
        digest = sha(image.convert('RGB').tobytes())
        if expected and expected[-1][0] == digest:
            expected[-1][1] += duration
        else:
            expected.append([digest, duration])
    target = D / filename
    temp = target.with_suffix('.tmp.gif')
    indexed[0].save(temp, save_all=True, append_images=indexed[1:], duration=durations, loop=0, disposal=1, optimize=False)
    decoded = []
    with Image.open(temp) as image:
        assert image.info['loop'] == 0 and image.size == images[0].size
        for i in range(image.n_frames):
            image.seek(i)
            image.load()
            decoded.append([sha(image.convert('RGB').tobytes()), image.info['duration']])
    assert decoded == expected, f'{filename}: decoded frame order or duration changed'
    assert sum(x[1] for x in decoded) == round(total / 10) * 10
    temp.replace(target)
    report['gif'].append({'file': filename, 'dimensions': list(images[0].size), 'logicalFrames': len(events), 'decodedFrames': len(decoded), 'durationMs': sum(x[1] for x in decoded), 'idealDurationMs': total, 'frameDurationsMs': [x[1] for x in decoded], 'decodedFrameSha256': [x[0] for x in decoded], 'sha256': sha(target.read_bytes()), 'bytes': target.stat().st_size})

# Verify the entire source archive and every frame before deriving any review art.
evidence = json.loads((D / 'evidence-index.json').read_text())
report['playbackTiming'] = []
for case in evidence['playback']:
    count = len(case['expectedFrames'])
    transitions = case['transitions']
    loops = [transitions[i + count]['ms'] - transitions[i]['ms']
             for i in range(1, len(transitions) - count)
             if transitions[i]['frame'] == transitions[i + count]['frame']]
    assert loops and max(abs(ms - case['nominalLoopMs']) for ms in loops) < 75
    report['playbackTiming'].append({'animation': case['animation'], 'facing': case['facing'],
                                   'nominalLoopMs': case['nominalLoopMs'],
                                   'observedLoopMs': loops, 'maxErrorBelow75ms': True})
for stage, _ in STAGES:
    archive = D / f'{stage}.character.zip'
    exported = next(x for x in evidence['exports'] if x['id'] == stage)
    assert sha(archive.read_bytes()) == exported['zipSha256']
    with zipfile.ZipFile(archive) as package:
        assert package.testzip() is None
        assert sorted(package.namelist()) == sorted(['spritesheet.png', 'manifest.json', 'character.json', 'INTEGRATION.md', 'PROVENANCE.txt'])
        for name in package.namelist():
            data = package.read(name)
            assert data and data == (D / stage / name).read_bytes()
            assert sha(data) == exported['members'][name]['sha256']
    metadata = manifest(stage)
    assert sheet(stage).size == (metadata['spritesheet']['width'], metadata['spritesheet']['height'])
    assert metadata['spritesheet']['frameWidth'] == 192 and metadata['spritesheet']['frameHeight'] == 256
    assert metadata['anchor']['x'] == 96 and metadata['anchor']['y'] == 240
    assert metadata['animations']['run']['fps'] == 18 and metadata['animations']['run']['frames'] == list(range(12, 24))
    frames = []
    for item in metadata['frames']:
        image = frame(stage, item['id'])
        alpha = image.getchannel('A')
        assert alpha.getbbox() is not None and set(alpha.tobytes()) == {0, 255}
        w, h = image.size
        for edge in ((0, 0, w, 1), (0, h - 1, w, h), (0, 0, 1, h), (w - 1, 0, w, h)):
            assert alpha.crop(edge).getbbox() is None, f'{stage}/{item["id"]}: nontransparent frame edge'
        assert image.transpose(Image.Transpose.FLIP_LEFT_RIGHT).transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes() == image.tobytes()
        frames.append({'id': item['id'], 'opaqueBounds': list(alpha.getbbox()), 'rgbaSha256': sha(image.tobytes())})
    report['packs'].append({'file': archive.name, 'archiveIntegrity': True, 'allMembersMatchExtractedFiles': True, 'allFramesDecoded': True, 'binaryAlphaVerified': True, 'transparentFrameEdgesVerified': True, 'frames': frames, 'sha256': sha(archive.read_bytes())})
assert sheet('baseline').crop((0, 0, 1536, 512)).tobytes() == sheet('experimental').crop((0, 0, 1536, 512)).tobytes()
report['idleWalkPixelEquality'] = True

for scale in (1, 2):
    save_png(panel([(stage, 12 + i, f'{label} / key {i:02d}') for i in range(12) for stage, label in STAGES], 6, scale, title=f'Matched run keys / native 192 x 256 frames / {scale}x'), f'run-keyframes-{scale}x.png')
    save_png(panel([(stage, 12 + i, f'{label} / key {i:02d}') for i in (0, 3, 5, 9) for stage, label in STAGES], 4, scale, title=f'Production versus own skeletal trial / {scale}x'), f'comparison-{scale}x.png')
for name, crop in [('knees-ankles', (48, 155, 163, 246)), ('shoulders-elbows', (35, 105, 160, 189))]:
    save_png(panel([(stage, 12 + i, f'{label} / key {i:02d}') for i in (0, 2, 3, 5, 8, 9) for stage, label in STAGES], 4, 3, crop, f'{name} / same frame and crop / 3x'), f'{name}-3x.png')
save_png(panel([(stage, frame_id, f'{label} / {animation}') for stage, label in STAGES for animation, frame_id in [('idle', 0), ('walk', 7), ('run', 15)]], 3, 1, title='Idle / walk / run at the same native size'), 'idle-walk-run-1x.png')
for facing in ('right', 'left'):
    for scale in (1, 2):
        save_gif([(pair_scene(i, facing, scale), 1000 / 18) for i in range(12, 24)], f'run-comparison-{facing}-{scale}x.gif')

# Three real action timelines run together, each using its own exported FPS.
# Common multiple of idle 3000 ms, walk 800 ms and run 2000/3 ms.
# Every action returns to its initial phase at the GIF loop boundary.
duration_ms = 12000
boundaries = {0.0, float(duration_ms)}
for action in ('idle', 'walk', 'run'):
    clip = manifest('experimental')['animations'][action]
    fps = clip['fps']
    assert (duration_ms * fps) % (1000 * len(clip['frames'])) == 0
    boundaries.update(round(i * 1000 / fps, 8) for i in range(1, math.ceil(duration_ms * fps / 1000)) if i * 1000 / fps < duration_ms)
boundaries = sorted(boundaries)
events = []
for start, end in zip(boundaries, boundaries[1:]):
    image = Image.new('RGB', (660, 620), BG)
    draw = ImageDraw.Draw(image)
    for row, (stage, label) in enumerate(STAGES):
        for col, action in enumerate(('idle', 'walk', 'run')):
            clip = manifest(stage)['animations'][action]
            position = math.floor(((start + end) / 2) * clip['fps'] / 1000) % len(clip['frames'])
            sprite = frame(stage, clip['frames'][position])
            x, y = 20 + col * 216, 34 + row * 298
            draw.rectangle((x, y, x + 191, y + 255), fill=STAGE)
            image.paste(sprite, (x, y), sprite)
            draw.text((x, y - 21), f'{label} / {action}', font=font(11), fill=INK)
            draw.text((x, y + 261), f'{clip["fps"]} fps / in place', font=font(12), fill=INK)
    events.append((image, end - start))
save_gif(events, 'idle-walk-run-comparison.gif')
for filename in ('authoring-lab.png', 'independent-player.png'):
    path = D / filename
    with Image.open(path) as image:
        image.load()
        assert image.width > 0 and image.height > 0 and image.getbbox() is not None
        report['png'].append({'file': filename, 'dimensions': list(image.size), 'bytes': path.stat().st_size, 'sha256': sha(path.read_bytes()), 'decodable': True})
(D / 'artifact-validation.json').write_text(json.dumps(report, indent=2) + '\n')
print(f'Validated {len(report["packs"])} ZIPs, {len(report["png"])} generated PNGs, and {len(report["gif"])} GIFs; all decoded frame hashes and timing match exports.')
