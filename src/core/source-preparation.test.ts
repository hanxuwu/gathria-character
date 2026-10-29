import { afterEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { decodeSourceRgbaPng, encodeSourceRgbaPng } from "./baked-source";
import {
  crc32,
  readBoundedArchive,
  type ArchivePolicy,
} from "./bounded-archive";
import { readPortableCharacterPackArchive } from "./pack";
import {
  prepareSourceArchive,
  prepareSourcePng,
  prepareBoundedArchive,
  type SourcePreparationRequest,
  type SourcePreparationResponse,
} from "./source-preparation";
import type { CharacterPackV3Manifest, BakedCharacterRecipe } from "./types";

function fixturePng(): Uint8Array {
  const srgb = new Uint8Array([0, 0, 0, 1, 115, 82, 71, 66, 0, 0, 0, 0, 0]);
  new DataView(srgb.buffer).setUint32(9, crc32(srgb.subarray(4, 9)));
  return encodeSourceRgbaPng({
    width: 2,
    height: 1,
    pixels: new Uint8Array([91, 42, 203, 0, 61, 92, 11, 128]),
    colorChunks: [srgb],
  });
}
function fixtureArchive(): Uint8Array {
  const sheet = {
    file: "spritesheet.png" as const,
    width: 2,
    height: 1,
    frameWidth: 1,
    frameHeight: 1,
    columns: 2,
    rows: 1,
  };
  const manifest: CharacterPackV3Manifest = {
    format: "gathria-character-pack",
    schemaVersion: 3,
    name: "Worker fixture",
    generator: "source-worker-test",
    spritesheet: sheet,
    additionalSheets: [{ ...sheet, file: "spritesheet-1.png" }],
    frames: [0, 1].map((id) => ({
      id,
      page: id,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })),
    animations: {
      idle: { frames: [0], fps: 2, loop: true },
      walk: { frames: [0, 1], fps: 12, loop: true },
      run: { frames: [1, 0], fps: 24, loop: true },
    },
    anchor: { x: 0.5, y: 1, units: "pixels", origin: "top-left" },
    facing: { native: "right", right: "none", left: "mirror-x" },
    scale: { pixelArt: false, integerOnly: false, recommended: 1 },
    capabilities: { renderMode: "baked", editableAppearance: false },
    configuration: "character.json",
  };
  const config: BakedCharacterRecipe = {
    format: "gathria-baked-character",
    schemaVersion: 1,
    name: manifest.name,
    characterId: "source-worker-test",
    source: {
      kind: "video-extraction",
      name: "source.mp4",
      sha256: "a".repeat(64),
    },
    provenance: "Original test frames; no repainting.",
    derivation: {
      method: "Retain source frame pixels and timing.",
      frames: manifest.frames.map((frame) => ({
        frameId: frame.id,
        sourceFrame: 100 + frame.id,
        timeSeconds: (100 + frame.id) / 24,
      })),
    },
  };
  return zipSync(
    {
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "character.json": strToU8(JSON.stringify(config)),
      "spritesheet.png": fixturePng(),
      "spritesheet-1.png": fixturePng(),
      "PROVENANCE.txt": strToU8(config.provenance),
      "INTEGRATION.md": strToU8("Fixture playback"),
    },
    { level: 0 },
  );
}

class StubWorker {
  static instances: StubWorker[] = [];
  static behavior: "success" | "transport" | "asset" | "pending" = "success";
  onmessage: ((event: MessageEvent<SourcePreparationResponse>) => void) | null =
    null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  posted?: SourcePreparationRequest;
  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    StubWorker.instances.push(this);
  }
  postMessage(request: SourcePreparationRequest, transfer: Transferable[]) {
    this.posted = structuredClone(request, { transfer });
    queueMicrotask(() => {
      if (StubWorker.behavior === "pending") return;
      if (StubWorker.behavior === "transport") {
        this.onerror?.({ preventDefault() {} } as ErrorEvent);
        return;
      }
      let response: SourcePreparationResponse;
      if (StubWorker.behavior === "asset") {
        response = {
          kind: request.kind,
          ok: false,
          message: "Source CRC mismatch from worker.",
        };
      } else if (this.posted!.kind === "png") {
        response = {
          kind: "png",
          ok: true,
          value: decodeSourceRgbaPng(this.posted!.bytes, this.posted!.expected),
        };
      } else if (this.posted!.kind === "bounded-archive") {
        const input = this.posted as Extract<
          SourcePreparationRequest,
          { kind: "bounded-archive" }
        >;
        response = {
          kind: "bounded-archive",
          ok: true,
          value: readBoundedArchive(input.bytes, input.policy),
        };
      } else {
        response = {
          kind: "archive",
          ok: true,
          value: readPortableCharacterPackArchive(this.posted!.bytes),
        };
      }
      this.onmessage?.({
        data: response,
      } as MessageEvent<SourcePreparationResponse>);
    });
  }
}
function workers(behavior: typeof StubWorker.behavior = "success") {
  StubWorker.instances = [];
  StubWorker.behavior = behavior;
  vi.stubGlobal("Worker", StubWorker);
}
afterEach(() => vi.unstubAllGlobals());

