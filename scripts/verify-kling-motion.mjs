// Actual motion-flow UI downloads and normal-speed independent playback.
// Source images are decoded by the app; this script never changes character pixels.
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const phase = process.env.EVIDENCE_PHASE || "browser";
const flowsOnly = process.env.FLOW_ONLY === "1";
assert(/^[a-z0-9-]+(?:\/[a-z0-9-]+)?$/.test(phase));
const output = new URL(`docs/kling-motion/${phase}/`, root);
await mkdir(output, { recursive: true });
const priorReport = flowsOnly
  ? JSON.parse(await readFile(new URL("evidence-index.json", output), "utf8"))
  : null;
if (flowsOnly)
  assert.equal(
    priorReport.passed,
    true,
    "Flow-only recapture requires successful preserved evidence.",
  );
else
  assert.equal(
    (await readdir(output)).length,
    0,
    "Use a fresh EVIDENCE_PHASE to preserve evidence.",
  );
const temporary = await mkdtemp(join(tmpdir(), "gathria-motion-browser-"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inputPaths = execFileSync(
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
    "docs/kling-motion/exports",
    "docs/kling-jump/exports/male.character.zip",
    "docs/kling-jump/exports/female.character.zip",
  ],
  { cwd: fileURLToPath(root), encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter((p) => p && existsSync(new URL(p, root)))
  .sort();
const hashes = async () =>
  Object.fromEntries(
    await Promise.all(
      inputPaths.map(async (p) => [p, sha(await readFile(new URL(p, root)))]),
    ),
  );
const report = {
  format: "gathria-kling-motion-browser-evidence",
  version: 1,
  startedAt: new Date().toISOString(),
  inputHashes: await hashes(),
  scope:
    "Actual UI export/save/reopen, closed-authoring-context independent playback at normal 1x speed: four bounded cycles per looping action with two adjacent fully observed cycles required, full one-shot jump recovery, and matched action requests. Functional evidence is separate from user visual acceptance.",
  captureMethod: {
    playbackSpeed: 1,
    displayScale: 0.5,
    observation:
      "MutationObserver reads synchronized canvas metadata and captures the actually displayed canvas when the action/frame image changes.",
    flowReview:
      "GIFs replay the latest observed canvas bitmap on a 24 FPS review timeline with 10 ms GIF duration rounding; they play once. No interpolation or replacement artwork is used.",
    boundaryMeaning:
      "Boundary boards show the nearest observed canvas samples on either side of an action change, not guaranteed adjacent engine ticks or the exact configured route exit. Raw timestamps are retained; rendering and PNG capture can skip intermediate observations.",
    engineVerification:
      "Exact route exits and time accounting are checked separately by motion-flow unit/E2E tests. Loop evidence requires two adjacent fully observed cycles within four bounded cycles; this does not assert all flow-recording ticks were observed.",
  },
  downloads: [],
  authoringCases: [],
  independentCases: [],
  flowCases: [],
  originalCases: [],
  screenshots: [],
  errors: [],
  forbiddenIndependentRequests: [],
  externalRequests: [],
  ...(priorReport || {}),
};
if (flowsOnly) {
  assert.deepEqual(
    await hashes(),
    priorReport.inputHashes,
    "Recapture must use the same runtime and source packs.",
  );
  report.flowCases = [];
  report.flowRecapture = {
    startedAt: new Date().toISOString(),
    reason:
      "One bounded replacement of four flow recordings after male PNG encoding stalls. Existing successful UI roundtrips, loop coverage, one-shot checks and original-default checks are retained from the initial run.",
    method:
      "During playback only drawImage copies into per-action/frame offscreen canvases; PNG encoding occurs after recording stops. All flow clips are independently loaded from the same byte-identical candidate packs already exported and verified by the UI.",
    attempts: 1,
  };
}
const server = await createServer({
  root: fileURLToPath(root),
  server: { host: "127.0.0.1", port: 0, hmr: false },
});
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
const button = (page, name) => page.getByRole("button", { name, exact: true });
const editor = (page) =>
  page.getByRole("region", { name: "Sprite action editor" });
function monitor(context, independent = false) {
  context.on("page", (page) =>
    page.on("pageerror", (e) => report.errors.push(e.message)),
  );
  context.on("request", (r) => {
    const url = r.url();
    if (/^https?:/.test(url) && !url.startsWith(origin))
      report.externalRequests.push(url);
    if (
      independent &&
      /SpriteActionEditor|sprite-actions\.ts|\/src\/skeletal\//.test(url)
    )
      report.forbiddenIndependentRequests.push(url);
  });
}
async function screenshot(page, name, locator = page) {
  const path = new URL(name, output).pathname;
  await locator.screenshot({ path });
  report.screenshots.push({
    file: name,
    sha256: sha(await readFile(path)),
    source: "Actual browser display",
  });
}
async function download(page, label, name) {
  const pending = page.waitForEvent("download", { timeout: 120000 });
  await button(page, label).click();
  const path = join(temporary, name);
  await (await pending).saveAs(path);
  const bytes = new Uint8Array(await readFile(path));
  assert(bytes.length);
  const files = unzipSync(bytes);
  assert(Object.keys(files).length);
  const decoded = JSON.parse(
    execFileSync(
      "python",
      [
        "-c",
        `
import io,json,sys,zipfile
from PIL import Image
records=[]
def check(data,prefix='',depth=0):
 assert depth<3
 with zipfile.ZipFile(io.BytesIO(data)) as z:
  assert z.testzip() is None
  for n in z.namelist():
   assert not n.startswith('/') and '..' not in n.split('/')
   b=z.read(n);assert b
   r={'file':prefix+n,'bytes':len(b)}
   if n.endswith('.png'):
    im=Image.open(io.BytesIO(b));im.load();assert im.mode=='RGBA'
    r.update(decoded=True,dimensions=list(im.size),mode=im.mode)
   if n.endswith('.json'):json.loads(b)
   records.append(r)
   if n.endswith('.zip'):check(b,prefix+n+'/',depth+1)
check(open(sys.argv[1],'rb').read())
print(json.dumps({'crcChecked':True,'members':records}))
`,
        path,
      ],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    ),
  );
  report.downloads.push({
    file: name,
    bytes: bytes.length,
    sha256: sha(bytes),
    retained: false,
    note: "Candidate packs are retained once in ../exports; identical UI downloads and self-contained project duplicates are validated in temporary storage.",
    ...decoded,
  });
  return { path, bytes, files };
}
async function pause(page) {
  const active = button(page, "Pause animation");
  if (await active.count()) await active.click();
}
async function sampleLoops(page, character, action, facing, manifest, recipe) {
  await pause(page);
  await button(page, action[0].toUpperCase() + action.slice(1)).click();
  await button(page, facing[0].toUpperCase() + facing.slice(1)).click();
  await page.getByLabel("Playback speed", { exact: true }).selectOption("1");
  await page.getByLabel("Display scale", { exact: true }).selectOption("0.5");
  await page.locator("#player-frame").fill("0");
  const canvas = page.getByTestId("consumer-canvas");
  const clip = manifest.animations[action];
  assert(clip.loop);
  await expect(page.locator(".player-timing")).toHaveText(
    `${clip.fps} FPS · LOOP`,
  );
  await expect(canvas).toHaveAttribute("data-frame-position", "0");
  await expect(canvas).toHaveAttribute(
    "aria-label",
    new RegExp(`${action}, facing ${facing}`),
  );
  await page.evaluate(
    ({ count }) => {
      const canvas = document.querySelector('[data-testid="consumer-canvas"]');
      const state = {
        count,
        wraps: 0,
        entries: [],
        seam: [],
        last: -1,
        started: performance.now(),
      };
      window.__keyframeObservation = state;
      function observe() {
        const position = Number(canvas.dataset.framePosition),
          frameId = Number(canvas.dataset.frameId);
        if (position === state.last) return;
        if (state.last >= 0 && position < state.last) state.wraps++;
        state.last = position;
        const entry = {
          position,
          frameId,
          elapsedMs: performance.now() - state.started,
          cycle: state.wraps,
        };
        state.entries.push(entry);
        if (position >= count - 2 || position < 2) {
          state.seam.push({
            ...entry,
            width: canvas.width,
            height: canvas.height,
            image: canvas.toDataURL("image/png"),
          });
        }
      }
      window.__keyframeObserver?.disconnect();
      window.__keyframeObserver = new MutationObserver(observe);
      window.__keyframeObserver.observe(canvas, {
        attributes: true,
        attributeFilter: ["data-frame-position", "data-frame-id"],
      });
      observe();
    },
    { count: clip.frames.length },
  );
  await button(page, "Play animation").click();
  await page.waitForFunction(
    () =>
      window.__keyframeObservation.wraps >= 4 &&
      window.__keyframeObservation.last >= 1,
    null,
    { timeout: 20000 },
  );
  await pause(page);
  const observation = await page.evaluate(() => {
    window.__keyframeObserver.disconnect();
    return window.__keyframeObservation;
  });
  assert(observation.wraps >= 2);
  for (const entry of observation.entries)
    assert.equal(
      entry.frameId,
      clip.frames[entry.position],
      `${character}/${action}/${facing} frame order`,
    );
  const coverage = Array.from({ length: 4 }, (_, cycle) => ({
    cycle,
    observedTicks: new Set(
      observation.entries
        .filter((e) => e.cycle === cycle)
        .map((e) => e.position),
    ).size,
    expectedTicks: clip.frames.length,
  }));
  const firstCompletePair = coverage.findIndex(
    (entry, i) =>
      i < 3 &&
      entry.observedTicks === clip.frames.length &&
      coverage[i + 1].observedTicks === clip.frames.length,
  );
  assert(
    firstCompletePair >= 0,
    `${character}/${action}/${facing} requires two adjacent complete observed cycles within four: ${JSON.stringify(coverage)}`,
  );
  const reviewedCycles = [firstCompletePair, firstCompletePair + 1];
  observation.seam = observation.seam.filter(
    (e) =>
      (e.cycle === reviewedCycles[0] && e.position >= clip.frames.length - 2) ||
      (e.cycle === reviewedCycles[1] && e.position < 2),
  );
  const wrapTimes = observation.entries
    .filter((e) => e.position === 0 && e.cycle > 0)
    .slice(0, 2)
    .map((e) => e.elapsedMs);
  const expectedWallCycleMs = (clip.frames.length / clip.fps / 1) * 1000;
  const measuredWallCycleMs = wrapTimes[1] - wrapTimes[0];
  assert(
    Math.abs(measuredWallCycleMs - expectedWallCycleMs) < 180,
    `${character}/${action}/${facing} loop timing`,
  );
  assert.deepEqual(
    observation.seam.map((e) => e.position),
    [clip.frames.length - 2, clip.frames.length - 1, 0, 1],
  );
  const seamInputs = [];
  for (const [index, entry] of observation.seam.entries()) {
    const file = join(
      temporary,
      `${character}-${action}-${facing}-seam-${index}.png`,
    );
    await writeFile(file, Buffer.from(entry.image.split(",")[1], "base64"));
    seamInputs.push({
      file,
      position: entry.position,
      frameId: entry.frameId,
      cycle: entry.cycle,
    });
    delete entry.image;
  }
  const filmstrip = `${character}-${action}-${facing}-seam.png`;
  const desc = join(temporary, "seam.json");
  await writeFile(
    desc,
    JSON.stringify({
      entries: seamInputs,
      output: new URL(filmstrip, output).pathname,
      frameWidth: manifest.spritesheet.frameWidth,
      frameHeight: manifest.spritesheet.frameHeight,
      title: `${character} / ${action} / ${facing}: actual continuous playback across wrap; 0.5x source display`,
    }),
  );
  execFileSync("python", [
    "-c",
    `
from PIL import Image,ImageDraw
import json,sys
r=json.load(open(sys.argv[1]));w=r['frameWidth']//2;h=r['frameHeight']//2
out=Image.new('RGB',(4*(w+12),h+70),(245,242,234));d=ImageDraw.Draw(out);d.text((8,8),r['title'],fill=(40,50,40))
for i,e in enumerate(r['entries']):
 im=Image.open(e['file']).convert('RGBA');x=round(im.width/2)-w//2;y=(im.height-h)//2
 part=im.crop((x,y,x+w,y+h));out.paste(part,(i*(w+12),60),part)
 d.text((i*(w+12)+5,30),'tick '+str(e['position'])+' / frame '+str(e['frameId'])+' / cycle '+str(e['cycle']),fill=(40,50,40))
out.save(r['output'])
`,
    desc,
  ]);
  const frameSources = new Map(
    recipe.derivation.frames.map((f) => [f.frameId, f.sourceFrame]),
  );
  const record = {
    character,
    action,
    facing,
    editorContextClosed: true,
    fps: clip.fps,
    playbackSpeed: 1,
    loop: true,
    ticks: clip.frames.length,
    uniqueFrames: new Set(clip.frames).size,
    expectedWallCycleMs,
    measuredWallCycleMs,
    observedWraps: observation.wraps,
    reviewedCycles,
    cycleCoverage: coverage,
    allTicksObservedInReviewedCycles: true,
    seamFilmstrip: filmstrip,
    seamFrames: observation.seam.map((e) => ({
      ...e,
      originalVideoFrame: frameSources.get(e.frameId),
    })),
    observations: observation.entries,
  };
  report.independentCases.push(record);
  report.screenshots.push({
    file: filmstrip,
    sha256: sha(await readFile(new URL(filmstrip, output))),
    source:
      "Four actual canvas captures during continuous playback, cropped to frame rectangle at 0.5x and labeled. No sampled frame redraw.",
  });
}
async function sampleJump(page, character, facing, manifest) {
  await pause(page);
  await page.getByLabel("Wait for a matching pose", { exact: true }).check();
  await button(page, "Jump").click();
  await button(page, facing === "right" ? "Right" : "Left").click();
  await page.getByLabel("Playback speed", { exact: true }).selectOption("1");
  await page.getByLabel("Display scale", { exact: true }).selectOption("0.5");
  await page.locator("#player-frame").fill("0");
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="consumer-canvas"]');
    const state = { started: performance.now(), entries: [], last: "" };
    window.__jumpObservation = state;
    const observe = () => {
      const action = canvas.dataset.action;
      const position = Number(canvas.dataset.framePosition);
      const key = `${action}/${position}`;
      if (key === state.last) return;
      state.last = key;
      state.entries.push({
        action,
        position,
        frameId: Number(canvas.dataset.frameId),
        elapsedMs: performance.now() - state.started,
      });
    };
    window.__jumpObserver = new MutationObserver(observe);
    window.__jumpObserver.observe(canvas, {
      attributes: true,
      attributeFilter: ["data-action", "data-frame-position", "data-frame-id"],
    });
    observe();
  });
  await button(page, "Play animation").click();
  await page.waitForFunction(
    () =>
      window.__jumpObservation.entries.some(
        (e) => e.action === "idle" && e.position >= 1,
      ),
    null,
    { timeout: 10000 },
  );
  await pause(page);
  const observation = await page.evaluate(() => {
    window.__jumpObserver.disconnect();
    return window.__jumpObservation;
  });
  const jumpEntries = observation.entries.filter((e) => e.action === "jump");
  for (const e of observation.entries)
    assert.equal(e.frameId, manifest.animations[e.action].frames[e.position]);
  assert.equal(
    new Set(jumpEntries.map((e) => e.position)).size,
    39,
    "Observe all 39 source jump ticks at normal speed",
  );
  assert.equal(
    jumpEntries.at(-1).frameId,
    manifest.animations.jump.frames.at(-1),
  );
  report.independentCases.push({
    character,
    action: "jump",
    facing,
    editorContextClosed: true,
    playbackSpeed: 1,
    fps: 24,
    ticks: 39,
    loop: false,
    everyTickObserved: true,
    fullRecoveryBeforeIdle: true,
    observations: observation.entries,
  });
}

