import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import authored from "../../artwork/kling-mask-workbench/female-neckline-cloth-v1.json";
import {
  validateWardrobeGarmentManifest,
  type WardrobeGarmentManifest,
  type WardrobeRegistration,
} from "./contract";
import {
  availableNecklinePermissionProfile,
  reviewedNecklineAt,
  FEMALE_NECKLINE_PERMISSION_PROFILE,
  FEMALE_NECKLINE_PERMISSION_SHA256,
} from "./neckline-permissions";
import {
  prepareProtection,
  protectedAt,
  protectedClothingAt,
} from "./protection";
import { readWardrobeGarment } from "./project";

const registrationBytes = readFileSync(
  new URL(
    "../../docs/kling-wardrobe/registration/female.json",
    import.meta.url,
  ),
);
const registration = JSON.parse(
  registrationBytes.toString(),
) as WardrobeRegistration;
const registrationSha = createHash("sha256")
  .update(registrationBytes)
  .digest("hex");
const garmentFiles = unzipSync(
  new Uint8Array(
    readFileSync(
      new URL(
        "../../docs/kling-wardrobe/garments/female/plum-pintuck-top-v1.zip",
        import.meta.url,
      ),
    ),
  ),
);
const original = JSON.parse(
  new TextDecoder().decode(garmentFiles["manifest.json"]),
) as WardrobeGarmentManifest;
const candidate = (): WardrobeGarmentManifest => ({
  ...structuredClone(original),
  version: 3,
  id: "plum-reviewed-test",
  necklinePermissionProfile: FEMALE_NECKLINE_PERMISSION_PROFILE,
});
const validate = (value: unknown) =>
  validateWardrobeGarmentManifest(value, registration, registrationSha);
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

describe("source-bound neckline cloth permissions", () => {
  it("round-trips an explicit V3 garment through the existing strict archive loader", async () => {
    const input = zipSync({
      ...garmentFiles,
      "manifest.json": strToU8(JSON.stringify(candidate())),
    });
    const loaded = await readWardrobeGarment(
      input,
      registration,
      registrationSha,
    );
    expect(loaded.manifest).toEqual(validate(candidate()));
    expect(digest(loaded.bytes)).toBe(digest(input));
    for (const [index, page] of loaded.manifest.pages.entries()) {
      expect(digest(loaded.pages[index].patch)).toBe(
        digest(garmentFiles[page.file]),
      );
      expect(digest(loaded.pages[index].ownership)).toBe(
        digest(garmentFiles[page.maskFile]),
      );
    }
  });

  it("binds the six reviewed maps to the actual female source registration", () => {
    const profileBytes = readFileSync(
      new URL(
        "../../artwork/kling-mask-workbench/female-neckline-cloth-v1.json",
        import.meta.url,
      ),
    );
    expect(digest(profileBytes)).toBe(FEMALE_NECKLINE_PERMISSION_SHA256);
    expect(authored.sourceSha256).toBe(registration.sourceSha256);
    expect(authored.registrationSha256).toBe(registrationSha);
    expect(authored.frames.map((frame) => frame.frameId)).toEqual([
      89, 90, 93, 101, 102, 103,
    ]);
    expect(
      availableNecklinePermissionProfile(registration, registrationSha),
    ).toBe(FEMALE_NECKLINE_PERMISSION_PROFILE);
    expect(
      availableNecklinePermissionProfile(
        { ...registration, sourceSha256: "0".repeat(64) },
        registrationSha,
      ),
    ).toBeUndefined();
    expect(
      availableNecklinePermissionProfile(registration, "0".repeat(64)),
    ).toBeUndefined();
  });

  it("releases only reviewed cloth while every old garment keeps its original protection", () => {
    const v3 = validate(candidate());
    for (const frame of authored.frames) {
      const registered = registration.frames.find(
        (f) => f.frameId === frame.frameId,
      )!;
      const rows = prepareProtection(registered.protected);
      let checked = 0;
      for (const { y, x0, x1 } of frame.runs) {
        for (let x = x0; x <= x1; x++) {
          expect(protectedAt(x, rows.get(y))).toBe("head");
          expect(reviewedNecklineAt(v3, frame.frameId, x, y)).toBe(true);
          expect(
            protectedClothingAt(frame.frameId, x, y, rows.get(y), v3),
          ).toBeUndefined();
          expect(
            protectedClothingAt(frame.frameId, x, y, rows.get(y), original),
          ).toBe("head");
          expect(
            reviewedNecklineAt({ ...v3, version: 2 }, frame.frameId, x, y),
          ).toBe(false);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0);
      const { y, x0 } = frame.runs[0];
      expect(reviewedNecklineAt(v3, frame.frameId, x0 - 1, y)).toBe(false);
      expect(reviewedNecklineAt(v3, frame.frameId, x0 + 0.25, y)).toBe(false);
      expect(reviewedNecklineAt(v3, 0, x0, y)).toBe(false);
    }
  });

  it("retains overlapping hand protection regardless of scanline ordering", () => {
    const frame = authored.frames[0],
      run = frame.runs[0];
    const head = { left: run.x0, right: run.x1, label: "head" as const };
    const hand = { ...head, label: "nearHand" as const };
    for (const spans of [
      [head, hand],
      [hand, head],
    ])
      expect(
        protectedClothingAt(frame.frameId, run.x0, run.y, spans, candidate()),
      ).toBe("nearHand");
    expect(
      protectedClothingAt(
        frame.frameId,
        run.x0 - 1,
        run.y,
        [{ ...head, left: run.x0 - 1 }],
        candidate(),
      ),
    ).toBe("head");
  });

  it("requires explicit V3 identity and rejects arbitrary head exceptions", () => {
    expect(validate(candidate()).necklinePermissionProfile).toBe(
      FEMALE_NECKLINE_PERMISSION_PROFILE,
    );
    expect(validate(structuredClone(original))).toEqual(original);
    for (const version of [1, 2])
      expect(() => validate({ ...candidate(), version })).toThrow(/V3/);
    const missing = candidate();
    delete missing.necklinePermissionProfile;
    expect(() => validate(missing)).toThrow(/exact approved/);
    expect(() =>
      validate({
        ...candidate(),
        necklinePermissionProfile: "arbitrary-head-release",
      }),
    ).toThrow(/exact approved/);
    expect(() => validate({ ...candidate(), slot: "bottom" })).toThrow(
      /Only tops/,
    );
    expect(() =>
      validate({ ...candidate(), headProtectionReviews: [] }),
    ).toThrow(/Unexpected/);
    expect(() =>
      validate({
        ...candidate(),
        necklinePermissionProfile: {
          id: FEMALE_NECKLINE_PERMISSION_PROFILE,
          runs: [],
        },
      }),
    ).toThrow(/exact approved/);
    expect(() =>
      validate({
        ...candidate(),
        handProtectionReviews: [
          { frameId: 89, label: "head", polygon: [], reason: "bypass" },
        ],
      }),
    ).toThrow(/Only nearHand/);
  });

  it("fails closed for a mismatched profile, source, registration or clothing slot", () => {
    const frame = authored.frames[0],
      run = frame.runs[0];
    for (const override of [
      { necklinePermissionProfile: "other" },
      { sourceSha256: "0".repeat(64) },
      { registrationSha256: "0".repeat(64) },
      { frameWidth: 352 },
      { slot: "shoes" as const },
    ])
      expect(
        reviewedNecklineAt(
          { ...candidate(), ...override },
          frame.frameId,
          run.x0,
          run.y,
        ),
      ).toBe(false);
  });
});
