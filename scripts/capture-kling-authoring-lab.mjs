// Bounded real production authoring/checker workflow. No mocks or substituted assets.
// Run --plan first; capture only after the final build and root GO.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  statfs,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium, expect } from "@playwright/test";
import { unzipSync } from "fflate";
import { parseGIF, decompressFrames } from "gifuct-js";
import { preview } from "vite";

const { values: args } = parseArgs({
  options: {
    run: { type: "string" },
    output: { type: "string", default: "docs/kling-authoring-lab/evidence" },
    temp: { type: "string" },
    port: { type: "string", default: "5241" },
    plan: { type: "boolean", default: false },
  },
});
const root = fileURLToPath(new URL("../", import.meta.url));
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const MiB = 1024 * 1024;
const budgets = {
  retained: 100 * MiB,
  temporary: 140 * MiB,
  diskReserve: 128 * MiB,
  nativePngs: 4,
  gifs: 8,
  screenshots: 6,
  projects: 2,
  packs: 2,
  playback: 20,
  checkerRowsPerCharacter: 240,
  contactRows: 24,
};
const cases = [
  {
    key: "male",
    preset: "day-refined",
    baseId: "teal-camp-shirt-v5",
    outputId: "sand-camp-shirt-authoring-v1",
    outputName: "Sand camp shirt · authoring study",
    bottom: "ochre-chinos-v1",
    mixedBottom: "navy-suit-trousers-v1",
    hairId: "soft-curls",
    faceId: "gentle-v2",
    bank: "/docs/kling-expression-refined/banks/male-soft-curls.zip",
    target: "#b78b50",
    pose: 103,
  },
  {
    key: "female",
    preset: "plum-pintuck-day",
    baseId: "plum-pintuck-neckline-mask-v1",
    baseFile:
      "docs/kling-mask-workbench/evidence/final-v1/female-plum-neckline-reviewed.garment.zip",
    outputId: "sage-pintuck-authoring-v1",
    outputName: "Sage pintuck · authoring study",
    bottom: "navy-shorts",
    mixedBottom: "ochre-shorts",
    hairId: "romantic-waves",
    faceId: "gentle-v2",
    bank: "/docs/kling-expression-refined/banks/female-romantic-waves.zip",
    target: "#578479",
    pose: 103,
  },
];
const plan = {
  cases,
  budgets,
  material:
    "Owned-cloth RGB variants using existing authored shapes. Reference PNG is an actual baseline export used only as visual context.",
  checker:
    "8 requested outfit/hair/face combinations per character; all5 actions and2 directions at3 explicit report-selected unique pose samples,240 rows per character, not exhaustive motion-frame visual approval.",
  workflow:
    "Actual wizard cloth sample/reference upload/material build, difficult pose decisions, draft save/reopen, candidate apply; actual combination scan/manual notes/report/contact-sheet export/reopen; exact saved wardrobe reopen and two independent CharacterPacks after editor closes.",
};
if (args.plan) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}
assert(
  args.run && /^[a-z0-9][a-z0-9-]*$/.test(args.run),
  "Choose a fresh --run name.",
);
const output = resolve(root, args.output, args.run),
  temporary = resolve(args.temp || `/tmp/kling-authoring-lab-${args.run}`);
assert(/^\/tmp\/kling-authoring-lab-[a-z0-9-]+$/.test(temporary));
for (const directory of [output, temporary]) {
  assert(
    !existsSync(directory) || (await readdir(directory)).length === 0,
    `Preserve previous evidence ${directory}`,
  );
  await mkdir(directory, { recursive: true });
}
const used = { retained: 0, temporary: 0 };
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path).replaceAll("\\", "/");
const json = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));
const members = (bytes, names) =>
  unzipSync(new Uint8Array(bytes), { filter: (f) => names.includes(f.name) });
const manifest = (bytes) =>
  json(members(bytes, ["manifest.json"])["manifest.json"]);
const catalogBytes = await readFile(
    join(root, "docs/kling-wardrobe/catalog.json"),
  ),
  catalog = json(catalogBytes);
const compiledJsSha256 = {};
for (const name of await readdir(join(root, "dist/assets"), {
  recursive: true,
}))
  if (name.endsWith(".js")) {
    const path = join(root, "dist/assets", name);
    compiledJsSha256[rel(path)] = sha(await readFile(path));
  }
