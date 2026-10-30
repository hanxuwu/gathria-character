// Present only actual UI-exported files; review transforms never author clothes.
// Run after tests/e2e/dual-view-daily-outfits.spec.ts.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const input = resolve(process.argv[2] ?? "/tmp/dual-tailored");
const output = resolve("docs/dual-tailored/review");
const characters = process.argv.includes("--male-only")
  ? ["male"]
  : ["male", "female"];
const beforeMaleArgument = process.argv.find((arg) =>
  arg.startsWith("--before-male="),
);
const beforeMale = beforeMaleArgument
  ? resolve(beforeMaleArgument.slice("--before-male=".length))
  : null;
const beforeFemaleArgument = process.argv.find((arg) =>
  arg.startsWith("--before-female="),
);
const beforeFemale = beforeFemaleArgument
  ? resolve(beforeFemaleArgument.slice("--before-female=".length))
  : null;
const records = [];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
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
      ...Object.values(row.baseline.gifs),
      `${input}/${character}/${row.view}-workspace.png`,
      `${input}/${character}/${row.view}-independent.png`,
      ...Object.values(row.gifs).flatMap((x) => Object.values(x)),
    ]) {
      const name = path.split("/").at(-1);
      const bytes = await readFile(path);
      await writeFile(`${target}/${name}`, bytes);
      records.push({
        file: `${character}/${name}`,
        bytes: bytes.length,
        sha256: sha(bytes),
      });
    }
  }
  for (const file of ["pixel-verification.json", "independent.json"])
    await cp(`${input}/${character}/${file}`, `${target}/${file}`);
  const archives = [];
  for (const name of [
    "original.wardrobe.zip",
    "side.wardrobe.zip",
    "both-views.zip",
  ]) {
    const bytes = await readFile(`${input}/${character}/${name}`);
    archives.push({ file: name, bytes: bytes.length, sha256: sha(bytes) });
  }
  await writeFile(
    `${target}/editable-archive-checksums.json`,
    JSON.stringify(
      {
        note: "Actual tested editable exports are reproduced by the browser suite. Source-bearing project ZIPs are not duplicated here.",
        archives,
      },
      null,
      2,
    ) + "\n",
  );
  const mixed = `${output}/${character}-roundtrip`;
  await mkdir(mixed, { recursive: true });
  for (const view of ["original", "side"])
    for (const suffix of [
      "cotton",
      "failed-load",
      "new-top-source-bottom",
      "source-top-new-bottom",
      "mixed-reopened",
      "reverse-mixed-reopened",
      "cotton-reopened",
    ])
      await cp(
        `${input}/${character}-roundtrip/${view}-${suffix}.png`,
        `${mixed}/${view}-${suffix}.png`,
      );
  for (const name of [
    "after-rejected-input.png",
    "after-unsupported-cotton.png",
    "mobile.png",
    "roundtrip.json",
  ])
    await cp(`${input}/${character}-roundtrip/${name}`, `${mixed}/${name}`);
}

for (const [character, folder, detail] of [
  ["male", beforeMale, "cuff"],
  ["female", beforeFemale, "hem"],
]) {
  if (!folder) continue;
  const target = `${output}/${character}-before-${detail}`;
  await mkdir(target, { recursive: true });
  for (const name of [
    "original.character.zip",
    "original-run-right.gif",
    "original-run-left.gif",
    "original-run-right.png",
    "original-run-left.png",
    ...(character === "female"
      ? ["original-walk-right.gif", "original-walk-left.gif"]
      : []),
  ]) {
    const bytes = await readFile(`${folder}/${name}`);
    await writeFile(`${target}/${name}`, bytes);
    records.push({
      file: `${character}-before-${detail}/${name}`,
      bytes: bytes.length,
      sha256: sha(bytes),
    });
  }
}

