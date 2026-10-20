import { createHash, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256 } from "./sha256";

afterEach(() => vi.unstubAllGlobals());

describe.each([
  ["Web Crypto", webcrypto],
  ["HTTP without subtle", {}],
  ["no crypto object", undefined],
])("SHA-256: %s", (_name, crypto) => {
  it("matches independent SHA-256 for empty, padding-boundary, binary and frame-sized inputs", async () => {
    vi.stubGlobal("crypto", crypto);
    for (const length of [0, 3, 55, 56, 63, 64, 65, 704 * 1024 * 4]) {
      const backing = Uint8Array.from(
        { length: length + 19 },
        (_, i) => (i * 37 + 11) & 255,
      );
      // Nonzero offsets must hash only the selected view, not its entire buffer.
      const bytes = backing.subarray(7, length + 7);
      const expected = createHash("sha256").update(bytes).digest("hex");
      expect(await sha256(bytes)).toBe(expected);
    }
  });
});
