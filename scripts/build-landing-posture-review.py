"""Review only: decode actual app GIFs on their own encoded presentation clocks.
No interpolation, warp, new pose or retiming. Input art is uniformly displayed at 75%.
Run after actual V5 exports exist; files are never fetched or substituted.
"""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from bisect import bisect_right
import argparse,json,hashlib,shutil
p=argparse.ArgumentParser();p.add_argument('--before',type=Path,default=Path('/tmp/takeoff-bridge/exports'));p.add_argument('--after',type=Path,default=Path('/tmp/landing-posture/exports'));p.add_argument('--out',type=Path,default=Path('/tmp/landing-posture/review'));a=p.parse_args()
required=[root/c/f'side-run-jump-run-{f}.gif' for root in [a.before,a.after] for c in ['male','female'] for f in ['right','left']]
missing=[str(x) for x in required if not x.is_file()]
if missing:raise SystemExit('Awaiting actual exports:\n'+'\n'.join(missing))
a.out.mkdir(parents=True,exist_ok=True)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12);small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',10);bg=(238,233,223);ink=(42,44,41)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def decode(path):
 im=Image.open(path);frames=[];times=[0]
 for i in range(im.n_frames):
  im.seek(i);frames.append(im.convert('RGB'));duration=im.info.get('duration',0)
  assert duration>0,(path,i,duration)
  times.append(times[-1]+duration)
 assert all(f.size==(256,384) for f in frames),(path,frames[0].size)
 return {'path':path,'frames':frames,'times':times,'total':times[-1],'sha256':sha(path)}
def sample(d,t):
 i=min(len(d['frames'])-1,bisect_right(d['times'],t)-1);return i,d['frames'][i],t>=d['total']
def gif_save(frames,durations,path):
 # One review palette over both sides and whole timeline avoids palette pumping.
 contact=Image.new('RGB',(frames[0].width,frames[0].height*len(frames)))
 for i,f in enumerate(frames):contact.paste(f,(0,i*f.height))
 palette=contact.quantize(colors=128,method=Image.Quantize.MEDIANCUT)
 q=[f.quantize(palette=palette,dither=Image.Dither.NONE) for f in frames]
 q[0].save(path,save_all=True,append_images=q[1:],duration=durations,loop=0,disposal=1,optimize=True)
 return {'file':path.name,'bytes':path.stat().st_size,'sha256':sha(path)}
evidence={'method':'Decoded actual app GIFs; shared millisecond timeline; full canvas uniformly scaled 75%; common 128-color review palette; landing excerpt only, with original encoded time shown; no blended/warped/retimed poses. Explicit 700ms replay pause. Raw downloads copied byte-for-byte.','comparisonFacing':'right','closeupCrop':[28,210,252,366],'results':[]}
for c in ['male','female']:
 before=decode(a.before/c/'side-run-jump-run-right.gif');after=decode(a.after/c/'side-run-jump-run-right.gif');total=max(before['total'],after['total']);window_first=43 if c=='male' else 40;window_last=58 if c=='male' else 55;begin=before['times'][window_first];end=min(total,before['times'][window_last]);ticks=sorted({t for d in [before,after] for t in d['times'] if begin<=t<end}|{begin,end});frames=[];dur=[];samples=[]
 for t,next_t in zip(ticks,ticks[1:]):
  canvas=Image.new('RGB',(416,334),bg);draw=ImageDraw.Draw(canvas);draw.text((8,5),f'{c.title()} / landing excerpt / {t/1000:.2f}s',font=font,fill=ink)
  row={'timeMs':t,'durationMs':next_t-t}
  for j,(name,d) in enumerate([('Before V4',before),('After V5',after)]):
   i,img,held=sample(d,t);x=8+j*204;draw.text((x,24),f'{name}'+(' / END HOLD' if held else f' / frame {i}'),font=small,fill=ink);canvas.paste(img.resize((192,288),Image.Resampling.LANCZOS),(x,40));row[name]={'frameIndex':i,'endHold':held}
  frames.append(canvas);dur.append(next_t-t);samples.append(row)
 pause=frames[-1].copy();d=ImageDraw.Draw(pause);d.rectangle((0,0,416,39),fill=bg);d.text((8,5),f'{c.title()} / REVIEW PAUSE 0.70s / replay',font=font,fill=ink);d.text((8,24),'Before V4',font=small,fill=ink);d.text((212,24),'After V5',font=small,fill=ink);frames.append(pause);dur.append(700)
 cmp=gif_save(frames,dur,a.out/f'{c}-landing-before-after.gif')
 # Seven identical presentation timestamps straddle source recovery and both bridges.
 start=46 if c=='male' else 43;sample_times=before['times'][start:start+7];cw=232;rh=192;sheet=Image.new('RGB',(cw*7,rh*2+26),bg);draw=ImageDraw.Draw(sheet);draw.text((5,5),f'{c.title()} / SAME PRESENTATION TIMES / fixed crop / native export pixels',font=font,fill=ink);strip=[]
 for row,(name,data) in enumerate([('Before V4',before),('After V5',after)]):
  for col,t in enumerate(sample_times):
   i,img,held=sample(data,t);x=col*cw;y=26+row*rh;draw.text((x+4,y+2),f'{name} / {t/1000:.2f}s / f{i}',font=small,fill=ink);sheet.paste(img.crop((28,210,252,366)),(x+4,y+23));strip.append({'label':name,'timeMs':t,'frameIndex':i,'endHold':held})
 strip_path=a.out/f'{c}-landing-same-time.png';sheet.save(strip_path,optimize=True)
 raws=[]
 for facing in ['right','left']:
  src=a.after/c/f'side-run-jump-run-{facing}.gif';dst=a.out/f'{c}-run-jump-run-{facing}.gif';shutil.copyfile(src,dst);assert sha(src)==sha(dst);raws.append({'facing':facing,'source':str(src),'file':dst.name,'bytes':dst.stat().st_size,'sha256':sha(dst),'provenance':'Unmodified actual application download'})
 evidence['results'].append({'character':c,'before':{'path':str(before['path']),'sha256':before['sha256'],'frames':len(before['frames']),'durationMs':before['total']},'after':{'path':str(after['path']),'sha256':after['sha256'],'frames':len(after['frames']),'durationMs':after['total']},'comparison':{**cmp,'excerptStartMs':begin,'excerptEndMs':end},'rawDownloads':raws,'timeline':samples,'closeup':{'file':strip_path.name,'bytes':strip_path.stat().st_size,'sha256':sha(strip_path),'samples':strip}})
(a.out/'review-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
print(json.dumps({'output':str(a.out),'files':[{'file':x.name,'bytes':x.stat().st_size} for x in a.out.iterdir() if x.is_file()],'totalBytes':sum(x.stat().st_size for x in a.out.iterdir() if x.is_file())},indent=2))
