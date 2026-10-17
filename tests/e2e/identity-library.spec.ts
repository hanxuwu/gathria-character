import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

async function pixels(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  return page
    .locator("#skin-posed-canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
}

async function download(
  page: Page,
  info: TestInfo,
  button: string,
  name: string,
) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  const path = info.outputPath(name);
  await (await pending).saveAs(path);
  await expect(
    page.getByRole("button", { name: button, exact: true }),
  ).toBeEnabled();
  return { path, files: unzipSync(await readFile(path)) };
}

async function preparedIdentity(page: Page, info: TestInfo) {
  const template = await download(
    page,
    info,
    "Download identity template",
    "template.identity.zip",
  );
  const identity = JSON.parse(strFromU8(template.files["identity.json"]));
  identity.id = "custom-cedar-test";
  identity.name = "Cedar test";
  identity.provenance +=
    "\nBrowser regression fixture: renamed catalog template, no generated art.";
  const files: Record<string, Uint8Array> = {
    ...template.files,
    "identity.json": strToU8(JSON.stringify(identity)),
  };
  return { identity, files, buffer: Buffer.from(zipSync(files)) };
}

async function importIdentity(page: Page, buffer: Buffer) {
  await page
    .getByLabel("Import identity ZIP file", { exact: true })
    .setInputFiles({
      name: "cedar.identity.zip",
      mimeType: "application/zip",
      buffer,
    });
  await expect(page.locator(".skin-notice[role=status]")).toContainText(
    "added to your identities",
  );
}

