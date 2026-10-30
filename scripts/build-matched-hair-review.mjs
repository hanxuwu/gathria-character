// Presentation-only comparison of actual workbench exports. Native source,
// garment, appearance, CharacterPack pixels and clocks are never rewritten.
// Usage: node scripts/build-matched-hair-review.mjs --input /tmp/.../exports
//        --output docs/matched-hair/review --baseline docs/dual-looks/review
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const options = {
  input: "/tmp/kling-hair-match/exports",
  output: "docs/matched-hair/review",
  baseline: "docs/dual-looks/review",
  characters: "male,female",
  actions: "walk,run,jump",
  beforeActions: "run,jump",
  directions: "right,left",
  bodyHeight: 460,
  headHeight: 240,
  maxCycleSeconds: 12,
  durationLimit: null,
};
const names = {
  input: "input",
  output: "output",
  baseline: "baseline",
  characters: "characters",
  actions: "actions",
  "before-actions": "beforeActions",
  directions: "directions",
  "body-height": "bodyHeight",
  "head-height": "headHeight",
  "max-cycle-seconds": "maxCycleSeconds",
  "duration-limit": "durationLimit",
};
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--static-only") {
    options.actions = "";
    options.beforeActions = "";
    continue;
  }
  const key = names[process.argv[i].replace(/^--/, "")];
  if (!key || !process.argv[i + 1]) throw Error("Unknown or missing option");
  const value = process.argv[++i];
  options[key] = [
    "bodyHeight",
    "headHeight",
    "maxCycleSeconds",
    "durationLimit",
  ].includes(key)
    ? Number(value)
    : value;
}
for (const key of ["input", "output", "baseline"])
  options[key] = resolve(options[key]);
for (const key of ["characters", "actions", "beforeActions", "directions"])
  options[key] = options[key].split(",").filter(Boolean);

