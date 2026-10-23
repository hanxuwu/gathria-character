#!/usr/bin/env python3
"""Cloth-only native crouch donor. Does not copy generated anatomy or alpha."""
import argparse, importlib.util, io, json, zipfile
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
from kling_wardrobe_common import ROOT,load_source,protected_mask,save_garment,sha
spec=importlib.util.spec_from_file_location('waist_reader',ROOT/'scripts/prepare-kling-male-fit-polish.py')
reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
OUT=ROOT/'artwork/kling-pose-review/prepared';SOURCE=ROOT/'artwork/kling-pose-review/source/female-waist-86-donor.png'
YY,XX=np.indices((1056,704));KEYS=[0,55,62,83,84,85,86,87,88,89,90,99,100,104]

def main():
 p=argparse.ArgumentParser();p.add_argument('--prototype',action='store_true');a=p.parse_args();OUT.mkdir(exist_ok=True,parents=True)
 donor=np.asarray(Image.open(SOURCE).convert('RGBA').resize((704,1056),Image.Resampling.LANCZOS))[:,:,:3]
 # Explicit cloth trace excludes all generated skin, hands, hair and backdrop.
 trace=Image.new('L',(704,1056));ImageDraw.Draw(trace).polygon([(206,740),(265,707),(332,727),(430,724),(430,752),(444,763),(474,793),(492,808),(201,808)],fill=255)
 valid=np.asarray(trace)>0;nearest=nd.distance_transform_edt(~valid,return_distances=False,return_indices=True);donor=donor[tuple(nearest)]
 trace.save(OUT/'female-donor-cloth-mask.png')
 source,_,_,frames=load_source('female')
 with zipfile.ZipFile(ROOT/'docs/kling-wardrobe/templates/female.wardrobe-template.zip') as z:
  reg=z.read('registration.json');rows={f['frameId']:f for f in json.loads(reg)['frames']}
  report={'sourceSha256':sha(source),'registrationSha256':sha(reg),'donorSha256':sha(SOURCE.read_bytes()),'generatedAnatomyUsed':False,'prototype':a.prototype,'items':[]}
  for prefix,name in [('coral-daydress','Coral native folds'),('ivory-wedding-dress','Ivory native folds')]:
   path=ROOT/f'docs/kling-wardrobe/garments/female/{prefix}-v6.zip';bank=reader.read_bank(path);prepared={};audit=[];tiles=[]
   for fid in (KEYS if a.prototype else sorted(frames)):
    if fid not in frames:continue
    base,owned=bank[fid];result=base.copy();row=rows[fid];points=row['points'];l,r=points['waistLeft'],points['waistRight'];wy=(l['y']+r['y'])/2;cx=(l['x']+r['x'])/2;w=r['x']-l['x'];slope=(r['y']-l['y'])/w
    strength=float(np.clip((points['neck']['x']-cx-45)/65,0,1)*np.clip((wy-704)/42,0,1))
    painted=np.zeros_like(owned)
    if strength>0:
     u=(XX-l['x'])/w;h=YY-(wy+slope*(XX-cx))
     sx=236.5+u*179.7;sy=759.4+(sx-326.35)*(27.8/179.7)+h
     sampled=np.stack([nd.map_coordinates(donor[:,:,c].astype(float),[sy,sx],order=1,mode='nearest') for c in range(3)],2)
     # Continuous pose strength and a soft local cloth window, not an ID jump.
     weight=np.clip((h+52)/15,0,1)*np.clip((38-h)/16,0,1)*np.clip((u+.2)/.18,0,1)*np.clip((1.2-u)/.25,0,1)*strength
     protected=protected_mask(row)
     mask=owned&(base[:,:,3]>200)&~protected&(weight>0)
     if prefix.startswith('ivory') and mask.any():
      # Match ivory midtones using the same painted fold structure, without tinting skin.
      ratio=np.percentile(base[mask,:3],65,axis=0)/np.maximum(np.percentile(sampled[mask],65,axis=0),1)
      sampled=np.clip(sampled*ratio,0,255)
     result[mask,:3]=np.rint(base[mask,:3]*(1-weight[mask,None])+sampled[mask]*weight[mask,None]).astype(np.uint8);painted=mask
    assert np.array_equal(result[:,:,3],base[:,:,3]);assert np.array_equal(result[~painted],base[~painted])
    prepared[fid]=(result,owned);audit.append({'frameId':fid,'strength':strength,'paintedPixels':int(painted.sum())})
    if fid in KEYS:
     board=Image.new('RGBA',(1408,1092),'#eee9df')
     for i,art in enumerate([base,result]):
      out=frames[fid].copy();out[owned]=art[owned];board.alpha_composite(Image.fromarray(out),(i*704,36));ImageDraw.Draw(board).text((i*704+10,10),f'OFFLINE {prefix} / {fid} / {"V6" if i==0 else "native donor trial"}',fill='#304036')
     board.save(OUT/f'{prefix}-{fid:03}-native.png');tiles.append(board.resize((704,546)))
   contact=Image.new('RGB',(1408,546*((len(tiles)+1)//2)),'#eee9df')
   for i,t in enumerate(tiles):contact.paste(t,(i%2*704,i//2*546))
   contact.save(OUT/f'{prefix}-native-contact.jpg',quality=92)
   packed=None
   if not a.prototype:packed=save_garment('female',prefix+'-v7',name,'fullBody',reg,prepared,f'Additive cloth-only native crouch painting over {path.name} SHA256 {sha(path.read_bytes())}. OpenAI image edit source {SOURCE.relative_to(ROOT)} SHA256 {sha(SOURCE.read_bytes())}; only explicitly traced fabric sampled, all generated anatomy/background/alpha discarded. scripts/prepare-kling-native-waist.py. Local source waist anchors and continuous pose weighting; old ownership, silhouette, alpha, protected head/hands, source body, motion and timing unchanged. Not original video clothing.')
   report['items'].append({'id':prefix+'-v7','baselineSha256':sha(path.read_bytes()),'alphaAndOwnershipExact':True,'poses':audit,'packed':packed})
 (OUT/('female-native-prototype.json' if a.prototype else 'female-native-audit.json')).write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(report,indent=2))
if __name__=='__main__':main()
