#!/usr/bin/env python3
"""Regression probes for reviewer-observed female ownership defects.

Uses original source coordinates, not a generated pose or transformed rig.
Run after prepare-kling-wardrobe-female.py; this does not certify visual approval.
"""
from pathlib import Path
import argparse
import hashlib
import json

import numpy as np
from PIL import Image

from kling_wardrobe_common import ROOT, protected_mask


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--masks', type=Path, default=Path('/tmp/kling-wardrobe-female/masks'))
    parser.add_argument('--registration', type=Path, default=ROOT / 'artwork/kling-wardrobe/registration/female/registration.json')
    args = parser.parse_args()
    definition = json.loads((ROOT / 'artwork/kling-wardrobe/registration/female/manual-ownership-corrections.json').read_text())
    registration = json.loads(args.registration.read_text())
    frames = {f['frameId']: f for f in registration['frames']}
    checks = []
    for key, coordinates in definition['regressionClothProbes'].items():
        frame_id = int(key)
        tank = np.array(Image.open(args.masks / key / 'tank.png'))
        skin = np.array(Image.open(args.masks / key / 'skin.png'))
        protected = protected_mask(frames[frame_id])
        for x, y in coordinates:
            assert tank[y, x] == 255 and skin[y, x] == 0, (frame_id, x, y, 'original cloth must belong to tank')
            assert not protected[y, x], (frame_id, x, y, 'cloth must not be a protected body region')
            checks.append({'frameId': frame_id, 'point': [x,y], 'expected': 'cloth'})
    frame = frames[89]
    tank = np.array(Image.open(args.masks / '89/tank.png'))
    protected = protected_mask(frame)
    for x, y in definition['regressionHeadSkinProbes']['89']:
        assert tank[y, x] == 0, (89, x, y, 'skin must stay outside clothing ownership')
        if [x,y] != [205,661]:
            assert protected[y,x], (89, x, y, 'face, neck and hand stay protected')
        checks.append({'frameId': 89, 'point': [x,y], 'expected': 'source skin'})
    for x,y in definition.get('regressionUncoveredSkinProbes', {}).get('89', []):
        assert tank[y,x] == 0, (89, x, y, 'visible neck skin must remain outside clothing ownership')
        checks.append({'frameId': 89, 'point': [x,y], 'expected': 'uncovered source skin'})
    for name, calibration in definition['frame89']['points'].items():
        assert [frame['points'][name]['x'], frame['points'][name]['y']] == calibration['new']
    head_regions = [{'frameId': f['frameId'], 'head': next(r for r in f['protected'] if r['label']=='head')} for f in registration['frames']]
    head_sha = hashlib.sha256(json.dumps(head_regions, separators=(',',':')).encode()).hexdigest()
    assert head_sha == definition['headProtectionSha256Before'], 'Original head protection must remain unchanged'
    shoes = np.array(Image.open(args.masks / '51/shoes.png'))
    skin = np.array(Image.open(args.masks / '51/skin.png'))
    for x,y in [(166,841),(170,852),(174,851)]:
        assert shoes[y,x] == 255 and skin[y,x] == 0, (51, x, y, 'pink heel belongs to shoe')
        checks.append({'frameId': 51, 'point': [x,y], 'expected': 'shoe'})
    output = {'registrationSha256': hashlib.sha256(args.registration.read_bytes()).hexdigest(), 'headProtectionSha256': head_sha, 'checks': checks, 'calibratedPoints': definition['frame89']['points'], 'status': 'passed'}
    (args.registration.parent / 'ownership-regression.json').write_text(json.dumps(output, indent=2)+'\n')
    print(json.dumps(output, indent=2))


if __name__ == '__main__':
    main()
