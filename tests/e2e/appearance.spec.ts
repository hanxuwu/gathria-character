import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import {
  APPEARANCE_ANCHORS,
  type AppearanceBankManifest,
} from "../../src/appearance/contract";
import {
  decodeSourceRgbaPng,
  encodeSourceRgbaPng,
} from "../../src/core/baked-source";
import { readPortableCharacterPackArchive } from "../../src/core/pack";
import { importWardrobeProject } from "../../src/wardrobe/project";
import type { WardrobeRegistration } from "../../src/wardrobe/contract";
import { installWardrobeFixture } from "./wardrobe-fixture";

// Synthetic pixels test controls and file contracts, never visual quality.
async function installAppearanceFixture(page: Page) {
  const fixtures = await installWardrobeFixture(page);
  let bankRequests = 0;
  const banks = new Map<string, Uint8Array>();
  for (const fixture of Object.values(fixtures)) {
    const registration: WardrobeRegistration = JSON.parse(
      new TextDecoder().decode(fixture.registrationBytes),
    );
    const manifest: AppearanceBankManifest = {
      format: "gathria-sprite-appearance-bank",
      version: 1,
      id: `${fixture.key}-appearance-fixture`,
      name: "Synthetic appearance fixture",
      characterId: registration.characterId,
      sourceSha256: registration.sourceSha256,
      registrationSha256: createHash("sha256")
        .update(fixture.registrationBytes)
        .digest("hex"),
      frameWidth: 8,
      frameHeight: 8,
      padding: { left: 2, top: 2, right: 2, bottom: 0 },
      poses: registration.frames.map((frame) => ({
        frameId: frame.frameId,
        sourceFrame: frame.sourceFrame,
        anchors: Object.fromEntries(
          APPEARANCE_ANCHORS.map((key) => [key, { x: 4, y: 1 }]),
        ) as AppearanceBankManifest["poses"][number]["anchors"],
        headBounds: { x: 0, y: 0, width: 8, height: 2 },
        facePolygon: [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 2 },
          { x: 0, y: 2 },
        ],
        hairBounds: { x: 0, y: -2, width: 8, height: 4 },
        foreground: [],
      })),
      pages: [
        {
          file: "patches-0.png",
          maskFile: "ownership-0.png",
          width: 20,
          height: 2,
        },
      ],
      styles: [
        {
          id: "soft-crop",
          name: "Soft crop",
          slot: "hair",
          layers: [
            {
              role: "hair-front",
              frames: registration.frames.map(({ frameId }) => ({
                frameId,
                mode: "paint",
                page: 0,
                rect: { x: 0, y: 0, width: 8, height: 2 },
                offset: { x: 0, y: -2 },
              })),
            },
          ],
        },
        {
          id: "soft-bob",
          name: "Soft bob",
          slot: "hair",
          layers: [
            {
              role: "hair-front",
              frames: registration.frames.map(({ frameId }) => ({
                frameId,
                mode: "paint",
                page: 0,
                rect: { x: 8, y: 0, width: 8, height: 2 },
                offset: { x: 0, y: -1 },
              })),
            },
          ],
        },
        {
          id: "gentle",
          name: "Gentle",
          slot: "face",
          layers: [
            {
              role: "face",
              frames: registration.frames.map(({ frameId }) => ({
                frameId,
                mode: "paint",
                page: 0,
                rect: { x: 16, y: 0, width: 2, height: 1 },
                offset: { x: 3, y: 1 },
              })),
            },
          ],
        },
      ],
      provenance: "Synthetic browser regression fixture. Not artwork evidence.",
    };
    const pixels = new Uint8Array(20 * 2 * 4);
    const ownership = new Uint8Array(pixels.length);
    for (let i = 0; i < 40; i++) {
      pixels.set(
        i % 20 < 8
          ? [130, 75, 45, 255]
          : i % 20 < 16
            ? [95, 55, 30, 255]
            : [225, 170, 120, 255],
        i * 4,
      );
      ownership.set([255, 255, 255, 255], i * 4);
    }
    banks.set(
      `/fixture-appearance/${fixture.key}.zip`,
      zipSync({
        "manifest.json": strToU8(JSON.stringify(manifest)),
        "patches-0.png": encodeSourceRgbaPng({
          width: 20,
          height: 2,
          pixels,
          colorChunks: [],
        }),
        "ownership-0.png": encodeSourceRgbaPng({
          width: 20,
          height: 2,
          pixels: ownership,
          colorChunks: [],
        }),
      }),
    );
  }
  await page.route("**/docs/kling-wardrobe/catalog.json", (route) =>
    route.fulfill({
      json: {
        version: 1,
        characters: Object.values(fixtures).map((fixture) => ({
          ...fixture.entry,
          appearanceBankUrl: `/fixture-appearance/${fixture.key}.zip`,
        })),
      },
    }),
  );
  await page.route("**/fixture-appearance/**", (route) => {
    bankRequests++;
    return route.fulfill({
      body: Buffer.from(banks.get(new URL(route.request().url()).pathname)!),
    });
  });
  return { fixtures, bankRequests: () => bankRequests };
}

