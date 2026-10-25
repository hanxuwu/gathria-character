import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { encodeSourceRgbaPng } from "../core/baked-source";
import { createBakedCharacterPack } from "../core/pack";
import type {
  BakedCharacterRecipe,
  CharacterPackV2Manifest,
} from "../core/types";
import {
  WARDROBE_ANCHORS,
  type WardrobeGarmentManifest,
  type WardrobeRegistration,
  type WardrobeSlot,
} from "../wardrobe/contract";
import {
  createWardrobeProject,
  addWardrobeAppearanceBank,
  selectWardrobeAppearance,
  addWardrobeGarment,
  selectWardrobeGarment,
  updateWardrobePreview,
  exportWardrobeProject,
  importWardrobeProject,
} from "../wardrobe/project";
import { appearanceFixture } from "./fixture.test-support";
import {
  getAppearanceUpgradeAvailability,
  appearanceReleaseFor,
  prepareAppearanceUpgrade,
  validateAppearanceCatalogRevision,
  type AppearanceCatalogRevision,
} from "./upgrade";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown) => strToU8(JSON.stringify(value));
const png = (width: number, height: number, pixels: Uint8Array) =>
  encodeSourceRgbaPng({ width, height, pixels, colorChunks: [] });
const zipTime = new Date(2020, 0, 1);

async function fixture() {
  const manifest: CharacterPackV2Manifest = {
    schemaVersion: 2,
    format: "gathria-character-pack",
    name: "Native wardrobe fixture",
    generator: "source-fixture",
    spritesheet: {
      file: "spritesheet.png",
      width: 16,
      height: 8,
      frameWidth: 8,
      frameHeight: 8,
      columns: 2,
      rows: 1,
    },
    frames: [
      { id: 7, x: 0, y: 0, width: 8, height: 8 },
      { id: 19, x: 8, y: 0, width: 8, height: 8 },
    ],
    animations: {
      idle: { frames: [7], fps: 1, loop: true },
      walk: { frames: [19, 7, 19], fps: 24, loop: true },
      run: { frames: [7, 19], fps: 24, loop: true },
      jump: { frames: [19, 7], fps: 24, loop: false },
      celebrate: { frames: [7, 19], fps: 12, loop: true },
    },
    anchor: { x: 4, y: 7, units: "pixels", origin: "top-left" },
    facing: { native: "right", right: "none", left: "mirror-x" },
    scale: { pixelArt: false, integerOnly: false, recommended: 1 },
    capabilities: { renderMode: "baked", editableAppearance: false },
    configuration: "character.json",
  };
  const config: BakedCharacterRecipe = {
    format: "gathria-baked-character",
    schemaVersion: 1,
    name: manifest.name,
    characterId: "wardrobe-source-fixture",
    source: {
      kind: "video-extraction",
      name: "fixture.mp4",
      sha256: "a".repeat(64),
    },
    provenance: "Small native source fixture; no generated pose changes.",
    derivation: {
      method: "Source video frames retained.",
      frames: [
        { frameId: 7, sourceFrame: 336, timeSeconds: 14 },
        { frameId: 19, sourceFrame: 348, timeSeconds: 14.5 },
      ],
    },
  };
  const pixels = new Uint8Array(16 * 8 * 4);
  for (let i = 0; i < pixels.length; i += 4)
    pixels.set([60 + (i % 40), 80, 100, 255], i);
  const source = new Uint8Array(
    await (
      await createBakedCharacterPack(
        config,
        manifest,
        new Blob([png(16, 8, pixels)], { type: "image/png" }),
      )
    ).arrayBuffer(),
  );
  const registration: WardrobeRegistration = {
    format: "gathria-wardrobe-registration",
    version: 1,
    sourceSha256: sha(source),
    characterId: config.characterId,
    frameWidth: 8,
    frameHeight: 8,
    anchor: { x: 4, y: 7 },
    frames: config.derivation.frames.map((f) => ({
      frameId: f.frameId,
      sourceFrame: f.sourceFrame,
      points: Object.fromEntries(
        WARDROBE_ANCHORS.map((name) => [
          name,
          {
            x: 4,
            y: 4,
            visibility: name.startsWith("far") ? "occluded" : "visible",
            confidence: 0.5,
            method: "Fixture placement; hidden joints inferred.",
          },
        ]),
      ) as WardrobeRegistration["frames"][number]["points"],
      protected: [
        {
          label: "head",
          polygon: [
            { x: 2, y: 0 },
            { x: 6, y: 0 },
            { x: 6, y: 2 },
            { x: 2, y: 2 },
          ],
        },
      ],
    })),
  };
  return { source, registration, registrationBytes: json(registration) };
}
function garment(
  registration: WardrobeRegistration,
  registrationBytes: Uint8Array,
  slot: WardrobeSlot = "top",
  id = `${slot}-fixture`,
) {
  const manifest: WardrobeGarmentManifest = {
    format: "gathria-sprite-garment",
    version: 1,
    id,
    name: `${slot} fixture`,
    slot,
    sourceSha256: registration.sourceSha256,
    registrationSha256: sha(registrationBytes),
    characterId: registration.characterId,
    frameWidth: 8,
    frameHeight: 8,
    pages: [
      {
        file: "patches-0.png",
        maskFile: "ownership-0.png",
        width: 4,
        height: 2,
      },
    ],
    frames: registration.frames.map((f, i) => ({
      frameId: f.frameId,
      page: 0,
      rect: { x: i * 2, y: 0, width: 2, height: 2 },
      offset: { x: 2, y: 3 },
    })),
    provenance:
      "Authored fixture patches; transparent owned pixels intentionally remove old clothing.",
  };
  const pixels = new Uint8Array(4 * 2 * 4),
    ownership = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels.set([180, 50, 100, 255], i);
    ownership.set([255, 255, 255, 255], i);
  }
  pixels.fill(0, 0, 4); // Owned transparent replacement is allowed.
  pixels.fill(0, 4, 8);
  ownership.fill(0, 4, 8); // Unowned pixel is transparent.
  const files = {
    "manifest.json": json(manifest),
    "patches-0.png": png(4, 2, pixels),
    "ownership-0.png": png(4, 2, ownership),
  };
  return {
    manifest,
    files,
    pixels,
    ownership,
    bytes: zipSync(files, { mtime: zipTime }),
  };
}

