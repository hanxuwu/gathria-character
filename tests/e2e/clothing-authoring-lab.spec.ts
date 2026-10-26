import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  decodeSourceRgbaPng,
  encodeSourceRgbaPng,
} from "../../src/core/baked-source";
import { readPortableCharacterPackArchive } from "../../src/core/pack";
import { importWardrobeProject } from "../../src/wardrobe/project";
import { installWardrobeFixture } from "./wardrobe-fixture";
import { installAppearanceFixture } from "./appearance-fixture";
import type { CombinationReport } from "../../src/wardrobe/combination-review";

// These synthetic source drawings prove browser workflow and file invariants;
// actual Kling clothing quality is reviewed in the separate production capture.
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (bytes: Uint8Array) => JSON.parse(strFromU8(bytes));
const button = (scope: Locator, name: string | RegExp) =>
  scope.getByRole("button", { name, exact: true });
const wizard = (page: Page) =>
  page.getByRole("dialog", { name: "Clothing creation wizard", exact: true });
const candidate = (page: Page) =>
  page.getByRole("dialog", { name: "Preview imported clothing", exact: true });
const matrix = (page: Page) =>
  page.getByRole("dialog", {
    name: "Combination review workbench",
    exact: true,
  });
const canvasPixels = (canvas: Locator) =>
  canvas.evaluate((node: HTMLCanvasElement) => ({
    width: node.width,
    height: node.height,
    rgba: Array.from(
      node.getContext("2d")!.getImageData(0, 0, node.width, node.height).data,
    ),
  }));
async function download(page: Page, scope: Locator, name: string | RegExp) {
  const pending = page.waitForEvent("download");
  await button(scope, name).click();
  return new Uint8Array(await readFile((await (await pending).path())!));
}
async function setColor(input: Locator, value: string) {
  await input.fill(value);
  await expect(input).toHaveValue(value);
}
async function openWardrobe(page: Page, character = "male") {
  await page.goto(`/workbench.html?character=${character}&mode=wardrobe`);
  const panel = page.locator("#wardrobe-panel");
  await expect(panel.getByRole("status")).toContainText("Original outfit.");
  await button(panel, "Daily").click();
  await expect(panel.getByRole("status")).toContainText("Daily selected");
  return panel;
}
async function openCreation(page: Page, panel: Locator, character = "male") {
  await button(panel, "Create clothing").click();
  const dialog = wizard(page);
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("combobox", { name: "Starting clothing", exact: true })
    .selectOption(`${character}-top`);
  await button(dialog, "Continue to design").click();
  return dialog;
}
async function design(dialog: Locator, id: string) {
  await dialog.getByLabel("New clothing ID", { exact: true }).fill(id);
  await dialog
    .getByLabel("New clothing name", { exact: true })
    .fill("Authored terracotta top");
  await setColor(
    dialog.getByLabel("Original cloth color", { exact: true }),
    "#128991",
  );
  await setColor(
    dialog.getByLabel("New cloth color", { exact: true }),
    "#c86450",
  );
  await dialog.getByLabel("Color tolerance", { exact: true }).fill("0.3");
}
async function build(dialog: Locator) {
  await button(dialog, "Build clothing variant").click();
  await expect(dialog.getByTestId("authoring-after-canvas")).toBeVisible();
  await expect(button(dialog, "Continue to preview")).toBeDisabled();
}
async function acceptRequired(dialog: Locator) {
  const poses = dialog.getByRole("combobox", {
    name: "Review pose",
    exact: true,
  });
  const ids = await poses
    .locator("option")
    .evaluateAll((options) =>
      options.map((node) => (node as HTMLOptionElement).value),
    );
  expect(ids).toHaveLength(2);
  for (const id of ids) {
    await poses.selectOption(id);
    await button(dialog, "Accept pose").click();
  }
  await expect(button(dialog, "Continue to preview")).toBeEnabled();
}
async function previewCreated(page: Page, dialog: Locator) {
  await button(dialog, "Continue to preview").click();
  await button(dialog, "Preview new clothing").click();
  await expect(candidate(page)).toBeVisible();
  return candidate(page);
}

