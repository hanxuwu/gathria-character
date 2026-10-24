import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { encodeSourceRgbaPng } from "../../src/core/baked-source";
import { createBakedCharacterPack } from "../../src/core/pack";
import type {
  BakedCharacterRecipe,
  CharacterPackV4Manifest,
} from "../../src/core/types";

// Technical checkerboard fixture, never presented as generated character art.
async function fixture() {
  const pages = [0, 1].map((page) => {
    const pixels = new Uint8Array(8 * 8 * 4);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++)
        pixels.set(
          (x + y) % 2 ? [240, 40, 20, 255] : [30, page ? 90 : 180, 220, 255],
          (y * 8 + x) * 4,
        );
    return encodeSourceRgbaPng({
      width: 8,
      height: 8,
      pixels,
      colorChunks: [],
    });
  });
  const sheet = {
    width: 8,
    height: 8,
    frameWidth: 8,
    frameHeight: 8,
    columns: 1,
    rows: 1,
  };
  const manifest: CharacterPackV4Manifest = {
    schemaVersion: 4,
    format: "gathria-character-pack",
    name: "Pixel sampling fixture",
    generator: "technical-test",
    spritesheet: { ...sheet, file: "spritesheet.png" },
    additionalSheets: [{ ...sheet, file: "spritesheet-1.png" }],
    frames: [0, 1].map((id) => ({
      id,
      page: id,
      x: 0,
      y: 0,
      width: 8,
      height: 8,
    })),
    animations: {
      idle: { frames: [0], fps: 1, loop: true },
      walk: { frames: [0, 1], fps: 2, loop: true },
      run: { frames: [1, 0], fps: 4, loop: true },
      jump: { frames: [0, 1, 1], fps: 4, loop: false },
    },
    anchor: { x: 4, y: 7, units: "pixels", origin: "top-left" },
    facing: { native: "right", right: "none", left: "mirror-x" },
    scale: { pixelArt: true, integerOnly: true, recommended: 2 },
    capabilities: { renderMode: "baked", editableAppearance: false },
    configuration: "character.json",
  };
  const recipe: BakedCharacterRecipe = {
    schemaVersion: 1,
    format: "gathria-baked-character",
    name: manifest.name,
    characterId: "male",
    source: {
      kind: "unified-archive",
      name: "technical-fixture.zip",
      sha256: "a".repeat(64),
    },
    provenance: "Synthetic sampling fixture, not artwork evidence.",
    derivation: {
      method: "Synthetic checkerboard",
      frames: [0, 1].map((frameId) => ({
        frameId,
        sourceFrame: frameId,
        timeSeconds: frameId / 4,
      })),
    },
  };
  return {
    pages,
    bytes: Buffer.from(
      await (
        await createBakedCharacterPack(recipe, manifest, new Blob([pages[0]]), [
          new Blob([pages[1]]),
        ])
      ).arrayBuffer(),
    ),
  };
}

