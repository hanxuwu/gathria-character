// Usage: node scripts/review-landing-production-legacy.mjs <fixture root> [report directory]
// Default: original V1 assets + actual UI downloads under that fixture root.
// A later edition can use --edition 2/3 --project <saved.wardrobe.zip> --export-pack.
// The explicit seed may come from the project writer; browser imports, paused
// saves/reopens and standalone pack exports are exercised below.
import { chromium, expect } from "@playwright/test";
import { unzipSync } from "fflate";
import { build } from "esbuild";
import { createServer } from "vite";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { join, resolve } from "node:path";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = process.cwd();
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    edition: { type: "string", default: "1" },
    project: { type: "string" },
    "export-pack": { type: "boolean", default: false },
  },
});
const edition = Number(values.edition);
// These are immutable historical routes, not expectations derived from current code.
const historicalLandingLeadIns = {
  1: [88, 89, 107, 108],
  2: [88, 89, 107, 108],
  3: [88, 107, 108],
};
assert(
  Number.isInteger(edition) && Object.hasOwn(historicalLandingLeadIns, edition),
  "Expected a reviewed historical edition (1, 2 or 3).",
);
const prefix = `v${edition}`;
const expectedProfileId = `kling-male-side-landing-candidate-${prefix}`;
if (!positionals[0])
  throw Error(
    "Provide an external fixture root containing docs/kling-landing-production/assets.",
  );
