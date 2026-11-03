"""Assemble labelled evidence from real project GIF-encoder outputs; never repaint poses."""
import argparse,bisect,hashlib,json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

def read(p):
 im=Image.open(p); frames=[];times=[0];delays=[]
 for i in range(im.n_frames):
  im.seek(i);frames.append(im.convert('RGB'));delays.append(im.info['duration']);times.append(times[-1]+delays[-1])
 return frames,times,delays

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--exports',type=Path,required=True);ap.add_argument('--out',type=Path,required=True);a=ap.parse_args();a.out.mkdir(parents=True,exist_ok=True)
 print('Available exports:',[p.name for p in a.exports.glob('*.gif')])
 # The review runner's agreed filenames.
 bpath=a.exports/'baseline-run-jump-run-right.gif';cpath=a.exports/'candidate-run-jump-run-right.gif'
 b,bt,bd=read(bpath);c,ct,cd=read(cpath)
 assert len(b)==68 and len(c)==70 and b[0].size==c[0].size==(256,384)
 start=bt[44];end=ct[60]
 samples=sorted(set([t for t in bt+ct if start<=t<end]+[end]))
 bg=(238,233,223);ink=(42,44,41);font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12);small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',11)
 output=[];delays=[];trace=[]
 for t,next_t in zip(samples,samples[1:]):
  im=Image.new('RGB',(528,430),bg);d=ImageDraw.Draw(im)
  d.text((8,4),f'Landing study / same clock {t/1000:.2f}s',font=font,fill=ink)
  bi=min(bisect.bisect_right(bt,t)-1,len(b)-1);ci=min(bisect.bisect_right(ct,t)-1,len(c)-1)
  for x,label,img in [(4,'V7 / original frames / 68 ticks',b[bi]),(268,'Generated study / +2 ticks',c[ci])]:
   d.text((x,23),label,font=small,fill=ink);im.paste(img,(x,43))
  output.append(im);delays.append(next_t-t);trace.append({'timeMs':t,'baselineIndex':bi,'candidateIndex':ci})
 pause=output[-1].copy();d=ImageDraw.Draw(pause);d.rectangle((0,0,528,20),fill=bg);d.text((8,4),'REVIEW PAUSE 0.70s / repeats for inspection',font=font,fill=ink)
 output.append(pause);delays.append(700)
 palette_src=Image.new('RGB',(528,430*len(output)))
 for i,f in enumerate(output):palette_src.paste(f,(0,430*i))
 palette=palette_src.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
 q=[f.quantize(palette=palette,dither=Image.Dither.NONE) for f in output]
 p=a.out/'male-landing-study-comparison.gif';q[0].save(p,save_all=True,append_images=q[1:],duration=delays,loop=0,disposal=1,optimize=False)
 strip=Image.new('RGB',(256*5,420),bg);d=ImageDraw.Draw(strip)
 for col,(i,label) in enumerate([(49,'Original89'),(50,'Generated107 / A'),(51,'Generated108 / B'),(52,'Original Run48'),(53,'Original Run49')]):
  x=col*256;d.text((x+5,5),label,font=font,fill=ink);d.text((x+5,22),f'24 fps / tick {i}',font=small,fill=ink);strip.paste(c[i],(x,38))
 strip.save(a.out/'male-bridge-pose-strip.png',optimize=True)
 evidence={'kind':'labelled diagnostic assembled from project-encoder outputs; not an application button download','clocks':'same elapsed GIF presentation time; not phase-aligned or sped up','baselineTicks':len(b),'candidateTicks':len(c),'baselineDurationMs':bt[-1],'candidateDurationMs':ct[-1],'nativeAddedDurationMs':2000/24,'reviewPauseMs':700,'inputs':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (bpath,cpath)},'samples':trace,'outputSha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 (a.out/'review-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
 print(json.dumps(evidence))
if __name__=='__main__':main()
