import type {
  Animation,
  BakedCharacterRecipe,
  PortableAnimationName,
  PortableCharacterPackManifest,
} from "../core/types";

const actions: PortableAnimationName[] = [
  "idle",
  "walk",
  "run",
  "jump",
  "celebrate",
];
const actionName = (value: unknown): value is PortableAnimationName =>
  typeof value === "string" && actions.includes(value as PortableAnimationName);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export interface MotionRoute {
  from: PortableAnimationName;
  to: PortableAnimationName;
  /** Boundary after the complete source pose hold, in playback ticks. */
  exit: number;
  /** First tick of the chosen target pose hold. */
  entry: number;
}

export interface MotionFlow {
  format: "gathria-motion-flow";
  version: 1;
  characterId: "male" | "female";
  actions: Record<PortableAnimationName, Animation>;
  routes: MotionRoute[];
  returnToIdle: ["jump"];
}

export interface MotionState {
  action: PortableAnimationName;
  elapsedMs: number;
  pending: PortableAnimationName | null;
}

/** Invalid, edited or unrelated packs use ordinary playback, never guessed routes. */
export function readMotionFlow(
  manifest: PortableCharacterPackManifest,
  config?: Pick<BakedCharacterRecipe, "sourceMetadata">,
): MotionFlow | null {
  const value = config?.sourceMetadata?.motionFlow;
  if (
    !record(value) ||
    value.format !== "gathria-motion-flow" ||
    value.version !== 1 ||
    (value.characterId !== "male" && value.characterId !== "female") ||
    !record(value.actions) ||
    Object.keys(value.actions).length !== actions.length ||
    !Array.isArray(value.routes) ||
    value.routes.length < 20 ||
    value.routes.length > 256 ||
    !Array.isArray(value.returnToIdle) ||
    value.returnToIdle.length !== 1 ||
    value.returnToIdle[0] !== "jump"
  )
    return null;
  const clips = {} as MotionFlow["actions"];
  for (const action of actions) {
    const declared = value.actions[action];
    const actual = manifest.animations[action];
    if (
      !record(declared) ||
      !actual ||
      !Array.isArray(declared.frames) ||
      declared.fps !== actual.fps ||
      declared.loop !== actual.loop ||
      declared.frames.length !== actual.frames.length ||
      declared.frames.some((id, index) => id !== actual.frames[index]) ||
      actual.loop !== (action !== "jump")
    )
      return null;
    clips[action] = { ...actual, frames: [...actual.frames] };
  }
  const routes: MotionRoute[] = [];
  const pairs = new Set<string>();
  const seen = new Set<string>();
  for (const candidate of value.routes) {
    if (
      !record(candidate) ||
      !actionName(candidate.from) ||
      !actionName(candidate.to) ||
      candidate.from === candidate.to ||
      !Number.isInteger(candidate.exit) ||
      !Number.isInteger(candidate.entry)
    )
      return null;
    const from = clips[candidate.from],
      to = clips[candidate.to];
    const exit = candidate.exit as number,
      entry = candidate.entry as number;
    if (
      exit < 1 ||
      exit > from.frames.length ||
      entry < 0 ||
      entry >= to.frames.length ||
      (exit < from.frames.length &&
        from.frames[exit - 1] === from.frames[exit]) ||
      (entry > 0 && to.frames[entry - 1] === to.frames[entry]) ||
      (candidate.from === "jump" && exit !== from.frames.length) ||
      (candidate.to === "jump" && entry !== 0)
    )
      return null;
    const key = `${candidate.from}:${candidate.to}:${exit}`;
    // One entry per exit makes the result independent of metadata array order.
    if (seen.has(key)) return null;
    seen.add(key);
    pairs.add(`${candidate.from}:${candidate.to}`);
    routes.push({ from: candidate.from, to: candidate.to, exit, entry });
  }
  if (pairs.size !== 20) return null;
  return {
    format: "gathria-motion-flow",
    version: 1,
    characterId: value.characterId,
    actions: clips,
    routes,
    returnToIdle: ["jump"],
  };
}

/** A newer request replaces an older one. Choosing the playing action cancels it. */
export function requestMotionAction(
  state: MotionState,
  target: PortableAnimationName,
): MotionState {
  return { ...state, pending: target === state.action ? null : target };
}

/** Advance by already speed-scaled playback time; paused/hidden callers pass no time. */
export function advanceMotionFlow(
  profile: MotionFlow,
  initial: MotionState,
  deltaMs: number,
): MotionState {
  if (!Number.isFinite(deltaMs) || deltaMs < 0)
    throw new Error("Motion time must be finite and nonnegative.");
  let state = { ...initial };
  let remaining = deltaMs;
  // At most the requested transition plus the full jump's automatic return.
  for (let transitions = 0; transitions < 3; transitions++) {
    const clip = profile.actions[state.action];
    const duration = (clip.frames.length * 1000) / clip.fps;
    const elapsed = clip.loop ? state.elapsedMs % duration : state.elapsedMs;
    const target =
      state.pending ??
      (profile.returnToIdle.includes(state.action as "jump") ? "idle" : null);
    if (!target)
      return {
        ...state,
        elapsedMs: clip.loop
          ? (elapsed + remaining) % duration
          : Math.min(elapsed + remaining, duration),
      };
    const next = profile.routes
      .filter((route) => route.from === state.action && route.to === target)
      .map((route) => {
        let boundary = (route.exit * 1000) / clip.fps;
        if (clip.loop && boundary < elapsed - 1e-7) boundary += duration;
        return { route, wait: Math.max(0, boundary - elapsed) };
      })
      .sort((a, b) => a.wait - b.wait)[0];
    if (!next) throw new Error("Validated motion route is missing.");
    if (remaining + 1e-7 < next.wait)
      return {
        ...state,
        elapsedMs: clip.loop
          ? (elapsed + remaining) % duration
          : elapsed + remaining,
      };
    remaining = Math.max(0, remaining - next.wait);
    state = {
      action: target,
      elapsedMs: (next.route.entry * 1000) / profile.actions[target].fps,
      pending: null,
    };
  }
  throw new Error("Unexpected cyclic motion transition.");
}
