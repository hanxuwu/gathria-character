import { describe, expect, it } from "vitest";
import type { AppearanceBankManifest } from "./contract";
import {
  appearanceStyleChoices,
  libraryAppearanceChoices,
  validateAppearanceLibraryBanks,
  validateAppearanceStyleSummaries,
} from "./catalog";

describe("appearance library choices", () => {
  const crop = { id: "soft-crop", name: "Soft crop", slot: "hair" };
  const face = { id: "gentle", name: "Gentle", slot: "face" };
  const male = validateAppearanceStyleSummaries([
    crop,
    face,
    { id: "side-part", name: "Side part", slot: "hair" },
  ]);
  const female = validateAppearanceStyleSummaries([
    crop,
    face,
    { id: "tucked-bun", name: "Tucked bun", slot: "hair" },
  ]);

  it("offers only the selected character's catalog styles before lazy loading", () => {
    expect(
      appearanceStyleChoices(undefined, male).map((style) => style.id),
    ).toEqual(["soft-crop", "gentle", "side-part"]);
    expect(
      appearanceStyleChoices(undefined, female).map((style) => style.id),
    ).toEqual(["soft-crop", "gentle", "tucked-bun"]);
  });

  it("keeps old or custom embedded choices instead of exposing unavailable library styles", () => {
    const bank: Pick<AppearanceBankManifest, "styles"> = {
      styles: [
        { id: "saved-crop", name: "Saved crop", slot: "hair", layers: [] },
      ],
    };
    expect(appearanceStyleChoices(bank, male)).toBe(bank.styles);
    expect(appearanceStyleChoices(bank, female)).toBe(bank.styles);
    expect(appearanceStyleChoices(bank)).toBe(bank.styles);
    expect(appearanceStyleChoices(bank).map((style) => style.id)).toEqual([
      "saved-crop",
    ]);
  });

  it("retains the original choices for older catalogs without style summaries", () => {
    expect(appearanceStyleChoices(undefined).map((style) => style.id)).toEqual([
      "soft-crop",
      "soft-bob",
      "gentle",
    ]);
  });

  it("validates unique IDs, slots and bounded metadata rather than accepting malformed choices", () => {
    for (const invalid of [
      null,
      [],
      Array(9).fill(crop),
      [crop, crop],
      [{ ...crop, id: "../../other" }],
      [{ ...crop, id: "x".repeat(65) }],
      [{ ...crop, name: " " }],
      [{ ...crop, name: "x".repeat(121) }],
      [{ ...crop, slot: "shoes" }],
      [{ ...crop, imageUrl: "unknown.png" }],
    ])
      expect(() => validateAppearanceStyleSummaries(invalid)).toThrow(
        /appearance library/,
      );
    const input = [crop, face];
    const validated = validateAppearanceStyleSummaries(input);
    expect(validated).toEqual(input);
    expect(validated).not.toBe(input);
    expect(validated[0]).not.toBe(input[0]);
  });
});

describe("independently loaded hair banks", () => {
  const base = [
    { id: "old-hair", name: "Old hair", slot: "hair" as const },
    { id: "gentle", name: "Gentle", slot: "face" as const },
  ];
  const library = [
    {
      url: "/new.zip",
      sha256: "b".repeat(64),
      bankId: "new-hair-v1",
      styles: [
        { id: "new-hair", name: "New hair", slot: "hair" as const },
        base[1],
      ],
    },
  ];
  it("offers released styles across banks without duplicating the preserved face", () => {
    for (const hash of [undefined, "a".repeat(64), "b".repeat(64)])
      expect(
        libraryAppearanceChoices(
          undefined,
          hash,
          "a".repeat(64),
          base,
          library,
        ).map((s) => s.id),
      ).toEqual(["old-hair", "gentle", "new-hair"]);
  });
  it("keeps unknown and historical saved banks authoritative", () => {
    const saved = {
      styles: [
        { id: "saved", name: "Saved", slot: "hair" as const, layers: [] },
      ],
    };
    expect(
      libraryAppearanceChoices(saved, "custom", "a".repeat(64), base, library),
    ).toBe(saved.styles);
  });
  it("validates bounded bank IDs, hashes and style metadata", () => {
    expect(validateAppearanceLibraryBanks(library)).toEqual(library);
    for (const bad of [
      null,
      Array(9).fill(library[0]),
      [library[0], library[0]],
      [{ ...library[0], sha256: "missing" }],
      [{ ...library[0], bankId: "../../evil" }],
      [{ ...library[0], styles: [] }],
    ])
      expect(() => validateAppearanceLibraryBanks(bad)).toThrow(
        /appearance library/,
      );
  });
});
