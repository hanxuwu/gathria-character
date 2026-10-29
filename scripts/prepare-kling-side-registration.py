#!/usr/bin/env python3
"""Author conservative native side-source garment masks and WardrobeRegistration v1.

Dependencies: Pillow, numpy, scipy, opencv-python-headless. Inputs are frozen
CharacterPack archives, read only. No source pixels, timing, alpha or poses are
changed. Manual source-specific landmark estimates are tracked only inside their
original action; actual garment contours provide the two waist attachments.
Occluded attachments are guides with low confidence, not a recovered skeleton.

python scripts/prepare-kling-side-registration.py --repo-root /path/to/repo \
    --output-root /path/to/output-repo
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
from io import BytesIO
import json
import math
from pathlib import Path
from zipfile import ZipFile

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

W, H = 512, 768
YY, XX = np.indices((H, W))
NAMES = ['neck', 'nearShoulder', 'farShoulder', 'waistLeft', 'waistRight',
         'nearHip', 'farHip', 'nearElbow', 'farElbow', 'nearWrist', 'farWrist',
         'nearKnee', 'farKnee', 'nearAnkle', 'farAnkle', 'nearToe', 'farToe']
SLOTS = ['top', 'bottom', 'shoes']
COLORS = {'top': (35, 190, 224, 145), 'bottom': (208, 70, 205, 145),
          'shoes': (63, 207, 108, 145)}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def bbox(mask):
    y, x = np.where(mask)
    return [int(x.min()), int(y.min()), int(x.max()), int(y.max())] if len(x) else None


def components(mask, minimum=30):
    labels, count = ndi.label(mask)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    return [labels == i for i in np.argsort(sizes)[::-1] if sizes[i] >= minimum]


def largest(mask):
    cs = components(mask, 1)
    return cs[0] if cs else np.zeros(mask.shape, bool)


def polygon(mask):
    contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL,
                                  cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []
    c = max(contours, key=cv2.contourArea)
    if cv2.contourArea(c) < 3:
        return []
    epsilon = 0.8
    p = cv2.approxPolyDP(c, epsilon, True)
    while len(p) > 64:
        epsilon += 0.3
        p = cv2.approxPolyDP(c, epsilon, True)
    if len(p) < 3 or cv2.contourArea(p) < 3:
        return []
    return [{'x': int(q[0][0]), 'y': int(q[0][1])} for q in p]


def raster(poly):
    im = Image.new('1', (W, H))
    if poly:
        ImageDraw.Draw(im).polygon([(p['x'], p['y']) for p in poly], fill=1)
    return np.asarray(im, dtype=bool)


def runtime_raster(poly):
    """Exact native pixel-center scanlines from wardrobe/protection.ts."""
    mask = np.zeros((H, W), bool)
    top = max(0, math.ceil(min(p['y'] for p in poly)-.5))
    bottom = min(H-1, math.floor(max(p['y'] for p in poly)-.5))
    for y in range(top, bottom+1):
        cy = y+.5
        crossings = []
        def add(a, b):
            left = max(0, math.ceil(min(a, b)-.5-1e-9))
            right = min(W-1, math.floor(max(a, b)-.5+1e-9))
            if left <= right:
                mask[y, left:right+1] = True
        for i, b in enumerate(poly):
            a = poly[i-1]
            if (a['y'] > cy) != (b['y'] > cy):
                crossings.append(a['x']+(cy-a['y'])*(b['x']-a['x'])/(b['y']-a['y']))
            if abs(a['y']-cy) < 1e-9 and abs(b['y']-cy) < 1e-9:
                add(a['x'], b['x'])
            elif abs(a['y']-cy) < 1e-9:
                add(a['x'], a['x'])
        crossings.sort()
        for i in range(0, len(crossings)-1, 2):
            add(crossings[i], crossings[i+1])
    return mask


def load_pack(path):
    with ZipFile(path) as z:
        manifest = json.loads(z.read('manifest.json'))
        config = json.loads(z.read('character.json'))
        pages = [Image.open(BytesIO(z.read(p['file']))).convert('RGBA')
                 for p in [manifest['spritesheet'], *manifest.get('additionalSheets', [])]]
        frames = {}
        for f in manifest['frames']:
            x, y, w, h = [f[k] for k in ['x', 'y', 'width', 'height']]
            assert (w, h) == (W, H)
            frames[f['id']] = np.array(pages[f.get('page', 0)].crop((x, y, x+w, y+h)))
    assert (manifest['anchor']['x'], manifest['anchor']['y']) == (256, 710)
    return manifest, config, frames


def manual_points(path):
    data = json.loads(path.read_text())
    if 'sources' in data:
        return {f'{source}/{f}': p for source, poses in data['sources'].items()
                for f, p in poses.items()}
    output = {}
    for key, values in data['poses'].items():
        points = {}
        for name, p in zip(data['anchorNames'], values):
            hidden = name in ['farShoulder', 'nearHip', 'farHip'] or name in data.get('occluded', {}).get(key, [])
            points[name] = {'x': p[0], 'y': p[1],
                            'visibility': 'occluded' if hidden else 'visible',
                            'confidence': 0.33 if hidden else 0.78,
                            'method': 'visually-inspected-native-keypose; ' +
                            ('hidden attachment estimate' if hidden else 'contour-guided joint estimate')}
        output[key] = points
    return output


def materials(a, points, reviewed_overrides):
    """Local seeded ownership with skin competing for every outline pixel.

    There is no global color deletion: seed colors identify material interiors,
    then nearest material claims only a bounded local outline neighborhood.
    Ambiguous/distant pixels remain unchanged by garment masks.
    """
    r, g, b, alpha = np.moveaxis(a.astype(float), 2, 0)
    fg = alpha > 0
    solid = alpha > 16
    skin_seed = solid & (r-g > 34) & (r-b > 52) & (r > 105)
    raw_skin_seed = skin_seed.copy()
    override_audit = []
    for override in reviewed_overrides:
        region = raster(override['polygon']) & solid
        skin_seed[region] = False
        override_audit.append({**override, 'rasterization': 'pillow-integer-polygon',
                               'sourceRgbaSha256': sha(a.tobytes()),
                               'rawSkinSeedPixelsExcluded': int((raw_skin_seed & region).sum())})
    neck_y = points['neck']['y']
    # Isolate the head from arms raised alongside it. The upper skin component
    # supplies its observed horizontal extent; a conservative neck margin
    # protects facial ink/eyes independently of garment color classification.
    head_core = largest(skin_seed & (YY < neck_y-45))
    hb = bbox(head_core)
    if hb is None:
        raise ValueError('No visible head skin above the reviewed neck')
    head_candidate = fg & (YY < neck_y+10) & (XX >= hb[0]-3) & (XX <= hb[2]+3)
    head_poly = polygon(ndi.binary_fill_holes(largest(head_candidate)))
    head = raster(head_poly)
    shoulder_y = min(points[s+'Shoulder']['y'] for s in ['near', 'far'])
    hip_y = max(points[s+'Hip']['y'] for s in ['near', 'far'])
    center = np.mean([points[s+'Hip']['x'] for s in ['near', 'far']])
    torso_roi = (YY > min(neck_y, shoulder_y)-25) & (YY < hip_y+25) & (abs(XX-center) < 105)
    # The upper-face guard is independent of garment ownership. Below it,
    # observed neutral cloth may meet the neck and must retain its full shape.
    upper_face = head & (YY < neck_y-35)
    neutral = solid & ~upper_face & (r-g < 27) & (r-g > -8) & (r-b < 52) & (r-b > -8) & (r > 110) & (r < 238)
    core = largest(neutral & torso_roi & ~skin_seed)
    tb = bbox(core)
    if not tb:
        raise ValueError('No neutral tank interior at reviewed torso')
    top_seed = np.zeros((H, W), bool)
    # Include the visible island beside an arm crossing the shirt, while keeping
    # the material search bounded to the same torso contour.
    # A bent arm can split the tank into disconnected collar and hem islands.
    # Search both within the reviewed torso and above the hidden hip centers;
    # bounding the search by the largest island alone would omit the hem.
    local = torso_roi & (YY <= min(points[s+'Hip']['y'] for s in ['near', 'far'])-8)
    warm_neutral = solid & ~upper_face & (r-g < 50) & (r-g > -12) & (r-b < 58) & (r-b > -12) & (g-b < 42) & (r > 90) & (r < 238)
    # Source lighting makes some tank regions pink. Permit that broader color
    # only when connected to observed neutral tank, never as a global seed.
    strict_near_core = neutral & local & ~skin_seed
    for c in components(warm_neutral & local & ~skin_seed, 24):
        if np.count_nonzero(c & strict_near_core) >= 24:
            top_seed |= c
    tb = bbox(top_seed)
    if not tb:
        raise ValueError('No connected tank material above the reviewed hips')
    bottom_roi = (YY >= tb[3]-32) & (YY <= min(hip_y+92, tb[3]+108)) & (abs(XX-center) < 105)
    # The later female jump has a pink source-lighting cast: its shorts are
    # still locally dark/neutral, though red may exceed green by 10--15.
    dark_blue = solid & (r < 112) & (g < 124) & (b < 145) & (g >= r-22) & (b >= r-20) & (abs(g-b) < 25)
    bottom_seed = np.zeros((H, W), bool)
    for c in components(dark_blue & bottom_roi & ~top_seed & ~skin_seed, 30):
        bottom_seed |= c
    if not bottom_seed.any():
        raise ValueError('No shorts interior at reviewed hips')
    ankles = [(points[s+'Ankle']['x'], points[s+'Ankle']['y']) for s in ['near', 'far']]
    shoe_roi = np.logical_or.reduce([np.hypot(XX-x, YY-y) < 90 for x, y in ankles])
    shoe_roi &= YY >= min(y for _, y in ankles)-45
    shoe_seed = np.zeros((H, W), bool)
    shoe_components = components(solid & shoe_roi & (r > 130) & (g > 122) & (b > 118) &
                                 (r-b < 55) & (abs(r-g) < 40) & ~skin_seed & ~top_seed & ~bottom_seed, 35)[:2]
    for c in shoe_components:
        shoe_seed |= c
    if not shoe_seed.any():
        raise ValueError('No light shoe interior at reviewed ankles')
    seeds = np.zeros((H, W), np.uint8)
    seeds[skin_seed] = 1
    seeds[top_seed] = 2
    seeds[bottom_seed] = 3
    seeds[shoe_seed] = 4
    distance, indices = ndi.distance_transform_edt(seeds == 0, return_indices=True)
    nearest = seeds[tuple(indices)]
    labels = np.zeros((H, W), np.uint8)
    # Five native pixels covers an existing ink boundary without allowing a
    # shirt to cross an unseeded arm or a shoe to consume an ankle.
    for value, seed in [(2, top_seed), (3, bottom_seed), (4, shoe_seed)]:
        local = ndi.distance_transform_edt(~seed) <= (7 if value == 4 else 5)
        labels[fg & local & (nearest == value)] = value
    # Warm soles are source shoe material. Recover them only around a detected
    # white upper, below that upper's midpoint, and outside robust skin cores.
    robust_skin = ndi.binary_erosion(skin_seed, iterations=2)
    for c in shoe_components:
        box = bbox(c)
        local = ndi.distance_transform_edt(~c) <= 7
        sole = local & (YY >= (box[1]+box[3])/2) & (YY <= box[3]+7)
        labels[fg & sole & ~robust_skin & ~top_seed & ~bottom_seed] = 4
    # These source-bound polygons are individually reviewed material interiors,
    # never a relaxed color threshold or an inverse-garment skin definition.
    for override in reviewed_overrides:
        region = raster(override['polygon']) & fg
        labels[region] = {'top': 2, 'bottom': 3, 'shoes': 4}[override['slot']]
    # Shape the lower head/neck boundary around observed cloth. Upper facial
    # ink and eye pixels were excluded before material seeding.
    head_poly = polygon(ndi.binary_fill_holes(largest(head_candidate & (labels == 0))))
    head = raster(head_poly)
    # Garment and all exposed skin/head are mutually exclusive.
    labels[head | skin_seed] = 0
    masks = {slot: labels == i for slot, i in zip(SLOTS, [2, 3, 4])}
    return masks, skin_seed, head_poly, distance, override_audit


def protections(a, points, masks, skin, head_poly):
    fg = a[:, :, 3] > 0
    head = raster(head_poly)
    cloth = np.logical_or.reduce(list(masks.values()))
    protected = [{'label': 'head', 'polygon': head_poly}]
    hand_audit = {}
    for side in ['near', 'far']:
        wrist, elbow = points[side+'Wrist'], points[side+'Elbow']
        if wrist['visibility'] == 'occluded':
            hand_audit[side+'Hand'] = 'occluded; no invented protection polygon'
            continue
        w = np.array([wrist['x'], wrist['y']])
        e = np.array([elbow['x'], elbow['y']])
        u = (w-e)/max(np.linalg.norm(w-e), 1)
        along = (XX-w[0])*u[0]+(YY-w[1])*u[1]
        roi = (np.hypot(XX-w[0], YY-w[1]) <= 45) & (along >= -9) & ~head
        seed = largest(skin & roi)
        hand = ndi.binary_fill_holes(seed)
        hand = (ndi.binary_dilation(hand, iterations=2) & fg & roi & ~cloth & ~head)
        pol = polygon(hand)
        if pol:
            protected.append({'label': side+'Hand', 'polygon': pol})
            hand_audit[side+'Hand'] = 'visible skin contour near tracked wrist; conservative forearm margin'
        else:
            hand_audit[side+'Hand'] = 'no separate visible skin component; omitted, not fabricated'
    for region in protected:
        # PIL integer rasterization alone misses pixels the runtime includes
        # at x+.5/y+.5. Keep the existing polygons, enforce exact runtime
        # scanlines, and add a two-native-pixel guard around both rasters.
        exclusion = raster(region['polygon']) | runtime_raster(region['polygon'])
        exclusion = ndi.binary_dilation(exclusion, structure=np.ones((3, 3), bool), iterations=2)
        for mask in masks.values():
            mask[exclusion] = False
    return protected, hand_audit


def add_waist(points, top):
    ys, xs = np.where(top)
    if not len(xs):
        raise ValueError('Empty tank ownership')
    # Each column's lowest visible tank pixel gives an actual hem contour.
    columns = np.unique(xs)
    bottoms = np.array([ys[xs == x].max() for x in columns])
    keep = bottoms >= np.quantile(bottoms, .6)-4
    columns, bottoms = columns[keep], bottoms[keep]
    for name, q in [('waistLeft', .05), ('waistRight', .95)]:
        x = float(np.quantile(columns, q))
        neighbors = abs(columns-x) <= 5
        if not neighbors.any():
            neighbors = abs(columns-x) == min(abs(columns-x))
        y = float(np.median(bottoms[neighbors]))
        points[name] = {'x': round(x, 1), 'y': round(y, 1), 'visibility': 'visible',
                        'confidence': .85, 'method': 'actual-frame visible tank lower-contour attachment estimate'}


def constrain_visible_feet(points, shoes, image):
    """Keep footwear attachment proposals on observed material, not empty air."""
    _, indices = ndi.distance_transform_edt(~shoes, return_indices=True)
    corrections = {}
    for side in ['near', 'far']:
        for joint in ['Ankle', 'Toe']:
            name = side+joint
            p = points[name]
            if p['visibility'] == 'occluded':
                continue
            x, y = int(round(p['x'])), int(round(p['y']))
            x, y = min(W-1, max(0, x)), min(H-1, max(0, y))
            if joint == 'Ankle' and image[y, x, 3] > 0:
                continue
            ny, nx = [int(v) for v in indices[:, y, x]]
            delta = float(np.hypot(nx-p['x'], ny-p['y']))
            if delta > .5:
                corrections[name] = {'from': [p['x'], p['y']], 'to': [nx, ny], 'distance': round(delta, 2)}
                p['x'], p['y'] = nx, ny
                p['confidence'] = min(p['confidence'], .45 if delta > 12 else .68)
                p['method'] = 'nearest actual shoe-contour attachment estimate from reviewed/tracked guide; joint center not recovered'
    return corrections


def draw_overlay(a, masks, points, protected):
    overlay = np.zeros(a.shape, np.uint8)
    for slot, mask in masks.items():
        overlay[mask] = COLORS[slot]
    im = Image.alpha_composite(Image.fromarray(a), Image.fromarray(overlay))
    d = ImageDraw.Draw(im)
    for region in protected:
        p = [(q['x'], q['y']) for q in region['polygon']]
        d.line(p+p[:1], fill='#52ee81', width=2)
    for side, color in [('near', '#ec267a'), ('far', '#269fed')]:
        for chain in [[side+'Shoulder', side+'Elbow', side+'Wrist'], [side+'Hip', side+'Knee', side+'Ankle', side+'Toe']]:
            d.line([(points[n]['x'], points[n]['y']) for n in chain], fill=color, width=2)
    for p in points.values():
        x, y = p['x'], p['y']
        d.ellipse((x-3, y-3, x+3, y+3), fill='#ffba25' if p['visibility'] == 'occluded' else '#ec267a')
    return im


def run(repo_root, output_root, character):
    pack = repo_root/'docs/kling-side-workspace/assets'/f'{character}.source.zip'
    output = output_root/'artwork/kling-side-workspace/registration'/character
    review = output_root/'docs/kling-side-workspace/registration-review'/character
    output.mkdir(parents=True, exist_ok=True)
    (output/'masks').mkdir(exist_ok=True)
    review.mkdir(parents=True, exist_ok=True)
    (review/'native').mkdir(exist_ok=True)
    manual_file = output/'reviewed-keyposes.json'
    if not manual_file.exists():
        manual_file = Path(__file__).resolve().parents[1]/'artwork/kling-side-workspace/registration'/character/'reviewed-keyposes.json'
    manual = manual_points(manual_file)
    manual_overrides = json.loads(manual_file.read_text()).get('overrides', {})
    material_overrides = json.loads(manual_file.read_text()).get('materialOverrides', {})
    assert json.loads(manual_file.read_text())['sourceSha256'] == sha(pack.read_bytes()), 'Reviewed keyposes are bound to another source pack'
    manifest, config, images = load_pack(pack)
    source_frames = {f['frameId']: f['sourceFrame'] for f in config['derivation']['frames']}
    sources = config['sourceMetadata']['frameSources']
    keys = {fid: f'{sources[str(fid)]}/{source_frames[fid]}' for fid in images}
    small = {fid: cv2.cvtColor(cv2.resize(a[:, :, :3], (W//2, H//2)), cv2.COLOR_RGB2GRAY) for fid, a in images.items()}
    flows = {}
    records, audit = [], []
    for action, animation in manifest['animations'].items():
        ids = list(dict.fromkeys(animation['frames']))
        if not ids:
            continue
        seeds = [fid for fid in ids if keys[fid] in manual]
        if not seeds:
            raise ValueError(f'No manually inspected seed for {character}/{action}')
        for fid in ids:
            seed = min(seeds, key=lambda n: abs(ids.index(n)-ids.index(fid)))
            points = deepcopy(manual[keys[seed]])
            names = list(points)
            coords = np.array([[points[n]['x'], points[n]['y']] for n in names], float)/2
            start, end = ids.index(seed), ids.index(fid)
            step = 1 if end > start else -1
            for k in range(start, end, step):
                pair = (ids[k], ids[k+step])
                if pair not in flows:
                    flows[pair] = cv2.calcOpticalFlowFarneback(small[pair[0]], small[pair[1]], None, .5, 4, 25, 5, 7, 1.5, 0)
                flow = flows[pair]
                for i, p in enumerate(coords):
                    x, y = np.round(p).astype(int)
                    x, y = np.clip(x, 3, W//2-4), np.clip(y, 3, H//2-4)
                    coords[i] += np.median(flow[y-3:y+4, x-3:x+4], axis=(0, 1))
            for name, xy in zip(names, coords*2):
                p = points[name]
                p['x'], p['y'] = round(float(np.clip(xy[0], 0, W)), 1), round(float(np.clip(xy[1], 0, H)), 1)
                if fid != seed:
                    p['confidence'] = round(max(.2, p['confidence']-.10-.015*abs(end-start)), 3)
                    p['method'] = 'local optical-flow proposal from inspected source keypose; ' + ('occluded attachment estimate' if p['visibility'] == 'occluded' else 'visible-region estimate')
            for name, correction in manual_overrides.get(keys[fid], {}).items():
                points[name].update(correction)
            masks, skin, head, distances, reviewed_materials = materials(images[fid], points, material_overrides.get(keys[fid], []))
            foot_corrections = constrain_visible_feet(points, masks['shoes'], images[fid])
            add_waist(points, masks['top'])
            protected, hand_audit = protections(images[fid], points, masks, skin, head)
            points = {n: points[n] for n in NAMES}
            assert all(np.isfinite(p['x']) and np.isfinite(p['y']) and 0 <= p['x'] <= W and 0 <= p['y'] <= H for p in points.values())
            record = {'frameId': fid, 'sourceFrame': source_frames[fid], 'points': points, 'protected': protected}
            records.append(record)
            checksums = {}
            for slot, mask in masks.items():
                path = output/'masks'/f'{fid:04}-{slot}.png'
                Image.fromarray((mask*255).astype(np.uint8)).save(path)
                checksums[slot] = sha(path.read_bytes())
                assert not np.any(mask & skin)
                assert not np.any(mask & (images[fid][:, :, 3] == 0))
            skin_path = output/'masks'/f'{fid:04}-skin.png'
            Image.fromarray((skin*255).astype(np.uint8)).save(skin_path)
            checksums['skin'] = sha(skin_path.read_bytes())
            assert not np.any(masks['top'] & masks['bottom'])
            assert not np.any(masks['top'] & masks['shoes'])
            assert not np.any(masks['bottom'] & masks['shoes'])
            for region in protected:
                assert 3 <= len(region['polygon']) <= 64
                assert not np.any(raster(region['polygon']) & np.logical_or.reduce(list(masks.values())))
                assert not np.any(runtime_raster(region['polygon']) & np.logical_or.reduce(list(masks.values())))
            overlay = draw_overlay(images[fid], masks, points, protected)
            overlay.save(review/'native'/f'{fid:04}.png')
            audit.append({'frameId': fid, 'action': action, 'source': sources[str(fid)],
                          'sourceFrame': source_frames[fid], 'sourceRgbaSha256': sha(images[fid].tobytes()),
                          'reviewedSeed': keys[seed], 'trackedSteps': abs(end-start),
                          'footContourCorrections': foot_corrections,
                          'reviewedMaterialOverrides': reviewed_materials,
                          'maskSha256': checksums, 'maskPixels': {s: int(m.sum()) for s, m in masks.items()},
                          'maskBounds': {s: bbox(m) for s, m in masks.items()},
                          'skinSeedPixels': int(skin.sum()), 'skinSeedOverlap': 0,
                          'skinProofCoverage': 'partial high-confidence warm skin seeds from source RGB/alpha, independent of garment inverse; excludes facial ink/eyes and ambiguous boundaries',
                          'protectedOverlap': 0, 'outsideSourceAlphaPixels': 0,
                          'runtimeProtectedOverlap': 0, 'protectionGuardPixels': 2,
                          'unownedVisiblePixels': int(((images[fid][:, :, 3] > 0) & ~np.logical_or.reduce(list(masks.values()))).sum()),
                          'handProtection': hand_audit})
        # Every action/frame is inspectable, plus native-resolution pages below.
        sheet = Image.new('RGB', (256*8, 408*((len(ids)+7)//8)), '#e9e8e1')
        d = ImageDraw.Draw(sheet)
        for i, fid in enumerate(ids):
            im = Image.open(review/'native'/f'{fid:04}.png').resize((256, 384))
            x, y = (i % 8)*256, (i//8)*408
            sheet.paste(im, (x, y+24), im)
            d.text((x+4, y+4), f'{fid:04} source {source_frames[fid]}', fill='black')
        sheet.save(review/f'{action}-all.png')
        inspected = [fid for fid in ids if keys[fid] in manual]
        for page, offset in enumerate(range(0, len(inspected), 4)):
            selection = inspected[offset:offset+4]
            native = Image.new('RGB', (W*len(selection), H+28), '#ddd')
            d = ImageDraw.Draw(native)
            for i, fid in enumerate(selection):
                im = Image.open(review/'native'/f'{fid:04}.png')
                native.paste(im, (i*W, 28), im)
                d.text((i*W+4, 5), f'{fid:04} {keys[fid]}', fill='black')
            native.save(review/f'{action}-keyposes-native-{page}.png')
    registration = {'format': 'gathria-wardrobe-registration', 'version': 1,
                    'sourceSha256': sha(pack.read_bytes()), 'characterId': config['characterId'],
                    'frameWidth': W, 'frameHeight': H, 'anchor': {'x': 256, 'y': 710},
                    'frames': sorted(records, key=lambda f: f['frameId'])}
    assert len(records) == len(images)
    assert {r['frameId'] for r in records} == set(images)
    (output/'registration.json').write_text(json.dumps(registration, separators=(',', ':'))+'\n')
    provenance = {'format': 'gathria-side-registration-audit', 'version': 1,
                  'status': 'offline authoring candidate; visually reviewed keyposes with tracked proposals',
                  'sourcePack': str(pack.relative_to(repo_root)), 'sourceSha256': registration['sourceSha256'],
                  'registrationSha256': sha((output/'registration.json').read_bytes()),
                  'reviewedKeyposesSha256': sha(manual_file.read_bytes()),
                  'frameCount': len(records), 'anchorCountPerFrame': 17,
                  'method': 'Native keypose estimates and short-range optical flow; per-frame material seeds and bounded nearest-material outline ownership.',
                  'limitations': ['No recovered skeleton or hidden anatomy; hips and hidden far attachments remain low-confidence estimates.',
                                  'Source blur and source identity changes are preserved.',
                                  'Mask ownership retains original garment silhouettes; it does not create sleeves or replace exposed skin.',
                                  'Ambiguous warm boundaries and pixels farther than the local material radius remain source pixels.',
                                  'Occluded hands have no fabricated protection polygon; all visible warm skin is excluded from clothing masks.'],
                  'checks': {'everySourceFrameExactlyOnce': True, 'all17AnchorsFiniteInCanvas': True,
                             'binaryNativeMasks': True, 'pairwiseDisjointMasks': True,
                             'sourceAlphaContained': True, 'skinSeedAndProtectionOverlap': 0},
                  'frames': sorted(audit, key=lambda f: f['frameId'])}
    (output/'audit.json').write_text(json.dumps(provenance, indent=2)+'\n')
    print(f'{character}: {len(records)} registrations; {len(manual)} inspected keyposes; {len(records)*4} native binary masks including partial skin proof')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--character', choices=['male', 'female', 'both'], default='both')
    args = parser.parse_args()
    for character in (['male', 'female'] if args.character == 'both' else [args.character]):
        run(args.repo_root.resolve(), args.output_root.resolve(), character)


if __name__ == '__main__':
    main()