test("V4 pixel pack uses integer nearest-neighbor playback, preserves pages and exports independently", async ({
  page,
  context,
}, info) => {
  const source = await fixture(),
    errors: string[] = [];
  await context.addInitScript(() =>
    Object.defineProperty(window, "devicePixelRatio", { value: 3 }),
  );
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/player.html?authoring=1");
  await page.locator("#player-zip").setInputFiles({
    name: "pixel.character.zip",
    mimeType: "application/zip",
    buffer: source.bytes,
  });
  await expect(page.locator(".player-status")).toContainText(
    "Loaded: Pixel sampling fixture",
  );
  await expect(
    page.getByText("Authored pixel artwork · baked playback", { exact: true }),
  ).toBeVisible();
  const zoom = page.getByLabel("Display scale", { exact: true }),
    canvas = page.getByTestId("consumer-canvas");
  await expect(zoom).toHaveValue("2");
  expect(
    await canvas.evaluate((c: HTMLCanvasElement) => ({
      backing: c.height,
      display: c.getBoundingClientRect().height,
    })),
  ).toEqual({ backing: 420, display: 420 });
  expect(
    await zoom
      .locator("option")
      .evaluateAll((options) =>
        options.map((o) => (o as HTMLOptionElement).value),
      ),
  ).toEqual(["1", "2", "3", "4"]);
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  expect(
    await canvas.evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext("2d")!,
        left = Math.round(c.width / 2) - 8,
        top = Math.floor((c.height - 16) / 2);
      return Array.from(ctx.getImageData(left + 4, top + 4, 4, 4).data);
    }),
  ).toEqual(
    Array.from({ length: 16 }, (_, i) => {
      const x = i % 4,
        y = Math.floor(i / 4);
      return (Math.floor(x / 2) + Math.floor(y / 2)) % 2
        ? [240, 40, 20, 255]
        : [30, 180, 220, 255];
    }).flat(),
  );
  await page.getByRole("button", { name: "Jump", exact: true }).click();
  await page.locator("#player-frame").fill("1");
  await expect(canvas).toHaveAttribute("data-frame-page", "1");
  await page.getByRole("button", { name: "Left", exact: true }).click();
  await expect(canvas).toHaveAttribute("aria-label", /facing left/);
  await page.getByText("Compare first and last frame", { exact: true }).click();
  await expect(page.getByLabel("Endpoint scale", { exact: true })).toHaveValue(
    "1",
  );
  expect(
    await page
      .getByLabel("Endpoint scale", { exact: true })
      .locator("option")
      .evaluateAll((a) => a.map((n) => (n as HTMLOptionElement).value)),
  ).toEqual(["1", "2"]);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export original CharacterPack", exact: true })
    .click();
  const download = await pending,
    path = info.outputPath("pixel-export.character.zip");
  await download.saveAs(path);
  const files = unzipSync(new Uint8Array(await readFile(path)));
  expect(files["spritesheet.png"]).toEqual(source.pages[0]);
  expect(files["spritesheet-1.png"]).toEqual(source.pages[1]);
  expect(
    JSON.parse(new TextDecoder().decode(files["manifest.json"])).schemaVersion,
  ).toBe(4);
  await page.close();
  const independent = await context.newPage();
  independent.on("pageerror", (e) => errors.push(e.message));
  await independent.goto("/player.html");
  await independent.locator("#player-zip").setInputFiles(path);
  await expect(independent.locator(".player-status")).toContainText(
    "Loaded: Pixel sampling fixture",
  );
  await expect(
    independent.getByLabel("Display scale", { exact: true }),
  ).toHaveValue("2");
  await independent.getByRole("button", { name: "Jump", exact: true }).click();
  await expect(independent.getByTestId("consumer-canvas")).toHaveAttribute(
    "data-frame-page",
    "1",
  );
  await expect(
    independent.getByRole("button", { name: "Replay animation", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("oversized native pixel frames keep export available without allocating oversized preview or endpoint canvases", async ({
  page,
}, info) => {
  const source = await fixture(),
    files = unzipSync(source.bytes);
  const manifest = JSON.parse(
    new TextDecoder().decode(files["manifest.json"]),
  ) as CharacterPackV4Manifest;
  const recipe = JSON.parse(
    new TextDecoder().decode(files["character.json"]),
  ) as BakedCharacterRecipe;
  manifest.spritesheet = {
    ...manifest.spritesheet,
    width: 8192,
    frameWidth: 8192,
  };
  manifest.additionalSheets = [];
  manifest.frames = [{ ...manifest.frames[0], width: 8192 }];
  manifest.anchor.x = 4096;
  manifest.scale.recommended = 16;
  for (const clip of Object.values(manifest.animations)) clip.frames = [0];
  recipe.derivation.frames = [recipe.derivation.frames[0]];
  const pixels = new Uint8Array(8192 * 8 * 4);
  pixels.fill(255);
  const png = encodeSourceRgbaPng({
    width: 8192,
    height: 8,
    pixels,
    colorChunks: [],
  });
  const archive = await createBakedCharacterPack(
    recipe,
    manifest,
    new Blob([png]),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/player.html?authoring=1");
  await page
    .locator("#player-zip")
    .setInputFiles({
      name: "wide-pixel.character.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(await archive.arrayBuffer()),
    });
  await expect(page.getByTestId("pixel-preview-limit")).toContainText(
    "Pixel preview exceeds the display limit",
  );
  await expect(
    page.getByLabel("Display scale", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Sprite action editor" }),
  ).toHaveCount(0);
  const dimensions = await page
    .getByTestId("consumer-canvas")
    .evaluate((c: HTMLCanvasElement) => ({ width: c.width, height: c.height }));
  expect(dimensions.width).toBeLessThanOrEqual(960);
  expect(dimensions.height).toBe(420);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export original CharacterPack", exact: true })
    .click();
  const path = info.outputPath("wide-preserved.character.zip");
  await (await pending).saveAs(path);
  expect(
    unzipSync(new Uint8Array(await readFile(path)))["spritesheet.png"],
  ).toEqual(png);
  expect(errors).toEqual([]);
});
