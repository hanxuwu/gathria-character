import type { BakedCharacterPackManifest } from "../core/types";
import {
  createReviewDocument,
  parseReviewDocument,
  REVIEW_MAX_BYTES,
  serializeReviewDocument,
  type ReviewBinding,
  type ReviewDocument,
  type ReviewIssue,
} from "./review-document";

type ReviewManifest = Pick<BakedCharacterPackManifest, "frames" | "animations">;
export interface ReviewTransferLineage {
  format: "gathria-review-transfer";
  version: 1;
  from: ReviewBinding;
  to: ReviewBinding;
  /** The original statuses remain historical evidence only. The target review
   * always reopens every issue for a deliberate new visual inspection. */
  issues: ReviewIssue[];
}
export interface ReviewTransfer {
  document: ReviewDocument;
  lineage: ReviewTransferLineage;
}

/** Explicit user-requested migration, never a silent response to changing clothes.
 * Validates every issue against the target action map; no issue is dropped. */
export function createReviewTransfer(
  source: ReviewDocument,
  target: ReviewBinding,
  targetManifest: ReviewManifest,
): ReviewTransfer {
  const to = createReviewDocument(target).binding;
  const checked = parseReviewDocument(
    serializeReviewDocument(source, targetManifest),
    source.binding,
    targetManifest,
  );
  if (
    checked.binding.sourceSha256 !== to.sourceSha256 ||
    checked.binding.registrationSha256 !== to.registrationSha256
  )
    throw Error(
      "Transfer review issues only within the same source and anchor registration.",
    );
  if (checked.binding.lookSha256 === to.lookSha256)
    throw Error(
      "This is already the same look. Import its review notes instead.",
    );
  const document = parseReviewDocument(
    JSON.stringify({
      ...checked,
      binding: to,
      issues: checked.issues.map((issue) => ({ ...issue, status: "open" })),
    }),
    to,
    targetManifest,
  );
  return {
    document,
    lineage: {
      format: "gathria-review-transfer",
      version: 1,
      from: { ...checked.binding },
      to: { ...to },
      issues: checked.issues.map((issue) => ({ ...issue })),
    },
  };
}

function normalizeTransfer(
  value: unknown,
  target: ReviewBinding,
  manifest: ReviewManifest,
): ReviewTransfer {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error("Review transfer must be a plain object.");
  const data = value as Record<string, unknown>;
  const keys = ["format", "version", "from", "to", "issues"];
  if (
    Object.keys(data).length !== keys.length ||
    Object.keys(data).some((key) => !keys.includes(key)) ||
    data.format !== "gathria-review-transfer" ||
    data.version !== 1
  )
    throw Error("Choose a supported Gathria review transfer V1 document.");
  const to = createReviewDocument(data.to as ReviewBinding).binding;
  const expected = createReviewDocument(target).binding;
  if (
    to.sourceSha256 !== expected.sourceSha256 ||
    to.registrationSha256 !== expected.registrationSha256 ||
    to.lookSha256 !== expected.lookSha256
  )
    throw Error("This review transfer belongs to a different target look.");
  const from = createReviewDocument(data.from as ReviewBinding).binding;
  return createReviewTransfer(
    parseReviewDocument(
      JSON.stringify({
        format: "gathria-look-review",
        version: 1,
        binding: from,
        issues: data.issues,
      }),
      from,
      manifest,
    ),
    to,
    manifest,
  );
}

export function serializeReviewTransfer(
  lineage: ReviewTransferLineage,
  manifest: ReviewManifest,
): string {
  const checked = normalizeTransfer(lineage, lineage.to, manifest);
  const text = JSON.stringify(checked.lineage, null, 2) + "\n";
  if (new TextEncoder().encode(text).byteLength > REVIEW_MAX_BYTES)
    throw Error("Review transfer exceeds the 1 MiB export limit.");
  return text;
}

export function parseReviewTransfer(
  text: string,
  target: ReviewBinding,
  manifest: ReviewManifest,
): ReviewTransfer {
  if (
    typeof text !== "string" ||
    text.length > REVIEW_MAX_BYTES ||
    new TextEncoder().encode(text).byteLength > REVIEW_MAX_BYTES
  )
    throw Error("Review transfer exceeds the 1 MiB import limit.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error("The review transfer JSON is incomplete or invalid.");
  }
  return normalizeTransfer(value, target, manifest);
}

/** Copy into an existing target review only after explicit confirmation. Names
 * are stable links to source issues; collisions are rejected rather than
 * overwriting prior findings or silently assigning unrelated identifiers. */
export function mergeReviewTransfer(
  current: ReviewDocument,
  transfer: ReviewTransfer,
  manifest: ReviewManifest,
): ReviewDocument {
  const existing = parseReviewDocument(
    serializeReviewDocument(current, manifest),
    current.binding,
    manifest,
  );
  // Rebuild from lineage, not a potentially mutated preview document.
  const checked = normalizeTransfer(
    transfer.lineage,
    existing.binding,
    manifest,
  );
  const ids = new Set(existing.issues.map((issue) => issue.id));
  const collision = checked.document.issues.find((issue) => ids.has(issue.id));
  if (collision)
    throw Error(
      `Review issue ${collision.id} already exists in this look. Existing notes are unchanged; resolve the ID collision before copying.`,
    );
  return parseReviewDocument(
    JSON.stringify({
      ...existing,
      issues: [...existing.issues, ...checked.document.issues],
    }),
    existing.binding,
    manifest,
  );
}
