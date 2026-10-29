import { describe, expect, it } from "vitest";
import { SourcePageCache } from "./source-page-cache";

const page = (width = 2, height = 2) => ({
  width,
  height,
  pixels: new Uint8Array(width * height * 4),
  colorChunks: [],
});
describe("native source page working set", () => {
  it("retains all three source pages through jump and back to idle", () => {
    const cache = new SourcePageCache();
    const idle = page(),
      walk = page(),
      jump = page();
    cache.set("original:0", idle);
    cache.set("original:1", walk);
    cache.set("original:2", jump);
    expect(cache.get("original:0")).toBe(idle);
    expect(cache.get("original:1")).toBe(walk);
    expect(cache.get("original:2")).toBe(jump);
  });
  it("bounds page count to four and evicts the least recently used page across characters", () => {
    const cache = new SourcePageCache();
    for (let i = 0; i < 4; i++) cache.set(`male:${i}`, page());
    cache.get("male:0");
    cache.set("female:0", page());
    expect(cache.has("male:0")).toBe(true);
    expect(cache.has("male:1")).toBe(false);
    expect(cache.has("female:0")).toBe(true);
  });
  it("still enforces the pixel byte budget before four pages, including replacements and oversized entries", () => {
    const cache = new SourcePageCache(4, 12);
    cache.set("a", page());
    cache.set("b", page());
    cache.set("c", page());
    cache.set("c", page(3, 3));
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
    cache.set("oversized", page(4, 4));
    expect(cache.has("oversized")).toBe(false);
    expect(cache.has("c")).toBe(false);
  });
});