function nativePackFrames(bytes: Uint8Array) {
  const pack = readPortableCharacterPackArchive(bytes);
  const images = [pack.png, ...(pack.additionalPngs ?? [])].map((png) =>
    decodeSourceRgbaPng(png),
  );
  const frames = new Map<number, number[]>();
  for (const frame of pack.manifest.frames) {
    const image = images[frame.page ?? 0];
    const pixels: number[] = [];
    for (let y = 0; y < frame.height; y++) {
      const at = ((frame.y + y) * image.width + frame.x) * 4;
      pixels.push(...image.pixels.slice(at, at + frame.width * 4));
    }
    frames.set(frame.id, pixels);
  }
  return { pack, frames };
}

for (const character of ["male", "female"] as const) {
  test(`${character}: a reviewed full-pose clothing variant saves and reopens with exact ownership, source clocks and exported pixels`, async ({
    page,
  }) => {
    const fixture = await installWardrobeFixture(page);
    const panel = await openWardrobe(page, character);
    const before = await canvasPixels(panel.getByTestId("wardrobe-preview"));
    const beforePack = nativePackFrames(
      await download(page, panel, "Export CharacterPack"),
    );
    const dialog = await openCreation(page, panel, character);
    const id = `${character}-authoring-top`;
    await design(dialog, id);
    await build(dialog);
    expect(await canvasPixels(panel.getByTestId("wardrobe-preview"))).toEqual(
      before,
    );
    await acceptRequired(dialog);
    const preview = await previewCreated(page, dialog);
    const garment = await download(page, preview, "Save created clothing");
    const report = json(
      await download(page, preview, "Save clothing creation report"),
    );
    expect(report.output.sha256).toBe(sha(garment));
    const baseFiles = unzipSync(
      fixture[character].items.find((item) => item.id === `${character}-top`)!
        .bytes,
    );
    const files = unzipSync(garment);
    const metadata = json(files["manifest.json"]);
    const baseMetadata = json(baseFiles["manifest.json"]);
    expect(metadata.frames).toEqual(baseMetadata.frames);
    expect(metadata.pages).toEqual(baseMetadata.pages);
    expect(metadata.sourceSha256).toBe(baseMetadata.sourceSha256);
    expect(metadata.registrationSha256).toBe(baseMetadata.registrationSha256);
    for (const pageInfo of metadata.pages) {
      expect(files[pageInfo.maskFile]).toEqual(baseFiles[pageInfo.maskFile]);
      const oldPatch = decodeSourceRgbaPng(baseFiles[pageInfo.file]);
      const newPatch = decodeSourceRgbaPng(files[pageInfo.file]);
      expect(newPatch.pixels).not.toEqual(oldPatch.pixels);
      for (let i = 3; i < newPatch.pixels.length; i += 4)
        expect(newPatch.pixels[i]).toBe(oldPatch.pixels[i]);
    }
    await button(preview, "Apply clothing candidate").click();
    await expect(panel.getByLabel("Top", { exact: true })).toHaveValue(id);
    const after = await canvasPixels(panel.getByTestId("wardrobe-preview"));
    expect(after).not.toEqual(before);
    const savedBytes = await download(page, panel, /^Save wardrobe/);
    const saved = await importWardrobeProject(savedBytes);
    expect(saved.source).toEqual(fixture[character].source);
    expect(saved.registrationBytes).toEqual(
      fixture[character].registrationBytes,
    );
    expect(saved.items.find((item) => item.manifest.id === id)!.bytes).toEqual(
      garment,
    );
    const final = nativePackFrames(
      await download(page, panel, "Export CharacterPack"),
    );
    expect(final.pack.manifest.animations).toEqual(
      beforePack.pack.manifest.animations,
    );
    expect(final.pack.manifest.anchor).toEqual(beforePack.pack.manifest.anchor);
    expect(final.pack.manifest.facing).toEqual(beforePack.pack.manifest.facing);
    for (const [frameId, rgba] of final.frames) {
      const old = beforePack.frames.get(frameId)!;
      expect(rgba).not.toEqual(old);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const at = (y * 8 + x) * 4;
          expect(rgba[at + 3]).toBe(old[at + 3]);
          if (x < 2 || x > 5 || y < 3 || y > 6)
            expect(rgba.slice(at, at + 4)).toEqual(old.slice(at, at + 4));
        }
      }
    }
    await button(panel, "Undo styling").click();
    expect(await canvasPixels(panel.getByTestId("wardrobe-preview"))).toEqual(
      before,
    );
    await panel
      .getByLabel("Open wardrobe project file", { exact: true })
      .setInputFiles({
        name: `${character}-authored.wardrobe.zip`,
        mimeType: "application/zip",
        buffer: Buffer.from(savedBytes),
      });
    await expect(panel.getByRole("status")).toContainText(
      "Saved outfit and action settings restored",
    );
    expect(await canvasPixels(panel.getByTestId("wardrobe-preview"))).toEqual(
      after,
    );
  });
}

