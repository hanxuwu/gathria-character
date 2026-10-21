// Real clothing-library assets through the workbench UI and a fresh independent
// player. Synthetic browser fixtures are tested separately; never used here.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { createServer, preview as createPreview } from "vite";
import { unzipSync } from "fflate";

const root = fileURLToPath(new URL("../", import.meta.url));
const run = process.env.WARDROBE_EVIDENCE_RUN ?? "";
assert(/^[a-z0-9-]*$/.test(run));
const production = process.env.WARDROBE_PRODUCTION === "1";
const output = join(root, "docs/kling-wardrobe/browser", run);
const exportDirectory = join(root, "docs/kling-wardrobe/exports", run);
await mkdir(output, { recursive: true });
await mkdir(exportDirectory, { recursive: true });
assert(
  !existsSync(join(output, "evidence-index.json")),
  "Use a new WARDROBE_EVIDENCE_RUN to preserve earlier evidence.",
);
const temporary = await mkdtemp(join(tmpdir(), "gathria-wardrobe-browser-"));
const catalog = JSON.parse(
  await readFile(join(root, "docs/kling-wardrobe/catalog.json"), "utf8"),
);
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const slots = ["top", "bottom", "fullBody", "shoes"];
const slotLabels = {
  top: "Top",
  bottom: "Bottom",
  fullBody: "Dress / one-piece",
  shoes: "Shoes",
};
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const capital = (name) => name[0].toUpperCase() + name.slice(1);
const relativeFile = (path) => relative(root, path).replaceAll("\\", "/");
const parseJSON = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));
const inputPaths = [
  ...new Set(
    execFileSync(
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
        "docs/kling-wardrobe/catalog.json",
        "docs/kling-wardrobe/registration",
        "docs/kling-wardrobe/garments",
        "docs/kling-wardrobe/templates",
      ],
      { cwd: root, encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter((path) => path && existsSync(join(root, path))),
  ),
].sort();
async function inputHashes() {
  return Object.fromEntries(
    await Promise.all(
      inputPaths.map(async (path) => [
        path,
        sha(await readFile(join(root, path))),
      ]),
    ),
  );
}
const report = {
  format: "gathria-kling-wardrobe-browser-evidence",
  version: 1,
  startedAt: new Date().toISOString(),
  production,
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  inputHashes: await inputHashes(),
  scope:
    "Actual catalog clothing through UI selection, fitting-guide/source comparison, five actions and both facings, project save/reopen, native PNG and CharacterPack download; then close the workbench context and load each downloaded pack into a fresh independent player. Functional evidence is separate from visual acceptance.",
  observationMethod:
    "MutationObserver reads canvas frame metadata published with its bitmap. Playback runs at normal 1x speed. Raw observations, missed positions and gaps are reported; no assertion that browser instrumentation sees every engine tick. ZIP/PNG decoding and metadata checks are independent of observation coverage.",
  loadTimingMethod:
    "Wall time from the browser operation until the ready state. Outfit timings include asset fetch, decoding and all-frame validation; they are separate from warm playback observations. Fresh contexts have no application caches, while HTTP/browser caches may remain warm.",
  loadTimings: [],
  downloads: [],
  nativeFrames: [],
  mixedOutfits: [],
  authoring: [],
  characterReturns: [],
  independent: [],
  playback: [],
  screenshots: [],
  recordings: [],
  errors: [],
  consoleErrors: [],
  consoleErrorDetails: [],
  failedHttpResponses: [],
  forbiddenIndependentRequests: [],
  externalRequests: [],
  localAssetResponses: [],
};
const server = production
  ? await createPreview({
      root,
      preview: {
        host: "127.0.0.1",
        port: Number(process.env.WARDROBE_PORT ?? 5187),
        strictPort: true,
      },
    })
  : await createServer({
      root,
      server: {
        host: "127.0.0.1",
        port: Number(process.env.WARDROBE_PORT ?? 5187),
        strictPort: true,
        hmr: false,
      },
    });
if (!production) await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
let activePage;
const button = (page, name) => page.getByRole("button", { name, exact: true });
const editor = (page) => page.locator("#wardrobe-panel");
async function wardrobeReady(page, text, timeout = 180000) {
  await page.waitForFunction(
    (expected) => {
      const panel = document.querySelector("#wardrobe-panel");
      return Boolean(
        panel?.querySelector('[role="alert"]') ||
          panel
            ?.querySelector('[role="status"]')
            ?.textContent.includes(expected),
      );
    },
    text,
    { timeout },
  );
  const failure = await editor(page).getByRole("alert").allTextContents();
  assert.equal(failure.length, 0, failure.join("\n"));
  await expect(editor(page).getByRole("status")).toContainText(text);
}
async function timedLoad(description, operation) {
  const started = performance.now();
  try {
    const result = await operation();
    report.loadTimings.push({
      ...description,
      durationMs: performance.now() - started,
      completed: true,
    });
    return result;
  } catch (failure) {
    report.loadTimings.push({
      ...description,
      durationMs: performance.now() - started,
      completed: false,
    });
    throw failure;
  }
}
function monitor(context, independent = false) {
  context.on("page", (page) => {
    page.on("pageerror", (failure) => report.errors.push(failure.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        report.consoleErrors.push(message.text());
        report.consoleErrorDetails.push({
          text: message.text(),
          location: message.location(),
          pageUrl: page.url(),
        });
      }
    });
  });
  context.on("request", (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith(origin))
      report.externalRequests.push(url);
    if (
      independent &&
      /\/src\/(?:wardrobe|skeletal)\/|WardrobeEditor|SpriteActionEditor|sprite-actions\.ts/.test(
        url,
      )
    )
      report.forbiddenIndependentRequests.push(url);
  });
  context.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 400)
      report.failedHttpResponses.push({
        url: url.startsWith(origin) ? url.slice(origin.length) : url,
        status: response.status(),
        resourceType: response.request().resourceType(),
        independent,
      });
    if (url.startsWith(origin) && /\.(?:zip|json)(?:\?|$)/.test(url)) {
      const headers = response.headers();
      report.localAssetResponses.push({
        independent,
        url: url.slice(origin.length),
        status: response.status(),
        contentType: headers["content-type"] ?? null,
        contentLength: Number(headers["content-length"]) || null,
      });
    }
  });
}
async function persist() {
  await writeFile(
    join(output, "evidence-index.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
async function screenshot(page, name, target = page) {
  const path = join(output, name);
  await target.screenshot({
    path,
    ...(target === page ? { fullPage: true } : {}),
  });
  const data = await readFile(path);
  report.screenshots.push({
    file: relativeFile(path),
    sha256: sha(data),
    bytes: data.length,
    source: "Actual browser display",
  });
}
function decodedFile(path, recursive = false) {
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        String.raw`
import io,json,sys,zipfile
from PIL import Image
records=[]
def decode(data,name,depth=0):
 assert data and depth<=3
 record={'file':name,'bytes':len(data)}
 if name.endswith('.png'):
  im=Image.open(io.BytesIO(data));im.load();assert im.mode=='RGBA'
  record.update(decoded=True,dimensions=list(im.size),mode=im.mode)
 if name.endswith('.json'):json.loads(data)
 records.append(record)
 if name.endswith('.zip'):
  with zipfile.ZipFile(io.BytesIO(data)) as z:
   assert z.testzip() is None
   for child in z.namelist():
    assert not child.startswith('/') and '..' not in child.split('/')
    if child.endswith('.zip') and sys.argv[2]!='1':continue
    decode(z.read(child),name+'/'+child,depth+1)
decode(open(sys.argv[1],'rb').read(),sys.argv[1].split('/')[-1])
print(json.dumps({'crcChecked':sys.argv[1].endswith('.zip'),'members':records}))
`,
        path,
        recursive ? "1" : "0",
      ],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    ),
  );
}
async function download(page, label, filename, kind) {
  const path = join(exportDirectory, filename);
  assert(!existsSync(path), `Refusing to overwrite ${path}.`);
  const pending = page.waitForEvent("download", { timeout: 240000 });
  await editor(page)
    .getByRole("button", { name: label, exact: typeof label === "string" })
    .click();
  const file = await pending;
  await file.saveAs(path);
  assert.equal(await file.failure(), null);
  const bytes = new Uint8Array(await readFile(path));
  assert(bytes.length > 0);
  const decoded = decodedFile(path, kind === "project");
  report.downloads.push({
    file: relativeFile(path),
    kind,
    bytes: bytes.length,
    sha256: sha(bytes),
    ...decoded,
  });
  console.log(`Downloaded and decoded ${filename}: ${bytes.length} bytes.`);
  return {
    path,
    bytes,
    files: filename.endsWith(".zip") ? unzipSync(bytes) : null,
  };
}
async function pause(page, mode) {
  const label =
    mode === "wardrobe" ? "Pause wardrobe animation" : "Pause animation";
  const control = button(page, label);
  if (await control.count()) await control.click();
}
async function setPose(page, mode, action, facing, position = 0) {
  await pause(page, mode);
  if (mode === "wardrobe") {
    await editor(page)
      .getByLabel("Wardrobe action", { exact: true })
      .selectOption(action);
    await editor(page)
      .getByLabel("Wardrobe facing", { exact: true })
      .selectOption(facing);
    await editor(page)
      .getByLabel("Wardrobe frame", { exact: true })
      .fill(String(position));
  } else {
    await button(page, capital(action)).click();
    await button(page, capital(facing)).click();
    await page.getByLabel("Playback speed", { exact: true }).selectOption("1");
    await page.getByLabel("Display scale", { exact: true }).selectOption("0.5");
    await page.locator("#player-frame").fill(String(position));
  }
}
async function observePlayback(
  page,
  mode,
  character,
  look,
  manifest,
  action,
  facing,
) {
  await setPose(page, mode, action, facing);
  const clip = manifest.animations[action];
  const selector =
    mode === "wardrobe"
      ? '[data-testid="wardrobe-preview"]'
      : '[data-testid="consumer-canvas"]';
  const target = page.locator(selector);
  await expect(target).toHaveAttribute("data-frame-id", String(clip.frames[0]));
  const durationMs = Math.ceil(
    ((clip.frames.length * 1000) / clip.fps) * (clip.loop ? 2.2 : 1) + 180,
  );
  const observations = await page.evaluate(
    async ({ selector, mode, durationMs }) => {
      const canvas = document.querySelector(selector);
      const entries = [];
      const started = performance.now();
      let last = "";
      function observe() {
        const entry = {
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
          clipElapsedMs: Number(canvas.dataset.elapsedMs),
          pending: canvas.dataset.pendingAction || "",
          observedAtMs: performance.now() - started,
        };
        const key = `${entry.action}/${entry.position}`;
        if (key !== last) {
          entries.push(entry);
          last = key;
        }
      }
      const observer = new MutationObserver(observe);
      observer.observe(canvas, { attributes: true });
      observe();
      document
        .querySelector(
          `button[aria-label="${mode === "wardrobe" ? "Play wardrobe animation" : "Play animation"}"]`,
        )
        .click();
      await new Promise((resolve) => setTimeout(resolve, durationMs));
      observe();
      observer.disconnect();
      document
        .querySelector(
          `button[aria-label="${mode === "wardrobe" ? "Pause wardrobe animation" : "Pause animation"}"]`,
        )
        ?.click();
      return entries;
    },
    { selector, mode, durationMs },
  );
  for (const observation of observations)
    assert.equal(
      observation.frameId,
      manifest.animations[observation.action]?.frames[observation.position],
      "Observed bitmap metadata must match its action frame order.",
    );
  const selected = observations.filter((entry) => entry.action === action);
  const positions = [...new Set(selected.map((entry) => entry.position))].sort(
    (a, b) => a - b,
  );
  const wraps = selected.reduce(
    (count, entry, index) =>
      count + (index && entry.position < selected[index - 1].position ? 1 : 0),
    0,
  );
  assert(
    selected.length >= 2 && positions.length >= Math.min(3, clip.frames.length),
    "The selected action must actually advance.",
  );
  if (clip.loop) assert(wraps >= 1, "A full loop boundary must be observed.");
  else
    assert(
      observations.some((entry) => entry.action === "idle"),
      "The complete jump returns to Idle.",
    );
  const missingPositions = clip.frames
    .map((_, index) => index)
    .filter((index) => !positions.includes(index));
  const gapsOver90Ms = observations.flatMap((entry, index) =>
    index && entry.observedAtMs - observations[index - 1].observedAtMs > 90
      ? [
          {
            from: observations[index - 1].position,
            to: entry.position,
            milliseconds:
              entry.observedAtMs - observations[index - 1].observedAtMs,
          },
        ]
      : [],
  );
  const warmGaps = selected
    .slice(2)
    .map(
      (entry, index) => entry.observedAtMs - selected[index + 1].observedAtMs,
    )
    .sort((a, b) => a - b);
  const quantile = (fraction) =>
    warmGaps.length
      ? warmGaps[
          Math.min(warmGaps.length - 1, Math.floor(warmGaps.length * fraction))
        ]
      : null;
  report.playback.push({
    mode,
    character,
    look,
    action,
    facing,
    fps: clip.fps,
    loop: clip.loop,
    durationMs,
    observedPositions: positions,
    missingPositions,
    wraps,
    gapsOver90Ms,
    warmObservedCadence: {
      targetFrameMs: 1000 / clip.fps,
      samples: warmGaps.length,
      medianMs: quantile(0.5),
      p95Ms: quantile(0.95),
      maximumMs: warmGaps.at(-1) ?? null,
      method:
        "Intervals between observed position changes within the selected action, excluding the initial play interval and later action transitions. Includes skipped render positions; not a guarantee that every source frame was displayed.",
    },
    observations,
  });
  assert.equal(await editor(page).getByRole("alert").count(), 0);
}
async function recordFlow(page, character, look, manifest) {
  await setPose(page, "independent", "walk", "right");
  await page.getByTestId("consumer-canvas").scrollIntoViewIfNeeded();
  const trace = await page.evaluate(async () => {
    const canvas = document.querySelector('[data-testid="consumer-canvas"]');
    const entries = [],
      requests = [];
    const started = performance.now();
    let last = "";
    function observe() {
      const e = {
        action: canvas.dataset.action,
        frameId: Number(canvas.dataset.frameId),
        position: Number(canvas.dataset.framePosition),
        clipElapsedMs: Number(canvas.dataset.elapsedMs),
        pending: canvas.dataset.pendingAction || "",
        observedAtMs: performance.now() - started,
      };
      const key = `${e.action}/${e.position}/${e.pending}`;
      if (key !== last) {
        last = key;
        entries.push(e);
      }
    }
    const observer = new MutationObserver(observe);
    observer.observe(canvas, { attributes: true });
    observe();
    document.querySelector('button[aria-label="Play animation"]').click();
    const timeline = [
      { at: 400, action: "run" },
      { at: 1200, action: "jump" },
      { at: 3300, action: "celebrate" },
      { at: 4250, action: "idle" },
    ];
    for (const request of timeline)
      setTimeout(() => {
        requests.push({ ...request, actualAtMs: performance.now() - started });
        [
          ...document.querySelectorAll(
            '[aria-labelledby="player-motion-label"] button',
          ),
        ]
          .find(
            (button) =>
              button.textContent.trim().toLowerCase() === request.action,
          )
          .click();
      }, request.at);
    await new Promise((resolve) => setTimeout(resolve, 5600));
    observe();
    observer.disconnect();
    document.querySelector('button[aria-label="Pause animation"]')?.click();
    return { durationMs: 5600, requests, observations: entries };
  });
  for (const entry of trace.observations)
    assert.equal(
      entry.frameId,
      manifest.animations[entry.action]?.frames[entry.position],
    );
  for (const action of actions)
    assert(
      trace.observations.some((entry) => entry.action === action),
      `Recorded flow includes ${action}.`,
    );
  assert(
    trace.observations.some((entry) => entry.pending),
    "Matching-pose switching must queue a request.",
  );
  return { character, look, playbackSpeed: 1, ...trace };
}
function choosePreset(entry, look) {
  const exact = entry.presets.find((preset) => preset.id === look);
  if (exact) return exact;
  const matches = entry.presets.filter((preset) =>
    (look === "day" ? /day|daily|casual/i : /wedding|formal/i).test(
      `${preset.id} ${preset.name}`,
    ),
  );
  assert.equal(
    matches.length,
    1,
    `Catalog needs an unambiguous ${entry.key} ${look} preset.`,
  );
  return matches[0];
}
async function openIndependent(packPath, character, look, recording = false) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
    ...(recording
      ? { recordVideo: { dir: temporary, size: { width: 960, height: 734 } } }
      : {}),
  });
  monitor(context, true);
  const page = await context.newPage();
  activePage = page;
  await page.route(
    /\/src\/(?:wardrobe|skeletal)\/|WardrobeEditor|SpriteActionEditor|sprite-actions\.ts/,
    (route) => {
      report.forbiddenIndependentRequests.push(route.request().url());
      return route.abort();
    },
  );
  await timedLoad(
    {
      stage: "independent-pack-open",
      character,
      look,
      recording,
      freshContext: true,
    },
    async () => {
      await page.goto(`${origin}/player.html`);
      await page.locator("#player-zip").setInputFiles(packPath);
      await expect(page.getByRole("status")).toContainText("Loaded:", {
        timeout: 180000,
      });
    },
  );
  await expect(
    page.getByRole("region", { name: "Sprite action editor" }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Wait for a matching pose", { exact: true }),
  ).toBeChecked();
  return { context, page };
}

