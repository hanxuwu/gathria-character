import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DualViewWardrobe } from "./dual-view";
import {
  compatiblePairedAppearance,
  loadPairedAppearanceBank,
  pairedAppearanceCatalog,
} from "./dual-view-appearance-catalog";

const registry = vi.hoisted(() => ({
  representations: [] as Array<Record<string, unknown>>,
}));
const legacy = vi.hoisted(() => ({
  representations: [] as Array<Record<string, unknown>>,
}));
vi.mock("../../docs/paired-polish/assets/appearance-catalog.json", () => ({
  default: registry,
}));
vi.mock("../../docs/matched-hair/assets/catalog.json", () => ({
  default: legacy,
}));
const payload = new Uint8Array([41, 72, 99]);
const digest = createHash("sha256").update(payload).digest("hex");
const fetcher = vi.fn();

beforeEach(() => {
  legacy.representations = [];
  registry.representations = ["original", "side"].map((view) => ({
    character: "male",
    view,
    sourceSha256: (view === "original" ? "a" : "b").repeat(64),
    registrationSha256: (view === "original" ? "c" : "d").repeat(64),
    bankSha256: digest,
    bankId: `fixture-${view}`,
    hairId: `hair-${view}`,
    faceId: `face-${view}`,
    // Resolve a real bundled URL but supply a tiny response: native archive
    // parsing is independently exercised by dual-view-appearance.test.ts.
    url: "/docs/dual-looks/assets/male-original.appearance.zip",
    bytes: payload.length,
  }));
  fetcher.mockReset();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());

describe("paired appearance asset delivery", () => {
  it("offers only complete unambiguous native pairs with exact source and registration", () => {
    const entries = pairedAppearanceCatalog("male")!;
    const pair = {
      character: "male",
      projects: Object.fromEntries(
        Object.entries(entries).map(([view, entry]) => [
          view,
          {
            document: {
              sourceSha256: entry.sourceSha256,
              registrationSha256: entry.registrationSha256,
            },
          },
        ]),
      ),
    } as DualViewWardrobe;
    expect(compatiblePairedAppearance(pair)).toEqual(entries);
    pair.projects.side.document.registrationSha256 = "e".repeat(64);
    expect(compatiblePairedAppearance(pair)).toBeNull();
    expect(pairedAppearanceCatalog("female")).toBeNull();
    registry.representations.push({ ...registry.representations[0] });
    expect(pairedAppearanceCatalog("male")).toBeNull();
    registry.representations = registry.representations.slice(0, 1);
    expect(pairedAppearanceCatalog("male")).toBeNull();
  });

  it("keeps legacy registration contracts usable without reassigning saved head banks", async () => {
    const current = pairedAppearanceCatalog("male")!;
    legacy.representations = structuredClone(registry.representations);
    legacy.representations[1].registrationSha256 = "e".repeat(64);
    legacy.representations[1].bankId = "older-side";
    legacy.representations[1].hairId = "older-hair";
    const pair = {
      character: "male",
      projects: Object.fromEntries(
        legacy.representations.map((row) => [
          row.view,
          {
            document: {
              sourceSha256: row.sourceSha256,
              registrationSha256: row.registrationSha256,
            },
          },
        ]),
      ),
    } as DualViewWardrobe;
    const frozen = structuredClone(pair);
    const entries = compatiblePairedAppearance(pair)!;
    expect(entries.side.registrationSha256).toBe("e".repeat(64));
    expect(entries.side.hairId).toBe("older-hair");
    expect(pairedAppearanceCatalog("male")).toEqual(current);
    expect(pair).toEqual(frozen);
    fetcher.mockResolvedValueOnce(new Response(payload));
    expect(await loadPairedAppearanceBank(entries.side)).toEqual(payload);
    legacy.representations.push({ ...legacy.representations[1] });
    expect(compatiblePairedAppearance(pair)).toBeNull();
  });

  it("verifies streamed size and hash before returning any bank", async () => {
    fetcher.mockResolvedValueOnce(new Response(payload));
    const entry = pairedAppearanceCatalog("male")!.original;
    expect(await loadPairedAppearanceBank(entry)).toEqual(payload);
    fetcher.mockResolvedValueOnce(new Response(new Uint8Array([41, 72, 98])));
    await expect(loadPairedAppearanceBank(entry)).rejects.toThrow("校验失败");
    fetcher.mockResolvedValueOnce(new Response(new Uint8Array([41])));
    await expect(loadPairedAppearanceBank(entry)).rejects.toThrow("校验失败");
  });

  it("cancels an oversized streaming response even without Content-Length", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      },
      cancel,
    });
    fetcher.mockResolvedValueOnce(new Response(stream));
    await expect(
      loadPairedAppearanceBank(pairedAppearanceCatalog("male")!.original),
    ).rejects.toThrow("超出登记大小");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects unknown revisions and pre-cancelled loads before requesting a file", async () => {
    const entry = pairedAppearanceCatalog("male")!.original;
    await expect(
      loadPairedAppearanceBank({ ...entry, bankSha256: "e".repeat(64) }),
    ).rejects.toThrow("对应视角素材");
    const abort = new AbortController();
    abort.abort();
    await expect(
      loadPairedAppearanceBank(entry, { signal: abort.signal }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports missing assets without returning a partial or unverified response", async () => {
    fetcher.mockResolvedValueOnce(new Response("missing", { status: 503 }));
    await expect(
      loadPairedAppearanceBank(pairedAppearanceCatalog("male")!.original),
    ).rejects.toThrow("503");
  });
});
