// Actual UI exports + independent decoded-pixel audit for the separate expansion.
// No authoring helper is imported. Run only after reviewed assets are published.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { unzipSync } from "fflate";
import { parseGIF, decompressFrames } from "gifuct-js";
import { createServer } from "vite";

const root = resolve(
  process.env.TARGET_REPO || fileURLToPath(new URL("../", import.meta.url)),
);
const qaRoot = "/tmp/side-expansion/qa";
await mkdir(qaRoot, { recursive: true });
const output = process.env.EVIDENCE_DIR
  ? resolve(process.env.EVIDENCE_DIR)
  : await mkdtemp(join(qaRoot, "run-"));
assert(
  output.startsWith(`${qaRoot}/`),
  "Bulk evidence must stay under /tmp/side-expansion/qa/.",
);
await mkdir(output, { recursive: true });
assert.equal(
  (await readdir(output)).length,
  0,
  "Evidence directory must be empty.",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const parse = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));
const actions = ["idle", "walk", "run", "jump"];
const count = { male: 107, female: 102 };
const requestedCharacter = process.env.QA_CHARACTER;
assert(
  requestedCharacter === undefined ||
    requestedCharacter === "male" ||
    requestedCharacter === "female",
  "QA_CHARACTER, when provided, must be exactly male or female.",
);
const requestedCharacters = requestedCharacter
  ? [requestedCharacter]
  : ["male", "female"];
const expectedFrameCoverage = requestedCharacters.reduce(
  (total, character) => total + count[character],
  0,
);
const sourceSha = {
  male: "7322f38e39f321fb2eb54afe33bdad456bff1bd2d9739358c278971a51bc5d42",
  female: "ee6d20ac1b6c973043a28bc7b0508cf4f3b1ea4f373424b0de75d88d724f955d",
};
// The unified workbench retains inactive source-bound sessions. Select the
// visible editor, never the first matching canvas or a hidden saved session.
// Visibility also supports pre-unification TARGET_REPO baselines.
const side = (page) => page.locator('[data-testid="side-playground"]:visible');
const stage = (page) => side(page).getByTestId("side-stage");
const report = {
  format: "gathria-kling-side-expansion-qa",
  version: 1,
  passed: false,
  startedAt: new Date().toISOString(),
  root,
  output,
  verifierSha256: sha(await readFile(fileURLToPath(import.meta.url))),
  requestedCharacters,
  expectedFrameCoverage,
  sourceSha: Object.fromEntries(
    requestedCharacters.map((character) => [character, sourceSha[character]]),
  ),
  downloads: [],
  pixels: [],
  hairPixels: [],
  gifPixels: [],
  registrations: [],
  playback: [],
  reopen: [],
  legacy: [],
  mobile: [],
  independent: [],
  screenshots: [],
  repairedPoseExports: [],
  errors: [],
  failures: [],
  externalRequests: [],
  forbiddenIndependentRequests: [],
  limitations: [
    "Exact protected-region checks do not alone prove anatomical registration. Source crops and old/new region overlays require independent visual review.",
    "Garment silhouettes may change alpha inside ownership. Source RGBA outside ownership and the authored replacement RGBA inside ownership must remain exact.",
    "Browser observations may miss display ticks. ZIP audits inspect every encoded source frame independently.",
  ],
};
let browser, server, origin, activePage, failure;
async function ready(page) {
  await expect(side(page)).toHaveCount(1, { timeout: 180000 });
  await expect(side(page)).toHaveAttribute("aria-busy", "false", {
    timeout: 180000,
  });
  assert.deepEqual(await side(page).getByRole("alert").allTextContents(), []);
  await expect(stage(page)).toBeVisible();
}
async function pause(page) {
  if ((await stage(page).getAttribute("data-paused")) === "false")
    await side(page).getByTestId("side-play-pause").click();
  await expect(stage(page)).toHaveAttribute("data-paused", "true");
}
async function pose(page, action, position, facing = "right") {
  if (
    (await stage(page).getAttribute("data-action")) === "jump" &&
    (await stage(page).getAttribute("data-ended")) === "false" &&
    (action !== "jump" ||
      (await stage(page).getAttribute("data-facing")) !== facing)
  ) {
    if ((await stage(page).getAttribute("data-paused")) === "true")
      await side(page).getByTestId("side-play-pause").click();
    await expect(stage(page)).toHaveAttribute("data-ended", "true", {
      timeout: 10000,
    });
  }
  await pause(page);
  if (
    (await stage(page).getAttribute("data-action")) !== action ||
    (await stage(page).getAttribute("data-facing")) !== facing
  ) {
    await side(page).getByTestId("side-action-idle").click();
    await side(page).getByTestId(`side-facing-${facing}`).click();
    await side(page).getByTestId(`side-action-${action}`).click();
  }
  for (const p of [position === 0 ? 1 : 0, position]) {
    await side(page).getByTestId("side-frame").fill(String(p));
    await expect(stage(page)).toHaveAttribute("data-frame-position", String(p));
  }
}
async function download(page, id, name) {
  const pending = page.waitForEvent("download", { timeout: 180000 });
  await side(page).getByTestId(id).click();
  const d = await pending;
  assert.equal(await d.failure(), null);
  const path = join(output, name);
  await d.saveAs(path);
  const bytes = await readFile(path);
  report.downloads.push({
    name,
    bytes: bytes.length,
    sha256: sha(bytes),
    suggestedFilename: d.suggestedFilename(),
    actualUiDownload: true,
  });
  await ready(page);
  return { path, bytes };
}
async function capture(page, name) {
  const path = join(output, `${name}.png`);
  await side(page).screenshot({ path });
  report.screenshots.push({
    file: `${name}.png`,
    sha256: sha(await readFile(path)),
  });
}
function monitor(context, independent = false) {
  context.on("page", (p) =>
    p.on("pageerror", (e) => report.errors.push(e.message)),
  );
  context.on("response", (r) => {
    if (r.status() >= 400)
      report.failures.push({ url: r.url(), status: r.status() });
  });
  context.on("request", (r) => {
    const url = r.url();
    if (/^https?:/.test(url) && !url.startsWith(origin))
      report.externalRequests.push(url);
    if (
      independent &&
      /\/src\/(?:side-view|wardrobe|skeletal)\/|\/workbench\.html/.test(url)
    )
      report.forbiddenIndependentRequests.push(url);
  });
}
function pack(bytes, character, source) {
  const files = unzipSync(bytes),
    manifest = parse(files["manifest.json"]),
    recipe = parse(files["character.json"]);
  assert.equal(manifest.frames.length, count[character]);
  assert.deepEqual(
    Object.keys(manifest.animations).sort(),
    [...actions].sort(),
  );
  for (const a of actions) {
    assert.equal(manifest.animations[a].fps, 24);
    assert.equal(manifest.animations[a].loop, a !== "jump");
  }
  if (source) {
    assert.deepEqual(manifest.animations, source.manifest.animations);
    assert.deepEqual(recipe.derivation.frames, source.recipe.derivation.frames);
    assert.deepEqual(
      manifest.frames.map((f) => f.id),
      source.manifest.frames.map((f) => f.id),
    );
  }
  const mapped = new Map(
    recipe.derivation.frames.map((f) => [f.frameId, f.sourceFrame]),
  );
  assert.deepEqual(
    manifest.animations.jump.frames.map((id) => mapped.get(id)),
    Array.from({ length: 50 }, (_, i) => 200 + i),
  );
  return { manifest, recipe };
}
function gif(bytes, clip) {
  const parsed = parseGIF(new Uint8Array(bytes).buffer),
    frames = decompressFrames(parsed, true);
  assert.equal(parsed.lsd.width, 256);
  assert.equal(parsed.lsd.height, 384);
  assert.equal(frames.length, clip.frames.length);
  const delays = clip.frames.map(
    (_, i) =>
      (Math.round(((i + 1) * 100) / clip.fps) -
        Math.round((i * 100) / clip.fps)) *
      10,
  );
  assert.deepEqual(
    frames.map((f) => f.delay),
    delays,
  );
  assert.equal(bytes.includes(Buffer.from("NETSCAPE2.0")), clip.loop);
  return {
    frames: frames.length,
    dimensions: [parsed.lsd.width, parsed.lsd.height],
    delaysMs: delays,
    durationMs: delays.reduce((a, b) => a + b, 0),
    loop: clip.loop,
  };
}
async function immutableLegacyAssets() {
  const paths = execFileSync(
    "git",
    [
      "ls-files",
      "--",
      "docs/kling-side-workspace/assets",
      "artwork/kling-side-workspace",
    ],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  const baseline = {};
  for (const path of paths) {
    const old = execFileSync("git", ["show", `HEAD:${path}`], {
      cwd: root,
      maxBuffer: 70 * 1024 * 1024,
    });
    const current = await readFile(join(root, path));
    assert.equal(
      sha(current),
      sha(old),
      `Frozen legacy asset changed: ${path}`,
    );
    baseline[path] = sha(current);
  }
  return baseline;
}

async function captureInputHashes() {
  const paths = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "src",
      "*.html",
      "vite.config.ts",
      "docs/kling-side-expansion/assets",
      "artwork/kling-side-expansion/templates/male.registration.json",
      "artwork/kling-side-expansion/templates/female.registration.json",
      "artwork/kling-side-expansion/templates/male.registration-audit.json",
      "artwork/kling-side-expansion/templates/female.registration-audit.json",
    ],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  const values = {};
  const selectedPaths = paths.filter((path) => {
    if (path.startsWith("docs/kling-side-expansion/assets/"))
      return requestedCharacters.some(
        (character) =>
          path.startsWith(`docs/kling-side-expansion/assets/${character}-`) ||
          path.startsWith(`docs/kling-side-expansion/assets/${character}.`),
      );
    if (path.startsWith("artwork/kling-side-expansion/templates/"))
      return requestedCharacters.some((character) =>
        path.startsWith(`artwork/kling-side-expansion/templates/${character}.`),
      );
    return true;
  });
  for (const path of [...new Set(selectedPaths)].sort())
    values[path] = sha(await readFile(join(root, path)));
  return values;
}

