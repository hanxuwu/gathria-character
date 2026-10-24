import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  decodeSourceRgbaPng,
  encodeSourceRgbaPng,
} from "../../src/core/baked-source";
import { importWardrobeProject } from "../../src/wardrobe/project";
import { installWardrobeFixture } from "./wardrobe-fixture";

async function start(page: Page) {
  await installWardrobeFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const panel = page.locator("#wardrobe-panel");
  await expect(panel.getByRole("status")).toContainText("Original outfit.");
  await panel.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Daily selected");
  return panel;
}
const download = async (page: Page, name: string) => {
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  return new Uint8Array(await readFile((await (await wait).path())!));
};
async function kit(page: Page) {
  const panel = page.locator("#wardrobe-panel");
  await panel.locator("summary").filter({ hasText: "Fitting guides" }).click();
  await panel
    .getByLabel("Recipe clothing", { exact: true })
    .selectOption("male-top");
  await panel.getByLabel("Inspect clothing layer", { exact: true }).check();
  const files = unzipSync(
    await download(page, "Download neighboring poses for painting"),
  );
  const recipe = JSON.parse(strFromU8(files["recipe.json"]));
  recipe.output.id = "browser-painted-shirt";
  recipe.output.name = "Browser painted shirt";
  const override = recipe.poseOverrides.find((p: any) => p.frameId === 7),
    image = decodeSourceRgbaPng(files[override.image.file]);
  const mask = decodeSourceRgbaPng(files[override.mask.file]);
  const at = mask.pixels.findIndex(
    (v, i) => i % 4 === 0 && v === 255 && image.pixels[i + 3] === 255,
  );
  expect(at).toBeGreaterThanOrEqual(0);
  image.pixels.set([234, 54, 180], at);
  files[override.image.file] = encodeSourceRgbaPng(image);
  files["recipe.json"] = strToU8(JSON.stringify(recipe));
  return { files, recipe, at };
}
const modal = (page: Page) =>
  page.getByRole("dialog", { name: "Preview imported clothing", exact: true });
const pixels = (page: Page) =>
  page
    .getByTestId("wardrobe-preview")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());

