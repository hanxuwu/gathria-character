import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";

async function painted(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function pixels(page: Page, selector = "#skin-posed-canvas") {
  await painted(page);
  return page.locator(selector).evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0;
    const colors = new Set<number>();
    for (let offset = 0; offset < data.length; offset += 4) {
      if (!data[offset + 3]) continue;
      visible++;
      colors.add(
        (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2],
      );
    }
    return { png: canvas.toDataURL(), visible, colors: colors.size };
  });
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

async function number(page: Page, label: string, value: number) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press("Enter");
}

test("four basic actions animate the actual skeleton; jump lands once and explicitly replays", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/skin-studio.html");
  const art = await pixels(page);
  await page.getByLabel("Skeleton only", { exact: true }).check();
  const skeleton = await pixels(page);
  expect(skeleton.visible).toBeGreaterThan(100);
  expect(skeleton.visible).toBeLessThan(art.visible / 2);
  expect(skeleton.png).not.toBe(art.png);
  for (const action of ["idle", "walk", "run", "jump"]) {
    await page.getByLabel("Action", { exact: true }).selectOption(action);
    const first = (await pixels(page)).png;
    const count = action === "idle" ? 4 : action === "walk" ? 8 : 12;
    const index = action === "jump" ? 6 : action === "idle" ? 3 : 2;
    const pose = action === "idle" ? 2 : index;
    await page
      .getByRole("button", {
        name: `Playback frame ${index}, pose ${pose}`,
        exact: true,
      })
      .click();
    expect(
      (await pixels(page)).png,
      `${action} changes bone positions`,
    ).not.toBe(first);
    await page
      .getByRole("button", { name: "Playback frame 1, pose 1", exact: true })
      .click();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(() => page.locator("#skin-posed-canvas").getAttribute("data-frame"))
      .not.toBe("0");
    if (action === "jump") {
      await expect(
        page.getByRole("button", { name: "Replay", exact: true }),
      ).toBeVisible();
      await expect(page.locator("#skin-posed-canvas")).toHaveAttribute(
        "data-frame",
        String(count - 1),
      );
      const landed = (await pixels(page)).png;
      await page.waitForTimeout(160);
      expect((await pixels(page)).png).toBe(landed);
      await page.getByRole("button", { name: "Replay", exact: true }).click();
      await expect
        .poll(() =>
          page.locator("#skin-posed-canvas").getAttribute("data-frame"),
        )
        .not.toBe(String(count - 1));
      await expect(
        page.getByRole("button", { name: "Replay", exact: true }),
      ).toBeVisible();
    } else {
      await page.getByRole("button", { name: "Pause", exact: true }).click();
    }
  }
  await page.getByLabel("Action", { exact: true }).selectOption("run");
  await page
    .getByRole("button", { name: "Playback frame 1, pose 1", exact: true })
    .click();
  await page.getByLabel("Skeleton only", { exact: true }).uncheck();
  expect((await pixels(page)).png).toBe(art.png);
  expect(errors).toEqual([]);
});

