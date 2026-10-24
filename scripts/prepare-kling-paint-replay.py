#!/usr/bin/env python3
"""Replay existing reviewed garment RGB in an actual exported browser painting kit.
No new drawing: male cases are identity round-trips; female cases reuse V9's
already documented crossing-arm repairs. Keeps all source and ownership bytes.
"""
import argparse, io, json, zipfile, hashlib
from pathlib import Path
import numpy as np
from PIL import Image

def pose(z, manifest, fid):
    f=next(f for f in manifest['frames'] if f['frameId']==fid); p=manifest['pages'][f['page']]
    with Image.open(io.BytesIO(z.read(p['file']))) as im:
        r=f['rect']; cropped=im.convert('RGBA').crop((r['x'],r['y'],r['x']+r['width'],r['y']+r['height']))
    result=Image.new('RGBA',(manifest['frameWidth'],manifest['frameHeight'])); result.paste(cropped,(f['offset']['x'],f['offset']['y']))
    return result

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('kit'); ap.add_argument('output'); ap.add_argument('--id',required=True); ap.add_argument('--donor'); args=ap.parse_args()
    target=Path(args.output); assert not target.exists(),target
    with zipfile.ZipFile(args.kit) as z: files={n:z.read(n) for n in z.namelist()}
    recipe=json.loads(files['recipe.json']); recipe['output']={'id':args.id,'name':args.id.replace('-',' ').title()}
    changes=[]
    if args.donor:
        with zipfile.ZipFile(args.donor) as donor:
            m=json.loads(donor.read('manifest.json'))
            for row in recipe['poseOverrides']:
                fid=row['frameId']; file=row['image']['file']
                before=Image.open(io.BytesIO(files[file])).convert('RGBA'); after=pose(donor,m,fid)
                a,b=np.array(before),np.array(after); mask=np.array(Image.open(io.BytesIO(files[row['mask']['file']])).convert('RGBA'))[...,0]>0
                assert np.array_equal(a[...,3],b[...,3]); assert np.array_equal(a[~mask],b[~mask]),(fid,'outside ownership')
                changed=np.any(a!=b,axis=2); changes.append({'frameId':fid,'changedPixels':int(changed.sum())})
                if changed.any():
                    out=io.BytesIO();after.save(out,format='PNG');files[file]=out.getvalue()
    files['recipe.json']=json.dumps(recipe,indent=2).encode()
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name,data in files.items(): z.writestr(name,data)
    print(json.dumps({'output':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'donor':args.donor,'changes':changes,'method':'Existing reviewed RGB replay; no new painting or body changes.'}))
if __name__=='__main__': main()