test("painted native kit previews without changing the accepted look, downloads provenance, applies, undoes and reopens exactly", async ({
  page,
}, info) => {
  const p = await start(page);
  const before = await pixels(page),
    { files } = await kit(page);
  await p.getByLabel("Painted pose kit file", { exact: true }).setInputFiles({
    name: "painted.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync(files)),
  });
  const d = modal(page);
  await expect(d).toBeVisible();
  expect(await pixels(page)).toBe(before);
  await expect(d.getByTestId("paint-import-summary")).toContainText(
    "1 changed RGB pixels",
  );
  const report = JSON.parse(
    strFromU8(await download(page, "Save painting report")),
  );
  const material = await download(page, "Save painted clothing");
  expect(report.output.sha256).toBe(
    createHash("sha256").update(material).digest("hex"),
  );
  await d
    .getByRole("button", { name: "Apply clothing candidate", exact: true })
    .click();
  await expect(d).toHaveCount(0);
  await expect(p.getByRole("status")).toContainText(
    "Clothing candidate applied",
  );
  const after = await pixels(page);
  expect(after).not.toBe(before);
  const wait = page.waitForEvent("download");
  await p.getByRole("button", { name: /^Save wardrobe/ }).click();
  const path = info.outputPath("painted.wardrobe.zip");
  await (await wait).saveAs(path);
  const saved = await importWardrobeProject(
    new Uint8Array(await readFile(path)),
  );
  expect(
    saved.items.find((i) => i.manifest.id === report.output.id)!.bytes,
  ).toEqual(material);
  await p.getByRole("button", { name: "Undo styling", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("Styling change undone");
  expect(await pixels(page)).toBe(before);
  await p
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles(path);
  await expect(p.getByRole("status")).toContainText(
    "Saved outfit and action settings restored",
  );
  expect(await pixels(page)).toBe(after);
});

test("a bad later painted pose is rejected atomically and leaves styling history intact", async ({
  page,
}) => {
  const p = await start(page),
    before = await pixels(page),
    { files, recipe } = await kit(page);
  const ref = recipe.poseOverrides.find((r: any) => r.frameId === 19),
    image = decodeSourceRgbaPng(files[ref.image.file]);
  image.pixels[3] = 255;
  files[ref.image.file] = encodeSourceRgbaPng(image);
  await p.getByLabel("Painted pose kit file", { exact: true }).setInputFiles({
    name: "broken.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync(files)),
  });
  await expect(p.getByRole("alert")).toContainText("alpha changed");
  await expect(modal(page)).toHaveCount(0);
  expect(await pixels(page)).toBe(before);
  await p.getByRole("button", { name: "Undo styling", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("Styling change undone");
  await expect(p.getByLabel("Top", { exact: true })).toHaveValue("");
});

test("motion review retains loop and one-shot boundaries, seeks exact positions and exports mirrored native evidence", async ({
  page,
}) => {
  const p = await start(page);
  await p
    .getByRole("button", { name: "Open look review", exact: true })
    .click();
  const m = p.getByRole("region", {
    name: "Motion continuity review",
    exact: true,
  });
  await p.getByLabel("Wardrobe action", { exact: true }).selectOption("run");
  await m
    .getByRole("button", { name: "Check motion transitions", exact: true })
    .click();
  await expect(m.getByTestId("motion-review-status")).toContainText(
    "Transitions checked",
  );
  await m.getByLabel("Motion transition", { exact: true }).selectOption("1");
  await expect(m.getByTestId("motion-transition")).toHaveAttribute(
    "data-loop-closure",
    "true",
  );
  await m
    .getByRole("button", { name: "Go to transition start", exact: true })
    .click();
  await expect(p.getByLabel("Wardrobe frame", { exact: true })).toHaveValue(
    "1",
  );
  const right = unzipSync(await download(page, "Export motion evidence"));
  const manifest = JSON.parse(strFromU8(right["manifest.json"]));
  for (const f of manifest.files)
    expect(createHash("sha256").update(right[f.file]).digest("hex")).toBe(
      f.sha256,
    );
  expect(JSON.parse(strFromU8(right["motion.json"])).edges).toHaveLength(2);
  await p.getByLabel("Wardrobe facing", { exact: true }).selectOption("left");
  await expect(
    m.getByRole("button", { name: "Export motion evidence", exact: true }),
  ).toBeDisabled();
  await m
    .getByRole("button", { name: "Check motion transitions", exact: true })
    .click();
  await expect(m.getByTestId("motion-review-status")).toContainText(
    "Transitions checked",
  );
  await m.getByLabel("Motion transition", { exact: true }).selectOption("1");
  const left = unzipSync(await download(page, "Export motion evidence"));
  for (const file of [
    "from-current.png",
    "to-current.png",
    "from-reference.png",
    "to-reference.png",
  ]) {
    const r = decodeSourceRgbaPng(right[file]),
      l = decodeSourceRgbaPng(left[file]);
    for (let y = 0; y < r.height; y++)
      for (let x = 0; x < r.width; x++)
        expect(
          l.pixels.slice((y * r.width + x) * 4, (y * r.width + x + 1) * 4),
        ).toEqual(
          r.pixels.slice(
            (y * r.width + r.width - 1 - x) * 4,
            (y * r.width + r.width - x) * 4,
          ),
        );
  }
  await p.getByLabel("Wardrobe action", { exact: true }).selectOption("jump");
  await m
    .getByRole("button", { name: "Check motion transitions", exact: true })
    .click();
  await expect(m.getByTestId("motion-review-status")).toContainText(
    "Transitions checked",
  );
  await expect(m).toContainText("One-shot: no closing transition");
  await expect(
    m.getByLabel("Motion transition", { exact: true }).locator("option"),
  ).toHaveCount(2);
  await expect(
    m.getByLabel("Motion transition", { exact: true }),
  ).not.toContainText("loop closure");
});
