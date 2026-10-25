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
  updateWardrobePreview,
} from "../../src/wardrobe/project";
import { installAppearanceFixture } from "./appearance-fixture";

// Synthetic fixture coverage of controls, persistence and exported contracts.
// Distinct test pixels do not establish the quality of the real expression art.
type Fixture = Awaited<ReturnType<typeof installAppearanceFixture>>;
const canvasPixels = (canvas: Locator) =>
  canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
const facePixels = (canvas: Locator) =>
  canvas.evaluate((element: HTMLCanvasElement) =>
    Array.from(element.getContext("2d")!.getImageData(5, 3, 2, 1).data),
  );

async function choose(wardrobe: Locator, label: string, value: string) {
  await wardrobe.getByLabel(label, { exact: true }).selectOption(value);
  await expect(wardrobe.getByRole("status")).toContainText(
    "Appearance updated",
  );
  await expect(wardrobe.getByLabel(label, { exact: true })).toHaveValue(value);
}

async function olderProject(fixture: Fixture, faceId: "gentle" | null) {
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
  project = updateWardrobePreview(project, { action: "run", facing: "left" });
  return exportWardrobeProject(project);
}

for (const character of ["male", "female"] as const) {
  test(`${character}: Natural, Gentle smile and Joyful have distinct fixture face pixels`, async ({
    page,
  }) => {
    const fixture = await installAppearanceFixture(page, { joyful: true });
    await page.goto(`/workbench.html?character=${character}&mode=wardrobe`);
    const wardrobe = page.locator("#wardrobe-panel");
    const preview = wardrobe.getByTestId("wardrobe-preview");
    const face = wardrobe.getByLabel("Face", { exact: true });
    await expect(wardrobe.getByRole("status")).toContainText(
      "Original outfit.",
    );
    await expect(face.locator("option")).toHaveText([
      "Natural (original)",
      "Gentle smile",
      "Joyful",
    ]);
    expect(fixture.bankRequests()).toBe(0);

    // Keep padding and hair identical so only the face can explain the change.
    await choose(wardrobe, "Hairstyle", "soft-crop");
    await expect(face).toHaveValue("");
    await expect(preview).toHaveAttribute("width", "12");
    await expect(preview).toHaveAttribute("height", "10");
    const natural = await canvasPixels(preview);
    const blue = character === "male" ? 110 : 170;
    expect(await facePixels(preview)).toEqual([
      36,
      24,
      blue,
      255,
      48,
      24,
      blue,
      255,
    ]);

    await choose(wardrobe, "Face", "gentle");
    const gentle = await canvasPixels(preview);
    expect(await facePixels(preview)).toEqual([
      225, 170, 120, 255, 225, 170, 120, 255,
    ]);
    await choose(wardrobe, "Face", "joyful");
    const joyful = await canvasPixels(preview);
    expect(await facePixels(preview)).toEqual([
      248, 208, 72, 255, 248, 208, 72, 255,
    ]);
    expect(new Set([natural, gentle, joyful]).size).toBe(3);

    await choose(wardrobe, "Face", "");
    expect(await canvasPixels(preview)).toBe(natural);
    await choose(wardrobe, "Face", "gentle");
    expect(await canvasPixels(preview)).toBe(gentle);
    expect(fixture.bankRequests()).toBe(1);
  });
}

