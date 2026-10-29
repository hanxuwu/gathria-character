// Real side-view workspace evidence. Use a fresh output directory for each run.
// No artwork, source timing, runtime code, or test thresholds are modified here.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { unzipSync } from "fflate";
import { parseGIF, decompressFrames } from "gifuct-js";
import { createServer } from "vite";

const root = resolve(
  process.env.TARGET_REPO || fileURLToPath(new URL("../", import.meta.url)),
);
const output = process.env.EVIDENCE_DIR
  ? resolve(process.env.EVIDENCE_DIR)
  : await mkdtemp(join(tmpdir(), "kling-side-workspace-"));
await mkdir(output, { recursive: true });
assert.equal(
  (await readdir(output)).length,
  0,
  "Use an empty EVIDENCE_DIR; previous evidence is never overwritten.",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const parse = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));
const title = (s) => s[0].toUpperCase() + s.slice(1);
const actions = ["idle", "walk", "run", "jump"];
const report = {
  format: "gathria-kling-side-workspace-evidence",
  version: 1,
  passed: false,
  startedAt: new Date().toISOString(),
  root,
  output,
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  scope:
    "Actual side-view controls and downloads, original/daily assets, source timing, project reopen, all-frame alpha and registered head/hands protection, and fresh independent player after closing the workbench. Technical checks are not visual acceptance or proof that interpolated anchors are anatomically exact.",
  browserObservationScope:
    "Canvas metadata is observed together with its drawing. Missed display ticks are reported, not treated as missing source frames. ZIP and GIF decoding checks every encoded frame independently.",
  sourceInputs: [],
  downloads: [],
  screenshots: [],
  playback: [],
  projectReopen: [],
  pixelAudits: [],
  independent: [],
  errors: [],
  httpFailures: [],
  externalRequests: [],
  forbiddenIndependentRequests: [],
};
const runtimePaths = execFileSync(
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
  ],
  { cwd: root, encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);
