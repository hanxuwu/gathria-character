import { expect, it } from "vitest";
import type { BakedCharacterPackManifest } from "../core/types";
import {
  createReviewDocument,
  REVIEW_MAX_BYTES,
  type ReviewBinding,
  type ReviewIssue,
} from "./review-document";
import {
  createReviewTransfer,
  mergeReviewTransfer,
  parseReviewTransfer,
  serializeReviewTransfer,
} from "./review-transfer";

const source: ReviewBinding = {
  sourceSha256: "a".repeat(64),
  registrationSha256: "b".repeat(64),
  lookSha256: "c".repeat(64),
};
const target: ReviewBinding = { ...source, lookSha256: "d".repeat(64) };
const manifest = {
  frames: [{ id: 7 }, { id: 19 }],
  animations: {
    idle: { frames: [7], fps: 24, loop: true },
    run: { frames: [19, 7, 19], fps: 24, loop: true },
  },
} as BakedCharacterPackManifest;
const issue: ReviewIssue = {
  id: "cuff-19",
  action: "run",
  frameId: 19,
  facing: "left",
  region: "hands",
  severity: "blocker",
  status: "resolved",
  note: "Recheck the near cuff at the same source pose.",
};
const review = () => ({
  ...createReviewDocument(source),
  issues: [{ ...issue }],
});

it("explicitly reopens issues while preserving source identity, notes, direction and historical status", () => {
  const old = review(),
    before = structuredClone(old),
    transfer = createReviewTransfer(old, target, manifest);
  expect(transfer.document.binding).toEqual(target);
  expect(transfer.document.issues).toEqual([{ ...issue, status: "open" }]);
  expect(transfer.lineage.issues).toEqual([issue]);
  expect(transfer.lineage.from).toEqual(source);
  expect(transfer.lineage.to).toEqual(target);
  expect(old).toEqual(before);
  transfer.document.issues[0].note = "Changed in new review";
  expect(transfer.lineage.issues[0].note).toBe(issue.note);
  expect(old.issues[0].note).toBe(issue.note);
});

it("round-trips portable lineage and never treats prior resolved status as new approval", () => {
  const transfer = createReviewTransfer(review(), target, manifest);
  const text = serializeReviewTransfer(transfer.lineage, manifest);
  expect(parseReviewTransfer(text, target, manifest)).toEqual(transfer);
  expect(JSON.parse(text).issues[0].status).toBe("resolved");
  expect(
    parseReviewTransfer(text, target, manifest).document.issues[0].status,
  ).toBe("open");
});

it("refuses cross-source, cross-registration, same-look and wrong-target transfers", () => {
  expect(() =>
    createReviewTransfer(
      review(),
      { ...target, sourceSha256: "e".repeat(64) },
      manifest,
    ),
  ).toThrow("same source");
  expect(() =>
    createReviewTransfer(
      review(),
      { ...target, registrationSha256: "e".repeat(64) },
      manifest,
    ),
  ).toThrow("same source");
  expect(() => createReviewTransfer(review(), source, manifest)).toThrow(
    "already the same look",
  );
  const text = serializeReviewTransfer(
    createReviewTransfer(review(), target, manifest).lineage,
    manifest,
  );
  expect(() =>
    parseReviewTransfer(
      text,
      { ...target, lookSha256: "f".repeat(64) },
      manifest,
    ),
  ).toThrow("different target");
});

it("rejects unavailable target poses/actions atomically instead of dropping or remapping issues", () => {
  const old = review();
  expect(() =>
    createReviewTransfer(old, target, {
      ...manifest,
      animations: {
        ...manifest.animations,
        run: { frames: [7], fps: 24, loop: true },
      },
    }),
  ).toThrow();
  expect(() =>
    createReviewTransfer(old, target, {
      ...manifest,
      frames: [{ ...manifest.frames[0] }],
    }),
  ).toThrow();
  expect(old.issues).toEqual([issue]);
});

it("enforces all note limits and rejects untrusted lineage extensions", () => {
  const transfer = createReviewTransfer(review(), target, manifest);
  expect(() => parseReviewTransfer("{".repeat(10), target, manifest)).toThrow(
    "invalid",
  );
  expect(() =>
    parseReviewTransfer(" ".repeat(REVIEW_MAX_BYTES + 1), target, manifest),
  ).toThrow("1 MiB");
  for (const data of [
    { ...transfer.lineage, unexpected: true },
    { ...transfer.lineage, version: 2 },
    { ...transfer.lineage, from: { ...source, unexpected: true } },
    { ...transfer.lineage, issues: [{ ...issue, status: "auto-approved" }] },
  ])
    expect(() =>
      parseReviewTransfer(JSON.stringify(data), target, manifest),
    ).toThrow();
  expect(() =>
    createReviewTransfer(
      {
        ...review(),
        issues: Array.from({ length: 101 }, (_, i) => ({
          ...issue,
          id: `issue-${i}`,
        })),
      },
      target,
      manifest,
    ),
  ).toThrow("100");
  expect(() =>
    createReviewTransfer(
      { ...review(), issues: [{ ...issue, note: "x".repeat(2001) }] },
      target,
      manifest,
    ),
  ).toThrow("2000");
});

it("merges without replacing accepted target notes and rejects collisions atomically", () => {
  const transfer = createReviewTransfer(review(), target, manifest);
  const targetIssue = {
    ...issue,
    id: "existing-other-finding",
    note: "Already reviewed on the target.",
    status: "resolved" as const,
  };
  const current = { ...createReviewDocument(target), issues: [targetIssue] };
  const before = structuredClone(current);
  const merged = mergeReviewTransfer(current, transfer, manifest);
  expect(merged.issues).toEqual([targetIssue, { ...issue, status: "open" }]);
  expect(current).toEqual(before);
  expect(() => mergeReviewTransfer(merged, transfer, manifest)).toThrow(
    "ID collision",
  );
  expect(merged.issues[0].status).toBe("resolved");
  const wrongTarget = {
    ...current,
    binding: { ...target, lookSha256: "f".repeat(64) },
  };
  expect(() => mergeReviewTransfer(wrongTarget, transfer, manifest)).toThrow(
    "different target",
  );
});

it("enforces combined issue count and rebuilds transferred status from lineage", () => {
  const transfer = createReviewTransfer(review(), target, manifest);
  transfer.document.issues[0].status = "resolved";
  const current = createReviewDocument(target);
  expect(
    mergeReviewTransfer(current, transfer, manifest).issues[0].status,
  ).toBe("open");
  current.issues = Array.from({ length: 100 }, (_, i) => ({
    ...issue,
    id: `other-${i}`,
  }));
  expect(() => mergeReviewTransfer(current, transfer, manifest)).toThrow("100");
  expect(current.issues).toHaveLength(100);
});
