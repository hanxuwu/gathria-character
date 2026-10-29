import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type {
  WardrobeProject,
  WardrobeRegistration,
} from "../wardrobe/contract";
import {
  MAX_REVIEW_NOTES,
  readReviewNotes,
  reviewCrop,
  reviewLookKey,
  reviewNoteKey,
  reviewNotesDocument,
  reviewStorageKey,
  storeReviewNote,
  type ReviewNote,
} from "./review";

const scope = { character: "male", sourceSha256: "a".repeat(64) };
const note: ReviewNote = {
  action: "walk",
  frame: 26,
  facing: "right",
  region: "nearHand",
  text: "Old shorts beside wrist",
  lookKey: '{"registrationSha256":"candidate"}',
  updatedAt: "2026-10-29T12:00:00.000Z",
};
const encode = (notes: ReviewNote[]) =>
  JSON.stringify(reviewNotesDocument(scope, notes));

describe("source-scoped side-view review notes", () => {
  it("rejects notes from a different character, source, version or malformed storage", () => {
    expect(readReviewNotes(encode([note]), scope)).toEqual([note]);
    expect(
      readReviewNotes(encode([note]), { ...scope, character: "female" }),
    ).toEqual([]);
    expect(
      readReviewNotes(encode([note]), {
        ...scope,
        sourceSha256: "b".repeat(64),
      }),
    ).toEqual([]);
    expect(
      readReviewNotes(
        encode([note]).replace('"version":1', '"version":2'),
        scope,
      ),
    ).toEqual([]);
    expect(readReviewNotes("{", scope)).toEqual([]);
    expect(readReviewNotes(null, scope)).toEqual([]);
    expect(reviewStorageKey(scope)).not.toEqual(
      reviewStorageKey({ ...scope, character: "female" }),
    );
  });
  it("filters invalid frames, actions, dates, regions and oversized text without losing valid notes", () => {
    const invalid = [
      { frame: -1 },
      { frame: 1.5 },
      { action: "fly" },
      { facing: "front" },
      { region: "__proto__" },
      { text: " " },
      { text: "x".repeat(1001) },
      { updatedAt: "not a date" },
      { lookKey: "x".repeat(8001) },
    ];
    const raw = JSON.stringify(
      reviewNotesDocument(scope, [
        note,
        ...(invalid.map((patch) => ({ ...note, ...patch })) as ReviewNote[]),
      ]),
    );
    expect(readReviewNotes(raw, scope)).toEqual([note]);
  });
  it("updates only the same pose, region, facing and asset snapshot", () => {
    const updated = { ...note, text: "New observation" };
    const otherLook = { ...note, lookKey: '{"registrationSha256":"updated"}' };
    const otherRegion = { ...note, region: "waist" as const };
    const otherFacing = { ...note, facing: "left" as const };
    const stored = storeReviewNote(
      [note, otherLook, otherRegion, otherFacing],
      updated,
    );
    expect(stored).toEqual([updated, otherLook, otherRegion, otherFacing]);
    expect(new Set(stored.map(reviewNoteKey)).size).toBe(4);
  });
  it("deduplicates restored notes and bounds recent records", () => {
    const notes = Array.from({ length: 110 }, (_, frame) => ({
      ...note,
      frame,
    }));
    expect(storeReviewNote(notes, { ...note, frame: 200 })).toHaveLength(
      MAX_REVIEW_NOTES,
    );
    expect(readReviewNotes(encode([note, note, ...notes]), scope)).toHaveLength(
      MAX_REVIEW_NOTES,
    );
    expect(readReviewNotes("x".repeat(1_500_001), scope)).toEqual([]);
  });
  it("captures active garment hashes and appearance version, ignoring unselected inventory order", () => {
    const document = {
      registrationSha256: "r1",
      selection: { top: "shirt", bottom: null, shoes: null, fullBody: null },
      items: [
        { id: "unused", sha256: "u1" },
        { id: "shirt", sha256: "s1" },
      ],
      appearance: {
        bankSha256: "h1",
        hairId: "crop",
        hairColor: "copper",
        faceId: null,
      },
    };
    const project = { document } as unknown as WardrobeProject;
    const first = reviewLookKey(project);
    expect(JSON.parse(first).items).toEqual([{ id: "shirt", sha256: "s1" }]);
    expect(JSON.parse(first).appearance.hairColor).toBe("copper");
    expect(
      reviewLookKey({
        document: { ...document, items: [...document.items].reverse() },
      } as unknown as WardrobeProject),
    ).toBe(first);
    expect(
      reviewLookKey({
        document: { ...document, registrationSha256: "r2" },
      } as unknown as WardrobeProject),
    ).not.toBe(first);
    expect(
      reviewLookKey({
        document: {
          ...document,
          appearance: { ...document.appearance, bankSha256: "h2" },
        },
      } as unknown as WardrobeProject),
    ).not.toBe(first);
  });
});

describe("native inspection crops", () => {
  const registration = JSON.parse(
    readFileSync(
      "artwork/kling-side-expansion/templates/male.registration.json",
      "utf8",
    ),
  ) as WardrobeRegistration;
  it("keeps all real action crop coordinates integer and inside the native source", () => {
    for (const frame of registration.frames)
      for (const region of [
        "head",
        "nearHand",
        "farHand",
        "waist",
        "knee",
        "ankle",
      ] as const) {
        const crop = reviewCrop(
          frame,
          region,
          registration.frameWidth,
          registration.frameHeight,
        );
        expect(Object.values(crop).every(Number.isInteger)).toBe(true);
        expect(crop.x).toBeGreaterThanOrEqual(0);
        expect(crop.y).toBeGreaterThanOrEqual(0);
        expect(crop.x + crop.width).toBeLessThanOrEqual(
          registration.frameWidth,
        );
        expect(crop.y + crop.height).toBeLessThanOrEqual(
          registration.frameHeight,
        );
      }
  });
  it("centers the known hand defect without rescaling source geometry and handles smaller frames", () => {
    const frame = registration.frames.find((entry) => entry.frameId === 26)!;
    const crop = reviewCrop(frame, "nearHand", 512, 768);
    expect(crop.x).toBeLessThan(209);
    expect(crop.x + crop.width).toBeGreaterThan(215);
    expect(crop.y).toBeLessThan(552);
    expect(crop.y + crop.height).toBeGreaterThan(573);
    expect(reviewCrop(frame, "head", 100, 80)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
  });
});
