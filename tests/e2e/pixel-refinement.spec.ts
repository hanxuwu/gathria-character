import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { parseGIF, decompressFrames } from "gifuct-js";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";
import { readPortableCharacterPackArchive } from "../../src/core/pack";
import { installWardrobeFixture } from "./wardrobe-fixture";

// Synthetic drawings exercise the real browser pipeline and portable files.
// They are not a substitute for the separate production-art visual review.
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const button = (scope: Locator, name: string) =>
  scope.getByRole("button", { name, exact: true });
const modal = (page: Page) =>
  page.getByRole("dialog", { name: "Pixel finish", exact: true });
const pixels = (canvas: Locator) =>
  canvas.evaluate((node: HTMLCanvasElement) => ({
    width: node.width,
    height: node.height,
    rgba: Array.from(
      node.getContext("2d")!.getImageData(0, 0, node.width, node.height).data,
    ),
  }));

async function download(page: Page, scope: Locator, name: string) {
  const pending = page.waitForEvent("download");
  await button(scope, name).click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return new Uint8Array(await readFile((await file.path())!));
}

async function open(page: Page, character = "male") {
  await installWardrobeFixture(page, { motionFlow: true });
  await page.goto(`/workbench.html?character=${character}&mode=wardrobe`);
  const panel = page.locator("#wardrobe-panel");
  await expect(panel.getByRole("status")).toContainText("Original outfit.");
  await button(panel, "Daily").click();
  await expect(panel.getByRole("status")).toContainText("Daily selected");
  return panel;
}

async function build(dialog: Locator) {
  await button(dialog, "Build pixel candidate").click();
  await expect(dialog.getByRole("status")).toContainText(
    "Pixel candidate ready.",
  );
  await expect(button(dialog, "Save pixel CharacterPack")).toBeEnabled();
}

function extractedFrames(bytes: Uint8Array) {
  const archive = readPortableCharacterPackArchive(bytes);
  const sheets = [archive.png, ...(archive.additionalPngs ?? [])].map((png) =>
    decodeSourceRgbaPng(png),
  );
  const frames = new Map<number, Uint8Array>();
  for (const frame of archive.manifest.frames) {
    const image = sheets[frame.page ?? 0];
    const rgba = new Uint8Array(frame.width * frame.height * 4);
    for (let y = 0; y < frame.height; y++) {
      const start = ((frame.y + y) * image.width + frame.x) * 4;
      rgba.set(
        image.pixels.subarray(start, start + frame.width * 4),
        y * frame.width * 4,
      );
    }
    frames.set(frame.id, rgba);
  }
  return { archive, frames };
}

