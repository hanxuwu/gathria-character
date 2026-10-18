import type {
  AnimationName,
  MotionClip,
  MotionKey,
  MotionLibrary,
} from "./types";

/** The same authored-value limits used by the project importer. Angles are
 * stored in radians; the editor only converts their presentation to degrees. */
export const MOTION_LIMITS: Record<keyof MotionKey, readonly [number, number]> =
  {
    footX: [-48, 48],
    footLift: [0, 64],
    shoePitch: [-1.6, 1.6],
    bodyBob: [-16, 16],
    armAngle: [-1.6, 1.6],
    lean: [-0.4, 0.4],
    armSwing: [-24, 24],
    rootY: [-16, 0],
    armBend: [-1.5, 1.5],
    torsoLean: [-0.12, 0.12],
  };

export const MOTION_FIELDS: Record<
  AnimationName,
  readonly (keyof MotionKey)[]
> = {
  idle: ["bodyBob", "lean", "armSwing"],
  walk: ["bodyBob", "lean", "armSwing", "footX", "footLift", "shoePitch"],
  run: ["bodyBob", "lean", "armAngle", "footX", "footLift", "shoePitch"],
  jump: [
    "rootY",
    "bodyBob",
    "lean",
    "armAngle",
    "armBend",
    "footX",
    "footLift",
    "shoePitch",
  ],
};

/** Version-specific controls never add future fields to historical clips. */
export function motionFields(
  animation: AnimationName,
  version: MotionLibrary["version"],
) {
  return version === 2 && animation === "run"
    ? [...MOTION_FIELDS.run, "torsoLean" as const]
    : MOTION_FIELDS[animation];
}

const inRange = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max;
const sequenceIndex = (clip: MotionClip, index: number) =>
  Number.isInteger(index) && index >= 0 && index < clip.sequence.length;

/** Edit the shared source pose, not a disposable copy of a held frame. Other
 * poses and clips remain untouched. Invalid drafts are identity-preserving. */
export function setMotionField(
  clip: MotionClip,
  playbackIndex: number,
  field: keyof MotionKey,
  value: number,
): MotionClip {
  if (!sequenceIndex(clip, playbackIndex)) return clip;
  const [min, max] = MOTION_LIMITS[field];
  const keyIndex = clip.sequence[playbackIndex];
  const key = clip.keys[keyIndex];
  if (!inRange(value, min, max) || !key || (key[field] ?? 0) === value)
    return clip;
  return {
    ...clip,
    keys: clip.keys.map((pose, index) =>
      index === keyIndex ? { ...pose, [field]: value } : pose,
    ),
  };
}

export function setMotionFps(clip: MotionClip, fps: number): MotionClip {
  return !inRange(fps, 1, 60) || clip.fps === fps ? clip : { ...clip, fps };
}

export function assignPlaybackPose(
  clip: MotionClip,
  playbackIndex: number,
  keyIndex: number,
): MotionClip {
  if (
    !sequenceIndex(clip, playbackIndex) ||
    !Number.isInteger(keyIndex) ||
    keyIndex < 0 ||
    keyIndex >= clip.keys.length ||
    clip.sequence[playbackIndex] === keyIndex
  )
    return clip;
  return {
    ...clip,
    sequence: clip.sequence.map((pose, index) =>
      index === playbackIndex ? keyIndex : pose,
    ),
  };
}

export function holdPlaybackPose(
  clip: MotionClip,
  playbackIndex: number,
): MotionClip {
  if (!sequenceIndex(clip, playbackIndex) || clip.sequence.length >= 120)
    return clip;
  return {
    ...clip,
    sequence: [
      ...clip.sequence.slice(0, playbackIndex + 1),
      clip.sequence[playbackIndex],
      ...clip.sequence.slice(playbackIndex + 1),
    ],
  };
}

export function removePlaybackFrame(
  clip: MotionClip,
  playbackIndex: number,
): MotionClip {
  if (!sequenceIndex(clip, playbackIndex) || clip.sequence.length <= 1)
    return clip;
  return {
    ...clip,
    sequence: clip.sequence.filter((_, index) => index !== playbackIndex),
  };
}
