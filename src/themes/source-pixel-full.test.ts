import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { decodeSourceRgbaPng, type RgbaPng } from "../core/baked-source";
import { readPortableCharacterPackArchive } from "../core/pack";
import type { SpriteFrame } from "../core/types";
import { readMotionFlow } from "../consumer/motion-flow";
import { frameAtTime } from "../consumer/player";
import { sourcePixelComparisonScale } from "./comparison";

const root = new URL("../../", import.meta.url);
const bytes = async (file: string) =>
  new Uint8Array(await readFile(new URL(file, root)));
const json = async (file: string) =>
  JSON.parse(await readFile(new URL(file, root), "utf8"));
const sha = (input: Uint8Array) =>
  createHash("sha256").update(input).digest("hex");

interface CatalogEntry {
  key: string;
  name: string;
  character: "male" | "female";
  isOriginal: boolean;
  current: boolean;
  sha256: string;
  manifest: { id: string; revision: number };
  lookAssets: Array<{ logicalId: string; file: string; sha256: string }>;
}
const originals = (await json(
  "artwork/kling-themes/catalog-index.json",
)) as CatalogEntry[];
const published = (await json(
  "artwork/kling-source-pixel-full/catalog-index.json",
)) as CatalogEntry[];

/** Independently derive every output alpha from the actual source atlas.
 * Padding is transparent; frame placement never depends on silhouette bounds. */
function checkProjectedFrame(
  source: RgbaPng,
  input: SpriteFrame,
  output: RgbaPng,
  target: SpriteFrame,
  padding: { left: number; top: number },
  palette: Set<number>,
) {
  for (let y = 0; y < target.height; y++) {
    const sourceY = y * 4 - padding.top;
    for (let x = 0; x < target.width; x++) {
      const sourceX = x * 4 - padding.left;
      let alphaSum = 0;
      for (let dy = 0; dy < 4; dy++) {
        const sy = sourceY + dy;
        if (sy < 0 || sy >= input.height) continue;
        for (let dx = 0; dx < 4; dx++) {
          const sx = sourceX + dx;
          if (sx >= 0 && sx < input.width)
            alphaSum +=
              source.pixels[
                ((input.y + sy) * source.width + input.x + sx) * 4 + 3
              ];
        }
      }
      const at = ((target.y + y) * output.width + target.x + x) * 4;
      const expected = Math.floor((alphaSum + 8) / 16);
      if (output.pixels[at + 3] !== expected)
        throw Error(`Source alpha changed for frame ${input.id} at ${x},${y}.`);
      const color =
        (output.pixels[at] << 16) |
        (output.pixels[at + 1] << 8) |
        output.pixels[at + 2];
      if (expected ? !palette.has(color) : color !== 0)
        throw Error(`Frame ${input.id} has an invalid palette/matte pixel.`);
    }
  }
}

