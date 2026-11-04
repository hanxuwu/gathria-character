import { describe, expect, it } from "vitest";
import frozenV1 from "./test-fixtures/landing-candidate-v1.json";
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

// The frozen metadata comes from real V1 exports. This small parsed contract
// fixture exercises edition selection without duplicating a 14 MiB atlas ZIP.
const manifest = {
  animations: frozenV1.sourceActions,
  frames: Array.from({ length: 109 }, (_, id) => ({ id })),
} as BakedCharacterPackManifest;
const config = { characterId: frozenV1.characterId };
const profile = frozenV1.profile as GameplayMotion;
const effective = gameplayManifest(manifest, profile, config);

describe("frozen landing candidate V1 compatibility", () => {
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

  it("retains the exact published V1 profile and standalone pack metadata", () => {
    expect(editions.editions).toContainEqual({
      profileId: profile.id,
      characterId: frozenV1.characterId,
      sourceSha256: frozenV1.sourceSha256,
      registrationSha256: frozenV1.registrationSha256,
    });
    expect(
      resolveGameplayMotion(manifest, frozenV1.sourceSha256, config),
    ).toEqual(profile);
    expect(gameplayMotionMetadata(profile)).toEqual(frozenV1.profile);
    expect(
      readGameplayMotion(effective, {
        ...config,
        sourceMetadata: {
          gameplayMotion: frozenV1.profile as unknown as JsonValue,
        },
      }),
    ).toEqual(profile);
    expect(
      readGameplayMotion(effective, {
        characterId: "kling-male-side-workspace-v1",
        sourceMetadata: {
          gameplayMotion: frozenV1.profile as unknown as JsonValue,
        },
      }),
    ).toBeNull();
  });

  it.each(frozenV1.checkpoints)(
    "keeps the old paused native$frameId checkpoint and resumes its old profile",
    ({ frameId, preview }) => {
      const document = {
        format: "gathria-wardrobe-project",
        version: 1,
        sourceSha256: frozenV1.sourceSha256,
        registrationSha256: frozenV1.registrationSha256,
        items: [],
        selection: { top: null, bottom: null, shoes: null, fullBody: null },
        preview,
      };
      const project = {
        archive: { manifest, config },
        items: [],
        document,
        registration: {
          characterId: frozenV1.characterId,
          sourceSha256: frozenV1.sourceSha256,
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
      expect(selected.id).toBe("kling-male-side-landing-candidate-v1");
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
        if (other.sourceSha256 === frozenV1.sourceSha256) continue;
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
