from pathlib import Path
import hashlib,io,json,shutil,zipfile
from PIL import Image
R=Path('/workspace/gathria-character');O=Path('/tmp/kling-hair-match/references')
sha=lambda b:hashlib.sha256(b).hexdigest()
def extract(pack,fid=0):
 z=zipfile.ZipFile(pack); m=json.loads(z.read('manifest.json')); c=json.loads(z.read('character.json')); f=next(f for f in m['frames'] if f['id']==fid)
 sheets=[m['spritesheet']]+m.get('additionalSheets',[]);p=Image.open(io.BytesIO(z.read(sheets[f.get('page',0)]['file']))).convert('RGBA')
 return p.crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height'])),m,c
records=[]
for sex in ['male','female']:
 original=R/f'artwork/dual-looks/appearance/runtime/{sex}-original/0-natural.png'
 orig=Image.open(original).convert('RGBA')
 oname=f'{sex}-original-natural-standing.png';shutil.copyfile(original,O/oname)
 # Existing renderer's stand pose, native pixels only: crop with margins around
 # the actual accepted head/hair and short neck; no repaint or interpolation.
 obox=(70,235 if sex=='male' else 220,665,750)
 orig.crop(obox).save(O/f'{sex}-original-head-native.png')
 sidepath=R/f'docs/kling-side-workspace/assets/{sex}.source.zip'
 side,m,c=extract(sidepath);sname=f'{sex}-side-bald-standing.png';side.save(O/sname)
 sbox=(95,195,390,510)
 side.crop(sbox).save(O/f'{sex}-side-bald-head-native.png')
 side.crop((60,150,430,520)).save(O/f'{sex}-side-bald-head-roomy-native.png')
 # Also keep the original source unadorned for exact identity/ratio checks.
 originpack=R/f'docs/kling-motion/exports/{sex}.character.zip'
 source,om,oc=extract(originpack);source.save(O/f'{sex}-original-bald-standing.png')
 # Reuse actual runtime fitted frame-0 hair pieces as separate design inputs.
 bank=zipfile.ZipFile(R/f'docs/dual-looks/assets/{sex}-original.appearance.zip');am=json.loads(bank.read('manifest.json'))
 style=next(x for x in am['styles'] if x['slot']=='hair');layers=[]
 for layer in style['layers']:
  f=next(x for x in layer['frames'] if x['frameId']==0)
  if f['mode']!='paint':continue
  p=am['pages'][f['page']];im=Image.open(io.BytesIO(bank.read(p['file']))).convert('RGBA');mask=Image.open(io.BytesIO(bank.read(p['maskFile']))).convert('RGBA');r=f['rect'];box=(r['x'],r['y'],r['x']+r['width'],r['y']+r['height']);patch=im.crop(box);mask=mask.crop(box).getchannel('A')
  import numpy as np
  a=np.array(patch);owned=np.array(mask)==255;a[~owned]=0;patch=Image.fromarray(a)
  canvas=Image.new('RGBA',orig.size);xy=(f['offset']['x']+am['padding']['left'],f['offset']['y']+am['padding']['top']);canvas.paste(patch,xy)
  name=f'{sex}-original-{layer["role"]}-native.png';canvas.crop(obox).save(O/name);layers.append({'role':layer['role'],'file':name,'nativeOffset':f['offset'],'atlasRect':r,'cropInPaddedFrame':obox})
 records.append({'character':sex,'original':{'image':oname,'imageSha256':sha((O/oname).read_bytes()),'sourcePack':str(originpack.relative_to(R)),'sourceSha256':sha(originpack.read_bytes()),'frameId':0,'sourceFrame':oc['derivation']['frames'][0],'hairId':style['id'],'sourceCanvas':[704,1056],'renderCanvas':list(orig.size),'padding':am['padding'],'headCropFile':f'{sex}-original-head-native.png','headCropInRenderedFrame':obox,'layers':layers},'sideTarget':{'image':sname,'imageSha256':sha((O/sname).read_bytes()),'sourcePack':str(sidepath.relative_to(R)),'sourceSha256':sha(sidepath.read_bytes()),'frameId':0,'sourceFrame':c['derivation']['frames'][0],'canvas':list(side.size),'headCropFile':f'{sex}-side-bald-head-native.png','headCropInSourceFrame':sbox,'roomyHeadCropFile':f'{sex}-side-bald-head-roomy-native.png','roomyHeadCropInSourceFrame':(60,150,430,520)}})
(O/'references.json').write_text(json.dumps({'note':'References are exact existing native crops/decodes and copied renderer results. No new artwork, body transforms, smoothing, or face replacement. Donor design imagery is separately labelled authored source, not runtime evidence.','records':records},indent=2)+'\n')
# Exact source-sheet crops isolate only the relevant donor portrait; these are
# artwork references, never accepted replacements for the current source face.
for sex,src,box in [('male','expansion-design.png',(0,0,915,887)),('female','soft-bob-design.png',(900,0,1774,887))]:
 Image.open(R/'artwork/kling-appearance/source'/src).crop(box).save(O/f'{sex}-original-donor-portrait.png')
print(json.dumps(records,indent=2))
