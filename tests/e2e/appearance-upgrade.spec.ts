import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Locator } from "@playwright/test";
import {
  addWardrobeAppearanceBank,
  createWardrobeProject,
  exportWardrobeProject,
  importWardrobeProject,
  selectWardrobeAppearance,
  selectWardrobeGarment,
  updateWardrobePreview,
} from "../../src/wardrobe/project";
import { readPortableCharacterPackArchive } from "../../src/core/pack";
import { installAppearanceFixture } from "./appearance-fixture";

// Tiny synthetic banks verify controls, immutable copies and file contracts.
// They are not used to judge the quality of the actual Kling artwork.
type Fixture = Awaited<ReturnType<typeof installAppearanceFixture>>;
type Revision = keyof Fixture["variants"][string];
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const canvasPixels = (canvas: Locator) =>
  canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());

async function savedProject(
  fixture: Fixture,
  revision: Revision | null = "previous",
) {
  const male = fixture.fixtures.male;
  let project = await createWardrobeProject(
    male.source,
    male.registrationBytes,
    male.items.map((item) => item.bytes),
  );
  project = selectWardrobeGarment(project, "top", "male-top");
  project = selectWardrobeGarment(project, "bottom", "male-bottom");
  project = updateWardrobePreview(project, { action: "run", facing: "left" });
  if (revision) {
    project = await addWardrobeAppearanceBank(
      project,
      fixture.variants.male[revision],
    );
    project = selectWardrobeAppearance(project, {
      hairId: "soft-crop",
      faceId: "gentle",
      hairColor: "espresso",
    });
  }
  return exportWardrobeProject(project);
}

async function openSaved(wardrobe: Locator, bytes: Uint8Array) {
  await wardrobe
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles({
      name: "older-look.wardrobe.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(bytes),
    });
  await expect(wardrobe.getByRole("status")).toContainText(
    "Saved outfit and action settings restored",
  );
}

test("hair thumbnails and named swatches change the same persisted appearance selection", async ({
  page,
}) => {
  const fixture = await installAppearanceFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  expect(fixture.bankRequests()).toBe(0);
  await wardrobe
    .getByRole("button", { name: "Choose Soft crop", exact: true })
    .click();
  await expect(wardrobe.getByLabel("Hairstyle", { exact: true })).toHaveValue(
    "soft-crop",
  );
  await expect(wardrobe.getByRole("status")).toContainText(
    "Appearance updated",
  );
  await wardrobe
    .getByRole("button", { name: "Use Copper", exact: true })
    .click();
  await expect(wardrobe.getByLabel("Hair color", { exact: true })).toHaveValue(
    "copper",
  );
  await expect(wardrobe.getByRole("status")).toContainText(
    "Appearance updated",
  );
  await wardrobe
    .getByRole("button", { name: "Choose Soft bob", exact: true })
    .click();
  await expect(wardrobe.getByLabel("Hairstyle", { exact: true })).toHaveValue(
    "soft-bob",
  );
  await expect(wardrobe.getByRole("status")).toContainText(
    "Appearance updated",
  );
  await expect(wardrobe.getByLabel("Hair color", { exact: true })).toHaveValue(
    "copper",
  );
  expect(fixture.bankRequests()).toBe(1);
});

