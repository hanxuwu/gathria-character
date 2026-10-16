"""V7 technical registration, palette reduction and anatomical extraction.

Input illustrations are committed imagegen production sources; this script does
not paint faces or clothing. V1–V6 banks remain read-only. Source landmarks are
explicit so neck/collar and waist/sole registration can be reviewed independently.
"""
from pathlib import Path
import base64,json,zlib
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'artwork/harmonized-source'
PREVIEW=Path('/tmp/gathria-v7');PREVIEW.mkdir(exist_ok=True)
W,H=192,256
STATES=['neutral','gentle','joyful']
SPECS={
 'waves':dict(file='bride-expressions.png',cx=394,sx=.27,xmax=650,
  ysource=[12,325,351,500,816],ytarget=[6,101,116,165,239],offsets=[(0,0),(600,0),(1215,0)],
  skin='#F8BD8F',hair='#815541',upper='#E6D3BD',lower='#E6D3BD',shoe='#E6D3BD'),
 'crop':dict(file='groom-expressions.png',cx=413,sx=.26,xmax=650,
  ysource=[9,361,393,556,814],ytarget=[6,101,118,165,239],offsets=[(0,0),(598,0),(1211,0)],
  skin='#F8BD8F',hair='#815541',upper='#354963',lower='#354963',shoe='#98613C'),
}
def polygon(points):
 im=Image.new('L',(W,H));ImageDraw.Draw(im).polygon(points,fill=255);return np.array(im)>0

def rect(x0,y0,x1,y1):return polygon([(x0,y0),(x1,y0),(x1,y1),(x0,y1)])

def normalize(style,state=0,backplate=False):
 s=SPECS[style];im=Image.open(SOURCE/('dress-backplate.png' if backplate else s['file'])).convert('RGBA');a=np.array(im)
 dx,dy=s['offsets'][state];xs=np.rint(s['cx']+(np.arange(W)-96)/s['sx']).astype(int)
 ys=np.rint(np.interp(np.arange(H),s['ytarget'],s['ysource'])).astype(int)
 out=a[np.clip(ys+dy,0,a.shape[0]-1)[:,None],np.clip(xs+dx,0,a.shape[1]-1)[None,:]].copy()
 valid=(xs>=0)&(xs<s['xmax']);out[:,~valid]=0;out[:6]=0;out[240:]=0
 out[out[:,:,3]<128]=0;out[:,:,3]=np.where(out[:,:,3]>=128,255,0)
 # A single 64-color source palette per character, shared by all expressions,
 # removes micro-noise consistently across skin, hair and fabric without blur.
 if not backplate:
  pass
 return out

LAYERS=[]
def pack(id,rgba,material,mask,palette):
 a=rgba.copy();a[~mask]=0;material=material.copy();material[a[:,:,3]==0]=0
 ys,xs=np.nonzero(a[:,:,3]);assert len(xs),id
 x0,x1,y0,y1=xs.min(),xs.max()+1,ys.min(),ys.max()+1
 raw=np.concatenate([a,material[:,:,None]],axis=2)[y0:y1,x0:x1]
 LAYERS.append(dict(id=id,x=int(x0),y=int(y0),width=int(x1-x0),height=int(y1-y0),data=base64.b64encode(zlib.compress(raw.tobytes(),9)).decode(),palette=palette))
 return id

