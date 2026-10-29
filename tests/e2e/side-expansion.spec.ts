import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";

const stage = (page: Page) => page.getByTestId("side-stage");
async function ready(page: Page) {
  await expect(page.getByTestId("side-playground")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180_000 },
  );
  await expect(
    page.getByTestId("side-playground").getByRole("alert"),
  ).toHaveCount(0);
  await expect(stage(page)).toBeVisible();
}
async function pose(page: Page, action = "run", frame = 4, facing = "right") {
  if ((await stage(page).getAttribute("data-paused")) === "false")
    await page.getByTestId("side-play-pause").click();
  await page.getByTestId("side-action-idle").click();
  await page.getByTestId(`side-facing-${facing}`).click();
  await page.getByTestId(`side-action-${action}`).click();
  for (const position of [frame === 0 ? 1 : 0, frame]) {
    await page.getByTestId("side-frame").fill(String(position));
    await expect(stage(page)).toHaveAttribute(
      "data-frame-position",
      String(position),
    );
  }
}
async function download(page: Page, id: string, path?: string) {
  const waiting = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByTestId(id).click();
  const result = await waiting;
  expect(await result.failure()).toBeNull();
  if (path) await result.saveAs(path);
  const bytes = await readFile(path ?? (await result.path())!);
  await ready(page);
  return bytes;
}

