#!/usr/bin/env python3
"""Two bounded, stateless RGB-cluster studies; original pixels/alpha stay authoritative."""
import argparse
import hashlib
import importlib.util
import io
import json
import math
from pathlib import Path
import platform
import zipfile

import numpy as np
from PIL import Image, ImageDraw, __version__ as PILLOW_VERSION

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artwork/kling-pixel-style-study'
SIZE = (192, 298)
ANCHOR = {'x':96,'y':282,'units':'pixels','origin':'top-left'}
PRIMARY = {'male':'run','female':'walk'}
VARIANTS = {'ramps-5':{'rampLevels':5,'ivoryLevels':8,'skin':'unchanged-baseline','maxLabChromaChange':7,'maxLabLightnessChange':8,'sameNeighborsMax':1,'cleanupContrastMax':28,'outline':False},
            'ramps-4-contour':{'rampLevels':4,'ivoryLevels':7,'skin':'unchanged-baseline','maxLabChromaChange':7,'maxLabLightnessChange':10,'sameNeighborsMax':2,'cleanupContrastMax':38,'outline':True}}
SHA = lambda value: hashlib.sha256(value).hexdigest()
FAMILIES = ('skin','brown','navy','ivory','rose','neutral')


def dump(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,indent=2)+'\n')


def save(path,image):
    path.parent.mkdir(parents=True,exist_ok=True)
    image.save(path,compress_level=9)


def luminance(rgb):
    return (rgb[...,0].astype(np.int32)*54+rgb[...,1].astype(np.int32)*183+rgb[...,2].astype(np.int32)*19+128)//256


def shifted(a,dy,dx,fill=0):
    result=np.full_like(a,fill)
    y0,y1=max(0,-dy),min(a.shape[0],a.shape[0]-dy)
    x0,x1=max(0,-dx),min(a.shape[1],a.shape[1]-dx)
    result[y0:y1,x0:x1]=a[y0+dy:y1+dy,x0+dx:x1+dx]
    return result