async function recordFlow(page, character, facing, matching, manifest) {
  await pause(page);
  await page
    .getByLabel("Wait for a matching pose", { exact: true })
    .setChecked(matching);
  await button(page, "Walk").click();
  await button(page, facing === "right" ? "Right" : "Left").click();
  await page.getByLabel("Playback speed", { exact: true }).selectOption("1");
  await page.getByLabel("Display scale", { exact: true }).selectOption("0.5");
  await page.locator("#player-frame").fill("0");
  const record = await page.evaluate(
    async ({ matching }) => {
      const canvas = document.querySelector('[data-testid="consumer-canvas"]');
      const images = new Map();
      const state = {
        matching,
        durationMs: 4800,
        requests: [],
        observations: [],
      };
      const started = performance.now();
      let last = "";
      function read() {
        return {
          action: canvas.dataset.action,
          position: Number(canvas.dataset.framePosition),
          frameId: Number(canvas.dataset.frameId),
          pending: canvas.dataset.pendingAction || "",
          clipElapsedMs: Number(canvas.dataset.elapsedMs),
          elapsedMs: performance.now() - started,
        };
      }
      function observe() {
        const e = read(),
          key = `${e.action}/${e.position}/${e.pending}`;
        if (key === last) return;
        last = key;
        const imageKey = `${e.action}/${e.frameId}`;
        if (!images.has(imageKey)) {
          const crop = document.createElement("canvas");
          crop.width = 352;
          crop.height = 528;
          const context = crop.getContext("2d");
          context.drawImage(
            canvas,
            Math.round(canvas.width / 2) - 176,
            Math.floor((canvas.height - 528) / 2),
            352,
            528,
            0,
            0,
            352,
            528,
          );
          images.set(imageKey, crop);
        }
        state.observations.push({ ...e, imageKey });
      }
      const observer = new MutationObserver(observe);
      observer.observe(canvas, {
        attributes: true,
        attributeFilter: [
          "data-action",
          "data-frame-position",
          "data-frame-id",
          "data-pending-action",
        ],
      });
      observe();
      document.querySelector('button[aria-label="Play animation"]').click();
      const requests = [
        { at: 250, action: "run" },
        { at: 900, action: "jump" },
        { at: 3300, action: "celebrate" },
        { at: 3650, action: "idle" },
      ];
      for (const request of requests)
        setTimeout(() => {
          state.requests.push({ ...request, before: read() });
          [
            ...document.querySelectorAll(
              '[aria-labelledby="player-motion-label"] button',
            ),
          ]
            .find((b) => b.textContent.trim().toLowerCase() === request.action)
            .click();
        }, request.at);
      await new Promise((resolve) => setTimeout(resolve, state.durationMs));
      observe();
      observer.disconnect();
      document.querySelector('button[aria-label="Pause animation"]')?.click();
      const encoded = new Map(
        [...images].map(([key, crop]) => [key, crop.toDataURL("image/png")]),
      );
      for (const entry of state.observations) {
        entry.image = encoded.get(entry.imageKey);
        delete entry.imageKey;
      }
      return state;
    },
    { matching },
  );
  for (const e of record.observations)
    assert.equal(e.frameId, manifest.animations[e.action].frames[e.position]);
  for (const action of ["walk", "run", "jump", "idle", "celebrate"])
    assert(record.observations.some((e) => e.action === action));
  assert(
    record.observations.some((e) => e.action === "jump" && e.position === 38),
    "Full jump recovery displayed",
  );
  if (matching) {
    assert(
      record.observations.some((e) => e.pending),
      "Matching-pose mode visibly queues requests",
    );
    const end = record.observations.findIndex(
      (e, i, all) => e.action === "jump" && all[i + 1]?.action !== "jump",
    );
    assert.equal(record.observations[end + 1]?.action, "idle");
  }
  const folder = join(
    temporary,
    `${character}-${facing}-${matching ? "queued" : "instant"}`,
  );
  await mkdir(folder);
  for (const [i, e] of record.observations.entries()) {
    e.file = join(folder, `${i}.png`);
    await writeFile(e.file, Buffer.from(e.image.split(",")[1], "base64"));
    delete e.image;
  }
  return record;
}

