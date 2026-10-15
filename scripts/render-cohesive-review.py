"""Comparison panels and timed previews assembled only from exported PNGs."""
from pathlib import Path
import json
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
D=ROOT/'docs/art-cohesive'
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def frame(name,index=0,facing='right'):
    m=json.loads((D/name/'manifest.json').read_text());f=m['frames'][index]
    im=Image.open(D/name/'spritesheet.png').convert('RGBA').crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height']))
    return im.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if facing=='left' else im

def panel(items,columns,scale=1,crop=None,title='Actual exported frames'):
    w,h=(crop[2]-crop[0],crop[3]-crop[1]) if crop else (192,256)
    cw,ch=w*scale+24,h*scale+42
    result=Image.new('RGB',(cw*columns+24,ch*((len(items)+columns-1)//columns)+66),'#f6f2e9')
    draw=ImageDraw.Draw(result);font=ImageFont.truetype(FONT,15)
    draw.text((18,14),title,font=font,fill='#45493d')
    for i,(name,label) in enumerate(items):
        im=frame(name)
        if crop:im=im.crop(crop)
        im=im.resize((w*scale,h*scale),Image.Resampling.NEAREST)
        x=24+i%columns*cw;y=48+i//columns*ch
        draw.rectangle((x,y,x+w*scale-1,y+h*scale-1),fill='#e8ecdf')
        result.paste(im,(x,y),im);draw.text((x,y+h*scale+8),label,font=font,fill='#45493d')
    return result
pairs=[('before-dress','Bride / V4'),('dress-joyful','Bride / V5'),('before-suit','Groom / V4'),('suit-joyful','Groom / V5')]
for scale in (1,2):panel(pairs,4,scale,title=f'V4 -> V5 / actual exports / {scale}x nearest-neighbor').save(D/f'before-after-{scale}x.png')
panel(pairs,4,4,(64,54,144,135),'Face and neck / actual exports / 4x').save(D/'face-neck-4x.png')
panel([(f'{who}-{e}',f'{who} / {e}') for who in ('dress','suit') for e in ('neutral','gentle','joyful')],3,2,title='Three authored expressions / actual V5 exports / 2x').save(D/'expressions-2x.png')
panel([(f'{who}-outfit-{outfit}',f'{who} / {outfit}') for who in ('dress','suit') for outfit in ('tee','hoodie','jacket','suit','bodice')],5,title='Both heads across every upper garment / actual exports').save(D/'wardrobe-1x.png')
panel([(f'{who}-dark-skin',f'{who} / deep skin + blonde')for who in ('dress','suit')],2,2,title='Material masks / actual exports').save(D/'recolor-2x.png')
for animation in ('idle','walk'):
 for facing in (('right',) if animation=='idle' else ('right','left')):
    m=json.loads((D/'dress-joyful/manifest.json').read_text());seq=m['animations'][animation]
    images=[]
    for f in seq['frames']:
        out=Image.new('RGB',(816,584),'#f6f2e9');draw=ImageDraw.Draw(out)
        draw.text((24,14),f'Actual exported frames / {animation} / {facing} / 2x',font=ImageFont.truetype(FONT,17),fill='#45493d')
        draw.line((16,528,800,528),fill='#aab7a1')
        for i,who in enumerate(('dress','suit')):
            im=frame(f'{who}-joyful',f,facing).resize((384,512),Image.Resampling.NEAREST)
            out.paste(im,(24+i*384,48),im)
        images.append(out)
    images[0].save(D/f'{animation}-{facing}.gif',save_all=True,append_images=images[1:],duration=round(1000/seq['fps']),loop=0,disposal=2)
# All walking poses, without timing/quantization, for seam review.
walk=Image.new('RGB',(192*8,256*2),'#e8ecdf')
for row,who in enumerate(('dress','suit')):
 for col in range(8):
    im=frame(who+'-joyful',col+4);walk.paste(im,(col*192,row*256),im)
walk.save(D/'walk-frames.png')
print('Rendered comparisons, wardrobe/recolor checks and idle/left/right loops from exported packs.')