OFFSETS=[(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]


def dilation(mask):
    return np.logical_or.reduce([mask,*[shifted(mask,dy,dx,False) for dy,dx in OFFSETS]])


def family(rgb):
    r,g,b=[int(x) for x in rgb]
    if b>=r+6 and b>=g-5:return 2
    if min(r,g,b)>125 and max(r,g,b)-min(r,g,b)<52:return 3
    if r>=145 and r>=g+24 and b>=g-2:return 4
    if r>=155 and r>=g+18 and g>=b+10:return 0
    if r>=g+6 and g>=b+3:return 1
    return 5


def lab(rgb):
    values=rgb.astype(np.float64)/255
    linear=np.where(values<=.04045,values/12.92,((values+.055)/1.055)**2.4)
    xyz=linear@np.asarray([[.4124564,.2126729,.0193339],[.3575761,.7151522,.1191920],[.1804375,.0721750,.9503041]])
    xyz=xyz/np.asarray([.95047,1,1.08883]);delta=6/29
    f=np.where(xyz>delta**3,np.cbrt(xyz),xyz/(3*delta**2)+4/29)
    return np.stack([116*f[...,1]-16,500*(f[...,0]-f[...,1]),200*(f[...,1]-f[...,2])],axis=-1)


def fit_weights(root,colors):
    weights=np.zeros(len(colors),dtype=np.int64);inputs=[]
    for character in ('male','female'):
        for look in ('base','wedding'):
            folder=root/f'artwork/kling-source-pixel-full/prepared/{character}/{look}'
            meta=json.loads((folder/'atlas.json').read_text());manifest=meta['manifest']
            image=Image.open(folder/'atlas.png').convert('RGBA');array=np.asarray(image)
            counts={}
            for clip in manifest['animations'].values():
                for fid in clip['frames']:counts[fid]=counts.get(fid,0)+1
            for cell in manifest['frames']:
                x,y,w,h=[cell[k] for k in ('x','y','width','height')]
                rgba=array[y:y+h,x:x+w];idx=baseline_indices(rgba,colors)
                weights+=np.bincount(idx[rgba[:,:,3]>=240],minlength=len(colors))*counts[cell['id']]
            inputs.append({'file':str((folder/'atlas.png').relative_to(root)),'sha256':SHA((folder/'atlas.png').read_bytes())})
            image.close()
    return weights,inputs


def weighted_medoids(members,count,colors,weights):
    if len(members)<=count:return members
    values=lab(colors[members]);distance=((values[:,None,:]-values[None,:,:])**2).sum(axis=2)
    mass=weights[members].astype(np.float64)
    selected=[];best=np.full(len(members),np.inf)
    for _ in range(count):
        costs=(np.minimum(best[None,:],distance)*mass[None,:]).sum(axis=1)
        costs[selected]=np.inf;chosen=int(np.argmin(costs));selected.append(chosen);best=np.minimum(best,distance[chosen])
    # Two fixed synchronous medoid refinements. Every decision uses global
    # bank statistics, never an animation frame's local color distribution.
    for _ in range(2):
        assignment=np.argmin(distance[selected],axis=0);updated=[]
        for i,old in enumerate(selected):
            cluster=np.where(assignment==i)[0]
            if not len(cluster):updated.append(old);continue
            cost=(distance[np.ix_(cluster,cluster)]*mass[cluster][None,:]).sum(axis=1)
            updated.append(int(cluster[int(np.argmin(cost))]))
        selected=updated
    return [members[i] for i in selected]


def palette_setup(root):
    path=root/'artwork/kling-source-pixel-full/palette.json'
    colors=np.asarray(json.loads(path.read_text())['colors'],dtype=np.uint8)
    groups=np.asarray([family(c) for c in colors],dtype=np.int16)
    light=luminance(colors)
    weights,fit_inputs=fit_weights(root,colors)
    ramps={}
    for name,params in VARIANTS.items():
        ramps[name]={}
        for group in range(len(FAMILIES)):
            members=sorted([int(i) for i in np.where(groups==group)[0]],key=lambda i:(int(light[i]),int(i)))
            count=params['ivoryLevels'] if group==3 else params['rampLevels']
            chosen=members if group==0 else weighted_medoids(members,count,colors,weights)
            ramps[name][group]=sorted(set(chosen),key=lambda i:(int(light[i]),int(i)))
    return colors,groups,ramps,{'file':str(path.relative_to(root)),'sha256':SHA(path.read_bytes()),'colors':colors.tolist(),
        'familyByPaletteIndex':[FAMILIES[x] for x in groups],
        'rampFit':'Fixed full-bank timeline-weighted RGB palette medoids in CIELAB; skin-family colors retained verbatim; ivory has8(A)/7(B) levels. No per-frame fitting.',
        'fitInputs':fit_inputs,'fullBankOpaqueTimelineWeights':weights.tolist(),
        'ramps':{name:{FAMILIES[group]:indices for group,indices in rows.items()} for name,rows in ramps.items()}}


class Source:
    def __init__(self,root,character):
        catalog=json.loads((root/'artwork/kling-themes/catalog-index.json').read_text())
        entry=next(e for e in catalog if e['key']==f'{character}:kling-original@1')
        self.asset=next(a for a in entry['lookAssets'] if a['logicalId']=='wedding')
        raw=(root/self.asset['file']).read_bytes();assert SHA(raw)==self.asset['sha256']
        self.zip=zipfile.ZipFile(io.BytesIO(raw));self.manifest=json.loads(self.zip.read('manifest.json'))
        self.config=json.loads(self.zip.read('character.json'))
        self.cells={f['id']:f for f in self.manifest['frames']};self.sheets=[self.manifest['spritesheet'],*self.manifest.get('additionalSheets',[])]
        self.page=None;self.image=None
        spec=importlib.util.spec_from_file_location('full_processing',root/'scripts/prepare-kling-source-pixel-full.py')
        self.processing=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.processing)
        prepared=root/f'artwork/kling-source-pixel-full/prepared/{character}/wedding'
        self.baseline_meta=json.loads((prepared/'atlas.json').read_text())
        self.baseline=Image.open(prepared/'atlas.png').convert('RGBA')
        self.baseline_cells={f['id']:f for f in self.baseline_meta['manifest']['frames']}

    def frame(self,fid):
        cell=self.cells[fid];page=cell.get('page',0)
        if self.page!=page:
            if self.image is not None:self.image.close()
            self.image=Image.open(io.BytesIO(self.zip.read(self.sheets[page]['file']))).convert('RGBA');self.page=page
        x,y,w,h=[cell[k] for k in ('x','y','width','height')]
        native=self.image.crop((x,y,x+w,y+h))
        projected=self.processing.projection(native,{'left':0,'top':2,'right':0,'bottom':6})
        c=self.baseline_cells[fid];x,y,w,h=[c[k] for k in ('x','y','width','height')]
        baseline=self.baseline.crop((x,y,x+w,y+h))
        return projected,baseline,SHA(native.tobytes())

    def close(self):
        if self.image is not None:self.image.close()
        self.baseline.close();self.zip.close()


