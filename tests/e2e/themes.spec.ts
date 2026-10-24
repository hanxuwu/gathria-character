// Synthetic regression pictures exercise behavior only; never visual artwork evidence.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page, type Route } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  decodeSourceRgbaPng,
  encodeSourceRgbaPng,
} from "../../src/core/baked-source";
import { createThemeBundle, readThemeBundle } from "../../src/themes/bundle";
import {
  createThemeSession,
  exportThemeSession,
  readThemeSession,
} from "../../src/themes/session";

const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const actions = ["idle", "walk", "run", "jump", "celebrate"] as const;
const json = (value: unknown) => strToU8(JSON.stringify(value));

async function fixture(
  character: "male" | "female",
  pixel: boolean,
  extras = false,
  partial = false,
) {
  const characterId = `fixture-${character}-${pixel ? "pixel" : "smooth"}`;
  const pixels = new Uint8Array(24 * 8 * 4);
  for (let y = 1; y < 8; y++)
    for (let x = 1; x < 24; x++) {
      if (x % 8 === 0 || x % 8 === 7) continue;
      pixels.set(
        [pixel ? 220 : 70, x * 8, character === "female" ? 180 : 80, 255],
        (y * 24 + x) * 4,
      );
    }
  const png = encodeSourceRgbaPng({
    width: 24,
    height: 8,
    pixels,
    colorChunks: [],
  });
  const manifest = {
    schemaVersion: pixel ? 4 : 2,
    format: "gathria-character-pack",
    name: characterId,
    generator: "synthetic-theme-browser-fixture",
    spritesheet: {
      file: "spritesheet.png",
      width: 24,
      height: 8,
      frameWidth: 8,
      frameHeight: 8,
      columns: 3,
      rows: 1,
    },
    ...(pixel ? { additionalSheets: [] } : {}),
    frames: [7, 19, 31].map((id, index) => ({
      id,
      x: index * 8,
      y: 0,
      width: 8,
      height: 8,
      ...(pixel ? { page: 0 } : {}),
    })),
    animations: Object.fromEntries(
      actions
        .filter((action) => !partial || action !== "jump")
        .map((action) => [
          action,
          {
            frames:
              action === "idle"
                ? [7, 7, 19, 31]
                : action === "jump"
                  ? pixel
                    ? [7, 31, 7]
                    : [7, 19, 31, 19, 7]
                  : action === "run"
                    ? Array.from(
                        { length: pixel ? 8 : 16 },
                        (_, index) => [7, 19, 31, 19][index % 4],
                      )
                    : [7, 19, 31, 19],
            fps: action === "idle" ? 4 : 8,
            loop: action !== "jump",
          },
        ]),
    ),
    anchor: { x: 4, y: 7, units: "pixels", origin: "top-left" },
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
      name: "synthetic-fixture.zip",
      sha256: hash(png),
    },
    provenance:
      "Synthetic browser regression data, not generated artwork or visual evidence.",
    derivation: {
      method: "Synthetic browser fixture",
      frames: [7, 19, 31].map((frameId, index) => ({
        frameId,
        sourceFrame: index,
        timeSeconds: index / 8,
      })),
    },
  };
  const pack = zipSync({
    "manifest.json": json(manifest),
    "character.json": json(config),
    "spritesheet.png": png,
    "PROVENANCE.txt": strToU8(config.provenance),
    "INTEGRATION.md": strToU8("Synthetic test fixture only."),
  });
  const weddingPixels = new Uint8Array(pixels);
  for (let i = 0; i < weddingPixels.length; i += 4) {
    if (!weddingPixels[i + 3]) continue;
    weddingPixels[i] = pixel ? 45 : 120;
    weddingPixels[i + 2] = 225;
  }
  const weddingPack = zipSync({
    ...unzipSync(pack),
    "manifest.json": json({ ...manifest, name: `${characterId} wedding` }),
    "character.json": json({ ...config, name: `${characterId} wedding` }),
    "spritesheet.png": encodeSourceRgbaPng({
      width: 24,
      height: 8,
      pixels: weddingPixels,
      colorChunks: [],
    }),
  });
  const theme = await createThemeBundle({
    id: partial
      ? "limited-pixel"
      : pixel
        ? "pixel-storybook"
        : "kling-original",
    revision: 1,
    name: partial
      ? "Limited pixel"
      : pixel
        ? "Pixel storybook"
        : "Kling original",
    character,
    characterId,
    rendering: pixel ? "pixel" : "smooth",
    reference: {
      sourceSha256: "a".repeat(64),
      description: "Synthetic reference fixture",
    },
    provenance: "Synthetic browser test bundle, not visual evidence.",
    looks: [
      { logicalId: "base", name: "Tank & shorts", bytes: pack },
      ...(extras
        ? [
            {
              logicalId: "wedding",
              name: "Wedding fixture",
              bytes: weddingPack,
            },
          ]
        : []),
    ],
  });
  return { theme, pack, weddingPack, manifest };
}

