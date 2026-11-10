import { describe, expect, it } from "vitest";
import frozenV1 from "./test-fixtures/landing-candidate-v1.json";
import frozenV2 from "./test-fixtures/landing-candidate-v2.json";
import frozenV3 from "./test-fixtures/landing-candidate-v3.json";
import editions from "./landing-candidate-editions.json";
import {
  gameplayManifest,
  gameplayMotionMetadata,
  readGameplayMotion,
  resolveGameplayMotion,
  type GameplayMotion,
} from "../core/gameplay-motion";
import type { BakedCharacterPackManifest, JsonValue } from "../core/types";
import {
  validateWardrobeDocument,
  type WardrobeProject,
} from "../wardrobe/contract";
import {
  advanceSidePlayback,
  createSidePlaybackCheckpoint,
  restoreSidePlaybackCheckpoint,
  sidePlaybackFrameId,
} from "./gameplay";
import { sideIdentityOf, sideProjectCollection } from "./catalog";

describe.each([
  { label: "V1", frozen: frozenV1 },
  { label: "V2", frozen: frozenV2 },
  { label: "V3", frozen: frozenV3 },
])("frozen landing candidate $label compatibility", ({ frozen }) => {
  // The frozen metadata comes from published source editions. This small parsed contract
  // fixture exercises edition selection without duplicating a 14 MiB atlas ZIP.
  const manifest = {
    animations: frozen.sourceActions,
    frames: Array.from({ length: 109 }, (_, id) => ({ id })),
  } as BakedCharacterPackManifest;
  const config = { characterId: frozen.characterId };
  const profile = frozen.profile as GameplayMotion;
  const effective = gameplayManifest(manifest, profile, config);

  it("binds each registered edition to a distinct source and its exact reviewed profile", () => {
    expect(
      new Set(editions.editions.map((edition) => edition.sourceSha256)).size,
    ).toBe(editions.editions.length);
    expect(
      new Set(editions.editions.map((edition) => edition.profileId)).size,
    ).toBe(editions.editions.length);
    for (const edition of editions.editions) {
      expect(
        resolveGameplayMotion(manifest, edition.sourceSha256, {
          characterId: edition.characterId,
        })?.id,
      ).toBe(edition.profileId);
    }
  });

  it("retains the exact published profile and standalone pack metadata", () => {
    expect(editions.editions).toContainEqual({
      profileId: profile.id,
      characterId: frozen.characterId,
      sourceSha256: frozen.sourceSha256,
      registrationSha256: frozen.registrationSha256,
    });
    expect(
      resolveGameplayMotion(manifest, frozen.sourceSha256, config),
    ).toEqual(profile);
    expect(gameplayMotionMetadata(profile)).toEqual(frozen.profile);
    expect(
      readGameplayMotion(effective, {
        ...config,
        sourceMetadata: {
          gameplayMotion: frozen.profile as unknown as JsonValue,
        },
      }),
    ).toEqual(profile);
    expect(
      readGameplayMotion(effective, {
        characterId: "kling-male-side-workspace-v1",
        sourceMetadata: {
          gameplayMotion: frozen.profile as unknown as JsonValue,
        },
      }),
    ).toBeNull();
  });

  it.each(frozen.checkpoints)(
    "keeps the old paused native$frameId checkpoint and resumes its old profile",
    ({ frameId, preview }) => {
      const document = {
        format: "gathria-wardrobe-project",
        version: 1,
        sourceSha256: frozen.sourceSha256,
        registrationSha256: frozen.registrationSha256,
        items: [],
        selection: { top: null, bottom: null, shoes: null, fullBody: null },
        preview,
      };
      const project = {
        archive: { manifest, config },
        items: [],
        document,
        registration: {
          characterId: frozen.characterId,
          sourceSha256: frozen.sourceSha256,
        },
      } as unknown as WardrobeProject;
      expect(sideIdentityOf(project)).toBe("male");
      expect(sideProjectCollection(project)).toBe("landing-candidate");
      const checked = validateWardrobeDocument(
        JSON.parse(JSON.stringify(document)),
        project,
      );
      expect(checked.preview).toEqual(preview);
      const selected = resolveGameplayMotion(
        manifest,
        checked.sourceSha256,
        config,
      )!;
      expect(selected.id).toBe(profile.id);
      const state = restoreSidePlaybackCheckpoint(
        checked.preview.playback,
        selected,
      )!;
      expect(state).toEqual(preview.playback.state);
      expect(createSidePlaybackCheckpoint(state, selected)).toEqual(
        preview.playback,
      );
      expect(sidePlaybackFrameId(state, effective, selected)).toBe(frameId);
      const options = {
        mode: "travel" as const,
        walkSpeed: 530,
        runSpeed: 700,
        bounds: { min: -10_000, max: 10_000 },
      };
      expect(
        advanceSidePlayback(state, 1000, effective, options, selected),
      ).toEqual(state);
      const next = advanceSidePlayback(
        { ...state, paused: false },
        1000 / 24,
        effective,
        options,
        selected,
      );
      expect(sidePlaybackFrameId(next, effective, selected)).toBe(
        frameId === 107 ? 108 : 48,
      );
      expect(next.worldX - state.worldX).toBeCloseTo(700 / 24);

      for (const other of editions.editions) {
        if (other.sourceSha256 === frozen.sourceSha256) continue;
        const otherProfile = resolveGameplayMotion(
          manifest,
          other.sourceSha256,
          { characterId: other.characterId },
        )!;
        expect(otherProfile).not.toBeNull();
        expect(
          restoreSidePlaybackCheckpoint(checked.preview.playback, otherProfile),
        ).toBeNull();
        expect(() =>
          validateWardrobeDocument(
            { ...document, sourceSha256: other.sourceSha256 },
            project,
          ),
        ).toThrow(/checkpoint/);
      }
    },
  );
});

