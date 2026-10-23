import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import * as garmentPages from "../wardrobe/garment-pages";
import {
  WARDROBE_ANCHORS,
  type WardrobeRegistration,
} from "../wardrobe/contract";
import { readAppearanceBank } from "./bank";
import {
  appearanceIsActive,
  validateAppearanceBankManifest,
  validateAppearanceSelection,
} from "./contract";
import { appearanceFixture } from "./fixture.test-support";

const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const registration: WardrobeRegistration = {
  format: "gathria-wardrobe-registration",
  version: 1,
  sourceSha256: "a".repeat(64),
  characterId: "head-test",
  frameWidth: 8,
  frameHeight: 8,
  anchor: { x: 4, y: 7 },
  frames: [7, 19].map((frameId) => ({
    frameId,
    sourceFrame: 100 + frameId,
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
          { x: 1, y: 0 },
          { x: 6, y: 0 },
          { x: 6, y: 3 },
          { x: 1, y: 3 },
        ],
      },
    ],
  })),
};
const registrationSha256 = hash(strToU8(JSON.stringify(registration)));
const fixture = () => appearanceFixture(registration, registrationSha256);
const read = (bytes: Uint8Array) =>
  readAppearanceBank(bytes, registration, registrationSha256);
const edit = (
  change: (manifest: ReturnType<typeof fixture>["manifest"]) => void,
) => {
  const f = fixture();
  change(f.manifest);
  return zipSync({
    ...f.files,
    "manifest.json": strToU8(JSON.stringify(f.manifest)),
  });
};

