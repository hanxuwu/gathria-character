// Production UI exports. Paint replay uses existing reviewed pixels, never new art.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { unzipSync } from "fflate";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = resolve(
  root,
  process.env.KLING_PAINT_REVIEW_DIR || "docs/kling-paint-roundtrip/evidence",
);
const temp = resolve(
  root,
  process.env.KLING_PAINT_TEMP || ".review-tmp/kling-paint-roundtrip",
);
await mkdir(out, { recursive: true });
await mkdir(temp, { recursive: true });
assert(
  !existsSync(join(out, "capture.json")),
  "Use a fresh evidence directory.",
);
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  rel = (p) => relative(root, p);
const cases = JSON.parse(
  await readFile(join(root, "docs/kling-paint-roundtrip/cases.json"), "utf8"),
);
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const report = {
  format: "gathria-paint-roundtrip-evidence",
  version: 1,
  production: true,
  startedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  cases: [],
  downloads: [],
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
      ],
      { cwd: root, encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean)
      .map(async (f) => [f, sha(await readFile(join(root, f)))]),
  ),
);
report.productionHtmlSha256 = sha(
  await readFile(join(root, "dist/workbench.html")),
);
const server = await preview({
    root,
    preview: { host: "127.0.0.1", port: 5213, strictPort: true },
  }),
  origin = "http://127.0.0.1:5213";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--disable-dev-shm-usage"],
});
const pnel = (p) => p.locator("#wardrobe-panel");
const btn = (p, name) =>
  p.getByRole("button", { name, exact: typeof name === "string" });