const presentation = String.raw`
import hashlib,io,json,math,statistics,sys,zipfile
from collections import Counter
from fractions import Fraction
from pathlib import Path
import PIL
from PIL import Image,ImageDraw,ImageFont,ImageOps
import numpy as np

options=json.loads(sys.argv[1]);root=Path(options['output']);inputs=Path(options['input']);baseline=Path(options['baseline'])
root.mkdir(parents=True,exist_ok=True)
generated=[]
assert set(options['characters'])<=set(['male','female']) and options['characters']
assert set(options['directions'])<=set(['left','right']) and options['directions']
assert 100<=options['bodyHeight']<=1200 and 100<=options['headHeight']<=800
assert 1<=options['maxCycleSeconds']<=30
if options['durationLimit'] is not None:assert 0<options['durationLimit']<=30
matte=(238,233,223,255);ink=(43,61,52);sub=(84,93,83)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',16)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
sha=lambda b:hashlib.sha256(b).hexdigest()
def file_sha(path):return sha(Path(path).read_bytes())
def bounds(image,threshold=1):
 a=np.asarray(image)[:,:,3];yy,xx=np.where(a>=threshold)
 assert len(xx),'Empty native character frame'
 return [int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)]
def rounded(value):return math.floor(value+Fraction(1,2))
class Pack:
 def __init__(self,data):
  self.archive=zipfile.ZipFile(io.BytesIO(data));assert self.archive.testzip() is None
  self.manifest=json.loads(self.archive.read('manifest.json'));self.config=json.loads(self.archive.read('character.json'));self.sha256=sha(data)
  self.pages=[Image.open(io.BytesIO(self.archive.read(p['file']))).convert('RGBA') for p in [self.manifest['spritesheet']]+self.manifest.get('additionalSheets',[])]
  self.frames={f['id']:f for f in self.manifest['frames']};self.width=self.manifest['spritesheet']['frameWidth'];self.height=self.manifest['spritesheet']['frameHeight']
 def frame(self,fid):
  f=self.frames[fid];return self.pages[f.get('page',0)].crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height']))
def open_pack(path):return Pack(Path(path).read_bytes())
def current_record(row):
 project=zipfile.ZipFile(row['project']);assert project.testzip() is None
 source=Pack(project.read('source.character.zip'));current=open_pack(row['pack']);old=open_pack(baseline/row['character']/(row['view']+'.character.zip'))
 bank_raw=project.read('appearance.zip');bank=zipfile.ZipFile(io.BytesIO(bank_raw));assert bank.testzip() is None;appearance=json.loads(bank.read('manifest.json'));pad=appearance['padding']
 assert source.manifest['animations']==current.manifest['animations']==old.manifest['animations'],'Comparison must keep source action timing'
 assert current.config['derivation']['frames']==source.config['derivation']['frames']==old.config['derivation']['frames']
 assert appearance['sourceSha256']==source.sha256
 assert old.config['sourceMetadata']['wardrobe']['sourcePackSha256']==source.sha256
 assert current.width==source.width+pad['left']+pad['right'] and current.height==source.height+pad['top']+pad['bottom']
 old_pad=old.config['sourceMetadata'].get('appearance',{}).get('padding',{'left':0,'right':0,'top':0,'bottom':0})
 reference_bank_path=baseline.parent/'assets'/(row['character']+'-'+row['view']+'.appearance.zip')
 reference_bank_raw=reference_bank_path.read_bytes();reference_bank=zipfile.ZipFile(io.BytesIO(reference_bank_raw));assert reference_bank.testzip() is None
 reference_manifest=json.loads(reference_bank.read('manifest.json'));assert reference_manifest['sourceSha256']==source.sha256
 assert sha(reference_bank_raw)==old.config['sourceMetadata']['appearance']['selection']['bankSha256'],'Head comparison reference must match the previous exported appearance'
 reference_poses={p['frameId']:p for p in reference_manifest['poses']}
 poses={p['frameId']:p for p in appearance['poses']}
 return {'row':row,'source':source,'current':current,'old':old,'padding':pad,'oldPadding':old_pad,'poses':poses,'referencePoses':reference_poses,'referenceAppearanceSha256':sha(reference_bank_raw),'appearanceSha256':sha(bank_raw)}
def calibrate(record):
 source=record['source'];idle=source.manifest['animations']['idle'];samples=[]
 for fid in idle['frames']:
  b=bounds(source.frame(fid),128);samples.append({'frameId':fid,'bounds':b,'height':b[3]-b[1],'bottom':b[3],'centerX':(b[0]+b[2])/2})
 height=statistics.median(s['height'] for s in samples);bottom=statistics.median(s['bottom'] for s in samples);cx=statistics.median(s['centerX'] for s in samples)
 candidates=[s for s in samples if abs(s['height']-height)<=1 and abs(s['bottom']-bottom)<=1 and abs(s['centerX']-cx)<=2]
 chosen=candidates[0] if candidates else min(samples,key=lambda s:abs(s['height']-height)+abs(s['bottom']-bottom)+abs(s['centerX']-cx))
 # Freeze head measurement to the source-bound previous bank, so changing a
 # candidate's own allowable hair/head envelope cannot conceal its volume.
 h=record['referencePoses'][chosen['frameId']]['headBounds']
 result={'referenceFrameId':chosen['frameId'],'referenceSourceBounds':chosen['bounds'],'sourceVisibleBodyHeight':height,'sourceFootBaselineY':bottom,'sourceCenterX':cx,'bodyScale':options['bodyHeight']/height,'targetVisibleBodyHeight':options['bodyHeight'],'sourceHeadBounds':h,'headScale':options['headHeight']/h['height'],'targetHeadBoxHeight':options['headHeight'],'alphaThreshold':128,'idleSamples':[dict(s,occurrences=count) for s,count in [(s,sum(x==s for x in samples)) for i,s in enumerate(samples) if s not in samples[:i]]],'framewiseRescale':False,'framewiseRecenter':False}
 record['calibration']=result;return result
def native_to_world_bounds(record,which,ids=None):
 cal=record['calibration'];pad=record['padding'] if which=='current' else record['oldPadding'];p=record[which];scale=cal['bodyScale'];all_bounds=[]
 for fid in (ids if ids is not None else p.frames):
  x0,y0,x1,y1=bounds(p.frame(fid))
  all_bounds.append(((x0-pad['left']-cal['sourceCenterX'])*scale,(y0-pad['top']-cal['sourceFootBaselineY'])*scale,(x1-pad['left']-cal['sourceCenterX'])*scale,(y1-pad['top']-cal['sourceFootBaselineY'])*scale))
 return [min(b[0] for b in all_bounds),min(b[1] for b in all_bounds),max(b[2] for b in all_bounds),max(b[3] for b in all_bounds)]
def body_layout(records,static=False):
 boxes=[native_to_world_bounds(r,which,[r['calibration']['referenceFrameId']] if static else None) for r in records for which in (['current'] if static else ['current','old'])]
 extent=max(max(abs(b[0]),abs(b[2])) for b in boxes);top=min(b[1] for b in boxes);bottom=max(b[3] for b in boxes)
 width=max(360,math.ceil(2*extent)+48);height=math.ceil(bottom-top)+48
 return {'panelWidth':width,'panelHeight':height,'centerX':width/2,'baselineY':24-top,'contentWorldBounds':[-extent,top,extent,bottom],'framewiseLayout':False}
def body_pane(record,fid,which,layout):
 cal=record['calibration'];pad=record['padding'] if which=='current' else record['oldPadding'];scale=cal['bodyScale']
 # One isotropic affine transform per view, shared across every action/frame.
 dx=cal['sourceCenterX']+pad['left']-layout['centerX']/scale
 dy=cal['sourceFootBaselineY']+pad['top']-layout['baselineY']/scale
 return record[which].frame(fid).convert('RGBa').transform((layout['panelWidth'],layout['panelHeight']),Image.Transform.AFFINE,(1/scale,0,dx,0,1/scale,dy),resample=Image.Resampling.BICUBIC).convert('RGBA')
def panel_canvas(panes,labels,title,layout,footline=True):
 gap=12;header=72;footer=32;width=len(panes)*layout['panelWidth']+(len(panes)+1)*gap;height=header+layout['panelHeight']+footer
 canvas=Image.new('RGBA',(width,height),matte);draw=ImageDraw.Draw(canvas);draw.text((gap,8),title,font=font,fill=ink);draw.text((gap,30),'Fixed source-idle scale; each source keeps its own action clock',font=small,fill=sub)
 for n,(pane,label) in enumerate(zip(panes,labels)):
  x=gap+n*(layout['panelWidth']+gap);draw.text((x,50),label,font=small,fill=ink)
  if footline:
   y=header+round(layout['baselineY']);draw.line((x,y,x+layout['panelWidth'],y),fill=(201,205,190,255),width=1)
  canvas.alpha_composite(pane,(x,header))
 draw.text((gap,height-22),'Display normalization only; native PNG and CharacterPack pixels are unchanged',font=small,fill=sub)
 return canvas.convert('RGB')
def clock(clip):return Fraction(str(clip['fps']))
def duration(clip):return Fraction(len(clip['frames']),1)/clock(clip)
def common_period(clips):
 periods=[duration(c) for c in clips];den=math.lcm(*(p.denominator for p in periods));ticks=[int(p*den) for p in periods];return Fraction(math.lcm(*ticks),den)
def timeline(clips):
 looping=all(c['loop'] for c in clips);common=common_period(clips) if looping else None
 if common and common<=options['maxCycleSeconds']:end=common;loop=True
 else:end=max(duration(c) for c in clips) if not looping else Fraction(3);loop=False
 if options['durationLimit'] is not None:
  end=min(end,Fraction(str(options['durationLimit'])));loop=False
 events={Fraction(0),end}
 for c in clips:
  fps=clock(c);count=math.ceil(end*fps)
  events.update(Fraction(i,1)/fps for i in range(count+1) if Fraction(i,1)/fps<end and (c['loop'] or i<len(c['frames'])))
 times=sorted(events);rows=[]
 for start,stop in zip(times,times[1:]):
  begin=rounded(start*100);finish=rounded(stop*100)
  assert finish>begin,'GIF centisecond clock cannot distinguish these source frames'
  positions=[]
  for c in clips:
   p=math.floor(start*clock(c));p=p%len(c['frames']) if c['loop'] else min(p,len(c['frames'])-1);positions.append(p)
  rows.append({'startSeconds':float(start),'endSeconds':float(stop),'delayMs':(finish-begin)*10,'positions':positions,'frameIds':[c['frames'][p] for c,p in zip(clips,positions)]})
 return rows,loop,{'commonPeriodSeconds':float(common) if common else None,'displayDurationSeconds':float(end),'loop':loop,'sourceClocks':[{'fps':c['fps'],'frameCount':len(c['frames']),'loop':c['loop'],'durationSeconds':float(duration(c))} for c in clips],'sourcePhasesMatched':False,'shorterNonLoopingClipHoldsLastFrame':not looping,'diagnosticDurationLimit':options['durationLimit']}
def palette_for(frames):
 samples=[f.resize((160,160),Image.Resampling.BOX) for f in frames];atlas=Image.new('RGB',(160*min(16,len(samples)),160*math.ceil(len(samples)/16)))
 for i,s in enumerate(samples):atlas.paste(s,((i%16)*160,(i//16)*160))
 return atlas.quantize(colors=256,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
def save_gif(frames,rows,path,loop,palette=None):
 palette=palette or palette_for(frames);indexed=[f.quantize(palette=palette,dither=Image.Dither.NONE) for f in frames]
 indexed[0].save(path,save_all=True,append_images=indexed[1:],duration=[r['delayMs'] for r in rows],disposal=2,optimize=False,**({'loop':0} if loop else {}))
 check=Image.open(path);ms=0
 for i in range(check.n_frames):check.seek(i);check.load();ms+=check.info.get('duration',0)
 assert ms==sum(r['delayMs'] for r in rows),'Presentation GIF lost timing'
 assert (check.info.get('loop')==0)==loop
 generated.append(path)
 return {'file':path.name,'bytes':path.stat().st_size,'sha256':file_sha(path),'decodedFrames':check.n_frames,'inputTimelineFrames':len(rows),'durationMs':ms,'loop':loop}
def head_comparison(records,character):
 columns=[(records[0],'current','Original / hairstyle reference'),(records[1],'old','Side / previous hairstyle'),(records[1],'current','Side / matching candidate')];rendered=[];extents=[]
 for r,which,label in columns:
  c=r['calibration'];h=c['sourceHeadBounds'];pad=r['padding'] if which=='current' else r['oldPadding'];im=r[which].frame(c['referenceFrameId']);scale=c['headScale'];center=h['x']+h['width']/2;chin=h['y']+h['height'];box=(0,0,im.width,min(im.height,math.ceil(chin+pad['top']+40/scale)));b=bounds(im.crop(box));extents.append(((b[0]-pad['left']-center)*scale,(b[1]-pad['top']-chin)*scale,(b[2]-pad['left']-center)*scale,40));rendered.append((r,which,label,im,center,chin,scale,pad))
 w=max(300,math.ceil(2*max(max(abs(b[0]),abs(b[2])) for b in extents))+32);top=min(b[1] for b in extents);height=math.ceil(40-top)+32;layout={'panelWidth':w,'panelHeight':height,'centerX':w/2,'baselineY':16-top}
 panes=[];labels=[]
 for r,which,label,im,cx,chin,scale,pad in rendered:
  dx=cx+pad['left']-layout['centerX']/scale;dy=chin+pad['top']-layout['baselineY']/scale
  pane=im.convert('RGBa').transform((w,height),Image.Transform.AFFINE,(1/scale,0,dx,0,1/scale,dy),resample=Image.Resampling.BICUBIC).convert('RGBA');panes.append(pane);labels.append(label+' / ID '+str(r['calibration']['referenceFrameId']))
 canvas=panel_canvas(panes,labels,character.title()+' / hairstyle design comparison',layout,False);d=ImageDraw.Draw(canvas);d.rectangle((0,27,canvas.width,47),fill=matte[:3]);d.text((12,30),'Equal source head-box height; hair volume and length are not independently fitted',font=small,fill=sub)
 name=character+'-matched-heads.png';canvas.save(root/name);generated.append(root/name)
 return {'file':name,'layout':layout,'columns':[{'view':r['row']['view'],'revision':which,'frameId':r['calibration']['referenceFrameId'],'headScale':scale,'sourceHeadBounds':r['calibration']['sourceHeadBounds']} for r,which,_,_,_,_,scale,_ in rendered]}
def native_diagnostics(record,character):
 clothes=open_pack(record['row']['baseline']['pack']);assert clothes.manifest['animations']==record['source'].manifest['animations']
 assert (clothes.width,clothes.height)==(record['source'].width,record['source'].height)
 ids={'male':[0,77,82],'female':[64,77,95]}[character];details=[]
 for fid in ids:
  pose=record['poses'][fid];reference=record['referencePoses'][fid];head=reference['headBounds'];hair=pose['hairBounds'];old_hair=reference['hairBounds']
  box=[math.floor(min(head['x'],hair['x'],old_hair['x'])-12),math.floor(min(head['y'],hair['y'],old_hair['y'])-12),math.ceil(max(head['x']+head['width'],hair['x']+hair['width'],old_hair['x']+old_hair['width'])+12),math.ceil(head['y']+head['height']+70)]
  w,h=(box[2]-box[0])*2,(box[3]-box[1])*2;canvas=Image.new('RGBA',(w*3+48,h+72),matte);d=ImageDraw.Draw(canvas);d.text((12,8),character.title()+' / side / native ID '+str(fid)+' / actual exports / 2x nearest',font=font,fill=ink)
  for i,(label,pack,pad) in enumerate([('Clothing / source head',clothes,{'left':0,'top':0}),('Previous hair',record['old'],record['oldPadding']),('Matched hair',record['current'],record['padding'])]):
   crop=pack.frame(fid).crop((box[0]+pad['left'],box[1]+pad['top'],box[2]+pad['left'],box[3]+pad['top'])).resize((w,h),Image.Resampling.NEAREST)
   x=12+i*(w+12);d.text((x,40),label,font=small,fill=ink);canvas.alpha_composite(crop,(x,64))
  path=root/(character+'-side-native'+str(fid)+'-head-neck-2x.png');canvas.convert('RGB').save(path);generated.append(path)
  details.append({'file':path.name,'frameId':fid,'sourceCoordinateCrop':box,'scale':2,'inputPackSha256':{'clothingOnly':clothes.sha256,'previousHair':record['old'].sha256,'matchedHair':record['current'].sha256},'matteOutsideNativeCanvas':True})
 return details

report={'format':'gathria-matched-hair-presentation','version':1,'inputArchivesUnchanged':True,'presentationPixelsResampled':True,'Pillow':PIL.__version__,'notes':['Actual UI-exported CharacterPacks and embedded source frames only; no new art is drawn here.','Standing visible source height calibrates one constant scale and one constant baseline for each view.','No per-frame fit, centering, pose retiming or forced shared phase.','A looping pair uses its exact common native period when at most the configured maximum; otherwise it is a non-looping display excerpt.','Head comparisons use an independent fixed source head-box scale, not a per-hairstyle bounding-box fit.'],'characters':[]}
input_hashes={}
for character in options['characters']:
 rows=json.loads((inputs/character/'exports.json').read_text());by_view={r['view']:r for r in rows};records=[current_record(by_view[v]) for v in ['original','side']]
 for r in records:
  calibrate(r);input_hashes[r['row']['pack']]=file_sha(r['row']['pack']);input_hashes[r['row']['project']]=file_sha(r['row']['project'])
 layout=body_layout(records);calibrations=[]
 for r in records:
  calibrations.append({'view':r['row']['view'],'sourceSha256':r['source'].sha256,'currentPackSha256':r['current'].sha256,'previousPackSha256':r['old'].sha256,'appearanceSha256':r['appearanceSha256'],'referenceAppearanceSha256':r['referenceAppearanceSha256'],'currentPadding':r['padding'],'previousPadding':r['oldPadding'],**r['calibration']})
 stance_layout=body_layout(records,True)
 entry={'character':character,'calibrations':calibrations,'bodyLayout':layout,'stanceLayout':stance_layout,'headComparison':head_comparison(records,character),'nativeDiagnostics':native_diagnostics(records[1],character),'animations':[]}
 stance=panel_canvas([body_pane(r,r['calibration']['referenceFrameId'],'current',stance_layout) for r in records],[r['row']['view'].title()+' / idle ID '+str(r['calibration']['referenceFrameId']) for r in records],character.title()+' / equal standing source height',stance_layout)
 stance_path=root/(character+'-matched-stance.png');stance.save(stance_path);generated.append(stance_path)
 for action in options['actions']:
  clips=[r['current'].manifest['animations'][action] for r in records];events,loop,meta=timeline(clips);right=[];left=[]
  for event in events:
   panes=[body_pane(r,fid,'current',layout) for r,fid in zip(records,event['frameIds'])];labels=[r['row']['view'].title()+' / native ID '+str(fid) for r,fid in zip(records,event['frameIds'])]
   right.append(panel_canvas(panes,labels,character.title()+' / '+action+' / right / equal standing source height',layout))
   if 'left' in options['directions']:left.append(panel_canvas([ImageOps.mirror(p) for p in panes],labels,character.title()+' / '+action+' / left / equal standing source height',layout))
  palette=palette_for(right)
  for facing,frames in [('right',right),('left',left)]:
   if facing not in options['directions']:continue
   name=character+'-two-views-'+action+'-'+facing+'.gif';entry['animations'].append({**save_gif(frames,events,root/name,loop,palette),'action':action,'facing':facing,'comparison':'current original versus current side','clock':meta,'timeline':events})
 for action in options['beforeActions']:
  r=records[1];clips=[r[which].manifest['animations'][action] for which in ['old','current']];events,loop,meta=timeline(clips);frames=[]
  for event in events:
   panes=[body_pane(r,fid,which,layout) for fid,which in zip(event['frameIds'],['old','current'])];labels=['Side / previous / ID '+str(event['frameIds'][0]),'Side / matching / ID '+str(event['frameIds'][1])];frames.append(panel_canvas(panes,labels,character.title()+' / '+action+' / same native side pose before and after',layout))
  name=character+'-side-'+action+'-before-after.gif';entry['animations'].append({**save_gif(frames,events,root/name,loop),'action':action,'facing':'right','comparison':'previous side versus current side','clock':meta,'timeline':events})
 report['characters'].append(entry)
for path,digest in input_hashes.items():assert file_sha(path)==digest,'Input export was modified'
(root/'presentation-provenance.json').write_text(json.dumps(report,indent=2)+'\n')
files=[]
for p in sorted(generated):
 im=Image.open(p);duration_ms=0
 for i in range(im.n_frames):im.seek(i);im.load();duration_ms+=im.info.get('duration',0)
 files.append({'file':p.name,'bytes':p.stat().st_size,'sha256':file_sha(p),'width':im.width,'height':im.height,'frames':im.n_frames,'durationMs':duration_ms,'loop':im.info.get('loop')})
(root/'presentation-integrity.json').write_text(json.dumps({'format':'gathria-matched-hair-presentation-integrity','passed':True,'inputArchivesUnchanged':True,'files':files},indent=2)+'\n')
print(json.dumps({'output':str(root),'media':len(files),'characters':[r['character'] for r in report['characters']],'passed':True}))
`;
execFileSync("python", ["-c", presentation, JSON.stringify(options)], {
  stdio: "inherit",
  timeout: 600_000,
});
