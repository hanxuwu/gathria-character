/** Small integer raster primitives used by the original Art V2 layers. */
export type Point = readonly [number, number];
export function mix(a: string, b: string, ratio: number): string {
  return (
    "#" +
    [1, 3, 5]
      .map((offset) =>
        Math.round(
          parseInt(a.slice(offset, offset + 2), 16) * (1 - ratio) +
            parseInt(b.slice(offset, offset + 2), 16) * ratio,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function material(base: string) {
  return {
    base,
    light: mix(base, "#FFF2D9", 0.23),
    shade: mix(base, "#53414A", 0.25),
    edge: mix(base, "#352E3C", 0.52),
  };
}
export class PixelArt {
  readonly pixels = new Uint8ClampedArray(48 * 64 * 4);
  private colors = new Map<string, number[]>();
  pixel(x: number, y: number, color: string) {
    if (!Number.isInteger(x) || !Number.isInteger(y))
      throw new Error("Pixel coordinates must be integers.");
    if (x < 0 || x >= 48 || y < 0 || y >= 64)
      throw new Error(`Art layer clips outside its frame at ${x},${y}.`);
    let rgb = this.colors.get(color);
    if (!rgb) {
      rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
      this.colors.set(color, rgb);
    }
    this.pixels.set([...rgb, 255], (y * 48 + x) * 4);
  }
  rect(x: number, y: number, w: number, h: number, color: string) {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.pixel(xx, yy, color);
  }
  polygon(points: readonly Point[], color: string) {
    for (
      let y = Math.min(...points.map((p) => p[1]));
      y < Math.max(...points.map((p) => p[1]));
      y++
    ) {
      const edges: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y))
          edges.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      edges.sort((a, b) => a - b);
      for (let i = 0; i + 1 < edges.length; i += 2)
        for (let x = Math.ceil(edges[i]); x <= Math.floor(edges[i + 1]); x++)
          this.pixel(x, y, color);
    }
  }
  line(start: Point, end: Point, width: number, color: string) {
    const steps = Math.max(
      Math.abs(end[0] - start[0]),
      Math.abs(end[1] - start[1]),
      1,
    );
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(start[0] + ((end[0] - start[0]) * i) / steps);
      const y = Math.round(start[1] + ((end[1] - start[1]) * i) / steps);
      this.rect(
        x - Math.floor(width / 2),
        y - Math.floor(width / 2),
        width,
        width,
        color,
      );
    }
  }
}
