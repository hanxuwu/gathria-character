// Usage: node scripts/review-landing-production-legacy.mjs <V1 fixture root> [report directory]
// The fixture root retains actual PR62 assets and UI downloads outside Git.
import { chromium, expect } from "@playwright/test";
import { unzipSync } from "fflate";
import { build } from "esbuild";
import { createServer } from "vite";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = process.cwd();
if (!process.argv[2])
  throw Error(
    "Provide the external V1 fixture root, e.g. /tmp/landing-pr62-v1.",
  );
const output = await build({
  stdin: {
    contents: `export {decodeSourceRgbaPng} from './src/core/baked-source'; export {readGameplayMotion} from './src/core/gameplay-motion';`,
    loader: "ts",
    resolveDir: root,
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { decodeSourceRgbaPng, readGameplayMotion } = await import(
  "data:text/javascript;base64," +
    Buffer.from(output.outputFiles[0].text).toString("base64")
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (bytes) => JSON.parse(Buffer.from(bytes).toString());
const oldRoot = resolve(process.argv[2]);
const out = resolve(process.argv[3] ?? "docs/kling-landing-production/review");
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
  "Run after the V2 source is published.",
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
  oldSourceSha256: oldHash,
  currentSourceSha256: currentCatalog.sourceSha256,
  wardrobe: [],
  currentAssetRequestsDuringV1Import: null,
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
  await side()
    .getByTestId("side-project-input")
    .setInputFiles(oldRoot + "/ui-review/original.wardrobe.zip");
  await ready();
  await expect(stage()).toHaveAttribute("data-collection", "landing-candidate");
  await expect(stage()).toHaveAttribute("data-frame-id", "107");
  await expect(stage()).toHaveAttribute("data-paused", "true");
  for (const frameId of [107, 108]) {
    await side()
      .getByTestId("side-inspect-landing-" + frameId)
      .click();
    await expect(stage()).toHaveAttribute("data-frame-id", String(frameId));
    const png = await download("side-export-png", "v1-" + frameId + ".png");
    const pixelHash = sha(decodeSourceRgbaPng(png).pixels);
    assert.equal(pixelHash, sourceFrameHash(frameId));
    const zip = unzipSync(
      await download("side-save-project", "v1-" + frameId + ".wardrobe.zip"),
    );
    const document = json(zip["document.json"]);
    assert.equal(sha(zip["source.character.zip"]), oldHash);
    assert.equal(document.sourceSha256, oldHash);
    assert.equal(
      document.preview.playback.profileId,
      "kling-male-side-landing-candidate-v1",
    );
    assert.equal(document.preview.playback.state.paused, true);
    report.wardrobe.push({
      frameId,
      pixelSha256: pixelHash,
      profileId: document.preview.playback.profileId,
      sourceSha256: document.sourceSha256,
    });
  }
  assert.deepEqual(
    fetched,
    [],
    "Importing and saving V1 must not fetch current source or garment banks.",
  );
  report.currentAssetRequestsDuringV1Import = fetched.length;
  await page.screenshot({ path: out + "/v1-reopened-108.png", fullPage: true });
  const oldPackPath = oldRoot + "/ui-review/original.character.zip";
  const oldPack = await readFile(oldPackPath),
    packFiles = unzipSync(oldPack),
    packManifest = json(packFiles["manifest.json"]),
    packConfig = json(packFiles["character.json"]);
  const oldProfile = readGameplayMotion(packManifest, packConfig);
  assert.equal(oldProfile?.id, "kling-male-side-landing-candidate-v1");
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
  await player.getByRole("button", { name: "Run", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-action", "run");
  await player.getByRole("button", { name: "Jump", exact: true }).click();
  const observed = await canvas.evaluate(async (canvas) => {
    const frames = [],
      start = performance.now();
    await new Promise((resolve) => {
      const sample = () => {
        frames.push(Number(canvas.dataset.frameId));
        if (performance.now() - start > 2500) resolve();
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    return frames;
  });
  assert(observed.includes(107));
  assert(observed.includes(108));
  await expect(canvas).toHaveAttribute("data-action", "run");
  const pending = player.waitForEvent("download");
  await player
    .getByRole("button", { name: "Export selected CharacterPack", exact: true })
    .click();
  const saved = await pending;
  await saved.saveAs(scratch + "/v1-reexport.character.zip");
  assert.equal(
    sha(await readFile(scratch + "/v1-reexport.character.zip")),
    sha(oldPack),
  );
  assert.deepEqual(playerAssets, []);
  report.player = {
    profileId: oldProfile.id,
    saw107: true,
    saw108: true,
    reexportSha256: sha(oldPack),
    externalCandidateAssetRequests: playerAssets.length,
  };
  assert.deepEqual(errors, []);
  await writeFile(
    out + "/v1-backward-compatibility.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await server.close();
}
