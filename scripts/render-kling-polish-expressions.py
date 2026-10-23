#!/usr/bin/env python3
"""Native crops of downloaded application PNGs, not generated donor drawings."""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'docs/kling-polish/evidence/hair-v5'
assert json.loads((source/'evidence-index.json').read_text())['passed']
bg=(238,232,218);canvas=Image.new('RGB',(1890,1140),bg);draw=ImageDraw.Draw(canvas)
inputs=[]
for row,character in enumerate(['male','female']):
    for col,(tag,fid,label) in enumerate([('after',0,'Original face / idle'),('gentle',0,'Gentle / idle'),('expressive',78,'Source closed-eye laughter / celebrate')]):
        path=source/f'{character}-{character}-hair-{tag}-{fid}-right.png'
        image=Image.open(path).convert('RGBA');background=Image.new('RGBA',image.size,bg+(255,));background.alpha_composite(image)
        canvas.paste(background.crop((100,120,730,660)).convert('RGB'),(630*col,570*row+30))
        draw.text((630*col+12,570*row+8),f'{character} / {label} / native 1x crop',fill=(40,40,40))
        inputs.append({'file':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'crop':[100,120,730,660]})
out=ROOT/'docs/kling-polish/review/expression-states-1x.png';canvas.save(out)
Image.open(out).load()
(out.parent/'expression-states.json').write_text(json.dumps({'inputs':inputs,'output':str(out.relative_to(ROOT)),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'scale':1,'note':'Original/Gentle are selectable; laughter is the unchanged source celebration pose, not a third selectable face.'},indent=2)+'\n')
print(out)
