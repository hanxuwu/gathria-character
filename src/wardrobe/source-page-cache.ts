import type { RgbaPng } from "../core/baked-source";

/** One portable pack may contain four pages. Keep the old 96 Mi-pixel ceiling
 * while avoiding eviction of page zero during three-page side-view preflight. */
export class SourcePageCache {
  private readonly pages = new Map<string, RgbaPng>();
  constructor(
    private readonly maxPages = 4,
    private readonly maxPixels = 96 * 1024 * 1024,
  ) {}
  has(key: string): boolean {
    return this.pages.has(key);
  }
  get(key: string): RgbaPng | undefined {
    const image = this.pages.get(key);
    if (image) {
      this.pages.delete(key);
      this.pages.set(key, image);
    }
    return image;
  }
  set(key: string, image: RgbaPng): void {
    this.pages.delete(key);
    this.pages.set(key, image);
    let pixels = [...this.pages.values()].reduce(
      (sum, page) => sum + page.width * page.height,
      0,
    );
    while (this.pages.size > this.maxPages || pixels > this.maxPixels) {
      const oldest = this.pages.keys().next().value!;
      const page = this.pages.get(oldest)!;
      this.pages.delete(oldest);
      pixels -= page.width * page.height;
    }
  }
}
