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
} from "./contract";
import { createWardrobeProject, selectWardrobeGarment } from "./project";
import { clothingPose } from "./recipe-kit";
import { createWardrobeCompositor } from "./compositor";
import { prepareGarmentCandidate } from "./repair-candidate";
import {
  createMaskEditSession,
  maskAnchorTransform,
  MASK_MAX_DRAFT_BYTES,
} from "./mask-edit";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown) => strToU8(JSON.stringify(value));
const pixel = (bytes: Uint8Array, x: number, y: number) => [
  ...bytes.subarray((y * 8 + x) * 4, (y * 8 + x + 1) * 4),
];
async function fixture() {
  const ids = [7, 19, 31];
  const manifest: CharacterPackV2Manifest = {
    schemaVersion: 2,
    format: "gathria-character-pack",
    name: "Mask fixture",
    generator: "native-fixture",
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
      idle: { frames: [7], fps: 1, loop: true },
      walk: { frames: [7, 7, 19], fps: 24, loop: true },
      run: { frames: ids, fps: 24, loop: true },
      jump: { frames: ids, fps: 24, loop: false },
      celebrate: { frames: ids, fps: 12, loop: true },
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
    characterId: "mask-fixture",
    source: {
      kind: "video-extraction",
      name: "fixture.mp4",
      sha256: "a".repeat(64),
    },
    provenance: "Native fixture only.",
    derivation: {
      method: "No source alteration.",
      frames: ids.map((frameId, i) => ({
        frameId,
        sourceFrame: 10 + i,
        timeSeconds: (10 + i) / 24,
      })),
    },
  };
  const pixels = new Uint8Array(24 * 8 * 4);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 24; x++)
      pixels.set(
        [
          180,
          150,
          120,
          x % 8 === 0 && y === 7 ? 0 : x % 8 === 1 && y === 5 ? 128 : 255,
        ],
        (y * 24 + x) * 4,
      );
  const source = new Uint8Array(
    await (
      await createBakedCharacterPack(
        config,
        manifest,
        new Blob([
          encodeSourceRgbaPng({
            width: 24,
            height: 8,
            pixels,
            colorChunks: [],
          }),
        ]),
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
      sourceFrame: 10 + i,
      points: Object.fromEntries(
        WARDROBE_ANCHORS.map((name) => [
          name,
          {
            x:
              name === "nearShoulder" || name === "waistLeft"
                ? 2
                : name === "farShoulder" || name === "waistRight"
                  ? 6
                  : 4,
            y: name.includes("Shoulder") ? 2 : name.startsWith("waist") ? 6 : 4,
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
      ],
    })),
  };
  const registrationBytes = json(registration),
    paint = new Uint8Array(12 * 4 * 4),
    mask = new Uint8Array(paint.length);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 12; x++) {
      paint.set(
        [40 + (x % 4) * 10 + Math.floor(x / 4) * 20, 90, 140, 255],
        (y * 12 + x) * 4,
      );
      mask.fill(255, (y * 12 + x) * 4, (y * 12 + x + 1) * 4);
    }
  const garment: WardrobeGarmentManifest = {
    format: "gathria-sprite-garment",
    version: 1,
    id: "top-fixture",
    name: "Fixture top",
    slot: "top",
    sourceSha256: registration.sourceSha256,
    registrationSha256: sha(registrationBytes),
    characterId: config.characterId,
    frameWidth: 8,
    frameHeight: 8,
    pages: [
      {
        file: "patches-0.png",
        maskFile: "ownership-0.png",
        width: 12,
        height: 4,
      },
    ],
    frames: ids.map((frameId, i) => ({
      frameId,
      page: 0,
      rect: { x: i * 4, y: 0, width: 4, height: 4 },
      offset: { x: 2, y: 3 },
    })),
    provenance: "Opaque source-bound clothing fixture.",
  };
  const bytes = zipSync(
    {
      "manifest.json": json(garment),
      "patches-0.png": encodeSourceRgbaPng({
        width: 12,
        height: 4,
        pixels: paint,
        colorChunks: [],
      }),
      "ownership-0.png": encodeSourceRgbaPng({
        width: 12,
        height: 4,
        pixels: mask,
        colorChunks: [],
      }),
    },
    { mtime: new Date(2020, 0, 1) },
  );
  return selectWardrobeGarment(
    await createWardrobeProject(source, registrationBytes, [bytes]),
    "top",
    "top-fixture",
  );
}
const brush = {
  mode: "cloth" as const,
  points: [{ x: 1, y: 4 }],
  radius: 1,
  sample: { x: 3, y: 4 },
};

