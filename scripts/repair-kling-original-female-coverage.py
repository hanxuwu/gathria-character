"""Repair only source-reviewed original-female garment ownership omissions.

Existing garment color ratios extend into traced old-tank cloth, retaining its
source shading/alpha. Six neckline interiors use the immutable runtime V3
permission profile; ambiguous neckline blur stays protected. No skin removal,
source repaint, geometry, frames, timing or generic protection changes.
"""
import sys,json,zipfile,io,hashlib,copy,argparse
from pathlib import Path
import numpy as np
from scipy import ndimage as nd
from PIL import Image,ImageDraw
sys.path.insert(0,str(Path(__file__).resolve().parent))
from kling_wardrobe_common import ROOT,load_source,protected_mask,save_garment,png_bytes,sha
import kling_wardrobe_common as packaging
def lossless_png4(array):
 out=io.BytesIO();Image.fromarray(np.asarray(array,dtype=np.uint8),'RGBA').save(out,format='PNG',compress_level=4);return out.getvalue()
packaging.png_bytes=lossless_png4
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--baseline-dir',type=Path,required=True,help='Frozen archives named <itemId>.zip; hashes are pinned in baseline-items.json.')
parser.add_argument('--work-dir',type=Path,required=True,help='Audit/candidate output directory; does not replace shipped assets.')
args=parser.parse_args();OUT=args.work_dir;BASE=args.baseline_dir;CAND=OUT/'candidate';CAND.mkdir(parents=True,exist_ok=True)
items=json.load(open(ROOT/'docs/wardrobe-coverage/original-female/baseline-items.json'));sourcebytes,sm,_,src=load_source('female')
profile=json.load(open(ROOT/'artwork/kling-mask-workbench/female-neckline-cloth-v1.json'))
profiles=[profile,*json.load(open(ROOT/'artwork/wardrobe-coverage/neckline-profiles-v1.json'))['profiles']]
traces=json.load(open(ROOT/'artwork/kling-female-top/source/ownership-repairs.json'))
template=zipfile.ZipFile(ROOT/'docs/kling-wardrobe/templates/female.wardrobe-template.zip')
perm={}
for f in profile['frames']:
 m=np.zeros((1056,704),bool)
 for r in f['runs']:m[r['y'],r['x0']:r['x1']+1]=True
 perm[f['frameId']]=m
polys={r['frameId']:r['polygon'] for r in traces['repairs']}