test("older appearance previews without changing the open outfit and saves a separate usable copy", async ({
  page,
  context,
}, testInfo) => {
  const fixture = await installAppearanceFixture(page);
  const oldBytes = await savedProject(fixture);
  const oldSha = sha(oldBytes);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await openSaved(wardrobe, oldBytes);
  expect(fixture.bankRequests()).toBe(0);
  // A pending, unsaved clothing edit must survive preview, cancellation and copying.
  await wardrobe
    .getByLabel("Shoes", { exact: true })
    .selectOption("male-shoes");
  await expect(wardrobe.getByRole("status")).toContainText("Outfit updated");
  await wardrobe.getByLabel("Wardrobe frame", { exact: true }).fill("1");
  const main = wardrobe.getByTestId("wardrobe-preview");
  await expect(main).toHaveAttribute("data-frame-position", "1");
  const originalPixels = await canvasPixels(main);
  await expect(main).toHaveAttribute("data-facing", "left");
  await expect(main).toHaveAttribute("data-action", "run");

  await wardrobe
    .getByRole("button", { name: "Preview updated appearance", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Preview updated appearance",
    exact: true,
  });
  const before = dialog.getByTestId("appearance-update-before");
  const after = dialog.getByTestId("appearance-update-after");
  await expect(after).toBeVisible();
  await expect(
    dialog.getByLabel("Update preview action", { exact: true }),
  ).toHaveValue("run");
  await expect(
    dialog.getByLabel("Update preview facing", { exact: true }),
  ).toHaveValue("left");
  await expect(
    dialog.getByLabel("Update preview frame", { exact: true }),
  ).toHaveValue("1");
  expect(await canvasPixels(before)).toBe(originalPixels);
  const updatedPixels = await canvasPixels(after);
  expect(updatedPixels).not.toBe(originalPixels);
  expect(await canvasPixels(main)).toBe(originalPixels);
  await dialog
    .getByLabel("Update preview action", { exact: true })
    .selectOption("jump");
  await dialog
    .getByLabel("Update preview facing", { exact: true })
    .selectOption("right");
  await dialog.getByLabel("Update preview frame", { exact: true }).fill("2");
  await expect(before).toHaveAttribute("data-rendered-frame-id", "7");
  await expect(after).toHaveAttribute("data-rendered-frame-id", "7");
  const observed = after.evaluate(
    (canvas) =>
      new Promise<number[]>((resolve) => {
        const frames = new Set<number>();
        const observer = new MutationObserver(() =>
          frames.add(Number((canvas as HTMLElement).dataset.framePosition)),
        );
        observer.observe(canvas, {
          attributes: true,
          attributeFilter: ["data-frame-position"],
        });
        window.setTimeout(() => {
          observer.disconnect();
          resolve([...frames]);
        }, 900);
      }),
  );
  await dialog
    .getByRole("button", { name: "Play update preview", exact: true })
    .click();
  // Replaying a completed one-shot starts at its beginning and stops at landing.
  expect((await observed).sort()).toEqual([0, 1, 2]);
  await expect(
    dialog.getByRole("button", { name: "Play update preview", exact: true }),
  ).toBeVisible();
  await expect(before).toHaveAttribute("data-frame-position", "2");
  await expect(after).toHaveAttribute("data-frame-position", "2");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    wardrobe.getByRole("button", {
      name: "Preview updated appearance",
      exact: true,
    }),
  ).toBeFocused();
  await expect(main).toHaveAttribute("data-frame-position", "1");
  await expect(main).toHaveAttribute("data-facing", "left");
  await expect(main).toHaveAttribute("data-action", "run");
  expect(await canvasPixels(main)).toBe(originalPixels);

  const originalDownload = page.waitForEvent("download");
  await wardrobe.getByRole("button", { name: /Save wardrobe/ }).click();
  const keptPath = testInfo.outputPath("kept-original.wardrobe.zip");
  await (await originalDownload).saveAs(keptPath);
  const kept = await importWardrobeProject(
    new Uint8Array(await readFile(keptPath)),
  );
  expect(kept.appearanceBank?.bytes).toEqual(fixture.variants.male.previous);
  expect(kept.document.selection.shoes).toBe("male-shoes");

  await wardrobe
    .getByRole("button", { name: "Preview updated appearance", exact: true })
    .click();
  await expect(after).toBeVisible();
  // Inspection is temporary: the saved copy retains the project's run/left
  // settings even after reviewing a different action and facing in the dialog.
  await dialog
    .getByLabel("Update preview action", { exact: true })
    .selectOption("celebrate");
  await dialog
    .getByLabel("Update preview facing", { exact: true })
    .selectOption("right");
  const copyDownload = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Save updated copy", exact: true })
    .click();
  const copy = await copyDownload;
  expect(copy.suggestedFilename()).toContain("appearance-updated");
  const copyPath = testInfo.outputPath("updated-copy.wardrobe.zip");
  await copy.saveAs(copyPath);
  // Original remains open; saving a copy does not commit the preview.
  await expect(main).toHaveAttribute("data-frame-position", "1");
  expect(await canvasPixels(main)).toBe(originalPixels);
  expect(sha(oldBytes)).toBe(oldSha);
  const saved = await importWardrobeProject(
    new Uint8Array(await readFile(copyPath)),
  );
  expect(saved.appearanceBank?.bytes).toEqual(fixture.variants.male.current);
  expect(saved.document.selection).toEqual(kept.document.selection);
  expect(saved.document.preview).toEqual({ action: "run", facing: "left" });
  expect(saved.source).toEqual(kept.source);
  expect(saved.registrationBytes).toEqual(kept.registrationBytes);
  expect(saved.document.version).toBe(2);
  if (saved.document.version !== 2) throw Error("Expected an appearance copy");
  expect(saved.document.appearance).toMatchObject({
    hairId: "soft-crop",
    faceId: "gentle",
    hairColor: "espresso",
    bankSha256: fixture.revisions.male.bankSha256,
  });

  if (await dialog.isVisible())
    await dialog
      .getByRole("button", { name: "Cancel preview", exact: true })
      .click();
  await wardrobe
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles(copyPath);
  await expect(wardrobe.getByRole("status")).toContainText(
    "Saved outfit and action settings restored",
  );
  await wardrobe.getByLabel("Wardrobe frame", { exact: true }).fill("1");
  expect(await canvasPixels(main)).toBe(updatedPixels);
  await expect(
    wardrobe.getByRole("button", {
      name: "Preview updated appearance",
      exact: true,
    }),
  ).toHaveCount(0);

  const packDownload = page.waitForEvent("download");
  await wardrobe
    .getByRole("button", { name: "Export CharacterPack", exact: true })
    .click();
  const packPath = testInfo.outputPath("updated-copy.character.zip");
  await (await packDownload).saveAs(packPath);
  const pack = readPortableCharacterPackArchive(
    new Uint8Array(await readFile(packPath)),
  );
  expect(pack.manifest.animations).toEqual(saved.archive.manifest.animations);
  expect(pack.manifest.anchor).toMatchObject({ x: 6, y: 9 });
  await page.close();
  const player = await context.newPage();
  await player.goto("/player.html");
  await player.locator("#player-zip").setInputFiles(packPath);
  await expect(player.getByRole("status")).toContainText("Loaded:");
  await player.getByRole("button", { name: "Run", exact: true }).click();
  await player.getByRole("button", { name: "Left", exact: true }).click();
  await expect(player.getByTestId("consumer-canvas")).toBeVisible();
});

