#!/usr/bin/env python3
"""Regression guards for the diagnostic's alpha ownership and native grid phase."""
import importlib.util,io,unittest,zipfile
from pathlib import Path
import numpy as np
from PIL import Image
spec=importlib.util.spec_from_file_location('triage',Path(__file__).with_name('triage-wardrobe-temporal-coverage.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class DiagnosticsTest(unittest.TestCase):
 def fixture(self,rgba,mask,offset=(0,0)):
  stream=io.BytesIO()
  with zipfile.ZipFile(stream,'w') as z:
   for name,a in [('patch.png',rgba),('mask.png',mask)]:
    p=io.BytesIO();Image.fromarray(a,'RGBA').save(p,format='PNG');z.writestr(name,p.getvalue())
  h,w=rgba.shape[:2]
  manifest={'frameWidth':16,'frameHeight':16,'pages':[{'file':'patch.png','maskFile':'mask.png'}],'frames':[{'frameId':7,'page':0,'rect':{'x':0,'y':0,'width':w,'height':h},'offset':{'x':offset[0],'y':offset[1]}}]}
  with zipfile.ZipFile(io.BytesIO(stream.getvalue())) as z:return m.describe(z,manifest)
 def test_ownership_is_alpha_not_mask_rgb(self):
  art=np.full((4,4,4),255,np.uint8);mask=np.zeros((4,4,4),np.uint8);mask[0,0,3]=255
  stats,samples=self.fixture(art,mask)
  self.assertEqual(stats[7]['ownedPixels'],1);self.assertEqual(stats[7]['visiblePixels'],1);self.assertTrue(samples[7][1][0,0])
 def test_fixed_grid_uses_native_offset_phase(self):
  art=np.full((4,4,4),255,np.uint8);mask=np.zeros((4,4,4),np.uint8);mask[...,3]=255
  stats,samples=self.fixture(art,mask,(3,3));self.assertEqual(stats[7]['visibleBounds'],[3,3,7,7]);self.assertEqual(int(samples[7][1].sum()),1);self.assertTrue(samples[7][1][1,1]);self.assertFalse(samples[7][1][0,0])
 def test_transparent_removal_is_owned_not_visible(self):
  art=np.zeros((4,4,4),np.uint8);mask=np.zeros((4,4,4),np.uint8);mask[...,3]=255
  stats,samples=self.fixture(art,mask);self.assertEqual(stats[7]['ownedPixels'],16);self.assertEqual(stats[7]['visiblePixels'],0);self.assertIsNone(stats[7]['visibleBounds']);self.assertTrue(samples[7][1][0,0]);self.assertEqual(float(samples[7][0].sum()),0.)
if __name__=='__main__':unittest.main()