async function captureFlows(page, character, facing, manifest) {
  const instant = await recordFlow(page, character, facing, false, manifest);
  const queued = await recordFlow(page, character, facing, true, manifest);
  const stem = `${character}-flow-${facing}`;
  const descriptor = join(temporary, "flow.json");
  await writeFile(
    descriptor,
    JSON.stringify({
      character,
      facing,
      instant,
      queued,
      output: new URL(stem, output).pathname,
    }),
  );
  const media = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `
from PIL import Image,ImageDraw,ImageFont
import json,sys,hashlib,math
r=json.load(open(sys.argv[1]));w,h=352,528;duration=r['instant']['durationMs'];fps=24
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',11)
cases=[r['instant'],r['queued']];cached={};frames=[]
def load(e):
 if e['file'] not in cached:
  im=Image.open(e['file']).convert('RGBA');assert im.size==(w,h);cached[e['file']]=im
 return cached[e['file']]
def at(case,t):
 entries=[e for e in case['observations'] if e['elapsedMs']<=t]
 return entries[-1] if entries else case['observations'][0]
count=math.ceil(duration*fps/1000)
delays=[round(min(duration,(i+1)*1000/fps)/10)*10-round(i*1000/fps/10)*10 for i in range(count)]
assert min(delays)>=10
for i in range(count):
 t=i*1000/fps;out=Image.new('RGB',(w*2,h+96),'#f3f0e7');d=ImageDraw.Draw(out)
 d.text((9,7),r['character']+' / '+r['facing']+' / actual browser playback at 1x',font=font,fill='#30453b')
 for col,case in enumerate(cases):
  e=at(case,t);im=load(e);out.paste(im,(col*w,90),im)
  d.text((col*w+9,28),'Instant switching' if col==0 else 'Wait for a matching pose',font=font,fill='#30453b')
  d.text((col*w+9,48),e['action']+' | frame '+str(e['frameId'])+' | tick '+str(e['position']),font=small,fill='#30453b')
  d.text((col*w+9,66),'pending: '+(e['pending'] or 'none')+' | '+str(round(t))+' ms',font=small,fill='#30453b')
 frames.append(out)
palette_sheet=Image.new('RGB',(w,h//2*len(frames)))
for i,im in enumerate(frames):palette_sheet.paste(im.resize((w,h//2)),(0,i*(h//2)))
palette=palette_sheet.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
indexed=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in frames]
gif=r['output']+'.gif';indexed[0].save(gif,save_all=True,append_images=indexed[1:],duration=delays,disposal=2,optimize=False)
with Image.open(gif) as im:
 assert 'loop' not in im.info and im.n_frames==len(frames)
 actual=[]
 for i in range(im.n_frames):im.seek(i);im.convert('RGB').load();actual.append(im.info['duration'])
 assert actual==delays
def changes(case):
 out=[]
 for i,e in enumerate(case['observations'][1:],1):
  previous=case['observations'][i-1]
  if e['action']!=previous['action']:out.append((previous,e))
 return out
rows=[]
for target in ['run','jump','celebrate','idle']:
 pairs=[]
 for case in cases:
  choices=[pair for pair in changes(case) if pair[1]['action']==target]
  assert choices
  pairs.append(choices[-1])
 rows.append((target,pairs))
sheet=Image.new('RGB',(704,4*316+38),'#f3f0e7');d=ImageDraw.Draw(sheet)
d.text((8,8),r['character']+' / '+r['facing']+' / observed action boundaries',font=font,fill='#30453b')
for row,(target,pairs) in enumerate(rows):
 for mode,pair in enumerate(pairs):
  for side,e in enumerate(pair):
   x=(mode*2+side)*176;y=38+row*316;im=load(e).resize((176,264),Image.Resampling.LANCZOS)
   sheet.paste(im,(x,y+50),im)
   d.text((x+4,y+4),('instant' if mode==0 else 'queued')+' '+('exit' if side==0 else 'entry'),font=small,fill='#30453b')
   d.text((x+4,y+20),e['action']+' / frame '+str(e['frameId']),font=small,fill='#30453b')
   d.text((x+4,y+35),str(round(e['elapsedMs']))+' ms observed',font=small,fill='#30453b')
png=r['output']+'-boundaries.png';sheet.save(png)
print(json.dumps({'gif':gif,'png':png,'frames':len(frames),'durationMs':sum(delays),'loop':False,'source':'Actual browser canvas samples at 1x, replayed using the latest observed bitmap on a 24 FPS review timeline','gifSha256':hashlib.sha256(open(gif,'rb').read()).hexdigest(),'pngSha256':hashlib.sha256(open(png,'rb').read()).hexdigest(),'decoded':True}))
`,
        descriptor,
      ],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    ),
  );
  const clean = (capture) => ({
    ...capture,
    observations: capture.observations.map(({ file, ...entry }) => entry),
  });
  const sampling = (capture) => ({
    observedJumpTicks: new Set(
      capture.observations
        .filter((e) => e.action === "jump")
        .map((e) => e.position),
    ).size,
    nonTerminalObservationGapsOver90Ms: capture.observations.flatMap(
      (entry, i, all) => {
        const next = all[i + 1];
        if (
          !next ||
          next.elapsedMs - entry.elapsedMs <= 90 ||
          (entry.action === "jump" && entry.position === 38)
        )
          return [];
        return [
          {
            gapMs: next.elapsedMs - entry.elapsedMs,
            from: { action: entry.action, position: entry.position },
            to: { action: next.action, position: next.position },
          },
        ];
      },
    ),
  });
  report.flowCases.push({
    character,
    facing,
    playbackSpeed: 1,
    instant: clean(instant),
    queued: clean(queued),
    sampling: { instant: sampling(instant), queued: sampling(queued) },
    media: { ...media, gif: `${stem}.gif`, png: `${stem}-boundaries.png` },
  });
}

