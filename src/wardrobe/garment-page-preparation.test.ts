import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeSourceRgbaPng } from "../core/baked-source";
import { crc32 } from "../core/bounded-archive";
import { prepareGarmentPageStrict } from "./garment-page-codec";
import {
  prepareGarmentPage,
  type GarmentPageRequest,
  type GarmentPageResponse,
} from "./garment-page-preparation";
import { decodedGarmentPage, validateGarmentPage } from "./garment-pages";

function fixture() {
  const srgb = new Uint8Array([0, 0, 0, 1, 115, 82, 71, 66, 0, 0, 0, 0, 0]);
  new DataView(srgb.buffer).setUint32(9, crc32(srgb.subarray(4, 9)));
  const dimensions = { width: 2, height: 1 };
  const png = (pixels: number[], profile = false) =>
    encodeSourceRgbaPng({
      ...dimensions,
      pixels: new Uint8Array(pixels),
      colorChunks: profile ? [srgb] : [],
    });
  return {
    dimensions,
    patch: png([61, 92, 11, 128, 91, 42, 203, 0], true),
    ownership: png([7, 8, 9, 255, 41, 42, 43, 0]),
    png,
  };
}

class StubWorker {
  static instances: StubWorker[] = [];
  static behavior:
    | "success"
    | "transport"
    | "reject"
    | "pending"
    | "malformed" = "success";
  onmessage: ((event: MessageEvent<GarmentPageResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  posted?: GarmentPageRequest;
  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    StubWorker.instances.push(this);
  }
  postMessage(request: GarmentPageRequest, transfer: Transferable[]) {
    this.posted = structuredClone(request, { transfer });
    const behavior = StubWorker.behavior;
    queueMicrotask(async () => {
      if (behavior === "pending") return;
      if (behavior === "transport") {
        this.onerror?.({ preventDefault() {} } as ErrorEvent);
        return;
      }
      if (behavior === "malformed") {
        this.onmessage?.({
          data: { kind: "garment-page", ok: true, value: {} },
        } as MessageEvent<GarmentPageResponse>);
        return;
      }
      let response: GarmentPageResponse;
      try {
        if (behavior === "reject")
          throw Error("Rejected by strict worker validator");
        const p = this.posted!;
        const value = await prepareGarmentPageStrict(
          p.patch,
          p.ownership,
          p.dimensions,
        );
        response = { kind: "garment-page", ok: true, value };
      } catch (error) {
        response = { kind: "garment-page", ok: false, message: String(error) };
      }
      this.onmessage?.({ data: response } as MessageEvent<GarmentPageResponse>);
    });
  }
}
function workers(behavior: typeof StubWorker.behavior = "success") {
  StubWorker.instances = [];
  StubWorker.behavior = behavior;
  vi.stubGlobal("Worker", StubWorker);
}
afterEach(() => vi.unstubAllGlobals());

describe("background garment page preparation", () => {
  it("transfers disposable copies, preserving RGBA, hidden RGB, ownership and color chunks", async () => {
    workers();
    const f = fixture(),
      patch = f.patch.slice(),
      mask = f.ownership.slice();
    const value = await prepareGarmentPage(f.patch, f.ownership, f.dimensions);
    expect(value).toEqual(
      await prepareGarmentPageStrict(patch, mask, f.dimensions),
    );
    expect([...value.patch.pixels]).toEqual([61, 92, 11, 128, 91, 42, 203, 0]);
    expect([...value.ownership]).toEqual([255, 0]);
    expect(f.patch).toEqual(patch);
    expect(f.ownership).toEqual(mask);
    expect(StubWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(StubWorker.instances[0].options).toEqual({ type: "module" });
  });

  it.each(["transport", "malformed"] as const)(
    "uses the identical strict codec after %s failure, from its immutable snapshot",
    async (behavior) => {
      workers(behavior);
      const f = fixture(),
        patch = f.patch.slice(),
        mask = f.ownership.slice();
      const pending = prepareGarmentPage(f.patch, f.ownership, f.dimensions);
      f.patch.fill(0);
      f.ownership.fill(0);
      f.dimensions.width = 99;
      expect(await pending).toEqual(
        await prepareGarmentPageStrict(patch, mask, { width: 2, height: 1 }),
      );
      expect(StubWorker.instances[0].terminate).toHaveBeenCalledOnce();
    },
  );

  it("retains the same validation without Worker support", async () => {
    vi.stubGlobal("Worker", undefined);
    const f = fixture();
    expect(
      await prepareGarmentPage(f.patch, f.ownership, f.dimensions),
    ).toEqual(
      await prepareGarmentPageStrict(f.patch, f.ownership, f.dimensions),
    );
  });

  it("never falls back after a worker reports invalid asset data", async () => {
    workers("reject");
    const f = fixture();
    await expect(
      prepareGarmentPage(f.patch, f.ownership, f.dimensions),
    ).rejects.toThrow("Rejected by strict worker validator");
    expect(StubWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it.each(["worker", "fallback"])(
    "rejects partial ownership and uncovered artwork via %s",
    async (kind) => {
      if (kind === "worker") workers();
      else vi.stubGlobal("Worker", undefined);
      const f = fixture();
      await expect(
        prepareGarmentPage(
          f.patch,
          f.png([0, 0, 0, 128, 0, 0, 0, 0]),
          f.dimensions,
        ),
      ).rejects.toThrow(/binary/);
      await expect(
        prepareGarmentPage(
          f.patch,
          f.png([0, 0, 0, 0, 0, 0, 0, 0]),
          f.dimensions,
        ),
      ).rejects.toThrow(/outside/);
      const bad = f.patch.slice();
      bad[bad.length - 1] ^= 1;
      await expect(
        prepareGarmentPage(bad, f.ownership, f.dimensions),
      ).rejects.toThrow();
    },
  );

  it("does not start work already cancelled", async () => {
    workers();
    const f = fixture(),
      controller = new AbortController();
    controller.abort();
    await expect(
      prepareGarmentPage(f.patch, f.ownership, f.dimensions, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(StubWorker.instances).toHaveLength(0);
  });

  it("terminates aborted work and ignores its late result while another load succeeds", async () => {
    workers("pending");
    const f = fixture(),
      controller = new AbortController();
    const pending = prepareGarmentPage(f.patch, f.ownership, f.dimensions, {
      signal: controller.signal,
    });
    const old = StubWorker.instances[0],
      late = old.onmessage!;
    StubWorker.behavior = "success";
    const next = prepareGarmentPage(f.patch, f.ownership, f.dimensions);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const value = await next;
    late({
      data: { kind: "garment-page", ok: true, value },
    } as MessageEvent<GarmentPageResponse>);
    expect(old.onmessage).toBeNull();
    expect(old.terminate).toHaveBeenCalledOnce();
    expect(value.ownership).toEqual(new Uint8Array([255, 0]));
  });

  it("never admits aborted page preparation as a validated cache hit", async () => {
    workers("pending");
    const f = fixture(),
      controller = new AbortController(),
      key = "worker-abort-fixture";
    const pending = validateGarmentPage(
      f.patch,
      f.ownership,
      f.dimensions,
      key,
      { signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    StubWorker.behavior = "success";
    await validateGarmentPage(f.patch, f.ownership, f.dimensions, key);
    expect(StubWorker.instances).toHaveLength(2);
    expect(decodedGarmentPage(key, f.patch, f.ownership, f.dimensions)).toEqual(
      await prepareGarmentPageStrict(f.patch, f.ownership, f.dimensions),
    );
    await validateGarmentPage(f.patch, f.ownership, f.dimensions, key);
    expect(StubWorker.instances).toHaveLength(2);
  });
});
