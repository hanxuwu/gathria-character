import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { encodeSourceRgbaPng } from "./baked-source";
import {
  createBakedCharacterPack,
  readPortableCharacterPackArchive,
} from "./pack";
import type { BakedCharacterRecipe, CharacterPackV2Manifest } from "./types";
import {
  createSpriteActionProject,
  deriveSpriteActionPlayback,
  exportSpriteActionPack,
  exportSpriteActionProject,
  importSpriteActionProject,
  resetSpriteAction,
  updateSpriteAction,
  validateSpriteActionDocument,
} from "./sprite-actions";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
async function fixture() {
  const manifest: CharacterPackV2Manifest = {
    schemaVersion: 2,
    format: "gathria-character-pack",
    name: "Independent sprite fixture",
    generator: "test-source",
    spritesheet: {
      file: "spritesheet.png",
      width: 3,
      height: 1,
      frameWidth: 1,
      frameHeight: 1,
      columns: 3,
      rows: 1,
    },
    frames: [10, 21, 42].map((id, x) => ({ id, x, y: 0, width: 1, height: 1 })),
    animations: {
      idle: { frames: [10], fps: 1, loop: true },
      walk: { frames: [42, 21, 21, 10], fps: 24, loop: true },
    },
    anchor: { x: 0.5, y: 1, units: "pixels", origin: "top-left" },
    facing: { native: "right", right: "none", left: "mirror-x" },
    scale: { pixelArt: false, integerOnly: false, recommended: 1 },
    capabilities: { renderMode: "baked", editableAppearance: false },
    configuration: "character.json",
  };
  const config: BakedCharacterRecipe = {
    format: "gathria-baked-character",
    schemaVersion: 1,
    name: manifest.name,
    characterId: "independent-fixture",
    source: {
      kind: "video-extraction",
      name: "fixture.mp4",
      sha256: "a".repeat(64),
    },
    provenance: "Original fixture source, untouched artwork.",
    derivation: {
      method: "Original frame extraction at 24 fps.",
      frames: manifest.frames.map((f, i) => ({
        frameId: f.id,
        sourceFrame: 100 + i,
        timeSeconds: (100 + i) / 24,
      })),
    },
    sourceMetadata: { creator: "fixture", preserved: { alpha: "smooth" } },
  };
  const png = encodeSourceRgbaPng({
    width: 3,
    height: 1,
    pixels: new Uint8Array([0, 0, 0, 0, 240, 120, 60, 128, 50, 80, 90, 255]),
    colorChunks: [],
  });
  const blob = await createBakedCharacterPack(
    config,
    manifest,
    new Blob([png], { type: "image/png" }),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

describe("sprite action project contract", () => {
  it("keeps independent V2 input, repeated frame order and exact original export after reset", async () => {
    const bytes = await fixture();
    const project = await createSpriteActionProject(bytes);
    expect(project.document.actions.walk).toEqual({
      start: 0,
      end: 3,
      fps: 24,
      loop: true,
    });
    expect(project.document.actions.jump).toBeUndefined();
    expect(deriveSpriteActionPlayback(project).changed).toBe(false);
    const edited = updateSpriteAction(project, "walk", {
      start: 1,
      end: 2,
      fps: 12,
      loop: false,
    });
    const preview = deriveSpriteActionPlayback(edited);
    expect(preview.manifest.animations.walk).toEqual({
      frames: [21, 21],
      fps: 12,
      loop: false,
    });
    expect(project.archive.manifest.animations.walk.frames).toEqual([
      42, 21, 21, 10,
    ]);
    expect(project.document.actions.walk?.start).toBe(0);
    expect(preview.manifest.frames).toEqual(project.archive.manifest.frames);
    expect(preview.manifest.anchor).toEqual(project.archive.manifest.anchor);
    expect(preview.config.source).toEqual(project.archive.config.source);
    expect(preview.config.derivation.frames).toEqual(
      project.archive.config.derivation.frames,
    );
    expect(preview.config.provenance).toContain(
      "playback timing may now differ",
    );
    expect(preview.config.sourceMetadata?.creator).toBe("fixture");
    const exported = readPortableCharacterPackArchive(
      new Uint8Array(
        await (await exportSpriteActionPack(edited)).arrayBuffer(),
      ),
    );
    expect(sha(exported.png)).toBe(sha(project.archive.png));
    expect(exported.manifest.animations.walk).toEqual(
      preview.manifest.animations.walk,
    );
    const reset = resetSpriteAction(edited, "walk");
    expect(deriveSpriteActionPlayback(reset).changed).toBe(false);
    expect(
      sha(
        new Uint8Array(
          await (await exportSpriteActionPack(reset)).arrayBuffer(),
        ),
      ),
    ).toBe(sha(bytes));
  });

  it("saves and reopens a canonical self-contained project with the full original source retained", async () => {
    const original = await createSpriteActionProject(await fixture());
    const edited = updateSpriteAction(original, "walk", {
      start: 2,
      end: 2,
      fps: 0.5,
      loop: false,
    });
    const first = await exportSpriteActionProject(edited);
    const reopened = await importSpriteActionProject(first);
    expect(reopened.document).toEqual(edited.document);
    expect(sha(reopened.source)).toBe(sha(original.source));
    expect(
      deriveSpriteActionPlayback(reopened).manifest.animations.walk,
    ).toEqual({ frames: [21], fps: 0.5, loop: false });
    expect(sha(await exportSpriteActionProject(reopened))).toBe(sha(first));
    const entries = unzipSync(first);
    expect(Object.keys(entries)).toEqual([
      "document.json",
      "original.character.zip",
    ]);
    expect(sha(entries["original.character.zip"])).toBe(sha(original.source));
  });

  it("rejects invalid ranges, timing, unavailable actions and undocumented fields", async () => {
    const project = await createSpriteActionProject(await fixture());
    for (const invalid of [
      { start: -1, end: 2, fps: 24, loop: true },
      { start: 0, end: 4, fps: 24, loop: true },
      { start: 2, end: 1, fps: 24, loop: true },
      { start: 0.5, end: 2, fps: 24, loop: true },
      { start: 0, end: 2, fps: Infinity, loop: true },
      { start: 0, end: 2, fps: 0, loop: true },
      { start: 0, end: 2, fps: 61, loop: true },
      { start: 0, end: 2, fps: 24, loop: "yes" },
    ])
      expect(() =>
        updateSpriteAction(project, "walk", invalid as never),
      ).toThrow();
    expect(() =>
      updateSpriteAction(project, "jump", {
        start: 0,
        end: 0,
        fps: 24,
        loop: false,
      }),
    ).toThrow(/does not contain jump/);
    expect(() =>
      validateSpriteActionDocument(
        { ...project.document, transformPixels: true },
        project.archive.manifest,
      ),
    ).toThrow(/Unexpected/);
    expect(() =>
      validateSpriteActionDocument(
        {
          ...project.document,
          actions: { idle: project.document.actions.idle },
        },
        project.archive.manifest,
      ),
    ).toThrow(/missing walk/);
    expect(() =>
      validateSpriteActionDocument(
        {
          ...project.document,
          actions: { ...project.document.actions, dance: {} },
        },
        project.archive.manifest,
      ),
    ).toThrow(/Unexpected/);
  });

  it("rejects tampered source bindings, archive paths and CRC corruption before accepting a project", async () => {
    const project = await createSpriteActionProject(await fixture());
    const zip = await exportSpriteActionProject(project);
    const files = unzipSync(zip);
    files["document.json"] = strToU8(
      JSON.stringify({ ...project.document, sourceSha256: "0".repeat(64) }),
    );
    await expect(importSpriteActionProject(zipSync(files))).rejects.toThrow(
      /checksum/,
    );
    await expect(
      exportSpriteActionProject({
        ...project,
        document: { ...project.document, sourceSha256: "0".repeat(64) },
      }),
    ).rejects.toThrow(/checksum/);
    await expect(
      exportSpriteActionPack({
        ...project,
        document: { ...project.document, sourceSha256: "0".repeat(64) },
      }),
    ).rejects.toThrow(/checksum/);
    const invalidPaths = {
      "document.json": strToU8(JSON.stringify(project.document)),
      "../original.character.zip": project.source,
    };
    await expect(
      importSpriteActionProject(zipSync(invalidPaths)),
    ).rejects.toThrow(/Unexpected ZIP path/);
    const stored = zipSync(
      {
        "document.json": strToU8(JSON.stringify(project.document)),
        "original.character.zip": project.source,
      },
      { level: 0 },
    );
    const corrupted = new Uint8Array(stored);
    corrupted[30 + "document.json".length + 4] ^= 1;
    await expect(importSpriteActionProject(corrupted)).rejects.toThrow(
      /checksum/,
    );
  });

  it.each(["male", "female"])(
    "edits actual Kling %s V3 timing while preserving every atlas byte and source mapping",
    async (character) => {
      const bytes = new Uint8Array(
        await readFile(
          new URL(
            `../../docs/kling-jump/exports/${character}.character.zip`,
            import.meta.url,
          ),
        ),
      );
      const project = await createSpriteActionProject(bytes);
      const original = project.archive;
      expect(original.manifest.schemaVersion).toBe(3);
      const clip = original.manifest.animations.jump!;
      const edited = updateSpriteAction(project, "jump", {
        start: 1,
        end: clip.frames.length - 2,
        fps: 12,
        loop: false,
      });
      const exported = readPortableCharacterPackArchive(
        new Uint8Array(
          await (await exportSpriteActionPack(edited)).arrayBuffer(),
        ),
      );
      expect(exported.manifest.animations.jump).toEqual({
        frames: clip.frames.slice(1, -1),
        fps: 12,
        loop: false,
      });
      expect(exported.manifest.animations.walk).toEqual(
        original.manifest.animations.walk,
      );
      expect(exported.manifest.frames).toEqual(original.manifest.frames);
      expect(exported.manifest.anchor).toEqual(original.manifest.anchor);
      expect(exported.config.characterId).toBe(original.config.characterId);
      expect(exported.config.derivation.frames).toEqual(
        original.config.derivation.frames,
      );
      expect(
        [exported.png, ...(exported.additionalPngs ?? [])].map(sha),
      ).toEqual([original.png, ...(original.additionalPngs ?? [])].map(sha));
      expect(exported.config.sourceMetadata?.spriteActionEdit).toMatchObject({
        sourcePackSha256: project.document.sourceSha256,
        sourceFrameTimesUnchanged: true,
      });
      expect(sha(project.source)).toBe(sha(bytes));
    },
    30000,
  );
});