async function runtimeHashes() {
  return Object.fromEntries(
    await Promise.all(
      [...new Set(runtimePaths)]
        .sort()
        .map(async (path) => [path, sha(await readFile(join(root, path)))]),
    ),
  );
}
report.runtimeInputHashes = await runtimeHashes();
let browser, server, origin, failure;
const button = (page, name) => page.getByRole("button", { name, exact: true });
const side = (page) => page.getByTestId("side-playground");
const canvas = (page) => page.getByTestId("side-stage");
async function ready(page) {
  await expect(side(page)).toHaveAttribute("aria-busy", "false", {
    timeout: 180000,
  });
  await expect(side(page).getByRole("alert")).toHaveCount(0);
  await expect(canvas(page)).toBeVisible();
}
function monitor(context, independent = false) {
  context.on("page", (page) =>
    page.on("pageerror", (error) => report.errors.push(error.message)),
  );
  context.on("response", (response) => {
    if (response.status() >= 400)
      report.httpFailures.push({
        url: response.url(),
        status: response.status(),
      });
  });
  context.on("request", (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith(origin))
      report.externalRequests.push(url);
    if (
      independent &&
      /\/src\/(?:side-view|wardrobe|skeletal)\/|\/workbench\.html/.test(url)
    )
      report.forbiddenIndependentRequests.push(url);
  });
}
async function capture(page, name, locator = page) {
  const file = `${name}.png`;
  await locator.screenshot({ path: join(output, file) });
  report.screenshots.push({
    file,
    sha256: sha(await readFile(join(output, file))),
    source: "Actual browser UI",
  });
}
async function download(page, name, filename) {
  const pending = page.waitForEvent("download", { timeout: 180000 });
  await page.getByTestId(name).click();
  const d = await pending;
  assert.equal(await d.failure(), null);
  const path = join(output, filename);
  await d.saveAs(path);
  const bytes = await readFile(path);
  assert(bytes.length > 0);
  report.downloads.push({
    file: filename,
    suggestedFilename: d.suggestedFilename(),
    bytes: bytes.length,
    sha256: sha(bytes),
    source: "Actual UI download",
  });
  await ready(page);
  return { path, bytes };
}
function inspectPack(bytes, character) {
  const files = unzipSync(bytes),
    manifest = parse(files["manifest.json"]),
    recipe = parse(files["character.json"]);
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(manifest.spritesheet.frameWidth, 512);
  assert.equal(manifest.spritesheet.frameHeight, 768);
  assert.equal(manifest.frames.length, character === "male" ? 107 : 102);
  assert.equal(manifest.additionalSheets.length, 2);
  assert.deepEqual(Object.keys(manifest.animations).sort(), actions.toSorted());
  for (const action of actions) {
    assert.equal(manifest.animations[action].fps, 24);
    assert.equal(manifest.animations[action].loop, action !== "jump");
  }
  const sourceFrames = new Map(
    recipe.derivation.frames.map((f) => [f.frameId, f.sourceFrame]),
  );
  assert.deepEqual(
    manifest.animations.jump.frames.map((id) => sourceFrames.get(id)),
    Array.from({ length: 50 }, (_, i) => 200 + i),
  );
  return { files, manifest, recipe };
}
function inspectGif(bytes, clip) {
  const parsed = parseGIF(new Uint8Array(bytes).buffer);
  const frames = decompressFrames(parsed, true);
  assert.equal(parsed.lsd.width, 256);
  assert.equal(parsed.lsd.height, 384);
  assert.equal(frames.length, clip.frames.length);
  const expectedDelays = clip.frames.map(
    (_, i) =>
      (Math.round(((i + 1) * 100) / clip.fps) -
        Math.round((i * 100) / clip.fps)) *
      10,
  );
  assert.deepEqual(
    frames.map((frame) => frame.delay),
    expectedDelays,
  );
  assert.equal(bytes.includes(Buffer.from("NETSCAPE2.0")), clip.loop);
  return {
    decodedFrames: frames.length,
    dimensions: [parsed.lsd.width, parsed.lsd.height],
    delaysMs: frames.map((f) => f.delay),
    durationMs: frames.reduce((n, f) => n + f.delay, 0),
    loop: clip.loop,
    rgbaFrameHashes: frames.map((f) => sha(f.patch)),
  };
}
async function pauseSide(page) {
  if ((await canvas(page).getAttribute("data-paused")) === "false")
    await page.getByTestId("side-play-pause").click();
  await expect(canvas(page)).toHaveAttribute("data-paused", "true");
}
async function playSide(page) {
  if ((await canvas(page).getAttribute("data-paused")) === "true")
    await page.getByTestId("side-play-pause").click();
  await expect(canvas(page)).toHaveAttribute("data-paused", "false");
}
async function setFrame(page, action, position, facing = "right") {
  const currentAction = await canvas(page).getAttribute("data-action");
  const currentFacing = await canvas(page).getAttribute("data-facing");
  if (currentAction !== action || currentFacing !== facing) {
    // Complete a current one-shot before choosing another clip or facing.
    if (
      currentAction === "jump" &&
      (await canvas(page).getAttribute("data-ended")) === "false"
    ) {
      await playSide(page);
      await expect(canvas(page)).toHaveAttribute("data-ended", "true", {
        timeout: 10000,
      });
    }
    await pauseSide(page);
    await page.getByTestId("side-action-idle").click();
    await expect(canvas(page)).toHaveAttribute("data-action", "idle");
    await page.getByTestId(`side-facing-${facing}`).click();
    await page.getByTestId(`side-action-${action}`).click();
    await expect(canvas(page)).toHaveAttribute("data-action", action);
  }
  await pauseSide(page);
  const scrub = page.getByTestId("side-frame");
  await scrub.fill(position === 0 ? "1" : "0");
  await scrub.fill(String(position));
  await expect(canvas(page)).toHaveAttribute(
    "data-frame-position",
    String(position),
  );
}
async function observe(page, target, start, durationMs) {
  await target.evaluate((c) => {
    const observation = { started: performance.now(), entries: [] };
    window.__sideQA = observation;
    window.__sideQAObserver?.disconnect();
    const sample = () => {
      const previous = observation.entries.at(-1);
      const row = {
        position: Number(c.dataset.framePosition),
        frameId: Number(c.dataset.frameId),
        elapsedMs: Number(c.dataset.elapsedMs),
        action: c.dataset.action,
        wallMs: performance.now() - observation.started,
      };
      if (
        !previous ||
        previous.position !== row.position ||
        previous.action !== row.action
      )
        observation.entries.push(row);
    };
    window.__sideQAObserver = new MutationObserver(sample);
    window.__sideQAObserver.observe(c, {
      attributes: true,
      attributeFilter: ["data-frame-position", "data-frame-id", "data-action"],
    });
    sample();
  });
  await start();
  await page.waitForTimeout(durationMs);
  return page.evaluate(() => {
    window.__sideQAObserver.disconnect();
    return window.__sideQA;
  });
}
function verifyObservation(observation, action, clip, minimumUnique) {
  const entries = observation.entries.filter((e) => e.action === action);
  assert(entries.length > 1, `${action} canvas did not animate.`);
  for (const e of entries) {
    assert.equal(e.frameId, clip.frames[e.position]);
    const positions = [-0.002, 0.002].map((rounding) => {
      const tick = Math.floor(
        (Math.max(0, e.elapsedMs + rounding) * clip.fps) / 1000,
      );
      return clip.loop
        ? tick % clip.frames.length
        : Math.min(tick, clip.frames.length - 1);
    });
    assert(
      positions.includes(e.position),
      `${action} source clock and displayed position disagree.`,
    );
  }
  const unique = [...new Set(entries.map((e) => e.position))];
  assert(
    unique.length >= minimumUnique,
    `${action} showed too few distinct positions.`,
  );
  return {
    ...observation,
    observedPositions: unique,
    missedPositions: clip.frames
      .map((_, i) => i)
      .filter((i) => !unique.includes(i)),
  };
}

