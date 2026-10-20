import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  decodeSourceRgbaPng,
  encodeSourceRgbaPng,
} from "../../src/core/baked-source";

const width = 32;
const height = 48;
const actionNames = ["idle", "walk", "run", "celebrate"] as const;
/** Small synthetic fixture tests the archive contract; it is not visual evidence. */
function sourceFixture(broken = false) {
  const files: Record<string, Uint8Array> = {};
  const actions = Object.fromEntries(
    actionNames.map((action, n) => [
      `${action}_loop`,
      {
        frames: 3,
        fps: [4, 6, 8, 10][n],
        loop: true,
        repeat: -1,
        selection_strategy: "fixture",
        frame_template: `characters/{character}/layers/body_composite/${action}_loop/{frame:03d}.png`,
      },
    ]),
  );
  files["manifest.json"] = strToU8(
    JSON.stringify({
      name: "Source fixture",
      format: "Gathria Unified CharacterPack",
      version: "1.0.0",
      contract: "characterpack-v1",
      render_mode: "baked_composite",
      canvas: {
        width,
        height,
        ground_y: 44,
        coordinate_origin: "top-left",
        orientation: "right_3q",
      },
      characters: ["male", "female"],
      actions,
    }),
  );
  for (const [person, id] of ["male", "female"].entries()) {
    files[`characters/${id}/meta.json`] = strToU8(
      JSON.stringify({
        id,
        name: person ? "Female fixture" : "Male fixture",
        visual_mode: "baked_composite",
        schema_version: "1.0.0",
        actions: Object.fromEntries(
          actionNames.map((action) => [
            `${action}_loop`,
            {
              config: `actions/${action}_loop.json`,
              frames_dir: `layers/body_composite/${action}_loop`,
              count: 3,
            },
          ]),
        ),
      }),
    );
    for (const [a, action] of actionNames.entries()) {
      const frames = [];
      for (let i = 0; i < 3; i++) {
        const pixels = new Uint8Array(width * height * 4);
        // Repeated frame 1 is an intentional hold; scrub must show its sequence position.
        for (let y = 5; y < 44; y++)
          for (let x = 8; x < 20 + (i === 2 ? 4 : 0); x++) {
            const offset = (y * width + x) * 4;
            pixels.set(
              [person ? 210 : 90, 70 + a * 30, 130, x === 8 ? 128 : 255],
              offset,
            );
          }
        const image = `layers/body_composite/${action}_loop/${String(i).padStart(3, "0")}.png`;
        files[`characters/${id}/${image}`] = encodeSourceRgbaPng({
          width,
          height,
          pixels,
          colorChunks: [],
        });
        frames.push({
          i,
          image,
          source_action: action,
          source_video_frame: a * 3 + i,
          source_index: i,
          source_time_s: (a * 3 + i) / 30,
          anchors: { ground: { x: 16, y: 44 }, head: { x: 16, y: 5 } },
        });
      }
      files[`characters/${id}/actions/${action}_loop.json`] = strToU8(
        JSON.stringify({
          name: `${action}_loop`,
          fps: actions[`${action}_loop`].fps,
          loop: true,
          repeat: -1,
          frames,
        }),
      );
    }
  }
  if (broken)
    delete files["characters/female/layers/body_composite/run_loop/002.png"];
  return { buffer: Buffer.from(zipSync(files)), files };
}

