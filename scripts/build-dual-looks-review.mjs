// Review presentation is derived solely from actual UI-exported projects/packs.
// No clothing, face or hair artwork is created by this script.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const input = resolve(process.argv[2] ?? "/tmp/dual-looks");
const output = resolve("docs/dual-looks/review");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const characters = process.argv.includes("--male-only")
  ? ["male"]
  : ["male", "female"];
const files = [];
await mkdir(output, { recursive: true });
for (const character of characters) {
  const target = `${output}/${character}`;
  await mkdir(target, { recursive: true });
  const rows = JSON.parse(
    await readFile(`${input}/${character}/exports.json`, "utf8"),
  );
  for (const row of rows) {
    for (const path of [
      row.pack,
      row.png.right,
      row.png.left,
      row.baseline.png,
      `${input}/${character}/${row.view}-workspace.png`,
      `${input}/${character}/${row.view}-independent.png`,
      ...Object.values(row.gifs).flatMap((r) => [r.right, r.left]),
    ]) {
      const bytes = await readFile(path),
        name = basename(path);
      await writeFile(`${target}/${name}`, bytes);
      files.push({
        file: `${character}/${name}`,
        bytes: bytes.length,
        sha256: sha(bytes),
      });
    }
  }
  for (const name of ["pixel-verification.json", "independent.json"])
    await cp(`${input}/${character}/${name}`, `${target}/${name}`);
  const archives = [];
  for (const name of [
    "original.wardrobe.zip",
    "side.wardrobe.zip",
    "both-views.zip",
    "original-clothing-only.character.zip",
    "side-clothing-only.character.zip",
  ]) {
    const bytes = await readFile(`${input}/${character}/${name}`);
    archives.push({ file: name, bytes: bytes.length, sha256: sha(bytes) });
  }
  await writeFile(
    `${target}/editable-archive-checksums.json`,
    JSON.stringify(
      {
        note: "Actual editable exports and clothing-only controls are tested and reproducible through the UI. Their source-bearing duplicate ZIPs are not copied into this review.",
        archives,
      },
      null,
      2,
    ) + "\n",
  );
  const roundtrip = `${output}/${character}-roundtrip`;
  await mkdir(roundtrip, { recursive: true });
  for (const view of ["original", "side"])
    for (const suffix of [
      "before-appearance",
      "failed-appearance",
      "mixed",
      "reopened",
      "reverse-mixed",
      "reverse-reopened",
      "legacy-reopened",
    ])
      await cp(
        `${input}/${character}-roundtrip/${view}-${suffix}.png`,
        `${roundtrip}/${view}-${suffix}.png`,
      );
  for (const name of [
    "side-copper.png",
    "side-espresso-restored.png",
    "after-rejected-project.png",
    "mobile.png",
    "roundtrip.json",
  ])
    await cp(`${input}/${character}-roundtrip/${name}`, `${roundtrip}/${name}`);
}

