"""Negative tests for the reversible, pinned female neckline repair layer."""
import io,json,unittest,zipfile,os
from pathlib import Path
import numpy as np
from PIL import Image
from wardrobe_finish_audit import ROOT,asset_revision,is_finished,validated_previous_manifest,undo_finish_frame

class FinishLayerTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.path='docs/kling-wardrobe/garments/female/plum-pintuck-top-v1.zip'
  z=zipfile.ZipFile(Path(os.environ.get("WARDROBE_FINISH_ASSET_ROOT",str(ROOT)))/cls.path);cls.manifest=json.loads(z.read('manifest.json'))
  f=next(f for f in cls.manifest['frames'] if f['frameId']==103);r=f['rect'];o=f['offset'];page=cls.manifest['pages'][f['page']]
  rgba=np.array(Image.open(io.BytesIO(z.read(page['file']))).convert('RGBA'));own=np.array(Image.open(io.BytesIO(z.read(page['maskFile']))).convert('RGBA'))[:,:,3]>0
  cls.patch=np.zeros((1056,704,4),np.uint8);cls.owned=np.zeros((1056,704),bool);sl=np.s_[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']];dest=np.s_[o['y']:o['y']+r['height'],o['x']:o['x']+r['width']];cls.patch[dest]=rgba[sl];cls.owned[dest]=own[sl]
 def test_revision_keeps_old_profile_and_binding(self):
  self.assertTrue(is_finished(self.path));self.assertFalse(is_finished('docs/kling-side-expansion/assets/female-blouse.garment.zip'))
  previous=validated_previous_manifest(self.path,self.manifest)
  self.assertEqual(previous['necklinePermissionProfile'],'female-neckline-cloth-v1')
  self.assertEqual(previous['sourceSha256'],self.manifest['sourceSha256'])
  self.assertNotEqual(asset_revision(self.path)['beforeSha256'],asset_revision(self.path)['sha256'])
 def test_exact_native_layer_is_reversible(self):
  old,owned=undo_finish_frame(self.path,103,self.patch,self.owned)
  self.assertLess(int(owned.sum()),int(self.owned.sum()))
  self.assertTrue(np.array_equal(old[owned],self.patch[owned]))
 def test_extra_rgb_change_cannot_hide_in_the_layer(self):
  bad=self.patch.copy();bad[0,0,0]^=1
  with self.assertRaises(AssertionError):undo_finish_frame(self.path,103,bad,self.owned)
 def test_extra_ownership_change_is_rejected(self):
  bad=self.owned.copy();bad[0,0]=True
  with self.assertRaises(AssertionError):undo_finish_frame(self.path,103,self.patch,bad)
 def test_manifest_permission_downgrade_is_not_accepted_as_current(self):
  bad=dict(self.manifest);bad['necklinePermissionProfile']='female-neckline-cloth-v1'
  with self.assertRaises(AssertionError):validated_previous_manifest(self.path,bad)

if __name__=='__main__':unittest.main()
