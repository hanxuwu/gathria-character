import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import type { CharacterPackManifest } from "../../src/core/types";

for (const character of ["dress", "suit"]) {
  test(`${character} run pack plays independently, mirrors, and resets when replaced by a legacy pack`, async ({
    page,
  }) => {
    const packPath = `public/samples/running/${character}.character.zip`;
    const entries = unzipSync(await readFile(packPath));
    const manifest = JSON.parse(
      strFromU8(entries["manifest.json"]),
    ) as CharacterPackManifest;
    const run = manifest.animations.run!;
    expect(run.frames).toHaveLength(12);
    expect(run.fps).toBe(18);

    const forbidden: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(
      /\/src\/(?:editor\/|core\/(?:generator|(?:cohesive|polished|harmonized|running|illustrated|expressive)-(?:rig|assets)))/,
      async (route) => {
        forbidden.push(route.request().url());
        await route.abort();
      },
    );
    await page.goto("/player.html");
    await page.locator("#player-zip").setInputFiles(packPath);
    await expect(page.getByRole("status")).toContainText("Loaded:");
    await expect(page.getByText(/In-place playback/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Run", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Pause animation", exact: true })
      .click();
    await page.locator("#player-zoom").selectOption("1");
    await page.getByRole("button", { name: "Run", exact: true }).click();
    const canvas = page.getByTestId("consumer-canvas");
    await expect(canvas).toHaveAttribute(
      "aria-label",
      new RegExp(`run, facing right, frame ${run.frames[0]}$`),
    );
    await expect(page.locator(".player-timing")).toHaveText("18 FPS · LOOP");

    // An asymmetric source is mirrored around the attachment point, including
    // its transparent padding. Ignore the dashed baseline/anchor overlay.
    async function spritePixels() {
      return canvas.evaluate(
        (element: HTMLCanvasElement, geometry) => {
          const attachmentX = Math.round(element.width / 2);
          const attachmentY =
            Math.floor((element.height - geometry.frameHeight) / 2) +
            geometry.anchorY;
          return Array.from(
            element
              .getContext("2d")!
              .getImageData(
                attachmentX - geometry.anchorX,
                attachmentY - geometry.anchorY,
                geometry.frameWidth,
                geometry.anchorY - 6,
              ).data,
          );
        },
        {
          frameWidth: manifest.spritesheet.frameWidth,
          frameHeight: manifest.spritesheet.frameHeight,
          anchorX: manifest.anchor.x,
          anchorY: manifest.anchor.y,
        },
      );
    }
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const right = await spritePixels();
    await page.getByRole("button", { name: "Left", exact: true }).click();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const left = await spritePixels();
    const width = manifest.spritesheet.frameWidth;
    const mirrored = new Array<number>(right.length);
    for (let y = 0; y < manifest.anchor.y - 6; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const mirrorOffset = (y * width + width - x - 1) * 4;
        for (let channel = 0; channel < 4; channel++)
          mirrored[offset + channel] = right[mirrorOffset + channel];
      }
    }
    expect(left).toEqual(mirrored);

    await page
      .getByRole("button", { name: "Play animation", exact: true })
      .click();
    const observed = await canvas.evaluate(
      (element, duration) =>
        new Promise<number[]>((resolve) => {
          const frames = new Set<number>();
          const start = performance.now();
          function sample() {
            const id = Number(
              element.getAttribute("aria-label")?.match(/frame (\d+)$/)?.[1],
            );
            if (Number.isFinite(id)) frames.add(id);
            if (performance.now() - start < duration)
              requestAnimationFrame(sample);
            else resolve([...frames]);
          }
          sample();
        }),
      1_600,
    );
    expect(observed.sort((a, b) => a - b)).toEqual(
      [...run.frames].sort((a, b) => a - b),
    );

    // The former run selection/time must not leak into a pack without run.
    await page
      .locator("#player-zip")
      .setInputFiles("public/samples/polished/dress-joyful.character.zip");
    await expect(
      page.getByRole("button", { name: "Idle", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "Run", exact: true }),
    ).toBeDisabled();
    await expect(page.locator("#player-run-unavailable")).toHaveText(
      "Run unavailable: this pack includes Idle and Walk only.",
    );
    await expect(canvas).toHaveAttribute(
      "aria-label",
      /idle, facing right, frame [0-3]$/,
    );
    await page.getByRole("button", { name: "Walk", exact: true }).click();
    await expect(canvas).toHaveAttribute(
      "aria-label",
      /walk, facing right, frame (?:[4-9]|1[01])$/,
    );
    expect(errors).toEqual([]);
    expect(forbidden).toEqual([]);
  });
}
