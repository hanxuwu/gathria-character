"""Offline visible-limb ownership for the exact Kling male wardrobe source.

This module does not draw clothing or move source pixels. It partitions the
current authoring kit's visible skin by its reviewed limb guides, excludes the
original protected face/neck/hands and semantic footwear, and preserves hidden
limbs as empty regions. The resulting masks are authoring aids, not recovered
original body layers or a runtime skeleton.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import io
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as nd

from kling_wardrobe_common import ROOT, load_source, protected_mask


TEMPLATE = ROOT / 'docs/kling-wardrobe/templates/male-full-outfits-v1.wardrobe-template.zip'
OUTPUT = ROOT / 'artwork/kling-wardrobe/registration/male-limbs-v1'
REGIONS = ('nearArm', 'farArm', 'nearLeg', 'farLeg')
COLORS = {
    'nearArm': (32, 173, 94), 'farArm': (248, 153, 38),
    'nearLeg': (199, 74, 189), 'farLeg': (42, 157, 224),
}
LOCAL_POINT_OVERRIDES = {
    64: {'farWrist': {'x': 527.0, 'y': 664.0, 'visibility': 'visible'}},
    105: {'nearWrist': {'x': 280.0, 'y': 740.0, 'visibility': 'visible'}},
    106: {'nearWrist': {'x': 289.0, 'y': 731.0, 'visibility': 'visible'}},
    107: {'nearWrist': {'x': 295.0, 'y': 725.0, 'visibility': 'visible'}},
    108: {'nearWrist': {'x': 290.0, 'y': 718.0, 'visibility': 'visible'}},
    109: {'nearWrist': {'x': 277.0, 'y': 714.0, 'visibility': 'visible'}},
    110: {
        'nearWrist': {'x': 260.0, 'y': 708.0, 'visibility': 'visible'},
        'farWrist': {'x': 512.0, 'y': 680.0, 'visibility': 'visible'},
    },
    37: {
        'farElbow': {'x': 456.0, 'y': 652.0, 'visibility': 'visible'},
        'farWrist': {'x': 458.0, 'y': 702.0, 'visibility': 'occluded'},
    },
    48: {
        'farShoulder': {'x': 458.0, 'y': 565.0, 'visibility': 'occluded'},
        'farElbow': {'x': 477.0, 'y': 687.0, 'visibility': 'visible'},
        'farWrist': {'x': 490.0, 'y': 744.0, 'visibility': 'visible'},
    },
    57: {
        'farShoulder': {'x': 280.0, 'y': 548.0, 'visibility': 'occluded'},
        'farElbow': {'x': 250.0, 'y': 621.0, 'visibility': 'visible'},
    },
    58: {'farShoulder': {'x': 281.0, 'y': 548.0, 'visibility': 'occluded'}},
    59: {'farShoulder': {'x': 280.0, 'y': 539.0, 'visibility': 'occluded'}},
    60: {'farShoulder': {'x': 280.0, 'y': 550.0, 'visibility': 'occluded'}},
}
LOCAL_COMPONENT_OVERRIDES = {
    64: [{'point': [360, 877], 'region': 'farLeg', 'maximumCorePixels': 1500}],
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def segment_distance(shape, start, end):
    """Distance to a finite line segment, plus its clamped longitudinal phase."""
    yy, xx = np.indices(shape, dtype=np.float32)
    a = np.asarray(start, dtype=np.float32)
    delta = np.asarray(end, dtype=np.float32) - a
    length_squared = max(float(delta @ delta), 1.0)
    phase = np.clip(((xx-a[0])*delta[0] + (yy-a[1])*delta[1]) / length_squared, 0, 1)
    distance = np.hypot(xx-a[0]-phase*delta[0], yy-a[1]-phase*delta[1])
    return distance, phase


class MaleLimbOwnership:
    """Read only the immutable, delivered male authoring kit.

    `for_frame(frame_id, source_rgba)` returns native Boolean masks. Four major
    regions are mutually exclusive; their upper/lower subdivisions are returned
    as additional convenience masks. `semantic(frame_id)` exposes fresh copies
    of the exact kit masks for combining torso, shorts and shoes separately.
    """

    def __init__(self, template_path: Path | str | None = None):
        self.template_path = Path(template_path) if template_path else TEMPLATE
        self.template_bytes = self.template_path.read_bytes()
        self._archive = ZipFile(io.BytesIO(self.template_bytes))
        self.registration_bytes = self._archive.read('registration.json')
        self.registration = json.loads(self.registration_bytes)
        self.guides = {frame['frameId']: frame for frame in self.registration['frames']}
        self.source_sha256 = sha(self._archive.read('source.character.zip'))
        assert self.source_sha256 == self.registration['sourceSha256']
        assert self.registration['frameWidth'] == 704 and self.registration['frameHeight'] == 1056
        assert self.registration['anchor'] == {'x': 352, 'y': 998}
        self._shape = (1056, 704)
        self._semantics: dict[int, dict[str, np.ndarray]] = {}

    def semantic(self, frame_id: int) -> dict[str, np.ndarray]:
        if frame_id not in self.guides:
            raise KeyError(f'Unregistered source frame {frame_id}')
        if frame_id not in self._semantics:
            masks = {}
            for name in ('tank', 'shorts', 'skin', 'shoes', 'head', 'nearHand', 'farHand'):
                data = self._archive.read(f'masks/{frame_id:03}/{name}.png')
                masks[name] = np.asarray(Image.open(io.BytesIO(data)).convert('L')) > 0
                assert masks[name].shape == self._shape
            self._semantics[frame_id] = masks
            if len(self._semantics) > 3:
                del self._semantics[next(iter(self._semantics))]
        return {name: mask.copy() for name, mask in self._semantics[frame_id].items()}

    def points(self, frame_id: int) -> dict:
        """Local garment-authoring axes; the immutable registration is not edited."""
        points = deepcopy(self.guides[frame_id]['points'])
        for name, override in LOCAL_POINT_OVERRIDES.get(frame_id, {}).items():
            points[name].update(override)
            points[name]['method'] = 'garment-only-visible-back-arm-axis-review; hidden-points-estimated'
        return points

    def for_frame(self, frame_id: int, source_rgba: np.ndarray) -> dict[str, np.ndarray]:
        assert source_rgba.shape == (1056, 704, 4)
        guide = self.guides[frame_id]
        masks = self.semantic(frame_id)
        protected = protected_mask(guide)
        blocked = protected | masks['head'] | masks['nearHand'] | masks['farHand'] | masks['tank'] | masks['shorts'] | masks['shoes']
        eligible = masks['skin'] & (source_rgba[:, :, 3] > 0) & ~blocked
        points = self.points(frame_id)
        distances = []
        split_distances = {}
        for region in REGIONS:
            side = region[:4] if region.startswith('near') else region[:3]
            limb = 'Arm' if region.endswith('Arm') else 'Leg'
            names = [side+n for n in (('Shoulder', 'Elbow', 'Wrist') if limb == 'Arm' else ('Hip', 'Knee', 'Ankle'))]
            coords = [(points[name]['x'], points[name]['y']) for name in names]
            upper, _ = segment_distance(self._shape, coords[0], coords[1])
            lower, _ = segment_distance(self._shape, coords[1], coords[2])
            distance = np.minimum(upper, lower)
            # An inferred, wholly occluded far arm must not collect thigh or
            # crossing-forearm pixels merely because its guides lie nearby.
            if all(points[name]['visibility'] == 'occluded' for name in names):
                distance[:] = np.inf
            # Limit assignment to a local contour neighbourhood. This rejects
            # residual neck/head fringe rather than calling every skin pixel a limb.
            distance[distance > (92 if limb == 'Arm' else 100)] = np.inf
            distances.append(distance)
            split_distances[region] = (upper, lower)
        stack = np.stack(distances)
        winner = np.argmin(stack, axis=0)
        local = np.isfinite(stack.min(axis=0))
        # Drawn dark limb creases separate visible surfaces more reliably than
        # the distance to an opposite, partly hidden limb's centre line. Assign
        # connected warm skin cores as surfaces, then extend labels to their
        # original dark outline/fringe without painting or expanding any pixels.
        red, green, blue = source_rgba[:, :, :3].astype(np.int16).transpose(2, 0, 1)
        core = eligible & local & (red > 150) & (green > 75) & (red-green > 24)
        components, count = nd.label(core)
        component_sizes = np.bincount(components.ravel())
        seed_labels = np.zeros(self._shape, np.uint8)
        neck = points['neck']
        for component in range(1, count+1):
            if component_sizes[component] < 80:
                continue
            mask = components == component
            yy, xx = np.where(mask)
            # A visible neck can extend below the shipped head polygon. Keep
            # its whole small colour component, rather than mislabeling a collar
            # sliver as an arm merely because a shoulder guide is nearby.
            neck_piece = (
                np.hypot(xx.mean()-neck['x'], yy.mean()-neck['y']) < 65
                and xx.max()-xx.min() < 150 and yy.max()-yy.min() < 110
            )
            label = 5 if neck_piece else 1 + int(np.bincount(winner[mask], minlength=4).argmax())
            seed_labels[mask] = label
        for override in LOCAL_COMPONENT_OVERRIDES.get(frame_id, []):
            x, y = override['point']
            component = int(components[y, x])
            assert component and component_sizes[component] <= override['maximumCorePixels'], (frame_id, override)
            seed_labels[components == component] = 1 + REGIONS.index(override['region'])
        if seed_labels.any():
            _, nearest = nd.distance_transform_edt(seed_labels == 0, return_indices=True)
            surface_labels = seed_labels[tuple(nearest)]
        else:
            surface_labels = seed_labels
        assigned = eligible & local & (surface_labels > 0) & (surface_labels < 5)
        result = {region: assigned & (surface_labels == index+1) for index, region in enumerate(REGIONS)}
        for region in REGIONS:
            side = 'near' if region.startswith('near') else 'far'
            names = ('UpperArm', 'Forearm') if region.endswith('Arm') else ('Thigh', 'Shin')
            upper, lower = split_distances[region]
            result[side+names[0]] = result[region] & (upper <= lower)
            result[side+names[1]] = result[region] & (upper > lower)
        result['preservedNeck'] = eligible & (surface_labels == 5)
        result['neckSkin'] = result['preservedNeck'].copy()
        residual = eligible & ~assigned & ~result['preservedNeck']
        # Soft video edges and a few incomplete protected hand polygons leave
        # original face/hand/shoe fringe in the generic skin mask. Preserve only
        # residual pixels near those original surfaces, never recolour them as
        # a sleeve or trouser. See source-residual review and native bounds.
        fixed_surfaces = protected | masks['head'] | masks['nearHand'] | masks['farHand'] | masks['shoes']
        fringe_distance = nd.distance_transform_edt(~fixed_surfaces)
        result['preservedSourceFringe'] = residual & ((fringe_distance <= 48) | (source_rgba[:, :, 3] < 128))
        result['unassignedSkin'] = residual & ~result['preservedSourceFringe']
        result['protected'] = protected.copy()
        assert not (np.sum(np.stack([result[name] for name in REGIONS]), axis=0) > 1).any()
        assert not (assigned & blocked).any()
        return result

    def close(self):
        self._archive.close()


def bounds(mask):
    yy, xx = np.where(mask)
    return [int(xx.min()), int(yy.min()), int(xx.max()+1), int(yy.max()+1)] if len(xx) else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--template', type=Path, default=TEMPLATE)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    author = MaleLimbOwnership(args.template)
    source, manifest, _, frames = load_source('male')
    assert sha(source) == author.source_sha256
    output = args.output
    output.mkdir(parents=True, exist_ok=True)
    records = []
    overlays = {}
    mask_archive = ZipFile(output/'masks.zip', 'w', compression=ZIP_DEFLATED, compresslevel=9)
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
    for frame_id, source_rgba in frames.items():
        masks = author.for_frame(frame_id, source_rgba)
        record = {'frameId': frame_id, 'sourcePixelsSha256': sha(source_rgba.tobytes()), 'regions': {}}
        for name, mask in masks.items():
            target = f'{frame_id:03}/{name}.png'
            buffer = io.BytesIO()
            Image.fromarray(mask.astype(np.uint8)*255).save(buffer, format='PNG', compress_level=9)
            data = buffer.getvalue()
            info = ZipInfo(target, (1980, 1, 1, 0, 0, 0)); info.compress_type = ZIP_DEFLATED
            mask_archive.writestr(info, data)
            record['regions'][name] = {'file': target, 'pixels': int(mask.sum()), 'bounds': bounds(mask), 'sha256': sha(data)}
        overlay = source_rgba.copy()
        for name, color in COLORS.items():
            mask = masks[name]
            overlay[mask, :3] = np.rint(overlay[mask, :3] * .35 + np.asarray(color) * .65).astype(np.uint8)
        overlays[frame_id] = Image.fromarray(overlay)
        records.append(record)
    mask_archive.close()
    review_clips = {**manifest['animations'], 'keyposes': {'frames': [0,28,37,48,51,58,62,64,74,87,96,104,107,110,121]}}
    for action, clip in review_clips.items():
        ids = list(dict.fromkeys(clip['frames']))
        sheet = Image.new('RGB', (176*8, 292*((len(ids)+7)//8)), '#eee9df')
        draw = ImageDraw.Draw(sheet)
        for index, frame_id in enumerate(ids):
            x, y = index%8*176, index//8*292
            preview = overlays[frame_id].resize((176, 264), Image.Resampling.LANCZOS)
            sheet.paste(preview, (x, y+28), preview)
            draw.text((x+3, y+3), f'{action} / {frame_id}', fill='#293b32', font=font)
        sheet.save(output/f'{action}-ownership-review.png')
    index = {
        'format': 'gathria-male-visible-limb-ownership', 'version': 1,
        'templateSha256': sha(author.template_bytes), 'sourceSha256': author.source_sha256,
        'registrationSha256': sha(author.registration_bytes),
        'frameSize': [704, 1056], 'anchor': {'x': 352, 'y': 998},
        'maskArchive': {'file': 'masks.zip', 'sha256': sha((output/'masks.zip').read_bytes())},
        'method': 'Exact delivered semantic skin masks partitioned into source-colour surfaces separated by drawn dark creases; component ownership follows reviewed finite limb segments. Visible head/neck/hands, torso, shorts and shoes excluded. Entirely hidden limb chains contribute no ownership. Source RGBA unchanged.',
        'regionColors': COLORS,
        'manualCorrections': {
            'localPointOverrides': LOCAL_POINT_OVERRIDES,
            'componentOwnershipOverrides': LOCAL_COMPONENT_OVERRIDES,
            'reason': 'Frames37/48/57: expose only observed rear-arm slivers despite old occluded-chain labels. Frames58–60: use the observed back-arm axis with an explicitly estimated hidden shoulder. Frame64: preserve the rear-leg wedge; frames64/105–110: source-reviewed wrist cuts guide garment textures. Local points do not mutate the17 registered guides. Hand protection comes from the separately versioned male-full-outfits-v1 profile.',
        },
        'limitations': ['Visible surface ownership only: hidden anatomy is not reconstructed.', 'Upper/lower subdivisions use nearest guide segment; clothing must resolve its own cuff/fold and occlusion silhouettes.', 'Source motion blur and mixed edge colours remain in their source semantic ownership.', 'These are offline authoring aids; this index does not certify visual quality of an outfit.'],
        'frames': records,
    }
    with ZipFile(output/'masks.zip') as delivered:
        assert delivered.testzip() is None
        for record in records:
            for region in record['regions'].values():
                data = delivered.read(region['file']); assert sha(data) == region['sha256']
                decoded = np.asarray(Image.open(io.BytesIO(data))); assert decoded.shape == (1056,704)
                assert set(np.unique(decoded)).issubset({0,255})
                assert int((decoded > 0).sum()) == region['pixels']
    (output/'index.json').write_text(json.dumps(index, indent=2)+'\n')
    print(json.dumps({'output': str(output), 'frames': len(frames), 'unassignedSkinPixels': sum(r['regions']['unassignedSkin']['pixels'] for r in records), 'registrationSha256': index['registrationSha256']}))
    author.close()


if __name__ == '__main__':
    main()
