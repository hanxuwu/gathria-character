import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const originalPath = "docs/theo-pose-study/final/theo-study.rig.zip";
async function save(
  page: Page,
  info: TestInfo,
  label: string,
  filename: string,
) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: label, exact: true }).click();
  const path = info.outputPath(filename);
  await (await pending).saveAs(path);
  await expect(
    page.getByRole("button", { name: label, exact: true }),
  ).toBeEnabled();
  return { path, files: unzipSync(await readFile(path)) };
}
async function opened(page: Page) {
  await expect(page.locator(".skin-notice[role=status]")).toContainText(
    "project opened",
  );
}

test("v2 run controls, reset, history and ZIP reopen preserve explicit motion semantics", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const files = unzipSync(await readFile(originalPath));
  const metadata = JSON.parse(strFromU8(files["project.json"]));
  const nonRun = structuredClone(metadata.motions.clips);
  metadata.motions.version = 2;
  metadata.motions.clips.run.keys.forEach((key: Record<string, number>) => {
    key.torsoLean = 0.03;
  });
  metadata.preview.animation = "run";
  files["project.json"] = strToU8(JSON.stringify(metadata));
  await page.goto("/skin-studio.html");
  await expect(
    page.getByLabel("Upper body lean (°)", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Import project file", { exact: true })
    .setInputFiles({
      name: "explicit-v2.rig.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zipSync(files)),
    });
  await opened(page);
  const lean = page.getByLabel("Upper body lean (°)", { exact: true });
  await expect(lean).toHaveValue("1.72");
  await lean.fill("4");
  await lean.press("Enter");
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await expect(lean).toHaveValue("1.72");
  await page.getByRole("button", { name: "Redo edit", exact: true }).click();
  await expect(lean).toHaveValue("4");
  const edited = await save(
    page,
    info,
    "Save project ZIP",
    "edited-v2.rig.zip",
  );
  const editMeta = JSON.parse(strFromU8(edited.files["project.json"]));
  expect(editMeta.motions.version).toBe(2);
  expect(editMeta.motions.clips.run.keys[0].torsoLean).toBeCloseTo(
    (4 * Math.PI) / 180,
    12,
  );
  for (const action of ["idle", "walk", "jump"])
    expect(editMeta.motions.clips[action]).toEqual(nonRun[action]);
  await page
    .getByRole("button", { name: "Reset run motion", exact: true })
    .click();
  await expect(lean).toHaveValue("0");
  await expect(
    page.getByLabel("Foot travel (px)", { exact: true }),
  ).toHaveValue("18");
  const reset = await save(page, info, "Save project ZIP", "reset-v2.rig.zip");
  const resetMeta = JSON.parse(strFromU8(reset.files["project.json"]));
  expect(resetMeta.motions.version).toBe(2);
  expect(resetMeta.motions.clips.run.keys[0]).toMatchObject({
    footX: 18,
    footLift: 0,
    shoePitch: -0.08,
    torsoLean: 0,
  });
  for (const action of ["idle", "walk", "jump"])
    expect(resetMeta.motions.clips[action]).toEqual(nonRun[action]);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await expect(lean).toHaveValue("4");
  await page.getByLabel("Action", { exact: true }).selectOption("walk");
  await expect(lean).toHaveCount(0);
  await page.getByLabel("Action", { exact: true }).selectOption("run");
  await expect(lean).toHaveValue("4");
  await page
    .getByLabel("Import project file", { exact: true })
    .setInputFiles(edited.path);
  await opened(page);
  await expect(lean).toHaveValue("4");
  const reopened = await save(
    page,
    info,
    "Save project ZIP",
    "reopened-v2.rig.zip",
  );
  expect(JSON.parse(strFromU8(reopened.files["project.json"])).motions).toEqual(
    editMeta.motions,
  );
  await page
    .getByLabel("Import project file", { exact: true })
    .setInputFiles(originalPath);
  await opened(page);
  await expect(lean).toHaveCount(0);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await expect(lean).toHaveValue("4");
});

test("historical Theo motion v1 retains all 36 exported frames and its manifest", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.goto("/skin-studio.html");
  await page
    .getByLabel("Import project file", { exact: true })
    .setInputFiles(originalPath);
  await opened(page);
  const actual = await save(
    page,
    info,
    "Export CharacterPack",
    "historical-theo.character.zip",
  );
  const golden = unzipSync(
    await readFile("docs/theo-pose-study/final/theo-study.character.zip"),
  );
  expect(JSON.parse(strFromU8(actual.files["manifest.json"]))).toEqual(
    JSON.parse(strFromU8(golden["manifest.json"])),
  );
  const pixelsEqual = await page.evaluate(
    async ({ a, b }) => {
      const decode = async (bytes: number[]) => {
        const image = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        image.close();
        return {
          width: canvas.width,
          height: canvas.height,
          pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        };
      };
      const first = await decode(a),
        second = await decode(b);
      return (
        first.width === second.width &&
        first.height === second.height &&
        first.pixels.every((v, i) => v === second.pixels[i])
      );
    },
    {
      a: [...actual.files["spritesheet.png"]],
      b: [...golden["spritesheet.png"]],
    },
  );
  expect(pixelsEqual).toBe(true);
});