async function start(
  page: Page,
  delayedPixel?: (route: Route, bytes: Uint8Array) => Promise<void>,
  completePixel = false,
) {
  const fixtures = {
    male: {
      original: await fixture("male", false, true),
      pixel: await fixture("male", true, completePixel),
    },
    female: {
      original: await fixture("female", false, true),
      pixel: await fixture("female", true, completePixel),
    },
  };
  const entries = Object.entries(fixtures).flatMap(([character, themes]) =>
    Object.entries(themes).map(([kind, data]) => ({
      key: data.theme.key,
      name: data.theme.manifest.name,
      character,
      description: "Synthetic regression fixture",
      isOriginal: kind === "original",
      sha256: data.theme.sha256,
      url: `/__theme_fixture/${character}-${kind}.zip`,
    })),
  );
  await page.route("**/src/themes/catalog.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `import {readThemeBundle} from '/src/themes/bundle.ts'; export const THEME_CATALOG=${JSON.stringify(entries)}.map(e=>({...e,load:async(options)=>readThemeBundle(new Uint8Array(await (await fetch(e.url,{signal:options.signal})).arrayBuffer()),options)}));`,
    }),
  );
  await page.route("**/__theme_fixture/*.zip", async (route) => {
    const name = new URL(route.request().url()).pathname
      .split("/")
      .pop()!
      .replace(".zip", "");
    const [character, kind] = name.split("-") as [
      "male" | "female",
      "original" | "pixel",
    ];
    const bytes = fixtures[character][kind].theme.bytes;
    if (kind === "pixel" && delayedPixel) return delayedPixel(route, bytes);
    await route.fulfill({
      contentType: "application/zip",
      body: Buffer.from(bytes),
    });
  });
  await page.goto("/workbench.html?character=male&mode=themes");
  const panel = page.getByRole("region", {
    name: "Character themes",
    exact: true,
  });
  await expect(panel.getByRole("status")).toContainText(
    "Kling original selected",
  );
  await expect(panel.getByTestId("theme-preview")).toHaveAttribute(
    "data-sampling",
    "smooth",
  );
  return { panel, fixtures };
}
async function download(page: Page, name: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  return new Uint8Array(await readFile((await (await pending).path())!));
}
const pixels = (page: Page) =>
  page
    .getByTestId("theme-preview")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());

