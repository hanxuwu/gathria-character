// Actual production UI exports; no mocks, generated art, or substituted renderers.
// Run --plan first. Capture only after a frozen production build and root GO.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  statfs,
  writeFile,
} from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium, expect } from "@playwright/test";
import { unzipSync } from "fflate";
import { preview } from "vite";

const { values: args } = parseArgs({
  options: {
    plan: { type: "boolean", default: false },
    run: { type: "string" },
    output: { type: "string", default: "docs/kling-pixel-refinement/evidence" },
    port: { type: "string", default: "5243" },
    cases: { type: "string" },
    colors: { type: "string", default: "128" },
    factor: { type: "string", default: "4" },
    sampling: { type: "string", default: "detail" },
  },
});
const root = fileURLToPath(new URL("../", import.meta.url));
const allCases = [
  {
    key: "male-everyday",
    character: "male",
    preset: "day-soft-cuff",
    hair: "soft-curls",
  },
  {
    key: "male-wedding",
    character: "male",
    preset: "wedding-curved-cuff",
    hair: "soft-curls",
  },
  {
    key: "female-everyday",
    character: "female",
    preset: "day-smooth-waist",
    hair: "romantic-waves",
  },
  {
    key: "female-wedding",
    character: "female",
    preset: "wedding-smooth-waist",
    hair: "romantic-waves",
  },
];
const selectedKeys = args.cases?.split(",");
assert(
  !selectedKeys ||
    selectedKeys.every((key) => allCases.some((c) => c.key === key)),
  "Unknown case",
);
const cases = allCases.filter(
  (c) => !selectedKeys || selectedKeys.includes(c.key),
);
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const settings = {
  factor: Number(args.factor),
  colors: Number(args.colors),
  sampling: args.sampling,
};
assert(
  [4, 6, 8].includes(settings.factor) &&
    [64, 96, 128].includes(settings.colors) &&
    ["detail", "nearest"].includes(settings.sampling),
);
const budgets = {
  retained: 96 * 1024 ** 2,
  temporary: 300 * 1024 ** 2,
  reserve: 128 * 1024 ** 2,
};
const plan = {
  cases,
  settings,
  budgets,
  pngs: "idle, run contact/passing, jump apex; exact exported frame IDs recorded",
  gifs: "run both directions and jump right",
  player:
    "After editors close, fresh context; five actions × both facings, explicit source-mapped scrubs and bounded real-time movement. No claim to observe every frame in real time.",
};
if (args.plan) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}
assert(
  args.run && /^[a-z0-9][a-z0-9-]*$/.test(args.run),
  "Choose a fresh --run",
);
const output = resolve(root, args.output, args.run);
const temporary = `/tmp/kling-pixel-refinement/${args.run}`;
for (const p of [output, temporary]) {
  assert(
    !existsSync(p) || (await readdir(p)).length === 0,
    `Preserve previous evidence ${p}`,
  );
  await mkdir(p, { recursive: true });
}
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const relativePath = (path) => relative(root, path).replaceAll("\\", "/");
const json = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));
const metadata = (bytes) => {
  const files = unzipSync(new Uint8Array(bytes), {
    filter: (file) => ["manifest.json", "character.json"].includes(file.name),
  });
  return {
    manifest: json(files["manifest.json"]),
    config: json(files["character.json"]),
  };
};
const compiledJsSha256 = {};
for (const name of await readdir(join(root, "dist/assets"), {
  recursive: true,
}))
  if (name.endsWith(".js"))
    compiledJsSha256[`dist/assets/${name}`] = sha(
      await readFile(join(root, "dist/assets", name)),
    );
