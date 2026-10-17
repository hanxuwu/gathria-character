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

for (const originalArt of [
  {
    version: 7,
    badge: "Art V7 · detailed",
    sample: "../../docs/art-harmonized/dress-joyful",
  },
  {
    version: 6,
    badge: "POLISHED ART · V6",
    sample: "../../docs/art-polished/dress-joyful",
  },
  { version: 1, badge: "Art V1 · original", sample: "mira" },
  { version: 2, badge: "Art V2 · classic", sample: "v2/mira" },
  { version: 3, badge: "Art V3 · detailed", sample: "detailed/mira" },
  { version: 4, badge: "Art V4 · detailed", sample: "expressive/mira" },
  {
    version: 5,
    badge: "Art V5 · detailed",
    sample: "../../docs/art-cohesive/dress-joyful",
  },
]) {
  test(`Art V${originalArt.version} saved work stays pixel-exact across save and export`, async ({
    page,
  }, testInfo) => {
    const originalFile = new URL(
      `../../public/samples/${originalArt.sample}/character.json`,
      import.meta.url,
    ).pathname;
    const originalConfig = JSON.parse(await readFile(originalFile, "utf8"));
    await page.goto("/");
    await page
      .getByRole("button", { name: "Pause animation", exact: true })
      .click();
    await page
      .getByLabel("Open character configuration", { exact: true })
      .setInputFiles(originalFile);
    await page.getByLabel("Pixel zoom", { exact: true }).selectOption("2");
    await expect(
      page.getByText(originalArt.badge, { exact: true }),
    ).toBeVisible();
    if (originalArt.version === 1)
      await expect(page.getByLabel("Face shape", { exact: true })).toHaveCount(
        0,
      );
    const preview = page
      .getByRole("region", { name: "Animation preview" })
      .locator("canvas");
    await waitForDraw(page);
    const savedPixels = await preview.evaluate((canvas: HTMLCanvasElement) =>
      canvas.toDataURL(),
    );
    const originalPixels = await page.evaluate(async (sample) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`/samples/${sample}/spritesheet.png`)).blob(),
      );
      const canvas = document.createElement("canvas");
      const manifest = await (
        await fetch(`/samples/${sample}/manifest.json`)
      ).json();
      const { frameWidth: w, frameHeight: h } = manifest.spritesheet;
      canvas.width = w * 2;
      canvas.height = h * 2;
      const context = canvas.getContext("2d")!;
      context.imageSmoothingEnabled = false;
      context.drawImage(bitmap, 0, 0, w, h, 0, 0, w * 2, h * 2);
      bitmap.close();
      return canvas.toDataURL();
    }, originalArt.sample);
    expect(savedPixels).toBe(originalPixels);
    const originalDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Save config", exact: true })
      .click();
    const original = await originalDownload;
    const originalPath = testInfo.outputPath("original.character.json");
    await original.saveAs(originalPath);
    expect(JSON.parse(await readFile(originalPath, "utf8"))).toEqual(
      originalConfig,
    );

    const originalPackDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export character", exact: true })
      .click();
    const originalPack = await originalPackDownload;
    const originalPackPath = testInfo.outputPath("original.character.zip");
    await originalPack.saveAs(originalPackPath);
    const originalFiles = unzipSync(
      new Uint8Array(await readFile(originalPackPath)),
    );
    expect(
      JSON.parse(Buffer.from(originalFiles["character.json"]).toString()),
    ).toEqual(originalConfig);
    const originalProvenance = Buffer.from(
      originalFiles["PROVENANCE.txt"],
    ).toString();
    if (originalArt.version < 3) {
      expect(originalProvenance).toContain("or AI generation are used");
      expect(originalProvenance).not.toContain("AI-assisted");
    } else
      expect(originalProvenance).toContain(
        `Artwork version ${originalArt.version} uses AI-assisted`,
      );

    if (originalArt.version >= 6) {
      await expect(
        page.getByRole("button", { name: /Create .*copy/ }),
      ).toHaveCount(0);
      return;
    }
    await page
      .getByRole("button", { name: "Create polished copy", exact: true })
      .click();
    await expect(
      page.getByText(originalArt.badge, { exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Face shape", { exact: true }).selectOption("round");
    await page.getByLabel("Pixel zoom", { exact: true }).selectOption("1");
    await waitForDraw(page);
    const detailedPixels = await preview.evaluate((canvas: HTMLCanvasElement) =>
      canvas.toDataURL(),
    );
    expect(detailedPixels).not.toBe(savedPixels);
    await expect(preview).toHaveAttribute("width", "192");
    await expect(preview).toHaveAttribute("height", "256");
    const detailedDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Save config", exact: true })
      .click();
    const copy = await detailedDownload;
    const copyPath = testInfo.outputPath("copy.character.json");
    await copy.saveAs(copyPath);
    expect(JSON.parse(await readFile(copyPath, "utf8"))).toMatchObject({
      ...originalConfig,
      schemaVersion: 2,
      artworkVersion: 6,
      faceVariant: "round",
    });
    await page.getByRole("button", { name: "Jun preset", exact: true }).click();
    await page
      .getByLabel("Open character configuration", { exact: true })
      .setInputFiles(copyPath);
    await page.getByLabel("Pixel zoom", { exact: true }).selectOption("1");
    await waitForDraw(page);
    expect(
      await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
    ).toBe(detailedPixels);
    await page
      .getByLabel("Open character configuration", { exact: true })
      .setInputFiles(originalPath);
    await page.getByLabel("Pixel zoom", { exact: true }).selectOption("2");
    await waitForDraw(page);
    expect(
      await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
    ).toBe(originalPixels);
  });
}

