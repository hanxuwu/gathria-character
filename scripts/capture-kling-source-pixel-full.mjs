// Actual production UI exports and independent playback of the opt-in full theme.
// Build/checkpoint first. Native downloads never use a rendering shortcut.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { unzipSync, zipSync, strToU8 } from "fflate";
import { preview } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const study = resolve(
  root,
  process.env.KLING_SOURCE_PIXEL_FULL_DIR || "docs/kling-source-pixel-full",
);
const out = join(study, "evidence");
const scratch = join(root, ".review-tmp/source-pixel-full-capture");
const baseline = process.env.KLING_SOURCE_PIXEL_FULL_BASELINE || "f958ab2";
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const facings = ["right", "left"];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path);
const json = (bytes) => JSON.parse(new TextDecoder().decode(bytes));
const title = (value) => value[0].toUpperCase() + value.slice(1);
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
async function shaFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
const listed = (...paths) =>
  git("ls-files", "-z", "--cached", "--others", "--exclude-standard", ...paths)
    .split("\0")
    .filter(Boolean);
await mkdir(out, { recursive: true });
await mkdir(scratch, { recursive: true });
assert(
  !existsSync(join(out, "capture.json")),
  "Choose a fresh full-theme evidence directory.",
);
const originalCatalogFile = "artwork/kling-themes/catalog-index.json";
const newCatalogFile = "artwork/kling-source-pixel-full/catalog-index.json";
const originalCatalog = json(await readFile(join(root, originalCatalogFile)));
const newCatalog = json(await readFile(join(root, newCatalogFile)));
assert.equal(newCatalog.length, 2);
execFileSync(
  "git",
  [
    "diff",
    "--exit-code",
    baseline,
    "--",
    "artwork/kling-source-pixel-study",
    "docs/kling-source-pixel-study",
  ],
  { cwd: root, stdio: "pipe", maxBuffer: 1024 * 1024 },
);
for (const entry of originalCatalog) {
  assert.equal(await shaFile(join(root, entry.file)), entry.sha256);
  for (const look of entry.lookAssets)
    assert.equal(await shaFile(join(root, look.file)), look.sha256);
}
const protectedHashes = {};
for (const file of [
  originalCatalogFile,
  "docs/kling-source-pixel-study/validation.json",
  "docs/kling-source-pixel-study/evidence/capture.json",
  "scripts/capture-kling-source-pixel-study.mjs",
  "scripts/verify-kling-source-pixel-study.py",
]) {
  const bytes = await readFile(join(root, file));
  const prior = execFileSync("git", ["show", `${baseline}:${file}`], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.deepEqual(
    bytes,
    prior,
    `${file} must remain unchanged from the completed study.`,
  );
  protectedHashes[file] = sha(bytes);
}
const bundles = [];
for (const character of ["male", "female"]) {
  const entry = newCatalog.find((row) => row.character === character);
  assert(
    entry &&
      entry.key === `${character}:kling-source-pixel@1` &&
      !entry.isOriginal,
  );
  const bytes = await readFile(join(root, entry.file));
  assert.equal(sha(bytes), entry.sha256);
  const files = unzipSync(bytes),
    theme = json(files["theme.json"]);
  assert.equal(theme.id, "kling-source-pixel");
  assert.equal(theme.rendering, "pixel");
  assert.deepEqual(theme.looks.map((look) => look.logicalId).sort(), [
    "base",
    "wedding",
  ]);
  const looks = theme.looks.map((look) => {
    const packBytes = files[look.file];
    assert.equal(sha(packBytes), look.sha256);
    const packFiles = unzipSync(packBytes),
      manifest = json(packFiles["manifest.json"]),
      config = json(packFiles["character.json"]);
    assert.deepEqual(
      Object.keys(manifest.animations).sort(),
      actions.slice().sort(),
    );
    assert.equal(manifest.spritesheet.frameWidth, 192);
    assert.equal(manifest.spritesheet.frameHeight, 298);
    assert.deepEqual([manifest.anchor.x, manifest.anchor.y], [96, 282]);
    assert(manifest.scale.pixelArt && manifest.scale.integerOnly);
    for (const action of actions)
      assert.equal(manifest.animations[action].fps, 24);
    return { ...look, packBytes, manifest, config };
  });
  bundles.push({ character, entry, bytes, theme, looks });
}
const sourceFiles = listed(
  "src",
  "scripts/*source-pixel-full*",
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "tsconfig.json",
);
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (file) => [file, await shaFile(join(root, file))]),
  ),
);
const assetFiles = [
  ...new Set([
    originalCatalogFile,
    newCatalogFile,
    ...originalCatalog.flatMap((entry) => [
      entry.file,
      ...entry.lookAssets.map((look) => look.file),
    ]),
    ...listed(
      "artwork/kling-source-pixel-full",
      "docs/kling-source-pixel-full/bundles",
      "docs/kling-source-pixel-study",
    ),
    ...["male", "female"].flatMap((character) =>
      ["base", "wedding"].map(
        (lookId) =>
          `docs/kling-themes/evidence/${character}-original-${lookId}.character.zip`,
      ),
    ),
  ]),
];
// Streaming each file keeps both the old source archives and new atlases bounded.
const assetHashes = {};
for (const file of assetFiles)
  assetHashes[file] = await shaFile(join(root, file));
