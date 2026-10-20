import type { Matrix } from "../core/illustrated-canvas";
import {
  CHAINS,
  type ChainName,
  type JointTriple,
  type Point,
  type RigDefinition,
  type SkinMetadata,
} from "./types";

/** A review pose is deliberately separate from timed motion libraries.
 * Chain points are posed WORLD coordinates in the native 192×256 frame.
 * This does not add an animation name or change old project/pack schemas. */
export interface StaticRigPose {
  format: "gathria-static-rig-pose";
  version: 1;
  id: string;
  body: { translation: Point; rotation: number };
  chains: Record<ChainName, JointTriple>;
}

function object(value: unknown, label: string, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${label} must be an object.`);
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !keys.includes(key)))
    throw Error(`${label} contains unsupported fields.`);
  return raw;
}
function number(value: unknown, label: string, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw Error(`${label} must be finite and between ${min} and ${max}.`);
  return value;
}
function point(value: unknown, label: string, translation = false): Point {
  if (!Array.isArray(value) || value.length !== 2)
    throw Error(`${label} must be an [x,y] pair.`);
  return [
    number(value[0], `${label}.x`, -192, translation ? 192 : 384),
    number(value[1], `${label}.y`, -256, translation ? 256 : 512),
  ];
}
const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function staticPoseBodyMatrix(
  pose: StaticRigPose,
  pivot: Point,
): Matrix {
  const c = Math.cos(pose.body.rotation),
    s = Math.sin(pose.body.rotation);
  return [
    c,
    s,
    -s,
    c,
    pivot[0] - c * pivot[0] + s * pivot[1] + pose.body.translation[0],
    pivot[1] - s * pivot[0] - c * pivot[1] + pose.body.translation[1],
  ];
}
export function mapStaticPosePoint(matrix: Matrix, p: Point): Point {
  return [
    matrix[0] * p[0] + matrix[2] * p[1] + matrix[4],
    matrix[1] * p[0] + matrix[3] * p[1] + matrix[5],
  ];
}

/** Preserve parent attachment and anatomy rather than silently stretching the
 * approved character to reach an arbitrary pose. One native pixel or 2% permits
 * rounded authored landmarks; collapsed, detached or stretched limbs reject.
 * Off-canvas points are bounded but permitted; the caller checks visual margins. */
export function validateStaticRigPose(
  value: unknown,
  rig: RigDefinition,
  skin: SkinMetadata,
): StaticRigPose {
  const raw = object(value, "Static pose", [
    "format",
    "version",
    "id",
    "body",
    "chains",
  ]);
  if (raw.format !== "gathria-static-rig-pose" || raw.version !== 1)
    throw Error("Unsupported static rig pose format/version.");
  if (
    typeof raw.id !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(raw.id)
  )
    throw Error(
      "Static pose id must be a simple identifier of at most 80 characters.",
    );
  const body = object(raw.body, "Static pose body", [
    "translation",
    "rotation",
  ]);
  const input = object(raw.chains, "Static pose chains", CHAINS);
  const pose: StaticRigPose = {
    format: "gathria-static-rig-pose",
    version: 1,
    id: raw.id,
    body: {
      translation: point(body.translation, "Static pose translation", true),
      rotation: number(
        body.rotation,
        "Static pose rotation",
        -Math.PI,
        Math.PI,
      ),
    },
    chains: {} as Record<ChainName, JointTriple>,
  };
  const matrix = staticPoseBodyMatrix(pose, rig.pivot);
  for (const chain of CHAINS) {
    const data = input[chain];
    if (!Array.isArray(data) || data.length !== 3)
      throw Error(`Static pose ${chain} needs three joints.`);
    const joints = data.map((p, i) =>
      point(p, `Static pose ${chain}[${i}]`),
    ) as unknown as JointTriple;
    const rest = skin.bindings.chains[chain];
    if (distance(joints[0], mapStaticPosePoint(matrix, rest[0])) > 1)
      throw Error(
        `Static pose ${chain} root must remain attached to the transformed body within 1 px.`,
      );
    for (let segment = 0; segment < 2; segment++) {
      const original = distance(rest[segment], rest[segment + 1]),
        posed = distance(joints[segment], joints[segment + 1]);
      if (
        posed < 1 ||
        Math.abs(posed - original) > Math.max(1, original * 0.02)
      )
        throw Error(
          `Static pose ${chain} segment ${segment} must preserve source bone length within 1 px or 2%.`,
        );
    }
    pose.chains[chain] = joints;
  }
  return pose;
}

export function createRestStaticPose(
  rig: RigDefinition,
  skin: SkinMetadata,
  id = "rest",
): StaticRigPose {
  return validateStaticRigPose(
    {
      format: "gathria-static-rig-pose",
      version: 1,
      id,
      body: { translation: [0, 0], rotation: 0 },
      chains: structuredClone(skin.bindings.chains),
    },
    rig,
    skin,
  );
}