function auditPixels(character, projectPath, originalPath, dailyPath, pngs) {
  return JSON.parse(
    execFileSync(
      "python",
      [
        "-c",
        String.raw`
import hashlib,io,json,sys,zipfile
import numpy as np
from PIL import Image
from pathlib import Path
sha=lambda b:hashlib.sha256(b).hexdigest()
def archive(path):
 z=zipfile.ZipFile(path);assert z.testzip() is None
 return z
def pack(z):
 m=json.loads(z.read('manifest.json'));r=json.loads(z.read('character.json'))
 pages=[]
 for s in [m['spritesheet']]+m.get('additionalSheets',[]):
  im=Image.open(io.BytesIO(z.read(s['file'])));im.load()
  assert im.mode=='RGBA' and list(im.size)==[s['width'],s['height']]
  pages.append(im)
 return m,r,pages
def crop(p,f):
 return np.array(p[f.get('page',0)].crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height'])))
def polygon_mask(points,width,height):
 yy,xx=np.mgrid[:height,:width];x,y=xx+.5,yy+.5
 inside=np.zeros((height,width),bool);boundary=inside.copy()
 for a,b in zip(points,points[1:]+points[:1]):
  ax,ay,bx,by=a['x'],a['y'],b['x'],b['y']
  if ay!=by:inside^=((ay>y)!=(by>y))&(x<ax+(y-ay)*(bx-ax)/(by-ay))
  cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax)
  boundary|=(np.abs(cross)<1e-9)&(x>=min(ax,bx))&(x<=max(ax,bx))&(y>=min(ay,by))&(y<=max(ay,by))
 return inside|boundary
project=archive(sys.argv[1]);doc=json.loads(project.read('document.json'));regbytes=project.read('registration.json');reg=json.loads(regbytes)
sourcebytes=project.read('source.character.zip')
assert sha(sourcebytes)==doc['sourceSha256']==reg['sourceSha256']
assert sha(regbytes)==doc['registrationSha256']
sm,sr,sp=pack(archive(io.BytesIO(sourcebytes)))
om,orr,op=pack(archive(sys.argv[2]));dm,dr,dp=pack(archive(sys.argv[3]))
for key in ('frames','animations','anchor','facing','scale','spritesheet','additionalSheets'):
 assert sm[key]==om[key]==dm[key], key+' changed'
assert sr['derivation']['frames']==orr['derivation']['frames']==dr['derivation']['frames']
assert dr['sourceMetadata']['wardrobe']['sourcePackSha256']==doc['sourceSha256']
assert dr['sourceMetadata']['wardrobe']['registrationSha256']==doc['registrationSha256']
assert dr['sourceMetadata']['wardrobe']['selection']==doc['selection']
registered={f['frameId']:f for f in reg['frames']};assert set(registered)=={f['id'] for f in sm['frames']}
skin_root=Path(sys.argv[5]);skin_audit=json.loads((skin_root/'audit.json').read_text());skin_rows={f['frameId']:f for f in skin_audit['frames']}
assert skin_audit['sourceSha256']==doc['sourceSha256'] and skin_audit['registrationSha256']==doc['registrationSha256']
selected=set(v for v in doc['selection'].values() if v is not None);garments=[]
assert len(selected)==3, 'Daily outfit must select top, bottom and shoes'
for i,item in enumerate(doc['items']):
 b=project.read('item-'+str(i)+'.zip');assert sha(b)==item['sha256']
 z=archive(io.BytesIO(b));m=json.loads(z.read('manifest.json'))
 assert m['id']==item['id'] and m['sourceSha256']==doc['sourceSha256'] and m['registrationSha256']==doc['registrationSha256']
 assert not m.get('handProtectionReviews') and not m.get('necklinePermissionProfile')
 if m['id'] in selected:
  pages=[]
  for p in m['pages']:
   im=Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA');im.load();pages.append(im)
  garments.append((m,{f['frameId']:f for f in m['frames']},pages))
assert {g[0]['id'] for g in garments}==selected
result=[];pngmap={int(k):v for k,v in json.loads(sys.argv[4]).items()}
for f in sm['frames']:
 fid=f['id'];before=crop(sp,f);original=crop(op,f);after=crop(dp,f)
 assert np.array_equal(before,original), f'Original export differs from source at {fid}'
 assert np.array_equal(before[:,:,3],after[:,:,3]), f'Alpha changed at {fid}'
 changed=np.any(before!=after,axis=2);h,w=changed.shape
 opaque=before[:,:,3]!=0
 ys,xs=np.where(opaque);assert len(xs)>0
 bounds=[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]
 assert bounds[0]>0 and bounds[1]>0 and bounds[2]<w and bounds[3]<h, f'Frame edge clipping at {fid}'
 registered_frame=registered[fid];assert len(registered_frame['points'])==17
 labels=[r['label'] for r in registered_frame['protected']]
 assert 1<=len(labels)<=3 and len(labels)==len(set(labels))
 assert 'head' in labels and set(labels)<={'head','nearHand','farHand'}
 skin_bytes=(skin_root/'masks'/f'{fid:04}-skin.png').read_bytes();skin_row=skin_rows[fid]
 assert sha(skin_bytes)==skin_row['maskSha256']['skin'] and sha(before.tobytes())==skin_row['sourceRgbaSha256']
 skin_values=np.array(Image.open(io.BytesIO(skin_bytes)).convert('L'))
 assert skin_values.shape==(h,w) and np.isin(skin_values,[0,255]).all()
 skin=skin_values==255
 rgb=before[:,:,:3].astype(np.int16)
 independently_marked=(before[:,:,3]>16)&(rgb[:,:,0]-rgb[:,:,1]>34)&(rgb[:,:,0]-rgb[:,:,2]>52)&(rgb[:,:,0]>105)
 assert np.array_equal(skin,independently_marked), f'Skin mask differs from declared independent source rule at {fid}'
 assert int(skin.sum())==skin_row['skinSeedPixels']
 assert not np.any(changed&skin), f'High-confidence source skin seed changed at {fid}'
 protected_counts={}
 for region in registered_frame['protected']:
  mask=polygon_mask(region['polygon'],w,h)&opaque
  assert not np.any(changed&mask), f"Protected {region['label']} changed at {fid}"
  protected_counts[region['label']]=int(mask.sum())
 owned=np.zeros((h,w),bool)
 for m,frames,pages in garments:
  g=frames[fid];r,o=g['rect'],g['offset']
  im=pages[g['page']].crop((r['x'],r['y'],r['x']+r['width'],r['y']+r['height']))
  alpha=np.array(im)[:,:,3];assert np.isin(alpha,[0,255]).all()
  owned[o['y']:o['y']+r['height'],o['x']:o['x']+r['width']] |= alpha==255
 assert not np.any(changed&~owned), f'Pixels outside garment ownership changed at {fid}'
 if fid in pngmap:
  for kind,path in pngmap[fid].items():
   exported=np.array(Image.open(path).convert('RGBA'))
   assert np.array_equal(exported,after if kind=='daily' else before), f'Native PNG differs at {fid}/{kind}'
 result.append({'frameId':fid,'sourceFrame':registered_frame['sourceFrame'],'changedPixels':int(changed.sum()),'protectedSourcePixels':protected_counts,'skinSeedPixels':int(skin.sum()),'skinProofCoverage':skin_row['skinProofCoverage'],'handProtection':skin_row['handProtection'],'alphaBounds':bounds,'sourceRgbaSha256':sha(before.tobytes()),'dailyRgbaSha256':sha(after.tobytes())})
assert sum(f['changedPixels'] for f in result)>0, 'Daily outfit did not change the source'
print(json.dumps({'framesChecked':len(result),'exactSourceOriginalRgba':True,'exactAlpha':True,'exactRegisteredHeadAndHands':True,'exactMarkedSkinSeeds':True,'skinCoverage':'Partial high-confidence warm RGB/alpha seeds; pale highlights, ink and ambiguous boundaries are not universally covered.','noChangesOutsideOwnership':True,'pngFrameParity':True,'sourceSha256':doc['sourceSha256'],'registrationSha256':doc['registrationSha256'],'selection':doc['selection'],'frames':result}))
`,
        projectPath,
        originalPath,
        dailyPath,
        JSON.stringify(pngs),
        join(root, `artwork/kling-side-workspace/registration/${character}`),
      ],
      { encoding: "utf8", timeout: 180000, maxBuffer: 10 * 1024 * 1024 },
    ),
  );
}

