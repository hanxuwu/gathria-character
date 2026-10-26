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
    plan: { type: "boolean", default: false },
    output: { type: "string", default: "docs/kling-expression-fit/evidence" },
    temp: { type: "string" },
    port: { type: "string", default: "5226" },
    "male-day": { type: "string", default: "day-soft-cuff" },
    "male-wedding": { type: "string", default: "wedding-curved-cuff" },
    "female-day": { type: "string", default: "day-smooth-waist" },
    "female-wedding": { type: "string", default: "wedding-smooth-waist" },
    "male-new": { type: "string", default: "midnight-sailor-v2" },
    "female-new": { type: "string", default: "plum-pintuck-top-v1" },
    "male-final-preset": { type: "string", default: "midnight-sailor-refined" },
    "female-navy-preset": { type: "string", default: "plum-pintuck-day" },
    "female-ochre-preset": { type: "string", default: "plum-pintuck-ochre" },
  },
});
const root = fileURLToPath(new URL("../", import.meta.url));
const faces = ["", "gentle", "joyful", "gentle-v2", "joyful-v2"];
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const hairChoices = {
  male: ["side-part", "airy-tousle"],
  female: ["tucked-bun", "ribbon-pony"],
};
const expressionPoses = [
  ["idle", 0],
  ["run", 59],
  ["jump", 86],
  ["celebrate", 78],
];
const weddingPoses = [
  ["idle", 0],
  ["jump", 86],
];
const sailorPoses = [
  ["run", 58],
  ["run", 59],
  ["run", 60],
  ["celebrate", 77],
  ["celebrate", 78],
  ["celebrate", 79],
  ["jump", 85],
  ["jump", 86],
  ["jump", 87],
  ["jump", 95],
  ["jump", 96],
  ["jump", 97],
  ["jump", 103],
  ["jump", 104],
  ["jump", 105],
];
const femalePoses = [
  ["idle", 0],
  ["run", 58],
  ["run", 62],
  ["jump", 86],
  ["jump", 89],
  ["jump", 96],
  ["jump", 101],
  ["jump", 102],
  ["jump", 103],
  ["jump", 112],
  ["celebrate", 78],
  ["celebrate", 79],
];
const faceSemantics = [
  { id: null, label: "Natural (original)", role: "shipped original" },
  { id: "gentle", label: "Gentle baseline", role: "shipped old style" },
  { id: "joyful", label: "Joyful baseline", role: "shipped old style" },
  { id: "gentle-v2", label: "Gentle candidate", role: "additive refinement" },
  { id: "joyful-v2", label: "Joyful candidate", role: "additive refinement" },
];
const MiB = 1024 * 1024;
const budgets = {
  retained: 280 * MiB,
  temporary: 260 * MiB,
  diskReserve: 128 * MiB,
  nativePngs: 122,
  screenshots: 8,
  gifs: 30,
  projects: 3,
  packs: 3,
  playback: 30,
};
const plan = {
  semantics: faceSemantics,
  budgets,
  expression: {
    characters: ["male", "female"],
    faces,
    hair: "first existing hairstyle",
    poses: expressionPoses,
    joyfulOldNewAdditionalJumpPoses: [90, 102],
    pngs: 48,
    gifs: 14,
  },
  wedding: {
    characters: ["male", "female"],
    faces,
    hair: "second existing hairstyle",
    poses: weddingPoses,
    pngs: 20,
    gifs: 0,
  },
  male: {
    tops: ["midnight-sailor-v1", args["male-new"]],
    poses: sailorPoses,
    pngs: 30,
    gifs: 8,
  },
  female: {
    top: args["female-new"],
    bottoms: ["navy-shorts", "ochre-shorts"],
    poses: femalePoses,
    pngs: 24,
    gifs: 8,
  },
  selectedPresets: {
    male: { day: args["male-day"], wedding: args["male-wedding"] },
    female: { day: args["female-day"], wedding: args["female-wedding"] },
  },
  finalPresets: {
    male: args["male-final-preset"],
    femaleNavy: args["female-navy-preset"],
    femaleOchre: args["female-ochre-preset"],
  },
  independentPlayer:
    "Close all editor contexts, then load actual exported ZIPs: 3 packs × 5 actions × 2 directions.",
};
if (args.plan) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}
assert(
  args.run && /^[a-z0-9][a-z0-9-]*$/.test(args.run),
  "Choose a fresh --run name.",
);
const output = resolve(root, args.output, args.run);
const temporary = resolve(args.temp || `/tmp/kling-expression-fit-${args.run}`);
assert(
  temporary.startsWith(resolve(root, ".review-tmp") + sep) ||
    /^\/tmp\/kling-expression-fit-[a-z0-9-]+$/.test(temporary),
  "Keep temporary projects in the dedicated run directory.",
);
for (const directory of [output, temporary]) {
  assert(
    !existsSync(directory) || (await readdir(directory)).length === 0,
    `Preserve prior evidence: ${directory}`,
  );
  await mkdir(directory, { recursive: true });
}
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
for (const character of ["male", "female"]) {
  const entry = catalog.characters.find((c) => c.key === character);
  assert(entry);
  for (const id of [
    ...Object.values(plan.selectedPresets[character]),
    ...(character === "male"
      ? [plan.finalPresets.male]
      : [plan.finalPresets.femaleNavy, plan.finalPresets.femaleOchre]),
  ])
    assert(
      entry.presets.some((p) => p.id === id),
      `Missing ${character} preset ${id}`,
    );
  for (const id of character === "male"
    ? ["midnight-sailor-v1", args["male-new"]]
    : [args["female-new"], "navy-shorts", "ochre-shorts"])
    assert(
      entry.items.some((i) => i.id === id),
      `Missing ${character} garment ${id}; wait for final catalog/build.`,
    );
}
const report = {
  format: "gathria-expression-fit-browser-evidence",
  version: 1,
  run: args.run,
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
  playerHtmlSha256: sha(await readFile(join(root, "dist/player.html"))),
  catalogSha256: sha(catalogBytes),
  compiledJsSha256,
  plan,
  budgets,
  used,
  scope:
    "Same production build, retained baseline styles and additive candidate styles, native PNG/action-GIF UI downloads; three editable projects saved, reopened exactly, and exported, followed by editor closure and thirty independent-player cases. No network fixtures or generated reference images.",
  catalogResponses: [],
  scriptRequests: [],
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
async function saveAndExport(page, key, character, sourceBytes) {
  assert(
    report.projects.length < budgets.projects,
    "Project count budget exceeded",
  );
  assert(report.packs.length < budgets.packs, "Pack count budget exceeded");
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
  assert.equal(
    doc.appearance.faceId,
    character === "male" ? "gentle-v2" : "joyful-v2",
  );
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

async function preset(page, entry, id) {
  const p = entry.presets.find((p) => p.id === id);
  assert(p, `Missing preset ${id}`);
  await outfit(page, p.name);
  for (const [slot, label] of [
    ["top", "Top"],
    ["bottom", "Bottom"],
    ["fullBody", "Dress / one-piece"],
    ["shoes", "Shoes"],
  ])
    await expect(panel(page).getByLabel(label, { exact: true })).toHaveValue(
      p.selection[slot] || "",
    );
  return p;
}
async function selection(page, entry) {
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
  return {
    selection: selected,
    items: Object.values(selected)
      .filter(Boolean)
      .map((id) => {
        const item = entry.items.find((i) => i.id === id);
        assert(item, `Unknown garment ${id}`);
        return item;
      }),
    hairId:
      (await panel(page)
        .getByLabel("Hairstyle", { exact: true })
        .inputValue()) || null,
    hairColor: await panel(page)
      .getByLabel("Hair color", { exact: true })
      .inputValue(),
    faceId:
      (await panel(page).getByLabel("Face", { exact: true }).inputValue()) ||
      null,
  };
}
async function rows(page, key, entry, source, poses, meta) {
  const picked = await selection(page, entry);
  const pngs = [];
  for (const [action, frameId] of poses)
    pngs.push(
      await png(page, key, source, action, frameId, "right", {
        key,
        ...picked,
        ...meta,
      }),
    );
  report.matrix.push({ key, ...picked, ...meta, pngs });
  await persist();
}
async function expressions(page, character, entry, source) {
  for (const look of ["day", "wedding"]) {
    const selectedPreset = await preset(
      page,
      entry,
      plan.selectedPresets[character][look],
    );
    const hair = hairChoices[character][look === "day" ? 0 : 1];
    await choose(page, "Hairstyle", hair);
    await choose(page, "Hair color", "chestnut");
    for (const face of faces) {
      await choose(page, "Face", face);
      const key = `${character}-${look}-${hair}-${face || "natural"}`;
      await rows(
        page,
        key,
        entry,
        source,
        look === "day"
          ? [
              ...expressionPoses,
              ...(["joyful", "joyful-v2"].includes(face)
                ? [
                    ["jump", 90],
                    ["jump", 102],
                  ]
                : []),
            ]
          : weddingPoses,
        {
          character,
          look,
          presetId: selectedPreset.id,
          presetName: selectedPreset.name,
          faceRole: faceSemantics.find((f) => f.id === (face || null)).role,
        },
      );
      if (look === "day") {
        await gifs(page, key, source, [["run", "right"]]);
        if (["joyful", "joyful-v2"].includes(face))
          await gifs(page, key, source, [["jump", "right"]]);
      }
    }
  }
}
async function maleLooks(page, entry, source, sourceBytes) {
  const selectedPreset = await preset(page, entry, plan.finalPresets.male);
  await choose(page, "Hairstyle", hairChoices.male[1]);
  await choose(page, "Hair color", "chestnut");
  await choose(page, "Face", "gentle-v2");
  for (const top of ["midnight-sailor-v1", args["male-new"]]) {
    await choose(page, "Top", top, "Outfit updated");
    const key = `male-${top}-gentle-v2`;
    await rows(page, key, entry, source, sailorPoses, {
      character: "male",
      finalPresetId: selectedPreset.id,
      comparison: "same-build sailor baseline/candidate",
      topRole: top.endsWith("v1") ? "shipped old garment" : "candidate",
    });
    await gifs(page, key, source, [
      ["run", "right"],
      ["run", "left"],
      ["jump", "right"],
      ["celebrate", "right"],
    ]);
  }
  await saveAndExport(
    page,
    `male-${args["male-new"]}-gentle-v2`,
    "male",
    sourceBytes,
  );
}
async function femaleLooks(page, entry, source, sourceBytes) {
  for (const bottom of ["navy-shorts", "ochre-shorts"]) {
    const selectedPreset = await preset(
      page,
      entry,
      bottom === "navy-shorts"
        ? plan.finalPresets.femaleNavy
        : plan.finalPresets.femaleOchre,
    );
    await expect(panel(page).getByLabel("Top", { exact: true })).toHaveValue(
      args["female-new"],
    );
    await expect(panel(page).getByLabel("Bottom", { exact: true })).toHaveValue(
      bottom,
    );
    await choose(page, "Hairstyle", hairChoices.female[1]);
    await choose(page, "Hair color", "chestnut");
    await choose(page, "Face", "joyful-v2");
    const key = `female-${args["female-new"]}-${bottom}-joyful-v2`;
    await rows(page, key, entry, source, femalePoses, {
      character: "female",
      presetId: selectedPreset.id,
      comparison: "new separate top mixed with retained shorts",
    });
    await gifs(page, key, source, [
      ["run", "right"],
      ["run", "left"],
      ["jump", "right"],
      ["celebrate", "right"],
    ]);
    await saveAndExport(page, key, "female", sourceBytes);
  }
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
  for (const character of ["male", "female"]) {
    const entry = catalog.characters.find((c) => c.key === character);
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
    const servedBytes = await served.body();
    assert.equal(
      sha(servedBytes),
      sha(catalogBytes),
      "Production catalog is stale. Build final assets before capture.",
    );
    report.catalogResponses.push({
      character,
      url: served.url(),
      bytes: servedBytes.length,
      sha256: sha(servedBytes),
    });
    await ready(page, "Original outfit.");
    const offered = await panel(page)
      .getByLabel("Face", { exact: true })
      .locator("option")
      .evaluateAll((options) =>
        options.map((o) => ({ value: o.value, label: o.textContent })),
      );
    for (const face of faces)
      assert(
        offered.some((o) => o.value === face),
        `Missing additive expression ${face}; await final build.`,
      );
    report.catalogResponses.at(-1).faceOptions = offered;
    await expressions(page, character, entry, source);
    if (character === "male") await maleLooks(page, entry, source, sourceBytes);
    else await femaleLooks(page, entry, source, sourceBytes);
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
  for (const pack of report.packs) await playback(pack);
  for (const [path, hash] of Object.entries(report.inputs))
    assert.equal(sha(await readFile(join(root, path))), hash);
  for (const [path, hash] of Object.entries(compiledJsSha256))
    assert.equal(sha(await readFile(join(root, path))), hash);
  assert.equal(
    sha(await readFile(join(root, "docs/kling-wardrobe/catalog.json"))),
    report.catalogSha256,
  );
  assert.equal(
    sha(await readFile(join(root, "dist/workbench.html"))),
    report.productionHtmlSha256,
  );
  assert.equal(
    sha(await readFile(join(root, "dist/player.html"))),
    report.playerHtmlSha256,
  );
  assert(
    report.scriptRequests.every((request) => request.compiledSha256),
    "Script outside the recorded production build.",
  );
  for (const field of [
    "errors",
    "consoleErrors",
    "failedRequests",
    "externalRequests",
    "independentEditorRequests",
  ])
    assert.deepEqual(report[field], [], field);
  assert.equal(
    report.downloads.filter((d) => d.kind === "png").length,
    budgets.nativePngs,
  );
  for (const field of ["screenshots", "gifs", "projects", "packs", "playback"])
    assert.equal(report[field].length, budgets[field], field);
  assert.equal(report.matrix.length, 24);
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
      matrix: report.matrix.length,
      packs: report.packs.length,
      playback: report.playback.length,
      used,
    },
    null,
    2,
  ),
);