function watch(ctx, independent = false) {
  ctx.on("page", (p) =>
    p.on("pageerror", (e) => report.errors.push(String(e))),
  );
  ctx.on("response", (r) => {
    if (r.status() >= 400 && !r.url().endsWith("/favicon.ico"))
      report.failedRequests.push({ url: r.url(), status: r.status() });
  });
  ctx.on("request", (r) => {
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
  await expect(pnel(p).getByRole("status")).toContainText(text, {
    timeout: 180000,
  });
  await expect(pnel(p).locator(".wardrobe-editor")).not.toHaveAttribute(
    "aria-busy",
    "true",
    { timeout: 180000 },
  );
  assert.deepEqual(await pnel(p).getByRole("alert").allTextContents(), []);
  console.log("Ready", text);
}
async function select(p, label, value, message) {
  if (
    (await pnel(p).getByLabel(label, { exact: true }).inputValue()) !== value
  ) {
    await pnel(p).getByLabel(label, { exact: true }).selectOption(value);
    if (message) await ready(p, message);
  }
}
async function pose(p, action, facing = "right", position = 0) {
  const stop = btn(p, "Pause wardrobe animation");
  if (await stop.count()) await stop.click();
  await select(p, "Wardrobe action", action);
  await select(p, "Wardrobe facing", facing);
  await pnel(p)
    .getByLabel("Wardrobe frame", { exact: true })
    .fill(String(position));
  await expect(pnel(p).getByTestId("wardrobe-preview")).toHaveAttribute(
    "data-frame-position",
    String(position),
  );
  await expect(pnel(p).getByTestId("wardrobe-preview")).toHaveAttribute(
    "data-rendered-action",
    action,
  );
}
async function snapshot(p) {
  return sha(
    await pnel(p)
      .getByTestId("wardrobe-preview")
      .evaluate((c) => c.toDataURL()),
  );
}
async function download(p, label, name, meta = {}, temporary = false) {
  const path = join(temporary ? temp : out, name);
  assert(!existsSync(path), `Preserve ${path}`);
  const wait = p.waitForEvent("download", { timeout: 180000 });
  wait.catch(() => {});
  await btn(p, label).click();
  const d = await wait;
  assert.equal(await d.failure(), null);
  await d.saveAs(path);
  const bytes = await readFile(path),
    r = {
      file: rel(path),
      bytes: bytes.length,
      sha256: sha(bytes),
      temporary,
      ...meta,
    };
  report.downloads.push(r);
  await writeFile(join(out, "progress.json"), JSON.stringify(report, null, 2));
  console.log("Exported", name);
  return { path, bytes, record: r };
}
let active;
const timer = setTimeout(
  () => {
    console.error("Capture exceeded 30 minutes");
    void browser.close();
  },
  30 * 60 * 1000,
);
try {
  for (const c of cases) {
    console.log("Preparing", c.key);
    const ctx = await browser.newContext({
      viewport: { width: 1400, height: 1000 },
      acceptDownloads: true,
    });
    watch(ctx);
    const p = await ctx.newPage();
    active = p;
    await p.goto(
      `${origin}/workbench.html?character=${c.character}&mode=wardrobe`,
    );
    await ready(p, "Original outfit.");
    await pnel(p).getByLabel("Find an outfit", { exact: true }).fill(c.preset);
    await btn(p, c.preset).click();
    await ready(p, c.preset + " selected");
    await btn(p, "Clear outfit search").click();
    if (c.base)
      await select(
        p,
        c.slot === "top" ? "Top" : "Dress / one-piece",
        c.base,
        "Outfit updated",
      );
    await select(p, "Hairstyle", c.hair, "Appearance updated");
    await select(p, "Hair color", c.color, "Appearance updated");
    await select(p, "Face", c.face, "Appearance updated");
    const before = await download(
      p,
      "Export CharacterPack",
      `${c.key}-before.character.zip`,
      { key: c.key, kind: "pack", stage: "before" },
    );
    await ready(p, "CharacterPack exported");
    const manifest = JSON.parse(
      Buffer.from(unzipSync(before.bytes)["manifest.json"]),
    );
    report.packs.push({ ...before.record, manifest });
    const position = manifest.animations.run.frames.indexOf(c.frameId);
    assert(position >= 0);
    await pose(p, "run", "right", position);
    const accepted = await snapshot(p);
    await btn(p, "Pin current look").click();
    await ready(p, "Look pinned");
    await pnel(p)
      .locator("summary")
      .filter({ hasText: "Fitting guides" })
      .click();
    const currentId = await pnel(p)
      .getByLabel(c.slot === "top" ? "Top" : "Dress / one-piece", {
        exact: true,
      })
      .inputValue();
    await pnel(p)
      .getByLabel("Recipe clothing", { exact: true })
      .selectOption(currentId);
    await pnel(p).getByLabel("Inspect clothing layer", { exact: true }).check();
    const kit = await download(
      p,
      "Download neighboring poses for painting",
      `${c.key}-kit.zip`,
      { key: c.key, kind: "kit" },
      true,
    );
    const edited = join(temp, `${c.key}-painted.zip`),
      newId = `${c.key}-browser-roundtrip-v1`;
    const replay = JSON.parse(
      execFileSync(
        process.env.KLING_PYTHON || "/tmp/kling-polish-venv/bin/python",
        [
          "scripts/prepare-kling-paint-replay.py",
          kit.path,
          edited,
          "--id",
          newId,
          ...(c.donor ? ["--donor", join(root, c.donor)] : []),
        ],
        { cwd: root, encoding: "utf8" },
      ),
    );
    const beforeImport = Date.now();
    await pnel(p)
      .getByLabel("Painted pose kit file", { exact: true })
      .setInputFiles(edited);
    const d = p.getByRole("dialog", {
      name: "Preview imported clothing",
      exact: true,
    });
    await expect(d).toBeVisible({ timeout: 180000 });
    const importMs = Date.now() - beforeImport;
    assert.equal(await snapshot(p), accepted);
    await d.screenshot({ path: join(out, `${c.key}-candidate.png`) });
    const material = await download(
      p,
      "Save painted clothing",
      `${c.key}.garment.zip`,
      { key: c.key, kind: "material" },
    );
    const audit = await download(
      p,
      "Save painting report",
      `${c.key}-paint-report.json`,
      { key: c.key, kind: "paint-report" },
    );
    const reportData = JSON.parse(audit.bytes);
    assert.equal(reportData.output.sha256, sha(material.bytes));
    await btn(d, "Apply clothing candidate").click();
    await expect(d).toHaveCount(0, { timeout: 180000 });
    await ready(p, "Clothing candidate applied");
    const afterPixels = await snapshot(p);
    if (c.donor) assert.notEqual(afterPixels, accepted);
    else assert.equal(afterPixels, accepted);
    const after = await download(
      p,
      "Export CharacterPack",
      `${c.key}-after.character.zip`,
      { key: c.key, kind: "pack", stage: "after" },
    );
    await ready(p, "CharacterPack exported");
    const afterManifest = JSON.parse(
      Buffer.from(unzipSync(after.bytes)["manifest.json"]),
    );
    assert.deepEqual(afterManifest.animations, manifest.animations);
    assert.deepEqual(afterManifest.anchor, manifest.anchor);
    report.packs.push({ ...after.record, manifest: afterManifest });
    await btn(p, "Open look review").click();
    const motion = pnel(p).getByRole("region", {
      name: "Motion continuity review",
      exact: true,
    });
    const scans = [];
    for (const facing of ["right", "left"]) {
      await pose(p, "run", facing, position);
      const started = Date.now();
      await btn(motion, "Check motion transitions").click();
      await expect(motion.getByTestId("motion-review-status")).toContainText(
        "Transitions checked",
        { timeout: 180000 },
      );
      scans.push({ facing, elapsedMs: Date.now() - started });
      await motion
        .getByLabel("Motion transition", { exact: true })
        .selectOption(String(Math.max(0, position - 1)));
      await download(
        p,
        "Export motion evidence",
        `${c.key}-run-${facing}.motion-review.zip`,
        { key: c.key, kind: "motion-bundle", facing, action: "run" },
      );
      if (facing === "right")
        await motion.screenshot({ path: join(out, `${c.key}-motion.png`) });
    }
    await btn(p, "Close look review").click();
    for (const action of actions) {
      await pose(p, action, "right", 0);
      await download(p, "Save current PNG", `${c.key}-${action}.png`, {
        key: c.key,
        kind: "frame",
        frameId: manifest.animations[action].frames[0],
        action,
        facing: "right",
      });
    }
    for (const facing of ["right", "left"]) {
      await pose(p, "jump", facing, 0);
      await download(
        p,
        "Download look comparison GIF",
        `${c.key}-jump-${facing}-comparison.gif`,
        { key: c.key, kind: "comparison-gif", action: "jump", facing },
      );
    }
    const saved = await download(
      p,
      /^Save wardrobe/,
      `${c.key}.wardrobe.zip`,
      { key: c.key, kind: "project" },
      true,
    );
    await ready(p, "Wardrobe project saved");
    await btn(p, "Undo styling").click();
    await ready(p, "Styling change undone");
    await pose(p, "run", "right", position);
    assert.equal(await snapshot(p), accepted);
    await pnel(p)
      .getByLabel("Open wardrobe project file", { exact: true })
      .setInputFiles(saved.path);
    await ready(p, "Saved outfit and action settings restored");
    await pose(p, "run", "right", position);
    assert.equal(await snapshot(p), afterPixels);
    // An independent full outfit remains editable after the imported revision.
    const newBottom =
      c.character === "male"
        ? c.key === "male-day"
          ? "navy-suit-trousers-v1"
          : "ochre-chinos-v1"
        : null;
    if (newBottom) {
      await select(p, "Bottom", newBottom, "Outfit updated");
      await btn(p, "Undo styling").click();
      await ready(p, "Styling change undone");
    }
    await p.setViewportSize({ width: 390, height: 844 });
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await p.screenshot({
      path: join(out, `${c.key}-mobile.png`),
      fullPage: true,
    });
    report.cases.push({
      ...c,
      currentId,
      newId,
      position,
      importMs,
      scans,
      replay,
      paintedInputSha256: sha(await readFile(edited)),
      sourceKitSha256: sha(kit.bytes),
      identityRoundtrip: !c.donor,
      saveReopenExact: true,
      undoExact: true,
      sharedAnchorsAndTiming: true,
    });
    await ctx.close();
  }
  report.editorsClosedAt = new Date().toISOString();
  for (const pack of report.packs.filter((p) => p.stage === "after")) {
    const ctx = await browser.newContext({
      viewport: { width: 1100, height: 850 },
    });
    watch(ctx, true);
    const p = await ctx.newPage();
    active = p;
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
        const pause = btn(p, "Pause animation");
        if (await pause.count()) await pause.click();
        await btn(p, action[0].toUpperCase() + action.slice(1)).click();
        await btn(p, facing[0].toUpperCase() + facing.slice(1)).click();
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
        const observed = await p.evaluate(async (ms) => {
          const canvas = document.querySelector(
              '[data-testid="consumer-canvas"]',
            ),
            rows = [];
          let previous = "";
          const sample = () => {
            const key =
              canvas.dataset.action + "/" + canvas.dataset.framePosition;
            if (key !== previous) {
              rows.push({
                action: canvas.dataset.action,
                position: Number(canvas.dataset.framePosition),
                frameId: Number(canvas.dataset.frameId),
              });
              previous = key;
            }
          };
          const ob = new MutationObserver(sample);
          ob.observe(canvas, { attributes: true });
          sample();
          document.querySelector('[aria-label="Play animation"]').click();
          await new Promise((r) => setTimeout(r, ms));
          sample();
          ob.disconnect();
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
          key: pack.key,
          action,
          facing,
          durationMs: duration,
          observed,
        });
      }
    await p.screenshot({
      path: join(out, `${pack.key}-independent.png`),
      fullPage: true,
    });
    await ctx.close();
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
    join(out, "capture.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Production painting and motion review passed.");
} catch (error) {
  await writeFile(
    join(out, "failure.json"),
    JSON.stringify({ ...report, error: String(error) }, null, 2),
  );
  await active
    ?.screenshot({ path: join(out, "failure.png"), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  clearTimeout(timer);
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
