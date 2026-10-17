// Fast review loop: two real browser exports, retained in a numbered iteration.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { unzipSync } from "fflate";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url),
  iteration = process.argv[2] || "01";
if (!/^\d{2}$/.test(iteration)) throw Error("Expected two-digit iteration");
const review = new URL(`docs/running-v2/iterations/${iteration}/`, root);
const revisionPaths = [
  "src/core/running-rig-v2.ts",
  "src/core/generator-motion-v2.ts",
  "src/core/polished-rig.ts",
  "src/core/polished-assets.generated.ts",
];
async function hashes() {
  return Object.fromEntries(
    await Promise.all(
      revisionPaths.map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(new URL(file, root)))
          .digest("hex"),
      ]),
    ),
  );
}
const revisionFiles = await hashes();
const configs = await Promise.all(
  ["dress", "suit"].map(async (who) => ({
    who,
    config: JSON.parse(
      await readFile(
        new URL(`docs/running-baseline/${who}/character.json`, root),
        "utf8",
      ),
    ),
  })),
);
const server = await createServer({
  server: { host: "127.0.0.1", port: 5183, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5183");
  const exports = await page.evaluate(async (items) => {
    const { enableCompactRunning } = await import("/src/core/config.ts");
    const { generateCharacter } = await import("/src/core/generator.ts");
    const { createCharacterPack, loadCharacterPack } = await import(
      "/src/core/pack.ts"
    );
    const results = [];
    for (const item of items) {
      const config = enableCompactRunning(item.config),
        g = generateCharacter(config),
        archive = await createCharacterPack(config, g),
        pack = await loadCharacterPack(archive);
      const c = document.createElement("canvas");
      c.width = g.width;
      c.height = g.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(pack.image, 0, 0);
      if (
        ctx
          .getImageData(0, 0, g.width, g.height)
          .data.some((v, i) => v !== g.pixels[i])
      )
        throw Error("PNG differs");
      results.push({
        who: item.who,
        bytes: Array.from(new Uint8Array(await archive.arrayBuffer())),
      });
    }
    return results;
  }, configs);
  assert.deepEqual(
    await hashes(),
    revisionFiles,
    "Renderer changed during capture; retry after edits finish.",
  );
  await mkdir(review, { recursive: true });
  const samples = new URL("public/samples/running-v2/", root);
  await mkdir(samples, { recursive: true });
  for (const item of exports) {
    const bytes = Uint8Array.from(item.bytes),
      dir = new URL(item.who + "/", review);
    await mkdir(dir, { recursive: true });
    await writeFile(new URL(item.who + ".character.zip", review), bytes);
    await writeFile(new URL(item.who + ".character.zip", samples), bytes);
    for (const [name, data] of Object.entries(unzipSync(bytes)))
      await writeFile(new URL(name, dir), data);
  }
  await writeFile(
    new URL("iteration-index.json", review),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        iteration,
        revisionFiles,
        actualBrowserExport: true,
        pngDecodeMatchesRenderer: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Actual exported iteration saved: " + review.pathname);
} finally {
  await browser.close();
  await server.close();
}
