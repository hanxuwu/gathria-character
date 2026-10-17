import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";

const prepared = new URL(
  "../../artwork/maple-action-poses/prepared/",
  import.meta.url,
);
const previous = new URL(
  "../../docs/generated-traveler/final/traveler-neutral.rig.zip",
  import.meta.url,
).pathname;
const activeSlots = ["near-forearm-active", "far-forearm-active"];
const mapping = {
  run: {
    "near-forearm": "near-forearm-active",
    "far-forearm": "far-forearm-active",
  },
  jump: {
    "near-forearm": "near-forearm-active",
    "far-forearm": "far-forearm-active",
  },
};

async function painted(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function pixels(page: Page, selector = "#skin-posed-canvas") {
  await painted(page);
  return page
    .locator(selector)
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
}

async function download(
  page: Page,
  info: TestInfo,
  button: string,
  filename: string,
) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  const path = info.outputPath(filename);
  await (await pending).saveAs(path);
  await expect(
    page.getByRole("button", { name: button, exact: true }),
  ).toBeEnabled();
  return { path, files: unzipSync(await readFile(path)) };
}

async function importProject(page: Page, path: string) {
  await page
    .getByLabel("Import project file", { exact: true })
    .setInputFiles(path);
  await expect(page.locator(".skin-notice[role=status]")).toContainText(
    "project opened",
  );
}

