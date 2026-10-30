import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strToU8, unzipSync, zipSync } from "fflate";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";

const side = (page: Page) =>
  page.locator('[data-testid="side-session"][data-active="true"]');
const stage = (page: Page) => side(page).getByTestId("side-stage");
const panel = (page: Page) => side(page).getByTestId("side-playground");
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const parse = (bytes: Uint8Array) =>
  JSON.parse(Buffer.from(bytes).toString("utf8"));
async function ready(page: Page) {
  await expect(panel(page)).toHaveAttribute("aria-busy", "false", {
    timeout: 180_000,
  });
  await expect(panel(page).getByRole("alert")).toHaveCount(0);
}
async function download(page: Page, id: string) {
  const waiting = page.waitForEvent("download", { timeout: 180_000 });
  await side(page).getByTestId(id).click();
  const result = await waiting;
  expect(await result.failure()).toBeNull();
  const bytes = await readFile((await result.path())!);
  await ready(page);
  return bytes;
}

for (const character of ["male", "female"] as const) {
  test(`${character}: PR54 native artwork survives refinement${character === "male" ? ", worker fallback and malformed garment recovery" : " and project roundtrip"}`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const base = "docs/kling-side-fitting/review";
    const projectBytes = await readFile(`${base}/${character}.wardrobe.zip`);
    const packBytes = await readFile(`${base}/${character}.character.zip`);
    const baseline = JSON.parse(
      await readFile("docs/kling-side-refinement/baseline.json", "utf8"),
    );
    for (const [suffix, bytes] of [
      ["wardrobe", projectBytes],
      ["character", packBytes],
    ] as const) {
      const record = baseline.files.find(
        (entry: { path: string }) =>
          entry.path === `${base}/${character}.${suffix}.zip`,
      );
      expect(
        record,
        "Prior actual UI exports must match the frozen PR54 baseline",
      ).toBeTruthy();
      expect(sha(bytes)).toBe(record.sha256);
    }
    const previous = unzipSync(projectBytes),
      document = parse(previous["document.json"]);
    const packed = unzipSync(packBytes),
      manifest = parse(packed["manifest.json"]);
    const pages = [
      manifest.spritesheet,
      ...(manifest.additionalSheets ?? []),
    ].map((sheet: { file: string }) => decodeSourceRgbaPng(packed[sheet.file]));
    const errors: string[] = [],
      workerUrls: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("worker", (worker) => workerUrls.push(worker.url()));
    if (character === "male")
      await page.addInitScript(() => {
        Object.defineProperty(globalThis, "Worker", {
          configurable: true,
          value: undefined,
        });
      });
    await page.goto(`/workbench.html?mode=side-view&character=${character}`);
    await ready(page);
    await side(page)
      .getByTestId("side-project-input")
      .setInputFiles({
        name: `${character}-pr54.wardrobe.zip`,
        mimeType: "application/zip",
        buffer: projectBytes,
      });
    await ready(page);
    await expect(side(page).getByTestId("side-collection")).toHaveValue(
      "tailored",
    );
    if ((await stage(page).getAttribute("data-paused")) !== "true")
      await side(page).getByTestId("side-play-pause").click();
    await expect(stage(page)).toHaveAttribute("data-paused", "true");
    const poses =
      character === "male"
        ? [
            { action: "idle", frame: 0 },
            { action: "run", frame: 40 },
            { action: "jump", frame: 91 },
          ]
        : [
            { action: "walk", frame: 31 },
            { action: "run", frame: 40 },
            { action: "jump", frame: 67 },
          ];
    let lastPng: Buffer | undefined;
    for (const pose of poses) {
      const rect = manifest.frames.find(
        (frame: { id: number }) => frame.id === pose.frame,
      );
      const source = pages[rect.page ?? 0],
        expected = new Uint8Array(rect.width * rect.height * 4);
      for (let y = 0; y < rect.height; y++) {
        const at = ((rect.y + y) * source.width + rect.x) * 4;
        expected.set(
          source.pixels.subarray(at, at + rect.width * 4),
          y * rect.width * 4,
        );
      }
      await side(page).getByTestId(`side-action-${pose.action}`).click();
      await expect(stage(page)).toHaveAttribute("data-action", pose.action);
      await expect(side(page).getByTestId("side-frame")).toHaveAttribute(
        "max",
        String(manifest.animations[pose.action].frames.length - 1),
      );
      const index = manifest.animations[pose.action].frames.indexOf(pose.frame);
      for (const position of [index === 0 ? 1 : 0, index]) {
        await side(page).getByTestId("side-frame").fill(String(position));
        await expect(stage(page)).toHaveAttribute(
          "data-frame-position",
          String(position),
        );
      }
      for (const facing of ["right", "left"] as const) {
        await side(page).getByTestId(`side-facing-${facing}`).click();
        await expect(stage(page)).toHaveAttribute("data-facing", facing);
        lastPng = await download(page, "side-export-png");
        const png = decodeSourceRgbaPng(lastPng),
          oracle = new Uint8Array(expected.length);
        expect([png.width, png.height]).toEqual([rect.width, rect.height]);
        for (let y = 0; y < rect.height; y++)
          for (let x = 0; x < rect.width; x++) {
            const targetX = facing === "left" ? rect.width - 1 - x : x,
              at = (y * rect.width + x) * 4;
            oracle.set(
              expected.subarray(at, at + 4),
              (y * rect.width + targetX) * 4,
            );
          }
        expect(
          sha(png.pixels),
          `${character} PR54 frame ${pose.frame} ${facing}`,
        ).toBe(sha(oracle));
      }
    }
    const saved = unzipSync(await download(page, "side-save-project")),
      savedDocument = parse(saved["document.json"]);
    for (const key of [
      "sourceSha256",
      "registrationSha256",
      "items",
      "selection",
      "appearance",
    ])
      expect(savedDocument[key]).toEqual(document[key]);
    for (const [name, bytes] of Object.entries(previous)) {
      if (name === "document.json") continue;
      expect(saved[name], `Saved embedded file ${name}`).toBeDefined();
      expect(sha(saved[name])).toBe(sha(bytes));
    }
    expect(savedDocument.preview).toEqual({ action: "jump", facing: "left" });
    if (character === "male") {
      expect(
        workerUrls,
        "Unavailable Worker takes the exact strict fallback path",
      ).toEqual([]);
      // Valid ZIPs and updated project hash isolate the inner PNG parser; this
      // must not be rejected merely because the archive signature/hash is bad.
      const corrupt = { ...previous },
        badItem = unzipSync(corrupt["item-0.zip"]),
        itemManifest = parse(badItem["manifest.json"]);
      const pageName = itemManifest.pages[0].file;
      badItem[pageName] = new Uint8Array(badItem[pageName]);
      badItem[pageName][0] ^= 255;
      corrupt["item-0.zip"] = zipSync(badItem);
      const badDocument = structuredClone(document);
      badDocument.items[0].sha256 = sha(corrupt["item-0.zip"]);
      corrupt["document.json"] = strToU8(JSON.stringify(badDocument));
      await side(page)
        .getByTestId("side-project-input")
        .setInputFiles({
          name: "invalid-inner-garment.wardrobe.zip",
          mimeType: "application/zip",
          buffer: Buffer.from(zipSync(corrupt)),
        });
      await expect(panel(page)).toHaveAttribute("aria-busy", "false", {
        timeout: 180_000,
      });
      await expect(panel(page).getByRole("alert")).toContainText(/PNG/);
      await expect(stage(page)).toHaveAttribute("data-character", character);
      expect(
        JSON.parse((await stage(page).getAttribute("data-selection"))!),
      ).toEqual(document.selection);
      expect(
        await download(page, "side-export-png"),
        "Rejected inner artwork cannot replace the accepted renderer",
      ).toEqual(lastPng);
    } else expect(workerUrls.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}