test("hard-pose approval is bound to the built output, and cancellation never changes the accepted outfit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installWardrobeFixture(page);
  const panel = await openWardrobe(page);
  const original = await canvasPixels(panel.getByTestId("wardrobe-preview"));
  const dialog = await openCreation(page, panel);
  await design(dialog, "review-gated-top");
  await build(dialog);
  const poses = dialog.getByRole("combobox", {
    name: "Review pose",
    exact: true,
  });
  const ids = await poses
    .locator("option")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLOptionElement).value),
    );
  await poses.selectOption(ids[0]);
  await button(dialog, "Accept pose").click();
  await poses.selectOption(ids[1]);
  await button(dialog, "Reject pose").click();
  await expect(button(dialog, "Continue to preview")).toBeDisabled();
  await button(dialog, "Accept pose").click();
  await expect(button(dialog, "Continue to preview")).toBeEnabled();
  await button(dialog, "Back to design").click();
  await setColor(
    dialog.getByLabel("New cloth color", { exact: true }),
    "#8866aa",
  );
  await build(dialog);
  await expect(dialog.getByTestId("authoring-pose-status")).toContainText(
    /pending/i,
  );
  await expect(button(dialog, "Continue to preview")).toBeDisabled();
  expect(await canvasPixels(panel.getByTestId("wardrobe-preview"))).toEqual(
    original,
  );
  await button(dialog, "Close clothing creation").click();
  await expect(dialog).toHaveCount(0);
  expect(await canvasPixels(panel.getByTestId("wardrobe-preview"))).toEqual(
    original,
  );
  await button(panel, "Undo styling").click();
  await expect(panel.getByLabel("Top", { exact: true })).toHaveValue("");
});