describe("background source preparation", () => {
  it("parses bounded garment archives in the worker with exact file bytes and an immutable policy", async () => {
    workers();
    const files = {
      "manifest.json": strToU8('{"version":1}'),
      "patches-0.png": fixturePng(),
    };
    const zip = zipSync(files),
      saved = zip.slice();
    const policy: ArchivePolicy = {
      label: "fixture",
      maxArchiveBytes: 4096,
      maxExpandedBytes: 4096,
      minFiles: 2,
      maxFiles: 2,
      files: { "manifest.json": 64, "patches-0.png": 1024 },
      required: ["manifest.json", "patches-0.png"],
    };
    const pending = prepareBoundedArchive(zip, policy);
    zip.fill(0);
    policy.files = {};
    policy.required = [];
    expect(await pending).toEqual(files);
    expect(saved.length).toBeGreaterThan(0);
    expect(StubWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("preserves bounded archive limits and CRC rejection in the no-worker fallback", async () => {
    vi.stubGlobal("Worker", undefined);
    const files = { "a.bin": new Uint8Array([1, 2, 3]) };
    const zip = zipSync(files, { level: 0 });
    const policy: ArchivePolicy = {
      label: "fixture",
      maxArchiveBytes: 1024,
      maxExpandedBytes: 3,
      minFiles: 1,
      maxFiles: 1,
      files: { "a.bin": 3 },
      required: ["a.bin"],
    };
    expect(await prepareBoundedArchive(zip, policy)).toEqual(files);
    await expect(
      prepareBoundedArchive(zip, { ...policy, maxExpandedBytes: 2 }),
    ).rejects.toThrow();
    await expect(
      prepareBoundedArchive(zip, { ...policy, files: { "b.bin": 3 } }),
    ).rejects.toThrow();
    const broken = zip.slice();
    broken[35] ^= 1;
    await expect(prepareBoundedArchive(broken, policy)).rejects.toThrow();
  });
  it("transfers a copy and preserves hidden RGB, partial alpha and profile bytes", async () => {
    workers();
    const png = fixturePng(),
      original = png.slice();
    const result = await prepareSourcePng(png, { width: 2, height: 1 });
    expect(result).toEqual(decodeSourceRgbaPng(original));
    expect(png).toEqual(original);
    expect(png.byteLength).toBe(original.length);
    expect(StubWorker.instances[0].options).toEqual({ type: "module" });
    expect(StubWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("parses a multi-page archive without detaching the original project ZIP", async () => {
    workers();
    const zip = fixtureArchive(),
      original = zip.slice();
    expect(await prepareSourceArchive(zip)).toEqual(
      readPortableCharacterPackArchive(original),
    );
    expect(zip).toEqual(original);
    expect(StubWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("uses the same checked readers without workers and gives cached PNGs owned buffers", async () => {
    vi.stubGlobal("Worker", undefined);
    const png = fixturePng(),
      zip = fixtureArchive();
    expect(await prepareSourcePng(png)).toEqual(decodeSourceRgbaPng(png));
    const archive = await prepareSourceArchive(zip);
    expect(archive).toEqual(readPortableCharacterPackArchive(zip));
    for (const page of [archive.png, ...(archive.additionalPngs ?? [])]) {
      expect(page.byteOffset).toBe(0);
      expect(page.buffer.byteLength).toBe(page.length);
      expect(page.buffer).not.toBe(zip.buffer);
    }
    await expect(
      prepareSourcePng(png, { width: 3, height: 1 }),
    ).rejects.toThrow();
    await expect(
      prepareSourceArchive(new Uint8Array([1, 2, 3])),
    ).rejects.toThrow();
  });

  it("falls back after a transport error using an intact private input snapshot", async () => {
    workers("transport");
    const png = fixturePng(),
      original = png.slice();
    const expected = { width: 2, height: 1 };
    const pending = prepareSourcePng(png, expected);
    png.fill(0);
    expected.width = 3;
    expect(await pending).toEqual(decodeSourceRgbaPng(original));
    expect(StubWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("falls back when worker construction is unavailable", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("Blocked by host");
        }
      },
    );
    const png = fixturePng();
    expect(await prepareSourcePng(png)).toEqual(decodeSourceRgbaPng(png));
  });

  it("propagates worker asset rejection instead of accepting valid fallback bytes", async () => {
    workers("asset");
    await expect(prepareSourcePng(fixturePng())).rejects.toThrow(
      "Source CRC mismatch from worker.",
    );
    expect(StubWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("does not start cancelled work", async () => {
    workers();
    const controller = new AbortController();
    controller.abort();
    await expect(
      prepareSourceArchive(fixtureArchive(), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(StubWorker.instances).toHaveLength(0);
  });

  it("terminates pending work on abort and ignores a late successful reply", async () => {
    workers("pending");
    const controller = new AbortController();
    const pending = prepareSourcePng(fixturePng(), undefined, {
      signal: controller.signal,
    });
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    const worker = StubWorker.instances[0],
      reply = worker.onmessage!;
    controller.abort();
    await rejected;
    reply({
      data: { kind: "png", ok: true, value: decodeSourceRgbaPng(fixturePng()) },
    } as MessageEvent<SourcePreparationResponse>);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
    expect(StubWorker.instances).toHaveLength(1);
  });

  it("the actual worker returns separately owned PNGs and transferable exact RGBA", async () => {
    vi.stubGlobal("onmessage", null);
    const postMessage = vi.fn();
    vi.stubGlobal("postMessage", postMessage);
    await import("./source-preparation.worker");
    const receive = globalThis.onmessage as unknown as (event: {
      data: SourcePreparationRequest;
    }) => Promise<void>;
    const zip = fixtureArchive();
    await receive({ data: { kind: "archive", bytes: zip } });
    const [archiveReply, transfers] = postMessage.mock.calls[0] as [
      SourcePreparationResponse,
      ArrayBuffer[],
    ];
    expect(archiveReply.ok).toBe(true);
    if (!archiveReply.ok || archiveReply.kind !== "archive")
      throw Error("Expected archive response");
    expect(archiveReply.value).toEqual(readPortableCharacterPackArchive(zip));
    expect(transfers).toHaveLength(2);
    for (const page of [
      archiveReply.value.png,
      ...archiveReply.value.additionalPngs!,
    ]) {
      expect(page.buffer.byteLength).toBe(page.length);
      expect(page.buffer).not.toBe(zip.buffer);
    }
    await receive({ data: { kind: "png", bytes: fixturePng() } });
    const [pngReply, pngTransfers] = postMessage.mock.calls[1] as [
      SourcePreparationResponse,
      ArrayBuffer[],
    ];
    expect(pngReply).toEqual({
      kind: "png",
      ok: true,
      value: decodeSourceRgbaPng(fixturePng()),
    });
    expect(new Set(pngTransfers).size).toBe(pngTransfers.length);
    expect(pngTransfers).toHaveLength(2);
  });
});
