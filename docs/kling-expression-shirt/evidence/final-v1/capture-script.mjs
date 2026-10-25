// Actual production UI downloads. No offline artwork is presented as an app export.
// First: --shirt-roundtrip --shirt-template <prepared template ZIP> --run <fresh-name>
// Then, after the catalog/build includes that downloaded garment: --run <fresh-name>
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, statfs, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium, expect } from "@playwright/test";
import { unzipSync, zipSync, strToU8 } from "fflate";
import { parseGIF, decompressFrames } from "gifuct-js";
import { preview } from "vite";

const { values: args } = parseArgs({
  options: {
    run: { type: "string" },
    character: { type: "string", default: "both" },
    output: { type: "string", default: "docs/kling-expression-shirt/evidence" },
    temp: { type: "string" },
    port: { type: "string", default: "5224" },
    "shirt-roundtrip": { type: "boolean", default: false },
    "shirt-template": {
      type: "string",
      default:
        "artwork/kling-expression-shirt/prepared/shirt/final-v1/midnight-sailor-template-v1.zip",
    },
    "shirt-id": { type: "string", default: "midnight-sailor-v1" },
    "shirt-output": {
      type: "string",
      default: "docs/kling-wardrobe/garments/male/midnight-sailor-v1.zip",
    },
    "mixed-bottom": { type: "string", default: "navy-suit-trousers-v1" },
  },
});
assert(
  args.run && /^[a-z0-9][a-z0-9-]*$/.test(args.run),
  "Choose a fresh --run name.",
);
assert(["both", "male", "female"].includes(args.character));
assert(!args["shirt-roundtrip"] || args.character !== "female");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, args.output, args.run);
const temporary = resolve(
  root,
  args.temp || `.review-tmp/kling-expression-shirt/${args.run}`,
);
assert(
  temporary.startsWith(resolve(root, ".review-tmp") + sep) ||
    /^\/tmp\/kling-expression-shirt-[a-z0-9-]+$/.test(temporary),
  "Keep temporary projects under .review-tmp or /tmp/kling-expression-shirt-<run>.",
);
for (const directory of [output, temporary]) {
  assert(
    !existsSync(directory) || (await readdir(directory)).length === 0,
    `Preserve prior evidence: ${directory}`,
  );
  await mkdir(directory, { recursive: true });
}
const MiB = 1024 * 1024;
const budgets = {
  retained: 500_000_000,
  temporary: 768 * MiB,
  diskReserve: 128 * MiB,
};
const used = { retained: 0, temporary: 0 };
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path).replaceAll("\\", "/");
const json = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));
const members = (bytes, names) =>
  unzipSync(new Uint8Array(bytes), {
    filter: (file) => names.includes(file.name),
  });
const manifest = (bytes) =>
  json(members(bytes, ["manifest.json"])["manifest.json"]);
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const faces = ["", "gentle", "joyful"];
const hairChoices = {
  male: ["side-part", "airy-tousle"],
  female: ["tucked-bun", "ribbon-pony"],
};
const characters = args["shirt-roundtrip"]
  ? ["male"]
  : args.character === "both"
    ? ["male", "female"]
    : [args.character];
if (args["shirt-roundtrip"])
  assert(
    !existsSync(resolve(root, args["shirt-output"])),
    "Preserve the existing reusable shirt. Choose --shirt-output for a separate reviewed copy.",
  );
