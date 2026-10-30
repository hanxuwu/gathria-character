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
  type WardrobeGarmentManifest,
  type WardrobeRegistration,
} from "../wardrobe/contract";
import {
  createWardrobeProject,
  readWardrobeGarment,
  selectWardrobeGarment,
} from "../wardrobe/project";
import { clothingPose } from "../wardrobe/recipe-kit";
import { importPaintedPoses } from "../wardrobe/paint-import";
import {
  exportFittingTemplate,
  exportFittingTemplateKit,
  FITTING_TEMPLATE_MAX_BYTES,
  inspectFittingTemplate,
} from "./fitting-template";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown) => strToU8(JSON.stringify(value));
const png = (width: number, height: number, pixels: Uint8Array) =>
  encodeSourceRgbaPng({ width, height, pixels, colorChunks: [] });
async function fixture() {
  const ids = [7, 19, 31];
  const manifest: CharacterPackV2Manifest = {
    schemaVersion: 2,
    format: "gathria-character-pack",
    name: "Fitting template fixture",
    generator: "source-fixture",
    spritesheet: {
      file: "spritesheet.png",
      width: 24,
      height: 8,
      frameWidth: 8,
      frameHeight: 8,
      columns: 3,
      rows: 1,
    },
    frames: ids.map((id, i) => ({ id, x: i * 8, y: 0, width: 8, height: 8 })),
    animations: {
      idle: { frames: [7], fps: 24, loop: true },
      walk: { frames: [7, 19, 31, 19], fps: 24, loop: true },
      run: { frames: [7, 19, 31], fps: 24, loop: true },
      jump: { frames: [19, 31, 7], fps: 24, loop: false },
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
    characterId: "template-fixture",
    source: {
      kind: "video-extraction",
      name: "fixture.mp4",
      sha256: "a".repeat(64),
    },
    provenance: "Native fixture with separate target clothing masks.",
    derivation: {
      method: "Retained video frames.",
      frames: ids.map((frameId, i) => ({
        frameId,
        sourceFrame: 200 + i,
        timeSeconds: (200 + i) / 24,
      })),
    },
  };
  const sourcePixels = new Uint8Array(24 * 8 * 4);
  for (let i = 0; i < sourcePixels.length; i += 4)
    sourcePixels.set([100, 90, 80, 255], i);
  const source = new Uint8Array(
    await (
      await createBakedCharacterPack(
        config,
        manifest,
        new Blob([png(24, 8, sourcePixels)], { type: "image/png" }),
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
    frames: ids.map((frameId, i) => ({
      frameId,
      sourceFrame: 200 + i,
      points: Object.fromEntries(
        WARDROBE_ANCHORS.map((name) => [
          name,
          {
            x: 4,
            y: 4,
            visibility: name.startsWith("far") ? "occluded" : "visible",
            confidence: 0.5,
            method: "Fixture estimate",
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
            { x: 0, y: 6 },
            { x: 2, y: 6 },
            { x: 2, y: 8 },
            { x: 0, y: 8 },
          ],
        },
      ],
    })),
  };
  const registrationBytes = json(registration);
  function garment(id: string, target: boolean, bottom = false) {
    const m: WardrobeGarmentManifest = {
      format: "gathria-sprite-garment",
      version: target && !bottom ? 2 : 1,
      id,
      name: id,
      slot: bottom ? "bottom" : "top",
      sourceSha256: sha(source),
      registrationSha256: sha(registrationBytes),
      characterId: config.characterId,
      frameWidth: 8,
      frameHeight: 8,
      pages: [
        {
          file: "patches-0.png",
          maskFile: "ownership-0.png",
          width: 9,
          height: 2,
        },
      ],
      frames: ids.map((frameId, i) => ({
        frameId,
        page: 0,
        rect: { x: 3 * i, y: 0, width: 3, height: 2 },
        offset: { x: 2, y: 3 },
      })),
      provenance:
        "Distinct fixture donor and target native pixels and ownership.",
      ...(target && !bottom
        ? {
            handProtectionReviews: [
              {
                frameId: 19,
                label: "nearHand" as const,
                polygon: [
                  { x: 0, y: 7 },
                  { x: 2, y: 7 },
                  { x: 2, y: 8 },
                  { x: 0, y: 8 },
                ],
                reason: "Target-specific cuff review.",
              },
            ],
          }
        : {}),
    };
    const pixels = new Uint8Array(9 * 2 * 4),
      mask = new Uint8Array(pixels.length);
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 9; x++) {
        const p = (y * 9 + x) * 4;
        const owned = target || x % 3 !== 0;
        mask.set([255, 255, 255, owned ? 255 : 0], p);
        if (owned)
          pixels.set(target ? [190, 60, 110, 255] : [30, 90, 150, 255], p);
      }
    return zipSync(
      {
        "manifest.json": json(m),
        "patches-0.png": png(9, 2, pixels),
        "ownership-0.png": png(9, 2, mask),
      },
      { mtime: new Date(2020, 0, 1) },
    );
  }
  const project = await createWardrobeProject(source, registrationBytes, [
    garment("donor-shirt", false),
    garment("target-shirt", true),
    garment("target-bottom", true, true),
  ]);
  return {
    donor: selectWardrobeGarment(project, "top", "donor-shirt"),
    target: selectWardrobeGarment(project, "top", "target-shirt"),
    bottom: selectWardrobeGarment(project, "bottom", "target-bottom"),
  };
}

describe("source-bound reusable side fitting templates", () => {
  it("reopens a native review plan on another garment without changing either look", async () => {
    const { donor, target } = await fixture(),
      before = structuredClone({ donor, target });
    const bytes = await exportFittingTemplate(donor, "donor-shirt", [19, 31]);
    expect(await exportFittingTemplate(donor, "donor-shirt", [19, 31])).toEqual(
      bytes,
    );
    const application = inspectFittingTemplate(bytes, target, "target-shirt");
    expect(application.reusedFromDifferentGarment).toBe(true);
    expect(application.poses.map((pose) => pose.frameId)).toEqual([19, 31]);
    expect(
      application.poses[0].locations
        .filter((loc) => loc.action === "walk")
        .map((loc) => loc.position),
    ).toEqual([1, 3]);
    expect(
      application.template.actions.find((clip) => clip.action === "jump")?.loop,
    ).toBe(false);
    expect(application.poses[0].protected[1].polygon[0].y).toBe(7);
    expect(application.template.guides[0].protected[1].polygon[0].y).toBe(6);
    application.poses[0].points.neck.x = 0;
    application.template.guides[0].protected[0].polygon[0].x = 8;
    expect({ donor, target }).toEqual(before);
    expect(
      inspectFittingTemplate(bytes, donor, "donor-shirt")
        .reusedFromDifferentGarment,
    ).toBe(false);
  });

  it("exports target artwork and masks, consumable by the existing strict painting importer", async () => {
    const { donor, target } = await fixture();
    const bytes = await exportFittingTemplate(donor, "donor-shirt", [19, 31]);
    const kit = await exportFittingTemplateKit(bytes, target, "target-shirt"),
      files = unzipSync(kit);
    const targetItem = target.items.find(
      (i) => i.manifest.id === "target-shirt",
    )!;
    expect(files["base.garment.zip"]).toEqual(targetItem.bytes);
    expect(files["registration.json"]).toEqual(target.registrationBytes);
    const targetPose = clothingPose(targetItem, 19);
    expect(files["pose-19.png"]).toEqual(encodeSourceRgbaPng(targetPose.image));
    expect(files["mask-19.png"]).toEqual(encodeSourceRgbaPng(targetPose.mask));
    const donorItem = donor.items.find((i) => i.manifest.id === "donor-shirt")!;
    expect(files["mask-19.png"]).not.toEqual(
      encodeSourceRgbaPng(clothingPose(donorItem, 19).mask),
    );
    const painted = await importPaintedPoses(target, kit);
    expect(painted.report.poses.every((pose) => pose.changedPixels === 0)).toBe(
      true,
    );
    const rebuilt = await readWardrobeGarment(
      painted.bytes,
      target.registration,
      target.document.registrationSha256,
    );
    for (const frameId of [7, 19, 31])
      expect(clothingPose(rebuilt, frameId)).toEqual(
        clothingPose(targetItem, frameId),
      );
  });

  it("rejects another body, registration, dimensions, slot and unavailable target", async () => {
    const { donor, target, bottom } = await fixture();
    const bytes = await exportFittingTemplate(donor, "donor-shirt", [19]);
    expect(() =>
      inspectFittingTemplate(bytes, bottom, "target-bottom"),
    ).toThrow("不能互相套用");
    expect(() => inspectFittingTemplate(bytes, target, "donor-shirt")).toThrow(
      "先穿上",
    );
    for (const [key, value] of [
      ["sourceSha256", "f".repeat(64)],
      ["registrationSha256", "e".repeat(64)],
      ["characterId", "other-body"],
      ["frameWidth", 9],
      ["frameHeight", 9],
    ]) {
      const raw = JSON.parse(new TextDecoder().decode(bytes));
      raw[key] = value;
      expect(() =>
        inspectFittingTemplate(json(raw), target, "target-shirt"),
      ).toThrow();
    }
  });

  it("rejects edited guides, protection, action timing and injected metadata", async () => {
    const { donor, target } = await fixture();
    const bytes = await exportFittingTemplate(donor, "donor-shirt", [19]);
    for (const mutate of [
      (raw: any) => raw.guides[0].points.neck.x++,
      (raw: any) => raw.guides[0].protected[0].polygon[0].x++,
      (raw: any) => raw.actions[0].fps++,
      (raw: any) => (raw.actions.at(-1).loop = true),
      (raw: any) => raw.actions[1].frames.reverse(),
      (raw: any) => (raw.reviewAnchors = []),
      (raw: any) => (raw.unknown = true),
    ]) {
      const raw = JSON.parse(new TextDecoder().decode(bytes));
      mutate(raw);
      expect(() =>
        inspectFittingTemplate(json(raw), target, "target-shirt"),
      ).toThrow();
    }
    const reordered = JSON.parse(new TextDecoder().decode(bytes));
    reordered.guides[0] = Object.fromEntries(
      Object.entries(reordered.guides[0]).reverse(),
    );
    expect(
      inspectFittingTemplate(json(reordered), target, "target-shirt").poses,
    ).toHaveLength(1);
  });

  it("bounds malformed input and rejects duplicate or unavailable poses", async () => {
    const { donor, target } = await fixture();
    for (const bytes of [
      new Uint8Array(),
      new Uint8Array(FITTING_TEMPLATE_MAX_BYTES + 1),
      new Uint8Array([255]),
      json({}),
      json([]),
    ])
      expect(() =>
        inspectFittingTemplate(bytes, target, "target-shirt"),
      ).toThrow();
    for (const ids of [
      [],
      [19, 19],
      [999],
      [NaN],
      Array.from({ length: 9 }, (_, i) => i),
    ])
      await expect(
        exportFittingTemplate(donor, "donor-shirt", ids),
      ).rejects.toThrow();
  });

  it("cancels before work and before publishing a target kit", async () => {
    const { donor, target } = await fixture(),
      controller = new AbortController();
    const bytes = await exportFittingTemplate(donor, "donor-shirt", [19]);
    controller.abort();
    await expect(
      exportFittingTemplate(donor, "donor-shirt", [19], {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      exportFittingTemplateKit(bytes, target, "target-shirt", {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    const active = new AbortController();
    const pending = exportFittingTemplateKit(bytes, target, "target-shirt", {
      signal: active.signal,
    });
    active.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