test("jump edits share one motion library, roundtrip and independently play every exported frame in both directions", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  await page.goto("/skin-studio.html");
  await page.getByLabel("Action", { exact: true }).selectOption("jump");
  await page
    .getByRole("button", { name: "Playback frame 6, pose 6", exact: true })
    .click();
  const heightLabel = "Jump height (px, negative up)";
  const originalHeight = Number(
    await page.getByLabel(heightLabel, { exact: true }).inputValue(),
  );
  const before = (await pixels(page)).png;
  await number(page, heightLabel, originalHeight + 1);
  expect((await pixels(page)).png).not.toBe(before);
  await number(page, "Motion FPS", 12);
  await page
    .getByLabel("Example skin", { exact: true })
    .selectOption("coral-afternoon");
  await page
    .getByRole("button", { name: "Playback frame 6, pose 6", exact: true })
    .click();
  await expect(page.getByLabel(heightLabel, { exact: true })).toHaveValue(
    String(originalHeight + 1),
  );
  await expect(page.getByLabel("Motion FPS", { exact: true })).toHaveValue(
    "12",
  );
  await page.getByLabel("Facing", { exact: true }).selectOption("left");
  await page.getByLabel("Expression", { exact: true }).selectOption("gentle");
  const project = await download(
    page,
    info,
    "Save project ZIP",
    "jump-coral.rig.zip",
  );
  const saved = JSON.parse(strFromU8(project.files["project.json"]));
  expect(saved.preview).toEqual({
    animation: "jump",
    facing: "left",
    expression: "gentle",
  });
  expect(saved.motions.clips.jump.keys[5].rootY).toBe(originalHeight + 1);
  expect(saved.motions.clips.jump.fps).toBe(12);
  expect(saved.motions.clips.jump.loop).toBe(false);
  await page
    .getByLabel("Example skin", { exact: true })
    .selectOption("denim-daytrip");
  await page
    .getByLabel("Import project file", { exact: true })
    .setInputFiles(project.path);
  await expect(page.locator(".skin-notice[role=status]")).toContainText(
    "project opened",
  );
  await expect(page.getByLabel("Action", { exact: true })).toHaveValue("jump");
  await expect(page.getByLabel("Facing", { exact: true })).toHaveValue("left");
  const reopened = await download(
    page,
    info,
    "Save project ZIP",
    "jump-coral-reopened.rig.zip",
  );
  expect(JSON.parse(strFromU8(reopened.files["project.json"]))).toEqual(saved);

  // The skeleton display is a preview aid, never substituted for exported art.
  await page.getByLabel("Facing", { exact: true }).selectOption("right");
  await page
    .getByRole("button", { name: "Playback frame 1, pose 1", exact: true })
    .click();
  const displayed = (await pixels(page)).png;
  await page.getByLabel("Skeleton only", { exact: true }).check();
  const exported = await download(
    page,
    info,
    "Export CharacterPack",
    "jump-coral.character.zip",
  );
  const manifest = JSON.parse(strFromU8(exported.files["manifest.json"]));
  expect(manifest.generator).toBe("gathria-reusable-rig-v2");
  expect(manifest.frames).toHaveLength(36);
  expect(manifest.animations.jump).toEqual({
    frames: Array.from({ length: 12 }, (_, i) => i + 24),
    fps: 12,
    loop: false,
  });
  expect(manifest.anchor).toMatchObject({ x: 96, y: 240 });
  expect(
    JSON.parse(strFromU8(exported.files["character.json"])).preview.animation,
  ).toBe("idle");
  const frameChecks = await page.evaluate(
    async ({ bytes, frames, displayed }) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      const decoded = [];
      for (const frame of frames) {
        ctx.clearRect(0, 0, 192, 256);
        ctx.drawImage(image, frame.x, frame.y, 192, 256, 0, 0, 192, 256);
        const data = ctx.getImageData(0, 0, 192, 256).data;
        let visible = 0,
          nonBinaryAlpha = 0,
          border = 0;
        for (let y = 0; y < 256; y++)
          for (let x = 0; x < 192; x++) {
            const alpha = data[(y * 192 + x) * 4 + 3];
            visible += Number(alpha > 0);
            nonBinaryAlpha += Number(alpha !== 0 && alpha !== 255);
            if (x === 0 || x === 191 || y === 0 || y === 255)
              border += Number(alpha > 0);
          }
        decoded.push({
          id: frame.id,
          visible,
          nonBinaryAlpha,
          border,
          previewMatches: frame.id === 24 && canvas.toDataURL() === displayed,
        });
      }
      return { width: image.width, height: image.height, decoded };
    },
    {
      bytes: [...exported.files["spritesheet.png"]],
      frames: manifest.frames,
      displayed,
    },
  );
  expect([frameChecks.width, frameChecks.height]).toEqual([1536, 1536]);
  expect(
    frameChecks.decoded.find((entry: { id: number }) => entry.id === 24)
      ?.previewMatches,
  ).toBe(true);
  for (const entry of frameChecks.decoded) {
    expect(
      entry.visible,
      `frame ${entry.id} is actual nonempty art`,
    ).toBeGreaterThan(1000);
    expect(entry.visible).toBeLessThan(192 * 256);
    expect(entry.nonBinaryAlpha, `frame ${entry.id} has crisp alpha`).toBe(0);
    expect(entry.border, `frame ${entry.id} remains inside its frame`).toBe(0);
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
  await player.locator("#player-speed").selectOption("0.25");
  await player.getByRole("button", { name: "Jump", exact: true }).click();
  const canvas = player.getByTestId("consumer-canvas");
  for (const facing of ["Right", "Left"] as const) {
    await player.getByRole("button", { name: facing, exact: true }).click();
    await painted(player);
    // Identify frames from full decoded pixels, not React's asynchronously
    // updated frame label. Include the player's ground/anchor guides explicitly.
    const playback = await canvas.evaluate(
      async (element: HTMLCanvasElement, { bytes, frames, facing }) => {
        const image = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        const expectedCanvas = document.createElement("canvas");
        expectedCanvas.width = element.width;
        expectedCanvas.height = element.height;
        const ctx = expectedCanvas.getContext("2d")!;
        const x = Math.round(element.width / 2),
          top = Math.floor((element.height - 256) / 2),
          y = top + 240;
        const cropX = x - 96;
        const expected: { id: number; pixels: Uint8ClampedArray }[] = [];
        for (const frame of frames.filter(
          (frame: { id: number }) => frame.id >= 24,
        )) {
          ctx.clearRect(0, 0, element.width, element.height);
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
          expected.push({
            id: frame.id,
            pixels: ctx.getImageData(cropX, top, 192, 256).data,
          });
        }
        const button = document.querySelector<HTMLButtonElement>(
          'button[aria-label="Play animation"], button[aria-label="Replay animation"]',
        )!;
        return new Promise<{
          ids: number[];
          unmatched: number;
          unmatchedDetails: {
            time: number;
            visible: number;
            candidates: number[];
          }[];
          ended: boolean;
          lastFrameHeld: boolean;
          elapsed: number;
        }>((resolve) => {
          const ids: number[] = [];
          let unmatched = 0,
            completedAt = 0;
          const unmatchedDetails: {
            time: number;
            visible: number;
            candidates: number[];
          }[] = [];
          const start = performance.now();
          button.click();
          function sample() {
            const now = performance.now();
            const actual = element
              .getContext("2d")!
              .getImageData(cropX, top, 192, 256).data;
            const matches = expected.filter((frame) =>
              frame.pixels.every((value, offset) => actual[offset] === value),
            );
            // Ready and final Ready deliberately have identical pixels.
            // Resolve only that repeated pose using its observed neighbours.
            const match =
              matches.find((frame) => frame.id === ids.at(-1)) ??
              matches.find((frame) => frame.id === (ids.at(-1) ?? 23) + 1);
            if (match) {
              if (ids.at(-1) !== match.id) ids.push(match.id);
            } else if (now - start > 50) {
              unmatched++;
              unmatchedDetails.push({
                time: now - start,
                visible: actual.filter(
                  (value, offset) => offset % 4 === 3 && value > 0,
                ).length,
                candidates: matches.map((frame) => frame.id),
              });
            }
            const ended =
              document
                .querySelector("#player-one-shot-note")
                ?.textContent?.startsWith("Finished") ?? false;
            if (ended && !completedAt) completedAt = now;
            if (
              (completedAt && now - completedAt >= 180) ||
              now - start > 5200
            ) {
              resolve({
                ids,
                unmatched,
                unmatchedDetails,
                ended,
                lastFrameHeld: match?.id === 35,
                elapsed: completedAt - start,
              });
            } else requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        });
      },
      {
        bytes: [...exported.files["spritesheet.png"]],
        frames: manifest.frames,
        facing,
      },
    );
    expect(playback.ids).toEqual(manifest.animations.jump.frames);
    expect(playback.unmatched, JSON.stringify(playback.unmatchedDetails)).toBe(
      0,
    );
    expect(playback.ended).toBe(true);
    expect(playback.lastFrameHeld).toBe(true);
    // 12 frames / 12 FPS at 0.25× = 4 seconds; forbid early last-frame completion.
    expect(playback.elapsed).toBeGreaterThan(3850);
    expect(playback.elapsed).toBeLessThan(4500);
    await expect(
      player.getByRole("button", { name: "Replay animation", exact: true }),
    ).toBeVisible();
  }
  await player.getByRole("button", { name: "Walk", exact: true }).click();
  await expect(
    player.getByRole("button", { name: "Pause animation", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => canvas.getAttribute("aria-label"))
    .not.toContain("jump");
  expect(forbidden).toEqual([]);
  expect(errors).toEqual([]);
});

test("legacy projects keep their three actions until Add jump is chosen, and old packs report unavailable jump", async ({
  page,
  context,
}, info) => {
  await page.goto("/skin-studio.html");
  const historicalPath = "docs/reusable-rig/denim-daytrip.rig.zip";
  const original = unzipSync(await readFile(historicalPath));
  await page
    .getByLabel("Import project file", { exact: true })
    .setInputFiles(historicalPath);
  await expect(page.locator(".skin-notice[role=status]")).toContainText(
    "project opened",
  );
  const jumpOption = page
    .getByLabel("Action", { exact: true })
    .locator('option[value="jump"]');
  await expect(jumpOption).toHaveJSProperty("disabled", true);
  const unchanged = await download(
    page,
    info,
    "Save project ZIP",
    "legacy-unchanged.rig.zip",
  );
  expect(JSON.parse(strFromU8(unchanged.files["project.json"]))).toEqual(
    JSON.parse(strFromU8(original["project.json"])),
  );
  const oldPack = await download(
    page,
    info,
    "Export CharacterPack",
    "legacy.character.zip",
  );
  const manifest = JSON.parse(strFromU8(oldPack.files["manifest.json"]));
  expect(manifest.generator).toBe("gathria-reusable-rig-v1");
  expect(manifest.frames).toHaveLength(24);
  expect(manifest.animations.jump).toBeUndefined();
  const oldPixels = (await pixels(page)).png;
  await page
    .getByRole("button", { name: "Add jump action", exact: true })
    .click();
  await expect(jumpOption).toHaveJSProperty("disabled", false);
  await page.getByLabel("Action", { exact: true }).selectOption("jump");
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await expect(jumpOption).toHaveJSProperty("disabled", true);
  expect((await pixels(page)).png).toBe(oldPixels);
  await page.getByRole("button", { name: "Redo edit", exact: true }).click();
  await expect(jumpOption).toHaveJSProperty("disabled", false);
  const upgraded = await download(
    page,
    info,
    "Save project ZIP",
    "legacy-with-jump.rig.zip",
  );
  expect(
    JSON.parse(strFromU8(upgraded.files["project.json"])).motions.clips.jump
      .keys,
  ).toHaveLength(12);
  await page.close();
  const player = await context.newPage();
  await player.goto("/player.html");
  await player.locator("#player-zip").setInputFiles(oldPack.path);
  await expect(player.getByRole("status")).toContainText("Loaded:");
  await expect(
    player.getByRole("button", { name: "Jump", exact: true }),
  ).toBeDisabled();
  await expect(player.locator("#player-jump-unavailable")).toContainText(
    "does not include a jump animation",
  );
  for (const name of ["Idle", "Walk", "Run"])
    await expect(
      player.getByRole("button", { name, exact: true }),
    ).toBeEnabled();
});
