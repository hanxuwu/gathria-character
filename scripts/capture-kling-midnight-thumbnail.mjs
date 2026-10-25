// Append one actual Midnight sailor thumbnail. Existing preview rows/images stay exact.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path).replaceAll("\\", "/");
const indexPath = join(root, "src/wardrobe/outfit-previews/index.json");
const beforeBytes = await readFile(indexPath);
const beforeText = beforeBytes.toString("utf8");
const before = JSON.parse(beforeText);
assert.equal(
  before.previews.length,
  37,
  "This append-only capture expects the 37 preserved previews.",
);
assert(
  !before.previews.some(
    (p) => p.character === "male" && p.presetId === "midnight-sailor",
  ),
);
const preserved = {};
for (const row of before.previews) {
  for (const path of [
    `src/wardrobe/outfit-previews/${row.file}`,
    row.nativeFile,
  ])
    preserved[path] = sha(await readFile(join(root, path)));
}
const evidence = join(
  root,
  "docs/kling-expression-shirt/evidence/thumbnail-v1",
);
const file = "male-midnight-sailor.png";
const nativePath = join(evidence, file);
const thumbnailPath = join(root, "src/wardrobe/outfit-previews", file);
const reportPath = join(evidence, "capture-report.json");
for (const path of [nativePath, thumbnailPath, reportPath])
  assert(!existsSync(path), `Preserve ${path}`);
