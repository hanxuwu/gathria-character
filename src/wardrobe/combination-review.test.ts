import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { appearanceFixture } from "../appearance/fixture.test-support";
import { encodeSourceRgbaPng } from "../core/baked-source";
import { createBakedCharacterPack } from "../core/pack";
import type {
  BakedCharacterRecipe,
  CharacterPackV2Manifest,
} from "../core/types";
import {
  WARDROBE_ANCHORS,
  type WardrobeRegistration,
  type WardrobeSelection,
  type WardrobeGarmentManifest,
} from "./contract";
import {
  addWardrobeAppearanceBank,
  createWardrobeProject,
  selectWardrobeGarment,
  updateWardrobePreview,
} from "./project";
import {
  buildCombinationCase,
  COMBINATION_REPORT_MAX_BYTES,
  createCombinationPlan,
  parseCombinationReport,
  scanCombinationPlan,
  serializeCombinationReport,
  type CombinationRequest,
} from "./combination-review";

const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (v: unknown) => strToU8(JSON.stringify(v));
const selection = (top: string | null = null): WardrobeSelection => ({
  top,
  bottom: null,
  fullBody: null,
  shoes: null,
});
async function fixture(withAppearance = true) {
  const ids = [7, 19, 31];
  const manifest: CharacterPackV2Manifest = {
    schemaVersion: 2,
    format: "gathria-character-pack",
    name: "Combination fixture",
    generator: "test",
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
    characterId: "combination-fixture",
    source: {
      kind: "video-extraction",
      name: "fixture.mp4",
      sha256: "a".repeat(64),
    },
    provenance: "Test-only fixture.",
    derivation: {
      method: "Native source unchanged.",
      frames: ids.map((frameId, i) => ({
        frameId,
        sourceFrame: 10 + i,
        timeSeconds: (10 + i) / 24,
      })),
    },
  };
  const png = (width: number, height: number, pixels: Uint8Array) =>
    encodeSourceRgbaPng({ width, height, pixels, colorChunks: [] });
  const source = new Uint8Array(
    await (
      await createBakedCharacterPack(
        config,
        manifest,
        new Blob([
          png(
            24,
            8,
            new Uint8Array(
              Array.from({ length: 24 * 8 }, () => [180, 150, 120, 255]).flat(),
            ),
          ),
        ]),
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
    frames: ids.map((frameId, i) => ({
      frameId,
      sourceFrame: 10 + i,
      points: Object.fromEntries(
        WARDROBE_ANCHORS.map((name) => [
          name,
          { x: 4, y: 4, visibility: "visible" },
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
  const reg = json(registration);
  const garment = (id: string, slot: "top" | "fullBody", r: number) => {
    const metadata: WardrobeGarmentManifest = {
      format: "gathria-sprite-garment",
      version: 1,
      id,
      name: id,
      slot,
      sourceSha256: hash(source),
      registrationSha256: hash(reg),
      characterId: config.characterId,
      frameWidth: 8,
      frameHeight: 8,
      provenance: "Exact source-bound test clothing.",
      pages: [
        {
          file: "patches-0.png",
          maskFile: "ownership-0.png",
          width: 3,
          height: 1,
        },
      ],
      frames: ids.map((frameId, i) => ({
        frameId,
        page: 0,
        rect: { x: i, y: 0, width: 1, height: 1 },
        offset: { x: 2 + i, y: 4 },
      })),
    };
    return zipSync({
      "manifest.json": json(metadata),
      "patches-0.png": png(
        3,
        1,
        new Uint8Array([
          r,
          60,
          90,
          255,
          r + 10,
          60,
          90,
          255,
          r + 20,
          60,
          90,
          255,
        ]),
      ),
      "ownership-0.png": png(3, 1, new Uint8Array(12).fill(255)),
    });
  };
  let project = selectWardrobeGarment(
    await createWardrobeProject(source, reg, [
      garment("shirt-a", "top", 40),
      garment("shirt-b", "top", 100),
      garment("dress", "fullBody", 70),
    ]),
    "top",
    "shirt-a",
  );
  if (withAppearance)
    project = await addWardrobeAppearanceBank(
      project,
      appearanceFixture(registration, hash(reg)).bytes,
    );
  return project;
}
const request = (): CombinationRequest => ({
  outfits: [
    { id: "a", name: "Shirt A", selection: selection("shirt-a") },
    { id: "b", name: "Shirt B", selection: selection("shirt-b") },
  ],
  hairIds: [null, "soft-crop"],
  faceIds: [null, "gentle"],
  hairColors: ["chestnut"],
  actions: ["run", "jump"],
  facings: ["right", "left"],
  posesPerAction: 3,
  maxLooks: 24,
  maxSamples: 600,
});
const pairSet = (cases: Array<{ factors: Record<string, unknown> }>) =>
  new Set(
    cases.flatMap((item) => {
      const values = Object.entries(item.factors);
      return values.flatMap(([a, x], i) =>
        values.slice(i + 1).map(([b, y]) => JSON.stringify([a, x, b, y])),
      );
    }),
  );

describe("bounded combination review", () => {
  it("exhaustively covers valid combinations and deduplicates bald colors without changing source or preview", async () => {
    const project = await fixture(),
      before = structuredClone(project),
      input = request();
    input.hairColors = ["copper", "chestnut", "espresso"];
    const plan = await createCombinationPlan(project, {
      ...input,
      mode: "exhaustive",
    });
    expect(plan.coverage).toMatchObject({
      mode: "exhaustive",
      totalCombinations: 16,
      selectedCombinations: 16,
      missingPairs: [],
    });
    expect(plan.cases.filter((c) => c.appearance.hairId === null)).toHaveLength(
      4,
    );
    expect(
      plan.cases
        .filter((c) => c.appearance.hairId === null)
        .every((c) => c.factors.color === null),
    ).toBe(true);
    expect(plan.coverage.coveredPairs).toBe(pairSet(plan.cases).size);
    expect(plan.coverage.plannedPositions).toBe(16 * 6 * 2);
    const reversed = await createCombinationPlan(project, {
      ...input,
      outfits: [...input.outfits].reverse(),
      hairIds: [...input.hairIds!].reverse(),
      actions: [...input.actions!].reverse(),
      hairColors: [...input.hairColors].reverse(),
      mode: "exhaustive",
    });
    expect(reversed).toEqual(plan);
    expect(project).toEqual(before);
  });

  it("reports exact uncovered valid pairs for deterministic bounded representative selection", async () => {
    const project = await fixture(),
      full = await createCombinationPlan(project, request());
    const sample = await createCombinationPlan(project, {
      ...request(),
      mode: "representative",
      maxLooks: 3,
    });
    const total = pairSet(full.cases),
      covered = pairSet(sample.cases);
    expect(sample.coverage).toMatchObject({
      mode: "representative",
      totalCombinations: 8,
      selectedCombinations: 3,
      totalPairs: total.size,
      coveredPairs: covered.size,
    });
    expect(sample.coverage.missingPairs).toEqual(
      [...total].filter((p) => !covered.has(p)).sort(),
    );
    expect(
      await createCombinationPlan(project, {
        ...request(),
        mode: "representative",
        maxLooks: 3,
      }),
    ).toEqual(sample);
    await expect(
      createCombinationPlan(project, {
        ...request(),
        mode: "exhaustive",
        maxLooks: 3,
      }),
    ).rejects.toThrow("Exhaustive review needs");
  });

  it("keeps full-body exclusivity and loaded-bank/material boundaries fail-closed", async () => {
    const project = await fixture();
    await expect(
      createCombinationPlan(project, {
        ...request(),
        outfits: [
          {
            id: "bad",
            name: "bad",
            selection: { ...selection("shirt-a"), fullBody: "dress" },
          },
        ],
      }),
    ).rejects.toThrow("full-body");
    await expect(
      createCombinationPlan(project, {
        ...request(),
        hairIds: ["unknown-hair"],
      }),
    ).rejects.toThrow("verified appearance bank");
    await expect(
      createCombinationPlan(project, {
        ...request(),
        outfits: [{ id: "bad", name: "bad", selection: selection("unloaded") }],
      }),
    ).rejects.toThrow("embedded garment");
    const valid = await createCombinationPlan(project, {
      ...request(),
      outfits: [
        {
          id: "dress",
          name: "Dress",
          selection: { ...selection(), fullBody: "dress" },
        },
      ],
    });
    expect(
      valid.cases.every(
        (c) => c.selection.top === null && c.selection.bottom === null,
      ),
    ).toBe(true);
    await expect(
      createCombinationPlan(project, { ...request(), maxLooks: 25 }),
    ).rejects.toThrow("24");
    await expect(
      createCombinationPlan(project, { ...request(), maxSamples: 601 }),
    ).rejects.toThrow("600");
    await expect(
      createCombinationPlan(project, {
        ...request(),
        facings: ["right", "right"],
      }),
    ).rejects.toThrow("duplicate");
    await expect(
      createCombinationPlan(project, {
        ...request(),
        outfits: Array.from({ length: 17 }, (_, i) => ({
          id: `x${i}`,
          name: "bad",
          selection: selection(),
        })),
      }),
    ).rejects.toThrow("16 choices");
  });

  it("distinguishes timeline hold coverage, sampled poses and real adjacent motion boundaries", async () => {
    const project = await fixture(false),
      plan = await createCombinationPlan(project, {
        outfits: [request().outfits[1]],
        actions: ["walk", "jump"],
        facings: ["right"],
        posesPerAction: 3,
      });
    expect(plan.coverage.positionCoverage[0]).toEqual({
      action: "walk",
      sampledPositions: [0, 2],
      untestedPositions: [1],
      motionTestedPositions: [0, 1, 2],
    });
    expect(plan.coverage.totalPositions).toBe(6);
    expect(plan.coverage.plannedPositions).toBe(5);
    const report = await scanCombinationPlan(project, plan);
    expect(
      report.rows.find((r) => r.action === "walk" && r.position === 0)?.motion,
    ).toMatchObject({ toFrameId: 7, toPosition: 1, loopClosure: false });
    expect(
      report.rows.find((r) => r.action === "walk" && r.position === 2)?.motion,
    ).toMatchObject({ toFrameId: 7, toPosition: 0, loopClosure: true });
    expect(
      report.rows.find((r) => r.action === "jump" && r.position === 2)?.motion,
    ).toBeNull();
    expect(report.rows.every((r) => r.manualReview === "unreviewed")).toBe(
      true,
    );
    expect(report.interpretation).toContain("not defect severity");
  });

  it("renders same-appearance controls as zero and measures actual mirrored clothes without editing source head pixels", async () => {
    const project = await fixture(),
      source = new Uint8Array(project.source);
    const plan = await createCombinationPlan(project, {
      ...request(),
      actions: ["run"],
      posesPerAction: 1,
    });
    const report = await scanCombinationPlan(project, plan);
    expect(report.status).toBe("complete");
    expect(report.failedSamples).toBe(0);
    const controls = new Set(
      plan.cases.filter((c) => c.selection.top === "shirt-a").map((c) => c.id),
    );
    expect(
      report.rows
        .filter((r) => controls.has(r.caseId))
        .every(
          (r) =>
            r.metrics?.changedPixels === 0 &&
            r.motion?.metrics.residual.changedPixels === 0,
        ),
    ).toBe(true);
    const changed = plan.cases.find(
      (c) =>
        c.selection.top === "shirt-b" &&
        c.appearance.hairId === null &&
        c.appearance.faceId === null,
    )!;
    const rows = report.rows.filter((r) => r.caseId === changed.id);
    expect(rows[0].metrics).toMatchObject({
      changedPixels: 1,
      alphaAdded: 0,
      alphaRemoved: 0,
    });
    const built = await buildCombinationCase(project, plan, changed.id);
    try {
      const original = built.comparison.renderSourceFrame(7),
        current = built.comparison.renderFrame(7);
      expect(current.pixels.slice(0, current.width * 2 * 4)).toEqual(
        original.pixels.slice(0, original.width * 2 * 4),
      );
      expect(rows[1].metrics?.changedBounds?.x).toBe(
        current.width - rows[0].metrics!.changedBounds!.x - 1,
      );
      expect(built.project.document.selection.top).toBe("shirt-b");
      expect(project.document.selection.top).toBe("shirt-a");
    } finally {
      built.renderer.dispose();
      built.referenceRenderer.dispose();
    }
    expect(project.source).toEqual(source);
  });

  it("returns a cancellable completed prefix and restores manual decisions without accepting mismatched reports", async () => {
    const project = await fixture(),
      plan = await createCombinationPlan(project, request()),
      controller = new AbortController();
    const report = await scanCombinationPlan(project, plan, {
      signal: controller.signal,
      onProgress: (count) => {
        if (count === 3) controller.abort();
      },
    });
    expect(report.status).toBe("cancelled");
    expect(report.completedSamples).toBe(3);
    report.rows[0].manualReview = "issue";
    report.rows[0].note = "Inspect cuff on this exact pose.";
    expect(
      await parseCombinationReport(
        serializeCombinationReport(report),
        project,
        plan,
      ),
    ).toEqual(report);
    const before = JSON.stringify(report);
    const tampered = structuredClone(report);
    tampered.rows[0].position = 2;
    await expect(
      parseCombinationReport(JSON.stringify(tampered), project, plan),
    ).rejects.toThrow("completed prefix");
    tampered.rows[0] = { ...report.rows[0], note: "x".repeat(1001) };
    await expect(
      parseCombinationReport(JSON.stringify(tampered), project, plan),
    ).rejects.toThrow("manual review");
    expect(JSON.stringify(report)).toBe(before);
    await expect(
      parseCombinationReport(
        " ".repeat(COMBINATION_REPORT_MAX_BYTES + 1),
        project,
        plan,
      ),
    ).rejects.toThrow("4 MiB");
  });

  it("rejects stale looks and tampered plans while allowing playhead-only changes", async () => {
    const project = await fixture(),
      plan = await createCombinationPlan(project, request());
    const previewChanged = updateWardrobePreview(project, {
      action: "jump",
      facing: "left",
    });
    const built = await buildCombinationCase(
      previewChanged,
      plan,
      plan.cases[0].id,
    );
    built.renderer.dispose();
    built.referenceRenderer.dispose();
    await expect(
      buildCombinationCase(
        selectWardrobeGarment(project, "top", "shirt-b"),
        plan,
        plan.cases[0].id,
      ),
    ).rejects.toThrow("no longer matches");
    const tampered = structuredClone(plan);
    tampered.coverage.coveredPairs++;
    await expect(scanCombinationPlan(project, tampered)).rejects.toThrow(
      "no longer matches",
    );
    const neutral = await createCombinationPlan(project, {
      ...request(),
      referenceSelection: selection(),
    });
    expect(neutral.cases[0].referenceBinding.lookSha256).not.toBe(
      plan.cases[0].referenceBinding.lookSha256,
    );
  });

  it("reconstructs mutable parsed caches from bytes and reports pre-cancelled work as zero samples", async () => {
    const project = await fixture(false),
      input = {
        outfits: [request().outfits[0]],
        actions: ["run" as const],
        facings: ["right" as const],
      };
    const plan = await createCombinationPlan(project, input);
    project.registration.frameWidth = 999;
    project.archive.manifest.animations.run!.frames.reverse();
    expect(await createCombinationPlan(project, input)).toEqual(plan);
    const controller = new AbortController();
    controller.abort();
    const report = await scanCombinationPlan(project, plan, {
      signal: controller.signal,
    });
    expect(report).toMatchObject({
      status: "cancelled",
      completedSamples: 0,
      failedSamples: 0,
      rows: [],
    });
    expect(
      await parseCombinationReport(
        serializeCombinationReport(report),
        project,
        plan,
      ),
    ).toEqual(report);
  });

  it("records actual protected-head render failures without metrics or automatic visual approval", async () => {
    const original = await fixture(false);
    const items = original.items.map((item) => {
      if (item.manifest.id !== "shirt-b") return item.bytes;
      const files = unzipSync(item.bytes);
      const metadata = JSON.parse(
        new TextDecoder().decode(files["manifest.json"]),
      ) as WardrobeGarmentManifest;
      metadata.frames.forEach((frame) => {
        frame.offset.y = 0;
      });
      files["manifest.json"] = json(metadata);
      return zipSync(files);
    });
    const project = selectWardrobeGarment(
      await createWardrobeProject(
        original.source,
        original.registrationBytes,
        items,
      ),
      "top",
      "shirt-a",
    );
    const plan = await createCombinationPlan(project, {
      outfits: [request().outfits[1]],
      actions: ["run"],
      facings: ["right"],
      posesPerAction: 3,
    });
    const report = await scanCombinationPlan(project, plan);
    expect(report).toMatchObject({
      status: "complete",
      completedSamples: 3,
      failedSamples: 3,
    });
    expect(
      report.rows.every(
        (row) =>
          row.error?.includes("head") &&
          row.metrics === null &&
          row.motion === null &&
          row.manualReview === "unreviewed",
      ),
    ).toBe(true);
    expect(
      await parseCombinationReport(
        serializeCombinationReport(report),
        project,
        plan,
      ),
    ).toEqual(report);
  });

  it("rejects fabricated canvas sizes, off-canvas bounds and impossible motion timing in a bound report", async () => {
    const project = await fixture(false),
      plan = await createCombinationPlan(project, {
        outfits: [request().outfits[1]],
        actions: ["run"],
        facings: ["right"],
        posesPerAction: 1,
      });
    const report = await scanCombinationPlan(project, plan);
    for (const mutate of [
      (r: typeof report) => {
        r.rows[0].metrics!.totalPixels = 65;
      },
      (r: typeof report) => {
        r.rows[0].metrics!.changedBounds!.x = 8;
      },
      (r: typeof report) => {
        r.rows[0].motion!.toPosition = 2;
      },
      (r: typeof report) => {
        r.rows[0].motion!.metrics.residual.meanDelta = 1;
        r.rows[0].motion!.metrics.residual.maxDelta = 0;
      },
    ]) {
      const edited = structuredClone(report);
      mutate(edited);
      await expect(
        parseCombinationReport(JSON.stringify(edited), project, plan),
      ).rejects.toThrow();
    }
  });

  it("defers unused page pixels but catches malformed selected ownership during strict case preparation", async () => {
    const project = await fixture(false);
    const item = project.items.find(
      (entry) => entry.manifest.id === "shirt-b",
    )!;
    const files = unzipSync(item.bytes);
    files["ownership-0.png"] = encodeSourceRgbaPng({
      width: 3,
      height: 1,
      pixels: new Uint8Array([
        255, 255, 255, 128, 255, 255, 255, 255, 255, 255, 255, 255,
      ]),
      colorChunks: [],
    });
    item.bytes = zipSync(files);
    item.sha256 = hash(item.bytes);
    project.document.items.find((entry) => entry.id === "shirt-b")!.sha256 =
      item.sha256;
    const plan = await createCombinationPlan(project, {
      outfits: [request().outfits[1]],
      actions: ["run"],
      facings: ["right"],
      posesPerAction: 1,
    });
    const report = await scanCombinationPlan(project, plan);
    expect(report.failedSamples).toBe(1);
    expect(report.rows[0]).toMatchObject({
      metrics: null,
      error: expect.stringContaining("binary"),
      manualReview: "unreviewed",
    });
    report.rows[0].manualReview = "checked";
    await expect(
      parseCombinationReport(serializeCombinationReport(report), project, plan),
    ).rejects.toThrow("failed render");
    const control = await createCombinationPlan(project, {
      outfits: [request().outfits[0]],
      actions: ["idle"],
      facings: ["right"],
    });
    const controlReport = await scanCombinationPlan(project, control);
    expect(controlReport.failedSamples).toBe(0);
    expect(controlReport.rows[0].metrics?.changedPixels).toBe(0);
  });
});