try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  for (const character of ["male", "female"]) {
    const originalBytes = new Uint8Array(
      await readFile(
        new URL(`docs/kling-jump/exports/${character}.character.zip`, root),
      ),
    );
    const candidateBytes = new Uint8Array(
      await readFile(
        new URL(`docs/kling-motion/exports/${character}.character.zip`, root),
      ),
    );
    const candidateFiles = unzipSync(candidateBytes);
    const manifest = JSON.parse(
      Buffer.from(candidateFiles["manifest.json"]).toString(),
    );
    const recipe = JSON.parse(
      Buffer.from(candidateFiles["character.json"]).toString(),
    );
    assert.equal(
      recipe.sourceMetadata.motionFlow.format,
      "gathria-motion-flow",
    );
    if (flowsOnly) {
      assert(
        priorReport.downloads.some(
          (item) =>
            item.file === `${character}.character.zip` &&
            item.sha256 === sha(candidateBytes),
        ),
        "Fresh independent import must match the previously verified UI download.",
      );
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
        deviceScaleFactor: 1,
      });
      monitor(context, true);
      const page = await context.newPage();
      await page.goto(`${origin}/player.html`);
      await page.locator("#player-zip").setInputFiles({
        name: `${character}.character.zip`,
        mimeType: "application/zip",
        buffer: Buffer.from(candidateBytes),
      });
      await expect(page.getByRole("status")).toContainText("Loaded:", {
        timeout: 120000,
      });
      await expect(editor(page)).toHaveCount(0);
      await expect(
        page.getByLabel("Wait for a matching pose", { exact: true }),
      ).toBeChecked();
      for (const facing of ["right", "left"])
        await captureFlows(page, character, facing, manifest);
      await context.close();
      console.log(
        `Recaptured ${character} flow comparisons at normal 1x with PNG encoding deferred until playback stopped.`,
      );
      continue;
    }
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 1,
      acceptDownloads: true,
    });
    monitor(context);
    const page = await context.newPage();
    await page.goto(
      `${origin}/player.html?kling=${character}&variant=motion&authoring=1`,
    );
    await expect(
      editor(page).getByLabel("Start frame", { exact: true }),
    ).toBeEnabled({ timeout: 120000 });
    await expect(page.getByTestId("motion-study-note")).toBeVisible();
    await button(page, "Jump").click();
    await page.locator("#player-frame").fill("0");
    await expect(page.locator(".player-timing")).toHaveText("24 FPS · ONCE");
    await screenshot(
      page,
      `${character}-candidate-editor.png`,
      page.locator(".player-preview-panel"),
    );
    const exported = await download(
      page,
      "Export source CharacterPack",
      `${character}.character.zip`,
    );
    assert.equal(sha(exported.bytes), sha(candidateBytes));
    const project = await download(
      page,
      "Save action project",
      `${character}.sprite-project.zip`,
    );
    assert.equal(
      sha(project.files["original.character.zip"]),
      sha(candidateBytes),
    );
    await page
      .getByLabel("Open action project", { exact: true })
      .setInputFiles(project.path);
    await expect(
      page.getByText("Saved sprite action project", { exact: true }),
    ).toBeVisible({ timeout: 120000 });
    await expect(editor(page).getByRole("status")).toHaveText(
      "Source action settings. Edit frame selection and timing below; the artwork stays intact.",
      { timeout: 120000 },
    );
    await expect(
      editor(page).getByLabel("Start frame", { exact: true }),
    ).toBeEnabled({ timeout: 120000 });
    await button(page, "Jump").click();
    await expect(page.locator(".player-timing")).toHaveText("24 FPS · ONCE");
    const reopened = await download(
      page,
      "Export edited CharacterPack",
      `${character}-reopened.character.zip`,
    );
    assert.equal(sha(reopened.bytes), sha(candidateBytes));
    report.authoringCases.push({
      character,
      sourcePackSha256: sha(originalBytes),
      candidatePackSha256: sha(candidateBytes),
      UIExportExact: true,
      savedProjectEmbeddedSourceExact: true,
      reopenExportExact: true,
      jumpOneShot: true,
    });
    await context.close();
    const independentContext = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 1,
      acceptDownloads: true,
    });
    monitor(independentContext, true);
    const independent = await independentContext.newPage();
    await independent.goto(`${origin}/player.html`);
    await independent.locator("#player-zip").setInputFiles(exported.path);
    await expect(independent.getByRole("status")).toContainText("Loaded:", {
      timeout: 120000,
    });
    await expect(editor(independent)).toHaveCount(0);
    await expect(
      independent.getByLabel("Wait for a matching pose", { exact: true }),
    ).toBeChecked();
    for (const action of ["idle", "walk", "run", "celebrate"])
      for (const facing of ["right", "left"])
        await sampleLoops(
          independent,
          character,
          action,
          facing,
          manifest,
          recipe,
        );
    for (const facing of ["right", "left"]) {
      await sampleJump(independent, character, facing, manifest);
      await captureFlows(independent, character, facing, manifest);
    }
    await screenshot(
      independent,
      `${character}-independent.png`,
      independent.locator(".player-preview-panel"),
    );
    const roundtrip = await download(
      independent,
      "Export selected CharacterPack",
      `${character}-independent.character.zip`,
    );
    assert.equal(sha(roundtrip.bytes), sha(candidateBytes));
    await independentContext.close();
    const originalContext = await browser.newContext({
      viewport: { width: 1100, height: 900 },
      acceptDownloads: true,
    });
    monitor(originalContext);
    const sourcePage = await originalContext.newPage();
    await sourcePage.goto(`${origin}/player.html?kling=${character}`);
    await expect(button(sourcePage, "Jump")).toBeEnabled({ timeout: 120000 });
    await expect(sourcePage.getByTestId("motion-study-note")).toHaveCount(0);
    await button(sourcePage, "Jump").click();
    await expect(sourcePage.locator(".player-timing")).toHaveText(
      "24 FPS · ONCE",
    );
    await expect(button(sourcePage, "Replay animation")).toBeVisible({
      timeout: 10000,
    });
    const sourceExport = await download(
      sourcePage,
      "Export selected CharacterPack",
      `${character}-original.character.zip`,
    );
    assert.equal(sha(sourceExport.bytes), sha(originalBytes));
    report.originalCases.push({
      character,
      defaultOriginal: true,
      jumpOneShot: true,
      stoppedAtLanding: true,
      exportByteExact: true,
    });
    await originalContext.close();
    console.log(
      `Verified ${character}: exact UI export/project roundtrip, 8 loop cases and 2 full-jump returns at 1x, left/right instant-versus-queued flow recordings, original default intact.`,
    );
  }
  assert.equal(report.independentCases.length, 20);
  assert.equal(report.flowCases.length, 4);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.forbiddenIndependentRequests, []);
  assert.deepEqual(
    await hashes(),
    report.inputHashes,
    "Runtime/source files changed during capture.",
  );
  report.pngValidation = JSON.parse(
    execFileSync(
      "python",
      [
        "-c",
        `
from pathlib import Path
from PIL import Image
import json,sys
out=[]
for p in Path(sys.argv[1]).glob('*.png'):
 im=Image.open(p);im.load();out.append({'file':p.name,'bytes':p.stat().st_size,'dimensions':list(im.size),'decoded':True})
print(json.dumps(out))
`,
        fileURLToPath(output),
      ],
      { encoding: "utf8" },
    ),
  );
  report.passed = true;
  report.completedAt = new Date().toISOString();
  if (flowsOnly) report.flowRecapture.completedAt = report.completedAt;
  await writeFile(
    new URL("evidence-index.json", output),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        independentCases: report.independentCases.length,
        downloads: report.downloads.length,
        screenshots: report.screenshots.length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  report.passed = false;
  report.failure = String(error?.stack || error);
  await writeFile(
    new URL("evidence-index.json", output),
    JSON.stringify(report, null, 2) + "\n",
  );
  throw error;
} finally {
  await browser?.close();
  await server.close();
  await rm(temporary, { recursive: true, force: true });
}