assert(
  Object.keys(compiledJsSha256).length,
  "Build production JavaScript before capture.",
);
const report = {
  format: "gathria-authoring-lab-browser-evidence",
  version: 1,
  production: true,
  run: args.run,
  startedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  worktreeStatusAtCapture: execFileSync("git", ["status", "--short"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  scriptSha256: sha(await readFile(fileURLToPath(import.meta.url))),
  productionHtmlSha256: sha(await readFile(join(root, "dist/workbench.html"))),
  playerHtmlSha256: sha(await readFile(join(root, "dist/player.html"))),
  catalogSha256: sha(catalogBytes),
  compiledJsSha256,
  plan,
  budgets,
  used,
  inputs: {},
  catalogResponses: [],
  scriptRequests: [],
  downloads: [],
  screenshots: [],
  matrix: [],
  gifs: [],
  projects: [],
  packs: [],
  playback: [],
  workflow: [],
  authoring: [],
  checks: [],
  errors: [],
  consoleErrors: [],
  ignoredBrowserDiagnostics: [],
  failedRequests: [],
  externalRequests: [],
  independentEditorRequests: [],
  passed: false,
};
const reportPath = join(output, "evidence-index.json");
const persist = () =>
  writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
const panel = (page) => page.locator("#wardrobe-panel");
const button = (scope, name) =>
  scope.getByRole("button", { name, exact: typeof name === "string" });
const canvas = (page) => panel(page).getByTestId("wardrobe-preview");
const title = (value) => value[0].toUpperCase() + value.slice(1);
const server = await preview({
    root,
    preview: { host: "127.0.0.1", port: Number(args.port), strictPort: true },
  }),
  origin = `http://127.0.0.1:${args.port}`;
const forbiddenEditorModule =
  /WardrobeEditor|ClothingAuthoringWizard|CombinationReview|SpriteActionEditor|action-gif|\/assets\/workbench-[^/]+\.js|\/src\/(wardrobe|appearance|skeletal)\//;
let browser, activePage, entry, source, sourceBytes;
async function diskCheck(additionalBytes = 0, directory = temporary) {
  const disk = await statfs(directory);
  assert(
    disk.bavail * disk.bsize >= budgets.diskReserve + additionalBytes,
    "Insufficient disk reserve; retain evidence and free unrelated temporary files before a fresh run.",
  );
}
async function writeTracked(path, bytes, kind) {
  assert(!existsSync(path), `Refuse to overwrite ${path}`);
  assert(
    used[kind] + bytes.length <= budgets[kind],
    `${kind} evidence budget exceeded`,
  );
  await mkdir(dirname(path), { recursive: true });
  await diskCheck(bytes.length, dirname(path));
  await writeFile(path, bytes);
  used[kind] += bytes.length;
}
function watch(context, independent = false) {
  context.on("page", (page) => {
    page.on("pageerror", (error) => report.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const diagnostic = { text: message.text(), location: message.location() };
      // No favicon is shipped; retain that browser diagnostic without treating
      // it as a failed character asset or application exception.
      if (diagnostic.location.url.endsWith("/favicon.ico"))
        report.ignoredBrowserDiagnostics.push(diagnostic);
      else report.consoleErrors.push(diagnostic);
    });
  });
  context.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith("/favicon.ico"))
      report.failedRequests.push({
        url: response.url(),
        status: response.status(),
      });
  });
  context.on("request", (request) => {
    const url = request.url();
    if (request.resourceType() === "script")
      report.scriptRequests.push({
        url,
        independent,
        compiledSha256:
          compiledJsSha256[`dist${new URL(url).pathname}`] ?? null,
      });
    if (/^https?:/.test(url) && !url.startsWith(origin + "/"))
      report.externalRequests.push(url);
    if (independent && forbiddenEditorModule.test(url))
      report.independentEditorRequests.push(url);
  });
}
async function ready(page, text) {
  await page.waitForFunction(
    (text) => {
      const p = document.querySelector("#wardrobe-panel");
      return (
        p?.querySelector('[role="alert"]') ||
        (p?.querySelector('[role="status"]')?.textContent.includes(text) &&
          !p.querySelector('[aria-busy="true"]'))
      );
    },
    text,
    { timeout: 240000 },
  );
  assert.deepEqual(await panel(page).getByRole("alert").allTextContents(), []);
  await expect(panel(page).getByRole("status")).toContainText(text);
}
async function choose(page, label, value, status = "Appearance updated") {
  const control = panel(page).getByLabel(label, { exact: true });
  if ((await control.inputValue()) !== value) {
    await control.selectOption(value);
    await ready(page, status);
  }
  await expect(control).toHaveValue(value);
}
async function pause(page, player = false) {
  const control = button(
    player ? page : panel(page),
    player ? "Pause animation" : "Pause wardrobe animation",
  );
  if (await control.count()) await control.click();
}
async function outfit(page, name) {
  await panel(page).getByLabel("Find an outfit", { exact: true }).fill(name);
  await button(panel(page), name).click();
  await ready(page, name + " selected");
  await button(panel(page), "Clear outfit search").click();
  await pause(page);
}
async function pose(page, source, action, frameId, facing = "right") {
  await pause(page);
  const position = source.animations[action].frames.indexOf(frameId);
  assert(position >= 0, `${action} does not contain native frame ${frameId}`);
  await panel(page)
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption(action);
  await panel(page)
    .getByLabel("Wardrobe facing", { exact: true })
    .selectOption(facing);
  await panel(page)
    .getByLabel("Wardrobe frame", { exact: true })
    .fill(String(position));
  await expect(canvas(page)).toHaveAttribute("data-rendered-action", action);
  await expect(canvas(page)).toHaveAttribute(
    "data-rendered-frame-id",
    String(frameId),
  );
  await expect(canvas(page)).toHaveAttribute(
    "data-frame-position",
    String(position),
  );
  return { action, frameId, position, facing };
}
async function pixels(page) {
  return canvas(page).evaluate(async (c) => {
    const rgba = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", rgba));
    return {
      width: c.width,
      height: c.height,
      rgbaSha256: Array.from(digest, (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
    };
  });
}
async function download(
  page,
  label,
  filename,
  kind,
  meta = {},
  scope = panel(page),
  target,
) {
  const storage = ["project", "kit", "template"].includes(kind)
    ? "temporary"
    : "retained";
  const path =
    target || join(storage === "temporary" ? temporary : output, filename);
  assert(!existsSync(path), `Preserve existing download ${path}`);
  await diskCheck();
  const pending = page.waitForEvent("download", { timeout: 300000 });
  pending.catch(() => {});
  await button(scope, label).click();
  const result = await pending;
  assert.equal(await result.failure(), null);
  const browserPath = await result.path();
  const bytes = await readFile(browserPath);
  if (storage === "temporary") {
    // Move the actual browser download on the same /tmp filesystem, avoiding
    // a second large project copy that would exceed the transient disk budget.
    assert(used.temporary + bytes.length <= budgets.temporary);
    await mkdir(dirname(path), { recursive: true });
    await rename(browserPath, path);
    used.temporary += bytes.length;
  } else {
    await writeTracked(path, bytes, storage);
    await result.delete();
  }
  const row = {
    file: rel(path),
    kind,
    bytes: bytes.length,
    sha256: sha(bytes),
    suggestedFilename: result.suggestedFilename(),
    actualUiDownload: true,
    temporary: storage === "temporary",
    ...meta,
  };
  report.downloads.push(row);
  await persist();
  console.log(`Downloaded ${filename}: ${bytes.length} bytes`);
  return { path, bytes, row };
}
async function png(
  page,
  key,
  source,
  action,
  frameId,
  facing = "right",
  meta = {},
) {
  assert(
    report.downloads.filter((d) => d.kind === "png").length <
      budgets.nativePngs,
    "Native PNG count budget exceeded",
  );
  const observed = await pose(page, source, action, frameId, facing);
  const before = await pixels(page);
  const d = await download(
    page,
    "Save current PNG",
    `${key}-${action}-${frameId}-${facing}.png`,
    "png",
    { ...observed, ...meta },
  );
  assert.equal(d.bytes.readUInt32BE(16), before.width);
  assert.equal(d.bytes.readUInt32BE(20), before.height);
  assert.deepEqual(await pixels(page), before);
  return { ...d.row, ...observed, uiCanvas: before };
}
async function screenshot(page, filename, region) {
  assert(
    report.screenshots.length < budgets.screenshots,
    "Screenshot count budget exceeded",
  );
  const bytes = region
    ? await region.screenshot()
    : await page.screenshot({ fullPage: true });
  const path = join(output, filename);
  await writeTracked(path, bytes, "retained");
  report.screenshots.push({
    file: rel(path),
    bytes: bytes.length,
    sha256: sha(bytes),
    kind: "ui-screenshot",
    actualUiDownload: false,
  });
  return report.screenshots.at(-1);
}
async function gifs(
  page,
  key,
  source,
  clips = [
    ["run", "right"],
    ["run", "left"],
    ["jump", "right"],
    ["celebrate", "right"],
  ],
) {
  const hairId = await panel(page)
    .getByLabel("Hairstyle", { exact: true })
    .inputValue();
  const faceId = await panel(page)
    .getByLabel("Face", { exact: true })
    .inputValue();
  for (const [action, facing] of clips) {
    assert(report.gifs.length < budgets.gifs, "GIF count budget exceeded");
    await pose(
      page,
      source,
      action,
      source.animations[action].frames[0],
      facing,
    );
    const before = await pixels(page);
    const d = await download(
      page,
      "Download action GIF",
      `${key}-${action}-${facing}.gif`,
      "gif",
      { key, action, facing, hairId: hairId || null, faceId: faceId || null },
    );
    await ready(page, "Action GIF saved");
    const parsed = parseGIF(new Uint8Array(d.bytes).buffer);
    const frames = decompressFrames(parsed, true);
    const clip = source.animations[action];
    assert.equal(frames.length, clip.frames.length);
    assert.equal(
      frames.reduce((sum, f) => sum + f.delay, 0),
      Math.round((clip.frames.length * 100) / clip.fps) * 10,
    );
    assert.equal(
      parsed.frames.some((f) => f.application?.id === "NETSCAPE2.0"),
      clip.loop,
    );
    assert.equal(parsed.lsd.width, Math.ceil(before.width / 2));
    assert.equal(parsed.lsd.height, Math.ceil(before.height / 2));
    assert.deepEqual(await pixels(page), before);
    report.gifs.push({
      ...d.row,
      sourceSchedule: clip,
      width: parsed.lsd.width,
      height: parsed.lsd.height,
      frames: frames.length,
      delaysMs: frames.map((f) => f.delay),
      loop: clip.loop,
      matteAndHalfSize: true,
    });
  }
}
async function playback(pack) {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 850 },
  });
  watch(context, true);
  const page = await context.newPage();
  activePage = page;
  await page.goto(origin + "/player.html");
  await page.locator("#player-zip").setInputFiles(join(root, pack.file));
  await expect(page.getByRole("status")).toContainText("Loaded:", {
    timeout: 240000,
  });
  await expect(page.getByTestId("consumer-canvas")).toHaveAttribute(
    "data-motion-flow",
    "true",
  );
  for (const action of actions)
    for (const facing of ["right", "left"]) {
      await pause(page, true);
      await button(page, title(action)).click();
      await button(page, title(facing)).click();
      await page
        .getByLabel("Playback speed", { exact: true })
        .selectOption("1");
      await page
        .getByLabel("Display scale", { exact: true })
        .selectOption("0.5");
      await page.locator("#player-frame").fill("0");
      const clip = pack.manifest.animations[action];
      const durationMs = Math.ceil(
        ((clip.frames.length * 1000) / clip.fps) * (clip.loop ? 2.2 : 1) + 350,
      );
      const observed = await page.evaluate(async (duration) => {
        const c = document.querySelector('[data-testid="consumer-canvas"]');
        const observations = [];
        let previous = "";
        const started = performance.now();
        const sample = () => {
          const key = c.dataset.action + "/" + c.dataset.framePosition;
          if (key !== previous)
            observations.push({
              action: c.dataset.action,
              position: Number(c.dataset.framePosition),
              frameId: Number(c.dataset.frameId),
              atMs: performance.now() - started,
            });
          previous = key;
        };
        const observer = new MutationObserver(sample);
        observer.observe(c, { attributes: true });
        sample();
        document.querySelector('[aria-label="Play animation"]').click();
        await new Promise((resolve) => setTimeout(resolve, duration));
        sample();
        observer.disconnect();
        document.querySelector('[aria-label="Pause animation"]')?.click();
        return observations;
      }, durationMs);
      for (const o of observed)
        assert.equal(
          o.frameId,
          pack.manifest.animations[o.action]?.frames[o.position],
        );
      const selected = observed.filter((o) => o.action === action);
      assert(
        new Set(selected.map((o) => o.position)).size >=
          Math.min(3, clip.frames.length),
      );
      const wraps = selected.filter(
        (o, i) => i && o.position < selected[i - 1].position,
      ).length;
      if (clip.loop) assert(wraps > 0, `${pack.key}/${action} did not loop`);
      else
        assert(
          observed.some((o) => o.action === "idle"),
          `${pack.key}/${action} did not return to idle`,
        );
      report.playback.push({
        key: pack.key,
        action,
        facing,
        durationMs,
        wraps,
        observed,
        missingPositions: clip.frames
          .map((_, i) => i)
          .filter((i) => !selected.some((o) => o.position === i)),
      });
    }
  await screenshot(page, `${pack.key}-independent-player.png`);
  await context.close();
  await persist();
}

