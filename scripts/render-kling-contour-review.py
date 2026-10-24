#!/usr/bin/env python3
"""Viewing media only: paired actual application CharacterPack exports."""
import os,importlib.util,json,hashlib,math,re,argparse
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
from kling_wardrobe_common import ROOT
spec=importlib.util.spec_from_file_location('exports',ROOT/'scripts/verify-kling-contour-exports.py');exports=importlib.util.module_from_spec(spec);spec.loader.exec_module(exports)
parser=argparse.ArgumentParser();parser.add_argument('--png-only',action='store_true');args=parser.parse_args()
BASE=ROOT/os.environ.get('KLING_REVIEW_DIR','docs/kling-contour-review');OUT=BASE/'review';OUT.mkdir(exist_ok=True,parents=True)
FONT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',20);SMALL=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14);BG='#eee9df';INK='#304036';records=[]
def record(path,**meta):
 with Image.open(path) as im:
  size=list(im.size);durations=[]
  for i in range(getattr(im,'n_frames',1)):im.seek(i);im.load();durations.append(im.info.get('duration',0))
 if 'expectedDurationMs' in meta: assert sum(durations)==meta['expectedDurationMs'],path
 records.append({'file':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'size':size,'decodedFrames':len(durations),'durationMs':sum(durations),**meta})
def save(im,name,**meta):
 path=OUT/name;im.save(path);record(path,**meta)
def tile(im,scale=1,background=BG):
 out=Image.new('RGB',im.size,background);out.paste(im,mask=im.getchannel('A'))
 return out if scale==1 else out.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.NEAREST if scale>=1 else Image.Resampling.LANCZOS)
def pair(a,b,label,scale=1,background=BG):
 a,b=tile(a,scale,background),tile(b,scale,background)
 out=Image.new('RGB',(a.width*2,a.height+40),background);out.paste(a,(0,40));out.paste(b,(a.width,40));d=ImageDraw.Draw(out)
 font=FONT if a.width>=240 and scale>=1 else SMALL
 left=label+' / before';right='after';ink=INK if background==BG else '#eeeadf'
 if d.textbbox((0,0),left,font=font)[2]>a.width-16:
  match=re.search(r'source (\d+)',label);left=(match[1]+' before') if match else 'Before';right='After'
 d.text((8,10),left,font=font,fill=ink);d.text((a.width+8,10),right,font=font,fill=ink)
 return out

capture=BASE/'evidence/evidence-index.json';capture=capture if capture.exists() else BASE/'evidence/capture-progress.json'
rows=json.loads(capture.read_text())['outfits'];assert len(rows)==4
for row in rows:
 key=f'{row["character"]}-{row["look"]}';before=exports.Pack(ROOT/row['beforePack']);after=exports.Pack(ROOT/row['pack']['file']);fid=56 if row['character']=='male' else 86
 save(pair(before.frame(fid),after.frame(fid),f'{key} source {fid} / 1x'),key+'-native-1x.png',sourceFrame=fid,nativeScale=1)
 # Same native crop and integer enlargement; no retouching or adaptive scaling.
 box=(250,660,560,910) if row['character']=='male' else (460,810,550,945)
 save(pair(before.frame(fid).crop(box),after.frame(fid).crop(box),f'{key} cloth connection / 2x',2),key+'-connection-2x.png',sourceFrame=fid,nativeCrop=list(box),nativeScale=2)
 darkbox=(400,765,510,860) if row['character']=='male' else (465,825,555,925)
 save(pair(before.frame(fid).crop(darkbox),after.frame(fid).crop(darkbox),f'{key} edge / dark 4x',4,background='#202631'),key+'-edge-dark-4x.png',sourceFrame=fid,nativeCrop=list(darkbox),nativeScale=4,background='dark')
 ids=[51,54,55,56,57,58,62,66] if row['character']=='male' else [83,84,85,86,87,88,89,90,102,104,106,109]
 tiles=[pair(before.frame(i),after.frame(i),f'source {i} / 1x') for i in ids];w,h=tiles[0].size;board=Image.new('RGB',(w*2,h*math.ceil(len(tiles)/2)),BG)
 for i,t in enumerate(tiles):board.paste(t,(i%2*w,i//2*h))
 save(board,key+'-keyframes-1x.png',sourceFrames=ids,nativeScale=1)
 # Compact full ordered sequence and integer-size waist crops for continuity.
 crops=[]
 for i in ids:crops.append(pair(before.frame(i).crop(box),after.frame(i).crop(box),f'source {i} / 1x'))
 w,h=crops[0].size;contact=Image.new('RGB',(w*2,h*math.ceil(len(crops)/2)),BG)
 for i,t in enumerate(crops):contact.paste(t,(i%2*w,i//2*h))
 save(contact,key+'-connections-sequence-1x.png',sourceFrames=ids,nativeCrop=list(box),nativeScale=1)
 for action in ['run','jump']:
  clip=after.m['animations'][action];times=[(math.floor((i+1)*100/clip['fps']+.5)-math.floor(i*100/clip['fps']+.5))*10 for i in range(len(clip['frames']))]
  for facing in ['right','left']:
   path=OUT/f'{key}-{action}-{facing}-comparison.gif'
   if args.png_only:
    assert path.exists();record(path,sourceFrameOrder=clip['frames'],expectedDurationMs=sum(times),loop=clip['loop'],viewingScale=.5);continue
   frames=[]
   for i in clip['frames']:
    a,b=before.frame(i),after.frame(i)
    if facing=='left':a,b=ImageOps.mirror(a),ImageOps.mirror(b)
    frames.append(pair(a,b,f'{key} / {action} {facing} / 0.5x',.5))
   # Shared palette across the whole comparison; timing is encoded cumulatively.
   sample=Image.new('RGB',(frames[0].width,frames[0].height*len(frames)),BG)
   for i,f in enumerate(frames):sample.paste(f,(0,f.height*i))
   palette=sample.resize((384,max(64,len(frames)*120))).quantize(colors=256);encoded=[f.quantize(palette=palette,dither=Image.Dither.NONE) for f in frames]
   path=OUT/f'{key}-{action}-{facing}-comparison.gif';opts={'loop':0} if clip['loop'] else {};encoded[0].save(path,save_all=True,append_images=encoded[1:],duration=times,optimize=False,disposal=1,**opts)
   record(path,sourceFrameOrder=clip['frames'],expectedDurationMs=sum(times),loop=clip['loop'],viewingScale=.5)
 before.close();after.close()
(BASE/'review-index.json').write_text(json.dumps({'inputs':[{'before':r['beforePack'],'after':r['pack']['file']} for r in rows],'media':records,'artworkEdited':False,'passed':True},indent=2)+'\n');print(f'Decoded {len(records)} paired review media files from actual exports.')
