// High-frequency synthetic artwork proves sampling behavior, not visual quality.
import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { encodeSourceRgbaPng } from "../../src/core/baked-source";
import { createThemeBundle } from "../../src/themes/bundle";

async function drawing(pixel: boolean) {
  const size = pixel ? 8 : 16;
  const characterId = `presentation-${pixel ? "pixel" : "original"}`;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 1; y < size - 1; y++)
    for (let x = 1; x < size - 1; x++)
      pixels.set(
        [x % 2 ? 230 : 20, y % 2 ? 190 : 40, pixel ? 150 : 70, 255],
        (y * size + x) * 4,
      );
  const manifest = {
    schemaVersion: pixel ? 4 : 2,
    format: "gathria-character-pack",
    name: characterId,
    generator: "synthetic-presentation-regression",
    spritesheet: {
      file: "spritesheet.png",
      width: size,
      height: size,
      frameWidth: size,
      frameHeight: size,
      columns: 1,
      rows: 1,
    },
    ...(pixel ? { additionalSheets: [] } : {}),
    frames: [
      {
        id: 0,
        x: 0,
        y: 0,
        width: size,
        height: size,
        ...(pixel ? { page: 0 } : {}),
      },
    ],
    animations: Object.fromEntries(
      ["idle", "walk", "run", "jump", "celebrate"].map((action) => [
        action,
        { frames: [0], fps: 8, loop: action !== "jump" },
      ]),
    ),
    anchor: { x: size / 2, y: size, units: "pixels", origin: "top-left" },
    facing: { native: "right", right: "none", left: "mirror-x" },
    scale: { pixelArt: pixel, integerOnly: pixel, recommended: 1 },
    capabilities: { renderMode: "baked", editableAppearance: false },
    configuration: "character.json",
  };
  const config = {
    format: "gathria-baked-character",
    schemaVersion: 1,
    name: characterId,
    characterId,
    source: {
      kind: "unified-archive",
      name: "synthetic-presentation.zip",
      sha256: "a".repeat(64),
    },
    provenance: "Synthetic sampling regression only, not visual evidence.",
    derivation: {
      method: "Synthetic sampling regression",
      frames: [{ frameId: 0, sourceFrame: 0, timeSeconds: 0 }],
    },
  };
  const bytes = zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "character.json": strToU8(JSON.stringify(config)),
    "spritesheet.png": encodeSourceRgbaPng({
      width: size,
      height: size,
      pixels,
      colorChunks: [],
    }),
    "PROVENANCE.txt": strToU8(config.provenance),
    "INTEGRATION.md": strToU8("Synthetic test fixture only."),
  });
  const theme = await createThemeBundle({
    id: pixel ? "presentation-pixel" : "kling-original",
    revision: 1,
    name: pixel ? "Presentation pixel" : "Kling original",
    character: "male",
    characterId,
    rendering: pixel ? "pixel" : "smooth",
    reference: { sourceSha256: "a".repeat(64), description: config.provenance },
    provenance: config.provenance,
    looks: [{ logicalId: "base", name: "Sampling fixture", bytes }],
  });
  return { theme, pixels, size };
}

test("2× normalized smooth comparison draws original source pixels directly while pixel backing stays native", async ({
  page,
}) => {
  const original = await drawing(false),
    pixel = await drawing(true);
  const entries = [original, pixel].map(({ theme }) => ({
    key: theme.key,
    name: theme.manifest.name,
    character: "male",
    description: "Synthetic sampling fixture",
    isOriginal: theme.manifest.id === "kling-original",
    sha256: theme.sha256,
    url: `/__presentation_fixture/${theme.manifest.id}.zip`,
  }));
  await page.route("**/src/themes/catalog.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `import {readThemeBundle} from '/src/themes/bundle.ts'; export const THEME_CATALOG=${JSON.stringify(entries)}.map(e=>({...e,load:async(options)=>readThemeBundle(new Uint8Array(await (await fetch(e.url,{signal:options.signal})).arrayBuffer()),options)}));`,
    }),
  );
  await page.route("**/__presentation_fixture/*.zip", (route) =>
    route.fulfill({
      contentType: "application/zip",
      body: Buffer.from(
        route.request().url().includes("kling-original")
          ? original.theme.bytes
          : pixel.theme.bytes,
      ),
    }),
  );
  await page.goto("/workbench.html?character=male&mode=themes");
  const panel = page.getByRole("region", {
    name: "Character themes",
    exact: true,
  });
  await expect(panel.getByRole("status")).toContainText(
    "Kling original selected",
  );
  await panel.getByRole("button", { name: /^Presentation pixel/ }).click();
  await expect(panel.getByRole("status")).toContainText(
    "Presentation pixel selected",
  );
  await panel.getByLabel("Compare Kling original", { exact: true }).check();
  await panel
    .getByLabel("Theme display scale", { exact: true })
    .selectOption("2");

  for (const facing of ["right", "left"] as const) {
    await panel
      .getByLabel("Theme facing", { exact: true })
      .selectOption(facing);
    for (const [testId, source] of [
      ["theme-reference", original],
      ["theme-preview", pixel],
    ] as const) {
      const canvas = panel.getByTestId(testId);
      await expect(canvas).toHaveAttribute("data-facing", facing);
      const actual = await canvas.evaluate((target: HTMLCanvasElement) => ({
        width: target.width,
        height: target.height,
        cssWidth: target.getBoundingClientRect().width,
        cssHeight: target.getBoundingClientRect().height,
        pixels: Array.from(
          target
            .getContext("2d")!
            .getImageData(0, 0, target.width, target.height).data,
        ),
      }));
      expect([actual.width, actual.height]).toEqual([source.size, source.size]);
      expect([actual.cssWidth, actual.cssHeight]).toEqual([16, 16]);
      const expected = new Uint8Array(source.pixels);
      if (facing === "left")
        for (let y = 0; y < source.size; y++)
          for (let x = 0; x < source.size; x++)
            expected.set(
              source.pixels.subarray(
                (y * source.size + source.size - 1 - x) * 4,
                (y * source.size + source.size - x) * 4,
              ),
              (y * source.size + x) * 4,
            );
      // Original 16px source goes directly to its 16px presentation canvas.
      // A downsample to 8px followed by CSS enlargement cannot pass this check.
      expect(actual.pixels).toEqual(Array.from(expected));
    }
  }
});
