// Production UI evidence; no fixtures and no manufactured artwork.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { unzipSync } from "fflate";
import { parseGIF, decompressFrames } from "gifuct-js";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = resolve(
  root,
  process.env.KLING_REVIEW_WORKBENCH_DIR ||
    "docs/kling-review-workbench/evidence",
);
const temp = resolve(
  root,
  process.env.KLING_REVIEW_TEMP || ".review-tmp/kling-review-workbench",
);
await mkdir(out, { recursive: true });
await mkdir(temp, { recursive: true });
assert(
  !existsSync(join(out, "evidence-index.json")),
  "Preserve completed evidence; choose a fresh directory.",
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => relative(root, p).replaceAll("\\", "/");
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const report = {
  format: "gathria-review-workbench-evidence",
  version: 1,
  production: true,
  startedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  downloads: [],
  cases: [],
  packs: [],
  playback: [],
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
        "tsconfig.app.json",
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
const server = await preview({
  root,
  preview: { host: "127.0.0.1", port: 5204, strictPort: true },
});
const origin = "http://127.0.0.1:5204";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--disable-dev-shm-usage"],
});
const panel = (p) => p.locator("#wardrobe-panel");
const review = (p) =>
  panel(p).getByRole("region", { name: "Look review workbench", exact: true });
const button = (p, name) =>
  panel(p).getByRole("button", { name, exact: typeof name === "string" });
