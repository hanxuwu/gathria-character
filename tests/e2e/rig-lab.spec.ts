import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";

async function painted(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function canvasPng(page: Page, id = "mesh-preview") {
  await painted(page);
  return page
    .locator(`#${id}`)
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
}

test("lab compares real baked frames while preserving every idle and walk frame", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/rig-lab.html");
  await expect(
    page.getByRole("heading", { name: "Skeletal rig lab", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#mesh-preview")).toHaveAttribute("width", "192");
  await expect(page.locator("#mesh-preview")).toHaveAttribute("height", "256");
  for (const [action, count] of [
    // Idle contains 12 held timeline slots, covering four source drawings.
    ["idle", 12],
    ["walk", 8],
  ] as const) {
    await page.getByLabel("Animation", { exact: true }).selectOption(action);
    await expect(page.locator("#foot-lift")).toBeDisabled();
    for (let frame = 0; frame < count; frame++) {
      await page.locator("#frame-slider").fill(String(frame));
      expect(await canvasPng(page)).toBe(
        await canvasPng(page, "baseline-preview"),
      );
    }
  }
  await page.getByLabel("Animation", { exact: true }).selectOption("run");
  await page.locator("#frame-slider").fill("4");
  expect(
    (await canvasPng(page)) === (await canvasPng(page, "baseline-preview")),
  ).toBe(false);
  await page.getByLabel("Facing", { exact: true }).selectOption("left");
  await page.getByLabel("Preview scale", { exact: true }).selectOption("2");
  await expect(page.locator("#mesh-preview")).toHaveAttribute("width", "384");
  await expect(page.locator("#mesh-preview")).toHaveAttribute(
    "data-facing",
    "left",
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() => page.locator("#mesh-preview").getAttribute("data-frame"))
    .not.toBe("4");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  expect(errors).toEqual([]);
});

test("edited recipe round-trips through a real file; invalid import preserves it and PNG excludes overlays", async ({
  page,
}, testInfo) => {
  await page.goto("/rig-lab.html");
  await page.locator("#frame-slider").fill("4");
  const original = await canvasPng(page);
  await page.locator("#foot-lift").fill("29");
  await page.locator("#blend-radius").fill("5");
  const edited = await canvasPng(page);
  expect(edited === original).toBe(false);
  const saved = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Save rig project", exact: true })
    .click();
  const path = testInfo.outputPath("edited.rig-project.json");
  await (await saved).saveAs(path);
  const project = JSON.parse(await readFile(path, "utf8"));
  expect(project.format).toBe("gathria-skeletal-project");
  expect(project.mesh.blendRadius).toBe(5);
  expect(project.timeline.frames[4].footLift).toBe(29);
  expect(project.timeline.frames).toHaveLength(12);
  await page
    .getByRole("button", { name: "Restore experiment", exact: true })
    .click();
  await page
    .getByLabel("Open rig project JSON", { exact: true })
    .setInputFiles(path);
  await expect(page.locator(".status[role='status']")).toContainText(
    "Rig project reopened",
  );
  await page.locator("#frame-slider").fill("4");
  expect(await canvasPng(page)).toBe(edited);
  await page
    .getByLabel("Open rig project JSON", { exact: true })
    .setInputFiles({
      name: "unsupported.rig-project.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ ...project, schemaVersion: 99 })),
    });
  await expect(page.getByRole("alert")).toContainText("Unsupported rig recipe");
  await expect(page.locator("#foot-lift")).toHaveValue("29");
  expect(await canvasPng(page)).toBe(edited);

  await page.getByLabel("Show bones", { exact: true }).check();
  await page.getByLabel("Show mesh", { exact: true }).check();
  expect((await canvasPng(page)) === edited).toBe(false);
  const frameDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Save frame PNG", exact: true })
    .click();
  const framePath = testInfo.outputPath("edited-frame.png");
  await (await frameDownload).saveAs(framePath);
  const png = await readFile(framePath);
  const decoded = await page.evaluate(
    async ({ bytes, expected }) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let transparent = 0,
        opaque = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] === 0) transparent++;
        if (pixels[index] === 255) opaque++;
      }
      return {
        width: canvas.width,
        height: canvas.height,
        equalsArtwork: canvas.toDataURL() === expected,
        transparent,
        opaque,
      };
    },
    { bytes: [...png], expected: edited },
  );
  expect(decoded.width).toBe(192);
  expect(decoded.height).toBe(256);
  expect(decoded.equalsArtwork).toBe(true);
  expect(decoded.transparent).toBeGreaterThan(1000);
  expect(decoded.opaque).toBeGreaterThan(1000);
  expect(decoded.transparent + decoded.opaque).toBe(192 * 256);
});