test("themes preserve original bytes, native pixel export and portable selection through save/reopen and independent playback", async ({
  page,
  context,
}) => {
  const { panel, fixtures } = await start(page);
  const original = await pixels(page);
  expect(await download(page, "Export theme CharacterPack")).toEqual(
    fixtures.male.original.pack,
  );
  await panel.getByRole("button", { name: /^Pixel storybook/ }).click();
  await expect(panel.getByRole("status")).toContainText(
    "Pixel storybook selected",
  );
  await expect(panel.getByTestId("theme-preview")).toHaveAttribute(
    "data-sampling",
    "nearest",
  );
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await panel.getByLabel("Theme facing", { exact: true }).selectOption("left");
  await panel.getByLabel("Theme frame", { exact: true }).fill("1");
  const png = decodeSourceRgbaPng(await download(page, "Export theme PNG"));
  const source = decodeSourceRgbaPng(
    unzipSync(fixtures.male.pixel.pack)["spritesheet.png"],
  );
  expect([png.width, png.height]).toEqual([8, 8]);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      expect(png.pixels.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 4)).toEqual(
        source.pixels.slice(
          (y * 24 + 8 + 7 - x) * 4,
          (y * 24 + 8 + 7 - x) * 4 + 4,
        ),
      );
  const sessionBytes = await download(page, "Save theme session");
  const session = await readThemeSession(sessionBytes);
  expect(session.selection).toEqual({
    themeKey: "male:pixel-storybook@1",
    lookId: "base",
    action: "run",
    facing: "left",
  });
  expect(
    session.themes.find((t) => t.key === session.selection.themeKey)!.looks[0]
      .bytes,
  ).toEqual(fixtures.male.pixel.pack);
  await panel
    .getByRole("button", { name: "Restore Kling original", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "Kling original selected",
  );
  await panel.getByLabel("Theme facing", { exact: true }).selectOption("right");
  expect(await pixels(page)).toBe(original);
  await panel.getByLabel("Theme session file", { exact: true }).setInputFiles({
    name: "saved.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(sessionBytes),
  });
  await expect(panel.getByRole("status")).toContainText(
    "Theme session restored",
  );
  await expect(panel.getByLabel("Theme facing", { exact: true })).toHaveValue(
    "left",
  );
  await expect(panel.getByLabel("Theme frame", { exact: true })).toHaveValue(
    "0",
  );
  const packBytes = await download(page, "Export theme CharacterPack");
  expect(packBytes).toEqual(fixtures.male.pixel.pack);
  await page.close();
  const player = await context.newPage();
  await player.goto("/player.html");
  await player.locator("#player-zip").setInputFiles({
    name: "pixel.character.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(packBytes),
  });
  await expect(player.getByRole("status")).toContainText("Loaded:");
  expect(
    await player
      .getByLabel("Display scale", { exact: true })
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value),
      ),
  ).not.toContain("0.5");
  const pause = player.getByRole("button", {
    name: "Pause animation",
    exact: true,
  });
  if (await pause.count()) await pause.click();
  for (const action of actions) {
    await player
      .getByRole("button", {
        name: action[0].toUpperCase() + action.slice(1),
        exact: true,
      })
      .click();
    await expect(player.getByTestId("consumer-canvas")).toHaveAttribute(
      "data-action",
      action,
    );
  }
  await player.getByRole("button", { name: "Left", exact: true }).click();
  await player.getByRole("button", { name: "Run", exact: true }).click();
  await player.locator("#player-frame").fill("0");
  await player
    .getByRole("button", { name: "Play animation", exact: true })
    .click();
  await expect(player.getByTestId("consumer-canvas")).not.toHaveAttribute(
    "data-frame-position",
    "0",
  );
});

