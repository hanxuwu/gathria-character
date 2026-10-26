import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";
import { readPortableCharacterPackArchive } from "../../src/core/pack";
import { importWardrobeProject } from "../../src/wardrobe/project";
import { installWardrobeFixture } from "./wardrobe-fixture";

// Tiny synthetic drawings verify authoring decisions and exact output pixels.
// They are deliberately separate from the real Kling artwork review.
const maskDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Clothing mask workbench", exact: true });
const candidateDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Preview imported clothing", exact: true });
const button = (scope: Locator, name: string | RegExp) =>
  scope.getByRole("button", { name, exact: true });
const canvasRgba = (canvas: Locator) =>
  canvas.evaluate((node: HTMLCanvasElement) => ({
    width: node.width,
    height: node.height,
    pixels: Array.from(
      node.getContext("2d")!.getImageData(0, 0, node.width, node.height).data,
    ),
  }));

async function download(page: Page, scope: Locator, name: string | RegExp) {
  const pending = page.waitForEvent("download");
  await button(scope, name).click();
  const file = await pending;
  return new Uint8Array(await readFile((await file.path())!));
}

async function start(page: Page) {
  const fixture = await installWardrobeFixture(page, { maskEditing: true });
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const panel = page.locator("#wardrobe-panel");
  await expect(panel.getByRole("status")).toContainText("Original outfit.");
  await button(panel, "Daily").click();
  await expect(panel.getByRole("status")).toContainText("Daily selected");
  await panel
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption("run");
  await panel.getByLabel("Wardrobe frame", { exact: true }).fill("0");
  await expect(panel.getByTestId("wardrobe-preview")).toHaveAttribute(
    "data-rendered-frame-id",
    "7",
  );
  const original = await canvasRgba(panel.getByTestId("wardrobe-preview"));
  await panel.getByLabel("Wardrobe frame", { exact: true }).fill("1");
  await expect(panel.getByTestId("wardrobe-preview")).toHaveAttribute(
    "data-rendered-frame-id",
    "19",
  );
  const neighbor = await canvasRgba(panel.getByTestId("wardrobe-preview"));
  await panel.getByLabel("Wardrobe frame", { exact: true }).fill("0");
  await panel.locator("summary").filter({ hasText: "Fitting guides" }).click();
  await panel
    .getByLabel("Recipe clothing", { exact: true })
    .selectOption("male-top");
  await button(panel, "Edit clothing mask").click();
  const dialog = maskDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("mask-edit-canvas")).toHaveAttribute(
    "data-frame-id",
    "7",
  );
  await dialog.getByLabel("Show mask overlay", { exact: true }).uncheck();
  return { fixture, panel, dialog, original, neighbor };
}

async function coordinates(dialog: Locator, x: number, y: number) {
  await dialog.getByLabel("Native X", { exact: true }).fill(String(x));
  await dialog.getByLabel("Native Y", { exact: true }).fill(String(y));
}

async function paintAddedCloth(dialog: Locator) {
  await button(dialog, "Sample cloth").click();
  await coordinates(dialog, 3, 4);
  await button(dialog, "Use sample coordinates").click();
  await button(dialog, "Add clothing").click();
  await dialog.getByLabel("Brush size", { exact: true }).fill("1");
  await coordinates(dialog, 1, 4);
  await button(dialog, "Apply brush at coordinates").click();
}

async function preview(page: Page, dialog: Locator, id: string) {
  await dialog.getByLabel("New clothing ID", { exact: true }).fill(id);
  await dialog
    .getByLabel("New clothing name", { exact: true })
    .fill("Reviewed mask shirt");
  await button(dialog, "Preview corrected clothing").click();
  const candidate = candidateDialog(page);
  await expect(candidate).toBeVisible();
  return candidate;
}

function packFrame(bytes: Uint8Array, id: number) {
  const pack = readPortableCharacterPackArchive(bytes);
  const frame = pack.manifest.frames.find((entry) => entry.id === id)!;
  const page = frame.page ?? 0;
  const image = decodeSourceRgbaPng(
    page === 0 ? pack.png : pack.additionalPngs![page - 1],
  );
  const pixels: number[] = [];
  for (let y = 0; y < frame.height; y++) {
    const offset = ((frame.y + y) * image.width + frame.x) * 4;
    pixels.push(...image.pixels.slice(offset, offset + frame.width * 4));
  }
  return { pack, pixels, width: frame.width, height: frame.height };
}