for (const character of ["male", "female"] as const) {
  test(`${character}: separate real-cut edition, exact mirror, hair mix and self-contained reopen`, async ({
    page,
  }) => {
    test.setTimeout(360_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await mkdir("/tmp/side-expansion/qa", { recursive: true });
    const directory = await mkdtemp("/tmp/side-expansion/qa/e2e-");
    try {
      await page.goto(
        `/workbench.html?mode=side-view&collection=tailored&character=${character}`,
      );
      await ready(page);
      await expect(page.getByTestId("side-collection")).toHaveValue("tailored");
      await expect(page.getByTestId("side-hair")).toHaveValue("");
      const outfit = JSON.parse(
        (await stage(page).getAttribute("data-selection"))!,
      );
      expect(outfit.top).toBeTruthy();
      expect(outfit.bottom).toBeTruthy();
      await pose(page);
      const right = decodeSourceRgbaPng(
        await download(page, "side-export-png"),
      );
      await page.getByTestId("side-ground").check();
      await page.getByTestId("side-anchors").check();
      await page.getByTestId("side-comparison").check();
      const guides = decodeSourceRgbaPng(
        await download(page, "side-export-png"),
      );
      expect(guides.pixels).toEqual(right.pixels);
      await page.getByTestId("side-anchors").uncheck();
      await page.getByTestId("side-comparison").uncheck();
      await pose(page, "run", 4, "left");
      const left = decodeSourceRgbaPng(await download(page, "side-export-png"));
      expect([left.width, left.height]).toEqual([right.width, right.height]);
      const reflected = new Uint8Array(right.pixels.length);
      for (let y = 0; y < right.height; y++)
        for (let x = 0; x < right.width; x++) {
          const from = (y * right.width + x) * 4,
            to = (y * right.width + right.width - x - 1) * 4;
          reflected.set(right.pixels.subarray(from, from + 4), to);
        }
      expect(left.pixels).toEqual(reflected);
      await page.getByTestId("side-top").selectOption("");
      await ready(page);
      await expect(page.getByTestId("side-bottom")).toHaveValue(outfit.bottom);
      const hairIds = await page
        .getByTestId("side-hair")
        .locator("option")
        .evaluateAll((items) =>
          items.map((i) => (i as HTMLOptionElement).value).filter(Boolean),
        );
      expect(hairIds.length).toBeGreaterThan(0);
      await page.getByTestId("side-hair").selectOption(hairIds[0]);
      await ready(page);
      await page.getByTestId("side-hair-color").selectOption("espresso");
      await ready(page);
      await pose(page, "run", 4, "left");
      const mixed = await download(page, "side-export-png");
      const path = `${directory}/mixed.wardrobe.zip`;
      const saved = await download(page, "side-save-project", path);
      const entries = unzipSync(saved),
        document = JSON.parse(Buffer.from(entries["document.json"]).toString());
      expect(document.selection).toEqual({ ...outfit, top: null });
      expect(document.appearance.hairId).toBe(hairIds[0]);
      expect(document.appearance.hairColor).toBe("espresso");
      expect(document.preview).toEqual({ action: "run", facing: "left" });
      expect(entries["source.character.zip"].length).toBeGreaterThan(1_000_000);
      expect(entries["appearance.zip"].length).toBeGreaterThan(0);
      const registration = JSON.parse(
        Buffer.from(entries["registration.json"]).toString(),
      );
      expect(registration.frames).toHaveLength(
        character === "male" ? 107 : 102,
      );
      await page.reload();
      await ready(page);
      await page.getByTestId("side-project-input").setInputFiles(path);
      await ready(page);
      await expect(page.getByTestId("side-collection")).toHaveValue("tailored");
      await expect(page.getByTestId("side-hair")).toHaveValue(hairIds[0]);
      await expect(page.getByTestId("side-hair-color")).toHaveValue("espresso");
      await pose(page, "run", 4, "left");
      expect(await download(page, "side-export-png")).toEqual(mixed);
      await page.getByTestId("side-project-input").setInputFiles({
        name: "bad.wardrobe.zip",
        mimeType: "application/zip",
        buffer: Buffer.from("broken project"),
      });
      await expect(
        page.getByTestId("side-playground").getByRole("alert"),
      ).toBeVisible();
      await expect(page.getByTestId("side-playground")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      await expect(page.getByTestId("side-retry-load")).toHaveCount(0);
      await expect(page.getByTestId("side-collection")).toHaveValue("tailored");
      await expect(page.getByTestId("side-hair")).toHaveValue(hairIds[0]);
      expect(await download(page, "side-export-png")).toEqual(mixed);
      expect(errors).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("legacy material stays the default and its project switches back from the new edition", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await mkdir("/tmp/side-expansion/qa", { recursive: true });
  const directory = await mkdtemp("/tmp/side-expansion/qa/e2e-");
  try {
    await page.goto("/workbench.html?mode=side-view&character=male");
    await ready(page);
    await expect(page.getByTestId("side-collection")).toHaveValue("material");
    await page.getByTestId("side-look-daily").click();
    await ready(page);
    await pose(page);
    const png = await download(page, "side-export-png");
    const path = `${directory}/legacy.wardrobe.zip`;
    const saved = await download(page, "side-save-project", path);
    const entries = unzipSync(saved);
    expect(entries["registration.json"]).toEqual(
      new Uint8Array(
        await readFile(
          "docs/kling-side-workspace/assets/male.registration.json",
        ),
      ),
    );
    await page.getByTestId("side-collection").selectOption("tailored");
    await ready(page);
    await expect(stage(page)).toHaveAttribute("data-collection", "tailored");
    await page.getByTestId("side-project-input").setInputFiles(path);
    await ready(page);
    await expect(page.getByTestId("side-collection")).toHaveValue("material");
    await pose(page);
    expect(await download(page, "side-export-png")).toEqual(png);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("paused explicit facing clears a left turn queued during the full jump", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto(
    "/workbench.html?mode=side-view&collection=tailored&character=male",
  );
  await ready(page);
  await pose(page, "jump", 0, "right");
  await page.getByTestId("side-play-pause").click();
  await stage(page).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(stage(page)).toHaveAttribute("data-action", "jump");
  await expect(stage(page)).toHaveAttribute("data-facing", "right");
  await page.getByTestId("side-play-pause").click();
  await expect(stage(page)).toHaveAttribute("data-paused", "true");
  await page.getByTestId("side-facing-right").click();
  await page.getByTestId("side-action-idle").click();
  await expect(stage(page)).toHaveAttribute("data-action", "idle");
  await expect(stage(page)).toHaveAttribute("data-facing", "right");
  await page.getByTestId("side-play-pause").click();
  await expect(stage(page)).toHaveAttribute("data-paused", "false");
  await expect
    .poll(async () =>
      Number(await stage(page).getAttribute("data-frame-position")),
    )
    .toBeGreaterThan(1);
  await expect(stage(page)).toHaveAttribute("data-facing", "right");
});

test("failed new collection load retains material session and retries the requested collection", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto("/workbench.html?mode=side-view&character=male");
  await ready(page);
  await pose(page);
  const previousSelection = await stage(page).getAttribute("data-selection");
  const route =
    "**/artwork/kling-side-expansion/templates/male.registration.json*";
  await page.route(route, (r) =>
    r.fulfill({
      status: 503,
      contentType: "text/plain",
      body: "Controlled new-edition failure",
    }),
  );
  await page.getByTestId("side-collection").selectOption("tailored");
  await expect(
    page.getByTestId("side-playground").getByRole("alert"),
  ).toContainText("503");
  await expect(page.getByTestId("side-playground")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(stage(page)).toHaveAttribute("data-collection", "material");
  await expect(stage(page)).toHaveAttribute(
    "data-selection",
    previousSelection!,
  );
  await expect(page.getByTestId("side-retry-load")).toBeVisible();
  await page.unroute(route);
  await page.getByTestId("side-retry-load").click();
  await ready(page);
  await expect(stage(page)).toHaveAttribute("data-collection", "tailored");
  await expect(page.getByTestId("side-collection")).toHaveValue("tailored");
  await expect(page.getByTestId("side-retry-load")).toHaveCount(0);
});
