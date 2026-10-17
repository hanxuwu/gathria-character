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
async function open(page: Page) {
  await page.goto("/skin-studio.html");
  await page
    .getByRole("button", { name: "Open wardrobe", exact: true })
    .click();
}
async function template(page: Page, info: TestInfo, group: string, id: string) {
  await page
    .getByLabel("Item template group", { exact: true })
    .selectOption(group);
  const saved = await download(
    page,
    info,
    "Download item template",
    `${id}-template.wardrobe.zip`,
  );
  const item = JSON.parse(strFromU8(saved.files["item.json"]));
  item.id = id;
  item.name = `Test ${group} item`;
  item.provenance =
    "Browser regression fixture derived from the app's registered V6 wardrobe template; no generated replacement artwork.";
  saved.files["item.json"] = strToU8(JSON.stringify(item));
  return { ...saved, item };
}
async function importItem(
  page: Page,
  files: Record<string, Uint8Array>,
  name = "custom.wardrobe.zip",
) {
  await page
    .getByLabel("Import clothing ZIP file", { exact: true })
    .setInputFiles({
      name,
      mimeType: "application/zip",
      buffer: Buffer.from(zipSync(files)),
    });
}
async function recolorTorsoDetail(
  page: Page,
  files: Record<string, Uint8Array>,
) {
  const changed = await page.evaluate(
    async ({ artwork, mask }) => {
      async function decode(bytes: number[]) {
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
          canvas,
          ctx,
          data: ctx.getImageData(0, 0, canvas.width, canvas.height),
        };
      }
      const art = await decode(artwork),
        semantic = await decode(mask);
      let count = 0;
      for (let y = 138; y < 151; y++)
        for (let x = 81; x < 91; x++) {
          const offset = (y * 192 + x) * 4;
          if (art.data.data[offset + 3] && semantic.data.data[offset] === 3) {
            art.data.data.set([225, 190, 112, 255], offset);
            semantic.data.data.set([0, 0, 0, 255], offset);
            count++;
          }
        }
      art.ctx.putImageData(art.data, 0, 0);
      semantic.ctx.putImageData(semantic.data, 0, 0);
      return {
        art: art.canvas.toDataURL().split(",")[1],
        mask: semantic.canvas.toDataURL().split(",")[1],
        count,
      };
    },
    {
      artwork: [...files["artwork/torso.png"]],
      mask: [...files["masks/torso.png"]],
    },
  );
  expect(changed.count).toBeGreaterThan(20);
  files["artwork/torso.png"] = Buffer.from(changed.art, "base64");
  files["masks/torso.png"] = Buffer.from(changed.mask, "base64");
}
async function decodedHashes(page: Page, files: Record<string, Uint8Array>) {
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
        const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        result[name] =
          `${canvas.width}x${canvas.height}:` +
          [...new Uint8Array(await crypto.subtle.digest("SHA-256", rgba))]
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("");
        image.close();
      }
      return result;
    },
    Object.entries(files)
      .filter(([name]) => name.endsWith(".png"))
      .map(([name, bytes]) => [name, [...bytes]] as [string, number[]]),
  );
}

test("custom clothing imports atomically, keeps identity and motions, and reopens with its portable library", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await open(page);
  const original = await pixels(page);
  const before = await download(
    page,
    info,
    "Save project ZIP",
    "before.rig.zip",
  );
  const custom = await template(page, info, "top", "custom-browser-top");
  await recolorTorsoDetail(page, custom.files);
  await importItem(page, custom.files);
  await expect(page.getByLabel("Wardrobe top", { exact: true })).toHaveValue(
    custom.item.id,
  );
  const after = await pixels(page);
  expect(after).not.toBe(original);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  expect(await pixels(page)).toBe(original);
  await expect(
    page
      .getByLabel("Wardrobe top", { exact: true })
      .locator(`option[value="${custom.item.id}"]`),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Redo edit", exact: true }).click();
  expect(await pixels(page)).toBe(after);
  const imported = await download(
    page,
    info,
    "Save project ZIP",
    "imported.rig.zip",
  );
  const oldProject = JSON.parse(strFromU8(before.files["project.json"]));
  const project = JSON.parse(strFromU8(imported.files["project.json"]));
  expect(project.wardrobe).toMatchObject({
    version: 2,
    identity: "crop",
    top: custom.item.id,
  });
  expect(project.rig).toEqual(oldProject.rig);
  expect(project.motions).toEqual(oldProject.motions);
  const oldPng = await decodedHashes(page, before.files),
    newPng = await decodedHashes(page, imported.files);
  for (const head of ["head-neutral", "head-gentle", "head-joyful"])
    expect(newPng[`slots/${head}.png`]).toBe(oldPng[`slots/${head}.png`]);
  expect(
    JSON.parse(strFromU8(imported.files["wardrobe.json"])).items,
  ).toHaveLength(1);
  await page
    .getByLabel("Wardrobe identity", { exact: true })
    .selectOption("waves");
  await page.getByLabel("Top color", { exact: true }).fill("#75967e");
  await page.getByLabel("Skin color", { exact: true }).fill("#8f5b40");
  await page.getByRole("button", { name: "Apply colors", exact: true }).click();
  await page.getByLabel("Expression", { exact: true }).selectOption("joyful");
  for (const action of ["idle", "walk", "run", "jump"]) {
    await page.getByLabel("Action", { exact: true }).selectOption(action);
    const first = await pixels(page);
    await page
      .getByLabel("Animation frame", { exact: true })
      .fill(action === "idle" ? "2" : "5");
    expect(await pixels(page), `${action} moves imported clothing`).not.toBe(
      first,
    );
  }
  await page.getByLabel("Facing", { exact: true }).selectOption("left");
  const savedPixels = await pixels(page);
  const saved = await download(
    page,
    info,
    "Save project ZIP",
    "portable.rig.zip",
  );
  await page.reload();
  await page
    .getByLabel("Import project file", { exact: true })
    .setInputFiles(saved.path);
  await expect(page.getByLabel("Wardrobe top", { exact: true })).toHaveValue(
    custom.item.id,
  );
  await expect(
    page.getByLabel("Wardrobe identity", { exact: true }),
  ).toHaveValue("waves");
  await expect(page.getByLabel("Expression", { exact: true })).toHaveValue(
    "joyful",
  );
  await expect(page.getByLabel("Action", { exact: true })).toHaveValue("jump");
  await expect(page.getByLabel("Facing", { exact: true })).toHaveValue("left");
  // Timeline position is intentionally transient; the saved action/facing is restored.
  await page.getByLabel("Animation frame", { exact: true }).fill("5");
  expect(await pixels(page)).toBe(savedPixels);
  const reopened = await download(
    page,
    info,
    "Save project ZIP",
    "reopened.rig.zip",
  );
  for (const file of ["project.json", "skin.json", "wardrobe.json"])
    expect(JSON.parse(strFromU8(reopened.files[file]))).toEqual(
      JSON.parse(strFromU8(saved.files[file])),
    );
  expect(await decodedHashes(page, reopened.files)).toEqual(
    await decodedHashes(page, saved.files),
  );
  await page.getByLabel("Offset X", { exact: true }).fill("1");
  await page.getByLabel("Offset X", { exact: true }).press("Enter");
  await expect(
    page.getByRole("button", { name: "Open wardrobe", exact: true }),
  ).toBeVisible();
  const detached = await download(
    page,
    info,
    "Save project ZIP",
    "detached.rig.zip",
  );
  expect(
    JSON.parse(strFromU8(detached.files["project.json"])).wardrobe,
  ).toBeUndefined();
  expect(
    JSON.parse(strFromU8(detached.files["wardrobe.json"])).items,
  ).toHaveLength(1);
  await page
    .getByRole("button", { name: "Open wardrobe", exact: true })
    .click();
  await expect(
    page.getByLabel("Wardrobe identity", { exact: true }),
  ).toHaveValue("waves");
  await expect(
    page
      .getByLabel("Wardrobe top", { exact: true })
      .locator(`option[value="${custom.item.id}"]`),
  ).toHaveCount(1);
});

