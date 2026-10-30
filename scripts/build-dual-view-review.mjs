// Build review pages from actual UI exports produced by dual-view-wardrobe.spec.ts.
// This does not render, retime or alter the source CharacterPacks.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const input = resolve(process.argv[2] ?? "/tmp/dual-view-wardrobe");
const output = resolve("docs/dual-view-wardrobe/review");
const records = [];
for (const character of ["male", "female"]) {
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
        sha256: createHash("sha256").update(bytes).digest("hex"),
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
    archives.push({
      file: name,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  await writeFile(
    `${target}/editable-archive-checksums.json`,
    JSON.stringify(
      {
        note: "Actual tested editable exports retained in local test output; reproduce with browser suite. Not duplicated in this review directory.",
        archives,
      },
      null,
      2,
    ) + "\n",
  );
}
await mkdir(`${output}/roundtrip`, { recursive: true });
for (const name of [
  "original-mixed.png",
  "side-mixed.png",
  "after-rejected-input.png",
  "original-reopened.png",
  "side-reopened.png",
  "mobile.png",
])
  await cp(`${input}/roundtrip/${name}`, `${output}/roundtrip/${name}`);

const composite = String.raw`
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import json,sys
root=Path(sys.argv[1]);matte=(238,233,223)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',10)
for character in ['male','female']:
 frames=[];timings=[]
 for view in ['original','side']:
  im=Image.open(root/character/(view+'-run-right.gif')); fs=[];edges=[0]
  for i in range(im.n_frames):
   im.seek(i);fs.append(im.convert('RGB').copy());edges.append(edges[-1]+im.info['duration'])
  frames.append(fs);timings.append(edges)
 # 3 seconds at the original GIF event times. Each source loops on its own
 # clock; the comparison itself plays once, avoiding a fabricated shared seam.
 events={0,3000}
 for edges in timings:
  cycle=edges[-1]
  for start in range(0,3000,cycle):events.update(start+t for t in edges if start+t<3000)
 events=sorted(events);panels=[]
 for t in events[:-1]:
  canvas=Image.new('RGB',(632,600),matte);d=ImageDraw.Draw(canvas)
  d.text((12,8),character.title()+' / native clocks / 3-second review',fill=(55,58,51),font=font)
  d.text((12,30),'Original 3/4',fill=(55,58,51),font=font)
  d.text((372,30),'Side view',fill=(55,58,51),font=font)
  for column in range(2):
   edges=timings[column];clock=t%edges[-1];i=next((n for n in range(len(edges)-1) if edges[n]<=clock<edges[n+1]),0)
   canvas.paste(frames[column][i],(8 if column==0 else 368,52 if column==0 else 196))
  d.text((12,578),'704 x 1056 source / 50% UI GIF',fill=(55,58,51),font=small)
  d.text((372,578),'512 x 768 / 50% UI GIF',fill=(55,58,51),font=small)
  panels.append(canvas)
 # One palette for the full review avoids new frame-by-frame palette shimmer.
 sample=Image.new('RGB',(158*len(panels),150))
 for i,im in enumerate(panels):sample.paste(im.resize((158,150)),(158*i,0))
 pal=sample.quantize(colors=256,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
 indexed=[im.quantize(palette=pal,dither=Image.Dither.NONE) for im in panels]
 indexed[0].save(root/(character+'-views-run-right.gif'),save_all=True,append_images=indexed[1:],duration=[b-a for a,b in zip(events,events[1:])],optimize=False,disposal=2)
 # Corresponding quarter-cycle positions are labeled independently, not
 # represented as equal source frame IDs. These are frames of actual UI GIFs.
 contact=Image.new('RGB',(4*352+40,2*580+40),matte);d=ImageDraw.Draw(contact)
 for row in range(2):
  count=len(frames[row])
  for col,phase in enumerate([0,.25,.5,.75]):
   at=int(count*phase);x=20+col*352;y=20+row*580
   d.text((x,y),('Original' if row==0 else 'Side')+' / position '+str(at)+' of '+str(count),fill=(55,58,51),font=font)
   d.text((x,y+16),('704 x 1056' if row==0 else '512 x 768')+' source / 50% UI GIF',fill=(55,58,51),font=small)
   contact.paste(frames[row][at],(x,y+30+(0 if row==0 else 144)))
 contact.save(root/(character+'-run-keyframes.png'))
print('Built labeled comparisons and keyframes from exported GIF frames.')
`;
process.stdout.write(
  execFileSync("python", ["-c", composite, output], { encoding: "utf8" }),
);
await writeFile(
  `${output}/files.json`,
  JSON.stringify(
    {
      format: "gathria-dual-view-review-files",
      version: 1,
      notes:
        "Raw UI GIFs are native/2 on an opaque matte; CharacterPacks and PNG retain native resolution and alpha. Composite comparisons use unscaled UI GIF panels, each on its own timeline, then one shared review palette. They play once for3s and do not claim phase alignment.",
      files: records,
    },
    null,
    2,
  ) + "\n",
);