def baseline_indices(rgba,colors):
    rgb=rgba[:,:,:3].astype(np.uint32)
    packed=rgb[:,:,0]*65536+rgb[:,:,1]*256+rgb[:,:,2]
    keys=colors[:,0].astype(np.uint32)*65536+colors[:,1].astype(np.uint32)*256+colors[:,2]
    order=np.argsort(keys);where=np.searchsorted(keys[order],packed)
    where=np.minimum(where,len(colors)-1)
    indices=order[where].astype(np.int16)
    assert np.all(keys[indices][rgba[:,:,3]>0]==packed[rgba[:,:,3]>0])
    return indices


def process(projected,baseline,colors,groups,ramps,name):
    original=np.asarray(projected);base=np.asarray(baseline);alpha=original[:,:,3]
    idx=baseline_indices(base,colors);families=groups[idx];light=luminance(original[:,:,:3]);visible=alpha>=240
    nlight=np.stack([shifted(light,dy,dx) for dy,dx in OFFSETS])
    nalpha=np.stack([shifted(alpha,dy,dx) for dy,dx in OFFSETS])
    valid=nalpha>=240
    local_min=np.minimum(light,np.where(valid,nlight,255).min(axis=0))
    local_max=np.maximum(light,np.where(valid,nlight,0).max(axis=0))
    contrast=local_max-local_min
    strong_detail=(contrast>=62)&((light<110)|(light>225))&visible
    thin=np.zeros_like(visible)
    for dy,dx in ((0,1),(1,0),(1,1),(1,-1)):
        a,b=shifted(light,dy,dx),shifted(light,-dy,-dx)
        ok=(shifted(alpha,dy,dx)>=240)&(shifted(alpha,-dy,-dx)>=240)
        thin|=ok&((a-light>=22)&(b-light>=22))
    mean=(np.where(valid,nlight,0).sum(axis=0)+light)/(valid.sum(axis=0)+1)
    glint=(light>=mean+26)&(light>180)&visible
    features=dilation(strong_detail|thin|glint)&visible
    skin=(families==0)&visible
    protected=features|~visible|skin
    result=idx.copy()
    ranks=np.full(len(colors),-1,dtype=np.int16)
    for group,choices in ramps[name].items():
        if not choices:continue
        chosen=np.asarray(choices,dtype=np.int16);ranks[chosen]=np.arange(len(chosen))
        mask=(families==group)&~protected
        rgb=original[:,:,:3][mask].astype(np.int32)
        distance=((rgb[:,None,:]-colors[chosen].astype(np.int32)[None,:,:])**2).sum(axis=2)
        fitted=chosen[distance.argmin(axis=1)]
        source_lab=lab(original[:,:,:3][mask]);fitted_lab=lab(colors[fitted])
        permitted=(np.linalg.norm(source_lab[:,1:]-fitted_lab[:,1:],axis=1)<=VARIANTS[name]['maxLabChromaChange'])
        permitted&=(np.abs(source_lab[:,0]-fitted_lab[:,0])<=VARIANTS[name]['maxLabLightnessChange'])
        existing=result[mask];existing[permitted]=fitted[permitted];result[mask]=existing
    before_cleanup=result.copy()
    neighbors=np.stack([shifted(result,dy,dx,-1) for dy,dx in OFFSETS])
    same=(neighbors==result).sum(axis=0)
    winner=result.copy();support=np.zeros_like(result)
    for candidate in neighbors:
        count=(neighbors==candidate).sum(axis=0)
        take=(count>support)|((count==support)&(candidate<winner))
        winner[take]=candidate[take];support[take]=count[take]
    safe_winner=np.maximum(winner,0)
    params=VARIANTS[name]
    interior=(alpha>=250)&(nalpha.min(axis=0)>=250)&~dilation(features)&~skin
    cleanup=interior&(same<=params['sameNeighborsMax'])&(support>=5)&(winner>=0)
    cleanup&=(groups[safe_winner]==families)&(ranks[result]>=0)&(ranks[safe_winner]>=0)
    cleanup&=(np.abs(ranks[result]-ranks[safe_winner])<=1)&(contrast<=params['cleanupContrastMax'])
    result[cleanup]=winner[cleanup]
    outline=np.zeros_like(visible)
    if params['outline']:
        # Source-edge gated and light-direction selective: no new border is
        # painted around the whole sprite or at every material boundary.
        exposed_down=shifted(alpha,1,0)<128;exposed_right=shifted(alpha,0,1)<128
        band=visible&(exposed_down|exposed_right)&~features&~skin
        darker_source=light<=mean-10
        for group,choices in ramps[name].items():
            for step in range(1,len(choices)):
                source_index,target_index=choices[step],choices[step-1]
                darken=light-luminance(colors[target_index])
                mask=band&darker_source&(result==source_index)&(darken>=0)&(darken<=28)
                source_lab=lab(original[:,:,:3][mask]);target_lab=lab(colors[target_index])
                allowed=np.linalg.norm(source_lab[:,1:]-target_lab[1:],axis=1)<=params['maxLabChromaChange']
                positions=np.where(mask);mask[positions]=allowed
                result[mask]=target_index;outline|=mask
    rgba=base.copy();rgba[:,:,:3]=colors[result];rgba[alpha==0]=0;rgba[:,:,3]=alpha
    assert np.array_equal(rgba[:,:,3],base[:,:,3])
    assert np.array_equal(rgba[features],base[features])
    assert np.array_equal(rgba[skin],base[skin])
    image=Image.fromarray(rgba)
    def singleton_count(labels):
        equal=np.logical_or.reduce([shifted(labels,dy,dx,-1)==labels for dy,dx in ((-1,0),(1,0),(0,-1),(0,1))])
        return int((interior&~equal).sum())
    stats={'rgbaSha256':SHA(image.tobytes()),'alphaSha256':SHA(alpha.tobytes()),'alphaEqualBaseline':True,
        'silhouetteIoUVersusBaseline':1.0,'protectedFeaturePixels':int(features.sum()),'protectedFeaturesEqualBaseline':True,
        'protectedFeatureMaskSha256':SHA(features.tobytes()),'cleanupPixels':int(cleanup.sum()),'outlinePixels':int(outline.sum()),
        'protectedSkinPixels':int(skin.sum()),'skinColorFamilyEqualBaseline':True,
        'changedOpaquePixels':int(((result!=idx)&visible).sum()),'opaqueInteriorPixels':int(interior.sum()),
        'baselineInteriorSingletons4':singleton_count(idx),'candidateInteriorSingletons4':singleton_count(result),
        'baselineVisibleColors':int(np.unique(idx[alpha>0]).size),'candidateVisibleColors':int(np.unique(result[alpha>0]).size),
        'rampsUsedBeforeCleanup':int(np.unique(before_cleanup[~protected]).size)}
    return image,stats,Image.fromarray(np.uint8(features)*255)