const catalogBytes = await readFile(
  join(root, "docs/kling-wardrobe/catalog.json"),
);
const catalog = json(catalogBytes);
const compiledJsSha256 = {};
for (const name of await readdir(join(root, "dist/assets"), {
  recursive: true,
})) {
  if (name.endsWith(".js")) {
    const path = join(root, "dist/assets", name);
    compiledJsSha256[rel(path)] = sha(await readFile(path));
  }
}
assert(
  Object.keys(compiledJsSha256).length > 0,
  "Build production JavaScript before capture.",
);
const report = {
  format: "gathria-expression-shirt-browser-evidence",
  version: 1,
  run: args.run,
  mode: args["shirt-roundtrip"] ? "shirt-identity-roundtrip" : "final-looks",
  production: true,
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
  catalogSha256: sha(catalogBytes),
  compiledJsSha256,
  catalogResponses: [],
  scriptRequests: [],
  budgets,
  used,
  scope:
    "Actual native PNG and action GIF UI downloads, portable project reopen, then standalone playback of actual exported ZIPs. Visual acceptance and face/ear ownership auditing are separate checks.",
  inputs: {},
  downloads: [],
  screenshots: [],
  matrix: [],
  gifs: [],
  projects: [],
  packs: [],
  playback: [],
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
  /WardrobeEditor|SpriteActionEditor|action-gif|\/assets\/workbench-[^/]+\.js|\/src\/(wardrobe|appearance|skeletal)\//;
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
async function saveAndExport(page, key, character, sourceBytes) {
  const source = manifest(sourceBytes);
  await pose(page, source, "run", 55, "left");
  const before = await pixels(page);
  const saved = await download(
    page,
    /^Save wardrobe/,
    `${key}.wardrobe.zip`,
    "project",
  );
  await ready(page, "Wardrobe project saved");
  const files = members(saved.bytes, [
    "document.json",
    "source.character.zip",
    "appearance.zip",
    "registration.json",
  ]);
  const doc = json(files["document.json"]);
  assert.equal(sha(files["source.character.zip"]), sha(sourceBytes));
  assert.equal(doc.sourceSha256, sha(sourceBytes));
  assert.equal(doc.registrationSha256, sha(files["registration.json"]));
  assert.equal(doc.appearance.faceId, "joyful");
  assert.equal(doc.appearance.bankSha256, sha(files["appearance.zip"]));
  const bank = manifest(files["appearance.zip"]);
  assert.deepEqual(doc.preview, { action: "run", facing: "left" });
  await panel(page)
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles(saved.path);
  await ready(page, "Saved outfit and action settings restored");
  for (const [label, value] of [
    ["Face", doc.appearance.faceId],
    ["Hairstyle", doc.appearance.hairId || ""],
    ["Hair color", doc.appearance.hairColor],
    ["Wardrobe action", "run"],
    ["Wardrobe facing", "left"],
  ]) {
    await expect(panel(page).getByLabel(label, { exact: true })).toHaveValue(
      value,
    );
  }
  await pose(page, source, "run", 55, "left");
  assert.deepEqual(await pixels(page), before);
  const reopenedAt = new Date().toISOString();
  report.projects.push({
    ...saved.row,
    key,
    character,
    selection: doc.selection,
    appearance: doc.appearance,
    appearanceBankSha256: sha(files["appearance.zip"]),
    preview: doc.preview,
    sourceSha256: sha(sourceBytes),
    registrationSha256: doc.registrationSha256,
    focusFrame: 55,
    before,
    after: await pixels(page),
    exactReopen: true,
    reopenedAt,
  });
  const exported = await download(
    page,
    "Export CharacterPack",
    `${key}.character.zip`,
    "pack",
  );
  await ready(page, "CharacterPack exported");
  const m = manifest(exported.bytes);
  const sourceConfig = json(
    members(sourceBytes, [source.configuration])[source.configuration],
  );
  const exportedConfig = json(
    members(exported.bytes, [m.configuration])[m.configuration],
  );
  assert.deepEqual(exportedConfig.source, sourceConfig.source);
  assert.deepEqual(
    exportedConfig.derivation.frames,
    sourceConfig.derivation.frames,
  );
  assert.deepEqual(
    exportedConfig.sourceMetadata.wardrobe.selection,
    doc.selection,
  );
  assert.deepEqual(
    exportedConfig.sourceMetadata.appearance.selection,
    doc.appearance,
  );
  const p = bank.padding;
  assert.deepEqual(m.animations, source.animations);
  assert.deepEqual(
    m.frames.map((f) => f.id),
    source.frames.map((f) => f.id),
  );
  assert.deepEqual(m.facing, source.facing);
  assert.deepEqual(m.anchor, {
    ...source.anchor,
    x: source.anchor.x + p.left,
    y: source.anchor.y + p.top,
  });
  assert.equal(
    m.spritesheet.frameWidth,
    source.spritesheet.frameWidth + p.left + p.right,
  );
  assert.equal(
    m.spritesheet.frameHeight,
    source.spritesheet.frameHeight + p.top + p.bottom,
  );
  for (const f of m.frames)
    assert.deepEqual(
      [f.width, f.height],
      [m.spritesheet.frameWidth, m.spritesheet.frameHeight],
    );
  report.packs.push({
    ...exported.row,
    key,
    character,
    project: saved.row.file,
    exportedAfterReopen: true,
    reopenedAt,
    sourceSha256: sha(sourceBytes),
    sourceFrameTimeMappingUnchanged: true,
    sourceGeometry: {
      width: source.spritesheet.frameWidth,
      height: source.spritesheet.frameHeight,
      anchor: source.anchor,
    },
    padding: p,
    selection: doc.selection,
    appearance: doc.appearance,
    manifest: m,
  });
  await screenshot(page, `${key}-reopened.png`);
  await persist();
}
async function shirtRoundtrip(page, entry, source) {
  const inputPath = resolve(root, args["shirt-template"]);
  const input = await readFile(inputPath);
  const template = manifest(input);
  report.inputs[rel(inputPath)] = sha(input);
  await outfit(page, "Everyday");
  await panel(page)
    .getByLabel("Import registered clothing file", { exact: true })
    .setInputFiles(inputPath);
  await ready(page, "Clothing added");
  await choose(page, "Top", template.id, "Outfit updated");
  await pose(page, source, "run", 55);
  const before = await pixels(page);
  await panel(page)
    .locator("summary")
    .filter({ hasText: "Fitting guides" })
    .click();
  await panel(page)
    .getByLabel("Recipe clothing", { exact: true })
    .selectOption(template.id);
  await panel(page)
    .getByLabel("Inspect clothing layer", { exact: true })
    .check();
  // Capture the real template link too; its source/registration bind the authoring input.
  const link = panel(page).getByRole("link", {
    name: "Download clothing template",
    exact: true,
  });
  const waiting = page.waitForEvent("download", { timeout: 180000 });
  await link.click();
  const result = await waiting;
  assert.equal(await result.failure(), null);
  const templateBytes = await readFile(await result.path());
  const templatePath = join(temporary, "male-authoring-template.zip");
  await writeTracked(templatePath, templateBytes, "temporary");
  await result.delete();
  assert.equal(
    sha(templateBytes),
    sha(await readFile(join(root, entry.templateUrl.slice(1)))),
  );
  report.downloads.push({
    file: rel(templatePath),
    kind: "template",
    bytes: templateBytes.length,
    sha256: sha(templateBytes),
    temporary: true,
    actualUiDownload: true,
  });
  const kit = await download(
    page,
    "Download neighboring poses for painting",
    "midnight-sailor-native-pose-kit.zip",
    "kit",
  );
  const kitFiles = unzipSync(new Uint8Array(kit.bytes));
  const recipe = json(kitFiles["recipe.json"]);
  assert.equal(sha(kitFiles["base.garment.zip"]), sha(input));
  recipe.output = { id: args["shirt-id"], name: "Midnight sailor shirt" };
  const unchangedMembers = Object.fromEntries(
    Object.entries(kitFiles)
      .filter(([name]) => name !== "recipe.json")
      .map(([name, bytes]) => [name, sha(bytes)]),
  );
  kitFiles["recipe.json"] = strToU8(JSON.stringify(recipe, null, 2) + "\n");
  const renamed = zipSync(kitFiles, { level: 6 });
  const renamedPath = join(temporary, "midnight-sailor-identity-roundtrip.zip");
  await writeTracked(renamedPath, renamed, "temporary");
  await panel(page)
    .getByLabel("Painted pose kit file", { exact: true })
    .setInputFiles(renamedPath);
  const dialog = page.getByRole("dialog", {
    name: "Preview imported clothing",
    exact: true,
  });
  await expect(dialog).toBeVisible({ timeout: 240000 });
  assert.deepEqual(await pixels(page), before);
  const material = await download(
    page,
    "Save painted clothing",
    `${args["shirt-id"]}.zip`,
    "garment",
    {},
    dialog,
    resolve(root, args["shirt-output"]),
  );
  const audit = await download(
    page,
    "Save painting report",
    "midnight-sailor-paint-report.json",
    "paint-report",
    {},
    dialog,
  );
  const paintReport = json(audit.bytes);
  assert.equal(paintReport.inputSha256, sha(renamed));
  assert.equal(paintReport.output.sha256, sha(material.bytes));
  assert(paintReport.poses.length > 0);
  assert(
    paintReport.poses.every(
      (p) => p.changedPixels === 0 && p.beforeRgbaSha256 === p.afterRgbaSha256,
    ),
  );
  await button(dialog, "Apply clothing candidate").click();
  await expect(dialog).toHaveCount(0, { timeout: 240000 });
  await ready(page, "Clothing candidate applied");
  await expect(panel(page).getByLabel("Top", { exact: true })).toHaveValue(
    args["shirt-id"],
  );
  assert.deepEqual(await pixels(page), before);
  report.shirtRoundtrip = {
    input: rel(inputPath),
    inputSha256: sha(input),
    catalogId: args["shirt-id"],
    output: material.row,
    kit: kit.row,
    renamedKit: rel(renamedPath),
    renamedKitSha256: sha(renamed),
    unchangedMembers,
    recipeOnlyRename: true,
    changedRgbPixels: 0,
    noArtworkRepairClaimed: true,
    before,
    after: await pixels(page),
    paintReport,
  };
  await png(page, "male-midnight-sailor-roundtrip", source, "run", 55);
  await screenshot(page, "male-midnight-sailor-roundtrip.png");
}
async function playback(pack) {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 850 },
  });
  watch(context, true);
  const page = await context.newPage();
  activePage = page;
  await page.route(forbiddenEditorModule, (route) => route.abort());
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

