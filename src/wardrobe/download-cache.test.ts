import { afterEach, expect, it, vi } from "vitest";
import { sha256 } from "../core/sha256";
import { createWardrobeDownloads } from "./download-cache";
afterEach(() => vi.unstubAllGlobals());
it("reuses verified bytes, isolates returned arrays and evicts least-recently used files within budget", async () => {
  const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal("fetch", fetcher);
  const cache = createWardrobeDownloads(6),
    hash = await sha256(new Uint8Array([1, 2, 3]));
  (await cache.load("a", 3, { sha256: hash }))[0] = 9;
  await cache.load("b", 3, { sha256: hash });
  expect(await cache.load("a", 3, { sha256: hash })).toEqual(
    new Uint8Array([1, 2, 3]),
  );
  await cache.load("c", 3, { sha256: hash });
  expect(cache.bytes).toBe(6);
  await cache.load("b", 3, { sha256: hash });
  expect(fetcher).toHaveBeenCalledTimes(4);
  await expect(cache.load("b", 2, { sha256: hash })).rejects.toThrow("size");
  cache.clear();
  expect(cache.bytes).toBe(0);
});
it("does not cache corruption, aborted responses or unchecked files", async () => {
  const bytes = new Uint8Array([4, 5]),
    hash = await sha256(bytes);
  const fetcher = vi.fn(async () => new Response(bytes));
  vi.stubGlobal("fetch", fetcher);
  const cache = createWardrobeDownloads();
  await expect(
    cache.load("file", 4, { sha256: "a".repeat(64) }),
  ).rejects.toThrow("library entry");
  const controller = new AbortController();
  await expect(
    cache.load("file", 4, {
      sha256: hash,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    }),
  ).rejects.toThrow();
  expect(cache.bytes).toBe(0);
  await cache.load("file", 4);
  await cache.load("file", 4);
  expect(cache.bytes).toBe(0);
  await cache.load("file", 4, { sha256: hash });
  await cache.load("file", 4, { sha256: hash });
  expect(fetcher).toHaveBeenCalledTimes(5);
});
it("enforces a byte limit even when content-length is missing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array(7))),
  );
  const cache = createWardrobeDownloads();
  await expect(
    cache.load("oversize", 6, { sha256: "a".repeat(64) }),
  ).rejects.toThrow("size");
  expect(cache.bytes).toBe(0);
});
