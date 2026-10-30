import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";

// Retained sessions keep their state; interactions target the active source only.
const side = (page: Page) =>
  page.locator('[data-testid="side-session"][data-active="true"]');

const stage = (page: Page) => side(page).getByTestId("side-stage");
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const parse = (bytes: Uint8Array) =>
  JSON.parse(Buffer.from(bytes).toString("utf8"));

async function ready(page: Page) {
  await expect(side(page).getByTestId("side-playground")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180_000 },
  );
  await expect(
    side(page).getByTestId("side-playground").getByRole("alert"),
  ).toHaveCount(0);
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
  test(`${character}: PR53 polished project preserves its embedded art and bindings across fitting`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const base = "docs/kling-side-polish/review";
    const projectBytes = await readFile(`${base}/${character}.wardrobe.zip`);
    const packBytes = await readFile(`${base}/${character}.character.zip`);
    const baseline = JSON.parse(
      await readFile("docs/kling-side-fitting/baseline.json", "utf8"),
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
        "Historical PR53 fixture must be pinned by the pre-fitting manifest",
      ).toBeTruthy();
      expect(sha(bytes)).toBe(record.sha256);
    }
    const oldFiles = unzipSync(projectBytes);
    const oldDocument = parse(oldFiles["document.json"]);
    const packed = unzipSync(packBytes);
    const manifest = parse(packed["manifest.json"]);
    const pages = [
      manifest.spritesheet,
      ...(manifest.additionalSheets ?? []),
    ].map((sheet: { file: string }) => decodeSourceRgbaPng(packed[sheet.file]));
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`/workbench.html?mode=side-view&character=${character}`);
    await ready(page);
    await expect(side(page).getByTestId("side-collection")).toHaveValue(
      "material",
    );
    await side(page)
      .getByTestId("side-project-input")
      .setInputFiles({
        name: `${character}-previous.wardrobe.zip`,
        mimeType: "application/zip",
        buffer: projectBytes,
      });
    await ready(page);
    await expect(side(page).getByTestId("side-collection")).toHaveValue(
      "tailored",
    );
    await expect(side(page).getByTestId("side-hair")).toHaveValue(
      oldDocument.appearance.hairId,
    );
    await expect(side(page).getByTestId("side-hair-color")).toHaveValue(
      oldDocument.appearance.hairColor,
    );
    if ((await stage(page).getAttribute("data-paused")) !== "true")
      await side(page).getByTestId("side-play-pause").click();

    // Actual previously baked artwork supplies the oracle, not the current renderer.
    const poses =
      character === "male"
        ? [
            { action: "walk", frame: 26 },
            { action: "jump", frame: 89 },
            { action: "jump", frame: 67 },
          ]
        : [
            { action: "walk", frame: 31 },
            { action: "run", frame: 49 },
            { action: "jump", frame: 95 },
          ];
    for (const pose of poses) {
      const rect = manifest.frames.find(
        (frame: { id: number }) => frame.id === pose.frame,
      );
      const source = pages[rect.page ?? 0];
      const expected = new Uint8Array(rect.width * rect.height * 4);
      for (let y = 0; y < rect.height; y++) {
        const offset = ((rect.y + y) * source.width + rect.x) * 4;
        expected.set(
          source.pixels.subarray(offset, offset + rect.width * 4),
          y * rect.width * 4,
        );
      }
      await side(page).getByTestId(`side-action-${pose.action}`).click();
      // The stage publishes its action/readout on the next animation tick.
      // Wait for the slider's new range before filling a jump position that
      // exceeds the previous walk range; do not race the browser's range check.
      await expect(stage(page)).toHaveAttribute("data-action", pose.action);
      await expect(side(page).getByTestId("side-frame")).toHaveAttribute(
        "max",
        String(manifest.animations[pose.action].frames.length - 1),
      );
      const index = manifest.animations[pose.action].frames.indexOf(pose.frame);
      await side(page).getByTestId("side-frame").fill(String(index));
      await expect(stage(page)).toHaveAttribute(
        "data-frame-id",
        String(pose.frame),
      );
      for (const facing of ["right", "left"] as const) {
        await side(page).getByTestId(`side-facing-${facing}`).click();
        const png = decodeSourceRgbaPng(
          await download(page, "side-export-png"),
        );
        expect([png.width, png.height]).toEqual([rect.width, rect.height]);
        const oracle = new Uint8Array(expected.length);
        for (let y = 0; y < rect.height; y++)
          for (let x = 0; x < rect.width; x++) {
            const targetX = facing === "left" ? rect.width - 1 - x : x;
            oracle.set(
              expected.subarray(
                (y * rect.width + x) * 4,
                (y * rect.width + x + 1) * 4,
              ),
              (y * rect.width + targetX) * 4,
            );
          }
        expect(
          sha(png.pixels),
          `${character} old frame ${pose.frame} ${facing}`,
        ).toBe(sha(oracle));
      }
    }
    const resaved = unzipSync(await download(page, "side-save-project"));
    const resavedDocument = parse(resaved["document.json"]);
    for (const field of [
      "sourceSha256",
      "registrationSha256",
      "items",
      "selection",
      "appearance",
    ])
      expect(resavedDocument[field]).toEqual(oldDocument[field]);
    for (const [name, bytes] of Object.entries(oldFiles)) {
      if (name === "document.json") continue;
      expect(resaved[name], `Previous embedded file ${name}`).toBeDefined();
      expect(sha(resaved[name])).toBe(sha(bytes));
    }
    expect(resavedDocument.preview).toEqual({ action: "jump", facing: "left" });
    expect(pageErrors).toEqual([]);
  });
}