test("brush, protected pixels and undo produce only explicitly accepted source poses; saved projects and packs retain those pixels", async ({
  page,
}) => {
  const { fixture, panel, dialog, original, neighbor } = await start(page);
  const canvas = dialog.getByTestId("mask-edit-canvas");
  const untouched = await canvasRgba(canvas);
  await paintAddedCloth(dialog);
  const painted = await canvasRgba(canvas);
  expect(painted).not.toEqual(untouched);
  // The open look is not mutated by authoring or unaccepted propagation.
  expect(await canvasRgba(panel.getByTestId("wardrobe-preview"))).toEqual(
    original,
  );
  await button(dialog, "Restore source").click();
  await coordinates(dialog, 3, 4);
  await button(dialog, "Apply brush at coordinates").click();
  expect(await canvasRgba(canvas)).not.toEqual(painted);
  await button(dialog, "Undo stroke").click();
  expect(await canvasRgba(canvas)).toEqual(painted);
  // A protected head stroke cannot alter the edit, even when sampled cloth is valid.
  await button(dialog, "Add clothing").click();
  await coordinates(dialog, 3, 0);
  await button(dialog, "Apply brush at coordinates").click();
  expect(await canvasRgba(canvas)).toEqual(painted);
  await button(dialog, "Suggest neighboring poses").click();
  await dialog
    .getByRole("combobox", { name: "Source pose", exact: true })
    .selectOption("19");
  await expect(dialog.getByTestId("mask-pose-status")).toContainText(
    /pending/i,
  );
  await button(dialog, "Reject pose").click();
  await dialog
    .getByRole("combobox", { name: "Source pose", exact: true })
    .selectOption("7");
  await button(dialog, "Accept pose").click();
  const candidate = await preview(page, dialog, "mask-reviewed-top");
  expect(await canvasRgba(panel.getByTestId("wardrobe-preview"))).toEqual(
    original,
  );
  const material = await download(page, candidate, "Save corrected clothing");
  const report = JSON.parse(
    new TextDecoder().decode(
      await download(page, candidate, "Save mask report"),
    ),
  );
  expect(report.output.sha256).toBe(
    createHash("sha256").update(material).digest("hex"),
  );
  expect(
    report.accepted.map((pose: { frameId: number }) => pose.frameId),
  ).toEqual([7]);
  expect(report.excluded).toContainEqual({ frameId: 19, decision: "rejected" });
  await button(candidate, "Apply clothing candidate").click();
  await expect(candidate).toHaveCount(0);
  await expect(panel.getByLabel("Top", { exact: true })).toHaveValue(
    "mask-reviewed-top",
  );
  const after = await canvasRgba(panel.getByTestId("wardrobe-preview"));
  expect(after).not.toEqual(original);
  const savedBytes = await download(page, panel, /^Save wardrobe/);
  const saved = await importWardrobeProject(savedBytes);
  expect(saved.source).toEqual(fixture.male.source);
  expect(saved.registrationBytes).toEqual(fixture.male.registrationBytes);
  expect(
    saved.items.find((item) => item.manifest.id === "mask-reviewed-top")!.bytes,
  ).toEqual(material);
  const packBytes = await download(page, panel, "Export CharacterPack");
  const actualSeed = packFrame(packBytes, 7),
    actualNeighbor = packFrame(packBytes, 19);
  expect(actualNeighbor.pixels).toEqual(neighbor.pixels);
  expect(actualSeed.pixels).toEqual(after.pixels);
  expect(actualSeed.pixels.slice((4 * 8 + 1) * 4, (4 * 8 + 2) * 4)).toEqual([
    18, 137, 145, 255,
  ]);
  expect(actualSeed.pixels.slice(0, 8 * 2 * 4)).toEqual(
    original.pixels.slice(0, 8 * 2 * 4),
  );
  for (let i = 3; i < actualSeed.pixels.length; i += 4)
    expect(actualSeed.pixels[i]).toBe(original.pixels[i]);
  expect(actualSeed.pack.manifest.animations).toEqual(
    saved.archive.manifest.animations,
  );
  expect(actualSeed.pack.manifest.anchor).toEqual(
    saved.archive.manifest.anchor,
  );
  await button(panel, "Undo styling").click();
  expect(await canvasRgba(panel.getByTestId("wardrobe-preview"))).toEqual(
    original,
  );
  await panel
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles({
      name: "mask-reviewed.wardrobe.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(savedBytes),
    });
  await expect(panel.getByRole("status")).toContainText(
    "Saved outfit and action settings restored",
  );
  expect(await canvasRgba(panel.getByTestId("wardrobe-preview"))).toEqual(
    after,
  );
});

