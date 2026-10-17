import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

async function painted(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function canvasPng(page: Page) {
  await painted(page);
  return page
    .locator("#skin-posed-canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
}

async function download(
  page: Page,
  testInfo: TestInfo,
  button: string,
  filename: string,
) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  const path = testInfo.outputPath(filename);
  await (await pending).saveAs(path);
  await expect(
    page.getByRole("button", { name: button, exact: true }),
  ).toBeEnabled();
  return { path, bytes: await readFile(path) };
}

test("one studio swaps both skins across shared actions, expressions, mirrored playback and overlays", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // A delayed RAF callback can carry a timestamp earlier than the effect's
  // performance.now() start. Exercise this clock boundary rather than relying
  // on the intermittent scheduling that originally produced a negative key.
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      request((timestamp) => callback(timestamp - 16));
  });
  await page.goto("/skin-studio.html");
  await expect(
    page.getByRole("heading", { name: "Skin & skeleton studio", exact: true }),
  ).toBeVisible();
  const appearances = new Set<string>();
  for (const skin of ["denim-daytrip", "coral-afternoon"]) {
    await page.getByLabel("Example skin", { exact: true }).selectOption(skin);
    const expressions = new Set<string>();
    for (const expression of ["neutral", "gentle", "joyful"]) {
      await page
        .getByLabel("Expression", { exact: true })
        .selectOption(expression);
      expressions.add(await canvasPng(page));
    }
    expect(expressions.size).toBe(3);
    appearances.add(await canvasPng(page));
    for (const action of ["idle", "walk", "run"]) {
      await page.getByLabel("Action", { exact: true }).selectOption(action);
      await page.getByLabel("Facing", { exact: true }).selectOption("right");
      const right = await canvasPng(page);
      await page.getByLabel("Facing", { exact: true }).selectOption("left");
      await painted(page);
      const isMirror = await page
        .locator("#skin-posed-canvas")
        .evaluate(async (canvas: HTMLCanvasElement, right) => {
          const image = new Image();
          image.src = right;
          await image.decode();
          const expected = document.createElement("canvas");
          expected.width = 192;
          expected.height = 256;
          const context = expected.getContext("2d")!;
          context.translate(192, 0);
          context.scale(-1, 1);
          context.drawImage(image, 0, 0);
          return expected.toDataURL() === canvas.toDataURL();
        }, right);
      expect(isMirror).toBe(true);
      await page.getByRole("button", { name: "Play", exact: true }).click();
      await expect
        .poll(() =>
          page.locator("#skin-posed-canvas").getAttribute("data-frame"),
        )
        .not.toBe("0");
      await page.getByRole("button", { name: "Pause", exact: true }).click();
    }
  }
  expect(appearances.size).toBe(2);
  const plain = await canvasPng(page);
  await page.getByLabel("Bones", { exact: true }).check();
  await page.getByLabel("Mesh", { exact: true }).check();
  expect(await canvasPng(page)).not.toBe(plain);
  await page.getByLabel("Bones", { exact: true }).uncheck();
  await page.getByLabel("Mesh", { exact: true }).uncheck();
  expect(await canvasPng(page)).toBe(plain);
  await page.getByLabel("Zoom", { exact: true }).selectOption("2");
  await expect(page.locator("#skin-posed-canvas")).toHaveAttribute(
    "width",
    "384",
  );
  expect(errors).toEqual([]);
});