describe("source-bound head appearance banks", () => {
  it("validates every style and pose, including explicit source blinks and negative padded offsets", async () => {
    const f = fixture(),
      bank = await read(f.bytes);
    expect(bank.sha256).toBe(hash(f.bytes));
    expect(bank.manifest).toEqual(f.manifest);
    expect(bank.manifest.styles[1].layers[0].frames[1]).toEqual({
      frameId: 19,
      mode: "source",
      reason: "Original blink or laugh retained",
    });
    expect(bank.pages[0].patch).toEqual(f.files["patches-0.png"]);
    expect(
      validateAppearanceSelection(
        {
          bankSha256: bank.sha256,
          hairId: "soft-crop",
          faceId: "gentle",
          hairColor: "copper",
        },
        bank,
      ),
    ).toMatchObject({ hairColor: "copper" });
    expect(
      appearanceIsActive({ hairId: null, faceId: null, hairColor: "copper" }),
    ).toBe(false);
  });
  it.each([
    "sourceSha256",
    "registrationSha256",
    "characterId",
    "frameWidth",
  ] as const)("rejects a mismatched %s", async (key) => {
    const bytes = edit((m) => {
      if (key === "frameWidth") m[key] = 9;
      else m[key] = "b".repeat(64);
    });
    await expect(read(bytes)).rejects.toThrow(/mismatch|does not match/);
  });
  it("rejects incomplete styles and pose registration independently of current selection", async () => {
    await expect(
      read(
        edit((m) => {
          m.styles[1].layers[0].frames.pop();
        }),
      ),
    ).rejects.toThrow(/frames/);
    await expect(
      read(
        edit((m) => {
          m.poses[1] = m.poses[0];
        }),
      ),
    ).rejects.toThrow(/exactly once/);
    await expect(
      read(
        edit((m) => {
          m.poses[1].sourceFrame++;
        }),
      ),
    ).rejects.toThrow(/source frame/);
    await expect(
      read(
        edit((m) => {
          m.styles[1].layers[0].role = "hair-front";
        }),
      ),
    ).rejects.toThrow(/layer roles/);
    await expect(
      read(
        edit((m) => {
          m.styles[1].layers[0].frames[1] = {
            frameId: 19,
            mode: "source",
            reason: "",
          };
        }),
      ),
    ).rejects.toThrow(/nonempty/);
  });
  it("cannot claim body pixels by redefining the registered head", async () => {
    await expect(
      read(
        edit((m) => {
          m.poses[0].headBounds = { x: 0, y: 0, width: 8, height: 8 };
        }),
      ),
    ).rejects.toThrow(/immutable source head/);
  });
  it("accepts explicit hair-only fringe bounds and rejects lower-body expansion", async () => {
    const extended = await read(
      edit((m) => {
        m.poses[0].hairOcclusionBounds = { x: 0, y: 0, width: 8, height: 3 };
      }),
    );
    expect(extended.manifest.poses[0].headBounds).toEqual(
      fixture().manifest.poses[0].headBounds,
    );
    expect(extended.manifest.poses[0].hairOcclusionBounds).toEqual({
      x: 0,
      y: 0,
      width: 8,
      height: 3,
    });
    await expect(
      read(
        edit((m) => {
          m.poses[0].hairOcclusionBounds = { x: 0, y: 0, width: 8, height: 4 };
        }),
      ),
    ).rejects.toThrow(/only the top and sides/);
    await expect(
      read(
        edit((m) => {
          m.poses[0].hairOcclusionBounds = { x: 2, y: 0, width: 4, height: 3 };
        }),
      ),
    ).rejects.toThrow(/only the top and sides/);
    const large = structuredClone(registration);
    large.frameWidth = 30;
    const f = appearanceFixture(large, registrationSha256);
    f.manifest.poses[0].hairOcclusionBounds = {
      x: 0,
      y: 0,
      width: 20,
      height: 3,
    };
    expect(() =>
      validateAppearanceBankManifest(f.manifest, large, registrationSha256),
    ).toThrow(/only the top and sides/);
  });
  it("checks actual owned pixels against head regions before accepting any style", async () => {
    await expect(
      read(
        edit((m) => {
          const frame = m.styles[1].layers[0].frames[0];
          if (frame.mode === "paint") frame.offset.x = 0;
        }),
      ),
    ).rejects.toThrow(/ownership exceeds/);
    await expect(
      read(
        edit((m) => {
          m.poses[0].hairBounds = { x: 1, y: 0, width: 5, height: 3 };
        }),
      ),
    ).rejects.toThrow(/ownership exceeds/);
    await expect(
      read(
        edit((m) => {
          const frame = m.styles[0].layers[0].frames[0];
          if (frame.mode === "paint") frame.offset.y = -3;
        }),
      ),
    ).rejects.toThrow(/bounds/);
  });
  it("rejects binary-mask violations, painted unowned pixels and malformed PNG streams", async () => {
    const f = fixture();
    f.ownership[3] = 128;
    await expect(
      read(zipSync({ ...f.files, "ownership-0.png": f.png(f.ownership) })),
    ).rejects.toThrow(/binary|0 or 255/);
    f.ownership[3] = 0;
    await expect(
      read(zipSync({ ...f.files, "ownership-0.png": f.png(f.ownership) })),
    ).rejects.toThrow(/outside|unowned/);
    const truncated = f.files["patches-0.png"].slice(0, 36);
    await expect(
      read(zipSync({ ...f.files, "patches-0.png": truncated })),
    ).rejects.toThrow();
  });
  it("rejects undeclared files and excessive geometry without decoding unbounded PNGs", async () => {
    const f = fixture();
    await expect(
      read(zipSync({ ...f.files, "secret.json": strToU8("{}") })),
    ).rejects.toThrow(/unexpected|unsupported|not allowed/i);
    await expect(
      read(
        edit((m) => {
          m.padding.top = 129;
        }),
      ),
    ).rejects.toThrow(/bounds/);
    expect(() =>
      validateAppearanceBankManifest(
        {
          ...f.manifest,
          pages: Array.from({ length: 8 }, (_, i) => ({
            file: `patches-${i}.png`,
            maskFile: `ownership-${i}.png`,
            width: 8192,
            height: 8192,
          })),
        },
        registration,
        registrationSha256,
      ),
    ).toThrow(/pixel budget/);
  });
  it("isolates validated caches from caller-owned ZIP, PNG, and manifest mutations", async () => {
    const f = fixture(),
      bank = await read(f.bytes);
    bank.bytes.fill(0);
    bank.pages[0].patch.fill(0);
    bank.manifest.poses[0].facePolygon[0].x = -99;
    const restored = await read(f.bytes);
    expect(restored.manifest).toEqual(f.manifest);
    expect(restored.pages[0].patch).toEqual(f.files["patches-0.png"]);
    await expect(read(bank.bytes)).rejects.toThrow();
  });
  it("reuses completed byte validation without decoding the whole bank again, but rejects changed PNG bytes", async () => {
    const f = fixture();
    f.manifest.provenance += " Validation cache regression.";
    const files = {
      ...f.files,
      "manifest.json": strToU8(JSON.stringify(f.manifest)),
    };
    const bytes = zipSync(files);
    const validate = vi.spyOn(garmentPages, "validateGarmentPage");
    const decode = vi.spyOn(garmentPages, "decodedGarmentPage");
    try {
      const first = await read(bytes);
      expect(validate).toHaveBeenCalledTimes(f.manifest.pages.length);
      expect(decode.mock.calls.length).toBeGreaterThan(0);
      validate.mockClear();
      decode.mockClear();
      const repeated = await read(bytes);
      expect(validate).not.toHaveBeenCalled();
      expect(decode).not.toHaveBeenCalled();
      expect(repeated.sha256).toBe(first.sha256);
      expect(repeated.manifest).toEqual(first.manifest);
      expect(repeated.pages[0].patch).not.toBe(first.pages[0].patch);
      // The outer ZIP remains valid, and its PNG keeps the same dimensions.
      // A changed PNG checksum must miss the content cache and fail validation.
      const corrupted = new Uint8Array(files["patches-0.png"]);
      corrupted[corrupted.length - 1] ^= 1;
      await expect(
        read(zipSync({ ...files, "patches-0.png": corrupted })),
      ).rejects.toThrow();
      expect(validate).toHaveBeenCalledTimes(1);
      await expect(
        readAppearanceBank(bytes, registration, "0".repeat(64)),
      ).rejects.toThrow(/mismatch/);
    } finally {
      validate.mockRestore();
      decode.mockRestore();
    }
  });
  it("does not promote an aborted full validation into a completed-bank cache hit", async () => {
    const f = fixture();
    f.manifest.provenance += " Aborted validation regression.";
    const bytes = zipSync({
      ...f.files,
      "manifest.json": strToU8(JSON.stringify(f.manifest)),
    });
    const controller = new AbortController();
    const original = garmentPages.validateGarmentPage;
    const validate = vi
      .spyOn(garmentPages, "validateGarmentPage")
      .mockImplementationOnce(async (...args) => {
        await original(...args);
        controller.abort();
      });
    try {
      await expect(
        readAppearanceBank(bytes, registration, registrationSha256, {
          signal: controller.signal,
        }),
      ).rejects.toThrow(/cancel|abort/i);
      validate.mockClear();
      await read(bytes);
      expect(validate).toHaveBeenCalledTimes(f.manifest.pages.length);
    } finally {
      validate.mockRestore();
    }
  });
  it("rejects wrong-slot selections, checksum changes, missing fields and cancellation", async () => {
    const bank = await read(fixture().bytes),
      selection = {
        bankSha256: bank.sha256,
        hairId: "soft-crop",
        faceId: "gentle",
        hairColor: "chestnut",
      };
    expect(() =>
      validateAppearanceSelection({ ...selection, hairId: "gentle" }, bank),
    ).toThrow(/compatible/);
    expect(() =>
      validateAppearanceSelection(
        { ...selection, bankSha256: "0".repeat(64) },
        bank,
      ),
    ).toThrow(/checksum/);
    expect(() =>
      validateAppearanceSelection({ ...selection, hairColor: "blue" }, bank),
    ).toThrow(/hair color/);
    expect(() =>
      validateAppearanceSelection({ ...selection, faceId: undefined }, bank),
    ).toThrow(/compatible/);
    const controller = new AbortController();
    controller.abort();
    await expect(
      readAppearanceBank(fixture().bytes, registration, registrationSha256, {
        signal: controller.signal,
      }),
    ).rejects.toThrow(/cancel|abort/i);
  });
});
