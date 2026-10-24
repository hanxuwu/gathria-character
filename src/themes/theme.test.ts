import { createHash } from "node:crypto";
import { strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeSourceRgbaPng } from "../core/baked-source";
import * as preparation from "../core/source-preparation";
import {
  createThemeBundle,
  readThemeBundle,
  getThemeLook,
  assertCompleteTheme,
  type ThemeBundleInput,
} from "./bundle";
import {
  createThemeSession,
  addTheme,
  selectTheme,
  selectThemeLook,
  selectThemePlayback,
  getSelectedThemeLook,
  readThemeSession,
  exportThemeSession,
  exportSelectedThemePack,
} from "./session";
import { THEME_MAX_BYTES, validateThemeManifest } from "./contract";
import { assertPublishedThemeIdentity } from "./published";

afterEach(() => vi.restoreAllMocks());
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown) => strToU8(JSON.stringify(value));
const zipTime = new Date(2020, 0, 1, 0, 0, 0);

function pack({
  characterId = "fixture-male",
  pixel = false,
  partial = false,
  tint = 60,
  width = 4,
  fps = 12,
} = {}) {
  const manifest = {
    format: "gathria-character-pack",
    schemaVersion: pixel ? 4 : 2,
    name: "Authored test poses",
    generator: "theme-test-fixture",
    spritesheet: {
      file: "spritesheet.png",
      width: width * 2,
      height: 4,
      frameWidth: width,
      frameHeight: 4,
      columns: 2,
      rows: 1,
    },
    ...(pixel ? { additionalSheets: [] } : {}),
    frames: [0, 1].map((id) => ({
      id,
      x: id * width,
      y: 0,
      width,
      height: 4,
      ...(pixel ? { page: 0 } : {}),
    })),
    animations: {
      idle: { frames: [0, 0], fps: 2, loop: true },
      walk: { frames: [0, 1, 1], fps, loop: true },
      ...(!partial
        ? {
            run: { frames: [0, 1], fps, loop: true },
            jump: { frames: [0, 1, 1], fps, loop: false },
            celebrate: { frames: [1, 0], fps, loop: true },
          }
        : {}),
    },
    anchor: {
      x: Math.floor(width / 2),
      y: 3,
      units: "pixels",
      origin: "top-left",
    },
    facing: { native: "right", right: "none", left: "mirror-x" },
    scale: { pixelArt: pixel, integerOnly: pixel, recommended: 1 },
    capabilities: { renderMode: "baked", editableAppearance: false },
    configuration: "character.json",
  };
  const recipe = {
    format: "gathria-baked-character",
    schemaVersion: 1,
    name: manifest.name,
    characterId,
    source: {
      kind: "unified-archive",
      name: "synthetic-fixture",
      sha256: "a".repeat(64),
    },
    provenance: "Synthetic validation pixels, not character artwork.",
    derivation: {
      method: "Two explicit test poses.",
      frames: [0, 1].map((frameId) => ({
        frameId,
        sourceFrame: frameId,
        timeSeconds: frameId / fps,
      })),
    },
  };
  const pixels = new Uint8Array(width * 2 * 4 * 4);
  for (let i = 0; i < pixels.length; i += 4)
    pixels.set([tint, 80, i % 230, i < 16 ? 0 : 255], i);
  return zipSync(
    {
      "manifest.json": json(manifest),
      "character.json": json(recipe),
      "spritesheet.png": encodeSourceRgbaPng({
        width: width * 2,
        height: 4,
        pixels,
        colorChunks: [],
      }),
      "PROVENANCE.txt": strToU8(recipe.provenance),
      "INTEGRATION.md": strToU8("Synthetic fixture."),
    },
    { mtime: zipTime },
  );
}
function input(overrides: Partial<ThemeBundleInput> = {}): ThemeBundleInput {
  return {
    id: "original",
    revision: 1,
    name: "Original theme",
    character: "male",
    characterId: "fixture-male",
    rendering: "smooth",
    reference: {
      sourceSha256: "b".repeat(64),
      description: "Explicit test source reference.",
    },
    provenance: "Synthetic validation bundle; no generated artwork.",
    looks: [{ logicalId: "daily", name: "Daily", bytes: pack() }],
    ...overrides,
  };
}
function mutateTheme(
  bytes: Uint8Array,
  change: (manifest: any, files: Record<string, Uint8Array>) => void,
) {
  const files = unzipSync(bytes),
    manifest = JSON.parse(new TextDecoder().decode(files["theme.json"]));
  change(manifest, files);
  files["theme.json"] = json(manifest);
  return zipSync(files, { mtime: zipTime });
}
function mutateSession(
  bytes: Uint8Array,
  change: (document: any, files: Record<string, Uint8Array>) => void,
) {
  const files = unzipSync(bytes),
    doc = JSON.parse(new TextDecoder().decode(files["session.json"]));
  change(doc, files);
  files["session.json"] = json(doc);
  return zipSync(files, { mtime: zipTime });
}