const report = {
  format: "gathria-source-pixel-full-evidence",
  version: 1,
  production: true,
  startedAt: new Date().toISOString(),
  commitAtCapture: git("rev-parse", "HEAD"),
  baseline,
  sourceHashes,
  assetHashes,
  protectedHashes,
  productionHtmlSha256: await shaFile(join(root, "dist/workbench.html")),
  originalCatalogUnchanged: true,
  defaultSelectionUnchanged: true,
  optInCatalogTheme: true,
  cases: [],
  defaults: [],
  downloads: [],
  timeline: [],
  playback: [],
  jumpReturns: [],
  switches: [],
  sessions: [],
  comparisonPlayback: [],
  screenshots: [],
  errors: [],
  failedRequests: [],
  externalRequests: [],
  independentEditorRequests: [],
};
const port = Number(process.env.KLING_SOURCE_PIXEL_FULL_PORT || 5226);
const origin = `http://127.0.0.1:${port}`;
const server = await preview({
  root,
  preview: { host: "127.0.0.1", port, strictPort: true },
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--disable-dev-shm-usage"],
});
const timer = setTimeout(
  () => {
    console.error("Full Source pixel capture exceeded 15 minutes.");
    void browser.close();
  },
  15 * 60 * 1000,
);
let active;
const panel = (page) =>
  page.getByRole("region", { name: "Character themes", exact: true });
const button = (scope, name) =>
  scope.getByRole("button", { name, exact: typeof name === "string" });
const themeCard = (page, key) =>
  panel(page).locator(`button[data-theme-key="${key}"]`);
const snapshot = async (page) =>
  sha(
    await page
      .getByTestId("theme-preview")
      .evaluate((canvas) => canvas.toDataURL()),
  );
const checkpoint = () =>
  writeFile(join(out, "progress.json"), JSON.stringify(report, null, 2) + "\n");