for (const withoutSubtle of [false, true]) {
  test(`source pair → same-clock playback → native V2 export → independent reopen preserves source pixels (${withoutSubtle ? "without Web Crypto" : "Web Crypto"})`, async ({
    page,
    context,
  }, testInfo) => {
    if (withoutSubtle) {
      await context.addInitScript(() => {
        Object.defineProperty(globalThis.crypto, "subtle", {
          value: undefined,
        });
      });
    }
    const source = sourceFixture();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/player.html");
    expect(await page.evaluate(() => !!globalThis.crypto?.subtle)).toBe(
      !withoutSubtle,
    );
    await page.locator("#player-zip").setInputFiles({
      name: "source.zip",
      mimeType: "application/zip",
      buffer: source.buffer,
    });
    await expect(page.getByRole("status")).toContainText(
      "Loaded: Male fixture",
    );
    await expect(
      page.getByText("Original artwork · baked playback", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Display scale", { exact: true })).toHaveValue(
      "1",
    );
    await expect(
      page.getByRole("button", { name: "Jump", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Pause animation", exact: true })
      .click();
    await page.getByRole("button", { name: "Celebrate", exact: true }).click();
    const canvas = page.getByTestId("consumer-canvas");
    const firstId = await canvas.getAttribute("data-frame-id");
    await page.locator("#player-frame").fill("1");
    await expect(canvas).toHaveAttribute("data-frame-position", "1");
    await expect(canvas).toHaveAttribute("data-frame-id", firstId!);
    const paused = await canvas.evaluate((c: HTMLCanvasElement) =>
      c.toDataURL(),
    );
    await page.waitForTimeout(150);
    expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(
      paused,
    );
    await page.getByRole("button", { name: "Left", exact: true }).click();
    await expect(canvas).toHaveAttribute(
      "aria-label",
      /celebrate, facing left/,
    );
    expect(
      await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()),
    ).not.toBe(paused);
    await page.getByLabel("Compare both characters", { exact: true }).check();
    await expect(canvas).toHaveAttribute("data-comparison", "true");
    await expect(page.getByText(/Shared elapsed time/)).toBeVisible();
    await page.getByLabel("Character", { exact: true }).selectOption("female");
    await expect(page.getByRole("status")).toContainText(
      "Loaded: Female fixture",
    );
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await page.locator("#player-frame").fill("2");
    await expect(canvas).toHaveAttribute("data-frame-position", "2");
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Export selected CharacterPack",
        exact: true,
      })
      .click();
    const download = await downloadPromise;
    const path = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(path);
    const pack = unzipSync(new Uint8Array(await readFile(path)));
    const manifest = JSON.parse(Buffer.from(pack["manifest.json"]).toString());
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.capabilities).toEqual({
      renderMode: "baked",
      editableAppearance: false,
    });
    expect(manifest.scale.pixelArt).toBe(false);
    expect(manifest.spritesheet.frameWidth).toBe(width);
    expect(manifest.spritesheet.frameHeight).toBe(height);
    const atlas = decodeSourceRgbaPng(pack["spritesheet.png"]);
    for (const action of actionNames) {
      const animation = manifest.animations[action];
      expect(animation.frames).toHaveLength(3);
      for (let i = 0; i < animation.frames.length; i++) {
        const frame = manifest.frames.find(
          (candidate: { id: number }) => candidate.id === animation.frames[i],
        );
        const original = decodeSourceRgbaPng(
          source.files[
            `characters/female/layers/body_composite/${action}_loop/${String(i).padStart(3, "0")}.png`
          ],
        );
        for (let row = 0; row < height; row++) {
          const offset = ((frame.y + row) * atlas.width + frame.x) * 4;
          expect(atlas.pixels.slice(offset, offset + width * 4)).toEqual(
            original.pixels.slice(row * width * 4, (row + 1) * width * 4),
          );
        }
      }
    }
    const recipe = JSON.parse(Buffer.from(pack["character.json"]).toString());
    expect(recipe.format).toBe("gathria-baked-character");
    expect(recipe.characterId).toBe("female");
    await page.close();
    // No editor and no source bundle remain open. The exported files are sufficient.
    const independent = await context.newPage();
    const forbidden: string[] = [];
    await independent.route(
      /\/src\/(?:skeletal\/|editor\/|experiments\/|core\/(?:generator|illustrated-))/,
      (route) => {
        forbidden.push(route.request().url());
        return route.abort();
      },
    );
    independent.on("pageerror", (error) => errors.push(error.message));
    await independent.goto("/player.html");
    await independent.locator("#player-zip").setInputFiles(path);
    await expect(independent.getByRole("status")).toContainText(
      "Loaded: Female fixture",
    );
    await expect(
      independent.getByLabel("Character", { exact: true }),
    ).toHaveCount(0);
    await expect(independent.getByTestId("consumer-canvas")).toHaveCSS(
      "image-rendering",
      "auto",
    );
    for (const action of ["Idle", "Walk", "Run", "Celebrate"]) {
      await independent
        .getByRole("button", { name: action, exact: true })
        .click();
      for (const direction of ["Left", "Right"]) {
        await independent
          .getByRole("button", { name: direction, exact: true })
          .click();
        await expect(
          independent.getByTestId("consumer-canvas"),
        ).toHaveAttribute(
          "aria-label",
          new RegExp(
            `${action.toLowerCase()}, facing ${direction.toLowerCase()}`,
          ),
        );
      }
    }
    const independentCanvas = independent.getByTestId("consumer-canvas");
    const beforeAdvance = await independentCanvas.evaluate(
      (canvas: HTMLCanvasElement) => canvas.toDataURL(),
    );
    // Observe on browser paint ticks: sparse timer polling can repeatedly sample
    // the same held pose in this 300 ms loop even while playback is advancing.
    await independent.waitForFunction(
      ({ canvas, previous }) =>
        canvas instanceof HTMLCanvasElement && canvas.toDataURL() !== previous,
      {
        canvas: await independentCanvas.elementHandle(),
        previous: beforeAdvance,
      },
      { polling: "raf", timeout: 5000 },
    );
    await independent
      .getByLabel("Display scale", { exact: true })
      .selectOption("0.5");
    expect(forbidden).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("incomplete source is rejected without replacing a loaded legacy character", async ({
  page,
}) => {
  await page.goto("/player.html");
  await page
    .getByRole("button", {
      name: "Try Mira’s example pack · original Art V1",
      exact: true,
    })
    .click();
  await expect(page.getByRole("status")).toContainText("Loaded: Mira");
  await expect(page.getByTestId("consumer-canvas")).toHaveCSS(
    "image-rendering",
    "pixelated",
  );
  await expect(page.getByLabel("Pixel scale", { exact: true })).toHaveValue(
    "4",
  );
  await expect(
    page.getByRole("button", { name: "Celebrate", exact: true }),
  ).toHaveCount(0);
  await page.locator("#player-zip").setInputFiles({
    name: "incomplete-source.zip",
    mimeType: "application/zip",
    buffer: sourceFixture(true).buffer,
  });
  await expect(page.getByRole("alert")).toContainText("Missing source frame");
  await expect(page.getByRole("status")).toContainText("Loaded: Mira");
  await expect(page.getByTestId("consumer-canvas")).toHaveAttribute(
    "aria-label",
    /Mira/,
  );
});

function jumpingSourceFixture() {
  const { files } = sourceFixture();
  const parse = (path: string) =>
    JSON.parse(Buffer.from(files[path]).toString());
  const encode = (path: string, value: unknown) => {
    files[path] = strToU8(JSON.stringify(value));
  };
  const manifest = parse("manifest.json");
  manifest.actions.jump_once = {
    ...manifest.actions.idle_loop,
    loop: false,
    repeat: 0,
    frame_template:
      "characters/{character}/layers/body_composite/jump_once/{frame:03d}.png",
  };
  encode("manifest.json", manifest);
  for (const id of ["male", "female"]) {
    const metaPath = `characters/${id}/meta.json`;
    const meta = parse(metaPath);
    meta.actions.jump_once = {
      config: "actions/jump_once.json",
      frames_dir: "layers/body_composite/jump_once",
      count: 3,
    };
    encode(metaPath, meta);
    const clip = parse(`characters/${id}/actions/idle_loop.json`);
    clip.name = "jump_once";
    clip.loop = false;
    clip.repeat = 0;
    for (const frame of clip.frames) {
      const previous = frame.image;
      frame.image = previous.replace("idle_loop", "jump_once");
      frame.source_action = "jump";
      frame.source_video_frame += 40;
      frame.source_time_s = frame.source_video_frame / 30;
      files[`characters/${id}/${frame.image}`] =
        files[`characters/${id}/${previous}`];
    }
    encode(`characters/${id}/actions/jump_once.json`, clip);
  }
  return Buffer.from(zipSync(files));
}

test("optional source jump plays once, exports its timing, compares both characters and replays without Web Crypto", async ({
  page,
  context,
}, testInfo) => {
  await context.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, "subtle", { value: undefined });
  });
  await page.goto("/player.html");
  await page.locator("#player-zip").setInputFiles({
    name: "jump-source.zip",
    mimeType: "application/zip",
    buffer: jumpingSourceFixture(),
  });
  await expect(page.getByRole("status")).toContainText("Loaded: Male fixture");
  await page.getByLabel("Compare both characters", { exact: true }).check();
  const canvas = page.getByTestId("consumer-canvas");
  await expect(canvas).toHaveAttribute("data-comparison", "true");
  await page.getByRole("button", { name: "Jump", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Replay animation", exact: true }),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute("data-frame-position", "2");
  await expect(page.locator("#player-one-shot-note")).toContainText(
    "Holding the final frame",
  );
  const final = await canvas.evaluate((node: HTMLCanvasElement) =>
    node.toDataURL(),
  );
  await page.waitForTimeout(200);
  expect(
    await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()),
  ).toBe(final);
  await page
    .getByRole("button", { name: "Replay animation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause animation", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await page.locator("#player-frame").fill("0");
  await expect(canvas).toHaveAttribute("data-frame-position", "0");
  await page.getByRole("button", { name: "Left", exact: true }).click();
  await expect(canvas).toHaveAttribute("aria-label", /jump, facing left/);
  await page.getByLabel("Character", { exact: true }).selectOption("female");
  await expect(page.getByRole("status")).toContainText(
    "Loaded: Female fixture",
  );
  await expect(
    page.getByRole("button", { name: "Jump", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export selected CharacterPack", exact: true })
    .click();
  const download = await pending;
  const path = testInfo.outputPath("jump.character.zip");
  await download.saveAs(path);
  const files = unzipSync(await readFile(path));
  const manifest = JSON.parse(Buffer.from(files["manifest.json"]).toString());
  expect(manifest.animations.jump).toMatchObject({ fps: 4, loop: false });
  expect(manifest.animations.jump.frames).toHaveLength(3);
  await page.close();
  const independent = await context.newPage();
  await independent.goto("/player.html");
  await independent.locator("#player-zip").setInputFiles(path);
  await expect(independent.getByRole("status")).toContainText(
    "Loaded: Female fixture",
  );
  await independent.getByRole("button", { name: "Jump", exact: true }).click();
  await expect(
    independent.getByRole("button", { name: "Replay animation", exact: true }),
  ).toBeVisible();
  await independent.getByRole("button", { name: "Walk", exact: true }).click();
  await expect(
    independent.getByRole("button", { name: "Pause animation", exact: true }),
  ).toBeVisible();
  await expect(independent.getByTestId("consumer-canvas")).toHaveAttribute(
    "aria-label",
    /walk, facing right/,
  );
});

/** Two tiny native pages exercise storage and rendering, not character artwork quality. */
async function multipageJumpFixture() {
  const { createBakedCharacterPack } = await import("../../src/core/pack");
  const primary = new Uint8Array(width * height * 4);
  const jump = new Uint8Array(width * 3 * height * 4);
  for (let y = 5; y < 44; y++) {
    for (let x = 8; x < 20; x++) {
      primary.set([40, 160, 70, 255], (y * width + x) * 4);
      for (let frame = 0; frame < 3; frame++) {
        jump.set(
          [220, 70 + frame * 30, 130, 255],
          (y * width * 3 + frame * width + x + frame * 2) * 4,
        );
      }
    }
  }
  const sheet = {
    file: "spritesheet.png" as const,
    width,
    height,
    frameWidth: width,
    frameHeight: height,
    columns: 1,
    rows: 1,
  };
  const manifest: import("../../src/core/types").CharacterPackV3Manifest = {
    schemaVersion: 3,
    format: "gathria-character-pack",
    name: "Native paged jump",
    generator: "e2e-fixture",
    spritesheet: sheet,
    additionalSheets: [
      { ...sheet, file: "spritesheet-1.png", width: width * 3, columns: 3 },
    ],
    frames: [
      { id: 0, page: 0, x: 0, y: 0, width, height },
      ...[0, 1, 2].map((i) => ({
        id: i + 1,
        page: 1,
        x: i * width,
        y: 0,
        width,
        height,
      })),
    ],
    animations: {
      idle: { frames: [0], fps: 1, loop: true },
      walk: { frames: [0], fps: 1, loop: true },
      jump: { frames: [1, 2, 3], fps: 4, loop: false },
      celebrate: { frames: [1, 3], fps: 2, loop: true },
    },
    facing: { native: "right", right: "none", left: "mirror-x" },
    anchor: { x: 16, y: 44, units: "pixels", origin: "top-left" },
    scale: { pixelArt: false, integerOnly: false, recommended: 1 },
    configuration: "character.json",
    capabilities: { renderMode: "baked", editableAppearance: false },
  };
  const recipe: import("../../src/core/types").BakedCharacterRecipe = {
    schemaVersion: 1,
    format: "gathria-baked-character",
    name: manifest.name,
    characterId: "fixture",
    source: {
      kind: "unified-archive",
      name: "Synthetic fixture",
      sha256: "c".repeat(64),
    },
    provenance: "Synthetic contract fixture; not character artwork evidence.",
    derivation: {
      method: "fixture",
      frames: manifest.frames.map((frame) => ({
        frameId: frame.id,
        sourceFrame: frame.id,
        timeSeconds: frame.id / 4,
      })),
    },
  };
  const png = (pixels: Uint8Array, columns: number) =>
    new Blob([
      new Uint8Array(
        encodeSourceRgbaPng({
          pixels,
          width: width * columns,
          height,
          colorChunks: [],
        }),
      ),
    ]);
  return Buffer.from(
    await (
      await createBakedCharacterPack(recipe, manifest, png(primary, 1), [
        png(jump, 3),
      ])
    ).arrayBuffer(),
  );
}

test("independent native multipage pack draws the jump page, holds landing, mirrors, scrubs and reexports all pages", async ({
  page,
}, testInfo) => {
  const forbidden: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(
    /\/src\/(?:skeletal\/|editor\/|experiments\/|core\/(?:generator|illustrated-))/,
    (route) => {
      forbidden.push(route.request().url());
      return route.abort();
    },
  );
  const input = await multipageJumpFixture();
  await page.goto("/player.html");
  await page.locator("#player-zip").setInputFiles({
    name: "multipage.character.zip",
    mimeType: "application/zip",
    buffer: input,
  });
  await expect(page.getByRole("status")).toContainText(
    "Loaded: Native paged jump",
  );
  const canvas = page.getByTestId("consumer-canvas");
  await expect(canvas).toHaveCSS("image-rendering", "auto");
  await expect(canvas).toHaveAttribute("data-frame-page", "0");
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await page.getByRole("button", { name: "Jump", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-frame-page", "1");
  const countRed = await canvas.evaluate((node: HTMLCanvasElement) => {
    const pixels = node
      .getContext("2d")!
      .getImageData(0, 0, node.width, node.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] === 220 && pixels[i + 1] === 70 && pixels[i + 2] === 130)
        count++;
    return count;
  });
  expect(countRed).toBeGreaterThan(100);
  const right = await canvas.evaluate((node: HTMLCanvasElement) =>
    node.toDataURL(),
  );
  await page.getByRole("button", { name: "Left", exact: true }).click();
  expect(
    await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()),
  ).not.toBe(right);
  await page.locator("#player-frame").fill("2");
  await expect(canvas).toHaveAttribute("data-frame-id", "3");
  await page
    .getByRole("button", { name: "Play animation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Replay animation", exact: true }),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute("data-frame-id", "3");
  await page.waitForTimeout(200);
  await expect(canvas).toHaveAttribute("data-frame-id", "3");
  await page
    .getByRole("button", { name: "Replay animation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause animation", exact: true }),
  ).toBeVisible();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export selected CharacterPack", exact: true })
    .click();
  const download = await pending;
  const path = testInfo.outputPath("multipage.character.zip");
  await download.saveAs(path);
  const output = unzipSync(await readFile(path));
  const original = unzipSync(input);
  for (const file of [
    "spritesheet.png",
    "spritesheet-1.png",
    "manifest.json",
    "character.json",
  ]) {
    expect(output[file]).toEqual(original[file]);
  }
  await page.getByRole("button", { name: "Idle", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-frame-page", "0");
  expect(forbidden).toEqual([]);
  expect(errors).toEqual([]);
});

/** Tiny stand-ins exercise loading policy, not the appearance of the originals. */
async function preparedKlingFixture(id: "male" | "female") {
  const files = unzipSync(await multipageJumpFixture());
  const manifest = JSON.parse(Buffer.from(files["manifest.json"]).toString());
  const recipe = JSON.parse(Buffer.from(files["character.json"]).toString());
  manifest.name = recipe.name = `Prepared ${id} fixture`;
  manifest.animations.run = { frames: [1, 2, 3], fps: 4, loop: true };
  recipe.characterId = id;
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  files["character.json"] = strToU8(JSON.stringify(recipe));
  return Buffer.from(zipSync(files));
}

test("prepared Kling originals defer the second download, release comparison cache and export the original archive", async ({
  page,
}, testInfo) => {
  const fixtures = {
    male: await preparedKlingFixture("male"),
    female: await preparedKlingFixture("female"),
  };
  const downloads: string[] = [];
  const sourceRequests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/artwork/**/kling-source.zip*", (route) => {
    sourceRequests.push(route.request().url());
    return route.abort();
  });
  await page.route(
    /\/docs\/kling-jump\/exports\/(male|female)\.character\.zip(?:\?.*)?$/,
    async (route) => {
      const id = route.request().url().includes("/female.") ? "female" : "male";
      downloads.push(id);
      await route.fulfill({
        body: fixtures[id],
        contentType: "application/zip",
      });
    },
  );
  await page.goto("/player.html");
  expect(downloads).toEqual([]);
  await page
    .getByRole("button", { name: /Try the Kling character pair/ })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Loaded: Prepared male fixture",
  );
  expect(downloads).toEqual(["male"]);
  for (const name of ["Idle", "Walk", "Run", "Jump", "Celebrate"])
    await expect(page.getByRole("button", { name, exact: true })).toBeEnabled();

  await page.getByLabel("Character", { exact: true }).selectOption("female");
  await expect(page.getByRole("status")).toContainText(
    "Loaded: Prepared female fixture",
  );
  expect(downloads).toEqual(["male", "female"]);
  await page.getByLabel("Character", { exact: true }).selectOption("male");
  await expect(page.getByRole("status")).toContainText(
    "Loaded: Prepared male fixture",
  );
  // Inactive decoded characters are not retained after selecting a replacement.
  expect(downloads).toEqual(["male", "female", "male"]);

  const canvas = page.getByTestId("consumer-canvas");
  await page.getByLabel("Compare both characters", { exact: true }).check();
  await expect(canvas).toHaveAttribute("data-comparison", "true");
  expect(downloads).toEqual(["male", "female", "male", "female"]);
  await page.getByLabel("Compare both characters", { exact: true }).uncheck();
  await expect(canvas).toHaveAttribute("data-comparison", "false");
  await page.getByLabel("Compare both characters", { exact: true }).check();
  await expect(canvas).toHaveAttribute("data-comparison", "true");
  expect(downloads).toEqual(["male", "female", "male", "female", "female"]);

  await page.getByRole("button", { name: "Jump", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Replay animation", exact: true }),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute("data-frame-position", "2");
  await page.getByRole("button", { name: "Left", exact: true }).click();
  await expect(canvas).toHaveAttribute("aria-label", /jump, facing left/);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export selected CharacterPack", exact: true })
    .click();
  const output = testInfo.outputPath("prepared-male.character.zip");
  await (await pending).saveAs(output);
  expect(await readFile(output)).toEqual(fixtures.male);
  expect(sourceRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("female workbench link loads only that prepared original and embedded mode hides duplicate navigation", async ({
  page,
}) => {
  const fixture = await preparedKlingFixture("female");
  const downloads: string[] = [];
  await page.route(
    /\/docs\/kling-jump\/exports\/(male|female)\.character\.zip(?:\?.*)?$/,
    async (route) => {
      downloads.push(
        route.request().url().includes("/female.") ? "female" : "male",
      );
      await route.fulfill({ body: fixture, contentType: "application/zip" });
    },
  );
  await page.goto("/player.html?kling=female&embedded=1");
  await expect(page.getByRole("status")).toContainText(
    "Loaded: Prepared female fixture",
  );
  await expect(page.getByLabel("Character", { exact: true })).toHaveValue(
    "female",
  );
  expect(downloads).toEqual(["female"]);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Jump", exact: true }),
  ).toBeEnabled();
});