async function decodedHashes(page: Page, files: Record<string, Uint8Array>) {
  return page.evaluate(
    async (entries) => {
      const hashes: Record<string, string> = {};
      for (const [name, values] of entries) {
        const image = await createImageBitmap(
          new Blob([new Uint8Array(values)], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        const digest = await crypto.subtle.digest(
          "SHA-256",
          ctx.getImageData(0, 0, image.width, image.height).data,
        );
        hashes[name] =
          `${image.width}x${image.height}:` +
          [...new Uint8Array(digest)]
            .map((value) => value.toString(16).padStart(2, "0"))
            .join("");
        image.close();
      }
      return hashes;
    },
    Object.entries(files)
      .filter(([name]) => name.endsWith(".png"))
      .map(([name, bytes]) => [name, [...bytes]] as [string, number[]]),
  );
}

async function actionSamples(page: Page) {
  await page.getByLabel("Zoom", { exact: true }).selectOption("1");
  await page.getByLabel("Expression", { exact: true }).selectOption("neutral");
  await page.getByLabel("Facing", { exact: true }).selectOption("right");
  const result: Record<string, string> = {};
  for (const action of ["idle", "walk", "run", "jump"]) {
    await page.getByLabel("Action", { exact: true }).selectOption(action);
    await page
      .getByLabel("Animation frame", { exact: true })
      .fill(action === "idle" ? "2" : action === "run" ? "9" : "5");
    result[action] = await pixels(page);
  }
  return result;
}

test("v2 skin uses paired active forearms only for run and jump, preserving idle/walk and save-reopen pixels", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.goto("/skin-studio.html");
  await importProject(page, previous);
  const before = await actionSamples(page);
  const legacy = await download(
    page,
    info,
    "Save project ZIP",
    "legacy.rig.zip",
  );

  await page
    .getByLabel("Import skin file", { exact: true })
    .setInputFiles(new URL("traveler.skin.zip", prepared).pathname);
  await expect(page.locator(".skin-notice[role=status]")).toContainText(
    "Shared skeleton and motions preserved",
  );
  const after = await actionSamples(page);
  expect(after.idle).toBe(before.idle);
  expect(after.walk).toBe(before.walk);
  expect(after.run).not.toBe(before.run);
  expect(after.jump).not.toBe(before.jump);

  await page
    .getByLabel("Attachment", { exact: true })
    .selectOption("near-forearm");
  const relaxed = await pixels(page, "#skin-source-canvas");
  await page
    .getByLabel("Attachment", { exact: true })
    .selectOption("near-forearm-active");
  expect(await pixels(page, "#skin-source-canvas")).not.toBe(relaxed);
  await page.getByLabel("Facing", { exact: true }).selectOption("left");
  await page.getByLabel("Expression", { exact: true }).selectOption("joyful");
  await page.getByLabel("Action", { exact: true }).selectOption("run");
  await page.getByLabel("Animation frame", { exact: true }).fill("9");
  const savedPixels = await pixels(page);
  const saved = await download(
    page,
    info,
    "Save project ZIP",
    "active.rig.zip",
  );
  const skin = JSON.parse(strFromU8(saved.files["skin.json"]));
  expect(skin.version).toBe(2);
  expect(skin.actionForearms).toEqual(mapping);
  for (const slot of activeSlots)
    expect(saved.files[`slots/${slot}.png`]).toBeDefined();
  const oldProject = JSON.parse(strFromU8(legacy.files["project.json"]));
  const newProject = JSON.parse(strFromU8(saved.files["project.json"]));
  expect(newProject.rig).toEqual(oldProject.rig);
  expect(newProject.motions).toEqual(oldProject.motions);
  const oldHashes = await decodedHashes(page, legacy.files);
  const newHashes = await decodedHashes(page, saved.files);
  for (const [name, hash] of Object.entries(oldHashes))
    expect(newHashes[name], `retained ${name}`).toBe(hash);

  await page.reload();
  await importProject(page, saved.path);
  await expect(page.getByLabel("Action", { exact: true })).toHaveValue("run");
  await expect(page.getByLabel("Facing", { exact: true })).toHaveValue("left");
  await expect(page.getByLabel("Expression", { exact: true })).toHaveValue(
    "joyful",
  );
  await page.getByLabel("Animation frame", { exact: true }).fill("9");
  expect(await pixels(page)).toBe(savedPixels);
  const reopened = await download(
    page,
    info,
    "Save project ZIP",
    "active-reopened.rig.zip",
  );
  for (const file of ["skin.json", "project.json"])
    expect(JSON.parse(strFromU8(reopened.files[file]))).toEqual(
      JSON.parse(strFromU8(saved.files[file])),
    );
  expect(await decodedHashes(page, reopened.files)).toEqual(newHashes);
});

test("v2 wardrobe top roundtrips and switching to a v1 top removes active mappings; undo and project reopen restore them", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const source = unzipSync(
    await readFile(new URL("traveler-top.wardrobe.zip", prepared)),
  );
  const item = JSON.parse(strFromU8(source["item.json"]));
  expect(item.version).toBe(2);
  await page.goto("/skin-studio.html");
  await page
    .getByRole("button", { name: "Open wardrobe", exact: true })
    .click();
  await page
    .getByLabel("Import clothing ZIP file", { exact: true })
    .setInputFiles(new URL("traveler-top.wardrobe.zip", prepared).pathname);
  await expect(page.getByLabel("Wardrobe top", { exact: true })).toHaveValue(
    item.id,
  );
  await page
    .getByLabel("Wardrobe identity", { exact: true })
    .selectOption("waves");
  await page.getByLabel("Top color", { exact: true }).fill("#75967e");
  await page.getByLabel("Skin color", { exact: true }).fill("#8f5b40");
  await page.getByRole("button", { name: "Apply colors", exact: true }).click();
  await page.getByLabel("Action", { exact: true }).selectOption("run");
  await page.getByLabel("Animation frame", { exact: true }).fill("9");
  const activePixels = await pixels(page);
  const active = await download(
    page,
    info,
    "Save project ZIP",
    "wardrobe-active.rig.zip",
  );
  expect(JSON.parse(strFromU8(active.files["skin.json"]))).toMatchObject({
    version: 2,
    actionForearms: mapping,
  });
  const itemSaved = await download(
    page,
    info,
    `Save ${item.name}`,
    "top-reexported.wardrobe.zip",
  );
  expect(JSON.parse(strFromU8(itemSaved.files["item.json"]))).toEqual(item);
  expect(await decodedHashes(page, itemSaved.files)).toEqual(
    await decodedHashes(page, source),
  );

  await page
    .getByLabel("Wardrobe top", { exact: true })
    .selectOption("denim-jacket");
  const oldTopPixels = await pixels(page);
  expect(oldTopPixels).not.toBe(activePixels);
  const oldTop = await download(
    page,
    info,
    "Save project ZIP",
    "wardrobe-old-top.rig.zip",
  );
  const oldSkin = JSON.parse(strFromU8(oldTop.files["skin.json"]));
  expect(oldSkin.version).toBe(1);
  expect(oldSkin.actionForearms).toBeUndefined();
  for (const slot of activeSlots) {
    expect(oldSkin.slots).not.toContain(slot);
    expect(oldTop.files[`slots/${slot}.png`]).toBeUndefined();
  }
  expect(
    JSON.parse(strFromU8(oldTop.files["wardrobe.json"])).items,
  ).toHaveLength(1);

  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await expect(page.getByLabel("Wardrobe top", { exact: true })).toHaveValue(
    item.id,
  );
  await page.getByLabel("Animation frame", { exact: true }).fill("9");
  expect(await pixels(page)).toBe(activePixels);
  const restored = await download(
    page,
    info,
    "Save project ZIP",
    "wardrobe-restored.rig.zip",
  );
  expect(JSON.parse(strFromU8(restored.files["skin.json"]))).toEqual(
    JSON.parse(strFromU8(active.files["skin.json"])),
  );
  expect(await decodedHashes(page, restored.files)).toEqual(
    await decodedHashes(page, active.files),
  );

  await page
    .getByLabel("Wardrobe top", { exact: true })
    .selectOption("denim-jacket");
  await page
    .getByRole("button", { name: `Remove ${item.name}`, exact: true })
    .click();
  await expect(
    page
      .getByLabel("Wardrobe top", { exact: true })
      .locator(`option[value="${item.id}"]`),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await expect(
    page
      .getByLabel("Wardrobe top", { exact: true })
      .locator(`option[value="${item.id}"]`),
  ).toHaveCount(1);
  await page.getByLabel("Wardrobe top", { exact: true }).selectOption(item.id);
  await page.getByLabel("Action", { exact: true }).selectOption("jump");
  await page.getByLabel("Facing", { exact: true }).selectOption("left");
  const portable = await download(
    page,
    info,
    "Save project ZIP",
    "wardrobe-portable.rig.zip",
  );
  await page.reload();
  await importProject(page, portable.path);
  await expect(page.getByLabel("Wardrobe top", { exact: true })).toHaveValue(
    item.id,
  );
  await expect(
    page.getByLabel("Wardrobe identity", { exact: true }),
  ).toHaveValue("waves");
  await expect(page.getByLabel("Skin color", { exact: true })).toHaveValue(
    "#8f5b40",
  );
  await expect(page.getByLabel("Action", { exact: true })).toHaveValue("jump");
  await expect(page.getByLabel("Facing", { exact: true })).toHaveValue("left");
  const reopened = await download(
    page,
    info,
    "Save project ZIP",
    "wardrobe-portable-reopened.rig.zip",
  );
  for (const file of ["project.json", "skin.json", "wardrobe.json"])
    expect(JSON.parse(strFromU8(reopened.files[file]))).toEqual(
      JSON.parse(strFromU8(portable.files[file])),
    );
  expect(await decodedHashes(page, reopened.files)).toEqual(
    await decodedHashes(page, portable.files),
  );
});
