import { sha256 } from "../core/sha256";
import type {
  BakedCharacterPackManifest,
  Facing,
  PortableAnimationName,
} from "../core/types";
import { WARDROBE_SLOTS, type WardrobeProject } from "./contract";

export const REVIEW_REGIONS = [
  "full",
  "head",
  "shoulders",
  "waist",
  "hands",
  "feet",
] as const;
export const REVIEW_SEVERITIES = ["note", "problem", "blocker"] as const;
export const REVIEW_STATUSES = ["open", "resolved"] as const;
export const REVIEW_MAX_ISSUES = 100;
export const REVIEW_MAX_BYTES = 1024 * 1024;
export const REVIEW_MAX_NOTE_LENGTH = 2000;

export interface ReviewBinding {
  sourceSha256: string;
  registrationSha256: string;
  lookSha256: string;
}
export interface ReviewIssue {
  id: string;
  action: PortableAnimationName;
  /** Original source pose ID, never an animation list index. */
  frameId: number;
  facing: Facing;
  region: (typeof REVIEW_REGIONS)[number];
  severity: (typeof REVIEW_SEVERITIES)[number];
  status: (typeof REVIEW_STATUSES)[number];
  note: string;
}
export interface ReviewDocument {
  format: "gathria-look-review";
  version: 1;
  binding: ReviewBinding;
  issues: ReviewIssue[];
}

type ReviewManifest = Pick<BakedCharacterPackManifest, "frames" | "animations">;
export type ReviewStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ReviewStorageResult = { ok: true } | { ok: false; error: string };
export type ReviewLoadResult =
  | { ok: true; document: ReviewDocument | null }
  | { ok: false; error: string };

const ACTIONS = ["idle", "walk", "run", "jump", "celebrate"] as const;
function record(value: unknown, label: string, keys: readonly string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error(`${label} must be a plain object.`);
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== keys.length ||
    Object.keys(row).some((key) => !keys.includes(key))
  )
    throw Error(`${label} contains missing or unexpected fields.`);
  return row;
}
function hash(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw Error(`${label} must be a SHA-256 fingerprint.`);
  return value;
}
function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(value)
  )
    throw Error(
      "Review identifiers must contain 1–96 letters, numbers, dots, underscores or hyphens.",
    );
  return value;
}
function option<T extends string>(
  value: unknown,
  options: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !options.includes(value as T))
    throw Error(`Unsupported review ${label}.`);
  return value as T;
}
function bindingValue(value: unknown): ReviewBinding {
  const b = record(value, "Review binding", [
    "sourceSha256",
    "registrationSha256",
    "lookSha256",
  ]);
  return {
    sourceSha256: hash(b.sourceSha256, "Review source"),
    registrationSha256: hash(b.registrationSha256, "Review registration"),
    lookSha256: hash(b.lookSha256, "Review look"),
  };
}

/** Hash only rendered choices, not preview state or unused inventory. Material
 * revisions remain distinguishable even when an imported item reuses an ID.
 * The compositor validates asset bytes before the editor creates this binding. */
export async function createReviewBinding(
  project: WardrobeProject,
): Promise<ReviewBinding> {
  const sourceSha256 = hash(project.document.sourceSha256, "Review source");
  const registrationSha256 = hash(
    project.document.registrationSha256,
    "Review registration",
  );
  const clothing = WARDROBE_SLOTS.map((slot) => {
    const selected = project.document.selection[slot];
    if (selected === null) return [slot, null];
    identifier(selected);
    const matches = project.items.filter(
      (item) => item.manifest.id === selected,
    );
    const declared = project.document.items.filter(
      (item) => item.id === selected,
    );
    if (
      matches.length !== 1 ||
      matches[0].manifest.slot !== slot ||
      declared.length !== 1 ||
      declared[0].sha256 !== matches[0].sha256
    )
      throw Error(
        "The review needs the exact validated selected clothing assets.",
      );
    return [slot, selected, hash(matches[0].sha256, "Review clothing")];
  });
  const chosen =
    project.document.version === 2 ? project.document.appearance : undefined;
  let appearance: unknown = null;
  if (chosen && (chosen.hairId !== null || chosen.faceId !== null)) {
    if (
      !project.appearanceBank ||
      project.appearanceBank.sha256 !== chosen.bankSha256
    )
      throw Error("The review needs the exact selected appearance bank.");
    for (const [slot, id] of [
      ["hair", chosen.hairId],
      ["face", chosen.faceId],
    ] as const) {
      if (
        id !== null &&
        !project.appearanceBank.manifest.styles.some(
          (style) => style.id === id && style.slot === slot,
        )
      )
        throw Error("The review appearance choice is unavailable.");
    }
    appearance = {
      bankSha256: hash(chosen.bankSha256, "Review appearance"),
      hairId: chosen.hairId,
      faceId: chosen.faceId,
      hairColor: chosen.hairId === null ? null : chosen.hairColor,
    };
  }
  const lookSha256 = await sha256(
    new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        sourceSha256,
        registrationSha256,
        clothing,
        appearance,
      }),
    ),
  );
  return { sourceSha256, registrationSha256, lookSha256 };
}

export function createReviewDocument(binding: ReviewBinding): ReviewDocument {
  return {
    format: "gathria-look-review",
    version: 1,
    binding: bindingValue(binding),
    issues: [],
  };
}

