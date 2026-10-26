import { readFile } from "node:fs/promises";
import { expect, test, type Locator } from "@playwright/test";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";
import { readPortableCharacterPackArchive } from "../../src/core/pack";
import {
  addWardrobeAppearanceBank,
  createWardrobeProject,
  exportWardrobeProject,
  importWardrobeProject,
  selectWardrobeAppearance,
  selectWardrobeGarment,
} from "../../src/wardrobe/project";
import { installAppearanceFixture } from "./appearance-fixture";

// Distinct synthetic pixels verify revision selection and persistence, not art.
type Fixture = Awaited<ReturnType<typeof installAppearanceFixture>>;
const canvasPixels = (canvas: Locator) =>
  canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
const facePixels = (canvas: Locator) =>
  canvas.evaluate((element: HTMLCanvasElement) =>
    Array.from(element.getContext("2d")!.getImageData(5, 3, 2, 1).data),
  );

async function choose(panel: Locator, label: string, value: string) {
  await panel.getByLabel(label, { exact: true }).selectOption(value);
  await expect(panel.getByRole("status")).toContainText("Appearance updated");
  await expect(panel.getByLabel(label, { exact: true })).toHaveValue(value);
}

async function olderProject(fixture: Fixture, faceId: "gentle" | "joyful") {
  const male = fixture.fixtures.male;
  let project = await createWardrobeProject(
    male.source,
    male.registrationBytes,
    male.items.map((item) => item.bytes),
  );
  project = await addWardrobeAppearanceBank(
    project,
    fixture.variants.male.previous,
  );
  project = selectWardrobeAppearance(project, {
    hairId: "soft-crop",
    faceId,
    hairColor: "espresso",
  });
  project = selectWardrobeGarment(project, "top", "male-top");
  return exportWardrobeProject(project);
}

async function openBytes(panel: Locator, bytes: Uint8Array) {
  await panel
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles({
      name: "legacy-expression.wardrobe.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(bytes),
    });
  await expect(panel.getByRole("status")).toContainText(
    "Saved outfit and action settings restored",
  );
}

for (const [character, faceId, color] of [
  ["male", "gentle-v2", [215, 158, 136, 255]],
  ["female", "joyful-v2", [238, 178, 92, 255]],
] as const) {
  test(`${character}: ${faceId} survives hair banks, clothes, offline reopen and native pack export`, async ({
    page,
  }, testInfo) => {
    const fixture = await installAppearanceFixture(page, {
      refinedExpressions: true,
      libraryBank: true,
    });
    await page.goto(`/workbench.html?character=${character}&mode=wardrobe`);
    const panel = page.locator("#wardrobe-panel");
    const preview = panel.getByTestId("wardrobe-preview");
    await expect(panel.getByRole("status")).toContainText("Original outfit.");
    const face = panel.getByLabel("Face", { exact: true });
    for (const id of ["gentle", "joyful", "gentle-v2", "joyful-v2"])
      await expect(face.locator(`option[value="${id}"]`)).toHaveCount(1);
    await choose(panel, "Hairstyle", "soft-crop");
    await choose(panel, "Face", faceId);
    await choose(panel, "Hair color", "copper");
    const expectedFace = [...color, ...color];
    for (const hair of ["volume-hair", "soft-bob", "volume-hair"]) {
      await choose(panel, "Hairstyle", hair);
      await expect(face).toHaveValue(faceId);
      await expect(panel.getByLabel("Hair color", { exact: true })).toHaveValue(
        "copper",
      );
      expect(await facePixels(preview)).toEqual(expectedFace);
    }
    await panel.getByRole("button", { name: "Daily", exact: true }).click();
    await expect(panel.getByRole("status")).toContainText("Daily selected");
    await expect(face).toHaveValue(faceId);
    expect(await facePixels(preview)).toEqual(expectedFace);
    await panel
      .getByLabel("Wardrobe action", { exact: true })
      .selectOption("run");
    await panel
      .getByLabel("Wardrobe facing", { exact: true })
      .selectOption("left");
    await panel.getByLabel("Wardrobe frame", { exact: true }).fill("1");
    await expect(preview).toHaveAttribute("data-rendered-frame-id", "19");
    const accepted = await canvasPixels(preview);
    const download = page.waitForEvent("download");
    await panel.getByRole("button", { name: /Save wardrobe/ }).click();
    const projectPath = testInfo.outputPath(`${faceId}.wardrobe.zip`);
    await (await download).saveAs(projectPath);
    const saved = await importWardrobeProject(
      new Uint8Array(await readFile(projectPath)),
    );
    expect(saved.document.version).toBe(2);
    if (saved.document.version !== 2)
      throw Error("Appearance project required");
    expect(saved.document.appearance).toMatchObject({
      faceId,
      hairId: "volume-hair",
      hairColor: "copper",
    });
    expect(saved.appearanceBank!.bytes).toEqual(
      fixture.banks.get(`/fixture-appearance/${character}-volume.zip`),
    );
    expect(saved.document.selection).toEqual({
      top: `${character}-top`,
      bottom: `${character}-bottom`,
      fullBody: null,
      shoes: null,
    });
    expect(saved.source).toEqual(fixture.fixtures[character].source);
    expect(saved.registrationBytes).toEqual(
      fixture.fixtures[character].registrationBytes,
    );
    await page.reload();
    await expect(panel.getByRole("status")).toContainText("Original outfit.");
    await page.route("**/fixture-appearance/**", (route) =>
      route.fulfill({ status: 503, body: "Offline after save" }),
    );
    await panel
      .getByLabel("Open wardrobe project file", { exact: true })
      .setInputFiles(projectPath);
    await expect(panel.getByRole("status")).toContainText(
      "Saved outfit and action settings restored",
    );
    await expect(face).toHaveValue(faceId);
    await panel.getByLabel("Wardrobe frame", { exact: true }).fill("1");
    await expect(preview).toHaveAttribute("data-rendered-frame-id", "19");
    expect(await canvasPixels(preview)).toBe(accepted);
    expect(fixture.bankRequests()).toBe(2);
    const exported = page.waitForEvent("download");
    await panel
      .getByRole("button", { name: "Export CharacterPack", exact: true })
      .click();
    const packPath = testInfo.outputPath(`${faceId}.character.zip`);
    await (await exported).saveAs(packPath);
    const pack = readPortableCharacterPackArchive(
      new Uint8Array(await readFile(packPath)),
    );
    expect(pack.manifest.animations).toEqual(saved.archive.manifest.animations);
    expect(Object.keys(pack.manifest.animations).sort()).toEqual([
      "celebrate",
      "idle",
      "jump",
      "run",
      "walk",
    ]);
    expect(pack.config.derivation.frames).toEqual(
      saved.archive.config.derivation.frames,
    );
    expect(pack.manifest.facing).toEqual(saved.archive.manifest.facing);
    const png = decodeSourceRgbaPng(pack.png, pack.manifest.spritesheet);
    for (const frame of pack.manifest.frames) {
      const offset = ((frame.y + 3) * png.width + frame.x + 5) * 4;
      expect(Array.from(png.pixels.subarray(offset, offset + 8))).toEqual(
        expectedFace,
      );
    }
  });
}

