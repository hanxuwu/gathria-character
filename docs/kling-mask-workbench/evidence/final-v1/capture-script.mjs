// Actual production UI downloads, same-build baseline/candidate comparisons.
// Wait for the final catalog/build; then use --run <fresh-id>.
// --plan prints the bounded matrix without opening a browser or touching evidence.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, statfs, writeFile } from "node:fs/promises";
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
    draft: { type: "string" },
    output: { type: "string", default: "docs/kling-mask-workbench/evidence" },
    temp: { type: "string" },
    port: { type: "string", default: "5237" },
    plan: { type: "boolean", default: false },
  },
});
const root = fileURLToPath(new URL("../", import.meta.url));
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const targets = [89, 90, 93, 101, 102, 103];
const poses = [88, 89, 90, 91, 93, 101, 102, 103, 104];
const MiB = 1024 * 1024;
const budgets = {
  retained: 160 * MiB,
  temporary: 150 * MiB,
  diskReserve: 128 * MiB,
  nativePngs: 24,
  gifs: 8,
  screenshots: 6,
  projects: 2,
  packs: 1,
  playback: 10,
};
const plan = {
  character: "female",
  preset: "plum-pintuck-day",
  appearance: "original source head",
  baselineTop: "plum-pintuck-top-v1",
  targetPoses: targets,
  nativeBeforeAfterPoses: poses,
  workflow:
    "Import reviewed source-bound seed draft, review neighboring suggestions without autoacceptance, undo an explicit mask brush, save/reopen draft, review six manual refinements, preview and apply a new garment, save/reopen exact wardrobe, export and close editor before independent playback.",
  limits:
    "Anchor-based suggestions are proposals, not optical-flow correspondence or automatic anatomical segmentation. Manual six-pose artwork is labeled separately.",
  budgets,
};
if (args.plan) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}
assert(
  args.run && /^[a-z0-9][a-z0-9-]*$/.test(args.run),
  "Choose a fresh --run name.",
);
assert(
  args.draft,
  "Pass the reviewed authored --draft JSON after the engine format is finalized.",
);
const output = resolve(root, args.output, args.run);
const temporary = resolve(args.temp || `/tmp/kling-mask-workbench-${args.run}`);
assert(
  temporary.startsWith(resolve(root, ".review-tmp") + sep) ||
    /^\/tmp\/kling-mask-workbench-[a-z0-9-]+$/.test(temporary),
);
for (const directory of [output, temporary]) {
  assert(
    !existsSync(directory) || (await readdir(directory)).length === 0,
    `Preserve prior evidence ${directory}`,
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
);
const catalog = json(catalogBytes),
  entry = catalog.characters.find((c) => c.key === "female");
assert(entry && entry.presets.some((p) => p.id === plan.preset));
const sourcePath = join(root, entry.sourceUrl.slice(1)),
  sourceBytes = await readFile(sourcePath),
  source = manifest(sourceBytes);
const draftPath = resolve(root, args.draft),
  draftBytes = await readFile(draftPath),
  authoredDraft = json(draftBytes);
const profilePath = join(
  root,
  "artwork/kling-mask-workbench/female-neckline-cloth-v1.json",
);
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
  format: "gathria-mask-workbench-browser-evidence",
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
  inputs: {
    [rel(sourcePath)]: sha(sourceBytes),
    [rel(draftPath)]: sha(draftBytes),
    [rel(profilePath)]: sha(await readFile(profilePath)),
  },
  scope:
    "Production UI mask editing, explicit per-pose review, real downloads and independent player. No mocks or substituted runtime assets.",
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
});
const origin = `http://127.0.0.1:${args.port}`;
const forbiddenEditorModule =
  /WardrobeEditor|MaskEditWorkbench|SpriteActionEditor|action-gif|\/assets\/workbench-[^/]+\.js|\/src\/(wardrobe|appearance|skeletal)\//;