test("real PNG replacement and binding edits survive skin/project ZIPs; invalid imports preserve work and template PNGs decode", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.goto("/skin-studio.html");
  const source = await download(
    page,
    testInfo,
    "Save skin ZIP",
    "source.skin.zip",
  );
  const sourceFiles = unzipSync(source.bytes);
  const before = await canvasPng(page);
  // Paint actual decoded source texels into a new external PNG, then exercise
  // the public file input rather than injecting the replacement into state.
  const replacement = await page.evaluate(
    async (bytes) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const rgba = context.getImageData(0, 0, 192, 256);
      for (let p = 0; p < rgba.data.length; p += 4) {
        if (!rgba.data[p + 3]) continue;
        rgba.data[p] = 217;
        rgba.data[p + 1] = 101;
        rgba.data[p + 2] = 46;
      }
      context.putImageData(rgba, 0, 0);
      return canvas.toDataURL().split(",")[1];
    },
    [...sourceFiles["slots/torso.png"]],
  );
  await page
    .getByLabel("Replace attachment file", { exact: true })
    .setInputFiles({
      name: "copper-jacket.png",
      mimeType: "image/png",
      buffer: Buffer.from(replacement, "base64"),
    });
  await expect(page.locator(".skin-notice[role=status]")).toContainText(
    "torso replaced",
  );
  expect(await canvasPng(page)).not.toBe(before);
  await page
    .getByLabel("Character name", { exact: true })
    .fill("Copper test visitor");
  await page.getByLabel("Offset X", { exact: true }).fill("3");
  await page.getByLabel("Offset X", { exact: true }).press("Enter");
  await page.getByLabel("Expression", { exact: true }).selectOption("joyful");
  await page.getByLabel("Facing", { exact: true }).selectOption("left");
  const edited = await canvasPng(page);
  const skin = await download(
    page,
    testInfo,
    "Save skin ZIP",
    "copper.skin.zip",
  );
  const skinFiles = unzipSync(skin.bytes);
  const metadata = JSON.parse(strFromU8(skinFiles["skin.json"]));
  expect(metadata.name).toBe("Copper test visitor");
  expect(metadata.bindings.offsets.torso).toEqual([3, 0]);
  expect(metadata.provenance).toContain("copper-jacket.png");
  // New identities are supplied entirely by metadata and image files.
  metadata.id = "external-copper-jacket";
  skinFiles["skin.json"] = strToU8(JSON.stringify(metadata));
  await page
    .getByLabel("Example skin", { exact: true })
    .selectOption("coral-afternoon");
  await page.getByLabel("Import skin file", { exact: true }).setInputFiles({
    name: "external-copper.skin.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync(skinFiles)),
  });
  await expect(page.locator(".skin-notice[role=status]")).toContainText(
    "Copper test visitor imported",
  );
  await expect(page.getByLabel("Example skin", { exact: true })).toHaveValue(
    "custom",
  );
  expect(await canvasPng(page)).toBe(edited);
  const project = await download(
    page,
    testInfo,
    "Save project ZIP",
    "copper.rig-project.zip",
  );
  const projectFiles = unzipSync(project.bytes);
  const authoring = JSON.parse(strFromU8(projectFiles["project.json"]));
  expect(authoring.format).toBe("gathria-rig-authoring");
  expect(authoring.preview).toEqual({
    animation: "run",
    facing: "left",
    expression: "joyful",
  });
  await page
    .getByLabel("Example skin", { exact: true })
    .selectOption("denim-daytrip");
  await page
    .getByLabel("Import project file", { exact: true })
    .setInputFiles(project.path);
  await expect(page.locator(".skin-notice[role=status]")).toContainText(
    "project opened",
  );
  expect(await canvasPng(page)).toBe(edited);
  await expect(page.getByLabel("Offset X", { exact: true })).toHaveValue("3");
  await page.getByLabel("Import project file", { exact: true }).setInputFiles({
    name: "broken.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("not an archive"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await canvasPng(page)).toBe(edited);
  await expect(page.getByLabel("Character name", { exact: true })).toHaveValue(
    "Copper test visitor",
  );

  const template = await download(
    page,
    testInfo,
    "Download artwork template",
    "copper.template.zip",
  );
  const templateFiles = unzipSync(template.bytes);
  const templateMetadata = JSON.parse(strFromU8(templateFiles["skin.json"]));
  expect(templateMetadata.id).toBe("external-copper-jacket");
  expect(strFromU8(templateFiles["TEMPLATE.md"])).toContain("192×256");
  const decoded = await page.evaluate(
    async (entries) => {
      const results = [];
      for (const [name, bytes] of entries) {
        const image = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        results.push({ name, width: image.width, height: image.height });
        image.close();
      }
      return results;
    },
    Object.entries(templateFiles)
      .filter(([name]) => name.endsWith(".png"))
      .map(([name, bytes]) => [name, [...bytes]] as [string, number[]]),
  );
  expect(decoded).toHaveLength(templateMetadata.slots.length + 1);
  expect(decoded.some((image) => image.name === "guides.png")).toBe(true);
  expect(
    decoded.every((image) => image.width === 192 && image.height === 256),
  ).toBe(true);
  await page
    .getByLabel("Import skin file", { exact: true })
    .setInputFiles(template.path);
  await expect(page.locator(".skin-notice[role=status]")).toContainText(
    "Copper test visitor imported",
  );
  expect(await canvasPng(page)).toBe(edited);

  // The appearance reference may predate run support, while the authoring
  // motion library owns the actual timing. Export must not silently replace
  // an edited clip with the production 18 FPS default.
  const oldReference = JSON.parse(strFromU8(projectFiles["skin.json"]));
  delete oldReference.sourceAppearance.motionVersion;
  delete oldReference.sourceAppearance.preview;
  projectFiles["skin.json"] = strToU8(JSON.stringify(oldReference));
  authoring.motions.clips.run.fps = 15;
  projectFiles["project.json"] = strToU8(JSON.stringify(authoring));
  await page.getByLabel("Import project file", { exact: true }).setInputFiles({
    name: "edited-timing.rig-project.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync(projectFiles)),
  });
  await expect(page.locator(".skin-notice[role=status]")).toContainText(
    "project opened",
  );
  const timedPack = await download(
    page,
    testInfo,
    "Export CharacterPack",
    "edited-timing.character.zip",
  );
  const timedFiles = unzipSync(timedPack.bytes);
  expect(
    JSON.parse(strFromU8(timedFiles["character.json"])).motionVersion,
  ).toBe(3);
  expect(
    JSON.parse(strFromU8(timedFiles["manifest.json"])).animations.run.fps,
  ).toBe(15);
  expect(strFromU8(timedFiles["INTEGRATION.md"])).toContain("15 FPS");
  expect(strFromU8(timedFiles["INTEGRATION.md"])).not.toContain("18 FPS");
});

