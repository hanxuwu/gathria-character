// Freeze Motion 2 actual browser exports before isolated limb repairs. Never writes old evidence.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url),
  review = new URL("docs/run-connections/before/", root);
// A saved before stage is immutable; rerun in a separate checkout/output directory.
try {
  await access(new URL("exports-validation.json", review));
  throw Error("Before exports already exist; preserve the captured baseline.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const revisionPaths = [
  "src/core/everyday-presets.ts",
  "src/core/running-rig-v2.ts",
  "src/core/running-rig.ts",
  "src/core/generator-motion-v2.ts",
  "src/core/generator-motion-v1.ts",
  "src/core/polished-rig.ts",
  "src/core/polished-assets.generated.ts",
  "src/core/generator-v6.ts",
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
const initialRevision = await hashes();
const origin = "http://127.0.0.1:5176";
const server = await createServer({
  server: { host: "127.0.0.1", port: 5176, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const errors = [],
  external = [],
  forbidden = [];
process.once("SIGTERM", async () => {
  await browser.close();
  await server.close();
  process.exit(143);
});
try {
  await mkdir(review, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  context.on("request", (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(origin))
      external.push(r.url());
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  const exports = await page.evaluate(async () => {
    const { parseCharacterConfig } = await import("/src/core/config.ts");
    const { generateCharacter } = await import("/src/core/generator.ts");
    const { createCharacterPack, loadCharacterPack } = await import(
      "/src/core/pack.ts"
    );
    const { EVERYDAY_EXAMPLES } = await import("/src/core/everyday-presets.ts");
    const requests = EVERYDAY_EXAMPLES.map(({ id, label, config }) => ({
      id,
      label,
      config: { ...config, motionVersion: 2 },
    }));
    if (requests.length !== 4 || new Set(requests.map((x) => x.id)).size !== 4)
      throw Error("Expected four distinct complete everyday looks.");
    const output = [];
    for (const item of requests) {
      const config = parseCharacterConfig(item.config),
        g = generateCharacter(config),
        again = generateCharacter(
          parseCharacterConfig(JSON.parse(JSON.stringify(config))),
        );
      if (g.pixels.some((v, i) => v !== again.pixels[i]))
        throw Error(item.id + ": nondeterministic round trip");
      const legacyConfig = { ...config };
      delete legacyConfig.motionVersion;
      delete legacyConfig.preview;
      const legacy = generateCharacter(legacyConfig);
      if (
        legacy.height !== 512 ||
        g.pixels
          .subarray(0, legacy.pixels.length)
          .some((v, i) => v !== legacy.pixels[i])
      )
        throw Error(item.id + ": V6 idle/walk rows changed");
      const motion1 = generateCharacter({ ...config, motionVersion: 1 });
      if (
        g.pixels
          .subarray(0, g.width * 512 * 4)
          .some((v, i) => v !== motion1.pixels[i])
      )
        throw Error(item.id + ": idle/walk differs from explicit motion1");
      const archive = await createCharacterPack(config, g),
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
        throw Error(item.id + ": PNG decode differs from renderer");
      const raw = new Uint8Array(await archive.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < raw.length; offset += 32768)
        binary += String.fromCharCode(...raw.subarray(offset, offset + 32768));
      output.push({
        id: item.id,
        label: item.label,
        config,
        matchesCompletePreset: true,
        motion1RowsVerified: true,
        legacyRowsVerified: true,
        roundTripVerified: true,
        exportedRgbaVerified: true,
        bytesBase64: btoa(binary),
      });
    }
    return output;
  });
  for (const item of exports) {
    const dir = new URL(item.id + "/", review);
    await mkdir(dir, { recursive: true });
    const archive = Buffer.from(item.bytesBase64, "base64");
    item.zipSha256 = createHash("sha256").update(archive).digest("hex");
    await writeFile(new URL(item.id + ".character.zip", review), archive);
    for (const [name, bytes] of Object.entries(unzipSync(archive)))
      await writeFile(new URL(name, dir), bytes);
  }

  assert.deepEqual(
    await hashes(),
    initialRevision,
    "Preset or renderer changed during export.",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile(
    new URL("exports-validation.json", review),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        revisionFiles: initialRevision,
        exports: exports.map(({ bytesBase64, ...item }) => item),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Saved ${exports.length} real exports; PNG pixels, deterministic round trips and unchanged V6 rows verified.`,
  );
} finally {
  await browser.close();
  await server.close();
}
