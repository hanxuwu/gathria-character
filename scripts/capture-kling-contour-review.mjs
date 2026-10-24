// Actual production UI downloads; no renderer substitutes or generated review art.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { unzipSync } from "fflate";
import { parseGIF, decompressFrames } from "gifuct-js";
const root = fileURLToPath(new URL("../", import.meta.url));
const reviewRoot = resolve(
  root,
  process.env.KLING_REVIEW_DIR || "docs/kling-contour-review",
);
const output = join(reviewRoot, "evidence");
const resume = process.env.POSE_RESUME === "1";
const temp = resolve(
  root,
  process.env.KLING_REVIEW_TEMP || ".review-tmp/kling-contour",
);
await mkdir(output, { recursive: true });
await mkdir(temp, { recursive: true });
assert(
  !existsSync(join(output, "evidence-index.json")),
  "Preserve a completed capture; choose a new output for reruns.",
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const json = (b) => JSON.parse(Buffer.from(b).toString("utf8"));
const rel = (p) => relative(root, p).replaceAll("\\", "/");
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const report = {
  resumedFrom: resume
    ? "Resume after interruption; previously downloaded files are reused only with this batch recorded SHA256. Remaining browser operations execute again."
    : null,
  format: "gathria-contour-review-browser-evidence",
  production: true,
  startedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    cwd: root,
  }).trim(),
  outfits: [],
  downloads: [],
  playback: [],
  errors: [],
  knownNonApplicationErrors: [],
  externalRequests: [],
  failedRequests: [],
  forbiddenIndependentRequests: [],
};
const server = await preview({
  root,
  preview: { host: "127.0.0.1", port: 5199, strictPort: true },
});
const origin = "http://127.0.0.1:5199";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--disable-dev-shm-usage"],
});
const p = (page) => page.locator("#wardrobe-panel");
const button = (page, name) =>
  p(page).getByRole("button", { name, exact: typeof name === "string" });