test("a propagated pose stays pending until accepted and later edits revoke its acceptance", async ({
  page,
}) => {
  const { panel, dialog, original, neighbor } = await start(page);
  await paintAddedCloth(dialog);
  await button(dialog, "Accept pose").click();
  await button(dialog, "Suggest neighboring poses").click();
  await dialog
    .getByRole("combobox", { name: "Source pose", exact: true })
    .selectOption("19");
  await expect(dialog.getByTestId("mask-pose-status")).toContainText(
    /pending/i,
  );
  await button(dialog, "Accept pose").click();
  await expect(dialog.getByTestId("mask-pose-status")).toContainText(
    /accepted/i,
  );
  await button(dialog, "Restore source").click();
  await coordinates(dialog, 1, 4);
  await button(dialog, "Apply brush at coordinates").click();
  await expect(dialog.getByTestId("mask-pose-status")).toContainText(
    /pending|unchanged/i,
  );
  const candidate = await preview(page, dialog, "seed-only-reviewed");
  await button(candidate, "Apply clothing candidate").click();
  const bytes = await download(page, panel, "Export CharacterPack");
  expect(packFrame(bytes, 19).pixels).toEqual(neighbor.pixels);
  expect(packFrame(bytes, 7).pixels).not.toEqual(original.pixels);
});

test("discarding the built candidate leaves the current outfit and undo history untouched", async ({
  page,
}) => {
  const { panel, dialog, original } = await start(page);
  await paintAddedCloth(dialog);
  await button(dialog, "Accept pose").click();
  const candidate = await preview(page, dialog, "discarded-mask-top");
  await button(candidate, "Discard clothing candidate").click();
  await expect(candidate).toHaveCount(0);
  expect(await canvasRgba(panel.getByTestId("wardrobe-preview"))).toEqual(
    original,
  );
  await expect(panel.getByLabel("Top", { exact: true })).toHaveValue(
    "male-top",
  );
  await button(panel, "Undo styling").click();
  await expect(panel.getByLabel("Top", { exact: true })).toHaveValue("");
  await button(panel, "Redo styling").click();
  expect(await canvasRgba(panel.getByTestId("wardrobe-preview"))).toEqual(
    original,
  );
});

test("mask drafts restore pixels and review decisions, while foreign bindings and a malformed later pose fail atomically", async ({
  page,
}) => {
  const { panel, dialog, original } = await start(page);
  const canvas = dialog.getByTestId("mask-edit-canvas");
  await paintAddedCloth(dialog);
  await button(dialog, "Accept pose").click();
  await button(dialog, "Suggest neighboring poses").click();
  const painted = await canvasRgba(canvas);
  const bytes = await download(page, dialog, "Save mask draft");
  const saved = JSON.parse(new TextDecoder().decode(bytes));
  expect(saved.poses.find((pose: any) => pose.frameId === 7).decision).toBe(
    "accepted",
  );
  expect(saved.poses.find((pose: any) => pose.frameId === 19).decision).toBe(
    "pending",
  );
  await button(dialog, "Reset pose").click();
  expect(await canvasRgba(canvas)).not.toEqual(painted);
  await dialog.getByLabel("Mask draft file", { exact: true }).setInputFiles({
    name: "review.mask-draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(bytes),
  });
  await expect(dialog.getByTestId("mask-workbench-status")).toContainText(
    "Draft reopened",
  );
  expect(await canvasRgba(canvas)).toEqual(painted);
  await expect(dialog.getByTestId("mask-pose-status")).toContainText(
    "accepted",
  );
  const reopened = JSON.parse(
    new TextDecoder().decode(await download(page, dialog, "Save mask draft")),
  );
  expect(reopened).toEqual(saved);
  const foreign = structuredClone(saved);
  foreign.binding.sourceSha256 = "0".repeat(64);
  const malformed = structuredClone(saved);
  malformed.poses.find(
    (pose: any) => pose.frameId === 19,
  ).commands[0].command.radius = -1;
  for (const input of [foreign, malformed]) {
    await dialog.getByLabel("Mask draft file", { exact: true }).setInputFiles({
      name: "invalid.mask-draft.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(input)),
    });
    await expect(dialog.getByRole("alert")).toContainText(
      "Your current draft has been kept",
    );
    expect(await canvasRgba(canvas)).toEqual(painted);
    const retained = JSON.parse(
      new TextDecoder().decode(await download(page, dialog, "Save mask draft")),
    );
    expect(retained).toEqual(saved);
  }
  expect(await canvasRgba(panel.getByTestId("wardrobe-preview"))).toEqual(
    original,
  );
  // The starting playhead is provenance, not a reason to reject otherwise
  // identical source-bound repairs. Reopen this draft from the other drawing.
  await button(dialog, "Close mask workbench").click();
  await panel.getByLabel("Wardrobe frame", { exact: true }).fill("1");
  await button(panel, "Edit clothing mask").click();
  await expect(dialog.getByTestId("mask-edit-canvas")).toHaveAttribute(
    "data-frame-id",
    "19",
  );
  await dialog.getByLabel("Show mask overlay", { exact: true }).uncheck();
  await dialog.getByLabel("Mask draft file", { exact: true }).setInputFiles({
    name: "another-playhead.mask-draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(bytes),
  });
  await expect(dialog.getByTestId("mask-workbench-status")).toContainText(
    "Draft reopened",
  );
  await dialog
    .getByRole("combobox", { name: "Source pose", exact: true })
    .selectOption("7");
  expect(await canvasRgba(canvas)).toEqual(painted);
  await expect(dialog.getByTestId("mask-pose-status")).toContainText(
    "accepted",
  );
  const anotherPlayhead = JSON.parse(
    new TextDecoder().decode(await download(page, dialog, "Save mask draft")),
  );
  expect(anotherPlayhead.binding).toEqual({ ...saved.binding, position: 1 });
  expect(anotherPlayhead.poses).toEqual(saved.poses);
});