const present = String.raw`
import io,json,zipfile,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
root=Path(sys.argv[1]);inputs=Path(sys.argv[2]);matte=(238,233,223,255)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',16)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
def gif_frames(path):
 im=Image.open(path);frames=[];durations=[]
 for n in range(im.n_frames):
  im.seek(n);frames.append(im.convert('RGB').copy());durations.append(im.info['duration'])
 return frames,durations
def save_review(frames,durations,path,loop):
 sample=Image.new('RGB',(max(1,len(frames))*160,180))
 for n,im in enumerate(frames):sample.paste(im.resize((160,180)),(n*160,0))
 palette=sample.quantize(colors=256,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
 indexed=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in frames]
 opts={'loop':0} if loop else {}
 indexed[0].save(path,save_all=True,append_images=indexed[1:],duration=durations,optimize=False,disposal=2,**opts)
def decode_pack(file):
 z=zipfile.ZipFile(file);assert z.testzip() is None
 m=json.loads(z.read('manifest.json'))
 pages=[Image.open(io.BytesIO(z.read(s['file']))).convert('RGBA') for s in [m['spritesheet']]+m.get('additionalSheets',[])]
 by_id={f['id']:f for f in m['frames']}
 def frame(fid):
  f=by_id[fid];return pages[f.get('page',0)].crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height']))
 return m,frame
def rgb(image):
 bg=Image.new('RGBA',image.size,matte);bg.alpha_composite(image);return bg.convert('RGB')
for character in json.loads(sys.argv[3]):
 rows=json.loads((inputs/character/'exports.json').read_text())
 for row in rows:
  view=row['view'];m,dressed=decode_pack(row['pack']);project=zipfile.ZipFile(row['project']);sm,source=decode_pack(io.BytesIO(project.read('source.character.zip')))
  assert sm['animations']==m['animations']
  reg=json.loads(project.read('registration.json'));points={f['frameId']:f['points'] for f in reg['frames']}
  for action in ['run','jump']:
   before,bd=gif_frames(row['baseline']['gifs'][action]);after,ad=gif_frames(row['gifs'][action]['right']);assert bd==ad and len(before)==len(after)
   w,h=before[0].size;frames=[]
   for i,fid in enumerate(m['animations'][action]['frames']):
    # Both panels start from lossless actual exported project/pack pixels.
    # One shared presentation palette keeps unchanged face pixels equivalent;
    # raw application GIFs remain separately available without this transform.
    a=rgb(source(fid)).resize((w,h),Image.Resampling.BOX)
    b=rgb(dressed(fid)).resize((w,h),Image.Resampling.BOX)
    c=Image.new('RGB',(2*w+24,h+64),matte[:3]);draw=ImageDraw.Draw(c)
    draw.text((8,7),character.title()+' / '+view+' / '+action+' / frame '+str(i)+' / native 1/2',font=font,fill=(50,60,50))
    draw.text((8,31),'Original source',font=small,fill=(70,70,60));draw.text((w+16,31),'Tailored outfit',font=small,fill=(70,70,60))
    c.paste(a,(8,56));c.paste(b,(w+16,56));frames.append(c)
   save_review(frames,bd,root/(character+'-'+view+'-'+action+'-source-comparison.gif'),m['animations'][action]['loop'])
  # Native lossless before/after drawings, four difficult poses of each action.
  w,h=m['spritesheet']['frameWidth'],m['spritesheet']['frameHeight']
  for action in ['run','jump']:
   clip=m['animations'][action]['frames'];positions=[0,len(clip)//3,2*len(clip)//3,len(clip)-1]
   sheet=Image.new('RGB',(4*w,2*(h+48)),matte[:3]);draw=ImageDraw.Draw(sheet)
   for column,position in enumerate(positions):
    fid=clip[position]
    for rowidx,fn in enumerate([source,dressed]):
     x=column*w;y=rowidx*(h+48)
     draw.text((x+10,y+10),('Original' if rowidx==0 else 'Tailored')+' / '+action+' position '+str(position)+' / native ID '+str(fid),font=font,fill=(50,60,50))
     sheet.paste(rgb(fn(fid)),(x,y+48))
   sheet.save(root/(character+'-'+view+'-'+action+'-native-keyframes.png'))
  # Inspect cloth joins at integer 2x; rectangle comes from recorded native anchors.
  cases=[('run',len(m['animations']['run']['frames'])//2,['neck','nearShoulder','farShoulder','nearElbow','nearWrist','waistLeft','waistRight']),('jump',len(m['animations']['jump']['frames'])//2,['waistLeft','waistRight','nearHip','farHip','nearKnee','farKnee']),('jump',len(m['animations']['jump']['frames'])-1,['waistLeft','waistRight','nearKnee','farKnee','nearAnkle','farAnkle'])]
  strips=[]
  for action,position,keys in cases:
   fid=m['animations'][action]['frames'][position];p=[points[fid][key] for key in keys]
   box=(max(0,int(min(v['x'] for v in p))-24),max(0,int(min(v['y'] for v in p))-24),min(w,int(max(v['x'] for v in p))+25),min(h,int(max(v['y'] for v in p))+25))
   a=rgb(source(fid).crop(box));b=rgb(dressed(fid).crop(box));a=a.resize((a.width*2,a.height*2),Image.Resampling.NEAREST);b=b.resize(a.size,Image.Resampling.NEAREST)
   strip=Image.new('RGB',(2*a.width+24,a.height+48),matte[:3]);draw=ImageDraw.Draw(strip)
   draw.text((8,8),action+' / position '+str(position)+' / native crop 2x / original | tailored',font=font,fill=(50,60,50));strip.paste(a,(8,48));strip.paste(b,(a.width+16,48));strips.append(strip)
  detail=Image.new('RGB',(max(s.width for s in strips),sum(s.height for s in strips)+16*(len(strips)-1)),matte[:3]);y=0
  for strip in strips:detail.paste(strip,(0,y));y+=strip.height+16
  detail.save(root/(character+'-'+view+'-connections-2x.png'))
 # Independent native clocks in a simple three-second source-view comparison.
 a,ad=gif_frames(root/character/'original-run-right.gif');b,bd=gif_frames(root/character/'side-run-right.gif');banks=[a,b];edges=[]
 for ds in [ad,bd]:
  edge=[0]
  for t in ds:edge.append(edge[-1]+t)
  edges.append(edge)
 events={0,3000}
 for edge in edges:
  for start in range(0,3000,edge[-1]):events.update(start+t for t in edge if start+t<3000)
 events=sorted(events);frames=[]
 for t in events[:-1]:
  c=Image.new('RGB',(632,600),matte[:3]);d=ImageDraw.Draw(c)
  d.text((10,8),character.title()+' / independent source clocks / 3 sec',font=font,fill=(50,60,50))
  d.text((10,34),'Original / native 704 x 1056 / half-size GIF',font=small,fill=(70,70,60));d.text((370,34),'Side / 512 x 768 / half',font=small,fill=(70,70,60))
  for column in range(2):
   e=edges[column];clock=t%e[-1];position=next(n for n in range(len(e)-1) if e[n]<=clock<e[n+1]);c.paste(banks[column][position],(8 if column==0 else 368,56 if column==0 else 200))
  frames.append(c)
 save_review(frames,[b-a for a,b in zip(events,events[1:])],root/(character+'-views-run-right.gif'),False)
for character,before_input,detail_name,box in [('male',sys.argv[4],'cuff',(190,690,450,930)),('female',sys.argv[5],'hem',(210,700,500,900))]:
 if not before_input:continue
 before_dir=Path(before_input);before_rows=json.loads((before_dir/'exports.json').read_text());after_rows=json.loads((inputs/character/'exports.json').read_text())
 old=next(r for r in before_rows if r['view']=='original');new=next(r for r in after_rows if r['view']=='original')
 bm,before=decode_pack(old['pack']);am,after=decode_pack(new['pack'])
 assert bm['frames']==am['frames'] and bm['animations']==am['animations']
 assert old['baseline']['sourceSha256']==new['baseline']['sourceSha256']
 w,h=am['spritesheet']['frameWidth'],am['spritesheet']['frameHeight']
 for action_name in (['walk','run'] if character=='female' else ['run']):
  action=am['animations'][action_name];frames=[]
  _,durations=gif_frames(new['gifs'][action_name]['right'])
  _,old_durations=gif_frames(old['gifs'][action_name]['right']);assert durations==old_durations
  for i,fid in enumerate(action['frames']):
   panel=Image.new('RGB',(w+24,h//2+64),matte[:3]);draw=ImageDraw.Draw(panel)
   draw.text((8,8),character.title()+' original / '+detail_name+' repair / '+action_name+' position '+str(i)+' / native ID '+str(fid),font=font,fill=(50,60,50))
   draw.text((8,32),'Before repair',font=small,fill=(70,70,60));draw.text((w//2+16,32),'After repair',font=small,fill=(70,70,60))
   panel.paste(rgb(before(fid)).resize((w//2,h//2),Image.Resampling.BOX),(8,56))
   panel.paste(rgb(after(fid)).resize((w//2,h//2),Image.Resampling.BOX),(w//2+16,56));frames.append(panel)
  save_review(frames,durations,root/(character+'-original-'+action_name+'-'+detail_name+'-before-after.gif'),action['loop'])
 fid=old['png']['frameId'];assert fid==new['png']['frameId'] and fid in am['animations']['run']['frames']
 a=rgb(before(fid).crop(box));b=rgb(after(fid).crop(box))
 a=a.resize((a.width*2,a.height*2),Image.Resampling.NEAREST);b=b.resize(a.size,Image.Resampling.NEAREST)
 detail=Image.new('RGB',(2*a.width+24,a.height+64),matte[:3]);draw=ImageDraw.Draw(detail)
 draw.text((8,8),character.title()+' original / same native frame '+str(fid)+' / native '+detail_name+' crop 2x',font=font,fill=(50,60,50))
 draw.text((8,32),'Before repair',font=small,fill=(70,70,60));draw.text((a.width+16,32),'After repair',font=small,fill=(70,70,60))
 detail.paste(a,(8,56));detail.paste(b,(a.width+16,56));detail.save(root/(character+'-original-'+detail_name+'-before-after-2x.png'))
 import hashlib,numpy as np
 authoring_audit=None;authoring_audit_sha=None
 if character=='female':
  audit_path=Path('artwork/dual-tailored/female/prepared/guard-review/final-repair-audit.json')
  audit_bytes=audit_path.read_bytes();authoring_audit=json.loads(audit_bytes);authoring_audit_sha=hashlib.sha256(audit_bytes).hexdigest()
  assert authoring_audit['sameSourceAnchorPointsTiming']
  assert authoring_audit['registrationOnlyProtectedPolygonsChanged']
  assert set(authoring_audit['changedSeedCompositeFrames'])=={'top','bottom'}
  assert set(authoring_audit['changedSeedOwnershipFrames'])=={'top','bottom'}
  assert all(isinstance(ids,list) and all(isinstance(fid,int) for fid in ids) for group in ['changedSeedCompositeFrames','changedSeedOwnershipFrames'] for ids in authoring_audit[group].values())
  reviewed_top_ids={41,43,44,45,46}
  reviewed_bottom_ids={24,25,26,27,28,30,31,32,33,34,35,36,37,38,39,40,41,43,44,45,46,47,48,49,50,54}
  for group in ['changedSeedCompositeFrames','changedSeedOwnershipFrames']:
   assert set(authoring_audit[group]['top'])<=reviewed_top_ids,'Top repair escaped five reviewed hand poses'
   assert set(authoring_audit[group]['bottom'])<=reviewed_bottom_ids,'Skirt repair escaped 26 reviewed native poses'
  for name,digest in authoring_audit['sha256'].items():
   assert hashlib.sha256((Path('docs/dual-tailored/assets/female')/name).read_bytes()).hexdigest()==digest,'Authoring audit does not bind current seed/registration'
  assert hashlib.sha256(zipfile.ZipFile(new['project']).read('registration.json')).hexdigest()==authoring_audit['sha256']['original-tailored-v1.registration.json']
  expected=set()
  for key in ['changedSeedCompositeFrames','changedSeedOwnershipFrames']:
   for ids in authoring_audit.get(key,{}).values():expected.update(ids)
  reviewed_ids=sorted(expected)
 else:reviewed_ids=[54]
 changed=[]
 for f in am['frames']:
  difference=np.any(np.array(before(f['id']))!=np.array(after(f['id'])),axis=2)
  if difference.any():
   yy,xx=np.where(difference)
   changed.append({'frameId':f['id'],'changedPixels':int(difference.sum()),'bounds':[int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)]})
 assert changed and {r['frameId'] for r in changed}<=set(reviewed_ids),'Unexpected repair changes outside reviewed native poses'
 if character=='female':
  visual_review_ids=[36,37,38,39,47,48,53,54]
  sheet=Image.new('RGB',(len(visual_review_ids)*w,2*(h+48)),matte[:3]);draw=ImageDraw.Draw(sheet)
  for column,source_id in enumerate(visual_review_ids):
   for rowidx,fn in enumerate([before,after]):
    x=column*w;y=rowidx*(h+48)
    draw.text((x+10,y+10),('Before' if rowidx==0 else 'After')+' / skirt repair / native ID '+str(source_id)+' / native 1x',font=font,fill=(50,60,50))
    sheet.paste(rgb(fn(source_id)),(x,y+48))
  sheet.save(root/'female-original-hem-review-poses-native.png')
  source_project=zipfile.ZipFile(new['project'])
  _,original_source=decode_pack(io.BytesIO(source_project.read('source.character.zip')))
  wrist_id=38;wrist_box=(240,680,400,820);panels=[]
  for title,fn in [('Original source',original_source),('Before repairs',before),('After repairs',after)]:
   crop=rgb(fn(wrist_id).crop(wrist_box));crop=crop.resize((crop.width*2,crop.height*2),Image.Resampling.NEAREST)
   panel=Image.new('RGB',(crop.width,crop.height+56),matte[:3]);draw=ImageDraw.Draw(panel)
   draw.text((8,8),title,font=font,fill=(50,60,50));draw.text((8,32),'Native ID 38 / wrist / 2x',font=small,fill=(70,70,60));panel.paste(crop,(0,56));panels.append(panel)
  wrist_sheet=Image.new('RGB',(sum(p.width for p in panels)+16*(len(panels)-1),panels[0].height),matte[:3]);x=0
  for panel in panels:wrist_sheet.paste(panel,(x,0));x+=panel.width+16
  wrist_sheet.save(root/'female-original-wrist38-source-before-after-2x.png')
  hand_review_bytes=Path('artwork/dual-tailored/female/source/hand-foreground-v1.json').read_bytes()
  assert hashlib.sha256(hand_review_bytes).hexdigest()==authoring_audit['handForegroundReviewSha256']
  hand_reviews=json.loads(hand_review_bytes)['foregroundHand'];hand_ids=sorted(map(int,hand_reviews))
  for first in range(0,len(hand_ids),4):
   rows=[]
   for hand_id in hand_ids[first:first+4]:
    points=np.array(hand_reviews[str(hand_id)]);lo=points.min(axis=0).astype(int)-16;hi=points.max(axis=0).astype(int)+17
    hand_box=(max(0,int(lo[0])),max(0,int(lo[1])),min(w,int(hi[0])),min(h,int(hi[1])))
    panels=[]
    for title,fn in [('Original source',original_source),('Before repairs',before),('After repairs',after)]:
     image=rgb(fn(hand_id).crop(hand_box));image=image.resize((image.width*2,image.height*2),Image.Resampling.NEAREST)
     panel=Image.new('RGB',(image.width,image.height+48),matte[:3]);draw=ImageDraw.Draw(panel)
     draw.text((8,8),str(hand_id)+' / '+title+' / 2x',font=small,fill=(50,60,50));panel.paste(image,(0,40));panels.append(panel)
    rows.append(panels)
   cw=max(p.width for row in rows for p in row);heights=[max(p.height for p in row) for row in rows]
   sheet=Image.new('RGB',(cw*3+32,sum(heights)+16*(len(rows)-1)),matte[:3]);y=0
   for panels,rh in zip(rows,heights):
    for column,panel in enumerate(panels):sheet.paste(panel,(column*(cw+16),y))
    y+=rh+16
   sheet.save(root/('female-original-hands-source-before-after-2x-'+str(first//4+1)+'.png'))
 source_derivation=json.loads(zipfile.ZipFile(new['pack']).read('character.json'))['derivation']['frames']
 source_references=[f for f in source_derivation if f['frameId'] in reviewed_ids]
 record={'authoredPerSlotChanges':None if authoring_audit is None else {'rgba':authoring_audit['changedSeedCompositeFrames'],'ownership':authoring_audit['changedSeedOwnershipFrames']},'beforePackFile':character+'-before-'+detail_name+'/original.character.zip','afterPackFile':character+'/original.character.zip','authoringAuditSha256':authoring_audit_sha,'videoSourceReferences':source_references,'allowedPixelChangeNativeIds':reviewed_ids,'changedFrames':changed,'unchangedFrameCount':len(am['frames'])-len(changed),'nativeFrameId':fid,'sameSourceSha256':old['baseline']['sourceSha256'],'sameFramesAndTiming':True,'beforePackSha256':hashlib.sha256(Path(old['pack']).read_bytes()).hexdigest(),'afterPackSha256':hashlib.sha256(Path(new['pack']).read_bytes()).hexdigest(),'crop':list(box),'scale':2,'note':'Both inputs are actual UI-exported CharacterPacks; no illustration or clothing edits occur in this presentation. Frame IDs are native pack IDs, not raw video indices; videoSourceReferences records their mapping.'}
 (root/(character+'-'+detail_name+'-comparison-provenance.json')).write_text(json.dumps(record,indent=2)+'\n')
print('Built review comparisons from actual UI exports; native packs are unchanged.')
`;
process.stdout.write(
  execFileSync(
    "python",
    [
      "-c",
      present,
      output,
      input,
      JSON.stringify(characters),
      beforeMale ?? "",
      beforeFemale ?? "",
    ],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    },
  ),
);
await writeFile(
  `${output}/files.json`,
  JSON.stringify(
    {
      format: "gathria-dual-tailored-review-files",
      version: 1,
      notes:
        "Raw files are actual UI downloads. Derived source/outfit comparisons use exported native RGBA at half size, the same source frame and GIF timing, and one shared presentation palette. Cross-view comparisons use independent clocks and stop after three seconds. Native PNG sheets and 2x nearest-neighbor crops come from exported CharacterPacks; no source or clothing pixels are repainted.",
      files: records,
    },
    null,
    2,
  ) + "\n",
);