function watch(context, independent = false) {
  context.on("page", (page) =>
    page.on("pageerror", (error) => report.errors.push(String(error))),
  );
  context.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith("favicon.ico"))
      report.failedRequests.push({
        url: response.url(),
        status: response.status(),
      });
  });
  context.on("request", (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(origin))
      report.externalRequests.push(request.url());
    if (
      independent &&
      /ThemeWorkspace|WardrobeEditor|SpriteActionEditor|\/src\/(themes|wardrobe|appearance|skeletal)\//.test(
        request.url(),
      )
    )
      report.independentEditorRequests.push(request.url());
  });
}
async function ready(page, expected) {
  if (expected)
    await expect(panel(page).getByRole("status")).toContainText(expected, {
      timeout: 90000,
    });
  await expect(button(panel(page), "Cancel theme preparation")).toHaveCount(0, {
    timeout: 90000,
  });
  assert.deepEqual(await panel(page).getByRole("alert").allTextContents(), []);
}
async function screenshot(page, name) {
  const path = join(out, name);
  await page.screenshot({ path, fullPage: true });
  report.screenshots.push({ file: rel(path), sha256: await shaFile(path) });
}
async function download(page, label, name, metadata) {
  const pending = page.waitForEvent("download", { timeout: 90000 });
  await button(panel(page), label).click();
  const path = join(out, name);
  await (await pending).saveAs(path);
  const bytes = await readFile(path),
    row = {
      file: rel(path),
      bytes: bytes.length,
      sha256: sha(bytes),
      ...metadata,
    };
  report.downloads.push(row);
  await ready(page);
  return { row, bytes };
}
async function selectPlayback(page, action, facing, position = 0) {
  const pause = button(panel(page), "Pause theme");
  if (await pause.count()) await pause.click();
  await button(panel(page), title(action)).click();
  await panel(page)
    .getByLabel("Theme facing", { exact: true })
    .selectOption(facing);
  await panel(page)
    .getByLabel("Theme frame", { exact: true })
    .fill(String(position));
}
async function expectPose(page, position, frameId, facing) {
  const canvas = page.getByTestId("theme-preview");
  await expect(canvas).toHaveAttribute("data-frame-position", String(position));
  await expect(canvas).toHaveAttribute("data-frame-id", String(frameId));
  await expect(canvas).toHaveAttribute("data-facing", facing);
}
async function observeComparison(page, record) {
  await selectPlayback(page, "run", "right");
  await panel(page)
    .getByLabel("Compare Kling original", { exact: true })
    .check();
  await expect(page.getByTestId("theme-reference")).toBeVisible({
    timeout: 90000,
  });
  const geometry = await page.evaluate(() =>
    ["theme-preview", "theme-reference"].map((testId) => {
      const canvas = document.querySelector(`[data-testid="${testId}"]`);
      return {
        testId,
        backing: [canvas.width, canvas.height],
        display: [canvas.style.width, canvas.style.height],
        sampling: canvas.dataset.sampling,
      };
    }),
  );
  assert.deepEqual(
    geometry,
    [
      {
        testId: "theme-preview",
        backing: [192, 298],
        display: ["384px", "596px"],
        sampling: "nearest",
      },
      {
        testId: "theme-reference",
        backing: [384, 596],
        display: ["384px", "596px"],
        sampling: "smooth",
      },
    ],
    "Source comparison must use the declared quarter scale and common padded canvas.",
  );
  const observed = await page.evaluate(async () => {
    const rows = [];
    let last = "";
    const start = performance.now();
    const sample = () => {
      const pixel = document.querySelector('[data-testid="theme-preview"]'),
        original = document.querySelector('[data-testid="theme-reference"]');
      if (!pixel || !original) return;
      const key = `${pixel.dataset.framePosition}/${original.dataset.framePosition}`;
      if (key !== last) {
        rows.push({
          elapsedMs: performance.now() - start,
          position: Number(pixel.dataset.framePosition),
          frameId: Number(pixel.dataset.frameId),
          originalPosition: Number(original.dataset.framePosition),
          originalFrameId: Number(original.dataset.frameId),
        });
        last = key;
      }
    };
    const observer = new MutationObserver(sample);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-frame-position", "data-frame-id"],
      childList: true,
      subtree: true,
    });
    sample();
    document.querySelector('[aria-label="Play theme"]').click();
    await new Promise((resolve) => setTimeout(resolve, 2200));
    document.querySelector('[aria-label="Pause theme"]').click();
    sample();
    observer.disconnect();
    return rows;
  });
  for (const row of observed) {
    assert.equal(row.position, row.originalPosition);
    assert.equal(row.frameId, row.originalFrameId);
    assert.equal(
      row.frameId,
      record.manifest.animations.run.frames[row.position],
    );
  }
  assert.equal(
    new Set(observed.map((row) => row.position)).size,
    record.manifest.animations.run.frames.length,
  );
  await selectPlayback(page, "run", "right");
  await screenshot(page, `${record.key}-comparison.png`);
  report.comparisonPlayback.push({
    key: record.key,
    action: "run",
    facing: "right",
    durationMs: 2200,
    observed,
    geometry,
    exactSourceTimeline: true,
  });
  await panel(page)
    .getByLabel("Compare Kling original", { exact: true })
    .uncheck();
}
async function preparePlayer(page, action, facing) {
  const pause = button(page, "Pause animation");
  if (await pause.count()) await pause.click();
  await button(page, title(action)).click();
  await button(page, title(facing)).click();
  if (await pause.count()) await pause.click();
  await page.locator("#player-frame").fill("0");
}
async function observePlayer(
  page,
  record,
  action,
  facing,
  returnToIdle = false,
) {
  const clip = record.manifest.animations[action];
  const durationMs = Math.ceil(
    (clip.frames.length / clip.fps) * 1000 * (clip.loop ? 3.15 : 1) +
      (returnToIdle ? 500 : 220),
  );
  const observed = await page.evaluate(async (durationMs) => {
    const rows = [];
    let last = "";
    const start = performance.now();
    const sample = () => {
      const canvas = document.querySelector('[data-testid="consumer-canvas"]');
      if (!canvas) return;
      const key = `${canvas.dataset.action}/${canvas.dataset.framePosition}/${canvas.dataset.frameId}`;
      if (key !== last) {
        rows.push({
          elapsedMs: performance.now() - start,
          action: canvas.dataset.action,
          position: Number(canvas.dataset.framePosition),
          frameId: Number(canvas.dataset.frameId),
          sourceElapsedMs: Number(canvas.dataset.elapsedMs),
          motionFlow: canvas.dataset.motionFlow,
          label: canvas.getAttribute("aria-label"),
        });
        last = key;
      }
    };
    const observer = new MutationObserver(sample);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-frame-position", "data-frame-id", "data-action"],
      childList: true,
      subtree: true,
    });
    sample();
    document.querySelector('[aria-label="Play animation"]').click();
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    sample();
    document.querySelector('[aria-label="Pause animation"]')?.click();
    observer.disconnect();
    return rows;
  }, durationMs);
  for (const row of observed)
    assert.equal(
      row.frameId,
      record.manifest.animations[row.action].frames[row.position],
    );
  const relevant = observed.filter((row) => row.action === action);
  assert.equal(
    new Set(relevant.map((row) => row.position)).size,
    clip.frames.length,
    `${record.key}/${action}/${facing}: every live timeline position must be observed.`,
  );
  if (clip.loop)
    assert(
      relevant.some((row, i) => i && row.position < relevant[i - 1].position),
      "Loop must wrap.",
    );
  else if (returnToIdle)
    assert(
      observed.some((row) => row.action === "idle"),
      "Matching-pose jump must return to idle after its complete recovery.",
    );
  else {
    await expect(button(page, "Replay animation")).toBeVisible();
    await expect(page.getByTestId("consumer-canvas")).toHaveAttribute(
      "data-frame-position",
      String(clip.frames.length - 1),
    );
    await expect(
      page.getByText(
        "Finished · Holding the final frame. Replay to start again.",
        { exact: true },
      ),
    ).toBeVisible();
  }
  return {
    key: record.key,
    action,
    facing,
    durationMs,
    observed,
    startedAfterEditorsClosed: true,
    motionFlow: returnToIdle,
    completion: clip.loop
      ? "loop-wrap"
      : returnToIdle
        ? "return-to-idle-after-recovery"
        : "hold-final-frame",
  };
}
try {
  for (const bundle of bundles) {
    const { character, entry } = bundle;
    const context = await browser.newContext({
      viewport: { width: 1280, height: 1000 },
    });
    context.setDefaultTimeout(30000);
    watch(context);
    const page = await context.newPage();
    active = page;
    await page.goto(
      `${origin}/workbench.html?character=${character}&mode=themes`,
    );
    await ready(page, "Kling original selected");
    const original = originalCatalog.find(
      (row) =>
        row.character === character && row.isOriginal && row.current !== false,
    );
    const r2 = originalCatalog.find(
      (row) =>
        row.character === character &&
        row.manifest.id === "pixel-storybook" &&
        row.manifest.revision === 2,
    );
    await expect(themeCard(page, original.key)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      panel(page).getByLabel("Theme look", { exact: true }),
    ).toHaveValue("base");
    await expect(themeCard(page, entry.key)).toHaveCount(1);
    const originalSnapshot = await snapshot(page);
    report.defaults.push({
      character,
      themeKey: original.key,
      lookId: "base",
      originalSelected: true,
      sourcePixelOptIn: true,
    });
    for (const lookId of ["base", "wedding"]) {
      const look = bundle.looks.find((look) => look.logicalId === lookId),
        key = `${character}-${lookId}`;
      await themeCard(page, original.key).click();
      await ready(page, "Kling original selected");
      await panel(page)
        .getByLabel("Theme look", { exact: true })
        .selectOption(lookId);
      await ready(page);
      await selectPlayback(page, "run", "left", 6);
      await themeCard(page, entry.key).click();
      await ready(page, "Source pixel selected");
      await expectPose(page, 6, look.manifest.animations.run.frames[6], "left");
      await expect(
        panel(page).getByLabel("Theme look", { exact: true }),
      ).toHaveValue(lookId);
      report.switches.push({
        character,
        lookId,
        kind: "original-to-source",
        action: "run",
        facing: "left",
        fromTheme: original.key,
        toTheme: entry.key,
        fromPosition: 6,
        toPosition: 6,
        phaseRetained: true,
      });
      await themeCard(page, r2.key).click();
      await ready(page, "Pixel storybook selected");
      await expect(
        panel(page).getByLabel("Theme frame", { exact: true }),
      ).toHaveValue("3");
      await themeCard(page, entry.key).click();
      await ready(page, "Source pixel selected");
      await expectPose(page, 6, look.manifest.animations.run.frames[6], "left");
      report.switches.push({
        character,
        lookId,
        kind: "source-r2-source",
        action: "run",
        facing: "left",
        positions: [6, 3, 6],
        phaseRetained: true,
      });
      await panel(page)
        .getByLabel("Theme display scale", { exact: true })
        .selectOption("2");
      const exported = await download(
        page,
        "Export theme CharacterPack",
        `${key}.character.zip`,
        { key, kind: "pack", themeFile: entry.file, lookId },
      );
      assert.deepEqual(exported.bytes, Buffer.from(look.packBytes));
      const record = {
        key,
        character,
        lookId,
        themeKey: entry.key,
        themeFile: entry.file,
        packFile: exported.row.file,
        packSha256: exported.row.sha256,
        manifest: look.manifest,
      };
      const covered = { right: new Set(), left: new Set() };
      for (const action of actions)
        for (const facing of facings) {
          await selectPlayback(page, action, facing);
          const observed = [];
          for (const [position, frameId] of look.manifest.animations[
            action
          ].frames.entries()) {
            await panel(page)
              .getByLabel("Theme frame", { exact: true })
              .fill(String(position));
            await expectPose(page, position, frameId, facing);
            observed.push({ position, frameId });
            if (!covered[facing].has(frameId)) {
              await download(
                page,
                "Export theme PNG",
                `${key}-${action}-${facing}-${String(position).padStart(2, "0")}.png`,
                { key, kind: "frame", action, facing, position, frameId },
              );
              covered[facing].add(frameId);
            }
          }
          report.timeline.push({
            key,
            action,
            facing,
            observed,
            everyPositionObserved: true,
          });
          await selectPlayback(page, action, facing);
          await download(
            page,
            "Export theme GIF",
            `${key}-${action}-${facing}.gif`,
            { key, kind: "gif", action, facing },
          );
        }
      record.uiExportedFrameIds = [...covered.right].sort((a, b) => a - b);
      assert.deepEqual(
        [...covered.left].sort((a, b) => a - b),
        record.uiExportedFrameIds,
      );
      record.supportFrameIds = look.manifest.frames
        .map((frame) => frame.id)
        .filter((id) => !covered.right.has(id));
      record.supportFrameNote =
        "Unreachable support cells, if any, are decoded from the exact UI CharacterPack by the verifier; they are not represented as UI PNG exports.";
      await selectPlayback(page, "run", "right");
      await screenshot(page, `${key}-workspace.png`);
      await observeComparison(page, record);
      report.cases.push(record);
      await checkpoint();
      console.log(
        `Exported ${key}: ${record.uiExportedFrameIds.length} native frames per direction, five GIFs per direction, pack.`,
      );
    }
    // Exact paused endpoint retention across the different source canvas sizes.
    await selectPlayback(
      page,
      "jump",
      "left",
      bundle.looks[0].manifest.animations.jump.frames.length - 1,
    );
    const finalPosition =
      bundle.looks[0].manifest.animations.jump.frames.length - 1;
    for (const lookId of ["base", "wedding"]) {
      await panel(page)
        .getByLabel("Theme look", { exact: true })
        .selectOption(lookId);
      await ready(page);
      const look = bundle.looks.find((item) => item.logicalId === lookId);
      await expectPose(
        page,
        finalPosition,
        look.manifest.animations.jump.frames[finalPosition],
        "left",
      );
      await expect(button(panel(page), "Play theme")).toBeVisible();
    }
    report.switches.push({
      character,
      kind: "look-endpoint",
      looks: ["wedding", "base", "wedding"],
      action: "jump",
      facing: "left",
      position: finalPosition,
      paused: true,
      endpointRetained: true,
    });
    await selectPlayback(page, "walk", "right", 8);
    await button(panel(page), "Play theme").click();
    await panel(page)
      .getByLabel("Theme look", { exact: true })
      .selectOption("base");
    await ready(page);
    await expect(button(panel(page), "Pause theme")).toBeVisible();
    await button(panel(page), "Pause theme").click();
    report.switches.push({
      character,
      kind: "playing-look",
      fromLook: "wedding",
      toLook: "base",
      action: "walk",
      facing: "right",
      playbackContinued: true,
    });
    await button(panel(page), "Restore Kling original").click();
    await ready(page, "Kling original selected");
    assert.equal(await snapshot(page), originalSnapshot);
    // Small session fixture includes the exact real published Source pixel
    // bundle. Saved/reopened session bytes below are actual production exports.
    const selection = {
      themeKey: entry.key,
      lookId: "wedding",
      action: "jump",
      facing: "left",
    };
    const files = {
      "theme-0.zip": [bundle.bytes, { level: 0 }],
      "session.json": strToU8(
        JSON.stringify({
          format: "gathria-theme-session",
          version: 1,
          themes: [
            { key: entry.key, file: "theme-0.zip", sha256: sha(bundle.bytes) },
          ],
          selection,
        }),
      ),
    };
    const fixture = join(scratch, `${character}.input.theme-session.zip`);
    await writeFile(
      fixture,
      zipSync(files, { mtime: new Date("2020-01-01T00:00:00Z") }),
    );
    await panel(page)
      .getByLabel("Theme session file", { exact: true })
      .setInputFiles(fixture);
    await ready(page, "Theme session restored");
    const before = await snapshot(page);
    const saved = await download(
      page,
      "Save theme session",
      `${character}-source-pixel.theme-session.zip`,
      { kind: "session", character, selection, themeKeys: [entry.key] },
    );
    await panel(page)
      .getByLabel("Theme session file", { exact: true })
      .setInputFiles(join(root, saved.row.file));
    await ready(page, "Theme session restored");
    assert.equal(await snapshot(page), before);
    await expect(button(panel(page), "Play theme")).toBeVisible();
    report.sessions.push({
      character,
      file: saved.row.file,
      selection,
      themeKeys: [entry.key],
      reopenedPaused: true,
      exactFirstFrameRestored: true,
      originalRestoredExact: true,
      bothLooksRetained: true,
    });
    await context.close();
  }
  report.editorsClosedAt = new Date().toISOString();
  await checkpoint();
  for (const record of report.cases) {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 900 },
    });
    context.setDefaultTimeout(30000);
    watch(context, true);
    const page = await context.newPage();
    active = page;
    await page.route(
      /ThemeWorkspace|WardrobeEditor|SpriteActionEditor|\/src\/(themes|wardrobe|appearance|skeletal)\//,
      (route) => route.abort(),
    );
    await page.goto(`${origin}/player.html`);
    await page
      .locator("#player-zip")
      .setInputFiles(join(root, record.packFile));
    await expect(page.getByRole("status")).toContainText("Loaded:", {
      timeout: 90000,
    });
    for (const action of actions)
      await expect(button(page, title(action))).toBeEnabled();
    await page.getByLabel("Display scale", { exact: true }).selectOption("2");
    const matching = page.getByLabel("Wait for a matching pose", {
      exact: true,
    });
    await expect(matching).toBeEnabled();
    await matching.uncheck();
    for (const action of actions)
      for (const facing of facings) {
        await preparePlayer(page, action, facing);
        report.playback.push(await observePlayer(page, record, action, facing));
      }
    await matching.check();
    for (const facing of facings) {
      await preparePlayer(page, "jump", facing);
      report.jumpReturns.push(
        await observePlayer(page, record, "jump", facing, true),
      );
    }
    await matching.uncheck();
    await preparePlayer(page, "run", "right");
    await screenshot(page, `${record.key}-independent.png`);
    await context.close();
    await checkpoint();
    console.log(
      `Independent five-action playback, jump hold and return passed: ${record.key}.`,
    );
  }
  for (const field of [
    "errors",
    "failedRequests",
    "externalRequests",
    "independentEditorRequests",
  ])
    assert.deepEqual(report[field], []);
  for (const [file, expected] of Object.entries({
    ...sourceHashes,
    ...assetHashes,
  }))
    assert.equal(
      await shaFile(join(root, file)),
      expected,
      `${file} changed during capture.`,
    );
  assert.equal(report.cases.length, 4);
  assert.equal(report.playback.length, 40);
  assert.equal(report.jumpReturns.length, 8);
  report.passed = true;
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(out, "capture.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    "Full Source pixel production exports, sessions, phase switches and independent playback passed.",
  );
} catch (error) {
  await writeFile(
    join(out, "failure.json"),
    JSON.stringify({ ...report, error: String(error) }, null, 2) + "\n",
  );
  await active
    ?.screenshot({ path: join(out, "failure.png"), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  clearTimeout(timer);
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
