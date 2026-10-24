import { describe, expect, it } from "vitest";
import type { BakedCharacterPackManifest } from "../core/types";
import type { WardrobeProject } from "./contract";
import {
  clearStoredReview,
  createReviewBinding,
  createReviewDocument,
  loadReviewDocument,
  parseReviewDocument,
  REVIEW_MAX_BYTES,
  REVIEW_MAX_ISSUES,
  reviewStorageKey,
  saveReviewDocument,
  serializeReviewDocument,
  withReviewIssue,
  withoutReviewIssue,
  type ReviewBinding,
  type ReviewIssue,
  type ReviewStorage,
} from "./review-document";

const hash = (letter: string) => letter.repeat(64);
const binding: ReviewBinding = {
  sourceSha256: hash("a"),
  registrationSha256: hash("b"),
  lookSha256: hash("c"),
};
const manifest = {
  frames: [{ id: 7 }, { id: 10 }, { id: 20 }],
  animations: {
    idle: { frames: [7, 7], fps: 24, loop: true },
    walk: { frames: [10], fps: 24, loop: true },
    run: { frames: [20, 20], fps: 24, loop: true },
  },
} as BakedCharacterPackManifest;
const issue: ReviewIssue = {
  id: "run-ear-1",
  action: "run",
  frameId: 20,
  facing: "left",
  region: "head",
  severity: "problem",
  status: "open",
  note: "Hair intersects the ear on the near side.",
};
const document = () =>
  withReviewIssue(createReviewDocument(binding), issue, manifest);

function project(): WardrobeProject {
  return {
    document: {
      format: "gathria-wardrobe-project",
      version: 1,
      sourceSha256: hash("a"),
      registrationSha256: hash("b"),
      items: [
        { id: "shirt", sha256: hash("c") },
        { id: "unused", sha256: hash("d") },
      ],
      selection: { top: "shirt", bottom: null, fullBody: null, shoes: null },
      preview: { action: "idle", facing: "right" },
    },
    items: [
      { sha256: hash("c"), manifest: { id: "shirt", slot: "top" } },
      { sha256: hash("d"), manifest: { id: "unused", slot: "shoes" } },
    ],
  } as WardrobeProject;
}

describe("exact-look review identity", () => {
  it("ignores preview, unused inventory and object order but binds selected material revisions", async () => {
    const a = project(),
      b = structuredClone(a);
    b.document.preview = { action: "run", facing: "left" };
    b.document.items.reverse();
    b.items.reverse();
    b.items[0].sha256 = hash("f");
    b.document.items[0].sha256 = hash("f");
    expect(await createReviewBinding(b)).toEqual(await createReviewBinding(a));
    b.items[1].sha256 = hash("e");
    b.document.items[1].sha256 = hash("e");
    expect((await createReviewBinding(b)).lookSha256).not.toBe(
      (await createReviewBinding(a)).lookSha256,
    );
    b.document.registrationSha256 = hash("f");
    expect((await createReviewBinding(b)).registrationSha256).toBe(hash("f"));
  });
  it("binds active appearance bank, style and color but not an unused head bank", async () => {
    const a = project(),
      b = structuredClone(a);
    b.document = {
      ...b.document,
      version: 2,
      appearance: {
        bankSha256: hash("e"),
        hairId: null,
        faceId: null,
        hairColor: "copper",
      },
    };
    expect(await createReviewBinding(b)).toEqual(await createReviewBinding(a));
    b.appearanceBank = {
      sha256: hash("e"),
      manifest: {
        styles: [
          { id: "curls", slot: "hair" },
          { id: "gentle", slot: "face" },
        ],
      },
    } as NonNullable<WardrobeProject["appearanceBank"]>;
    b.document.appearance.hairId = "curls";
    const copper = await createReviewBinding(b);
    b.document.appearance.hairColor = "chestnut";
    expect((await createReviewBinding(b)).lookSha256).not.toBe(
      copper.lookSha256,
    );
    b.document.appearance.faceId = "gentle";
    expect((await createReviewBinding(b)).lookSha256).not.toBe(
      copper.lookSha256,
    );
    b.appearanceBank.sha256 = hash("d");
    await expect(createReviewBinding(b)).rejects.toThrow(
      "exact selected appearance",
    );
  });
  it("refuses unavailable, wrongly slotted and inconsistently hashed selected clothing", async () => {
    const p = project();
    p.document.selection.shoes = "shirt";
    await expect(createReviewBinding(p)).rejects.toThrow("exact validated");
    p.document.selection.shoes = null;
    p.document.items[0].sha256 = hash("f");
    await expect(createReviewBinding(p)).rejects.toThrow("exact validated");
    p.items = [];
    await expect(createReviewBinding(p)).rejects.toThrow("exact validated");
  });
});

