import authored from "../../artwork/kling-mask-workbench/female-neckline-cloth-v1.json" with { type: "json" };
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

// Private copies prevent a caller or the imported JSON object from mutating
// the raster permission map after module initialization.
const sourceHash = profile.sourceSha256;
const registrationHash = profile.registrationSha256;
const rows = new Map<number, Map<number, Array<readonly [number, number]>>>();
for (const frame of profile.frames) {
  const raster = new Map<number, Array<readonly [number, number]>>();
  let lastY = -1,
    lastX = -1;
  if (!frame.runs.length) throw Error("A neckline review has no cloth pixels.");
  for (const { y, x0, x1 } of frame.runs) {
    if (
      ![y, x0, x1].every(Number.isSafeInteger) ||
      y < 0 ||
      y >= profile.frameHeight ||
      x0 < 0 ||
      x1 >= profile.frameWidth ||
      x1 < x0 ||
      y < lastY ||
      (y === lastY && x0 <= lastX)
    )
      throw Error("Neckline cloth runs must be bounded, sorted and disjoint.");
    const spans = raster.get(y) ?? [];
    spans.push(Object.freeze([x0, x1] as const));
    raster.set(y, spans);
    lastY = y;
    lastX = x1;
  }
  rows.set(frame.frameId, raster);
}

export function availableNecklinePermissionProfile(
  registration: WardrobeRegistration,
  registrationSha256: string,
): string | undefined {
  return registration.sourceSha256 === sourceHash &&
    registrationSha256 === registrationHash &&
    registration.frameWidth === 704 &&
    registration.frameHeight === 1056
    ? FEMALE_NECKLINE_PERMISSION_PROFILE
    : undefined;
}

export function assertNecklinePermissionProfile(
  value: unknown,
  registration: WardrobeRegistration,
  registrationSha256: string,
): string {
  if (
    value !== FEMALE_NECKLINE_PERMISSION_PROFILE ||
    availableNecklinePermissionProfile(registration, registrationSha256) !==
      value
  )
    throw Error(
      "Neckline review requires the exact approved source and registration profile.",
    );
  return value;
}

/** Native right-facing pixel coordinates. Only explicit garment V3 can use the
 * six reviewed cloth maps; all other pixels/versions retain original rules. */
export function reviewedNecklineAt(
  item: WardrobeGarmentManifest,
  frameId: number,
  x: number,
  y: number,
): boolean {
  if (
    item.version !== 3 ||
    item.necklinePermissionProfile !== FEMALE_NECKLINE_PERMISSION_PROFILE ||
    item.sourceSha256 !== sourceHash ||
    item.registrationSha256 !== registrationHash ||
    item.frameWidth !== 704 ||
    item.frameHeight !== 1056 ||
    (item.slot !== "top" && item.slot !== "fullBody") ||
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y)
  )
    return false;
  return (rows.get(frameId)?.get(y) ?? []).some(
    ([left, right]) => x >= left && x <= right,
  );
}
