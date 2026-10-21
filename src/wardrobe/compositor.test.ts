import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  decodeSourceRgbaPng,
  encodeSourceRgbaPng,
  type RgbaPng,
} from "../core/baked-source";
import {
  createBakedCharacterPack,
  readPortableCharacterPackArchive,
} from "../core/pack";
import { crc32 } from "../core/bounded-archive";
import type {
  BakedCharacterPackManifest,
  BakedCharacterRecipe,
} from "../core/types";
import {
  WARDROBE_ANCHORS,
  type WardrobeGarmentManifest,
  type WardrobeProject,
  type WardrobeRegistration,
  type WardrobeSlot,
} from "./contract";
import {
  addWardrobeGarment,
  createWardrobeProject,
  selectWardrobeGarment,
} from "./project";
import {
  createWardrobeCompositor,
  exportWardrobeCharacterPack,
  exportWardrobeFramePng,
  validateWardrobeAppearance,
} from "./compositor";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const rgba = (width: number, height: number, color: number[]): RgbaPng => ({
  width,
  height,
  colorChunks: [],
  pixels: new Uint8Array(
    Array.from({ length: width * height }, () => color).flat(),
  ),
});
const pixel = (image: RgbaPng, x: number, y: number) =>
  Array.from(
    image.pixels.subarray(
      (y * image.width + x) * 4,
      (y * image.width + x + 1) * 4,
    ),
  );

async function fixture(multipage = true): Promise<WardrobeProject> {
  const sheet = {
    file: "spritesheet.png" as const,
    width: 6,
    height: 6,
    frameWidth: 6,
    frameHeight: 6,
    columns: 1,
    rows: 1,
  };
  const common = {
    format: "gathria-character-pack" as const,
    name: "Wardrobe source fixture",
    generator: "source-test",
    spritesheet: sheet,
    animations: {
      idle: { frames: [7], fps: 2, loop: true },
      walk: { frames: [7, 7, 29], fps: 12, loop: true },
      run: { frames: [29, 7], fps: 24, loop: true },
      jump: { frames: [7, 29, 29, 7], fps: 24, loop: false },
      celebrate: { frames: [29], fps: 4, loop: true },
    },
    anchor: {
      x: 3,
      y: 6,
      units: "pixels" as const,
      origin: "top-left" as const,
    },
    facing: {
      native: "right" as const,
      right: "none" as const,
      left: "mirror-x" as const,
    },
    scale: {
      pixelArt: false as const,
      recommended: 1,
      integerOnly: false as const,
    },
    capabilities: {
      renderMode: "baked" as const,
      editableAppearance: false as const,
    },
    configuration: "character.json" as const,
  };
  const manifest: BakedCharacterPackManifest = multipage
    ? {
        ...common,
        schemaVersion: 3,
        additionalSheets: [{ ...sheet, file: "spritesheet-1.png" }],
        frames: [7, 29].map((id, page) => ({
          id,
          page,
          x: 0,
          y: 0,
          width: 6,
          height: 6,
        })),
      }
    : {
        ...common,
        schemaVersion: 2,
        spritesheet: { ...sheet, width: 12, columns: 2 },
        frames: [7, 29].map((id, i) => ({
          id,
          x: i * 6,
          y: 0,
          width: 6,
          height: 6,
        })),
      };
  const config: BakedCharacterRecipe = {
    format: "gathria-baked-character",
    schemaVersion: 1,
    name: manifest.name,
    characterId: "wardrobe-source",
    source: {
      kind: "video-extraction",
      name: "source.mp4",
      sha256: "1".repeat(64),
    },
    provenance: "Original video source body, no authored garment yet.",
    derivation: {
      method: "Original frames 100 and 101.",
      frames: manifest.frames.map((frame, i) => ({
        frameId: frame.id,
        sourceFrame: 100 + i,
        timeSeconds: (100 + i) / 24,
      })),
    },
    sourceMetadata: {
      motionFlow: { preservedFixture: true },
      custom: ["kept", 12],
    },
  };
  const pages = multipage
    ? [rgba(6, 6, [110, 90, 70, 255]), rgba(6, 6, [80, 100, 120, 255])]
    : [rgba(12, 6, [110, 90, 70, 255])];
  // These uncovered alpha and RGB bytes must not pass through Canvas rounding.
  pages[0].pixels.set([217, 37, 9, 63], (4 * pages[0].width + 4) * 4);
  pages[0].pixels.set([91, 76, 53, 0], (4 * pages[0].width + 5) * 4);
  // Anti-aliased head edges are protected as strictly as opaque face pixels.
  for (const frame of manifest.frames) {
    const page = pages[frame.page ?? 0];
    page.pixels.set(
      [239, 173, 117, 31],
      (frame.y * page.width + frame.x + 1) * 4,
    );
  }
  const pngs = pages.map(
    (page) => new Blob([encodeSourceRgbaPng(page)], { type: "image/png" }),
  );
  const pack = new Uint8Array(
    await (
      await createBakedCharacterPack(config, manifest, pngs[0], pngs.slice(1))
    ).arrayBuffer(),
  );
  const registration: WardrobeRegistration = {
    format: "gathria-wardrobe-registration",
    version: 1,
    sourceSha256: sha(pack),
    characterId: config.characterId,
    frameWidth: 6,
    frameHeight: 6,
    anchor: { x: 3, y: 6 },
    frames: manifest.frames.map((frame, i) => ({
      frameId: frame.id,
      sourceFrame: 100 + i,
      points: Object.fromEntries(
        WARDROBE_ANCHORS.map((name) => [
          name,
          {
            x: 3,
            y: 3,
            visibility: "visible",
            confidence: 1,
            method: "Fixture anchor",
          },
        ]),
      ) as WardrobeRegistration["frames"][number]["points"],
      protected: [
        {
          label: "head",
          polygon: [
            { x: 0, y: 0 },
            { x: 6, y: 0 },
            { x: 6, y: 1 },
            { x: 0, y: 1 },
          ],
        },
        {
          label: "nearHand",
          polygon: [
            { x: 0, y: 2 },
            { x: 1, y: 2 },
            { x: 1, y: 4 },
            { x: 0, y: 4 },
          ],
        },
      ],
    })),
  };
  return createWardrobeProject(pack, strToU8(JSON.stringify(registration)));
}