describe("bounded review documents", () => {
  it("round trips source pose IDs, facing, issue status and unicode without mutating accepted notes", () => {
    const first = document();
    const updated = withReviewIssue(
      first,
      { ...issue, status: "resolved", note: "耳边修复\nRecheck run." },
      manifest,
    );
    expect(first.issues[0].status).toBe("open");
    expect(
      parseReviewDocument(
        serializeReviewDocument(updated, manifest),
        binding,
        manifest,
      ),
    ).toEqual(updated);
    expect(withoutReviewIssue(updated, issue.id, manifest).issues).toEqual([]);
    expect(updated.issues).toHaveLength(1);
  });
  it("rejects other sources, anchors and exact looks even with the same frame IDs", () => {
    for (const field of [
      "sourceSha256",
      "registrationSha256",
      "lookSha256",
    ] as const) {
      const other = { ...binding, [field]: hash("f") };
      expect(() =>
        parseReviewDocument(
          serializeReviewDocument(document(), manifest),
          other,
          manifest,
        ),
      ).toThrow(/different/);
      expect(reviewStorageKey(other)).not.toBe(reviewStorageKey(binding));
    }
  });
  it.each([
    { frameId: 1 }, // animation list index is not a source frame
    { frameId: 10 }, // known, but belongs to walk
    { action: "jump" }, // unavailable clip
    { frameId: 20.5 },
    { region: "eyes" },
    { severity: "pass" },
    { status: "fixed" },
    { facing: "up" },
    { note: "" },
    { note: "\u0000" },
    { note: "x".repeat(2001) },
    { id: "../../frame" },
  ])("rejects invalid note location or fields: %o", (patch) => {
    const bad = { ...document(), issues: [{ ...issue, ...patch }] };
    expect(() =>
      parseReviewDocument(JSON.stringify(bad), binding, manifest),
    ).toThrow();
  });
  it("rejects unexpected fields, prototype payloads, duplicate IDs, bad schemas and truncation", () => {
    const text = serializeReviewDocument(document(), manifest);
    for (const bad of [
      text.replace('"version": 1', '"version": 2'),
      text.replace('"version": 1', '"__proto__": {}, "version": 1'),
      text.replace('"note":', '"html": "<script>", "note":'),
      text.slice(0, -10),
      JSON.stringify({ ...document(), issues: [issue, issue] }),
    ])
      expect(() => parseReviewDocument(bad, binding, manifest)).toThrow();
    expect(() =>
      serializeReviewDocument(
        Object.assign(Object.create({ polluted: true }), document()),
        manifest,
      ),
    ).toThrow("plain object");
    expect({}).not.toHaveProperty("polluted");
  });
  it("bounds issue count and UTF-8 input before parsing", () => {
    const full = {
      ...document(),
      issues: Array.from({ length: REVIEW_MAX_ISSUES }, (_, i) => ({
        ...issue,
        id: `issue-${i}`,
      })),
    };
    expect(
      parseReviewDocument(
        serializeReviewDocument(full, manifest),
        binding,
        manifest,
      ).issues,
    ).toHaveLength(100);
    expect(() =>
      withReviewIssue(full, { ...issue, id: "overflow" }, manifest),
    ).toThrow("100");
    expect(() =>
      parseReviewDocument(" ".repeat(REVIEW_MAX_BYTES + 1), binding, manifest),
    ).toThrow("1 MiB");
    expect(() =>
      parseReviewDocument("文".repeat(REVIEW_MAX_BYTES / 2), binding, manifest),
    ).toThrow("1 MiB");
  });
});

function memoryStorage(): ReviewStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}
describe("local review persistence", () => {
  it("isolates exact looks, reloads notes, and only clears explicitly", () => {
    const storage = memoryStorage(),
      doc = document();
    expect(loadReviewDocument(binding, manifest, storage)).toEqual({
      ok: true,
      document: null,
    });
    expect(saveReviewDocument(doc, manifest, storage)).toEqual({ ok: true });
    expect(loadReviewDocument(binding, manifest, storage)).toEqual({
      ok: true,
      document: doc,
    });
    expect(
      loadReviewDocument(
        { ...binding, lookSha256: hash("f") },
        manifest,
        storage,
      ),
    ).toEqual({ ok: true, document: null });
    expect(clearStoredReview(binding, storage)).toEqual({ ok: true });
    expect(loadReviewDocument(binding, manifest, storage)).toEqual({
      ok: true,
      document: null,
    });
  });
  it("preserves corrupted prior data and surfaces it instead of overwriting on the next edit", () => {
    const storage = memoryStorage(),
      key = reviewStorageKey(binding);
    storage.setItem(key, "truncated review");
    expect(loadReviewDocument(binding, manifest, storage).ok).toBe(false);
    const result = saveReviewDocument(document(), manifest, storage);
    expect(result.ok).toBe(false);
    expect(storage.getItem(key)).toBe("truncated review");
  });
  it("reports quota and denied access while retaining the accepted in-memory document", () => {
    const doc = document();
    const quota = memoryStorage();
    quota.setItem = () => {
      throw Error("Quota exceeded");
    };
    expect(saveReviewDocument(doc, manifest, quota)).toEqual({
      ok: false,
      error: expect.stringContaining("Quota exceeded"),
    });
    const denied = {
      ...quota,
      getItem: () => {
        throw Error("Access denied");
      },
    };
    expect(loadReviewDocument(binding, manifest, denied)).toEqual({
      ok: false,
      error: expect.stringContaining("Access denied"),
    });
    expect(doc.issues[0]).toEqual(issue);
  });
});
