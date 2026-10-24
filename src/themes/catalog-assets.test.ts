import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { decodeSourceRgbaPng } from "../core/baked-source";
import {
  readPortableCharacterPackArchive,
  type PortableCharacterPackArchive,
} from "../core/pack";
import type { PortableAnimationName } from "../core/types";
import { assertCompleteTheme, readThemeBundle } from "./bundle";
import { assertPublishedThemeIdentity } from "./published";
import type { ThemeManifest } from "./contract";

const root = new URL("../../", import.meta.url);
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const catalog = JSON.parse(
  await readFile(
    new URL("artwork/kling-themes/catalog-index.json", root),
    "utf8",
  ),
) as Array<{
  key: string;
  character: "male" | "female";
  file: string;
  sha256: string;
  bytes: number;
  isOriginal: boolean;
  current: boolean;
  manifest: ThemeManifest;
  lookAssets: Array<{
    logicalId: string;
    file: string;
    sha256: string;
    bytes: number;
  }>;
}>;

/** Compare semantic action positions, not atlas coordinates: adding genuine
 * run drawings may move the unchanged jump/celebrate frames to a later row. */
function frameHashes(
  archive: PortableCharacterPackArchive,
): Map<number, string> {
  const pages = [archive.png, ...(archive.additionalPngs ?? [])].map((bytes) =>
    decodeSourceRgbaPng(bytes),
  );
  return new Map(
    archive.manifest.frames.map((frame) => {
      const image = pages[frame.page ?? 0];
      const pixels = new Uint8Array(frame.width * frame.height * 4);
      for (let y = 0; y < frame.height; y++) {
        const start = ((frame.y + y) * image.width + frame.x) * 4;
        pixels.set(
          image.pixels.subarray(start, start + frame.width * 4),
          y * frame.width * 4,
        );
      }
      return [frame.id, sha(pixels)];
    }),
  );
}

