// Real browser renderer -> PNG/ZIP exporter -> independent player.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url);
const review = new URL("docs/art-cohesive/", root);
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
      DEFAULT_CONFIG,
      OUTFIT_PRESETS,
      upgradeToCohesiveArt,
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
          config: { ...upgradeToCohesiveArt(old), expression },
        });
      for (const upperClothing of ["tee", "hoodie", "jacket", "suit", "bodice"])
        requests.push({
          id: style + "-outfit-" + upperClothing,
          config: {
            ...upgradeToCohesiveArt(old),
            upperClothing,
            expression: "gentle",
          },
        });
      requests.push({
        id: style + "-dark-skin",
        config: {
          ...upgradeToCohesiveArt(old),
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
  await page.screenshot({
    path: new URL("studio-desktop.png", review).pathname,
    fullPage: true,
  });
  const player = await context.newPage();
  player.on("pageerror", (e) => errors.push(e.message));
  await page.close();
  await player.setViewportSize({ width: 1300, height: 1000 });
  const forbidden = [];
  player.on("request", (r) => {
    if (
      /\/src\/(editor|core\/(generator|cohesive|illustrated|expressive))/.test(
        r.url(),
      )
    )
      forbidden.push(r.url());
  });
  await player.goto("http://127.0.0.1:5177/player.html");
  const playback = [];
  for (const id of ["dress-joyful", "suit-joyful"]) {
    await player
      .locator('input[type=file][accept=".zip,application/zip"]')
      .setInputFiles(new URL(id + ".character.zip", review).pathname);
    await player
      .getByText("gathria-cohesive-pixels-v5", { exact: true })
      .waitFor();
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
        const labels = await player
          .locator(".player-canvas-wrap canvas, .canvas-wrap canvas, canvas")
          .first()
          .evaluate(
            async (c, { animation }) => {
              const set = new Set();
              const end =
                performance.now() + (animation === "idle" ? 3150 : 950);
              while (performance.now() < end) {
                set.add(c.getAttribute("aria-label"));
                await new Promise((r) => requestAnimationFrame(r));
              }
              return [...set];
            },
            { animation },
          );
        playback.push({ id, animation, facing, labels });
        assert(labels.length > 1, `${id} ${animation} did not advance`);
      }
  }
  await player.screenshot({
    path: new URL("independent-player.png", review).pathname,
    fullPage: true,
  });
  assert.deepEqual(forbidden, []);
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  const index = {
    source:
      "Actual browser generateCharacter -> createCharacterPack -> PNG decode; independently loaded after closing Studio",
    artworkVersion: 5,
    garmentSourceSha256: createHash("sha256").update(await readFile(new URL("artwork/cohesive-source/garment-backplate.png", root))).digest("hex"),
    preparedBankSha256: createHash("sha256").update(await readFile(new URL("src/core/cohesive-assets.generated.ts", root))).digest("hex"),
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
