import authored from "../../artwork/kling-mask-workbench/female-neckline-cloth-v1.json" with { type: "json" };
import coverage from "../../artwork/wardrobe-coverage/neckline-profiles-v1.json" with { type: "json" };
import type { WardrobeGarmentManifest, WardrobeRegistration } from "./contract";

/** This is a shipped, source-bound review of visible cloth accidentally enclosed
 * by the original head polygon. Garments name this immutable profile; they
 * cannot supply replacement polygons, arbitrary releases or another profile.
 * New reviews must have new IDs and preserve this map for old saved projects. */
export const FEMALE_NECKLINE_PERMISSION_PROFILE = "female-neckline-cloth-v1";
/** Hash of the immutable authored JSON, pinned by regression tests. */
export const FEMALE_NECKLINE_PERMISSION_SHA256 =
  "9a24590ab1434480c822a577379de7d92479ee1871e44e11d688ab9ef1d5185c";

type Run = { y: number; x0: number; x1: number };
type Profile = {
  format: string;
  version: number;
  id: string;
  sourceSha256: string;
  registrationSha256: string;
  frameWidth: number;
  frameHeight: number;
  frames: Array<{ frameId: number; runs: Run[] }>;
};
const profile: Profile = authored;
const expectedPoses = [89, 90, 93, 101, 102, 103];
if (
  profile.format !== "gathria-neckline-cloth-permissions" ||
  profile.version !== 1 ||
  profile.id !== FEMALE_NECKLINE_PERMISSION_PROFILE ||
  profile.frameWidth !== 704 ||
  profile.frameHeight !== 1056 ||
  !/^[a-f0-9]{64}$/.test(profile.sourceSha256) ||
  !/^[a-f0-9]{64}$/.test(profile.registrationSha256) ||
  JSON.stringify(profile.frames.map((frame) => frame.frameId)) !==
    JSON.stringify(expectedPoses)
)
  throw Error("The shipped neckline cloth review is invalid.");

/** Hash of the additional source-bound review set, pinned by regression tests. */
export const COVERAGE_NECKLINE_PERMISSION_SHA256 =
  "1eb4ef33afebd223b0a825406514d796c611b03f40b33a5ac19c16f938d3a71e";

type PreparedProfile = Profile & {
  rows: Map<number, Map<number, Array<readonly [number, number]>>>;
};
// Private copies prevent imported JSON objects or consumers mutating permissions.
const profiles = new Map<string, PreparedProfile>();
const bindings = new Set<string>();
if (
  coverage.format !== "gathria-neckline-cloth-profile-set" ||
  coverage.version !== 1 ||
  coverage.profiles.length !== 3
)
  throw Error("The shipped neckline cloth review set is invalid.");
for (const input of [profile, ...coverage.profiles]) {
  const binding = `${input.sourceSha256}:${input.registrationSha256}`;
  if (
    input.format !== "gathria-neckline-cloth-permissions" ||
    input.version !== 1 ||
    !input.id ||
    profiles.has(input.id) ||
    bindings.has(binding) ||
    !/^[a-f0-9]{64}$/.test(input.sourceSha256) ||
    !/^[a-f0-9]{64}$/.test(input.registrationSha256) ||
    ![input.frameWidth, input.frameHeight].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    ) ||
    !input.frames.length
  )
    throw Error("The shipped neckline cloth review is invalid.");
  const rows: PreparedProfile["rows"] = new Map();
  for (const frame of input.frames) {
    if (
      !Number.isSafeInteger(frame.frameId) ||
      frame.frameId < 0 ||
      rows.has(frame.frameId)
    )
      throw Error("Neckline review poses must be distinct and nonnegative.");
    const raster = new Map<number, Array<readonly [number, number]>>();
    let lastY = -1,
      lastX = -1;
    if (!frame.runs.length)
      throw Error("A neckline review has no cloth pixels.");
    for (const { y, x0, x1 } of frame.runs) {
      if (
        ![y, x0, x1].every(Number.isSafeInteger) ||
        y < 0 ||
        y >= input.frameHeight ||
        x0 < 0 ||
        x1 >= input.frameWidth ||
        x1 < x0 ||
        y < lastY ||
        (y === lastY && x0 <= lastX)
      )
        throw Error(
          "Neckline cloth runs must be bounded, sorted and disjoint.",
        );
      const spans = raster.get(y) ?? [];
      spans.push(Object.freeze([x0, x1] as const));
      raster.set(y, spans);
      lastY = y;
      lastX = x1;
    }
    rows.set(frame.frameId, raster);
  }
  profiles.set(input.id, { ...input, frames: [], rows });
  bindings.add(binding);
}

export function availableNecklinePermissionProfile(
  registration: WardrobeRegistration,
  registrationSha256: string,
): string | undefined {
  for (const candidate of profiles.values())
    if (
      registration.sourceSha256 === candidate.sourceSha256 &&
      registrationSha256 === candidate.registrationSha256 &&
      registration.frameWidth === candidate.frameWidth &&
      registration.frameHeight === candidate.frameHeight
    )
      return candidate.id;
  return undefined;
}

export function assertNecklinePermissionProfile(
  value: unknown,
  registration: WardrobeRegistration,
  registrationSha256: string,
): string {
  if (
    typeof value !== "string" ||
    !profiles.has(value) ||
    availableNecklinePermissionProfile(registration, registrationSha256) !==
      value
  )
    throw Error(
      "Neckline review requires the exact approved source and registration profile.",
    );
  return value;
}

/** SHA-256 of the immutable shipped JSON containing this review. The original
 * profile keeps its original file hash; newer profiles share their review-set
 * file hash. Unknown IDs must never be exported with a plausible wrong hash. */
export function necklinePermissionProfileSha256(profileId: string): string {
  if (!profiles.has(profileId))
    throw Error("Unknown neckline cloth permission profile.");
  return profileId === FEMALE_NECKLINE_PERMISSION_PROFILE
    ? FEMALE_NECKLINE_PERMISSION_SHA256
    : COVERAGE_NECKLINE_PERMISSION_SHA256;
}

/** Native right-facing coordinates. Only explicit garment V3 can release an
 * immutable reviewed cloth pixel; all other versions/pixels stay protected. */
export function reviewedNecklineAt(
  item: WardrobeGarmentManifest,
  frameId: number,
  x: number,
  y: number,
): boolean {
  const candidate = profiles.get(item.necklinePermissionProfile ?? "");
  if (
    !candidate ||
    item.version !== 3 ||
    item.sourceSha256 !== candidate.sourceSha256 ||
    item.registrationSha256 !== candidate.registrationSha256 ||
    item.frameWidth !== candidate.frameWidth ||
    item.frameHeight !== candidate.frameHeight ||
    (item.slot !== "top" && item.slot !== "fullBody") ||
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y)
  )
    return false;
  return (candidate.rows.get(frameId)?.get(y) ?? []).some(
    ([left, right]) => x >= left && x <= right,
  );
}
