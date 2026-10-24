import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { encodeSourceRgbaPng } from "../../src/core/baked-source";
import { importWardrobeProject } from "../../src/wardrobe/project";
import { readPortableCharacterPackArchive } from "../../src/core/pack";
import { installWardrobeFixture } from "./wardrobe-fixture";

function revision(bytes: Uint8Array, unsafe = false) {
  const files = unzipSync(bytes),
    manifest = JSON.parse(strFromU8(files["manifest.json"]));
  manifest.id = unsafe ? "candidate-unsafe" : "candidate-top-v2";
  manifest.name = unsafe ? "Unsafe candidate" : "Revised candidate shirt";
  if (unsafe) manifest.frames[1].offset.y = 0;
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  files["patches-0.png"] = encodeSourceRgbaPng({
    width: 8,
    height: 4,
    pixels: new Uint8Array(
      Array.from({ length: 32 }, () => [141, 48, 166, 255]).flat(),
    ),
    colorChunks: [],
  });
  return Buffer.from(zipSync(files));
}
async function pixels(panel: Locator) {
  return panel
    .getByTestId("wardrobe-preview")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
}
async function preview(panel: Locator, bytes: Buffer) {
  await panel
    .getByLabel("Preview registered clothing file", { exact: true })
    .setInputFiles({
      name: "candidate.zip",
      mimeType: "application/zip",
      buffer: bytes,
    });
}
const modal = (page: Page) =>
  page.getByRole("dialog", { name: "Preview imported clothing", exact: true });

test("clothing candidate preview isolates its poses, discards without history, and applies an undoable exact revision", async ({
  page,
}, testInfo) => {
  const f = await installWardrobeFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel"),
    status = p.getByRole("status");
  await expect(status).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(status).toContainText("Daily selected");
  await p.getByLabel("Wardrobe action", { exact: true }).selectOption("run");
  await p.getByLabel("Wardrobe facing", { exact: true }).selectOption("left");
  await p.getByLabel("Wardrobe frame", { exact: true }).fill("1");
  const old = await pixels(p),
    bytes = revision(f.male.items[0].bytes);
  await preview(p, bytes);
  const d = modal(page);
  await expect(d).toBeVisible();
  expect(await pixels(p)).toBe(old);
  await d
    .getByLabel("Candidate preview action", { exact: true })
    .selectOption("jump");
  await d
    .getByLabel("Candidate preview facing", { exact: true })
    .selectOption("right");
  await d.getByLabel("Candidate preview frame", { exact: true }).fill("2");
  await expect(d.getByTestId("garment-candidate-after")).toHaveAttribute(
    "data-rendered-frame-id",
    "7",
  );
  expect(await pixels(p)).toBe(old);
  await expect(p.getByLabel("Wardrobe action", { exact: true })).toHaveValue(
    "run",
  );
  await expect(p.getByLabel("Wardrobe facing", { exact: true })).toHaveValue(
    "left",
  );
  await expect(p.getByLabel("Wardrobe frame", { exact: true })).toHaveValue(
    "1",
  );
  await d
    .getByRole("button", { name: "Discard clothing candidate", exact: true })
    .click();
  await expect(d).toHaveCount(0);
  expect(await pixels(p)).toBe(old);
  await expect(p.getByLabel("Top", { exact: true })).toHaveValue("male-top");
  // Discard added no history step: undo must go straight back to the original.
  await p.getByRole("button", { name: "Undo styling", exact: true }).click();
  await expect(status).toContainText("Styling change undone");
  await expect(p.getByLabel("Top", { exact: true })).toHaveValue("");
  await p.getByRole("button", { name: "Redo styling", exact: true }).click();
  await expect(status).toContainText("Styling change redone");
  expect(await pixels(p)).toBe(old);
  await preview(p, bytes);
  await expect(d).toBeVisible();
  await d
    .getByRole("button", { name: "Apply clothing candidate", exact: true })
    .click();
  await expect(d).toHaveCount(0);
  await expect(p.getByLabel("Top", { exact: true })).toHaveValue(
    "candidate-top-v2",
  );
  const changed = await pixels(p);
  expect(changed).not.toBe(old);
  await expect(p.getByLabel("Wardrobe frame", { exact: true })).toHaveValue(
    "1",
  );
  const savedEvent = page.waitForEvent("download");
  await p.getByRole("button", { name: /^Save wardrobe/ }).click();
  const savedPath = testInfo.outputPath("candidate.wardrobe.zip");
  await (await savedEvent).saveAs(savedPath);
  const saved = await importWardrobeProject(
    new Uint8Array(await readFile(savedPath)),
  );
  expect(saved.document.selection.top).toBe("candidate-top-v2");
  expect(saved.document.preview).toEqual({ action: "run", facing: "left" });
  expect(
    saved.items.find((i) => i.manifest.id === "candidate-top-v2")!.bytes,
  ).toEqual(new Uint8Array(bytes));
  await p.getByRole("button", { name: "Undo styling", exact: true }).click();
  await expect(status).toContainText("Styling change undone");
  expect(await pixels(p)).toBe(old);
  await p
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles(savedPath);
  await expect(status).toContainText(
    "Saved outfit and action settings restored",
  );
  await p.getByLabel("Wardrobe frame", { exact: true }).fill("1");
  expect(await pixels(p)).toBe(changed);
  const packEvent = page.waitForEvent("download");
  await p
    .getByRole("button", { name: "Export CharacterPack", exact: true })
    .click();
  const packPath = testInfo.outputPath("candidate.character.zip");
  await (await packEvent).saveAs(packPath);
  const pack = readPortableCharacterPackArchive(
    new Uint8Array(await readFile(packPath)),
  );
  expect(pack.manifest.animations).toEqual(saved.archive.manifest.animations);
  expect(pack.manifest.anchor).toEqual(saved.archive.manifest.anchor);
});