test("missing outfit and action requests stay explicit instead of substituting another style", async ({
  page,
}) => {
  const { panel } = await start(page);
  await panel.getByLabel("Theme look", { exact: true }).selectOption("wedding");
  await expect(panel.getByRole("status")).toContainText("Look selected");
  await panel.getByRole("button", { name: /^Pixel storybook/ }).click();
  await expect(panel.getByRole("note")).toContainText("has no “wedding” look");
  await expect(panel.getByTestId("theme-preview")).toHaveCount(0);
  await expect(
    panel.getByRole("button", {
      name: "Export theme CharacterPack",
      exact: true,
    }),
  ).toBeDisabled();
  await panel
    .getByRole("button", { name: /^Kling original Synthetic/ })
    .click();
  await expect(panel.getByLabel("Theme look", { exact: true })).toHaveValue(
    "wedding",
  );
  await expect(panel.getByTestId("theme-preview")).toBeVisible();
  await panel.getByLabel("Theme look", { exact: true }).selectOption("base");
  await expect(panel.getByRole("status")).toContainText("Look selected");
  await panel.getByRole("button", { name: "Jump", exact: true }).click();
  const limited = await fixture("male", true, false, true);
  await panel.getByLabel("Theme bundle file", { exact: true }).setInputFiles({
    name: "limited.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(limited.theme.bytes),
  });
  await expect(panel.getByRole("status")).toContainText(
    "Imported theme accepted",
  );
  await expect(panel.getByRole("note")).toContainText("Jump is unavailable");
  await expect(
    panel.getByRole("button", { name: "Jump · unavailable", exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Export theme PNG", exact: true }),
  ).toBeDisabled();
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel.getByTestId("theme-preview")).toBeVisible();
});

test("canceled and corrupt imports retain accepted pixels, and both characters keep their own identity", async ({
  page,
}) => {
  let pending: { route: Route; bytes: Uint8Array } | undefined;
  const { panel, fixtures } = await start(page, async (route, bytes) => {
    pending = { route, bytes };
  });
  const original = await pixels(page);
  await panel.getByRole("button", { name: /^Pixel storybook/ }).click();
  await expect(
    panel.getByRole("button", {
      name: "Cancel theme preparation",
      exact: true,
    }),
  ).toBeVisible();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await panel
    .getByRole("button", { name: "Cancel theme preparation", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("canceled");
  await pending?.route
    .fulfill({
      contentType: "application/zip",
      body: Buffer.from(pending.bytes),
    })
    .catch(() => {});
  expect(await pixels(page)).toBe(original);
  const bad = unzipSync(fixtures.male.pixel.theme.bytes);
  const manifest = JSON.parse(strFromU8(bad["theme.json"]));
  manifest.looks[0].sha256 = "f".repeat(64);
  bad["theme.json"] = json(manifest);
  await panel.getByLabel("Theme bundle file", { exact: true }).setInputFiles({
    name: "broken.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync(bad)),
  });
  await expect(panel.getByRole("alert")).toContainText("checksum mismatch");
  expect(await pixels(page)).toBe(original);
  await panel
    .getByLabel("Theme character", { exact: true })
    .selectOption("female");
  await expect(panel.getByRole("status")).toContainText(
    "Kling original selected",
  );
  expect(await download(page, "Export theme CharacterPack")).toEqual(
    fixtures.female.original.pack,
  );
  await panel
    .getByLabel("Theme character", { exact: true })
    .selectOption("male");
  await expect(panel.getByRole("status")).toContainText(
    "Kling original selected",
  );
  expect(await pixels(page)).toBe(original);
});

test("matching wedding outfits stay selected across theme switches and restore the exact wedding artwork", async ({
  page,
}) => {
  const { panel, fixtures } = await start(page, undefined, true);
  await panel.getByLabel("Theme look", { exact: true }).selectOption("wedding");
  await expect(panel.getByRole("status")).toContainText("Look selected");
  const originalWedding = await pixels(page);
  expect(await download(page, "Export theme CharacterPack")).toEqual(
    fixtures.male.original.weddingPack,
  );
  await panel.getByRole("button", { name: /^Pixel storybook/ }).click();
  await expect(panel.getByRole("status")).toContainText(
    "Pixel storybook selected",
  );
  await expect(panel.getByLabel("Theme look", { exact: true })).toHaveValue(
    "wedding",
  );
  expect(await download(page, "Export theme CharacterPack")).toEqual(
    fixtures.male.pixel.weddingPack,
  );
  await panel
    .getByRole("button", { name: /^Kling original Synthetic/ })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "Kling original selected",
  );
  await expect(panel.getByLabel("Theme look", { exact: true })).toHaveValue(
    "wedding",
  );
  expect(await pixels(page)).toBe(originalWedding);
  await panel
    .getByRole("button", { name: "Restore Kling original", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "Kling original selected",
  );
  await expect(panel.getByLabel("Theme look", { exact: true })).toHaveValue(
    "base",
  );
  expect(await download(page, "Export theme CharacterPack")).toEqual(
    fixtures.male.original.pack,
  );
});

test("an imported bundle or session cannot replace an unloaded published character revision", async ({
  page,
}) => {
  const { panel, fixtures } = await start(page);
  const original = await pixels(page);
  const files = unzipSync(fixtures.female.original.theme.bytes);
  const manifest = JSON.parse(strFromU8(files["theme.json"]));
  manifest.provenance += " Changed unofficial replacement.";
  files["theme.json"] = json(manifest);
  const spoof = await readThemeBundle(zipSync(files));
  await panel.getByLabel("Theme bundle file", { exact: true }).setInputFiles({
    name: "spoof.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(spoof.bytes),
  });
  await expect(panel.getByRole("alert")).toContainText(
    "Published theme revision",
  );
  await expect(
    panel.getByLabel("Theme character", { exact: true }),
  ).toHaveValue("male");
  expect(await pixels(page)).toBe(original);
  const session = await exportThemeSession(
    createThemeSession([fixtures.male.original.theme, spoof], {
      themeKey: spoof.key,
      lookId: "base",
      action: "idle",
      facing: "right",
    }),
  );
  await panel.getByLabel("Theme session file", { exact: true }).setInputFiles({
    name: "spoof-session.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(session),
  });
  await expect(panel.getByRole("alert")).toContainText(
    "Published theme revision",
  );
  await expect(
    panel.getByLabel("Theme character", { exact: true }),
  ).toHaveValue("male");
  expect(await pixels(page)).toBe(original);
  await panel
    .getByLabel("Theme character", { exact: true })
    .selectOption("female");
  await expect(panel.getByRole("status")).toContainText(
    "Kling original selected",
  );
  expect(await download(page, "Export theme CharacterPack")).toEqual(
    fixtures.female.original.pack,
  );
});

test("theme switching preserves normalized motion phase and playing state without restarting a completed one-shot", async ({
  page,
}) => {
  const { panel } = await start(page);
  await expect(
    panel.getByLabel("Keep motion phase", { exact: true }),
  ).toBeChecked();
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await panel.getByLabel("Theme facing", { exact: true }).selectOption("left");
  await panel
    .getByLabel("Theme display scale", { exact: true })
    .selectOption("2");
  await panel.getByLabel("Theme frame", { exact: true }).fill("6");
  await panel.getByRole("button", { name: /^Pixel storybook/ }).click();
  await expect(panel.getByRole("status")).toContainText(
    "Pixel storybook selected",
  );
  await expect(panel.getByLabel("Theme frame", { exact: true })).toHaveValue(
    "3",
  );
  await expect(panel.getByLabel("Theme facing", { exact: true })).toHaveValue(
    "left",
  );
  await expect(
    panel.getByLabel("Theme display scale", { exact: true }),
  ).toHaveValue("2");
  await expect(
    panel.getByRole("button", { name: "Play theme", exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Play theme", exact: true }).click();
  await expect(
    panel.getByLabel("Theme frame", { exact: true }),
  ).not.toHaveValue("3");
  await panel
    .getByRole("button", { name: /^Kling original Synthetic/ })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "Kling original selected",
  );
  await expect(
    panel.getByRole("button", { name: "Pause theme", exact: true }),
  ).toBeVisible();
  const moving = await panel
    .getByLabel("Theme frame", { exact: true })
    .inputValue();
  await expect(
    panel.getByLabel("Theme frame", { exact: true }),
  ).not.toHaveValue(moving);
  await panel.getByRole("button", { name: "Pause theme", exact: true }).click();
  await panel.getByRole("button", { name: "Jump", exact: true }).click();
  await panel.getByLabel("Theme frame", { exact: true }).fill("4");
  await panel.getByRole("button", { name: /^Pixel storybook/ }).click();
  await expect(panel.getByRole("status")).toContainText(
    "Pixel storybook selected",
  );
  await expect(panel.getByLabel("Theme frame", { exact: true })).toHaveValue(
    "2",
  );
  await expect(
    panel.getByRole("button", { name: "Play theme", exact: true }),
  ).toBeVisible();
  await panel.getByLabel("Keep motion phase", { exact: true }).uncheck();
  await panel
    .getByRole("button", { name: /^Kling original Synthetic/ })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "Kling original selected",
  );
  await expect(panel.getByLabel("Theme frame", { exact: true })).toHaveValue(
    "0",
  );
  await expect(
    panel.getByRole("button", { name: "Play theme", exact: true }),
  ).toBeVisible();
});
