import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { decodeSourceRgbaPng, encodeSourceRgbaPng } from "../core/baked-source";
import { createBakedCharacterPack } from "../core/pack";
import { crc32 } from "../core/bounded-archive";
import { createWardrobeCompositor } from "./compositor";
import type {
  BakedCharacterRecipe,
  CharacterPackV2Manifest,
} from "../core/types";
import {
  WARDROBE_ANCHORS,
  type WardrobeGarmentManifest,
  type WardrobeRegistration,
} from "./contract";
import {
  createWardrobeProject,
  readWardrobeGarment,
  selectWardrobeGarment,
} from "./project";
import {
  createGarmentAuthoringSession,
  openGarmentAuthoringDraft,
  AUTHORING_MAX_REFERENCE_BYTES,
  type GarmentAuthoringConfig,
} from "./garment-authoring";

const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const json = (value: unknown) => strToU8(JSON.stringify(value));
const design: GarmentAuthoringConfig = {
  id: "amber-shirt",
  name: "Amber shirt",
  material: {
    sourceRgb: [80, 120, 160],
    targetRgb: [160, 100, 60],
    tolerance: 0.2,
  },
};
const palettePixels = new Uint8Array([
  80, 120, 160, 255, 80, 120, 160, 128, 0, 0, 0, 0, 254, 241, 200, 0, 10, 15,
  20, 255, 220, 220, 220, 255,
]);
const ownership = new Uint8Array([
  0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0,
  255,
]);
const colorChunk = new Uint8Array(13);
new DataView(colorChunk.buffer).setUint32(0, 1);
colorChunk.set(strToU8("sRGB"), 4);
new DataView(colorChunk.buffer).setUint32(9, crc32(colorChunk.subarray(4, 9)));
const png = (pixels: Uint8Array, width = 2, height = 3) =>
  encodeSourceRgbaPng({ width, height, pixels, colorChunks: [colorChunk] });