function validateDocument(
  value: unknown,
  expected: ReviewBinding,
  manifest: ReviewManifest,
): ReviewDocument {
  const data = record(value, "Review document", [
    "format",
    "version",
    "binding",
    "issues",
  ]);
  if (data.format !== "gathria-look-review" || data.version !== 1)
    throw Error("Choose a supported Gathria look review V1 document.");
  const binding = bindingValue(data.binding);
  const wanted = bindingValue(expected);
  if (
    binding.sourceSha256 !== wanted.sourceSha256 ||
    binding.registrationSha256 !== wanted.registrationSha256
  )
    throw Error(
      "This review belongs to a different character source or anchor registration.",
    );
  if (binding.lookSha256 !== wanted.lookSha256)
    throw Error(
      "This review belongs to a different clothing or appearance revision. Restore its exact look first.",
    );
  if (!Array.isArray(data.issues) || data.issues.length > REVIEW_MAX_ISSUES)
    throw Error(`A review supports at most ${REVIEW_MAX_ISSUES} issues.`);
  const known = new Set(manifest.frames.map((frame) => frame.id));
  const ids = new Set<string>();
  const issues = data.issues.map((value): ReviewIssue => {
    const row = record(value, "Review issue", [
      "id",
      "action",
      "frameId",
      "facing",
      "region",
      "severity",
      "status",
      "note",
    ]);
    const id = identifier(row.id);
    if (ids.has(id)) throw Error("Review issue IDs must be unique.");
    ids.add(id);
    const action = option(row.action, ACTIONS, "action");
    if (
      typeof row.frameId !== "number" ||
      !Number.isSafeInteger(row.frameId) ||
      !known.has(row.frameId) ||
      !manifest.animations[action]?.frames.includes(row.frameId)
    )
      throw Error("The review pose must exist in its recorded source action.");
    if (
      typeof row.note !== "string" ||
      !row.note.trim() ||
      row.note.length > REVIEW_MAX_NOTE_LENGTH ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(row.note)
    )
      throw Error(
        `Review notes need nonempty text of at most ${REVIEW_MAX_NOTE_LENGTH} characters without control codes.`,
      );
    return {
      id,
      action,
      frameId: row.frameId,
      facing: option(row.facing, ["left", "right"], "facing"),
      region: option(row.region, REVIEW_REGIONS, "region"),
      severity: option(row.severity, REVIEW_SEVERITIES, "severity"),
      status: option(row.status, REVIEW_STATUSES, "status"),
      note: row.note,
    };
  });
  return { format: "gathria-look-review", version: 1, binding, issues };
}

export function parseReviewDocument(
  text: string,
  binding: ReviewBinding,
  manifest: ReviewManifest,
): ReviewDocument {
  if (
    typeof text !== "string" ||
    text.length > REVIEW_MAX_BYTES ||
    new TextEncoder().encode(text).byteLength > REVIEW_MAX_BYTES
  )
    throw Error("Review JSON exceeds the 1 MiB import limit.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error(
      "The review JSON is incomplete or invalid. Your current notes are unchanged.",
    );
  }
  return validateDocument(value, binding, manifest);
}

export function serializeReviewDocument(
  document: ReviewDocument,
  manifest: ReviewManifest,
): string {
  const checked = validateDocument(document, document.binding, manifest);
  const text = JSON.stringify(checked, null, 2) + "\n";
  if (new TextEncoder().encode(text).byteLength > REVIEW_MAX_BYTES)
    throw Error("Review JSON exceeds the 1 MiB export limit.");
  return text;
}

export function withReviewIssue(
  document: ReviewDocument,
  issue: ReviewIssue,
  manifest: ReviewManifest,
): ReviewDocument {
  const exists = document.issues.some((old) => old.id === issue.id);
  return validateDocument(
    {
      ...document,
      issues: exists
        ? document.issues.map((old) => (old.id === issue.id ? issue : old))
        : [...document.issues, issue],
    },
    document.binding,
    manifest,
  );
}

export function withoutReviewIssue(
  document: ReviewDocument,
  id: string,
  manifest: ReviewManifest,
): ReviewDocument {
  identifier(id);
  return validateDocument(
    { ...document, issues: document.issues.filter((issue) => issue.id !== id) },
    document.binding,
    manifest,
  );
}

export function reviewStorageKey(binding: ReviewBinding): string {
  const b = bindingValue(binding);
  return `gathria-look-review-v1:${b.sourceSha256}:${b.registrationSha256}:${b.lookSha256}`;
}
function storageError(error: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: `Review storage unavailable: ${error instanceof Error ? error.message : "browser storage could not be accessed"} Export review JSON to keep a portable copy.`,
  };
}
export function loadReviewDocument(
  binding: ReviewBinding,
  manifest: ReviewManifest,
  storage?: ReviewStorage,
): ReviewLoadResult {
  try {
    const text = (storage ?? globalThis.localStorage).getItem(
      reviewStorageKey(binding),
    );
    return {
      ok: true,
      document:
        text === null ? null : parseReviewDocument(text, binding, manifest),
    };
  } catch (error) {
    return storageError(error);
  }
}
export function saveReviewDocument(
  document: ReviewDocument,
  manifest: ReviewManifest,
  storage?: ReviewStorage,
): ReviewStorageResult {
  try {
    const text = serializeReviewDocument(document, manifest);
    const target = storage ?? globalThis.localStorage;
    const key = reviewStorageKey(document.binding);
    const previous = target.getItem(key);
    // Do not silently replace malformed prior notes after a failed load.
    if (previous !== null)
      parseReviewDocument(previous, document.binding, manifest);
    target.setItem(key, text);
    return { ok: true };
  } catch (error) {
    return storageError(error);
  }
}
/** Explicit user-triggered clearing; never called as recovery from a read error. */
export function clearStoredReview(
  binding: ReviewBinding,
  storage?: ReviewStorage,
): ReviewStorageResult {
  try {
    (storage ?? globalThis.localStorage).removeItem(reviewStorageKey(binding));
    return { ok: true };
  } catch (error) {
    return storageError(error);
  }
}