const cv = (page) => p(page).getByTestId("wardrobe-preview");
const watch = (context, independent = false) => {
  context.on("page", (page) => {
    page.on("pageerror", (e) => report.errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      // A missing default browser icon is unrelated to the application assets.
      // Retain its exact URL instead of hiding arbitrary resource errors.
      if (
        m.location().url === origin + "/favicon.ico" &&
        m.text() ===
          "Failed to load resource: the server responded with a status of 404 (Not Found)"
      )
        report.knownNonApplicationErrors.push({
          text: m.text(),
          url: m.location().url,
        });
      else report.errors.push(m.text());
    });
  });
  context.on("request", (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(origin))
      report.externalRequests.push(r.url());
    if (
      independent &&
      /WardrobeEditor|SpriteActionEditor|action-gif|\/src\/(wardrobe|appearance|skeletal)\//.test(
        r.url(),
      )
    )
      report.forbiddenIndependentRequests.push(r.url());
  });
  context.on("response", (r) => {
    if (
      r.status() >= 400 &&
      !(r.url() === origin + "/favicon.ico" && r.status() === 404)
    )
      report.failedRequests.push({ url: r.url(), status: r.status() });
  });
};
async function ready(page, text) {
  await page.waitForFunction(
    (text) => {
      const p = document.querySelector("#wardrobe-panel");
      return (
        p?.querySelector("[role=alert]") ||
        (p?.querySelector("[role=status]")?.textContent.includes(text) &&
          !Array.from(p.querySelectorAll("button")).find((b) =>
            b.textContent.includes("Export CharacterPack"),
          )?.disabled)
      );
    },
    text,
    { timeout: 180000 },
  );
  assert.deepEqual(await p(page).getByRole("alert").allTextContents(), []);
  console.log("Ready:", text);
}
async function pause(page) {
  const b = button(page, "Pause wardrobe animation");
  if (await b.count()) await b.click();
}
async function outfit(page, name) {
  if (!(await button(page, name).isVisible()))
    await button(page, "More outfits and earlier versions").click();
  await button(page, name).click();
  await ready(page, name + " selected");
  await pause(page);
}
async function pose(page, m, id, facing = "right") {
  await pause(page);
  const action = actions.find((a) => m.animations[a].frames.includes(id));
  assert(action);
  await p(page)
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption(action);
  await p(page)
    .getByLabel("Wardrobe facing", { exact: true })
    .selectOption(facing);
  await p(page)
    .getByLabel("Wardrobe frame", { exact: true })
    .fill(String(m.animations[action].frames.indexOf(id)));
  await expect(cv(page)).toHaveAttribute("data-rendered-frame-id", String(id));
  return action;
}
async function pixels(page) {
  return cv(page).evaluate((c) => c.toDataURL());
}
async function download(page, name, filename, temporary = false) {
  const path = join(temporary ? temp : output, filename);
  if (resume && existsSync(path)) {
    const bytes = new Uint8Array(await readFile(path));
    const previous = json(
      await readFile(join(output, "failed-attempt.json")),
    ).downloads.find((d) => d.file === (temporary ? path : rel(path)));
    assert(
      previous && previous.sha256 === sha(bytes),
      "Existing download must match this batch's preserved evidence.",
    );
    const record = { ...previous, reusedFromInterruptedCapture: true };
    report.downloads.push(record);
    console.log("Reused verified download:", filename);
    return { path, bytes, record };
  }
  assert(!existsSync(path), path);
  const pending = page.waitForEvent("download", { timeout: 180000 });
  pending.catch(() => {});
  await button(page, name).click();
  const d = await pending;
  assert.equal(await d.failure(), null);
  await d.saveAs(path);
  const bytes = new Uint8Array(await readFile(path));
  assert(bytes.length > 0);
  const record = {
    file: temporary ? path : rel(path),
    bytes: bytes.length,
    sha256: sha(bytes),
    temporary,
  };
  report.downloads.push(record);
  await writeFile(
    join(output, "download-progress.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Downloaded:", filename, bytes.length);
  return { path, bytes, record };
}
async function screenshot(page, name) {
  await page.screenshot({ path: join(output, name), fullPage: true });
}
async function png(page, m, id, stem, facing = "right") {
  await pose(page, m, id, facing);
  return download(page, "Save current PNG", `${stem}-${id}-${facing}.png`);
}
let activePage;
try {
  for (const [character, look, beforeName, afterName, style] of [
    ["male", "day", "Everyday soft cuff", "Everyday soft cuff", "airy-tousle"],
    [
      "male",
      "wedding",
      "Wedding reviewed sleeve",
      "Wedding curved cuff",
      "airy-tousle",
    ],
    [
      "female",
      "day",
      "Everyday native folds",
      "Everyday smooth waist",
      "ribbon-pony",
    ],
    [
      "female",
      "wedding",
      "Wedding native folds",
      "Wedding smooth waist",
      "ribbon-pony",
    ],
  ]) {
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
    const source = json(
      unzipSync(
        new Uint8Array(
          await readFile(
            join(root, `docs/kling-motion/exports/${character}.character.zip`),
          ),
        ),
      )["manifest.json"],
    );
    await outfit(page, beforeName);
    await p(page).getByLabel("Hairstyle", { exact: true }).selectOption(style);
    await ready(page, "Appearance updated");
    const key = `${character}-${look}`,
      ids =
        character === "male"
          ? [0, 54, 55, 56, 57, 58, 62]
          : [0, 83, 85, 86, 87, 89, 90, 104, 107, 109];
    const beforePack = `docs/kling-pose-review/evidence/${character}-${look}.character.zip`;
    const row = {
      character,
      look,
      beforePack,
      beforeSha256: sha(await readFile(join(root, beforePack))),
      afterPreset: afterName,
      ids,
    };
    for (const id of ids) await png(page, source, id, key + "-before");
    if (afterName !== beforeName) await outfit(page, afterName);
    for (const id of ids) await png(page, source, id, key + "-after");
    await png(
      page,
      source,
      character === "male" ? 56 : 86,
      key + "-after",
      "left",
    );
    await pose(page, source, 55, "left");
    const savedPixels = await pixels(page);
    const project = await download(
      page,
      /^Save wardrobe/,
      key + ".wardrobe.zip",
      true,
    );
    row.project = project.record;
    await page.reload();
    await ready(page, "Original outfit.");
    await p(page)
      .getByLabel("Open wardrobe project file", { exact: true })
      .setInputFiles(project.path);
    await ready(page, "Saved outfit and action settings restored");
    await expect(
      p(page).getByLabel("Wardrobe action", { exact: true }),
    ).toHaveValue("run");
    await expect(
      p(page).getByLabel("Wardrobe facing", { exact: true }),
    ).toHaveValue("left");
    await pose(page, source, 55, "left");
    assert.equal(await pixels(page), savedPixels);
    row.reopenedPixelsExact = true;
    const packed = await download(
      page,
      "Export CharacterPack",
      key + ".character.zip",
    );
    const files = unzipSync(packed.bytes);
    const m = json(files["manifest.json"]);
    assert.deepEqual(m.animations, source.animations);
    assert.deepEqual(
      m.frames.map((f) => f.id),
      source.frames.map((f) => f.id),
    );
    assert.deepEqual(m.anchor, {
      ...source.anchor,
      x: source.anchor.x + 32,
      y: source.anchor.y + 128,
    });
    assert.equal(m.spritesheet.frameWidth, 768);
    assert.equal(m.spritesheet.frameHeight, 1184);
    row.pack = packed.record;
    row.manifest = m;
    row.nativeSourceMappingExact = true;
    row.gifs = [];
    for (const action of ["run", "jump"])
      for (const facing of ["right", "left"]) {
        await p(page)
          .getByLabel("Wardrobe action", { exact: true })
          .selectOption(action);
        await p(page)
          .getByLabel("Wardrobe facing", { exact: true })
          .selectOption(facing);
        const d = await download(
          page,
          "Download action GIF",
          `${key}-${action}-${facing}.gif`,
        );
        const parsed = parseGIF(new Uint8Array(d.bytes).buffer);
        const frames = decompressFrames(parsed, true);
        const clip = m.animations[action];
        assert.equal(parsed.lsd.width, 384);
        assert.equal(parsed.lsd.height, 592);
        assert.equal(frames.length, clip.frames.length);
        assert.equal(
          frames.reduce((n, f) => n + f.delay, 0),
          Math.round((clip.frames.length * 100) / clip.fps) * 10,
        );
        const repeat = parsed.frames.some(
          (f) => f.application?.id === "NETSCAPE2.0",
        );
        assert.equal(repeat, clip.loop);
        row.gifs.push({
          ...d.record,
          action,
          facing,
          frames: frames.length,
          durationsMs: frames.map((f) => f.delay),
          loop: repeat,
          allFramesDecoded: true,
        });
      }
    row.comparisonGifs = [];
    const compareAction = character === "male" ? "run" : "jump";
    for (const facing of ["right", "left"]) {
      await p(page)
        .getByLabel("Wardrobe action", { exact: true })
        .selectOption(compareAction);
      await p(page)
        .getByLabel("Wardrobe facing", { exact: true })
        .selectOption(facing);
      await p(page)
        .getByLabel("Wardrobe preview speed", { exact: true })
        .selectOption("0.25");
      const d = await download(
        page,
        "Download comparison GIF",
        `${key}-${compareAction}-${facing}-source-comparison.gif`,
      );
      const parsed = parseGIF(new Uint8Array(d.bytes).buffer);
      const frames = decompressFrames(parsed, true),
        clip = m.animations[compareAction];
      assert.equal(parsed.lsd.width, 776);
      assert.equal(parsed.lsd.height, 608);
      assert.equal(frames.length, clip.frames.length);
      assert.equal(
        frames.reduce((n, f) => n + f.delay, 0),
        Math.round((clip.frames.length * 100) / clip.fps) * 10,
      );
      assert.equal(
        parsed.frames.some((f) => f.application?.id === "NETSCAPE2.0"),
        clip.loop,
      );
      row.comparisonGifs.push({
        ...d.record,
        action: compareAction,
        facing,
        frames: frames.length,
        loop: clip.loop,
        previewSpeedExcluded: true,
      });
    }
    await pose(page, source, character === "male" ? 56 : 86);
    await p(page).getByLabel("Inspect connections", { exact: true }).check();
    await p(page)
      .getByLabel("Inspection area", { exact: true })
      .selectOption(character === "male" ? "wrists" : "waist");
    row.inspection = [];
    for (const backdrop of ["cream", "dark", "checker"]) {
      await p(page)
        .getByLabel("Inspection background", { exact: true })
        .selectOption(backdrop);
      row.inspection.push(
        (
          await download(
            page,
            "Save comparison PNG",
            `${key}-inspection-${backdrop}.png`,
          )
        ).record,
      );
    }
    await p(page).getByLabel("Show silhouettes", { exact: true }).check();
    row.inspection.push(
      (
        await download(
          page,
          "Save comparison PNG",
          `${key}-inspection-silhouette.png`,
        )
      ).record,
    );
    await screenshot(page, key + "-inspector.png");
    await p(page).getByLabel("Inspect connections", { exact: true }).uncheck();
    if (look === "wedding") {
      // Representative mixed trousers/shoes, hair tint and expression, all five actions.
      const slot = character === "male" ? "Bottom" : "Shoes";
      const value = character === "male" ? "ochre-chinos-v1" : "brown-shoes";
      await p(page).getByLabel(slot, { exact: true }).selectOption(value);
      await ready(page, "Outfit updated");
      await p(page)
        .getByLabel("Hair color", { exact: true })
        .selectOption("copper");
      await ready(page, "Appearance updated");
      const expression = p(page).getByLabel("Face", { exact: true });
      await expression.selectOption("gentle");
      await ready(page, "Appearance updated");
      row.mix = [];
      for (const action of actions) {
        const id =
          source.animations[action].frames[
            Math.floor(source.animations[action].frames.length / 2)
          ];
        row.mix.push(
          (await png(page, source, id, key + "-mix-" + action)).record,
        );
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await screenshot(page, key + "-mobile.png");
    await context.close();
    report.outfits.push(row);
    await writeFile(
      join(output, "capture-progress.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  }
  report.editorsClosedAt = new Date().toISOString();
  for (const row of report.outfits) {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 900 },
    });
    watch(context, true);
    const page = await context.newPage();
    activePage = page;
    await page.route(
      /WardrobeEditor|SpriteActionEditor|action-gif|\/src\/(wardrobe|appearance|skeletal)\//,
      (r) => r.abort(),
    );
    await page.goto(origin + "/player.html");
    await page.locator("#player-zip").setInputFiles(join(root, row.pack.file));
    await expect(page.getByRole("status")).toContainText("Loaded:", {
      timeout: 180000,
    });
    for (const action of actions)
      for (const facing of ["right", "left"]) {
        const stop = page.getByRole("button", {
          name: "Pause animation",
          exact: true,
        });
        if (await stop.count()) await stop.click();
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
        const clip = row.manifest.animations[action],
          duration = Math.ceil(
            ((1000 * clip.frames.length) / clip.fps) * (clip.loop ? 2.1 : 1) +
              250,
          );
        const observations = await page.evaluate(async (duration) => {
          const c = document.querySelector('[data-testid="consumer-canvas"]');
          const seen = [];
          let prev = "";
          const sample = () => {
            const k = c.dataset.action + "/" + c.dataset.framePosition;
            if (k !== prev) {
              seen.push({
                action: c.dataset.action,
                position: Number(c.dataset.framePosition),
                frameId: Number(c.dataset.frameId),
              });
              prev = k;
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
          return seen;
        }, duration);
        for (const o of observations)
          assert.equal(
            o.frameId,
            row.manifest.animations[o.action].frames[o.position],
          );
        const selected = observations.filter((o) => o.action === action);
        assert(
          new Set(selected.map((o) => o.position)).size >=
            Math.min(3, clip.frames.length),
        );
        if (clip.loop)
          assert(
            selected.some((o, i) => i && o.position < selected[i - 1].position),
          );
        else assert(observations.some((o) => o.action === "idle"));
        report.playback.push({
          character: row.character,
          look: row.look,
          action,
          facing,
          durationMs: duration,
          observations,
        });
      }
    await screenshot(
      page,
      `${row.character}-${row.look}-independent-player.png`,
    );
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.failedRequests, []);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.forbiddenIndependentRequests, []);
  report.passed = true;
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(output, "evidence-index.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Production capture passed.");
} catch (e) {
  report.failure = String(e);
  await writeFile(
    join(output, "failed-attempt.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  if (activePage && !activePage.isClosed())
    await activePage
      .screenshot({ path: join(output, "failure.png"), fullPage: true })
      .catch(() => {});
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