for (const character of ["male", "female"] as const) {
  test(`${character}: the optional pixel candidate exports original clocks, mirrored media and an independent pack without changing the wardrobe`, async ({
    page,
    context,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const panel = await open(page, character);
    const before = await pixels(panel.getByTestId("wardrobe-preview"));
    await button(panel, "Try pixel finish").click();
    const dialog = modal(page);
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByLabel("Pixel detail", { exact: true }),
    ).toHaveValue("4");
    await build(dialog);
    for (const name of ["pixel-source-canvas", "pixel-candidate-canvas"])
      expect(
        (await pixels(dialog.getByTestId(name))).rgba.some(
          (value, index) => index % 4 === 3 && value > 0,
        ),
      ).toBe(true);
    const sourceBytes = await download(
      page,
      dialog,
      "Save source CharacterPack",
    );
    const candidateBytes = await download(
      page,
      dialog,
      "Save pixel CharacterPack",
    );
    const source = readPortableCharacterPackArchive(sourceBytes);
    const { archive: candidate, frames } = extractedFrames(candidateBytes);
    expect(candidate.manifest.schemaVersion).toBe(4);
    expect(candidate.manifest.scale).toMatchObject({
      pixelArt: true,
      integerOnly: true,
    });
    expect(candidate.manifest.animations).toEqual(source.manifest.animations);
    expect(candidate.manifest.frames.map((frame) => frame.id)).toEqual(
      source.manifest.frames.map((frame) => frame.id),
    );
    expect(candidate.config.derivation.frames).toEqual(
      source.config.derivation.frames,
    );
    expect(candidate.config.source).toMatchObject({
      kind: "unified-archive",
      sha256: sha(sourceBytes),
    });
    expect(candidate.config.sourceMetadata?.motionFlow).toEqual(
      source.config.sourceMetadata?.motionFlow,
    );
    // Integer padding, rather than an anatomical shift or per-pose crop,
    // maps source anchor (4,7) to (1,2) at one fixed quarter scale.
    expect(candidate.manifest.anchor).toMatchObject({ x: 1, y: 2 });
    expect(candidate.manifest.spritesheet).toMatchObject({
      frameWidth: 2,
      frameHeight: 3,
    });
    for (const rgba of frames.values()) {
      for (let at = 3; at < rgba.length; at += 4)
        expect([0, 255]).toContain(rgba[at]);
    }
    const report = JSON.parse(
      new TextDecoder().decode(
        await download(page, dialog, "Save pixel build report"),
      ),
    );
    expect(JSON.stringify(report)).toContain(sha(sourceBytes));
    expect(JSON.stringify(report)).toContain(sha(candidateBytes));

    const gifs = [];
    await dialog
      .getByLabel("Pixel action", { exact: true })
      .selectOption("run");
    await dialog.getByLabel("Pixel frame", { exact: true }).fill("1");
    const canvas = dialog.getByTestId("pixel-candidate-canvas");
    await expect(canvas).toHaveAttribute("data-frame-id", "19");
    const native = decodeSourceRgbaPng(
      await download(page, dialog, "Save pixel PNG"),
    );
    expect(native.width).toBe(2);
    expect(native.height).toBe(3);
    expect(native.pixels).toEqual(frames.get(19));
    await dialog
      .getByLabel("Pixel preview zoom", { exact: true })
      .selectOption("2");
    await expect(canvas).toHaveAttribute("data-frame-id", "19");
    expect(
      decodeSourceRgbaPng(await download(page, dialog, "Save pixel PNG"))
        .pixels,
    ).toEqual(native.pixels);
    for (const facing of ["right", "left"] as const) {
      await dialog
        .getByLabel("Pixel facing", { exact: true })
        .selectOption(facing);
      await expect(canvas).toHaveAttribute("data-facing", facing);
      const bytes = await download(page, dialog, "Save pixel GIF");
      const parsed = parseGIF(bytes.buffer);
      const decoded = decompressFrames(parsed, true);
      expect(parsed.lsd).toMatchObject({ width: 2, height: 3 });
      expect(decoded.map((frame) => frame.delay)).toEqual([80, 90]);
      expect(new TextDecoder().decode(bytes)).toContain("NETSCAPE2.0");
      gifs.push(decoded);
    }
    for (let frame = 0; frame < 2; frame++)
      for (let y = 0; y < 3; y++)
        for (let x = 0; x < 2; x++) {
          const right = (y * 2 + x) * 4;
          const left = (y * 2 + 1 - x) * 4;
          expect(gifs[0][frame].patch.slice(right, right + 4)).toEqual(
            gifs[1][frame].patch.slice(left, left + 4),
          );
        }
    await dialog
      .getByLabel("Pixel action", { exact: true })
      .selectOption("jump");
    await dialog.getByLabel("Pixel frame", { exact: true }).fill("0");
    await button(dialog, "Play pixel preview").click();
    await expect(canvas).toHaveAttribute("data-frame-position", "2");
    await expect(button(dialog, "Play pixel preview")).toBeVisible();
    // The inspection preview holds its last pose beyond another whole jump;
    // the exported motion profile separately retains its return-to-idle route.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const start = performance.now();
          const next = () =>
            performance.now() - start >= 400
              ? resolve()
              : requestAnimationFrame(next);
          requestAnimationFrame(next);
        }),
    );
    await expect(canvas).toHaveAttribute("data-frame-position", "2");
    await expect(
      dialog.getByLabel("Pixel action", { exact: true }),
    ).toHaveValue("jump");
    const jump = await download(page, dialog, "Save pixel GIF");
    const jumpFrames = decompressFrames(parseGIF(jump.buffer), true);
    expect(jumpFrames).toHaveLength(3);
    expect(jumpFrames.reduce((total, frame) => total + frame.delay, 0)).toBe(
      380,
    );
    expect(new TextDecoder().decode(jump)).not.toContain("NETSCAPE2.0");
    await button(dialog, "Close pixel finish").click();
    await expect(modal(page)).toHaveCount(0);
    expect(await pixels(panel.getByTestId("wardrobe-preview"))).toEqual(before);
    await expect(panel.getByLabel("Top", { exact: true })).toHaveValue(
      `${character}-top`,
    );
    await expect(button(panel, "Try pixel finish")).toBeFocused();

    await page.close();
    const independent = await context.newPage();
    independent.on("pageerror", (error) => errors.push(error.message));
    await independent.goto("/player.html");
    await independent.locator("#player-zip").setInputFiles({
      name: `${character}.pixel.character.zip`,
      mimeType: "application/zip",
      buffer: Buffer.from(candidateBytes),
    });
    await expect(independent.locator(".player-status")).toContainText(
      "Loaded:",
    );
    await expect(
      independent.getByText("Algorithmic pixel candidate · baked playback", {
        exact: true,
      }),
    ).toBeVisible();
    const player = independent.getByTestId("consumer-canvas");
    for (const action of ["Idle", "Walk", "Run", "Jump", "Celebrate"]) {
      await independent
        .getByRole("button", { name: action, exact: true })
        .click();
      await expect(player).toHaveAttribute(
        "aria-label",
        new RegExp(action.toLowerCase()),
      );
      for (const facing of ["Left", "Right"]) {
        await independent
          .getByRole("button", { name: facing, exact: true })
          .click();
        await expect(player).toHaveAttribute(
          "aria-label",
          new RegExp(`facing ${facing.toLowerCase()}`),
        );
      }
    }
    await independent.close();
    expect(errors).toEqual([]);
  });
}

