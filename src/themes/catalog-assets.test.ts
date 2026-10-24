import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
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
        if (!entry.isOriginal && entry.manifest.revision > 1) {
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

  it("retains the published first revision byte for byte when a newer artwork revision is added", () => {
    const immutable = {
      "male:pixel-storybook@1":
        "6eb2a23e7f073ec5a489101fef31932237b384cf88836dd3e0f1656c0b16b6b7",
      "female:pixel-storybook@1":
        "5be27e3dc377c968146eca1a78f29ffdf20bee5bbb22ec6126a80176d0c00d34",
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