test("Joyful survives base/library hair changes, exact save/reopen and export with all actions", async ({
  page,
}, testInfo) => {
  const fixture = await installAppearanceFixture(page, {
    joyful: true,
    libraryBank: true,
  });
  await page.goto("/workbench.html?character=female&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  const preview = wardrobe.getByTestId("wardrobe-preview");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await wardrobe.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(wardrobe.getByRole("status")).toContainText("Daily selected");
  await choose(wardrobe, "Hairstyle", "soft-crop");
  await choose(wardrobe, "Face", "joyful");
  await choose(wardrobe, "Hair color", "copper");
  const basePixels = await canvasPixels(preview);
  const joyfulFace = await facePixels(preview);
  for (const hair of ["volume-hair", "soft-bob", "soft-crop", "volume-hair"]) {
    await choose(wardrobe, "Hairstyle", hair);
    await expect(wardrobe.getByLabel("Face", { exact: true })).toHaveValue(
      "joyful",
    );
    await expect(
      wardrobe.getByLabel("Hair color", { exact: true }),
    ).toHaveValue("copper");
    expect(await facePixels(preview)).toEqual(joyfulFace);
    if (hair === "soft-crop")
      expect(await canvasPixels(preview)).toBe(basePixels);
  }
  expect(fixture.bankRequests()).toBe(2);
  await wardrobe
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption("run");
  await wardrobe
    .getByLabel("Wardrobe facing", { exact: true })
    .selectOption("left");
  await wardrobe.getByLabel("Wardrobe frame", { exact: true }).fill("1");
  await expect(preview).toHaveAttribute("data-frame-position", "1");
  await expect(preview).toHaveAttribute("data-rendered-frame-id", "19");
  const acceptedPixels = await canvasPixels(preview);
  const download = page.waitForEvent("download");
  await wardrobe.getByRole("button", { name: /Save wardrobe/ }).click();
  const projectPath = testInfo.outputPath("joyful.wardrobe.zip");
  await (await download).saveAs(projectPath);
  const saved = await importWardrobeProject(
    new Uint8Array(await readFile(projectPath)),
  );
  expect(saved.document.version).toBe(2);
  if (saved.document.version !== 2) throw Error("Expected appearance project");
  expect(saved.document.appearance).toEqual({
    bankSha256: saved.appearanceBank!.sha256,
    hairId: "volume-hair",
    faceId: "joyful",
    hairColor: "copper",
  });
  expect(saved.appearanceBank!.bytes).toEqual(
    fixture.banks.get("/fixture-appearance/female-volume.zip"),
  );
  expect(saved.document.selection).toEqual({
    top: "female-top",
    bottom: "female-bottom",
    fullBody: null,
    shoes: null,
  });
  expect(saved.document.preview).toEqual({ action: "run", facing: "left" });
  expect(saved.source).toEqual(fixture.fixtures.female.source);

  await page.reload();
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await page.route("**/fixture-appearance/**", (route) =>
    route.fulfill({ status: 503, body: "Banks unavailable after saving" }),
  );
  await wardrobe
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles(projectPath);
  await expect(wardrobe.getByRole("status")).toContainText(
    "Saved outfit and action settings restored",
  );
  for (const [label, value] of [
    ["Hairstyle", "volume-hair"],
    ["Face", "joyful"],
    ["Hair color", "copper"],
    ["Top", "female-top"],
    ["Bottom", "female-bottom"],
    ["Wardrobe action", "run"],
    ["Wardrobe facing", "left"],
  ]) {
    await expect(wardrobe.getByLabel(label, { exact: true })).toHaveValue(
      value,
    );
  }
  await wardrobe.getByLabel("Wardrobe frame", { exact: true }).fill("1");
  await expect(preview).toHaveAttribute("data-frame-position", "1");
  expect(await canvasPixels(preview)).toBe(acceptedPixels);
  expect(fixture.bankRequests()).toBe(2);

  const packDownload = page.waitForEvent("download");
  await wardrobe
    .getByRole("button", { name: "Export CharacterPack", exact: true })
    .click();
  const packPath = testInfo.outputPath("joyful.character.zip");
  await (await packDownload).saveAs(packPath);
  const pack = readPortableCharacterPackArchive(
    new Uint8Array(await readFile(packPath)),
  );
  expect(Object.keys(pack.manifest.animations).sort()).toEqual([
    "celebrate",
    "idle",
    "jump",
    "run",
    "walk",
  ]);
  expect(pack.manifest.animations).toEqual(saved.archive.manifest.animations);
  expect(pack.config.derivation.frames).toEqual(
    saved.archive.config.derivation.frames,
  );
  expect(pack.manifest.facing).toEqual(saved.archive.manifest.facing);
  const png = decodeSourceRgbaPng(pack.png, pack.manifest.spritesheet);
  for (const frame of pack.manifest.frames) {
    const offset = ((frame.y + 3) * png.width + frame.x + 5) * 4;
    expect(Array.from(png.pixels.subarray(offset, offset + 8))).toEqual(
      joyfulFace,
    );
  }
});

for (const faceId of [null, "gentle"] as const) {
  test(`an older saved ${faceId ?? "natural"} face keeps its embedded bank when Joyful is published`, async ({
    page,
  }, testInfo) => {
    const fixture = await installAppearanceFixture(page, {
      joyful: true,
      libraryBank: true,
    });
    const bytes = await olderProject(fixture, faceId);
    const original = await importWardrobeProject(bytes);
    await page.goto("/workbench.html?character=male&mode=wardrobe");
    const wardrobe = page.locator("#wardrobe-panel");
    const face = wardrobe.getByLabel("Face", { exact: true });
    const preview = wardrobe.getByTestId("wardrobe-preview");
    await expect(wardrobe.getByRole("status")).toContainText(
      "Original outfit.",
    );
    await expect(face.locator('option[value="joyful"]')).toHaveCount(1);
    await wardrobe
      .getByLabel("Open wardrobe project file", { exact: true })
      .setInputFiles({
        name: "older-expression.wardrobe.zip",
        mimeType: "application/zip",
        buffer: Buffer.from(bytes),
      });
    await expect(wardrobe.getByRole("status")).toContainText(
      "Saved outfit and action settings restored",
    );
    await expect(face).toHaveValue(faceId ?? "");
    await expect(face.locator('option[value="joyful"]')).toHaveCount(0);
    await expect(
      wardrobe.getByRole("button", {
        name: "Preview updated appearance",
        exact: true,
      }),
    ).toBeVisible();
    const oldPixels = await canvasPixels(preview);
    const download = page.waitForEvent("download");
    await wardrobe.getByRole("button", { name: /Save wardrobe/ }).click();
    const savedPath = testInfo.outputPath("still-older.wardrobe.zip");
    await (await download).saveAs(savedPath);
    const kept = await importWardrobeProject(
      new Uint8Array(await readFile(savedPath)),
    );
    expect(kept.appearanceBank!.bytes).toEqual(fixture.variants.male.previous);
    expect(kept.document).toEqual(original.document);
    expect(
      kept.appearanceBank!.manifest.styles.map((style) => style.id),
    ).not.toContain("joyful");
    expect(fixture.bankRequests()).toBe(0);

    await page.reload();
    await expect(wardrobe.getByRole("status")).toContainText(
      "Original outfit.",
    );
    await wardrobe
      .getByLabel("Open wardrobe project file", { exact: true })
      .setInputFiles(savedPath);
    await expect(wardrobe.getByRole("status")).toContainText(
      "Saved outfit and action settings restored",
    );
    await expect(face).toHaveValue(faceId ?? "");
    await expect(face.locator('option[value="joyful"]')).toHaveCount(0);
    expect(await canvasPixels(preview)).toBe(oldPixels);
    expect(fixture.bankRequests()).toBe(0);
  });
}