test("held drawings offer their distinct neighboring pose without wrapping a one-shot action", async ({
  page,
}) => {
  const { panel, dialog } = await start(page);
  await button(dialog, "Close mask workbench").click();
  await panel
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption("jump");
  await panel.getByLabel("Wardrobe frame", { exact: true }).fill("0");
  await button(panel, "Edit clothing mask").click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("mask-edit-canvas")).toHaveAttribute(
    "data-frame-id",
    "7",
  );
  await expect(button(dialog, "Next · pose 19")).toBeEnabled();
  await paintAddedCloth(dialog);
  await button(dialog, "Suggest neighboring poses").click();
  await dialog
    .getByRole("combobox", { name: "Source pose", exact: true })
    .selectOption("19");
  await expect(dialog.getByTestId("mask-pose-status")).toContainText(
    /pending/i,
  );
  const neighbors = dialog.getByLabel("Neighboring source poses", {
    exact: true,
  });
  await expect(neighbors.getByRole("button", { name: /^Next/ })).toHaveCount(0);
  const draft = JSON.parse(
    new TextDecoder().decode(await download(page, dialog, "Save mask draft")),
  );
  expect(draft.binding.action).toBe("jump");
  expect(
    draft.poses
      .map((pose: { frameId: number }) => pose.frameId)
      .sort((a: number, b: number) => a - b),
  ).toEqual([7, 19]);
  expect(
    draft.poses.every(
      (pose: { decision: string }) => pose.decision === "pending",
    ),
  ).toBe(true);
});

test("mobile pointer sampling and a dragged brush use native coordinates and undo exactly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { panel, dialog, original } = await start(page);
  const canvas = dialog.getByTestId("mask-edit-canvas");
  const before = await canvasRgba(canvas);
  await button(dialog, "Sample cloth").click();
  await canvas.scrollIntoViewIfNeeded();
  const sampleBox = await canvas.boundingBox();
  expect(sampleBox).not.toBeNull();
  await canvas.click({
    position: {
      x: (sampleBox!.width * 3.5) / 8,
      y: (sampleBox!.height * 4.5) / 8,
    },
  });
  await expect(dialog.getByTestId("mask-workbench-status")).toContainText(
    "Cloth sample selected at 3, 4",
  );
  await dialog.getByLabel("Brush size", { exact: true }).fill("1");
  await canvas.scrollIntoViewIfNeeded();
  const brushBox = await canvas.boundingBox();
  expect(brushBox).not.toBeNull();
  await page.mouse.move(
    brushBox!.x + (brushBox!.width * 1.5) / 8,
    brushBox!.y + (brushBox!.height * 3.5) / 8,
  );
  await page.mouse.down();
  await page.mouse.move(
    brushBox!.x + (brushBox!.width * 1.5) / 8,
    brushBox!.y + (brushBox!.height * 4.5) / 8,
    { steps: 4 },
  );
  await page.mouse.up();
  const changed = await canvasRgba(canvas);
  expect(changed.pixels.slice((4 * 8 + 1) * 4, (4 * 8 + 2) * 4)).toEqual([
    18, 137, 145, 255,
  ]);
  expect(changed.pixels.slice(0, 8 * 2 * 4)).toEqual(
    before.pixels.slice(0, 8 * 2 * 4),
  );
  await button(dialog, "Undo stroke").click();
  expect(await canvasRgba(canvas)).toEqual(before);
  expect(await canvasRgba(panel.getByTestId("wardrobe-preview"))).toEqual(
    original,
  );
});
