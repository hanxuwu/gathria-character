// Actual production UI import/export of a rejected, non-catalog run study.
// This evidence does not select or publish the study as a shipping theme.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { preview } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const input = resolve(
  root,
  process.env.KLING_RUN_TRIAL_THEME ||
    "docs/kling-theme-continuity/trial/male-run16-study.theme.zip",
);
const out = resolve(
  root,
  process.env.KLING_RUN_TRIAL_DIR ||
    "docs/kling-theme-continuity/trial/evidence",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (file) => relative(root, file);
await mkdir(out, { recursive: true });
assert(
  !existsSync(join(out, "capture.json")),
  "Choose a fresh trial evidence directory.",
);
const inputBytes = await readFile(input);
const files = unzipSync(inputBytes);
const theme = JSON.parse(strFromU8(files["theme.json"]));
const themeKey = `${theme.character}:${theme.id}@${theme.revision}`;
const catalogBytes = await readFile(
  join(root, "artwork/kling-themes/catalog-index.json"),
);
const catalog = JSON.parse(catalogBytes.toString());
assert(
  !catalog.some((entry) => entry.key === themeKey),
  "Rejected art trial must not be in the published catalog.",
);
assert.equal(theme.character, "male");
assert.equal(theme.rendering, "pixel");
const look = theme.looks.find((candidate) => candidate.logicalId === "base");
assert(look);
const packBytes = files[look.file];
assert.equal(sha(packBytes), look.sha256);
const manifest = JSON.parse(strFromU8(unzipSync(packBytes)["manifest.json"]));
assert.equal(manifest.animations.run.frames.length, 16);
assert.equal(manifest.animations.run.fps, 24);
assert.equal(manifest.animations.run.loop, true);
const report = {
  format: "gathria-rejected-run-trial-evidence",
  version: 1,
  production: true,
  adopted: false,
  catalogPublished: false,
  note: "Technically playable authoring experiment rejected for visual/anatomical defects. Shipping male pixel revision 2 stays selected in the catalog.",
  startedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  input: { file: rel(input), sha256: sha(inputBytes), themeKey },
  catalogSha256: sha(catalogBytes),
  productionHtmlSha256: sha(await readFile(join(root, "dist/workbench.html"))),
  manifest,
  downloads: [],
  observed: [],
  errors: [],
  failedRequests: [],
  externalRequests: [],
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
        "scripts/capture-kling-run-trial.mjs",
        "scripts/verify-kling-run-trial.py",
        "scripts/verify-kling-theme-continuity.py",
      ],
      { cwd: root, encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean)
      .map(async (file) => [file, sha(await readFile(join(root, file)))]),
  ),
);
const server = await preview({
  root,
  preview: { host: "127.0.0.1", port: 5226, strictPort: true },
});
const origin = "http://127.0.0.1:5226";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--disable-dev-shm-usage"],
});
const timer = setTimeout(() => {
  console.error("Rejected-trial capture exceeded three minutes.");
  void browser.close();
}, 180000);
const context = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
});
context.setDefaultTimeout(45000);
const page = await context.newPage();
page.on("pageerror", (error) => report.errors.push(String(error)));
context.on("request", (request) => {
  if (/^https?:/.test(request.url()) && !request.url().startsWith(origin))
    report.externalRequests.push(request.url());
});
context.on("response", (response) => {
  if (response.status() >= 400 && !response.url().endsWith("favicon.ico"))
    report.failedRequests.push({
      url: response.url(),
      status: response.status(),
    });
});
const panel = page.getByRole("region", {
  name: "Character themes",
  exact: true,
});
const button = (name) => panel.getByRole("button", { name, exact: true });
async function ready(message) {
  if (message)
    await expect(panel.getByRole("status")).toContainText(message, {
      timeout: 90000,
    });
  await expect(button("Cancel theme preparation")).toHaveCount(0, {
    timeout: 90000,
  });
  assert.deepEqual(await panel.getByRole("alert").allTextContents(), []);
}
async function download(buttonName, name, metadata) {
  const pending = page.waitForEvent("download", { timeout: 90000 });
  await button(buttonName).click();
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
  await ready();
  console.log(`Exported rejected trial ${name}`);
  return bytes;
}
try {
  await page.goto(`${origin}/workbench.html?character=male&mode=themes`);
  await ready("Kling original selected");
  await panel
    .getByLabel("Theme bundle file", { exact: true })
    .setInputFiles(input);
  await ready("Imported theme accepted");
  await expect(
    panel.locator(`button[data-theme-key="${themeKey}"]`),
  ).toHaveAttribute("aria-pressed", "true");
  const exportedPack = await download(
    "Export theme CharacterPack",
    "male-run16-rejected.character.zip",
    { kind: "pack" },
  );
  assert.equal(sha(exportedPack), look.sha256);
  for (const facing of ["right", "left"]) {
    await button("Run").click();
    await panel
      .getByLabel("Theme facing", { exact: true })
      .selectOption(facing);
    await panel.getByLabel("Theme frame", { exact: true }).fill("0");
    await download("Export theme GIF", `male-run16-rejected-${facing}.gif`, {
      kind: "gif",
      action: "run",
      facing,
    });
    for (
      let position = 0;
      position < manifest.animations.run.frames.length;
      position++
    ) {
      await panel
        .getByLabel("Theme frame", { exact: true })
        .fill(String(position));
      const frameId = manifest.animations.run.frames[position];
      await expect(page.getByTestId("theme-preview")).toHaveAttribute(
        "data-frame-id",
        String(frameId),
      );
      await download(
        "Export theme PNG",
        `male-run16-rejected-${facing}-${String(position).padStart(2, "0")}.png`,
        { kind: "frame", action: "run", facing, position, frameId },
      );
    }
  }
  await panel.getByLabel("Theme facing", { exact: true }).selectOption("right");
  await panel.getByLabel("Theme frame", { exact: true }).fill("0");
  await panel
    .getByLabel("Theme display scale", { exact: true })
    .selectOption("2");
  report.observed = await page.evaluate(async () => {
    const rows = [];
    let last = "";
    const sample = () => {
      const canvas = document.querySelector('[data-testid="theme-preview"]');
      if (!canvas || canvas.dataset.framePosition === last) return;
      rows.push({
        position: Number(canvas.dataset.framePosition),
        frameId: Number(canvas.dataset.frameId),
      });
      last = canvas.dataset.framePosition;
    };
    const observer = new MutationObserver(sample);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["data-frame-id", "data-frame-position"],
    });
    sample();
    document.querySelector('[aria-label="Play theme"]').click();
    await new Promise((resolve) => setTimeout(resolve, 2200));
    document.querySelector('[aria-label="Pause theme"]').click();
    sample();
    observer.disconnect();
    return rows;
  });
  assert.deepEqual(
    [...new Set(report.observed.map((row) => row.position))].sort(
      (a, b) => a - b,
    ),
    Array.from({ length: 16 }, (_, i) => i),
  );
  for (const row of report.observed)
    assert.equal(row.frameId, manifest.animations.run.frames[row.position]);
  await page.screenshot({
    path: join(out, "male-run16-rejected-workspace.png"),
    fullPage: true,
  });
  for (const field of ["errors", "failedRequests", "externalRequests"])
    assert.deepEqual(report[field], []);
  report.passed = true;
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(out, "capture.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    "Rejected study actual import/export captured; this is not visual acceptance.",
  );
} catch (error) {
  await writeFile(
    join(out, "failure.json"),
    JSON.stringify({ ...report, error: String(error) }, null, 2) + "\n",
  );
  await page
    .screenshot({ path: join(out, "failure.png"), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  clearTimeout(timer);
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