def board(images,labels,scale,title):
    tw,th=SIZE[0]*scale+12,SIZE[1]*scale+36
    result=Image.new('RGB',(tw*len(images),th+30),'#e9e6df');draw=ImageDraw.Draw(result)
    draw.text((8,8),title+' / AUTHORING DIAGNOSTIC',fill='#302b29')
    for i,(image,label) in enumerate(zip(images,labels)):
        x=i*tw+6;draw.text((x,35),label,fill='#302b29')
        sprite=image.resize((SIZE[0]*scale,SIZE[1]*scale),Image.Resampling.NEAREST)
        result.paste(sprite,(x,60),sprite)
    return result


def atlas(frames):
    cols=8;rows=math.ceil(len(frames)/cols);image=Image.new('RGBA',(cols*SIZE[0],rows*SIZE[1]));cells=[]
    for i,(fid,frame) in enumerate(frames.items()):
        x,y=(i%cols)*SIZE[0],(i//cols)*SIZE[1];image.paste(frame,(x,y))
        cells.append({'id':fid,'x':x,'y':y,'width':SIZE[0],'height':SIZE[1],'page':0})
    return image,cells


def preview_gif(path,frames_by_variant,schedule,title):
    frames=[];durations=[]
    for tick,fid in enumerate(schedule):
        frames.append(board([frames_by_variant[k][fid] for k in ('baseline',*VARIANTS)],
            ['Current detail128','A: 5-tone ramps','B: 4-tone + selective contour'],2,f'{title} tick {tick:02d}, source {fid} / NOT APP CAPTURE'))
        durations.append((math.floor((tick+1)*100/24+.5)-math.floor(tick*100/24+.5))*10)
    samples=np.concatenate([np.asarray(im).reshape((-1,3))[::8] for im in frames])
    palette=Image.fromarray(samples.reshape((-1,1,3))).quantize(colors=256,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
    indexed=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in frames]
    indexed[0].save(path,save_all=True,append_images=indexed[1:],duration=durations,loop=0,disposal=2,optimize=False)
    with Image.open(path) as gif:assert gif.n_frames==len(schedule)
    return {'file':path.name,'sha256':SHA(path.read_bytes()),'timelineTicks':len(schedule),'durationsMs':durations,
        'sourceFps':24,'exactSourceDurationMs':len(schedule)*1000/24,'gifDurationMs':sum(durations),
        'note':'Offline authoring preview, not app capture. GIF centisecond timing/256-color matte encoding is approximate; RGBA atlases are authoritative.'}


def temporal_diagnostics(projected,frames_by_variant,clip):
    sequence=clip['frames'];transitions=[]
    count=len(sequence) if clip['loop'] else len(sequence)-1
    for tick in range(count):
        next_tick=(tick+1)%len(sequence);first,second=sequence[tick],sequence[next_tick]
        a,b=np.asarray(projected[first]),np.asarray(projected[second])
        source_delta=np.max(np.abs(a[:,:,:3].astype(np.int16)-b[:,:,:3].astype(np.int16)),axis=2)
        opaque=(a[:,:,3]>=250)&(b[:,:,3]>=250)
        for dy,dx in ((-1,0),(1,0),(0,-1),(0,1)):
            opaque&=(shifted(a[:,:,3],dy,dx)>=250)&(shifted(b[:,:,3],dy,dx)>=250)
        stable=opaque&(a[:,:,3]==b[:,:,3])&(source_delta<=2)
        union=(a[:,:,3]>0)|(b[:,:,3]>0)
        delta={}
        for name,frames in frames_by_variant.items():
            x,y=np.asarray(frames[first]),np.asarray(frames[second])
            delta[name]=np.max(np.abs(x[:,:,:3].astype(np.int16)-y[:,:,:3].astype(np.int16)),axis=2)
        row={'tick':tick,'nextTick':next_tick,'sourceFrameIds':[first,second],'loopSeam':next_tick==0,
             'originalHeldFrame':first==second,'sourceStablePixels':int(stable.sum()),'visibleUnionPixels':int(union.sum()),
             'stableCoverageOfVisibleUnion':float(stable.sum()/max(1,union.sum())),
             'baselineJumpsAt12':int((stable&(delta['baseline']>=12)).sum()),'candidates':{}}
        for name in VARIANTS:
            row['candidates'][name]={'jumpsAt12':int((stable&(delta[name]>=12)).sum()),
                'addedJumpsAt12':int((stable&(delta[name]>=12)&(delta['baseline']<12)).sum()),
                'removedJumpsAt12':int((stable&(delta[name]<12)&(delta['baseline']>=12)).sum()),
                'maxChannelDeltaP95':float(np.percentile(delta[name][stable],95)) if stable.any() else None}
            if first==second:
                assert frames_by_variant[name][first].tobytes()==frames_by_variant[name][second].tobytes()
                assert row['candidates'][name]['jumpsAt12']==0
        transitions.append(row)
    return {'definition':'Same unaligned canvas pixel: both source-projection alpha>=250 and all four cardinal neighbors alpha>=250, exact alpha equality, max source RGB channel difference<=2. Transparent backgrounds excluded. Jump means max output RGB channel difference>=12. All thresholds fixed before evaluation.',
            'limitation':'Coverage-limited source-stable screen-pixel diagnostic; no motion correspondence or optical flow, not a complete flicker score or perceptual quality metric. Never used to modify rendering.',
            'transitions':transitions}


def build(root,out,batch):
    out.mkdir(parents=True,exist_ok=True)
    colors,groups,ramps,palette=palette_setup(root)
    dump(out/'palette-and-ramps.json',palette)
    records=[]
    for character in ('male','female'):
        source=Source(root,character);action=PRIMARY[character]
        first=source.manifest['animations'][action]['frames'][0]
        ids=[first] if not batch else [f['id'] for f in source.manifest['frames']]
        frames_by_variant={'baseline':{},**{name:{} for name in VARIANTS}};stats_by_variant={name:[] for name in VARIANTS}
        hashes={};projections={}
        for fid in ids:
            projected,baseline,native_hash=source.frame(fid);hashes[str(fid)]=native_hash
            assert source.processing.quantize(projected,colors.tolist()).tobytes()==baseline.tobytes()
            frames_by_variant['baseline'][fid]=baseline
            projections[fid]=projected
            for name in VARIANTS:
                processed,stats,mask=process(projected,baseline,colors,groups,ramps,name)
                frames_by_variant[name][fid]=processed;stats_by_variant[name].append({'sourceFrameId':fid,**stats})
                if fid==first:save(out/'first-frame'/f'{character}-{name}-protected.png',mask)
        for scale in (1,2,4):
            save(out/'first-frame'/f'{character}-{action}-comparison-{scale}x.png',board(
                [frames_by_variant[k][first] for k in ('baseline',*VARIANTS)],
                ['Current detail128','A: 5-tone ramps','B: 4-tone + selective contour'],scale,
                f'{character} wedding {action} source {first} / {scale}x'))
        record={'character':character,'look':'wedding','primaryAction':action,'source':source.asset,'sourceSize':[768,1184],
            'sourcePadding':{'left':0,'top':2,'right':0,'bottom':6},'nativeFrame':list(SIZE),'anchor':ANCHOR,
            'sourceNativeRgbaSha256':hashes,'animations':source.manifest['animations'] if batch else {action:source.manifest['animations'][action]},
            'variantStatistics':stats_by_variant}
        if batch:
            primary_ids=list(dict.fromkeys(source.manifest['animations'][action]['frames']))
            for fid in reversed(primary_ids):
                for name in VARIANTS:
                    reprocessed,_,_=process(projections[fid],frames_by_variant['baseline'][fid],colors,groups,ramps,name)
                    assert reprocessed.tobytes()==frames_by_variant[name][fid].tobytes()
            record['reverseOrderDeterminism']={'passed':True,'uniquePrimarySourceFrames':len(primary_ids),'candidateFramesChecked':len(primary_ids)*len(VARIANTS)}
            record['temporalDiagnostics']=temporal_diagnostics(projections,frames_by_variant,source.manifest['animations'][action])
            record['poseCounts']={}
            for name,frames in frames_by_variant.items():
                record['poseCounts'][name]={}
                for clip_name,clip in source.manifest['animations'].items():
                    unique_ids=set(clip['frames']);source_unique=len({hashes[str(fid)] for fid in unique_ids})
                    output_unique=len({SHA(frames[fid].tobytes()) for fid in unique_ids})
                    assert source_unique==output_unique
                    record['poseCounts'][name][clip_name]={'timelineTicks':len(clip['frames']),'sourceUniqueRgbaPoses':source_unique,'outputUniqueRgbaPoses':output_unique}
            record['variants']={}
            for name,frames in frames_by_variant.items():
                sheet,cells=atlas(frames);folder=out/name/character
                save(folder/'atlas.png',sheet)
                manifest={**source.manifest,'schemaVersion':4,'generator':'gathria-offline-source-pixel-style-study-v1',
                    'name':f'{character} wedding {name} study','spritesheet':{'file':'atlas.png','width':sheet.width,'height':sheet.height,'frameWidth':192,'frameHeight':298,'columns':8,'rows':sheet.height//298},
                    'additionalSheets':[],'frames':cells,'anchor':ANCHOR,'scale':{'pixelArt':True,'integerOnly':True,'recommended':2}}
                dump(folder/'atlas.json',{'manifest':manifest,'sourceSha256':source.asset['sha256'],'paletteSha256':palette['sha256'],
                    'variant':name,'parameters':VARIANTS.get(name),'frameStatistics':stats_by_variant.get(name,[])})
                record['variants'][name]={'atlas':str((folder/'atlas.png').relative_to(out)),'metadata':str((folder/'atlas.json').relative_to(out))}
            record['preview']=preview_gif(out/f'{character}-{action}-authoring.gif',frames_by_variant,source.manifest['animations'][action]['frames'],f'{character} wedding {action}')
            selections={action:[source.manifest['animations'][action]['frames'][round(i*(len(source.manifest['animations'][action]['frames'])-1)/3)] for i in range(4)],'jump':[83,96,101,108,121]}
            for clip,selected in selections.items():
                strips=[board([frames_by_variant[k][fid] for k in ('baseline',*VARIANTS)],['Current detail128','A: 5-tone ramps','B: 4-tone + selective contour'],2,f'{character} wedding {clip} source {fid}') for fid in selected]
                sheet=Image.new('RGB',(strips[0].width,sum(s.height for s in strips)),'#e9e6df');y=0
                for strip in strips:sheet.paste(strip,(0,y));y+=strip.height
                save(out/f'{character}-{clip}-comparison-2x.png',sheet)
        records.append(record);source.close();print(f'{character}: {len(ids)} source cells processed',flush=True)
    dump(out/('study.json' if batch else 'first-frame.json'),{'format':'kling-pixel-style-study','version':1,'studyRefinement':2,'batch':batch,
        'candidates':VARIANTS,'palette':palette,'records':records,'sourceDivisor':4,'nativeFrame':list(SIZE),'anchor':ANCHOR,
        'method':'Stateless source-pixel color-family ramps from immutable full-bank128 palette. One synchronous edge-gated adjacent-ramp cleanup pass. B additionally darkens at most one ramp step on existing dark lower/right inner edges. No alpha edits, geometry edits, new texture or temporal averaging.',
        'protection':'Low-coverage pixels with alpha<240, the complete heuristic RGB skin color family, high-contrast dark/light details, opposed-neighbor thin dark strokes, isolated bright highlights; their RGB assignments are preserved from current detail128. RGB at alpha240..254 can change; the alpha channel is exact everywhere. The skin color family is not a semantic face mask. Ivory8(A)/7(B) levels are more restrained than other material ramps. No face tracking or per-frame palette fitting.',
        'limitations':'Color families are fixed RGB heuristics, not semantic segmentation. Existing source antialiasing remains. Processing can simplify existing gradients/edges but cannot invent hand-designed hair/cloth highlight clusters or repair source motion.',
        'toolchain':{'python':platform.python_version(),'pillow':PILLOW_VERSION,'numpy':np.__version__,'scriptSha256':SHA(Path(__file__).read_bytes()),'projectionScriptSha256':SHA((root/'scripts/prepare-kling-source-pixel-full.py').read_bytes())}})


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',type=Path,default=ROOT)
    parser.add_argument('--output',type=Path,default=OUT);parser.add_argument('--batch',action='store_true')
    args=parser.parse_args();build(args.root.resolve(),args.output.resolve(),args.batch)
