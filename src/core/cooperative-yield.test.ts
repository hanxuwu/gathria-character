import { afterEach, describe, expect, it, vi } from "vitest";
import { createCooperativeYield } from "./cooperative-yield";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("cooperative validation slices", () => {
  it("batches cheap work but returns control after eight milliseconds", async () => {
    vi.useFakeTimers();
    let now = 10;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const checkpoint = createCooperativeYield();
    for (now = 11; now < 18; now++) await checkpoint();
    expect(vi.getTimerCount()).toBe(0);
    const yielded = checkpoint();
    expect(vi.getTimerCount()).toBe(1);
    now = 24;
    await vi.runAllTimersAsync();
    await yielded;
    now = 31;
    await checkpoint();
    expect(vi.getTimerCount()).toBe(0);
    now = 32;
    const next = checkpoint();
    expect(vi.getTimerCount()).toBe(1);
    await vi.runAllTimersAsync();
    await next;
  });

  it("checks cancellation even before the work budget expires", async () => {
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockReturnValue(0);
    const controller = new AbortController();
    const checkpoint = createCooperativeYield(() =>
      controller.signal.throwIfAborted(),
    );
    controller.abort();
    await expect(checkpoint()).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects cancellation during a yield before work can resume", async () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const controller = new AbortController();
    const checkpoint = createCooperativeYield(() =>
      controller.signal.throwIfAborted(),
    );
    now = 8;
    const pending = checkpoint();
    const assertion = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("keeps unrelated validation calls independent", async () => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const one = createCooperativeYield();
    now = 7;
    const two = createCooperativeYield();
    now = 8;
    await two();
    expect(vi.getTimerCount()).toBe(0);
    const pending = one();
    expect(vi.getTimerCount()).toBe(1);
    await vi.runAllTimersAsync();
    await pending;
  });
});
