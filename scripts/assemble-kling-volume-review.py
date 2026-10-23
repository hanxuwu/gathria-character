#!/usr/bin/env python3
"""Assemble current look galleries and matched iteration crops from real exports."""
from pathlib import Path
import importlib.util,json,hashlib
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];DEST=ROOT/'docs/kling-collection/volume-v1';OUT=DEST/'review'
s=importlib.util.spec_from_file_location('h',ROOT/'scripts/render-kling-appearance-review.py');h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
looks=json.loads((ROOT/'artwork/kling-collection/source/volume-v1/looks.json').read_text())
def path(look,fid=0):
 p=DEST/f'evidence/final-{look["id"]}/{look["character"]}-{look["id"]}-{fid}-right.png'
 if not p.exists():p=DEST/f'evidence/final-{look["character"]}/{look["character"]}-{look["id"]}-{fid}-right.png'
 refined=DEST/f'evidence/final-{look["id"]}-refined/{look["character"]}-{look["id"]}-{fid}-right.png'
 return refined if refined.exists() else p

def rows(tiles,cols):
 bands=[h.join_row(tiles[i:i+cols]) for i in range(0,len(tiles),cols)];out=Image.new('RGB',(max(b.width for b in bands),sum(b.height for b in bands)),h.BG);y=0
 for b in bands:out.paste(b,(0,y));y+=b.height
 return out

report={'inputs':[],'artifacts':[],'iterations':[]};native=[];compact=[];hair=[];ears=[];seen=set()
for look in looks:
 p=path(look);im=Image.open(p).convert('RGBA');im.load();assert im.size==(768,1184)
 report['inputs'].append({'look':look['id'],'file':str(p.relative_to(ROOT)),'sha256':h.sha(p)})
 native.append(h.sheet_tile(im,look['name']+' / native 1x',1));compact.append(h.sheet_tile(im,look['name']+' / overview 0.5x',.5))
 if look['hair'] not in seen:
  seen.add(look['hair']);hair.append(h.sheet_tile(im.crop((40,120,730,710)),look['hair']+' / native 1x',1))
  crop=im.crop((175,495,405,705)).resize((460,420),Image.Resampling.NEAREST)
  ears.append(h.sheet_tile(crop,look['hair']+' / ear / 2x',1))
rows(native,3).save(OUT/'nine-outfits-1x.png');rows(compact,3).save(OUT/'nine-outfits-overview.png');rows(hair,3).save(OUT/'six-hairstyles-1x.png');rows(ears,3).save(OUT/'six-ear-crops-2x.png')
for key in ['honey-garden','harbor-sailor']:
 look=next(l for l in looks if l['id']==key);panels=[]
 for fid in [0,55,86]:
  a=DEST/f'evidence/final-female/female-{key}-{fid}-right.png';b=path(look,fid)
  before=Image.open(a).convert('RGBA');after=Image.open(b).convert('RGBA');assert before.size==after.size
  for label,im in [('Initial app export',before),('Refined app export',after)]:
   panels.append(h.sheet_tile(im,f'{label} / {key} / source {fid} / 0.5x',.5))
  report['iterations'].append({'look':key,'frameId':fid,'before':str(a.relative_to(ROOT)),'beforeSha256':h.sha(a),'after':str(b.relative_to(ROOT)),'afterSha256':h.sha(b),'sameNativeDimensions':True})
 rows(panels,2).save(OUT/f'{key}-refinement-before-after.png')
for name in ['nine-outfits-1x.png','nine-outfits-overview.png','six-hairstyles-1x.png','six-ear-crops-2x.png','honey-garden-refinement-before-after.png','harbor-sailor-refinement-before-after.png']:
 p=OUT/name;im=Image.open(p);im.load();report['artifacts'].append({'file':str(p.relative_to(ROOT)),'sha256':h.sha(p),'size':list(im.size),'decoded':True})
(DEST/'gallery-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(f'Assembled {len(looks)} looks, {len(seen)} hair styles; matched initial/final captures retained.')