// Independent Python decoder/rasterizer: no imports from authoring or runtime.
const pixelPython = String.raw`
import hashlib,io,json,math,sys,zipfile
import numpy as np
from PIL import Image
from pathlib import Path
sha=lambda b:hashlib.sha256(b).hexdigest()
def zopen(p):
 z=zipfile.ZipFile(p);assert z.testzip() is None;return z
def pack(z):
 m=json.loads(z.read('manifest.json'));r=json.loads(z.read('character.json'));pages=[]
 for s in [m['spritesheet']]+m.get('additionalSheets',[]):
  im=Image.open(io.BytesIO(z.read(s['file'])));im.load();assert im.mode=='RGBA';pages.append(im)
 return m,r,pages
def crop(p,f):return np.array(p[f.get('page',0)].crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height'])))
def poly(points,w,h):
 # Ray crossings at pixel centers; independent from the authoring helper.
 out=np.zeros((h,w),bool)
 for y in range(max(0,math.ceil(min(p['y'] for p in points)-.5)),min(h-1,math.floor(max(p['y'] for p in points)-.5))+1):
  cy=y+.5;crossings=[];spans=[]
  for a,b in zip(points[-1:]+points[:-1],points):
   if (a['y']>cy)!=(b['y']>cy):crossings.append(a['x']+(cy-a['y'])*(b['x']-a['x'])/(b['y']-a['y']))
   if abs(a['y']-cy)<1e-9 and abs(b['y']-cy)<1e-9:spans.append((a['x'],b['x']))
   elif abs(a['y']-cy)<1e-9:spans.append((a['x'],a['x']))
  crossings.sort();spans+=list(zip(crossings[::2],crossings[1::2]))
  for a,b in spans:
   lo=max(0,math.ceil(min(a,b)-.5-1e-9));hi=min(w-1,math.floor(max(a,b)-.5+1e-9))
   if lo<=hi:out[y,lo:hi+1]=True
 return out
project=zopen(sys.argv[1]);doc=json.loads(project.read('document.json'));regbytes=project.read('registration.json');reg=json.loads(regbytes)
sourcebytes=project.read('source.character.zip');assert sha(sourcebytes)==doc['sourceSha256']==reg['sourceSha256'];assert sha(regbytes)==doc['registrationSha256']
assert not doc.get('appearance',{}).get('hairId') and not doc.get('appearance',{}).get('faceId'),'Clothing proof requires original hair/face'
sm,sr,sp=pack(zopen(io.BytesIO(sourcebytes)));om,orr,op=pack(zopen(sys.argv[2]));dm,dr,dp=pack(zopen(sys.argv[3]))
for key in ('frames','animations','anchor','facing','scale','spritesheet','additionalSheets'):assert sm.get(key)==om.get(key)==dm.get(key),key
assert sr['derivation']['frames']==orr['derivation']['frames']==dr['derivation']['frames']
assert dr['sourceMetadata']['wardrobe']['sourcePackSha256']==doc['sourceSha256']
assert dr['sourceMetadata']['wardrobe']['registrationSha256']==doc['registrationSha256']
assert dr['sourceMetadata']['wardrobe']['selection']==doc['selection']
registered={f['frameId']:f for f in reg['frames']};assert set(registered)=={f['id'] for f in sm['frames']}
selected={v for v in doc['selection'].values() if v};assert doc['selection']['top'] and doc['selection']['bottom']
garments={}
for i,item in enumerate(doc['items']):
 b=project.read('item-'+str(i)+'.zip');assert sha(b)==item['sha256'];z=zopen(io.BytesIO(b));m=json.loads(z.read('manifest.json'))
 assert m['id']==item['id'] and m['sourceSha256']==doc['sourceSha256'] and m['registrationSha256']==doc['registrationSha256']
 assert not m.get('handProtectionReviews') and not m.get('necklinePermissionProfile'),'Expansion must use reviewed registration, not garment protection exceptions'
 assert len(m['frames'])==len(sm['frames']) and {f['frameId'] for f in m['frames']}==set(registered)
 if m['id'] in selected:
  pages=[(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA'),Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA')) for p in m['pages']]
  garments[m['slot']]=(m,{f['frameId']:f for f in m['frames']},pages)
assert {m[0]['id'] for m in garments.values()}==selected
review=json.loads(Path(sys.argv[5]).read_bytes());old=json.loads(Path(sys.argv[6]).read_bytes());oldframes={f['frameId']:f for f in old['frames']}
assert review['sourceSha256']==doc['sourceSha256'] and review['registrationSha256']==doc['registrationSha256']
assert review['originalRegistrationSha256']==sha(Path(sys.argv[6]).read_bytes())
reviewed={(r['frameId'],r['label']):r for r in review['changes']};registration_results=[]
pngmap=json.loads(sys.argv[4]);results=[];total_alpha=0
for f in sm['frames']:
 fid=f['id'];before=crop(sp,f);original=crop(op,f);after=crop(dp,f);h,w=before.shape[:2]
 assert np.array_equal(before,original),f'Original source RGBA differs {fid}'
 changed=np.any(before!=after,axis=2);owned=np.zeros((h,w),bool);expected=before.copy();coverage={}
 oldregions={r['label']:r['polygon'] for r in oldframes[fid]['protected']};newregions={r['label']:r['polygon'] for r in registered[fid]['protected']}
 for label in sorted(set(oldregions)|set(newregions)):
  if oldregions.get(label)==newregions.get(label):continue
  row=reviewed[(fid,label)];assert row['reason'] and row['sourceRgbaSha256']==sha(before.tobytes()) and row['sourceFrame']==registered[fid]['sourceFrame']
  assert row['polygon']==newregions.get(label)
  prior=poly(oldregions[label],w,h) if label in oldregions else np.zeros((h,w),bool)
  current=poly(newregions[label],w,h) if label in newregions else np.zeros((h,w),bool)
  prior&=before[:,:,3]>0;current&=before[:,:,3]>0
  counts={'beforeSourcePixels':int(prior.sum()),'afterSourcePixels':int(current.sum()),'removedSourcePixels':int(np.count_nonzero(prior&~current)),'addedSourcePixels':int(np.count_nonzero(current&~prior))}
  for key,value in counts.items():assert row[key]==value,f'Independent registration coverage differs {fid}/{label}/{key}'
  registration_results.append({'frameId':fid,'label':label,**counts})
 for slot in ['shoes','bottom','top','fullBody']:
  if slot not in garments:continue
  m,frames,pages=garments[slot];g=frames[fid];r,o=g['rect'],g['offset'];box=(r['x'],r['y'],r['x']+r['width'],r['y']+r['height'])
  patch=np.array(pages[g['page']][0].crop(box));mask=np.array(pages[g['page']][1].crop(box))[:,:,3]
  assert np.isin(mask,[0,255]).all();assert 0<=o['x']<=w-r['width'] and 0<=o['y']<=h-r['height']
  area=np.s_[o['y']:o['y']+r['height'],o['x']:o['x']+r['width']];own=mask==255
  expected[area][own]=patch[own];owned[area]|=own;coverage[slot]=int(own.sum())
 assert np.array_equal(after,expected),f'Authored garment RGBA/alpha differs {fid}'
 assert not np.any(changed&~owned),f'Outside ownership RGBA changed {fid}'
 protected={}
 for region in registered[fid]['protected']:
  regionmask=poly(region['polygon'],w,h)&(before[:,:,3]>0)
  assert not np.any(changed&regionmask),f"Reviewed {region['label']} RGBA changed {fid}"
  protected[region['label']]=int(regionmask.sum())
 assert protected.get('head',0)>0
 alpha=int(np.count_nonzero(before[:,:,3]!=after[:,:,3]));total_alpha+=alpha
 for kind,path in pngmap.get(str(fid),{}).items():
  pixels=np.array(Image.open(path).convert('RGBA'));target=before if kind.startswith('original') else after
  if kind.endswith('-left'):target=target[:,::-1]
  assert np.array_equal(pixels,target),f'Native PNG or mirror differs {fid}/{kind}'
 results.append({'frameId':fid,'sourceFrame':registered[fid]['sourceFrame'],'changedPixels':int(changed.sum()),'alphaChangedPixels':alpha,'protectedSourcePixels':protected,'ownershipPixels':coverage,'sourceRgbaSha256':sha(before.tobytes()),'compositeRgbaSha256':sha(after.tobytes())})
assert sum(r['changedPixels'] for r in results)>0
assert total_alpha>0,'Real-cut expansion must change silhouette alpha in at least one source frame'
print(json.dumps({'framesChecked':len(results),'exactOriginalSourceRgba':True,'exactReviewedHeadAndHandsRgba':True,'exactOutsideOwnershipRgba':True,'exactAuthoredGarmentRgbaAndAlpha':True,'alphaChangesAllowedInsideOwnership':True,'alphaChangedPixels':total_alpha,'exactPngAndMirror':True,'sourceSha256':doc['sourceSha256'],'registrationSha256':doc['registrationSha256'],'selection':doc['selection'],'registrationCoverageIndependentlyChecked':registration_results,'frames':results}))
`;
function pixelAudit(character, projectPath, originalPath, outfitPath, pngs) {
  return parse(
    execFileSync(
      "python",
      [
        "-c",
        pixelPython,
        projectPath,
        originalPath,
        outfitPath,
        JSON.stringify(pngs),
        join(
          root,
          `artwork/kling-side-expansion/templates/${character}.registration-audit.json`,
        ),
        join(
          root,
          `docs/kling-side-workspace/assets/${character}.registration.json`,
        ),
      ],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 180000,
        maxBuffer: 8 * 1024 * 1024,
      },
    ),
  );
}
function appearanceAudit(projectPath, clothesPath, hairPath) {
  const prelude = pixelPython.slice(0, pixelPython.indexOf("project=zopen"));
  return parse(
    execFileSync(
      "python",
      [
        "-c",
        prelude +
          String.raw`
project=zopen(sys.argv[1]);doc=json.loads(project.read('document.json'));selection=doc['appearance'];assert selection['hairId'] and not selection['faceId']
bankbytes=project.read('appearance.zip');assert sha(bankbytes)==selection['bankSha256'];bank=zopen(io.BytesIO(bankbytes));bm=json.loads(bank.read('manifest.json'))
assert bm['sourceSha256']==doc['sourceSha256'] and bm['registrationSha256']==doc['registrationSha256']
reg=json.loads(project.read('registration.json'));registered={r['frameId']:r for r in reg['frames']};poses={p['frameId']:p for p in bm['poses']};pad=bm['padding'];px,py=pad['left'],pad['top']
sm,sr,sp=pack(zopen(io.BytesIO(project.read('source.character.zip'))));cm,cr,cp=pack(zopen(sys.argv[2]));hm,hr,hp=pack(zopen(sys.argv[3]));hairframes={f['id']:f for f in hm['frames']}
assert sm['animations']==cm['animations']==hm['animations'];assert sr['derivation']['frames']==cr['derivation']['frames']==hr['derivation']['frames']
assert set(poses)==set(registered)==set(hairframes)
assert hm['anchor']['x']==cm['anchor']['x']+px and hm['anchor']['y']==cm['anchor']['y']+py
styles=[s for s in bm['styles'] if s['id']==selection['hairId']];assert len(styles)==1 and styles[0]['slot']=='hair'
layers=sorted(styles[0]['layers'],key=lambda l:['hair-back','face','hair-front'].index(l['role']));assert all(l['role']!='face' for l in layers)
pages=[(Image.open(io.BytesIO(bank.read(p['file']))).convert('RGBA'),Image.open(io.BytesIO(bank.read(p['maskFile']))).convert('RGBA')) for p in bm['pages']]
factors={'chestnut':[1,1,1],'espresso':[.63,.65,.69],'copper':[1.2,1.05,.83]}[selection['hairColor']]
results=[]
for frame in sm['frames']:
 fid=frame['id'];source=crop(sp,frame);clothes=crop(cp,next(f for f in cm['frames'] if f['id']==fid));after=crop(hp,hairframes[fid]);h,w=source.shape[:2];oh,ow=h+pad['top']+pad['bottom'],w+pad['left']+pad['right'];assert after.shape==(oh,ow,4)
 before=np.zeros((oh,ow,4),np.uint8);before[py:py+h,px:px+w]=clothes;expected=before.copy();owned=np.zeros((oh,ow),bool)
 pose=poses[fid];foreground=np.zeros((h,w),bool)
 for points in pose['foreground']+[r['polygon'] for r in registered[fid]['protected'] if r['label']!='head']:foreground|=poly(points,w,h)
 foreground&=source[:,:,3]>0
 yy,xx=np.indices((h,w));bounds=pose.get('hairOcclusionBounds',pose['headBounds']);inhead=(xx+.5>=bounds['x'])&(xx+.5<=bounds['x']+bounds['width'])&(yy+.5>=bounds['y'])&(yy+.5<=bounds['y']+bounds['height'])
 for layer in layers:
  frames={f['frameId']:f for f in layer['frames']};assert set(frames)==set(registered);f=frames[fid]
  if f['mode']=='source':continue
  r,o=f['rect'],f['offset'];box=(r['x'],r['y'],r['x']+r['width'],r['y']+r['height']);paint=np.array(pages[f['page']][0].crop(box));mask=np.array(pages[f['page']][1].crop(box))[:,:,3];assert np.isin(mask,[0,255]).all()
  for y,x in np.argwhere(mask==255):
   fx,fy=o['x']+int(x),o['y']+int(y);ox,oy=fx+px,fy+py;assert 0<=ox<ow and 0<=oy<oh;owned[oy,ox]=True
   native=0<=fx<w and 0<=fy<h
   if layer['role']=='hair-front' and native and (foreground[fy,fx] or (not inhead[fy,fx] and (source[fy,fx,3]!=0 or clothes[fy,fx,3]!=0))):continue
   p=paint[y,x].astype(float);dst=expected[oy,ox].astype(float);sa=p[3]/255;da=dst[3]/255;back=layer['role']=='hair-back'
   if not sa or (back and da==1):continue
   sw=sa*(1-da) if back else sa;dw=da if back else da*(1-sa);alpha=sw+dw;color=np.minimum(255,np.floor(p[:3]*factors+.5))
   expected[oy,ox,:3]=np.floor((color*sw+dst[:3]*dw)/alpha+.5).astype(np.uint8);expected[oy,ox,3]=math.floor(alpha*255+.5)
 changed=np.any(before!=after,axis=2);assert np.array_equal(after,expected),f'Hair blend/tint RGBA differs {fid}'
 assert not np.any(changed&~owned),f'Hair modified pixels outside appearance ownership {fid}'
 native_after=after[py:py+h,px:px+w];native_changed=np.any(native_after!=clothes,axis=2)
 assert not np.any(native_changed&foreground&(source[:,:,3]==255)),f'Hair modified opaque foreground hands/arms {fid}'
 face=poly(pose['facePolygon'],w,h)&(source[:,:,3]==255);assert not np.any(native_changed&face),f'Hair repainted protected inner face {fid}'
 body=(source[:,:,3]==255)&~inhead;assert not np.any(native_changed&body),f'Hair modified original body outside declared head envelope {fid}'
 results.append({'frameId':fid,'changedPixels':int(changed.sum()),'foregroundSourcePixels':int(foreground.sum()),'innerFaceSourcePixels':int(face.sum()),'bodySourcePixels':int(body.sum())})
assert sum(r['changedPixels'] for r in results)>0
print(json.dumps({'framesChecked':len(results),'exactAuthoredHairBlendAndTint':True,'exactOutsideAppearanceOwnershipRgba':True,'exactOpaqueOriginalBodyOutsideHeadEnvelope':True,'exactOpaqueForegroundHandsAndInnerFace':True,'partialAlphaEdges':'Allowed existing source-over/destination-over composition; every resulting RGBA byte independently reconstructed','explicitPaddingOnly':pad,'selection':selection,'frames':results}))
`,
        projectPath,
        clothesPath,
        hairPath,
      ],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 240000,
        maxBuffer: 8 * 1024 * 1024,
      },
    ),
  );
}