describe("published authored theme assets use the real runtime parser", () => {
  for (const entry of catalog) {
    it(`accepts the actual ${entry.key} theme and both complete looks`, async () => {
      const bytes = new Uint8Array(await readFile(new URL(entry.file, root)));
      expect(bytes.length).toBe(entry.bytes);
      expect(sha(bytes)).toBe(entry.sha256);
      // This parses the exact shipping ZIP, requires the portable integration
      // files and decodes every atlas, rather than accepting a synthetic fixture.
      const theme = await readThemeBundle(bytes);
      expect(entry.manifest).toEqual(theme.manifest);
      expect(theme.key).toBe(entry.key);
      expect(() => assertPublishedThemeIdentity(theme, catalog)).not.toThrow();
      expect(() => assertCompleteTheme(theme)).not.toThrow();
      expect(theme.looks.map((look) => look.logicalId).sort()).toEqual([
        "base",
        "wedding",
      ]);
      for (const look of theme.looks) {
        const lazyAsset = entry.lookAssets.find(
          (asset) => asset.logicalId === look.logicalId,
        )!;
        expect(lazyAsset).toBeDefined();
        const lazyBytes = new Uint8Array(
          await readFile(new URL(lazyAsset.file, root)),
        );
        expect(lazyBytes.length).toBe(lazyAsset.bytes);
        expect(sha(lazyBytes)).toBe(lazyAsset.sha256);
        expect(lazyAsset.sha256).toBe(sha(look.bytes));
        const files = unzipSync(look.bytes);
        expect(
          strFromU8(files["PROVENANCE.txt"]).trim().length,
        ).toBeGreaterThan(20);
        expect(
          strFromU8(files["INTEGRATION.md"]).trim().length,
        ).toBeGreaterThan(20);
        if (!entry.isOriginal)
          expect(look.archive.manifest.schemaVersion).toBe(4);
        expect(look.archive.manifest.scale).toMatchObject({
          pixelArt: !entry.isOriginal,
          integerOnly: !entry.isOriginal,
        });
        if (!entry.isOriginal && entry.manifest.revision === 2) {
          const previous = catalog.find(
            (candidate) =>
              candidate.character === entry.character &&
              candidate.manifest.id === entry.manifest.id &&
              candidate.manifest.revision === 1,
          )!;
          const previousLook = previous.lookAssets.find(
            (asset) => asset.logicalId === look.logicalId,
          )!;
          const previousFiles = unzipSync(
            new Uint8Array(await readFile(new URL(previousLook.file, root))),
          );
          const previousManifest = JSON.parse(
            strFromU8(previousFiles["manifest.json"]),
          );
          expect(look.archive.manifest.animations).toEqual(
            previousManifest.animations,
          );
          expect(look.archive.manifest.anchor).toEqual(previousManifest.anchor);
          expect(look.archive.manifest.frames).toEqual(previousManifest.frames);
          expect(look.archive.manifest.facing).toEqual(previousManifest.facing);
        }
        if (!entry.isOriginal && entry.manifest.revision === 3) {
          const previous = catalog.find(
            (candidate) =>
              candidate.character === entry.character &&
              candidate.manifest.id === entry.manifest.id &&
              candidate.manifest.revision === 2,
          )!;
          expect(previous).toBeDefined();
          const previousLook = previous.lookAssets.find(
            (asset) => asset.logicalId === look.logicalId,
          )!;
          const previousArchive = readPortableCharacterPackArchive(
            new Uint8Array(await readFile(new URL(previousLook.file, root))),
          );
          const manifest = look.archive.manifest;
          const previousManifest = previousArchive.manifest;
          expect(manifest.anchor).toEqual(previousManifest.anchor);
          expect(manifest.facing).toEqual(previousManifest.facing);
          expect(manifest.scale).toEqual(previousManifest.scale);
          expect([
            manifest.spritesheet.frameWidth,
            manifest.spritesheet.frameHeight,
          ]).toEqual([
            previousManifest.spritesheet.frameWidth,
            previousManifest.spritesheet.frameHeight,
          ]);
          for (const frame of manifest.frames)
            expect([frame.width, frame.height]).toEqual([
              previousManifest.spritesheet.frameWidth,
              previousManifest.spritesheet.frameHeight,
            ]);

          const beforeHashes = frameHashes(previousArchive);
          const afterHashes = frameHashes(look.archive);
          const actions = Object.keys(
            previousManifest.animations,
          ) as PortableAnimationName[];
          expect(Object.keys(manifest.animations).sort()).toEqual(
            [...actions].sort(),
          );
          for (const action of actions) {
            const before = previousManifest.animations[action]!;
            const after = manifest.animations[action]!;
            expect(after.loop).toBe(before.loop);
            expect(after.frames.length / after.fps).toBeCloseTo(
              before.frames.length / before.fps,
              12,
            );
            const maleRun =
              entry.character === "male" &&
              look.logicalId === "base" &&
              action === "run";
            const femaleWalk =
              entry.character === "female" &&
              look.logicalId === "base" &&
              action === "walk";
            const sequence = after.frames.map((id) => afterHashes.get(id));
            if (maleRun) {
              expect([8, 16]).toContain(after.frames.length);
              if (after.frames.length === 16) {
                expect(after.fps).toBe(24);
                expect(new Set(sequence).size).toBe(16);
              } else {
                expect(after.frames.length).toBe(before.frames.length);
                expect(after.fps).toBe(before.fps);
              }
            } else {
              expect(after.frames.length).toBe(before.frames.length);
              expect(after.fps).toBe(before.fps);
            }
            // Only two expressly reviewed base actions may change artwork.
            // Every wedding action and all other base poses remain exact RGBA,
            // including hidden RGB values under fully transparent pixels.
            if (!maleRun && !femaleWalk)
              expect(sequence).toEqual(
                before.frames.map((id) => beforeHashes.get(id)),
              );
          }
        }
        if (entry.isOriginal) {
          const source =
            look.logicalId === "base"
              ? `docs/kling-motion/exports/${entry.character}.character.zip`
              : `docs/kling-paint-roundtrip/evidence/${entry.character}-wedding-before.character.zip`;
          expect(sha(look.bytes)).toBe(
            sha(new Uint8Array(await readFile(new URL(source, root)))),
          );
        }
        expect(Object.keys(look.archive.manifest.animations).sort()).toEqual([
          "celebrate",
          "idle",
          "jump",
          "run",
          "walk",
        ]);
      }
    }, 60000);
  }

  it("retains published original, first and second revisions byte for byte", () => {
    const immutable = {
      "male:pixel-storybook@1":
        "6eb2a23e7f073ec5a489101fef31932237b384cf88836dd3e0f1656c0b16b6b7",
      "female:pixel-storybook@1":
        "5be27e3dc377c968146eca1a78f29ffdf20bee5bbb22ec6126a80176d0c00d34",
      "male:pixel-storybook@2":
        "bef6d6983b5c438a467d3282cfd71edbe7eadcd2ee4acaa2700b3fa26af6aef8",
      "female:pixel-storybook@2":
        "a52d002bf6f8372d8cd003669b88faae709f242212856d63e77b982743e10022",
      "male:kling-original@1":
        "6f712689a1f11f12db89a9f505a118bef09e409e23e5a5a89da2affc6a356f54",
      "female:kling-original@1":
        "14045433234209d5c7185dbff7690581d76257043c81dce1bef76c1a79954a3d",
    };
    for (const [key, checksum] of Object.entries(immutable))
      expect(catalog.find((entry) => entry.key === key)?.sha256).toBe(checksum);
    for (const character of ["male", "female"])
      for (const id of ["kling-original", "pixel-storybook"]) {
        const revisions = catalog.filter(
          (entry) => entry.character === character && entry.manifest.id === id,
        );
        const current = revisions.filter((entry) => entry.current);
        expect(current).toHaveLength(1);
        expect(current[0].manifest.revision).toBe(
          Math.max(...revisions.map((entry) => entry.manifest.revision)),
        );
      }
  });

  it("rejects a real authored pack whose mandatory provenance entry was omitted", async () => {
    const entry = catalog.find(
      (entry) => entry.character === "male" && !entry.isOriginal,
    )!;
    const files = unzipSync(
      new Uint8Array(await readFile(new URL(entry.file, root))),
    );
    const manifest = JSON.parse(strFromU8(files["theme.json"]));
    const firstLook = manifest.looks[0];
    const pack = unzipSync(files[firstLook.file]);
    delete pack["PROVENANCE.txt"];
    files[firstLook.file] = zipSync(pack);
    firstLook.sha256 = sha(files[firstLook.file]);
    files["theme.json"] = strToU8(JSON.stringify(manifest));
    await expect(readThemeBundle(zipSync(files))).rejects.toThrow(
      "PROVENANCE.txt",
    );
  }, 60000);
});
