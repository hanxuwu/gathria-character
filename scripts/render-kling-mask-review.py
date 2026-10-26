#!/usr/bin/env python3
"""Arrange independently verified mask-workbench downloads for visual review.

Produces exactly five small presentation derivatives, never new artwork or
application-export evidence. Wait for both the production capture and its
independent artifact audit to pass before running this script.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import os
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'docs/kling-mask-workbench'
DEFAULT_INDEX = BASE / 'evidence/final-v1/evidence-index.json'
DEFAULT_AUDIT = BASE / 'artifact-validation.json'
DEFAULT_OUTPUT = BASE / 'review'
MATTE = (238, 233, 223)
INK = (38, 52, 47)
MAX_BYTES = 10 * 1024 * 1024
CROPS = {
    89:(275,534,475,699), 90:(275,445,475,610), 93:(275,348,475,513),
    101:(275,422,475,587), 102:(275,486,475,651), 103:(275,543,475,708),
}
LIMITS = {
    89:'Warm blurred fringe remains.',
    90:'Soft gray inner band remains.',
    93:'Thin original neckline highlight remains.',
    101:'Inner blur edge and small flecks remain.',
    102:'Narrow lower fringe remains.',
    103:'Large wedge reduced; thin slivers remain.',
}


def require(value, message):
    if not value:
        raise AssertionError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def rel(path):
    return str(path.resolve().relative_to(ROOT))


def font(size=16):
    path = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    return ImageFont.truetype(str(path), size) if path.is_file() else ImageFont.load_default()


def opaque(image):
    output = Image.new('RGBA', image.size, MATTE+(255,))
    output.alpha_composite(image.convert('RGBA'))
    return output.convert('RGB')


class Review:
    def __init__(self, index, audit_path, output, refresh=False):
        raw = index.read_bytes()
        self.capture = json.loads(raw)
        self.output = output
        c = self.capture
        require(c.get('passed') is True and c.get('finishedAt'), 'Wait for the completed passing production capture.')
        require(c.get('production') is True and c['format']=='gathria-mask-workbench-browser-evidence', 'Wrong capture type.')
        require(len(c['matrix'])==4 and len(c['gifs'])==8 and len(c['packs'])==1 and len(c['playback'])==10, 'Incomplete capture matrix.')
        require(sum(row['kind']=='png' for row in c['downloads'])==22, 'Expected22 actual native PNGs.')
        audit_bytes = audit_path.read_bytes()
        audit = json.loads(audit_bytes)
        require(audit.get('passed') is True and audit['evidenceIndexSha256']==sha(raw), 'Wait for the matching passing independent artifact audit.')
        require(audit['summary']['changedSourcePoses']==6 and audit['summary']['exactPackFrames']==96, 'Wrong audited change scope.')
        require(refresh or not output.exists() or not list(output.iterdir()), 'Preserve existing review files; choose an empty output directory.')
        self.downloads = {row['file']:row for row in c['downloads']}
        require(len(self.downloads)==len(c['downloads']), 'Duplicate download paths.')
        self.sources, self.outputs = {}, []
        self.metadata = {
            'format':'gathria-mask-workbench-review','version':1,
            'captureIndex':rel(index),'captureIndexSha256':sha(raw),
            'captureFinishedAt':c['finishedAt'],'captureScriptSha256':c['scriptSha256'],
            'reviewScriptSha256':sha(Path(__file__).read_bytes()),
            'catalogSha256':c['catalogSha256'],
            'independentArtifactAudit':{'file':rel(audit_path),'sha256':sha(audit_bytes)},
            'actualUiDownload':False,
            'scope':'Offline arrangements of verified actual UI downloads. No character pixels repainted, no generated/offline authoring images used as application evidence.',
            'sources':self.sources,'outputs':self.outputs,
        }
        if refresh:
            previous = json.loads((output/'index.json').read_bytes())
            require(previous['captureIndexSha256']==sha(raw) and previous['reviewScriptSha256']==sha(Path(__file__).read_bytes()), 'Link refresh requires the same capture and renderer.')
            require(previous['visualCount']==5, 'Cannot refresh an incomplete review.')
            for item in previous['outputs']:
                require(sha((ROOT/item['file']).read_bytes())==item['sha256'], 'A review visual changed.')
            self.metadata = previous
            self.metadata['independentArtifactAudit'] = {'file':rel(audit_path),'sha256':sha(audit_bytes)}
            self.sources,self.outputs = previous['sources'],previous['outputs']
        output.mkdir(parents=True,exist_ok=True)

    def source(self, filename):
        row = self.downloads[filename]
        require(row.get('actualUiDownload') is True, f'Not an actual UI download:{filename}')
        path = ROOT/filename
        data = path.read_bytes()
        require(sha(data)==row['sha256'] and len(data)==row['bytes'], f'Download changed:{filename}')
        self.sources[filename] = {key:row[key] for key in ('kind','bytes','sha256','actualUiDownload')}
        return data

    def gif(self,key,action,facing):
        matches = [row for row in self.capture['gifs'] if (row['key'],row['action'],row['facing'])==(key,action,facing)]
        require(len(matches)==1,f'Missing or ambiguous actual GIF:{key}/{action}/{facing}')
        row = matches[0]
        frames,delays = [],[]
        with Image.open(io.BytesIO(self.source(row['file']))) as image:
            loop = image.info.get('loop')
            require(image.size==(row['width'],row['height']), 'Captured GIF dimensions changed.')
            for position in range(image.n_frames):
                image.seek(position)
                frames.append(image.convert('RGB'))
                delays.append(image.info.get('duration',0))
        require(delays==row['delaysMs'] and len(frames)==row['frames'], 'GIF frame count/timing changed.')
        require((loop==0)==row['loop'], 'GIF loop flag changed.')
        return row,frames,delays,loop

    def record(self,path,**details):
        data=path.read_bytes()
        with Image.open(path) as image:
            dimensions=list(image.size)
        self.outputs.append({'file':rel(path),'sha256':sha(data),'bytes':len(data),'dimensions':dimensions,
            'actualUiDownload':False,'kind':'offline-review-arrangement',**details})

    def animation(self,action,facing):
        panels = [self.gif(key,action,facing) for key in ('before-navy','after-navy')]
        first=panels[0]
        require(first[0]['sourceSchedule']==panels[1][0]['sourceSchedule'] and first[2]==panels[1][2], 'Comparison clocks differ.')
        require(all(image.size==first[1][0].size for part in panels for image in part[1]),'Comparison geometry differs.')
        unchanged=all(ImageChops.difference(a,b).getbbox() is None for a,b in zip(first[1],panels[1][1]))
        if action=='run':require(unchanged,'Run changed despite jump-only accepted patches.')
        width,height=first[1][0].size
        margin,gap,header,label,footer=12,12,48,26,30
        canvas_size=(margin*2+width*2+gap,header+label+height+footer)
        title=f'{action.title()} / {facing} · before / accepted mask candidate'
        frames,steps=[],[]
        for position,duration in enumerate(first[2]):
            canvas=Image.new('RGB',canvas_size,MATTE);d=ImageDraw.Draw(canvas)
            d.text((margin,8),title,fill=INK,font=font(17))
            d.text((margin,29),'Review repeats the full action; original clocks retained.',fill=INK,font=font(12))
            for i,text in enumerate(('Before · Plum V1','After · six reviewed manual patches')):
                x=margin+i*(width+gap)
                d.text((x,header+2),text,fill=INK,font=font(13))
                canvas.paste(panels[i][1][position],(x,header+label))
            fid=first[0]['sourceSchedule']['frames'][position]
            d.text((margin,canvas_size[1]-footer+5),f'Native pose {fid} · step {position+1}/{len(first[2])} · {duration} ms'+(' · run pixels unchanged' if action=='run' else ''),fill=INK,font=font(13))
            frames.append(canvas);steps.append({'action':action,'facing':facing,'position':position,'frameId':fid,'durationMs':duration})
        # Palette samples do not replace the full-resolution panel pixels.
        samples=[f.resize((max(1,f.width//4),max(1,f.height//4)),Image.Resampling.BOX) for f in frames]
        sample=Image.new('RGB',(samples[0].width,sum(i.height for i in samples)),MATTE);y=0
        for image in samples:sample.paste(image,(0,y));y+=image.height
        palette=sample.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
        indexed=[f.quantize(palette=palette,dither=Image.Dither.NONE) for f in frames]
        path=self.output/f'{action}-{facing}-comparison.gif'
        indexed[0].save(path,save_all=True,append_images=indexed[1:],duration=first[2],loop=0,disposal=1,optimize=False)
        with Image.open(path) as check:
            delays=[]
            for n in range(check.n_frames):check.seek(n);check.load();delays.append(check.info.get('duration',0))
            require(delays==first[2] and check.info.get('loop')==0,'Review GIF changed frame order/count/delays.')
        self.record(path,title=title,sources=[p[0]['file'] for p in panels],frameSteps=steps,
            frames=len(frames),delaysMs=first[2],originalLoopFlags=[p[3] for p in panels],outputLoop=0,
            decodedInputPanelsExact=unchanged,scaleFromDownloadedGif=1,scaleFromNativeExport=.5,
            playbackNote='Review repeats the complete action. Original one-shot jump downloads stay one-shot; every source frame and delay within the sequence is unchanged.',
            colorNote='Actual GIF panels placed at their original downloaded size, then requantized once into a shared presentation palette. No pose edits or interpolation.')

    def crop(self,key,fid):
        candidates=[row for row in self.capture['matrix'] if row['key']==key]
        require(len(candidates)==1,'Missing or ambiguous PNG row.')
        matches=[row for row in candidates[0]['pngs'] if (row['action'],row['frameId'],row['facing'])==('jump',fid,'right')]
        require(len(matches)==1,'Missing matching actual native PNG.')
        row=matches[0];image=Image.open(io.BytesIO(self.source(row['file']))).convert('RGBA')
        require(image.size==(704,1056),'Expected original-head, unpadded native PNG.')
        box=CROPS[fid]
        return opaque(image.crop(box)),{'file':row['file'],'kind':'actual-native-png-crop','frameId':fid,'sourceCoordinateCrop':list(box),'exportCoordinateCrop':list(box)}

    def details(self):
        inputs=[(fid,[self.crop(key,fid) for key in ('before-navy','after-navy')]) for fid in CROPS]
        for scale in (1,2):
            margin,gap,row_height,header=12,16,224,70
            native_width=margin*2+200*2+gap
            image=Image.new('RGB',(native_width*scale,(header+row_height*6+16)*scale),MATTE);d=ImageDraw.Draw(image)
            d.text((margin*scale,8*scale),f'Actual neckline crops · {scale}×',fill=INK,font=font(19*scale))
            d.text((margin*scale,36*scale),'Before / accepted manual mask candidate',fill=INK,font=font(13*scale))
            provenance=[]
            for r,(fid,crops) in enumerate(inputs):
                y=header+r*row_height
                d.text((margin*scale,y*scale),f'Pose {fid} · {LIMITS[fid]}',fill=INK,font=font(12*scale))
                for i,(crop,record) in enumerate(crops):
                    x=margin+i*(200+gap)
                    d.text((x*scale,(y+20)*scale),'Before' if i==0 else 'After',fill=INK,font=font(12*scale))
                    panel=crop if scale==1 else crop.resize((crop.width*scale,crop.height*scale),Image.Resampling.NEAREST)
                    image.paste(panel,(x*scale,(y+42)*scale));provenance.append({**record,'panel':'before' if i==0 else 'after'})
            path=self.output/f'neckline-details-{scale}x.png';image.save(path,optimize=True)
            self.record(path,title=f'Actual native neckline details at{scale}×',scaleFromNativeExport=scale,crops=provenance,
                resize='none' if scale==1 else 'integer nearest-neighbor artwork; labels drawn atmatching scale',
                matte=list(MATTE),note='Actual PNG pixels only; residual gray blur/fringes intentionally visible. No authoring proposal images used.')

    def gallery(self):
        def href(filename):
            return html.escape(os.path.relpath(ROOT/filename,self.output),quote=True)
        def link(filename,label):
            require((ROOT/filename).is_file(),f'Missing local link:{filename}')
            return f'<a href="{href(filename)}">{html.escape(label)}</a>'
        descriptions={
            'jump-right-comparison.gif':'The six accepted manual patches are visible in the original rightward jump. Pose103 loses most of the large gray right-neck wedge; the soft source neckline band at90 and narrow fringes remain.',
            'jump-left-comparison.gif':'The same before/after action faces left through the existing mirror playback. This review loop repeats a source one-shot jump; its original download remains one-shot.',
            'run-right-comparison.gif':'All run drawings are unchanged. Both decoded source GIF panels were checked pixel-for-pixel before this shared-palette presentation was created.',
        }
        sections=[]
        for row in self.outputs:
            name=Path(row['file']).name
            if name.endswith('.gif'):
                sources=' · '.join(link(f,'Original '+('before' if i==0 else 'after')+' GIF') for i,f in enumerate(row['sources']))
                sections.append(f'<section><h2>{html.escape(row["title"])}</h2><p>{html.escape(descriptions[name])}</p><a href="{name}"><img src="{name}" alt="{html.escape(row["title"],quote=True)}"></a><p>{sources}</p></section>')
        crops=next(r['crops'] for r in self.outputs if r['file'].endswith('neckline-details-1x.png'))
        crop_links=''.join('<li>'+link(r['file'],f'Pose{r["frameId"]} · {r["panel"]} · original PNG')+'</li>' for r in crops)
        sections.append('<section><h2>Six native neckline comparisons</h2><p>These six changes are individually authored and explicitly accepted. They are not six successful automatic propagations. Remaining blur/fringes are labeled; technical checks do not establish final artistic acceptance.</p><p><a href="neckline-details-1x.png">Native1×</a> · <a href="neckline-details-2x.png">Integer2×</a></p><a href="neckline-details-1x.png"><img src="neckline-details-1x.png" alt="Actual before and after neckline crops across six source poses"></a><details><summary>Original native PNG downloads</summary><ul>'+crop_links+'</ul></details></section>')
        retained=[]
        for row in self.capture['downloads']:
            if not row.get('temporary') and row['kind'] not in ('png','gif'):
                self.source(row['file'])
                retained.append('<li>'+link(row['file'],Path(row['file']).name)+'</li>')
        delivered=[]
        project_dir=BASE/'projects'
        if project_dir.is_dir():
            for path in sorted(project_dir.glob('*.zip')):
                digest=sha(path.read_bytes())
                matched=[row for row in self.capture['projects'] if row['sha256']==digest]
                require(len(matched)==1,'Delivered project does not match an actual saved download.')
                delivered.append({'file':rel(path),'sha256':digest,'captureFile':matched[0]['file']})
                retained.append('<li>'+link(rel(path),'Retained editable project: '+path.name)+'</li>')
        self.metadata['deliveredProjects']=delivered
        screenshots=[]
        for row in self.capture['screenshots']:
            data=(ROOT/row['file']).read_bytes()
            require(sha(data)==row['sha256'] and len(data)==row['bytes'],'UI screenshot changed.')
            screenshots.append('<li>'+link(row['file'],Path(row['file']).name+' · actual UI screenshot')+'</li>')
        records=' · '.join([link(self.metadata['captureIndex'],'Production capture'),link(self.metadata['independentArtifactAudit']['file'],'Independent artifact audit'),link('docs/kling-mask-workbench/README.md','Workflow and limitations')])
        page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kling mask workbench review</title><style>body{max-width:1120px;margin:32px auto;padding:0 20px;background:#f6f1e7;color:#26342f;font:16px/1.5 system-ui,sans-serif}h1{font-size:30px}h2{font-size:22px}a{color:#215d77}img{display:block;max-width:100%;height:auto;background:#eee9df;border:1px solid #d9d3c5}section{padding:12px 0 24px;border-bottom:1px solid #d9d3c5}li{margin:8px 0}.note{padding:16px;background:#fff9ed;border-left:4px solid #956d42}</style><main><h1>Kling mask workbench: actual export review</h1><p>Exactly five presentation derivatives from hash-checked production UI downloads. Original PNG/GIF/CharacterPack and workbench files remain linked below. Character pixels are not retouched; GIF review layouts use one shared lossy palette.</p><p class="note">The large pose103 neckline wedge improves, while ambiguous gray blur and thin fringes remain. The final six changes are reviewed manual patches. Separately recorded anchor-based neighboring suggestions remain pending or rejected; they are not silently accepted or described as fully automatic repairs.</p>'''
        page+=''.join(sections)
        page+='<section><h2>Actual portable downloads</h2><p>The character pack was exported after an exact saved-project reopen, then played in a separate player after the editor closed. Temporary project paths are not published as download links.</p><ul>'+''.join(retained)+'</ul></section>'
        page+='<section><h2>Workflow and player screenshots</h2><ul>'+''.join(screenshots)+'</ul></section><p>'+records+'</p></main></html>'
        (self.output/'index.html').write_text(page)

    def finish(self):
        require(len(self.outputs)==5,'Expected exactly five review visuals.')
        total=sum(r['bytes'] for r in self.outputs)
        require(total<MAX_BYTES,'Review visuals exceed10MiB budget.')
        self.metadata.update(visualCount=5,visualBytes=total)
        self.gallery()
        (self.output/'index.json').write_text(json.dumps(self.metadata,indent=2)+'\n')
        print(json.dumps({'review':rel(self.output/'index.html'),'visuals':5,'bytes':total,'capture':self.metadata['captureIndex']}))

    def render(self):
        self.animation('jump','right')
        self.animation('jump','left')
        self.animation('run','right')
        self.details()
        self.finish()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index',type=Path,default=DEFAULT_INDEX)
    parser.add_argument('--audit',type=Path,default=DEFAULT_AUDIT)
    parser.add_argument('--output',type=Path,default=DEFAULT_OUTPUT)
    parser.add_argument('--refresh-links',action='store_true',help='Refresh matching retained-project links without altering five verified visuals.')
    args=parser.parse_args()
    review=Review(args.index.resolve(),args.audit.resolve(),args.output.resolve(),args.refresh_links)
    if args.refresh_links:review.finish()
    else:review.render()


if __name__=='__main__':main()
