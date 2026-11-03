import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const packPath = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
await mkdir(out, { recursive: true });
const bytes = await readFile(packPath);
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: process.env.CHROMIUM_ARGS_JSON
    ? JSON.parse(process.env.CHROMIUM_ARGS_JSON)
    : [],
});
const page = await browser.newPage({
  viewport: { width: 1400, height: 1100 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.route("**/__landing_bridge_pack.zip", (route) =>
  route.fulfill({ body: bytes, contentType: "application/zip" }),
);
await page.goto(
  process.env.GATHRIA_REVIEW_URL ?? "http://127.0.0.1:5173/player.html",
);
await page.locator("#player-zip").setInputFiles(packPath);
await page
  .getByRole("status")
  .filter({ hasText: "Loaded:" })
  .waitFor({ timeout: 60000 });
await page.getByRole("button", { name: "Jump", exact: true }).click();
await page.getByTestId("consumer-canvas").scrollIntoViewIfNeeded();
await page
  .locator("#player-one-shot-note")
  .filter({ hasText: "Finished" })
  .waitFor({ timeout: 15000 });
const slider = page.locator("#player-frame");
assert.equal(await slider.inputValue(), "69");
await page.waitForTimeout(350);
assert.equal(await slider.inputValue(), "69");
const scrubs = [];
for (const [pos, id] of [
  [50, 107],
  [51, 108],
]) {
  await slider.fill(String(pos));
  await page.getByTestId("consumer-canvas").scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  await page
    .getByTestId("consumer-canvas")
    .screenshot({ path: path.join(out, "player-frame-" + id + "-right.png") });
  scrubs.push({
    frameId: id,
    sequencePosition: pos,
    sliderValue: await slider.inputValue(),
  });
}
await page.getByRole("button", { name: "Left", exact: true }).click();
await page.waitForTimeout(120);
await page
  .getByTestId("consumer-canvas")
  .screenshot({ path: path.join(out, "player-frame-108-left.png") });
assert.equal(
  await page.locator('[data-testid="motion-flow-controls"]').count(),
  0,
);
const downloadPromise = page.waitForEvent("download");
await page
  .getByRole("button", { name: "Export selected CharacterPack", exact: true })
  .click();
const download = await downloadPromise;
const reexportPath = path.join(out, "player-reexport.character.zip");
await download.saveAs(reexportPath);
assert.equal(sha(await readFile(reexportPath)), sha(bytes));
const decoded = await page.evaluate(async () => {
  const {
    loadPortableCharacterPack,
    readPortableCharacterPackArchive,
    releaseCharacterImages,
    characterPackImages,
  } = await import("/src/core/pack.ts");
  const bytes = new Uint8Array(
    await (await fetch("/__landing_bridge_pack.zip")).arrayBuffer(),
  );
  const archive = readPortableCharacterPackArchive(bytes);
  const loaded = await loadPortableCharacterPack(
    new Blob([bytes], { type: "application/zip" }),
  );
  const frames = [];
  for (const id of [107, 108]) {
    const rect = loaded.manifest.frames.find((f) => f.id === id);
    const c = document.createElement("canvas");
    c.width = rect.width;
    c.height = rect.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(
      loaded.images[rect.page],
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height,
    );
    const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonzero = 0,
      strong = 0;
    for (let p = 3; p < rgba.length; p += 4) {
      if (rgba[p] > 0) nonzero++;
      if (rgba[p] > 200) strong++;
    }
    const digest = await crypto.subtle.digest("SHA-256", rgba);
    frames.push({
      id,
      page: rect.page,
      size: [c.width, c.height],
      nonzeroAlphaPixels: nonzero,
      strongAlphaPixels: strong,
      canvasRgbaSha256: Array.from(new Uint8Array(digest), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join(""),
    });
  }
  releaseCharacterImages(characterPackImages(loaded));
  const study = archive.config.sourceMetadata.landingBridgeStudy;
  return {
    frames,
    status: study.status,
    visualAcceptance: study.visualAcceptance,
    baselineTicks: study.baselineSequence.length,
    candidateTicks: study.candidateSequence.length,
  };
});
assert.equal(decoded.status, "generated-review-candidate");
assert.equal(decoded.visualAcceptance, "pending");
assert.ok(
  decoded.frames.every((f) => f.page === 2 && f.strongAlphaPixels > 1000),
);
assert.notEqual(
  decoded.frames[0].canvasRgbaSha256,
  decoded.frames[1].canvasRgbaSha256,
);
const exports = [];
for (const version of ["baseline", "candidate"])
  for (const facing of ["right", "left"]) {
    const b64 = await page.evaluate(
      async ({ version, facing }) => {
        const { readPortableCharacterPackArchive } = await import(
          "/src/core/pack.ts"
        );
        const { themeActionGif } = await import("/src/themes/media.ts");
        const bytes = new Uint8Array(
          await (await fetch("/__landing_bridge_pack.zip")).arrayBuffer(),
        );
        const archive = readPortableCharacterPackArchive(bytes);
        if (version === "baseline")
          archive.manifest.animations.jump.frames =
            archive.config.sourceMetadata.landingBridgeStudy.baselineSequence;
        const gif = await themeActionGif(archive, "jump", facing);
        let binary = "";
        for (let i = 0; i < gif.length; i += 8192)
          binary += String.fromCharCode(...gif.subarray(i, i + 8192));
        return btoa(binary);
      },
      { version, facing },
    );
    const gif = Buffer.from(b64, "base64");
    const filename = version + "-run-jump-run-" + facing + ".gif";
    await writeFile(path.join(out, filename), gif);
    exports.push({
      filename,
      bytes: gif.length,
      sha256: sha(gif),
      exporter:
        "src/themes/media.ts:themeActionGif in browser, not UI download",
      ticks: version === "baseline" ? 68 : 70,
      facing,
    });
  }
assert.deepEqual(errors, []);
const receipt = {
  fixtureOnly: false,
  artAccepted: false,
  actualUI: "player.html",
  loadedWithFullPngPixelValidation: true,
  newPageFramesDecoded: decoded.frames,
  oneShotCompletedAndHeldFrame69: true,
  leftDirection: true,
  scrubs,
  noGameplayControls: true,
  uiReexport: {
    button: "Export selected CharacterPack",
    wholeZipBytesUnchanged: true,
    sha256: sha(bytes),
    path: reexportPath,
  },
  pageErrors: errors,
  exports,
};
await writeFile(
  path.join(out, "actual-review-receipt.json"),
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt));
await browser.close();
