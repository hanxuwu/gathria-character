// Post-lazy-loading-fix production smoke; compares real review output with the full capture.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, resolve, relative } from "node:path";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { unzipSync } from "fflate";
const root = fileURLToPath(new URL("../", import.meta.url));
const evidence = resolve(
  root,
  process.env.KLING_REVIEW_WORKBENCH_DIR ||
    "docs/kling-review-workbench/evidence",
);
const out = join(evidence, "final-build-smoke");
await mkdir(out, { recursive: true });
assert(
  !existsSync(join(out, "smoke.json")),
  "Preserve completed smoke results.",
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const paths = execFileSync(
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
    "tsconfig.app.json",
  ],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const sourceHashes = Object.fromEntries(
  await Promise.all(
    paths.map(async (file) => [file, sha(await readFile(join(root, file)))]),
  ),
);
const original = JSON.parse(
  await readFile(join(evidence, "evidence-index.json"), "utf8"),
);
const changedSinceFullCapture = Object.keys({
  ...original.sourceHashes,
  ...sourceHashes,
}).filter((k) => original.sourceHashes[k] !== sourceHashes[k]);
assert.deepEqual(changedSinceFullCapture, ["src/wardrobe/WardrobeEditor.tsx"]);
const report = {
  format: "gathria-review-final-build-smoke",
  startedAt: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  sourceHashes,
  changedSinceFullCapture,
  productionHtmlSha256: sha(await readFile(join(root, "dist/workbench.html"))),
  errors: [],
  externalRequests: [],
  failedRequests: [],
  requests: [],
  checks: [],
};
const server = await preview({
    root,
    preview: { host: "127.0.0.1", port: 5206, strictPort: true },
  }),
  origin = "http://127.0.0.1:5206";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--disable-dev-shm-usage"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
page.on("pageerror", (e) => report.errors.push(String(e)));
page.on("request", (r) => {
  report.requests.push(r.url());
  if (/^https?:/.test(r.url()) && !r.url().startsWith(origin))
    report.externalRequests.push(r.url());
});
page.on("response", (r) => {
  if (r.status() >= 400 && !r.url().endsWith("/favicon.ico"))
    report.failedRequests.push({ url: r.url(), status: r.status() });
});
const p = page.locator("#wardrobe-panel"),
  button = (name) => p.getByRole("button", { name, exact: true });
async function ready(text) {
  await expect(p.getByRole("status")).toContainText(text, { timeout: 180000 });
  await expect(p.locator(".wardrobe-editor")).not.toHaveAttribute(
    "aria-busy",
    "true",
    { timeout: 180000 },
  );
  console.log("Ready", text);
}
async function outfit(name) {
  await p.getByLabel("Find an outfit", { exact: true }).fill(name);
  await button(name).click();
  await ready(name + " selected");
  await button("Clear outfit search").click();
}
try {
  await page.goto(origin + "/workbench.html?character=female&mode=wardrobe");
  await ready("Original outfit.");
  await outfit("Everyday smooth waist");
  await p.getByLabel("Hairstyle", { exact: true }).selectOption("ribbon-pony");
  await ready("Appearance updated");
  await button("Pin current look").click();
  await ready("Look pinned");
  await outfit("Wedding smooth waist");
  const pause = button("Pause wardrobe animation");
  if (await pause.count()) await pause.click();
  await p.getByLabel("Wardrobe action", { exact: true }).selectOption("run");
  await p.getByLabel("Wardrobe facing", { exact: true }).selectOption("right");
  await p.getByLabel("Wardrobe frame", { exact: true }).fill("4");
  report.requestsBeforeReview = report.requests.filter((url) =>
    /ReviewWorkbench|action-gif/.test(url),
  );
  assert.deepEqual(report.requestsBeforeReview, []);
  await button("Open look review").click();
  const r = p.getByRole("region", {
    name: "Look review workbench",
    exact: true,
  });
  await expect(
    r.getByRole("button", { name: "Export review notes", exact: true }),
  ).toBeEnabled();
  assert(report.requests.some((url) => /ReviewWorkbench/.test(url)));
  report.checks.push(
    "ReviewWorkbench/action GIF chunks were not requested until explicit review opening.",
  );
  await r
    .getByLabel("Review notes file", { exact: true })
    .setInputFiles(join(evidence, "female-notes.json"));
  await expect(r.getByTestId("review-status")).toContainText(
    "Review notes saved",
  );
  const event = page.waitForEvent("download", { timeout: 420000 });
  event.catch(() => {});
  await r
    .getByRole("button", { name: "Export review bundle", exact: true })
    .click();
  const progress = setInterval(() => {
    void r
      .getByTestId("review-status")
      .textContent()
      .then((text) => console.log(text))
      .catch(() => {});
  }, 20000);
  let download;
  try {
    download = await event;
  } finally {
    clearInterval(progress);
  }
  assert.equal(await download.failure(), null);
  const target = join(out, "female-run-review.zip");
  await download.saveAs(target);
  const raw = await readFile(target);
  const actual = unzipSync(raw),
    baselinePath = join(evidence, "female-run-review.zip"),
    baselineBytes = await readFile(baselinePath),
    baseline = unzipSync(baselineBytes);
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(baseline).sort());
  report.files = [];
  for (const [name, bytes] of Object.entries(actual)) {
    assert.equal(sha(bytes), sha(baseline[name]), name);
    report.files.push({
      file: name,
      bytes: bytes.length,
      sha256: sha(bytes),
      exactToFullCapture: true,
    });
  }
  report.bundle = {
    file: relative(root, target),
    sha256: sha(raw),
    baseline: relative(root, baselinePath),
    baselineSha256: sha(baselineBytes),
  };
  report.checks.push(
    "All review ZIP file bytes, including notes, scan metrics, manifest and every actual PNG page, match the full pre-lazy-fix capture exactly.",
  );
  await r.screenshot({ path: join(out, "female-final-review.png") });
  for (const k of ["errors", "externalRequests", "failedRequests"])
    assert.deepEqual(report[k], []);
  report.passed = true;
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(out, "smoke.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    "Final production lazy-entry smoke passed with exact review output.",
  );
} catch (error) {
  report.failure = String(error);
  await writeFile(
    join(out, "failed.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await page
    .screenshot({ path: join(out, "failure.png"), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
