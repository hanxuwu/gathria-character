// Actual source-pair button and UI exports on an ordinary HTTP LAN origin.
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { networkInterfaces } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const sourcePath = "artwork/kling-jump/prepared/kling-source.zip";
const base = new URL("docs/kling-jump/", root);
const output = new URL("browser/", base);
const exports = new URL("exports/", base);
await mkdir(output, { recursive: true });
await mkdir(exports, { recursive: true });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceBytes = await readFile(new URL(sourcePath, root));
const sourceFiles = unzipSync(sourceBytes);
const sourceManifest = JSON.parse(Buffer.from(sourceFiles["manifest.json"]));
const actions = ["idle", "walk", "run", "celebrate", "jump"];
const key = (action) => action + (action === "jump" ? "_once" : "_loop");
const title = (value) => value[0].toUpperCase() + value.slice(1);
const files = [
  "src/core/types.ts",
  "src/core/pack.ts",
  "src/core/pack-v2.ts",
  "src/core/pack-v3.ts",
  "src/core/baked-source.ts",
  "src/core/sha256.ts",
  "src/consumer/PackPlayer.tsx",
  "src/consumer/player.ts",
  "scripts/generate-kling-jump-evidence.mjs",
];
const implementationHashes = async () =>
  Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        sha(await readFile(new URL(file, root))),
      ]),
    ),
  );
const report = {
  format: "gathria-kling-jump-evidence",
  startedAt: new Date().toISOString(),
  sourcePath,
  sourceSha256: sha(sourceBytes),
  implementationHashes: await implementationHashes(),
  priorCapture: {
    result: "not accepted",
    reason:
      "Initial native24fps DOM sampling saw38of39 male/right jump positions (position11not observed) while the full browser/unit suites ran concurrently. The exported clip still contained39frames. Runtime pack.ts also changed during that capture, so final capture was repeated on stable code with no weakened assertions.",
    sourceImportSeconds: 121.92076208099999,
  },
  checks: [],
  downloads: [],
  playback: [],
  screenshots: [],
  browserErrors: [],
  independentRequests: [],
};
const host = Object.values(networkInterfaces())
  .flat()
  .find((ip) => ip?.family === "IPv4" && !ip.internal)?.address;
