import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";

async function waitForDraw(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test("four everyday looks preserve identity and running, remain editable, and survive save/reopen/export", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/editor.html");
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await page
    .getByLabel("Character name", { exact: true })
    .fill("Everyday Alex");
  await page.getByLabel("Face shape", { exact: true }).selectOption("round");
  await page.getByLabel("Hairstyle", { exact: true }).selectOption("waves");
  await page.getByLabel("Custom hair color", { exact: true }).fill("#755879");
  await page
    .getByRole("button", { name: "Skin tone #805039", exact: true })
    .click();
  await page.getByLabel("Expression", { exact: true }).selectOption("joyful");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByRole("button", { name: "Face left", exact: true }).click();
  const preview = page
    .getByRole("region", { name: "Animation preview" })
    .locator("canvas");
  const looks = [
    { name: "Denim daytrip", upper: "jacket", lower: "trousers" },
    { name: "Coral afternoon", upper: "tee", lower: "skirt" },
    { name: "Sage weekend", upper: "hoodie", lower: "shorts" },
    { name: "Ochre traveler", upper: "jacket", lower: "trousers" },
  ];
  for (const look of looks) {
    await page
      .getByLabel("Hair accessory", { exact: true })
      .selectOption("flowers");
    await page.getByRole("button", { name: look.name, exact: true }).click();
    await expect(
      page.getByRole("button", { name: look.name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByLabel("Upper clothing", { exact: true }),
    ).toHaveValue(look.upper);
    await expect(
      page.getByLabel("Lower clothing", { exact: true }),
    ).toHaveValue(look.lower);
    await expect(
      page.getByLabel("Hair accessory", { exact: true }),
    ).toHaveValue("none");
    await expect(
      page.getByLabel("Character name", { exact: true }),
    ).toHaveValue("Everyday Alex");
    await expect(page.getByLabel("Face shape", { exact: true })).toHaveValue(
      "round",
    );
    await expect(page.getByLabel("Hairstyle", { exact: true })).toHaveValue(
      "waves",
    );
    await expect(page.getByLabel("Expression", { exact: true })).toHaveValue(
      "joyful",
    );
    await expect(preview).toHaveAttribute(
      "aria-label",
      "Everyday Alex, run, facing left",
    );
  }
  // Presets are starting points, not locked costume or identity types.
  await page.getByLabel("Custom lower color", { exact: true }).fill("#617088");
  await expect(
    page.getByRole("button", { name: "Ochre traveler", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await waitForDraw(page);
  const before = await preview.evaluate((canvas: HTMLCanvasElement) =>
    canvas.toDataURL(),
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save config", exact: true }).click();
  const configPath = testInfo.outputPath("everyday.character.json");
  await (await download).saveAs(configPath);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  expect(config).toMatchObject({
    name: "Everyday Alex",
    artworkVersion: 6,
    motionVersion: 3,
    preview: { animation: "run", facing: "left" },
    faceVariant: "round",
    hairstyle: "waves",
    hairColor: "#755879",
    skinTone: "#805039",
    expression: "joyful",
    hairAccessory: "none",
    upperClothing: "jacket",
    upperColor: "#C79A55",
    lowerClothing: "trousers",
    lowerColor: "#617088",
    shoeColor: "#694C38",
  });
  await page.getByRole("button", { name: "Mira preset", exact: true }).click();
  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(configPath);
  await waitForDraw(page);
  expect(
    await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
  ).toBe(before);
  const exported = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export character", exact: true })
    .click();
  const zipPath = testInfo.outputPath("everyday.character.zip");
  await (await exported).saveAs(zipPath);
  const files = unzipSync(await readFile(zipPath));
  expect(JSON.parse(Buffer.from(files["character.json"]).toString())).toEqual(
    config,
  );
  const manifest = JSON.parse(Buffer.from(files["manifest.json"]).toString());
  expect(manifest.generator).toBe("gathria-polished-pixels-v6-motion-v3");
  expect(manifest.animations.run.frames).toHaveLength(12);
  expect(manifest.animations.run.fps).toBe(18);
  const png = [...files["spritesheet.png"]];
  const image = await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(bytes)], { type: "image/png" }),
    );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = new Set<number>();
    for (let index = 3; index < data.length; index += 4) alpha.add(data[index]);
    const result = {
      width: bitmap.width,
      height: bitmap.height,
      alpha: [...alpha].sort((a, b) => a - b),
    };
    bitmap.close();
    return result;
  }, png);
  expect(image).toEqual({ width: 1536, height: 1024, alpha: [0, 255] });
  expect(errors).toEqual([]);
});

test("an everyday look does not inject newer artwork fields into a legacy character", async ({
  page,
}, testInfo) => {
  const sourcePath = new URL(
    "../../public/samples/mira/character.json",
    import.meta.url,
  ).pathname;
  const original = JSON.parse(await readFile(sourcePath, "utf8"));
  await page.goto("/editor.html");
  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(sourcePath);
  await page
    .getByRole("button", { name: "Denim daytrip", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Run", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Hair accessory", { exact: true })).toHaveCount(
    0,
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save config", exact: true }).click();
  const path = testInfo.outputPath("legacy-everyday.json");
  await (await download).saveAs(path);
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
    ...original,
    upperClothing: "jacket",
    upperColor: "#527D9A",
    lowerClothing: "trousers",
    lowerColor: "#A37B56",
    shoeColor: "#594435",
  });
});