async function upgradeFixture() {
  const f = await fixture();
  let base = await createWardrobeProject(f.source, f.registrationBytes);
  const clothing = garment(f.registration, f.registrationBytes);
  base = await addWardrobeGarment(base, clothing.bytes);
  base = selectWardrobeGarment(base, "top", clothing.manifest.id);
  base = updateWardrobePreview(base, { action: "jump", facing: "left" });
  const head = appearanceFixture(
    base.registration,
    base.document.registrationSha256,
  );
  const bank = (id: string, omitGentle = false) => {
    const manifest = structuredClone(head.manifest);
    manifest.id = id;
    if (omitGentle)
      manifest.styles = manifest.styles.filter(
        (style) => style.id !== "gentle",
      );
    return zipSync(
      { ...head.files, "manifest.json": json(manifest) },
      { mtime: zipTime },
    );
  };
  const oldBytes = bank("fixture-appearance-v1");
  const newBytes = bank("fixture-appearance-v2");
  const revision: AppearanceCatalogRevision = {
    characterId: base.registration.characterId,
    sourceSha256: base.document.sourceSha256,
    registrationSha256: base.document.registrationSha256,
    bankId: "fixture-appearance-v2",
    bankSha256: sha(newBytes),
    previousBankSha256s: [sha(oldBytes)],
  };
  const old = selectWardrobeAppearance(
    await addWardrobeAppearanceBank(base, oldBytes),
    {
      hairId: "soft-crop",
      faceId: "gentle",
      hairColor: "espresso",
    },
  );
  return { base, old, oldBytes, newBytes, revision, bank };
}

