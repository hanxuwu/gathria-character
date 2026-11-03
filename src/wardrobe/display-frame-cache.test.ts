import { describe, expect, it, vi } from "vitest";
import { DisplayFrameCache } from "./display-frame-cache";

const surface = (color: string, width = 2, height = 2) => ({
  color,
  width,
  height,
});
type Surface = ReturnType<typeof surface>;
const dispose = (image: Surface) => {
  image.width = 0;
  image.height = 0;
};

describe("native display frame cache", () => {
  it("reuses a look's frame across loops and never aliases another renderer's same ID", () => {
    const cache = new DisplayFrameCache(dispose);
    const first = {},
      second = {};
    const firstFrame = vi.fn(() => surface("first"));
    const secondFrame = vi.fn(() => surface("second"));
    for (let loop = 0; loop < 3; loop++) {
      cache.withFrame(first, 7, firstFrame, (image) =>
        expect(image.color).toBe("first"),
      );
      cache.withFrame(second, 7, secondFrame, (image) =>
        expect(image.color).toBe("second"),
      );
    }
    expect(firstFrame).toHaveBeenCalledTimes(1);
    expect(secondFrame).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(2);
    cache.clear();
    cache.withFrame(first, 7, firstFrame, (image) =>
      expect(image.width).toBe(2),
    );
    expect(firstFrame).toHaveBeenCalledTimes(2);
  });

  it("bounds both entries and pixels, retaining the most recently used frame", () => {
    const released: Surface[] = [];
    const cache = new DisplayFrameCache<Surface>(
      (image) => {
        released.push(image);
        dispose(image);
      },
      2,
      10,
    );
    const owner = {},
      first = surface("first"),
      second = surface("second"),
      third = surface("third");
    cache.withFrame(
      owner,
      1,
      () => first,
      () => {},
    );
    cache.withFrame(
      owner,
      2,
      () => second,
      () => {},
    );
    cache.withFrame(
      owner,
      1,
      () => {
        throw Error("unexpected recomposition");
      },
      () => {},
    );
    cache.withFrame(
      owner,
      3,
      () => third,
      () => {},
    );
    expect(released).toEqual([second]);
    expect(cache.size).toBe(2);
    expect(cache.retainedPixels).toBe(8);
    const larger = surface("large", 3, 3);
    cache.withFrame(
      owner,
      4,
      () => larger,
      () => {},
    );
    expect(released).toEqual([second, first, third]);
    expect(cache.size).toBe(1);
    expect(cache.retainedPixels).toBe(9);
    cache.clear();
    expect(larger.width).toBe(0);
    expect(cache.retainedPixels).toBe(0);
    expect(cache.size).toBe(0);
  });

  it("draws oversized frames without retaining them or evicting a warm loop", () => {
    const cache = new DisplayFrameCache(dispose, 2, 8);
    const owner = {},
      warm = surface("warm"),
      large = surface("large", 3, 3);
    cache.withFrame(
      owner,
      1,
      () => warm,
      () => {},
    );
    cache.withFrame(
      owner,
      2,
      () => large,
      (image) => {
        expect(image.width).toBe(3);
        expect(warm.width).toBe(2);
        expect(cache.size).toBe(1);
        expect(cache.retainedPixels).toBe(4);
      },
    );
    expect(large.width).toBe(0);
    cache.withFrame(
      owner,
      1,
      () => {
        throw Error("warm frame was evicted");
      },
      (image) => expect(image).toBe(warm),
    );
  });

  it("does not release a surface in use when nested drawing exhausts the budget", () => {
    const cache = new DisplayFrameCache(dispose, 1, 4);
    const owner = {},
      first = surface("first"),
      nested = surface("nested");
    cache.withFrame(
      owner,
      1,
      () => first,
      () => {
        cache.withFrame(
          owner,
          2,
          () => nested,
          () => {
            expect(first.width).toBe(2);
            expect(nested.width).toBe(2);
            expect(cache.retainedPixels).toBe(4);
          },
        );
        expect(nested.width).toBe(0);
        expect(first.width).toBe(2);
      },
    );
    expect(first.width).toBe(2);
  });

  it("defers clear for an active draw and releases borrowed oversized frames on failure", () => {
    const released = vi.fn(dispose);
    const cache = new DisplayFrameCache(released, 1, 4);
    const owner = {},
      current = surface("current"),
      large = surface("large", 3, 3);
    cache.withFrame(
      owner,
      1,
      () => current,
      (image) => {
        cache.clear();
        expect(cache.size).toBe(0);
        expect(cache.retainedPixels).toBe(0);
        expect(image.width).toBe(2);
      },
    );
    expect(current.width).toBe(0);
    expect(() =>
      cache.withFrame(
        owner,
        2,
        () => large,
        () => {
          throw Error("paint failed");
        },
      ),
    ).toThrow("paint failed");
    expect(large.width).toBe(0);
    cache.clear();
    expect(released).toHaveBeenCalledTimes(2);
  });

  it("fits both native running cycles within the documented default budget", () => {
    const cache = new DisplayFrameCache(dispose);
    const original = {},
      side = {};
    const compose = vi.fn((width: number, height: number) =>
      surface("native", width, height),
    );
    for (let loop = 0; loop < 3; loop++) {
      for (let id = 0; id < 18; id++) {
        if (id < 16)
          cache.withFrame(
            original,
            id,
            () => compose(768, 1184),
            () => {},
          );
        cache.withFrame(
          side,
          id,
          () => compose(512, 768),
          () => {},
        );
      }
    }
    expect(compose).toHaveBeenCalledTimes(34);
    expect(cache.retainedPixels).toBe(16 * 768 * 1184 + 18 * 512 * 768);
    expect(cache.retainedPixels).toBeLessThanOrEqual(48 * 1024 * 1024);
    cache.clear();
    expect(cache.retainedPixels).toBe(0);
  });
});