test("a portable authoring draft restores its embedded template and reviews while a different outfit is worn, and changed references are rejected atomically", async ({
  page,
}) => {
  const fixture = await installWardrobeFixture(page);
  const panel = await openWardrobe(page);
  let dialog = await openCreation(page, panel);
  await design(dialog, "portable-authoring-top");
  const reference = encodeSourceRgbaPng({
    width: 2,
    height: 2,
    pixels: new Uint8Array([
      200, 100, 80, 255, 220, 150, 100, 255, 180, 90, 70, 255, 235, 180, 130,
      255,
    ]),
    colorChunks: [],
  });
  await dialog
    .getByLabel("Clothing reference PNG", { exact: true })
    .setInputFiles({
      name: "terracotta-reference.png",
      mimeType: "image/png",
      buffer: Buffer.from(reference),
    });
  await build(dialog);
  await acceptRequired(dialog);
  await dialog
    .getByRole("combobox", { name: "Review pose", exact: true })
    .selectOption("7");
  const approved = await canvasPixels(
    dialog.getByTestId("authoring-after-canvas"),
  );
  const draft = await download(page, dialog, "Save authoring draft");
  const files = unzipSync(draft);
  const metadata = json(files["design.json"]);
  expect(files["reference.png"]).toEqual(reference);
  expect(files["base.garment.zip"]).toEqual(
    fixture.male.items.find((item) => item.id === "male-top")!.bytes,
  );
  expect(metadata.reference.sha256).toBe(sha(reference));
  expect(
    metadata.review.poses.every(
      (pose: { decision: string }) => pose.decision === "accepted",
    ),
  ).toBe(true);
  await button(dialog, "Close clothing creation").click();
  await button(panel, "Wedding").click();
  await expect(panel.getByRole("status")).toContainText("Wedding selected");
  const wedding = await canvasPixels(panel.getByTestId("wardrobe-preview"));
  await button(panel, "Create clothing").click();
  dialog = wizard(page);
  const input = dialog.getByLabel("Clothing authoring draft file", {
    exact: true,
  });
  await input.setInputFiles({
    name: "portable.authoring.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(draft),
  });
  await expect(button(dialog, "Continue to preview")).toBeEnabled();
  expect(
    await canvasPixels(dialog.getByTestId("authoring-after-canvas")),
  ).toEqual(approved);
  expect(await canvasPixels(panel.getByTestId("wardrobe-preview"))).toEqual(
    wedding,
  );

  const changedReference = new Uint8Array(reference);
  changedReference[changedReference.length - 1] ^= 1;
  await input.setInputFiles({
    name: "changed-reference.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(
      zipSync({ ...files, "reference.png": changedReference }),
    ),
  });
  await expect(dialog.getByRole("alert")).toContainText(/reference.*changed/i);
  await expect(button(dialog, "Continue to preview")).toBeEnabled();
  expect(
    await canvasPixels(dialog.getByTestId("authoring-after-canvas")),
  ).toEqual(approved);

  const foreign = { ...metadata, sourceSha256: "f".repeat(64) };
  await input.setInputFiles({
    name: "foreign-source.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(
      zipSync({ ...files, "design.json": strToU8(JSON.stringify(foreign)) }),
    ),
  });
  await expect(dialog.getByRole("alert")).toContainText(
    /matching source character/i,
  );
  await expect(button(dialog, "Continue to preview")).toBeEnabled();
  const restored = unzipSync(
    await download(page, dialog, "Save authoring draft"),
  );
  expect(json(restored["design.json"])).toEqual(metadata);
  expect(restored["reference.png"]).toEqual(reference);
  const preview = await previewCreated(page, dialog);
  const output = await download(page, preview, "Save created clothing");
  expect(sha(output)).toBe(metadata.review.outputSha256);
  await button(preview, "Discard clothing candidate").click();
  expect(await canvasPixels(panel.getByTestId("wardrobe-preview"))).toEqual(
    wedding,
  );
});

async function openMixedMatrix(page: Page) {
  await installAppearanceFixture(page, { joyful: true });
  const panel = await openWardrobe(page);
  // Load both clothing families, then preserve Daily as the comparison baseline.
  await button(panel, "Wedding").click();
  await expect(panel.getByRole("status")).toContainText("Wedding selected");
  await button(panel, "Daily").click();
  await expect(panel.getByRole("status")).toContainText("Daily selected");
  await panel
    .getByLabel("Hairstyle", { exact: true })
    .selectOption("soft-crop");
  await expect(panel.getByRole("status")).toContainText("Appearance updated");
  await panel.getByLabel("Face", { exact: true }).selectOption("gentle");
  await expect(panel.getByRole("status")).toContainText("Appearance updated");
  await panel
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption("run");
  await panel
    .getByLabel("Wardrobe facing", { exact: true })
    .selectOption("left");
  await panel.getByLabel("Wardrobe frame", { exact: true }).fill("0");
  const accepted = await canvasPixels(panel.getByTestId("wardrobe-preview"));
  await button(panel, "Check combinations").click();
  const dialog = matrix(page);
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("group", { name: "One-piece", exact: true })
    .getByRole("checkbox", { name: "Wedding outfit", exact: true })
    .check();
  await dialog
    .getByRole("group", { name: "Hair", exact: true })
    .getByRole("checkbox", { name: "Soft bob", exact: true })
    .check();
  await dialog
    .getByRole("group", { name: "Face", exact: true })
    .getByRole("checkbox", { name: "Joyful", exact: true })
    .check();
  await dialog
    .getByRole("group", { name: "Hair color", exact: true })
    .getByRole("checkbox", { name: "copper", exact: true })
    .check();
  return { panel, dialog, accepted };
}