test("skeletal pack contains the recipe and plays all run frames after the lab closes", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.goto("/rig-lab.html");
  const displayed = await canvasPng(page);
  const exported = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Bake CharacterPack", exact: true })
    .click();
  const zipPath = testInfo.outputPath("denim-skeletal.character.zip");
  await (await exported).saveAs(zipPath);
  const files = unzipSync(await readFile(zipPath));
  expect(Object.keys(files).sort()).toEqual([
    "INTEGRATION.md",
    "PROVENANCE.txt",
    "character.json",
    "manifest.json",
    "spritesheet.png",
  ]);
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  expect(manifest.generator).toBe("gathria-denim-skeletal-v1");
  expect(manifest.spritesheet.frameWidth).toBe(192);
  expect(manifest.spritesheet.frameHeight).toBe(256);
  expect(manifest.frames).toHaveLength(24);
  expect(manifest.animations.run).toEqual({
    frames: Array.from({ length: 12 }, (_, i) => 12 + i),
    fps: 18,
    loop: true,
  });
  const provenance = strFromU8(files["PROVENANCE.txt"]);
  const recipe = provenance
    .split("BEGIN GATHRIA RIG PROJECT\n")[1]
    ?.split("\nEND GATHRIA RIG PROJECT")[0];
  expect(JSON.parse(recipe).format).toBe("gathria-skeletal-project");
  expect(JSON.parse(recipe).timeline.frames).toHaveLength(12);
  expect(strFromU8(files["INTEGRATION.md"])).toContain(
    "EXPERIMENTAL DENIM SKELETAL BAKE",
  );
  const frame = manifest.frames.find((item: { id: number }) => item.id === 12);
  const sourcePixels = await page.evaluate(
    async ({ bytes, frame, displayed }) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = frame.width;
      canvas.height = frame.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(
        image,
        frame.x,
        frame.y,
        frame.width,
        frame.height,
        0,
        0,
        frame.width,
        frame.height,
      );
      return {
        width: image.width,
        height: image.height,
        equalsDisplayed: canvas.toDataURL() === displayed,
        topPixels: Array.from(context.getImageData(0, 0, 192, 234).data),
      };
    },
    { bytes: [...files["spritesheet.png"]], frame, displayed },
  );
  expect(sourcePixels.width).toBe(manifest.spritesheet.width);
  expect(sourcePixels.height).toBe(manifest.spritesheet.height);
  expect(sourcePixels.equalsDisplayed).toBe(true);

  await page.close();
  const player = await context.newPage();
  const forbidden: string[] = [],
    errors: string[] = [];
  player.on("pageerror", (error) => errors.push(error.message));
  await player.route(
    /\/src\/(?:editor\/|experiments\/|core\/(?:generator|(?:cohesive|polished|running|illustrated)-))/,
    async (route) => {
      forbidden.push(route.request().url());
      await route.abort();
    },
  );
  await player.goto("/player.html");
  await player.locator("#player-zip").setInputFiles(zipPath);
  await expect(player.getByRole("status")).toContainText("Loaded:");
  await player
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await player.locator("#player-zoom").selectOption("1");
  await player.getByRole("button", { name: "Run", exact: true }).click();
  await expect(player.locator(".player-timing")).toHaveText("18 FPS · LOOP");
  const canvas = player.getByTestId("consumer-canvas");
  await expect(canvas).toHaveAttribute(
    "aria-label",
    /run, facing right, frame 12$/,
  );
  await painted(player);
  const right = await canvas.evaluate((canvas: HTMLCanvasElement) =>
    Array.from(
      canvas
        .getContext("2d")!
        .getImageData(
          Math.round(canvas.width / 2) - 96,
          Math.floor((canvas.height - 256) / 2),
          192,
          234,
        ).data,
    ),
  );
  // Ignore the separate anchor/baseline guides below y234; above it pixels must
  // be the exported atlas, with no authoring module available to the player.
  expect(right).toEqual(sourcePixels.topPixels);
  await player.getByRole("button", { name: "Left", exact: true }).click();
  await painted(player);
  const left = await canvas.evaluate((canvas: HTMLCanvasElement) =>
    Array.from(
      canvas
        .getContext("2d")!
        .getImageData(
          Math.round(canvas.width / 2) - 96,
          Math.floor((canvas.height - 256) / 2),
          192,
          234,
        ).data,
    ),
  );
  const mirrored = new Array<number>(right.length);
  for (let y = 0; y < 234; y++)
    for (let x = 0; x < 192; x++)
      for (let channel = 0; channel < 4; channel++)
        mirrored[(y * 192 + x) * 4 + channel] =
          right[(y * 192 + 191 - x) * 4 + channel];
  expect(left).toEqual(mirrored);
  await player
    .getByRole("button", { name: "Play animation", exact: true })
    .click();
  const observed = await canvas.evaluate(
    (element) =>
      new Promise<number[]>((resolve) => {
        const ids = new Set<number>();
        const start = performance.now();
        function sample() {
          const id = Number(
            element.getAttribute("aria-label")?.match(/frame (\d+)$/)?.[1],
          );
          if (Number.isFinite(id)) ids.add(id);
          if (performance.now() - start < 1500) requestAnimationFrame(sample);
          else resolve([...ids].sort((a, b) => a - b));
        }
        sample();
      }),
  );
  expect(observed).toEqual(manifest.animations.run.frames);
  expect(forbidden).toEqual([]);
  expect(errors).toEqual([]);
});