test("bottom and shoe items roundtrip; duplicate, corrupt, and unsupported imports leave work intact; only unused items can be removed", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await open(page);
  const bottom = await template(page, info, "bottom", "custom-browser-bottom");
  await importItem(page, bottom.files);
  await expect(page.getByLabel("Wardrobe bottom", { exact: true })).toHaveValue(
    bottom.item.id,
  );
  const shoe = await template(page, info, "shoes", "custom-browser-shoes");
  await importItem(page, shoe.files);
  await expect(page.getByLabel("Wardrobe shoes", { exact: true })).toHaveValue(
    shoe.item.id,
  );
  const before = await pixels(page);
  for (const [files, message] of [
    [shoe.files, /already|duplicate|exists/i],
    [
      {
        ...bottom.files,
        "item.json": strToU8(
          JSON.stringify({
            ...bottom.item,
            id: "custom-future",
            group: "cape",
          }),
        ),
      },
      /group|unsupported/i,
    ],
    [
      { ...bottom.files, "artwork/near-leg.png": new Uint8Array([1, 2, 3]) },
      /PNG|decode|image/i,
    ],
  ] as [Record<string, Uint8Array>, RegExp][]) {
    await importItem(page, files);
    await expect(page.getByRole("alert")).toContainText(message);
    expect(await pixels(page)).toBe(before);
    await expect(
      page.getByLabel("Wardrobe bottom", { exact: true }),
    ).toHaveValue(bottom.item.id);
    await expect(
      page.getByLabel("Wardrobe shoes", { exact: true }),
    ).toHaveValue(shoe.item.id);
  }
  const remove = page.getByRole("button", {
    name: `Remove ${shoe.item.name}`,
    exact: true,
  });
  await expect(remove).toBeDisabled();
  await page
    .getByLabel("Wardrobe shoes", { exact: true })
    .selectOption("flats");
  const noShoe = await pixels(page);
  await remove.click();
  await expect(
    page
      .getByLabel("Wardrobe shoes", { exact: true })
      .locator(`option[value="${shoe.item.id}"]`),
  ).toHaveCount(0);
  expect(await pixels(page)).toBe(noShoe);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await expect(
    page
      .getByLabel("Wardrobe shoes", { exact: true })
      .locator(`option[value="${shoe.item.id}"]`),
  ).toHaveCount(1);
  expect(await pixels(page)).toBe(noShoe);
  await page.getByRole("button", { name: "Redo edit", exact: true }).click();
  await expect(remove).toHaveCount(0);
  const saved = await download(
    page,
    info,
    "Save project ZIP",
    "remaining-library.rig.zip",
  );
  expect(
    JSON.parse(strFromU8(saved.files["wardrobe.json"])).items.map(
      (item: { id: string }) => item.id,
    ),
  ).toEqual([bottom.item.id]);
});

test("an imported clothing look exports every action and plays independently after the editor closes", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  await open(page);
  const custom = await template(page, info, "top", "custom-player-top");
  await recolorTorsoDetail(page, custom.files);
  await importItem(page, custom.files);
  await expect(page.getByLabel("Wardrobe top", { exact: true })).toHaveValue(
    custom.item.id,
  );
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
