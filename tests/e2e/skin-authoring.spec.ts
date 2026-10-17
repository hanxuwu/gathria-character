import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
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

async function canvasPng(page: Page, id = "skin-posed-canvas") {
  await painted(page);
  return page
    .locator(`#${id}`)
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

async function drag(
  page: Page,
  handle: Locator,
  dx: number,
  dy: number,
  cancel = false,
) {
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2,
    y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
}

async function number(page: Page, label: string, value: number) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(String(value));
  await input.press("Enter");
}

test("source joints drag in native pixels at both zooms, stay unmirrored and form cancellable undo transactions", async ({
  page,
}) => {
  await page.goto("/skin-studio.html");
  await page
    .getByLabel("Attachment", { exact: true })
    .selectOption("near-upper-arm");
  const shoulder = page.getByRole("button", {
    name: "Shoulder joint",
    exact: true,
  });
  const undo = page.getByRole("button", { name: "Undo edit", exact: true });
  const redo = page.getByRole("button", { name: "Redo edit", exact: true });
  await expect(undo).toBeDisabled();
  const original = await canvasPng(page);
  const shoulderX = page.getByLabel("Shoulder X", { exact: true });
  // Typing 80 passes through the invalid intermediate value 8. Draft typing
  // must not validate or apply that temporary joint, nor create extra edits.
  await shoulderX.fill("");
  await shoulderX.pressSequentially("80");
  await expect(shoulderX).toHaveValue("80");
  await expect(shoulder).toHaveAttribute("data-x", "75");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await canvasPng(page)).toBe(original);
  await shoulderX.press("Enter");
  await expect(shoulder).toHaveAttribute("data-x", "80");
  expect(await canvasPng(page)).not.toBe(original);
  await undo.click();
  await expect(shoulderX).toHaveValue("75");
  await expect(shoulder).toHaveAttribute("data-x", "75");
  expect(await canvasPng(page)).toBe(original);
  await expect(undo).toBeDisabled();
  await shoulderX.fill("");
  await shoulderX.pressSequentially("83");
  await shoulderX.press("Escape");
  await expect(shoulderX).toHaveValue("75");
  await expect(undo).toBeDisabled();
  await drag(page, shoulder, 4, 3);
  await expect(shoulder).toHaveAttribute("data-x", "79");
  await expect(shoulder).toHaveAttribute("data-y", "125");
  const edited = await canvasPng(page);
  expect(edited).not.toBe(original);
  await undo.click();
  await expect(shoulder).toHaveAttribute("data-x", "75");
  expect(await canvasPng(page)).toBe(original);
  await expect(undo).toBeDisabled();
  await redo.click();
  expect(await canvasPng(page)).toBe(edited);

  const source = await canvasPng(page, "skin-source-canvas");
  await page.getByLabel("Facing", { exact: true }).selectOption("left");
  expect(await canvasPng(page, "skin-source-canvas")).toBe(source);
  await expect(page.locator("#skin-source-canvas")).toHaveAttribute(
    "data-facing",
    "right",
  );
  await page.getByLabel("Zoom", { exact: true }).selectOption("2");
  await drag(page, shoulder, 8, -4);
  await expect(shoulder).toHaveAttribute("data-x", "83");
  await expect(shoulder).toHaveAttribute("data-y", "123");
  await undo.click();
  await expect(shoulder).toHaveAttribute("data-x", "79");
  await expect(shoulder).toHaveAttribute("data-y", "125");
  await drag(page, shoulder, 10, 8, true);
  await expect(shoulder).toHaveAttribute("data-x", "79");
  await expect(shoulder).toHaveAttribute("data-y", "125");
  // Escape must restore the pending drag without consuming an undo entry.
  await undo.click();
  await expect(shoulder).toHaveAttribute("data-x", "75");
  await expect(undo).toBeDisabled();
  await shoulder.focus();
  await shoulder.press("ArrowRight");
  await shoulder.press("Shift+ArrowDown");
  await expect(shoulder).toHaveAttribute("data-x", "76");
  await expect(shoulder).toHaveAttribute("data-y", "132");
  await undo.click();
  await expect(shoulder).toHaveAttribute("data-y", "122");
  await undo.click();
  await expect(shoulder).toHaveAttribute("data-x", "75");
  await expect(undo).toBeDisabled();
});

