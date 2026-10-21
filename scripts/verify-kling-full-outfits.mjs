// Actual full outfits through the wardrobe UI and a closed-editor player.
// Historical evidence is immutable; pass WARDROBE_FULL_RUN for a new attempt.
// Functional checks and timing observations do not imply artistic acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { createServer, preview } from "vite";
import { unzipSync } from "fflate";

const root = fileURLToPath(new URL("../", import.meta.url));
const run = process.env.WARDROBE_FULL_RUN ?? "";
assert(/^[a-z0-9-]*$/.test(run));
const production = process.env.WARDROBE_PRODUCTION === "1";
const output = join(root, "docs/kling-wardrobe/full-outfits/browser", run);
const exports = join(root, "docs/kling-wardrobe/full-outfits/exports", run);
await mkdir(output, { recursive: true });
await mkdir(exports, { recursive: true });
const reportPath = join(output, "evidence-index.json");
assert(
  !existsSync(reportPath),
  "Choose a new WARDROBE_FULL_RUN; earlier evidence is immutable.",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path).replaceAll("\\", "/");
const parse = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));
const catalog = parse(
  await readFile(join(root, "docs/kling-wardrobe/catalog.json")),
);
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const slotLabels = {
  top: "Top",
  bottom: "Bottom",
  fullBody: "Dress / one-piece",
  shoes: "Shoes",
};
const expectedSelections = {
  male: {
    day: {
      top: "teal-camp-shirt-v1",
      bottom: "ochre-chinos-v1",
      fullBody: null,
      shoes: null,
    },
    wedding: {
      top: "navy-suit-jacket-v1",
      bottom: "navy-suit-trousers-v1",
      fullBody: null,
      shoes: "brown-shoes",
    },
  },
  female: {
    day: {
      top: null,
      bottom: null,
      fullBody: "coral-daydress-v3",
      shoes: null,
    },
    wedding: {
      top: null,
      bottom: null,
      fullBody: "ivory-wedding-dress-v3",
      shoes: null,
    },
  },
};
const sourceInfo = {};
for (const character of ["male", "female"]) {
  const entry = catalog.characters.find((item) => item.key === character);
  assert(entry, `Catalog includes ${character}.`);
  assert.equal(entry.items.length, character === "male" ? 9 : 7);
  const presets = Object.fromEntries(
    Object.keys(expectedSelections[character]).map((look) => {
      const preset = entry.presets.find((item) => item.id === look);
      assert.deepEqual(
        preset?.selection,
        expectedSelections[character][look],
        "Final catalog must be ready before capture.",
      );
      return [look, preset];
    }),
  );
  const sourceBytes = new Uint8Array(
    await readFile(join(root, entry.sourceUrl.slice(1))),
  );
  const sourceFiles = unzipSync(sourceBytes);
  sourceInfo[character] = {
    character,
    entry,
    presets,
    sourceBytes,
    manifest: parse(sourceFiles["manifest.json"]),
    recipe: parse(sourceFiles["character.json"]),
    reviewedFrames:
      character === "male"
        ? [0, 28, 51, 58, 62, 64, 74, 87, 96, 104, 121]
        : [58, 89, 104],
  };
}
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
  "scripts/verify-kling-full-outfits.mjs",
  ...Object.values(sourceInfo).flatMap(({ entry, character }) => [
    entry.sourceUrl.slice(1),
    entry.registrationUrl.slice(1),
    ...entry.items.map((item) => item.url.slice(1)),
    ...["day", "wedding"].flatMap((look) =>
      character === "male"
        ? [
            `docs/kling-wardrobe/exports/male-${look}.wardrobe.zip`,
            `docs/kling-wardrobe/exports/male-${look}.png`,
          ]
        : [
            `docs/kling-wardrobe/fit-v2/exports/female-${look}.wardrobe.zip`,
            `docs/kling-wardrobe/fit-v2/exports/female-${look}-frame-89.png`,
          ],
    ),
  ]),
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
  format: "gathria-wardrobe-full-outfits-browser-evidence",
  version: 1,
  startedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  production,
  inputHashes: await inputHashes(),
  scope:
    "Male full outfits and female V3 day/wedding actual UI exports; explicit old-project pixel comparisons; mixed tops/trousers/shoes; queued transitions; independent five-action/two-facing playback after closing all wardrobe contexts.",
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
  recordings: [],
  mixed: [],
  screenshots: [],
  timings: [],
  errors: [],
  consoleErrors: [],
  failedResponses: [],
  forbiddenIndependentRequests: [],
  externalRequests: [],
  assetResponses: [],
};
const port = Number(process.env.WARDROBE_PORT ?? 5193);
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
// Failed attempts retain their unprocessed recordings next to the raw report.
const temporary = join(output, "recording-source");
await mkdir(temporary, { recursive: true });
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
      /\/src\/(wardrobe|skeletal)\/|WardrobeEditor|SpriteActionEditor|sprite-actions\.ts/.test(
        url,
      )
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
      { encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024 },
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
    await expect(button(page, cap(facing))).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByLabel("Playback speed", { exact: true }).selectOption("1");
    await page.getByLabel("Display scale", { exact: true }).selectOption("0.5");
    await page.locator("#player-frame").fill(String(position));
  }
  const canvas = page.getByTestId(
    mode === "wardrobe" ? "wardrobe-preview" : "consumer-canvas",
  );
  await expect(canvas).toHaveAttribute(
    mode === "wardrobe" ? "data-rendered-action" : "data-action",
    action,
  );
  await expect(canvas).toHaveAttribute("data-frame-position", String(position));
  if (mode === "wardrobe")
    await expect(canvas).toHaveAttribute("data-facing", facing);
  else
    await expect(canvas).toHaveAttribute(
      "aria-label",
      new RegExp(`facing ${facing},`),
    );
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
function verifyObserved(trace, manifest) {
  for (const sample of trace.observations)
    assert.equal(
      sample.frameId,
      manifest.animations[sample.action]?.frames[sample.position],
      "Observation follows the real source frame order.",
    );
}
async function transition(page, mode, source, look, from, to) {
  const { character, manifest } = source;
  await pose(page, mode, from, "right");
  const trace = await observe(page, mode, 2300, to);
  verifyObserved(trace, manifest);
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
    character,
    look,
    from,
    to,
    facing: "right",
    gapsOver90Ms,
    ...trace,
  });
}
async function playback(page, source, look, action, facing) {
  const { character, manifest } = source;
  await pose(page, "independent", action, facing);
  const clip = manifest.animations[action];
  const durationMs = Math.ceil(
    ((clip.frames.length * 1000) / clip.fps) * (clip.loop ? 2.1 : 1) + 200,
  );
  const trace = await observe(page, "independent", durationMs);
  verifyObserved(trace, manifest);
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
    character,
    look,
    action,
    facing,
    sourceFps: clip.fps,
    sourceFrameDurationMs: 1000 / clip.fps,
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
async function exportPose(page, source, look, frameId, mixed = false) {
  const { character, manifest } = source;
  const found = Object.entries(manifest.animations).find(([, clip]) =>
    clip.frames.includes(frameId),
  );
  assert(found, `${character} frame ${frameId} is in a source animation.`);
  const [action, clip] = found;
  await pose(page, "wardrobe", action, "right", clip.frames.indexOf(frameId));
  await expect(page.getByTestId("wardrobe-preview")).toHaveAttribute(
    "data-rendered-frame-id",
    String(frameId),
  );
  const saved = await download(
    page,
    "Save current PNG",
    `${character}-${look}-frame-${frameId}.png`,
    mixed ? "mixed-png" : "png",
  );
  report.poses.push({
    character,
    look,
    frameId,
    action,
    facing: "right",
    mixed,
    file: rel(saved.path),
  });
}
function verifyExportedPoses(packPath, source, look) {
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
 for fid in json.loads(sys.argv[5]):
  f=next(f for f in m['frames'] if f['id']==fid)
  sprite=pages[f.get('page',0)].crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height']))
  native=Image.open(sys.argv[2]+'/'+sys.argv[3]+'-'+sys.argv[4]+'-frame-'+str(fid)+'.png').convert('RGBA')
  assert sprite.size==native.size and sprite.tobytes()==native.tobytes()
  checked.append(fid)
print(json.dumps({'exactNativePngVersusPackFrames':checked}))
`,
        packPath,
        exports,
        source.character,
        look,
        JSON.stringify(source.reviewedFrames),
      ],
      { encoding: "utf8", timeout: 120000 },
    ),
  );
}
async function assertSelection(page, selection) {
  for (const [slot, label] of Object.entries(slotLabels))
    await expect(panel(page).getByLabel(label, { exact: true })).toHaveValue(
      selection[slot] ?? "",
    );
}
async function chooseItem(page, slot, item) {
  await panel(page)
    .getByLabel(slotLabels[slot], { exact: true })
    .selectOption(item ?? "");
  await ready(page, "Outfit updated");
}
async function saveRecording(video, character, look) {
  const destination = join(output, `${character}-${look}-independent.webm`);
  assert(!existsSync(destination));
  await video.saveAs(destination);
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", destination, "-f", "null", "-"],
    { timeout: 120000 },
  );
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-count_frames",
        "-show_entries",
        "format=duration:stream=codec_name,width,height,nb_read_frames,r_frame_rate",
        "-of",
        "json",
        destination,
      ],
      { encoding: "utf8", timeout: 60000 },
    ),
  );
  assert(Number(probe.format.duration) >= 10);
  assert(probe.streams.some((stream) => Number(stream.nb_read_frames) > 100));
  const bytes = await readFile(destination);
  report.recordings.push({
    character,
    look,
    file: rel(destination),
    bytes: bytes.length,
    sha256: sha(bytes),
    decoded: true,
    probe,
    source:
      "Complete fresh independent browser session after all wardrobe windows closed, including pack loading, five actions in both facings and matching-pose transitions. Playwright viewport recording; no trimming or replaced frames. Recording rate is separate from the source 24 fps timing.",
  });
}

try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  for (const source of Object.values(sourceInfo)) {
    const {
      character,
      presets,
      manifest,
      sourceBytes,
      recipe,
      reviewedFrames,
    } = source;
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      acceptDownloads: true,
    });
    context.setDefaultTimeout(30000);
    monitor(context);
    const page = await context.newPage();
    activePage = page;
    await timed(`${character}-original-open`, async () => {
      await page.goto(
        `${origin}/workbench.html?character=${character}&mode=wardrobe`,
      );
      await ready(page, "Original outfit.");
    });
    // Imported projects carry their historical assets. New defaults must not migrate them.
    for (const look of ["day", "wedding"]) {
      const oldDirectory =
        character === "male"
          ? "docs/kling-wardrobe/exports"
          : "docs/kling-wardrobe/fit-v2/exports";
      const path = join(
        root,
        oldDirectory,
        `${character}-${look}.wardrobe.zip`,
      );
      const document = parse(
        unzipSync(new Uint8Array(await readFile(path)))["document.json"],
      );
      assert.notDeepEqual(document.selection, presets[look].selection);
      await panel(page)
        .getByLabel("Open wardrobe project file", { exact: true })
        .setInputFiles(path);
      await ready(page, "Saved outfit and action settings restored");
      await assertSelection(page, document.selection);
      const referenceId = character === "male" ? null : 89;
      if (referenceId === null) await pose(page, "wardrobe", "idle", "right");
      else {
        const [action, clip] = Object.entries(manifest.animations).find(
          ([, clip]) => clip.frames.includes(referenceId),
        );
        await pose(
          page,
          "wardrobe",
          action,
          "right",
          clip.frames.indexOf(referenceId),
        );
        await expect(page.getByTestId("wardrobe-preview")).toHaveAttribute(
          "data-rendered-frame-id",
          String(referenceId),
        );
      }
      const reference = join(
        root,
        oldDirectory,
        `${character}-${look}${referenceId === null ? "" : `-frame-${referenceId}`}.png`,
      );
      const saved = await download(
        page,
        "Save current PNG",
        `${character}-${look}-legacy.png`,
        "legacy-png",
        reference,
      );
      report.legacy.push({
        character,
        look,
        oldProject: rel(path),
        selection: document.selection,
        reference: rel(reference),
        originalNativePixelsUnchanged: true,
        file: rel(saved.path),
      });
      await persist();
    }
    // Old projects intentionally retain their saved registration profile. Open
    // the current entry again before applying assets registered to its new profile.
    await timed(`${character}-current-profile-open`, async () => {
      await page.goto(
        `${origin}/workbench.html?character=${character}&mode=wardrobe`,
      );
      await ready(page, "Original outfit.");
    });
    for (const look of ["day", "wedding"]) {
      const preset = presets[look];
      console.log(`Capturing ${character} ${look}.`);
      await timed(`${character}-${look}-preflight`, async () => {
        await button(panel(page), preset.name).click();
        await ready(page, `${preset.name} selected`);
      });
      await assertSelection(page, preset.selection);
      await pose(page, "wardrobe", "idle", "right");
      await screenshot(
        page,
        `${character}-${look}-workbench.png`,
        page.locator(".wardrobe-editor"),
      );
      for (const id of reviewedFrames) await exportPose(page, source, look, id);
      await transition(page, "wardrobe", source, look, "walk", "run");
      await transition(page, "wardrobe", source, look, "jump", "walk");
      await pose(page, "wardrobe", "run", "left");
      const saved = await download(
        page,
        /Save wardrobe/,
        `${character}-${look}.wardrobe.zip`,
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
      await assertSelection(page, preset.selection);
      const exported = await download(
        page,
        "Export CharacterPack",
        `${character}-${look}.character.zip`,
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
      const matchedPoses = verifyExportedPoses(exported.path, source, look);
      report.projects.push({
        character,
        look,
        selection: preset.selection,
        project: rel(saved.path),
        pack: rel(exported.path),
        reopened: true,
        exactSourceBytes: true,
        actionMetadataAnchorFacingPreserved: true,
        ...matchedPoses,
      });
      if (character === "male") {
        // These cross-preset outfits exercise both trouser materials with a different top/shoe pairing.
        const mixed =
          look === "day"
            ? {
                top: "teal-camp-shirt-v1",
                bottom: "navy-suit-trousers-v1",
                fullBody: null,
                shoes: "brown-shoes",
              }
            : {
                top: "navy-suit-jacket-v1",
                bottom: "ochre-chinos-v1",
                fullBody: null,
                shoes: null,
              };
        await chooseItem(page, "bottom", mixed.bottom);
        await chooseItem(page, "shoes", mixed.shoes);
        await assertSelection(page, mixed);
        for (const id of [58, 74, 104])
          await exportPose(page, source, `${look}-mixed`, id, true);
        report.mixed.push({
          character,
          look,
          selection: mixed,
          frameIds: [58, 74, 104],
          allFramesPreflightPassed: true,
        });
      }
      await persist();
    }
    await context.close();
  }
  report.workbenchClosedAt = new Date().toISOString();
  // No authoring context remains. Each exported pack gets a new standalone context.
  for (const source of Object.values(sourceInfo))
    for (const look of ["day", "wedding"]) {
      const { character } = source;
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
        deviceScaleFactor: 1,
        recordVideo: { dir: temporary, size: { width: 960, height: 734 } },
      });
      context.setDefaultTimeout(30000);
      monitor(context, true);
      const page = await context.newPage();
      activePage = page;
      await page.route(
        /\/src\/(wardrobe|skeletal)\/|WardrobeEditor|SpriteActionEditor|sprite-actions\.ts/,
        (route) => {
          report.forbiddenIndependentRequests.push(route.request().url());
          return route.abort();
        },
      );
      await timed(`${character}-${look}-independent-open`, async () => {
        await page.goto(`${origin}/player.html`);
        await page
          .locator("#player-zip")
          .setInputFiles(join(exports, `${character}-${look}.character.zip`));
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
        for (const facing of ["right", "left"]) {
          await playback(page, source, look, action, facing);
          await persist();
        }
      await transition(page, "independent", source, look, "walk", "run");
      await transition(page, "independent", source, look, "jump", "walk");
      await pose(page, "independent", "run", "left", 4);
      await screenshot(
        page,
        `${character}-${look}-independent-player.png`,
        page.locator(".player-preview-panel"),
      );
      const video = page.video();
      await context.close();
      await saveRecording(video, character, look);
      await persist();
    }
  assert.deepEqual(
    await inputHashes(),
    report.inputHashes,
    "Inputs changed during actual evidence capture.",
  );
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.failedResponses, []);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.forbiddenIndependentRequests, []);
  assert(report.assetResponses.every((r) => r.status >= 200 && r.status < 400));
  if (production)
    assert(
      report.assetResponses.every((r) => !r.url.startsWith("/docs/")),
      "Production must fetch bundled assets.",
    );
  assert.equal(report.playback.length, 40);
  assert.equal(report.transitions.length, 16);
  assert.equal(report.projects.length, 4);
  assert.equal(report.legacy.length, 4);
  assert.equal(report.recordings.length, 4);
  assert.equal(report.mixed.length, 2);
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
  if (report.passed) await rm(temporary, { recursive: true, force: true });
  process.removeListener("SIGINT", onInterrupt);
  process.removeListener("SIGTERM", onTerminate);
}