function auditGifFrames(packPath, paths) {
  const prelude = pixelPython.slice(0, pixelPython.indexOf("project=zopen"));
  return parse(
    execFileSync(
      "python",
      [
        "-c",
        prelude +
          String.raw`
m,r,pages=pack(zopen(sys.argv[1]));frames={f['id']:f for f in m['frames']};paths=json.loads(sys.argv[2]);result=[]
for action in ['idle','walk','run','jump']:
 right=Image.open(paths[action]['right']);left=Image.open(paths[action]['left']);palette=np.array(right.getpalette(),np.int32).reshape(-1,3);clip=m['animations'][action]
 assert right.n_frames==left.n_frames==len(clip['frames']);hashes=[]
 for position,fid in enumerate(clip['frames']):
  source=crop(pages,frames[fid]);assert source.shape[:2]==(768,512);rgba=source.astype(np.float64);alpha=rgba[:,:,3:4]/255;matte=np.array([238,233,223]);rgb=rgba[:,:,:3]*alpha+matte*(1-alpha)
  # Same four pixel accumulation order, independently implemented in NumPy.
  total=rgb[0::2,0::2]+rgb[0::2,1::2];total=total+rgb[1::2,0::2];total=total+rgb[1::2,1::2];compact=np.floor(total/4+.5).astype(np.int32);flat=compact.reshape(-1,3)
  keys=((flat[:,0]<<8)&0xf800)|((flat[:,1]<<2)&0x03e0)|(flat[:,2]>>3)
  unique,first,inverse=np.unique(keys,return_index=True,return_inverse=True)
  # GIF encoder's RGB565 cache uses the first actual RGB for each key in each
  # frame. Recover nearest colors from the actual encoded global palette.
  colors=flat[first];nearest=np.empty(len(colors),np.int32)
  for start in range(0,len(colors),2048):
   delta=colors[start:start+2048,None,:]-palette[None,:,:];distance=np.sum(delta*delta,axis=2);nearest[start:start+2048]=len(palette)-1-np.argmin(distance[:,::-1],axis=1)
  expected=palette[nearest[inverse]].reshape(384,256,3).astype(np.uint8)
  right.seek(position);left.seek(position);actual=np.array(right.convert('RGB'));mirrored=np.array(left.convert('RGB'))
  assert np.array_equal(actual,expected),f'GIF frame pixels/order differs {action}/{position}/source-frame-id{fid}'
  assert np.array_equal(mirrored,actual[:,::-1]),f'GIF mirror differs {action}/{position}'
  hashes.append({'position':position,'frameId':fid,'rgbaSha256':sha(np.array(right.convert('RGBA')).tobytes())})
 result.append({'action':action,'frames':len(hashes),'exactQuantizedPackPixelsAndOrder':True,'exactLeftMirror':True,'framesChecked':hashes})
print(json.dumps({'totalFrames':sum(r['frames'] for r in result),'directions':2,'actions':result}))
`,
        packPath,
        JSON.stringify(paths),
      ],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 180000,
        maxBuffer: 4 * 1024 * 1024,
      },
    ),
  );
}