describe("full source pixel themes preserve actual source packs", () => {
  it("adds a separate current theme for each character and keeps original defaults", () => {
    expect(published.map((entry) => entry.key).sort()).toEqual([
      "female:kling-source-pixel@1",
      "male:kling-source-pixel@1",
    ]);
    const combined = [...originals, ...published];
    expect(new Set(combined.map((entry) => entry.key)).size).toBe(
      combined.length,
    );
    for (const entry of published) {
      expect(entry).toMatchObject({
        name: "Source pixel",
        isOriginal: false,
        current: true,
        manifest: { id: "kling-source-pixel", revision: 1 },
      });
      expect(entry.lookAssets.map((look) => look.logicalId).sort()).toEqual([
        "base",
        "wedding",
      ]);
      expect(
        combined.find(
          (candidate) =>
            candidate.character === entry.character &&
            candidate.isOriginal &&
            candidate.current !== false,
        )?.key,
      ).toBe(`${entry.character}:kling-original@1`);
    }
  });

  for (const character of ["male", "female"] as const)
    for (const logicalId of ["base", "wedding"] as const)
      it(`preserves ${character}/${logicalId} schedules, routes, provenance and projected alpha`, async () => {
        const original = originals.find(
          (entry) => entry.character === character && entry.isOriginal,
        )!;
        const sourceAsset = original.lookAssets.find(
          (look) => look.logicalId === logicalId,
        )!;
        const entry = published.find((entry) => entry.character === character)!;
        const asset = entry.lookAssets.find(
          (look) => look.logicalId === logicalId,
        )!;
        const sourceBytes = await bytes(sourceAsset.file);
        const outputBytes = await bytes(asset.file);
        expect(sha(sourceBytes)).toBe(sourceAsset.sha256);
        expect(sha(outputBytes)).toBe(asset.sha256);
        const source = readPortableCharacterPackArchive(sourceBytes);
        const output = readPortableCharacterPackArchive(outputBytes);
        const { manifest, config } = output;
        expect(manifest.schemaVersion).toBe(4);
        expect(manifest.generator).toBe("gathria-offline-source-pixel-full-v1");
        expect(manifest.scale).toEqual({
          pixelArt: true,
          integerOnly: true,
          recommended: 2,
        });
        expect(manifest.animations).toEqual(source.manifest.animations);
        expect(Object.keys(manifest.animations).sort()).toEqual([
          "celebrate",
          "idle",
          "jump",
          "run",
          "walk",
        ]);
        expect(manifest.facing).toEqual(source.manifest.facing);
        expect(manifest.frames.map((frame) => frame.id)).toEqual(
          source.manifest.frames.map((frame) => frame.id),
        );
        expect(config.derivation.frames).toEqual(
          source.config.derivation.frames,
        );
        expect(config.source.sha256).toBe(sourceAsset.sha256);
        for (const [key, value] of Object.entries(
          source.config.sourceMetadata ?? {},
        ))
          expect(config.sourceMetadata?.[key]).toEqual(value);
        expect(readMotionFlow(manifest, config)).toEqual(
          readMotionFlow(source.manifest, source.config),
        );
        expect(readMotionFlow(manifest, config)).not.toBeNull();
        const jump = manifest.animations.jump!;
        expect(jump.loop).toBe(false);
        expect(frameAtTime(manifest, "jump", 100_000).id).toBe(
          jump.frames.at(-1),
        );

        const padding =
          logicalId === "base"
            ? { left: 32, top: 130, right: 32, bottom: 6 }
            : { left: 0, top: 2, right: 0, bottom: 6 };
        expect(manifest.spritesheet.frameWidth).toBe(192);
        expect(manifest.spritesheet.frameHeight).toBe(298);
        expect(manifest.anchor).toEqual({
          x: 96,
          y: 282,
          units: "pixels",
          origin: "top-left",
        });
        expect(
          source.manifest.spritesheet.frameWidth + padding.left + padding.right,
        ).toBe(manifest.spritesheet.frameWidth * 4);
        expect(
          source.manifest.spritesheet.frameHeight +
            padding.top +
            padding.bottom,
        ).toBe(manifest.spritesheet.frameHeight * 4);
        expect(source.manifest.anchor.x + padding.left).toBe(
          manifest.anchor.x * 4,
        );
        expect(source.manifest.anchor.y + padding.top).toBe(
          manifest.anchor.y * 4,
        );
        expect(
          sourcePixelComparisonScale(output, source, sourceAsset.sha256),
        ).toBe(1 / 4);

        const marker = config.sourceMetadata?.sourcePixelFull;
        if (!marker || typeof marker !== "object" || Array.isArray(marker))
          throw Error(
            "The full source pixel pack needs its processing provenance.",
          );
        if (typeof marker.paletteFile !== "string")
          throw Error("The fixed palette source must be recorded.");
        const paletteBytes = await bytes(marker.paletteFile);
        expect(sha(paletteBytes)).toBe(marker.paletteSha256);
        const paletteData = JSON.parse(new TextDecoder().decode(paletteBytes));
        expect(paletteData.colors).toHaveLength(128);
        const colors = new Set<number>(
          paletteData.colors.map(
            ([r, g, b]: number[]) => (r << 16) | (g << 8) | b,
          ),
        );
        const decoded = decodeSourceRgbaPng(output.png);
        expect(output.additionalPngs).toEqual([]);
        const targets = new Map(
          manifest.frames.map((frame) => [frame.id, frame]),
        );
        let page = -1;
        let sourceImage: RgbaPng | undefined;
        // Only one native source page is decoded at a time.
        for (const frame of source.manifest.frames) {
          if (page !== (frame.page ?? 0)) {
            page = frame.page ?? 0;
            sourceImage = undefined;
            sourceImage = decodeSourceRgbaPng(
              page === 0 ? source.png : source.additionalPngs![page - 1],
            );
          }
          checkProjectedFrame(
            sourceImage!,
            frame,
            decoded,
            targets.get(frame.id)!,
            padding,
            colors,
          );
        }
      }, 90000);
});
