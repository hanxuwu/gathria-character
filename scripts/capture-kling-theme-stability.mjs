// Real production UI downloads and playback. No fixture artwork or rendering bypass.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { unzipSync, zipSync, strToU8 } from "fflate";
import { preview } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = resolve(
  root,
  process.env.KLING_THEME_STABILITY_DIR ||
    "docs/kling-theme-stability/evidence",
);
const scratch = join(root, ".review-tmp/theme-stability-capture");
await mkdir(out, { recursive: true });
await mkdir(scratch, { recursive: true });
assert(
  !existsSync(join(out, "capture.json")),
  "Choose a fresh evidence directory.",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path);
const catalog = JSON.parse(
  await readFile(join(root, "artwork/kling-themes/catalog-index.json"), "utf8"),
);
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const current = (character) =>
  catalog.find(
    (entry) =>
      entry.character === character &&
      !entry.isOriginal &&
      entry.current !== false,
  );
for (const character of ["male", "female"])
  assert(
    current(character)?.manifest.revision > 1,
    "Publish separate corrected revisions first.",
  );
const report = {
  format: "gathria-theme-stability-evidence",
  version: 1,
  production: true,
  startedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  cases: [],
  initialLoads: [],
  downloads: [],
  playback: [],
  sessions: [],
  switches: [],
  comparisonPlayback: [],
  errors: [],
  failedRequests: [],
  externalRequests: [],
  independentEditorRequests: [],
};
report.sourceHashes = Object.fromEntries(
  await Promise.all(
    execFileSync(
      "git",
      [
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
        "src",
        "package.json",
        "package-lock.json",
        "vite.config.ts",
        "tsconfig.json",
      ],
      { cwd: root, encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean)
      .map(async (file) => [file, sha(await readFile(join(root, file)))]),
  ),
);
report.productionHtmlSha256 = sha(
  await readFile(join(root, "dist/workbench.html")),
);
report.assetHashes = Object.fromEntries(
  await Promise.all(
    [
      ...new Set([
        "artwork/kling-themes/catalog-index.json",
        ...catalog.flatMap((entry) => [
          entry.file,
          ...entry.lookAssets.map((look) => look.file),
        ]),
      ]),
    ].map(async (file) => [file, sha(await readFile(join(root, file)))]),
  ),
);
const server = await preview({
  root,
  preview: { host: "127.0.0.1", port: 5223, strictPort: true },
});
const origin = "http://127.0.0.1:5223";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--disable-dev-shm-usage"],
});
const timer = setTimeout(
  () => {
    console.error("Stability capture exceeded 20 minutes.");
    void browser.close();
  },
  20 * 60 * 1000,
);
let active;
const panel = (page) =>
  page.getByRole("region", { name: "Character themes", exact: true });
