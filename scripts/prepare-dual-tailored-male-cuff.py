#!/usr/bin/env python3
"""One anatomically reviewed ankle correction, isolated from all legacy banks.

The full-outfits-v1 frame 54 nearHand contour accidentally contained a rear
ankle spur. Retain the exact real hand vertices; let only the existing painted
chino donor cover that rear-ankle surface. No source or old bank is overwritten.
"""
from copy import deepcopy
import argparse, importlib.util, io, json, zipfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
from kling_wardrobe_common import ROOT, load_source, protected_mask, save_garment, sha, json_bytes
from kling_male_limb_ownership import MaleLimbOwnership

OUT=ROOT/'artwork/dual-tailored/male/staged'
REVIEW=ROOT/'artwork/dual-tailored/male/ankle-review'
REG=ROOT/'docs/kling-wardrobe/registration/male-full-outfits-v1.json'
BOTTOM=ROOT/'docs/kling-wardrobe/garments/male/ochre-chinos-v1.zip'
TOP=ROOT/'docs/kling-wardrobe/garments/male/teal-camp-shirt-v5.zip'

def module(name,file):
 s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

def alias_bank(path,id,reg,output,provenance):
 with zipfile.ZipFile(path) as z: files={n:z.read(n) for n in z.namelist()}
 m=json.loads(files['manifest.json']);m.update(id=id,registrationSha256=sha(reg),provenance=provenance)
 files['manifest.json']=json_bytes(m)
 with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for name,data in sorted(files.items()):
   info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
 with zipfile.ZipFile(path) as a,zipfile.ZipFile(output) as b:
  assert all(a.read(n)==b.read(n) for n in a.namelist() if n!='manifest.json')
 return {'id':id,'sha256':sha(output.read_bytes()),'pngAndOwnershipExact':True}

