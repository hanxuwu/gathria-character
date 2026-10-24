// Diagnose the completed capture's favicon-only console failure, then verify
// the enlarged inspector in the final production UI. Preserve the raw attempt.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url)),
  folder = join(root, "docs/kling-pose-review/evidence");
const raw = await readFile(join(folder, "failed-attempt.json")),
  report = JSON.parse(raw);
assert.equal(report.outfits.length, 4);
assert.equal(report.playback.length, 40);
assert.equal(report.errors.length, 1);
assert.equal(
  report.errors[0],
  "Failed to load resource: the server responded with a status of 404 (Not Found)",
);
assert.deepEqual(report.failedRequests, []);
assert.deepEqual(report.externalRequests, []);
assert.deepEqual(report.forbiddenIndependentRequests, []);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const server = await preview({
  root,
  preview: { host: "127.0.0.1", port: 5198, strictPort: true },
});
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/chromium",
  args: ["--disable-dev-shm-usage"],
});
const resume = process.env.POSE_FINISH_RESUME === "1";
const saved = resume
  ? JSON.parse(await readFile(join(folder, "inspector-progress.json")))
  : { pages: [], errors: [], responses: [] };
if (resume)
  assert.equal(
    sha(await readFile(join(root, "dist/workbench.html"))),
    JSON.parse(
      await readFile(join(root, "docs/kling-pose-review/test-results.json")),
    ).productionHtmlSha256,
  );
const origin = "http://127.0.0.1:5198",
  errors = saved.errors,
  responses = saved.responses,
  pages = saved.pages;
try {
  for (const character of ["male", "female"].filter(
    (c) => !pages.some((p) => p.character === c),
  )) {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      page = await context.newPage();
    page.on("pageerror", (e) =>
      errors.push({ text: String(e), url: "pageerror" }),
    );
    page.on("console", (m) => {
      if (m.type() === "error")
        errors.push({ text: m.text(), url: m.location().url });
    });
    page.on("response", (r) => {
      if (r.status() >= 400)
        responses.push({ url: r.url(), status: r.status() });
    });
    await page.goto(
      origin + `/workbench.html?character=${character}&mode=wardrobe`,
    );
    const p = page.locator("#wardrobe-panel");
    await expect(p.getByRole("status")).toContainText("Original outfit.", {
      timeout: 180000,
    });
    const project = report.outfits.find(
      (r) => r.character === character && r.look === "wedding",
    ).project.file;
    await p
      .getByLabel("Open wardrobe project file", { exact: true })
      .setInputFiles(project);
    await expect(p.getByRole("status")).toContainText(
      "Saved outfit and action settings restored",
      { timeout: 180000 },
    );
    await p
      .getByLabel("Wardrobe action", { exact: true })
      .selectOption(character === "male" ? "run" : "jump");
    await p
      .getByLabel("Wardrobe facing", { exact: true })
      .selectOption("right");
    await p
      .getByLabel("Wardrobe frame", { exact: true })
      .fill(character === "male" ? "5" : "3");
    const fid = character === "male" ? 56 : 86;
    await expect(p.getByTestId("wardrobe-preview")).toHaveAttribute(
      "data-rendered-frame-id",
      String(fid),
    );
    const current = await p
      .getByTestId("wardrobe-preview")
      .evaluate(async (c) => {
        const a = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        return [...new Uint8Array(await crypto.subtle.digest("SHA-256", a))]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
      });
    const png = await readFile(
      join(folder, `${character}-wedding-after-${fid}-right.png`),
    );
    // Compare after the browser's alpha premultiplication in BOTH paths. Raw
    // PNG RGB under fractional alpha is not byte-identical to canvas readback.
    const expected = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
    }, png.toString("base64"));
    assert.equal(current, expected);
    await p.locator("summary").filter({ hasText: "Fitting guides" }).click();
    await p.getByLabel("Inspect clothing layer", { exact: true }).check();
    await p
      .getByRole("button", { name: "Open larger comparison", exact: true })
      .click();
    const dialog = p.getByRole("dialog", { name: "Adjacent clothing poses" });
    await expect(dialog).toBeVisible();
    const origins = await dialog.locator("canvas").evaluateAll((cs) =>
      cs.map((c) => ({
        x: c.dataset.cropX,
        y: c.dataset.cropY,
        width: c.width,
        height: c.height,
      })),
    );
    assert(
      origins.length === 3 &&
        origins.every((o) => JSON.stringify(o) === JSON.stringify(origins[0])),
    );
    await dialog.screenshot({
      path: join(folder, `${character}-large-neighbors.png`),
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(
      p.getByRole("button", { name: "Open larger comparison", exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: join(folder, `${character}-wedding-final-workbench.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await p
      .getByRole("button", { name: "Open larger comparison", exact: true })
      .click();
    await expect(dialog).toBeVisible();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: join(folder, `${character}-large-neighbors-mobile.png`),
    });
    pages.push({
      character,
      frameId: fid,
      rgbaSha256: current,
      pixelsMatchOriginalAppExport: true,
      sharedCrop: origins[0],
      dialogKeyboardAndMobileChecked: true,
    });
    await context.close();
    await writeFile(
      join(folder, "inspector-progress.json"),
      JSON.stringify({ pages, errors, responses }, null, 2) + "\n",
    );
  }
  // The browser does not always request its default icon automatically. Probe
  // that exact, previously excluded URL explicitly and retain its location.
  const iconPage = await browser.newPage();
  iconPage.on("console", (m) => {
    if (m.type() === "error")
      errors.push({ text: m.text(), url: m.location().url });
  });
  iconPage.on("response", (r) => {
    if (r.status() >= 400) responses.push({ url: r.url(), status: r.status() });
  });
  await iconPage.goto(origin + "/player.html");
  const iconStatus = await iconPage.evaluate(
    async () => (await fetch("/favicon.ico")).status,
  );
  assert.equal(iconStatus, 404);
  const direct = await iconPage.request.get(origin + "/favicon.ico");
  assert.equal(direct.status(), 404);
  responses.push({
    url: direct.url(),
    status: direct.status(),
    via: "explicit HTTP probe",
  });
  await iconPage.close();
  assert.equal(pages.length, 2);
  assert(responses.length > 0);
  assert(
    responses.every(
      (r) => r.status === 404 && new URL(r.url).pathname === "/favicon.ico",
    ),
  );
  assert(errors.length > 0);
  assert(
    errors.every(
      (e) =>
        e.text ===
          "Failed to load resource: the server responded with a status of 404 (Not Found)" &&
        new URL(e.url).pathname === "/favicon.ico",
    ),
  );
  const resolution = {
    rawAttemptSha256: sha(raw),
    cause:
      "Production server has no browser-requested /favicon.ico. The original harness excluded this URL from response failures but still counted its console message. Verified explicitly by URL in a fresh context; no application resource failures.",
    observedConsole: errors,
    observedResponses: responses,
    originalFailurePreserved: true,
    originalFailure: report.failure,
  };
  report.harnessResolution = resolution;
  report.finalInspectorReview = {
    codeCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    workbenchHtmlSha256: sha(await readFile(join(root, "dist/workbench.html"))),
    pages,
  };
  delete report.failure;
  report.applicationErrors = [];
  report.passed = true;
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(folder, "evidence-index.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      applicationChecksPassed: true,
      independentPlaybackChecks: report.playback.length,
      enlargedInspectorChecks: pages.length,
      knownNonApplicationFavicon404: responses.length,
    }),
  );
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
