#!/usr/bin/env python3
"""Presentation-only GIF/PNG layouts from actual exported runtime PNGs."""
from pathlib import Path
import json,math
from PIL import Image,ImageDraw,ImageOps
R=Path(__file__).resolve().parents[1];T=Path('/tmp/coverage-audit/side');O=R/'docs/wardrobe-coverage/side/review'
presentation=[]
for sex in ['male','female']:
 folder=T/'actual'/sex;actions=json.loads((folder/'actions.json').read_text());allids=sorted(int(p.stem) for p in (folder/'before').glob('*.png'))
 loaded={ed:{fid:Image.open(folder/ed/f'{fid:03}.png').convert('RGBA') for fid in allids} for ed in ['before','after']}
 boxes=[im.getbbox() for frames in loaded.values() for im in frames.values()];box=(max(0,min(b[0] for b in boxes)-12),max(0,min(b[1] for b in boxes)-12),max(b[2] for b in boxes)+12,max(b[3] for b in boxes)+12)
 w,h=box[2]-box[0],box[3]-box[1]
 def panel(fid,facing):
  canvas=Image.new('RGB',(2*w,h+28),'#eee8dd');d=ImageDraw.Draw(canvas)
  for i,ed in enumerate(['before','after']):
   im=loaded[ed][fid].crop(box)
   if facing=='left':im=ImageOps.mirror(im)
   canvas.paste(im,(i*w,28),im);d.text((i*w+8,8),f'{sex} {ed} / {fid}',fill='#34302d')
  return canvas
 # Fixed shared palette removes palette changes as a source of flicker in comparisons.
 palids=[allids[round(i*(len(allids)-1)/9)] for i in range(10)];pal=Image.new('RGB',(2*w,(h+28)*10),'#eee8dd')
 for i,fid in enumerate(palids):pal.paste(panel(fid,'right'),(0,i*(h+28)))
 palette=pal.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
 for action in ['walk','run','jump']:
  a=actions[action];ids=a['frames'];dur=[round((i+1)*100/a['fps'])*10-round(i*100/a['fps'])*10 for i in range(len(ids))]
  for facing in ['right','left']:
   frames=[panel(fid,facing).quantize(palette=palette,dither=Image.Dither.NONE) for fid in ids];name=f'{sex}-{action}-before-after-{facing}.gif'
   frames[0].save(O/name,save_all=True,append_images=frames[1:],duration=dur,disposal=2,optimize=False,**({'loop':0} if a['loop'] else {}))
   with Image.open(O/name) as check:assert check.n_frames==len(ids)
   presentation.append({'file':name,'frames':ids,'fps':a['fps'],'loop':a['loop'],'durationMs':sum(dur),'fixedDisplayCrop':box,'notes':'Actual WardrobeCompositor RGBA. Fixed display crop across all poses; original native size and pixels retained. Left reflects full character. GIF uses shared256colorpalette and nearest10ms timing; one-shot jump is not looped.'})
 ids=[49,57,59,71,72,82] if sex=='male' else [18,23,66,78,80,93]
 # Native same-pose closeups with both garments and retained appearance.
 board=Image.new('RGB',(600,len(ids)*284),'#eee8dd');d=ImageDraw.Draw(board)
 for row,fid in enumerate(ids):
  before=loaded['before'][fid];after=loaded['after'][fid]
  # Body crop selected from source registration neck->hips, retaining the hand seam.
  reg=json.loads((R/f'artwork/kling-side-expansion/templates/{sex}.registration.json').read_text());rr=next(r for r in reg['frames'] if r['frameId']==fid);p=rr['points'];cx=int((p['waistLeft']['x']+p['waistRight']['x'])/2);cy=int((p['neck']['y']+p['nearHip']['y'])/2)
  # Appearance padding is recorded in bank and must offset source-space crop.
  import zipfile
  with zipfile.ZipFile(R/f'docs/kling-side-expansion/assets/{sex}.appearance.zip') as z:pad=json.loads(z.read('manifest.json'))['padding']
  bounds=(cx-150+pad['left'],cy-120+pad['top'],cx+150+pad['left'],cy+140+pad['top'])
  for col,(label,im) in enumerate([('Before',before),('After',after)]):cr=im.crop(bounds);board.paste(cr,(col*300,row*284+24),cr);d.text((col*300+4,row*284+5),f'{sex} {fid} {label}',fill='#34302d')
 board.save(O/f'{sex}-seams-native.png')
(O/'presentation.json').write_text(json.dumps(presentation,indent=2)+'\n')
