"""V6 technical recutting of the existing V5 source, without repainting.

Explicit ownership keeps hair/collars out of moving sleeves and skirt fabric
out of hands. V5 bytes and sources remain read-only.
"""
from pathlib import Path
import importlib.util,json,zlib,base64
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('v5',ROOT/'scripts/prepare-cohesive-assets.py')
v5=importlib.util.module_from_spec(spec);spec.loader.exec_module(v5)
source=json.loads((ROOT/'src/core/cohesive-assets.generated.ts').read_text().split('export const COHESIVE_ASSETS = ',1)[1].rstrip(';\n'))
# Copy the metadata and layers into an independent namespace; no shared-cache collisions.
def rename(value):
 if isinstance(value,str):return value.replace('v5:', 'v6:')
 if isinstance(value,list):return [rename(v) for v in value]
 if isinstance(value,dict):return {k:rename(v) for k,v in value.items()}
 return value
bank=rename(source)
def mask(points):return v5.old.polygon(points)
def replace(name,im,ids,region,palette):
 rgba=np.array(im).copy();materials=np.array(ids).copy()
 rgba[np.array(region)==0]=0;materials[rgba[:,:,3]==0]=0
 valid=np.argwhere(rgba[:,:,3]>0);y0,x0=valid.min(axis=0);y1,x1=valid.max(axis=0)+1
 packed=np.concatenate([rgba,materials[:,:,None]],axis=2)[y0:y1,x0:x1]
 item=dict(id=name,x=int(x0),y=int(y0),width=int(x1-x0),height=int(y1-y0),data=base64.b64encode(zlib.compress(packed.tobytes(),9)).decode(),palette=palette)
 bank['layers']=[item if layer['id']==name else layer for layer in bank['layers']]
 return name
CUTS={
 'waves':{
 'torso':[(86,115),(109,115),(119,120),(124,127),(121,140),(121,163),(109,167),(83,167),(80,158),(84,140),(84,131),(81,125),(77,124),(81,119)],
 'nearUpperArm':[(74,120),(82,122),(85,135),(80,143),(75,154),(72,161),(59,161),(63,146),(64,136),(68,126)],
 'nearForearm':[(63,152),(76,154),(71,166),(65,172),(63,181),(58,185),(51,185),(46,180),(46,175),(56,169),(60,159)],
 'farUpperArm':[(122,122),(126,125),(130,134),(132,147),(137,160),(125,161),(122,149),(120,138)],
 'farForearm':[(124,152),(136,154),(139,168),(143,173),(148,176),(149,181),(147,184),(141,184),(137,179),(132,175),(127,165)],
 },
 'crop':{
 'torso':[(76,117),(83,114),(86,114),(87,118),(109,118),(120,120),(129,128),(129,138),(124,151),(125,175),(115,178),(96,169),(80,178),(69,176),(72,157),(78,142),(78,125)],
 'nearUpperArm':[(73,119),(80,121),(82,136),(77,148),(72,158),(53,158),(57,144),(64,129)],
 'nearForearm':[(54,151),(73,153),(68,166),(66,178),(61,184),(53,185),(46,180),(44,174),(48,164)],
 'farUpperArm':[(127,136),(131,138),(139,154),(139,158),(122,157),(119,143)],
 'farForearm':[(121,151),(139,151),(141,163),(146,171),(148,180),(144,184),(137,186),(130,182),(126,174),(126,163)],
 }
}
for style,parts in CUTS.items():
 desc=v5.SPECS[style];im,ids=v5.normalize(desc)
 upper=bank['upper']['bodice' if style=='waves' else 'suit']
 pal={'skin':'#F4BC96','upper':desc['upper'],'lower':desc['lower'],'shoe':desc['shoe']}
 for part,points in parts.items():
  region=mask(points)
  if style=='waves' and part.endswith('Forearm'):
   # Cloth trapped next to the holding hand must not travel with the forearm.
   # Warm source skin/ink owns the arm; enclosed highlight pixels remain skin.
   rgb=np.array(im)[:,:,:3].astype(int);warm=(rgb[:,:,0]-rgb[:,:,1]>23)&(rgb[:,:,1]-rgb[:,:,2]>10)
   keep=(np.array(region)>0)&warm&(np.array(im)[:,:,3]>0)
   # Fill enclosed highlights, never exterior gown pixels.
   outside=~keep;seen=np.zeros((256,192),bool);pending=[(0,0)];seen[0,0]=True
   while pending:
    x,y=pending.pop()
    for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
     nx,ny=x+dx,y+dy
     if 0<=nx<192 and 0<=ny<256 and outside[ny,nx] and not seen[ny,nx]:seen[ny,nx]=True;pending.append((nx,ny))
   keep|=(~seen)&(np.array(region)>0)&(np.array(im)[:,:,3]>0)
   region=Image.fromarray(keep.astype('uint8')*255)
   materials=np.array(ids).copy();materials[keep]=1;arm_ids=Image.fromarray(materials)
  else:arm_ids=ids
  replace(upper[part],im,arm_ids,region,pal)
 if style=='waves':
  # The newly clean shoulder no longer carries stray hair. Restore those locks
  # in the stationary rear-hair layer, following their actual curved contour.
  back=mask([(0,98),(79,98),(85,108),(86,114),(77,121),(72,131),(66,146),(60,165),(0,169)])
  ImageDraw.Draw(back).polygon([(115,99),(191,99),(191,169),(134,169),(125,138),(116,122),(108,117),(107,113)],fill=255)
  a=np.array(im);mat=np.array(ids);yy,xx=np.indices(mat.shape)
  keep=(np.array(back)>0)&(a[:,:,3]>0)&~((yy<118)&(mat==1))
  # The original dark hair source is bounded here by bright skin/lace.
  keep&=~((yy>=112)&(a[:,:,:3].mean(axis=2)>155))
  backmat=np.where(keep,2,0).astype('uint8')
  replace(bank['portraits'][style]['backHair'],im,Image.fromarray(backmat),Image.fromarray(keep.astype('uint8')*255),{'hair':'#795043'})
 # The far suit sleeve starts below the fixed lapel/flower, not through it.
 if style=='crop':upper['shoulderFar']=[127,138]
 # The torso follows each shoulder/collar contour. Head/neck ends at y=119;
 # this removes the neutral jaw that used to remain inside every expression.
 for state,offset in zip(v5.STATES,desc['offsets']):
  head,hids=v5.normalize(desc,offset)
  headmask=v5.old.rect(0,0,191,112 if style=='waves' else 114)
  ImageDraw.Draw(headmask).polygon([(85,104),(116,106),(113,114),(109,119),(86,119)],fill=255)
  material=np.array(hids).copy();rgba=np.array(head).astype(int);yy,xx=np.indices((256,192))
  material[(material>2)&(yy<120)]=2
  neck=(yy>=106)&(yy<=119)&(xx>=86)&(xx<=112)&(rgba[:,:,0]>rgba[:,:,1]+23)&(rgba[:,:,1]>rgba[:,:,2]+10)
  material[neck]=1
  replace(bank['portraits'][style]['states'][state],head,Image.fromarray(material),headmask,{'skin':'#F4BC96','hair':'#795043'})
output=ROOT/'src/core/polished-assets.generated.ts'
output.write_text('// Generated by scripts/prepare-polished-assets.py; V5 sources remain unchanged.\nexport const POLISHED_ASSETS = '+json.dumps(bank,separators=(',',':'))+';\n')
print(f'Prepared {len(bank["layers"])} V6 layers: {output.stat().st_size} bytes')