async function currentSelection(page) {
  const selection = {};
  for (const [slot, label] of [
    ["top", "Top"],
    ["bottom", "Bottom"],
    ["fullBody", "Dress / one-piece"],
    ["shoes", "Shoes"],
  ])
    selection[slot] =
      (await panel(page).getByLabel(label, { exact: true }).inputValue()) ||
      null;
  return selection;
}
async function canvasHash(locator) {
  return locator.evaluate(async (c) => {
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
    return {
      width: c.width,
      height: c.height,
      frameId: Number(c.dataset.frameId),
      rgbaSha256: Array.from(digest, (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
    };
  });
}
function clothSample(path, frameId) {
  // Read an existing owned cloth pixel. This does not modify or generate art.
  const script = `import io,json,sys,zipfile
import numpy as np
from PIL import Image,ImageFilter
with zipfile.ZipFile(sys.argv[1]) as z:
 m=json.loads(z.read('manifest.json'));f=next(f for f in m['frames'] if f['frameId']==int(sys.argv[2]));p=m['pages'][f['page']]
 a=np.array(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA'));o=np.array(Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA'))[:,:,3]
 r=f['rect'];a=a[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']];o=o[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
 inside=np.array(Image.fromarray(o).filter(ImageFilter.MinFilter(5)))==255
 rgb=a[:,:,:3].astype(float);mean=rgb.mean(axis=2);sat=rgb.max(axis=2)-rgb.min(axis=2)
 valid=inside&(a[:,:,3]==255)&(mean>55)&(mean<190)&(sat>15)
 if not valid.any():raise ValueError('No safe opaque cloth sample')
 y,x=np.where(valid);colors=rgb[y,x];median=np.median(colors,axis=0);distance=((colors-median)**2).sum(axis=1)
 best=int(np.argmin(distance));xx,yy=int(x[best]),int(y[best]);print(json.dumps({'x':xx+f['offset']['x'],'y':yy+f['offset']['y'],'rgb':[int(n) for n in a[yy,xx,:3]],'frameId':int(sys.argv[2])}))`;
  return json(
    execFileSync(
      "/tmp/kling-polish-venv/bin/python",
      ["-c", script, path, String(frameId)],
      { cwd: root, timeout: 30000 },
    ),
  );
}
async function importBase(page, c) {
  if (!c.baseFile) {
    await choose(page, "Top", c.baseId, "Outfit updated");
    return;
  }
  const path = join(root, c.baseFile),
    bytes = await readFile(path);
  report.inputs[c.baseFile] = sha(bytes);
  await panel(page)
    .getByLabel("Preview registered clothing file", { exact: true })
    .setInputFiles(path);
  const candidate = page.getByRole("dialog", {
    name: "Preview imported clothing",
    exact: true,
  });
  await expect(candidate).toBeVisible({ timeout: 180000 });
  await button(candidate, "Apply clothing candidate").click();
  await ready(page, "Clothing candidate applied");
  await expect(panel(page).getByLabel("Top", { exact: true })).toHaveValue(
    c.baseId,
  );
}
async function createVariant(page, c, baseline) {
  const acceptedBefore = await pixels(page);
  await button(panel(page), "Create clothing").click();
  const d = page.getByRole("dialog", {
    name: "Clothing creation wizard",
    exact: true,
  });
  await expect(d).toBeVisible();
  await d
    .getByRole("combobox", { name: /^Starting clothing/ })
    .selectOption(c.baseId);
  await button(d, "Continue to design").click();
  await expect(button(d, "Build clothing variant")).toBeEnabled({
    timeout: 180000,
  });
  const beforeCanvas = d.getByTestId("authoring-before-canvas"),
    afterCanvas = d.getByTestId("authoring-after-canvas");
  const frameId = Number(await beforeCanvas.getAttribute("data-frame-id"));
  const basePath = join(
    root,
    c.baseFile || entry.items.find((i) => i.id === c.baseId).url.slice(1),
  );
  report.inputs[rel(basePath)] = sha(await readFile(basePath));
  const sample = clothSample(basePath, frameId);
  await d.getByLabel("Cloth sample X", { exact: true }).fill(String(sample.x));
  await d.getByLabel("Cloth sample Y", { exact: true }).fill(String(sample.y));
  await button(d, "Use cloth sample").click();
  const sourceHex =
    "#" + sample.rgb.map((n) => n.toString(16).padStart(2, "0")).join("");
  await expect(
    d.getByRole("textbox", { name: "Original cloth color", exact: true }),
  ).toHaveValue(sourceHex);
  await d
    .getByLabel("Clothing reference PNG", { exact: true })
    .setInputFiles(join(root, baseline.file));
  await expect(d.getByTestId("authoring-reference-canvas")).toBeVisible();
  await d.getByLabel("New clothing ID", { exact: true }).fill(c.outputId);
  await d.getByLabel("New clothing name", { exact: true }).fill(c.outputName);
  await d
    .getByRole("textbox", { name: "New cloth color", exact: true })
    .fill(c.target);
  await d.getByLabel("Color tolerance", { exact: true }).fill("0.3");
  await button(d, "Build clothing variant").click();
  await expect(d.getByTestId("authoring-pose-status")).toBeVisible({
    timeout: 240000,
  });
  assert.deepEqual(await d.getByRole("alert").allTextContents(), []);
  const poseControl = d.getByRole("combobox", { name: /^Review pose/ });
  const ids = await poseControl
    .locator("option")
    .evaluateAll((options) => options.map((o) => Number(o.value)));
  assert(ids.length > 0 && ids.length <= 8);
  const reviewed = [];
  for (const [i, id] of ids.entries()) {
    await poseControl.selectOption(String(id));
    await expect(beforeCanvas).toHaveAttribute("data-frame-id", String(id));
    await expect(d.getByTestId("authoring-pose-status")).toContainText(
      "pending",
    );
    const pair = {
      frameId: id,
      before: await canvasHash(beforeCanvas),
      after: await canvasHash(afterCanvas),
    };
    if (i === 0) {
      await button(d, "Reject pose").click();
      await expect(d.getByTestId("authoring-pose-status")).toContainText(
        "rejected",
      );
      await button(d, "Return to review").click();
      await expect(d.getByTestId("authoring-pose-status")).toContainText(
        "pending",
      );
    }
    await d
      .getByLabel("Pose review note", { exact: true })
      .fill(
        "Material-only workflow review: preserve source shape, ownership and alpha. This scripted acceptance is not user visual approval; review the exported motion and inherited edge softness.",
      );
    await button(d, "Accept pose").click();
    await expect(d.getByTestId("authoring-pose-status")).toContainText(
      "accepted",
    );
    reviewed.push(pair);
  }
  await screenshot(page, `${c.key}-authoring-review.png`);
  const draft = await download(
    page,
    "Save authoring draft",
    `${c.key}.clothing-draft.zip`,
    "authoring-draft",
    { key: c.key },
    d,
  );
  const design = json(members(draft.bytes, ["design.json"])["design.json"]);
  assert.equal(design.reference.sha256, baseline.sha256);
  assert.equal(design.baseSha256, report.inputs[rel(basePath)]);
  assert.deepEqual(design.configuration.material.sourceRgb, sample.rgb);
  assert(design.review.poses.every((p) => p.decision === "accepted"));
  await d
    .getByLabel("Clothing authoring draft file", { exact: true })
    .setInputFiles(draft.path);
  await expect(d.getByTestId("authoring-status")).toContainText(
    "Draft reopened with its exact starting clothing and verified output.",
    { timeout: 240000 },
  );
  await expect(button(d, "Continue to preview")).toBeEnabled();
  for (const p of reviewed) {
    await poseControl.selectOption(String(p.frameId));
    await expect(beforeCanvas).toHaveAttribute(
      "data-frame-id",
      String(p.frameId),
    );
    await expect(d.getByTestId("authoring-pose-status")).toContainText(
      "accepted",
    );
    assert.deepEqual(await canvasHash(beforeCanvas), p.before);
    assert.deepEqual(await canvasHash(afterCanvas), p.after);
  }
  await button(d, "Continue to preview").click();
  await button(d, "Preview new clothing").click();
  const candidate = page.getByRole("dialog", {
    name: "Preview imported clothing",
    exact: true,
  });
  await expect(candidate).toBeVisible({ timeout: 240000 });
  assert.deepEqual(
    await pixels(page),
    acceptedBefore,
    "Wizard must not alter the accepted look before explicit apply.",
  );
  const garment = await download(
    page,
    "Save created clothing",
    `${c.key}.created.garment.zip`,
    "garment",
    { key: c.key },
    candidate,
  );
  const creation = await download(
    page,
    "Save clothing creation report",
    `${c.key}.creation-report.json`,
    "creation-report",
    { key: c.key },
    candidate,
  );
  const built = json(creation.bytes);
  assert.equal(sha(garment.bytes), design.review.outputSha256);
  assert.equal(built.output.sha256, sha(garment.bytes));
  assert.deepEqual(built.configuration, design.configuration);
  assert.equal(built.reference.sha256, baseline.sha256);
  assert.deepEqual(
    built.hardPoses.map((p) => ({
      frameId: p.frameId,
      decision: p.decision,
      note: p.note,
    })),
    design.review.poses,
  );
  await button(candidate, "Apply clothing candidate").click();
  await ready(page, "Clothing candidate applied");
  await expect(panel(page).getByLabel("Top", { exact: true })).toHaveValue(
    c.outputId,
  );
  const result = {
    key: c.key,
    baseFile: rel(basePath),
    baseSha256: design.baseSha256,
    sample,
    target: c.target,
    tolerance: 0.3,
    reference: {
      file: baseline.file,
      sha256: baseline.sha256,
      role: "Actual baseline PNG; contextual color reference, not fitted or generated artwork",
    },
    draft: draft.row,
    garment: garment.row,
    report: creation.row,
    reviewed,
    draftReopenExact: true,
    explicitApply: true,
  };
  report.authoring.push(result);
  await persist();
  return result;
}

async function visualNoteGate(c, shot, row) {
  const path = join(output, `${c.key}.visual-note.json`);
  const pending = {
    key: c.key,
    screenshot: shot.file,
    screenshotSha256: shot.sha256,
    caseId: row.caseId,
    action: row.action,
    position: row.position,
    facing: row.facing,
    gate: rel(path),
  };
  report.awaitingVisualReview = pending;
  await persist();
  console.log(`VISUAL_REVIEW_REQUIRED ${JSON.stringify(pending)}`);
  const deadline = Date.now() + 300000;
  while (!existsSync(path)) {
    assert(
      Date.now() < deadline,
      "Visual review gate timed out; preserve this run and inspect the screenshot.",
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const bytes = await readFile(path),
    note = json(bytes);
  for (const key of [
    "screenshotSha256",
    "caseId",
    "action",
    "position",
    "facing",
  ])
    assert.deepEqual(note[key], pending[key]);
  assert(
    ["checked", "issue"].includes(note.decision) &&
      typeof note.note === "string" &&
      note.note.length > 0 &&
      note.note.length <= 1000,
  );
  report.inputs[rel(path)] = sha(bytes);
  used.retained += bytes.length;
  delete report.awaitingVisualReview;
  await persist();
  return { ...note, file: rel(path), sha256: sha(bytes) };
}
async function checkCombinations(page, c) {
  await choose(page, "Hairstyle", c.hairId);
  await choose(page, "Face", c.faceId);
  await choose(page, "Hair color", "chestnut");
  const acceptedBefore = await pixels(page),
    selectedBefore = await currentSelection(page);
  await button(panel(page), "Check combinations").click();
  const d = page.getByRole("dialog", {
    name: "Combination review workbench",
    exact: true,
  });
  await expect(d).toBeVisible();
  const mixed = entry.items.find((i) => i.id === c.mixedBottom);
  const additions = d.locator("details").filter({
    has: page.locator("summary", { hasText: "Add clothing to check" }),
  });
  if ((await additions.getAttribute("open")) === null)
    await additions.locator("summary").click();
  const load = additions.getByRole("checkbox", {
    name: `${mixed.name} · Bottom`,
    exact: true,
  });
  if (await load.isEnabled()) {
    await load.check();
    await button(additions, "Load selected clothing").click();
  }
  await expect(
    d
      .getByRole("group", { name: "Bottom", exact: true })
      .getByRole("checkbox", { name: mixed.name, exact: true }),
  ).toBeVisible({ timeout: 180000 });
  await d
    .getByRole("group", { name: "Bottom", exact: true })
    .getByRole("checkbox", { name: mixed.name, exact: true })
    .check();
  await d
    .getByRole("group", { name: "Hair", exact: true })
    .getByRole("checkbox", { name: "Original hair", exact: true })
    .check();
  await d
    .getByRole("group", { name: "Face", exact: true })
    .getByRole("checkbox", { name: "Original face", exact: true })
    .check();
  await d
    .getByRole("combobox", { name: "Clothing baseline", exact: true })
    .selectOption("original");
  await d
    .getByRole("combobox", { name: "Coverage mode", exact: true })
    .selectOption("exhaustive");
  await d.getByLabel("Maximum looks", { exact: true }).fill("8");
  await d.getByLabel("Maximum samples", { exact: true }).fill("240");
  await d.getByLabel("Poses per action", { exact: true }).fill("3");
  await button(d, "Plan combinations").click();
  await expect(d.getByTestId("combination-coverage")).toContainText(
    "8 / 8 combinations",
    { timeout: 180000 },
  );
  await expect(button(d, "Scan planned combinations")).toBeEnabled();
  await button(d, "Scan planned combinations").click();
  await expect(
    d.getByText(
      "Scan complete: 240 completed samples, 0 failed. Visual review is still required.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 300000 });
  assert.deepEqual(await d.getByRole("alert").allTextContents(), []);
  const scan = await download(
    page,
    "Save combination report",
    `${c.key}.combination-scan.json`,
    "combination-report",
    { key: c.key, stage: "actual-scan" },
    d,
  );
  const data = json(scan.bytes);
  assert.equal(data.status, "complete");
  assert.equal(data.completedSamples, 240);
  assert.equal(data.failedSamples, 0);
  assert.equal(data.plan.cases.length, 8);
  assert.equal(data.rows.length, 240);
  assert(data.rows.every((r) => r.manualReview === "unreviewed" && !r.error));
  const selected = [];
  for (const candidate of data.plan.cases) {
    const rows = data.rows
      .map((r, index) => ({ ...r, index }))
      .filter(
        (r) =>
          r.caseId === candidate.id &&
          r.action === "jump" &&
          r.facing === "right",
      );
    assert.equal(rows.length, 3);
    selected.push(rows[1]);
  }
  const visual =
    selected.find((r) => {
      const x = data.plan.cases.find((x) => x.id === r.caseId);
      return (
        x.appearance.hairId === c.hairId && x.appearance.faceId === c.faceId
      );
    }) || selected[0];
  await button(d, `Inspect sample ${visual.index + 1}`).click();
  const inspector = d.locator(".combination-inspector");
  await expect(inspector.locator("canvas")).toBeVisible({ timeout: 180000 });
  await d
    .getByRole("combobox", { name: /^Review background/ })
    .selectOption("cream");
  const shot = await screenshot(
    page,
    `${c.key}-combination-inspector.png`,
    inspector,
  );
  const note = await visualNoteGate(c, shot, visual);
  await d
    .getByRole("combobox", { name: /^Sample review status/ })
    .selectOption(note.decision);
  await d.getByLabel("Sample review note", { exact: true }).fill(note.note);
  const saved = await download(
    page,
    "Save combination report",
    `${c.key}.combination-reviewed.json`,
    "combination-report",
    { key: c.key, stage: "manual-note" },
    d,
  );
  const savedData = json(saved.bytes);
  assert.equal(savedData.rows[visual.index].manualReview, note.decision);
  assert.equal(savedData.rows[visual.index].note, note.note);
  const bad = structuredClone(savedData);
  bad.plan.binding.sourceSha256 = "0".repeat(64);
  const badBytes = Buffer.from(JSON.stringify(bad)),
    badPath = join(output, `${c.key}.wrong-source-report.input.json`);
  await writeTracked(badPath, badBytes, "retained");
  report.inputs[rel(badPath)] = sha(badBytes);
  const beforeImport = await canvasHash(inspector.locator("canvas"));
  await d
    .getByLabel("Combination report file", { exact: true })
    .setInputFiles(badPath);
  await expect(d.getByRole("alert")).toBeVisible({ timeout: 180000 });
  const rejection = await d.getByRole("alert").innerText();
  assert.deepEqual(await canvasHash(inspector.locator("canvas")), beforeImport);
  await expect(d.getByLabel("Sample review note", { exact: true })).toHaveValue(
    note.note,
  );
  await d
    .getByLabel("Combination report file", { exact: true })
    .setInputFiles(saved.path);
  await expect(
    d.getByText(/Matching report reopened with its review notes/),
  ).toBeVisible({ timeout: 180000 });
  assert.deepEqual(await d.getByRole("alert").allTextContents(), []);
  await button(d, `Inspect sample ${visual.index + 1}`).click();
  await expect(
    d.getByRole("combobox", { name: /^Sample review status/ }),
  ).toHaveValue(note.decision);
  await expect(d.getByLabel("Sample review note", { exact: true })).toHaveValue(
    note.note,
  );
  await d
    .getByRole("combobox", { name: /^Review region/ })
    .selectOption("full");
  const boxes = d.getByRole("checkbox", {
    name: /^Include sample \d+ in contact sheets$/,
  });
  for (const control of await boxes.all())
    if (await control.isChecked()) await control.uncheck();
  for (const row of selected)
    await d
      .getByLabel(`Include sample ${row.index + 1} in contact sheets`, {
        exact: true,
      })
      .check();
  const contact = await download(
    page,
    "Download selected contact sheets",
    `${c.key}.combination-contact.zip`,
    "contact",
    { key: c.key },
    d,
  );
  const cm = manifest(contact.bytes);
  assert.equal(cm.samples.length, 8);
  assert.equal(cm.planId, data.plan.id);
  assert(new Set(cm.samples.map((s) => s.caseId)).size === 8);
  await button(d, "Close combination review").click();
  assert.deepEqual(await pixels(page), acceptedBefore);
  assert.deepEqual(await currentSelection(page), selectedBefore);
  const result = {
    key: c.key,
    scan: scan.row,
    reviewed: saved.row,
    contact: contact.row,
    coverage: data.plan.coverage,
    visualReview: note,
    tamperedInput: { file: rel(badPath), sha256: sha(badBytes) },
    wrongSourceRejected: rejection,
    reopenNoteExact: true,
    acceptedLookUnchanged: true,
  };
  report.checks.push(result);
  await persist();
  await choose(page, "Face", "");
  await choose(page, "Hairstyle", "");
  return result;
}

async function saveFinalProject(page, c) {
  await pose(page, source, "jump", c.pose, "left");
  const before = await pixels(page);
  const saved = await download(
    page,
    /^Save wardrobe/,
    `${c.key}.wardrobe.zip`,
    "project",
    { key: c.key },
  );
  await ready(page, "Wardrobe project saved");
  const files = members(saved.bytes, [
      "document.json",
      "source.character.zip",
      "registration.json",
    ]),
    doc = json(files["document.json"]);
  assert.equal(sha(files["source.character.zip"]), sha(sourceBytes));
  assert.equal(doc.sourceSha256, sha(sourceBytes));
  assert.equal(doc.registrationSha256, sha(files["registration.json"]));
  assert(!doc.appearance?.hairId && !doc.appearance?.faceId);
  await panel(page)
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles(saved.path);
  await ready(page, "Saved outfit and action settings restored");
  await pose(page, source, "jump", c.pose, "left");
  assert.deepEqual(await pixels(page), before);
  const row = {
    ...saved.row,
    selection: doc.selection,
    appearance: doc.appearance ?? null,
    sourceSha256: doc.sourceSha256,
    registrationSha256: doc.registrationSha256,
    preview: doc.preview,
    before,
    after: await pixels(page),
    exactReopen: true,
    reopenedAt: new Date().toISOString(),
  };
  report.projects.push(row);
  await persist();
  return { row, doc };
}
async function exportFinalPack(page, c, project) {
  const exported = await download(
    page,
    "Export CharacterPack",
    `${c.key}.created.character.zip`,
    "pack",
    { key: c.key },
  );
  await ready(page, "CharacterPack exported");
  const m = manifest(exported.bytes),
    cfg = json(members(exported.bytes, [m.configuration])[m.configuration]),
    scfg = json(
      members(sourceBytes, [source.configuration])[source.configuration],
    );
  for (const key of ["animations", "anchor", "facing", "scale"])
    assert.deepEqual(m[key], source[key]);
  assert.deepEqual(
    m.frames.map((f) => f.id),
    source.frames.map((f) => f.id),
  );
  assert.equal(m.spritesheet.frameWidth, source.spritesheet.frameWidth);
  assert.equal(m.spritesheet.frameHeight, source.spritesheet.frameHeight);
  assert.deepEqual(cfg.source, scfg.source);
  assert.deepEqual(cfg.derivation.frames, scfg.derivation.frames);
  assert.deepEqual(
    cfg.sourceMetadata.wardrobe.selection,
    project.doc.selection,
  );
  const row = {
    ...exported.row,
    project: project.row.file,
    exportedAfterReopen: true,
    reopenedAt: project.row.reopenedAt,
    sourceSha256: sha(sourceBytes),
    registrationSha256: project.doc.registrationSha256,
    selection: project.doc.selection,
    manifest: m,
  };
  report.packs.push(row);
  await persist();
  return row;
}

try {
  await diskCheck();
  await writeTracked(
    join(output, "capture-script.mjs"),
    await readFile(fileURLToPath(import.meta.url)),
    "retained",
  );
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    downloadsPath: join(temporary, "browser-downloads"),
    args: ["--disable-dev-shm-usage"],
  });
  for (const c of cases) {
    entry = catalog.characters.find((e) => e.key === c.key);
    const sourcePath = join(root, entry.sourceUrl.slice(1));
    sourceBytes = await readFile(sourcePath);
    source = manifest(sourceBytes);
    report.inputs[rel(sourcePath)] = sha(sourceBytes);
    report.inputs[entry.registrationUrl.slice(1)] = sha(
      await readFile(join(root, entry.registrationUrl.slice(1))),
    );
    report.inputs[c.bank.slice(1)] = sha(
      await readFile(join(root, c.bank.slice(1))),
    );
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
      acceptDownloads: true,
    });
    watch(context);
    const page = await context.newPage();
    activePage = page;
    const response = page.waitForResponse(
      (r) => /\/assets\/catalog-[^/]+\.json(?:\?|$)/.test(r.url()),
      { timeout: 180000 },
    );
    response.catch(() => {});
    await page.goto(
      `${origin}/workbench.html?character=${c.key}&mode=wardrobe`,
    );
    const served = await response,
      bytes = await served.body();
    assert.equal(sha(bytes), sha(catalogBytes));
    report.catalogResponses.push({
      character: c.key,
      url: served.url(),
      bytes: bytes.length,
      sha256: sha(bytes),
    });
    await ready(page, "Original outfit.");
    await outfit(page, entry.presets.find((p) => p.id === c.preset).name);
    await importBase(page, c);
    await choose(page, "Bottom", c.bottom, "Outfit updated");
    const baseline = await png(
      page,
      `${c.key}-before`,
      source,
      "jump",
      c.pose,
      "right",
      { key: c.key, stage: "before", selection: await currentSelection(page) },
    );
    await createVariant(page, c, baseline);
    const after = await png(
      page,
      `${c.key}-after`,
      source,
      "jump",
      c.pose,
      "right",
      { key: c.key, stage: "after", selection: await currentSelection(page) },
    );
    report.matrix.push({ key: c.key, pngs: [baseline, after] });
    await checkCombinations(page, c);
    await gifs(page, c.key, source, [
      ["run", "right"],
      ["run", "left"],
      ["jump", "right"],
      ["jump", "left"],
    ]);
    const project = await saveFinalProject(page, c);
    await exportFinalPack(page, c, project);
    await context.close();
  }
  report.editorsClosedAt = new Date().toISOString();
  await persist();
  for (const pack of report.packs) await playback(pack);
  for (const [path, hash] of Object.entries({
    ...report.inputs,
    ...compiledJsSha256,
  }))
    assert.equal(
      sha(await readFile(join(root, path))),
      hash,
      `Captured input changed:${path}`,
    );
  for (const [path, hash] of [
    ["dist/workbench.html", report.productionHtmlSha256],
    ["dist/player.html", report.playerHtmlSha256],
    ["docs/kling-wardrobe/catalog.json", report.catalogSha256],
  ])
    assert.equal(sha(await readFile(join(root, path))), hash);
  for (const field of [
    "errors",
    "consoleErrors",
    "failedRequests",
    "externalRequests",
    "independentEditorRequests",
  ])
    assert.deepEqual(report[field], [], field);
  assert(report.scriptRequests.every((r) => r.compiledSha256));
  assert.equal(report.downloads.filter((d) => d.kind === "png").length, 4);
  assert.equal(report.gifs.length, 8);
  assert.equal(report.projects.length, 2);
  assert.equal(report.packs.length, 2);
  assert.equal(report.screenshots.length, 6);
  assert.equal(report.playback.length, 20);
  assert(report.playback.every((p) => p.missingPositions.length === 0));
  report.passed = true;
} catch (error) {
  report.failure = String(error.stack || error);
  if (
    activePage &&
    !activePage.isClosed() &&
    report.screenshots.length < budgets.screenshots
  )
    await screenshot(activePage, "failure.png").catch(() => {});
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await persist();
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
console.log(
  JSON.stringify(
    {
      passed: report.passed,
      report: rel(reportPath),
      used,
      pngs: 4,
      gifs: 8,
      playback: report.playback.length,
    },
    null,
    2,
  ),
);