function garment(
  project: WardrobeProject,
  id = "casual-top",
  slot: WardrobeSlot = "top",
  color = [12, 67, 89, 180],
  protectedFrame?: number,
): Uint8Array {
  const patch = rgba(3, 4, [0, 0, 0, 0]);
  const ownership = rgba(3, 4, [0, 0, 0, 0]);
  for (const start of [0, 6]) {
    for (const [index, value] of [
      [start, color],
      [start + 1, [0, 0, 0, 0]],
      [start + 3, [91, 37, 151, 255]],
    ] as const) {
      patch.pixels.set(value, index * 4);
      ownership.pixels.set([255, 255, 255, 255], index * 4);
    }
  }
  const manifest: WardrobeGarmentManifest = {
    format: "gathria-sprite-garment",
    version: 1,
    id,
    name: `Test ${id}`,
    slot,
    sourceSha256: project.document.sourceSha256,
    registrationSha256: project.document.registrationSha256,
    characterId: project.registration.characterId,
    frameWidth: 6,
    frameHeight: 6,
    pages: [
      {
        file: "patches-0.png",
        maskFile: "ownership-0.png",
        width: 3,
        height: 4,
      },
    ],
    frames: project.registration.frames.map((frame, i) => ({
      frameId: frame.frameId,
      page: 0,
      rect: { x: 0, y: i * 2, width: 3, height: 2 },
      offset: { x: 1, y: frame.frameId === protectedFrame ? 0 : 2 },
    })),
    provenance: "Authored test garment, not original video clothing.",
  };
  return zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "patches-0.png": encodeSourceRgbaPng(patch),
    "ownership-0.png": encodeSourceRgbaPng(ownership),
  });
}

