#!/usr/bin/env python3
"""Negative checks for independent browser-export permission auditing."""
import io
import json
import unittest
import zipfile
from unittest.mock import patch

import numpy as np
from PIL import Image, ImageDraw

import coverage_export_audit as audit


def polygon(points, width, height):
    image = Image.new('1', (width, height))
    ImageDraw.Draw(image).polygon([(p['x'], p['y']) for p in points], fill=1)
    return np.array(image, bool)


def box(left, top, right, bottom):
    return [{'x':left,'y':top},{'x':right,'y':top},{'x':right,'y':bottom},{'x':left,'y':bottom}]


class ExportAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        catalog = json.loads((audit.ROOT / 'docs/dual-view-wardrobe/assets/catalog.json').read_bytes())
        row = next(r for r in catalog['representations'] if r['character'] == 'male' and r['view'] == 'original')
        cls.path = next(i['url'].lstrip('/') for i in row['items'] if i['slot'] == 'top')
        cls.current = (audit.ROOT / cls.path).read_bytes()
        cls.registration = json.loads((audit.ROOT / row['registrationUrl'].lstrip('/')).read_bytes())

    def test_current_and_historical_archives_are_both_bound(self):
        self.assertFalse(audit.validate_garment(self.current, self.registration)['historical'])
        old = audit.historical(self.path)
        self.assertNotEqual(old, self.current)
        self.assertTrue(audit.validate_garment(old, self.registration)['historical'])

    def test_forged_review_is_not_accepted_as_a_new_catalog_revision(self):
        with zipfile.ZipFile(io.BytesIO(self.current)) as archive:
            files = {name:archive.read(name) for name in archive.namelist()}
        manifest = json.loads(files['manifest.json'])
        manifest['handProtectionReviews'][0]['polygon'][0]['x'] += 1
        files['manifest.json'] = json.dumps(manifest).encode()
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w') as archive:
            for name, data in files.items():
                archive.writestr(name, data)
        with self.assertRaisesRegex(AssertionError, 'unreviewed garment'):
            audit.validate_garment(output.getvalue(), self.registration)

    def test_review_cannot_grow_past_the_original_hand_guard(self):
        source = np.full((8, 8, 4), 255, np.uint8)
        frame = {'frameId':1, 'protected':[{'label':'nearHand','polygon':box(2,2,5,5)}]}
        manifest = {'version':2,'slot':'bottom','handProtectionReviews':[{'frameId':1,'label':'nearHand','polygon':box(1,1,6,6)}]}
        with self.assertRaisesRegex(AssertionError, 'escapes original'):
            list(audit.protected_mask(manifest,frame,source,polygon))

    def test_a_hand_review_cannot_release_the_head(self):
        source = np.full((8, 8, 4), 255, np.uint8)
        frame = {'frameId':1,'protected':[{'label':'head','polygon':box(1,1,6,6)}]}
        manifest = {'version':2,'slot':'top','handProtectionReviews':[{'frameId':1,'label':'head','polygon':box(2,2,5,5)}]}
        with self.assertRaises(AssertionError):
            list(audit.protected_mask(manifest,frame,source,polygon))

    def test_neckline_permission_cannot_be_rebound_to_another_source(self):
        source = np.full((8, 8, 4), 255, np.uint8)
        frame = {'frameId':1,'protected':[{'label':'head','polygon':box(1,1,6,6)}]}
        manifest = {'version':3,'slot':'top','sourceSha256':'other','necklinePermissionProfile':'fixture'}
        with patch.object(audit, 'profiles', return_value={'fixture':{'sourceSha256':'original'}}):
            with self.assertRaisesRegex(AssertionError, 'different source'):
                list(audit.protected_mask(manifest,frame,source,polygon))


if __name__ == '__main__':
    unittest.main()
