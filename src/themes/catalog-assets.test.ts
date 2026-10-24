import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { assertCompleteTheme, readThemeBundle } from "./bundle";
import { assertPublishedThemeIdentity } from "./published";

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
      expect(theme.key).toBe(entry.key);
      expect(() => assertPublishedThemeIdentity(theme, catalog)).not.toThrow();
      expect(() => assertCompleteTheme(theme)).not.toThrow();
      expect(theme.looks.map((look) => look.logicalId).sort()).toEqual([
        "base",
        "wedding",
      ]);
      for (const look of theme.looks) {
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