test("edited shared poses and timing survive skin swaps and projects, then play exported pixels independently", async ({
  page,
  context,
}, info) => {
  test.setTimeout(90_000);
  await page.goto("/skin-studio.html");
  const before = await canvasPng(page);
  const originalBob = Number(
    await page.getByLabel("Body bob (px)", { exact: true }).inputValue(),
  );
  await number(page, "Body bob (px)", originalBob + 3);
  expect(await canvasPng(page)).not.toBe(before);
  expect(await canvasPng(page, "skin-motion-canvas")).toBe(
    await canvasPng(page),
  );
  await number(page, "Motion FPS", 12);
  await page
    .getByRole("button", { name: "Hold this pose", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Playback frame 2, pose 1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Remove playback frame", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Playback frame 13, pose 12",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Playback frame 13, pose 12",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Playback frame 3, pose 2", exact: true })
    .click();
  await page.getByLabel("Playback pose", { exact: true }).selectOption("2");
  await page
    .getByRole("button", { name: "Playback frame 1, pose 1", exact: true })
    .click();

  // A costume change must not reset the shared action library.
  await page
    .getByLabel("Example skin", { exact: true })
    .selectOption("coral-afternoon");
  await expect(page.getByLabel("Motion FPS", { exact: true })).toHaveValue(
    "12",
  );
  await expect(page.getByLabel("Body bob (px)", { exact: true })).toHaveValue(
    String(originalBob + 3),
  );
  const edited = await canvasPng(page);
  const project = await download(
    page,
    info,
    "Save project ZIP",
    "edited-coral.rig.zip",
  );
  const projectJson = JSON.parse(strFromU8(project.files["project.json"]));
  const sequence = [0, 0, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  expect(projectJson.motions.clips.run.sequence).toEqual(sequence);
  expect(projectJson.motions.clips.run.fps).toBe(12);
  expect(projectJson.motions.clips.run.keys[0].bodyBob).toBe(originalBob + 3);
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
  const reopened = await download(
    page,
    info,
    "Save project ZIP",
    "reopened-coral.rig.zip",
  );
  expect(JSON.parse(strFromU8(reopened.files["project.json"]))).toEqual(
    projectJson,
  );
  const exported = await download(
    page,
    info,
    "Export CharacterPack",
    "edited-coral.character.zip",
  );
  const manifest = JSON.parse(strFromU8(exported.files["manifest.json"]));
  expect(manifest.animations.run).toEqual({
    frames: sequence.map((key) => key + 12),
    fps: 12,
    loop: true,
  });
  const expected = await page.evaluate(
    async ({ bytes, frames, edited }) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const frame = frames.find((entry: { id: number }) => entry.id === 12);
      const canvas = document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, frame.x, frame.y, 192, 256, 0, 0, 192, 256);
      const matches = canvas.toDataURL() === edited;
      const hash = async (pixels: Uint8ClampedArray) =>
        Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", new Uint8Array(pixels)),
          ),
        )
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
      const right = await hash(ctx.getImageData(0, 0, 192, 234).data);
      const mirrored = document.createElement("canvas");
      mirrored.width = 192;
      mirrored.height = 256;
      const mirror = mirrored.getContext("2d")!;
      mirror.translate(192, 0);
      mirror.scale(-1, 1);
      mirror.drawImage(canvas, 0, 0);
      return {
        matches,
        right,
        left: await hash(mirror.getImageData(0, 0, 192, 234).data),
      };
    },
    {
      bytes: [...exported.files["spritesheet.png"]],
      frames: manifest.frames,
      edited,
    },
  );
  expect(expected.matches).toBe(true);
  await page.close();

  const player = await context.newPage();
  const forbidden: string[] = [];
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
  await player.getByRole("button", { name: "Run", exact: true }).click();
  const canvas = player.getByTestId("consumer-canvas");
  for (const direction of ["Right", "Left"] as const) {
    await player.getByRole("button", { name: direction, exact: true }).click();
    await painted(player);
    const hash = await canvas.evaluate(async (canvas: HTMLCanvasElement) => {
      const pixels = canvas
        .getContext("2d")!
        .getImageData(
          Math.round(canvas.width / 2) - 96,
          Math.floor((canvas.height - 256) / 2),
          192,
          234,
        ).data;
      return Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new Uint8Array(pixels)),
        ),
      )
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
    });
    expect(hash).toBe(expected[direction === "Right" ? "right" : "left"]);
  }
  await player
    .getByRole("button", { name: "Play animation", exact: true })
    .click();
  const transitions = await canvas.evaluate(
    (element) =>
      new Promise<{ id: number; time: number }[]>((resolve) => {
        const results: { id: number; time: number }[] = [];
        const start = performance.now();
        function sample() {
          const id = Number(
            element.getAttribute("aria-label")?.match(/frame (\d+)$/)?.[1],
          );
          if (Number.isFinite(id) && results.at(-1)?.id !== id)
            results.push({ id, time: performance.now() - start });
          if (performance.now() - start < 2400) requestAnimationFrame(sample);
          else resolve(results);
        }
        sample();
      }),
  );
  expect(transitions.slice(0, 12).map(({ id }) => id)).toEqual([
    12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 12,
  ]);
  const held = transitions.filter(({ id }) => id === 14);
  expect(held.length).toBeGreaterThanOrEqual(2);
  // Measure a complete loop, so the duplicated sequence entries count toward
  // duration. The tolerance allows RAF scheduling without accepting 18 FPS.
  expect(held[1].time - held[0].time).toBeGreaterThan((13 / 12) * 1000 - 120);
  expect(held[1].time - held[0].time).toBeLessThan((13 / 12) * 1000 + 120);
  expect(forbidden).toEqual([]);
});