const output = await build({
  stdin: {
    contents: `export {decodeSourceRgbaPng} from './src/core/baked-source'; export {readGameplayMotion, resolveGameplayMotion} from './src/core/gameplay-motion';`,
    loader: "ts",
    resolveDir: root,
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { decodeSourceRgbaPng, readGameplayMotion, resolveGameplayMotion } =
  await import(
    "data:text/javascript;base64," +
      Buffer.from(output.outputFiles[0].text).toString("base64")
  );
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (bytes) => JSON.parse(Buffer.from(bytes).toString());
const oldRoot = resolve(positionals[0]);
const out = resolve(positionals[1] ?? "docs/kling-landing-production/review");
const projectPath = resolve(
  values.project ?? oldRoot + "/ui-review/original.wardrobe.zip",
);
const scratch = await mkdtemp(join(tmpdir(), "gathria-landing-legacy-"));
// Downloads stay outside the repository; only JSON and screenshot evidence is published.
await mkdir(out, { recursive: true });
const oldSource = await readFile(
  oldRoot + "/docs/kling-landing-production/assets/male.source.zip",
);
const oldFiles = unzipSync(oldSource);
const oldManifest = json(oldFiles["manifest.json"]);
const oldHash = sha(oldSource);
const currentCatalog = json(
  await readFile(root + "/docs/kling-landing-production/assets/catalog.json"),
);
assert.notEqual(
  currentCatalog.sourceSha256,
  oldHash,
  "Run after a newer source edition is published.",
);
const sourceProfile = resolveGameplayMotion(
  oldManifest,
  oldHash,
  json(oldFiles["character.json"]),
);
assert.equal(sourceProfile?.id, expectedProfileId);
const expectedLandingLeadIn = historicalLandingLeadIns[edition];
assert.deepEqual(
  sourceProfile.routes.find(
    (route) => route.from === "jump" && route.to === "run",
  )?.leadIn,
  expectedLandingLeadIn,
);
function sourceFrameHash(frameId) {
  const frame = oldManifest.frames.find((row) => row.id === frameId);
  const sheet = [oldManifest.spritesheet, ...oldManifest.additionalSheets][
    frame.page ?? 0
  ];
  const image = decodeSourceRgbaPng(oldFiles[sheet.file]);
  const pixels = new Uint8Array(frame.width * frame.height * 4);
  for (let y = 0; y < frame.height; y++)
    pixels.set(
      image.pixels.subarray(
        ((frame.y + y) * image.width + frame.x) * 4,
        ((frame.y + y) * image.width + frame.x + frame.width) * 4,
      ),
      y * frame.width * 4,
    );
  return sha(pixels);
}
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 5197, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const side = () =>
  page.locator('[data-testid="side-session"][data-active="true"]');
const stage = () => side().getByTestId("side-stage");
async function ready() {
  await expect(side().getByTestId("side-playground")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180000 },
  );
  await expect(side().getByRole("alert")).toHaveCount(0);
}
async function download(id, name) {
  const pending = page.waitForEvent("download", { timeout: 180000 });
  await side().getByTestId(id).click();
  const item = await pending;
  assert.equal(await item.failure(), null);
  await item.saveAs(scratch + "/" + name);
  await ready();
  return readFile(scratch + "/" + name);
}
const report = {
  format: "gathria-landing-legacy-review",
  version: 1,
  edition,
  seedProjectSha256: sha(await readFile(projectPath)),
  seedProvenance: values.project
    ? "Explicit external project fixture; subsequent saves/reopens/pack export use the actual UI"
    : "Actual prior workbench download",
  oldSourceSha256: oldHash,
  currentSourceSha256: currentCatalog.sourceSha256,
  wardrobe: [],
  currentAssetRequestsDuringImport: null,
  player: null,
};
try {
  await page.goto(
    "http://127.0.0.1:5197/workbench.html?character=male&mode=side-view&collection=landing-candidate",
  );
  await ready();
  const fetched = [];
  page.on("request", (request) => {
    if (request.url().includes("/docs/kling-landing-production/assets/"))
      fetched.push(request.url());
  });
  await side().getByTestId("side-project-input").setInputFiles(projectPath);
  await ready();
  await expect(stage()).toHaveAttribute("data-collection", "landing-candidate");
  if (!values.project) {
    await expect(stage()).toHaveAttribute("data-frame-id", "107");
    await expect(stage()).toHaveAttribute("data-paused", "true");
  }
  for (const frameId of [107, 108]) {
    await side()
      .getByTestId("side-inspect-landing-" + frameId)
      .click();
    await expect(stage()).toHaveAttribute("data-frame-id", String(frameId));
    const png = await download(
      "side-export-png",
      prefix + "-" + frameId + ".png",
    );
    const pixelHash = sha(decodeSourceRgbaPng(png).pixels);
    assert.equal(pixelHash, sourceFrameHash(frameId));
    const zip = unzipSync(
      await download(
        "side-save-project",
        prefix + "-" + frameId + ".wardrobe.zip",
      ),
    );
    const document = json(zip["document.json"]);
    assert.equal(sha(zip["source.character.zip"]), oldHash);
    assert.equal(document.sourceSha256, oldHash);
    assert.equal(document.preview.playback.profileId, expectedProfileId);
    assert.equal(document.preview.playback.state.paused, true);
    await side().getByTestId("side-action-idle").click();
    await side()
      .getByTestId("side-project-input")
      .setInputFiles(scratch + "/" + prefix + "-" + frameId + ".wardrobe.zip");
    await ready();
    await expect(stage()).toHaveAttribute("data-frame-id", String(frameId));
    await expect(stage()).toHaveAttribute("data-paused", "true");
    const reopened = await download(
      "side-export-png",
      prefix + "-" + frameId + "-reopened.png",
    );
    assert.equal(sha(decodeSourceRgbaPng(reopened).pixels), pixelHash);
    report.wardrobe.push({
      frameId,
      savedPausedReopenedPixelsExact: true,
      pixelSha256: pixelHash,
      profileId: document.preview.playback.profileId,
      sourceSha256: document.sourceSha256,
    });
  }
  assert.deepEqual(
    fetched,
    [],
    "Importing and saving an old edition must not fetch current source or garment banks.",
  );
  report.currentAssetRequestsDuringImport = fetched.length;
  if (edition === 1) report.currentAssetRequestsDuringV1Import = fetched.length;
  await page.screenshot({
    path: out + "/" + prefix + "-reopened-108.png",
    fullPage: true,
  });
  const oldPackPath = values["export-pack"]
    ? scratch + "/" + prefix + ".character.zip"
    : oldRoot + "/ui-review/original.character.zip";
  const oldPack = values["export-pack"]
      ? await download("side-export-pack", prefix + ".character.zip")
      : await readFile(oldPackPath),
    packFiles = unzipSync(oldPack),
    packManifest = json(packFiles["manifest.json"]),
    packConfig = json(packFiles["character.json"]);
  const oldProfile = readGameplayMotion(packManifest, packConfig);
  assert.equal(oldProfile?.id, expectedProfileId);
  assert.equal(oldProfile.sourceSha256, oldHash);
  assert.deepEqual(
    oldProfile.routes.find(
      (route) => route.from === "jump" && route.to === "run",
    )?.leadIn,
    expectedLandingLeadIn,
  );
  assert.deepEqual(
    fetched,
    [],
    "Exporting the imported edition must remain self-contained.",
  );
  const player = await browser.newPage({ acceptDownloads: true });
  player.on("pageerror", (e) => errors.push(String(e)));
  const playerAssets = [];
  player.on("request", (request) => {
    if (request.url().includes("/docs/kling-landing-production/assets/"))
      playerAssets.push(request.url());
  });
  await player.goto("http://127.0.0.1:5197/player.html");
  await player.locator("#player-zip").setInputFiles(oldPackPath);
  await expect(player.locator(".player-status")).toContainText("Loaded:", {
    timeout: 180000,
  });
  const canvas = player.getByTestId("consumer-canvas");
  await expect(canvas).toHaveAttribute("data-gameplay-motion", "true");
  await canvas.evaluate((canvas) => {
    window.__legacySamples = [];
    const capture = () =>
      window.__legacySamples.push({
        frameId: Number(canvas.dataset.frameId),
        action: canvas.dataset.action,
        leadIn: canvas.dataset.leadIn === "true",
      });
    window.__legacyObserver = new MutationObserver(capture);
    window.__legacyObserver.observe(canvas, { attributes: true });
    capture();
  });
  await player.getByRole("button", { name: "Run", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-action", "run");
  await player.getByRole("button", { name: "Jump", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-action", "jump", {
    timeout: 5000,
  });
  await expect(canvas).toHaveAttribute("data-action", "run", { timeout: 5000 });
  await expect(canvas).toHaveAttribute("data-lead-in", "false", {
    timeout: 5000,
  });
  const observed = await player.evaluate(() => {
    window.__legacyObserver.disconnect();
    return window.__legacySamples;
  });
  const landingFrames = observed
    .filter((frame) => frame.leadIn && frame.action === "run")
    .map((frame) => frame.frameId);
  const landingUnique = landingFrames.filter(
    (frame, index) => !index || frame !== landingFrames[index - 1],
  );
  assert.deepEqual(
    landingUnique,
    expectedLandingLeadIn,
    "Standalone playback must retain the old landing route.",
  );
  const pending = player.waitForEvent("download");
  await player
    .getByRole("button", { name: "Export selected CharacterPack", exact: true })
    .click();
  const saved = await pending;
  await saved.saveAs(scratch + "/" + prefix + "-reexport.character.zip");
  assert.equal(
    sha(await readFile(scratch + "/" + prefix + "-reexport.character.zip")),
    sha(oldPack),
  );
  assert.deepEqual(playerAssets, []);
  report.player = {
    profileId: oldProfile.id,
    sourceSha256: oldProfile.sourceSha256,
    exportedThroughCurrentWorkbench: values["export-pack"],
    observedLandingLeadIn: landingUnique,
    saw107: true,
    saw108: true,
    reexportSha256: sha(oldPack),
    externalCandidateAssetRequests: playerAssets.length,
  };
  assert.deepEqual(errors, []);
  await writeFile(
    out + "/" + prefix + "-backward-compatibility.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await server.close();
}