describe("authored theme bundles", () => {
  it("keeps original CharacterPack bytes and owns all input buffers", async () => {
    const art = pack(),
      bundle = await createThemeBundle(
        input({ looks: [{ logicalId: "daily", name: "Daily", bytes: art }] }),
      );
    expect(bundle.key).toBe("male:original@1");
    expect(getThemeLook(bundle, "daily")?.bytes).toEqual(art);
    const raw = new Uint8Array(bundle.bytes),
      loaded = await readThemeBundle(raw);
    raw.fill(0);
    art.fill(0);
    expect(loaded.bytes).toEqual(bundle.bytes);
    expect(loaded.looks[0].bytes[0]).toBe(0x50);
    expect(getThemeLook(loaded, "missing")).toBeNull();
  });
  it("constructs deterministic archives and explicitly complete publication candidates", async () => {
    const a = await createThemeBundle(input()),
      b = await createThemeBundle(input());
    expect(a.bytes).toEqual(b.bytes);
    expect(a.sha256).toBe(sha(a.bytes));
    expect(() => assertCompleteTheme(a)).not.toThrow();
  });
  it("preserves differing native dimensions, anchors and action timings of actual themes", async () => {
    const theme = await createThemeBundle(
      input({
        id: "pixel",
        rendering: "pixel",
        looks: [
          {
            logicalId: "daily",
            name: "Pixel daily",
            bytes: pack({ pixel: true, width: 6, fps: 8 }),
          },
        ],
      }),
    );
    expect(theme.looks[0].archive.manifest.schemaVersion).toBe(4);
    expect(theme.looks[0].archive.manifest.spritesheet.frameWidth).toBe(6);
    expect(theme.looks[0].archive.manifest.anchor).toMatchObject({
      x: 3,
      y: 3,
    });
    expect(theme.looks[0].archive.manifest.animations.run?.fps).toBe(8);
  });
  it("accepts explicitly partial imports but rejects them for complete publication", async () => {
    const theme = await createThemeBundle(
      input({
        looks: [
          {
            logicalId: "daily",
            name: "Partial",
            bytes: pack({ partial: true }),
          },
        ],
      }),
    );
    expect(theme.looks[0].archive.manifest.animations.jump).toBeUndefined();
    expect(() => assertCompleteTheme(theme)).toThrow(/missing run/);
  });
  it("rejects false rendering declarations and mixed identities", async () => {
    await expect(
      createThemeBundle(input({ rendering: "pixel" })),
    ).rejects.toThrow(/rendering mode/);
    await expect(
      createThemeBundle(input({ characterId: "unrelated" })),
    ).rejects.toThrow(/character identity/);
  });
  it("rejects duplicate logical outfit keys, bad revisions and unknown manifest fields", async () => {
    const bundle = await createThemeBundle(input());
    expect(() =>
      validateThemeManifest({ ...bundle.manifest, revision: 0 }),
    ).toThrow(/revision/);
    expect(() =>
      validateThemeManifest({
        ...bundle.manifest,
        dangerousUrl: "https://example.test",
      }),
    ).toThrow(/unexpected/);
    await expect(
      createThemeBundle(input({ looks: [input().looks[0], input().looks[0]] })),
    ).rejects.toThrow(/unique/);
  });
  it("rejects renamed paths, undeclared files, forged reference hashes and stale look hashes", async () => {
    const bundle = await createThemeBundle(input());
    for (const change of [
      (m: any) => {
        m.looks[0].file = "../look-0.character.zip";
      },
      (_m: any, f: Record<string, Uint8Array>) => {
        f["README.md"] = strToU8("extra");
      },
      (m: any) => {
        m.reference.sourceSha256 = "unverified";
      },
      (m: any) => {
        m.looks[0].sha256 = "f".repeat(64);
      },
    ])
      await expect(
        readThemeBundle(mutateTheme(bundle.bytes, change)),
      ).rejects.toThrow();
  });
  it("decodes PNG content instead of trusting only its header and outer hash", async () => {
    const bundle = await createThemeBundle(input());
    const bytes = mutateTheme(bundle.bytes, (m, files) => {
      const inner = unzipSync(files[m.looks[0].file]);
      inner["spritesheet.png"] = inner["spritesheet.png"].slice(0, 33);
      const changed = zipSync(inner, { mtime: zipTime });
      files[m.looks[0].file] = changed;
      m.looks[0].sha256 = sha(changed);
    });
    await expect(readThemeBundle(bytes)).rejects.toThrow();
  });
  it("rejects an invalid later look atomically while the accepted bundle remains intact", async () => {
    const accepted = await createThemeBundle(input());
    const good = await createThemeBundle(
      input({
        id: "two",
        looks: [
          input().looks[0],
          { logicalId: "wedding", name: "Wedding", bytes: pack({ tint: 100 }) },
        ],
      }),
    );
    const original = new Uint8Array(accepted.bytes);
    await expect(
      readThemeBundle(
        mutateTheme(good.bytes, (m) => {
          m.looks[1].sha256 = "0".repeat(64);
        }),
      ),
    ).rejects.toThrow(/checksum/);
    expect(accepted.bytes).toEqual(original);
    expect(accepted.looks).toHaveLength(1);
  });
  it("honors pre-aborted and mid-import cancellation without accepting a partial bundle", async () => {
    const theme = await createThemeBundle(input()),
      early = new AbortController();
    early.abort();
    await expect(
      readThemeBundle(theme.bytes, { signal: early.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    const mid = new AbortController(),
      original = preparation.prepareSourceArchive;
    vi.spyOn(preparation, "prepareSourceArchive").mockImplementationOnce(
      async (...args) => {
        const result = await original(...args);
        mid.abort();
        return result;
      },
    );
    await expect(
      readThemeBundle(theme.bytes, { signal: mid.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("rejects over-budget archives before copying or decoding", async () => {
    // Sparse view changes are unnecessary: one byte beyond the explicit import budget.
    await expect(
      readThemeBundle(new Uint8Array(THEME_MAX_BYTES + 1)),
    ).rejects.toThrow(/128 MiB/);
  });
});

describe("portable theme sessions", () => {
  it("reserves published original keys before that character is loaded", async () => {
    const male = await createThemeBundle(input());
    const originalFemaleInput = input({
      character: "female",
      characterId: "fixture-female",
      looks: [
        {
          logicalId: "daily",
          name: "Daily",
          bytes: pack({ characterId: "fixture-female" }),
        },
      ],
    });
    const female = await createThemeBundle(originalFemaleInput);
    const spoof = await createThemeBundle({
      ...originalFemaleInput,
      name: "Unrelated art with reserved key",
      looks: [
        {
          logicalId: "daily",
          name: "Daily",
          bytes: pack({ characterId: "fixture-female", tint: 180 }),
        },
      ],
    });
    const catalog = [male, female].map((theme) => ({
      key: theme.key,
      sha256: theme.sha256,
      character: theme.manifest.character,
    }));
    const accepted = createThemeSession([male]);
    // The collision is not yet in the session, so generic local addTheme is valid.
    const candidate = addTheme(accepted, spoof);
    expect(() =>
      candidate.themes.forEach((theme) =>
        assertPublishedThemeIdentity(theme, catalog),
      ),
    ).toThrow(/approved catalog/);
    expect(accepted.themes).toEqual([male]);
    expect(() => assertPublishedThemeIdentity(female, catalog)).not.toThrow();
    // Wrapping the same impostor in an otherwise valid saved session cannot bypass the check.
    const restored = await readThemeSession(
      await exportThemeSession(candidate),
    );
    expect(() =>
      restored.themes.forEach((theme) =>
        assertPublishedThemeIdentity(theme, catalog),
      ),
    ).toThrow(/approved catalog/);
    const distinct = await createThemeBundle({
      ...originalFemaleInput,
      id: "independent-art",
    });
    expect(() => assertPublishedThemeIdentity(distinct, catalog)).not.toThrow();
  });
  it("preserves an unavailable semantic look across theme switches, with no fallback", async () => {
    const original = await createThemeBundle(input());
    const other = await createThemeBundle(
      input({
        id: "other",
        looks: [{ logicalId: "wedding", name: "Wedding", bytes: pack() }],
      }),
    );
    const before = createThemeSession([original, other]);
    const missing = selectTheme(before, other.key);
    expect(missing.selection.lookId).toBe("daily");
    expect(getSelectedThemeLook(missing)).toBeNull();
    expect(before.selection.themeKey).toBe(original.key);
    await expect(exportSelectedThemePack(missing)).rejects.toThrow(
      /unavailable/,
    );
    expect(
      getSelectedThemeLook(selectThemeLook(missing, "wedding"))?.logicalId,
    ).toBe("wedding");
    expect(() => selectThemeLook(missing, "daily")).toThrow(/unavailable/);
    expect(
      getSelectedThemeLook(selectTheme(missing, original.key))?.logicalId,
    ).toBe("daily");
  });
  it("retains an unavailable action request without inventing motion", async () => {
    const full = await createThemeBundle(input());
    const partial = await createThemeBundle(
      input({
        id: "partial",
        looks: [
          {
            logicalId: "daily",
            name: "Partial",
            bytes: pack({ partial: true }),
          },
        ],
      }),
    );
    const session = selectThemePlayback(createThemeSession([full, partial]), {
      action: "jump",
      facing: "left",
    });
    const changed = selectTheme(session, partial.key);
    expect(changed.selection).toMatchObject({ action: "jump", facing: "left" });
    expect(
      getSelectedThemeLook(changed)?.archive.manifest.animations.jump,
    ).toBeUndefined();
  });
  it("saves and reopens missing look requests, exact themes, revision and action/facing", async () => {
    const male = await createThemeBundle(input());
    const female = await createThemeBundle(
      input({
        id: "female",
        character: "female",
        characterId: "fixture-female",
        looks: [
          {
            logicalId: "wedding",
            name: "Wedding",
            bytes: pack({ characterId: "fixture-female" }),
          },
        ],
      }),
    );
    const session = selectThemePlayback(
      selectTheme(createThemeSession([male, female]), female.key),
      { action: "jump", facing: "left" },
    );
    const a = await exportThemeSession(session),
      b = await exportThemeSession(session);
    expect(a).toEqual(b);
    const reopened = await readThemeSession(a);
    expect(reopened.selection).toEqual(session.selection);
    expect(reopened.themes.map((t) => t.sha256)).toEqual([
      male.sha256,
      female.sha256,
    ]);
    expect(getSelectedThemeLook(reopened)).toBeNull();
    const selected = selectThemeLook(reopened, "wedding");
    expect(await exportSelectedThemePack(selected)).toEqual(
      female.looks[0].bytes,
    );
  });
  it("keeps immutable revision identities and allows explicit newer revisions", async () => {
    const a = await createThemeBundle(input()),
      changed = await createThemeBundle(
        input({ name: "Changed at same revision" }),
      );
    const session = createThemeSession([a]);
    expect(addTheme(session, a)).toBe(session);
    expect(() => addTheme(session, changed)).toThrow(/new revision/);
    const b = await createThemeBundle(input({ revision: 2 }));
    expect(addTheme(session, b).themes).toHaveLength(2);
  });
  it("rejects session hashes, key mismatch, invalid selections and undeclared files", async () => {
    const session = createThemeSession([await createThemeBundle(input())]);
    const bytes = await exportThemeSession(session);
    for (const change of [
      (d: any) => {
        d.themes[0].sha256 = "0".repeat(64);
      },
      (d: any) => {
        d.themes[0].key = "male:wrong@1";
      },
      (d: any) => {
        d.selection.themeKey = "female:unknown@1";
      },
      (d: any) => {
        d.selection.action = "teleport";
      },
      (_d: any, f: Record<string, Uint8Array>) => {
        f["extra.png"] = strToU8("not allowed");
      },
    ])
      await expect(
        readThemeSession(mutateSession(bytes, change)),
      ).rejects.toThrow();
  });
  it("rejects duplicate embedded revisions even if hashes match", async () => {
    const a = await createThemeBundle(input());
    expect(() => createThemeSession([a, a])).toThrow(/unique/);
    const bytes = await exportThemeSession(createThemeSession([a]));
    const changed = mutateSession(bytes, (d, f) => {
      d.themes.push({ ...d.themes[0], file: "theme-1.zip" });
      f["theme-1.zip"] = f["theme-0.zip"];
    });
    await expect(readThemeSession(changed)).rejects.toThrow(/unique/);
  });
  it("revalidates raw accepted bytes for export instead of trusting mutable caches", async () => {
    const a = await createThemeBundle(input()),
      session = createThemeSession([a]);
    a.looks[0].bytes.fill(0); // Public preview buffers cannot corrupt exported raw artwork.
    expect((await exportSelectedThemePack(session))[0]).toBe(0x50);
    a.bytes[0] = 0;
    await expect(exportThemeSession(session)).rejects.toThrow();
  });
  it("cancels session import/export and rejects unknown active revisions", async () => {
    const session = createThemeSession([await createThemeBundle(input())]);
    const raw = await exportThemeSession(session),
      controller = new AbortController();
    controller.abort();
    await expect(
      readThemeSession(raw, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      exportThemeSession(session, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(() => selectTheme(session, "male:unknown@1")).toThrow(
      /not embedded/,
    );
  });
});