const present = String.raw`
import hashlib,io,json,math,sys,zipfile
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import numpy as np
root=Path(sys.argv[1]);inputs=Path(sys.argv[2]);characters=json.loads(sys.argv[3]);matte=(238,233,223,255)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',16);small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
def decode(path):
 z=zipfile.ZipFile(path);assert z.testzip() is None;m=json.loads(z.read('manifest.json'));c=json.loads(z.read('character.json'))
 pages=[Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA') for p in [m['spritesheet']]+m.get('additionalSheets',[])];frames={f['id']:f for f in m['frames']}
 def frame(fid):
  f=frames[fid];return pages[f.get('page',0)].crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height']))
 return m,c,frame
def rgb(im):
 base=Image.new('RGBA',im.size,matte);base.alpha_composite(im);return base.convert('RGB')
def save_gif(frames,durations,path,loop):
 sample=Image.new('RGB',(160*len(frames),180))
 for i,im in enumerate(frames):sample.paste(im.resize((160,180)),(160*i,0))
 palette=sample.quantize(colors=256,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
 indexed=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in frames]
 indexed[0].save(path,save_all=True,append_images=indexed[1:],duration=durations,disposal=2,optimize=False,**({'loop':0} if loop else {}))
def durations(clip):return [(math.floor((i+1)*100/clip['fps']+.5)-math.floor(i*100/clip['fps']+.5))*10 for i in range(len(clip['frames']))]
provenance=[]
for character in characters:
 rows=json.loads((inputs/character/'exports.json').read_text())
 for row in rows:
  view=row['view'];project=zipfile.ZipFile(row['project']);sm,sc,source=decode(io.BytesIO(project.read('source.character.zip')))
  bm,bc,clothes=decode(row['baseline']['pack']);fm,fc,complete=decode(row['pack']);pm,pc,previous=decode(row['previousPack'])
  am=json.loads(zipfile.ZipFile(io.BytesIO(project.read('appearance.zip'))).read('manifest.json'));poses={p['frameId']:p for p in am['poses']};pad=am['padding'];W,H=fm['spritesheet']['frameWidth'],fm['spritesheet']['frameHeight']
  assert sm['animations']==bm['animations']==fm['animations']==pm['animations']
  def aligned(fn,fid):
   im=Image.new('RGBA',(W,H));im.paste(fn(fid),(pad['left'],pad['top']));return im
  for action in ['walk','run','jump']:
   clip=fm['animations'][action];dw,dh=W//2,H//2;sequence=[]
   for fid in clip['frames']:
    canvas=Image.new('RGB',(dw*3+32,dh+72),matte[:3]);draw=ImageDraw.Draw(canvas);draw.text((8,8),character.title()+' / '+view+' / '+action+' / native ID '+str(fid),font=font,fill=(45,60,50))
    for col,(name,fn) in enumerate([('Original source',lambda i:aligned(source,i)),('Clothing only',lambda i:aligned(clothes,i)),('Complete look',complete)]):
     draw.text((8+col*(dw+8),36),name,font=small,fill=(55,65,55));canvas.paste(rgb(fn(fid)).resize((dw,dh),Image.Resampling.BOX),(8+col*(dw+8),64))
    sequence.append(canvas)
   save_gif(sequence,durations(clip),root/f'{character}-{view}-{action}-comparison.gif',clip['loop'])
  # Native artwork is not rescaled in these contact sheets. Labels identify
  # native frame IDs, not raw video indices.
  clips=fm['animations'];chosen=[]
  for action in ['idle','walk','run','jump']:
   ids=clips[action]['frames'];positions=[0,len(ids)//2] if action in ['idle','walk'] else [len(ids)//4,3*len(ids)//4]
   for pos in positions:chosen.append((action,pos,ids[pos]))
  sheet=Image.new('RGB',(W*4,H*2+72),matte[:3]);draw=ImageDraw.Draw(sheet)
  for n,(action,pos,fid) in enumerate(chosen):
   x=(n%4)*W;y=(n//4)*(H+36);draw.text((x+8,y+8),action+' / native ID '+str(fid),font=font,fill=(50,60,50));sheet.paste(rgb(complete(fid)),(x,y+32))
  sheet.save(root/f'{character}-{view}-keyframes-native.png')
  details=[]
  for action,pos in [('run',3),('walk',len(clips['walk']['frames'])//2),('jump',len(clips['jump']['frames'])//2)]:
   fid=clips[action]['frames'][pos];p=poses[fid];r=p['hairBounds'];head=p['headBounds']
   left=max(0,int(min(r['x'],head['x'])+pad['left']-12));top=max(0,int(min(r['y'],head['y'])+pad['top']-12))
   right=min(W,int(max(r['x']+r['width'],head['x']+head['width'])+pad['left']+12));bottom=min(H,int(head['y']+head['height']+pad['top']+80))
   box=(left,top,right,bottom);cropw,croph=(right-left)*2,(bottom-top)*2
   canvas=Image.new('RGB',(cropw*3+32,croph+64),matte[:3]);draw=ImageDraw.Draw(canvas)
   draw.text((8,6),character.title()+' / '+view+' / '+action+' / native ID '+str(fid)+' / 2x nearest',font=font,fill=(45,60,50))
   for col,(name,fn) in enumerate([('Original source',lambda i:aligned(source,i)),('Clothing only',lambda i:aligned(clothes,i)),('Complete look',complete)]):
    draw.text((8+col*(cropw+8),30),name,font=small,fill=(55,65,55));canvas.paste(rgb(fn(fid)).crop(box).resize((cropw,croph),Image.Resampling.NEAREST),(8+col*(cropw+8),56))
   path=f'{character}-{view}-{action}-head-neck-2x.png';canvas.save(root/path);details.append({'file':path,'frameId':fid,'crop':box,'scale':2})
  # Preserve precise visual limitations and one source-only false alarm.
  # These are native crops: no generative retouching or geometric distortion.
  diagnostic=[]
  sample={('male','side'):82,('female','original'):90,('female','side'):97}.get((character,view))
  if sample is not None:
   anchor=poses[sample]['anchors']['headCenter'];size=600 if view=='original' else 400
   cx,cy=anchor['x'],anchor['y'];box=(round(cx-size/2),round(cy-size*.2),round(cx+size/2),round(cy+size*.8))
   canvas=Image.new('RGB',(size*3,size+36),matte[:3]);draw=ImageDraw.Draw(canvas)
   for n,(label,fn) in enumerate([('Raw source',source),('Clothing only',clothes),('Complete look',complete)]):
    cropbox=box if n<2 else (box[0]+pad['left'],box[1]+pad['top'],box[2]+pad['left'],box[3]+pad['top'])
    canvas.paste(rgb(fn(sample)).crop(cropbox),(n*size,32));draw.text((n*size+8,8),character+' '+view+' / native ID '+str(sample)+' / '+label,font=font,fill=(45,60,50))
   name=f'{character}-{view}-native{sample}-source-clothes-look.png';canvas.save(root/name)
   diagnostic.append({'file':name,'frameId':sample,'crop':box,'scale':1,'finding':'source arm-body gap, not a garment hole' if (character,view)==('female','original') else 'existing garment boundary defect unchanged by appearance'})
  # Compare current bare-headed garment export with the exact PR58 package.
  changes=[]
  for f in bm['frames']:
   fid=f['id'];a=np.array(previous(fid));b=np.array(clothes(fid));diff=np.any(a!=b,axis=2)
   if diff.any():
    yy,xx=np.where(diff);changes.append({'frameId':fid,'pixels':int(diff.sum()),'bounds':[int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)]})
  if character=='female' and view=='side':
   assert {f['frameId'] for f in changes}=={32,92}
   crops={32:(250,540,330,620),92:(215,345,300,430)};blocks=[]
   for fid,box in crops.items():
    a,b,c,d=box;cw,ch=(c-a)*2,(d-b)*2;block=Image.new('RGB',(cw*4+40,ch+64),matte[:3]);draw=ImageDraw.Draw(block)
    draw.text((8,8),'Female side / native ID '+str(fid)+' / 2x nearest',font=font,fill=(45,60,50))
    for col,(label,fn) in enumerate([('Source',source),('PR58 clothes',previous),('Repaired clothes',clothes),('Complete look',complete)]):
     draw.text((8+col*(cw+8),32),label,font=small,fill=(55,65,55));block.paste(rgb(fn(fid)).crop(box).resize((cw,ch),Image.Resampling.NEAREST),(8+col*(cw+8),56))
    blocks.append(block)
   repair=Image.new('RGB',(max(b.width for b in blocks),sum(b.height for b in blocks)),matte[:3]);offset=0
   for block in blocks:repair.paste(block,(0,offset));offset+=block.height
   repair.save(root/'female-side-cloth-repairs-2x.png')
  else:assert not changes,'Unreviewed garment changes relative to PR58'
  provenance.append({'character':character,'view':view,'currentPack':character+'/'+Path(row['pack']).name,'currentPackSha256':hashlib.sha256(Path(row['pack']).read_bytes()).hexdigest(),'projectSha256':hashlib.sha256(Path(row['project']).read_bytes()).hexdigest(),'appearanceSha256':hashlib.sha256(project.read('appearance.zip')).hexdigest(),'sourceSha256':hashlib.sha256(project.read('source.character.zip')).hexdigest(),'previousClothingPack':row['previousPack'],'previousClothingPackSha256':hashlib.sha256(Path(row['previousPack']).read_bytes()).hexdigest(),'currentClothingOnlyPackSha256':hashlib.sha256(Path(row['baseline']['pack']).read_bytes()).hexdigest(),'clothingChangesVersusPR58':changes,'nativeTimingPreserved':True,'presentationPaddingOnly':pad,'sourceVideoFrameReferences':sc['derivation']['frames'],'details':details,'diagnostics':diagnostic})
 # Match two source clocks only on the display timeline; never claim equal
 # native phase or forge a shared looping clip from different source footage.
 runrows=[]
 for row in rows:
  m,c,fn=decode(row['pack']);runrows.append((row['view'],m,fn))
 times=sorted({0,3000}|{10*math.floor(i*100/m['animations']['run']['fps']+.5) for _,m,_ in runrows for i in range(int(3*m['animations']['run']['fps'])+1)})
 times=[t for t in times if 0<=t<=3000];panels=[]
 widths=[m['spritesheet']['frameWidth']//2 for _,m,_ in runrows];height=max(m['spritesheet']['frameHeight']//2 for _,m,_ in runrows)
 for time,nexttime in zip(times,times[1:]):
  canvas=Image.new('RGB',(sum(widths)+24,height+56),matte[:3]);draw=ImageDraw.Draw(canvas);x=8
  for i,(view,m,fn) in enumerate(runrows):
   clip=m['animations']['run'];position=int((time+nexttime)*.5*clip['fps']/1000)%len(clip['frames']);im=rgb(fn(clip['frames'][position]));draw.text((x,8),character.title()+' / '+view,font=font,fill=(45,60,50));im=im.resize((im.width//2,im.height//2),Image.Resampling.BOX);canvas.paste(im,(x,48+height-im.height));x+=widths[i]+8
  panels.append(canvas)
 save_gif(panels,[b-a for a,b in zip(times,times[1:])],root/f'{character}-two-views-run.gif',False)
(root/'comparison-provenance.json').write_text(json.dumps({'format':'gathria-complete-looks-actual-export-review','version':1,'note':'All panels come from actual UI-exported projects and CharacterPacks. Head detail is integer nearest-neighbor enlargement; comparison GIFs share a presentation palette and do not replace the raw application GIFs. Native frame IDs are not original video indices.','results':provenance},indent=2)+'\n')
print('Built complete-look review from actual UI exports.')
`;
execFileSync(
  "python",
  ["-c", present, output, input, JSON.stringify(characters)],
  { stdio: "inherit", timeout: 240_000 },
);
await writeFile(
  `${output}/actual-downloads.json`,
  JSON.stringify(
    { format: "gathria-dual-looks-actual-downloads", version: 1, files },
    null,
    2,
  ) + "\n",
);
const integrity = String.raw`
import hashlib,json,sys,zipfile
from pathlib import Path
from PIL import Image
root=Path(sys.argv[1]);files=[]
for p in sorted(root.rglob('*')):
 if p.suffix.lower() not in ['.png','.gif','.zip']:continue
 raw=p.read_bytes();entry={'file':str(p.relative_to(root)),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
 if p.suffix=='.zip':
  z=zipfile.ZipFile(p);assert z.testzip() is None;entry['members']=len(z.namelist())
  for name in z.namelist():
   if name.endswith('.json'):json.loads(z.read(name))
 else:
  im=Image.open(p);entry.update(width=im.width,height=im.height,frames=im.n_frames);dur=0
  for i in range(im.n_frames):im.seek(i);im.load();dur+=im.info.get('duration',0)
  if p.suffix=='.gif':entry.update(durationMs=dur,loop=im.info.get('loop'))
 files.append(entry)
(root/'checks').mkdir(exist_ok=True)
(root/'checks/review-integrity.json').write_text(json.dumps({'format':'gathria-dual-looks-review-integrity','version':1,'passed':True,'files':files},indent=2)+'\n')
print('Decoded',len(files),'review media; GIFs',sum(f['file'].endswith('.gif') for f in files),'ZIPs',sum(f['file'].endswith('.zip') for f in files))
`;
execFileSync("python", ["-c", integrity, output], {
  stdio: "inherit",
  timeout: 180_000,
});
