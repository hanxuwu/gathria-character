import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { encodeSourceRgbaPng } from "../core/baked-source";
import { createBakedCharacterPack } from "../core/pack";
import specifications from "../core/gameplay-motion-profiles.json";
import legacySpecifications from "../core/gameplay-motion-legacy-profiles.json";
import {
  createGameplayState,
  gameplayFrameId,
  type GameplayMotion,
} from "../core/gameplay-motion";
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
  exportWardrobeProject,
  importWardrobeProject,
  selectWardrobeGarment,
} from "./project";
import {
  createDualViewWardrobe,
  exportDualViewWardrobe,
  importDualViewWardrobe,
  validateDualViewWardrobe,
  type DualView,
  type DualViewCharacter,
  type DualViewSettings,
} from "./dual-view";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown) => strToU8(JSON.stringify(value));
const parse = (bytes: Uint8Array) =>
  JSON.parse(new TextDecoder().decode(bytes));
const png = (width: number, height: number, pixels: Uint8Array) =>
  encodeSourceRgbaPng({ width, height, pixels, colorChunks: [] });

/** Tiny source-bound test drawings, never shipped as user artwork. */
async function project(view: DualView, character: DualViewCharacter = "male") {
  const characterId = `kling-${character}-${view === "original" ? "motion-v1" : "side-workspace-v1"}`;
  const ids = [7, 19];
  const manifest: CharacterPackV2Manifest = {
    schemaVersion: 2,
    format: "gathria-character-pack",
    name: `${view} fixture`,
    generator: "dual-view-contract-fixture",
    spritesheet: {
      file: "spritesheet.png",
      width: 16,
      height: 8,
      frameWidth: 8,
      frameHeight: 8,
      columns: 2,
      rows: 1,
    },
    frames: ids.map((id, i) => ({ id, x: i * 8, y: 0, width: 8, height: 8 })),
    animations: {
      idle: { frames: [7], fps: 12, loop: true },
      walk: { frames: [19, 7], fps: 12, loop: true },
      run: { frames: [7, 19], fps: 24, loop: true },
      jump: {
        frames: view === "side" ? [7, 19, 7, 19] : [7, 19, 7],
        fps: 24,
        loop: false,
      },
      ...(view === "original"
        ? { celebrate: { frames: [19, 7], fps: 12, loop: true } }
        : {}),
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
    characterId,
    source: {
      kind: "video-extraction",
      name: `${character}-${view}.mp4`,
      sha256: (view === "original" ? "a" : "b").repeat(64),
    },
    provenance: "Synthetic contract fixture, not approved character artwork.",
    derivation: {
      method: "Test drawings with independent native action sequences.",
      frames: ids.map((frameId, i) => ({
        frameId,
        sourceFrame: 200 + i,
        timeSeconds: (200 + i) / 24,
      })),
    },
  };
  const pixels = new Uint8Array(16 * 8 * 4);
  for (let at = 0; at < pixels.length; at += 4)
    pixels.set(
      [
        view === "original" ? 70 : 100,
        90,
        character === "male" ? 130 : 170,
        255,
      ],
      at,
    );
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
    characterId,
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
            visibility: "visible",
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
  const registrationBytes = json(registration);
  const garments = (["top", "bottom"] as const).map((slot, index) => {
    const garment: WardrobeGarmentManifest = {
      format: "gathria-sprite-garment",
      version: 1,
      id: `${view}-${slot}`,
      name: `${view} ${slot}`,
      slot,
      sourceSha256: sha(source),
      registrationSha256: sha(registrationBytes),
      characterId,
      frameWidth: 8,
      frameHeight: 8,
      pages: [
        {
          file: "patches-0.png",
          maskFile: "ownership-0.png",
          width: 2,
          height: 1,
        },
      ],
      frames: ids.map((frameId, i) => ({
        frameId,
        page: 0,
        rect: { x: i, y: 0, width: 1, height: 1 },
        offset: { x: 4, y: 4 + index },
      })),
      provenance:
        "Native test ownership. Different source masks are never shared.",
    };
    return zipSync({
      "manifest.json": json(garment),
      "patches-0.png": png(
        2,
        1,
        new Uint8Array([130, 70, 50, 255, 135, 75, 55, 255]),
      ),
      "ownership-0.png": png(
        2,
        1,
        new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255]),
      ),
    });
  });
  let result = await createWardrobeProject(source, registrationBytes, garments);
  result = selectWardrobeGarment(result, "top", `${view}-top`);
  return result;
}

function settings(): DualViewSettings {
  return {
    character: "male",
    activeView: "side",
    selection: {
      outfitId: "cotton-day",
      paletteId: "sea",
      topId: "cotton-tank",
      bottomId: null,
    },
    previews: {
      original: { action: "celebrate", facing: "left", position: 1 },
      side: { action: "jump", facing: "right", position: 3 },
    },
  };
}
async function pair() {
  return createDualViewWardrobe(
    { original: await project("original"), side: await project("side") },
    settings(),
  );
}