for (const outfit of [
  { label: "Wedding suit", upper: "suit", lower: "trousers" },
  { label: "Wedding dress", upper: "bodice", lower: "dress" },
]) {
  test(`${outfit.label} exports actual detailed pixels and plays independently in both directions`, async ({
    page,
    context,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page
      .getByRole("button", { name: "Rowan preset", exact: true })
      .click();
    await page.getByLabel("Face shape", { exact: true }).selectOption("heart");
    await page.getByRole("button", { name: outfit.label, exact: true }).click();
    await page.getByLabel("Expression", { exact: true }).selectOption("joyful");
    await page
      .getByLabel("Hair accessory", { exact: true })
      .selectOption("flowers");
    await expect(
      page.getByLabel("Upper clothing", { exact: true }),
    ).toHaveValue(outfit.upper);
    await expect(
      page.getByLabel("Lower clothing", { exact: true }),
    ).toHaveValue(outfit.lower);
    // Outfit starting points do not replace the user's selected identity.
    await expect(
      page.getByLabel("Character name", { exact: true }),
    ).toHaveValue("Rowan");
    await expect(page.getByLabel("Face shape", { exact: true })).toHaveValue(
      "heart",
    );
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export character", exact: true })
      .click();
    const saved = await download;
    const zipPath = testInfo.outputPath(saved.suggestedFilename());
    await saved.saveAs(zipPath);
    const files = unzipSync(new Uint8Array(await readFile(zipPath)));
    const provenance = Buffer.from(files["PROVENANCE.txt"]).toString();
    expect(provenance).toContain("AI-assisted");
    expect(provenance).not.toContain("or AI generation are used");
    const config = JSON.parse(Buffer.from(files["character.json"]).toString());
    const manifest = JSON.parse(Buffer.from(files["manifest.json"]).toString());
    expect(config).toMatchObject({
      schemaVersion: 2,
      artworkVersion: 6,
      motionVersion: 3,
      faceVariant: "heart",
      upperClothing: outfit.upper,
      lowerClothing: outfit.lower,
      expression: "joyful",
      hairAccessory: "flowers",
    });
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      generator: "gathria-polished-pixels-v6-motion-v3",
      anchor: { x: 96, y: 240 },
      spritesheet: {
        width: 1536,
        height: 1024,
        frameWidth: 192,
        frameHeight: 256,
      },
    });

    const player = await context.newPage();
    player.on("pageerror", (error) => errors.push(error.message));
    const forbidden: string[] = [];
    await player.route(
      /\/(?:src\/editor\/|src\/core\/(?:generator|illustrated-|expressive-|cohesive-|polished-))/,
      (route) => {
        forbidden.push(route.request().url());
        return route.abort();
      },
    );
    await player.goto("/player.html");
    await player.locator("#player-zip").setInputFiles(zipPath);
    await expect(player.getByRole("status")).toContainText("Loaded: Rowan");
    await expect(
      player.getByText("gathria-polished-pixels-v6-motion-v3", { exact: true }),
    ).toBeVisible();
    await player
      .getByRole("button", { name: "Pause animation", exact: true })
      .click();
    const canvas = player.getByTestId("consumer-canvas");
    for (const motion of ["Idle", "Walk"]) {
      await player.getByRole("button", { name: motion, exact: true }).click();
      await player.getByRole("button", { name: "Right", exact: true }).click();
      await waitForDraw(player);
      const right = await canvas.evaluate((element: HTMLCanvasElement) =>
        element.toDataURL(),
      );
      await player.getByRole("button", { name: "Left", exact: true }).click();
      await waitForDraw(player);
      const left = await canvas.evaluate((element: HTMLCanvasElement) =>
        element.toDataURL(),
      );
      expect(left).not.toBe(right);
      await expect(canvas).toHaveAttribute(
        "aria-label",
        new RegExp(`Rowan, ${motion.toLowerCase()}, facing left`),
      );
      await player
        .getByRole("button", { name: "Play animation", exact: true })
        .click();
      await expect
        .poll(() =>
          canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()),
        )
        .not.toBe(left);
      await player
        .getByRole("button", { name: "Pause animation", exact: true })
        .click();
    }
    // Reuse the consumer with both published generations: neither saved
    // package may depend on the current renderer or require a migration.
    for (const previous of [
      { sample: "jun", generator: "gathria-original-pixels-v1" },
      { sample: "v2/jun", generator: "gathria-warm-pixels-v2" },
    ]) {
      await player
        .locator("#player-zip")
        .setInputFiles(
          new URL(
            `../../public/samples/${previous.sample}.character.zip`,
            import.meta.url,
          ).pathname,
        );
      await expect(player.getByRole("status")).toContainText("Loaded: Jun");
      await expect(
        player.getByText(previous.generator, { exact: true }),
      ).toBeVisible();
      await player.getByRole("button", { name: "Walk", exact: true }).click();
      await waitForDraw(player);
      const legacyFrame = await canvas.evaluate((element: HTMLCanvasElement) =>
        element.toDataURL(),
      );
      await expect
        .poll(() =>
          canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()),
        )
        .not.toBe(legacyFrame);
    }
    expect(forbidden).toEqual([]);
    expect(errors).toEqual([]);
  });
}
