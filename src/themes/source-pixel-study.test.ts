import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { decodeSourceRgbaPng } from "../core/baked-source";
import { readThemeBundle } from "./bundle";

const root = new URL("../../", import.meta.url);
const bytes = async (file: string) =>
  new Uint8Array(await readFile(new URL(file, root)));
const sha = (input: Uint8Array) =>
  createHash("sha256").update(input).digest("hex");
const json = (input: Uint8Array) => JSON.parse(strFromU8(input));

describe("isolated source pixel studies", () => {
  for (const character of ["male", "female"])
    for (const variant of ["detail", "compact"])
      it(`imports ${character}/${variant} with the approved source timeline and fixed palette`, async () => {
        const source = await bytes(
          `docs/kling-motion/exports/${character}.character.zip`,
        );
        const original = json(unzipSync(source)["manifest.json"]);
        const theme = await readThemeBundle(
          await bytes(
            `docs/kling-source-pixel-study/bundles/${character}-${variant}.theme.zip`,
          ),
        );
        const catalog = json(
          await bytes("artwork/kling-themes/catalog-index.json"),
        );
        expect(
          catalog.some((entry: { key: string }) => entry.key === theme.key),
        ).toBe(false);
        expect(theme.manifest.reference.sourceSha256).toBe(sha(source));
        expect(theme.looks).toHaveLength(1);
        const look = theme.looks[0];
        expect(sha(look.bytes)).toBe(
          sha(
            await bytes(
              `docs/kling-source-pixel-study/bundles/${character}-${variant}.character.zip`,
            ),
          ),
        );
        const { manifest, config } = look.archive;
        expect(manifest.schemaVersion).toBe(4);
        expect(manifest.scale).toMatchObject({
          pixelArt: true,
          integerOnly: true,
        });
        expect([
          manifest.spritesheet.frameWidth,
          manifest.spritesheet.frameHeight,
        ]).toEqual([176, 266]);
        expect(manifest.anchor).toMatchObject({ x: 88, y: 250 });
        expect(manifest.facing).toEqual(original.facing);
        expect(config.source.sha256).toBe(sha(source));
        const included =
          character === "male" ? ["idle", "walk", "run"] : ["idle", "walk"];
        expect(Object.keys(manifest.animations).sort()).toEqual(
          included.sort(),
        );
        const selectedIds = new Set<number>();
        for (const [action, clip] of Object.entries(manifest.animations)) {
          expect(clip).toEqual(original.animations[action]);
          for (const id of clip!.frames) selectedIds.add(id);
        }
        expect(manifest.frames.map((f) => f.id).sort((a, b) => a - b)).toEqual(
          [...selectedIds].sort((a, b) => a - b),
        );
        const paletteId = variant === "detail" ? "detail-128" : "compact-64";
        const palette = json(
          await bytes(
            `artwork/kling-source-pixel-study/palettes/${paletteId}.json`,
          ),
        );
        const colors = new Set(
          palette.colors.map((rgb: number[]) => rgb.join(",")),
        );
        const image = decodeSourceRgbaPng(look.archive.png);
        let visible = 0;
        for (let i = 0; i < image.pixels.length; i += 4) {
          if (image.pixels[i + 3]) {
            visible++;
            if (!colors.has(image.pixels.slice(i, i + 3).join(",")))
              throw Error(`Pixel ${i / 4} is outside the shared palette.`);
          } else if (
            image.pixels[i] ||
            image.pixels[i + 1] ||
            image.pixels[i + 2]
          )
            throw Error(
              "Fully transparent output must not carry a matte color.",
            );
        }
        expect(visible).toBeGreaterThan(0);
        if (variant === "compact")
          for (let y = 0; y < image.height; y += 2)
            for (let x = 0; x < image.width; x += 2) {
              const p = (y * image.width + x) * 4;
              for (const offset of [4, image.width * 4, image.width * 4 + 4])
                for (let channel = 0; channel < 4; channel++)
                  if (
                    image.pixels[p + channel] !==
                    image.pixels[p + offset + channel]
                  )
                    throw Error(
                      "Compact study must preserve exact nearest 2× cells.",
                    );
            }
      }, 60000);
});
