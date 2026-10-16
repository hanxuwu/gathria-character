"""Review panels and timed loops from exported V5/V6 PNGs, never source art.

Write and decode temporary files before replacement. All GIF frames share one
palette; identical consecutive idle drawings may be coalesced by Pillow.
"""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / 'docs/art-polished'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BG, STAGE, INK = '#f6f2e9', '#e8ecdf', '#45493d'


def frame(name, index=0, facing='right'):
    m = json.loads((D / name / 'manifest.json').read_text())
    f = m['frames'][index]
    with Image.open(D / name / 'spritesheet.png') as source:
        im = source.convert('RGBA').crop((f['x'], f['y'], f['x'] + f['width'], f['y'] + f['height']))
    return im.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if facing == 'left' else im


def save_png(im, name):
    path = D / name
    temp = path.with_suffix('.tmp.png')
    im.save(temp)
    with Image.open(temp) as check:
        check.load()
        assert check.size == im.size
    temp.replace(path)


def panel(items, columns, scale=1, crop=None, title='Actual exported frames', index=0):
    w, h = (crop[2] - crop[0], crop[3] - crop[1]) if crop else (192, 256)
    cw, ch = w * scale + 24, h * scale + 42
    result = Image.new('RGB', (cw * columns + 24, ch * ((len(items) + columns - 1) // columns) + 66), BG)
    draw = ImageDraw.Draw(result)
    font = ImageFont.truetype(FONT, 15)
    draw.text((18, 14), title, font=font, fill=INK)
    for i, (name, label) in enumerate(items):
        im = frame(name, index)
        if crop:
            im = im.crop(crop)
        im = im.resize((w * scale, h * scale), Image.Resampling.NEAREST)
        x, y = 24 + i % columns * cw, 48 + i // columns * ch
        draw.rectangle((x, y, x + w * scale - 1, y + h * scale - 1), fill=STAGE)
        result.paste(im, (x, y), im)
        draw.text((x, y + h * scale + 8), label, font=font, fill=INK)
    return result


pairs = [('before-dress', 'Bride / V5'), ('dress-joyful', 'Bride / V6'), ('before-suit', 'Groom / V5'), ('suit-joyful', 'Groom / V6')]
for scale in (1, 2):
    save_png(panel(pairs, 4, scale, title=f'V5 -> V6 / same exported idle frame / {scale}x nearest-neighbor'), f'before-after-{scale}x.png')
save_png(panel(pairs, 4, 4, (58, 54, 146, 146), 'Head, neck and shoulders / same idle frame / 4x'), 'face-neck-4x.png')
save_png(panel(pairs, 4, 3, (32, 106, 160, 198), 'Sleeve and hand ownership / same walk frame 7 / 3x', index=7), 'arms-before-after-3x.png')
save_png(panel(pairs, 4, 1, title='Walk stance / same frame 7 / 1x', index=7), 'walk-before-after-1x.png')
save_png(panel([(f'{who}-{e}', f'{who} / {e}') for who in ('dress', 'suit') for e in ('neutral', 'gentle', 'joyful')], 3, 2, title='Three whole-face expressions / actual V6 exports / 2x'), 'expressions-2x.png')
save_png(panel([(f'{who}-outfit-{outfit}', f'{who} / {outfit}') for who in ('dress', 'suit') for outfit in ('tee', 'hoodie', 'jacket', 'suit', 'bodice')], 5, title='Both heads across every upper garment / actual V6 exports / 1x'), 'wardrobe-1x.png')
save_png(panel([(f'{who}-dark-skin', f'{who} / deep skin + blonde') for who in ('dress', 'suit')], 2, 2, title='Material masks / actual V6 exports / 2x'), 'recolor-2x.png')

for animation in ('idle', 'walk'):
    for facing in ('right', 'left'):
        m = json.loads((D / 'dress-joyful/manifest.json').read_text())
        seq = m['animations'][animation]
        images = []
        for f in seq['frames']:
            out = Image.new('RGB', (816, 584), BG)
            draw = ImageDraw.Draw(out)
            draw.text((24, 14), f'Actual V6 exports / {animation} / {facing} / 2x / neutral preview scene', font=ImageFont.truetype(FONT, 17), fill=INK)
            draw.line((16, 528, 800, 528), fill='#aab7a1')
            for i, who in enumerate(('dress', 'suit')):
                im = frame(f'{who}-joyful', f, facing).resize((384, 512), Image.Resampling.NEAREST)
                out.paste(im, (24 + i * 384, 48), im)
            images.append(out)
        # A shared palette avoids unrelated color changes between frames.
        strip = Image.new('RGB', (816, 584 * len(images)))
        for i, im in enumerate(images):
            strip.paste(im, (0, i * 584))
        palette = strip.quantize(colors=256, dither=Image.Dither.NONE)
        indexed = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in images]
        path = D / f'{animation}-{facing}.gif'
        temp = path.with_suffix('.tmp.gif')
        indexed[0].save(temp, save_all=True, append_images=indexed[1:], duration=round(1000 / seq['fps']), loop=0, disposal=1, optimize=False)
        with Image.open(temp) as check:
            total = 0
            for i in range(check.n_frames):
                check.seek(i)
                check.load()
                total += check.info['duration']
            assert total == len(seq['frames']) * 1000 / seq['fps']
            assert check.info['loop'] == 0
        temp.replace(path)

walk = Image.new('RGB', (192 * 8, 256 * 2), STAGE)
for row, who in enumerate(('dress', 'suit')):
    for col in range(8):
        im = frame(who + '-joyful', col + 4)
        walk.paste(im, (col * 192, row * 256), im)
save_png(walk, 'walk-frames.png')
print('Rendered comparison PNGs and four complete timed GIF loops from exported packs.')
