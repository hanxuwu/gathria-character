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

test("source pair → same-clock playback → native V2 export → independent reopen preserves source pixels", async ({
  page,
  context,
}, testInfo) => {
  const source = sourceFixture();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/player.html");
  await page.locator("#player-zip").setInputFiles({
    name: "source.zip",
    mimeType: "application/zip",
    buffer: source.buffer,
  });
  await expect(page.getByRole("status")).toContainText("Loaded: Male fixture");
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
  const paused = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.waitForTimeout(150);
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(
    paused,
  );
  await page.getByRole("button", { name: "Left", exact: true }).click();
  await expect(canvas).toHaveAttribute("aria-label", /celebrate, facing left/);
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
    .getByRole("button", { name: "Export selected CharacterPack", exact: true })
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
      await expect(independent.getByTestId("consumer-canvas")).toHaveAttribute(
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
  await expect
    .poll(() =>
      independentCanvas.evaluate((canvas: HTMLCanvasElement) =>
        canvas.toDataURL(),
      ),
    )
    .not.toBe(beforeAdvance);
  await independent
    .getByLabel("Display scale", { exact: true })
    .selectOption("0.5");
  expect(forbidden).toEqual([]);
  expect(errors).toEqual([]);
});

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
