import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { encodeSourceRgbaPng } from "../core/baked-source";
import {
  coverageCheckpoints,
  COVERAGE_CHECKPOINTS,
} from "./coverage-checkpoints";
import { coverageOverlay } from "./coverage-overlay";
import type { WardrobeProject, WardrobeGarment } from "./contract";

function sourceProject(): WardrobeProject {
  const sha = COVERAGE_CHECKPOINTS.find(
    (p) => p.character === "female" && p.view === "original",
  )!.sourceSha256;
  return {
    document: {
      sourceSha256: sha,
      selection: { top: null, bottom: null, fullBody: null, shoes: null },
    },
    registration: {
      sourceSha256: sha,
      frameWidth: 4,
      frameHeight: 3,
      frames: [{ frameId: 62 }, { frameId: 90 }, { frameId: 103 }],
    },
    archive: {
      manifest: {
        frames: [{ id: 62 }, { id: 90 }, { id: 103 }],
        animations: {
          run: { frames: [61, 62, 63] },
          jump: { frames: [90, 91, 103] },
        },
      },
    },
    items: [],
  } as unknown as WardrobeProject;
}

describe("source-bound coverage checkpoints", () => {
  it("binds every shipped checkpoint to an inventoried source frame and action", () => {
    const inventory = JSON.parse(
      readFileSync(
        new URL("../../docs/wardrobe-coverage/inventory.json", import.meta.url),
        "utf8",
      ),
    );
    const ids = new Set<string>();
    for (const checkpoint of COVERAGE_CHECKPOINTS) {
      expect(ids.has(checkpoint.id)).toBe(false);
      ids.add(checkpoint.id);
      const source = inventory.sources.find(
        (entry: { sha256: string }) => entry.sha256 === checkpoint.sourceSha256,
      );
      expect(source, checkpoint.id).toBeDefined();
      expect(source.frameIds, checkpoint.id).toContain(checkpoint.frameId);
      expect(
        source.animations[checkpoint.action].frames,
        checkpoint.id,
      ).toContain(checkpoint.frameId);
    }
  });
  it("locates actual native timeline positions without changing styling or animation data", () => {
    const project = sourceProject();
    const before = structuredClone(project);
    const rows = coverageCheckpoints(project);
    expect(
      rows.map(({ frameId, action, position }) => ({
        frameId,
        action,
        position,
      })),
    ).toEqual([
      { frameId: 62, action: "run", position: 1 },
      { frameId: 90, action: "jump", position: 0 },
      { frameId: 103, action: "jump", position: 2 },
    ]);
    expect(project).toEqual(before);
  });
  it("never applies matching numeric frames to an unrelated or mismatched source", () => {
    const project = sourceProject();
    project.document.sourceSha256 = "0".repeat(64);
    expect(coverageCheckpoints(project)).toEqual([]);
    project.registration.sourceSha256 = project.document.sourceSha256;
    expect(coverageCheckpoints(project)).toEqual([]);
  });
  it("resolves an existing action instead of fabricating the requested one, and hides absent frames", () => {
    const project = sourceProject();
    project.archive.manifest.animations.run!.frames = [61];
    project.archive.manifest.animations.jump!.frames = [62, 90];
    expect(
      coverageCheckpoints(project).map(({ frameId, action, position }) => ({
        frameId,
        action,
        position,
      })),
    ).toEqual([
      { frameId: 62, action: "jump", position: 0 },
      { frameId: 90, action: "jump", position: 1 },
    ]);
    project.archive.manifest.frames = [];
    expect(coverageCheckpoints(project)).toEqual([]);
  });
});

function garment(
  id: string,
  slot: "top" | "bottom",
  transparent = false,
): WardrobeGarment {
  const patch = {
    width: 2,
    height: 1,
    colorChunks: [],
    pixels: new Uint8Array([0, 0, 0, 0, 80, 100, 120, transparent ? 0 : 255]),
  };
  const mask = { ...patch, pixels: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255]) };
  return {
    sha256: `coverage-test-${id}`,
    manifest: {
      id,
      slot,
      frames: [
        {
          frameId: 62,
          page: 0,
          rect: { x: 1, y: 0, width: 1, height: 1 },
          offset: { x: 2, y: 1 },
        },
      ],
      pages: [{ width: 2, height: 1 }],
    },
    pages: [
      {
        patch: encodeSourceRgbaPng(patch),
        ownership: encodeSourceRgbaPng(mask),
      },
    ],
  } as unknown as WardrobeGarment;
}

describe("read-only clothing ownership overlay", () => {
  it("uses atlas crop/offset and final garment layer order, including transparent removal", () => {
    const project = sourceProject();
    project.items = [
      garment("coverage-bottom", "bottom"),
      garment("coverage-top", "top", true),
    ];
    project.document.selection.bottom = "coverage-bottom";
    const before = structuredClone(project);
    const painted = coverageOverlay(project, 62);
    expect(Array.from(painted.pixels.slice(24, 28))).toEqual([
      0, 196, 224, 110,
    ]);
    expect(
      painted.pixels
        .filter((_, i) => i % 4 === 3 && i !== 27)
        .every((n) => n === 0),
    ).toBe(true);
    expect(project).toEqual(before);
    project.document.selection.top = "coverage-top";
    const cleared = coverageOverlay(project, 62);
    expect(Array.from(cleared.pixels.slice(24, 28))).toEqual([
      236, 60, 174, 145,
    ]);
    project.document.selection.top = null;
    project.document.selection.bottom = null;
    expect(coverageOverlay(project, 62).pixels.every((n) => n === 0)).toBe(
      true,
    );
  });
  it("rejects an unavailable selected item/frame instead of showing a stale mask", () => {
    const project = sourceProject();
    project.document.selection.top = "missing";
    expect(() => coverageOverlay(project, 62)).toThrow("unavailable");
    project.items = [garment("missing", "top")];
    expect(() => coverageOverlay(project, 90)).toThrow("no native frame");
  });
});
