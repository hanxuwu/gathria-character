// A separate, explicitly versioned check of the final comparison presentation.
// Reuses no editor state and exports the same native frame as the full capture.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = resolve(root, "docs/kling-themes/presentation");
await mkdir(out, { recursive: true });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path);
const baselineFile = join(root, "docs/kling-themes/evidence/capture.json");
const baseline = JSON.parse(await readFile(baselineFile, "utf8"));
assert(baseline.passed && baseline.playback.length === 80);
const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
assert.equal(
  execFileSync(
    "git",
    [
      "diff",
      "HEAD",
      "--name-only",
      "--",
      "src",
      "tests",
      "package.json",
      "package-lock.json",
      "vite.config.ts",
    ],
    { cwd: root, encoding: "utf8" },
  ).trim(),
  "",
  "Commit the final presentation code before capture.",
);
const report = {
  format: "gathria-theme-presentation-evidence",
  version: 1,
  passed: false,
  startedAt: new Date().toISOString(),
  commitAtCapture: currentCommit,
  baselineCommit: baseline.commitAtCapture,
  baselineCaptureSha256: sha(await readFile(baselineFile)),
  productionHtmlSha256: sha(await readFile(join(root, "dist/workbench.html"))),
  sourceHashes: {},
  changedSources: [],
  assetHashes: baseline.assetHashes,
  note: "Full 122-export/80-playback evidence remains associated with its original commit. This separate capture checks only the final comparison presentation and four unchanged native PNG exports.",
  cases: [],
  errors: [],
  failedRequests: [],
};
for (const [file, previousSha256] of Object.entries(baseline.sourceHashes)) {
  assert.equal(
    sha(
      execFileSync("git", ["show", `${baseline.commitAtCapture}:${file}`], {
        cwd: root,
        maxBuffer: 32 * 1024 * 1024,
      }),
    ),
    previousSha256,
  );
}
const currentSourceFiles = execFileSync(
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
  .filter(Boolean);
for (const file of currentSourceFiles) {
  const previousSha256 = baseline.sourceHashes[file] ?? null;
  const currentSha256 = sha(await readFile(join(root, file)));
  assert.equal(
    sha(
      execFileSync("git", ["show", `${currentCommit}:${file}`], {
        cwd: root,
        maxBuffer: 32 * 1024 * 1024,
      }),
    ),
    currentSha256,
    "Final presentation source must be reproducible from its recorded commit.",
  );
  report.sourceHashes[file] = currentSha256;
  if (currentSha256 !== previousSha256)
    report.changedSources.push({ file, previousSha256, currentSha256 });
}
const allowed = new Set([
  "src/themes/ThemeWorkspace.tsx",
  "src/themes/preview-budget.ts",
  "src/themes/preview-budget.test.ts",
  "src/themes/motion-phase.test.ts",
  "tests/e2e/themes.spec.ts",
  "tests/e2e/theme-presentation.spec.ts",
]);
assert(
  report.changedSources.length > 0 &&
    report.changedSources.every(({ file }) => allowed.has(file)),
  "Presentation proof does not cover unrelated source changes.",
);
for (const [file, hash] of Object.entries(report.assetHashes))
  assert.equal(sha(await readFile(join(root, file))), hash);
const server = await preview({
  root,
  preview: { host: "127.0.0.1", port: 5217, strictPort: true },
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--disable-dev-shm-usage"],
});
const origin = "http://127.0.0.1:5217";
const scope = (page) =>
  page.getByRole("region", { name: "Character themes", exact: true });
async function ready(page, text) {
  await expect
    .poll(
      async () =>
        (await scope(page).getByRole("alert").count()) > 0 ||
        (await scope(page).getByRole("status").innerText()).includes(text),
      { timeout: 180000 },
    )
    .toBe(true);
  assert.deepEqual(await scope(page).getByRole("alert").allTextContents(), []);
  await expect(
    scope(page).getByRole("button", {
      name: "Cancel theme preparation",
      exact: true,
    }),
  ).toHaveCount(0);
}
try {
  for (const character of ["male", "female"]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 1000 },
    });
    context.setDefaultTimeout(60000);
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(String(error)));
    page.on("response", (response) => {
      if (response.status() >= 400 && !response.url().endsWith("favicon.ico"))
        report.failedRequests.push({
          url: response.url(),
          status: response.status(),
        });
    });
    await page.goto(
      `${origin}/workbench.html?character=${character}&mode=themes`,
    );
    await ready(page, "Kling original selected");
    await scope(page)
      .getByRole("button", { name: /^Pixel storybook/ })
      .click();
    await ready(page, "Pixel storybook selected");
    for (const lookId of ["base", "wedding"]) {
      const key = `${character}-pixel-storybook-${lookId}`;
      await scope(page)
        .getByLabel("Theme look", { exact: true })
        .selectOption(lookId);
      await expect(
        scope(page).getByRole("button", {
          name: "Cancel theme preparation",
          exact: true,
        }),
      ).toHaveCount(0);
      await scope(page)
        .getByRole("button", { name: "Run", exact: true })
        .click();
      await scope(page)
        .getByLabel("Theme facing", { exact: true })
        .selectOption("right");
      await scope(page).getByLabel("Theme frame", { exact: true }).fill("0");
      await scope(page)
        .getByLabel("Compare Kling original", { exact: true })
        .check();
      await expect(page.getByTestId("theme-reference")).toBeVisible({
        timeout: 180000,
      });
      await scope(page)
        .getByLabel("Theme display scale", { exact: true })
        .selectOption("2");
      const geometry = await page.evaluate(() =>
        Object.fromEntries(
          ["theme-preview", "theme-reference"].map((id) => {
            const canvas = document.querySelector(`[data-testid="${id}"]`);
            return [
              id,
              {
                width: canvas.width,
                height: canvas.height,
                cssWidth: parseFloat(canvas.style.width),
                cssHeight: parseFloat(canvas.style.height),
                frameId: Number(canvas.dataset.frameId),
                sampling: canvas.dataset.sampling,
              },
            ];
          }),
        ),
      );
      const pixel = geometry["theme-preview"],
        reference = geometry["theme-reference"];
      assert.equal(pixel.sampling, "nearest");
      assert.equal(reference.sampling, "smooth");
      assert.equal(pixel.cssWidth, pixel.width * 2);
      assert.equal(pixel.cssHeight, pixel.height * 2);
      assert.equal(reference.cssWidth, pixel.cssWidth);
      assert.equal(reference.cssHeight, pixel.cssHeight);
      assert.equal(reference.width, reference.cssWidth);
      assert.equal(reference.height, reference.cssHeight);
      const screenshot = join(out, `${key}-workspace-2x.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      const downloaded = page.waitForEvent("download", { timeout: 180000 });
      await scope(page)
        .getByRole("button", { name: "Export theme PNG", exact: true })
        .click();
      const png = join(out, `${key}-run-right.png`);
      await (await downloaded).saveAs(png);
      const previous = baseline.downloads.find(
        (row) =>
          row.key === key &&
          row.kind === "frame" &&
          row.action === "run" &&
          row.facing === "right",
      );
      assert(previous && previous.frameId === pixel.frameId);
      const pngBytes = await readFile(png);
      assert.equal(
        sha(pngBytes),
        previous.sha256,
        "Presentation change must not change native exported bytes.",
      );
      assert.deepEqual(pngBytes, await readFile(join(root, previous.file)));
      report.cases.push({
        key,
        character,
        lookId,
        action: "run",
        facing: "right",
        geometry,
        screenshot: rel(screenshot),
        screenshotSha256: sha(await readFile(screenshot)),
        png: rel(png),
        pngSha256: sha(pngBytes),
        baselinePng: previous.file,
        exactNativeExportUnchanged: true,
      });
      console.log(`Final presentation + exact native PNG passed: ${key}`);
    }
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.failedRequests, []);
  report.passed = true;
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(out, "capture.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
