// Append exactly three UI-exported previews; preserve all 38 prior rows/76 PNGs.
// Run only after all three final presets are published. This records a dev UI,
// independently from the batch's later production captures.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const { values: args } = parseArgs({
  options: {
    plan: { type: "boolean", default: false },
    run: { type: "string", default: "thumbnails-v1" },
  },
});
assert(
  /^[a-z0-9][a-z0-9-]{0,63}$/.test(args.run),
  "Use a fresh evidence run ID.",
);
const targets = [
  { character: "male", presetId: "midnight-sailor-refined" },
  { character: "female", presetId: "plum-pintuck-day" },
  { character: "female", presetId: "plum-pintuck-ochre" },
];
const port = 5227;
const origin = `http://127.0.0.1:${port}`;
if (args.plan) {
  console.log(
    JSON.stringify(
      {
        targets,
        server: { kind: "vite-development", origin, hmr: false },
        sourcePose: { action: "idle", frameId: 0, facing: "right" },
        appearance: { hairId: null, faceId: null, hairColor: "original" },
        thumbnails: { count: 3, width: 176, height: 264 },
        nativeDownloads: { count: 3, width: 704, height: 1056 },
        retainedPreviewRows: 38,
        retainedPngFiles: 76,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const root = fileURLToPath(new URL("../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path).replaceAll("\\", "/");
const indexPath = join(root, "src/wardrobe/outfit-previews/index.json");
const catalogPath = join(root, "docs/kling-wardrobe/catalog.json");
const evidence = join(root, "docs/kling-expression-fit/evidence", args.run);
const reportPath = join(evidence, "capture-report.json");
const beforeBytes = await readFile(indexPath);
const beforeText = beforeBytes.toString("utf8");
const before = JSON.parse(beforeText);
assert.equal(
  before.previews.length,
  38,
  "Expected the 38 retained preview rows.",
);
assert(!existsSync(evidence), `Preserve existing evidence: ${rel(evidence)}`);
const preserved = {};
for (const row of before.previews) {
  for (const path of [
    `src/wardrobe/outfit-previews/${row.file}`,
    row.nativeFile,
  ])
    preserved[path] = sha(await readFile(join(root, path)));
}
assert.equal(Object.keys(preserved).length, 76);
const catalogBytes = await readFile(catalogPath);
const catalog = JSON.parse(catalogBytes);
const expectedAssets = new Map();
const pendingPreviews = [];
const boundTargets = [];
for (const target of targets) {
  assert(
    !before.previews.some(
      (row) =>
        row.character === target.character && row.presetId === target.presetId,
    ),
  );
  const entry = catalog.characters.find((row) => row.key === target.character);
  const preset = entry?.presets.find((row) => row.id === target.presetId);
  assert(
    preset,
    `Publish the final ${target.character}/${target.presetId} preset before capture.`,
  );
  const registrationBytes = await readFile(
    join(root, entry.registrationUrl.slice(1)),
  );
  const registration = JSON.parse(registrationBytes);
  const sourceBytes = await readFile(join(root, entry.sourceUrl.slice(1)));
  assert.equal(sha(sourceBytes), registration.sourceSha256);
  expectedAssets.set(entry.sourceUrl, {
    sha256: sha(sourceBytes),
    bytes: sourceBytes.length,
  });
  expectedAssets.set(entry.registrationUrl, {
    sha256: sha(registrationBytes),
    bytes: registrationBytes.length,
  });
  const ids = new Set(Object.values(preset.selection).filter(Boolean));
  const items = entry.items.filter((item) => ids.has(item.id));
  assert.equal(
    items.length,
    ids.size,
    "Every selected item must have a catalog binding.",
  );
  for (const item of items) {
    const bytes = await readFile(join(root, item.url.slice(1)));
    assert.equal(sha(bytes), item.sha256, `Catalog bytes changed: ${item.id}`);
    expectedAssets.set(item.url, { sha256: item.sha256, bytes: bytes.length });
  }
  const file = `${target.character}-${target.presetId}.png`;
  const nativePath = join(evidence, "native", file);
  const thumbnailPath = join(root, "src/wardrobe/outfit-previews", file);
  assert(!existsSync(thumbnailPath), `Preserve ${rel(thumbnailPath)}`);
  boundTargets.push({
    ...target,
    entry,
    preset,
    registration,
    registrationBytes,
    items,
    file,
    nativePath,
    thumbnailPath,
  });
}
const report = {
  format: "gathria-expression-fit-thumbnail-capture",
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
  preservedRows: before.previews.length,
  preservedFiles: preserved,
  recipe:
    "Development UI Save current PNG at idle source frame 0, right, original hairstyle and Natural source face. Browser Canvas downsamples each actual native download to width 176 with proportional height, high-quality smoothing and unchanged transparency. No crop, recolor or repaint.",
  expectedAssetResponses: Object.fromEntries(expectedAssets),
  assetResponseVerification:
    "Playwright fetches selected local asset requests from the development server, verifies their bytes against the pinned inputs, and fulfills the browser request with that identical response body. This avoids Chromium inspector-cache limits on source ZIPs.",
  assetResponses: [],
  devModuleResponses: [],
  errors: [],
  failedRequests: [],
  externalRequests: [],
  previews: [],
  passed: false,
};
await mkdir(join(evidence, "native"), { recursive: true });
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port, strictPort: true, hmr: false },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--disable-dev-shm-usage"],
  });
  for (const target of boundTargets) {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const bodyChecks = [];
    await context.route("**/*", async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (
        request.resourceType() === "script" ||
        !expectedAssets.has(pathname)
      ) {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const bytes = await response.body();
      assert.equal(response.status(), 200, `Asset request failed: ${pathname}`);
      const row = {
        url: request.url(),
        bytes: bytes.length,
        sha256: sha(bytes),
      };
      assert.deepEqual(
        { sha256: row.sha256, bytes: row.bytes },
        expectedAssets.get(pathname),
        `Browser asset differs: ${pathname}`,
      );
      report.assetResponses.push(row);
      await route.fulfill({ response, body: bytes });
      await response.dispose();
    });
    page.on("pageerror", (error) => report.errors.push(error.message));
    page.on("request", (request) => {
      if (
        /^https?:/.test(request.url()) &&
        !request.url().startsWith(origin + "/")
      )
        report.externalRequests.push(request.url());
    });
    page.on("response", (response) => {
      const pathname = new URL(response.url()).pathname;
      const isScript = response.request().resourceType() === "script";
      if (response.status() >= 400 && pathname !== "/favicon.ico")
        report.failedRequests.push({
          url: response.url(),
          status: response.status(),
        });
      // Actual large assets are verified by the transparent route above;
      // ?import&url wrappers are recorded separately as development modules.
      if (isScript) {
        const pending = response.body().then((bytes) => {
          const row = {
            url: response.url(),
            bytes: bytes.length,
            sha256: sha(bytes),
          };
          report.devModuleResponses.push(row);
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
    await page.goto(
      `${origin}/workbench.html?character=${target.character}&mode=wardrobe`,
    );
    await ready("Original outfit.");
    await panel
      .getByLabel("Find an outfit", { exact: true })
      .fill(target.preset.name);
    await panel
      .getByRole("button", { name: target.preset.name, exact: true })
      .click();
    await ready(target.preset.name + " selected");
    await expect(panel.getByLabel("Hairstyle", { exact: true })).toHaveValue(
      "",
    );
    await expect(panel.getByLabel("Face", { exact: true })).toHaveValue("");
    for (const [slot, label] of [
      ["top", "Top"],
      ["bottom", "Bottom"],
      ["fullBody", "Dress / one-piece"],
      ["shoes", "Shoes"],
    ])
      await expect(panel.getByLabel(label, { exact: true })).toHaveValue(
        target.preset.selection[slot] || "",
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
    await expect(panel.getByTestId("wardrobe-preview")).toHaveAttribute(
      "data-frame-position",
      "0",
    );
    const pending = page.waitForEvent("download", { timeout: 120000 });
    await panel
      .getByRole("button", { name: "Save current PNG", exact: true })
      .click();
    const download = await pending;
    assert.equal(await download.failure(), null);
    await download.saveAs(target.nativePath);
    const bytes = await readFile(target.nativePath);
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
      const alpha = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      return {
        png: canvas.toDataURL().split(",")[1],
        nativeWidth: image.width,
        nativeHeight: image.height,
        width: canvas.width,
        height: canvas.height,
        hasTransparentPixels: alpha.some(
          (byte, i) => i % 4 === 3 && byte === 0,
        ),
        hasOpaquePixels: alpha.some((byte, i) => i % 4 === 3 && byte === 255),
      };
    }, bytes.toString("base64"));
    assert.deepEqual(
      [result.nativeWidth, result.nativeHeight, result.width, result.height],
      [704, 1056, 176, 264],
    );
    assert(result.hasTransparentPixels && result.hasOpaquePixels);
    const thumbnail = Buffer.from(result.png, "base64");
    const row = {
      character: target.character,
      presetId: target.preset.id,
      name: target.preset.name,
      selection: target.preset.selection,
      sourceSha256: target.registration.sourceSha256,
      registrationSha256: sha(target.registrationBytes),
      items: target.items.map(({ id, sha256 }) => ({ id, sha256 })),
      file: target.file,
      thumbnailSha256: sha(thumbnail),
      thumbnailBytes: thumbnail.length,
      nativeFile: rel(target.nativePath),
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
    pendingPreviews.push({
      row,
      thumbnail,
      thumbnailPath: target.thumbnailPath,
    });
    await Promise.all(bodyChecks);
    await context.close();
    console.log(
      JSON.stringify({
        captured: `${target.character}/${target.presetId}`,
        nativeSha256: row.nativeSha256,
      }),
    );
  }
  for (const field of ["errors", "failedRequests", "externalRequests"])
    assert.deepEqual(report[field], []);
  assert(report.devModuleResponses.length > 0);
  for (const pathname of expectedAssets.keys())
    assert(
      report.assetResponses.some(
        (row) => new URL(row.url).pathname === pathname,
      ),
      `Missing browser response: ${pathname}`,
    );
  assert.equal(
    sha(await readFile(catalogPath)),
    sha(catalogBytes),
    "Catalog changed during capture.",
  );
  assert.equal(
    sha(await readFile(indexPath)),
    sha(beforeBytes),
    "Index changed during capture.",
  );
  for (const [path, hash] of Object.entries(preserved))
    assert.equal(sha(await readFile(join(root, path))), hash);
  const marker = '\n  ],\n  "errors":';
  assert.equal(beforeText.split(marker).length, 2);
  const insertion = pendingPreviews
    .map(({ row }) =>
      JSON.stringify(row, null, 2)
        .split("\n")
        .map((line) => "    " + line)
        .join("\n"),
    )
    .join(",\n");
  const afterText = beforeText.replace(marker, ",\n" + insertion + marker);
  const after = JSON.parse(afterText);
  assert.equal(after.previews.length, 41);
  assert.deepEqual(after.previews.slice(0, 38), before.previews);
  assert.equal(
    afterText.replace(",\n" + insertion + marker, marker),
    beforeText,
  );
  for (const { thumbnail, thumbnailPath } of pendingPreviews)
    await writeFile(thumbnailPath, thumbnail, { flag: "wx" });
  await writeFile(indexPath, afterText);
  report.previews = pendingPreviews.map(({ row }) => row);
  report.indexAfterSha256 = sha(await readFile(indexPath));
  report.preservedRowsAndFilesExact = true;
  report.oldIndexTextExactOutsideInsertion = true;
  report.passed = true;
} catch (error) {
  report.failure = String(error.stack || error);
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  });
  await browser?.close();
  await server.close();
}
console.log(
  JSON.stringify(
    {
      passed: report.passed,
      previews: report.previews,
      index: rel(indexPath),
      report: rel(reportPath),
    },
    null,
    2,
  ),
);
