#!/usr/bin/env python3
"""Present actual compositor frames; no per-frame alignment or artwork edits."""
from pathlib import Path
import json,hashlib
from PIL import Image,ImageDraw,ImageOps
ROOT=Path(__file__).resolve().parents[1];TEMP=Path('/tmp/wardrobe-finish/female/actual');OUT=ROOT/'docs/wardrobe-finish/female';OUT.mkdir(parents=True,exist_ok=True)
BG='#eee9df';CROPS={89:(310,590,470,685),90:(310,510,470,605),93:(310,385,470,480),101:(310,465,470,560),102:(310,535,470,630),103:(310,590,470,685)}
def rgba(path):return Image.open(path).convert('RGBA')
def flatten(im):
 bg=Image.new('RGBA',im.size,BG);bg.alpha_composite(im);return bg.convert('RGB')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def savegif(frames,path,durations):
 # One shared preview palette. Native RGBA PNGs remain unquantized.
 sample=Image.new('RGB',(frames[0].width,frames[0].height*min(6,len(frames))))
 for i in range(min(6,len(frames))):sample.paste(frames[round(i*(len(frames)-1)/max(1,min(6,len(frames))-1))],(0,i*frames[0].height))
 palette=sample.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
 q=[f.quantize(palette=palette,dither=Image.Dither.NONE) for f in frames];q[0].save(path,save_all=True,append_images=q[1:],duration=durations,loop=0,disposal=2,optimize=False)
 return {'file':path.name,'sha256':sha(path),'frames':len(frames),'durationMs':sum(durations)}
report={'method':'Actual runtime RGBA before/after; fixed crop, shared display scale, unchanged frame order and source FPS. GIF palette and 10ms delay quantization are presentation only. Loops repeat for review; source jump loop flag remains unchanged.','outputs':[]}
actions=json.loads((TEMP/'actions.json').read_text())
for action in ['run','jump']:
 anim=actions[action];ids=anim['frames'];fps=anim['fps'];dur=[round((i+1)*100/fps)*10-round(i*100/fps)*10 for i in range(len(ids))]
 frames=[]
 for fid in ids:
  board=Image.new('RGB',(6*352,552),BG);d=ImageDraw.Draw(board)
  for j,look in enumerate(['plum','day','wedding']):
   for k,edition in enumerate(['before','after']):
    im=flatten(rgba(TEMP/look/edition/f'{fid}.png')).resize((352,528),Image.Resampling.LANCZOS);x=(j*2+k)*352;board.paste(im,(x,24));d.text((x+8,6),look+' / '+edition+f' / {fid}',fill='#263e36')
  frames.append(board)
 for facing in ['right','left']:
  oriented=frames if facing=='right' else [ImageOps.mirror(f.crop((0,24,f.width,f.height))) for f in frames]
  if facing=='left':
   boards=[]
   # Mirror each character independently so before/after columns keep order.
   for original in frames:
    b=original.copy()
    for col in range(6):b.paste(ImageOps.mirror(original.crop((col*352,24,(col+1)*352,552))),(col*352,24))
    boards.append(b)
   oriented=boards
  report['outputs'].append(savegif(oriented,OUT/f'female-three-looks-{action}-before-after-{facing}.gif',dur))
board=Image.new('RGB',(960,6*320),BG);d=ImageDraw.Draw(board)
for i,(fid,crop) in enumerate(CROPS.items()):
 for j,edition in enumerate(['before','after']):
  piece=flatten(rgba(TEMP/'plum'/edition/f'{fid}.png').crop(crop));board.paste(piece.resize((480,285),Image.Resampling.NEAREST),(j*480,i*320+25));d.text((j*480+5,i*320+5),f'{fid}: {edition}',fill='#263e36')
board.save(OUT/'plum-neck-before-after-native-3x.png')
report['nativeCloseup']={'file':'plum-neck-before-after-native-3x.png','sha256':sha(OUT/'plum-neck-before-after-native-3x.png'),'nearestNeighborScale':3}
(OUT/'presentation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report['outputs'],indent=2))