def bank(item):
 frozen=BASE/(item['id']+'.zip');assert sha(frozen.read_bytes())==item['actualSha256'],f'Baseline changed: {item["id"]}'
 z=zipfile.ZipFile(frozen);m=json.loads(z.read('manifest.json'));pages=[np.array(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA')) for p in m['pages']];masks=[np.array(Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA'))[:,:,3]>0 for p in m['pages']];out={}
 for f in m['frames']:
  r=f['rect'];o=f['offset'];sl=np.s_[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']];d=np.s_[o['y']:o['y']+r['height'],o['x']:o['x']+r['width']];p=np.zeros((1056,704,4),np.uint8);own=np.zeros((1056,704),bool);p[d]=pages[f['page']][sl];own[d]=masks[f['page']][sl];out[f['frameId']]=(p,own)
 return m,out

def shade(original,patch,own,add,bottom=False):
 # Native-cloth color transport. Restrict donors to changed, opaque owned source
 # cloth; an interior neighborhood supplies tone without copying a skin edge.
 sr=original[:,:,:3].astype(float);pr=patch[:,:,:3].astype(float)
 donor=nd.binary_erosion(own,iterations=2)&(patch[:,:,3]>230)&(original[:,:,3]>230)&(np.max(abs(sr-pr),axis=2)>10)
 # Exclude visible skin-like pixels in source so added sleeves/overlaid hands
 # cannot become color donors. This is donor selection, never body ownership.
 donor &= (sr[:,:,0]-sr[:,:,1]<35)&(sr[:,:,0]-sr[:,:,2]<60)
 assert donor.any()
 if bottom:
  yy,xx=np.indices(own.shape);donor &= (yy>=688)&(yy<=730)&(xx>=335)&(xx<=445)
  weights=nd.gaussian_filter(donor.astype(float),sigma=7);valid=weights>.025;assert valid.any()
  nearest=nd.distance_transform_edt(~valid,return_distances=False,return_indices=True)
  color=np.stack([nd.gaussian_filter(pr[:,:,c]*donor,sigma=7)/np.maximum(weights,1e-9) for c in range(3)],axis=2)[tuple(nearest)]
  result=patch.copy();result[add]=original[add];result[add,:3]=np.rint(np.clip(color[add],0,255)).astype(np.uint8);return result
 ratio=np.clip((pr+16)/(sr+16),.12,3.)
 weight=nd.gaussian_filter(donor.astype(float),sigma=7)
 local=np.stack([nd.gaussian_filter(ratio[:,:,c]*donor,sigma=7)/np.maximum(weight,1e-9) for c in range(3)],axis=2)
 valid=weight>.035;nearest=nd.distance_transform_edt(~valid,return_distances=False,return_indices=True)
 mapped=local[tuple(nearest)]
 color=np.rint(np.clip((sr+16)*mapped-16,0,255)).astype(np.uint8)
 result=patch.copy();result[add]=original[add];result[add,:3]=color[add]
 return result

report=json.load(open(OUT/'repair-report.json')) if (OUT/'repair-report.json').exists() else []
completed={x['itemId'] for x in report}
for item in items:
 if item['id'] in completed:
  previous=next(r for r in report if r['itemId']==item['id'])
  if 'dual-tailored-female-original' not in item['id'] or previous['necklinePermission']=='female-original-tailored-neckline-cloth-v1':continue
  report=[r for r in report if r['itemId']!=item['id']]
 if item['slot'] not in ['top','fullBody','bottom']:continue
 if item['slot']=='bottom' and ('tailored' in item['id']):continue
 m,frames=bank(item);regs={f['frameId']:f for f in json.load(open(ROOT/item['registrationUrl'][1:]))['frames']};regbytes=(ROOT/item['registrationUrl'][1:]).read_bytes()
 matched_profile=next((p for p in profiles if p['sourceSha256']==m['sourceSha256'] and p['registrationSha256']==m['registrationSha256'] and p['id'] in ['female-neckline-cloth-v1','female-original-tailored-neckline-cloth-v1']),None)
 can_neck=matched_profile is not None
 if can_neck:assert matched_profile['frames']==profile['frames'], 'Paired permission differs from approved source-cloth runs'
 records=[];neckused=False
 for fid in ([90] if item['slot']=='bottom' else sorted(set(polys)|set(perm))):
  original=src[fid];patch,own=frames[fid];add=np.zeros(own.shape,bool);reasons=[]
  if item['slot']=='bottom':
   image=Image.new('L',(704,1056));ImageDraw.Draw(image).polygon([(351,691),(368,694),(394,693),(421,689),(420,695),(403,701),(391,707),(365,710),(359,700)],fill=255)
   rgb=original[:,:,:3].astype(float);dark=(rgb[:,:,0]<105)&(rgb[:,:,1]<105)&(rgb[:,:,2]>rgb[:,:,0]-12)
   local=(np.asarray(image)>0)&dark&(original[:,:,3]>230)&~own&~protected_mask(regs[fid]);add|=local
   if local.any():reasons.append('reviewed-waist90-source-shorts-island')
  if item['slot']!='bottom' and fid in polys:
   image=Image.new('L',(704,1056));ImageDraw.Draw(image).polygon([tuple(p) for p in polys[fid]],fill=255);traced=np.asarray(image)>0
   r,g,b=np.moveaxis(original[:,:,:3].astype(float),2,0);rule=traces['sourceClothRule'];cloth=(original[:,:,3]>rule['minimumAlpha'])&(r-g<rule['redMinusGreenMaximum'])&(r-b<rule['redMinusBlueMaximum'])&(r-b>rule['redMinusBlueMinimum'])&(r>rule['redMinimum'])&(r<rule['redMaximum'])
   # Original bottom ownership remains independent. Traces were authored
   # against this exact base source and never cross the reviewed shorts.
   bottom=np.asarray(Image.open(io.BytesIO(template.read(f'masks/{fid:03d}/shorts.png'))))>0
   local=traced&cloth&~own&~bottom&~protected_mask(regs[fid]);add|=local
   if local.any():reasons.append('reviewed-source-cloth-island')
  if item['slot']!='bottom' and can_neck and fid in perm:
   neck=perm[fid]&~own;add|=neck
   if neck.any():neckused=True;reasons.append('immutable-neckline-cloth-v1')
  if not add.any():continue
  before=original.copy();before[own]=patch[own];new=shade(original,patch,own,add,bottom=item['slot']=='bottom');newown=own|add;after=original.copy();after[newown]=new[newown]
  assert np.array_equal(before[~add],after[~add]);assert np.array_equal(before[:,:,3],after[:,:,3]);assert np.all(original[add,3]>0)
  allow=perm.get(fid,np.zeros(own.shape,bool)) if can_neck else np.zeros(own.shape,bool)
  assert not (add&protected_mask(regs[fid])&~allow).any()
  frames[fid]=(new,newown);y,x=np.where(add)
  records.append({'frameId':fid,'addedPixels':int(add.sum()),'bounds':[int(x.min()),int(y.min()),int(x.max()+1),int(y.max()+1)],'reasons':reasons,'outsideRepairExact':True,'sourceAlphaExact':True,'maskSha256':sha(add.tobytes()),'beforeRgbaSha256':sha(before.tobytes()),'afterRgbaSha256':sha(after.tobytes())})
  if item['id'] in ['teal-top','navy-waistcoat','plum-pintuck-top-v1','coral-daydress-v9','ivory-wedding-dress-v9','dual-female-original-sea-top-v1','ochre-shorts','navy-shorts']:
   p=OUT/'repair-review'/item['id'];p.mkdir(parents=True,exist_ok=True);Image.fromarray(before).save(p/f'{fid}-before.png');Image.fromarray(after).save(p/f'{fid}-after.png');Image.fromarray(add.astype(np.uint8)*255).save(p/f'{fid}-mask.png')
 if not records:print(item['id'],'no additions',flush=True);continue
 out=CAND/(item['id']+'.zip')
 # Repack native crops while preserving every frame's composed pixels outside
 # explicit additions. Atlas layout is transport metadata, not source motion.
 try:
  save_garment('female',m['id'],m['name'],m['slot'],regbytes,frames,m['provenance']+' Source-reviewed coverage repair: three existing source-cloth island traces and the exact compatible six-frame neckline permission map. Only missing cloth ownership and cloth RGB are added; source alpha, other composed pixels, face, body geometry and action timing stay exact.',output=out,hand_reviews=m.get('handProtectionReviews'))
 except ValueError as error:
  # Existing packer returns a repo-relative URL after writing. Candidate audit
  # files intentionally live outside the repo; verify its written result.
  if 'is not in the subpath' not in str(error) or not out.exists():raise
 with zipfile.ZipFile(out) as z:files={n:z.read(n) for n in z.namelist()}
 newm=json.loads(files['manifest.json'])
 if neckused:newm['version']=3;newm['necklinePermissionProfile']=matched_profile['id']
 files['manifest.json']=(json.dumps(newm,separators=(',',':'))+'\n').encode()
 with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for n,b in sorted(files.items()):info=zipfile.ZipInfo(n,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,b)
 report.append({'itemId':item['id'],'url':item['url'],'registrationUrl':item['registrationUrl'],'beforeSha256':sha((BASE/(item['id']+'.zip')).read_bytes()),'afterSha256':sha(out.read_bytes()),'frameCount':len(frames),'changedFrames':records,'necklinePermission':matched_profile['id'] if neckused else None})
 print(item['id'],len(records),sum(r['addedPixels'] for r in records),'added px',flush=True)
 (OUT/'repair-report.json').write_text(json.dumps(report,indent=2)+'\n')
