import { expect, test } from "@playwright/test";
import { zipSync } from "fflate";
import { encodeSourceRgbaPng } from "../../src/core/baked-source";

test("real preparation workers cancel independently and preserve strict fallback parity", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [],
    workers: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("worker", (worker) => workers.push(worker.url()));
  await page.route("**/worker-lifecycle-check.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Worker contract check</title>",
    }),
  );
  await page.goto("/worker-lifecycle-check.html");
  const png = (pixels: number[]) =>
    encodeSourceRgbaPng({
      width: 2,
      height: 1,
      pixels: new Uint8Array(pixels),
      colorChunks: [],
    });
  const patch = png([61, 92, 11, 128, 91, 42, 203, 0]),
    ownership = png([0, 0, 0, 255, 0, 0, 0, 0]);
  const archive = zipSync({ "a.bin": new Uint8Array([1, 2, 3]) });
  const result = await page.evaluate(
    async ({ patch, ownership, archive }) => {
      const pageModule = "/src/wardrobe/garment-page-preparation.ts";
      const sourceModule = "/src/core/source-preparation.ts";
      const { prepareGarmentPage } = await import(
        /* @vite-ignore */ pageModule
      );
      const { prepareBoundedArchive } = await import(
        /* @vite-ignore */ sourceModule
      );
      const p = new Uint8Array(patch),
        o = new Uint8Array(ownership),
        z = new Uint8Array(archive);
      const dimensions = { width: 2, height: 1 };
      const abort = new AbortController();
      const cancelled = prepareGarmentPage(p, o, dimensions, {
        signal: abort.signal,
      }).then(
        () => "unexpected success",
        (error: Error) => error.name,
      );
      abort.abort();
      const successful = await prepareGarmentPage(p, o, dimensions);
      const policy = {
        label: "browser fixture",
        maxArchiveBytes: 1024,
        maxExpandedBytes: 3,
        minFiles: 1,
        maxFiles: 1,
        files: { "a.bin": 3 },
        required: ["a.bin"],
      };
      const read = await prepareBoundedArchive(z, policy);
      const broken = p.slice();
      broken[broken.length - 1] ^= 1;
      const invalid = await prepareGarmentPage(broken, o, dimensions).then(
        () => false,
        () => true,
      );
      const nativeWorker = globalThis.Worker;
      let fallback, fallbackArchive;
      try {
        Object.defineProperty(globalThis, "Worker", {
          value: undefined,
          writable: true,
          configurable: true,
        });
        fallback = await prepareGarmentPage(p, o, dimensions);
        fallbackArchive = await prepareBoundedArchive(z, policy);
      } finally {
        Object.defineProperty(globalThis, "Worker", {
          value: nativeWorker,
          writable: true,
          configurable: true,
        });
      }
      return {
        cancelled: await cancelled,
        pixels: Array.from(successful.patch.pixels),
        ownership: Array.from(successful.ownership),
        fallbackPixels: Array.from(fallback.patch.pixels),
        fallbackOwnership: Array.from(fallback.ownership),
        archive: Array.from(read["a.bin"]),
        fallbackArchive: Array.from(fallbackArchive["a.bin"]),
        originalPatch: Array.from(p),
        originalOwnership: Array.from(o),
        invalid,
      };
    },
    {
      patch: Array.from(patch),
      ownership: Array.from(ownership),
      archive: Array.from(archive),
    },
  );
  expect(result.cancelled).toBe("AbortError");
  expect(result.pixels).toEqual([61, 92, 11, 128, 91, 42, 203, 0]);
  expect(result.ownership).toEqual([255, 0]);
  expect(result.fallbackPixels).toEqual(result.pixels);
  expect(result.fallbackOwnership).toEqual(result.ownership);
  expect(result.archive).toEqual([1, 2, 3]);
  expect(result.fallbackArchive).toEqual(result.archive);
  expect(result.originalPatch).toEqual(Array.from(patch));
  expect(result.originalOwnership).toEqual(Array.from(ownership));
  expect(result.invalid).toBe(true);
  expect(
    workers.some((url) => url.includes("garment-page-preparation.worker")),
  ).toBe(true);
  expect(workers.some((url) => url.includes("source-preparation.worker"))).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
