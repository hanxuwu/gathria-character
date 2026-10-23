#!/usr/bin/env python3
"""Native-export hem closeups; source is always an actual CharacterPack download."""
from pathlib import Path
import importlib.util,json
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('review',ROOT/'scripts/render-kling-appearance-review.py');h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
source=ROOT/'docs/kling-refinement/evidence/primary-fit-v3';output=ROOT/'docs/kling-refinement/review';report=[]
registration=json.loads((ROOT/'docs/kling-wardrobe/registration/female.json').read_text());poses={p['frameId']:p for p in registration['frames']}
for study in ['female-day','female-wedding']:
    _,before=h.decode_pack(source/f'female-{study}-before.character.zip');_,after=h.decode_pack(source/f'female-{study}-after.character.zip');rows=[]
    for fid in [0,55,62,86]:
        p=poses[fid]['points'];wy=int((p['waistLeft']['y']+p['waistRight']['y'])/2);region=(90,wy-65,660,1025)
        row=h.join_row([h.sheet_tile(frames[fid].crop(region),f'{label} / source {fid} / 2x',1) for label,frames in [('Before',before),('After',after)]])
        rows.append(row.resize((row.width*2,row.height*2),Image.Resampling.NEAREST))
    board=Image.new('RGB',(rows[0].width,sum(r.height for r in rows)),h.BG);y=0
    for row in rows:board.paste(row,(0,y));y+=row.height
    path=output/f'{study}-hem-2x.png';board.save(path)
    with Image.open(path) as im:im.load();assert im.size==board.size
    report.append({'file':str(path.relative_to(ROOT)),'sha256':h.sha(path),'size':list(board.size),'decoded':True,'source':'actual application CharacterPack frames'})
(ROOT/'docs/kling-refinement/hem-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print('Two actual-export hem closeups decoded.')