def main():
 global OUT
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=OUT);args=parser.parse_args()
 OUT=args.output.resolve();OUT.relative_to(ROOT)
 OUT.mkdir(parents=True,exist_ok=True);REVIEW.mkdir(parents=True,exist_ok=True)
 reader=module('cuff_reader','prepare-kling-male-fit-polish.py');trousers=module('cuff_donor','prepare-kling-male-trousers.py')
 source,manifest,_,frames=load_source('male');original=frames[54];old_bytes=REG.read_bytes();old=json.loads(old_bytes);new=deepcopy(old)
 oldrow=next(f for f in old['frames'] if f['frameId']==54);row=next(f for f in new['frames'] if f['frameId']==54)
 region=next(p for p in row['protected'] if p['label']=='nearHand');polygon=region['polygon'];assert polygon[17:23]==[{'x':244,'y':806},{'x':244,'y':819},{'x':247,'y':823},{'x':259,'y':823},{'x':264,'y':828},{'x':288,'y':822}]
 region['polygon']=polygon[:17]+polygon[23:]
 removed=protected_mask(oldrow)&~protected_mask(row)
 assert removed.sum()==1133
 assert all(a==b for a,b in zip(old['frames'],new['frames']) if a['frameId']!=54)
 assert oldrow['points']==row['points']
 reg=json_bytes(new);(OUT/'male-ankle-reviewed-v1.registration.json').write_bytes(reg)
 author=MaleLimbOwnership();semantic=author.semantic(54);limbs=author.for_frame(54,original)
 # The reviewed region is the visible rear ankle, never an inferred hand or a
 # shoe. Every original shoe pixel remains fixed, even at the shared border.
 yy,xx=np.indices(removed.shape)
 semantic_spur=semantic['nearHand']&(yy>=785)&(yy<832)&(xx>=240)&(xx<294)&~protected_mask(row)
 restored=(removed|semantic_spur)&(original[:,:,3]>0)&~semantic['shoes']
 semantic['nearHand'] &= ~restored;limbs['farLeg'] |= restored;limbs['nearLeg'] &= ~restored
 guide={**row,'points':author.points(54)}
 donor=trousers.DONORS['day'];rgb=np.asarray(Image.open(trousers.DESIGN).convert('RGB'),dtype=float)
 mask=trousers.poly(donor['polygon'])&(rgb[:,:,0]-rgb[:,:,2]>38)&(rgb[:,:,1]-rgb[:,:,2]>18)
 mask=nd.binary_erosion(mask,iterations=7);mask[900:]=False
 _,nearest=nd.distance_transform_edt(~mask,return_indices=True);cloth=rgb[tuple(nearest)]
 proposed,proposed_owned=trousers.fitted_bottom(original,guide,limbs,semantic,donor,cloth)
 # Full proposed field is sampled only inside the bounded repair below.
 banks=reader.read_bank(BOTTOM);before,old_owned=banks[54];after=before.copy();owned=old_owned.copy()
 # Replace the missing cloth and the four-pixel old notch outline only; all
 # unrelated waist, legs, folds and frames remain exact legacy garment pixels.
 local=nd.binary_dilation(removed,iterations=4)&(proposed_owned|old_owned)
 local &= ~protected_mask(row)&~semantic['shoes']
 after[local]=proposed[local];owned[local]=proposed_owned[local]
 after[~owned]=0;banks[54]=(after,owned)
 assert not (owned&protected_mask(row)).any()
 assert not ((owned&~old_owned)&semantic['shoes']).any()
 assert np.array_equal(after[~local],before[~local])
 # New protection differs only on reviewed ankle. Source identity and palm
 # remain exact even while the restored cloth covers the ankle.
 before_comp=original.copy();before_comp[old_owned]=before[old_owned]
 comp=original.copy();comp[owned]=after[owned]
 assert np.array_equal(comp[protected_mask(row)],original[protected_mask(row)])
 assert np.array_equal(comp[semantic['shoes']],original[semantic['shoes']])
 assert np.array_equal(comp[semantic['head']],original[semantic['head']])
 provenance=f'Anatomically reviewed frame54 rear-ankle cloth repair from existing painted donor {trousers.DESIGN.relative_to(ROOT)} SHA256 {sha(trousers.DESIGN.read_bytes())}; source/old bank immutable. Six misclassified nearHand spur vertices removed in new source-bound registration only (1133 pixels), plus the same bounded source ankle semantic fringe, real palm retained. Reuses original chino fitting offline within restored ankle plus4px old notch-outline band; all other frames and unrelated cloth exact. Review scripts/prepare-dual-tailored-male-cuff.py and artwork/dual-tailored/male/ankle-review.'
 result=save_garment('male','dual-male-original-cuff-seed-v1','Chinos with reviewed rear ankle','bottom',reg,banks,provenance,output=OUT/'original-bottom.garment.zip')
 decoded=reader.read_bank(OUT/'original-bottom.garment.zip')
 for fid,(paint,mask) in banks.items():
  assert np.array_equal(decoded[fid][0],paint) and np.array_equal(decoded[fid][1],mask)
 del decoded
 top=alias_bank(TOP,'dual-male-original-shirt-seed-v1',reg,OUT/'original-top.garment.zip',f'Exact art and ownership alias of teal-camp-shirt-v5 SHA256 {sha(TOP.read_bytes())}; source-bound to frame54 ankle-corrected registration. No shirt pixels or coverage changed.')
 Image.fromarray(comp).save(REVIEW/'cuff-candidate-native.png')
 Image.fromarray(before_comp).save(REVIEW/'cuff-before-native.png')
 crop=(185,710,365,880);board=Image.new('RGB',(3*540,570),'#eee9df');draw=ImageDraw.Draw(board)
 for i,(label,a) in enumerate([('Unchanged source',original),('Before ankle correction',before_comp),('Candidate: existing painted cloth',comp)]):
  im=Image.fromarray(a).crop(crop).resize((540,510),Image.Resampling.NEAREST);board.paste(im,(540*i,60),im);draw.text((540*i+8,20),label,fill='black')
 board.save(REVIEW/'cuff-comparison-3x.png')
 report={'sourceSha256':sha(source),'oldRegistrationSha256':sha(old_bytes),'newRegistrationSha256':sha(reg),'changedFrame':54,'unchangedFrames':len(frames)-1,'removedProtectionPixels':int(removed.sum()),'restoredVisibleAnklePixels':int(restored.sum()),'additionalSemanticEdgePixels':int((restored&~removed).sum()),'addedClothPixels':int((owned&~old_owned).sum()),'changedLocalClothPixels':int(np.any(after!=before,axis=2).sum()),'localRepairBounds':list(map(int,[np.where(local)[1].min(),np.where(local)[0].min(),np.where(local)[1].max()+1,np.where(local)[0].max()+1])),'realHandSourceExact':True,'shoesSourceExact':True,'allOtherSourceAndClothPixelsExact':True,'newBottom':result,'newTop':top}
 (REVIEW/'cuff-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