test("mixed clothing, hair and face checks expose coverage, preserve the accepted look, export real contact pixels and hand off only the selected case", async ({
  page,
}) => {
  const { panel, dialog, accepted } = await openMixedMatrix(page);
  for (const action of ["idle", "walk", "celebrate"]) {
    await dialog
      .getByRole("group", { name: "Actions", exact: true })
      .getByRole("checkbox", { name: action, exact: true })
      .uncheck();
  }
  const mode = dialog.getByRole("combobox", {
    name: "Coverage mode",
    exact: true,
  });
  await mode.selectOption("exhaustive");
  await dialog.getByLabel("Maximum looks", { exact: true }).fill("4");
  await dialog.getByLabel("Maximum samples", { exact: true }).fill("40");
  await dialog.getByLabel("Poses per action", { exact: true }).fill("2");
  await button(dialog, "Plan combinations").click();
  await expect(dialog.getByRole("alert")).toContainText(
    /exhaustive|limit|budget/i,
  );
  await expect(button(dialog, "Scan planned combinations")).toHaveCount(0);
  await mode.selectOption("representative");
  await button(dialog, "Plan combinations").click();
  await expect(dialog.getByTestId("combination-coverage")).toContainText(
    "representative: 4 / 16 combinations",
  );
  await button(dialog, "Scan planned combinations").click();
  await expect(dialog.getByText(/^Scan complete:/)).toBeVisible();
  const report: CombinationReport = json(
    await download(page, dialog, "Save combination report"),
  );
  expect(report.status).toBe("complete");
  expect(report.completedSamples).toBe(32);
  expect(report.failedSamples).toBe(0);
  expect(report.rows).toHaveLength(report.plan.coverage.plannedPositions);
  expect(
    report.plan.coverage.positionCoverage.find((row) => row.action === "jump")!
      .untestedPositions,
  ).toEqual([2]);
  expect(report.plan.coverage.totalCombinations).toBeGreaterThan(
    report.plan.coverage.selectedCombinations,
  );
  expect(
    new Set(report.plan.cases.map((item) => item.appearance.hairId)).size,
  ).toBe(2);
  expect(
    new Set(report.plan.cases.map((item) => item.appearance.faceId)).size,
  ).toBe(2);
  expect(
    new Set(report.plan.cases.map((item) => item.appearance.hairColor)).size,
  ).toBe(2);
  for (const row of report.rows) {
    expect(row.frameId).toBe([7, 19][row.position]);
    expect(row.durationMs).toBeCloseTo(1000 / (row.action === "run" ? 12 : 8));
    expect(row.metrics!.alphaAdded + row.metrics!.alphaRemoved).toBe(0);
    expect(row.manualReview).toBe("unreviewed");
  }
  const unchangedCases = report.plan.cases.filter(
    (item) => item.selection.top === "male-top",
  );
  expect(unchangedCases.length).toBeGreaterThan(0);
  expect(
    report.rows
      .filter((row) => unchangedCases.some((item) => item.id === row.caseId))
      .every((row) => row.metrics!.changedPixels === 0),
  ).toBe(true);
  expect(await canvasPixels(panel.getByTestId("wardrobe-preview"))).toEqual(
    accepted,
  );

  const selectedIndex = report.rows.findIndex(
    (row) =>
      row.action === "run" &&
      row.position === 0 &&
      row.facing === "left" &&
      row.metrics!.changedPixels > 0,
  );
  expect(selectedIndex).toBeGreaterThanOrEqual(0);
  const selected = report.rows[selectedIndex];
  const mirrorIndex = report.rows.findIndex(
    (row) =>
      row.caseId === selected.caseId &&
      row.action === selected.action &&
      row.position === selected.position &&
      row.facing === "right",
  );
  await button(dialog, `Inspect sample ${selectedIndex + 1}`).click();
  await expect(button(dialog, "Use this combination and review")).toBeEnabled();
  await dialog
    .getByRole("combobox", { name: "Sample review status", exact: true })
    .selectOption("issue");
  await dialog
    .getByLabel("Sample review note", { exact: true })
    .fill(
      "Inspect this clothing change; synthetic diagnostics are not visual approval.",
    );
  const reviewed: CombinationReport = json(
    await download(page, dialog, "Save combination report"),
  );
  expect(reviewed.rows[selectedIndex].manualReview).toBe("issue");
  expect(
    reviewed.rows.filter((row) => row.manualReview !== "unreviewed"),
  ).toHaveLength(1);

  const sheetChoices = dialog.getByRole("checkbox", {
    name: /^Include sample \d+ in contact sheets$/,
  });
  for (const choice of await sheetChoices.all())
    if (await choice.isChecked()) await choice.uncheck();
  for (const index of [selectedIndex, mirrorIndex])
    await dialog
      .getByRole("checkbox", {
        name: `Include sample ${index + 1} in contact sheets`,
        exact: true,
      })
      .check();
  const bundle = unzipSync(
    await download(page, dialog, "Download selected contact sheets"),
  );
  const metadata = json(bundle["manifest.json"]);
  expect(metadata.samples).toHaveLength(2);
  expect(json(bundle["combination-report.json"])).toEqual(reviewed);
  for (const file of metadata.files) {
    expect(bundle[file.file].length).toBe(file.bytes);
    expect(sha(bundle[file.file])).toBe(file.sha256);
    if (file.file.endsWith(".png")) {
      const image = decodeSourceRgbaPng(bundle[file.file]);
      expect(image.width * image.height).toBeGreaterThan(0);
      expect(
        image.pixels.some((value, index) => index % 4 === 3 && value > 0),
      ).toBe(true);
    }
  }
  const leftSample = metadata.samples.find(
    (sample: { facing: string }) => sample.facing === "left",
  );
  const rightSample = metadata.samples.find(
    (sample: { facing: string }) => sample.facing === "right",
  );
  const left = decodeSourceRgbaPng(bundle[leftSample.after]);
  const right = decodeSourceRgbaPng(bundle[rightSample.after]);
  expect(leftSample.integerReduction).toBe(1);
  expect(rightSample.integerReduction).toBe(1);
  for (let y = 0; y < left.height; y++)
    for (let x = 0; x < left.width; x++) {
      const a = (y * left.width + x) * 4;
      const b = (y * right.width + right.width - x - 1) * 4;
      expect(Array.from(left.pixels.slice(a, a + 4))).toEqual(
        Array.from(right.pixels.slice(b, b + 4)),
      );
    }
  const before = decodeSourceRgbaPng(bundle[leftSample.before]);
  expect(left.pixels).not.toEqual(before.pixels);
  for (let y = 0; y < left.height; y++)
    for (let x = 0; x < left.width; x++) {
      const at = (y * left.width + x) * 4;
      if (x < 4 || x > 7 || y < 5 || y > 8)
        expect(Array.from(left.pixels.slice(at, at + 4))).toEqual(
          Array.from(before.pixels.slice(at, at + 4)),
        );
    }

  await button(dialog, "Close combination review").click();
  await button(panel, "Check combinations").click();
  const reopened = matrix(page);
  const input = reopened.getByLabel("Combination report file", { exact: true });
  await input.setInputFiles({
    name: "review.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(reviewed)),
  });
  await expect(reopened.getByText(/^Matching report reopened/)).toBeVisible();
  expect(
    json(await download(page, reopened, "Save combination report")),
  ).toEqual(reviewed);
  const foreign = structuredClone(reviewed);
  foreign.plan.binding.sourceSha256 = "f".repeat(64);
  await input.setInputFiles({
    name: "foreign-review.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(foreign)),
  });
  await expect(reopened.getByRole("alert")).toContainText(
    /match|binding|plan/i,
  );
  expect(
    json(await download(page, reopened, "Save combination report")),
  ).toEqual(reviewed);
  expect(await canvasPixels(panel.getByTestId("wardrobe-preview"))).toEqual(
    accepted,
  );
  await button(reopened, `Inspect sample ${selectedIndex + 1}`).click();
  await button(reopened, "Use this combination and review").click();
  await expect(reopened).toHaveCount(0);
  await expect(
    panel.getByLabel("Wardrobe action", { exact: true }),
  ).toHaveValue(selected.action);
  await expect(
    panel.getByLabel("Wardrobe facing", { exact: true }),
  ).toHaveValue(selected.facing);
  await expect(panel.getByLabel("Wardrobe frame", { exact: true })).toHaveValue(
    String(selected.position),
  );
  await expect
    .poll(() => canvasPixels(panel.getByTestId("wardrobe-preview")))
    .toEqual({
      width: left.width,
      height: left.height,
      rgba: Array.from(left.pixels),
    });
  const detailReview = panel.getByRole("region", {
    name: "Look review workbench",
    exact: true,
  });
  await expect(detailReview).toBeVisible();
  const detailedPixels = await canvasPixels(
    detailReview.getByRole("img", {
      name: `Review split: source pose ${selected.frameId}, ${selected.facing}`,
      exact: true,
    }),
  );
  const labelHeight = detailedPixels.height - before.height;
  // The handoff must keep the exact case reference, including its hair and
  // expression. Matching only the newly applied outfit would miss a lost pin.
  for (let y = 0; y < before.height; y++)
    for (let x = 0; x < before.width; x++) {
      const sampleAt = (y * before.width + x) * 4;
      if (before.pixels[sampleAt + 3] === 255) {
        const shownAt = ((y + labelHeight) * detailedPixels.width + x) * 4;
        expect(detailedPixels.rgba.slice(shownAt, shownAt + 4)).toEqual(
          Array.from(before.pixels.slice(sampleAt, sampleAt + 4)),
        );
      }
    }
  await button(panel, "Undo styling").click();
  await expect
    .poll(() => canvasPixels(panel.getByTestId("wardrobe-preview")))
    .toEqual(accepted);
});