test("changed pixel settings keep the last preview visibly stale until rebuilding, without mutating clothing", async ({
  page,
}) => {
  const panel = await open(page);
  const before = await pixels(panel.getByTestId("wardrobe-preview"));
  await button(panel, "Try pixel finish").click();
  const dialog = modal(page);
  await build(dialog);
  const old = await download(page, dialog, "Save pixel CharacterPack");
  const oldCanvas = await pixels(dialog.getByTestId("pixel-candidate-canvas"));
  await dialog.getByLabel("Pixel detail", { exact: true }).selectOption("8");
  await expect(button(dialog, "Save pixel CharacterPack")).toBeDisabled();
  await expect(button(dialog, "Save pixel PNG")).toBeDisabled();
  await expect(button(dialog, "Save pixel GIF")).toBeDisabled();
  expect(await pixels(dialog.getByTestId("pixel-candidate-canvas"))).toEqual(
    oldCanvas,
  );
  await dialog
    .getByLabel("Pixel sampling", { exact: true })
    .selectOption("nearest");
  await dialog.getByLabel("Pixel colors", { exact: true }).selectOption("64");
  await build(dialog);
  const rebuilt = await download(page, dialog, "Save pixel CharacterPack");
  expect(sha(rebuilt)).not.toBe(sha(old));
  expect(
    readPortableCharacterPackArchive(rebuilt).manifest.spritesheet,
  ).toMatchObject({
    frameWidth: 2,
    frameHeight: 2,
  });
  await page.keyboard.press("Escape");
  await expect(modal(page)).toHaveCount(0);
  expect(await pixels(panel.getByTestId("wardrobe-preview"))).toEqual(before);
  await expect(button(panel, "Try pixel finish")).toBeFocused();
});

test("canceling an in-flight rebuild retains the last candidate and does not emit a late download", async ({
  page,
}) => {
  const panel = await open(page);
  await button(panel, "Try pixel finish").click();
  const dialog = modal(page);
  await build(dialog);
  const old = await download(page, dialog, "Save pixel CharacterPack");
  const oldCanvas = await pixels(dialog.getByTestId("pixel-candidate-canvas"));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let waiting = 0;
  await page.route(
    "**/src/core/source-preparation.worker.ts*",
    async (route) => {
      waiting++;
      await gate;
      await route.continue();
    },
  );
  const downloads: string[] = [];
  page.on("download", (file) => downloads.push(file.suggestedFilename()));
  await button(dialog, "Build pixel candidate").click();
  await expect.poll(() => waiting).toBeGreaterThan(0);
  await button(dialog, "Cancel pixel preparation").click();
  release();
  await page.unroute("**/src/core/source-preparation.worker.ts*");
  await expect(button(dialog, "Save pixel CharacterPack")).toBeEnabled();
  expect(await pixels(dialog.getByTestId("pixel-candidate-canvas"))).toEqual(
    oldCanvas,
  );
  expect(downloads).toEqual([]);
  const retained = await download(page, dialog, "Save pixel CharacterPack");
  expect(sha(retained)).toBe(sha(old));
  await button(dialog, "Close pixel finish").click();
  await expect(modal(page)).toHaveCount(0);
  await expect(panel.getByLabel("Top", { exact: true })).toHaveValue(
    "male-top",
  );
});

test("a rejected source-preparation rebuild retains the accepted candidate and leaves the wardrobe usable", async ({
  page,
}) => {
  const panel = await open(page);
  const before = await pixels(panel.getByTestId("wardrobe-preview"));
  await button(panel, "Try pixel finish").click();
  const dialog = modal(page);
  await build(dialog);
  const accepted = await download(page, dialog, "Save pixel CharacterPack");
  const acceptedCanvas = await pixels(
    dialog.getByTestId("pixel-candidate-canvas"),
  );
  // A worker-reported validation error must not retry a different parser.
  await page.route("**/src/core/source-preparation.worker.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `self.onmessage = ({ data }) => self.postMessage({ kind: data.kind, ok: false, message: "Synthetic rejected source preparation" });`,
    }),
  );
  await button(dialog, "Build pixel candidate").click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Synthetic rejected source preparation",
  );
  await expect(button(dialog, "Save pixel CharacterPack")).toBeEnabled();
  expect(await pixels(dialog.getByTestId("pixel-candidate-canvas"))).toEqual(
    acceptedCanvas,
  );
  expect(sha(await download(page, dialog, "Save pixel CharacterPack"))).toBe(
    sha(accepted),
  );
  await page.unroute("**/src/core/source-preparation.worker.ts*");
  await button(dialog, "Close pixel finish").click();
  expect(await pixels(panel.getByTestId("wardrobe-preview"))).toEqual(before);
  await button(panel, "Try pixel finish").click();
  await build(modal(page));
  await button(modal(page), "Close pixel finish").click();
  await expect(panel.getByLabel("Top", { exact: true })).toHaveValue(
    "male-top",
  );
});