describe("native mask repair drafts", () => {
  it("clones only owned cloth, preserves source alpha/head, restores source and leaves its input immutable", async () => {
    const project = await fixture(),
      before = structuredClone(project),
      session = await createMaskEditSession(project, "top-fixture", "jump", 0);
    let view = session.stroke(7, brush);
    expect(pixel(view.after.pixels, 1, 4)).toEqual([50, 90, 140, 255]);
    expect(pixel(view.after.pixels, 1, 5)).toEqual([50, 90, 140, 128]);
    expect(view.stats.addedPixels).toBeGreaterThan(0);
    const headBefore = pixel(view.before.pixels, 3, 0);
    view = session.applyReviewedPatch(7, [
      { x: 3, y: 0, r: 1, g: 2, b: 3 },
      { x: 0, y: 7, r: 1, g: 2, b: 3 },
    ]);
    expect(pixel(view.after.pixels, 3, 0)).toEqual(headBefore);
    expect(view.stats.blockedPixels).toBeGreaterThanOrEqual(2);
    session.decide(7, "accepted");
    view = session.stroke(7, {
      mode: "restore",
      points: [{ x: 1, y: 4 }],
      radius: 1,
    });
    expect(view.decision).toBe("pending");
    expect(pixel(view.after.pixels, 1, 4)).toEqual([180, 150, 120, 255]);
    view = session.undo(7);
    expect(pixel(view.after.pixels, 1, 4)).toEqual([50, 90, 140, 255]);
    view.after.pixels.fill(0);
    view.ownership.fill(0);
    expect(pixel((await session.loadPose(7)).after.pixels, 1, 4)).toEqual([
      50, 90, 140, 255,
    ]);
    expect(project).toEqual(before);
    session.dispose();
  });
  it("requires review per suggested pose and omits pending/rejected edits from a deterministic complete garment", async () => {
    const project = await fixture(),
      session = await createMaskEditSession(project, "top-fixture", "jump", 0);
    session.stroke(7, brush);
    session.decide(7, "accepted");
    const proposal = await session.propose(7, 19);
    expect(proposal.decision).toBe("pending");
    expect(pixel(proposal.after.pixels, 1, 4)).toEqual([70, 90, 140, 255]);
    expect(session.summary().find((p) => p.frameId === 7)?.decision).toBe(
      "accepted",
    );
    await expect(session.propose(7, 19)).rejects.toThrow(/already has edits/);
    session.decide(19, "rejected");
    const first = await session.build({
        id: "repaired-top",
        name: "Repaired top",
      }),
      second = await session.build({
        id: "repaired-top",
        name: "Repaired top",
      });
    expect(first.bytes).toEqual(second.bytes);
    expect(first.report.accepted.map((p) => p.frameId)).toEqual([7]);
    expect(first.report.excluded).toEqual([
      { frameId: 19, decision: "rejected" },
    ]);
    const candidate = await prepareGarmentCandidate(project, first.bytes),
      renderer = await createWardrobeCompositor(candidate.project),
      base = await createWardrobeCompositor(project);
    expect(pixel(renderer.renderFrame(7).pixels, 1, 4)).toEqual([
      50, 90, 140, 255,
    ]);
    for (const id of [19, 31])
      expect(renderer.renderFrame(id).pixels).toEqual(
        base.renderFrame(id).pixels,
      );
    const oldFiles = unzipSync(project.items[0].bytes),
      newFiles = unzipSync(first.bytes);
    expect(newFiles["patches-0.png"]).toEqual(oldFiles["patches-0.png"]);
    expect(newFiles["ownership-0.png"]).toEqual(oldFiles["ownership-0.png"]);
    expect(candidate.project.archive.manifest).toEqual(
      project.archive.manifest,
    );
    renderer.dispose();
    base.dispose();
    session.dispose();
  });
  it("round-trips proof-bound decisions and rejects forged/mismatched drafts atomically", async () => {
    const project = await fixture(),
      session = await createMaskEditSession(project, "top-fixture", "jump", 0);
    session.stroke(7, brush);
    session.decide(7, "accepted");
    await session.propose(7, 19);
    session.decide(19, "accepted");
    const bytes = session.serialize();
    const restored = await createMaskEditSession(
      project,
      "top-fixture",
      "jump",
      0,
    );
    await restored.restore(bytes);
    expect(restored.serialize()).toEqual(bytes);
    const old = restored.serialize(),
      wrong = JSON.parse(new TextDecoder().decode(bytes));
    wrong.binding.itemSha256 = "f".repeat(64);
    await expect(restored.restore(json(wrong))).rejects.toThrow(
      /different source/,
    );
    expect(restored.serialize()).toEqual(old);
    const forged = JSON.parse(new TextDecoder().decode(bytes));
    forged.poses[1].commands[0].command.sample.x = 4;
    await expect(restored.restore(json(forged))).rejects.toThrow(
      /does not match/,
    );
    expect(restored.serialize()).toEqual(old);
    const noProof = JSON.parse(new TextDecoder().decode(bytes));
    delete noProof.poses[1].proposal;
    await expect(restored.restore(json(noProof))).rejects.toThrow(
      /verifiable seed/,
    );
    const self = JSON.parse(new TextDecoder().decode(bytes));
    self.poses[1].proposal.seedFrameId = 19;
    await expect(restored.restore(json(self))).rejects.toThrow(
      /another action pose/,
    );
    await expect(
      restored.restore(new Uint8Array(MASK_MAX_DRAFT_BYTES + 1)),
    ).rejects.toThrow(/4 MiB/);
    session.dispose();
    restored.dispose();
  });
  it("blocks low-confidence/nonneighbor propagation and respects holds and one-shot boundaries", async () => {
    const project = await fixture(),
      session = await createMaskEditSession(project, "top-fixture", "jump", 0);
    session.stroke(7, brush);
    expect(session.neighbors(0).map((p) => p.frameId)).toEqual([7, 19]);
    await expect(session.propose(7, 31)).rejects.toThrow(/adjacent/);
    await expect(session.propose(7, 7)).rejects.toThrow(/held/);
    const from = structuredClone(project.registration.frames[0]),
      to = structuredClone(project.registration.frames[1]);
    to.points.nearShoulder.confidence = 0.2;
    expect(() => maskAnchorTransform(from, to)).toThrow(/low confidence/);
    to.points.nearShoulder.confidence = 0.9;
    to.points.farShoulder = { ...to.points.nearShoulder };
    expect(() => maskAnchorTransform(from, to)).toThrow(/collapse/);
    const walk = await createMaskEditSession(project, "top-fixture", "walk", 1);
    expect(walk.neighbors(1).map((p) => p.frameId)).toEqual([7, 19]);
    session.dispose();
    walk.dispose();
  });
  it("revalidates byte-bound metadata instead of trusting modified parsed caches", async () => {
    const project = await fixture();
    project.registration.frames[0].protected = [];
    project.registration.frames[0].points.nearShoulder.confidence = 0;
    (
      project.items[0].manifest as unknown as { unexpected: string }
    ).unexpected = "forged cache";
    const session = await createMaskEditSession(
      project,
      "top-fixture",
      "jump",
      0,
    );
    const view = session.applyReviewedPatch(7, [
      { x: 3, y: 0, r: 1, g: 2, b: 3 },
    ]);
    expect(view.stats.changedPixels).toBe(0);
    expect(view.allowed[3]).toBe(0);
    expect(() => session.decide(7, "accepted")).toThrow(/no changes/);
    session.dispose();
  });
  it("does not propagate blocked seed paint and retains protection when importing explicit RGB", async () => {
    const project = await fixture(),
      session = await createMaskEditSession(project, "top-fixture", "jump", 0);
    session.applyReviewedPatch(7, [
      { x: 1, y: 4, r: 1, g: 2, b: 3 },
      { x: 3, y: 0, r: 1, g: 2, b: 3 },
    ]);
    const target = await session.propose(7, 19);
    expect(pixel(target.after.pixels, 3, 0)).toEqual([180, 150, 120, 255]);
    expect(target.ownership[3]).toBe(0);
    expect(target.stats.changedPixels).toBe(1);
    const restored = await createMaskEditSession(
      project,
      "top-fixture",
      "jump",
      0,
    );
    await restored.restore(session.serialize());
    expect(pixel((await restored.loadPose(19)).after.pixels, 3, 0)).toEqual([
      180, 150, 120, 255,
    ]);
    session.dispose();
    restored.dispose();
  });
  it("cancels without an output and refuses stale async draft imports", async () => {
    const project = await fixture(),
      controller = new AbortController(),
      session = await createMaskEditSession(project, "top-fixture", "jump", 0, {
        signal: controller.signal,
      });
    session.stroke(7, brush);
    session.decide(7, "accepted");
    const before = session.serialize();
    const pending = session.restore(before);
    session.reset(7);
    await expect(pending).rejects.toThrow(/changed during import/);
    session.stroke(7, brush);
    session.decide(7, "accepted");
    const build = session.build({ id: "cancelled-top", name: "Cancelled top" });
    controller.abort();
    await expect(build).rejects.toThrow(/cancelled/);
    session.dispose();
  });
  it("rejects excessive brush work before replay and restores a draft at another view position", async () => {
    const project = await fixture(),
      session = await createMaskEditSession(project, "top-fixture", "jump", 0);
    session.stroke(7, brush);
    session.decide(7, "accepted");
    const bytes = session.serialize();
    const reopened = await createMaskEditSession(
      project,
      "top-fixture",
      "jump",
      1,
    );
    await reopened.restore(bytes);
    expect(pixel((await reopened.loadPose(7)).after.pixels, 1, 4)).toEqual([
      50, 90, 140, 255,
    ]);
    expect(reopened.summary()[0].decision).toBe("accepted");
    const abusive = JSON.parse(new TextDecoder().decode(bytes));
    abusive.poses[0].commands[0].command = {
      kind: "brush",
      mode: "cloth",
      points: Array.from({ length: 2048 }, (_, i) => ({
        x: i % 2 ? 7 : 0,
        y: i % 2 ? 7 : 0,
      })),
      radius: 48,
      sample: { x: 3, y: 4 },
    };
    const before = reopened.serialize();
    await expect(reopened.restore(json(abusive))).rejects.toThrow(
      /brush work|too much/,
    );
    expect(reopened.serialize()).toEqual(before);
    session.dispose();
    reopened.dispose();
  });
  it("rejects racing source loads without displacing reviewed edits", async () => {
    const project = await fixture(),
      session = await createMaskEditSession(project, "top-fixture", "jump", 0);
    session.stroke(7, brush);
    session.decide(7, "accepted");
    const first = session.loadPose(19);
    await expect(session.loadPose(31)).rejects.toThrow(/finish loading/);
    await first;
    expect(session.summary().find((p) => p.frameId === 7)?.decision).toBe(
      "accepted",
    );
    session.dispose();
  });
  it("counts propagation seed snapshots in the same live and restored work budget", async () => {
    const project = await fixture(),
      session = await createMaskEditSession(project, "top-fixture", "run", 0);
    session.stroke(7, {
      ...brush,
      radius: 48,
      points: Array.from({ length: 700 }, () => ({ x: 1, y: 4 })),
    });
    await session.propose(7, 19);
    const before = session.serialize();
    await expect(session.propose(7, 31)).rejects.toThrow(/work budget/);
    expect(session.serialize()).toEqual(before);
    const reopened = await createMaskEditSession(
      project,
      "top-fixture",
      "run",
      0,
    );
    await reopened.restore(before);
    expect(reopened.serialize()).toEqual(before);
    session.dispose();
    reopened.dispose();
  });
});
