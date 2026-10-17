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

async function pixels(page: Page) {
  await painted(page);
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

async function decodedHashes(
  page: Page,
  files: Record<string, Uint8Array>,
  names?: string[],
) {
  const entries = Object.entries(files).filter(([name]) =>
    names ? names.includes(name) : name.endsWith(".png"),
  );
  return page.evaluate(
    async (entries) => {
      const result: Record<string, string> = {};
      for (const [name, bytes] of entries) {
        const image = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        const rgba = ctx.getImageData(0, 0, image.width, image.height).data;
        result[name] =
          `${image.width}x${image.height}:` +
          [...new Uint8Array(await crypto.subtle.digest("SHA-256", rgba))]
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("");
        image.close();
      }
      return result;
    },
    entries.map(([name, bytes]) => [name, [...bytes]] as [string, number[]]),
  );
}

async function openWardrobe(page: Page) {
  await page
    .getByRole("button", { name: "Open wardrobe", exact: true })
    .click();
  await expect(
    page.getByLabel("Wardrobe identity", { exact: true }),
  ).toBeVisible();
}

test("wardrobe is opt-in, clothing preserves identity, and the composed skin retains all four actions", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.goto("/skin-studio.html");
  const original = await pixels(page);
  const flat = await download(page, info, "Save project ZIP", "flat.rig.zip");
  expect(
    JSON.parse(strFromU8(flat.files["project.json"])).wardrobe,
  ).toBeUndefined();
  await expect(
    page.getByLabel("Wardrobe identity", { exact: true }),
  ).toHaveCount(0);
  await openWardrobe(page);
  const wardrobeBefore = await download(
    page,
    info,
    "Save project ZIP",
    "wardrobe-before.rig.zip",
  );
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  expect(await pixels(page)).toBe(original);
  await expect(
    page.getByRole("button", { name: "Open wardrobe", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Redo edit", exact: true }).click();
  await page
    .getByLabel("Wardrobe top", { exact: true })
    .selectOption("soft-top");
  await page
    .getByLabel("Wardrobe bottom", { exact: true })
    .selectOption("short-skirt");
  await page
    .getByLabel("Wardrobe shoes", { exact: true })
    .selectOption("flats");
  const changed = await download(
    page,
    info,
    "Save project ZIP",
    "wardrobe-skirt.rig.zip",
  );
  const oldMetadata = JSON.parse(
    strFromU8(wardrobeBefore.files["project.json"]),
  );
  const newMetadata = JSON.parse(strFromU8(changed.files["project.json"]));
  expect(newMetadata.wardrobe).toMatchObject({
    identity: "crop",
    top: "soft-top",
    bottom: "short-skirt",
    shoes: "flats",
  });
  expect(newMetadata.wardrobe.colors).toEqual(oldMetadata.wardrobe.colors);
  expect(newMetadata.rig).toEqual(oldMetadata.rig);
  expect(newMetadata.motions).toEqual(oldMetadata.motions);
  const heads = [
    "slots/head-neutral.png",
    "slots/head-gentle.png",
    "slots/head-joyful.png",
    "slots/back-hair.png",
  ];
  expect(await decodedHashes(page, changed.files, heads)).toEqual(
    await decodedHashes(page, wardrobeBefore.files, heads),
  );
  expect(
    await decodedHashes(page, changed.files, ["slots/torso.png"]),
  ).not.toEqual(
    await decodedHashes(page, wardrobeBefore.files, ["slots/torso.png"]),
  );
  for (const [action, index] of [
    ["idle", 3],
    ["walk", 4],
    ["run", 4],
    ["jump", 6],
  ] as const) {
    await page.getByLabel("Action", { exact: true }).selectOption(action);
    const first = await pixels(page);
    await page
      .getByRole("button", {
        name: `Playback frame ${index}, pose ${action === "idle" ? 2 : index}`,
        exact: true,
      })
      .click();
    expect(
      await pixels(page),
      `${action} changes the composed artwork`,
    ).not.toBe(first);
  }
});

test("colors commit as one undo, names retain the recipe, and saved looks reopen exactly while stale imports preserve work", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.goto("/skin-studio.html");
  await openWardrobe(page);
  await page
    .getByLabel("Wardrobe identity", { exact: true })
    .selectOption("waves");
  const before = await pixels(page);
  const originalTop = await page
    .getByLabel("Top color", { exact: true })
    .inputValue();
  const originalSkin = await page
    .getByLabel("Skin color", { exact: true })
    .inputValue();
  await page.getByLabel("Top color", { exact: true }).fill("#367d70");
  await page.getByLabel("Skin color", { exact: true }).fill("#8f5b40");
  expect(await pixels(page)).toBe(before);
  await page.getByRole("button", { name: "Apply colors", exact: true }).click();
  const colored = await pixels(page);
  expect(colored).not.toBe(before);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  expect(await pixels(page)).toBe(before);
  await expect(page.getByLabel("Top color", { exact: true })).toHaveValue(
    originalTop,
  );
  await expect(page.getByLabel("Skin color", { exact: true })).toHaveValue(
    originalSkin,
  );
  await page.getByRole("button", { name: "Redo edit", exact: true }).click();
  expect(await pixels(page)).toBe(colored);
  await page.getByLabel("Top color", { exact: true }).fill("oops");
  await expect(
    page.getByRole("button", { name: "Apply colors", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Top color", { exact: true }).press("Escape");
  await page
    .getByLabel("Character name", { exact: true })
    .fill("Willow traveler");
  await page.getByLabel("Character name", { exact: true }).press("Tab");
  await expect(
    page.getByLabel("Wardrobe identity", { exact: true }),
  ).toHaveValue("waves");
  await page.getByLabel("Action", { exact: true }).selectOption("jump");
  await page.getByLabel("Facing", { exact: true }).selectOption("left");
  await page.getByLabel("Expression", { exact: true }).selectOption("joyful");
  const savedPixels = await pixels(page);
  const saved = await download(
    page,
    info,
    "Save project ZIP",
    "willow.rig.zip",
  );
  const project = JSON.parse(strFromU8(saved.files["project.json"]));
  expect(project.preview).toEqual({
    animation: "jump",
    facing: "left",
    expression: "joyful",
  });
  expect(project.wardrobe.colors).toMatchObject({
    skin: "#8f5b40",
    top: "#367d70",
  });
  await page
    .getByLabel("Wardrobe identity", { exact: true })
    .selectOption("crop");
  await page
    .getByLabel("Import project file", { exact: true })
    .setInputFiles(saved.path);
  await expect(page.locator(".skin-notice[role=status]")).toContainText(
    "project opened",
  );
  expect(await pixels(page)).toBe(savedPixels);
  await expect(page.getByLabel("Character name", { exact: true })).toHaveValue(
    "Willow traveler",
  );
  await expect(
    page.getByLabel("Wardrobe identity", { exact: true }),
  ).toHaveValue("waves");
  const reopened = await download(
    page,
    info,
    "Save project ZIP",
    "willow-reopened.rig.zip",
  );
  expect(JSON.parse(strFromU8(reopened.files["project.json"]))).toEqual(
    project,
  );
  expect(JSON.parse(strFromU8(reopened.files["skin.json"]))).toEqual(
    JSON.parse(strFromU8(saved.files["skin.json"])),
  );
  expect(await decodedHashes(page, reopened.files)).toEqual(
    await decodedHashes(page, saved.files),
  );
  const staleFiles = {
    ...saved.files,
    "project.json": strToU8(
      JSON.stringify({
        ...project,
        wardrobe: { ...project.wardrobe, top: "soft-top" },
      }),
    ),
  };
  await page
    .getByLabel("Import project file", { exact: true })
    .setInputFiles({
      name: "stale-recipe.rig.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zipSync(staleFiles)),
    });
  await expect(page.getByRole("alert")).toContainText(/wardrobe|recipe|match/i);
  expect(await pixels(page)).toBe(savedPixels);
  await expect(page.getByLabel("Wardrobe top", { exact: true })).toHaveValue(
    project.wardrobe.top,
  );
});

test("manual bindings and replacement PNGs detach the catalog without losing artwork, and undo restores the complete look", async ({
  page,
}, info) => {
  await page.goto("/skin-studio.html");
  await openWardrobe(page);
  const before = await pixels(page);
  await page.getByLabel("Offset X", { exact: true }).fill("1");
  await page.getByLabel("Offset X", { exact: true }).press("Enter");
  await expect(page.locator(".wardrobe-panel")).toContainText(
    "Custom artwork; open wardrobe",
  );
  expect(await pixels(page)).not.toBe(before);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  expect(await pixels(page)).toBe(before);
  await expect(
    page.getByLabel("Wardrobe identity", { exact: true }),
  ).toHaveValue("crop");
  const saved = await download(
    page,
    info,
    "Save skin ZIP",
    "replacement-source.skin.zip",
  );
  const replacement = await page.evaluate(
    async (bytes) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const rgba = ctx.getImageData(0, 0, 192, 256);
      for (let offset = 0; offset < rgba.data.length; offset += 4)
        if (rgba.data[offset + 3]) {
          rgba.data[offset] = 210;
          rgba.data[offset + 1] = 97;
          rgba.data[offset + 2] = 63;
        }
      ctx.putImageData(rgba, 0, 0);
      image.close();
      return canvas.toDataURL().split(",")[1];
    },
    [...saved.files["slots/torso.png"]],
  );
  await page
    .getByLabel("Replace attachment file", { exact: true })
    .setInputFiles({
      name: "custom-torso.png",
      mimeType: "image/png",
      buffer: Buffer.from(replacement, "base64"),
    });
  await expect(page.locator(".skin-notice[role=status]")).toContainText(
    "torso replaced",
  );
  await expect(page.locator(".wardrobe-panel")).toContainText(
    "Custom artwork; open wardrobe",
  );
  const customPixels = await pixels(page);
  expect(customPixels).not.toBe(before);
  const custom = await download(
    page,
    info,
    "Save project ZIP",
    "custom-detached.rig.zip",
  );
  expect(
    JSON.parse(strFromU8(custom.files["project.json"])).wardrobe,
  ).toBeUndefined();
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  expect(await pixels(page)).toBe(before);
  await expect(
    page.getByLabel("Wardrobe identity", { exact: true }),
  ).toHaveValue("crop");
  await page.getByRole("button", { name: "Redo edit", exact: true }).click();
  expect(await pixels(page)).toBe(customPixels);
  await expect(
    page.getByRole("button", { name: "Open wardrobe", exact: true }),
  ).toBeVisible();
});

test("a mixed wardrobe exports all decoded action frames and plays in both directions after the editor closes", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  await page.goto("/skin-studio.html");
  await openWardrobe(page);
  await page
    .getByLabel("Wardrobe identity", { exact: true })
    .selectOption("waves");
  await page
    .getByLabel("Wardrobe bottom", { exact: true })
    .selectOption("short-skirt");
  await page
    .getByLabel("Wardrobe shoes", { exact: true })
    .selectOption("flats");
  await page.getByLabel("Expression", { exact: true }).selectOption("joyful");
  const exported = await download(
    page,
    info,
    "Export CharacterPack",
    "wardrobe.character.zip",
  );
  const manifest = JSON.parse(strFromU8(exported.files["manifest.json"]));
  expect(Object.keys(manifest.animations)).toEqual([
    "idle",
    "walk",
    "run",
    "jump",
  ]);
  expect(manifest.frames).toHaveLength(36);
  expect(manifest.facing).toEqual({
    native: "right",
    right: "none",
    left: "mirror-x",
  });
  expect(manifest.anchor).toMatchObject({ x: 96, y: 240 });
  expect(manifest.animations.jump.loop).toBe(false);
  expect(strFromU8(exported.files["PROVENANCE.txt"])).toContain(
    "gathria-wardrobe-recipe",
  );
  const decoded = await page.evaluate(
    async ({ bytes, frames }) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      const checks = frames.map(
        (frame: { id: number; x: number; y: number }) => {
          ctx.clearRect(0, 0, 192, 256);
          ctx.drawImage(image, frame.x, frame.y, 192, 256, 0, 0, 192, 256);
          const rgba = ctx.getImageData(0, 0, 192, 256).data;
          let visible = 0,
            partial = 0,
            border = 0;
          for (let y = 0; y < 256; y++)
            for (let x = 0; x < 192; x++) {
              const alpha = rgba[(y * 192 + x) * 4 + 3];
              visible += Number(alpha > 0);
              partial += Number(alpha !== 0 && alpha !== 255);
              if (!x || x === 191 || !y || y === 255)
                border += Number(alpha > 0);
            }
          return { id: frame.id, visible, partial, border };
        },
      );
      const dimensions = [image.width, image.height];
      image.close();
      return { checks, dimensions };
    },
    { bytes: [...exported.files["spritesheet.png"]], frames: manifest.frames },
  );
  expect(decoded.dimensions).toEqual([1536, 1536]);
  for (const frame of decoded.checks) {
    expect(frame.visible, `frame ${frame.id}`).toBeGreaterThan(1000);
    expect(frame.partial).toBe(0);
    expect(frame.border).toBe(0);
  }
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
  for (const facing of ["Right", "Left"] as const)
    for (const action of ["idle", "walk", "run", "jump"] as const) {
      await player.getByRole("button", { name: facing, exact: true }).click();
      await player
        .getByRole("button", {
          name: action[0].toUpperCase() + action.slice(1),
          exact: true,
        })
        .click();
      const firstId = manifest.animations[action].frames[0];
      await expect(canvas).toHaveAttribute(
        "aria-label",
        new RegExp(
          `${action}, facing ${facing.toLowerCase()}, frame ${firstId}$`,
        ),
      );
      await painted(player);
      const same = await canvas.evaluate(
        async (element: HTMLCanvasElement, { bytes, frame, facing }) => {
          const image = await createImageBitmap(
            new Blob([new Uint8Array(bytes)], { type: "image/png" }),
          );
          const expected = document.createElement("canvas");
          expected.width = element.width;
          expected.height = element.height;
          const ctx = expected.getContext("2d")!;
          const x = Math.round(element.width / 2),
            y = Math.floor((element.height - 256) / 2) + 240;
          ctx.strokeStyle = "#c7c4d1";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 5]);
          ctx.beginPath();
          ctx.moveTo(24, y + 0.5);
          ctx.lineTo(element.width - 24, y + 0.5);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(facing === "Left" ? -1 : 1, 1);
          ctx.drawImage(image, frame.x, frame.y, 192, 256, -96, -240, 192, 256);
          ctx.restore();
          ctx.strokeStyle = "#7762d6";
          ctx.beginPath();
          ctx.moveTo(x - 5, y + 0.5);
          ctx.lineTo(x + 5, y + 0.5);
          ctx.moveTo(x + 0.5, y - 5);
          ctx.lineTo(x + 0.5, y + 5);
          ctx.stroke();
          image.close();
          return expected.toDataURL() === element.toDataURL();
        },
        {
          bytes: [...exported.files["spritesheet.png"]],
          frame: manifest.frames.find(
            (frame: { id: number }) => frame.id === firstId,
          ),
          facing,
        },
      );
      expect(
        same,
        `${action}/${facing} draws exported pixels at the saved anchor`,
      ).toBe(true);
      await player
        .getByRole("button", { name: "Play animation", exact: true })
        .click();
      await expect
        .poll(() => canvas.getAttribute("aria-label"))
        .not.toContain(`frame ${firstId}`);
      await player
        .getByRole("button", { name: "Pause animation", exact: true })
        .click();
    }
  expect(forbidden).toEqual([]);
  expect(errors).toEqual([]);
});