test("binding offsets stay on integer pixels and a valid but unrenderable skin cannot replace current work", async ({
  page,
}, testInfo) => {
  await page.goto("/skin-studio.html");
  const before = await canvasPng(page);
  await page.getByLabel("Offset X", { exact: true }).fill("3.5");
  await page.getByLabel("Offset X", { exact: true }).press("Enter");
  await expect(page.getByLabel("Offset X", { exact: true })).toHaveValue("4");
  expect(await canvasPng(page)).not.toBe(before);
  await page.getByLabel("Offset X", { exact: true }).fill("0");
  await page.getByLabel("Offset X", { exact: true }).press("Enter");
  expect(await canvasPng(page)).toBe(before);

  const skin = await download(
    page,
    testInfo,
    "Save skin ZIP",
    "preflight.skin.zip",
  );
  const files = unzipSync(skin.bytes);
  // Each slot remains a valid, nonempty 192×256 PNG. However these two limb
  // images are entirely shoe-owned pixels and leave an empty leg mesh once
  // the renderer applies the documented shoe ownership exclusion.
  files["slots/near-thigh.png"] = files["slots/near-shoe.png"];
  files["slots/near-shin.png"] = files["slots/near-shoe.png"];
  await page.getByLabel("Import skin file", { exact: true }).setInputFiles({
    name: "empty-after-ownership.skin.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync(files)),
  });
  await expect(page.getByRole("alert")).toContainText(
    "No visible source pixels for mesh",
  );
  await expect(page.getByLabel("Character name", { exact: true })).toHaveValue(
    "Denim daytrip",
  );
  expect(await canvasPng(page)).toBe(before);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() => page.locator("#skin-posed-canvas").getAttribute("data-frame"))
    .not.toBe("0");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
});

