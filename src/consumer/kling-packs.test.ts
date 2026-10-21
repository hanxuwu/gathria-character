import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPortableCharacterPack } from "../core/pack";
import {
  KLING_CHARACTERS,
  KLING_KEYFRAME_CHARACTERS,
  KLING_MOTION_CHARACTERS,
} from "./kling-catalog";
import { loadKlingCharacter } from "./kling-packs";

vi.mock("../core/pack", () => ({
  loadPortableCharacterPack: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("prepared Kling loading", () => {
  it("downloads only the chosen archive, validates it, and preserves its export bytes", async () => {
    const archive = new Blob([new Uint8Array([1, 2, 3])]);
    const fetched = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => archive,
    });
    vi.stubGlobal("fetch", fetched);
    const pack = { manifest: { name: "Prepared original" } } as Awaited<
      ReturnType<typeof loadPortableCharacterPack>
    >;
    vi.mocked(loadPortableCharacterPack).mockResolvedValue(pack);
    const controller = new AbortController();
    const result = await loadKlingCharacter("female", controller.signal);
    expect(fetched).toHaveBeenCalledExactlyOnceWith(
      KLING_CHARACTERS[1].packUrl,
      { signal: controller.signal },
    );
    expect(loadPortableCharacterPack).toHaveBeenCalledExactlyOnceWith(archive);
    expect(result).toEqual({ pack, archive });
  });

  it("does not decode an aborted response or replace it with another character", async () => {
    const controller = new AbortController();
    const fetched = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => {
        controller.abort();
        return new Blob([new Uint8Array([1])]);
      },
    });
    vi.stubGlobal("fetch", fetched);
    await expect(
      loadKlingCharacter("male", controller.signal),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(loadPortableCharacterPack).not.toHaveBeenCalled();
    expect(fetched).toHaveBeenCalledTimes(1);
  });

  it("loads only an explicitly requested keyframe candidate and keeps its exported archive", async () => {
    const archive = new Blob([new Uint8Array([4, 5, 6])]);
    const fetched = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => archive,
    });
    vi.stubGlobal("fetch", fetched);
    const pack = { manifest: { name: "Keyframe loop study" } } as Awaited<
      ReturnType<typeof loadPortableCharacterPack>
    >;
    vi.mocked(loadPortableCharacterPack).mockResolvedValue(pack);
    const controller = new AbortController();
    const result = await loadKlingCharacter(
      "female",
      controller.signal,
      undefined,
      "keyframes",
    );
    expect(fetched).toHaveBeenCalledExactlyOnceWith(
      KLING_KEYFRAME_CHARACTERS[1].packUrl,
      { signal: controller.signal },
    );
    expect(fetched).not.toHaveBeenCalledWith(
      KLING_CHARACTERS[1].packUrl,
      expect.anything(),
    );
    expect(loadPortableCharacterPack).toHaveBeenCalledExactlyOnceWith(archive);
    expect(result).toEqual({ pack, archive });
  });

  it("rejects a failed download without decoding its error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    await expect(
      loadKlingCharacter("male", new AbortController().signal),
    ).rejects.toThrow("HTTP 503");
    expect(loadPortableCharacterPack).not.toHaveBeenCalled();
  });

  it("loads the explicit motion variant without changing original or V1 catalog entries", async () => {
    const archive = new Blob([new Uint8Array([7, 8, 9])]);
    const fetched = vi
      .fn()
      .mockResolvedValue({ ok: true, blob: async () => archive });
    vi.stubGlobal("fetch", fetched);
    const pack = { manifest: { name: "Motion study" } } as Awaited<
      ReturnType<typeof loadPortableCharacterPack>
    >;
    vi.mocked(loadPortableCharacterPack).mockResolvedValue(pack);
    const signal = new AbortController().signal;
    expect(
      await loadKlingCharacter("male", signal, undefined, "motion"),
    ).toEqual({ pack, archive });
    expect(fetched).toHaveBeenCalledExactlyOnceWith(
      KLING_MOTION_CHARACTERS[0].packUrl,
      { signal },
    );
    expect(KLING_CHARACTERS[0].packUrl).toContain("/kling-jump/exports/");
    expect(KLING_KEYFRAME_CHARACTERS[0].packUrl).toContain(
      "/kling-keyframes/exports/",
    );
  });
});
