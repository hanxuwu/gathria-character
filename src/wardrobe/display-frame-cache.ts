interface SurfaceSize {
  width: number;
  height: number;
}

interface Entry<Surface> {
  owner: object;
  frameId: number;
  surface: Surface;
  pixels: number;
  borrowed: number;
  retired: boolean;
}

/** Retain final native display surfaces, not mutable renderer output buffers.
 * A renderer's object identity scopes frame IDs to exactly one accepted look.
 * The pixel budget describes native RGBA storage (four bytes per pixel), not
 * total browser RAM or GPU allocations. All borrowing is synchronous. */
export class DisplayFrameCache<Surface extends SurfaceSize> {
  private readonly owners = new Map<object, Map<number, Entry<Surface>>>();
  private readonly entries = new Map<Entry<Surface>, true>();
  private pixels = 0;

  constructor(
    private readonly release: (surface: Surface) => void,
    private readonly maxEntries = 96,
    private readonly maxPixels = 48 * 1024 * 1024,
  ) {
    if (
      !Number.isSafeInteger(maxEntries) ||
      maxEntries < 1 ||
      !Number.isSafeInteger(maxPixels) ||
      maxPixels < 1
    )
      throw Error("Display cache limits must be positive safe integers.");
  }

  get size(): number {
    return this.entries.size;
  }
  get retainedPixels(): number {
    return this.pixels;
  }

  private retire(entry: Entry<Surface>) {
    this.entries.delete(entry);
    const frames = this.owners.get(entry.owner)!;
    frames.delete(entry.frameId);
    if (!frames.size) this.owners.delete(entry.owner);
    this.pixels -= entry.pixels;
    entry.retired = true;
    if (!entry.borrowed) this.release(entry.surface);
  }

  /** Use a surface only inside draw; callers must not retain or mutate it.
   * Oversized frames still render, but their storage is released after drawing.
   * An in-use surface is never zeroed by eviction or an explicit clear. */
  withFrame<Result>(
    owner: object,
    frameId: number,
    create: () => Surface,
    draw: (surface: Surface) => Result,
  ): Result {
    let entry = this.owners.get(owner)?.get(frameId);
    if (entry) {
      this.entries.delete(entry);
      this.entries.set(entry, true);
    } else {
      const surface = create();
      const pixels = surface.width * surface.height;
      if (
        !Number.isSafeInteger(surface.width) ||
        surface.width < 1 ||
        !Number.isSafeInteger(surface.height) ||
        surface.height < 1 ||
        !Number.isSafeInteger(pixels)
      ) {
        this.release(surface);
        throw Error("Display frames require positive safe integer dimensions.");
      }
      entry = { owner, frameId, surface, pixels, borrowed: 0, retired: true };
      // Do not discard useful frames to make room for one that can never fit.
      if (pixels <= this.maxPixels) {
        const full = () =>
          this.entries.size >= this.maxEntries ||
          this.pixels + pixels > this.maxPixels;
        while (full()) {
          const oldest = [...this.entries.keys()].find(
            (item) => !item.borrowed,
          );
          if (!oldest) break;
          this.retire(oldest);
        }
        if (!full()) {
          let frames = this.owners.get(owner);
          if (!frames) this.owners.set(owner, (frames = new Map()));
          frames.set(frameId, entry);
          this.entries.set(entry, true);
          this.pixels += pixels;
          entry.retired = false;
        }
      }
    }
    entry.borrowed++;
    try {
      return draw(entry.surface);
    } finally {
      entry.borrowed--;
      if (entry.retired && !entry.borrowed) this.release(entry.surface);
    }
  }

  clear(): void {
    for (const entry of this.entries.keys()) this.retire(entry);
  }
}
