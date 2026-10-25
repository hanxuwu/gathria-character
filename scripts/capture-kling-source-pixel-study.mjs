// Production UI evidence for isolated source-derived pixel studies. Run after build.
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
  process.env.KLING_SOURCE_PIXEL_STUDY_DIR || "docs/kling-source-pixel-study",
);
const out = join(study, "evidence");
const scratch = join(root, ".review-tmp/source-pixel-capture");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function shaFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
const rel = (path) => relative(root, path);
const json = (bytes) => JSON.parse(new TextDecoder().decode(bytes));
const title = (value) => value[0].toUpperCase() + value.slice(1);
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const baseline = process.env.KLING_SOURCE_PIXEL_BASELINE || "ce4c38e";
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
await mkdir(out, { recursive: true });
await mkdir(scratch, { recursive: true });
assert(
  !existsSync(join(out, "capture.json")),
  "Choose a fresh study evidence directory.",
);
const catalogFile = "artwork/kling-themes/catalog-index.json";
const catalog = JSON.parse(await readFile(join(root, catalogFile), "utf8"));
const protectedFiles = [
  catalogFile,
  "src/themes/catalog.ts",
  "src/themes/ThemeWorkspace.tsx",
];
const protectedHashes = {};
for (const file of protectedFiles) {
  const bytes = await readFile(join(root, file));
  const baselineBytes = execFileSync("git", ["show", `${baseline}:${file}`], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.deepEqual(
    bytes,
    baselineBytes,
    `${file} must remain unchanged from the approved baseline.`,
  );
  protectedHashes[file] = sha(bytes);
}
assert(
  catalog.every((entry) => entry.manifest.revision <= 2),
  "Rejected revision artwork must not be catalogued.",
);
const bundles = [];
for (const character of ["male", "female"])
  for (const variant of ["detail", "compact"]) {
    const key = `${character}-${variant}`;
    const file = join(study, "bundles", `${key}.theme.zip`);
    const bytes = await readFile(file);
    const files = unzipSync(bytes);
    const theme = json(files["theme.json"]);
    const themeKey = `${theme.character}:${theme.id}@${theme.revision}`;
    assert.equal(theme.character, character);
    assert.equal(theme.rendering, "pixel");
    assert.equal(
      theme.reference.sourceSha256,
      await shaFile(
        join(root, `docs/kling-motion/exports/${character}.character.zip`),
      ),
    );
    assert.equal(theme.looks.length, 1);
    assert.equal(theme.looks[0].logicalId, "base");
    assert(
      !catalog.some((item) => item.key === themeKey),
      "Studies must remain isolated imports.",
    );
    const packBytes = files[theme.looks[0].file];
    assert.equal(sha(packBytes), theme.looks[0].sha256);
    const manifest = json(unzipSync(packBytes)["manifest.json"]);
    const action = character === "male" ? "run" : "walk";
    assert.deepEqual(
      Object.keys(manifest.animations).sort(),
      (character === "male"
        ? ["idle", "walk", "run"]
        : ["idle", "walk"]
      ).sort(),
    );
    assert.equal(
      manifest.animations[action].frames.length,
      character === "male" ? 16 : 27,
    );
    assert.equal(manifest.animations[action].fps, 24);
    assert(manifest.animations[action].loop);
    assert(manifest.scale.pixelArt && manifest.scale.integerOnly);
    bundles.push({
      key,
      character,
      variant,
      action,
      file,
      bytes,
      theme,
      themeKey,
      packBytes,
      manifest,
    });
  }
const sourceFiles = git(
  "ls-files",
  "-z",
  "--cached",
  "--others",
  "--exclude-standard",
  "src",
  "scripts/*source-pixel*",
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "tsconfig.json",
)
  .split("\0")
  .filter(Boolean);
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (file) => [
      file,
      sha(await readFile(join(root, file))),
    ]),
  ),
);
const assetFiles = [
  ...new Set([
    catalogFile,
    ...catalog.flatMap((entry) => [
      entry.file,
      ...entry.lookAssets.map((look) => look.file),
    ]),
    ...bundles.map((bundle) => rel(bundle.file)),
    ...["male", "female"].flatMap((character) => [
      `docs/kling-motion/exports/${character}.character.zip`,
      `docs/kling-themes/evidence/${character}-original-base.character.zip`,
      `docs/kling-theme-stability/evidence/${character}-pixel-v2-base.character.zip`,
    ]),
  ]),
];
const assetHashes = Object.fromEntries(
  await Promise.all(
    assetFiles.map(async (file) => [file, await shaFile(join(root, file))]),
  ),
);
const report = {
  format: "gathria-source-pixel-study-evidence",
  version: 1,
  production: true,
  startedAt: new Date().toISOString(),
  commitAtCapture: git("rev-parse", "HEAD"),
  baseline,
  sourceHashes,
  assetHashes,
  protectedHashes,
  productionHtmlSha256: sha(await readFile(join(root, "dist/workbench.html"))),
  catalogUnchanged: true,
  defaultSelectionUnchanged: true,
  isolatedImports: true,
  cases: [],
  defaults: [],
  downloads: [],
  timeline: [],
  playback: [],
  idleChecks: [],
  unavailableChecks: [],
  sessions: [],
  errors: [],
  failedRequests: [],
  externalRequests: [],
  independentEditorRequests: [],
};
const port = Number(process.env.KLING_SOURCE_PIXEL_PORT || 5225);
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
    console.error("Source pixel capture exceeded 10 minutes.");
    void browser.close();
  },
  10 * 60 * 1000,
);
let active;
const panel = (page) =>
  page.getByRole("region", { name: "Character themes", exact: true });
