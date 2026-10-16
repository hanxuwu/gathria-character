// Real application exports, frozen V6 comparison, then isolated consumer playback.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url),
  review = new URL("docs/everyday/", root);
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
const origin = "http://127.0.0.1:5182";
const server = await createServer({
  server: { host: "127.0.0.1", port: 5182, strictPort: true },
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
    recordVideo: {
      dir: new URL("../.cache/everyday-video/", root).pathname,
      size: { width: 960, height: 732 },
    },
  });
  context.on("request", (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(origin))
      external.push(r.url());
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  const reuseExports = process.env.EVERYDAY_REUSE_EXPORTS === "1";
  let checkpoint;
  let exports;
  if (reuseExports) {
    checkpoint = JSON.parse(
      await readFile(new URL("exports-validation.json", review), "utf8"),
    );
    assert.deepEqual(
      checkpoint.revisionFiles,
      initialRevision,
      "Cannot reuse exports after renderer changes.",
    );
    exports = checkpoint.exports;
    for (const item of exports) {
      const archive = await readFile(
        new URL(item.id + ".character.zip", review),
      );
      const digest = createHash("sha256").update(archive).digest("hex");
      assert.equal(
        typeof item.zipSha256,
        "string",
        "Reuse requires a captured ZIP hash; run a fresh export.",
      );
      assert.equal(item.zipSha256, digest);
      item.zipSha256 = digest;
      for (const [name, bytes] of Object.entries(unzipSync(archive)))
        assert.deepEqual(
          Buffer.from(bytes),
          await readFile(new URL(item.id + "/" + name, review)),
        );
      assert.deepEqual(
        JSON.parse(
          await readFile(new URL(item.id + "/character.json", review), "utf8"),
        ),
        item.config,
      );
    }
  } else {
    exports = await page.evaluate(async () => {
      const { parseCharacterConfig } = await import("/src/core/config.ts");
      const { generateCharacter } = await import("/src/core/generator.ts");
      const { createCharacterPack, loadCharacterPack } = await import(
        "/src/core/pack.ts"
      );
      const { EVERYDAY_EXAMPLES } = await import(
        "/src/core/everyday-presets.ts"
      );
      const requests = EVERYDAY_EXAMPLES.map(({ id, label, config }) => ({
        id,
        label,
        config,
      }));
      if (
        requests.length !== 4 ||
        new Set(requests.map((x) => x.id)).size !== 4
      )
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
          binary += String.fromCharCode(
            ...raw.subarray(offset, offset + 32768),
          );
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
  }
  const sampleDir = new URL("public/samples/everyday/", root);
  await mkdir(sampleDir, { recursive: true });
  for (const item of exports)
    await writeFile(
      new URL(item.id + ".character.zip", sampleDir),
      await readFile(new URL(item.id + ".character.zip", review)),
    );
  assert.deepEqual(
    await hashes(),
    initialRevision,
    "Preset or renderer changed during export.",
  );
  await writeFile(
    new URL("exports-validation.json", review),
    JSON.stringify(
      {
        capturedAt: checkpoint?.capturedAt ?? new Date().toISOString(),
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
  if (process.env.EVERYDAY_EXPORT_ONLY === "1") {
    console.log(
      `Saved ${exports.length} candidate everyday packs; stopped before player capture for visual review.`,
    );
  } else {
    const first = exports[0];
    await page
      .getByLabel("Open character configuration", { exact: true })
      .setInputFiles(new URL(first.id + "/character.json", review).pathname);
    const previewRegion = page.getByRole("region", {
      name: "Animation preview",
    });
    await previewRegion
      .getByRole("img", {
        name: `${first.config.name}, ${first.config.preview?.animation ?? "idle"}, facing ${first.config.preview?.facing ?? "right"}`,
        exact: true,
      })
      .waitFor();
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await page.getByRole("button", { name: "Face right", exact: true }).click();
    await previewRegion
      .getByRole("img", {
        name: `${first.config.name}, run, facing right`,
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Run", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.getByLabel("Pixel zoom", { exact: true }).selectOption("2");
    await page.screenshot({
      path: new URL("studio-everyday.png", review).pathname,
      fullPage: true,
    });
    // The consumer is opened only after Studio has closed. Generator imports are blocked.
    await page.close();
    const player = await context.newPage();
    player.on("pageerror", (e) => errors.push(e.message));
    await player.setViewportSize({ width: 1300, height: 1000 });
    const forbiddenPattern =
      /\/src\/(editor|core\/(generator|running-rig|cohesive|polished|harmonized|illustrated|expressive))/;
    await player.route(forbiddenPattern, (route) => {
      forbidden.push(route.request().url());
      return route.abort();
    });
    await player.goto(origin + "/player.html");
    await player
      .locator('input[type=file][accept=".zip,application/zip"]')
      .setInputFiles(
        new URL("docs/running-baseline/dress.character.zip", root).pathname,
      );
    await player
      .getByText("Run unavailable: this pack includes Idle and Walk only.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await player
        .getByRole("button", { name: "Run", exact: true })
        .isDisabled(),
      true,
    );
    await player.screenshot({
      path: new URL("legacy-pack-run-unavailable.png", review).pathname,
      fullPage: true,
    });
    const playback = [];
    for (const { id } of exports) {
      await player
        .locator('input[type=file][accept=".zip,application/zip"]')
        .setInputFiles(new URL(id + ".character.zip", review).pathname);
      await player
        .getByText("gathria-polished-pixels-v6-motion-v2", { exact: true })
        .waitFor();
      await player.getByText(id + ".character.zip", { exact: true }).waitFor();
      const animations = ["run"];
      for (const animation of animations)
        for (const facing of ["right", "left"]) {
          await player
            .getByRole("button", {
              name: animation[0].toUpperCase() + animation.slice(1),
              exact: true,
            })
            .click();
          await player
            .getByRole("button", {
              name: facing === "left" ? "Left" : "Right",
              exact: true,
            })
            .click();
          const raster = await player.getByTestId("consumer-canvas").evaluate(
            async (canvas, { id, animation, facing }) => {
              const manifest = await (
                  await fetch(`/docs/everyday/${id}/manifest.json`)
                ).json(),
                sheet = await createImageBitmap(
                  await (
                    await fetch(`/docs/everyday/${id}/spritesheet.png`)
                  ).blob(),
                );
              const expected = new Map();
              for (const frameId of new Set(
                manifest.animations[animation].frames,
              )) {
                const f = manifest.frames.find((f) => f.id === frameId),
                  c = document.createElement("canvas");
                c.width = 192;
                c.height = 256;
                const ctx = c.getContext("2d");
                if (facing === "left") {
                  ctx.translate(192, 0);
                  ctx.scale(-1, 1);
                }
                ctx.drawImage(sheet, f.x, f.y, 192, 256, 0, 0, 192, 256);
                expected.set(frameId, ctx.getImageData(0, 0, 192, 230).data);
              }
              sheet.close();
              await new Promise((r) =>
                requestAnimationFrame(() => requestAnimationFrame(r)),
              );
              const ctx = canvas.getContext("2d"),
                labels = new Set(),
                transitions = [],
                seen = new Set();
              const start = performance.now(),
                duration =
                  (manifest.animations[animation].frames.length * 1000) /
                  manifest.animations[animation].fps;
              let previous = -1;
              while (performance.now() < start + duration * 3 + 150) {
                const pixels = ctx.getImageData(
                  Math.round(canvas.width / 2) - 96,
                  Math.floor((canvas.height - 256) / 2),
                  192,
                  230,
                ).data;
                const matches = [...expected].filter(([, p]) =>
                  p.every((v, i) => v === pixels[i]),
                );
                if (!matches.length)
                  throw Error(
                    `${id} ${animation}/${facing}: canvas differs from exported PNG`,
                  );
                // Opposite phases can intentionally use identical visible drawings
                // (the bride's legs remain covered). Verify the live frame ID against
                // that ID's PNG, instead of assigning the first matching drawing's ID.
                const label = canvas.getAttribute("aria-label");
                const frame = Number(label.match(/frame (\d+)$/)[1]);
                labels.add(label);
                if (matches.some(([candidate]) => candidate === frame)) {
                  seen.add(frame);
                  if (frame !== previous) {
                    transitions.push({
                      frame,
                      ms: Math.round(performance.now() - start),
                    });
                    previous = frame;
                  }
                }
                await new Promise((r) => requestAnimationFrame(r));
              }
              return {
                labels: [...labels],
                pixelVerifiedFrames: [...seen].sort((a, b) => a - b),
                transitions,
              };
            },
            { id, animation, facing },
          );
          const manifest = JSON.parse(
            await readFile(new URL(id + "/manifest.json", review)),
          );
          assert.deepEqual(
            raster.pixelVerifiedFrames,
            [...new Set(manifest.animations[animation].frames)].sort(
              (a, b) => a - b,
            ),
            `${id}: all ${animation} frames must play`,
          );
          playback.push({ id, animation, facing, ...raster });
        }
    }
    // Final screenshot shows a real run, no editor remains open.
    await writeFile(
      new URL("playback-validation.json", review),
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          revisionFiles: initialRevision,
          playback,
          errors,
          external,
          forbidden,
        },
        null,
        2,
      ) + "\n",
    );
    await player.locator("#player-zoom").selectOption("2");
    await player.screenshot({
      path: new URL("independent-player.png", review).pathname,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    assert.deepEqual(forbidden, []);
    const video = player.video();
    await context.close();
    await video.saveAs(new URL("independent-player.webm", review).pathname);
    const revisionFiles = await hashes();
    assert.deepEqual(
      revisionFiles,
      initialRevision,
      "Renderer changed during capture; retry after edits finish.",
    );
    const index = {
      source:
        "Actual EVERYDAY_EXAMPLES -> browser generateCharacter -> createCharacterPack -> decoded PNG equality; independent consumer after closing Studio.",
      capturedAt: new Date().toISOString(),
      exportCapturedAt: checkpoint?.capturedAt ?? "same capture",
      reusedValidatedExports: reuseExports,
      artworkVersion: 6,
      motionVersion: 2,
      revisionFiles,
      exports: exports.map(({ bytesBase64, ...item }) => item),
      playback,
      legacyPackRunUnavailable: true,
      livePixelRegion:
        "192 x 230 px per frame; bottom attachment guide excluded",
      errors,
      external,
      forbidden,
    };
    await writeFile(
      new URL("evidence-index.json", review),
      JSON.stringify(index, null, 2) + "\n",
    );
    console.log(
      `Exported and pixel-verified ${exports.length} running packs; ${playback.length} independent playback cases; original V6 rows preserved.`,
    );
  }
} finally {
  await browser.close();
  await server.close();
}