test("identity import preserves flat artwork; explicit use, removal history and self-contained project reopen work", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.goto("/skin-studio.html");
  const flat = await pixels(page);
  await page
    .getByRole("button", { name: "Open wardrobe", exact: true })
    .click();
  const prepared = await preparedIdentity(page, info);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  expect(await pixels(page)).toBe(flat);
  await importIdentity(page, prepared.buffer);
  expect(await pixels(page)).toBe(flat);
  await expect(
    page.getByLabel("Wardrobe identity", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Use Cedar test identity", exact: true }),
  ).toHaveText("Use identity in new look");
  await expect(
    page.getByText("Use identity in new look starts", { exact: false }),
  ).toBeVisible();

  const libraryOnly = await download(
    page,
    info,
    "Save project ZIP",
    "library-only.rig.zip",
  );
  expect(
    JSON.parse(strFromU8(libraryOnly.files["project.json"])).wardrobe,
  ).toBeUndefined();
  expect(
    JSON.parse(strFromU8(libraryOnly.files["identities.json"])).identities,
  ).toHaveLength(1);

  await page
    .getByRole("button", { name: "Remove Cedar test identity", exact: true })
    .click();
  await expect(
    page.getByRole("list", { name: "Imported identities", exact: true }),
  ).toHaveCount(0);
  expect(await pixels(page)).toBe(flat);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await page
    .getByRole("button", { name: "Use Cedar test identity", exact: true })
    .click();
  await expect(
    page.getByLabel("Wardrobe identity", { exact: true }),
  ).toHaveValue(prepared.identity.id);
  await expect(page.getByLabel("Hair color", { exact: true })).toHaveValue(
    prepared.identity.palette.hair,
  );
  await expect(
    page.getByRole("button", {
      name: "Remove Cedar test identity",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  expect(await pixels(page)).toBe(flat);
  await page.getByRole("button", { name: "Redo edit", exact: true }).click();
  await page.getByLabel("Action", { exact: true }).selectOption("run");
  await page.getByLabel("Facing", { exact: true }).selectOption("left");
  await page.getByLabel("Expression", { exact: true }).selectOption("joyful");
  await page.getByLabel("Animation frame", { exact: true }).fill("5");
  const look = await pixels(page);
  const saved = await download(page, info, "Save project ZIP", "cedar.rig.zip");
  expect(
    JSON.parse(strFromU8(saved.files["project.json"])).wardrobe.version,
  ).toBe(3);
  const exported = await download(
    page,
    info,
    "Save Cedar test identity",
    "cedar.identity.zip",
  );
  expect(JSON.parse(strFromU8(exported.files["identity.json"]))).toEqual(
    prepared.identity,
  );
  for (const name of Object.keys(prepared.files).filter((name) =>
    name.endsWith(".png"),
  ))
    expect(exported.files[name]).toEqual(prepared.files[name]);
  await page.reload();
  await page
    .getByLabel("Import project file", { exact: true })
    .setInputFiles(saved.path);
  await expect(page.locator(".skin-notice[role=status]")).toContainText(
    "project opened",
  );
  await expect(
    page.getByLabel("Wardrobe identity", { exact: true }),
  ).toHaveValue(prepared.identity.id);
  await expect(page.getByLabel("Action", { exact: true })).toHaveValue("run");
  await expect(page.getByLabel("Facing", { exact: true })).toHaveValue("left");
  await expect(page.getByLabel("Expression", { exact: true })).toHaveValue(
    "joyful",
  );
  await page.getByLabel("Animation frame", { exact: true }).fill("5");
  expect(await pixels(page)).toBe(look);
});

test("custom identity selection retains outfit, hair colors undo atomically, and bad imports leave the current look intact", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.goto("/skin-studio.html");
  await page
    .getByRole("button", { name: "Open wardrobe", exact: true })
    .click();
  await expect(page.getByLabel("Hair color", { exact: true })).toHaveCount(0);
  await page
    .getByLabel("Wardrobe top", { exact: true })
    .selectOption("soft-top");
  await page
    .getByLabel("Wardrobe bottom", { exact: true })
    .selectOption("short-skirt");
  await page
    .getByLabel("Wardrobe shoes", { exact: true })
    .selectOption("flats");
  await page.getByLabel("Top color", { exact: true }).fill("#687e9e");
  await page.getByRole("button", { name: "Apply colors", exact: true }).click();
  const prepared = await preparedIdentity(page, info);
  const beforeImport = await pixels(page);
  await importIdentity(page, prepared.buffer);
  expect(await pixels(page)).toBe(beforeImport);
  await page
    .getByLabel("Wardrobe identity", { exact: true })
    .selectOption(prepared.identity.id);
  for (const [label, value] of [
    ["top", "soft-top"],
    ["bottom", "short-skirt"],
    ["shoes", "flats"],
  ])
    await expect(
      page.getByLabel(`Wardrobe ${label}`, { exact: true }),
    ).toHaveValue(value);
  await expect(page.getByLabel("Top color", { exact: true })).toHaveValue(
    "#687e9e",
  );
  const original = await pixels(page);
  await page.getByLabel("Hair color", { exact: true }).fill("#806a49");
  await page.getByLabel("Skin color", { exact: true }).fill("#9d694e");
  expect(await pixels(page)).toBe(original);
  await page.getByRole("button", { name: "Apply colors", exact: true }).click();
  const recolored = await pixels(page);
  expect(recolored).not.toBe(original);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  expect(await pixels(page)).toBe(original);
  await page.getByRole("button", { name: "Redo edit", exact: true }).click();
  expect(await pixels(page)).toBe(recolored);
  await page.getByLabel("Hair color", { exact: true }).fill("invalid");
  await expect(
    page.getByRole("button", { name: "Apply colors", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Hair color", { exact: true }).press("Escape");
  await expect(page.getByLabel("Hair color", { exact: true })).toHaveValue(
    "#806a49",
  );

  const invalidFiles = { ...prepared.files };
  invalidFiles["identity.json"] = strToU8(
    JSON.stringify({
      ...prepared.identity,
      id: "custom-invalid",
      neck: [95, 118],
    }),
  );
  await page
    .getByLabel("Import identity ZIP file", { exact: true })
    .setInputFiles({
      name: "invalid.identity.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zipSync(invalidFiles)),
    });
  await expect(page.locator(".skin-notice[role=alert]")).toContainText(
    "identity.neck",
  );
  expect(await pixels(page)).toBe(recolored);
  await expect(
    page
      .getByRole("list", { name: "Imported identities", exact: true })
      .locator("li"),
  ).toHaveCount(1);
  await page
    .getByLabel("Wardrobe identity", { exact: true })
    .selectOption("waves");
  await expect(page.getByLabel("Hair color", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Wardrobe top", { exact: true })).toHaveValue(
    "soft-top",
  );
  await expect(
    page.getByRole("button", {
      name: "Remove Cedar test identity",
      exact: true,
    }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  expect(await pixels(page)).toBe(recolored);
  await expect(page.getByLabel("Hair color", { exact: true })).toHaveValue(
    "#806a49",
  );
});
