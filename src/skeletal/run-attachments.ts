import type {
  JointTriple,
  Point,
  RunLegs,
  RunShoes,
  ShinFollowRunShoes,
} from "./types";

function object(value: unknown, keys: string[], path: string) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${path} must contain ${keys.join(", ")}.`);
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(raw, key))
  )
    throw Error(`${path} must contain exactly ${keys.join(", ")}.`);
  return raw;
}
function point(value: unknown, path: string): Point {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some((v, i) => !Number.isInteger(v) || v < 1 || v >= (i ? 255 : 191))
  )
    throw Error(
      `${path} must be an integer source point inside the 192×256 canvas.`,
    );
  return [value[0], value[1]];
}
function joints(value: unknown, path: string): JointTriple {
  if (!Array.isArray(value) || value.length !== 3)
    throw Error(`${path} needs three registered joints.`);
  const result = value.map((v, i) =>
    point(v, `${path}[${i}]`),
  ) as unknown as JointTriple;
  for (let i = 1; i < 3; i++) {
    const length = Math.hypot(
      result[i][0] - result[i - 1][0],
      result[i][1] - result[i - 1][1],
    );
    if (length < 3 || length > 96)
      throw Error(`${path} segment length must be 3–96 pixels.`);
  }
  return result;
}

/** Paired, explicit source registrations never replace the anatomical chains. */
export function validateRunLegs(value: unknown): RunLegs {
  const raw = object(value, ["nearLeg", "farLeg"], "runLegs");
  const leg = (side: "near" | "far") => {
    const entry = object(
      raw[`${side}Leg`],
      ["slot", "joints"],
      `runLegs.${side}Leg`,
    );
    if (entry.slot !== `${side}-leg-bent`)
      throw Error(`runLegs.${side}Leg has the wrong slot.`);
    return {
      slot: entry.slot,
      joints: joints(entry.joints, `runLegs.${side}Leg.joints`),
    };
  };
  return { nearLeg: leg("near"), farLeg: leg("far") } as RunLegs;
}
export function validateRunShoes(value: unknown): RunShoes {
  const raw = object(value, ["nearLeg", "farLeg"], "runShoes");
  const shoe = (side: "near" | "far") => {
    const entry = object(
      raw[`${side}Leg`],
      ["slot", "ankle"],
      `runShoes.${side}Leg`,
    );
    if (entry.slot !== `${side}-shoe-run`)
      throw Error(`runShoes.${side}Leg has the wrong slot.`);
    return {
      slot: entry.slot,
      ankle: point(entry.ankle, `runShoes.${side}Leg.ankle`),
    };
  };
  return { nearLeg: shoe("near"), farLeg: shoe("far") } as RunShoes;
}

/** New version only; old run-shoe metadata continues to reject sourceShin. */
export function validateShinFollowRunShoes(value: unknown): ShinFollowRunShoes {
  const raw = object(value, ["nearLeg", "farLeg"], "runShoes");
  const shoe = (side: "near" | "far") => {
    const entry = object(
      raw[`${side}Leg`],
      ["slot", "ankle", "sourceShin"],
      `runShoes.${side}Leg`,
    );
    if (entry.slot !== `${side}-shoe-run`)
      throw Error(`runShoes.${side}Leg has the wrong slot.`);
    const ankle = point(entry.ankle, `runShoes.${side}Leg.ankle`),
      sourceShin = point(entry.sourceShin, `runShoes.${side}Leg.sourceShin`),
      length = Math.hypot(ankle[0] - sourceShin[0], ankle[1] - sourceShin[1]);
    if (length < 3 || length > 96)
      throw Error("The run shoe source shin axis must be 3–96 pixels long.");
    return { slot: entry.slot, ankle, sourceShin };
  };
  return { nearLeg: shoe("near"), farLeg: shoe("far") } as ShinFollowRunShoes;
}

/** Signed segment turn preserves bend direction; circular distances handle ±π. */
export function kneeTurn(joints: JointTriple): number {
  const [a, b, c] = joints;
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    vx = c[0] - b[0],
    vy = c[1] - b[1];
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}
export function preferBentLeg(
  base: JointTriple,
  bent: JointTriple,
  posed: JointTriple,
): boolean {
  const target = kneeTurn(posed);
  const distance = (source: JointTriple) =>
    Math.abs(
      Math.atan2(
        Math.sin(kneeTurn(source) - target),
        Math.cos(kneeTurn(source) - target),
      ),
    );
  // Numerical ties stay on the base texture, independent of identity/key index.
  return distance(bent) < distance(base) - 1e-9;
}