for (const faceId of ["gentle", "joyful"] as const) {
  test(`saved ${faceId} retains its embedded legacy bank when refined expressions are published`, async ({
    page,
  }, testInfo) => {
    const fixture = await installAppearanceFixture(page, {
      refinedExpressions: true,
    });
    const bytes = await olderProject(fixture, faceId);
    const original = await importWardrobeProject(bytes);
    await page.goto("/workbench.html?character=male&mode=wardrobe");
    const panel = page.locator("#wardrobe-panel");
    const preview = panel.getByTestId("wardrobe-preview");
    await expect(panel.getByRole("status")).toContainText("Original outfit.");
    await openBytes(panel, bytes);
    const face = panel.getByLabel("Face", { exact: true });
    await expect(face).toHaveValue(faceId);
    await expect(face.locator('option[value$="-v2"]')).toHaveCount(0);
    const before = await canvasPixels(preview);
    const download = page.waitForEvent("download");
    await panel.getByRole("button", { name: /Save wardrobe/ }).click();
    const path = testInfo.outputPath(`${faceId}-unchanged.wardrobe.zip`);
    await (await download).saveAs(path);
    const saved = await importWardrobeProject(
      new Uint8Array(await readFile(path)),
    );
    expect(saved.appearanceBank!.bytes).toEqual(fixture.variants.male.previous);
    expect(saved.document).toEqual(original.document);
    expect(fixture.bankRequests()).toBe(0);
    await page.reload();
    await expect(panel.getByRole("status")).toContainText("Original outfit.");
    await panel
      .getByLabel("Open wardrobe project file", { exact: true })
      .setInputFiles(path);
    await expect(panel.getByRole("status")).toContainText(
      "Saved outfit and action settings restored",
    );
    await expect(face).toHaveValue(faceId);
    await expect(face.locator('option[value$="-v2"]')).toHaveCount(0);
    expect(await canvasPixels(preview)).toBe(before);
    expect(fixture.bankRequests()).toBe(0);
  });
}

test("explicit appearance upgrade retains the old face until a refined style is selected", async ({
  page,
}, testInfo) => {
  const fixture = await installAppearanceFixture(page, {
    refinedExpressions: true,
  });
  const bytes = await olderProject(fixture, "joyful");
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const panel = page.locator("#wardrobe-panel");
  const preview = panel.getByTestId("wardrobe-preview");
  await expect(panel.getByRole("status")).toContainText("Original outfit.");
  await openBytes(panel, bytes);
  const originalPixels = await canvasPixels(preview);
  const originalFace = await facePixels(preview);
  await panel
    .getByRole("button", { name: "Preview updated appearance", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Preview updated appearance",
    exact: true,
  });
  await expect(dialog.getByTestId("appearance-update-after")).toBeVisible();
  expect(await canvasPixels(preview)).toBe(originalPixels);
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Save updated copy", exact: true })
    .click();
  const path = testInfo.outputPath("explicit-update.wardrobe.zip");
  await (await download).saveAs(path);
  const updated = await importWardrobeProject(
    new Uint8Array(await readFile(path)),
  );
  expect(updated.appearanceBank!.bytes).toEqual(fixture.variants.male.current);
  if (updated.document.version !== 2)
    throw Error("Appearance project required");
  expect(updated.document.appearance.faceId).toBe("joyful");
  expect(await canvasPixels(preview)).toBe(originalPixels);
  if (await dialog.isVisible())
    await dialog
      .getByRole("button", { name: "Cancel preview", exact: true })
      .click();
  await panel
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles(path);
  await expect(panel.getByRole("status")).toContainText(
    "Saved outfit and action settings restored",
  );
  await expect(panel.getByLabel("Face", { exact: true })).toHaveValue("joyful");
  expect(await facePixels(preview)).toEqual(originalFace);
  await choose(panel, "Face", "joyful-v2");
  expect(await facePixels(preview)).toEqual([
    238, 178, 92, 255, 238, 178, 92, 255,
  ]);
  await choose(panel, "Face", "joyful");
  expect(await facePixels(preview)).toEqual(originalFace);
});
