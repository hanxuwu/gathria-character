"""Authoring contract tests; toy cloth is not visual acceptance evidence."""
import io,json,tempfile,unittest,zipfile
from pathlib import Path
import numpy as np
from PIL import Image
from kling_garment_recipe import build_variant,digest,apply_pose_paint,validate_recipe

def png(pixels):
    out=io.BytesIO();Image.fromarray(pixels).save(out,format='PNG');return out.getvalue()

class GarmentRecipeChecks(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        pixels=np.zeros((4,8,4),np.uint8);pixels[1:3,1:3]=[76,124,133,255];pixels[1,2,3]=128
        pixels[1:3,5:7]=[200,180,140,255]
        ownership=np.zeros_like(pixels);ownership[:,:,3]=np.where(pixels[:,:,3]>0,255,0)
        self.pixels=pixels;self.ownership=ownership
        self.manifest={'format':'gathria-sprite-garment','version':1,'id':'base','name':'Base','slot':'top','frameWidth':8,'frameHeight':8,'sourceSha256':'1'*64,'registrationSha256':'2'*64,'characterId':'fixture','provenance':'Fixture cloth','pages':[{'file':'patches-0.png','maskFile':'ownership-0.png','width':8,'height':4}],'frames':[{'frameId':7,'page':0,'rect':{'x':0,'y':0,'width':4,'height':4},'offset':{'x':2,'y':3}},{'frameId':9,'page':0,'rect':{'x':4,'y':0,'width':4,'height':4},'offset':{'x':2,'y':3}}]}
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as z:
            z.writestr('manifest.json',json.dumps(self.manifest));z.writestr('patches-0.png',png(pixels));z.writestr('ownership-0.png',png(ownership))
        data=out.getvalue();(self.root/'base.zip').write_bytes(data)
        self.recipe={'format':'gathria-garment-recipe','version':1,'category':'shirt','base':{'file':'base.zip','sha256':digest(data)},'output':{'id':'ocean','name':'Ocean'},'material':{'sourceRgb':[76,124,133],'targetRgb':[65,96,142],'tolerance':.23},'poseOverrides':[]}
    def test_material_preserves_alpha_ownership_bindings_and_unmatched_buttons(self):
        data,report=build_variant(self.recipe,self.root)
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            out=np.asarray(Image.open(io.BytesIO(z.read('patches-0.png'))));m=json.loads(z.read('manifest.json'))
            np.testing.assert_array_equal(out[:,:,3],self.pixels[:,:,3]);np.testing.assert_array_equal(out[:,4:],self.pixels[:,4:]);self.assertFalse(np.array_equal(out[:,:4],self.pixels[:,:4]))
            np.testing.assert_array_equal(np.asarray(Image.open(io.BytesIO(z.read('ownership-0.png')))),self.ownership)
            for key in ['frames','sourceSha256','registrationSha256','frameWidth','frameHeight']:self.assertEqual(m[key],self.manifest[key])
        self.assertEqual([p['frameId'] for p in report['poses']],[7,9])
        self.assertEqual(data,build_variant(self.recipe,self.root)[0])
    def test_bad_hash_and_wrong_category_are_rejected(self):
        self.recipe['base']['sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'SHA256'):build_variant(self.recipe,self.root)
        self.recipe['base']['sha256']=digest((self.root/'base.zip').read_bytes());self.recipe['category']='dress'
        with self.assertRaisesRegex(ValueError,'category'):build_variant(self.recipe,self.root)
    def test_pose_paint_refuses_skin_ownership_and_alpha_changes(self):
        base=np.zeros((4,4,4),np.uint8);base[1:3,1:3]=[50,70,90,128];owned=base[:,:,3]>0;paint=base.copy();paint[1:3,1:3,:3]=[70,80,100]
        mask=owned.astype(np.uint8)*255
        out,count=apply_pose_paint(base,owned,paint,mask);self.assertEqual(count,4);np.testing.assert_array_equal(out[:,:,3],base[:,:,3])
        mask[0,0]=255
        with self.assertRaisesRegex(ValueError,'ownership'):apply_pose_paint(base,owned,paint,mask)
        mask[0,0]=0;paint[1,1,3]=255
        with self.assertRaisesRegex(ValueError,'alpha'):apply_pose_paint(base,owned,paint,mask)
    def test_unknown_and_duplicate_pose_overrides_are_rejected(self):
        dummy={'file':'paint.png','sha256':'3'*64};override={'frameId':99,'image':dummy,'mask':dummy}
        self.recipe['poseOverrides']=[override]
        with self.assertRaisesRegex(ValueError,'absent'):build_variant(self.recipe,self.root)
        self.recipe['poseOverrides']=[override,override]
        with self.assertRaisesRegex(ValueError,'unique'):validate_recipe(self.recipe)
    def test_explicit_native_paint_changes_only_one_pose(self):
        image=np.zeros((8,8,4),np.uint8);image[3:7,2:6]=self.pixels[:,:4];image[4,3,:3]=[90,80,100]
        mask=np.zeros((8,8),np.uint8);mask[4,3]=255
        refs=[]
        for name,pixels in [('paint.png',image),('mask.png',mask)]:
            data=png(pixels);(self.root/name).write_bytes(data);refs.append({'file':name,'sha256':digest(data)})
        self.recipe.pop('material');self.recipe['poseOverrides']=[{'frameId':7,'image':refs[0],'mask':refs[1]}]
        data,report=build_variant(self.recipe,self.root)
        with zipfile.ZipFile(io.BytesIO(data)) as z:out=np.asarray(Image.open(io.BytesIO(z.read('patches-0.png'))))
        expected=self.pixels.copy();expected[1,1,:3]=[90,80,100];np.testing.assert_array_equal(out,expected)
        self.assertEqual(report['poses'][0]['paintedClothPixels'],1)
    def test_invalid_material_and_reused_id_are_rejected(self):
        self.recipe['material']['tolerance']=float('nan')
        with self.assertRaisesRegex(ValueError,'tolerance'):build_variant(self.recipe,self.root)
        self.recipe['material']['tolerance']=.2;self.recipe['output']['id']='base'
        with self.assertRaisesRegex(ValueError,'distinct'):build_variant(self.recipe,self.root)

if __name__=='__main__':unittest.main()