test("wrong-source and later protected-head candidate failures preserve the accepted look and redo", async ({
  page,
}) => {
  const f = await installWardrobeFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel"),
    status = p.getByRole("status");
  await expect(status).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(status).toContainText("Daily selected");
  await p.getByRole("button", { name: "Undo styling", exact: true }).click();
  await expect(status).toContainText("Styling change undone");
  const accepted = await pixels(p);
  for (const bytes of [
    Buffer.from(f.female.items[0].bytes),
    revision(f.male.items[0].bytes, true),
    Buffer.from("not a zip"),
  ]) {
    await preview(p, bytes);
    await expect(p.getByRole("alert")).toBeVisible();
    await expect(modal(page)).toHaveCount(0);
    expect(await pixels(p)).toBe(accepted);
    await expect(
      p.getByRole("button", { name: "Redo styling", exact: true }),
    ).toBeEnabled();
  }
  await p.getByRole("button", { name: "Redo styling", exact: true }).click();
  await expect(status).toContainText("Styling change redone");
  await expect(p.getByLabel("Top", { exact: true })).toHaveValue("male-top");
});

test("issue handoff is explicit, reopens resolved issues for a new look and preserves the predecessor review", async ({
  page,
}) => {
  const f = await installWardrobeFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel"),
    status = p.getByRole("status");
  await expect(status).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(status).toContainText("Daily selected");
  await p
    .getByRole("button", { name: "Open look review", exact: true })
    .click();
  const review = p.getByRole("region", {
    name: "Look review workbench",
    exact: true,
  });
  await expect(review.getByLabel("Review note", { exact: true })).toBeEnabled();
  await review
    .getByLabel("Review note", { exact: true })
    .fill("Recheck this cuff after replacing the shirt.");
  await review
    .getByRole("button", { name: "Add review issue", exact: true })
    .click();
  await review
    .getByRole("button", { name: "Resolve issue", exact: true })
    .click();
  async function exportNotes() {
    const d = page.waitForEvent("download");
    await review
      .getByRole("button", { name: "Export review notes", exact: true })
      .click();
    return JSON.parse(await readFile((await (await d).path())!, "utf8"));
  }
  const previous = await exportNotes();
  expect(previous.issues[0].status).toBe("resolved");
  await preview(p, revision(f.male.items[0].bytes));
  await expect(modal(page)).toBeVisible();
  await modal(page)
    .getByRole("button", { name: "Apply clothing candidate", exact: true })
    .click();
  await expect(modal(page)).toHaveCount(0);
  await expect(
    review.getByRole("button", { name: "Export review notes", exact: true }),
  ).toBeEnabled();
  expect((await exportNotes()).issues).toHaveLength(0);
  await review
    .getByLabel("Review issue handoff file", { exact: true })
    .setInputFiles({
      name: "predecessor-notes.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(previous)),
    });
  await expect(
    review.getByRole("button", { name: "Copy issues as open", exact: true }),
  ).toBeVisible();
  expect((await exportNotes()).issues).toHaveLength(0);
  await review
    .getByRole("button", { name: "Copy issues as open", exact: true })
    .click();
  const copied = await exportNotes();
  expect(copied.binding.lookSha256).not.toBe(previous.binding.lookSha256);
  expect(copied.issues).toEqual(
    previous.issues.map((i: any) => ({ ...i, status: "open" })),
  );
  const lineageDownload = page.waitForEvent("download");
  await review
    .getByRole("button", { name: "Export issue handoff", exact: true })
    .click();
  const lineage = JSON.parse(
    await readFile((await (await lineageDownload).path())!, "utf8"),
  );
  expect(lineage.from).toEqual(previous.binding);
  expect(lineage.to).toEqual(copied.binding);
  expect(lineage.issues[0].status).toBe("resolved");
  const wrong = structuredClone(previous);
  wrong.binding.sourceSha256 = "0".repeat(64);
  await review
    .getByLabel("Review issue handoff file", { exact: true })
    .setInputFiles({
      name: "wrong-source.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(wrong)),
    });
  await expect(review.getByTestId("review-status")).toContainText(
    "Could not prepare issue handoff",
  );
  expect((await exportNotes()).issues).toEqual(copied.issues);
  await p.getByRole("button", { name: "Undo styling", exact: true }).click();
  await expect(status).toContainText("Styling change undone");
  expect(await exportNotes()).toEqual(previous);
});