test("cancelling a mixed-combination scan retains an honest nonempty partial report without changing the accepted look", async ({
  page,
}) => {
  const { panel, dialog, accepted } = await openMixedMatrix(page);
  await dialog
    .getByRole("combobox", { name: "Coverage mode", exact: true })
    .selectOption("representative");
  await dialog.getByLabel("Maximum looks", { exact: true }).fill("8");
  await dialog.getByLabel("Maximum samples", { exact: true }).fill("200");
  await dialog.getByLabel("Poses per action", { exact: true }).fill("2");
  await button(dialog, "Plan combinations").click();
  await expect(button(dialog, "Scan planned combinations")).toBeEnabled();
  // Click the actual cancellation control after the UI presents real completed
  // work. No timeout race, synthetic engine result, or production test hook.
  await dialog.evaluate((node) => {
    const observer = new MutationObserver(() => {
      const progress = node.querySelector<HTMLProgressElement>(
        '[data-testid="combination-progress"] progress',
      );
      const cancel = Array.from(node.querySelectorAll("button")).find(
        (item) => item.textContent?.trim() === "Cancel scan",
      );
      if (
        progress &&
        progress.value > 0 &&
        progress.value < progress.max &&
        cancel
      ) {
        observer.disconnect();
        cancel.click();
      }
    });
    observer.observe(node, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });
  await button(dialog, "Scan planned combinations").click();
  await expect(dialog.getByText(/^Scan cancelled:/)).toBeVisible();
  const report: CombinationReport = json(
    await download(page, dialog, "Save combination report"),
  );
  expect(report.status).toBe("cancelled");
  expect(report.completedSamples).toBeGreaterThan(0);
  expect(report.completedSamples).toBeLessThan(
    report.plan.coverage.plannedPositions,
  );
  expect(report.rows).toHaveLength(report.completedSamples);
  expect(report.failedSamples).toBe(0);
  expect(
    report.rows.every(
      (row) => row.manualReview === "unreviewed" && row.metrics !== null,
    ),
  ).toBe(true);
  expect(await canvasPixels(panel.getByTestId("wardrobe-preview"))).toEqual(
    accepted,
  );
  await dialog
    .getByLabel("Combination report file", { exact: true })
    .setInputFiles({
      name: "partial.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(report)),
    });
  await expect(dialog.getByText(/^Matching report reopened/)).toBeVisible();
  expect(json(await download(page, dialog, "Save combination report"))).toEqual(
    report,
  );
  await button(dialog, "Close combination review").click();
  expect(await canvasPixels(panel.getByTestId("wardrobe-preview"))).toEqual(
    accepted,
  );
});
