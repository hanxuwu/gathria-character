import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { strToU8, unzipSync, zipSync, zlibSync } from "fflate";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";
import { crc32 } from "../../src/core/bounded-archive";
import { installWardrobeFixture } from "./wardrobe-fixture";

type WorkerEvidence = {
  completed: string[];
  rejected: string[];
  errors: number;
};
type ObservedWindow = Window & { sourceWorkerEvidence?: WorkerEvidence };

async function observeWorkers(page: Page) {
  await page.addInitScript(() => {
    const evidence: WorkerEvidence = { completed: [], rejected: [], errors: 0 };
    (window as ObservedWindow).sourceWorkerEvidence = evidence;
    const NativeWorker = Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (!String(url).includes("source-preparation.worker")) return;
        this.addEventListener("message", ({ data }) => {
          if (data.ok === true) evidence.completed.push(data.kind);
          else if (data.ok === false) evidence.rejected.push(data.message);
        });
        this.addEventListener("error", () => evidence.errors++);
        this.addEventListener("messageerror", () => evidence.errors++);
      }
    };
  });
}

const sourcePixels = (source: Uint8Array) => {
  const image = decodeSourceRgbaPng(unzipSync(source)["spritesheet.png"]);
  return Array.from({ length: 8 }, (_, y) =>
    Array.from(image.pixels.subarray(y * 16 * 4, (y * 16 + 8) * 4)),
  ).flat();
};

async function previewPixels(page: Page) {
  return page
    .getByTestId("wardrobe-preview")
    .evaluate((canvas: HTMLCanvasElement) =>
      Array.from(
        canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height)
          .data,
      ),
    );
}

test("cold preparation waits for real workers before enabling the exact source preview", async ({
  page,
}) => {
  const fixtures = await installWardrobeFixture(page);
  await observeWorkers(page);
  let releaseWorker!: () => void;
  const workerGate = new Promise<void>((resolve) => {
    releaseWorker = resolve;
  });
  let workerRequested!: () => void;
  const requested = new Promise<void>((resolve) => {
    workerRequested = resolve;
  });
  let workers = 0;
  let closedWorkers = 0;
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("worker", (worker) => {
    if (!worker.url().includes("source-preparation.worker")) return;
    workers++;
    worker.on("close", () => closedWorkers++);
  });
  await page.route("**/*source-preparation.worker*", async (route) => {
    workerRequested();
    await workerGate;
    await route.continue();
  });
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  try {
    await requested;
    await expect(wardrobe.locator(".wardrobe-editor")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(wardrobe.getByLabel("Wardrobe character")).toBeDisabled();
    await expect(
      wardrobe.getByRole("button", { name: /Save wardrobe/ }),
    ).toBeDisabled();
    await expect(wardrobe.getByTestId("wardrobe-preview")).toHaveCount(0);
  } finally {
    releaseWorker();
  }
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await expect(wardrobe.getByLabel("Wardrobe character")).toBeEnabled();
  expect(await previewPixels(page)).toEqual(sourcePixels(fixtures.male.source));
  // Parsing and decoding use actual browser workers, then release them. A
  // silently failed worker followed by fallback must not pass this evidence.
  expect(workers).toBeGreaterThanOrEqual(2);
  await expect.poll(() => closedWorkers).toBe(workers);
  expect(
    await page.evaluate(() => (window as ObservedWindow).sourceWorkerEvidence),
  ).toEqual({ completed: ["archive", "png"], rejected: [], errors: 0 });
  expect(failures).toEqual([]);
});

test("a browser without Worker keeps the same checked source pixels and wardrobe flow", async ({
  page,
}) => {
  const fixtures = await installWardrobeFixture(page);
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "Worker", { value: undefined });
  });
  await page.goto("/workbench.html?character=female&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  expect(await previewPixels(page)).toEqual(
    sourcePixels(fixtures.female.source),
  );
  await wardrobe.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(wardrobe.getByRole("status")).toContainText("Daily selected");
  expect(await previewPixels(page)).not.toEqual(
    sourcePixels(fixtures.female.source),
  );
  await wardrobe.getByRole("button", { name: "Original", exact: true }).click();
  await expect(wardrobe.getByRole("status")).toContainText(
    "Original outfit selected",
  );
  expect(await previewPixels(page)).toEqual(
    sourcePixels(fixtures.female.source),
  );
  await expect(wardrobe.getByRole("alert")).toHaveCount(0);
});

function pngWithInvalidRowFilter(png: Uint8Array) {
  const ihdr = png.slice(8, 33);
  const scan = new Uint8Array((16 * 4 + 1) * 8);
  scan[0] = 5; // Valid ZIP, PNG CRC and zlib checksum, invalid RGBA row filter.
  const compressed = zlibSync(scan);
  const idat = new Uint8Array(12 + compressed.length);
  const view = new DataView(idat.buffer);
  view.setUint32(0, compressed.length);
  idat.set(strToU8("IDAT"), 4);
  idat.set(compressed, 8);
  view.setUint32(idat.length - 4, crc32(idat.subarray(4, idat.length - 4)));
  return new Uint8Array([
    ...png.subarray(0, 8),
    ...ihdr,
    ...idat,
    ...png.subarray(png.length - 12),
  ]);
}

test("worker pixel validation rejects a corrupt source before playback and Retry recovers", async ({
  page,
}) => {
  const fixtures = await installWardrobeFixture(page);
  await observeWorkers(page);
  const files = unzipSync(fixtures.male.source);
  files["spritesheet.png"] = pngWithInvalidRowFilter(files["spritesheet.png"]);
  const corrupt = zipSync(files);
  const registration = JSON.parse(
    new TextDecoder().decode(fixtures.male.registrationBytes),
  );
  registration.sourceSha256 = createHash("sha256")
    .update(corrupt)
    .digest("hex");
  let serveCorrupt = true;
  await page.route("**/fixture-wardrobe/male.character.zip", (route) =>
    route.fulfill({
      body: Buffer.from(serveCorrupt ? corrupt : fixtures.male.source),
    }),
  );
  await page.route("**/fixture-wardrobe/male.json", (route) =>
    route.fulfill({
      body: serveCorrupt
        ? JSON.stringify(registration)
        : Buffer.from(fixtures.male.registrationBytes),
    }),
  );
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  await expect(wardrobe.getByRole("alert")).toContainText(
    "Unsupported PNG row filter",
  );
  await expect(wardrobe.getByTestId("wardrobe-preview")).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as ObservedWindow).sourceWorkerEvidence),
  ).toEqual({
    completed: ["archive"],
    rejected: ["Unsupported PNG row filter."],
    errors: 0,
  });
  await expect(
    wardrobe.getByRole("button", { name: /Save wardrobe/ }),
  ).toBeDisabled();
  serveCorrupt = false;
  await wardrobe
    .getByRole("button", { name: "Retry loading", exact: true })
    .click();
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await expect(wardrobe.getByRole("alert")).toHaveCount(0);
  expect(await previewPixels(page)).toEqual(sourcePixels(fixtures.male.source));
});
