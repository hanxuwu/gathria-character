"""Decode actual application exports and compose labelled static-pose reviews.

This script never paints/revises character artwork. All displayed pixels come
from the immutable reference or actual UI-exported native pose PNGs.
"""
from pathlib import Path
import hashlib
import io
import json
import math
import os
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
phase = os.environ.get('EVIDENCE_PHASE', 'final')
if phase not in ('initial', 'final') and not (phase.startswith('iterations/') and all(c.isalnum() or c in '-/' for c in phase)):
    raise ValueError('Use initial, final or iterations/<name>.')
OUT = ROOT / 'docs/kling-native-female' / phase
REVIEW = OUT / 'review'
REVIEW.mkdir(parents=True, exist_ok=True)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BG = (246, 242, 232, 255)
FG = (51, 59, 49, 255)
W, H = 704, 1056
POSES = [('standing', 'Standing'), ('walk-contact', 'Walk contact'),
         ('run-flight', 'Run flight'), ('celebrate', 'Celebrate')]
sha = lambda data: hashlib.sha256(data).hexdigest()


def font(size):
    return ImageFont.truetype(FONT, size)


def decode(path):
    with Image.open(path) as im:
        im.load()
        return im.convert('RGBA')


def labelled_sheet(items, scale, path, footer):
    label_height, footer_height = 64, 72
    canvas = Image.new('RGBA', (W * len(items), H + label_height + footer_height), BG)
    draw = ImageDraw.Draw(canvas)
    for i, (label, image) in enumerate(items):
        draw.text((i * W + 20, 17), label, font=font(23), fill=FG)
        canvas.alpha_composite(image, (i * W, label_height))
    draw.text((20, H + label_height + 18), footer, font=font(20), fill=FG)
    if scale != 1:
        canvas = canvas.resize((canvas.width * scale, canvas.height * scale), Image.Resampling.NEAREST)
    canvas.save(path)


reference = decode(OUT / 'reference.png')
assert reference.size == (W, H)
poses = {f'{identifier}-{facing}': decode(OUT / f'{identifier}-{facing}-1x.png')
         for identifier, _ in POSES for facing in ('right', 'left')}
for image in poses.values():
    assert image.size == (W, H)
for scale in (1, 2):
    labelled_sheet([
        ('Approved female frame 348 / native', reference),
        ('Actual layered standing export / native', poses['standing-right']),
    ], scale, REVIEW / f'source-reconstruction-{scale}x.png',
    'Same native size and background. Visible source artwork is not redrawn; hidden coverage is separately authored.')
    labelled_sheet([(label, poses[f'{identifier}-right']) for identifier, label in POSES],
                   scale, REVIEW / f'four-poses-right-{scale}x.png',
                   'FOUR FEMALE STATIC POSE STUDIES — not an animation cycle. Actual application PNG exports.')
labelled_sheet([(label, poses[f'{identifier}-left']) for identifier, label in POSES],
               1, REVIEW / 'four-poses-left-1x.png',
               'Mirrored native static studies. Actual application PNG exports; no completed animation claim.')
initial = ROOT / 'docs/kling-native-female/initial'
if phase == 'final' and initial.is_dir():
    for identifier, label in POSES[1:]:
        old_path = initial / f'{identifier}-right-1x.png'
        if old_path.exists():
            labelled_sheet([
                (f'{label}: initial registration', decode(old_path)),
                (f'{label}: refined registration', poses[f'{identifier}-right']),
            ], 1, REVIEW / f'{identifier}-iteration-comparison-1x.png',
            'Actual before/after UI exports. Same native dimensions and background; approved source identity remains fixed.')

with zipfile.ZipFile(OUT / 'kling-female-native-study.project.zip') as archive:
    assert archive.testzip() is None
    document = json.loads(archive.read('document.json'))


def body_point(pose, point, registration=None):
    pivot = (registration or document)['pivot']
    angle = pose['body']['rotation']
    c, s = math.cos(angle), math.sin(angle)
    x, y = point[0]-pivot[0], point[1]-pivot[1]
    return [pivot[0]+c*x-s*y+pose['body']['translation'][0],
            pivot[1]+s*x+c*y+pose['body']['translation'][1]]


# Joint-centred crops move with each actual saved pose rather than comparing
# unrelated fixed image rectangles after a limb has moved.
joint_names = ['Neck / collar', 'Near shoulder', 'Near elbow', 'Near wrist',
               'Near hip / shorts', 'Near knee', 'Near ankle / shoe']