async function fixture(version: 1 | 2 = 1) {
  const ids = Array.from({ length: 10 }, (_, i) => i);
  const manifest: CharacterPackV2Manifest = {
    schemaVersion: 2,
    format: "gathria-character-pack",
    name: "Authoring fixture",
    generator: "fixture",
    spritesheet: {
      file: "spritesheet.png",
      width: 80,
      height: 8,
      frameWidth: 8,
      frameHeight: 8,
      columns: 10,
      rows: 1,
    },
    frames: ids.map((id) => ({ id, x: id * 8, y: 0, width: 8, height: 8 })),
    animations: {
      idle: { frames: [0, 0, 1], fps: 12, loop: true },
      walk: { frames: [2, 2, 3], fps: 24, loop: true },
      run: { frames: [4, 5], fps: 24, loop: true },
      jump: { frames: [6, 7], fps: 24, loop: false },
      celebrate: { frames: [8, 9], fps: 12, loop: true },
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
    characterId: "authoring-fixture",
    source: {
      kind: "video-extraction",
      name: "fixture.mp4",
      sha256: "a".repeat(64),
    },
    provenance: "Synthetic preservation fixture.",
    derivation: {
      method: "Native retained.",
      frames: ids.map((frameId) => ({
        frameId,
        sourceFrame: frameId + 100,
        timeSeconds: (frameId + 100) / 24,
      })),
    },
  };
  const sourcePixels = new Uint8Array(80 * 8 * 4);
  for (let i = 0; i < sourcePixels.length; i += 4)
    sourcePixels.set([200, 160, 120, 255], i);
  const source = new Uint8Array(
    await (
      await createBakedCharacterPack(
        config,
        manifest,
        new Blob([png(sourcePixels, 80, 8)]),
      )
    ).arrayBuffer(),
  );
  const registration: WardrobeRegistration = {
    format: "gathria-wardrobe-registration",
    version: 1,
    sourceSha256: hash(source),
    characterId: config.characterId,
    frameWidth: 8,
    frameHeight: 8,
    anchor: { x: 4, y: 7 },
    frames: ids.map((frameId) => ({
      frameId,
      sourceFrame: frameId + 100,
      points: Object.fromEntries(
        WARDROBE_ANCHORS.map((key) => [
          key,
          {
            x: key.startsWith("far") ? 5 : 3,
            y:
              key === "neck"
                ? 2
                : key.includes("Shoulder")
                  ? 3
                  : key.includes("Wrist")
                    ? 4 + frameId / 10
                    : key.includes("Ankle")
                      ? 7
                      : 6,
            visibility: "visible",
            confidence: 0.9,
          },
        ]),
      ) as WardrobeRegistration["frames"][number]["points"],
      protected: [
        {
          label: "head",
          polygon: [
            { x: 0, y: 0 },
            { x: 8, y: 0 },
            { x: 8, y: 2 },
            { x: 0, y: 2 },
          ],
        },
        {
          label: "nearHand",
          polygon: [
            { x: 6, y: 3 },
            { x: 8, y: 3 },
            { x: 8, y: 6 },
            { x: 6, y: 6 },
          ],
        },
      ],
    })),
  };
  const registrationBytes = json(registration);
  const garment: WardrobeGarmentManifest = {
    format: "gathria-sprite-garment",
    version,
    id: "blue-shirt",
    name: "Blue shirt",
    slot: "top",
    sourceSha256: hash(source),
    registrationSha256: hash(registrationBytes),
    characterId: config.characterId,
    frameWidth: 8,
    frameHeight: 8,
    pages: [
      {
        file: "patches-0.png",
        maskFile: "ownership-0.png",
        width: 2,
        height: 3,
      },
    ],
    frames: ids.map((frameId) => ({
      frameId,
      page: 0,
      rect: { x: 0, y: 0, width: 2, height: 3 },
      offset: { x: 2, y: 3 },
    })),
    provenance: "Shared atlas fixture.",
    ...(version === 2
      ? {
          handProtectionReviews: [
            {
              frameId: 0,
              label: "nearHand" as const,
              polygon: [
                { x: 7, y: 3 },
                { x: 8, y: 3 },
                { x: 8, y: 6 },
                { x: 7, y: 6 },
              ],
              reason: "Explicit sleeve fixture review.",
            },
          ],
        }
      : {}),
  };
  const bytes = zipSync({
    "manifest.json": json(garment),
    "patches-0.png": png(palettePixels),
    "ownership-0.png": png(ownership),
  });
  return {
    project: selectWardrobeGarment(
      await createWardrobeProject(source, registrationBytes, [bytes]),
      "top",
      garment.id,
    ),
    garment,
    bytes,
  };
}
function tamperDraft(
  bytes: Uint8Array,
  edit: (design: any, files: Record<string, Uint8Array>) => void,
) {
  const files = unzipSync(bytes);
  const design = JSON.parse(new TextDecoder().decode(files["design.json"]));
  edit(design, files);
  files["design.json"] = json(design);
  return zipSync(files);
}

describe("browser complete-bank clothing creation", () => {
  it("uses the canonical compositor for previews and rejects protected source ownership and unused-only changes", async () => {
    const { project, bytes } = await fixture();
    const session = await createGarmentAuthoringSession(project, "blue-shirt");
    const built = await session.build(design);
    const candidate = selectWardrobeGarment(
      await createWardrobeProject(project.source, project.registrationBytes, [
        built.bytes,
      ]),
      "top",
      design.id,
    );
    const compositor = await createWardrobeCompositor(candidate);
    await compositor.validateAppearance();
    expect(hash(session.renderPose(0).after.pixels)).toBe(
      hash(compositor.renderFrame(0).pixels),
    );
    const makeChanged = async (
      edit: (manifest: WardrobeGarmentManifest) => void,
    ) => {
      const files = unzipSync(bytes);
      const manifest = JSON.parse(
        new TextDecoder().decode(files["manifest.json"]),
      ) as WardrobeGarmentManifest;
      edit(manifest);
      files["manifest.json"] = json(manifest);
      return selectWardrobeGarment(
        await createWardrobeProject(project.source, project.registrationBytes, [
          zipSync(files),
        ]),
        "top",
        manifest.id,
      );
    };
    const protectedProject = await makeChanged((m) => {
      m.frames[0].offset.y = 0;
    });
    await expect(
      createGarmentAuthoringSession(protectedProject, "blue-shirt"),
    ).rejects.toThrow(/protected head/);
    const unusedProject = await makeChanged((m) => {
      for (const f of m.frames) f.rect = { x: 0, y: 2, width: 2, height: 1 };
    });
    const unused = await createGarmentAuthoringSession(
      unusedProject,
      "blue-shirt",
    );
    await expect(unused.build(design)).rejects.toThrow(/unused atlas/);
    expect(unused.getOutputBytes()).toBeNull();
    session.dispose();
    unused.dispose();
    compositor.dispose();
  });
  it("normalizes source and template caches, preserves V1/V2 metadata/alpha/ownership, and transforms shared atlas texels once", async () => {
    for (const version of [1, 2] as const) {
      const { project, garment } = await fixture(version),
        sourceHash = hash(project.source);
      project.registration.frames[0].points.neck.x = 7;
      project.items[0].manifest.name = "Untrusted cache";
      const session = await createGarmentAuthoringSession(
        project,
        "blue-shirt",
      );
      expect(session.template.name).toBe("Blue shirt");
      expect(session.renderPose(0).anchors.neck.x).toBe(3);
      expect(session.template.hardPoses).toHaveLength(8);
      expect(new Set(session.template.hardPoses.map((p) => p.action))).toEqual(
        new Set(["idle", "walk", "run", "jump", "celebrate"]),
      );
      expect(() => session.sampleCloth(0, 1, 1)).toThrow(/belonging/);
      expect(session.sampleCloth(0, 2, 3)).toEqual([80, 120, 160]);
      const before = session.renderPose(0);
      const built = await session.build(design);
      const item = await readWardrobeGarment(
        built.bytes,
        JSON.parse(new TextDecoder().decode(project.registrationBytes)),
        project.document.registrationSha256,
      );
      const page = decodeSourceRgbaPng(item.pages[0].patch),
        original = decodeSourceRgbaPng(project.items[0].pages[0].patch);
      expect([...page.pixels.slice(0, 8)]).toEqual([
        160, 100, 60, 255, 160, 100, 60, 128,
      ]);
      expect([...page.pixels.slice(8)]).toEqual([...palettePixels.slice(8)]);
      expect(page.colorChunks.map(hash)).toEqual(
        original.colorChunks.map(hash),
      );
      expect(hash(item.pages[0].ownership)).toBe(
        hash(project.items[0].pages[0].ownership),
      );
      expect(item.manifest.version).toBe(version);
      expect(item.manifest.frames).toEqual(garment.frames);
      expect(item.manifest.handProtectionReviews).toEqual(
        garment.handProtectionReviews,
      );
      expect(item.manifest.sourceSha256).toBe(sourceHash);
      expect(built.report.changedAtlasPixels).toBe(2);
      expect(built.report.poses.every((p) => p.changedPixels === 2)).toBe(true);
      expect(built.report.poses).toHaveLength(10);
      expect([
        ...session.renderPose(0).after.pixels.slice(0, 8 * 2 * 4),
      ]).toEqual([...before.source.pixels.slice(0, 8 * 2 * 4)]);
      expect(hash(project.source)).toBe(sourceHash);
      const repeated = await session.build(design);
      expect(hash(repeated.bytes)).toBe(hash(built.bytes));
      session.dispose();
    }
  });
  it("saves exact base/reference and restores output-bound decisions even with different current clothing", async () => {
    const { project, bytes } = await fixture();
    const session = await createGarmentAuthoringSession(project, "blue-shirt");
    const reference = { name: "palette.png", bytes: png(palettePixels) };
    const built = await session.build(design, reference);
    for (const pose of session.template.hardPoses)
      session.reviewPose(pose.frameId, "accepted", "Checked native pose.");
    const draft = await session.saveDraft();
    expect(hash(unzipSync(draft)["base.garment.zip"])).toBe(hash(bytes));
    expect(hash(await session.saveDraft())).toBe(hash(draft));
    const originalClothing = selectWardrobeGarment(project, "top", null);
    const restored = await openGarmentAuthoringDraft(originalClothing, draft);
    expect(hash(restored.getOutputBytes()!)).toBe(hash(built.bytes));
    expect(
      restored.getReport()!.hardPoses.every((p) => p.decision === "accepted"),
    ).toBe(true);
    expect(hash(restored.reference!.bytes)).toBe(hash(reference.bytes));
    const cloned = restored.getReport()!;
    cloned.hardPoses[0].decision = "rejected";
    expect(restored.getReport()!.hardPoses[0].decision).toBe("accepted");
    restored.invalidate();
    expect(restored.getOutputBytes()).toBeNull();
    expect(restored.getReport()).toBeNull();
    await expect(restored.saveDraft()).rejects.toThrow(/Build/);
    const next = await restored.build(
      {
        ...design,
        id: "warm-shirt",
        material: { ...design.material, targetRgb: [100, 180, 80] },
      },
      reference,
    );
    expect(next.report.hardPoses.every((p) => p.decision === "pending")).toBe(
      true,
    );
    session.dispose();
    restored.dispose();
  });
  it("rejects tampered drafts, stale reviews and unbounded or incompatible reference input without changing source", async () => {
    const { project } = await fixture(),
      original = hash(project.source);
    const session = await createGarmentAuthoringSession(project, "blue-shirt");
    await session.build(design, {
      name: "reference.png",
      bytes: png(palettePixels),
    });
    const draft = await session.saveDraft();
    for (const edit of [
      (d: any) => {
        d.sourceSha256 = "0".repeat(64);
      },
      (d: any) => {
        d.configuration.material.targetRgb = [110, 140, 200];
      },
      (d: any) => {
        d.review.poses[0].frameId = 999;
      },
      (d: any) => {
        d.review.poses.push(d.review.poses[0]);
      },
      (d: any) => {
        d.reference.sha256 = "0".repeat(64);
      },
      (d: any, f: Record<string, Uint8Array>) => {
        f["base.garment.zip"][0] ^= 1;
      },
      (d: any, f: Record<string, Uint8Array>) => {
        f["unlisted.txt"] = strToU8("no");
      },
    ])
      await expect(
        openGarmentAuthoringDraft(project, tamperDraft(draft, edit)),
      ).rejects.toThrow();
    await expect(
      session.build(design, {
        name: "large.png",
        bytes: new Uint8Array(AUTHORING_MAX_REFERENCE_BYTES + 1),
      }),
    ).rejects.toThrow(/8 MiB/);
    const huge = png(palettePixels);
    new DataView(huge.buffer).setUint32(16, 4097);
    await expect(
      session.build(design, { name: "huge.png", bytes: huge }),
    ).rejects.toThrow(/4096/);
    await expect(
      session.build(design, { name: "bad.png", bytes: new Uint8Array(45) }),
    ).rejects.toThrow(/intact/);
    expect(hash(project.source)).toBe(original);
    session.dispose();
  });
  it("rejects zero changes, invalid identity/material rules, stale build and cancellation", async () => {
    const { project } = await fixture();
    const session = await createGarmentAuthoringSession(project, "blue-shirt");
    await expect(
      session.build({ ...design, id: "blue-shirt" }),
    ).rejects.toThrow(/new clothing ID/);
    await expect(
      session.build({
        ...design,
        material: { ...design.material, targetRgb: [80, 120, 160] },
      }),
    ).rejects.toThrow(/changes no/);
    await expect(
      session.build({
        ...design,
        material: { ...design.material, targetRgb: [0, 100, 60] },
      }),
    ).rejects.toThrow(/1 to 255/);
    await expect(
      session.build({
        ...design,
        material: { ...design.material, tolerance: Infinity },
      }),
    ).rejects.toThrow(/tolerance/);
    await expect(
      session.build({
        ...design,
        material: { ...design.material, unexpected: true } as any,
      }),
    ).rejects.toThrow();
    const controller = new AbortController();
    await expect(
      session.build(design, undefined, {
        signal: controller.signal,
        onProgress: () => controller.abort(),
      }),
    ).rejects.toThrow(/cancel/i);
    expect(session.getOutputBytes()).toBeNull();
    await expect(
      session.build(design, undefined, {
        onProgress: (done) => {
          if (done === 0) session.invalidate();
        },
      }),
    ).rejects.toThrow(/changed during/);
    expect(session.getReport()).toBeNull();
    session.dispose();
    expect(() => session.renderPose(0)).toThrow(/closed/);
  });
});
