"""Render actual exported V6 baseline at native size and integer zoom."""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageDraw,ImageFont
D=Path(__file__).resolve().parents[1]/'docs/running-baseline'
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BG='#f6f2e9';STAGE='#e8ecdf'
def frame(who,index,facing='right'):
    m=json.loads((D/who/'manifest.json').read_text());f=m['frames'][index]
    with Image.open(D/who/'spritesheet.png') as src: im=src.convert('RGBA').crop((f['x'],f['y'],f['x']+192,f['y']+256))
    return im.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if facing=='left' else im
for scale in (1,2):
    out=Image.new('RGB',(4*192*scale+80,256*scale+80),BG);draw=ImageDraw.Draw(out)
    draw.text((16,10),f'Frozen V6 actual exports / native {scale}x / idle and walk',font=ImageFont.truetype(FONT,16),fill='#45493d')
    for i,(who,index) in enumerate((('dress',0),('dress',7),('suit',0),('suit',7))):
        im=frame(who,index).resize((192*scale,256*scale),Image.Resampling.NEAREST);x=16+i*(192*scale+16)
        draw.rectangle((x,40,x+192*scale-1,40+256*scale-1),fill=STAGE);out.paste(im,(x,40),im)
        draw.text((x,44+256*scale),f'{who} / '+('idle' if index==0 else 'walk'),font=ImageFont.truetype(FONT,14),fill='#45493d')
    out.save(D/f'baseline-{scale}x.png')
records=[]
for animation in ('idle','walk'):
 for facing in ('left','right'):
    seq=json.loads((D/'dress/manifest.json').read_text())['animations'][animation];images=[]
    for fi in seq['frames']:
        out=Image.new('RGB',(800,568),BG);draw=ImageDraw.Draw(out)
        draw.text((16,10),f'V6 frozen baseline / {animation} {facing} / in place / 2x',font=ImageFont.truetype(FONT,16),fill='#45493d')
        draw.line((10,520,790,520),fill='#aab7a1')
        for col,who in enumerate(('dress','suit')):
            im=frame(who,fi,facing).resize((384,512),Image.Resampling.NEAREST);out.paste(im,(16+col*384,40),im)
        images.append(out)
    strip=Image.new('RGB',(800,568*len(images)))
    for i,im in enumerate(images):strip.paste(im,(0,568*i))
    pal=strip.quantize(colors=256,dither=Image.Dither.NONE);frames=[im.quantize(palette=pal,dither=Image.Dither.NONE) for im in images]
    path=D/f'{animation}-{facing}.gif';frames[0].save(path,save_all=True,append_images=frames[1:],duration=round(1000/seq['fps']),loop=0,disposal=1,optimize=False)
    durations=[]
    with Image.open(path) as im:
        for i in range(im.n_frames):im.seek(i);im.load();durations.append(im.info['duration'])
        assert im.info['loop']==0
        assert sum(durations)==len(seq['frames'])*1000/seq['fps']
    records.append(dict(file=path.name,frames=len(durations),durationsMs=durations,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
(D/'preview-validation.json').write_text(json.dumps(records,indent=2)+'\n')
print('Decoded baseline native/2x panels and four timed idle/walk GIFs.')