function watch(context, independent = false) {
  context.on("page", (p) =>
    p.on("pageerror", (e) => report.errors.push(String(e))),
  );
  context.on("response", (r) => {
    if (r.status() >= 400 && !r.url().endsWith("/favicon.ico"))
      report.failedRequests.push({ url: r.url(), status: r.status() });
  });
  context.on("request", (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(origin))
      report.externalRequests.push(r.url());
    if (
      independent &&
      /WardrobeEditor|SpriteActionEditor|\/src\/(wardrobe|appearance|skeletal)\//.test(
        r.url(),
      )
    )
      report.independentEditorRequests.push(r.url());
  });
}
async function ready(p, text) {
  await expect(panel(p).getByRole("status")).toContainText(text, {
    timeout: 180000,
  });
  await expect(panel(p).locator(".wardrobe-editor")).not.toHaveAttribute(
    "aria-busy",
    "true",
    { timeout: 180000 },
  );
  assert.deepEqual(await panel(p).getByRole("alert").allTextContents(), []);
  console.log("Ready", text);
}
async function outfit(p, name) {
  await panel(p).getByLabel("Find an outfit", { exact: true }).fill(name);
  await button(p, name).click();
  await ready(p, name + " selected");
  await button(p, "Clear outfit search").click();
}
async function pose(p, action, facing = "right", position = 0) {
  const pause = button(p, "Pause wardrobe animation");
  if (await pause.count()) await pause.click();
  await panel(p)
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption(action);
  await panel(p)
    .getByLabel("Wardrobe facing", { exact: true })
    .selectOption(facing);
  await panel(p)
    .getByLabel("Wardrobe frame", { exact: true })
    .fill(String(position));
}
async function download(p, label, file, metadata = {}, temporary = false) {
  const path = join(temporary ? temp : out, file);
  assert(!existsSync(path), `Preserve existing download ${path}`);
  const event = p.waitForEvent("download", { timeout: 420000 });
  event.catch(() => {});
  await button(p, label).click();
  const progress = setInterval(() => {
    void Promise.all([
      panel(p).getByRole("status").textContent(),
      review(p).getByTestId("review-status").textContent(),
    ])
      .then((lines) => console.log("Preparing", file, lines.join(" / ")))
      .catch(() => {});
  }, 20000);
  let d;
  try {
    d = await event;
  } finally {
    clearInterval(progress);
  }
  assert.equal(await d.failure(), null);
  await d.saveAs(path);
  const bytes = await readFile(path);
  assert(bytes.length);
  const record = {
    file: rel(path),
    bytes: bytes.length,
    sha256: sha(bytes),
    temporary,
    ...metadata,
  };
  report.downloads.push(record);
  await writeFile(
    join(out, "download-progress.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Downloaded", file);
  return { bytes, path, record };
}
async function notes(p, file, metadata = {}) {
  const d = await download(p, "Export review notes", file, {
    kind: "review-notes",
    ...metadata,
  });
  return { ...d, document: JSON.parse(d.bytes) };
}
async function savedPixels(p) {
  return panel(p)
    .getByTestId("wardrobe-preview")
    .evaluate((c) => c.toDataURL());
}
let activePage;
try {
  for (const character of ["male", "female"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    watch(context);
    const p = await context.newPage();
    activePage = p;
    p.setDefaultTimeout(30000);
    await p.goto(
      `${origin}/workbench.html?character=${character}&mode=wardrobe`,
    );
    await ready(p, "Original outfit.");
    const day =
      character === "male" ? "Everyday soft cuff" : "Everyday smooth waist";
    const wedding =
      character === "male" ? "Wedding curved cuff" : "Wedding smooth waist";
    await outfit(p, day);
    await panel(p)
      .getByLabel("Hairstyle", { exact: true })
      .selectOption(character === "male" ? "airy-tousle" : "ribbon-pony");
    await ready(p, "Appearance updated");
    await button(p, "Pin current look").click();
    await ready(p, "Look pinned");
    await outfit(p, wedding);
    await pose(p, "run", "right", 4);
    const before = await savedPixels(p);
    await button(p, "Open look review").click();
    const r = review(p);
    await expect(
      r.getByRole("button", { name: "Export review notes", exact: true }),
    ).toBeEnabled();
    await r.getByLabel("Review region", { exact: true }).selectOption("hands");
    for (const mode of ["split", "overlay", "difference"]) {
      await r.getByLabel("Review mode", { exact: true }).selectOption(mode);
      await expect(r.locator("canvas")).toHaveAttribute("data-mode", mode);
      assert.equal(await savedPixels(p), before);
      await r.screenshot({ path: join(out, `${character}-${mode}.png`) });
    }
    await r.getByLabel("Review region", { exact: true }).selectOption("full");
    await r
      .getByRole("button", { name: "Scan current action", exact: true })
      .click();
    await expect(
      r.getByRole("button", { name: /Review pose .* at / }).first(),
    ).toBeVisible({ timeout: 180000 });
    await r
      .getByLabel("Review note", { exact: true })
      .fill(
        character === "male"
          ? "Inspect the existing sleeve/underarm edge at this running pose; diagnostic differences are not a defect score."
          : "Inspect the existing inner-arm/waist boundary and rear-hair edge at this running pose; no artwork repair claimed.",
      );
    await r
      .getByLabel("Issue severity", { exact: true })
      .selectOption("problem");
    await r
      .getByRole("button", { name: "Add review issue", exact: true })
      .click();
    const n = await notes(p, `${character}-notes.json`, { character });
    assert.equal(n.document.issues.length, 1);
    assert.equal(n.document.issues[0].action, "run");
    const b = await download(
      p,
      "Export review bundle",
      `${character}-run-review.zip`,
      { kind: "review-bundle", character, action: "run", facing: "right" },
    );
    const files = unzipSync(b.bytes);
    assert(Object.keys(files).some((f) => f.endsWith(".png")));
    assert(Object.keys(files).some((f) => f.endsWith(".json")));
    // Test that a source/selection mismatch is rejected atomically, without importing it.
    const bad = structuredClone(n.document);
    bad.binding.lookSha256 = "0".repeat(64);
    await r.getByLabel("Review notes file", { exact: true }).setInputFiles({
      name: "wrong-look.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(bad)),
    });
    await expect(r.getByTestId("review-status")).toContainText(
      "Could not import review notes",
    );
    const retained = await notes(p, `${character}-after-rejected-import.json`, {
      character,
    });
    assert.deepEqual(retained.document, n.document);
    // A valid import is the documented recovery; it replaces no artwork.
    await r
      .getByLabel("Review notes file", { exact: true })
      .setInputFiles(n.path);
    await expect(r.getByTestId("review-status")).toContainText(
      "Review notes saved",
    );
    assert.equal(await savedPixels(p), before);
    for (const action of ["run", "jump"])
      for (const facing of ["right", "left"]) {
        await pose(p, action, facing, 0);
        const d = await download(
          p,
          "Download look comparison GIF",
          `${character}-${action}-${facing}.gif`,
          { kind: "comparison-gif", character, action, facing },
        );
        await ready(p, "Look comparison GIF saved");
        const parsed = parseGIF(new Uint8Array(d.bytes).buffer),
          frames = decompressFrames(parsed, true);
        assert(frames.length > 1);
        d.record.frames = frames.length;
        d.record.durationsMs = frames.map((f) => f.delay);
        d.record.loop = parsed.frames.some(
          (f) => f.application?.id === "NETSCAPE2.0",
        );
        assert.equal(d.record.loop, action !== "jump");
      }
    await pose(p, "jump", "left", 4);
    await r
      .getByRole("button", { name: "Scan current action", exact: true })
      .click();
    await expect(
      r.getByRole("button", { name: /Review pose .* at / }).first(),
    ).toBeVisible({ timeout: 180000 });
    await download(
      p,
      "Export review bundle",
      `${character}-jump-left-review.zip`,
      { kind: "review-bundle", character, action: "jump", facing: "left" },
    );
    const packed = await download(
      p,
      "Export CharacterPack",
      `${character}-wedding.character.zip`,
      { kind: "pack", character },
      true,
    );
    await ready(p, "CharacterPack exported");
    const oldPath = join(
        root,
        "docs/kling-look-workflow/evidence",
        `${character}-wedding.character.zip`,
      ),
      old = await readFile(oldPath);
    assert.equal(sha(packed.bytes), sha(old));
    const pf = unzipSync(packed.bytes),
      manifest = JSON.parse(Buffer.from(pf["manifest.json"]));
    report.packs.push({
      ...packed.record,
      character,
      manifest,
      baseline: rel(oldPath),
      baselineSha256: sha(old),
      exactZipBytes: true,
    });
    await p.screenshot({
      path: join(out, `${character}-desktop.png`),
      fullPage: true,
    });
    await p.setViewportSize({ width: 390, height: 844 });
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await p.screenshot({
      path: join(out, `${character}-mobile.png`),
      fullPage: true,
    });
    report.cases.push({
      character,
      checks: [
        "All three diagnostic views leave current exported pixels unchanged.",
        "Exact-look review notes survive invalid import without alteration.",
        "Run and one-shot jump review bundles use actual application output.",
        "Current CharacterPack ZIP is byte-for-byte identical to merged baseline.",
        "Mobile view has no horizontal overflow.",
      ],
    });
    await context.close();
  }
  report.editorsClosedAt = new Date().toISOString();
  for (const pack of report.packs) {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 850 },
    });
    watch(context, true);
    const p = await context.newPage();
    activePage = p;
    await p.route(
      /WardrobeEditor|SpriteActionEditor|action-gif|\/src\/(wardrobe|appearance|skeletal)\//,
      (r) => r.abort(),
    );
    await p.goto(origin + "/player.html");
    await p.locator("#player-zip").setInputFiles(join(root, pack.file));
    await expect(p.getByRole("status")).toContainText("Loaded:", {
      timeout: 180000,
    });
    for (const action of actions)
      for (const facing of ["right", "left"]) {
        const pause = p.getByRole("button", {
          name: "Pause animation",
          exact: true,
        });
        if (await pause.count()) await pause.click();
        await p
          .getByRole("button", {
            name: action[0].toUpperCase() + action.slice(1),
            exact: true,
          })
          .click();
        await p
          .getByRole("button", {
            name: facing[0].toUpperCase() + facing.slice(1),
            exact: true,
          })
          .click();
        await p.getByLabel("Playback speed", { exact: true }).selectOption("1");
        await p
          .getByLabel("Display scale", { exact: true })
          .selectOption("0.5");
        await p.locator("#player-frame").fill("0");
        const clip = pack.manifest.animations[action],
          duration = Math.ceil(
            ((clip.frames.length * 1000) / clip.fps) * (clip.loop ? 2.1 : 1) +
              300,
          );
        const observed = await p.evaluate(async (duration) => {
          const c = document.querySelector('[data-testid="consumer-canvas"]'),
            rows = [];
          let previous = "";
          const sample = () => {
            const key = c.dataset.action + "/" + c.dataset.framePosition;
            if (key !== previous) {
              rows.push({
                action: c.dataset.action,
                position: Number(c.dataset.framePosition),
                frameId: Number(c.dataset.frameId),
              });
              previous = key;
            }
          };
          const observer = new MutationObserver(sample);
          observer.observe(c, { attributes: true });
          sample();
          document.querySelector('[aria-label="Play animation"]').click();
          await new Promise((r) => setTimeout(r, duration));
          sample();
          observer.disconnect();
          document.querySelector('[aria-label="Pause animation"]')?.click();
          return rows;
        }, duration);
        for (const o of observed)
          assert.equal(
            o.frameId,
            pack.manifest.animations[o.action].frames[o.position],
          );
        const relevant = observed.filter((o) => o.action === action);
        assert(
          new Set(relevant.map((o) => o.position)).size >=
            Math.min(3, clip.frames.length),
        );
        if (clip.loop)
          assert(
            relevant.some((o, i) => i && o.position < relevant[i - 1].position),
          );
        else assert(observed.some((o) => o.action === "idle"));
        report.playback.push({
          character: pack.character,
          action,
          facing,
          durationMs: duration,
          observed,
        });
      }
    await p.screenshot({
      path: join(out, `${pack.character}-independent.png`),
      fullPage: true,
    });
    await context.close();
  }
  for (const key of [
    "errors",
    "failedRequests",
    "externalRequests",
    "independentEditorRequests",
  ])
    assert.deepEqual(report[key], []);
  report.passed = true;
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(out, "evidence-index.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Production review, exports and independent player passed.");
} catch (error) {
  report.failure = String(error);
  await writeFile(
    join(out, "failed-attempt.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  if (activePage && !activePage.isClosed())
    await activePage
      .screenshot({ path: join(out, "failure.png"), fullPage: true })
      .catch(() => {});
  throw error;
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