assert(
  host,
  "Non-loopback IPv4 required for genuine HTTP/no-Web-Crypto verification",
);
const port = Number(process.env.KLING_JUMP_PORT || 5189);
const server = await createServer({
  root: fileURLToPath(root),
  server: { host: "0.0.0.0", port, strictPort: true, hmr: false },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server"],
});
const url = `http://${host}:${port}/player.html`;
const timeout = 240000;
const names = Object.fromEntries(
  ["male", "female"].map((id) => [
    id,
    JSON.parse(Buffer.from(sourceFiles[`characters/${id}/meta.json`])).name,
  ]),
);
const manifests = {};
const log = (text) => console.log(new Date().toISOString(), text);
function track(page, label) {
  page.on("pageerror", (error) =>
    report.browserErrors.push({ label, message: error.message }),
  );
}
async function ready(page, name) {
  await expect(page.getByRole("status")).toContainText(`Loaded: ${name}`, {
    timeout,
  });
  await expect(page.locator("#player-zip")).toBeEnabled({ timeout });
  await expect(page.getByRole("alert")).toHaveCount(0);
}
async function pause(page) {
  const button = page.getByRole("button", {
    name: "Pause animation",
    exact: true,
  });
  if (await button.count()) await button.click();
}
async function scrub(page, action, position = 0, facing = "right") {
  await pause(page);
  await page.getByRole("button", { name: title(action), exact: true }).click();
  await pause(page);
  await page.getByRole("button", { name: title(facing), exact: true }).click();
  await page.locator("#player-frame").fill(String(position));
  await expect(page.getByTestId("consumer-canvas")).toHaveAttribute(
    "data-frame-position",
    String(position),
  );
}
async function shot(page, name) {
  const target = new URL(`${name}.png`, output);
  await page
    .locator(".player-preview-panel")
    .screenshot({ path: fileURLToPath(target) });
  report.screenshots.push({
    path: `docs/kling-jump/browser/${name}.png`,
    sha256: sha(await readFile(target)),
    source: "Actual independent/player UI screenshot",
  });
}
async function observe(page, id, action, facing) {
  const clip = manifests[id].animations[action];
  await scrub(page, action, 0, facing);
  // Record from immediately before clicking Play so position zero is included.
  await page.evaluate(() => {
    window.__jumpSamples = [];
    window.__jumpSampling = true;
    const canvas = document.querySelector('[data-testid="consumer-canvas"]');
    const start = performance.now();
    let previous = -1;
    const sample = (now) => {
      if (!window.__jumpSampling) return;
      const position = Number(canvas.dataset.framePosition);
      if (position !== previous) {
        window.__jumpSamples.push({
          ms: now - start,
          position,
          frameId: Number(canvas.dataset.frameId),
        });
        previous = position;
      }
      requestAnimationFrame(sample);
    };
    sample(start);
  });
  await page
    .getByRole("button", { name: "Play animation", exact: true })
    .click();
  const durationMs = (clip.frames.length * 1000) / clip.fps;
  await page.waitForTimeout(
    clip.loop ? durationMs * 2.2 + 80 : durationMs + 400,
  );
  const samples = await page.evaluate(() => {
    window.__jumpSampling = false;
    return window.__jumpSamples;
  });
  const positions = [...new Set(samples.map((row) => row.position))].sort(
    (a, b) => a - b,
  );
  assert(samples.every((row) => row.frameId === clip.frames[row.position]));
  const wraps = samples
    .slice(1)
    .filter((row, i) => row.position < samples[i].position).length;
  report.lastObservedAttempt = {
    character: id,
    action,
    facing,
    positions,
    wraps,
    samples,
  };
  if (clip.loop) {
    assert(wraps >= 1, `${id}/${action}/${facing}: loop never wrapped`);
    assert(
      positions.length >= Math.ceil(clip.frames.length * 0.85),
      `${id}/${action}/${facing}: excessive frame loss`,
    );
    await pause(page);
  } else {
    assert.equal(wraps, 0, "Jump must not loop");
    assert.deepEqual(
      positions,
      Array.from({ length: clip.frames.length }, (_, i) => i),
      `${id}/${facing}: jump skipped positions`,
    );
    await expect(
      page.getByRole("button", { name: "Replay animation", exact: true }),
    ).toBeVisible();
    const canvas = page.getByTestId("consumer-canvas");
    await expect(canvas).toHaveAttribute(
      "data-frame-position",
      String(clip.frames.length - 1),
    );
    const held = await canvas.evaluate((canvas) => canvas.toDataURL());
    await page.waitForTimeout(200);
    assert.equal(await canvas.evaluate((canvas) => canvas.toDataURL()), held);
    await page
      .getByRole("button", { name: "Replay animation", exact: true })
      .click();
    await expect
      .poll(async () =>
        Number(await canvas.getAttribute("data-frame-position")),
      )
      .toBeLessThan(clip.frames.length - 1);
    await pause(page);
    // Explicit scrubbing checks both the atlas-page transition and the apex.
    for (const position of [0, 13, clip.frames.length - 1])
      await scrub(page, action, position, facing);
  }
  report.playback.push({
    character: id,
    action,
    facing,
    frameCount: clip.frames.length,
    fps: clip.fps,
    loop: clip.loop,
    durationMs,
    observedPositions: positions,
    wraps,
    finalHoldAndReplay: !clip.loop,
    samples,
  });
}
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  track(page, "source");
  await page.goto(url);
  report.httpContext = await page.evaluate(() => ({
    secure: isSecureContext,
    subtleAvailable: !!globalThis.crypto?.subtle,
  }));
  assert.deepEqual(report.httpContext, {
    secure: false,
    subtleAvailable: false,
  });
  log("Clicking the actual Kling pair sample button over ordinary HTTP");
  const started = performance.now();
  await page
    .getByRole("button", { name: /Try the Kling character pair/ })
    .click();
  await ready(page, names.male);
  report.sourceImportSeconds = (performance.now() - started) / 1000;
  await expect(
    page.getByRole("button", { name: "Jump", exact: true }),
  ).toBeEnabled();
  for (const id of ["male", "female"]) {
    await page.locator("#player-character").selectOption(id);
    await ready(page, names[id]);
    await page.locator("#player-zoom").selectOption("0.5");
    await scrub(page, "jump", 13);
    await shot(page, `${id}-imported-jump-apex`);
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Export selected CharacterPack",
        exact: true,
      })
      .click();
    const target = new URL(`${id}.character.zip`, exports);
    await (await pending).saveAs(fileURLToPath(target));
    const bytes = await readFile(target),
      entries = unzipSync(bytes);
    const manifest = JSON.parse(Buffer.from(entries["manifest.json"]));
    const recipe = JSON.parse(Buffer.from(entries["character.json"]));
    assert.equal(manifest.schemaVersion, 3);
    assert.equal(recipe.source.sha256, report.sourceSha256);
    assert.equal(recipe.characterId, id);
    const sheets = [manifest.spritesheet, ...manifest.additionalSheets];
    assert.deepEqual(
      Object.keys(entries).sort(),
      [
        "manifest.json",
        "character.json",
        "PROVENANCE.txt",
        "INTEGRATION.md",
        ...sheets.map((sheet) => sheet.file),
      ].sort(),
    );
    assert.equal(manifest.spritesheet.frameWidth, 704);
    assert.equal(manifest.spritesheet.frameHeight, 1056);
    assert.deepEqual(manifest.anchor, {
      x: 352,
      y: 998,
      units: "pixels",
      origin: "top-left",
    });
    for (const action of actions) {
      const expected = sourceManifest.actions[key(action)],
        clip = manifest.animations[action];
      assert.equal(clip.frames.length, expected.frames);
      assert.equal(clip.fps, expected.fps);
      assert.equal(clip.loop, action !== "jump");
      const original = JSON.parse(
        Buffer.from(
          sourceFiles[`characters/${id}/actions/${key(action)}.json`],
        ),
      );
      assert.deepEqual(
        recipe.sourceMetadata.actions[action].frames.map((frame) => [
          frame.sourceFrame,
          frame.timeSeconds,
        ]),
        original.frames.map((frame) => [
          frame.source_video_frame,
          frame.source_time_s,
        ]),
      );
    }
    manifests[id] = manifest;
    report.downloads.push({
      character: id,
      path: `docs/kling-jump/exports/${id}.character.zip`,
      bytes: bytes.length,
      sha256: sha(bytes),
      sheets: sheets.map((sheet) => ({
        file: sheet.file,
        width: sheet.width,
        height: sheet.height,
      })),
      source: "Actual Export selected CharacterPack button",
    });
    log(
      `Exported ${id} with all five actions and ${sheets.length} native sheets`,
    );
  }
  await page.locator("#player-character").selectOption("male");
  await ready(page, names.male);
  await page.getByLabel("Compare both characters", { exact: true }).check();
  await expect(page.getByTestId("consumer-canvas")).toHaveAttribute(
    "data-comparison",
    "true",
    { timeout },
  );
  await scrub(page, "jump", 13);
  await shot(page, "pair-jump-apex");
  await scrub(page, "jump", 38);
  await shot(page, "pair-jump-recovery");
  await context.close();
  report.sourceContextClosedAt = new Date().toISOString();
  const forbidden = [];
  for (const id of ["male", "female"]) {
    const independent = await browser.newContext({
      viewport: { width: 1600, height: 1200 },
      deviceScaleFactor: 1,
    });
    await independent.route(
      /\/(?:src\/(?:editor|skeletal|experiments)\/|src\/core\/(?:generator|illustrated-)|artwork\/(?:kling-jump|kling-playback)\/prepared\/)/,
      (route) => {
        forbidden.push(route.request().url());
        return route.abort();
      },
    );
    independent.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (request.url().startsWith(`http://${host}:${port}`))
        report.independentRequests.push(path);
    });
    const player = await independent.newPage();
    track(player, `independent ${id}`);
    await player.goto(url);
    await player
      .locator("#player-zip")
      .setInputFiles(fileURLToPath(new URL(`${id}.character.zip`, exports)));
    await ready(player, names[id]);
    await expect(player.locator("#player-character")).toHaveCount(0);
    await player.locator("#player-zoom").selectOption("0.5");
    for (const action of actions)
      for (const facing of ["right", "left"])
        await observe(player, id, action, facing);
    await scrub(player, "jump", 13);
    await shot(player, `${id}-independent-jump-apex`);
    await scrub(player, "jump", 38);
    await shot(player, `${id}-independent-jump-recovery`);
    const exact = await player.evaluate(async (manifest) => {
      const { frameAtTime, animationHasEnded } = await import(
        "/src/consumer/player.ts"
      );
      const clip = manifest.animations.jump,
        duration = (clip.frames.length * 1000) / clip.fps;
      for (let i = 0; i < clip.frames.length + 10; i++) {
        if (
          frameAtTime(manifest, "jump", (i * 1000) / clip.fps + 0.00001).id !==
          clip.frames[Math.min(i, clip.frames.length - 1)]
        )
          throw Error("Incorrect one-shot mapping");
      }
      if (
        animationHasEnded(manifest, "jump", duration - 0.001) ||
        !animationHasEnded(manifest, "jump", duration)
      )
        throw Error("Incorrect completion boundary");
      return {
        frameOrderExact: true,
        durationMs: duration,
        finalHoldExact: true,
      };
    }, manifests[id]);
    report.checks.push({
      character: id,
      independentFiveActions: true,
      jumpTiming: exact,
    });
    await independent.close();
    log(`Verified independent ${id}: five actions × both directions`);
  }
  assert.deepEqual(forbidden, []);
  assert.deepEqual(report.browserErrors, []);
  report.implementationHashesAfter = await implementationHashes();
  assert.deepEqual(
    report.implementationHashesAfter,
    report.implementationHashes,
    "Implementation changed during evidence capture; rerun on stable code",
  );
  delete report.lastObservedAttempt;
  report.finishedAt = new Date().toISOString();
  report.passed = true;
} finally {
  await browser.close();
  await server.close();
  report.independentRequests = [...new Set(report.independentRequests)].sort();
  await writeFile(
    new URL("evidence-index.json", output),
    JSON.stringify(report, null, 2) + "\n",
  );
}
log(
  "All source import, UI export, HTTP fallback and independent playback checks passed",
);
