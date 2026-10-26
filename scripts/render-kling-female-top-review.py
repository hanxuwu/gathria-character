#!/usr/bin/env python3
"""Offline native review: all 96 poses and the frozen head-protection limits."""
import importlib.util
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from kling_wardrobe_common import ROOT, load_source, protected_mask

spec=importlib.util.spec_from_file_location('female_top',ROOT/'scripts/prepare-kling-female-top.py')
fit=importlib.util.module_from_spec(spec);spec.loader.exec_module(fit)

def main():
    _,manifest,_,source=load_source('female')
    records={r['frameId']:r for r in json.loads((ROOT/'docs/kling-wardrobe/registration/female.json').read_text())['frames']}
    _,old=fit.read_bank(fit.BASE);_,new=fit.read_bank(fit.TARGET)
    _,navy=fit.read_bank(ROOT/'docs/kling-wardrobe/garments/female/navy-shorts.zip')
    images={}
    for fid,original in source.items():
        out=original.copy();bp,bo=navy[fid];patch,own=new[fid]
        out[bo]=bp[bo];out[own]=patch[own]
        images[fid]=(fid,Image.fromarray(out),records[fid]['points'])
    for action,clip in manifest['animations'].items():
        rows=[images[fid] for fid in dict.fromkeys(clip['frames'])]
        fit.contact(rows,fit.OUT/f'action-{action}-torso.jpg',True)
        fit.contact(rows,fit.OUT/f'action-{action}-full.jpg')
    constraints=json.loads((fit.SOURCE/'ownership-repairs.json').read_text())['blockedSourceCloth']
    cell_w,cell_h=400,370
    board=Image.new('RGB',(cell_w*4,cell_h*len(constraints)),'#eee9df');draw=ImageDraw.Draw(board)
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14)
    report=[]
    for row,entry in enumerate(constraints):
        fid=entry['frameId'];original=source[fid];old_patch,old_owned=old[fid];patch,owned=new[fid]
        before=original.copy();before[old_owned]=old_patch[old_owned]
        after=original.copy();after[owned]=patch[owned]
        protection=protected_mask(records[fid]);overlay=after.copy()
        mark=protection&(original[:,:,3]>0)
        overlay[mark,:3]=np.rint(overlay[mark,:3]*.54+np.asarray([245,65,100])*.46).astype(np.uint8)
        ys,xs=np.where(old_owned);top=max(0,int(ys.min())-20);box=(275,top,475,top+165)
        for col,(title,a) in enumerate([('Original source',original),('Released teal top',before),('Plum review candidate',after),('Frozen head protection',overlay)]):
            im=Image.fromarray(a).crop(box).resize((400,330),Image.Resampling.NEAREST)
            x=col*cell_w;y=row*cell_h;board.paste(im,(x,y+36),im)
            draw.text((x+7,y+3),f'{title} / source {fid}',fill='#354638',font=font)
            draw.text((x+7,y+19),f'Native crop {box}; 2x nearest',fill='#354638',font=font)
        probes=[]
        for x,y in entry['probes']:
            assert protection[y,x] and not owned[y,x]
            assert np.array_equal(after[y,x],original[y,x])
            probes.append({'x':x,'y':y,'originalRgba':original[y,x].tolist(),'headProtected':True,'unchangedInCandidate':True})
            px=3*cell_w+(x-box[0])*2;py=row*cell_h+36+(y-box[1])*2
            draw.ellipse((px-4,py-4,px+4,py+4),outline='#00efff',width=2)
        report.append({'frameId':fid,'crop':box,'probes':probes,'reason':entry['reason']})
    board.save(fit.OUT/'protected-neckline-limits.png')
    (fit.OUT/'protected-neckline-limits.json').write_text(json.dumps({'scope':'Native original/old/new crops and immutable strict head-protection overlay. This documents unresolved original-cloth ownership, not a fixed neckline.','poses':report},indent=2)+'\n')
    print(json.dumps({'actionSheets':10,'distinctPoses':96,'protectedLimitPoses':[r['frameId'] for r in report]}))

if __name__=='__main__':main()