describe("source-bound dual-view wardrobe persistence", () => {
  it("round-trips both complete native projects, mixed clothing and independent action capabilities exactly", async () => {
    const initial = await pair();
    const before = initial.projects.original.document.preview;
    const bytes = await exportDualViewWardrobe(initial);
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual([
      "manifest.json",
      "original.wardrobe.zip",
      "side.wardrobe.zip",
    ]);
    const manifest = parse(files["manifest.json"]);
    const restored = await importDualViewWardrobe(bytes);
    expect(restored.activeView).toBe("side");
    expect(restored.motionMode).toBe("source");
    expect(manifest.version).toBe(1);
    expect(manifest).not.toHaveProperty("motionMode");
    expect(restored.selection).toEqual(settings().selection);
    expect(restored.previews).toEqual(settings().previews);
    for (const view of ["original", "side"] as const) {
      expect(manifest.views[view].sha256).toBe(
        sha(files[`${view}.wardrobe.zip`]),
      );
      const native = await importWardrobeProject(files[`${view}.wardrobe.zip`]);
      expect(native.source).toEqual(initial.projects[view].source);
      expect(native.registrationBytes).toEqual(
        initial.projects[view].registrationBytes,
      );
      expect(native.document.selection).toEqual(
        initial.projects[view].document.selection,
      );
      expect(native.archive.manifest.animations).toEqual(
        initial.projects[view].archive.manifest.animations,
      );
      expect(restored.projects[view].items.map((item) => item.bytes)).toEqual(
        initial.projects[view].items.map((item) => item.bytes),
      );
      expect(await exportWardrobeProject(restored.projects[view])).toEqual(
        files[`${view}.wardrobe.zip`],
      );
    }
    expect(
      restored.projects.side.archive.manifest.animations.celebrate,
    ).toBeUndefined();
    expect(await exportDualViewWardrobe(restored)).toEqual(bytes);
    expect(initial.projects.original.document.preview).toBe(before);
  });

  it("reads an explicit source-mode V2 without reinterpreting legacy frame positions", async () => {
    const initial = await pair();
    const legacy = await exportDualViewWardrobe(initial);
    const files = unzipSync(legacy);
    const manifest = parse(files["manifest.json"]);
    manifest.version = 2;
    manifest.motionMode = "source";
    const reopened = await importDualViewWardrobe(
      zipSync({ ...files, "manifest.json": json(manifest) }),
    );
    expect(reopened.motionMode).toBe("source");
    expect(reopened.previews).toEqual(initial.previews);
    expect(await exportDualViewWardrobe(reopened)).toEqual(legacy);
    for (const mode of ["auto", null, false, "single-jump"]) {
      manifest.motionMode = mode;
      await expect(
        importDualViewWardrobe(
          zipSync({ ...files, "manifest.json": json(manifest) }),
        ),
      ).rejects.toThrow();
    }
  });

  it("requires reviewed source bindings for single-jump mode and rejects unspecified mode values", async () => {
    const initial = await pair();
    expect(() =>
      createDualViewWardrobe(initial.projects, {
        ...settings(),
        motionMode: "single-jump",
      }),
    ).toThrow(/no reviewed single-jump profile/);
    expect(() =>
      createDualViewWardrobe(initial.projects, {
        ...settings(),
        motionMode: "unknown",
      } as unknown as DualViewSettings),
    ).toThrow(/motion mode/);
    expect(initial.motionMode).toBe("source");
  });

  it.each([
    ["male", "takeoff"],
    ["female", "takeoff"],
    ["male", "landing"],
    ["female", "landing"],
    ["male", "legacy-takeoff"],
    ["female", "legacy-takeoff"],
  ] as const)(
    "%s preserves a reviewed %s checkpoint and rejects altered or foreign state",
    async (character, phase) => {
      const initial = createDualViewWardrobe(
        {
          original: await project("original", character),
          side: await project("side", character),
        },
        { ...settings(), character },
      );
      // Exercise the lightweight metadata constructor. Actual source checks and
      // save/reopen byte preservation are covered by browser export tests.
      const projects = structuredClone(initial.projects);
      for (const view of ["original", "side"] as const) {
        const spec = specifications.find(
          (row) =>
            row.profile.view === view && row.profile.characterId === character,
        )!;
        projects[view].document.sourceSha256 = spec.profile.sourceSha256;
        projects[view].registration.sourceSha256 = spec.profile.sourceSha256;
        projects[view].archive.manifest.animations = structuredClone(
          spec.sourceActions,
        );
        const sample = projects[view].archive.manifest.frames[0];
        projects[view].archive.manifest.frames = [
          ...new Set(
            Object.values(spec.sourceActions).flatMap((clip) => clip.frames),
          ),
        ].map((id) => ({ ...sample, id }));
      }
      const profile = (
        phase === "legacy-takeoff"
          ? legacySpecifications.find(
              (row) =>
                row.profile.id === `kling-${character}-side-single-jump-v4`,
            )
          : specifications.find(
              (row) =>
                row.profile.view === "side" &&
                row.profile.characterId === character,
            )
      )!.profile as GameplayMotion;
      const recovering = phase === "landing";
      const from = recovering ? "jump" : "run";
      const action = recovering ? "run" : "jump";
      const route = profile.routes.find(
        (row) => row.from === from && row.to === action && row.leadIn,
      )!;
      const selected = settings();
      selected.character = character;
      selected.motionMode = "single-jump";
      selected.previews.original = {
        action: "idle",
        facing: "right",
        position: 0,
      };
      selected.previews.side = {
        action,
        facing: "left",
        position: route.entry,
        takeoff: {
          profile,
          state: {
            ...createGameplayState(action),
            elapsedMs: (route.entry * 1000) / profile.actions[action].fps,
            returnAction: recovering ? "run" : "walk",
            pending: "walk",
            jumpFrom: recovering ? null : "run",
            leadIn: { from, exit: route.exit, elapsedMs: 7.5 },
          },
        },
      };
      const accepted = createDualViewWardrobe(projects, selected);
      expect(accepted.previews.side).toEqual(selected.previews.side);
      expect(accepted.previews.side.takeoff).not.toBe(
        selected.previews.side.takeoff,
      );
      expect(
        gameplayFrameId(
          accepted.previews.side.takeoff!.profile,
          accepted.previews.side.takeoff!.state,
        ),
      ).toBe(route.leadIn![0]);
      const mutations = [
        (value: DualViewSettings) => {
          value.motionMode = "source";
        },
        (value: DualViewSettings) => {
          value.previews.side.position = 1;
        },
        (value: DualViewSettings) => {
          value.previews.side.takeoff!.profile.id = "unreviewed";
        },
        (value: DualViewSettings) => {
          value.previews.side.takeoff!.state.pending = "jump";
        },
        (value: DualViewSettings) => {
          value.previews.side.takeoff!.state.leadIn!.from = "walk";
        },
        (value: DualViewSettings) => {
          value.previews.side.takeoff!.state.jumpFrom = recovering
            ? "run"
            : null;
        },
        (value: DualViewSettings) => {
          value.previews.side.takeoff!.state.returnAction =
            "celebrate" as "run";
        },
        (value: DualViewSettings) => {
          value.previews.side.takeoff!.state.elapsedMs = 1;
        },
        (value: DualViewSettings) => {
          value.previews.side.takeoff!.state.leadIn!.elapsedMs = 5000;
        },
        (value: DualViewSettings) => {
          value.previews.side.takeoff!.state.leadIn!.exit = -1;
        },
        (value: DualViewSettings) => {
          (
            value.previews.side.takeoff!.state as unknown as Record<
              string,
              unknown
            >
          ).frameId = 999;
        },
        (value: DualViewSettings) => {
          value.previews.side.takeoff!.profile = specifications.find(
            (row) =>
              row.profile.view === "side" &&
              row.profile.characterId !== character,
          )!.profile as GameplayMotion;
        },
      ];
      if (recovering)
        mutations.push(
          (value: DualViewSettings) => {
            value.previews.side.takeoff!.state.returnAction = "walk";
          },
          (value: DualViewSettings) => {
            value.previews.side.takeoff!.state.pending = "run";
          },
        );
      for (const mutate of mutations) {
        const changed = structuredClone(selected);
        mutate(changed);
        expect(() => createDualViewWardrobe(projects, changed)).toThrow();
      }
      expect(initial.previews.side).not.toHaveProperty("takeoff");
    },
  );

  it("rejects swapped sources, a different character and missing view variants instead of using a fallback", async () => {
    const initial = await pair();
    expect(() =>
      createDualViewWardrobe(
        { original: initial.projects.side, side: initial.projects.original },
        settings(),
      ),
    ).toThrow(/selected Kling character and source/);
    const female = await project("side", "female");
    expect(() =>
      createDualViewWardrobe(
        { original: initial.projects.original, side: female },
        settings(),
      ),
    ).toThrow(/selected Kling character and source/);
    const missing = selectWardrobeGarment(initial.projects.side, "top", null);
    expect(() =>
      createDualViewWardrobe(
        { ...initial.projects, side: missing },
        settings(),
      ),
    ).toThrow(/missing.*variant/);
    const wrong = structuredClone(initial.projects.side);
    wrong.document.selection.top = "unavailable-top";
    expect(() =>
      createDualViewWardrobe({ ...initial.projects, side: wrong }, settings()),
    ).toThrow(/absent.*inventory/);
    expect(() =>
      createDualViewWardrobe(initial.projects, {
        ...settings(),
        projects: {},
      } as DualViewSettings),
    ).toThrow(/unexpected fields/);
  });

  it("rejects unavailable actions and positions without changing either project", async () => {
    const initial = await pair();
    const snapshots = structuredClone(initial.projects);
    const unsupported = settings();
    unsupported.previews.side = {
      action: "celebrate",
      facing: "right",
      position: 0,
    };
    expect(() => createDualViewWardrobe(initial.projects, unsupported)).toThrow(
      /does not support/,
    );
    const overflow = settings();
    overflow.previews.side.position = 4;
    expect(() => createDualViewWardrobe(initial.projects, overflow)).toThrow(
      /does not support/,
    );
    const invalid = settings();
    invalid.previews.original.position = Number.POSITIVE_INFINITY;
    expect(() => createDualViewWardrobe(initial.projects, invalid)).toThrow(
      /Invalid.*position/,
    );
    expect(initial.projects).toEqual(snapshots);
  });

  it("rejects corrupt embedded bytes and forged binding references", async () => {
    const initial = await pair();
    const files = unzipSync(await exportDualViewWardrobe(initial));
    const damaged = structuredClone(files);
    damaged["side.wardrobe.zip"][10] ^= 1;
    await expect(importDualViewWardrobe(zipSync(damaged))).rejects.toThrow(
      /checksum mismatch/,
    );
    for (const field of [
      "sourceSha256",
      "registrationSha256",
      "characterId",
      "frameWidth",
    ] as const) {
      const manifest = parse(files["manifest.json"]);
      manifest.views.side[field] =
        field === "frameWidth"
          ? 9
          : field === "characterId"
            ? "kling-female-side-workspace-v1"
            : "f".repeat(64);
      await expect(
        importDualViewWardrobe(
          zipSync({ ...files, "manifest.json": json(manifest) }),
        ),
      ).rejects.toThrow(/embedded native bindings/);
    }
  });

  it("revalidates the inner project after an attacker repairs the outer project checksum", async () => {
    const files = unzipSync(await exportDualViewWardrobe(await pair()));
    const inner = unzipSync(files["side.wardrobe.zip"]);
    const document = parse(inner["document.json"]);
    document.sourceSha256 = "f".repeat(64);
    inner["document.json"] = json(document);
    files["side.wardrobe.zip"] = zipSync(inner);
    const metadata = parse(files["manifest.json"]);
    metadata.views.side.sha256 = sha(files["side.wardrobe.zip"]);
    files["manifest.json"] = json(metadata);
    await expect(importDualViewWardrobe(zipSync(files))).rejects.toThrow(
      /source checksum/,
    );
  });

  it("rejects unexpected or missing files, malformed settings and incompatible versions", async () => {
    const files = unzipSync(await exportDualViewWardrobe(await pair()));
    await expect(
      importDualViewWardrobe(
        zipSync({ ...files, "extra.txt": strToU8("extra") }),
      ),
    ).rejects.toThrow(/unexpected number/);
    const missing = { ...files };
    delete missing["side.wardrobe.zip"];
    await expect(importDualViewWardrobe(zipSync(missing))).rejects.toThrow(
      /unexpected number/,
    );
    for (const update of [
      { version: 2 },
      { activeView: "back" },
      { character: "other" },
      { selection: { ...settings().selection, topId: "../wrong" } },
    ]) {
      const metadata = { ...parse(files["manifest.json"]), ...update };
      await expect(
        importDualViewWardrobe(
          zipSync({ ...files, "manifest.json": json(metadata) }),
        ),
      ).rejects.toThrow();
    }
  });

  it("rejects a mismatch between the saved per-view preview and the embedded native document", async () => {
    const files = unzipSync(await exportDualViewWardrobe(await pair()));
    const metadata = parse(files["manifest.json"]);
    metadata.previews.side.facing = "left";
    await expect(
      importDualViewWardrobe(
        zipSync({ ...files, "manifest.json": json(metadata) }),
      ),
    ).rejects.toThrow(/saved preview/);
  });

  it("honors cancellation at persistence boundaries and leaves the live pair untouched", async () => {
    const initial = await pair();
    const bytes = await exportDualViewWardrobe(initial);
    const snapshot = structuredClone(initial);
    const controller = new AbortController();
    controller.abort();
    await expect(
      importDualViewWardrobe(bytes, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      validateDualViewWardrobe(initial, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      exportDualViewWardrobe(initial, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    const running = new AbortController();
    const pending = exportDualViewWardrobe(initial, { signal: running.signal });
    running.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(initial).toEqual(snapshot);
  });
});
