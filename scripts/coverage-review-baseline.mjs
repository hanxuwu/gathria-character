// Permanent merged-main ancestor, fetchable by exact commit even after
// later feature branches are squash-merged or deleted. Never read branch refs.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
export const COVERAGE_REVIEW_BASELINE =
  "5d63ae233ca83e61dc354e122a8708044f4e2653";
export function readCoverageBaseline(path, root) {
  const clean = path.replace(/^\//, "");
  assert(
    !clean.split("/").includes("..") && !clean.startsWith(".git/"),
    "Invalid baseline asset path",
  );
  try {
    return execFileSync(
      "git",
      ["show", COVERAGE_REVIEW_BASELINE + ":" + clean],
      { cwd: root, maxBuffer: 96 * 1024 * 1024 },
    );
  } catch (cause) {
    throw new Error(
      "Coverage review requires merged-main baseline " +
        COVERAGE_REVIEW_BASELINE +
        ". Fetch this exact commit: git fetch --no-tags --depth=1 origin 5d63ae233ca83e61dc354e122a8708044f4e2653. Missing " +
        clean,
      { cause },
    );
  }
}