const button = (scope, name) =>
  scope.getByRole("button", { name, exact: typeof name === "string" });
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
async function download(page, label, name, metadata) {
  const pending = page.waitForEvent("download", { timeout: 90000 });
  await button(panel(page), label).click();
  const path = join(out, name);
  await (await pending).saveAs(path);
  const bytes = await readFile(path);
  const row = {
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
async function checkUnavailable(page, bundle, independent) {
  const scope = independent ? page : panel(page);
  const unavailable = actions.filter(
    (action) => !bundle.manifest.animations[action],
  );
  for (const action of unavailable)
    await expect(
      button(
        scope,
        independent ? title(action) : `${title(action)} · unavailable`,
      ),
    ).toBeDisabled();
  report.unavailableChecks.push({
    key: bundle.key,
    surface: independent ? "independent-player" : "theme-workspace",
    unavailable,
    disabled: true,
  });
}
async function observePlayer(page, clip, action, facing) {
  const durationMs = Math.ceil(
    (clip.frames.length / clip.fps) * 1000 * 3.15 + 150,
  );
  const observed = await page.evaluate(
    async ({ durationMs, action, facing }) => {
      const rows = [];
      let last = "";
      const start = performance.now();
      const sample = () => {
        const canvas = document.querySelector(
          '[data-testid="consumer-canvas"]',
        );
        if (!canvas) return;
        const key = canvas.dataset.framePosition + "/" + canvas.dataset.frameId;
        if (key !== last) {
          rows.push({
            elapsedMs: performance.now() - start,
            position: Number(canvas.dataset.framePosition),
            frameId: Number(canvas.dataset.frameId),
            action,
            facing,
            label: canvas.getAttribute("aria-label"),
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
      document.querySelector('[aria-label="Play animation"]').click();
      await new Promise((resolve) => setTimeout(resolve, durationMs));
      document.querySelector('[aria-label="Pause animation"]')?.click();
      sample();
      observer.disconnect();
      return rows;
    },
    { durationMs, action, facing },
  );
  for (const row of observed) {
    assert.equal(row.frameId, clip.frames[row.position]);
    assert(row.label.includes(`, ${action}, facing ${facing},`));
  }
  assert.equal(
    new Set(observed.map((row) => row.position)).size,
    clip.frames.length,
    "Every timeline position must be observed during live playback.",
  );
  if (clip.frames.length > 1)
    assert(
      observed.some((row, i) => i && row.position < observed[i - 1].position),
      "Loop must wrap.",
    );
  return { durationMs, observed };
}
try {
  for (const character of ["male", "female"]) {
    const variants = bundles.filter((bundle) => bundle.character === character);
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
    const original = catalog.find(
      (entry) =>
        entry.character === character &&
        entry.isOriginal &&
        entry.current !== false,
    );
    await expect(
      panel(page).locator(`button[data-theme-key="${original.key}"]`),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      panel(page).getByLabel("Theme look", { exact: true }),
    ).toHaveValue("base");
    const originalSnapshot = await snapshot(page);
    report.defaults.push({
      character,
      themeKey: original.key,
      lookId: "base",
      originalSelected: true,
    });
    for (const bundle of variants) {
      await panel(page)
        .getByLabel("Theme bundle file", { exact: true })
        .setInputFiles(bundle.file);
      await ready(page, "Imported theme accepted");
      await expect(
        panel(page).locator(`button[data-theme-key="${bundle.themeKey}"]`),
      ).toHaveAttribute("aria-pressed", "true");
      await panel(page)
        .getByLabel("Theme display scale", { exact: true })
        .selectOption("2");
      await checkUnavailable(page, bundle, false);
      const pack = await download(
        page,
        "Export theme CharacterPack",
        `${bundle.key}.character.zip`,
        {
          key: bundle.key,
          kind: "pack",
          themeFile: rel(bundle.file),
          lookId: "base",
        },
      );
      assert.deepEqual(
        pack.bytes,
        Buffer.from(bundle.packBytes),
        "UI export must preserve exact imported CharacterPack bytes.",
      );
      for (const facing of ["right", "left"]) {
        await selectPlayback(page, bundle.action, facing);
        const observed = [];
        for (const [position, frameId] of bundle.manifest.animations[
          bundle.action
        ].frames.entries()) {
          await panel(page)
            .getByLabel("Theme frame", { exact: true })
            .fill(String(position));
          const canvas = page.getByTestId("theme-preview");
          await expect(canvas).toHaveAttribute(
            "data-frame-position",
            String(position),
          );
          await expect(canvas).toHaveAttribute(
            "data-frame-id",
            String(frameId),
          );
          await expect(canvas).toHaveAttribute("data-facing", facing);
          observed.push({ position, frameId });
          await download(
            page,
            "Export theme PNG",
            `${bundle.key}-${bundle.action}-${facing}-${String(position).padStart(2, "0")}.png`,
            {
              key: bundle.key,
              kind: "frame",
              action: bundle.action,
              facing,
              position,
              frameId,
            },
          );
        }
        report.timeline.push({
          key: bundle.key,
          action: bundle.action,
          facing,
          observed,
          everyPositionObserved: true,
        });
        await selectPlayback(page, bundle.action, facing);
        await download(
          page,
          "Export theme GIF",
          `${bundle.key}-${bundle.action}-${facing}.gif`,
          { key: bundle.key, kind: "gif", action: bundle.action, facing },
        );
        await selectPlayback(page, "idle", facing);
        const frameId = bundle.manifest.animations.idle.frames[0];
        await download(
          page,
          "Export theme PNG",
          `${bundle.key}-idle-${facing}.png`,
          {
            key: bundle.key,
            kind: "frame",
            action: "idle",
            facing,
            position: 0,
            frameId,
          },
        );
      }
      await selectPlayback(page, bundle.action, "right");
      await page.screenshot({
        path: join(out, `${bundle.key}-workspace.png`),
        fullPage: true,
      });
      report.cases.push({
        key: bundle.key,
        character,
        variant: bundle.variant,
        action: bundle.action,
        lookId: "base",
        themeKey: bundle.themeKey,
        themeFile: rel(bundle.file),
        packFile: pack.row.file,
        packSha256: pack.row.sha256,
        manifest: bundle.manifest,
      });
      await checkpoint();
      console.log(`Exported ${bundle.key}: every target PNG, both GIFs, pack.`);
    }
    await button(panel(page), "Restore Kling original").click();
    await ready(page, "Kling original selected");
    assert.equal(
      await snapshot(page),
      originalSnapshot,
      "Restore must preserve the default original artwork.",
    );
    // Use the exact imported bundle bytes in a small input fixture; the session
    // under review is subsequently saved and reopened through production UI.
    const files = {},
      refs = [];
    for (const [index, bundle] of variants.entries()) {
      const file = `theme-${index}.zip`;
      files[file] = [bundle.bytes, { level: 0 }];
      refs.push({ key: bundle.themeKey, file, sha256: sha(bundle.bytes) });
    }
    const selection = {
      themeKey: variants[0].themeKey,
      lookId: "base",
      action: variants[0].action,
      facing: "left",
    };
    files["session.json"] = strToU8(
      JSON.stringify({
        format: "gathria-theme-session",
        version: 1,
        themes: refs,
        selection,
      }),
    );
    const fixture = join(
      scratch,
      `${character}-variants.input.theme-session.zip`,
    );
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
      `${character}-both-variants.theme-session.zip`,
      {
        kind: "session",
        character,
        selection,
        themeKeys: refs.map((ref) => ref.key),
      },
    );
    await panel(page)
      .getByLabel("Theme session file", { exact: true })
      .setInputFiles(join(root, saved.row.file));
    await ready(page, "Theme session restored");
    assert.equal(await snapshot(page), before);
    await expect(button(panel(page), "Play theme")).toBeVisible();
    for (const bundle of variants)
      await expect(
        panel(page).locator(`button[data-theme-key="${bundle.themeKey}"]`),
      ).toHaveCount(1);
    report.sessions.push({
      character,
      file: saved.row.file,
      selection,
      themeKeys: refs.map((ref) => ref.key),
      reopenedPaused: true,
      exactFirstFrameRestored: true,
      originalRestoredExact: true,
    });
    await context.close();
  }
  report.editorsClosedAt = new Date().toISOString();
  await checkpoint();
  for (const record of report.cases) {
    const bundle = bundles.find((item) => item.key === record.key);
    const context = await browser.newContext({
      viewport: { width: 1100, height: 850 },
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
    await checkUnavailable(page, bundle, true);
    await page.getByLabel("Display scale", { exact: true }).selectOption("2");
    for (const action of [record.action, "idle"])
      for (const facing of ["right", "left"]) {
        const pause = button(page, "Pause animation");
        if (await pause.count()) await pause.click();
        await button(page, title(action)).click();
        await button(page, title(facing)).click();
        if (await pause.count()) await pause.click();
        await page.locator("#player-frame").fill("0");
        const observation = await observePlayer(
          page,
          record.manifest.animations[action],
          action,
          facing,
        );
        const row = {
          key: record.key,
          action,
          facing,
          startedAfterEditorsClosed: true,
          ...observation,
        };
        (action === record.action ? report.playback : report.idleChecks).push(
          row,
        );
      }
    await button(page, title(record.action)).click();
    await button(page, "Right").click();
    const pause = button(page, "Pause animation");
    if (await pause.count()) await pause.click();
    await page.locator("#player-frame").fill("0");
    await page.screenshot({
      path: join(out, `${record.key}-independent.png`),
      fullPage: true,
    });
    await context.close();
    await checkpoint();
    console.log(`Independent playback passed: ${record.key}.`);
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
  assert.equal(report.playback.length, 8);
  assert.equal(report.idleChecks.length, 8);
  report.passed = true;
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(out, "capture.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    "Source pixel study production imports, exports, sessions and independent playback passed.",
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