async function verifyIndependent(character, outfit, path, manifest) {
  // No workbench tab remains open when this context is created.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  monitor(context, true);
  const page = await context.newPage();
  await page.goto(`${origin}/player.html`, { waitUntil: "networkidle" });
  await page.locator("#player-zip").setInputFiles(path);
  await expect(page.locator(".player-status")).toHaveText(
    `Loaded: ${manifest.name}`,
    { timeout: 180000 },
  );
  await expect(page.locator(".player-error")).toHaveCount(0);
  const playerCanvas = page.getByTestId("consumer-canvas");
  await page.getByLabel("Playback speed", { exact: true }).selectOption("1");
  await page.getByLabel("Display scale", { exact: true }).selectOption("0.5");
  const observations = [];
  for (const action of actions) {
    await button(page, title(action)).click();
    for (const facing of ["right", "left"]) {
      if (await button(page, "Pause animation").count())
        await button(page, "Pause animation").click();
      await button(page, title(facing)).click();
      await page.locator("#player-frame").fill("1");
      await page.locator("#player-frame").fill("0");
      await expect(playerCanvas).toHaveAttribute("data-frame-position", "0");
      const clip = manifest.animations[action];
      await expect(page.locator(".player-timing")).toHaveText(
        `${clip.fps} FPS · ${clip.loop ? "LOOP" : "ONCE"}`,
      );
      const observation = await observe(
        page,
        playerCanvas,
        () => button(page, "Play animation").click(),
        Math.ceil(
          ((clip.frames.length * 1000) / clip.fps) * (clip.loop ? 2.2 : 1.2),
        ),
      );
      const evidence = verifyObservation(
        observation,
        action,
        clip,
        Math.min(8, clip.frames.length),
      );
      if (!clip.loop) {
        await expect(playerCanvas).toHaveAttribute(
          "data-frame-position",
          String(clip.frames.length - 1),
        );
        await expect(button(page, "Replay animation")).toBeVisible();
      }
      observations.push({
        action,
        facing,
        fps: clip.fps,
        ticks: clip.frames.length,
        ...evidence,
      });
    }
  }
  await capture(
    page,
    `${character}-${outfit}-independent-player`,
    page.locator(".player-preview-panel"),
  );
  const pending = page.waitForEvent("download");
  await button(page, "Export selected CharacterPack").click();
  const d = await pending;
  const bytes = await readFile(await d.path());
  assert.equal(
    sha(bytes),
    sha(await readFile(path)),
    "Independent player re-export must retain downloaded ZIP bytes.",
  );
  report.independent.push({
    character,
    outfit,
    workbenchClosed: true,
    freshBrowserContext: true,
    uploadSha256: sha(bytes),
    byteExactReexport: true,
    observations,
  });
  await context.close();
}
async function verifyStageControls(page, character, manifest) {
  await setFrame(page, "walk", 0);
  await page.getByTestId("side-mode-travel").click();
  await page.getByTestId("side-walk-speed").fill("120");
  await page.getByTestId("side-run-speed").fill("240");
  await page.getByTestId("side-center").click();
  await playSide(page);
  await expect
    .poll(async () => Number(await canvas(page).getAttribute("data-position")))
    .toBeGreaterThan(30);
  await pauseSide(page);
  const paused = await canvas(page).evaluate((c) => ({
    position: c.dataset.position,
    frame: c.dataset.frameId,
    png: c.toDataURL(),
  }));
  await page.waitForTimeout(160);
  assert.deepEqual(
    await canvas(page).evaluate((c) => ({
      position: c.dataset.position,
      frame: c.dataset.frameId,
      png: c.toDataURL(),
    })),
    paused,
    "Pause must hold both source pixels and stage position.",
  );
  await page.getByTestId("side-mode-in-place").click();
  await playSide(page);
  const inPlaceX = await canvas(page).getAttribute("data-position");
  await page.waitForTimeout(160);
  assert.equal(await canvas(page).getAttribute("data-position"), inPlaceX);
  await canvas(page).focus();
  await page.keyboard.down("ArrowLeft");
  await expect(canvas(page)).toHaveAttribute("data-facing", "left");
  await expect(canvas(page)).toHaveAttribute("data-action", "walk");
  await page.keyboard.down("Shift");
  await expect(canvas(page)).toHaveAttribute("data-action", "run", {
    timeout: 5000,
  });
  await page.keyboard.press("Space");
  await expect(canvas(page)).toHaveAttribute("data-action", "jump", {
    timeout: 5000,
  });
  await page.keyboard.up("Shift");
  await page.keyboard.up("ArrowLeft");
  await expect(canvas(page)).toHaveAttribute("data-action", "idle", {
    timeout: 7000,
  });
  await pauseSide(page);
  await setFrame(page, "idle", 0);
  await page.getByTestId("side-step-forward").click();
  await expect(canvas(page)).toHaveAttribute("data-frame-position", "1");
  await page.getByTestId("side-step-back").click();
  await expect(canvas(page)).toHaveAttribute("data-frame-position", "0");
  await expect(canvas(page)).toHaveAttribute(
    "data-fps",
    String(manifest.animations.idle.fps),
  );
  report.playback.push({
    character,
    controls: {
      pausedPositionAndBitmapHeld: true,
      inPlacePositionHeld: true,
      travelMoved: true,
      keyboardWalkRunJumpIdle: true,
      frameSteps: true,
      sourceFps: 24,
    },
  });
}

