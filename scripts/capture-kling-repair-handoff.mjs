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
  process.env.KLING_REPAIR_REVIEW_DIR || "docs/kling-repair-handoff/evidence",
);
const temp = resolve(
  root,
  process.env.KLING_REVIEW_TEMP || ".review-tmp/kling-repair-handoff",
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
const cases = JSON.parse(
  await readFile(
    join(
      root,
      process.env.KLING_REPAIR_CASES || "docs/kling-repair-handoff/cases.json",
    ),
    "utf8",
  ),
);
assert(cases.length > 0);
const report = {
  format: "gathria-repair-handoff-evidence",
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
  preview: { host: "127.0.0.1", port: 5207, strictPort: true },
});
const origin = "http://127.0.0.1:5207";
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
  for (const c of cases) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    watch(context);
    const p = await context.newPage();
    activePage = p;
    p.setDefaultTimeout(30000);
    await p.goto(
      `${origin}/workbench.html?character=${c.character}&mode=wardrobe`,
    );
    await ready(p, "Original outfit.");
    await outfit(p, c.beforePreset);
    if (c.appearance) {
      await panel(p)
        .getByLabel("Hairstyle", { exact: true })
        .selectOption(c.appearance);
      await ready(p, "Appearance updated");
    }
    await pose(p, "run", "right", 0);
    const beforePack = c.baselinePack
      ? await (async () => {
          const bytes = await readFile(join(root, c.baselinePack));
          return {
            bytes,
            path: join(root, c.baselinePack),
            record: {
              file: c.baselinePack,
              bytes: bytes.length,
              sha256: sha(bytes),
              kind: "pack",
              key: c.key,
              character: c.character,
              stage: "before",
              historicalPack: true,
            },
          };
        })()
      : await download(
          p,
          "Export CharacterPack",
          `${c.key}-before.character.zip`,
          { kind: "pack", key: c.key, character: c.character, stage: "before" },
        );
    if (!c.baselinePack) await ready(p, "CharacterPack exported");
    const beforeManifest = JSON.parse(
      Buffer.from(unzipSync(beforePack.bytes)["manifest.json"]),
    );
    if (c.baselinePack)
      assert.equal(
        sha(beforePack.bytes),
        sha(await readFile(join(root, c.baselinePack))),
      );
    report.packs.push({
      ...beforePack.record,
      manifest: beforeManifest,
      baseline: c.baselinePack,
    });
    const positions = Object.fromEntries(
      actions.map((action) => {
        const requested = c.reviewFrames?.find((f) => f.action === action);
        const position =
          requested?.frameId !== undefined
            ? beforeManifest.animations[action].frames.indexOf(
                requested.frameId,
              )
            : (requested?.position ?? 0);
        assert(
          position >= 0 &&
            position < beforeManifest.animations[action].frames.length,
          `${action} review position`,
        );
        return [action, position];
      }),
    );
    for (const action of actions)
      for (const facing of ["right", "left"]) {
        await pose(p, action, facing, positions[action]);
        await download(
          p,
          "Save current PNG",
          `${c.key}-before-${action}-${facing}.png`,
          {
            kind: "frame",
            key: c.key,
            character: c.character,
            stage: "before",
            action,
            facing,
            frameId:
              beforeManifest.animations[action].frames[positions[action]],
            pack: beforePack.record.file,
          },
        );
      }
    await pose(p, "run", "right", positions.run);
    const accepted = await savedPixels(p);
    await button(p, "Open look review").click();
    const reviewer = review(p);
    await expect(
      reviewer.getByLabel("Review note", { exact: true }),
    ).toBeEnabled();
    await reviewer
      .getByLabel("Review note", { exact: true })
      .fill(
        c.note ||
          "Recheck the garment boundary at this source pose after importing the candidate. This note is not visual approval.",
      );
    await reviewer
      .getByRole("button", { name: "Add review issue", exact: true })
      .click();
    const predecessor = await notes(p, `${c.key}-before-notes.json`, {
      key: c.key,
      stage: "before",
    });

    await button(p, "Pin current look").click();
    await ready(p, "Look pinned");
    const modal = p.getByRole("dialog", {
      name: "Preview imported clothing",
      exact: true,
    });
    await panel(p)
      .getByLabel("Preview registered clothing file", { exact: true })
      .setInputFiles(join(root, c.candidateFile));
    await expect(modal).toBeVisible({ timeout: 180000 });
    assert.equal(await savedPixels(p), accepted);
    await modal
      .getByLabel("Candidate preview action", { exact: true })
      .selectOption("jump");
    await modal
      .getByLabel("Candidate preview facing", { exact: true })
      .selectOption("left");
    await modal
      .getByLabel("Candidate preview frame", { exact: true })
      .fill(String(positions.jump));
    await modal.screenshot({ path: join(out, `${c.key}-candidate-jump.png`) });
    assert.equal(await savedPixels(p), accepted);
    await modal
      .getByRole("button", { name: "Discard clothing candidate", exact: true })
      .click();
    await expect(modal).toHaveCount(0);
    assert.equal(await savedPixels(p), accepted);
    await panel(p)
      .getByLabel("Preview registered clothing file", { exact: true })
      .setInputFiles(join(root, c.candidateFile));
    await expect(modal).toBeVisible({ timeout: 180000 });
    await modal
      .getByRole("button", { name: "Apply clothing candidate", exact: true })
      .click();
    await expect(modal).toHaveCount(0, { timeout: 180000 });
    await expect(panel(p).locator(".wardrobe-editor")).not.toHaveAttribute(
      "aria-busy",
      "true",
      { timeout: 180000 },
    );
    const afterPack = await download(
      p,
      "Export CharacterPack",
      `${c.key}-after.character.zip`,
      { kind: "pack", key: c.key, character: c.character, stage: "after" },
    );
    await ready(p, "CharacterPack exported");
    const afterManifest = JSON.parse(
      Buffer.from(unzipSync(afterPack.bytes)["manifest.json"]),
    );
    assert.deepEqual(afterManifest.animations, beforeManifest.animations);
    assert.deepEqual(afterManifest.frames, beforeManifest.frames);
    assert.deepEqual(afterManifest.anchor, beforeManifest.anchor);
    report.packs.push({ ...afterPack.record, manifest: afterManifest });
    await expect(
      reviewer.getByRole("button", {
        name: "Export review notes",
        exact: true,
      }),
    ).toBeEnabled();
    await reviewer
      .getByLabel("Review issue handoff file", { exact: true })
      .setInputFiles(predecessor.path);
    await expect(
      reviewer.getByRole("button", {
        name: "Copy issues as open",
        exact: true,
      }),
    ).toBeVisible();
    await reviewer
      .getByRole("button", { name: "Copy issues as open", exact: true })
      .click();
    const copied = await notes(p, `${c.key}-after-notes.json`, {
      key: c.key,
      stage: "after",
    });
    assert.notEqual(
      copied.document.binding.lookSha256,
      predecessor.document.binding.lookSha256,
    );
    assert.deepEqual(
      copied.document.issues,
      predecessor.document.issues.map((i) => ({ ...i, status: "open" })),
    );
    await download(p, "Export issue handoff", `${c.key}-handoff.json`, {
      kind: "review-handoff",
      key: c.key,
    });

    await reviewer.screenshot({ path: join(out, `${c.key}-handoff.png`) });
    await button(p, "Close look review").click();
    for (const action of actions)
      for (const facing of ["right", "left"]) {
        await pose(p, action, facing, positions[action]);
        await download(
          p,
          "Save current PNG",
          `${c.key}-after-${action}-${facing}.png`,
          {
            kind: "frame",
            key: c.key,
            character: c.character,
            stage: "after",
            action,
            facing,
            frameId: afterManifest.animations[action].frames[positions[action]],
            pack: afterPack.record.file,
          },
        );
        await download(
          p,
          "Save look comparison PNG",
          `${c.key}-${action}-${facing}-comparison.png`,
          {
            kind: "look-png",
            key: c.key,
            character: c.character,
            action,
            facing,
            frameId: afterManifest.animations[action].frames[positions[action]],
            reference: beforePack.record.file,
            current: afterPack.record.file,
          },
        );
        if (action === "run" || action === "jump") {
          const gif = await download(
            p,
            "Download look comparison GIF",
            `${c.key}-${action}-${facing}-comparison.gif`,
            {
              kind: "look-gif",
              key: c.key,
              character: c.character,
              action,
              facing,
              reference: beforePack.record.file,
              current: afterPack.record.file,
            },
          );
          await ready(p, "Look comparison GIF saved");
          const parsed = parseGIF(new Uint8Array(gif.bytes).buffer),
            frames = decompressFrames(parsed, true);
          assert.equal(
            frames.length,
            afterManifest.animations[action].frames.length,
          );
        }
      }
    await pose(p, "run", "left", positions.run);
    const afterPixels = await savedPixels(p);
    const saved = await download(
      p,
      /^Save wardrobe/,
      `${c.key}.wardrobe.zip`,
      { kind: "project", key: c.key, character: c.character },
      true,
    );
    await ready(p, "Wardrobe project saved");
    await button(p, "Undo styling").click();
    await ready(p, "Styling change undone");
    await button(p, "Redo styling").click();
    await ready(p, "Styling change redone");
    assert.equal(await savedPixels(p), afterPixels);
    await panel(p)
      .getByLabel("Open wardrobe project file", { exact: true })
      .setInputFiles(saved.path);
    await ready(p, "Saved outfit and action settings restored");
    await panel(p)
      .getByLabel("Wardrobe frame", { exact: true })
      .fill(String(positions.run));
    assert.equal(await savedPixels(p), afterPixels);
    await p.screenshot({
      path: join(out, `${c.key}-desktop.png`),
      fullPage: true,
    });
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
      candidateSha256: sha(await readFile(join(root, c.candidateFile))),
      positions,
      checks: [
        "Preview/discard retain accepted pixels and action state.",
        "Explicit candidate application retains anchor and timing.",
        "Saved project reopen and undo/redo retain actual candidate pixels.",
        "Five actions in both directions exported at identical source poses.",
        "Review notes explicitly transferred to the candidate with all issues open and origin retained.",
        "Mobile page has no horizontal overflow.",
      ],
    });
    await context.close();
  }
  report.editorsClosedAt = new Date().toISOString();
  for (const pack of report.packs.filter((p) => p.stage === "after")) {
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
  console.log(
    "Production repair handoff, exports and independent player passed.",
  );
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