let browser, activePage;
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
  const bytes = await readFile(await result.path());
  await writeTracked(path, bytes, storage);
  await result.delete(); // Avoid retaining a second browser-owned copy of every large ZIP.
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
async function screenshot(page, filename) {
  assert(
    report.screenshots.length < budgets.screenshots,
    "Screenshot count budget exceeded",
  );
  const bytes = await page.screenshot({ fullPage: true });
  const path = join(output, filename);
  await writeTracked(path, bytes, "retained");
  report.screenshots.push({
    file: rel(path),
    bytes: bytes.length,
    sha256: sha(bytes),
    kind: "ui-screenshot",
    actualUiDownload: false,
  });
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
  const selected = {};
  for (const [slot, label] of [
    ["top", "Top"],
    ["bottom", "Bottom"],
    ["fullBody", "Dress / one-piece"],
    ["shoes", "Shoes"],
  ])
    selected[slot] =
      (await panel(page).getByLabel(label, { exact: true }).inputValue()) ||
      null;
  return selected;
}
async function captureRows(page, key, ids, bottom = "navy-shorts") {
  const selection = await currentSelection(page),
    pngs = [];
  for (const frameId of ids)
    pngs.push(
      await png(page, key, source, "jump", frameId, "right", {
        key,
        selection,
        bottom,
      }),
    );
  report.matrix.push({ key, selection, bottom, appearance: "original", pngs });
  await persist();
}
async function savedProject(page, key, reopen) {
  await pose(page, source, "jump", 103, "left");
  const before = await pixels(page);
  const saved = await download(
    page,
    /^Save wardrobe/,
    `${key}.wardrobe.zip`,
    "project",
    { key },
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
  assert(
    !doc.appearance?.hairId && !doc.appearance?.faceId,
    "Primary review uses unchanged source face.",
  );
  assert.deepEqual(doc.preview, { action: "jump", facing: "left" });
  if (reopen) {
    await panel(page)
      .getByLabel("Open wardrobe project file", { exact: true })
      .setInputFiles(saved.path);
    await ready(page, "Saved outfit and action settings restored");
    await pose(page, source, "jump", 103, "left");
    assert.deepEqual(await pixels(page), before);
    await screenshot(page, `${key}-reopened.png`);
  }
  const row = {
    ...saved.row,
    key,
    selection: doc.selection,
    sourceSha256: doc.sourceSha256,
    registrationSha256: doc.registrationSha256,
    preview: doc.preview,
    appearance: doc.appearance ?? null,
    before,
    after: await pixels(page),
    exactReopen: reopen,
    reopenedAt: reopen ? new Date().toISOString() : null,
  };
  report.projects.push(row);
  await persist();
  return { saved, row, doc };
}
async function finalPack(page, project) {
  const exported = await download(
    page,
    "Export CharacterPack",
    "female-plum-neckline-reviewed.character.zip",
    "pack",
    { key: "after-navy" },
  );
  await ready(page, "CharacterPack exported");
  const m = manifest(exported.bytes),
    cfg = json(members(exported.bytes, [m.configuration])[m.configuration]);
  const scfg = json(
    members(sourceBytes, [source.configuration])[source.configuration],
  );
  assert.deepEqual(m.animations, source.animations);
  assert.deepEqual(m.facing, source.facing);
  assert.deepEqual(m.anchor, source.anchor);
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
    key: "after-navy",
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
const maskDialog = (page) =>
  page.getByRole("dialog", { name: "Clothing mask workbench", exact: true });
async function maskReady(page, frameId) {
  const d = maskDialog(page);
  await expect(d).toBeVisible();
  await expect(button(d, "Save mask draft")).toBeEnabled({ timeout: 120000 });
  await expect(d.getByTestId("mask-edit-canvas")).toHaveAttribute(
    "data-frame-id",
    String(frameId),
    { timeout: 120000 },
  );
  assert.deepEqual(await d.getByRole("alert").allTextContents(), []);
}
async function maskPixels(page) {
  return maskDialog(page)
    .getByTestId("mask-edit-canvas")
    .evaluate(async (c) => {
      const data = c
        .getContext("2d")
        .getImageData(0, 0, c.width, c.height).data;
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
      return {
        width: c.width,
        height: c.height,
        cropX: Number(c.dataset.cropX),
        cropY: Number(c.dataset.cropY),
        frameId: Number(c.dataset.frameId),
        rgbaSha256: Array.from(hash, (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      };
    });
}
async function openMask(page) {
  await pose(page, source, "jump", 103);
  const guides = panel(page)
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "Fitting guides" }) });
  if ((await guides.getAttribute("open")) === null)
    await guides.locator("summary").click();
  await panel(page)
    .getByLabel("Recipe clothing", { exact: true })
    .selectOption(plan.baselineTop);
  await button(panel(page), "Edit clothing mask").click();
  await maskReady(page, 103);
  const d = maskDialog(page);
  await d
    .getByLabel("Include reviewed neckline cloth", { exact: true })
    .check();
  await maskReady(page, 103);
  await d.getByLabel("Show mask overlay", { exact: true }).uncheck();
}
async function importDraft(page, path, frameId = 103) {
  const d = maskDialog(page);
  await d.getByLabel("Mask draft file", { exact: true }).setInputFiles(path);
  await expect(
    d.getByText(
      "Draft reopened. Review each pose before building the clothing candidate.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 120000 });
  await maskReady(page, frameId);
}
async function maskPose(page, frameId) {
  await maskDialog(page)
    .getByRole("combobox", { name: /^Source pose/ })
    .selectOption(String(frameId));
  await maskReady(page, frameId);
}
async function recordMask(page, name) {
  const d = maskDialog(page);
  const row = {
    name,
    at: new Date().toISOString(),
    canvas: await maskPixels(page),
    status: await d.getByTestId("mask-pose-status").innerText(),
    queue: await d
      .getByRole("region", { name: "Mask draft poses", exact: true })
      .innerText(),
    warnings: await d.locator(".mask-edit-warnings").allTextContents(),
  };
  report.workflow.push(row);
  await persist();
  return row;
}
async function maskWorkflow(page) {
  assert.equal(authoredDraft.binding.action, "jump");
  assert.equal(
    authoredDraft.binding.position,
    source.animations.jump.frames.indexOf(103),
  );
  assert.equal(
    authoredDraft.binding.itemSha256,
    entry.items.find((i) => i.id === plan.baselineTop).sha256,
  );
  assert.deepEqual(
    authoredDraft.poses.map((p) => p.frameId).sort((a, b) => a - b),
    targets,
  );
  assert(
    authoredDraft.poses.every(
      (p) =>
        p.decision === "pending" &&
        p.commands.every((c) => c.origin === "manual"),
    ),
    "Authored inputs must remain pending and labeled manual.",
  );
  const seed = {
    ...authoredDraft,
    poses: authoredDraft.poses.filter((p) => p.frameId === 103),
  };
  const seedPath = join(output, "seed-103.input.mask-draft.json"),
    seedBytes = Buffer.from(JSON.stringify(seed));
  await writeTracked(seedPath, seedBytes, "retained");
  report.inputs[rel(seedPath)] = sha(seedBytes);
  await openMask(page);
  await importDraft(page, seedPath);
  await recordMask(page, "manual-seed-103-pending");
  await screenshot(page, "mask-seed-103.png");
  const d = maskDialog(page),
    before = await maskPixels(page);
  const brushPoint =
    seed.poses[0].commands[0].command.pixels[
      Math.floor(seed.poses[0].commands[0].command.pixels.length / 2)
    ];
  await button(d, "Restore source").click();
  await d.getByLabel("Brush size", { exact: true }).fill("1");
  await d.getByLabel("Native X", { exact: true }).fill(String(brushPoint.x));
  await d.getByLabel("Native Y", { exact: true }).fill(String(brushPoint.y));
  await button(d, "Apply brush at coordinates").click();
  await expect
    .poll(async () => (await maskPixels(page)).rgbaSha256)
    .not.toBe(before.rgbaSha256);
  const restored = await maskPixels(page);
  await button(d, "Undo stroke").click();
  await expect
    .poll(async () => (await maskPixels(page)).rgbaSha256)
    .toBe(before.rgbaSha256);
  report.workflow.push({
    name: "real-restore-brush-and-exact-undo",
    point: brushPoint,
    radius: 1,
    before,
    restored,
    after: await maskPixels(page),
    exactUndo: true,
  });
  await button(d, "Accept pose").click();
  await button(d, "Suggest neighboring poses").click();
  await maskReady(page, 103);
  await recordMask(page, "neighbors-created-with-seed-accepted");
  await maskPose(page, 102);
  await expect(d.getByTestId("mask-pose-status")).toContainText("pending");
  await recordMask(page, "suggestion-102-pending");
  await screenshot(page, "mask-neighbor-102.png");
  if (await button(d, "Reject pose").isEnabled()) {
    await button(d, "Reject pose").click();
    await expect(d.getByTestId("mask-pose-status")).toContainText("rejected");
  }
  await maskPose(page, 104);
  await expect(d.getByTestId("mask-pose-status")).toContainText("pending");
  await recordMask(page, "suggestion-104-left-pending");
  const suggestion = await download(
    page,
    "Save mask draft",
    "seed-neighbor-review.mask-draft.json",
    "draft",
    {},
    d,
  );
  const proposed = json(suggestion.bytes);
  assert.equal(
    proposed.poses.find((p) => p.frameId === 103).decision,
    "accepted",
  );
  assert(
    proposed.poses
      .filter((p) => p.frameId !== 103)
      .every((p) => p.decision !== "accepted"),
    "Propagation must not autoaccept.",
  );
  // Preserve the actual pending 104 proposal, replace 102/103 with the separately
  // authored manual refinements, and keep all six manual poses pending for UI review.
  const mixed = {
    ...authoredDraft,
    poses: [
      ...authoredDraft.poses,
      ...proposed.poses.filter((p) => p.frameId === 104),
    ],
  };
  const manualPath = join(output, "manual-refinements.input.mask-draft.json"),
    manualBytes = Buffer.from(JSON.stringify(mixed));
  await writeTracked(manualPath, manualBytes, "retained");
  report.inputs[rel(manualPath)] = sha(manualBytes);
  await maskPose(page, 103);
  await importDraft(page, manualPath);
  for (const frameId of targets) {
    await maskPose(page, frameId);
    await expect(d.getByTestId("mask-pose-status")).toContainText("pending");
    await recordMask(page, `manual-refinement-${frameId}-pending`);
    await button(d, "Accept pose").click();
    await expect(d.getByTestId("mask-pose-status")).toContainText("accepted");
  }
  await maskPose(page, 103);
  await screenshot(page, "mask-six-reviewed-poses.png");
  const saved = await download(
    page,
    "Save mask draft",
    "reviewed.mask-draft.json",
    "draft",
    {},
    d,
  );
  const finalDraft = json(saved.bytes);
  assert.deepEqual(
    finalDraft.poses
      .filter((p) => p.decision === "accepted")
      .map((p) => p.frameId)
      .sort((a, b) => a - b),
    targets,
  );
  assert.equal(
    finalDraft.poses.find((p) => p.frameId === 104).decision,
    "pending",
  );
  await importDraft(page, saved.path);
  const again = await download(
    page,
    "Save mask draft",
    "reviewed-reopened.mask-draft.json",
    "draft",
    {},
    d,
  );
  assert.deepEqual(json(again.bytes), finalDraft);
  assert.equal(sha(again.bytes), sha(saved.bytes));
  report.workflow.push({
    name: "draft-exact-reopen",
    before: saved.row,
    after: again.row,
    accepted: targets,
    pending: [104],
    exact: true,
  });
  await d
    .getByLabel("New clothing ID", { exact: true })
    .fill("plum-pintuck-neckline-mask-v1");
  await d
    .getByLabel("New clothing name", { exact: true })
    .fill("Plum pintuck · reviewed neckline");
  const acceptedBefore = await pixels(page);
  await button(d, "Preview corrected clothing").click();
  const candidate = page.getByRole("dialog", {
    name: "Preview imported clothing",
    exact: true,
  });
  await expect(candidate).toBeVisible({ timeout: 240000 });
  assert.deepEqual(await candidate.getByRole("alert").allTextContents(), []);
  assert.deepEqual(
    await pixels(page),
    acceptedBefore,
    "Preparing candidate must not alter accepted outfit.",
  );
  await candidate
    .getByLabel("Candidate preview action", { exact: true })
    .selectOption("jump");
  await candidate
    .getByLabel("Candidate preview frame", { exact: true })
    .fill(String(source.animations.jump.frames.indexOf(103)));
  await screenshot(page, "full-clothing-candidate.png");
  const garment = await download(
    page,
    "Save corrected clothing",
    "female-plum-neckline-reviewed.garment.zip",
    "garment",
    {},
    candidate,
  );
  const maskReport = await download(
    page,
    "Save mask report",
    "mask-build-report.json",
    "mask-report",
    {},
    candidate,
  );
  const build = json(maskReport.bytes);
  assert.equal(build.output.sha256, sha(garment.bytes));
  assert.deepEqual(
    build.accepted.map((p) => p.frameId).sort((a, b) => a - b),
    targets,
  );
  assert(
    build.excluded.some((p) => p.frameId === 104 && p.decision === "pending"),
  );
  report.buildReport = maskReport.row;
  report.garment = garment.row;
  await button(candidate, "Apply clothing candidate").click();
  await ready(page, "Clothing candidate applied");
  await expect(panel(page).getByLabel("Top", { exact: true })).toHaveValue(
    "plum-pintuck-neckline-mask-v1",
  );
  report.workflow.push({
    name: "explicit-candidate-apply",
    top: "plum-pintuck-neckline-mask-v1",
    at: new Date().toISOString(),
  });
  await persist();
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
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
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
  await page.goto(`${origin}/workbench.html?character=female&mode=wardrobe`);
  const served = await response,
    servedBytes = await served.body();
  assert.equal(sha(servedBytes), sha(catalogBytes));
  report.catalogResponses.push({
    character: "female",
    url: served.url(),
    bytes: servedBytes.length,
    sha256: sha(servedBytes),
  });
  await ready(page, "Original outfit.");
  await outfit(page, entry.presets.find((p) => p.id === plan.preset).name);
  assert.equal(
    await panel(page).getByLabel("Hairstyle", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await panel(page).getByLabel("Face", { exact: true }).inputValue(),
    "",
  );
  await captureRows(page, "before-navy", poses);
  await gifs(page, "before-navy", source, [
    ["run", "right"],
    ["run", "left"],
    ["jump", "right"],
    ["jump", "left"],
  ]);
  await savedProject(page, "before-navy", false);
  await choose(page, "Bottom", "ochre-shorts", "Outfit updated");
  await captureRows(page, "before-ochre", [102, 103], "ochre-shorts");
  await choose(page, "Bottom", "navy-shorts", "Outfit updated");
  await maskWorkflow(page);
  await captureRows(page, "after-navy", poses);
  await gifs(page, "after-navy", source, [
    ["run", "right"],
    ["run", "left"],
    ["jump", "right"],
    ["jump", "left"],
  ]);
  await choose(page, "Bottom", "ochre-shorts", "Outfit updated");
  await captureRows(page, "after-ochre", [102, 103], "ochre-shorts");
  await choose(page, "Bottom", "navy-shorts", "Outfit updated");
  const project = await savedProject(page, "after-navy", true);
  await finalPack(page, project);
  await context.close();
  report.editorsClosedAt = new Date().toISOString();
  for (const pack of report.packs) await playback(pack);
  for (const [path, hash] of Object.entries({
    ...report.inputs,
    ...compiledJsSha256,
  }))
    assert.equal(
      sha(await readFile(join(root, path))),
      hash,
      `Captured input changed: ${path}`,
    );
  assert.equal(
    sha(await readFile(join(root, "dist/workbench.html"))),
    report.productionHtmlSha256,
  );
  assert.equal(
    sha(await readFile(join(root, "dist/player.html"))),
    report.playerHtmlSha256,
  );
  assert.equal(
    sha(await readFile(join(root, "docs/kling-wardrobe/catalog.json"))),
    report.catalogSha256,
  );
  assert(report.scriptRequests.every((r) => r.compiledSha256));
  for (const field of [
    "errors",
    "consoleErrors",
    "failedRequests",
    "externalRequests",
    "independentEditorRequests",
  ])
    assert.deepEqual(report[field], [], field);
  assert.equal(report.downloads.filter((d) => d.kind === "png").length, 22);
  assert.equal(report.gifs.length, 8);
  assert.equal(report.projects.length, 2);
  assert.equal(report.packs.length, 1);
  assert.equal(report.playback.length, 10);
  assert(
    report.playback.every((p) => p.missingPositions.length === 0),
    "Every scheduled position must be observed in independent playback.",
  );
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
      pngs: report.downloads.filter((d) => d.kind === "png").length,
      gifs: report.gifs.length,
      playback: report.playback.length,
      used,
    },
    null,
    2,
  ),
);
