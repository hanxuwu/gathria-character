import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSideAsset, SideSourceCache } from "./source-cache";

const digest = async (bytes: Uint8Array) => [...bytes].join(",");
const payload = new Uint8Array([1, 2, 3]);
const hash = "1,2,3";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, no) => {
    resolve = ok;
    reject = no;
  });
  return { promise, resolve, reject };
}

afterEach(() => vi.unstubAllGlobals());

describe("frozen side-view source cache", () => {
  it("deduplicates concurrent readers and never shares mutable public bytes", async () => {
    const pending = deferred<Uint8Array>();
    const load = vi.fn(() => pending.promise);
    const cache = new SideSourceCache(load, digest);
    const a = cache.get("source.zip", hash);
    const b = cache.get("source.zip", hash);
    pending.resolve(payload);
    const first = await a;
    const second = await b;
    first[0] = 99;
    payload[1] = 88;
    expect([...second]).toEqual([1, 2, 3]);
    expect([...(await cache.get("source.zip", hash))]).toEqual([1, 2, 3]);
    expect(load).toHaveBeenCalledTimes(1);
    payload[1] = 2;
  });

  it("cancels only the departing reader while another still needs the source", async () => {
    const pending = deferred<Uint8Array>();
    let transportSignal: AbortSignal | undefined;
    const load = vi.fn((_url: string, signal?: AbortSignal) => {
      transportSignal = signal;
      return pending.promise;
    });
    const cache = new SideSourceCache(load, digest);
    const controller = new AbortController();
    const a = cache.get("source.zip", hash, controller.signal);
    const rejection = expect(a).rejects.toMatchObject({ name: "AbortError" });
    const b = cache.get("source.zip", hash);
    controller.abort();
    await rejection;
    expect(transportSignal?.aborted).toBe(false);
    pending.resolve(new Uint8Array([1, 2, 3]));
    expect([...(await b)]).toEqual([1, 2, 3]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("abandons transport after all readers cancel and retries without joining it", async () => {
    const stalled = deferred<Uint8Array>();
    let firstSignal: AbortSignal | undefined;
    const load = vi
      .fn((_url: string, signal?: AbortSignal) => {
        firstSignal = signal;
        return stalled.promise;
      })
      .mockImplementationOnce((_url, signal) => {
        firstSignal = signal;
        return stalled.promise;
      })
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
    const cache = new SideSourceCache(load, digest);
    const controller = new AbortController();
    const first = cache.get("source.zip", hash, controller.signal);
    const rejection = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await rejection;
    expect(firstSignal?.aborted).toBe(true);
    expect([...(await cache.get("source.zip", hash))]).toEqual([1, 2, 3]);
    // A transport that ignores cancellation must not populate a stale entry.
    stalled.resolve(new Uint8Array([1, 2, 3]));
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not cache network errors or failed integrity checks", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Uint8Array([7]))
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
    const cache = new SideSourceCache(load, digest);
    await expect(cache.get("source.zip", hash)).rejects.toThrow("offline");
    await expect(cache.get("source.zip", hash)).rejects.toThrow("来源校验失败");
    expect([...(await cache.get("source.zip", hash))]).toEqual([1, 2, 3]);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("includes source hash in identity, even when a URL stays the same", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(new Uint8Array([1]))
      .mockResolvedValueOnce(new Uint8Array([2]));
    const cache = new SideSourceCache(load, digest);
    expect([...(await cache.get("source.zip", "1"))]).toEqual([1]);
    expect([...(await cache.get("source.zip", "2"))]).toEqual([2]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("bounds bytes and keeps only two sources with least-recently-used eviction", async () => {
    const load = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const cache = new SideSourceCache(load, digest, 6);
    await cache.get("a", hash);
    await cache.get("b", hash);
    await cache.get("a", hash); // b is now least recently used.
    await cache.get("c", hash);
    await cache.get("a", hash);
    expect(load).toHaveBeenCalledTimes(3);
    await cache.get("b", hash);
    expect(load).toHaveBeenCalledTimes(4);
    const small = new SideSourceCache(load, digest, 4);
    await small.get("a", hash);
    await small.get("b", hash);
    await small.get("a", hash);
    expect(load).toHaveBeenCalledTimes(7);
  });

  it("returns oversized valid inputs without retaining them", async () => {
    const load = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const cache = new SideSourceCache(load, digest, 2);
    await cache.get("a", hash);
    await cache.get("a", hash);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("rejects pre-aborted callers even when bytes are already cached", async () => {
    const load = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const cache = new SideSourceCache(load, digest);
    await cache.get("a", hash);
    const controller = new AbortController();
    controller.abort();
    await expect(cache.get("a", hash, controller.signal)).rejects.toMatchObject(
      {
        name: "AbortError",
      },
    );
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("side asset transport bounds", () => {
  it("rejects HTTP failures and empty assets", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("missing", { status: 404 }))
      .mockResolvedValueOnce(new Response(new Uint8Array()));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchSideAsset("missing.zip")).rejects.toThrow("404");
    await expect(fetchSideAsset("empty.zip")).rejects.toThrow("为空");
  });

  it("rejects excessive declared length before reading the response body", async () => {
    const body = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({
          "content-length": String(64 * 1024 * 1024 + 1),
        }),
        arrayBuffer: body,
      }),
    );
    await expect(fetchSideAsset("large.zip")).rejects.toThrow("超出");
    expect(body).not.toHaveBeenCalled();
  });
});