test("appearance loads on selection, stays independent of clothing and restores original pixels", async ({
  page,
}) => {
  const fixture = await installAppearanceFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  const preview = wardrobe.getByTestId("wardrobe-preview");
  const pixels = () =>
    preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  const original = await pixels();
  expect(fixture.bankRequests()).toBe(0);
  await expect(
    wardrobe.getByLabel("Hair color", { exact: true }),
  ).toBeDisabled();
  await wardrobe
    .getByLabel("Hairstyle", { exact: true })
    .selectOption("soft-crop");
  await expect(wardrobe.getByRole("status")).toContainText(
    "Appearance updated",
  );
  expect(fixture.bankRequests()).toBe(1);
  await expect(preview).toHaveAttribute("width", "12");
  await expect(preview).toHaveAttribute("height", "10");
  await wardrobe.getByLabel("Face", { exact: true }).selectOption("gentle");
  await expect(wardrobe.getByRole("status")).toContainText(
    "Appearance updated",
  );
  await wardrobe
    .getByLabel("Hair color", { exact: true })
    .selectOption("copper");
  await expect(wardrobe.getByRole("status")).toContainText(
    "Appearance updated",
  );
  const customized = await pixels();
  expect(customized).not.toBe(original);
  await wardrobe.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(wardrobe.getByRole("status")).toContainText("Daily selected");
  await wardrobe.getByRole("button", { name: "Original", exact: true }).click();
  await expect(wardrobe.getByRole("status")).toContainText(
    "Original outfit selected",
  );
  expect(await pixels()).toBe(customized);
  await wardrobe.getByLabel("Compare original", { exact: true }).check();
  const comparison = wardrobe.getByTestId("wardrobe-original-preview");
  await expect(comparison).toHaveAttribute("width", "12");
  await expect(comparison).toHaveAttribute("height", "10");
  const sampled = await comparison.evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d")!;
    return {
      padding: Array.from(context.getImageData(0, 0, 1, 1).data),
      source: Array.from(context.getImageData(2, 2, 1, 1).data),
    };
  });
  expect(sampled.padding).toEqual([0, 0, 0, 0]);
  expect(sampled.source).toEqual([0, 0, 110, 255]);
  await wardrobe.getByLabel("Wardrobe character").selectOption("female");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await expect(wardrobe.getByLabel("Hairstyle", { exact: true })).toHaveValue(
    "",
  );
  await wardrobe.getByLabel("Wardrobe character").selectOption("male");
  await expect(wardrobe.getByRole("status")).toContainText(
    "Restored this character",
  );
  await expect(wardrobe.getByLabel("Hairstyle", { exact: true })).toHaveValue(
    "soft-crop",
  );
  await expect(wardrobe.getByLabel("Face", { exact: true })).toHaveValue(
    "gentle",
  );
  await expect(wardrobe.getByLabel("Hair color", { exact: true })).toHaveValue(
    "copper",
  );
  expect(await pixels()).toBe(customized);
  expect(fixture.bankRequests()).toBe(1);
  await wardrobe
    .getByRole("button", { name: "Reset appearance", exact: true })
    .click();
  await expect(wardrobe.getByRole("status")).toContainText(
    "Appearance updated",
  );
  await expect(preview).toHaveAttribute("width", "8");
  expect(await pixels()).toBe(original);
});

