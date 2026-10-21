// Actual candidate UI downloads and two continuous loop wraps per independent case.
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
assert(/^[a-z0-9-]+(?:\/[a-z0-9-]+)?$/.test(phase));
const output = new URL(`docs/kling-keyframes/${phase}/`, root);
await mkdir(output, { recursive: true });
assert.equal(
  (await readdir(output)).length,
  0,
  "Use a fresh EVIDENCE_PHASE to preserve evidence.",
);
const temporary = await mkdtemp(join(tmpdir(), "gathria-keyframes-browser-"));
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
    "docs/kling-keyframes/exports",
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
  format: "gathria-kling-keyframe-browser-evidence",
  version: 1,
  startedAt: new Date().toISOString(),
  inputHashes: await hashes(),
  scope:
    "Actual UI export/save/reopen, closed-authoring-context independent playback, two continuous wraps per action and facing. Repeated-hop candidates are separate from original one-shot jumps. Loop observation is functional evidence, not user visual acceptance.",
  downloads: [],
  authoringCases: [],
  independentCases: [],
  originalCases: [],
  screenshots: [],
  errors: [],
  forbiddenIndependentRequests: [],
  externalRequests: [],
};
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
  await page.getByLabel("Playback speed", { exact: true }).selectOption("0.5");
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
        if (
          (state.wraps === 0 && position >= count - 2) ||
          (state.wraps === 1 && position < 2)
        ) {
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
      window.__keyframeObservation.wraps >= 2 &&
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
  for (let cycle = 0; cycle < 2; cycle++) {
    const seen = new Set(
      observation.entries
        .filter((e) => e.cycle === cycle)
        .map((e) => e.position),
    );
    assert.equal(
      seen.size,
      clip.frames.length,
      `${character}/${action}/${facing} must observe every tick in cycle ${cycle}`,
    );
  }
  const wrapTimes = observation.entries
    .filter((e) => e.position === 0 && e.cycle > 0)
    .slice(0, 2)
    .map((e) => e.elapsedMs);
  const expectedWallCycleMs = (clip.frames.length / clip.fps / 0.5) * 1000;
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
    playbackSpeed: 0.5,
    loop: true,
    ticks: clip.frames.length,
    uniqueFrames: new Set(clip.frames).size,
    expectedWallCycleMs,
    measuredWallCycleMs,
    observedWraps: observation.wraps,
    allTicksObservedInBothCycles: true,
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
        new URL(
          `docs/kling-keyframes/exports/${character}.character.zip`,
          root,
        ),
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
      recipe.sourceMetadata.keyframeStudy.format,
      "gathria-kling-keyframe-study",
    );
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 1,
      acceptDownloads: true,
    });
    monitor(context);
    const page = await context.newPage();
    await page.goto(
      `${origin}/player.html?kling=${character}&variant=keyframes&authoring=1`,
    );
    await expect(
      editor(page).getByLabel("Start frame", { exact: true }),
    ).toBeEnabled({ timeout: 120000 });
    await expect(page.getByTestId("keyframe-study-note")).toContainText(
      "repeated hop",
    );
    await button(page, "Jump").click();
    await page.locator("#player-frame").fill("0");
    await expect(page.locator(".player-timing")).toHaveText("24 FPS · LOOP");
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
      editor(page).getByLabel("Start frame", { exact: true }),
    ).toBeEnabled({ timeout: 120000 });
    await button(page, "Jump").click();
    await expect(page.locator(".player-timing")).toHaveText("24 FPS · LOOP");
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
      jumpLoops: true,
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
    for (const action of ["idle", "walk", "run", "jump", "celebrate"])
      for (const facing of ["right", "left"])
        await sampleLoops(
          independent,
          character,
          action,
          facing,
          manifest,
          recipe,
        );
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
    await expect(sourcePage.getByTestId("keyframe-study-note")).toHaveCount(0);
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
      `Verified ${character}: exact UI export/project roundtrip, 10 independent action/facing cases with two wraps, original default intact.`,
    );
  }
  assert.equal(report.independentCases.length, 20);
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
