#!/usr/bin/env python3
"""Decode new source-bound banks; prove old banks and copied expressions unchanged."""
from pathlib import Path
import hashlib,io,json,zipfile
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'docs/kling-collection/volume-v1'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def bank(path):
 with zipfile.ZipFile(path) as z:
  assert z.testzip() is None
  m=json.loads(z.read('manifest.json'))
  pages=[]
  for p in m['pages']:
   a=Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA');b=Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA');a.load();b.load()
   assert a.size==b.size==(p['width'],p['height'])
   pages.append((np.array(a),np.array(b)[:,:,3]))
 return m,pages

def crops(style,pages):
 result={}
 for layer in style['layers']:
  for f in layer['frames']:
   key=(layer['role'],f['frameId'])
   if f['mode']=='source':result[key]=('source',);continue
   r=f['rect'];a,b=pages[f['page']];s=np.s_[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
   result[key]=(tuple(f['offset'].values()),hashlib.sha256(a[s].tobytes()+b[s].tobytes()).hexdigest())
 return result

baseline=json.loads((DEST/'baseline-hashes.json').read_text())
for item in baseline['files']:assert sha(ROOT/item['file'])==item['sha256'],item['file']
report={'legacyFilesUnchanged':len(baseline['files']),'hair':[],'clothes':[]}
for char in ['male','female']:
 original,oldpages=bank(ROOT/f'docs/kling-appearance/banks/{char}.zip')
 gentle=crops(next(s for s in original['styles'] if s['id']=='gentle'),oldpages)
 for path in sorted((ROOT/'docs/kling-appearance/banks/volume').glob(f'{char}-*.zip')):
  m,pages=bank(path);assert m['sourceSha256']==original['sourceSha256'] and m['registrationSha256']==original['registrationSha256']
  assert m['padding']==original['padding'] and m['frameWidth']==original['frameWidth'] and m['frameHeight']==original['frameHeight']
  assert gentle==crops(next(s for s in m['styles'] if s['id']=='gentle'),pages)
  head=next(s for s in m['styles'] if s['slot']=='hair');ids={p['frameId'] for p in m['poses']}
  for layer in head['layers']:
   assert {f['frameId'] for f in layer['frames']}==ids
   for f in layer['frames']:
    r,o=f['rect'],f['offset'];a,b=pages[f['page']];crop=a[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']];mask=b[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
    assert crop.shape==(r['height'],r['width'],4) and mask.any()
    assert np.array_equal(crop[:,:,3]>0,mask>0)
    assert o['x']>-32 and o['y']>-128 and o['x']+r['width']<736 and o['y']+r['height']<1056
  report['hair'].append({'file':str(path.relative_to(ROOT)),'sha256':sha(path),'bytes':path.stat().st_size,'poses':len(ids),'layers':len(head['layers']),'pages':len(pages),'gentleRgbaAndOwnershipExact':True,'allPagesDecoded':True,'noEdgeClipping':True})
 del oldpages
for item,d in json.loads((ROOT/'artwork/kling-collection/source/volume-v1/cloth-donors.json').read_text()).items():
 path=ROOT/f'docs/kling-wardrobe/garments/{d["character"]}/{item}.zip';m,pages=bank(path);ids=set()
 for f in m['frames']:
  assert f['frameId'] not in ids;ids.add(f['frameId']);r=f['rect'];a,b=pages[f['page']]
  assert a[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']].shape==(r['height'],r['width'],4)
  assert b[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']].any()
 report['clothes'].append({'file':str(path.relative_to(ROOT)),'sha256':sha(path),'bytes':path.stat().st_size,'poses':len(ids),'pages':len(pages),'allPagesDecoded':True})
(DEST/'asset-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'oldAssetsUnchanged':report['legacyFilesUnchanged'],'hairBanks':len(report['hair']),'clothingBanks':len(report['clothes']),'clothingPoses':sum(i['poses']for i in report['clothes']),'hairLayerPoses':sum(i['poses']*i['layers']for i in report['hair'])}))