try {
  await diskCheck();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    downloadsPath: join(temporary, "browser-downloads"),
    args: ["--disable-dev-shm-usage"],
  });
  for (const character of characters) {
    const entry = catalog.characters.find((c) => c.key === character);
    assert(entry);
    const sourcePath = join(root, entry.sourceUrl.slice(1));
    const sourceBytes = await readFile(sourcePath);
    const source = manifest(sourceBytes);
    report.inputs[rel(sourcePath)] = sha(sourceBytes);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    watch(context);
    const page = await context.newPage();
    activePage = page;
    // catalog-assets.ts publishes the real catalog and ZIPs as hashed Vite assets.
    // Observe the URL the built UI uses, without a /docs mount or request fixtures.
    const catalogResponse = page.waitForResponse(
      (response) =>
        /\/assets\/catalog-[^/]+\.json(?:\?|$)/.test(response.url()),
      { timeout: 180000 },
    );
    catalogResponse.catch(() => {});
    await page.goto(
      `${origin}/workbench.html?character=${character}&mode=wardrobe`,
    );
    const served = await catalogResponse;
    const servedCatalogBytes = await served.body();
    assert.equal(
      sha(servedCatalogBytes),
      sha(catalogBytes),
      "Production catalog is stale. Build the current assets before capture.",
    );
    report.catalogResponses.push({
      character,
      url: served.url(),
      bytes: servedCatalogBytes.length,
      sha256: sha(servedCatalogBytes),
    });
    await ready(page, "Original outfit.");
    if (args["shirt-roundtrip"]) {
      await shirtRoundtrip(page, entry, source);
    } else {
      for (const [look, preset] of [
        ["day", "Everyday"],
        ["wedding", "Wedding"],
      ]) {
        await outfit(page, preset);
        for (const hair of hairChoices[character]) {
          await choose(page, "Hairstyle", hair);
          await choose(page, "Hair color", "chestnut");
          for (const face of faces) {
            await choose(page, "Face", face);
            const key = `${character}-${look}-${hair}-${face || "natural"}`;
            const rows = [];
            for (const [action, frameId] of [
              ["idle", 0],
              ["run", 55],
              ["jump", 86],
              ["celebrate", 78],
            ]) {
              rows.push(
                await png(page, key, source, action, frameId, "right", {
                  character,
                  look,
                  hairId: hair,
                  faceId: face || null,
                }),
              );
            }
            report.matrix.push({
              character,
              look,
              hairId: hair,
              faceId: face || null,
              pngs: rows,
            });
            if (
              look === "day" &&
              hair === hairChoices[character][1] &&
              face !== "joyful"
            )
              await gifs(page, key, source, [["run", "right"]]);
          }
        }
        const key = `${character}-${look}-joyful`;
        await gifs(page, key, source);
        await saveAndExport(page, key, character, sourceBytes);
      }
      if (character === "male") {
        assert(
          entry.items.some((i) => i.id === args["shirt-id"]),
          "Run --shirt-roundtrip, register its actual garment download, then rebuild before the final capture.",
        );
        await outfit(page, "Everyday");
        await choose(page, "Top", args["shirt-id"], "Outfit updated");
        await choose(page, "Hairstyle", hairChoices.male[1]);
        await choose(page, "Face", "joyful");
        await choose(page, "Hair color", "chestnut");
        const bottom = await panel(page)
          .getByLabel("Bottom", { exact: true })
          .inputValue();
        assert.notEqual(
          bottom,
          args["mixed-bottom"],
          "Mixed pants must differ from the default pants.",
        );
        for (const [label, value] of [
          ["default", bottom],
          ["mixed", args["mixed-bottom"]],
        ]) {
          await choose(page, "Bottom", value, "Outfit updated");
          for (const [action, frameId] of [
            ["idle", 0],
            ["run", 55],
            ["jump", 86],
            ["celebrate", 78],
          ]) {
            await png(
              page,
              `male-midnight-sailor-${label}`,
              source,
              action,
              frameId,
              "right",
              { shirtId: args["shirt-id"], bottomId: value },
            );
          }
        }
        await choose(page, "Bottom", bottom, "Outfit updated");
        await gifs(page, "male-midnight-sailor-joyful", source);
        await saveAndExport(
          page,
          "male-midnight-sailor-joyful",
          character,
          sourceBytes,
        );
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await screenshot(page, `${character}-mobile.png`);
    await context.close();
  }
  report.editorsClosedAt = new Date().toISOString();
  assert(report.packs.length <= 5);
  for (const pack of report.packs) await playback(pack);
  for (const [path, hash] of Object.entries(report.inputs))
    assert.equal(sha(await readFile(join(root, path))), hash);
  for (const [path, hash] of Object.entries(compiledJsSha256))
    assert.equal(sha(await readFile(join(root, path))), hash);
  assert(
    report.scriptRequests.every((request) => request.compiledSha256),
    "Production capture requested a script outside the recorded build.",
  );
  for (const field of [
    "errors",
    "consoleErrors",
    "failedRequests",
    "externalRequests",
    "independentEditorRequests",
  ])
    assert.deepEqual(report[field], [], field);
  if (!args["shirt-roundtrip"]) {
    assert.equal(report.matrix.length, characters.length * 2 * 2 * 3);
    assert.equal(
      report.packs.length,
      characters.length * 2 + Number(characters.includes("male")),
    );
    assert.equal(report.playback.length, report.packs.length * 10);
    assert.equal(
      report.gifs.length,
      report.packs.length * 4 + characters.length * 2,
    );
  }
  report.passed = true;
} catch (error) {
  report.failure = String(error.stack || error);
  if (activePage && !activePage.isClosed())
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
      matrix: report.matrix.length,
      packs: report.packs.length,
      playback: report.playback.length,
      used,
    },
    null,
    2,
  ),
);