describe("explicit source-bound appearance upgrade copies", () => {
  it("resolves additive library revisions by exact previous hashes and upgrades only a separate copy", async () => {
    const f = await upgradeFixture();
    const library = [
      {
        url: "/new-library.zip",
        sha256: f.revision.bankSha256,
        bankId: f.revision.bankId,
        styles: f.old.appearanceBank!.manifest.styles,
        previousBankSha256s: [f.old.appearanceBank!.sha256],
      },
    ];
    const base = {
      ...f.revision,
      bankId: "base-catalog",
      bankSha256: "c".repeat(64),
      previousBankSha256s: [],
    };
    const release = appearanceReleaseFor(
      base,
      "/base.zip",
      library,
      f.old.appearanceBank!.sha256,
    )!;
    expect(release.url).toBe("/new-library.zip");
    expect(
      getAppearanceUpgradeAvailability(f.old, release.revision).status,
    ).toBe("available");
    const copy = await prepareAppearanceUpgrade(
      f.old,
      f.newBytes,
      release.revision,
    );
    expect(copy.appearanceBank!.sha256).toBe(f.revision.bankSha256);
    expect(f.old.appearanceBank!.bytes).toEqual(f.oldBytes);
    expect(
      appearanceReleaseFor(base, "/base.zip", library, "e".repeat(64))!
        .revision,
    ).toEqual(base);
  });
  it("preserves the original project and all choices; saved copy embeds the exact new bank and reopens", async () => {
    const f = await upgradeFixture();
    const oldDocument = structuredClone(f.old.document);
    const oldZip = await exportWardrobeProject(f.old);
    expect(getAppearanceUpgradeAvailability(f.old, f.revision).status).toBe(
      "available",
    );
    const candidate = await prepareAppearanceUpgrade(
      f.old,
      f.newBytes,
      f.revision,
    );
    expect(candidate.document).toEqual({
      ...oldDocument,
      appearance: {
        ...f.old.document.appearance,
        bankSha256: f.revision.bankSha256,
      },
    });
    expect(candidate.appearanceBank!.bytes).toEqual(f.newBytes);
    expect(candidate.source).toEqual(f.old.source);
    expect(candidate.registrationBytes).toEqual(f.old.registrationBytes);
    expect(candidate.items.map((item) => item.bytes)).toEqual(
      f.old.items.map((item) => item.bytes),
    );
    expect(candidate.archive.manifest).toEqual(f.old.archive.manifest);
    expect(candidate.document).not.toBe(f.old.document);
    expect(f.old.document).toEqual(oldDocument);
    expect(f.old.appearanceBank!.bytes).toEqual(f.oldBytes);
    const savedCopy = await exportWardrobeProject(candidate);
    const reopened = await importWardrobeProject(savedCopy);
    expect(reopened.document).toEqual(candidate.document);
    expect(reopened.appearanceBank!.bytes).toEqual(f.newBytes);
    expect(await exportWardrobeProject(f.old)).toEqual(oldZip);
    expect(getAppearanceUpgradeAvailability(reopened, f.revision).status).toBe(
      "current",
    );
    await expect(
      prepareAppearanceUpgrade(reopened, f.newBytes, f.revision),
    ).rejects.toThrow(/already/);
  });
  it("lets a clothing-only V1 project explicitly create a V2 copy without applying hair or face", async () => {
    const f = await upgradeFixture();
    expect(getAppearanceUpgradeAvailability(f.base, f.revision).status).toBe(
      "available",
    );
    const copy = await prepareAppearanceUpgrade(f.base, f.newBytes, f.revision);
    expect(copy.document.version).toBe(2);
    expect(copy.document.appearance).toEqual({
      bankSha256: f.revision.bankSha256,
      hairId: null,
      faceId: null,
      hairColor: "chestnut",
    });
    expect(copy.document.selection).toEqual(f.base.document.selection);
    expect(copy.document.preview).toEqual(f.base.document.preview);
    expect(f.base.document.version).toBe(1);
    expect(f.base.appearanceBank).toBeUndefined();
  });
  it("does not infer an upgrade from an id: custom or newer bytes remain intact", async () => {
    const f = await upgradeFixture();
    for (const name of [
      "fixture-appearance-v1-custom",
      "fixture-appearance-v3",
    ]) {
      const custom = await addWardrobeAppearanceBank(f.base, f.bank(name));
      expect(getAppearanceUpgradeAvailability(custom, f.revision).status).toBe(
        "unavailable",
      );
      await expect(
        prepareAppearanceUpgrade(custom, f.newBytes, f.revision),
      ).rejects.toThrow(/custom or unrecognized/);
    }
  });
  it("recognizes exact library banks as current without accepting custom hashes or different sources", async () => {
    const f = await upgradeFixture();
    const bytes = f.bank("fixture-extra-style");
    const project = await addWardrobeAppearanceBank(f.base, bytes);
    const library = [
      {
        bankId: "fixture-extra-style",
        sha256: sha(bytes),
        url: "/fixture-extra-style.zip",
        styles: project.appearanceBank!.manifest.styles,
      },
    ];
    expect(
      getAppearanceUpgradeAvailability(project, f.revision, library).status,
    ).toBe("current");
    for (const changed of [
      { ...library[0], sha256: "c".repeat(64) },
      { ...library[0], bankId: "different-bank" },
    ]) {
      expect(
        getAppearanceUpgradeAvailability(project, f.revision, [changed]).status,
      ).toBe("unavailable");
    }
    expect(
      getAppearanceUpgradeAvailability(
        project,
        {
          ...f.revision,
          sourceSha256: "b".repeat(64),
        },
        library,
      ).status,
    ).toBe("unavailable");
    expect(project.appearanceBank!.bytes).toEqual(bytes);
  });
  it.each(["characterId", "sourceSha256", "registrationSha256"] as const)(
    "rejects different %s bindings before preparing",
    async (field) => {
      const f = await upgradeFixture();
      const revision = { ...f.revision, [field]: "b".repeat(64) };
      expect(getAppearanceUpgradeAvailability(f.old, revision).status).toBe(
        "unavailable",
      );
      await expect(
        prepareAppearanceUpgrade(f.old, f.newBytes, revision),
      ).rejects.toThrow(/different character or source/);
    },
  );
  it("rehashes source, registration and old bank bytes instead of trusting stale metadata", async () => {
    const f = await upgradeFixture();
    for (const field of [
      "source",
      "registrationBytes",
      "appearanceBank",
    ] as const) {
      const changed = structuredClone(f.old);
      const bytes =
        field === "appearanceBank"
          ? changed.appearanceBank!.bytes
          : changed[field];
      bytes[bytes.length - 1] ^= 1;
      await expect(
        prepareAppearanceUpgrade(changed, f.newBytes, f.revision),
      ).rejects.toThrow(/bytes changed/);
    }
  });
  it("rejects altered downloads, incorrect bank identity and missing selected styles without resetting the original", async () => {
    const f = await upgradeFixture();
    const wrong = new Uint8Array(f.newBytes);
    wrong[wrong.length - 1] ^= 1;
    await expect(
      prepareAppearanceUpgrade(f.old, wrong, f.revision),
    ).rejects.toThrow(/do not match the catalog release/);
    await expect(
      prepareAppearanceUpgrade(f.old, f.newBytes, {
        ...f.revision,
        bankId: "different",
      }),
    ).rejects.toThrow(/catalog identity/);
    const missing = f.bank("fixture-appearance-v2", true);
    await expect(
      prepareAppearanceUpgrade(f.old, missing, {
        ...f.revision,
        bankSha256: sha(missing),
      }),
    ).rejects.toThrow(/faceId/);
    expect(f.old.document.appearance!.faceId).toBe("gentle");
    expect(f.old.appearanceBank!.bytes).toEqual(f.oldBytes);
  });
  it("cancels before preparation without changing the project", async () => {
    const f = await upgradeFixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      prepareAppearanceUpgrade(f.old, f.newBytes, f.revision, {
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(f.old.appearanceBank!.bytes).toEqual(f.oldBytes);
    expect(f.old.document.appearance!.hairColor).toBe("espresso");
  });
  it("validates release descriptors and pins bundled releases to actual file hashes", () => {
    const catalog = JSON.parse(
      readFileSync("docs/kling-wardrobe/catalog.json", "utf8"),
    );
    for (const entry of catalog.characters) {
      const revision = validateAppearanceCatalogRevision(
        entry.appearanceRevision,
      );
      expect(revision.bankSha256).toBe(
        sha(readFileSync(`.${entry.appearanceBankUrl}`)),
      );
      expect(revision.registrationSha256).toBe(
        sha(readFileSync(`.${entry.registrationUrl}`)),
      );
      expect(revision.sourceSha256).toBe(
        sha(readFileSync(`.${entry.sourceUrl}`)),
      );
      expect(revision.characterId).toBe(entry.characterId);
      expect(() =>
        validateAppearanceCatalogRevision({
          ...revision,
          previousBankSha256s: [revision.bankSha256],
        }),
      ).toThrow(/older/);
      expect(() =>
        validateAppearanceCatalogRevision({
          ...revision,
          bankSha256: "not-a-hash",
        }),
      ).toThrow(/SHA-256/);
      expect(() =>
        validateAppearanceCatalogRevision({ ...revision, arbitrary: true }),
      ).toThrow(/unsupported field/);
    }
  });
});
