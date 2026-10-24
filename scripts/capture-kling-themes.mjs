// Capture the production theme workspace and its real downloadable assets.
// No fixture routes, generated placeholder images or runtime drawing APIs.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { unzipSync } from "fflate";
import { preview } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = resolve(
  root,
  process.env.KLING_THEME_REVIEW_DIR || "docs/kling-themes/evidence",
);
await mkdir(out, { recursive: true });
assert(
  !existsSync(join(out, "capture.json")),
  "Choose a fresh evidence directory.",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path);
const catalog = JSON.parse(
  await readFile(join(root, "artwork/kling-themes/catalog-index.json"), "utf8"),
);
const variantManifests = new Map();
for (const character of ["male", "female"]) {
  assert(
    catalog.some((entry) => entry.key === `${character}:kling-original@1`),
  );
  assert(
    catalog.some((entry) => entry.key === `${character}:pixel-storybook@1`),
    `Publish ${character} pixel assets before capture.`,
  );
  for (const themeId of ["kling-original", "pixel-storybook"]) {
    const entry = catalog.find(
      (entry) => entry.key === `${character}:${themeId}@1`,
    );
    const bytes = await readFile(join(root, entry.file));
    assert.equal(
      sha(bytes),
      entry.sha256,
      `${entry.key}: catalog hash must match before capture.`,
    );
    const files = unzipSync(bytes);
    const manifest = JSON.parse(new TextDecoder().decode(files["theme.json"]));
    assert(
      manifest.looks.some((look) => look.logicalId === "base") &&
        manifest.looks.some((look) => look.logicalId === "wedding"),
      `Publish both base and wedding for ${entry.key} before capture.`,
    );
    for (const look of manifest.looks) {
      const contents = unzipSync(files[look.file]);
      variantManifests.set(
        `${entry.key}/${look.logicalId}`,
        JSON.parse(new TextDecoder().decode(contents["manifest.json"])),
      );
    }
  }
}
const actions = ["idle", "walk", "run", "jump", "celebrate"];
let report = {
  format: "gathria-character-theme-evidence",
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
  switches: [],
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
        "tests",
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
      "artwork/kling-themes/catalog-index.json",
      ...catalog.map((entry) => entry.file),
    ].map(async (file) => [file, sha(await readFile(join(root, file)))]),
  ),
);
const resumeExports = process.env.KLING_THEME_RESUME_EXPORTS === "1";
if (resumeExports) {
  const checkpoint = join(
    out,
    existsSync(join(out, "exports-checkpoint.json"))
      ? "exports-checkpoint.json"
      : "failure.json",
  );
  const previous = JSON.parse(await readFile(checkpoint, "utf8"));
  assert.equal(previous.cases.length, 8);
  assert.equal(previous.downloads.length, 122);
  assert(
    previous.editorsClosedAt &&
      previous.cases.every(
        (item) => item.sessionReopenExact && item.originalRestoredExact,
      ),
  );
  assert.deepEqual(
    previous.sourceHashes,
    report.sourceHashes,
    "Cannot resume after source changes.",
  );
  assert.deepEqual(
    previous.assetHashes,
    report.assetHashes,
    "Cannot resume after artwork changes.",
  );
  assert.equal(
    previous.productionHtmlSha256,
    report.productionHtmlSha256,
    "Cannot resume against a different production build.",
  );
  for (const field of [
    "errors",
    "failedRequests",
    "externalRequests",
    "independentEditorRequests",
  ])
    assert.deepEqual(previous[field], []);
  for (const row of previous.downloads) {
    const bytes = await readFile(join(root, row.file));
    assert.equal(bytes.length, row.bytes);
    assert.equal(sha(bytes), row.sha256);
  }
  report = {
    ...previous,
    playback: [],
    resumedAt: new Date().toISOString(),
    resumeReason:
      "The capture harness now pauses a replayed one-shot before observing playback. All completed editor/export evidence was hash-verified; all independent playback cases rerun.",
  };
  delete report.error;
  delete report.passed;
  report.captureScriptSha256 = sha(
    await readFile(fileURLToPath(import.meta.url)),
  );
  console.log(
    "Resumed verified editor/export checkpoint; rerunning all80 independent playbacks.",
  );
}
const server = await preview({
  root,
  preview: { host: "127.0.0.1", port: 5217, strictPort: true },
});
const origin = "http://127.0.0.1:5217";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--disable-dev-shm-usage"],
});
const timer = setTimeout(
  () => {
    console.error("Theme capture exceeded its 30-minute bound.");
    void browser.close();
  },
  30 * 60 * 1000,
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
        {
          timeout: 180000,
          message: `Theme preparation must finish or report an explicit error: ${expected}`,
        },
      )
      .toBe(true);
    assert.deepEqual(
      await panel(page).getByRole("alert").allTextContents(),
      [],
    );
    await expect(panel(page).getByRole("status")).toContainText(expected);
  }
  await expect(button(panel(page), "Cancel theme preparation")).toHaveCount(0, {
    timeout: 180000,
  });
  assert.deepEqual(await panel(page).getByRole("alert").allTextContents(), []);
}
async function download(page, buttonName, name, metadata) {
  const pending = page.waitForEvent("download", { timeout: 180000 });
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
try {
  if (!resumeExports) {
    for (const character of ["male", "female"]) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 1000 },
      });
      context.setDefaultTimeout(60000);
      watch(context);
      const page = await context.newPage();
      active = page;
      const coldLoadStart = Date.now();
      await page.goto(
        `${origin}/workbench.html?character=${character}&mode=themes`,
      );
      await ready(page, "Kling original selected");
      report.initialLoads.push({
        character,
        elapsedMs: Date.now() - coldLoadStart,
        includesBothLookValidation: true,
      });
      const originalBaseSnapshot = await snapshot(page);
      for (const lookId of ["base", "wedding"]) {
        await button(panel(page), /^Kling original/).click();
        await ready(page, "Kling original selected");
        await panel(page)
          .getByLabel("Theme look", { exact: true })
          .selectOption(lookId);
        await ready(page);
        await selectPlayback(page, "idle", "right");
        const originalSnapshot = await snapshot(page);
        for (const kind of ["original", "pixel-storybook"]) {
          const key = `${character}-${kind}-${lookId}`;
          const entry = catalog.find(
            (entry) =>
              entry.key ===
              `${character}:${kind === "original" ? "kling-original" : kind}@1`,
          );
          const start = Date.now();
          if (kind !== "original") {
            const originalKey = `${character}:kling-original@1`;
            const fromCount = variantManifests.get(`${originalKey}/${lookId}`)
              .animations.run.frames.length;
            const toCount = variantManifests.get(`${entry.key}/${lookId}`)
              .animations.run.frames.length;
            const fromPosition = Math.floor(fromCount * 0.375);
            const toPosition = Math.floor((fromPosition * toCount) / fromCount);
            await selectPlayback(page, "run", "right", fromPosition);
            await expect(
              panel(page).getByLabel("Keep motion phase", { exact: true }),
            ).toBeChecked();
            await button(panel(page), /^Pixel storybook/).click();
            await ready(page, "Pixel storybook selected");
            await expect(
              panel(page).getByLabel("Theme frame", { exact: true }),
            ).toHaveValue(String(toPosition));
            await expect(button(panel(page), "Run")).toHaveAttribute(
              "aria-pressed",
              "true",
            );
            report.switches.push({
              character,
              lookId,
              fromTheme: originalKey,
              toTheme: entry.key,
              action: "run",
              facing: "right",
              fromPosition,
              toPosition,
              fromCount,
              toCount,
              retainedMotionPhase: true,
            });
          }
          await expect(
            panel(page).getByLabel("Theme look", { exact: true }),
          ).toHaveValue(lookId);
          await selectPlayback(page, "idle", "right");
          assert.equal(
            await page
              .getByTestId("theme-preview")
              .getAttribute("data-sampling"),
            kind === "original" ? "smooth" : "nearest",
          );
          const { row: packRow, bytes: packBytes } = await download(
            page,
            "Export theme CharacterPack",
            `${key}.character.zip`,
            { key, kind: "pack", themeFile: entry.file, lookId },
          );
          const packFiles = unzipSync(packBytes);
          const manifest = JSON.parse(
            new TextDecoder().decode(packFiles["manifest.json"]),
          );
          const config = JSON.parse(
            new TextDecoder().decode(packFiles["character.json"]),
          );
          const themeFiles = unzipSync(await readFile(join(root, entry.file)));
          const themeManifest = JSON.parse(
            new TextDecoder().decode(themeFiles["theme.json"]),
          );
          const look = themeManifest.looks.find(
            (look) => look.logicalId === lookId,
          );
          assert(look, `${entry.key} must publish ${lookId}.`);
          assert.deepEqual(packBytes, Buffer.from(themeFiles[look.file]));
          for (const action of actions) {
            const clip = manifest.animations[action];
            assert(clip?.frames.length);
            for (const facing of ["right", "left"]) {
              await selectPlayback(page, action, facing);
              const frameId = Number(
                await page
                  .getByTestId("theme-preview")
                  .getAttribute("data-frame-id"),
              );
              assert.equal(frameId, clip.frames[0]);
              await download(
                page,
                "Export theme PNG",
                `${key}-${action}-${facing}.png`,
                { key, kind: "frame", action, facing, frameId },
              );
              if (
                action === "run" ||
                (kind === "pixel-storybook" && facing === "right")
              )
                await download(
                  page,
                  "Export theme GIF",
                  `${key}-${action}-${facing}.gif`,
                  { key, kind: "gif", action, facing },
                );
            }
          }
          await selectPlayback(page, "run", "right");
          await panel(page)
            .getByLabel("Compare Kling original", { exact: true })
            .check();
          await expect(page.getByTestId("theme-reference")).toBeVisible({
            timeout: 180000,
          });
          if (kind === "pixel-storybook")
            await panel(page)
              .getByLabel("Theme display scale", { exact: true })
              .selectOption("2");
          await page.screenshot({
            path: join(out, `${key}-workspace.png`),
            fullPage: true,
          });
          await page.setViewportSize({ width: 390, height: 844 });
          if (kind === "pixel-storybook")
            await panel(page)
              .getByLabel("Theme display scale", { exact: true })
              .selectOption("1");
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          );
          await page.screenshot({
            path: join(out, `${key}-mobile.png`),
            fullPage: true,
          });
          await page.setViewportSize({ width: 1280, height: 1000 });
          await panel(page)
            .getByLabel("Theme display scale", { exact: true })
            .selectOption("fit");
          await panel(page)
            .getByLabel("Compare Kling original", { exact: true })
            .uncheck();
          report.cases.push({
            key,
            character,
            themeKey: entry.key,
            lookId,
            themeFile: entry.file,
            packFile: packRow.file,
            packSha256: packRow.sha256,
            manifest,
            config,
            elapsedExportFlowMs: Date.now() - start,
            sampling: kind === "original" ? "smooth" : "nearest",
          });
        }
        await button(panel(page), /^Kling original/).click();
        await ready(page, "Kling original selected");
        await expect(
          panel(page).getByLabel("Theme look", { exact: true }),
        ).toHaveValue(lookId);
        await selectPlayback(page, "idle", "right");
        assert.equal(
          await snapshot(page),
          originalSnapshot,
          `${character}/${lookId}: exact original preview restoration`,
        );
        for (const row of report.cases.filter(
          (row) => row.character === character && row.lookId === lookId,
        ))
          row.originalRestoredExact = true;
      }
      await button(panel(page), /^Pixel storybook/).click();
      await ready(page, "Pixel storybook selected");
      await expect(
        panel(page).getByLabel("Theme look", { exact: true }),
      ).toHaveValue("wedding");
      await selectPlayback(page, "jump", "left");
      const selectedPixel = await snapshot(page);
      const selection = {
        themeKey: `${character}:pixel-storybook@1`,
        lookId: "wedding",
        action: "jump",
        facing: "left",
      };
      const session = await download(
        page,
        "Save theme session",
        `${character}.theme-session.zip`,
        {
          key: `${character}-pixel-storybook-wedding`,
          kind: "session",
          selection,
        },
      );
      await button(panel(page), "Restore Kling original").click();
      await ready(page, "Kling original selected");
      await selectPlayback(page, "idle", "right");
      assert.equal(
        await snapshot(page),
        originalBaseSnapshot,
        `${character}: explicit restore returns to original base`,
      );
      await panel(page)
        .getByLabel("Theme session file", { exact: true })
        .setInputFiles(join(root, session.row.file));
      await ready(page, "Theme session restored");
      assert.equal(
        await snapshot(page),
        selectedPixel,
        `${character}: exact saved pixel preview restoration`,
      );
      for (const row of report.cases.filter(
        (row) => row.character === character,
      )) {
        row.sessionReopenExact = true;
      }
      await context.close();
    }
    report.editorsClosedAt = new Date().toISOString();
  }
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
      timeout: 180000,
    });
    const scales = await page
      .getByLabel("Display scale", { exact: true })
      .locator("option")
      .evaluateAll((options) => options.map((option) => option.value));
    if (record.manifest.scale.pixelArt) assert(!scales.includes("0.5"));
    for (const action of actions)
      for (const facing of ["right", "left"]) {
        const pause = button(page, "Pause animation");
        if (await pause.count()) await pause.click();
        await button(page, action[0].toUpperCase() + action.slice(1)).click();
        await button(page, facing[0].toUpperCase() + facing.slice(1)).click();
        await page
          .getByLabel("Playback speed", { exact: true })
          .selectOption("1");
        await page
          .getByLabel("Display scale", { exact: true })
          .selectOption(record.manifest.scale.pixelArt ? "1" : "0.5");
        // Selecting a completed one-shot intentionally replays it. Pause that
        // new playback before seeking so observation always starts at zero.
        if (await pause.count()) await pause.click();
        await page.locator("#player-frame").fill("0");
        await expect(button(page, "Play animation")).toBeVisible();
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
          `Played ${record.key} ${action}/${facing} (${report.playback.length}/80)`,
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
    "Production theme switching, exports and independent playback passed.",
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
