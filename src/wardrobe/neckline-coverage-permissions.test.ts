import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import authored from "../../artwork/wardrobe-coverage/neckline-profiles-v1.json";
import old from "../../artwork/kling-mask-workbench/female-neckline-cloth-v1.json";
import {
  availableNecklinePermissionProfile,
  reviewedNecklineAt,
  COVERAGE_NECKLINE_PERMISSION_SHA256,
  assertNecklinePermissionProfile,
  necklinePermissionProfileSha256,
  FEMALE_NECKLINE_PERMISSION_PROFILE,
  FEMALE_NECKLINE_PERMISSION_SHA256,
} from "./neckline-permissions";
import {
  prepareProtection,
  protectedAt,
  protectedClothingAt,
} from "./protection";
import {
  validateWardrobeGarmentManifest,
  type WardrobeGarmentManifest,
  type WardrobeRegistration,
} from "./contract";

const cases = [
  {
    id: "female-original-tailored-neckline-cloth-v1",
    registration:
      "docs/dual-tailored/assets/female/original-tailored-v1.registration.json",
    garment:
      "docs/dual-tailored/assets/female/dual-tailored-female-original-sea-top-v1.garment.zip",
  },
  {
    id: "female-side-tailored-neckline-cloth-v1",
    registration:
      "artwork/kling-side-expansion/templates/female.registration.json",
    garment: "docs/kling-side-expansion/assets/female-blouse.garment.zip",
  },
  {
    id: "female-side-polished-neckline-cloth-v1",
    registration: "artwork/paired-polish/female-side.registration.json",
    garment:
      "docs/paired-polish/assets/female/polished-female-side-sea-top-bound-v1.garment.zip",
  },
];
const read = (path: string) =>
  new Uint8Array(readFileSync(new URL("../../" + path, import.meta.url)));
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const parse = (bytes: Uint8Array) =>
  JSON.parse(new TextDecoder().decode(bytes));

describe("additional exact-source neckline cloth reviews", () => {
  it("records the correct immutable file hash for both legacy and new export profiles", () => {
    expect(
      necklinePermissionProfileSha256(FEMALE_NECKLINE_PERMISSION_PROFILE),
    ).toBe(FEMALE_NECKLINE_PERMISSION_SHA256);
    for (const profile of authored.profiles)
      expect(necklinePermissionProfileSha256(profile.id)).toBe(
        sha(read("artwork/wardrobe-coverage/neckline-profiles-v1.json")),
      );
    expect(() => necklinePermissionProfileSha256("unknown-profile")).toThrow(
      /Unknown neckline/,
    );
  });

  it("pins the reviewed maps and preserves the prior source cloth geometry", () => {
    expect(
      sha(read("artwork/wardrobe-coverage/neckline-profiles-v1.json")),
    ).toBe(COVERAGE_NECKLINE_PERMISSION_SHA256);
    expect(authored.profiles[0].frames).toEqual(old.frames);
    expect(authored.profiles[1].frames).toEqual(authored.profiles[2].frames);
    expect(new Set(authored.profiles.map((p) => p.id)).size).toBe(3);
  });
  for (const entry of cases) {
    it(`${entry.id}: replaces only approved cloth, preserving neighboring head and all hands`, () => {
      const profile = authored.profiles.find((p) => p.id === entry.id)!;
      const bytes = read(entry.registration),
        registration = parse(bytes) as WardrobeRegistration;
      const legacy = parse(
        unzipSync(read(entry.garment))["manifest.json"],
      ) as WardrobeGarmentManifest;
      legacy.version = 1;
      delete legacy.handProtectionReviews;
      delete legacy.necklinePermissionProfile;
      const garment = validateWardrobeGarmentManifest(
        { ...legacy, version: 3, necklinePermissionProfile: entry.id },
        registration,
        sha(bytes),
      );
      expect(availableNecklinePermissionProfile(registration, sha(bytes))).toBe(
        entry.id,
      );
      expect(registration.sourceSha256).toBe(profile.sourceSha256);
      expect(sha(bytes)).toBe(profile.registrationSha256);
      let count = 0;
      for (const frame of profile.frames) {
        const registered = registration.frames.find(
          (f) => f.frameId === frame.frameId,
        )!;
        const rows = prepareProtection(registered.protected);
        for (const run of frame.runs) {
          for (let x = run.x0; x <= run.x1; x++) {
            expect(protectedAt(x, rows.get(run.y))).toBe("head");
            expect(
              protectedClothingAt(
                frame.frameId,
                x,
                run.y,
                rows.get(run.y),
                garment,
              ),
            ).toBeUndefined();
            expect(
              protectedClothingAt(
                frame.frameId,
                x,
                run.y,
                rows.get(run.y),
                legacy,
              ),
            ).toBe("head");
            expect(
              protectedClothingAt(
                frame.frameId,
                x,
                run.y,
                [
                  { left: x, right: x, label: "head" },
                  { left: x, right: x, label: "nearHand" },
                ],
                garment,
              ),
            ).toBe("nearHand");
            count++;
          }
        }
        const first = frame.runs[0];
        expect(
          reviewedNecklineAt(garment, frame.frameId, first.x0 - 1, first.y),
        ).toBe(false);
        expect(
          reviewedNecklineAt(garment, frame.frameId, first.x0, first.y - 1),
        ).toBe(false);
      }
      expect(count).toBeGreaterThan(1000);
      for (const other of authored.profiles.filter((p) => p.id !== entry.id))
        expect(() =>
          assertNecklinePermissionProfile(other.id, registration, sha(bytes)),
        ).toThrow(/exact approved/);
      for (const altered of [
        { ...registration, sourceSha256: "0".repeat(64) },
        { ...registration, frameWidth: registration.frameWidth / 2 },
      ])
        expect(
          availableNecklinePermissionProfile(altered, sha(bytes)),
        ).toBeUndefined();
      expect(
        availableNecklinePermissionProfile(registration, "0".repeat(64)),
      ).toBeUndefined();
      const f = profile.frames[0],
        r = f.runs[0];
      for (const override of [
        { version: 1 as const },
        { version: 2 as const },
        { slot: "bottom" as const },
        { slot: "shoes" as const },
        { registrationSha256: "0".repeat(64) },
        { sourceSha256: "0".repeat(64) },
      ])
        expect(
          reviewedNecklineAt({ ...garment, ...override }, f.frameId, r.x0, r.y),
        ).toBe(false);
    });
  }
});