describe("contact recovery edition V3", () => {
  it("changes only the immutable binding and the one grounded recovery hold", () => {
    const edition = editions.editions.find(
      (row) => row.profileId === "kling-male-side-landing-candidate-v3",
    )!;
    const manifest = {
      animations: frozenV2.sourceActions,
      frames: Array.from({ length: 109 }, (_, id) => ({ id })),
    } as BakedCharacterPackManifest;
    const current = resolveGameplayMotion(manifest, edition.sourceSha256, {
      characterId: edition.characterId,
    })!;
    const old = frozenV2.profile as GameplayMotion;
    const normalized = structuredClone(current);
    normalized.id = old.id;
    normalized.sourceSha256 = old.sourceSha256;
    const route = normalized.routes.find(
      (row) => row.from === "jump" && row.to === "run",
    )!;
    expect(route).toEqual({
      from: "jump",
      to: "run",
      exit: 23,
      entry: 9,
      leadIn: [88, 107, 108],
    });
    route.leadIn = [88, 89, 107, 108];
    expect(normalized).toEqual(old);
    expect(current.actions).toEqual(old.actions);
    expect(current.sourceSha256).not.toBe(old.sourceSha256);
  });
});

describe("painted low recovery edition V4", () => {
  it("uses two lower moving poses while preserving every basic action and historical route", () => {
    const edition = editions.editions.find(
      (row) => row.profileId === "kling-male-side-landing-candidate-v4",
    )!;
    const manifest = {
      animations: frozenV3.sourceActions,
      frames: Array.from({ length: 109 }, (_, id) => ({ id })),
    } as BakedCharacterPackManifest;
    const current = resolveGameplayMotion(manifest, edition.sourceSha256, {
      characterId: edition.characterId,
    })!;
    const old = frozenV3.profile as GameplayMotion;
    const normalized = structuredClone(current);
    normalized.id = old.id;
    normalized.sourceSha256 = old.sourceSha256;
    const route = normalized.routes.find(
      (row) => row.from === "jump" && row.to === "run",
    )!;
    expect(route).toEqual({
      from: "jump",
      to: "run",
      exit: 23,
      entry: 9,
      leadIn: [107, 108],
    });
    route.leadIn = [88, 107, 108];
    expect(normalized).toEqual(old);
    expect(current.actions).toEqual(old.actions);
    expect(current.sourceSha256).not.toBe(old.sourceSha256);
  });
});
