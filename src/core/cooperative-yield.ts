/** Bound cooperative validation slices without paying a browser's nested
 * timer clamp after every small pose. A single decode/render is not preempted;
 * callers still check cancellation around each unit of validation work. */
export function createCooperativeYield(
  assertActive: () => void = () => {},
): () => Promise<void> {
  let resumedAt = performance.now();
  return async () => {
    assertActive();
    if (performance.now() - resumedAt < 8) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assertActive();
    resumedAt = performance.now();
  };
}