async function exportGifs(page, character, outfit, manifest, packPath) {
  const paths = {};
  for (const action of actions) {
    paths[action] = {};
    for (const facing of ["right", "left"]) {
      await pose(page, action, 0, facing);
      const result = await download(
        page,
        "side-export-gif",
        `${character}-${outfit}-${action}-${facing}.gif`,
      );
      paths[action][facing] = result.path;
      report.downloads.at(-1).decodedGif = gif(
        result.bytes,
        manifest.animations[action],
      );
    }
  }
  report.gifPixels.push({
    character,
    outfit,
    ...auditGifFrames(packPath, paths),
  });
}
async function animate(page, target, clip, play) {
  await target.evaluate((c) => {
    const entries = [];
    window.__expansionQa = { entries, started: performance.now() };
    window.__expansionObserver = new MutationObserver(() => {
      const item = {
        position: Number(c.dataset.framePosition),
        frameId: Number(c.dataset.frameId),
        elapsedMs: Number(c.dataset.elapsedMs),
        wallMs: performance.now() - window.__expansionQa.started,
      };
      if (entries.at(-1)?.position !== item.position) entries.push(item);
    });
    window.__expansionObserver.observe(c, {
      attributes: true,
      attributeFilter: ["data-frame-position", "data-frame-id"],
    });
  });
  await play();
  await page.waitForTimeout(
    Math.ceil(
      ((clip.frames.length * 1000) / clip.fps) * (clip.loop ? 1.7 : 1.15),
    ),
  );
  const observed = await page.evaluate(() => {
    window.__expansionObserver.disconnect();
    return window.__expansionQa.entries;
  });
  assert(
    new Set(observed.map((x) => x.position)).size >=
      Math.min(8, clip.frames.length),
  );
  for (const row of observed) {
    assert.equal(row.frameId, clip.frames[row.position]);
    if (Number.isFinite(row.elapsedMs)) {
      const possible = [-0.01, 0.01].map((epsilon) => {
        const tick = Math.floor(
          (Math.max(0, row.elapsedMs + epsilon) * clip.fps) / 1000,
        );
        return clip.loop
          ? tick % clip.frames.length
          : Math.min(tick, clip.frames.length - 1);
      });
      assert(
        possible.includes(row.position),
        "Observed source clock differs from displayed frame.",
      );
    }
  }
  return {
    observed,
    missedPositions: clip.frames
      .map((_, i) => i)
      .filter((i) => !observed.some((x) => x.position === i)),
  };
}
async function independent(character, path, manifest) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1000 },
    acceptDownloads: true,
  });
  monitor(context, true);
  const page = await context.newPage();
  activePage = page;
  await page.goto(`${origin}/player.html`, { waitUntil: "networkidle" });
  await page.locator("#player-zip").setInputFiles(path);
  await expect(page.locator(".player-status")).toHaveText(
    `Loaded: ${manifest.name}`,
    { timeout: 180000 },
  );
  const player = page.getByTestId("consumer-canvas"),
    observations = [];
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.getByLabel("Playback speed", { exact: true }).selectOption("1");
  for (const action of actions) {
    await button(action[0].toUpperCase() + action.slice(1)).click();
    for (const facing of ["right", "left"]) {
      if (await button("Pause animation").count())
        await button("Pause animation").click();
      await button(facing === "right" ? "Right" : "Left").click();
      for (const n of [1, 0]) {
        await page.locator("#player-frame").fill(String(n));
        await expect(player).toHaveAttribute("data-frame-position", String(n));
      }
      const clip = manifest.animations[action];
      await expect(page.locator(".player-timing")).toHaveText(
        `${clip.fps} FPS · ${clip.loop ? "LOOP" : "ONCE"}`,
      );
      observations.push({
        action,
        facing,
        ...(await animate(page, player, clip, () =>
          button("Play animation").click(),
        )),
      });
      if (!clip.loop) {
        await expect(player).toHaveAttribute(
          "data-frame-position",
          String(clip.frames.length - 1),
        );
        await expect(button("Replay animation")).toBeVisible();
        const held = await player.evaluate((c) => c.toDataURL());
        await page.waitForTimeout(150);
        assert.equal(
          await player.evaluate((c) => c.toDataURL()),
          held,
          "Independent jump must hold the final frame.",
        );
      }
    }
  }
  await page
    .locator(".player-preview-panel")
    .screenshot({ path: join(output, `${character}-independent.png`) });
  const pending = page.waitForEvent("download");
  await button("Export selected CharacterPack").click();
  const d = await pending;
  assert.equal(sha(await readFile(await d.path())), sha(await readFile(path)));
  report.independent.push({
    character,
    workbenchClosed: true,
    freshContext: true,
    exactReexport: true,
    observations,
  });
  await context.close();
}
async function reviewRegistration(character, projectBytes) {
  const entries = unzipSync(projectBytes),
    bytes = entries["registration.json"],
    candidatePath = `artwork/kling-side-expansion/templates/${character}.registration.json`;
  assert.equal(
    sha(bytes),
    sha(await readFile(join(root, candidatePath))),
    "Runtime must use exact reviewed candidate registration.",
  );
  const oldBytes = await readFile(
      join(
        root,
        `docs/kling-side-workspace/assets/${character}.registration.json`,
      ),
    ),
    before = parse(oldBytes),
    after = parse(bytes);
  assert.equal(after.sourceSha256, sourceSha[character]);
  assert.equal(after.frames.length, count[character]);
  for (const key of [
    "format",
    "version",
    "sourceSha256",
    "characterId",
    "frameWidth",
    "frameHeight",
    "anchor",
  ])
    assert.deepEqual(after[key], before[key]);
  assert.deepEqual(
    after.frames.map((f) => [f.frameId, f.sourceFrame]),
    before.frames.map((f) => [f.frameId, f.sourceFrame]),
  );
  const changed = after.frames.flatMap((f, i) =>
    JSON.stringify(f) !== JSON.stringify(before.frames[i])
      ? [
          {
            frameId: f.frameId,
            sourceFrame: f.sourceFrame,
            oldLabels: before.frames[i].protected.map((r) => r.label),
            labels: f.protected.map((r) => r.label),
            protectedChanged:
              JSON.stringify(f.protected) !==
              JSON.stringify(before.frames[i].protected),
            anchorsChanged:
              JSON.stringify(f.points) !==
              JSON.stringify(before.frames[i].points),
          },
        ]
      : [],
  );
  assert(
    changed.length > 0,
    "Expansion must use the separately reviewed correction registration.",
  );
  report.registrations.push({
    character,
    candidatePath,
    oldSha256: sha(oldBytes),
    reviewedSha256: sha(bytes),
    sameSourceBindingAndFrameOrder: true,
    changed,
    visualReviewReference: "docs/kling-side-expansion/templates/source-review/",
  });
}
try {
  report.legacyAssetHashes = await immutableLegacyAssets();
  report.runtimeAndAssetHashes = await captureInputHashes();
  server = await createServer({
    root,
    configFile: join(root, "vite.config.ts"),
    server: { host: "127.0.0.1", port: 0, hmr: false },
  });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  for (const character of requestedCharacters) {
    const sourceBytes = await readFile(
      join(root, `docs/kling-side-workspace/assets/${character}.source.zip`),
    );
    assert.equal(sha(sourceBytes), sourceSha[character]);
    const source = pack(sourceBytes, character);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 1,
      acceptDownloads: true,
    });
    monitor(context);
    const page = await context.newPage();
    activePage = page;
    await page.goto(
      `${origin}/workbench.html?mode=side-view&collection=tailored&character=${character}`,
    );
    await ready(page);
    await expect(stage(page)).toHaveAttribute("data-collection", "tailored");
    await expect(side(page).getByTestId("side-collection")).toHaveValue(
      "tailored",
    );
    await expect(side(page).getByTestId("side-hair")).toHaveValue("");
    const exports = {},
      pngs = {};
    for (const outfit of ["original", "daily"]) {
      await side(page).getByTestId(`side-look-${outfit}`).click();
      await ready(page);
      await pose(page, "run", 4);
      const frameId = Number(await stage(page).getAttribute("data-frame-id"));
      const png = await download(
        page,
        "side-export-png",
        `${character}-${outfit}.png`,
      );
      (pngs[frameId] ??= {})[outfit] = png.path;
      await side(page).getByTestId("side-ground").check();
      await side(page).getByTestId("side-anchors").check();
      await side(page).getByTestId("side-comparison").check();
      const guides = await download(
        page,
        "side-export-png",
        `${character}-${outfit}-guides.png`,
      );
      assert.equal(
        sha(png.bytes),
        sha(guides.bytes),
        "Guides must not enter native PNG export.",
      );
      await side(page).getByTestId("side-anchors").uncheck();
      await side(page).getByTestId("side-comparison").uncheck();
      await pose(page, "run", 4, "left");
      const left = await download(
        page,
        "side-export-png",
        `${character}-${outfit}-left.png`,
      );
      pngs[frameId][`${outfit}-left`] = left.path;
      await pose(page, "idle", 0);
      await capture(page, `${character}-${outfit}-workspace`);
      exports[outfit] = await download(
        page,
        "side-export-pack",
        `${character}-${outfit}.character.zip`,
      );
      pack(exports[outfit].bytes, character, source);
      await exportGifs(
        page,
        character,
        outfit,
        source.manifest,
        exports[outfit].path,
      );
    }
    // Native contact poses retained for same-frame before/after review.
    const repairedPoses =
      character === "male"
        ? [
            { action: "walk", position: 5, frameId: 26 },
            { action: "walk", position: 14, frameId: 35 },
            { action: "run", position: 1, frameId: 40 },
          ]
        : [{ action: "walk", position: 15, frameId: 31 }];
    for (const repair of repairedPoses) {
      await pose(page, repair.action, repair.position, "right");
      await expect(stage(page)).toHaveAttribute(
        "data-frame-id",
        String(repair.frameId),
      );
      await expect(side(page).getByTestId("side-hair")).toHaveValue("");
      const name = `${character}-daily-${repair.action}-frame-${repair.frameId}.png`;
      const exported = await download(page, "side-export-png", name);
      report.repairedPoseExports.push({
        character,
        ...repair,
        facing: "right",
        hair: "original",
        file: name,
        sha256: sha(exported.bytes),
      });
    }
    const dailyProject = await download(
      page,
      "side-save-project",
      `${character}-daily.wardrobe.zip`,
    );
    await reviewRegistration(character, dailyProject.bytes);
    report.pixels.push({
      character,
      ...pixelAudit(
        character,
        dailyProject.path,
        exports.original.path,
        exports.daily.path,
        pngs,
      ),
    });
    for (const action of actions) {
      await pose(page, action, 0);
      const observation = await animate(
        page,
        stage(page),
        source.manifest.animations[action],
        () => side(page).getByTestId("side-play-pause").click(),
      );
      await pause(page);
      report.playback.push({
        character,
        action,
        nativeFps: 24,
        ...observation,
      });
    }
    // Difficult source poses are screenshots of the actual workbench renderer.
    for (const p of [0, 8, 14, 24, 31, 38, 42, 49]) {
      await pose(page, "jump", p);
      await capture(page, `${character}-jump-${200 + p}`);
    }
    // The full styled outfit is a separate actual export for visual acceptance.
    const styledHairOptions = await side(page)
      .getByTestId("side-hair")
      .locator("option")
      .evaluateAll((options) => options.map((o) => o.value).filter(Boolean));
    assert(styledHairOptions.length >= 1);
    await side(page)
      .getByTestId("side-hair")
      .selectOption(styledHairOptions[0]);
    await ready(page);
    await side(page).getByTestId("side-hair-color").selectOption("chestnut");
    await ready(page);
    await pose(page, "run", 4);
    await download(page, "side-export-png", `${character}-styled.png`);
    const styledPack = await download(
      page,
      "side-export-pack",
      `${character}-styled.character.zip`,
    );
    const styledProject = await download(
      page,
      "side-save-project",
      `${character}-styled.wardrobe.zip`,
    );
    pack(styledPack.bytes, character, source);
    report.hairPixels.push({
      character,
      variant: "full-styled-chestnut",
      ...appearanceAudit(
        styledProject.path,
        exports.daily.path,
        styledPack.path,
      ),
    });
    await exportGifs(
      page,
      character,
      "styled",
      source.manifest,
      styledPack.path,
    );
    await capture(page, `${character}-styled-workspace`);
    await side(page).getByTestId("side-hair").selectOption("");
    await ready(page);
    // Mix a new bottom with original top, preserve hair selection on save/reopen.
    await pose(page, "run", 4, "left");
    const dailySelection = parse(
      await stage(page).getAttribute("data-selection"),
    );
    await side(page).getByTestId("side-top").selectOption("");
    await ready(page);
    const mixed = parse(await stage(page).getAttribute("data-selection"));
    assert.equal(mixed.top, null);
    assert.equal(mixed.bottom, dailySelection.bottom);
    assert.equal(mixed.shoes, dailySelection.shoes);
    const mixedClothesPack = await download(
      page,
      "side-export-pack",
      `${character}-mixed-clothes.character.zip`,
    );
    const hairOptions = await side(page)
      .getByTestId("side-hair")
      .locator("option")
      .evaluateAll((options) => options.map((o) => o.value).filter(Boolean));
    assert(
      hairOptions.length >= 1,
      "Expansion hair bank must expose an authored hairstyle.",
    );
    await side(page).getByTestId("side-hair").selectOption(hairOptions[0]);
    await ready(page);
    await side(page).getByTestId("side-hair-color").selectOption("espresso");
    await ready(page);
    await pose(page, "run", 4, "left");
    const mixedPng = await download(
      page,
      "side-export-png",
      `${character}-mixed-hair.png`,
    );
    const mixedProject = await download(
      page,
      "side-save-project",
      `${character}-mixed-hair.wardrobe.zip`,
    );
    const hairPack = await download(
      page,
      "side-export-pack",
      `${character}-mixed-hair.character.zip`,
    );
    pack(hairPack.bytes, character, source);
    report.hairPixels.push({
      character,
      ...appearanceAudit(
        mixedProject.path,
        mixedClothesPack.path,
        hairPack.path,
      ),
    });
    const document = parse(unzipSync(mixedProject.bytes)["document.json"]);
    assert.equal(document.appearance.hairId, hairOptions[0]);
    assert.equal(document.appearance.hairColor, "espresso");
    assert.deepEqual(document.selection, mixed);
    assert.deepEqual(document.preview, { action: "run", facing: "left" });
    await page.reload();
    await ready(page);
    await side(page)
      .getByTestId("side-project-input")
      .setInputFiles(mixedProject.path);
    await ready(page);
    await expect(side(page).getByTestId("side-collection")).toHaveValue(
      "tailored",
    );
    await expect(side(page).getByTestId("side-hair")).toHaveValue(
      hairOptions[0],
    );
    await expect(side(page).getByTestId("side-hair-color")).toHaveValue(
      "espresso",
    );
    await pose(page, "run", 4, "left");
    const reopened = await download(
      page,
      "side-export-png",
      `${character}-mixed-hair-reopened.png`,
    );
    assert.equal(sha(reopened.bytes), sha(mixedPng.bytes));
    report.reopen.push({
      character,
      exactNativePng: true,
      selection: mixed,
      appearance: document.appearance,
      preview: document.preview,
    });
    if (character === "male") {
      await page.setViewportSize({ width: 390, height: 844 });
      const controls = [
        "side-collection",
        "side-top",
        "side-bottom",
        "side-hair",
        "side-hair-color",
        "side-export-png",
        "side-save-project",
      ];
      for (const id of controls) {
        const control = side(page).getByTestId(id);
        await control.scrollIntoViewIfNeeded();
        await expect(control).toBeVisible();
        const bounds = await control.boundingBox();
        assert(
          bounds && bounds.x >= -1 && bounds.x + bounds.width <= 391,
          `Mobile control overflows viewport: ${id}`,
        );
      }
      await side(page).getByTestId("side-collection").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: join(output, "male-mobile-390.png"),
        fullPage: true,
      });
      report.mobile.push({
        width: 390,
        height: 844,
        controlsVisibleAndReachable: controls,
        screenshot: "male-mobile-390.png",
      });
      await page.setViewportSize({ width: 1440, height: 1100 });
    }
    // Legacy defaults and the old embedded registration still open independently.
    await side(page).getByTestId("side-collection").selectOption("material");
    await ready(page);
    await expect(stage(page)).toHaveAttribute("data-collection", "material");
    await side(page).getByTestId("side-look-daily").click();
    await ready(page);
    await pose(page, "run", 4);
    const legacyPng = await download(
      page,
      "side-export-png",
      `${character}-legacy.png`,
    );
    const legacyProject = await download(
      page,
      "side-save-project",
      `${character}-legacy.wardrobe.zip`,
    );
    const legacyEntries = unzipSync(legacyProject.bytes);
    assert.equal(
      sha(legacyEntries["registration.json"]),
      sha(
        await readFile(
          join(
            root,
            `docs/kling-side-workspace/assets/${character}.registration.json`,
          ),
        ),
      ),
    );
    await page.reload();
    await ready(page);
    await side(page)
      .getByTestId("side-project-input")
      .setInputFiles(legacyProject.path);
    await ready(page);
    await expect(side(page).getByTestId("side-collection")).toHaveValue(
      "material",
    );
    await pose(page, "run", 4);
    const legacyReopened = await download(
      page,
      "side-export-png",
      `${character}-legacy-reopened.png`,
    );
    assert.equal(sha(legacyPng.bytes), sha(legacyReopened.bytes));
    report.legacy.push({
      character,
      materialEditionLoaded: true,
      originalRegistrationExact: true,
      savedProjectReopenedExact: true,
    });
    await context.close();
    await independent(
      character,
      exports.daily.path,
      pack(exports.daily.bytes, character).manifest,
    );
    await independent(
      `${character}-hair`,
      styledPack.path,
      pack(styledPack.bytes, character).manifest,
    );
    // Retain three review packs and both styled/mixed editable projects.
    for (const path of [
      dailyProject.path,
      legacyProject.path,
      mixedClothesPack.path,
      hairPack.path,
    ])
      await rm(path);
    console.log(
      `Verified ${character}: source/pixel protection, real-cut alpha, native timing, exports, mix/hair reopen, legacy load and independent player.`,
    );
  }
  assert.equal(
    report.pixels.reduce((n, r) => n + r.framesChecked, 0),
    expectedFrameCoverage,
  );
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.failures, []);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.forbiddenIndependentRequests, []);
  assert.deepEqual(await immutableLegacyAssets(), report.legacyAssetHashes);
  assert.deepEqual(
    await captureInputHashes(),
    report.runtimeAndAssetHashes,
    "Runtime or new asset inputs changed during capture.",
  );
  report.passed = true;
} catch (error) {
  failure = error;
  report.failure = { message: error.message, stack: error.stack };
  if (activePage && !activePage.isClosed()) {
    report.failure.alerts = await activePage
      .getByRole("alert")
      .allTextContents()
      .catch(() => []);
    report.failure.stage = await stage(activePage)
      .evaluate((c) => ({ ...c.dataset }))
      .catch(() => null);
    await activePage
      .screenshot({ path: join(output, "failure.png") })
      .catch(() => {});
  }
  console.error(error);
} finally {
  await browser?.close();
  await server?.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(`Expansion QA evidence: ${output}`);
}
if (failure) process.exitCode = 1;