const button = (scope, name) =>
  scope.getByRole("button", { name, exact: typeof name === "string" });
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
  if (expected) {
    await expect
      .poll(
        async () =>
          (await panel(page).getByRole("alert").count()) > 0 ||
          (await panel(page).getByRole("status").innerText()).includes(
            expected,
          ),
        { timeout: 150000 },
      )
      .toBe(true);
    assert.deepEqual(
      await panel(page).getByRole("alert").allTextContents(),
      [],
    );
    await expect(panel(page).getByRole("status")).toContainText(expected);
  }
  await expect(button(panel(page), "Cancel theme preparation")).toHaveCount(0, {
    timeout: 150000,
  });
  assert.deepEqual(await panel(page).getByRole("alert").allTextContents(), []);
}
async function download(page, buttonName, name, metadata) {
  const pending = page.waitForEvent("download", { timeout: 150000 });
  await button(panel(page), buttonName).click();
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
  await writeFile(
    join(out, "progress.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(`Exported ${name}`);
  return { row, bytes };
}
async function selectPlayback(page, action, facing, position = 0) {
  await button(panel(page), action[0].toUpperCase() + action.slice(1)).click();
  await panel(page)
    .getByLabel("Theme facing", { exact: true })
    .selectOption(facing);
  await panel(page)
    .getByLabel("Theme frame", { exact: true })
    .fill(String(position));
}
const snapshot = async (page) =>
  sha(
    await page
      .getByTestId("theme-preview")
      .evaluate((canvas) => canvas.toDataURL()),
  );
async function sessionFixture(character) {
  const entries = catalog.filter(
    (entry) =>
      entry.character === character &&
      !entry.isOriginal &&
      [1, current(character).manifest.revision].includes(
        entry.manifest.revision,
      ),
  );
  assert.equal(entries.length, 2);
  const files = {},
    refs = [];
  for (const [index, entry] of entries.entries()) {
    const bytes = await readFile(join(root, entry.file));
    assert.equal(sha(bytes), entry.sha256);
    const file = `theme-${index}.zip`;
    files[file] = [bytes, { level: 0 }];
    refs.push({ key: entry.key, file, sha256: entry.sha256 });
  }
  const selection = {
    themeKey: `${character}:pixel-storybook@1`,
    lookId: "wedding",
    action: "run",
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
  const path = join(
    scratch,
    `${character}-both-revisions.input.theme-session.zip`,
  );
  await writeFile(
    path,
    zipSync(files, { mtime: new Date("2020-01-01T00:00:00Z") }),
  );
  return { path, refs, selection };
}
try {
  for (const character of ["male", "female"]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 1000 },
    });
    context.setDefaultTimeout(60000);
    watch(context);
    const resources = [];
    context.on("response", (response) => {
      if (/\.zip(?:\?|$)/.test(response.url()))
        resources.push({
          url: response.url().replace(origin, ""),
          bytes: Number(response.headers()["content-length"] || 0),
        });
    });
    const page = await context.newPage();
    active = page;
    const started = Date.now();
    await page.goto(
      `${origin}/workbench.html?character=${character}&mode=themes`,
    );
    await ready(page, "Kling original selected");
    const original = catalog.find(
      (entry) => entry.character === character && entry.isOriginal,
    );
    const base = original.lookAssets.find((look) => look.logicalId === "base");
    const wedding = original.lookAssets.find(
      (look) => look.logicalId === "wedding",
    );
    const initialResources = resources.slice();
    assert(
      initialResources.some((row) => row.bytes === base.bytes),
      "Cold load must request the exact selected base pack.",
    );
    assert(
      !initialResources.some(
        (row) => row.bytes === wedding.bytes || row.bytes === original.bytes,
      ),
      "Cold load must not eagerly fetch other looks or the full bundle.",
    );
    report.initialLoads.push({
      character,
      elapsedMs: Date.now() - started,
      zipResources: initialResources,
      onlySelectedLookRequested: true,
      selectedPackBytes: base.bytes,
      fullThemeBytes: original.bytes,
      includesBothLookValidation: false,
    });
    const initialOriginal = await snapshot(page);
    const entry = current(character);
    for (const lookId of ["base", "wedding"]) {
      await button(panel(page), /^Kling original/).click();
      await ready(page, "Kling original selected");
      await panel(page)
        .getByLabel("Theme look", { exact: true })
        .selectOption(lookId);
      await ready(page);
      await selectPlayback(page, "run", "left", 6);
      await panel(page)
        .locator(`button[data-theme-key="${entry.key}"]`)
        .click();
      await ready(page, "Pixel storybook selected");
      await expect(
        panel(page).getByLabel("Theme frame", { exact: true }),
      ).toHaveValue("3");
      await expect(
        panel(page).getByLabel("Theme facing", { exact: true }),
      ).toHaveValue("left");
      report.switches.push({
        character,
        lookId,
        fromTheme: original.key,
        toTheme: entry.key,
        fromPosition: 6,
        toPosition: 3,
        action: "run",
        facing: "left",
        passed: true,
      });
      const key = `${character}-pixel-v${entry.manifest.revision}-${lookId}`;
      const { row: packRow, bytes } = await download(
        page,
        "Export theme CharacterPack",
        `${key}.character.zip`,
        { key, kind: "pack", themeFile: entry.file, lookId },
      );
      const expectedAsset = entry.lookAssets.find(
        (look) => look.logicalId === lookId,
      );
      assert.equal(sha(bytes), expectedAsset.sha256);
      assert.deepEqual(bytes, await readFile(join(root, expectedAsset.file)));
      const packFiles = unzipSync(bytes),
        manifest = JSON.parse(
          new TextDecoder().decode(packFiles["manifest.json"]),
        );
      for (const action of actions)
        for (const facing of ["right", "left"]) {
          await selectPlayback(page, action, facing);
          const frameId = Number(
            await page
              .getByTestId("theme-preview")
              .getAttribute("data-frame-id"),
          );
          assert.equal(frameId, manifest.animations[action].frames[0]);
          await download(
            page,
            "Export theme PNG",
            `${key}-${action}-${facing}.png`,
            { key, kind: "frame", action, facing, frameId },
          );
          if (["idle", "walk", "run"].includes(action) || facing === "right")
            await download(
              page,
              "Export theme GIF",
              `${key}-${action}-${facing}.gif`,
              { key, kind: "gif", action, facing },
            );
        }
      await selectPlayback(page, "run", "right");
      await panel(page)
        .getByLabel("Compare Kling original", { exact: true })
        .check();
      await expect(page.getByTestId("theme-reference")).toBeVisible({
        timeout: 150000,
      });
      await panel(page)
        .getByLabel("Theme display scale", { exact: true })
        .selectOption("2");
      await page.screenshot({
        path: join(out, `${key}-workspace.png`),
        fullPage: true,
      });
      const comparison = await page.evaluate(async () => {
        const pixel = document.querySelector('[data-testid="theme-preview"]');
        const reference = document.querySelector(
          '[data-testid="theme-reference"]',
        );
        const samples = [];
        let last = "";
        const start = performance.now();
        const sample = () => {
          const value = `${pixel.dataset.frameId}/${reference.dataset.frameId}`;
          if (value !== last) {
            samples.push({
              elapsedMs: performance.now() - start,
              pixelFrameId: Number(pixel.dataset.frameId),
              referenceFrameId: Number(reference.dataset.frameId),
            });
            last = value;
          }
        };
        const observer = new MutationObserver(sample);
        observer.observe(pixel, { attributes: true });
        observer.observe(reference, { attributes: true });
        sample();
        document.querySelector('[aria-label="Play theme"]').click();
        await new Promise((resolve) => setTimeout(resolve, 1600));
        document.querySelector('[aria-label="Pause theme"]').click();
        sample();
        observer.disconnect();
        return samples;
      });
      assert.equal(new Set(comparison.map((row) => row.pixelFrameId)).size, 8);
      assert.equal(
        new Set(comparison.map((row) => row.referenceFrameId)).size,
        16,
        "Actual original comparison must retain all 16 drawings between the eight pixel poses.",
      );
      report.comparisonPlayback.push({
        key,
        durationMs: 1600,
        pixelDrawingCount: 8,
        referenceDrawingCount: 16,
        observed: comparison,
      });
      await panel(page)
        .getByLabel("Compare Kling original", { exact: true })
        .uncheck();
      await panel(page)
        .getByLabel("Theme display scale", { exact: true })
        .selectOption("1");
      report.cases.push({
        key,
        character,
        lookId,
        themeKey: entry.key,
        themeFile: entry.file,
        packFile: packRow.file,
        packSha256: packRow.sha256,
        manifest,
      });
    }
    await button(panel(page), "Restore Kling original").click();
    await ready(page, "Kling original selected");
    assert.equal(
      await snapshot(page),
      initialOriginal,
      "Original restoration must remain exact.",
    );
    // A small two-revision session input uses real shipping bundles. Save/reopen
    // is then performed through production UI; the fixture is not an export.
    const fixture = await sessionFixture(character);
    await panel(page)
      .getByLabel("Theme session file", { exact: true })
      .setInputFiles(fixture.path);
    await ready(page, "Theme session restored");
    const oldSnapshot = await snapshot(page);
    const oldSession = await download(
      page,
      "Save theme session",
      `${character}-pixel-v1-selected.theme-session.zip`,
      { kind: "session", selection: fixture.selection },
    );
    await panel(page)
      .getByLabel("Theme session file", { exact: true })
      .setInputFiles(join(root, oldSession.row.file));
    await ready(page, "Theme session restored");
    assert.equal(await snapshot(page), oldSnapshot);
    await panel(page).locator(`button[data-theme-key="${entry.key}"]`).click();
    await ready(page, "Pixel storybook selected");
    await selectPlayback(page, "jump", "left");
    const newSnapshot = await snapshot(page);
    const selection = {
      themeKey: entry.key,
      lookId: "wedding",
      action: "jump",
      facing: "left",
    };
    const newSession = await download(
      page,
      "Save theme session",
      `${character}-pixel-v2-selected.theme-session.zip`,
      { kind: "session", selection },
    );
    await panel(page)
      .getByLabel("Theme session file", { exact: true })
      .setInputFiles(join(root, newSession.row.file));
    await ready(page, "Theme session restored");
    assert.equal(await snapshot(page), newSnapshot);
    await expect(button(panel(page), "Play theme")).toBeVisible();
    report.sessions.push({
      character,
      legacyRevisionRetained: true,
      currentRevisionRetained: true,
      inputFixtureContainsActualPublishedBundles: true,
      exportedSessionFiles: [oldSession.row.file, newSession.row.file],
      reopenedPaused: true,
      originalRestoredExact: true,
    });
    await context.close();
  }
  report.editorsClosedAt = new Date().toISOString();
  await writeFile(
    join(out, "exports-checkpoint.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  for (const record of report.cases) {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 850 },
    });
    context.setDefaultTimeout(60000);
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
      timeout: 150000,
    });
    for (const action of actions)
      for (const facing of ["right", "left"]) {
        const pause = button(page, "Pause animation");
        if (await pause.count()) await pause.click();
        await button(page, action[0].toUpperCase() + action.slice(1)).click();
        await button(page, facing[0].toUpperCase() + facing.slice(1)).click();
        await page
          .getByLabel("Display scale", { exact: true })
          .selectOption("1");
        if (await pause.count()) await pause.click();
        await page.locator("#player-frame").fill("0");
        const clip = record.manifest.animations[action];
        const durationMs = Math.ceil(
          ((clip.frames.length * 1000) / clip.fps) * (clip.loop ? 2.1 : 1.1) +
            150,
        );
        const observed = await page.evaluate(async (ms) => {
          const canvas = document.querySelector(
            '[data-testid="consumer-canvas"]',
          );
          const rows = [];
          let last = "";
          const sample = () => {
            const key =
              canvas.dataset.action + "/" + canvas.dataset.framePosition;
            if (key !== last) {
              rows.push({
                action: canvas.dataset.action,
                position: Number(canvas.dataset.framePosition),
                frameId: Number(canvas.dataset.frameId),
                facing: canvas.dataset.facing,
              });
              last = key;
            }
          };
          const observer = new MutationObserver(sample);
          observer.observe(canvas, { attributes: true });
          sample();
          document.querySelector('[aria-label="Play animation"]').click();
          await new Promise((resolve) => setTimeout(resolve, ms));
          sample();
          observer.disconnect();
          document.querySelector('[aria-label="Pause animation"]')?.click();
          return rows;
        }, durationMs);
        for (const item of observed)
          assert.equal(
            item.frameId,
            record.manifest.animations[item.action].frames[item.position],
          );
        const relevant = observed.filter((item) => item.action === action);
        assert(
          new Set(relevant.map((item) => item.position)).size >=
            Math.min(3, clip.frames.length),
        );
        if (clip.loop)
          assert(
            relevant.some(
              (item, index) =>
                index && item.position < relevant[index - 1].position,
            ),
          );
        else
          assert(
            relevant.some((item) => item.position === clip.frames.length - 1) ||
              observed.some((item) => item.action === "idle"),
          );
        report.playback.push({
          key: record.key,
          action,
          facing,
          durationMs,
          observed,
        });
        console.log(
          `Played ${record.key} ${action}/${facing} (${report.playback.length}/40)`,
        );
      }
    await page.screenshot({
      path: join(out, `${record.key}-independent.png`),
      fullPage: true,
    });
    await context.close();
  }
  for (const field of [
    "errors",
    "failedRequests",
    "externalRequests",
    "independentEditorRequests",
  ])
    assert.deepEqual(report[field], []);
  report.passed = true;
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(out, "capture.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    "Production corrected-theme exports and independent playback passed.",
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