describe("registered wardrobe composition", () => {
  it("rejects a differently profiled clothing PNG rather than silently reinterpreting its colors", async () => {
    const original = await fixture();
    const files = unzipSync(garment(original, "profiled-top"));
    const patch = decodeSourceRgbaPng(files["patches-0.png"]);
    const gamma = new Uint8Array(16),
      view = new DataView(gamma.buffer);
    view.setUint32(0, 4);
    gamma.set(strToU8("gAMA"), 4);
    view.setUint32(8, 45455);
    view.setUint32(12, crc32(gamma.subarray(4, 12)));
    patch.colorChunks = [gamma];
    files["patches-0.png"] = encodeSourceRgbaPng(patch);
    const project = selectWardrobeGarment(
      await addWardrobeGarment(original, zipSync(files)),
      "top",
      "profiled-top",
    );
    const renderer = await createWardrobeCompositor(project);
    expect(() => renderer.renderFrame(7)).toThrow(
      /different PNG color profile/,
    );
    renderer.dispose();
  });

  it("keeps distinct garment pages aligned through repeated source-page and clothing-page crossings", async () => {
    const original = await fixture();
    const files = unzipSync(garment(original, "multipage-top"));
    const manifest = JSON.parse(
      new TextDecoder().decode(files["manifest.json"]),
    ) as WardrobeGarmentManifest;
    const originalPatch = decodeSourceRgbaPng(files["patches-0.png"]);
    const originalMask = decodeSourceRgbaPng(files["ownership-0.png"]);
    manifest.pages = [0, 1].map((page) => ({
      file: `patches-${page}.png`,
      maskFile: `ownership-${page}.png`,
      width: 3,
      height: 2,
    }));
    manifest.frames = manifest.frames.map((frame, page) => ({
      ...frame,
      page,
      rect: { x: 0, y: 0, width: 3, height: 2 },
    }));
    for (const page of [0, 1]) {
      const patch = {
        width: 3,
        height: 2,
        pixels: originalPatch.pixels.slice(page * 24, (page + 1) * 24),
        colorChunks: [],
      };
      if (page === 1) patch.pixels.set([77, 88, 99, 155], 0);
      files[`patches-${page}.png`] = encodeSourceRgbaPng(patch);
      files[`ownership-${page}.png`] = encodeSourceRgbaPng({
        width: 3,
        height: 2,
        pixels: originalMask.pixels.slice(page * 24, (page + 1) * 24),
        colorChunks: [],
      });
    }
    files["manifest.json"] = strToU8(JSON.stringify(manifest));
    const project = selectWardrobeGarment(
      await addWardrobeGarment(original, zipSync(files)),
      "top",
      "multipage-top",
    );
    const renderer = await createWardrobeCompositor(project);
    for (let loop = 0; loop < 3; loop++) {
      expect(pixel(renderer.renderFrame(7), 1, 2)).toEqual([12, 67, 89, 180]);
      expect(pixel(renderer.renderFrame(29), 1, 2)).toEqual([77, 88, 99, 155]);
      expect(pixel(renderer.renderFrame(29), 2, 2)).toEqual([0, 0, 0, 0]);
    }
    renderer.dispose();
    const reopened = await createWardrobeCompositor(project);
    expect(pixel(reopened.renderFrame(29), 1, 2)).toEqual([77, 88, 99, 155]);
    reopened.dispose();
  });

  it("replaces only owned RGBA pixels, including transparent erasure, without altering source/body bytes", async () => {
    const original = await fixture();
    const project = selectWardrobeGarment(
      await addWardrobeGarment(original, garment(original)),
      "top",
      "casual-top",
    );
    const compositor = await createWardrobeCompositor(project);
    const source = compositor.renderSourceFrame(7),
      dressed = compositor.renderFrame(7);
    expect(pixel(dressed, 1, 2)).toEqual([12, 67, 89, 180]);
    expect(pixel(dressed, 2, 2)).toEqual([0, 0, 0, 0]);
    expect(pixel(dressed, 1, 3)).toEqual([91, 37, 151, 255]);
    const changed = new Set([2 * 6 + 1, 2 * 6 + 2, 3 * 6 + 1]);
    for (let i = 0; i < 36; i++)
      if (!changed.has(i))
        expect(Array.from(dressed.pixels.subarray(i * 4, i * 4 + 4))).toEqual(
          Array.from(source.pixels.subarray(i * 4, i * 4 + 4)),
        );
    expect(pixel(dressed, 4, 4)).toEqual([217, 37, 9, 63]);
    expect(pixel(dressed, 5, 4)).toEqual([91, 76, 53, 0]);
    dressed.pixels.fill(0);
    expect(compositor.renderSourceFrame(7).pixels).toEqual(source.pixels);
    expect(pixel(compositor.renderFrame(7), 1, 2)).toEqual([12, 67, 89, 180]);
    expect(project.source).toEqual(original.source);
    compositor.dispose();
    expect(() => compositor.renderFrame(7)).toThrow(/disposed/);
  });

  it("composes shoes under cuffs, top over bottom, and full-body outfits over shoes", async () => {
    let project = await fixture();
    for (const [id, slot, color] of [
      ["shoe", "shoes", [10, 0, 0, 255]],
      ["bottom", "bottom", [20, 0, 0, 255]],
      ["top", "top", [30, 0, 0, 255]],
      ["dress", "fullBody", [40, 0, 0, 255]],
    ] as const)
      project = await addWardrobeGarment(
        project,
        garment(project, id, slot, [...color]),
      );
    project = selectWardrobeGarment(project, "shoes", "shoe");
    project = selectWardrobeGarment(project, "bottom", "bottom");
    let compositor = await createWardrobeCompositor(project);
    expect(pixel(compositor.renderFrame(7), 1, 2)[0]).toBe(20);
    compositor.dispose();
    project = selectWardrobeGarment(project, "top", "top");
    compositor = await createWardrobeCompositor(project);
    expect(pixel(compositor.renderFrame(7), 1, 2)[0]).toBe(30);
    compositor.dispose();
    project = selectWardrobeGarment(project, "fullBody", "dress");
    expect(project.document.selection).toEqual({
      shoes: "shoe",
      top: null,
      bottom: null,
      fullBody: "dress",
    });
    compositor = await createWardrobeCompositor(project);
    expect(pixel(compositor.renderFrame(7), 1, 2)[0]).toBe(40);
    compositor.dispose();
  });

  it("rejects protection violations in an unpreviewed frame during complete export", async () => {
    const original = await fixture();
    const project = selectWardrobeGarment(
      await addWardrobeGarment(
        original,
        garment(original, "bad-top", "top", [255, 0, 0, 255], 29),
      ),
      "top",
      "bad-top",
    );
    const compositor = await createWardrobeCompositor(project);
    expect(() => compositor.renderFrame(7)).not.toThrow();
    expect(() => compositor.renderFrame(29)).toThrow(
      /protected head.*frame 29/,
    );
    expect(() => compositor.renderFrame(999)).toThrow(/no registered/);
    await expect(validateWardrobeAppearance(compositor)).rejects.toThrow(
      /protected head.*frame 29/,
    );
    await expect(validateWardrobeAppearance(compositor)).rejects.toThrow(
      /protected head.*frame 29/,
    );
    compositor.dispose();
    await expect(exportWardrobeCharacterPack(project)).rejects.toThrow(
      /protected head.*frame 29/,
    );
  });

  it("validates every pose before acceptance and caches success only by immutable selected content", async () => {
    const original = await fixture();
    const project = selectWardrobeGarment(
      await addWardrobeGarment(original, garment(original, "acceptance-top")),
      "top",
      "acceptance-top",
    );
    const compositor = await createWardrobeCompositor(project);
    const progress: number[] = [];
    expect(
      await validateWardrobeAppearance(compositor, {
        onProgress: (done) => progress.push(done),
      }),
    ).toEqual({ frames: 2, cacheHit: false });
    expect(progress).toEqual([0, 1, 2]);
    compositor.dispose();
    const again = await createWardrobeCompositor(project);
    expect(await validateWardrobeAppearance(again)).toEqual({
      frames: 2,
      cacheHit: true,
    });
    again.dispose();
    const changed = selectWardrobeGarment(
      await addWardrobeGarment(
        original,
        garment(original, "acceptance-top", "top", [88, 77, 66, 255]),
      ),
      "top",
      "acceptance-top",
    );
    const fresh = await createWardrobeCompositor(changed);
    const controller = new AbortController();
    await expect(
      validateWardrobeAppearance(fresh, {
        signal: controller.signal,
        onProgress: (done) => {
          if (done === 1) controller.abort();
        },
      }),
    ).rejects.toThrow(/cancelled/);
    expect(await validateWardrobeAppearance(fresh)).toEqual({
      frames: 2,
      cacheHit: false,
    });
    fresh.dispose();
  });

  it("writes identical wardrobe CharacterPack bytes in different host time zones", async () => {
    const original = await fixture();
    const project = selectWardrobeGarment(
      await addWardrobeGarment(original, garment(original)),
      "top",
      "casual-top",
    );
    const timezone = process.env.TZ;
    try {
      const hashes: string[] = [];
      for (const tz of ["UTC", "Pacific/Auckland", "America/Los_Angeles"]) {
        process.env.TZ = tz;
        hashes.push(sha(await exportWardrobeCharacterPack(project)));
      }
      expect(new Set(hashes).size).toBe(1);
    } finally {
      if (timezone === undefined) delete process.env.TZ;
      else process.env.TZ = timezone;
    }
  });

  it.each([false, true])(
    "exports a deterministic standalone V2/V3 pack (multipage=%s), preserving motion and native pixels",
    async (multipage) => {
      const original = await fixture(multipage);
      const project = selectWardrobeGarment(
        await addWardrobeGarment(original, garment(original)),
        "top",
        "casual-top",
      );
      const progress: number[] = [];
      const bytes = await exportWardrobeCharacterPack(project, {
        onProgress: (value) => progress.push(value.completedPages),
      });
      expect(sha(await exportWardrobeCharacterPack(project))).toBe(sha(bytes));
      const pack = readPortableCharacterPackArchive(bytes);
      expect(pack.manifest.schemaVersion).toBe(multipage ? 3 : 2);
      expect(pack.manifest.animations).toEqual(
        original.archive.manifest.animations,
      );
      expect(pack.manifest.anchor).toEqual(original.archive.manifest.anchor);
      expect(pack.manifest.frames).toEqual(original.archive.manifest.frames);
      expect(pack.manifest.facing).toEqual({
        native: "right",
        right: "none",
        left: "mirror-x",
      });
      expect(pack.manifest.capabilities.editableAppearance).toBe(false);
      expect(pack.config.derivation.frames).toEqual(
        original.archive.config.derivation.frames,
      );
      expect(pack.config.sourceMetadata?.motionFlow).toEqual(
        original.archive.config.sourceMetadata?.motionFlow,
      );
      expect(pack.config.sourceMetadata?.wardrobe).toMatchObject({
        sourcePackSha256: project.document.sourceSha256,
        registrationSha256: project.document.registrationSha256,
        selection: project.document.selection,
      });
      const decoded = [pack.png, ...(pack.additionalPngs ?? [])].map((png) =>
        decodeSourceRgbaPng(png),
      );
      const compositor = await createWardrobeCompositor(project);
      for (const frame of pack.manifest.frames) {
        const expected = compositor.renderFrame(frame.id),
          page = decoded[frame.page ?? 0];
        for (let y = 0; y < frame.height; y++)
          expect(
            page.pixels.subarray(
              ((frame.y + y) * page.width + frame.x) * 4,
              ((frame.y + y) * page.width + frame.x + frame.width) * 4,
            ),
          ).toEqual(
            expected.pixels.subarray(
              y * frame.width * 4,
              (y + 1) * frame.width * 4,
            ),
          );
      }
      const oneFrame = decodeSourceRgbaPng(
        await exportWardrobeFramePng(project, 29),
      );
      expect(oneFrame.pixels).toEqual(compositor.renderFrame(29).pixels);
      compositor.dispose();
      const docs = unzipSync(bytes);
      const provenance = new TextDecoder().decode(docs["PROVENANCE.txt"]);
      expect(provenance).toContain("deterministic garment composites");
      expect(provenance).toContain("Authored test garment");
      expect(provenance).not.toContain("All PNG bytes are retained unchanged");
      expect(progress).toEqual(multipage ? [0, 1, 2] : [0, 1]);
    },
  );

  it("returns exact original pack after clearing wardrobe and rejects tampered parsed/source bindings", async () => {
    const original = await fixture();
    const loaded = await addWardrobeGarment(original, garment(original));
    const selected = selectWardrobeGarment(loaded, "top", "casual-top");
    const reset = selectWardrobeGarment(selected, "top", null);
    expect(await exportWardrobeCharacterPack(reset)).toEqual(original.source);
    const forged = {
      ...selected,
      document: { ...selected.document, sourceSha256: "0".repeat(64) },
    };
    await expect(createWardrobeCompositor(forged)).rejects.toThrow(
      /source checksum/,
    );
    await expect(exportWardrobeCharacterPack(forged)).rejects.toThrow(
      /source checksum/,
    );
    const changedCache = structuredClone(selected);
    changedCache.archive.manifest.animations.run!.fps = 60;
    changedCache.items[0].manifest.frames[0].offset.y = 0;
    const restored = await createWardrobeCompositor(changedCache);
    expect(restored.manifest.animations.run!.fps).toBe(24);
    expect(() => restored.renderFrame(7)).not.toThrow();
    restored.dispose();
  });
});
