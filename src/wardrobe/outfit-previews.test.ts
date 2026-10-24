import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { outfitPreview } from "./outfit-previews";
import index from "./outfit-previews/index.json";
import catalog from "../../docs/kling-wardrobe/catalog.json";
import { decodeSourceRgbaPng } from "../core/baked-source";
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
it("every picture is decodable, bound to the current catalog, and backed by a real native export", () => {
  expect(index.previews.length).toBe(
    catalog.characters.reduce(
      (n, c) =>
        n +
        c.presets.filter((p) => Object.values(p.selection).some(Boolean))
          .length,
      0,
    ),
  );
  for (const row of index.previews) {
    const entry = catalog.characters.find((c) => c.key === row.character)!;
    const preset = entry.presets.find((p) => p.id === row.presetId)!;
    const registration = readFileSync("." + entry.registrationUrl);
    expect(sha(registration)).toBe(row.registrationSha256);
    expect(JSON.parse(registration.toString()).sourceSha256).toBe(
      row.sourceSha256,
    );
    expect(row.selection).toEqual(preset.selection);
    const image = readFileSync(`src/wardrobe/outfit-previews/${row.file}`);
    expect(sha(image)).toBe(row.thumbnailSha256);
    const png = decodeSourceRgbaPng(image, {
      width: row.width,
      height: row.height,
    });
    expect(png.pixels.some((byte, i) => i % 4 === 3 && byte === 0)).toBe(true);
    expect(png.pixels.some((byte, i) => i % 4 === 3 && byte === 255)).toBe(
      true,
    );
    const native = readFileSync(row.nativeFile);
    expect(sha(native)).toBe(row.nativeSha256);
    expect(decodeSourceRgbaPng(native).width).toBe(row.nativeWidth);
    expect(
      outfitPreview(
        row.character,
        row.presetId,
        row.selection,
        row.sourceSha256,
        row.registrationSha256,
        entry.items,
      ),
    ).toBeTruthy();
  }
});
it("does not show stale art for changed assets, source, anchors or a colliding imported item", () => {
  const row = index.previews.find(
    (row) => row.character === "male" && row.items.length,
  )!;
  const args = [
    row.character,
    row.presetId,
    row.selection,
    row.sourceSha256,
    row.registrationSha256,
  ] as const;
  expect(outfitPreview(...args, row.items)).toBeTruthy();
  expect(
    outfitPreview(...args, [
      ...row.items,
      { ...row.items[0], sha256: "custom" },
    ]),
  ).toBeUndefined();
  expect(
    outfitPreview(
      row.character,
      row.presetId,
      row.selection,
      "other",
      row.registrationSha256,
      row.items,
    ),
  ).toBeUndefined();
  expect(
    outfitPreview(
      row.character,
      row.presetId,
      row.selection,
      row.sourceSha256,
      "other",
      row.items,
    ),
  ).toBeUndefined();
});
