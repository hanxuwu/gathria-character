// Production UI only. Saved media remain the app's own downloads.
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
  process.env.KLING_LOOK_REVIEW_DIR || "docs/kling-look-workflow/evidence",
);
const temp = resolve(
  root,
  process.env.KLING_REVIEW_TEMP || ".review-tmp/kling-look-workflow",
);
await mkdir(out, { recursive: true });
await mkdir(temp, { recursive: true });
assert(
  !existsSync(join(out, "evidence-index.json")),
  "Keep completed evidence; choose a fresh directory.",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path).replaceAll("\\", "/");
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const report = {
  format: "gathria-look-workflow-evidence",
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
const server = await preview({
  root,
  preview: { host: "127.0.0.1", port: 5202, strictPort: true },
});
const origin = "http://127.0.0.1:5202";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--disable-dev-shm-usage"],
});
const panel = (page) => page.locator("#wardrobe-panel");
const button = (page, name) =>
  panel(page).getByRole("button", { name, exact: typeof name === "string" });
const canvas = (page) => panel(page).getByTestId("wardrobe-preview");
const comparison = (page) =>
  panel(page).getByRole("img", {
    name: "Pinned and current looks at the same pose",
    exact: true,
  });
function watch(context, independent = false) {
  context.on("page", (page) =>
    page.on("pageerror", (e) => report.errors.push(String(e))),
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
async function ready(page, text) {
  await page.waitForFunction(
    (text) => {
      const p = document.querySelector("#wardrobe-panel");
      return (
        p.querySelector("[role=alert]") ||
        (p.querySelector("[role=status]").textContent.includes(text) &&
          !p
            .querySelector(".wardrobe-editor")
            .getAttribute("aria-busy")
            .includes("true"))
      );
    },
    text,
    { timeout: 180000 },
  );
  assert.deepEqual(await panel(page).getByRole("alert").allTextContents(), []);
  console.log("Ready:", text);
}
async function selectOutfit(page, name) {
  await panel(page).getByLabel("Find an outfit", { exact: true }).fill(name);
  await button(page, name).click();
  await ready(page, name + " selected");
  await button(page, "Clear outfit search").click();
}
async function setPose(page, manifest, action, position, facing = "right") {
  const stop = button(page, "Pause wardrobe animation");
  if (await stop.count()) await stop.click();
  await panel(page)
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption(action);
  await panel(page)
    .getByLabel("Wardrobe facing", { exact: true })
    .selectOption(facing);
  await panel(page)
    .getByLabel("Wardrobe frame", { exact: true })
    .fill(String(position));
  await expect(canvas(page)).toHaveAttribute(
    "data-rendered-frame-id",
    String(manifest.animations[action].frames[position]),
  );
}
async function pixels(page) {
  return canvas(page).evaluate((c) => c.toDataURL());
}
async function download(page, label, file, metadata = {}, temporary = false) {
  const target = join(temporary ? temp : out, file);
  assert(!existsSync(target), `Preserve existing file ${target}`);
  const event = page.waitForEvent("download", { timeout: 180000 });
  event.catch(() => {});
  await button(page, label).click();
  const d = await event;
  assert.equal(await d.failure(), null);
  await d.saveAs(target);
  const bytes = await readFile(target);
  assert(bytes.length > 0);
  const row = {
    file: rel(target),
    bytes: bytes.length,
    sha256: sha(bytes),
    temporary,
    ...metadata,
  };
  report.downloads.push(row);
  await writeFile(
    join(out, "download-progress.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Downloaded:", file);
  return { bytes, path: target, record: row };
}
async function pack(page, key, character, look) {
  const d = await download(
    page,
    "Export CharacterPack",
    `${key}.character.zip`,
    { kind: "pack" },
  );
  await ready(page, "CharacterPack exported");
  const files = unzipSync(d.bytes),
    manifest = JSON.parse(Buffer.from(files["manifest.json"]));
  const baseline = join(
    root,
    "docs/kling-contour-review/evidence",
    `${key}.character.zip`,
  );
  const original = unzipSync(await readFile(baseline));
  // Covers metadata and every PNG atlas. ZIP compression bytes may differ; content may not.
  assert.deepEqual(Object.keys(files).sort(), Object.keys(original).sort());
  for (const [name, bytes] of Object.entries(files))
    assert.equal(sha(bytes), sha(original[name]), `${key}: baseline ${name}`);
  const row = {
    ...d.record,
    key,
    character,
    look,
    manifest,
    baseline: rel(baseline),
    baselineSha256: sha(await readFile(baseline)),
    baselineContentsExact: true,
  };
  report.packs.push(row);
  return row;
}
let activePage;
try {
  for (const character of ["male", "female"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    watch(context);
    const page = await context.newPage();
    activePage = page;
    await page.goto(
      `${origin}/workbench.html?character=${character}&mode=wardrobe`,
    );
    await ready(page, "Original outfit.");
    const p = panel(page),
      caseRecord = { character, checks: [], gifs: [], pngs: [] };
    const day =
      character === "male" ? "Everyday soft cuff" : "Everyday smooth waist";
    const wedding =
      character === "male" ? "Wedding curved cuff" : "Wedding smooth waist";
    const hairstyle = character === "male" ? "airy-tousle" : "ribbon-pony";
    await selectOutfit(page, day);
    await p.getByLabel("Hairstyle", { exact: true }).selectOption(hairstyle);
    await ready(page, "Appearance updated");
    const reference = await pack(page, `${character}-day`, character, "day");
    await button(page, "Pin current look").click();
    await ready(page, "Look pinned");
    await setPose(page, reference.manifest, "run", 4);
    const referencePixels = await pixels(page);
    const pinnedPixels = await comparison(page).evaluate((c) => c.toDataURL());
    await selectOutfit(page, wedding);
    const weddingPixels = await pixels(page);
    assert.notEqual(referencePixels, weddingPixels);
    await button(page, "Undo styling").click();
    await ready(page, "Styling change undone");
    assert.equal(await pixels(page), referencePixels);
    assert.equal(
      await comparison(page).evaluate((c) => c.toDataURL()),
      pinnedPixels,
    );
    await button(page, "Redo styling").click();
    await ready(page, "Styling change redone");
    assert.equal(await pixels(page), weddingPixels);
    caseRecord.checks.push(
      "Undo/redo restores exact current PNG pixels and keeps the pin, source pose, facing and playhead.",
    );
    const current = await pack(
      page,
      `${character}-wedding`,
      character,
      "wedding",
    );
    for (const action of ["idle", "run", "jump"])
      for (const facing of action === "idle" ? ["right"] : ["right", "left"]) {
        await setPose(page, current.manifest, action, 0, facing);
        await p
          .getByLabel("Wardrobe preview speed", { exact: true })
          .selectOption("0.25");
        const d = await download(
          page,
          "Download look comparison GIF",
          `${character}-${action}-${facing}-pinned-current.gif`,
          {
            kind: "look-gif",
            character,
            action,
            facing,
            reference: reference.file,
            current: current.file,
          },
        );
        await ready(page, "Look comparison GIF saved");
        const parsed = parseGIF(new Uint8Array(d.bytes).buffer),
          frames = decompressFrames(parsed, true),
          clip = current.manifest.animations[action];
        assert.equal(frames.length, clip.frames.length);
        assert.equal(
          frames.reduce((sum, f) => sum + f.delay, 0),
          Math.round((clip.frames.length * 100) / clip.fps) * 10,
        );
        assert.equal(
          parsed.frames.some((f) => f.application?.id === "NETSCAPE2.0"),
          clip.loop,
        );
        caseRecord.gifs.push({
          ...d.record,
          frames: frames.length,
          width: parsed.lsd.width,
          height: parsed.lsd.height,
          durationsMs: frames.map((f) => f.delay),
          loop: clip.loop,
        });
      }
    for (const action of actions)
      for (const facing of ["right", "left"]) {
        const clip = current.manifest.animations[action],
          position = Math.floor(clip.frames.length / 2),
          frameId = clip.frames[position];
        await setPose(page, current.manifest, action, position, facing);
        const d = await download(
          page,
          "Save look comparison PNG",
          `${character}-${action}-${facing}-looks.png`,
          {
            kind: "look-png",
            character,
            action,
            facing,
            frameId,
            reference: reference.file,
            current: current.file,
          },
        );
        caseRecord.pngs.push(d.record);
        await download(
          page,
          "Save current PNG",
          `${character}-${action}-${facing}-current.png`,
          { kind: "frame", frameId, facing, pack: current.file },
        );
      }
    // Check real unequal padding, then restore exactly with Undo.
    await setPose(page, current.manifest, "run", 4, "right");
    const beforeReset = await pixels(page);
    await button(page, "Reset appearance").click();
    await ready(page, "Appearance updated");
    const bare = await download(
      page,
      "Save current PNG",
      `${character}-bare-current.png`,
      { kind: "padding-current", character },
    );
    await download(
      page,
      "Save look comparison PNG",
      `${character}-different-padding.png`,
      {
        kind: "padding-comparison",
        character,
        frameId: current.manifest.animations.run.frames[4],
        reference: reference.file,
        bare: bare.record.file,
      },
    );
    await button(page, "Undo styling").click();
    await ready(page, "Styling change undone");
    assert.equal(await pixels(page), beforeReset);
    caseRecord.checks.push(
      "Original-head and padded-hair looks align in actual PNG; Undo restores the exact styled export.",
    );
    // Exercise real mixed pieces, tint and expression, then restore them together with history.
    const mixedSlot = character === "male" ? "Bottom" : "Shoes",
      mixedId = character === "male" ? "ochre-chinos-v1" : "brown-shoes";
    await p.getByLabel(mixedSlot, { exact: true }).selectOption(mixedId);
    await ready(page, "Outfit updated");
    await p.getByLabel("Hair color", { exact: true }).selectOption("copper");
    await ready(page, "Appearance updated");
    await p.getByLabel("Face", { exact: true }).selectOption("gentle");
    await ready(page, "Appearance updated");
    for (const action of actions) {
      await setPose(
        page,
        current.manifest,
        action,
        Math.floor(current.manifest.animations[action].frames.length / 2),
      );
      await download(
        page,
        "Save current PNG",
        `${character}-${action}-mixed.png`,
        { kind: "mixed-frame", character, action },
      );
    }
    for (let i = 0; i < 3; i++) {
      await button(page, "Undo styling").click();
      await ready(page, "Styling change undone");
    }
    await setPose(page, current.manifest, "run", 4);
    assert.equal(await pixels(page), beforeReset);
    caseRecord.checks.push(
      "Mixed clothes, copper hair and gentle face across all five actions; three undos recover identical wedding pixels.",
    );
    await setPose(page, current.manifest, "run", 0, "left");
    const savedPixels = await pixels(page);
    const saved = await download(
      page,
      /^Save wardrobe/,
      `${character}.wardrobe.zip`,
      { kind: "project" },
      true,
    );
    await ready(page, "Wardrobe project saved");
    await page.screenshot({
      path: join(out, `${character}-desktop.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: join(out, `${character}-mobile.png`),
      fullPage: true,
    });
    await p
      .getByLabel("Open wardrobe project file", { exact: true })
      .setInputFiles(saved.path);
    await ready(page, "Saved outfit and action settings restored");
    assert.equal(await pixels(page), savedPixels);
    await expect(button(page, "Undo styling")).toBeDisabled();
    await expect(comparison(page)).toHaveCount(0);
    await expect(p.getByLabel("Wardrobe action", { exact: true })).toHaveValue(
      "run",
    );
    await expect(p.getByLabel("Wardrobe facing", { exact: true })).toHaveValue(
      "left",
    );
    caseRecord.checks.push(
      "Saved wardrobe reopens at exact pixels/action/facing. Session-only history and pinned reference clear on reopen.",
    );
    report.cases.push(caseRecord);
    await writeFile(
      join(out, "capture-progress.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    await context.close();
  }
  report.editorsClosedAt = new Date().toISOString();
  for (const pack of report.packs) {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 850 },
    });
    watch(context, true);
    const page = await context.newPage();
    activePage = page;
    await page.route(
      /WardrobeEditor|SpriteActionEditor|action-gif|\/src\/(wardrobe|appearance|skeletal)\//,
      (r) => r.abort(),
    );
    await page.goto(origin + "/player.html");
    await page.locator("#player-zip").setInputFiles(join(root, pack.file));
    await expect(page.getByRole("status")).toContainText("Loaded:", {
      timeout: 180000,
    });
    for (const action of actions)
      for (const facing of ["right", "left"]) {
        const pause = page.getByRole("button", {
          name: "Pause animation",
          exact: true,
        });
        if (await pause.count()) await pause.click();
        await page
          .getByRole("button", {
            name: action[0].toUpperCase() + action.slice(1),
            exact: true,
          })
          .click();
        await page
          .getByRole("button", {
            name: facing[0].toUpperCase() + facing.slice(1),
            exact: true,
          })
          .click();
        await page
          .getByLabel("Playback speed", { exact: true })
          .selectOption("1");
        await page
          .getByLabel("Display scale", { exact: true })
          .selectOption("0.5");
        await page.locator("#player-frame").fill("0");
        const clip = pack.manifest.animations[action];
        const duration = Math.ceil(
          ((clip.frames.length * 1000) / clip.fps) * (clip.loop ? 2.1 : 1) +
            300,
        );
        const observed = await page.evaluate(async (duration) => {
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
          const observer = new MutationObserver(sample);
          observer.observe(canvas, { attributes: true });
          sample();
          document.querySelector('[aria-label="Play animation"]').click();
          await new Promise((resolve) => setTimeout(resolve, duration));
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
          key: pack.key,
          action,
          facing,
          durationMs: duration,
          observed,
        });
      }
    await page.screenshot({
      path: join(out, `${pack.key}-independent.png`),
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
    join(out, "evidence-index.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Actual workflow and independent playback passed.");
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
  await new Promise((resolve) => server.httpServer.close(resolve));
}
