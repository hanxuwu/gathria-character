// Actual female V2 clothes through the visible wardrobe UI and a closed-editor player.
// Keep V1 artifacts intact. This script checks behavior, not artistic acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { createServer, preview } from "vite";
import { unzipSync } from "fflate";

const root = fileURLToPath(new URL("../", import.meta.url));
const run = process.env.WARDROBE_FIT_RUN ?? "";
assert(/^[a-z0-9-]*$/.test(run));
const production = process.env.WARDROBE_PRODUCTION === "1";
const output = join(root, "docs/kling-wardrobe/fit-v2/browser", run);
const exports = join(root, "docs/kling-wardrobe/fit-v2/exports", run);
await mkdir(output, { recursive: true });
await mkdir(exports, { recursive: true });
const reportPath = join(output, "evidence-index.json");
assert(
  !existsSync(reportPath),
  "Choose a new WARDROBE_FIT_RUN; earlier evidence is immutable.",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path).replaceAll("\\", "/");
const parse = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));
const catalog = parse(
  await readFile(join(root, "docs/kling-wardrobe/catalog.json")),
);
const entry = catalog.characters.find((item) => item.key === "female");
const expectedIds = {
  day: "coral-daydress-v2",
  wedding: "ivory-wedding-dress-v2",
};
const presets = Object.fromEntries(
  Object.keys(expectedIds).map((look) => {
    const preset = entry.presets.find((item) => item.id === look);
    assert.equal(
      preset?.selection.fullBody,
      expectedIds[look],
      "The new catalog must be ready before capture.",
    );
    return [look, preset];
  }),
);
const sourceBytes = new Uint8Array(
  await readFile(join(root, entry.sourceUrl.replace(/^\//, ""))),
);
const sourceFiles = unzipSync(sourceBytes);
const manifest = parse(sourceFiles["manifest.json"]);
const recipe = parse(sourceFiles["character.json"]);
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const reviewedFrames = [87, 89, 58, 64, 104];
const inputPaths = [
  ...execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "src",
      "vite.config.ts",
    ],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split("\n"),
  "docs/kling-wardrobe/catalog.json",
  entry.sourceUrl.slice(1),
  entry.registrationUrl.slice(1),
  ...entry.items.map((item) => item.url.slice(1)),
  "docs/kling-wardrobe/exports/female-day.wardrobe.zip",
  "docs/kling-wardrobe/exports/female-wedding.wardrobe.zip",
];
async function inputHashes() {
  return Object.fromEntries(
    await Promise.all(
      [...new Set(inputPaths)]
        .sort()
        .map(async (path) => [path, sha(await readFile(join(root, path)))]),
    ),
  );
}
const report = {
  format: "gathria-wardrobe-fit-v2-browser-evidence",
  version: 1,
  startedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  production,
  inputHashes: await inputHashes(),
  scope:
    "Female day/wedding V2 actual UI exports, explicit V1 reopen, source-registered poses and mixed shoes, queued transitions, independent five-action/two-facing playback after closing wardrobe.",
  observationMethod:
    "MutationObserver reads metadata published with the painted bitmap at normal speed. Missed positions and intervals are recorded rather than hidden; functional evidence is separate from visual review.",
  timingLimits:
    "Other checks may run on the same host. Recorded intervals describe this capture, not an isolated performance benchmark or a frame-delivery guarantee.",
  downloads: [],
  poses: [],
  legacy: [],
  projects: [],
  transitions: [],
  playback: [],
  screenshots: [],
  timings: [],
  errors: [],
  consoleErrors: [],
  failedResponses: [],
  forbiddenIndependentRequests: [],
  externalRequests: [],
  assetResponses: [],
};
const port = Number(process.env.WARDROBE_PORT ?? 5189);
const server = production
  ? await preview({
      root,
      preview: { host: "127.0.0.1", port, strictPort: true },
    })
  : await createServer({
      root,
      server: { host: "127.0.0.1", port, strictPort: true, hmr: false },
    });
if (!production) await server.listen();
const origin = `http://127.0.0.1:${port}`;
const panel = (page) => page.locator("#wardrobe-panel");
const button = (locator, name) =>
  locator.getByRole("button", { name, exact: typeof name === "string" });
const cap = (value) => value[0].toUpperCase() + value.slice(1);
const persist = () =>
  writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
let browser, activePage;
const interrupt = (signal) => {
  report.interruptedBySignal = signal;
  // Closing the browser rejects the current operation and reaches the same
  // report-preserving finally block as any other failed capture.
  void browser?.close();
};
const onInterrupt = () => interrupt("SIGINT");
const onTerminate = () => interrupt("SIGTERM");
process.once("SIGINT", onInterrupt);
process.once("SIGTERM", onTerminate);
function monitor(context, independent = false) {
  context.on("page", (page) => {
    page.on("pageerror", (error) => report.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error")
        report.consoleErrors.push({
          text: message.text(),
          location: message.location(),
        });
    });
  });
  context.on("request", (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith(origin))
      report.externalRequests.push(url);
    if (
      independent &&
      /\/src\/(wardrobe|skeletal)\/|WardrobeEditor|SpriteActionEditor/.test(url)
    )
      report.forbiddenIndependentRequests.push(url);
  });
  context.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 400)
      report.failedResponses.push({ url, status: response.status() });
    if (url.startsWith(origin) && /\.(zip|json)(\?|$)/.test(url))
      report.assetResponses.push({
        url: url.slice(origin.length),
        status: response.status(),
        independent,
      });
  });
}
async function timed(label, operation) {
  const started = performance.now();
  const result = await operation();
  report.timings.push({ label, durationMs: performance.now() - started });
  return result;
}
async function ready(page, text) {
  await page.waitForFunction(
    (text) => {
      const p = document.querySelector("#wardrobe-panel");
      return (
        p?.querySelector('[role="alert"]') ||
        p?.querySelector('[role="status"]')?.textContent.includes(text)
      );
    },
    text,
    { timeout: 240000 },
  );
  assert.deepEqual(await panel(page).getByRole("alert").allTextContents(), []);
  await expect(panel(page).getByRole("status")).toContainText(text);
}
function decode(path, comparisonPath) {
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        String.raw`
import io,json,sys,zipfile
from PIL import Image
records=[]
def read(data,name,depth=0):
 assert data and depth<=3
 item={'name':name,'bytes':len(data)}
 if name.endswith('.png'):
  im=Image.open(io.BytesIO(data)); im.load()
  assert im.mode=='RGBA'
  item.update(decoded=True,size=list(im.size))
 elif name.endswith('.json'): json.loads(data)
 elif name.endswith('.zip'):
  with zipfile.ZipFile(io.BytesIO(data)) as z:
   assert z.testzip() is None
   item['crcChecked']=True
   for child in z.namelist():
    assert not child.startswith('/') and '..' not in child.split('/')
    read(z.read(child),name+'/'+child,depth+1)
 records.append(item)
read(open(sys.argv[1],'rb').read(),sys.argv[1].split('/')[-1])
result={'members':records}
if len(sys.argv)>2:
 a=Image.open(sys.argv[1]).convert('RGBA'); b=Image.open(sys.argv[2]).convert('RGBA')
 assert a.size==b.size and a.tobytes()==b.tobytes()
 result['matchedReferencePixels']=True
print(json.dumps(result))
`,
        path,
        ...(comparisonPath ? [comparisonPath] : []),
      ],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    ),
  );
}
async function download(page, label, name, kind, comparisonPath) {
  const path = join(exports, name);
  assert(!existsSync(path), `Refusing to replace ${path}.`);
  const pending = page.waitForEvent("download", { timeout: 240000 });
  await button(panel(page), label).click();
  const file = await pending;
  await file.saveAs(path);
  assert.equal(await file.failure(), null);
  const bytes = new Uint8Array(await readFile(path));
  const decoded = decode(path, comparisonPath);
  report.downloads.push({
    file: rel(path),
    kind,
    bytes: bytes.length,
    sha256: sha(bytes),
    ...decoded,
  });
  console.log(`Decoded ${name}: ${bytes.length} bytes.`);
  return {
    path,
    bytes,
    files: name.endsWith(".zip") ? unzipSync(bytes) : undefined,
  };
}
async function screenshot(page, name, locator) {
  const path = join(output, name);
  await locator.screenshot({ path });
  const bytes = await readFile(path);
  // Screenshots may be RGB; this decoder verifies the image without RGBA assumptions.
  execFileSync("python3", [
    "-c",
    "from PIL import Image;import sys;im=Image.open(sys.argv[1]);im.load();assert im.width>0 and im.height>0",
    path,
  ]);
  report.screenshots.push({
    file: rel(path),
    bytes: bytes.length,
    sha256: sha(bytes),
    decoded: true,
  });
}
async function pause(page, mode) {
  const control = button(
    page,
    mode === "wardrobe" ? "Pause wardrobe animation" : "Pause animation",
  );
  if (await control.count()) await control.click();
}
async function pose(page, mode, action, facing, position = 0) {
  await pause(page, mode);
  if (mode === "wardrobe") {
    await panel(page)
      .getByLabel("Wardrobe action", { exact: true })
      .selectOption(action);
    await panel(page)
      .getByLabel("Wardrobe facing", { exact: true })
      .selectOption(facing);
    await panel(page)
      .getByLabel("Wardrobe frame", { exact: true })
      .fill(String(position));
  } else {
    await button(page, cap(action)).click();
    await button(page, cap(facing)).click();
    await page.getByLabel("Playback speed", { exact: true }).selectOption("1");
    await page.getByLabel("Display scale", { exact: true }).selectOption("0.5");
    await page.locator("#player-frame").fill(String(position));
  }
}
async function observe(page, mode, durationMs, requested = null) {
  return page.evaluate(
    async ({ mode, durationMs, requested }) => {
      const canvas = document.querySelector(
        `[data-testid="${mode === "wardrobe" ? "wardrobe-preview" : "consumer-canvas"}"]`,
      );
      const entries = [],
        requests = [];
      let last = "";
      const start = performance.now();
      function capture() {
        const e = {
          action:
            mode === "wardrobe"
              ? canvas.dataset.renderedAction
              : canvas.dataset.action,
          frameId: Number(
            mode === "wardrobe"
              ? canvas.dataset.renderedFrameId
              : canvas.dataset.frameId,
          ),
          position: Number(canvas.dataset.framePosition),
          elapsedMs: Number(canvas.dataset.elapsedMs),
          pending: canvas.dataset.pendingAction || "",
          atMs: performance.now() - start,
        };
        const key = `${e.action}/${e.position}/${e.pending}`;
        if (key !== last) {
          entries.push(e);
          last = key;
        }
      }
      const observer = new MutationObserver(capture);
      observer.observe(canvas, { attributes: true });
      capture();
      document
        .querySelector(
          `button[aria-label="${mode === "wardrobe" ? "Play wardrobe animation" : "Play animation"}"]`,
        )
        .click();
      if (requested)
        setTimeout(() => {
          requests.push({ target: requested, atMs: performance.now() - start });
          if (mode === "wardrobe") {
            const select = document.querySelector(
              'select[aria-label="Wardrobe action"]',
            );
            select.value = requested;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          } else {
            [
              ...document.querySelectorAll(
                '[aria-labelledby="player-motion-label"] button',
              ),
            ]
              .find(
                (button) =>
                  button.textContent.trim().toLowerCase() === requested,
              )
              .click();
          }
        }, 200);
      await new Promise((resolve) => setTimeout(resolve, durationMs));
      capture();
      observer.disconnect();
      document
        .querySelector(
          `button[aria-label="${mode === "wardrobe" ? "Pause wardrobe animation" : "Pause animation"}"]`,
        )
        ?.click();
      return { observations: entries, requests };
    },
    { mode, durationMs, requested },
  );
}
function verifyObserved(trace) {
  for (const sample of trace.observations)
    assert.equal(
      sample.frameId,
      manifest.animations[sample.action]?.frames[sample.position],
      "Observation follows the real source frame order.",
    );
}
async function transition(page, mode, look, from, to) {
  await pose(page, mode, from, "right");
  const trace = await observe(page, mode, 2300, to);
  verifyObserved(trace);
  assert(
    trace.observations.some((s) => s.action === from && s.pending === to),
    "A real matching-pose request is queued.",
  );
  const firstTarget = trace.observations.find((s) => s.action === to);
  assert(firstTarget, `Queued action reaches ${to}.`);
  if (from === "jump") {
    const sourceSamples = trace.observations.filter((s) => s.action === "jump");
    assert(
      sourceSamples.some(
        (s) => s.position >= manifest.animations.jump.frames.length - 2,
      ),
      "Landing/recovery appears before leaving Jump.",
    );
    assert(
      firstTarget.atMs >=
        (manifest.animations.jump.frames.length * 1000) /
          manifest.animations.jump.fps -
          80,
      "Jump cannot cut directly from flight to the requested action.",
    );
  }
  const gapsOver90Ms = trace.observations.flatMap((sample, index) => {
    if (!index) return [];
    const previous = trace.observations[index - 1];
    const milliseconds = sample.atMs - previous.atMs;
    return milliseconds > 90
      ? [
          {
            fromAction: previous.action,
            fromPosition: previous.position,
            toAction: sample.action,
            toPosition: sample.position,
            milliseconds,
          },
        ]
      : [];
  });
  report.transitions.push({
    mode,
    look,
    from,
    to,
    facing: "right",
    gapsOver90Ms,
    ...trace,
  });
}
async function playback(page, look, action, facing) {
  await pose(page, "independent", action, facing);
  const clip = manifest.animations[action];
  const durationMs = Math.ceil(
    ((clip.frames.length * 1000) / clip.fps) * (clip.loop ? 2.1 : 1) + 200,
  );
  const trace = await observe(page, "independent", durationMs);
  verifyObserved(trace);
  const selected = trace.observations.filter((s) => s.action === action);
  const positions = [...new Set(selected.map((s) => s.position))].sort(
    (a, b) => a - b,
  );
  const wraps = selected.reduce(
    (n, s, i) => n + (i && s.position < selected[i - 1].position ? 1 : 0),
    0,
  );
  assert(
    positions.length >= 3,
    "Playback advances instead of displaying one still.",
  );
  if (clip.loop) assert(wraps >= 1, "Loop crosses its final frame.");
  else
    assert(
      trace.observations.some((s) => s.action === "idle"),
      "Full Jump returns to Idle.",
    );
  const gaps = selected.slice(1).map((s, i) => s.atMs - selected[i].atMs);
  report.playback.push({
    look,
    action,
    facing,
    durationMs,
    wraps,
    positions,
    missingPositions: clip.frames
      .map((_, i) => i)
      .filter((i) => !positions.includes(i)),
    maximumObservedGapMs: Math.max(...gaps),
    gapsOver90Ms: gaps.filter((n) => n > 90),
    ...trace,
  });
}
async function exportPose(page, look, frameId, mixed = false) {
  const [action, clip] = Object.entries(manifest.animations).find(([, clip]) =>
    clip.frames.includes(frameId),
  );
  await pose(page, "wardrobe", action, "right", clip.frames.indexOf(frameId));
  await expect(page.getByTestId("wardrobe-preview")).toHaveAttribute(
    "data-rendered-frame-id",
    String(frameId),
  );
  const saved = await download(
    page,
    "Save current PNG",
    `female-${look}${mixed ? "-brown-shoes" : ""}-frame-${frameId}.png`,
    "png",
  );
  report.poses.push({
    look,
    frameId,
    action,
    facing: "right",
    mixedShoes: mixed,
    file: rel(saved.path),
  });
}
function verifyExportedPoses(packPath, look) {
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        String.raw`
import io,json,sys,zipfile
from PIL import Image
with zipfile.ZipFile(sys.argv[1]) as z:
 m=json.loads(z.read('manifest.json'))
 pages=[Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA') for p in [m['spritesheet'],*m.get('additionalSheets',[])]]
 checked=[]
 for fid in [87,89,58,64,104]:
  f=next(f for f in m['frames'] if f['id']==fid)
  sprite=pages[f.get('page',0)].crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height']))
  path=sys.argv[2]+'/female-'+sys.argv[3]+'-frame-'+str(fid)+'.png'
  native=Image.open(path).convert('RGBA')
  assert sprite.size==native.size and sprite.tobytes()==native.tobytes()
  checked.append(fid)
print(json.dumps({'exactNativePngVersusPackFrames':checked}))
`,
        packPath,
        exports,
        look,
      ],
      { encoding: "utf8" },
    ),
  );
}
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  monitor(context);
  const page = await context.newPage();
  activePage = page;
  await timed("female-original-open", async () => {
    await page.goto(`${origin}/workbench.html?character=female&mode=wardrobe`);
    await ready(page, "Original outfit.");
  });
  // Reopening is deliberately explicit: newer catalog IDs must not silently upgrade V1.
  for (const look of ["day", "wedding"]) {
    const path = join(
      root,
      `docs/kling-wardrobe/exports/female-${look}.wardrobe.zip`,
    );
    const files = unzipSync(new Uint8Array(await readFile(path)));
    const document = parse(files["document.json"]);
    assert(!document.selection.fullBody.endsWith("-v2"));
    await panel(page)
      .getByLabel("Open wardrobe project file", { exact: true })
      .setInputFiles(path);
    await ready(page, "Saved outfit and action settings restored");
    await expect(
      panel(page).getByLabel("Dress / one-piece", { exact: true }),
    ).toHaveValue(document.selection.fullBody);
    await pose(page, "wardrobe", "idle", "right");
    const native = await download(
      page,
      "Save current PNG",
      `female-${look}-legacy-v1.png`,
      "legacy-png",
      join(root, `docs/kling-wardrobe/exports/female-${look}.png`),
    );
    report.legacy.push({
      look,
      oldProject: rel(path),
      selectedId: document.selection.fullBody,
      originalNativePixelsUnchanged: true,
      file: rel(native.path),
    });
  }
  for (const look of ["day", "wedding"]) {
    const preset = presets[look];
    await timed(`${look}-v2-preflight`, async () => {
      await button(panel(page), preset.name).click();
      await ready(page, `${preset.name} selected`);
    });
    await expect(
      panel(page).getByLabel("Dress / one-piece", { exact: true }),
    ).toHaveValue(expectedIds[look]);
    await pose(page, "wardrobe", "idle", "right");
    await screenshot(
      page,
      `female-${look}-workbench.png`,
      page.locator(".wardrobe-editor"),
    );
    for (const id of reviewedFrames) await exportPose(page, look, id);
    await transition(page, "wardrobe", look, "walk", "run");
    await transition(page, "wardrobe", look, "jump", "walk");
    await pose(page, "wardrobe", "run", "left");
    const saved = await download(
      page,
      /Save wardrobe/,
      `female-${look}.wardrobe.zip`,
      "project",
    );
    const document = parse(saved.files["document.json"]);
    assert.deepEqual(document.selection, preset.selection);
    assert.deepEqual(document.preview, { action: "run", facing: "left" });
    assert.equal(sha(saved.files["source.character.zip"]), sha(sourceBytes));
    await button(panel(page), "Original").click();
    await ready(page, "Original outfit selected");
    await panel(page)
      .getByLabel("Open wardrobe project file", { exact: true })
      .setInputFiles(saved.path);
    await ready(page, "Saved outfit and action settings restored");
    await expect(
      panel(page).getByLabel("Wardrobe action", { exact: true }),
    ).toHaveValue("run");
    await expect(
      panel(page).getByLabel("Wardrobe facing", { exact: true }),
    ).toHaveValue("left");
    await expect(
      panel(page).getByLabel("Dress / one-piece", { exact: true }),
    ).toHaveValue(expectedIds[look]);
    const exported = await download(
      page,
      "Export CharacterPack",
      `female-${look}.character.zip`,
      "pack",
    );
    const actualManifest = parse(exported.files["manifest.json"]);
    assert.deepEqual(actualManifest.frames, manifest.frames);
    for (const key of ["animations", "anchor", "facing", "scale"])
      assert.deepEqual(actualManifest[key], manifest[key]);
    assert.deepEqual(
      parse(exported.files["character.json"]).sourceMetadata.motionFlow,
      recipe.sourceMetadata.motionFlow,
    );
    const matchedPoses = verifyExportedPoses(exported.path, look);
    report.projects.push({
      look,
      selectedId: expectedIds[look],
      project: rel(saved.path),
      pack: rel(exported.path),
      reopened: true,
      exactSourceBytes: true,
      actionMetadataAnchorFacingPreserved: true,
      ...matchedPoses,
    });
    await panel(page)
      .getByLabel("Shoes", { exact: true })
      .selectOption("brown-shoes");
    await ready(page, "Outfit updated");
    for (const id of [58, 87, 89, 104]) await exportPose(page, look, id, true);
    await persist();
  }
  await context.close();
  report.workbenchClosedAt = new Date().toISOString();
  for (const look of ["day", "wedding"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    monitor(context, true);
    const page = await context.newPage();
    activePage = page;
    await page.route(
      /\/src\/(wardrobe|skeletal)\/|WardrobeEditor|SpriteActionEditor/,
      (route) => {
        report.forbiddenIndependentRequests.push(route.request().url());
        return route.abort();
      },
    );
    await timed(`${look}-independent-open`, async () => {
      await page.goto(`${origin}/player.html`);
      await page
        .locator("#player-zip")
        .setInputFiles(join(exports, `female-${look}.character.zip`));
      await expect(page.getByRole("status")).toContainText("Loaded:", {
        timeout: 180000,
      });
    });
    await expect(
      page.getByLabel("Wait for a matching pose", { exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole("region", { name: "Sprite action editor" }),
    ).toHaveCount(0);
    for (const action of actions)
      for (const facing of ["right", "left"])
        await playback(page, look, action, facing);
    await transition(page, "independent", look, "walk", "run");
    await transition(page, "independent", look, "jump", "walk");
    await pose(page, "independent", "run", "left", 4);
    await screenshot(
      page,
      `female-${look}-independent-player.png`,
      page.locator(".player-preview-panel"),
    );
    await context.close();
    await persist();
  }
  assert.deepEqual(
    await inputHashes(),
    report.inputHashes,
    "Inputs changed during actual evidence capture.",
  );
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.forbiddenIndependentRequests, []);
  assert(report.assetResponses.every((r) => r.status >= 200 && r.status < 400));
  if (production)
    assert(
      report.assetResponses.every((r) => !r.url.startsWith("/docs/")),
      "Production must fetch bundled assets.",
    );
  assert.equal(report.playback.length, 20);
  assert.equal(report.transitions.length, 8);
  assert.equal(report.projects.length, 2);
  assert.equal(report.legacy.length, 2);
  report.passed = true;
  console.log(
    JSON.stringify(
      {
        passed: true,
        downloads: report.downloads.length,
        playback: report.playback.length,
        queuedTransitions: report.transitions.length,
        report: rel(reportPath),
      },
      null,
      2,
    ),
  );
} catch (failure) {
  report.passed = false;
  report.failure = failure.stack || String(failure);
  if (activePage && !activePage.isClosed())
    await activePage
      .screenshot({ path: join(output, "failure.png"), fullPage: true })
      .catch(() => {});
  throw failure;
} finally {
  report.finishedAt = new Date().toISOString();
  await persist();
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  if (!production) await server.close();
  process.removeListener("SIGINT", onInterrupt);
  process.removeListener("SIGTERM", onTerminate);
}