def main():
 bank={'layers':LAYERS,'portraits':{},'upper':{},'dress':{},'formalTrousers':{}}
 for style in SPECS:
  images=[normalize(style,i) for i in range(3)]
  # Use all three states when deriving palette, preventing expression-specific
  # palette shifts at ear, cheek, chin and neck boundaries.
  strip=np.concatenate(images,axis=1)
  pal=Image.fromarray(strip[:,:,:3]).quantize(colors=64,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
  for i,a in enumerate(images):
   a[:,:,:3]=np.array(Image.fromarray(a[:,:,:3]).quantize(palette=pal,dither=Image.Dither.NONE).convert('RGB'))
   a[a[:,:,3]==0]=0
   Image.fromarray(a).save(PREVIEW/f'{style}-{STATES[i]}.png')
  a=images[0];yy,xx=np.indices((H,W));spec=SPECS[style]
  palette={k:spec[k] for k in ('skin','hair','upper','lower','shoe')}
  def materials(a):
   rgb=a[:,:,:3].astype(int);r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
   warm=(r>g+22)&(g>b+9)
   ids=np.where(yy<119,2,np.where(yy<166,3,np.where(yy<222,4,5))).astype('uint8')
   face=polygon([(74,73),(97,56),(117,39),(136,53),(139,90),(126,105),(102,107),(80,99)])
   ear=polygon([(56,78),(65,75),(76,80),(81,91),(74,98),(58,96)])
   skin=((face|ear)&(r>145)&warm)|((yy>=100)&(yy<=128)&(xx>=82)&(xx<=110)&warm)
   eye=((yy>=65)&(yy<=90)&(xx>=83)&(xx<=139))
   mouth=(yy>=88)&(yy<=107)&(xx>=97)&(xx<=125)
   fixed=(eye&((r<155)|~warm))|(mouth&(r>g+50)&(g<145))
   # Keep eye ink/white/mouth independent of material recoloring.
   ids[skin]=1;ids[(face&fixed)]=0;ids[ear&(a[:,:,3]>0)]=1
   if style=='waves':
    ids[(yy>=120)&(yy<184)&((xx<83)|(xx>113))&warm]=1
    ids[(yy>=156)&(yy<=166)&(xx>=82)&(xx<=114)&(r<140)]=0
   else:
    ids[(yy>=166)&(yy<=186)&((xx<69)|(xx>123))]=1
    # All shirt, vest, tie, flower and buttons are fixed inserts.
    ids[(yy>=109)&(yy<=170)&(((xx>=83)&(xx<=112)&((r>g+10)|(r>180)))|((xx>=110)&(yy<=143)&(r>g+14))|((g>r)&(xx>108)&(yy<144)))]=0
   ids[a[:,:,3]==0]=0
   return ids
  states={}
  for state,im in zip(STATES,images):
   ids=materials(im);rgb=im[:,:,:3].astype(int)
   neck=rect(82,100,110,121)&(rgb[:,:,0]>rgb[:,:,1]+22)&(rgb[:,:,1]>rgb[:,:,2]+9)
   head=rect(0,0,191,110 if style=='waves' else 104)|neck
   ids[neck]=1
   states[state]=pack(f'v7:{style}:{state}',im,ids,head,palette)
  portrait=dict(head=states['gentle'],states=states,faceCenter=[109,83],jawStart=94,eyes=[[85,68,22,22],[120,67,18,22]])
  ids=materials(a)
  if style=='waves':
   back=polygon([(0,107),(78,107),(83,115),(75,122),(67,142),(60,163),(0,170)])|polygon([(113,108),(191,108),(191,170),(134,169),(123,143),(119,125),(110,118)])
   back &= (ids!=1)
   portrait['backHair']=pack('v7:waves:back',a,np.full((H,W),2,dtype='uint8'),back,palette)
  bank['portraits'][style]=portrait
  if style=='waves':
   cuts={
    'torso':[(83,116),(109,116),(119,122),(122,136),(114,140),(114,166),(80,166),(80,141),(76,133),(73,125)],
    'nearUpperArm':[(70,120),(79,122),(83,137),(78,146),(72,158),(63,160),(64,144),(65,134)],
    'nearForearm':[(64,150),(75,151),(71,163),(66,173),(61,181),(52,183),(47,177),(49,172),(59,163)],
    'farUpperArm':[(117,123),(123,125),(126,138),(129,150),(136,162),(125,164),(119,149),(115,137)],
    'farForearm':[(126,154),(135,156),(139,166),(144,173),(145,180),(140,183),(133,180),(127,171),(124,164)]}
   body=dict(shoulderNear=[73,131],elbowNear=[69,153],wristNear=[56,175],shoulderFar=[121,133],elbowFar=[129,157],wristFar=[139,176])
  else:
   cuts={
    'torso':[(77,113),(86,108),(102,116),(111,118),(121,124),(124,138),(120,156),(122,178),(110,180),(97,171),(79,181),(65,177),(70,157),(77,137)],
    'nearUpperArm':[(63,124),(76,116),(81,132),(76,145),(71,161),(49,165),(44,160),(51,143)],
    'nearForearm':[(48,156),(70,158),(68,171),(65,179),(60,186),(50,185),(43,181),(44,172)],
    'farUpperArm':[(125,137),(130,140),(136,152),(141,165),(123,167),(119,151),(119,142)],
    'farForearm':[(124,159),(141,160),(144,172),(145,181),(140,186),(132,185),(124,180),(123,169)]}
   body=dict(shoulderNear=[70,127],elbowNear=[60,155],wristNear=[54,176],shoulderFar=[127,143],elbowFar=[132,159],wristFar=[136,178])
  for part,points in cuts.items():
   region=polygon(points);partids=ids.copy()
   if style=='waves' and part.endswith('Forearm'):
    rgb=a[:,:,:3].astype(int);region&=(rgb[:,:,0]>rgb[:,:,1]+22)&(rgb[:,:,1]>rgb[:,:,2]+9);partids[region]=1
   body[part]=pack(f'v7:{style}:{part}',a,partids,region,palette)
  bank['upper']['bodice' if style=='waves' else 'suit']=body
  if style=='crop':
   legs=dict(hipNear=[85,174],kneeNear=[76,202],ankleNear=[70,224],hipFar=[107,174],kneeFar=[107,202],ankleFar=[109,224])
   parts={'hips':rect(68,163,122,180),'nearThigh':rect(54,168,98,204),'nearShin':rect(48,197,96,225),'nearShoe':rect(44,221,91,240),'farThigh':rect(96,167,124,204),'farShin':rect(94,198,130,225),'farShoe':rect(93,220,139,240)}
   for part,region in parts.items():legs[part]=pack('v7:trousers:'+part,a,ids,region,palette)
   bank['formalTrousers']=legs
  else:
   oldtext=(ROOT/'src/core/illustrated-assets.generated.ts').read_text()
   old=json.loads(oldtext.split('export const ILLUSTRATED_ASSETS = ',1)[1].split(' as unknown as ',1)[0])
   legs={**old['lower']['dress']}
   gown=normalize(style,backplate=True)
   gown[:,:,:3]=np.array(Image.fromarray(gown[:,:,:3]).quantize(palette=pal,dither=Image.Dither.NONE).convert('RGB'));gown[gown[:,:,3]==0]=0
   feet=polygon([(81,221),(93,222),(96,239),(77,239)])|polygon([(94,222),(105,224),(111,239),(94,239)])
   legs['garment']=pack('v7:dress:garment',gown,np.full((H,W),4,dtype='uint8'),rect(0,163,191,239)&~feet,palette)
   for side,area in [('near',polygon([(81,221),(93,222),(96,239),(77,239)])),('far',polygon([(94,222),(105,224),(111,239),(94,239)]))]:
    shoeids=np.full((H,W),5,dtype='uint8');shoeids[(yy<229)&(gown[:,:,0].astype(int)>gown[:,:,1].astype(int)+28)]=1
    legs[side+'Shoe']=pack('v7:dress:'+side+'Shoe',gown,shoeids,area,palette)
   bank['dress']=legs
  grid=Image.new('RGBA',(W,H),'#e8ecdf');grid.alpha_composite(Image.fromarray(a));d=ImageDraw.Draw(grid)
  for x in range(0,W,10):d.line((x,0,x,H),fill='#ff000070');d.text((x,0),str(x),fill='black')
  for y in range(0,H,10):d.line((0,y,W,y),fill='#ff000070');d.text((0,y),str(y),fill='black')
  grid.resize((768,1024),Image.Resampling.NEAREST).save(PREVIEW/f'{style}-normalized-grid.png')
 out=ROOT/'src/core/harmonized-assets.generated.ts'
 out.write_text('// Generated by scripts/prepare-harmonized-assets.py; original sources are preserved.\nexport const HARMONIZED_ASSETS = '+json.dumps(bank,separators=(',',':'))+';\n')
 (SOURCE/'registration.json').write_text(json.dumps(SPECS,indent=2)+'\n')
 print('Normalized three whole-character states for each identity, registered neck/collar/waist/sole.')
if __name__=='__main__':main()
