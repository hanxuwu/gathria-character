#!/usr/bin/env python3
"""Measure two retained whole-pose art trials; no image editing or anatomical warping.

The PNGs are generated artwork. This script only crops atlas gutters, translates
complete poses, samples uniformly at 2:1 and lays out technical authoring reviews.
Application export evidence is produced separately after a recipe is accepted.
"""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageDraw
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'artwork/kling-themes/source'
OUT=ART/'continuity-v3'
REVIEW=ROOT/'.review-tmp/continuity-v3'
REVIEW.mkdir(parents=True,exist_ok=True)
SHA=lambda b:hashlib.sha256(b).hexdigest()

def metrics(image):
    a=np.array(image)[:,:,3]>128
    ys,xs=np.where(a); hy,hx=np.where(a[:75])
    return {'crownTopY':int(ys.min()),'supportSoleY':int(ys.max()),'upperHeadCenterX':float((hx.min()+hx.max())/2),'upperHeadWidth':int(hx.max()-hx.min()+1),'visibleBounds':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]}

def registered(image,crop,translation):
    x,y,w,h=crop;cell=image.crop((x,y,x+w,y+h));alpha=cell.getchannel('A')
    edges=[alpha.crop((0,0,w,1)),alpha.crop((0,h-1,w,h)),alpha.crop((0,0,1,h)),alpha.crop((w-1,0,w,h))]
    assert all(a.getextrema()[1]<=16 for a in edges),('cut-source-boundary',crop)
    bounds=alpha.point(lambda a:255 if a>16 else 0).getbbox()
    dx,dy=translation[0],translation[1]+32
    assert bounds and bounds[0]+dx>=0 and bounds[1]+dy>=0 and bounds[2]+dx<=384 and bounds[3]+dy<=544
    frame=Image.new('RGBA',(384,544));frame.paste(cell,(dx,dy))
    return frame.resize((192,272),Image.Resampling.NEAREST)

def summary(frames):
    m=[metrics(f) for f in frames]; y=[v['crownTopY'] for v in m];x=[v['upperHeadCenterX'] for v in m]
    return {'frames':m,'crownVerticalRange':max(y)-min(y),'maxAdjacentCrownStepIncludingWrap':max(abs(y[(i+1)%8]-y[i]) for i in range(8)),'upperHeadHorizontalRange':max(x)-min(x),'oppositeStrideCrownDifferences':[abs(y[i]-y[i+4]) for i in range(4)]}

old_path=ART/'female-pixel-storybook-v2.recipe.json';old=json.loads(old_path.read_text());action=old['actions']['walk'];source=Image.open(ART/action['file']).convert('RGBA')
before=[registered(source,c,t) for c,t in zip(action['cropRects'],action['translations'])]
report={'character':'female','look':'base','action':'walk','basisRecipe':str(old_path.relative_to(ROOT)),'basisRecipeSha256':SHA(old_path.read_bytes()),'method':'Complete-pose AI art repairs, followed only by explicit whole-pose integer registration and common 2:1 nearest sampling. Every support sole targets source y470 before shared32px headroom. No foot lifting, detached head, interpolation or anatomical scale/warp.','nativeFrame':[192,272],'anchor':{'x':96,'y':251},'timing':{'fps':8,'loop':True,'timeline':list(range(8))},'measurements':'Opaque alpha >128 crown and sole proxies; no claimed semantic face-landmark inference. Source clipping uses alpha >16 as existing builder.','before':summary(before),'trials':[]}
for version,split in [(1,530),(2,512)]:
    p=OUT/f'female-walk-steady-v{version}.png';image=Image.open(p).convert('RGBA');assert image.size==(1536,1024)
    frames=[];rows=[]
    for i in range(8):
        crop=[i%4*384,0 if i<4 else split,384,split if i<4 else 1024-split]
        x,y,w,h=crop;cell=image.crop((x,y,x+w,y+h));a=np.array(cell)[:,:,3]>128;sy,sx=np.where(a);top=int(sy.min());sole=int(sy.max());hy,hx=np.where(a[:top+120]);cx=float((hx.min()+hx.max())/2)
        translation=[round((194-cx)/2)*2,round((470-sole)/2)*2]
        f=registered(image,crop,translation);frames.append(f);rows.append({'index':i,'crop':crop,'translation':translation,'sourceCrownTop':top,'sourceSupportSole':sole,'sourceUpperHeadCenterX':cx})
    generation=json.loads((OUT/f'female-walk-steady-v{version}.generation.json').read_text())
    refs=[{'file':str(Path(ref).relative_to(ROOT)),'sha256':SHA(Path(ref).read_bytes())} for ref in generation['referenced_image_paths']]
    trial={'version':version,'sourceFile':str(p.relative_to(ROOT)),'sourceSha256':SHA(p.read_bytes()),'generationRecord':str((OUT/f'female-walk-steady-v{version}.generation.json').relative_to(ROOT)),'referenceHashes':refs,'registration':rows,**summary(frames)}
    trial['visualReview']='More consistent face perspective across opposite strides, but lower-row opposing arm swing weakened; not selected.' if version==1 else 'Opposing near/far arm swing restored while face perspective and head width remain closer across strides. Crown jump is reduced, not eliminated: lower half remains4px higher. Short neck, tank/shorts and complete shoes retained; all planted soles at250. Accepted after parent visual review for a modest improvement, with remaining height asymmetry recorded.'
    report['trials'].append(trial)
    board=Image.new('RGB',(8*192,2*304),(239,234,221));d=ImageDraw.Draw(board)
    for row,ff in enumerate([before,frames]):
        for i,f in enumerate(ff):
            board.paste(f,(i*192,row*304+24),f);d.text((i*192+5,row*304+4),f'{"R2" if row==0 else "Trial"+str(version)} {i}',fill=(30,30,30))
    board.save(REVIEW/f'female-walk-trial{version}-comparison.png')
    gif=[]
    for i in range(8):
        frame=Image.new('RGB',(2*384,2*272+32),(239,234,221));draw=ImageDraw.Draw(frame)
        for col,f in enumerate([before[i],frames[i]]):
            f=f.resize((384,544),Image.Resampling.NEAREST);frame.paste(f,(col*384,32),f)
            draw.text((col*384+10,10),'R2 baseline' if col==0 else f'Authored trial {version}',fill=(30,30,30))
        gif.append(frame)
    gif[0].save(REVIEW/f'female-walk-trial{version}-comparison.gif',save_all=True,append_images=gif[1:],duration=[120,130]*4,loop=0,disposal=2)
report['selectedSource']='female-walk-steady-v2.png'
report['limitations']='Two authored rounds only. Second trial reduces largest crown step8→4px and range8→5px; it does not meet the hoped-for <=3px adjacent-step target. Some perspective and anatomy variation remains. Technical previews are not application-exported evidence. No statement of user visual approval.'
report['selectionDecision']='Trial2 accepted for female base revision3 after root visual review of registered native-size before/after sheet. Both drawing rounds retained. This is not user visual approval.'
(OUT/'female-walk-review.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'before':{k:v for k,v in report['before'].items() if k!='frames'},'trials':[{k:v for k,v in t.items() if k in ['version','crownVerticalRange','maxAdjacentCrownStepIncludingWrap','upperHeadHorizontalRange','oppositeStrideCrownDifferences']} for t in report['trials']]},indent=2))