try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  const libraryContext = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  monitor(libraryContext);
  const library = await libraryContext.newPage();
  activePage = library;
  await library.goto(origin);
  await library
    .locator(".library-character__art img")
    .evaluateAll((images) =>
      Promise.all(images.map((image) => image.decode())),
    );
  for (const key of ["male", "female"])
    await expect(
      library.getByRole("link", { name: `Dress Kling ${key}`, exact: true }),
    ).toHaveAttribute("href", `/workbench.html?character=${key}&mode=wardrobe`);
  await screenshot(library, "library-desktop.png");
  await library.setViewportSize({ width: 390, height: 844 });
  assert(
    (await library.evaluate(() => document.documentElement.scrollWidth)) <= 390,
    "Library stays within the mobile viewport.",
  );
  await screenshot(library, "library-mobile.png");
  await libraryContext.close();
  for (const entry of catalog.characters) {
    const sourceBytes = new Uint8Array(
      await readFile(join(root, entry.sourceUrl.replace(/^\//, ""))),
    );
    const originalFiles = unzipSync(sourceBytes);
    const sourceManifest = parseJSON(originalFiles["manifest.json"]),
      sourceRecipe = parseJSON(originalFiles["character.json"]);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 1,
      acceptDownloads: true,
    });
    monitor(context);
    const page = await context.newPage();
    activePage = page;
    await timedLoad(
      {
        stage: "original-character-open",
        character: entry.key,
        freshContext: true,
      },
      async () => {
        await page.goto(
          `${origin}/workbench.html?character=${entry.key}&mode=wardrobe`,
        );
        await wardrobeReady(page, "Original outfit.");
      },
    );
    await expect(
      page.locator('iframe[title="Sprite action workspace"]'),
    ).toHaveCount(0);
    if (entry.templateUrl) {
      await editor(page).locator(".wardrobe-guides summary").click();
      const pending = page.waitForEvent("download", { timeout: 120000 });
      await editor(page)
        .getByRole("link", { name: "Download clothing template", exact: true })
        .click();
      const templateFile = await pending;
      const templatePath = join(
        temporary,
        `${entry.key}.wardrobe-template.zip`,
      );
      await templateFile.saveAs(templatePath);
      assert.equal(await templateFile.failure(), null);
      const templateBytes = new Uint8Array(await readFile(templatePath));
      const templateFiles = unzipSync(templateBytes);
      assert(Object.keys(templateFiles).length > 5);
      report.downloads.push({
        kind: "template",
        character: entry.key,
        file: entry.templateUrl,
        retained: "Existing canonical authoring template",
        bytes: templateBytes.length,
        sha256: sha(templateBytes),
        zipMembers: Object.keys(templateFiles).length,
        actualLinkDownload: true,
      });
      await editor(page).locator(".wardrobe-guides summary").click();
    }
    for (const look of ["day", "wedding"]) {
      const preset = choosePreset(entry, look),
        stem = `${entry.key}-${look}`;
      console.log(`Opening real ${stem}: ${preset.name}.`);
      await timedLoad(
        {
          stage: "first-outfit-preflight",
          character: entry.key,
          look,
          preset: preset.id,
        },
        async () => {
          await button(editor(page), preset.name).click();
          await wardrobeReady(page, `${preset.name} selected`, 240000);
        },
      );
      for (const slot of slots)
        await expect(
          editor(page).getByLabel(slotLabels[slot], { exact: true }),
        ).toHaveValue(preset.selection[slot] ?? "");
      await setPose(page, "wardrobe", "idle", "right");
      await screenshot(
        page,
        `${stem}-workbench.png`,
        page.locator(".wardrobe-editor"),
      );
      await editor(page)
        .getByLabel("Compare original", { exact: true })
        .check();
      await editor(page).getByLabel("Show anchors", { exact: true }).check();
      await screenshot(
        page,
        `${stem}-anchors-and-source.png`,
        page.locator(".wardrobe-review"),
      );
      await editor(page).getByLabel("Show anchors", { exact: true }).uncheck();
      await editor(page)
        .getByLabel("Compare original", { exact: true })
        .uncheck();
      for (const action of actions)
        for (const facing of ["right", "left"])
          await observePlayback(
            page,
            "wardrobe",
            entry.key,
            look,
            sourceManifest,
            action,
            facing,
          );
      await setPose(page, "wardrobe", "run", "left");
      const saved = await download(
        page,
        /Save wardrobe/,
        `${stem}.wardrobe.zip`,
        "project",
      );
      const document = parseJSON(saved.files["document.json"]);
      assert.deepEqual(document.preview, { action: "run", facing: "left" });
      assert.deepEqual(document.selection, preset.selection);
      assert.equal(document.sourceSha256, sha(sourceBytes));
      assert.equal(sha(saved.files["source.character.zip"]), sha(sourceBytes));
      await button(editor(page), "Original").click();
      await wardrobeReady(page, "Original outfit selected");
      await timedLoad(
        {
          stage: "saved-project-reopen",
          character: entry.key,
          look,
          previouslyValidated: true,
        },
        async () => {
          await editor(page)
            .getByLabel("Open wardrobe project file", { exact: true })
            .setInputFiles(saved.path);
          await wardrobeReady(
            page,
            "Saved outfit and action settings restored",
            240000,
          );
        },
      );
      await expect(
        editor(page).getByLabel("Wardrobe action", { exact: true }),
      ).toHaveValue("run");
      await expect(
        editor(page).getByLabel("Wardrobe facing", { exact: true }),
      ).toHaveValue("left");
      for (const slot of slots)
        await expect(
          editor(page).getByLabel(slotLabels[slot], { exact: true }),
        ).toHaveValue(preset.selection[slot] ?? "");
      await setPose(page, "wardrobe", "idle", "right");
      const native = await download(
        page,
        "Save current PNG",
        `${stem}.png`,
        "png",
      );
      report.nativeFrames.push({
        file: relativeFile(native.path),
        character: entry.key,
        look,
        action: "idle",
        facing: "right",
        frameId: sourceManifest.animations.idle.frames[0],
        sha256: sha(native.bytes),
        bytes: native.bytes.length,
      });
      const exported = await download(
        page,
        "Export CharacterPack",
        `${stem}.character.zip`,
        "pack",
      );
      const manifest = parseJSON(exported.files["manifest.json"]),
        recipe = parseJSON(exported.files["character.json"]);
      assert.deepEqual(manifest.animations, sourceManifest.animations);
      assert.deepEqual(manifest.anchor, sourceManifest.anchor);
      assert.deepEqual(manifest.facing, sourceManifest.facing);
      assert.deepEqual(
        recipe.sourceMetadata.motionFlow,
        sourceRecipe.sourceMetadata.motionFlow,
      );
      report.authoring.push({
        character: entry.key,
        look,
        preset: preset.id,
        selection: preset.selection,
        embeddedSourceBytesUnchanged: true,
        allFramePreflightAccepted: true,
        projectRestored: true,
        restoredPreview: document.preview,
        exportedPack: relativeFile(exported.path),
        anchorsAndOriginalComparison: true,
      });
      await persist();
    }
    if (entry.key === "female") {
      const shoe = entry.items.find((item) => item.id === "brown-shoes");
      assert(
        shoe?.slot === "shoes",
        "The female catalog includes registered brown shoes.",
      );
      for (const look of ["day", "wedding"]) {
        const preset = choosePreset(entry, look);
        assert(
          preset.selection.fullBody,
          "The mixed outfit check uses a real dress.",
        );
        await button(editor(page), preset.name).click();
        await wardrobeReady(page, `${preset.name} selected`, 240000);
        await timedLoad(
          { stage: "mixed-dress-shoes-preflight", character: "female", look },
          async () => {
            await editor(page)
              .getByLabel("Shoes", { exact: true })
              .selectOption(shoe.id);
            await wardrobeReady(page, "Outfit updated", 240000);
          },
        );
        await expect(
          editor(page).getByLabel("Dress / one-piece", { exact: true }),
        ).toHaveValue(preset.selection.fullBody);
        await expect(
          editor(page).getByLabel("Shoes", { exact: true }),
        ).toHaveValue(shoe.id);
        const frames = [];
        for (const frameId of [51, 58, 87, 104]) {
          const found = Object.entries(sourceManifest.animations).find(
            ([, clip]) => clip.frames.includes(frameId),
          );
          assert(found, `Source animation includes frame ${frameId}.`);
          const [action, clip] = found;
          await setPose(
            page,
            "wardrobe",
            action,
            "right",
            clip.frames.indexOf(frameId),
          );
          await expect(page.getByTestId("wardrobe-preview")).toHaveAttribute(
            "data-rendered-frame-id",
            String(frameId),
          );
          const native = await download(
            page,
            "Save current PNG",
            `female-${look}-brown-shoes-frame-${frameId}.png`,
            "png",
          );
          frames.push({
            file: relativeFile(native.path),
            frameId,
            action,
            facing: "right",
            sha256: sha(native.bytes),
            bytes: native.bytes.length,
          });
        }
        report.mixedOutfits.push({
          character: "female",
          look,
          selection: { ...preset.selection, shoes: shoe.id },
          allFramePreflightAccepted: true,
          frames,
          scope:
            "Real UI dress-plus-shoes selection with all-frame ownership validation and four source-registered native PNG downloads. Static seam review is separate from preflight acceptance.",
        });
        await persist();
      }
    }
    if (entry.key === "male") {
      // Evict the source pages with the other body, then restore the retained
      // wardrobe and check that cached validation also warms playback assets.
      await timedLoad(
        { stage: "switch-character", from: "male", character: "female" },
        async () => {
          await editor(page)
            .getByLabel("Wardrobe character", { exact: true })
            .selectOption("female");
          await wardrobeReady(page, "Original outfit.");
        },
      );
      await timedLoad(
        {
          stage: "retained-character-return",
          from: "female",
          character: "male",
          previouslyValidated: true,
        },
        async () => {
          await editor(page)
            .getByLabel("Wardrobe character", { exact: true })
            .selectOption("male");
          await wardrobeReady(page, "Restored this character’s open outfit.");
        },
      );
      const restored = choosePreset(entry, "wedding");
      for (const slot of slots)
        await expect(
          editor(page).getByLabel(slotLabels[slot], { exact: true }),
        ).toHaveValue(restored.selection[slot] ?? "");
      for (const action of ["run", "jump"])
        await observePlayback(
          page,
          "wardrobe",
          "male",
          "wedding-restored",
          sourceManifest,
          action,
          "right",
        );
      report.characterReturns.push({
        from: "male",
        through: "female",
        to: "male",
        retainedSelection: restored.selection,
        subsequentActions: ["run", "jump"],
      });
    }
    await context.close();
    // No live workbench or garment compositor is needed from this point.
    for (const look of ["day", "wedding"]) {
      const stem = `${entry.key}-${look}`,
        packPath = join(exportDirectory, `${stem}.character.zip`);
      const files = unzipSync(new Uint8Array(await readFile(packPath))),
        manifest = parseJSON(files["manifest.json"]);
      const { context: standalone, page: player } = await openIndependent(
        packPath,
        entry.key,
        look,
      );
      await setPose(player, "independent", "idle", "right");
      await screenshot(
        player,
        `${stem}-independent-player.png`,
        player.locator(".player-preview-panel"),
      );
      for (const action of actions)
        for (const facing of ["right", "left"])
          await observePlayback(
            player,
            "independent",
            entry.key,
            look,
            manifest,
            action,
            facing,
          );
      await standalone.close();
      // Record a separate, short fresh session in full. This keeps loading and
      // all action transitions reviewable without trimming or reconstructing it.
      const { context: recording, page: recordedPlayer } =
        await openIndependent(packPath, entry.key, look, true);
      const flow = await recordFlow(recordedPlayer, entry.key, look, manifest);
      const video = recordedPlayer.video();
      await recording.close();
      const destination = join(output, `${stem}-independent-flow.webm`);
      await video.saveAs(destination);
      execFileSync(
        "ffmpeg",
        ["-v", "error", "-i", destination, "-f", "null", "-"],
        { timeout: 60000 },
      );
      const probe = JSON.parse(
        execFileSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_name,width,height",
            "-of",
            "json",
            destination,
          ],
          { encoding: "utf8" },
        ),
      );
      assert(Number(probe.format.duration) >= 5);
      report.recordings.push({
        file: relativeFile(destination),
        sha256: sha(await readFile(destination)),
        decoded: true,
        source:
          "Complete fresh independent browser session, including pack loading and the 5.6-second action flow; viewport scaled by Playwright to 960×734. No trimming, frame replacement or reconstructed animation.",
        probe,
        flow,
      });
      report.independent.push({
        character: entry.key,
        look,
        workbenchClosedBeforeImport: true,
        file: relativeFile(packPath),
        fiveActionsBothDirections: true,
        preparedTransitions: true,
        garmentRuntimeRequired: false,
      });
      await persist();
      console.log(
        `Closed-workbench independent playback and recording passed for ${stem}.`,
      );
    }
  }
  assert.deepEqual(
    await inputHashes(),
    report.inputHashes,
    "Source code and clothing inputs changed during evidence capture.",
  );
  assert.equal(report.errors.length, 0, "No uncaught browser errors.");
  assert.equal(
    report.forbiddenIndependentRequests.length,
    0,
    "The independent player must not fetch authoring code.",
  );
  assert.equal(
    report.externalRequests.length,
    0,
    "Playback and clothing stay local.",
  );
  assert(
    report.localAssetResponses.some((response) =>
      /catalog[^/]*\.json/.test(response.url),
    ),
    "The actual clothing catalog must be fetched by the browser.",
  );
  assert(
    report.localAssetResponses.every(
      (response) => response.status >= 200 && response.status < 400,
    ),
    "Catalog, source packs, garment packs and templates must load successfully.",
  );
  if (production)
    assert(
      report.localAssetResponses.every(
        (response) => !response.url.startsWith("/docs/"),
      ),
      "The production browser uses bundled assets rather than development-only document paths.",
    );
  assert.equal(report.playback.length, 82);
  assert.equal(report.mixedOutfits.length, 2);
  report.passed = true;
  report.finishedAt = new Date().toISOString();
  report.observationLimits = report.playback
    .filter(
      (record) => record.missingPositions.length || record.gapsOver90Ms.length,
    )
    .map(
      ({
        mode,
        character,
        look,
        action,
        facing,
        missingPositions,
        gapsOver90Ms,
      }) => ({
        mode,
        character,
        look,
        action,
        facing,
        missingPositions,
        gapsOver90Ms,
      }),
    );
  await persist();
  await writeFile(
    join(output, "README.md"),
    `# Actual Kling wardrobe browser evidence\n\nCaptured ${report.finishedAt} using ${production ? "the production build" : "Vite development serving"}. The catalog, source packs and runtime hashes are recorded in [evidence-index.json](evidence-index.json).\n\n- Four real outfits were selected in the workbench, saved and reopened.\n- Four native PNGs, four self-contained wardrobe projects and four baked CharacterPacks were downloaded using the visible UI controls. ZIP CRCs, nested PNG decoding and action metadata were checked.\n- Both female dresses were also combined with brown shoes through the UI; all-frame preflight passed and eight native PNGs captured source frames 51, 58, 87 and 104 for seam review.\n- All five actions were played in both directions in the workbench and again in a fresh independent player after the workbench context closed: ${report.playback.length} playback cases.\n- Each WebM preserves a complete fresh independent browser session, including pack loading and prepared action transitions, without trimming. It is not a generated illustration or a claimed frame-perfect video capture.\n- Cold context load, outfit validation, saved-project restore and retained-character return timings are recorded separately from warm observed playback cadence.\n- Observation gaps and missed positions are retained in the report. Continuous visual review and user art acceptance are separate from these functional checks.\n\nExported files: [../exports/](../exports/). Original faces and source animation frames are preserved by the separate pixel-level asset audit.\n`,
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        playbackCases: report.playback.length,
        downloads: report.downloads.length,
        recordings: report.recordings.length,
        observationLimits: report.observationLimits.length,
        report: relativeFile(join(output, "evidence-index.json")),
      },
      null,
      2,
    ),
  );
} catch (failure) {
  report.passed = false;
  report.failure = failure.stack || String(failure);
  report.finishedAt = new Date().toISOString();
  if (activePage && !activePage.isClosed()) {
    report.visibleAlertsAtFailure = await activePage
      .getByRole("alert")
      .allTextContents()
      .catch(() => []);
    await activePage
      .screenshot({ path: join(output, "failure.png"), fullPage: true })
      .catch(() => {});
  }
  await persist();
  throw failure;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  if (!production) await server.close();
  await rm(temporary, { recursive: true, force: true });
}