cell, caption, scale = 176, 37, 2
sheet = Image.new('RGBA', (len(POSES)*cell*scale, 56+len(joint_names)*(cell+caption)*scale), BG)
draw = ImageDraw.Draw(sheet)
draw.text((16, 13), 'Actual exported joint crops / 2x nearest enlargement / four static poses', font=font(22), fill=FG)
for column, (identifier, label) in enumerate(POSES):
    pose = next(p for p in document['poses'] if p['id'] == identifier)
    joints = [body_point(pose, document['neck']), *pose['chains']['nearArm'], *pose['chains']['nearLeg']]
    for row, (name, point) in enumerate(zip(joint_names, joints)):
        x, y = round(point[0]), round(point[1])
        crop = poses[f'{identifier}-right'].crop((x-cell//2, y-cell//2, x+cell//2, y+cell//2))
        crop = crop.resize((cell*scale, cell*scale), Image.Resampling.NEAREST)
        origin = (column*cell*scale, 56+row*(cell+caption)*scale)
        draw.text((origin[0]+9, origin[1]+8), f'{label}: {name}', font=font(18), fill=FG)
        sheet.alpha_composite(crop, (origin[0], origin[1]+caption*scale))
sheet.save(REVIEW / 'joints-2x.png')

# Far-side joints are easy to miss in a near-only contact sheet, but shoulder
# coverage and crossed-limb ownership need inspection on both sides.
far_names = ['Far shoulder', 'Far elbow', 'Far wrist',
             'Far hip / shorts', 'Far knee', 'Far ankle / shoe']
far_sheet = Image.new('RGBA', (len(POSES)*cell*scale, 56+len(far_names)*(cell+caption)*scale), BG)
far_draw = ImageDraw.Draw(far_sheet)
far_draw.text((16, 13), 'Far-side actual exported joint crops / 2x / four static poses', font=font(22), fill=FG)
for column, (identifier, label) in enumerate(POSES):
    pose = next(p for p in document['poses'] if p['id'] == identifier)
    joints = [*pose['chains']['farArm'], *pose['chains']['farLeg']]
    for row, (name, point) in enumerate(zip(far_names, joints)):
        x, y = round(point[0]), round(point[1])
        crop = poses[f'{identifier}-right'].crop((x-cell//2, y-cell//2, x+cell//2, y+cell//2))
        crop = crop.resize((cell*scale, cell*scale), Image.Resampling.NEAREST)
        origin = (column*cell*scale, 56+row*(cell+caption)*scale)
        far_draw.text((origin[0]+9, origin[1]+8), f'{label}: {name}', font=font(18), fill=FG)
        far_sheet.alpha_composite(crop, (origin[0], origin[1]+caption*scale))
far_sheet.save(REVIEW / 'far-joints-2x.png')

# Source files are read from the actual saved/reopened project archive. Every
# thumbnail uses the same half-native scale and original source-frame origin.
part_cell_w, part_cell_h = W//2, H//2+76
part_sheet = Image.new('RGBA', (part_cell_w*4, part_cell_h*4+56), BG)
part_draw = ImageDraw.Draw(part_sheet)
part_draw.text((16, 15), '15 saved HD parts + actual reassembly / every thumbnail at 0.5x native / orange = pivot', font=font(21), fill=FG)
with zipfile.ZipFile(OUT / 'kling-female-native-study.project.zip') as archive:
    entries = [(entry['id'], decode(io.BytesIO(archive.read(entry['file']))), entry['pivot']) for entry in document['parts']]
for index, (name, im, pivot) in enumerate(entries + [('Actual standing reassembly', poses['standing-right'], None)]):
    ox, oy = (index % 4)*part_cell_w, 56+(index//4)*part_cell_h
    part_draw.text((ox+12, oy+12), name, font=font(20), fill=FG)
    if pivot:
        part_draw.text((ox+12, oy+39), f'Pivot {pivot[0]}, {pivot[1]} / native 704 x 1056', font=font(13), fill=FG)
    part_sheet.alpha_composite(im.resize((W//2,H//2),Image.Resampling.LANCZOS),(ox,oy+76))
    if pivot:
        px, py = ox+pivot[0]/2, oy+76+pivot[1]/2
        part_draw.line((px-6,py,px+6,py),fill=(194,83,41,255),width=2)
        part_draw.line((px,py-6,px,py+6),fill=(194,83,41,255),width=2)
part_sheet.save(REVIEW/'registered-parts.png')

if phase == 'final' and (initial/'kling-female-native-study.project.zip').exists():
    with zipfile.ZipFile(initial/'kling-female-native-study.project.zip') as archive:
        initial_doc=json.loads(archive.read('document.json'))
    names=['Near shoulder','Far shoulder','Elbow','Hip / shorts','Knee','Ankle / shoe']
    cell, scale, label_height = 144, 2, 42
    comparison=Image.new('RGBA',(6*cell*scale,64+len(names)*(cell*scale+label_height)),BG)
    painter=ImageDraw.Draw(comparison)
    painter.text((14,16),'Joint-centred before / after actual exports at 2x; authored pose adjustments are included.',font=font(23),fill=FG)
    for pose_index,(identifier,label) in enumerate(POSES[1:]):
        for revision,(registration,base,name) in enumerate([(initial_doc,initial,'Initial'),(document,OUT,'Refined')]):
            pose=next(p for p in registration['poses'] if p['id']==identifier)
            points=[pose['chains']['nearArm'][0],pose['chains']['farArm'][0],pose['chains']['nearArm'][1],*pose['chains']['nearLeg']]
            image=decode(base/f'{identifier}-right-1x.png')
            col=pose_index*2+revision
            for row,(joint,point) in enumerate(zip(names,points)):
                x,y=round(point[0]),round(point[1])
                crop=image.crop((x-cell//2,y-cell//2,x+cell//2,y+cell//2)).resize((cell*scale,cell*scale),Image.Resampling.NEAREST)
                ox,oy=col*cell*scale,64+row*(cell*scale+label_height)
                painter.text((ox+7,oy+9),f'{label} / {name}: {joint}',font=font(14),fill=FG)
                comparison.alpha_composite(crop,(ox,oy+label_height))
    comparison.save(REVIEW/'joint-iteration-comparison-2x.png')

raw_reference = np.array(reference)
raw_standing = np.array(poses['standing-right'])
different = np.any(raw_reference != raw_standing, axis=2)
mask_difference = (raw_reference[:, :, 3] > 0) != (raw_standing[:, :, 3] > 0)
integrity = {
    'scope': 'Current actual female native study UI exports; static poses, not animation cycles.',
    'phase': phase,
    'restComparison': {
        'rgbaDifferentPixels': int(different.sum()),
        'totalPixels': W*H,
        'silhouetteDifferentPixels': int(mask_difference.sum()),
        'maxChannelDifference': int(np.abs(raw_reference.astype(int)-raw_standing.astype(int)).max()),
        'caveat': 'Pixel equality is a registration check, not user artistic acceptance.',
    },
    'mirrors': [], 'pngs': [], 'archives': [],
}
for identifier, _ in POSES:
    right = np.array(poses[f'{identifier}-right'])
    left = np.array(poses[f'{identifier}-left'])
    exact = bool(np.array_equal(right[:, ::-1, :], left))
    assert exact, identifier
    integrity['mirrors'].append({'pose': identifier, 'exactNativeMirror': exact})
for path in sorted(OUT.rglob('*.png')):
    image = decode(path)
    data = path.read_bytes()
    rgba = np.array(image)
    record = {'file': str(path.relative_to(OUT)), 'bytes': len(data), 'sha256': sha(data),
              'dimensions': list(image.size), 'decoded': True,
              'transparentPixels': int((rgba[:, :, 3] == 0).sum()),
              'partialAlphaPixels': int(((rgba[:, :, 3] > 0) & (rgba[:, :, 3] < 255)).sum())}
    assert len(data) and np.any(rgba[:, :, 3]), str(path)
    if path.parent == OUT and path.name.endswith('-1x.png'):
        assert image.size == (W, H)
        assert record['transparentPixels'] and record['partialAlphaPixels']
    integrity['pngs'].append(record)
for path in sorted(OUT.glob('*.zip')):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None, str(path)
        png_members = []
        for name in archive.namelist():
            data = archive.read(name)
            assert data and not name.startswith('/') and '..' not in Path(name).parts
            if name.endswith('.png'):
                image = decode(io.BytesIO(data))
                png_members.append({'file': name, 'dimensions': list(image.size), 'decoded': True})
        integrity['archives'].append({'file': path.name, 'bytes': path.stat().st_size,
                                      'sha256': sha(path.read_bytes()), 'crcDecoded': True,
                                      'members': len(archive.namelist()), 'pngs': png_members})
(OUT / 'artifact-validation.json').write_text(json.dumps(integrity, indent=2)+'\n')
print(json.dumps({'phase': phase, 'pngs': len(integrity['pngs']), 'archives': len(integrity['archives']),
                  'restComparison': integrity['restComparison']}, indent=2))
