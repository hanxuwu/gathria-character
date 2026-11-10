#!/usr/bin/env python3
"""Verify exported GIF reflection/timing, present native same-frame review crops."""
from pathlib import Path
import argparse,json,hashlib
from PIL import Image,ImageDraw
import numpy as np
R=Path(__file__).resolve().parents[1]

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--directory',default='docs/wardrobe-finish/mixed');args=p.parse_args();out=R/args.directory
 runtime=json.loads((out/'runtime.json').read_text());plan=json.loads((out/'plan.json').read_text());groups={g['id']:g for g in plan['groups']};records=[]
 for result in runtime['results']:
  if not result.get('roundTrip'):continue
  group=groups[result['group']];gifrows=[]
  for action in ['run','jump']:
   right=out/'review'/f"{result['group']}-{action}-right.gif";left=out/'review'/f"{result['group']}-{action}-left.gif"
   clip=group['actions'][action];durations=[]
   with Image.open(right) as a, Image.open(left) as b:
    assert a.n_frames==b.n_frames==len(clip['frames'])
    assert (a.info.get('loop')==0)==clip['loop'];assert (b.info.get('loop')==0)==clip['loop']
    pw=(a.width-8)//2
    for i in range(a.n_frames):
     a.seek(i);b.seek(i);aa=np.array(a.convert('RGB'));bb=np.array(b.convert('RGB'));expected=aa.copy()
     for x in [0,pw+8]:expected[16:,x:x+pw]=aa[16:,x:x+pw][:,::-1]
     assert np.array_equal(expected,bb),(result['group'],action,i,'left/right pixels differ')
     want=(round((i+1)*100/clip['fps'])-round(i*100/clip['fps']))*10
     # JavaScript Math.round rounds positive .5 upward, unlike Python bankers rounding.
     import math
     want=(math.floor((i+1)*100/clip['fps']+.5)-math.floor(i*100/clip['fps']+.5))*10
     assert a.info['duration']==b.info['duration']==want
     durations.append(want)
   gifrows.append({'action':action,'frames':clip['frames'],'fps':clip['fps'],'loop':clip['loop'],'durationsMs':durations,'bothFacingsEveryDecodedFrameExactReflection':True,'sourceAndCurrentPanelOrderPreserved':True})
  folder=Path(result['roundTrip']['artifactsLocalOnly']);registration=json.loads((R/group['registrationUrl']).read_text());reg={f['frameId']:f for f in registration['frames']}
  # Explicit difficult poses, then deterministic native clip coverage if absent.
  candidates=([59,72,85,97,100,101,107,108] if group['view']=='side' and group['character']=='male' else [18,23,62,66,78,80,93,101] if group['view']=='side' else [62,89,90,102,106,108,110,112])
  chosen=[f for f in candidates if (folder/f'{f}.png').exists()][:6]
  if len(chosen)<6:
   for f in group['actions']['jump']['frames']:
    if f not in chosen:chosen.append(f)
    if len(chosen)>=6:break
  rows=[]
  for fid in chosen:
   points=reg[fid]['points'];neck=points['neck'];wa=points['waistLeft'];wb=points['waistRight'];cx=(wa['x']+wb['x'])/2;cy=(neck['y']+(wa['y']+wb['y'])/2)/2
   source=Image.open(folder/f'{fid}-source.png').convert('RGBA');current=Image.open(folder/f'{fid}.png').convert('RGBA')
   # Fixed native size crop, no scaling of pixels; source/candidate exact same coordinates.
   w=min(360,source.width);h=min(300,source.height);x=max(0,min(source.width-w,int(cx-w/2)));y=max(0,min(source.height-h,int(cy-h/2)));box=(x,y,x+w,y+h)
   board=Image.new('RGB',(w*2,h+25),'#eee9df');d=ImageDraw.Draw(board)
   for col,(label,im) in enumerate([('SOURCE',source),('MIX',current)]):
    crop=im.crop(box);board.paste(crop,(col*w,25),crop);d.text((col*w+6,6),f'{label} / frame {fid}',fill='#333333')
   rows.append((board,fid,box))
  board=Image.new('RGB',(rows[0][0].width,sum(r[0].height for r in rows)),'#eee9df');y=0
  for row,_,_ in rows:board.paste(row,(0,y));y+=row.height
  fn=f"review/{result['group']}-native-seams.png";board.save(out/fn)
  records.append({'group':result['group'],'caseId':result['caseId'],'selection':result['selection'],'gifVerification':gifrows,'nativeCloseups':{'file':fn,'sha256':hashlib.sha256((out/fn).read_bytes()).hexdigest(),'frames':[{'frameId':fid,'nativeCrop':list(box)} for _,fid,box in rows]},'visualAcceptance':'requires-review'})
 temporal_boards=[]
 if (out/'temporal-witnesses.json').exists():
  witnesses=json.loads((out/'temporal-witnesses.json').read_text())
  for case in witnesses['results']:
   native=Path(case['localPngDirectory']);boxes=[f['nativeBounds'] for f in case['frames'] if f['nativeBounds']]
   if not boxes:continue
   sample=Image.open(native/f"{case['frames'][0]['frameId']}-source.png")
   box=(max(0,min(b[0] for b in boxes)-12),max(0,min(b[1] for b in boxes)-12),min(sample.width,max(b[2] for b in boxes)+12),min(sample.height,max(b[3] for b in boxes)+12))
   w,h=box[2]-box[0],box[3]-box[1];board=Image.new('RGB',(2*w,2*(h+24)),'#eee9df');draw=ImageDraw.Draw(board)
   for row,f in enumerate(case['frames']):
    fid=f['frameId']
    for col,kind in enumerate(['source','current']):
     im=Image.open(native/f'{fid}-{kind}.png').convert('RGBA').crop(box);board.paste(im,(col*w,row*(h+24)+24),im);draw.text((col*w+4,row*(h+24)+4),f'{kind} / {fid}',fill='#333333')
   name=f"review/temporal-{case['index']}-{case['character']}-{case['view']}.png";board.save(out/name)
   temporal_boards.append({'file':name,'caseIndex':case['index'],'fixedNativeCrop':list(box),'garmentId':case['edge']['garmentId'],'fromFrameId':case['edge']['fromFrameId'],'toFrameId':case['edge']['toFrameId'],'visualAcceptance':'requires-review'})
 report={'format':'gathria-mixed-outfit-presentation','version':1,'scope':'Presentation-only crops from actual compositor PNGs and independent verification of decoded production GIFs. No source or garment artwork is changed. PNG crops retain native pixels; GIFs use production half-size display, a fixed palette per clip and 10ms timing.','results':records,'temporalBoards':temporal_boards}
 (out/'presentation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'representativeCases':len(records),'gifsVerified':len(records)*4,'nativeBoards':len(records)}))
if __name__=='__main__':main()
