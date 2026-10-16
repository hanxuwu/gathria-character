from pathlib import Path
import json,sys
from PIL import Image,ImageDraw,ImageFont
D=Path(__file__).resolve().parents[1]/'docs/running-v2/iterations'/sys.argv[1]
FONT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',15)
def frame(who,i):
 m=json.loads((D/who/'manifest.json').read_text());f=m['frames'][i]
 with Image.open(D/who/'spritesheet.png') as src:return src.convert('RGBA').crop((f['x'],f['y'],f['x']+192,f['y']+256))
phases=['contact','load','push-off','flight','recover','reach']*2
out=Image.new('RGB',(192*6,286*4),'#e8ecdf');draw=ImageDraw.Draw(out)
for row,who in enumerate(('dress','suit')):
 for i in range(12):
  im=frame(who,12+i);x=i%6*192;y=(row*2+i//6)*286;out.paste(im,(x,y),im);draw.text((x+4,y+260),f'{who} {i:02d} {phases[i]}',font=FONT,fill='#45493d')
out.save(D/'run-keyframes.png')
images=[]
for i in range(12):
 im=Image.new('RGB',(800,568),'#e8ecdf');draw=ImageDraw.Draw(im);draw.text((16,10),f'Actual export / iteration {sys.argv[1]} / run in place / 2x',font=FONT,fill='#45493d');draw.line((10,520,790,520),fill='#aab7a1')
 for j,who in enumerate(('dress','suit')):
  char=frame(who,12+i).resize((384,512),Image.Resampling.NEAREST);im.paste(char,(16+384*j,40),char)
 images.append(im)
strip=Image.new('RGB',(800,568*12))
for i,im in enumerate(images):strip.paste(im,(0,568*i))
pal=strip.quantize(colors=256,dither=Image.Dither.NONE);images=[im.quantize(palette=pal,dither=Image.Dither.NONE) for im in images];times=[round((i+1)*1000/18/10)*10-round(i*1000/18/10)*10 for i in range(12)]
images[0].save(D/'run-right.gif',save_all=True,append_images=images[1:],duration=times,loop=0,disposal=1,optimize=False)
with Image.open(D/'run-right.gif') as check:
 assert check.n_frames==12
 for i in range(12):check.seek(i);check.load();assert check.info['duration']==times[i]
print(D)
