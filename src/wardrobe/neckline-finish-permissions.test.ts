import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import authored from "../../artwork/wardrobe-finish/female/neckline-profiles-v2.json";
import old from "../../artwork/kling-mask-workbench/female-neckline-cloth-v1.json";
import {
  assertNecklinePermissionProfile,
  availableNecklinePermissionProfile,
  FINISH_NECKLINE_PERMISSION_SHA256,
  necklinePermissionProfileSha256,
  reviewedNecklineAt,
} from "./neckline-permissions";
import type { WardrobeGarmentManifest, WardrobeRegistration } from "./contract";
import {
  prepareProtection,
  protectedAt,
  protectedClothingAt,
} from "./protection";

const read = (path: string) =>
  new Uint8Array(readFileSync(new URL("../../" + path, import.meta.url)));
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const registrations = [
  "docs/kling-wardrobe/registration/female.json",
  "docs/dual-tailored/assets/female/original-tailored-v1.registration.json",
];
const has = (frameId: number, x: number, y: number) =>
  old.frames
    .find((f) => f.frameId === frameId)
    ?.runs.some((r) => r.y === y && r.x0 <= x && x <= r.x1) ?? false;

describe("immutable neckline finish revisions", () => {
  it("pins the new review independently and retains the old source permission file", () => {
    expect(
      sha(read("artwork/wardrobe-finish/female/neckline-profiles-v2.json")),
    ).toBe(FINISH_NECKLINE_PERMISSION_SHA256);
    expect(
      sha(read("artwork/kling-mask-workbench/female-neckline-cloth-v1.json")),
    ).toBe("9a24590ab1434480c822a577379de7d92479ee1871e44e11d688ab9ef1d5185c");
    expect(authored.profiles[0].frames).toEqual(authored.profiles[1].frames);
  });
  for (const [index, profile] of authored.profiles.entries()) {
    it(`${profile.id}: a saved V1 garment never inherits the new edge permissions`, () => {
      const bytes = read(registrations[index]);
      const registration = JSON.parse(
        new TextDecoder().decode(bytes),
      ) as WardrobeRegistration;
      const oldId =
        index === 0
          ? "female-neckline-cloth-v1"
          : "female-original-tailored-neckline-cloth-v1";
      expect(availableNecklinePermissionProfile(registration, sha(bytes))).toBe(
        oldId,
      );
      expect(
        assertNecklinePermissionProfile(profile.id, registration, sha(bytes)),
      ).toBe(profile.id);
      expect(
        assertNecklinePermissionProfile(oldId, registration, sha(bytes)),
      ).toBe(oldId);
      expect(necklinePermissionProfileSha256(profile.id)).toBe(
        FINISH_NECKLINE_PERMISSION_SHA256,
      );
      const item = {
        version: 3,
        slot: "top",
        sourceSha256: profile.sourceSha256,
        registrationSha256: profile.registrationSha256,
        frameWidth: 704,
        frameHeight: 1056,
        necklinePermissionProfile: profile.id,
      } as WardrobeGarmentManifest;
      let additional = 0;
      for (const frame of profile.frames) {
        const rows = prepareProtection(
          registration.frames.find((f) => f.frameId === frame.frameId)!
            .protected,
        );
        for (const run of frame.runs)
          for (let x = run.x0; x <= run.x1; x++) {
            expect(protectedAt(x, rows.get(run.y))).toBe("head");
            expect(reviewedNecklineAt(item, frame.frameId, x, run.y)).toBe(
              true,
            );
            expect(
              protectedClothingAt(
                frame.frameId,
                x,
                run.y,
                rows.get(run.y),
                item,
              ),
            ).toBeUndefined();
            if (!has(frame.frameId, x, run.y)) {
              additional++;
              expect(
                reviewedNecklineAt(
                  { ...item, necklinePermissionProfile: oldId },
                  frame.frameId,
                  x,
                  run.y,
                ),
              ).toBe(false);
              expect(
                protectedClothingAt(frame.frameId, x, run.y, rows.get(run.y), {
                  ...item,
                  necklinePermissionProfile: oldId,
                }),
              ).toBe("head");
            }
          }
      }
      expect(additional).toBe(318);
      expect(reviewedNecklineAt(item, 103, 385, 610)).toBe(false); // real warm neck skin
      expect(reviewedNecklineAt(item, 0, 400, 400)).toBe(false); // face/unreviewed pose
      expect(() =>
        assertNecklinePermissionProfile(
          profile.id,
          { ...registration, sourceSha256: "0".repeat(64) },
          sha(bytes),
        ),
      ).toThrow(/exact approved/);
      expect(() =>
        assertNecklinePermissionProfile(
          profile.id,
          registration,
          "0".repeat(64),
        ),
      ).toThrow(/exact approved/);
      expect(
        reviewedNecklineAt({ ...item, slot: "bottom" }, 103, 428, 596),
      ).toBe(false);
    });
  }
});