try {
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
  for (const character of ["male", "female"]) {
    const sourcePath = join(
      root,
      `docs/kling-side-workspace/assets/${character}.source.zip`,
    );
    const sourceBytes = await readFile(sourcePath),
      source = inspectPack(sourceBytes, character);
    report.sourceInputs.push({
      character,
      path: sourcePath,
      bytes: sourceBytes.length,
      sha256: sha(sourceBytes),
      manifest: source.manifest,
      sourceMetadata: source.recipe.sourceMetadata,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 1,
      acceptDownloads: true,
      recordVideo: {
        dir: join(output, "video"),
        size: { width: 960, height: 734 },
      },
    });
    monitor(context);
    const page = await context.newPage();
    await page.goto(
      `${origin}/workbench.html?mode=side-view&character=${character}`,
      { waitUntil: "networkidle" },
    );
    await ready(page);
    await expect(canvas(page)).toHaveAttribute("data-character", character);
    await page.getByTestId("side-ground").uncheck();
    const exports = {};
    const pngs = {};
    for (const outfit of ["original", "daily"]) {
      await page.getByTestId(`side-look-${outfit}`).click();
      await ready(page);
      await expect(page.getByTestId(`side-look-${outfit}`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await setFrame(page, "idle", 0);
      await capture(page, `${character}-${outfit}-workspace`);
      for (const action of actions) {
        for (const facing of ["right", "left"]) {
          await setFrame(page, action, 0, facing);
          const clip = source.manifest.animations[action];
          const observation = await observe(
            page,
            canvas(page),
            () => playSide(page),
            Math.ceil(
              ((clip.frames.length * 1000) / clip.fps) *
                (clip.loop ? 2.2 : 1.2),
            ),
          );
          const evidence = verifyObservation(
            observation,
            action,
            clip,
            Math.min(8, clip.frames.length),
          );
          if (!clip.loop) {
            await expect(canvas(page)).toHaveAttribute("data-ended", "true");
            await expect(canvas(page)).toHaveAttribute(
              "data-frame-position",
              "49",
            );
            assert(
              Number(await canvas(page).getAttribute("data-elapsed-ms")) >=
                (50 * 1000) / 24 - 0.01,
            );
            const held = await canvas(page).evaluate((c) => c.toDataURL());
            await page.waitForTimeout(150);
            assert.equal(
              await canvas(page).evaluate((c) => c.toDataURL()),
              held,
            );
          }
          await pauseSide(page);
          report.playback.push({
            character,
            outfit,
            action,
            facing,
            fps: clip.fps,
            expectedDurationMs: (clip.frames.length * 1000) / clip.fps,
            ...evidence,
          });
        }
      }
      // Explicit source positions span both jumps, their inter-jump crouch, and final recovery.
      for (const position of [0, 8, 14, 24, 31, 38, 49]) {
        await setFrame(page, "jump", position);
        await capture(
          page,
          `${character}-${outfit}-jump-source-${200 + position}`,
          canvas(page),
        );
      }
      await setFrame(page, "jump", 8);
      const frameId = Number(await canvas(page).getAttribute("data-frame-id"));
      const png = await download(
        page,
        "side-export-png",
        `${character}-${outfit}.png`,
      );
      (pngs[frameId] ??= {})[outfit] = png.path;
      for (const action of ["run", "jump"]) {
        await setFrame(page, action, 0);
        const gif = await download(
          page,
          "side-export-gif",
          `${character}-${outfit}-${action}.gif`,
        );
        report.downloads.at(-1).gif = inspectGif(
          gif.bytes,
          source.manifest.animations[action],
        );
      }
      await setFrame(page, "idle", 0);
      const packed = await download(
        page,
        "side-export-pack",
        `${character}-${outfit}.character.zip`,
      );
      const decoded = inspectPack(packed.bytes, character);
      assert.deepEqual(decoded.manifest.animations, source.manifest.animations);
      const project = await download(
        page,
        "side-save-project",
        `${character}-${outfit}.wardrobe.zip`,
      );
      exports[outfit] = { ...packed, project, manifest: decoded.manifest };
    }
    await verifyStageControls(page, character, source.manifest);
    await setFrame(page, "run", 4, "left");
    await page.getByTestId("side-anchors").check();
    await page.getByTestId("side-comparison").check();
    await capture(page, `${character}-daily-comparison-anchors`, canvas(page));
    await page.getByTestId("side-anchors").uncheck();
    await page.getByTestId("side-comparison").uncheck();
    const dailySelection = JSON.parse(
      await canvas(page).getAttribute("data-selection"),
    );
    assert(dailySelection.top && dailySelection.bottom && dailySelection.shoes);
    await page.getByTestId("side-top").selectOption("");
    await ready(page);
    const mixedSelection = JSON.parse(
      await canvas(page).getAttribute("data-selection"),
    );
    assert.equal(mixedSelection.top, null);
    assert.equal(mixedSelection.bottom, dailySelection.bottom);
    assert.equal(mixedSelection.shoes, dailySelection.shoes);
    const mixedPng = await download(
      page,
      "side-export-png",
      `${character}-mixed.png`,
    );
    const mixedProject = await download(
      page,
      "side-save-project",
      `${character}-mixed.wardrobe.zip`,
    );
    const mixedDocument = parse(unzipSync(mixedProject.bytes)["document.json"]);
    assert.deepEqual(mixedDocument.selection, mixedSelection);
    assert.deepEqual(mixedDocument.preview, { action: "run", facing: "left" });
    // Reload discards the in-memory project. Reopening must recover saved mix and preview.
    await page.reload({ waitUntil: "networkidle" });
    await ready(page);
    await page
      .getByTestId("side-project-input")
      .setInputFiles(mixedProject.path);
    await ready(page);
    await expect(canvas(page)).toHaveAttribute("data-action", "run");
    await expect(canvas(page)).toHaveAttribute("data-facing", "left");
    assert.deepEqual(
      JSON.parse(await canvas(page).getAttribute("data-selection")),
      mixedSelection,
    );
    await pauseSide(page);
    await setFrame(page, "run", 4, "left");
    const reopenedPng = await download(
      page,
      "side-export-png",
      `${character}-mixed-reopened.png`,
    );
    assert.equal(
      sha(reopenedPng.bytes),
      sha(mixedPng.bytes),
      "Saved mixed project must recreate the same native pixels after reload.",
    );
    await capture(page, `${character}-mixed-reopened-workspace`);
    report.projectReopen.push({
      character,
      file: `${character}-mixed.wardrobe.zip`,
      reloadedBeforeImport: true,
      byteExactNativePngAtSavedPose: true,
      selection: mixedSelection,
      preview: mixedDocument.preview,
    });
    await context.close();
    report.pixelAudits.push({
      character,
      ...auditPixels(
        character,
        exports.daily.project.path,
        exports.original.path,
        exports.daily.path,
        pngs,
      ),
    });
    for (const outfit of ["original", "daily"])
      await verifyIndependent(
        character,
        outfit,
        exports[outfit].path,
        exports[outfit].manifest,
      );
    console.log(
      `Verified ${character}: actual original/daily exports, all-frame protection, project reopen and independent playback.`,
    );
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.httpFailures, []);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.forbiddenIndependentRequests, []);
  assert.deepEqual(
    await runtimeHashes(),
    report.runtimeInputHashes,
    "Runtime inputs changed during evidence capture.",
  );
  report.passed = true;
} catch (error) {
  failure = error;
  report.failure = { message: error.message, stack: error.stack };
  console.error(error);
} finally {
  await browser?.close();
  await server?.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(output, "evidence-index.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(`Side-view evidence: ${output}`);
}
if (failure) process.exitCode = 1;
