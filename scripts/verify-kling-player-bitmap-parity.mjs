// Compare decoder paths using actual unchanged exported atlas pixels, including alpha edges.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { unzipSync } from "fflate";
const root = fileURLToPath(new URL("../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const report = {
  startedAt: new Date().toISOString(),
  scope:
    "Actual exported atlas crops: default ImageBitmap vs decoded HTML image, native/half scale, right/mirrored left, transparent canvas RGBA comparison.",
  packs: [],
  passed: false,
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
});
try {
  const page = await browser.newPage();
  for (const look of ["day", "wedding"]) {
    const file = `docs/kling-wardrobe/fit-v2/exports/female-${look}.character.zip`;
    const archive = await readFile(join(root, file));
    const files = unzipSync(new Uint8Array(archive));
    const manifest = JSON.parse(Buffer.from(files["manifest.json"]).toString());
    const selected = new Set([
      87,
      89,
      58,
      64,
      104,
      ...Object.values(manifest.animations).map((action) => action.frames[0]),
    ]);
    const pack = { file, sha256: sha(archive), pages: [] };
    report.packs.push(pack);
    for (const [index, sheet] of [
      manifest.spritesheet,
      ...manifest.additionalSheets,
    ].entries()) {
      const frames = manifest.frames.filter(
        (frame) => frame.page === index && selected.has(frame.id),
      );
      if (!frames.length) continue;
      const url = `http://parity.test/${look}-${index}.png`;
      await page.route(url, (route) =>
        route.fulfill({
          body: Buffer.from(files[sheet.file]),
          contentType: "image/png",
        }),
      );
      const results = await page.evaluate(
        async ({ url, frames }) => {
          const blob = await (await fetch(url)).blob();
          const bitmap = await createImageBitmap(blob);
          const objectUrl = URL.createObjectURL(blob);
          const image = new Image();
          image.src = objectUrl;
          await image.decode();
          const surfaces = [
            document.createElement("canvas"),
            document.createElement("canvas"),
          ];
          const results = [];
          try {
            for (const frame of frames)
              for (const scale of [1, 0.5])
                for (const facing of ["right", "left"]) {
                  const pixels = [bitmap, image].map((source, n) => {
                    const canvas = surfaces[n];
                    canvas.width = frame.width * scale;
                    canvas.height = frame.height * scale;
                    const ctx = canvas.getContext("2d", {
                      willReadFrequently: true,
                    });
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = "high";
                    if (facing === "left") {
                      ctx.translate(canvas.width, 0);
                      ctx.scale(-1, 1);
                    }
                    ctx.drawImage(
                      source,
                      frame.x,
                      frame.y,
                      frame.width,
                      frame.height,
                      0,
                      0,
                      canvas.width,
                      canvas.height,
                    );
                    return ctx.getImageData(0, 0, canvas.width, canvas.height)
                      .data;
                  });
                  let differingChannels = 0,
                    partialAlphaPixels = 0,
                    maxDifference = 0;
                  for (let i = 0; i < pixels[0].length; i++) {
                    const difference = Math.abs(pixels[0][i] - pixels[1][i]);
                    if (difference) differingChannels++;
                    maxDifference = Math.max(maxDifference, difference);
                    if (i % 4 === 3 && pixels[0][i] > 0 && pixels[0][i] < 255)
                      partialAlphaPixels++;
                  }
                  results.push({
                    frameId: frame.id,
                    scale,
                    facing,
                    differingChannels,
                    maxDifference,
                    partialAlphaPixels,
                  });
                }
          } finally {
            bitmap.close();
            image.src = "";
            URL.revokeObjectURL(objectUrl);
          }
          return results;
        },
        { url, frames },
      );
      pack.pages.push({
        index,
        file: sheet.file,
        pngSha256: sha(files[sheet.file]),
        results,
      });
      await page.unroute(url);
      assert(
        results.every((result) => result.differingChannels === 0),
        "ImageBitmap and HTML pixels differ",
      );
      assert(
        results.some((result) => result.partialAlphaPixels > 0),
        "Expected actual antialiased character edges",
      );
    }
  }
  report.passed = true;
} finally {
  report.completedAt = new Date().toISOString();
  await browser.close();
  await writeFile(
    join(root, "docs/kling-wardrobe/fit-v2/browser/bitmap-pixel-parity.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  `Exact decoder parity: ${report.packs.flatMap((pack) => pack.pages.flatMap((page) => page.results)).length} actual exported crops.`,
);