await mkdir(evidence, { recursive: true });
const catalogBytes = await readFile(
  join(root, "docs/kling-wardrobe/catalog.json"),
);
const catalog = JSON.parse(catalogBytes);
const entry = catalog.characters.find((c) => c.key === "male");
const preset = entry.presets.find((p) => p.id === "midnight-sailor");
assert(preset);
const registrationBytes = await readFile(
  join(root, entry.registrationUrl.slice(1)),
);
const registration = JSON.parse(registrationBytes);
const port = 5226;
const origin = `http://127.0.0.1:${port}`;
const report = {
  format: "gathria-single-outfit-preview-capture",
  version: 1,
  server: { kind: "vite-development", origin, hmr: false },
  startedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  catalogSha256: sha(catalogBytes),
  scriptSha256: sha(await readFile(fileURLToPath(import.meta.url))),
  indexBeforeSha256: sha(beforeBytes),
  preservedRowsSha256: sha(JSON.stringify(before.previews)),
  preservedFiles: preserved,
  recipe:
    "Development UI Save current PNG at idle frame 0, right, original head. Browser Canvas draws the decoded actual download at width 176 with proportional height, high-quality smooth downsampling and unchanged transparency. No crop, recolor or repaint.",
  devModuleResponses: [],
  errors: [],
  failedRequests: [],
  externalRequests: [],
  passed: false,
};
const bodyChecks = [];
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port, strictPort: true, hmr: false },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !request.url().startsWith(origin + "/")
    )
      report.externalRequests.push(request.url());
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith("/favicon.ico"))
      report.failedRequests.push({
        url: response.url(),
        status: response.status(),
      });
    if (response.request().resourceType() === "script") {
      const pending = response.body().then((bytes) => {
        report.devModuleResponses.push({
          url: response.url(),
          bytes: bytes.length,
          sha256: sha(bytes),
        });
      });
      pending.catch(() => {});
      bodyChecks.push(pending);
    }
  });
  const panel = page.locator("#wardrobe-panel");
  const ready = async (text) => {
    await expect(panel.getByRole("status")).toContainText(text, {
      timeout: 240000,
    });
    await expect(panel.locator('[aria-busy="true"]')).toHaveCount(0, {
      timeout: 240000,
    });
    assert.deepEqual(await panel.getByRole("alert").allTextContents(), []);
  };
  await page.goto(`${origin}/workbench.html?character=male&mode=wardrobe`);
  await ready("Original outfit.");
  await panel.getByLabel("Find an outfit", { exact: true }).fill(preset.name);
  await panel.getByRole("button", { name: preset.name, exact: true }).click();
  await ready(preset.name + " selected");
  await expect(panel.getByLabel("Hairstyle", { exact: true })).toHaveValue("");
  await expect(panel.getByLabel("Face", { exact: true })).toHaveValue("");
  for (const [slot, label] of [
    ["top", "Top"],
    ["bottom", "Bottom"],
    ["fullBody", "Dress / one-piece"],
    ["shoes", "Shoes"],
  ])
    await expect(panel.getByLabel(label, { exact: true })).toHaveValue(
      preset.selection[slot] || "",
    );
  const pause = panel.getByRole("button", {
    name: "Pause wardrobe animation",
    exact: true,
  });
  if (await pause.count()) await pause.click();
  await panel
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption("idle");
  await panel
    .getByLabel("Wardrobe facing", { exact: true })
    .selectOption("right");
  await panel.getByLabel("Wardrobe frame", { exact: true }).fill("0");
  await expect(panel.getByTestId("wardrobe-preview")).toHaveAttribute(
    "data-rendered-action",
    "idle",
  );
  await expect(panel.getByTestId("wardrobe-preview")).toHaveAttribute(
    "data-rendered-frame-id",
    "0",
  );
  const pending = page.waitForEvent("download", { timeout: 120000 });
  await panel
    .getByRole("button", { name: "Save current PNG", exact: true })
    .click();
  const download = await pending;
  assert.equal(await download.failure(), null);
  await download.saveAs(nativePath);
  const bytes = await readFile(nativePath);
  await download.delete();
  const result = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 176;
    canvas.height = Math.round((image.height * 176) / image.width);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      png: canvas.toDataURL().split(",")[1],
      nativeWidth: image.width,
      nativeHeight: image.height,
      width: canvas.width,
      height: canvas.height,
    };
  }, bytes.toString("base64"));
  assert.deepEqual(
    [result.nativeWidth, result.nativeHeight, result.width, result.height],
    [704, 1056, 176, 264],
  );
  const thumbnail = Buffer.from(result.png, "base64");
  const ids = new Set(Object.values(preset.selection).filter(Boolean));
  const row = {
    character: entry.key,
    presetId: preset.id,
    name: preset.name,
    selection: preset.selection,
    sourceSha256: registration.sourceSha256,
    registrationSha256: sha(registrationBytes),
    items: entry.items
      .filter((item) => ids.has(item.id))
      .map(({ id, sha256 }) => ({ id, sha256 })),
    file,
    thumbnailSha256: sha(thumbnail),
    thumbnailBytes: thumbnail.length,
    nativeFile: rel(nativePath),
    nativeSha256: sha(bytes),
    nativeBytes: bytes.length,
    sourceFrame: 0,
    width: result.width,
    height: result.height,
    nativeWidth: result.nativeWidth,
    nativeHeight: result.nativeHeight,
    captureMode: "vite-development",
    captureReport: rel(reportPath),
    recipe: report.recipe,
  };
  await Promise.all(bodyChecks);
  for (const field of ["errors", "failedRequests", "externalRequests"])
    assert.deepEqual(report[field], []);
  assert(report.devModuleResponses.length > 0);
  assert.equal(
    sha(await readFile(indexPath)),
    sha(beforeBytes),
    "Index changed during the narrow capture.",
  );
  for (const [path, hash] of Object.entries(preserved))
    assert.equal(sha(await readFile(join(root, path))), hash);
  const marker = '\n  ],\n  "errors":';
  assert.equal(beforeText.split(marker).length, 2);
  const inserted = JSON.stringify(row, null, 2)
    .split("\n")
    .map((line) => "    " + line)
    .join("\n");
  const afterText = beforeText.replace(marker, ",\n" + inserted + marker);
  const after = JSON.parse(afterText);
  assert.equal(after.previews.length, 38);
  assert.deepEqual(after.previews.slice(0, 37), before.previews);
  await writeFile(thumbnailPath, thumbnail);
  await writeFile(indexPath, afterText);
  report.preview = row;
  report.indexAfterSha256 = sha(await readFile(indexPath));
  report.preservedRowsAndFilesExact = true;
  report.passed = true;
  await context.close();
} catch (error) {
  report.failure = String(error.stack || error);
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  await browser?.close();
  await server.close();
}
console.log(
  JSON.stringify(
    {
      passed: report.passed,
      preview: report.preview,
      index: rel(indexPath),
      report: rel(reportPath),
    },
    null,
    2,
  ),
);
