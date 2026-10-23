#!/usr/bin/env python3
"""UI thumbnails taken only from captured application PNG exports."""
from pathlib import Path
import hashlib,json
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'docs/kling-collection/volume-v1/evidence'
output=ROOT/'src/appearance/previews'
looks=json.loads((ROOT/'artwork/kling-collection/source/volume-v1/looks.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
seen=set();records=[]
for look in looks:
 char,style=look['character'],look['hair']
 if style in seen:continue
 seen.add(style)
 path=source/f'final-{look["id"]}/{char}-{look["id"]}-0-right.png'
 if not path.exists():path=source/f'final-{char}/{char}-{look["id"]}-0-right.png'
 refined=source/f'final-{look["id"]}-refined/{char}-{look["id"]}-0-right.png'
 if refined.exists():path=refined
 bank=ROOT/f'docs/kling-appearance/banks/volume/{char}-{style}.zip'
 latest=ROOT/'docs/kling-refinement/evidence/temple-v4/female-pony-after-0-right.png'
 if char=='female' and style=='ribbon-pony' and latest.exists():
  path=latest;bank=ROOT/'docs/kling-appearance/banks/volume-v4/female-ribbon-pony.zip'
 if not path.exists():raise FileNotFoundError(path)
 im=Image.open(path).convert('RGBA');im.load();assert im.size==(768,1184)
 crop=(40,120,730,700);tile=im.crop(crop);tile.thumbnail((152,128),Image.Resampling.LANCZOS)
 canvas=Image.new('RGBA',(152,128));canvas.alpha_composite(tile,((152-tile.width)//2,(128-tile.height)//2))
 dest=output/f'{char}-{style}.png';canvas.save(dest)
 records.append({'file':dest.name,'source':str(path.relative_to(ROOT)),'sourceSha256':sha(path),'bankSha256':sha(bank),'frameId':0,'crop':list(crop),'size':[152,128],'resampling':'Lanczos display thumbnail only; full export stays native','appearance':{'hairId':style,'faceId':None,'hairColor':look['color']}})
(output/'volume-provenance.json').write_text(json.dumps(records,indent=2)+'\n')
print(f'Built {len(records)} actual-export thumbnails')
