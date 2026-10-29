import { readFile, mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";

const evidence = "/tmp/side-fitting/workbench/browser";
async function ready(page: Page) {
  await expect(page.getByTestId("side-playground")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180_000 },
  );
}
async function download(page: Page, click: () => Promise<void>) {
  const waiting = page.waitForEvent("download", { timeout: 180_000 });
  await click();
  const result = await waiting;
  expect(await result.failure()).toBeNull();
  return readFile((await result.path())!);
}
async function open(page: Page, character: "male" | "female") {
  await page.goto(
    `/workbench.html?mode=side-view&collection=tailored&character=${character}`,
  );
  await ready(page);
  await page.getByTestId("side-play-pause").click();
  await page.getByTestId("side-action-run").click();
  await page.getByTestId("side-frame").fill("4");
  await page.getByTestId("side-fitting-toggle").click();
  await expect(page.getByTestId("side-fitting")).toBeVisible();
  await expect(page.getByTestId("side-stage")).toHaveAttribute(
    "data-paused",
    "true",
  );
  await page.getByTestId("fitting-guides").uncheck();
}

test("side fitting keeps source guides exact, audits every action, and round-trips a corrected garment", async ({
  page,
}) => {
  test.setTimeout(480_000);
  await mkdir(evidence, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (cause) => errors.push(cause.message));
  await open(page, "male");
  const pngBefore = await download(page, () =>
    page.getByTestId("side-export-png").click(),
  );
  await ready(page);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("side-stage")).toHaveAttribute(
    "data-paused",
    "true",
  );
  await page.getByTestId("fitting-guides").check();
  expect(
    await download(page, () => page.getByTestId("side-export-png").click()),
  ).toEqual(pngBefore);
  await ready(page);
  await page.getByTestId("fitting-audit").click();
  await expect(page.getByTestId("fitting-audit-results")).toBeVisible({
    timeout: 120_000,
  });
  const audit = JSON.parse(
    (
      await download(page, () =>
        page.getByTestId("fitting-audit-export").click(),
      )
    ).toString(),
  );
  expect(
    new Set(audit.rows.map((r: { frameId: number }) => r.frameId)).size,
  ).toBe(107);
  expect(
    audit.rows.every(
      (r: { protectedOwnedPixels: number; unownedPaintPixels: number }) =>
        r.protectedOwnedPixels === 0 && r.unownedPaintPixels === 0,
    ),
  ).toBe(true);
  const jump = audit.rows.filter(
    (r: { action: string }) => r.action === "jump",
  );
  expect(jump.at(-1).nextFrameId).toBeNull();
  const guides = unzipSync(
    await download(page, () =>
      page.getByTestId("fitting-guides-export").click(),
    ),
  );
  expect(guides["registration.json"]).toEqual(
    new Uint8Array(
      await readFile(
        "artwork/kling-side-expansion/templates/male.registration.json",
      ),
    ),
  );
  expect(guides["base.garment.zip"]).toEqual(
    new Uint8Array(
      await readFile("docs/kling-side-expansion/assets/male-shirt.garment.zip"),
    ),
  );
  await page.getByTestId("fitting-guides").uncheck();
  const coordinate = await page
    .getByTestId("fitting-cloth")
    .evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const pixels = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      for (
        let y = Math.floor(canvas.height * 0.58);
        y < canvas.height * 0.7;
        y++
      )
        for (
          let x = Math.floor(canvas.width * 0.45);
          x < canvas.width * 0.6;
          x++
        ) {
          let solid = true;
          for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++)
              if (pixels[((y + dy) * canvas.width + x + dx) * 4 + 3] !== 255)
                solid = false;
          if (solid) return { x, y };
        }
      throw Error("No solid clothing sample in torso");
    });
  await page.getByTestId("fitting-guides").check();
  await page
    .getByTestId("side-fitting")
    .screenshot({ path: `${evidence}/male-fitting-desktop.png` });
  await page.getByTestId("fitting-repair").click();
  const dialog = page.getByRole("dialog", { name: "Clothing mask workbench" });
  await expect(
    dialog.getByRole("button", { name: "Restore source", exact: true }),
  ).toBeEnabled({ timeout: 180_000 });
  await dialog.getByLabel("Brush size", { exact: true }).fill("1");
  await dialog
    .getByLabel("Native X", { exact: true })
    .fill(String(coordinate.x));
  await dialog
    .getByLabel("Native Y", { exact: true })
    .fill(String(coordinate.y));
  await dialog
    .getByRole("button", { name: "Restore source", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Apply brush at coordinates" })
    .click();
  await expect(dialog.getByTestId("mask-pose-status")).toContainText(
    "5 changed pixels",
  );
  await dialog.getByRole("button", { name: "Undo stroke" }).click();
  await expect(dialog.getByTestId("mask-pose-status")).toContainText(
    "0 changed pixels",
  );
  await dialog
    .getByRole("button", { name: "Apply brush at coordinates" })
    .click();
  await dialog.getByRole("button", { name: "Reset pose" }).click();
  await expect(dialog.getByTestId("mask-pose-status")).toContainText(
    "0 changed pixels",
  );
  await dialog
    .getByRole("button", { name: "Apply brush at coordinates" })
    .click();
  await dialog
    .getByRole("button", { name: "Accept pose", exact: true })
    .click();
  const draft = await download(page, () =>
    dialog.getByRole("button", { name: "Save mask draft" }).click(),
  );
  await dialog.getByRole("button", { name: "Close mask workbench" }).click();
  expect(
    await download(page, () => page.getByTestId("side-export-png").click()),
  ).toEqual(pngBefore);
  await ready(page);
  await page.getByTestId("fitting-repair").click();
  await expect(
    dialog.getByRole("button", { name: "Open mask draft" }),
  ).toBeEnabled({ timeout: 180_000 });
  await dialog.getByLabel("Mask draft file", { exact: true }).setInputFiles({
    name: "saved.json",
    mimeType: "application/json",
    buffer: draft,
  });
  await expect(dialog.getByTestId("mask-pose-status")).toContainText(
    "accepted",
  );
  await expect(dialog.getByTestId("mask-pose-status")).toContainText(
    "5 changed pixels",
  );
  const invalid = JSON.parse(draft.toString());
  invalid.binding.itemSha256 = "f".repeat(64);
  await dialog.getByLabel("Mask draft file", { exact: true }).setInputFiles({
    name: "wrong.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(dialog.getByRole("alert")).toContainText("different source");
  await expect(dialog.getByTestId("mask-pose-status")).toContainText(
    "5 changed pixels",
  );
  await dialog
    .getByLabel("New clothing ID", { exact: true })
    .fill("side-fitting-browser-proof");
  await dialog
    .getByLabel("New clothing name", { exact: true })
    .fill("Fitting browser proof · five restored pixels");
  await dialog
    .getByRole("button", { name: "Preview corrected clothing" })
    .click();
  const candidate = page.getByRole("dialog", {
    name: "Preview imported clothing",
  });
  await expect(candidate).toBeVisible({ timeout: 180_000 });
  await candidate.getByLabel("Candidate preview facing").selectOption("left");
  await expect(
    candidate.getByTestId("garment-candidate-after"),
  ).toHaveAttribute("aria-label", /left/);
  await candidate.getByLabel("Candidate preview facing").selectOption("right");
  await candidate.screenshot({
    path: `${evidence}/male-corrected-candidate.png`,
  });
  await candidate
    .getByRole("button", { name: "Apply clothing candidate", exact: true })
    .click();
  await expect(candidate).toHaveCount(0, { timeout: 180_000 });
  await ready(page);
  await expect(page.getByTestId("side-stage")).toHaveAttribute(
    "data-selection",
    /side-fitting-browser-proof/,
  );
  const corrected = await download(page, () =>
    page.getByTestId("side-export-png").click(),
  );
  await ready(page);
  const before = decodeSourceRgbaPng(pngBefore),
    after = decodeSourceRgbaPng(corrected);
  expect([after.width, after.height]).toEqual([before.width, before.height]);
  let changed = 0;
  for (let i = 0; i < before.pixels.length; i += 4)
    if ([0, 1, 2, 3].some((c) => before.pixels[i + c] !== after.pixels[i + c]))
      changed++;
  expect(changed).toBe(5);
  const saved = await download(page, () =>
    page.getByTestId("side-save-project").click(),
  );
  await ready(page);
  const savedFiles = unzipSync(saved);
  expect(savedFiles["source.character.zip"]).toEqual(
    new Uint8Array(
      await readFile("docs/kling-side-workspace/assets/male.source.zip"),
    ),
  );
  expect(savedFiles["registration.json"]).toEqual(guides["registration.json"]);
  await page.reload();
  await ready(page);
  await page.getByTestId("side-project-input").setInputFiles({
    name: "corrected.wardrobe.zip",
    mimeType: "application/zip",
    buffer: saved,
  });
  await ready(page);
  await page.getByTestId("side-frame").fill("4");
  expect(
    await download(page, () => page.getByTestId("side-export-png").click()),
  ).toEqual(corrected);
  expect(errors).toEqual([]);
});

test("female fitting shows original anchors, cancels draft safely and fits a narrow screen", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await mkdir(evidence, { recursive: true });
  await open(page, "female");
  await page
    .getByTestId("fitting-item")
    .selectOption("side-female-rose-skirt-v1");
  await page.getByTestId("fitting-action").selectOption("jump");
  await page.getByTestId("fitting-position").fill("49");
  await expect(page.getByTestId("fitting-frame")).toContainText("视频帧 249");
  await page.getByTestId("fitting-guides").check();
  await page.getByTestId("fitting-audit").click();
  await expect(page.getByTestId("fitting-audit-results")).toBeVisible({
    timeout: 120_000,
  });
  const before = await download(page, () =>
    page.getByTestId("side-export-png").click(),
  );
  await ready(page);
  await page.getByTestId("fitting-repair").click();
  const dialog = page.getByRole("dialog", { name: "Clothing mask workbench" });
  await expect(
    dialog.getByRole("button", { name: "Restore source", exact: true }),
  ).toBeEnabled({ timeout: 180_000 });
  await dialog.getByRole("button", { name: "Close mask workbench" }).click();
  expect(
    await download(page, () => page.getByTestId("side-export-png").click()),
  ).toEqual(before);
  await ready(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("fitting-zoom").selectOption("2");
  const widths = await page.getByTestId("side-fitting").evaluate((element) => ({
    body: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    panel: element.getBoundingClientRect().width,
  }));
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.panel).toBeLessThanOrEqual(widths.viewport);
  await page.getByTestId("fitting-zoom").selectOption("fit");
  await page
    .getByTestId("side-fitting")
    .screenshot({ path: `${evidence}/female-fitting-mobile.png` });
});
