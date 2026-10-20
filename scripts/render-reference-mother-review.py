"""Review panels from retained reference / complete master / actual rig PNGs.
No reference illustration substitutes for any rendered-pose evidence.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import numpy as np, json, hashlib, zipfile, io
from scipy.ndimage import label
ROOT=Path(__file__).resolve().parents[1];P=ROOT/'artwork/reference-mother/prepared';S=P.parent/'source';O=ROOT/'docs/reference-mother/review';O.mkdir(parents=True,exist_ok=True)
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def font(n=14):return ImageFont.truetype(FONT,n)
def checker(size,cell=12):
 im=Image.new('RGBA',size,'#f5f1e9');d=ImageDraw.Draw(im)
 for y in range(0,size[1],cell):
  for x in range(0,size[0],cell):
   if (x//cell+y//cell)%2:d.rectangle((x,y,x+cell-1,y+cell-1),fill='#e7e4dd')
 return im
names=['standing','walk-contact','run-flight','celebrate'];labels=['Standing','Walk contact','Run flight','Celebrate']
frames=[Image.open(P/'poses'/f'{n}.png').convert('RGBA') for n in names]
for zoom in [1,2]:
 panel=checker((192*4*zoom,256*zoom+48),12*zoom);d=ImageDraw.Draw(panel)
 d.rectangle((0,0,panel.width,31),fill='#f5f1e9')
 for i,(im,text) in enumerate(zip(frames,labels)):
  panel.alpha_composite(im.resize((192*zoom,256*zoom),Image.Resampling.NEAREST),(i*192*zoom,32));d.text((i*192*zoom+8,8),text,font=font(13 if zoom==1 else 16),fill='#343b42')
 panel.save(O/f'four-poses-{zoom}x.png')
# Matched native placement: same source-to-frame transform, no independent head fit.
ref=Image.open(S/'standing-14.50.png').convert('RGBA').crop((738,158,1138,975))
r=ref.resize((106,216),Image.Resampling.LANCZOS)
reference=Image.new('RGBA',(192,256));reference.alpha_composite(r,(43,24))
imgs=[reference,Image.open(P/'master-native.png').convert('RGBA'),frames[0]]
texts=['Video reference 14.50 s','Complete new master','Actual rig reconstruction']
for zoom in [1,2]:
 panel=checker((192*3*zoom,256*zoom+62),12*zoom);d=ImageDraw.Draw(panel);d.rectangle((0,0,panel.width,35),fill='#f5f1e9')
 for i,(im,text) in enumerate(zip(imgs,texts)):
  panel.alpha_composite(im.resize((192*zoom,256*zoom),Image.Resampling.NEAREST),(i*192*zoom,36));d.text((i*192*zoom+6,8),text,font=font(12 if zoom==1 else 17),fill='#343b42')
 panel.save(O/f'reference-master-rig-{zoom}x.png')
# HD comparison: no downsampled runtime claimed as HD runtime output.
hd=checker((1024,810),16);d=ImageDraw.Draw(hd);d.rectangle((0,0,1024,41),fill='#f5f1e9')
for i,n in enumerate(['master-hd','reassembled-hd']):
 im=Image.open(P/(n+'.png')).convert('RGBA').resize((512,768),Image.Resampling.LANCZOS);hd.alpha_composite(im,(i*512,42));d.text((i*512+12,12),['Complete master / HD source','HD layer reconstruction / same registration'][i],font=font(16),fill='#343b42')
hd.save(O/'master-reassembly-hd.png')
# Local inspection includes pose changes, never interpolated fake frames.
crops=[('neck-shoulder',(60,100,136,151)),('elbow-hip',(45,138,148,196)),('knee-ankle',(55,180,138,243))]
for labelname,box in crops:
 w,h=box[2]-box[0],box[3]-box[1];panel=checker((w*4*4,h*4+32),16);d=ImageDraw.Draw(panel);d.rectangle((0,0,panel.width,31),fill='#f5f1e9')
 for i,(im,text) in enumerate(zip(frames,labels)):
  panel.alpha_composite(im.crop(box).resize((w*4,h*4),Image.Resampling.NEAREST),(i*w*4,32));d.text((i*w*4+8,8),text,font=font(14),fill='#343b42')
 panel.save(O/(labelname+'-4x.png'))
# HD cutout inventory rendered from delivered files, common scale retained.
reg=json.loads((P/'layer-registration.json').read_text());panel=checker((1500,900),16);d=ImageDraw.Draw(panel)
for i,part in enumerate(reg['parts']):
 im=Image.open(P/part['file']).convert('RGBA');box=im.getbbox();im=im.crop(box);im.thumbnail((268,245),Image.Resampling.LANCZOS)
 x=(i%5)*300;y=(i//5)*300;panel.alpha_composite(im,(x+(300-im.width)//2,y+36+(245-im.height)//2));d.text((x+12,y+10),part['id'],font=font(16),fill='#343b42')
panel.save(O/'parts-hd-inventory.png')
# Decode every delivery PNG and every PNG within source parts/project/pack zips.
checks=[]
for path in sorted(P.rglob('*.png')):
 im=Image.open(path);im.load();assert im.mode=='RGBA' and im.getbbox(),path
 a=np.array(im);assert np.any(a[:,:,3]==0),path
 checks.append({'path':str(path.relative_to(ROOT)),'width':im.width,'height':im.height,'mode':im.mode,'bounds':im.getbbox(),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
archives=[]
for path in sorted(P.glob('*.zip')):
 with zipfile.ZipFile(path) as z:
  assert z.testzip() is None
  for name in z.namelist():
   if name.endswith('.png'):
    im=Image.open(io.BytesIO(z.read(name)));im.load();assert im.getbbox(),name
  archives.append({'path':str(path.relative_to(ROOT)),'files':z.namelist(),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
a=np.array(Image.open(P/'master-hd.png'));b=np.array(Image.open(P/'reassembled-hd.png'));shared=(a[:,:,3]>=128)&(b[:,:,3]>=128)
exact=np.all(a[:,:,:3]==b[:,:,:3],axis=2)&shared
pose_checks=[]
for n,im in zip(names,frames):
 a2=np.array(im);opaque=a2[:,:,3]>0;components,count=label(opaque);sizes=np.bincount(components.ravel())[1:]
 pose_checks.append({'id':n,'bounds':im.getbbox(),'rgbaAlphaValues':np.unique(a2[:,:,3]).tolist(),'components':int(count),'componentSizesDescending':sorted(sizes.tolist(),reverse=True)})
report={'scope':'Four static review poses. No completed animation cycles or final user visual acceptance claimed.',
 'pngs':checks,'archives':archives,'poses':pose_checks,
 'hdReassembly':{'sharedOpaquePixels':int(shared.sum()),'exactRgbSharedPixels':int(exact.sum()),'exactRgbFraction':float(exact.sum()/shared.sum())},
 'visualReview':['Identity and proportions retained across poses; native1x and2x plus HD checked.',
 'No detached limb, shoe or floating clothing fragment observed in these four selected poses.',
 'Mild hip flares and soft knee/elbow folds remain under large rotations; no pose-specific corrective textures yet.',
 'Celebration retains neutral expression. Hands compile into forearms; face and clothing layers are not independently editable yet.']}
(O/'integrity.json').write_text(json.dumps(report,indent=2)+'\n')
print('Review panels complete;',len(checks),'PNG files decoded;',len(archives),'ZIPs validated')
