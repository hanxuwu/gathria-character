#!/usr/bin/env python3
"""Source-bound sleeve ownership repair; existing cloth pixels are re-registered.
No generated anatomy, new brush artwork or source/anchor mutation.
"""
import argparse, importlib.util, json, zipfile
import numpy as np
from PIL import Image, ImageDraw
from scipy.interpolate import PchipInterpolator
from scipy import ndimage as nd
from kling_wardrobe_common import ROOT, load_source, protected_mask, save_garment, sha

OUT=ROOT/'artwork/kling-repair-handoff/male'
BASE=ROOT/'docs/kling-wardrobe/garments/male/teal-camp-shirt-v4.zip'
spec=importlib.util.spec_from_file_location('male_repair_bank',ROOT/'scripts/prepare-kling-male-fit-polish.py')
reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)

def prepare(pack=False):
    OUT.mkdir(parents=True,exist_ok=True)
    source_bytes,_,_,source=load_source('male')
    with zipfile.ZipFile(ROOT/'docs/kling-wardrobe/templates/male-full-outfits-v1.wardrobe-template.zip') as z: registration=z.read('registration.json')
    rows={r['frameId']:r for r in json.loads(registration)['frames']}
    with zipfile.ZipFile(BASE) as z:
        manifest=json.loads(z.read('manifest.json'))
        assert manifest['sourceSha256']==sha(source_bytes) and manifest['registrationSha256']==sha(registration)
    bank=reader.read_bank(BASE);fid=59;base,owned=bank[fid];raw=source[fid]
    protected=protected_mask(rows[fid])
    # Measured existing sleeve hem on either side of the interior triangular
    # ownership notch. These are cloth/source coordinates, never new joints.
    edge=lambda x:int(530+np.where(~owned[530:585,x])[0][0])
    healthy_x=[368,372,396,404];healthy_y=[edge(x) for x in healthy_x]
    continued=PchipInterpolator(healthy_x,healthy_y)
    candidate=base.copy();new_owned=owned.copy();audit=[]
    yy=np.arange(1056,dtype=float)
    for x in range(373,396):
        before=edge(x);after=float(continued(x));delta=max(0,after-before)
        if delta<.25: continue
        assert delta<20
        # Re-register a 28px-deep strip of the existing painted sleeve to its
        # continued hem. Texture/edge shading travel together; no fill color or
        # invented outline is drawn. All ownership outside this patch is exact.
        top=before-28
        sy=top+(yy-top)*28/(28+delta)
        local=(yy>=top)&(yy<after)&~protected[:,x]
        assert not (local & (raw[:,x,3]<255)).any()
        colors=np.stack([nd.map_coordinates(base[:,:,c].astype(float),[sy,np.full_like(sy,x)],order=1,mode='nearest') for c in range(3)],1)
        candidate[local,x,:3]=np.rint(colors[local]).clip(0,255).astype('uint8')
        candidate[local,x,3]=raw[local,x,3]
        new_owned[local,x]=True
        audit.append({'x':x,'oldFirstUnownedY':before,'newFirstUnownedY':after,'shiftPixels':delta})
    changed=np.any(candidate!=base,axis=2)|(new_owned!=owned)
    assert not (changed&protected).any()
    assert np.array_equal(candidate[owned,3],base[owned,3])
    before=raw.copy();before[owned]=base[owned]
    after=raw.copy();after[new_owned]=candidate[new_owned]
    assert np.array_equal(before[:,:,3],after[:,:,3])
    assert np.array_equal(before[protected],after[protected])
    bank[fid]=(candidate,new_owned)
    for frame in [58,59,60]:
        old_patch,old_owned=(base,owned) if frame==59 else bank[frame]
        new_patch,new_mask=bank[frame]
        board=Image.new('RGBA',(1408,1092),'#eee9df')
        for index,(art,mask) in enumerate([(old_patch,old_owned),(new_patch,new_mask)]):
            composed=source[frame].copy();composed[mask]=art[mask]
            board.alpha_composite(Image.fromarray(composed),(index*704,36))
            ImageDraw.Draw(board).text((index*704+8,10),f'OFFLINE cloth candidate / pose {frame} / {"before" if index==0 else "after"}',fill='#304036')
        board.save(OUT/f'pose-{frame}-offline.png')
    crop=Image.new('RGBA',(440,260),'#eee9df')
    for i,im in enumerate([before,after]):crop.alpha_composite(Image.fromarray(im).crop((350,525,420,590)).resize((210,195),Image.Resampling.NEAREST),(i*220,28))
    ImageDraw.Draw(crop).text((4,7),'BEFORE / AFTER: ownership notch',fill='#304036');crop.save(OUT/'notch-offline-3x.png')
    report={'sourceSha256':sha(source_bytes),'registrationSha256':sha(registration),'baseline':str(BASE.relative_to(ROOT)),'baselineSha256':sha(BASE.read_bytes()),'changedFrameIds':[59],'unchangedFrameCount':len(bank)-1,'clothReRegisteredPixels':int(changed.sum()),'newlyOwnedSourcePixels':int((new_owned&~owned).sum()),'protectedChanges':0,'silhouetteAlphaExact':True,'noGeneratedArtwork':True,'healthyHemSamples':list(zip(healthy_x,healthy_y)),'columns':audit,'visualStatus':'candidate; application-export review required'}
    if pack:
        output=OUT/'teal-camp-shirt-v5.zip'
        report['item']=save_garment('male','teal-camp-shirt-v5','Teal joined sleeve','top',registration,bank,
            f'Local sleeve ownership repair of teal-camp-shirt-v4 SHA256 {sha(BASE.read_bytes())}. Native run pose59 has a triangular hole between sleeve and near forearm. Re-register existing 28px cloth strips by at most20px to a hem continuation measured from adjacent good edges. No new donor/artwork generated. Protected source head/hands, final silhouette alpha, anchors/timing and all other87poses remain exact. Recipe scripts/prepare-kling-male-repair.py.',output=output)
    (OUT/'audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--pack',action='store_true');args=p.parse_args();prepare(args.pack)