for (const skin of ["denim-daytrip", "coral-afternoon"]) {
  test(`${skin} exports actual preview pixels and plays all actions independently after authoring closes`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto("/skin-studio.html");
    await page.getByLabel("Example skin", { exact: true }).selectOption(skin);
    const displayed = await canvasPng(page);
    const exported = await download(
      page,
      testInfo,
      "Export CharacterPack",
      `${skin}.character.zip`,
    );
    const files = unzipSync(exported.bytes);
    expect(Object.keys(files).sort()).toEqual([
      "INTEGRATION.md",
      "PROVENANCE.txt",
      "character.json",
      "manifest.json",
      "spritesheet.png",
    ]);
    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    expect(manifest.generator).toBe("gathria-reusable-rig-v2");
    expect(manifest.frames).toHaveLength(36);
    expect(manifest.anchor).toMatchObject({ x: 96, y: 240 });
    expect(manifest.animations.run).toEqual({
      frames: Array.from({ length: 12 }, (_, i) => i + 12),
      fps: 18,
      loop: true,
    });
    expect(strFromU8(files["PROVENANCE.txt"])).toContain("separate authoring");
    const expected = await page.evaluate(
      async ({ bytes, frames, displayed }) => {
        const image = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = 192;
        canvas.height = 256;
        const ctx = canvas.getContext("2d")!;
        const hashes: Record<string, string> = {};
        const hash = async (data: Uint8ClampedArray) =>
          Array.from(
            new Uint8Array(
              await crypto.subtle.digest("SHA-256", new Uint8Array(data)),
            ),
          )
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("");
        let previewMatches = false;
        for (const id of [0, 4, 12]) {
          const frame = frames.find((f: { id: number }) => f.id === id);
          ctx.clearRect(0, 0, 192, 256);
          ctx.drawImage(image, frame.x, frame.y, 192, 256, 0, 0, 192, 256);
          if (id === 12) previewMatches = canvas.toDataURL() === displayed;
          hashes[`${id}-right`] = await hash(
            ctx.getImageData(0, 0, 192, 234).data,
          );
          const mirror = document.createElement("canvas");
          mirror.width = 192;
          mirror.height = 256;
          const mc = mirror.getContext("2d")!;
          mc.translate(192, 0);
          mc.scale(-1, 1);
          mc.drawImage(canvas, 0, 0);
          hashes[`${id}-left`] = await hash(
            mc.getImageData(0, 0, 192, 234).data,
          );
        }
        return {
          hashes,
          previewMatches,
          width: image.width,
          height: image.height,
        };
      },
      {
        bytes: [...files["spritesheet.png"]],
        frames: manifest.frames,
        displayed,
      },
    );
    expect(expected.previewMatches).toBe(true);
    expect([expected.width, expected.height]).toEqual([1536, 1536]);
    await page.close();
    const player = await context.newPage();
    const forbidden: string[] = [],
      errors: string[] = [];
    player.on("pageerror", (error) => errors.push(error.message));
    await player.route(
      /\/src\/(?:skeletal\/|editor\/|experiments\/|core\/(?:generator|(?:cohesive|polished|running|illustrated)-))/,
      async (route) => {
        forbidden.push(route.request().url());
        await route.abort();
      },
    );
    await player.goto("/player.html");
    await player.locator("#player-zip").setInputFiles(exported.path);
    await expect(player.getByRole("status")).toContainText("Loaded:");
    await player
      .getByRole("button", { name: "Pause animation", exact: true })
      .click();
    await player.locator("#player-zoom").selectOption("1");
    const canvas = player.getByTestId("consumer-canvas");
    for (const [action, id] of [
      ["Idle", 0],
      ["Walk", 4],
      ["Run", 12],
    ] as const) {
      await player.getByRole("button", { name: action, exact: true }).click();
      for (const facing of ["Right", "Left"]) {
        await player.getByRole("button", { name: facing, exact: true }).click();
        await painted(player);
        const hash = await canvas.evaluate(
          async (canvas: HTMLCanvasElement) => {
            const pixels = canvas
              .getContext("2d")!
              .getImageData(
                Math.round(canvas.width / 2) - 96,
                Math.floor((canvas.height - 256) / 2),
                192,
                234,
              ).data;
            return Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", pixels)),
            )
              .map((v) => v.toString(16).padStart(2, "0"))
              .join("");
          },
        );
        expect(hash).toBe(expected.hashes[`${id}-${facing.toLowerCase()}`]);
      }
    }
    await player
      .getByRole("button", { name: "Play animation", exact: true })
      .click();
    const observed = await canvas.evaluate(
      (element) =>
        new Promise<number[]>((resolve) => {
          const ids = new Set<number>(),
            start = performance.now();
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
}