test("appearance failures keep the accepted outfit, then V2 reopens offline and exports padded standalone playback", async ({
  page,
  context,
}, testInfo) => {
  await installAppearanceFixture(page);
  await page.goto("/workbench.html?character=female&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await wardrobe.getByRole("button", { name: "Wedding", exact: true }).click();
  await expect(wardrobe.getByRole("status")).toContainText("Wedding selected");
  const accepted = await wardrobe
    .getByTestId("wardrobe-preview")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const broken = async (route: import("@playwright/test").Route) =>
    route.fulfill({ status: 503, body: "Unavailable" });
  await page.route("**/fixture-appearance/**", broken);
  await wardrobe
    .getByLabel("Hairstyle", { exact: true })
    .selectOption("soft-bob");
  await expect(wardrobe.getByRole("alert")).toContainText(
    "Your current outfit is unchanged",
  );
  await expect(wardrobe.getByLabel("Hairstyle", { exact: true })).toHaveValue(
    "",
  );
  expect(
    await wardrobe
      .getByTestId("wardrobe-preview")
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
  ).toBe(accepted);
  await page.unroute("**/fixture-appearance/**", broken);
  await wardrobe
    .getByLabel("Hairstyle", { exact: true })
    .selectOption("soft-bob");
  await expect(wardrobe.getByRole("status")).toContainText(
    "Appearance updated",
  );
  await wardrobe.getByLabel("Face", { exact: true }).selectOption("gentle");
  await expect(wardrobe.getByRole("status")).toContainText(
    "Appearance updated",
  );
  await wardrobe
    .getByLabel("Hair color", { exact: true })
    .selectOption("espresso");
  await expect(wardrobe.getByRole("status")).toContainText(
    "Appearance updated",
  );
  await wardrobe
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption("run");
  await wardrobe.getByLabel("Wardrobe facing").selectOption("left");
  const download = page.waitForEvent("download");
  await wardrobe.getByRole("button", { name: /Save wardrobe/ }).click();
  const projectPath = testInfo.outputPath("appearance.wardrobe.zip");
  await (await download).saveAs(projectPath);
  const saved = await importWardrobeProject(
    new Uint8Array(await readFile(projectPath)),
  );
  expect(saved.document.version).toBe(2);
  if (saved.document.version !== 2) throw Error("Expected appearance project");
  expect(saved.document.appearance).toMatchObject({
    hairId: "soft-bob",
    faceId: "gentle",
    hairColor: "espresso",
  });
  expect(saved.document.selection.fullBody).toBe("female-fullBody");
  expect(saved.document.preview).toEqual({ action: "run", facing: "left" });
  expect(saved.archive.manifest.spritesheet.frameWidth).toBe(8);
  await page.route("**/docs/kling-wardrobe/catalog.json", (route) =>
    route.fulfill({ status: 503, body: "Offline" }),
  );
  await page.reload();
  await expect(wardrobe.getByRole("alert")).toContainText("503");
  await wardrobe
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles(projectPath);
  await expect(wardrobe.getByRole("status")).toContainText(
    "Saved outfit and action settings restored",
  );
  await expect(wardrobe.getByLabel("Hairstyle", { exact: true })).toHaveValue(
    "soft-bob",
  );
  await expect(wardrobe.getByLabel("Face", { exact: true })).toHaveValue(
    "gentle",
  );
  await expect(wardrobe.getByLabel("Hair color", { exact: true })).toHaveValue(
    "espresso",
  );
  const pngDownload = page.waitForEvent("download");
  await wardrobe
    .getByRole("button", { name: "Save current PNG", exact: true })
    .click();
  const pngPath = testInfo.outputPath("appearance-left.png");
  await (await pngDownload).saveAs(pngPath);
  const png = decodeSourceRgbaPng(new Uint8Array(await readFile(pngPath)), {
    width: 12,
    height: 10,
  });
  expect([png.width, png.height]).toEqual([12, 10]);
  expect(png.pixels[3]).toBe(0);
  const packDownload = page.waitForEvent("download");
  await wardrobe
    .getByRole("button", { name: "Export CharacterPack", exact: true })
    .click();
  const packPath = testInfo.outputPath("appearance.character.zip");
  await (await packDownload).saveAs(packPath);
  const pack = readPortableCharacterPackArchive(
    new Uint8Array(await readFile(packPath)),
  );
  expect(pack.manifest.spritesheet).toMatchObject({
    frameWidth: 12,
    frameHeight: 10,
  });
  expect(pack.manifest.anchor).toMatchObject({ x: 6, y: 9 });
  expect(pack.manifest.animations).toEqual(saved.archive.manifest.animations);
  await page.close();
  const player = await context.newPage();
  await player.goto("/player.html");
  await player.locator("#player-zip").setInputFiles(packPath);
  await expect(player.getByRole("status")).toContainText("Loaded:");
  await player.getByRole("button", { name: "Run", exact: true }).click();
  await player.getByRole("button", { name: "Left", exact: true }).click();
  await expect(player.getByTestId("consumer-canvas")).toBeVisible();
});