// Decode all saved review media, including before-repair packs, independently
// of the export implementation. Preserve this check with its evidence builder.
const integrity = String.raw`
import hashlib,io,json,sys,zipfile
from pathlib import Path
from PIL import Image
root=Path(sys.argv[1]);files=[]
for path in sorted(root.rglob('*')):
 if path.suffix.lower() not in ('.png','.gif','.zip'):continue
 raw=path.read_bytes();record={'file':str(path.relative_to(root)),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
 if path.suffix=='.zip':
  with zipfile.ZipFile(io.BytesIO(raw)) as archive:
   assert archive.testzip() is None,str(path)
   for name in archive.namelist():
    if name.endswith('.json'):json.loads(archive.read(name))
    elif name.endswith('.png'):
     picture=Image.open(io.BytesIO(archive.read(name)));picture.load();assert picture.mode=='RGBA',name
   record['entries']=len(archive.namelist())
 else:
  picture=Image.open(io.BytesIO(raw));record.update(width=picture.width,height=picture.height,frames=picture.n_frames)
  duration=0;loop=picture.info.get('loop')
  for frame in range(picture.n_frames):
   picture.seek(frame);picture.load();duration+=picture.info.get('duration',0)
  if path.suffix=='.gif':
   assert duration>0,str(path)
   record.update(durationMs=duration,loop=loop)
 files.append(record)
report={'format':'gathria-dual-tailored-review-integrity','version':1,'passed':True,'files':files}
(root/'checks').mkdir(exist_ok=True)
(root/'checks/review-integrity.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'reviewFilesDecoded':len(files),'gifFiles':sum(r['file'].endswith('.gif') for r in files),'zipFiles':sum(r['file'].endswith('.zip') for r in files),'passed':True}))
`;
process.stdout.write(
  execFileSync("python", ["-c", integrity, output], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  }),
);
