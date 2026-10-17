// Real browser renderer -> PNG/ZIP exporter -> independent player.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url);
const review = new URL("docs/art-polished/", root);
const server = await createServer({
  server: { host: "127.0.0.1", port: 5177, strictPort: true },
});
await server.listen();
const args = process.env.CHROMIUM_ARGS_JSON
  ? JSON.parse(process.env.CHROMIUM_ARGS_JSON)
  : ["--no-sandbox", "--disable-dev-shm-usage"];
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args,
});
const errors = [],
  external = [];
try {
  await mkdir(review, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    recordVideo: {
      dir: new URL("../.cache/v6-video/", root).pathname,
      size: { width: 960, height: 732 },
    },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  context.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith("http://127.0.0.1:5177")
    )
      external.push(r.url());
  });
  await page.goto("http://127.0.0.1:5177");
  const exports = await page.evaluate(async () => {
    const {
      COHESIVE_DEFAULT_CONFIG: DEFAULT_CONFIG,
      OUTFIT_PRESETS,
      upgradeToPolishedArt,
      parseCharacterConfig,
    } = await import("/src/core/config.ts");
    const { generateCharacter } = await import("/src/core/generator.ts");
    const { createCharacterPack, loadCharacterPack } = await import(
      "/src/core/pack.ts"
    );
    const requests = [];
    for (const style of ["dress", "suit"]) {
      const old = {
        ...DEFAULT_CONFIG,
        ...OUTFIT_PRESETS.find((x) => x.id === "wedding-" + style).appearance,
        name: "Wedding " + style,
        hairstyle: style === "dress" ? "waves" : "crop",
        faceVariant: style === "dress" ? "heart" : "oval",
        hairColor: "#43312E",
        skinTone: "#E5AE87",
        hairAccessory: style === "dress" ? "flowers" : "none",
        expression: "joyful",
        ...(style === "suit" ? { shoeColor: "#785542" } : {}),
      };
      requests.push({ id: "before-" + style, config: old });
      for (const expression of ["neutral", "gentle", "joyful"])
        requests.push({
          id: style + "-" + expression,
          config: { ...upgradeToPolishedArt(old), expression },
        });
      for (const upperClothing of ["tee", "hoodie", "jacket", "suit", "bodice"])
        requests.push({
          id: style + "-outfit-" + upperClothing,
          config: {
            ...upgradeToPolishedArt(old),
            upperClothing,
            expression: "gentle",
          },
        });
      requests.push({
        id: style + "-dark-skin",
        config: {
          ...upgradeToPolishedArt(old),
          skinTone: "#553B32",
          hairColor: "#E9CF8D",
        },
      });
    }
    const outputs = [];
    for (const item of requests) {
      const config = parseCharacterConfig(item.config),
        g = generateCharacter(config),
        again = generateCharacter(
          parseCharacterConfig(JSON.parse(JSON.stringify(config))),
        );
      if (g.pixels.some((v, i) => v !== again.pixels[i]))
        throw Error(item.id + ": round-trip mismatch");
      if (config.artworkVersion !== (item.id.startsWith("before-") ? 5 : 6))
        throw Error("Wrong evidence artwork version");
      const archive = await createCharacterPack(config, g),
        pack = await loadCharacterPack(archive);
      const c = document.createElement("canvas");
      c.width = g.width;
      c.height = g.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(pack.image, 0, 0);
      if (
        ctx
          .getImageData(0, 0, c.width, c.height)
          .data.some((v, i) => v !== g.pixels[i])
      )
        throw Error(item.id + ": exported PNG differs from renderer");
      outputs.push({
        ...item,
        config,
        bytes: Array.from(new Uint8Array(await archive.arrayBuffer())),
      });
    }
    return outputs;
  });
  for (const item of exports) {
    const dir = new URL(item.id + "/", review);
    await mkdir(dir, { recursive: true });
    const archive = Uint8Array.from(item.bytes);
    await writeFile(new URL(item.id + ".character.zip", review), archive);
    for (const [name, bytes] of Object.entries(unzipSync(archive)))
      await writeFile(new URL(name, dir), bytes);
  }
  for (const id of ["dress-joyful", "suit-joyful"]) {
    const dir = new URL("public/samples/polished/", root);
    await mkdir(dir, { recursive: true });
    await writeFile(
      new URL(id + ".character.zip", dir),
      await readFile(new URL(id + ".character.zip", review)),
    );
  }
  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(new URL("dress-joyful/character.json", review).pathname);
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await page.getByLabel("Pixel zoom", { exact: true }).selectOption("2");
  await page.screenshot({
    path: new URL("studio-desktop.png", review).pathname,
    fullPage: true,
  });
  const player = await context.newPage();
  player.on("pageerror", (e) => errors.push(e.message));
  await page.close();
  await player.setViewportSize({ width: 1300, height: 1000 });
  const forbidden = [];
  await player.route(
    /\/src\/(editor|core\/(generator|cohesive|polished|illustrated|expressive))/,
    (route) => {
      forbidden.push(route.request().url());
      return route.abort();
    },
  );
  player.on("request", (r) => {
    if (
      /\/src\/(editor|core\/(generator|cohesive|polished|illustrated|expressive))/.test(
        r.url(),
      )
    )
      forbidden.push(r.url());
  });
  await player.goto("http://127.0.0.1:5177/player.html");
  await player
    .getByRole("button", { name: /Try the polished wedding pack/ })
    .click();
  await player
    .getByText("gathria-polished-pixels-v6", { exact: true })
    .waitFor();
  const playback = [];
  for (const id of [
    "dress-neutral",
    "dress-gentle",
    "dress-joyful",
    "suit-neutral",
    "suit-gentle",
    "suit-joyful",
  ]) {
    await player
      .locator('input[type=file][accept=".zip,application/zip"]')
      .setInputFiles(new URL(id + ".character.zip", review).pathname);
    await player
      .getByText("gathria-polished-pixels-v6", { exact: true })
      .waitFor();
    await player.getByText(id + ".character.zip", { exact: true }).waitFor();
    for (const animation of ["idle", "walk"])
      for (const facing of ["right", "left"]) {
        await player
          .getByRole("button", {
            name: animation === "idle" ? "Idle" : "Walk",
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
              await fetch(`/docs/art-polished/${id}/manifest.json`)
            ).json();
            const sheet = await createImageBitmap(
              await (
                await fetch(`/docs/art-polished/${id}/spritesheet.png`)
              ).blob(),
            );
            const expected = new Map();
            // Compare the actual live canvas against independently cropped PNG
            // pixels, excluding only the bottom ten rows with the anchor guide.
            for (const frameId of new Set(
              manifest.animations[animation].frames,
            )) {
              const f = manifest.frames[frameId],
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
              end = start + (animation === "idle" ? 3150 : 950);
            let previous = -1;
            while (performance.now() < end) {
              const pixels = ctx.getImageData(
                Math.round(canvas.width / 2) - 96,
                Math.floor((canvas.height - 256) / 2),
                192,
                230,
              ).data;
              const match = [...expected].find(([, p]) =>
                p.every((v, i) => v === pixels[i]),
              );
              if (!match)
                throw Error(
                  `${id} ${animation}/${facing}: live pixels differ from exported frames`,
                );
              const frame = match[0];
              seen.add(frame);
              labels.add(canvas.getAttribute("aria-label"));
              if (frame !== previous) {
                transitions.push({
                  frame,
                  ms: Math.round(performance.now() - start),
                });
                previous = frame;
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
        const labels = raster.labels;
        playback.push({ id, animation, facing, ...raster });
        const observed = [
          ...new Set(
            labels.map((label) => Number(label.match(/frame (\d+)$/)[1])),
          ),
        ].sort((a, b) => a - b);
        const manifest = JSON.parse(
          await readFile(new URL(id + "/manifest.json", review)),
        );
        assert.deepEqual(
          observed,
          [...new Set(manifest.animations[animation].frames)].sort(
            (a, b) => a - b,
          ),
          `${id} ${animation}/${facing}: all frames must play`,
        );
        assert.deepEqual(
          raster.pixelVerifiedFrames,
          observed,
          `${id} ${animation}/${facing}: live PNG and mirroring checks`,
        );
      }
  }
  await player.screenshot({
    path: new URL("independent-player.png", review).pathname,
    fullPage: true,
  });
  assert.deepEqual(forbidden, []);
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  const video = player.video();
  await context.close();
  await video.saveAs(new URL("independent-player.webm", review).pathname);
  const index = {
    source:
      "Actual browser generateCharacter -> createCharacterPack -> PNG decode; independently loaded after closing Studio",
    artworkVersion: 6,
    baselineCommit: "bd731c64f133eb631c1e996991d263f026c2d006",
    revisionFiles: Object.fromEntries(
      await Promise.all(
        [
          "src/core/polished-rig.ts",
          "src/core/generator-v6.ts",
          "scripts/prepare-polished-assets.py",
        ].map(async (file) => [
          file,
          createHash("sha256")
            .update(await readFile(new URL(file, root)))
            .digest("hex"),
        ]),
      ),
    ),
    garmentSourceSha256: createHash("sha256")
      .update(
        await readFile(
          new URL("artwork/cohesive-source/garment-backplate.png", root),
        ),
      )
      .digest("hex"),
    preparedBankSha256: createHash("sha256")
      .update(
        await readFile(new URL("src/core/polished-assets.generated.ts", root)),
      )
      .digest("hex"),
    sourceSha256: createHash("sha256")
      .update(
        await readFile(
          new URL(
            "artwork/cohesive-source/character-expression-bank.png",
            root,
          ),
        ),
      )
      .digest("hex"),
    exports: exports.map(({ id, config }) => ({ id, config })),
    playback,
    errors,
    external,
    forbidden,
  };
  await writeFile(
    new URL("evidence-index.json", review),
    JSON.stringify(index, null, 2) + "\n",
  );
  console.log(
    `Exported and pixel-verified ${exports.length} packs; ${playback.length} independent player cycles.`,
  );
} finally {
  await browser.close();
  await server.close();
}