assert(Object.keys(compiledJsSha256).length, "Production build required");
const catalogBytes = await readFile(
  join(root, "docs/kling-wardrobe/catalog.json"),
);
const catalog = json(catalogBytes);
const report = {
  format: "gathria-pixel-refinement-browser-evidence",
  version: 1,
  production: true,
  run: args.run,
  startedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  worktreeStatusAtCapture: execFileSync("git", ["status", "--short"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  scriptSha256: sha(await readFile(fileURLToPath(import.meta.url))),
  compiledJsSha256,
  htmlSha256: Object.fromEntries(
    await Promise.all(
      ["workbench.html", "player.html"].map(async (name) => [
        name,
        sha(await readFile(join(root, "dist", name))),
      ]),
    ),
  ),
  catalogSha256: sha(catalogBytes),
  plan,
  downloads: [],
  screenshots: [],
  builds: [],
  playback: [],
  browserErrors: [],
  consoleErrors: [],
  failedRequests: [],
  externalRequests: [],
  independentEditorRequests: [],
  ignoredFaviconDiagnostics: [],
  bytes: { retained: 0, temporary: 0 },
  passed: false,
};
const persist = () =>
  writeFile(
    join(output, "evidence-index.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
const button = (scope, name) =>
  scope.getByRole("button", { name, exact: true });
const panel = (page) => page.locator("#wardrobe-panel");
const title = (s) => s[0].toUpperCase() + s.slice(1);
const server = await preview({
  root,
  preview: { host: "127.0.0.1", port: Number(args.port), strictPort: true },
});
const origin = `http://127.0.0.1:${args.port}`;
let browser;
function watch(context, independent = false) {
  context.on("page", (page) => {
    page.on("pageerror", (e) => report.browserErrors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const entry = { text: m.text(), location: m.location() };
      if (entry.location.url.endsWith("/favicon.ico"))
        report.ignoredFaviconDiagnostics.push(entry);
      else report.consoleErrors.push(entry);
    });
  });
  context.on("requestfailed", (r) =>
    report.failedRequests.push({ url: r.url(), failure: r.failure() }),
  );
  context.on("request", (r) => {
    const url = r.url();
    if (!url.startsWith(origin + "/") && !/^(blob:|data:)/.test(url))
      report.externalRequests.push(url);
    if (
      independent &&
      /WardrobeEditor|PixelRefinement|ClothingCreation|CombinationReview|\/assets\/workbench-[^/]+\.js|\/src\/(wardrobe|appearance|skeletal)\//.test(
        url,
      )
    )
      report.independentEditorRequests.push(url);
  });
}
async function ready(page, text) {
  await page.waitForFunction(
    (text) => {
      const p = document.querySelector("#wardrobe-panel");
      return (
        p?.querySelector('[role="alert"]') ||
        (p?.querySelector('[role="status"]')?.textContent.includes(text) &&
          !p.querySelector('[aria-busy="true"]'))
      );
    },
    text,
    { timeout: 240000 },
  );
  assert.deepEqual(await panel(page).getByRole("alert").allTextContents(), []);
  await expect(panel(page).getByRole("status")).toContainText(text);
}
async function diskCheck(path, needed = 0) {
  const s = await statfs(path);
  assert(
    s.bavail * s.bsize > budgets.reserve + needed,
    "Evidence disk reserve exhausted",
  );
}
async function download(
  page,
  scope,
  label,
  filename,
  meta = {},
  storage = "retained",
) {
  const target = join(storage === "temporary" ? temporary : output, filename);
  assert(!existsSync(target));
  await diskCheck(storage === "temporary" ? temporary : output);
  const pending = page.waitForEvent("download", { timeout: 300000 });
  pending.catch(() => {});
  await button(scope, label).click();
  const d = await pending;
  assert.equal(await d.failure(), null);
  const browserPath = await d.path();
  const bytes = await readFile(browserPath);
  assert(bytes.length > 0);
  assert(report.bytes[storage] + bytes.length <= budgets[storage]);
  if (storage === "temporary") await rename(browserPath, target);
  else {
    await writeFile(target, bytes);
    await d.delete();
  }
  report.bytes[storage] += bytes.length;
  const entry = {
    ...meta,
    actualUiDownload: true,
    file: storage === "temporary" ? target : relativePath(target),
    temporary: storage === "temporary",
    bytes: bytes.length,
    sha256: sha(bytes),
    suggestedFilename: d.suggestedFilename(),
  };
  report.downloads.push(entry);
  await persist();
  return { entry, bytes, path: target };
}
async function screenshot(page, filename, meta = {}) {
  const path = join(output, filename);
  assert(!existsSync(path));
  const bytes = await page.screenshot({ path, fullPage: false });
  report.bytes.retained += bytes.length;
  report.screenshots.push({
    ...meta,
    actualUiDownload: false,
    file: relativePath(path),
    bytes: bytes.length,
    sha256: sha(bytes),
  });
  await persist();
}
async function pixelPose(dialog, action, position, facing = "right") {
  const pause = button(dialog, "Pause pixel preview");
  if (await pause.count()) await pause.click();
  await dialog.getByLabel("Pixel action", { exact: true }).selectOption(action);
  await dialog.getByLabel("Pixel facing", { exact: true }).selectOption(facing);
  await dialog
    .getByLabel("Pixel frame", { exact: true })
    .fill(String(position));
  const c = dialog.getByTestId("pixel-candidate-canvas");
  await expect(c).toHaveAttribute("data-frame-position", String(position));
  await expect(c).toHaveAttribute("data-facing", facing);
}
async function captureCase(c) {
  const entry = catalog.characters.find((e) => e.key === c.character);
  const preset = entry.presets.find((p) => p.id === c.preset);
  assert(preset);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  watch(context);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  try {
    await page.goto(
      `${origin}/workbench.html?character=${c.character}&mode=wardrobe`,
    );
    await ready(page, "Original outfit.");
    await panel(page)
      .getByLabel("Find an outfit", { exact: true })
      .fill(preset.name);
    await button(panel(page), preset.name).click();
    await ready(page, preset.name + " selected");
    await panel(page)
      .getByLabel("Hairstyle", { exact: true })
      .selectOption(c.hair);
    await ready(page, "Appearance updated");
    const selection = {};
    for (const label of [
      "Top",
      "Bottom",
      "One-piece",
      "Shoes",
      "Hairstyle",
      "Face",
      "Hair color",
    ]) {
      const control = panel(page).getByLabel(label, { exact: true });
      if (await control.count()) selection[label] = await control.inputValue();
    }
    await button(panel(page), "Try pixel finish").click();
    const dialog = page.getByRole("dialog", {
      name: "Pixel finish",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await dialog
      .getByLabel("Pixel detail", { exact: true })
      .selectOption(String(settings.factor));
    await dialog
      .getByLabel("Pixel colors", { exact: true })
      .selectOption(String(settings.colors));
    await dialog
      .getByLabel("Pixel sampling", { exact: true })
      .selectOption(settings.sampling);
    await page.evaluate(() => {
      const state = {
        startedAt: performance.now(),
        steps: [],
        longTasks: [],
        supported: false,
      };
      const status = document.querySelector(
        'dialog.pixel-refinement [role="status"]',
      );
      const mutation = new MutationObserver(() => {
        if (state.steps.length < 120)
          state.steps.push({
            atMs: performance.now() - state.startedAt,
            status: status.textContent,
          });
      });
      mutation.observe(status, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      let performanceObserver;
      try {
        performanceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (state.longTasks.length < 1000)
              state.longTasks.push({
                atMs: entry.startTime - state.startedAt,
                durationMs: entry.duration,
              });
        });
        performanceObserver.observe({ type: "longtask", buffered: false });
        state.supported = true;
      } catch {}
      window.__pixelCaptureTiming = { state, mutation, performanceObserver };
    });
    await button(dialog, "Build pixel candidate").click();
    await expect(dialog.getByRole("status")).toContainText(
      "Pixel candidate ready.",
      { timeout: 300000 },
    );
    const timing = await page.evaluate(() => {
      const { state, mutation, performanceObserver } =
        window.__pixelCaptureTiming;
      mutation.disconnect();
      performanceObserver?.disconnect();
      delete window.__pixelCaptureTiming;
      return {
        ...state,
        elapsedMs: performance.now() - state.startedAt,
        maxLongTaskMs: Math.max(0, ...state.longTasks.map((t) => t.durationMs)),
        measurement:
          "Click-to-ready production headless browser wall time, including source preparation; longtask API entries >=50ms. This capture is not a device-independent performance guarantee.",
      };
    });
    const src = await download(
      page,
      dialog,
      "Save source CharacterPack",
      `${c.key}.source.character.zip`,
      { case: c.key, kind: "source-pack" },
      "temporary",
    );
    const candidate = await download(
      page,
      dialog,
      "Save pixel CharacterPack",
      `${c.key}.pixel.character.zip`,
      { case: c.key, kind: "pixel-pack" },
    );
    const build = await download(
      page,
      dialog,
      "Save pixel build report",
      `${c.key}.build.json`,
      { case: c.key, kind: "build-report" },
    );
    const sourceMeta = metadata(src.bytes),
      targetMeta = metadata(candidate.bytes);
    assert.deepEqual(
      targetMeta.manifest.animations,
      sourceMeta.manifest.animations,
    );
    assert.deepEqual(
      targetMeta.config.derivation.frames,
      sourceMeta.config.derivation.frames,
    );
    report.builds.push({
      case: c.key,
      character: c.character,
      preset: c.preset,
      selection,
      timing,
      sourcePack: src.entry,
      pixelPack: candidate.entry,
      buildReport: build.entry,
      settings,
      source: { manifest: sourceMeta.manifest, config: sourceMeta.config },
      target: { manifest: targetMeta.manifest, config: targetMeta.config },
    });
    for (const [action, position] of [
      ["idle", 0],
      ["run", 0],
      ["run", 4],
      [
        "jump",
        Math.floor(targetMeta.manifest.animations.jump.frames.length / 2),
      ],
    ]) {
      await pixelPose(dialog, action, position);
      const frameId = targetMeta.manifest.animations[action].frames[position];
      await expect(
        dialog.getByTestId("pixel-candidate-canvas"),
      ).toHaveAttribute("data-frame-id", String(frameId));
      await expect(dialog.getByTestId("pixel-source-canvas")).toHaveAttribute(
        "data-frame-id",
        String(frameId),
      );
      await download(
        page,
        dialog,
        "Save pixel PNG",
        `${c.key}.${action}-${position}-right.png`,
        {
          case: c.key,
          kind: "pixel-png",
          action,
          position,
          frameId,
          facing: "right",
        },
      );
      await download(
        page,
        dialog,
        "Save source PNG",
        `${c.key}.${action}-${position}-source-right.png`,
        {
          case: c.key,
          kind: "source-png",
          action,
          position,
          frameId,
          facing: "right",
        },
      );
    }
    for (const [action, facing] of [
      ["run", "right"],
      ["run", "left"],
      ["jump", "right"],
    ]) {
      await pixelPose(dialog, action, 0, facing);
      await download(
        page,
        dialog,
        "Save pixel GIF",
        `${c.key}.${action}-${facing}.gif`,
        { case: c.key, kind: "pixel-gif", action, facing },
      );
    }
    await pixelPose(dialog, "run", 4);
    await dialog
      .getByLabel("Pixel preview zoom", { exact: true })
      .selectOption("2");
    await screenshot(page, `${c.key}.workspace.png`, {
      case: c.key,
      kind: "workspace",
      action: "run",
      position: 4,
    });
    await button(dialog, "Close pixel finish").click();
    for (const [label, value] of Object.entries(selection))
      await expect(panel(page).getByLabel(label, { exact: true })).toHaveValue(
        value,
      );
    await persist();
    console.log(
      `${c.key}: actual source, candidate, PNG/GIF/report exported; wardrobe selection unchanged`,
    );
  } finally {
    await context.close();
  }
}
async function independentPlayer(build) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1040 },
    deviceScaleFactor: 1,
  });
  watch(context, true);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const manifest = build.target.manifest;
  try {
    await page.goto(`${origin}/player.html`);
    await page
      .locator("#player-zip")
      .setInputFiles(join(root, build.pixelPack.file));
    await expect(page.getByRole("status")).toContainText("Loaded:", {
      timeout: 180000,
    });
    const canvas = page.getByTestId("consumer-canvas");
    const pause = async () => {
      const p = button(page, "Pause animation");
      if (await p.count()) await p.click();
    };
    await pause();
    await page.getByLabel("Display scale", { exact: true }).selectOption("1");
    await page.getByLabel("Playback speed", { exact: true }).selectOption("1");
    for (const action of actions)
      for (const facing of ["right", "left"]) {
        await pause();
        await button(page, title(action)).click();
        await button(page, title(facing)).click();
        const clip = manifest.animations[action];
        assert(clip);
        const positions = [
          ...new Set([
            0,
            Math.floor(clip.frames.length / 2),
            clip.frames.length - 1,
          ]),
        ];
        const scrubs = [];
        for (const position of positions) {
          await page.locator("#player-frame").fill(String(position));
          await expect(canvas).toHaveAttribute(
            "data-frame-position",
            String(position),
          );
          await expect(canvas).toHaveAttribute(
            "data-frame-id",
            String(clip.frames[position]),
          );
          await expect(canvas).toHaveAttribute(
            "aria-label",
            new RegExp(`, ${action}, facing ${facing},`),
          );
          scrubs.push({ position, frameId: clip.frames[position] });
        }
        await page.locator("#player-frame").fill("0");
        const durationMs =
          action === "jump"
            ? Math.ceil((clip.frames.length * 1000) / clip.fps + 180)
            : Math.ceil(
                Math.min(800, (clip.frames.length * 1000) / clip.fps + 80),
              );
        const observed = await page.evaluate(async (duration) => {
          const c = document.querySelector('[data-testid="consumer-canvas"]'),
            out = [];
          let last = "";
          const started = performance.now();
          const sample = () => {
            const key = c.dataset.action + "/" + c.dataset.framePosition;
            if (key !== last)
              out.push({
                action: c.dataset.action,
                position: Number(c.dataset.framePosition),
                frameId: Number(c.dataset.frameId),
                atMs: performance.now() - started,
              });
            last = key;
          };
          const watcher = new MutationObserver(sample);
          watcher.observe(c, { attributes: true });
          sample();
          document.querySelector('[aria-label="Play animation"]')?.click();
          await new Promise((r) => setTimeout(r, duration));
          sample();
          watcher.disconnect();
          document.querySelector('[aria-label="Pause animation"]')?.click();
          return out;
        }, durationMs);
        for (const o of observed)
          assert.equal(
            o.frameId,
            manifest.animations[o.action].frames[o.position],
          );
        assert(
          new Set(
            observed.filter((o) => o.action === action).map((o) => o.position),
          ).size > 1,
          `${build.case} ${action} ${facing}: no observed playback`,
        );
        if (action === "jump")
          assert(
            observed.some((o) => o.action === "idle") ||
              (await page
                .locator("#player-one-shot-note")
                .innerText()
                .then((t) => t.includes("Finished"))),
            "Jump must complete or return to idle",
          );
        report.playback.push({
          case: build.case,
          action,
          facing,
          zoom: 1,
          playbackSpeed: 1,
          scrubs,
          durationMs,
          observed,
          coverage:
            "Explicit three-position scrubs plus bounded live playback; not every-frame real-time coverage",
        });
        await persist();
      }
    await pause();
    await button(page, "Run").click();
    await button(page, "Right").click();
    await page.locator("#player-frame").fill("4");
    await screenshot(page, `${build.case}.independent-player.png`, {
      case: build.case,
      kind: "independent-player",
      action: "run",
      position: 4,
    });
    console.log(
      `${build.case}: independent player loaded all five actions in both directions`,
    );
  } finally {
    await context.close();
  }
}
try {
  await diskCheck(temporary);
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--disable-dev-shm-usage"],
  });
  for (const c of cases) await captureCase(c);
  report.editorsClosedBeforePlayer = true;
  await persist();
  for (const build of report.builds) await independentPlayer(build);
  for (const [file, digest] of Object.entries(compiledJsSha256))
    assert.equal(
      sha(await readFile(join(root, file))),
      digest,
      `Build changed during capture: ${file}`,
    );
  assert.deepEqual(report.browserErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.failedRequests, []);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.independentEditorRequests, []);
  assert.equal(report.builds.length, cases.length);
  assert.equal(report.playback.length, cases.length * 10);
  report.passed = true;
} catch (error) {
  report.failure = String(error.stack || error);
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await persist();
  await browser?.close();
  await new Promise((r) => server.httpServer.close(r));
}
console.log(
  JSON.stringify(
    {
      passed: report.passed,
      evidence: relativePath(join(output, "evidence-index.json")),
      downloads: report.downloads.length,
      playback: report.playback.length,
      bytes: report.bytes,
    },
    null,
    2,
  ),
);