test("PNG replacement participates in undo and redo while rejected input preserves the redo branch", async ({
  page,
}, info) => {
  await page.goto("/skin-studio.html");
  const before = await canvasPng(page);
  const skin = await download(
    page,
    info,
    "Save skin ZIP",
    "undo-source.skin.zip",
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
      const pixels = ctx.getImageData(0, 0, 192, 256);
      for (let i = 0; i < pixels.data.length; i += 4) {
        if (pixels.data[i + 3]) {
          pixels.data[i] = 204;
          pixels.data[i + 1] = 97;
          pixels.data[i + 2] = 62;
        }
      }
      ctx.putImageData(pixels, 0, 0);
      return canvas.toDataURL().split(",")[1];
    },
    [...skin.files["slots/torso.png"]],
  );
  await page
    .getByLabel("Replace attachment file", { exact: true })
    .setInputFiles({
      name: "terracotta.png",
      mimeType: "image/png",
      buffer: Buffer.from(replacement, "base64"),
    });
  await expect(page.locator(".skin-notice[role=status]")).toContainText(
    "torso replaced",
  );
  const edited = await canvasPng(page);
  expect(edited).not.toBe(before);
  const undo = page.getByRole("button", { name: "Undo edit", exact: true });
  const redo = page.getByRole("button", { name: "Redo edit", exact: true });
  await undo.click();
  expect(await canvasPng(page)).toBe(before);
  await page
    .getByLabel("Replace attachment file", { exact: true })
    .setInputFiles({
      name: "invalid.png",
      mimeType: "image/png",
      buffer: Buffer.from("not a PNG"),
    });
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await canvasPng(page)).toBe(before);
  await expect(redo).toBeEnabled();
  await redo.click();
  expect(await canvasPng(page)).toBe(edited);
  // Preview controls are not edits and must not consume artwork history.
  await page.getByLabel("Facing", { exact: true }).selectOption("left");
  await page.getByLabel("Facing", { exact: true }).selectOption("right");
  await page.locator("h1").click();
  await page.keyboard.press("Control+z");
  expect(await canvasPng(page)).toBe(before);
  await page.keyboard.press("Control+Shift+z");
  expect(await canvasPng(page)).toBe(edited);
});

test("the checked-in original authoring project opens unchanged and project import is reversible", async ({
  page,
}, info) => {
  await page.goto("/skin-studio.html");
  await number(page, "Motion FPS", 15);
  const current = await canvasPng(page);
  const historicalPath = "docs/reusable-rig/coral-afternoon.rig.zip";
  const historical = unzipSync(await readFile(historicalPath));
  const originalProject = JSON.parse(strFromU8(historical["project.json"]));
  await page
    .getByLabel("Import project file", { exact: true })
    .setInputFiles(historicalPath);
  await expect(page.locator(".skin-notice[role=status]")).toContainText(
    "project opened",
  );
  await expect(page.getByLabel("Character name", { exact: true })).toHaveValue(
    "Coral afternoon",
  );
  await expect(page.getByLabel("Motion FPS", { exact: true })).toHaveValue(
    String(
      originalProject.motions.clips[originalProject.preview.animation].fps,
    ),
  );
  const exported = await download(
    page,
    info,
    "Save project ZIP",
    "historical-roundtrip.rig.zip",
  );
  expect(JSON.parse(strFromU8(exported.files["project.json"]))).toEqual(
    originalProject,
  );
  expect(JSON.parse(strFromU8(exported.files["skin.json"]))).toEqual(
    JSON.parse(strFromU8(historical["skin.json"])),
  );
  for (const name of Object.keys(historical).filter(
    (name) => name.startsWith("slots/") && name.endsWith(".png"),
  )) {
    // PNG compression may change; compare decoded image pixels, not ZIP bytes.
    const equal = await page.evaluate(
      async ({ a, b }) => {
        const pixels = async (bytes: number[]) => {
          const image = await createImageBitmap(
            new Blob([new Uint8Array(bytes)], { type: "image/png" }),
          );
          const canvas = document.createElement("canvas");
          canvas.width = 192;
          canvas.height = 256;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(image, 0, 0);
          return canvas.toDataURL();
        };
        return (await pixels(a)) === (await pixels(b));
      },
      { a: [...historical[name]], b: [...exported.files[name]] },
    );
    expect(equal, name).toBe(true);
  }
  const historicalPixels = await canvasPng(page);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await expect(page.getByLabel("Character name", { exact: true })).toHaveValue(
    "Denim daytrip",
  );
  await expect(page.getByLabel("Motion FPS", { exact: true })).toHaveValue(
    "15",
  );
  expect(await canvasPng(page)).toBe(current);
  await page.getByRole("button", { name: "Redo edit", exact: true }).click();
  expect(await canvasPng(page)).toBe(historicalPixels);
});