for (const revision of ["current", "custom", "newer"] as const) {
  test(`a ${revision} appearance is preserved without offering a catalog downgrade`, async ({
    page,
  }) => {
    const fixture = await installAppearanceFixture(page);
    const bytes = await savedProject(fixture, revision);
    await page.goto("/workbench.html?character=male&mode=wardrobe");
    const wardrobe = page.locator("#wardrobe-panel");
    await expect(wardrobe.getByRole("status")).toContainText(
      "Original outfit.",
    );
    await openSaved(wardrobe, bytes);
    await expect(
      wardrobe.getByRole("button", {
        name: "Preview updated appearance",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(wardrobe.getByLabel("Hairstyle", { exact: true })).toHaveValue(
      "soft-crop",
    );
    expect(fixture.bankRequests()).toBe(0);
  });
}

test("a mismatched replacement download fails without changing the accepted project", async ({
  page,
}) => {
  const fixture = await installAppearanceFixture(page);
  const bytes = await savedProject(fixture);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await openSaved(wardrobe, bytes);
  const preview = wardrobe.getByTestId("wardrobe-preview");
  const original = await canvasPixels(preview);
  fixture.banks.set(
    "/fixture-appearance/male.zip",
    fixture.variants.female.current,
  );
  await wardrobe
    .getByRole("button", { name: "Preview updated appearance", exact: true })
    .click();
  await expect(wardrobe.getByRole("alert")).toBeVisible();
  expect(await canvasPixels(preview)).toBe(original);
  await expect(
    page.getByRole("dialog", {
      name: "Preview updated appearance",
      exact: true,
    }),
  ).not.toBeVisible();
  await expect(wardrobe.getByLabel("Hair color", { exact: true })).toHaveValue(
    "espresso",
  );
  await expect(
    wardrobe.getByLabel("Wardrobe action", { exact: true }),
  ).toHaveValue("run");
  await expect(
    wardrobe.getByLabel("Wardrobe facing", { exact: true }),
  ).toHaveValue("left");
  // A good retry remains possible after a rejected bank.
  fixture.banks.set(
    "/fixture-appearance/male.zip",
    fixture.variants.male.current,
  );
  await wardrobe
    .getByRole("button", { name: "Preview updated appearance", exact: true })
    .click();
  await expect(page.getByTestId("appearance-update-after")).toBeVisible();
});

test("a V1 project adds head options only in an explicitly saved copy", async ({
  page,
}, testInfo) => {
  const fixture = await installAppearanceFixture(page);
  const bytes = await savedProject(fixture, null);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await openSaved(wardrobe, bytes);
  const main = wardrobe.getByTestId("wardrobe-preview");
  const original = await canvasPixels(main);
  expect(fixture.bankRequests()).toBe(0);
  await wardrobe
    .getByRole("button", { name: "Preview updated appearance", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Preview updated appearance",
    exact: true,
  });
  await expect(dialog.getByTestId("appearance-update-after")).toBeVisible();
  expect(
    await canvasPixels(dialog.getByTestId("appearance-update-before")),
  ).toBe(original);
  expect(
    await canvasPixels(dialog.getByTestId("appearance-update-after")),
  ).toBe(original);
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Save updated copy", exact: true })
    .click();
  const path = testInfo.outputPath("v1-copy.wardrobe.zip");
  await (await download).saveAs(path);
  const saved = await importWardrobeProject(
    new Uint8Array(await readFile(path)),
  );
  expect(saved.document.version).toBe(2);
  if (saved.document.version !== 2) throw Error("Expected an appearance copy");
  expect(saved.document.appearance).toMatchObject({
    hairId: null,
    faceId: null,
  });
  expect(saved.appearanceBank?.bytes).toEqual(fixture.variants.male.current);
  expect((await importWardrobeProject(bytes)).document.version).toBe(1);
  expect(await canvasPixels(main)).toBe(original);
});

test("a catalog revision bound to another source is not offered to the saved project", async ({
  page,
}) => {
  const fixture = await installAppearanceFixture(page);
  const bytes = await savedProject(fixture);
  fixture.revisions.male.sourceSha256 = "f".repeat(64);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await openSaved(wardrobe, bytes);
  await expect(
    wardrobe.getByRole("button", {
      name: "Preview updated appearance",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(fixture.bankRequests()).toBe(0);
});

test("leaving the wardrobe cancels a pending update and cannot open a stale modal", async ({
  page,
}) => {
  const fixture = await installAppearanceFixture(page);
  const bytes = await savedProject(fixture);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await openSaved(wardrobe, bytes);
  const original = await canvasPixels(wardrobe.getByTestId("wardrobe-preview"));
  let release!: () => void;
  let requested!: () => void;
  let finished!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const ended = new Promise<void>((resolve) => {
    finished = resolve;
  });
  const held = async (route: import("@playwright/test").Route) => {
    requested();
    await waiting;
    try {
      await route.fulfill({ body: Buffer.from(fixture.variants.male.current) });
    } finally {
      finished();
    }
  };
  await page.route("**/fixture-appearance/male.zip", held);
  await wardrobe
    .getByRole("button", { name: "Preview updated appearance", exact: true })
    .click();
  await started;
  await page.getByRole("tab", { name: "Sprite actions", exact: true }).click();
  release();
  await ended;
  await page.unroute("**/fixture-appearance/male.zip", held);
  await page.getByRole("tab", { name: "Wardrobe", exact: true }).click();
  await expect(wardrobe.getByRole("status")).toContainText(
    "Appearance preview canceled",
  );
  await expect(
    page.getByRole("dialog", {
      name: "Preview updated appearance",
      exact: true,
    }),
  ).not.toBeVisible();
  expect(await canvasPixels(wardrobe.getByTestId("wardrobe-preview"))).toBe(
    original,
  );
  await wardrobe
    .getByRole("button", { name: "Preview updated appearance", exact: true })
    .click();
  await expect(page.getByTestId("appearance-update-after")).toBeVisible();
});

test("new character-specific hair is discoverable before loading while older embedded banks stay authoritative", async ({
  page,
}, testInfo) => {
  const fixture = await installAppearanceFixture(page, {
    expandedStyles: true,
  });
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  const hairstyle = wardrobe.getByLabel("Hairstyle", { exact: true });
  await expect(
    wardrobe.getByRole("button", { name: "Choose Side part", exact: true }),
  ).toBeVisible();
  await expect(hairstyle.locator('option[value="side-part"]')).toHaveCount(1);
  await expect(hairstyle.locator('option[value="tucked-bun"]')).toHaveCount(0);
  expect(fixture.bankRequests()).toBe(0);
  await wardrobe
    .getByRole("button", { name: "Choose Side part", exact: true })
    .click();
  await expect(wardrobe.getByRole("status")).toContainText(
    "Appearance updated",
  );
  await expect(hairstyle).toHaveValue("side-part");
  expect(fixture.bankRequests()).toBe(1);

  await wardrobe
    .getByLabel("Wardrobe character", { exact: true })
    .selectOption("female");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await expect(
    wardrobe.getByRole("button", { name: "Choose Tucked bun", exact: true }),
  ).toBeVisible();
  await expect(hairstyle.locator('option[value="tucked-bun"]')).toHaveCount(1);
  await expect(hairstyle.locator('option[value="side-part"]')).toHaveCount(0);
  expect(fixture.bankRequests()).toBe(1);
  await wardrobe
    .getByRole("button", { name: "Choose Tucked bun", exact: true })
    .click();
  await expect(wardrobe.getByRole("status")).toContainText(
    "Appearance updated",
  );
  await expect(hairstyle).toHaveValue("tucked-bun");
  expect(fixture.bankRequests()).toBe(2);

  // The current catalog must not advertise unavailable choices in an older
  // embedded bank. Only an explicitly saved/reopened update gains the new style.
  await openSaved(wardrobe, await savedProject(fixture));
  await expect(hairstyle).toHaveValue("soft-crop");
  await expect(hairstyle.locator('option[value="side-part"]')).toHaveCount(0);
  await expect(
    wardrobe.getByRole("button", { name: "Choose Side part", exact: true }),
  ).toHaveCount(0);
  expect(fixture.bankRequests()).toBe(2);
  await wardrobe
    .getByRole("button", { name: "Preview updated appearance", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Preview updated appearance",
    exact: true,
  });
  await expect(dialog.getByTestId("appearance-update-after")).toBeVisible();
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Save updated copy", exact: true })
    .click();
  const path = testInfo.outputPath("expanded-styles.wardrobe.zip");
  await (await download).saveAs(path);
  await dialog
    .getByRole("button", { name: "Cancel preview", exact: true })
    .click();
  await wardrobe
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles(path);
  await expect(wardrobe.getByRole("status")).toContainText(
    "Saved outfit and action settings restored",
  );
  await expect(
    wardrobe.getByRole("button", { name: "Choose Side part", exact: true }),
  ).toBeVisible();
  await expect(hairstyle.locator('option[value="tucked-bun"]')).toHaveCount(0);
  await wardrobe
    .getByRole("button", { name: "Choose Side part", exact: true })
    .click();
  await expect(wardrobe.getByRole("status")).toContainText(
    "Appearance updated",
  );
  await expect(hairstyle).toHaveValue("side-part");
  // Explicit upgrade reuses the already verified current male bank. It still
  // requires saving and reopening the copy; no old embedded bytes are replaced.
  expect(fixture.bankRequests()).toBe(2);
});
