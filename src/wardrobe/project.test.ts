import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { encodeSourceRgbaPng } from "../core/baked-source";
import { createBakedCharacterPack } from "../core/pack";
import type {
  BakedCharacterRecipe,
  CharacterPackV2Manifest,
} from "../core/types";
import {
  WARDROBE_ANCHORS,
  validateWardrobeDocument,
  validateWardrobeGarmentManifest,
  validateWardrobeRegistration,
  type WardrobeGarmentManifest,
  type WardrobeRegistration,
  type WardrobeSlot,
} from "./contract";
import {
  addWardrobeGarment,
  createWardrobeProject,
  exportWardrobeProject,
  importWardrobeProject,
  readWardrobeGarment,
  selectWardrobeGarment,
  updateWardrobePreview,
  validateWardrobeProject,
} from "./project";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown) => strToU8(JSON.stringify(value));
const png = (width: number, height: number, pixels: Uint8Array) =>
  encodeSourceRgbaPng({ width, height, pixels, colorChunks: [] });
const zipTime = new Date("2020-01-01T00:00:00.000Z");

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

describe("source-bound wardrobe registration and assets", () => {
  it("retains video frame identity, source attachment, and honest inferred landmarks", async () => {
    const f = await fixture(),
      p = await createWardrobeProject(f.source, f.registrationBytes);
    expect(p.source).toEqual(f.source);
    expect(p.registration.frames.map((f) => f.sourceFrame)).toEqual([336, 348]);
    expect(p.registration.frames[0].points.farKnee).toMatchObject({
      visibility: "occluded",
      confidence: 0.5,
    });
    expect(p.registration.anchor).toEqual({ x: 4, y: 7 });
    const changed = structuredClone(f.registration);
    changed.frames[0].sourceFrame = 7;
    expect(() =>
      validateWardrobeRegistration(changed, p.archive, sha(f.source)),
    ).toThrow(/sourceFrame/);
    changed.frames[0].sourceFrame = 336;
    changed.anchor.y = 6;
    expect(() =>
      validateWardrobeRegistration(changed, p.archive, sha(f.source)),
    ).toThrow(/anchor/);
  });
  it("requires every source frame, all anchors and a meaningful head-protection polygon", async () => {
    const f = await fixture(),
      p = await createWardrobeProject(f.source, f.registrationBytes);
    const validate = (r: unknown) =>
      validateWardrobeRegistration(r, p.archive, sha(f.source));
    expect(() =>
      validate({
        ...f.registration,
        frames: [f.registration.frames[0], f.registration.frames[0]],
      }),
    ).toThrow(/exactly once/);
    const missing = structuredClone(f.registration) as unknown as {
      frames: Array<{ points: Record<string, unknown> }>;
    };
    delete missing.frames[0].points.neck;
    expect(() => validate(missing)).toThrow(/neck/);
    const noHead = structuredClone(f.registration);
    noHead.frames[0].protected[0].label = "nearHand";
    expect(() => validate(noHead)).toThrow(/protect its head/);
    const degenerate = structuredClone(f.registration);
    degenerate.frames[0].protected[0].polygon = [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    expect(() => validate(degenerate)).toThrow(/nonzero area/);
  });
  it("accepts cropped replacement art and transparent removal without permitting missing poses or cross-source clothes", async () => {
    const f = await fixture(),
      g = garment(f.registration, f.registrationBytes);
    const item = await readWardrobeGarment(
      g.bytes,
      f.registration,
      sha(f.registrationBytes),
    );
    expect(item.manifest.frames[1].frameId).toBe(19);
    expect(item.pages[0].patch).toEqual(g.files["patches-0.png"]);
    const validate = (m: unknown) =>
      validateWardrobeGarmentManifest(
        m,
        f.registration,
        sha(f.registrationBytes),
      );
    expect(() =>
      validate({ ...g.manifest, frames: [g.manifest.frames[0]] }),
    ).toThrow(/frames/);
    expect(() =>
      validate({ ...g.manifest, sourceSha256: "f".repeat(64) }),
    ).toThrow(/source checksum/);
    expect(() =>
      validate({ ...g.manifest, registrationSha256: "f".repeat(64) }),
    ).toThrow(/registration checksum/);
    const broken = structuredClone(g.manifest);
    broken.frames[0].offset.x = 7;
    expect(() => validate(broken)).toThrow(/native source frame/);
    broken.frames[0].offset.x = 0.5;
    expect(() => validate(broken)).toThrow(/integer/);
    const huge = structuredClone(g.manifest);
    huge.pages[0].width = huge.pages[0].height = 8192;
    expect(() => validate(huge)).toThrow(/pixel budget/);
  });
  it("decodes assets and rejects partial ownership, unowned art and damaged PNG data", async () => {
    const f = await fixture(),
      g = garment(f.registration, f.registrationBytes);
    const read = (files: Record<string, Uint8Array>) =>
      readWardrobeGarment(
        zipSync(files),
        f.registration,
        sha(f.registrationBytes),
      );
    const partial = new Uint8Array(g.ownership);
    partial[3] = 128;
    await expect(
      read({ ...g.files, "ownership-0.png": png(4, 2, partial) }),
    ).rejects.toThrow(/binary/);
    const escaped = new Uint8Array(g.pixels);
    escaped[7] = 255;
    await expect(
      read({ ...g.files, "patches-0.png": png(4, 2, escaped) }),
    ).rejects.toThrow(/outside its declared ownership/);
    const broken = new Uint8Array(g.files["patches-0.png"]);
    broken[broken.length - 1] ^= 1;
    await expect(read({ ...g.files, "patches-0.png": broken })).rejects.toThrow(
      /checksum/,
    );
    await expect(
      read({ ...g.files, "unreviewed.png": g.files["patches-0.png"] }),
    ).rejects.toThrow(/Unexpected ZIP path/);
  });
});

describe("self-contained wardrobe projects", () => {
  it("saves deterministically, embeds the exact source, and restores selection and one-shot preview offline", async () => {
    const f = await fixture(),
      shirt = garment(f.registration, f.registrationBytes),
      shoes = garment(f.registration, f.registrationBytes, "shoes");
    let project = await createWardrobeProject(f.source, f.registrationBytes, [
      shirt.bytes,
      shoes.bytes,
    ]);
    project = selectWardrobeGarment(project, "top", shirt.manifest.id);
    project = updateWardrobePreview(project, {
      action: "jump",
      facing: "left",
    });
    const a = await exportWardrobeProject(project),
      b = await exportWardrobeProject(project);
    expect(a).toEqual(b);
    const previousZone = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Auckland";
      expect(await exportWardrobeProject(project)).toEqual(a);
      process.env.TZ = "America/Los_Angeles";
      expect(await exportWardrobeProject(project)).toEqual(a);
    } finally {
      if (previousZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousZone;
    }
    const files = unzipSync(a);
    expect(files["source.character.zip"]).toEqual(f.source);
    expect(files["registration.json"]).toEqual(f.registrationBytes);
    const restored = await importWardrobeProject(a);
    expect(restored.document).toEqual(project.document);
    expect(restored.archive.manifest.animations.jump!.loop).toBe(false);
    expect(restored.archive.manifest.animations.walk.frames).toEqual([
      19, 7, 19,
    ]);
    expect(await exportWardrobeProject(restored)).toEqual(a);
  });
  it("resolves dress versus separates explicitly and rejects incompatible slots", async () => {
    const f = await fixture(),
      top = garment(f.registration, f.registrationBytes),
      dress = garment(f.registration, f.registrationBytes, "fullBody"),
      bottom = garment(f.registration, f.registrationBytes, "bottom");
    const original = await createWardrobeProject(
      f.source,
      f.registrationBytes,
      [top.bytes, dress.bytes, bottom.bytes],
    );
    let p = selectWardrobeGarment(original, "top", top.manifest.id);
    p = selectWardrobeGarment(p, "bottom", bottom.manifest.id);
    p = selectWardrobeGarment(p, "fullBody", dress.manifest.id);
    expect(p.document.selection).toEqual({
      top: null,
      bottom: null,
      fullBody: dress.manifest.id,
      shoes: null,
    });
    expect(original.document.selection.top).toBeNull();
    expect(
      selectWardrobeGarment(p, "top", top.manifest.id).document.selection
        .fullBody,
    ).toBeNull();
    expect(() => selectWardrobeGarment(p, "shoes", top.manifest.id)).toThrow(
      /compatible/,
    );
    expect(() =>
      validateWardrobeDocument(
        {
          ...p.document,
          selection: { ...p.document.selection, top: top.manifest.id },
        },
        p,
      ),
    ).toThrow(/full-body/);
    expect(() =>
      updateWardrobePreview(p, { action: "fly" as "run", facing: "right" }),
    ).toThrow(/unavailable/);
  });
  it("imports transactionally and rejects source, registration or item hash mismatch", async () => {
    const f = await fixture(),
      g = garment(f.registration, f.registrationBytes),
      original = await createWardrobeProject(f.source, f.registrationBytes, [
        g.bytes,
      ]);
    const zip = await exportWardrobeProject(original),
      files = unzipSync(zip);
    const doc = JSON.parse(new TextDecoder().decode(files["document.json"]));
    for (const key of ["sourceSha256", "registrationSha256"] as const) {
      await expect(
        importWardrobeProject(
          zipSync({
            ...files,
            "document.json": json({ ...doc, [key]: "f".repeat(64) }),
          }),
        ),
      ).rejects.toThrow(/checksum/);
    }
    const wrongItem = structuredClone(doc);
    wrongItem.items[0].sha256 = "f".repeat(64);
    await expect(
      importWardrobeProject(
        zipSync({ ...files, "document.json": json(wrongItem) }),
      ),
    ).rejects.toThrow(/garment checksum/);
    await expect(
      importWardrobeProject(
        zipSync({ ...files, "https://other.example/garment.zip": g.bytes }),
      ),
    ).rejects.toThrow(/Unexpected ZIP path/);
    expect(original.document.selection.top).toBeNull();
    expect(original.source).toEqual(f.source);
  });
  it("re-reads original bytes at persistence boundaries instead of trusting edited caches", async () => {
    const f = await fixture(),
      g = garment(f.registration, f.registrationBytes),
      p = await createWardrobeProject(f.source, f.registrationBytes, [g.bytes]);
    p.archive.manifest.anchor.x = 0;
    p.registration.frames[0].points.neck.y = 7;
    p.items[0].manifest.frames[0].offset.y = 7;
    const verified = await validateWardrobeProject(p);
    expect(verified.archive.manifest.anchor.x).toBe(4);
    expect(verified.registration.frames[0].points.neck.y).toBe(4);
    expect(verified.items[0].manifest.frames[0].offset.y).toBe(3);
    p.items[0].bytes[p.items[0].bytes.length - 1] ^= 1;
    await expect(exportWardrobeProject(p)).rejects.toThrow();
  });
  it("never exposes the private source cache to mutable project bytes or parsed PNG arrays", async () => {
    const f = await fixture();
    const first = await createWardrobeProject(f.source, f.registrationBytes);
    const expectedPng = new Uint8Array(first.archive.png);
    first.archive.png.fill(0);
    first.archive.manifest.frames[0].x = 7;
    const second = await createWardrobeProject(f.source, f.registrationBytes);
    expect(second.archive.png).toEqual(expectedPng);
    expect(second.archive.manifest.frames[0].x).toBe(0);
    first.source[first.source.length - 1] ^= 1;
    await expect(validateWardrobeProject(first)).rejects.toThrow();
    expect(
      (await createWardrobeProject(f.source, f.registrationBytes)).archive.png,
    ).toEqual(expectedPng);
  });
  it("rejects duplicate garment identity without replacing the current catalog", async () => {
    const f = await fixture(),
      g = garment(f.registration, f.registrationBytes),
      p = await createWardrobeProject(f.source, f.registrationBytes, [g.bytes]);
    await expect(addWardrobeGarment(p, g.bytes)).rejects.toThrow(/unique/);
    expect(p.items).toHaveLength(1);
  });
});
