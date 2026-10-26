import { strToU8, zipSync } from "fflate";
import { encodeSourceRgbaPngAsync, type RgbaPng } from "../core/baked-source";
import { sha256 } from "../core/sha256";
import {
  assertSourcePreparationActive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import type { PortableAnimationName } from "../core/types";
import {
  createWardrobeCompositor,
  type WardrobeCompositor,
} from "./compositor";
import {
  WARDROBE_MAX_ITEM_BYTES,
  WARDROBE_MAX_ITEM_PIXELS,
  WARDROBE_MAX_PAGES,
  validateWardrobeGarmentManifest,
  wardrobeObject,
  type Point,
  type RegisteredFrame,
  type WardrobeGarment,
  type WardrobeGarmentManifest,
  type WardrobeProject,
} from "./contract";
import { availableNecklinePermissionProfile } from "./neckline-permissions";
import { poseNeighborhood, type PoseNeighbor } from "./pose-neighborhood";
import {
  prepareProtection,
  protectedClothingAt,
  reviewedRegions,
} from "./protection";
import { readWardrobeGarment, validateWardrobeProject } from "./project";
import { clothingPose } from "./recipe-kit";

export const MASK_MAX_POSES = 8;
export const MASK_MAX_DRAFT_BYTES = 4 * 1024 * 1024;
export const MASK_MAX_NATIVE_PIXELS = 1024 * 1024;
const MAX_COMMANDS = 64,
  MAX_POINTS = 2048,
  MAX_PATCH_PIXELS = 8192,
  MAX_TOTAL_PATCH_PIXELS = 32768;
const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const cloneImage = (image: RgbaPng): RgbaPng => ({
  ...image,
  pixels: new Uint8Array(image.pixels),
  colorChunks: image.colorChunks.map((c) => new Uint8Array(c)),
});
export type MaskDecision = "pending" | "accepted" | "rejected";
export interface MaskStroke {
  mode: "cloth" | "restore";
  points: Point[];
  radius: number;
  sample?: Point;
}
export interface MaskPaintPixel {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
}
export type MaskCommand = (
  | ({ kind: "brush" } & MaskStroke)
  | { kind: "patch"; pixels: MaskPaintPixel[]; reason: string }
) & { clip?: Point[] };
export interface MaskStats {
  changedPixels: number;
  addedPixels: number;
  restoredPixels: number;
  blockedPixels: number;
}
export interface MaskPoseSummary {
  frameId: number;
  decision: MaskDecision;
  stats: MaskStats;
  warnings: string[];
  origin: "manual" | "propagated" | "mixed";
  canUndo: boolean;
}
export interface MaskPoseView extends MaskPoseSummary {
  source: RgbaPng;
  before: RgbaPng;
  after: RgbaPng;
  baseCloth: RgbaPng;
  baseOwnership: Uint8Array;
  ownership: Uint8Array;
  /** 0 blocked, 1 unprotected opaque source, 2 explicitly reviewed neckline cloth. */
  allowed: Uint8Array;
}
export interface MaskBinding {
  sourceSha256: string;
  registrationSha256: string;
  itemId: string;
  itemSha256: string;
  action: PortableAnimationName;
  position: number;
  necklinePermissionProfile?: string;
}
interface CommandEntry {
  command: MaskCommand;
  origin: "manual" | "propagated";
  seedFrameId?: number;
}
interface ProposalProof {
  seedFrameId: number;
  seedCommands: MaskCommand[];
}
interface PoseState {
  frameId: number;
  source: RgbaPng;
  baseCloth: RgbaPng;
  baseOwnership: Uint8Array;
  cloth: RgbaPng;
  ownership: Uint8Array;
  allowed: Uint8Array;
  commands: CommandEntry[];
  proposal?: ProposalProof;
  decision: MaskDecision;
  warnings: string[];
  stats: MaskStats;
}
interface DraftPose {
  proposal?: ProposalProof;
  frameId: number;
  decision: MaskDecision;
  commands: CommandEntry[];
  warnings: string[];
}
export interface MaskBuildReport {
  format: "gathria-mask-edit-report";
  version: 1;
  binding: MaskBinding;
  output: { id: string; name: string; sha256: string };
  draftSha256: string;
  accepted: Array<
    MaskPoseSummary & {
      beforeSha256: string;
      afterSha256: string;
      ownershipSha256: string;
    }
  >;
  excluded: Array<{ frameId: number; decision: MaskDecision }>;
  rules: string;
}

function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}
function finite(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number {
  require(typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max, `${label} must be between ${min} and ${max}.`);
  return value;
}
function integer(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number {
  const n = finite(value, min, max, label);
  require(Number.isSafeInteger(n), `${label} must be an integer.`);
  return n;
}
function point(value: unknown, width: number, height: number): Point {
  const p = wardrobeObject(value, "Mask point", ["x", "y"]);
  return {
    x: finite(p.x, 0, width - 1, "Point x"),
    y: finite(p.y, 0, height - 1, "Point y"),
  };
}
function command(value: unknown, width: number, height: number): MaskCommand {
  require(value && typeof value === "object", "Choose a valid mask operation.");
  const rawClip = (value as { clip?: unknown }).clip;
  let clip: Point[] | undefined;
  if (rawClip !== undefined) {
    require(Array.isArray(rawClip) &&
      rawClip.length > 0 &&
      rawClip.length <=
        MAX_TOTAL_PATCH_PIXELS, "Invalid propagation clipping mask.");
    const seen = new Set<number>();
    clip = rawClip.map((entry) => {
      const p = point(entry, width, height);
      require(Number.isInteger(p.x) &&
        Number.isInteger(p.y), "Clip pixels must be integer coordinates.");
      const key = p.y * width + p.x;
      require(!seen.has(key), "Clip pixels must be distinct.");
      seen.add(key);
      return p;
    });
  }
  if ((value as { kind?: unknown }).kind === "patch") {
    const v = wardrobeObject(value, "Mask paint", [
      "kind",
      "pixels",
      "reason",
      "clip",
    ]);
    require(Array.isArray(v.pixels) &&
      v.pixels.length > 0 &&
      v.pixels.length <=
        MAX_PATCH_PIXELS, `A paint patch needs 1–${MAX_PATCH_PIXELS} native pixels.`);
    require(typeof v.reason === "string" &&
      v.reason.trim().length > 0 &&
      v.reason.length <=
        1000, "Describe the reviewed paint patch in 1–1000 characters.");
    const seen = new Set<number>();
    const pixels = v.pixels.map((entry) => {
      const p = wardrobeObject(entry, "Paint pixel", ["x", "y", "r", "g", "b"]);
      const x = integer(p.x, 0, width - 1, "Paint x"),
        y = integer(p.y, 0, height - 1, "Paint y");
      require(!seen.has(
        y * width + x,
      ), "A paint patch cannot repeat a native pixel.");
      seen.add(y * width + x);
      return {
        x,
        y,
        r: integer(p.r, 0, 255, "Red"),
        g: integer(p.g, 0, 255, "Green"),
        b: integer(p.b, 0, 255, "Blue"),
      };
    });
    return {
      kind: "patch",
      reason: v.reason,
      pixels,
      ...(clip ? { clip } : {}),
    };
  }
  const v = wardrobeObject(value, "Mask brush", [
    "kind",
    "mode",
    "points",
    "radius",
    "sample",
    "clip",
  ]);
  require(v.kind === "brush" &&
    (v.mode === "cloth" ||
      v.mode === "restore"), "Choose cloth or restore source.");
  require(Array.isArray(v.points) &&
    v.points.length > 0 &&
    v.points.length <=
      MAX_POINTS, `A brush stroke needs 1–${MAX_POINTS} points.`);
  const sample =
    v.sample === undefined ? undefined : point(v.sample, width, height);
  require(v.mode !== "cloth" ||
    sample, "Pick an existing clothing pixel before cloning cloth.");
  return {
    kind: "brush",
    mode: v.mode,
    points: v.points.map((p) => point(p, width, height)),
    radius: finite(v.radius, 1, 48, "Brush radius"),
    ...(sample ? { sample } : {}),
    ...(clip ? { clip } : {}),
  };
}
function estimatedWork(entries: CommandEntry[]): number {
  return entries.reduce((total, { command: c }) => {
    if (c.kind === "patch") return total + c.pixels.length;
    let stamps = 1;
    for (let i = 1; i < c.points.length; i++)
      stamps += Math.max(
        1,
        Math.ceil(
          Math.hypot(
            c.points[i].x - c.points[i - 1].x,
            c.points[i].y - c.points[i - 1].y,
          ) / Math.max(1, c.radius / 2),
        ),
      );
    return total + stamps * (2 * Math.ceil(c.radius) + 1) ** 2;
  }, 0);
}
function poseWork(state: PoseState, commands = state.commands): number {
  return (
    estimatedWork(commands) +
    (state.proposal
      ? estimatedWork(
          state.proposal.seedCommands.map((command) => ({
            command,
            origin: "manual",
          })),
        )
      : 0)
  );
}
function commandBudget(entries: CommandEntry[]) {
  require(estimatedWork(entries) <=
    8_000_000, "This pose would require too much brush work. Use shorter strokes or smaller repairs.");
  require(entries.length <=
    MAX_COMMANDS, `Keep at most ${MAX_COMMANDS} strokes or patches per pose.`);
  require(entries.reduce(
    (n, e) => n + (e.command.kind === "brush" ? e.command.points.length : 0),
    0,
  ) <= MAX_POINTS, `Keep at most ${MAX_POINTS} brush points per pose.`);
  require(entries.reduce(
    (n, e) => n + (e.command.kind === "patch" ? e.command.pixels.length : 0),
    0,
  ) <= MAX_TOTAL_PATCH_PIXELS, "This pose exceeds the reviewed-paint budget.");
}
function compose(state: PoseState, current: boolean): RgbaPng {
  const output = cloneImage(state.source),
    pixels = current ? state.cloth.pixels : state.baseCloth.pixels,
    own = current ? state.ownership : state.baseOwnership;
  for (let i = 0; i < own.length; i++)
    if (own[i]) output.pixels.set(pixels.subarray(i * 4, i * 4 + 4), i * 4);
  return output;
}
function stats(state: PoseState, blocked: Set<number>): MaskStats {
  let changedPixels = 0,
    addedPixels = 0,
    restoredPixels = 0;
  for (let i = 0; i < state.ownership.length; i++) {
    const a = state.baseOwnership[i],
      b = state.ownership[i];
    const changed =
      a !== b ||
      (b &&
        [0, 1, 2, 3].some(
          (c) =>
            state.baseCloth.pixels[i * 4 + c] !== state.cloth.pixels[i * 4 + c],
        ));
    if (changed) changedPixels++;
    if (!a && b) addedPixels++;
    if (a && !b) restoredPixels++;
  }
  return {
    changedPixels,
    addedPixels,
    restoredPixels,
    blockedPixels: blocked.size,
  };
}
function applyCommand(
  state: PoseState,
  cmd: MaskCommand,
  blocked: Set<number>,
): void {
  const { width, height } = state.source;
  const clip = cmd.clip
    ? new Set(cmd.clip.map((p) => p.y * width + p.x))
    : undefined;
  const write = (x: number, y: number, rgb: number[] | null) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (clip && !clip.has(i)) return;
    if (!state.allowed[i]) {
      blocked.add(i);
      return;
    }
    if (rgb === null) {
      state.ownership[i] = 0;
      state.cloth.pixels.fill(0, i * 4, i * 4 + 4);
    } else {
      state.ownership[i] = 255;
      state.cloth.pixels.set([...rgb, state.source.pixels[i * 4 + 3]], i * 4);
    }
  };
  if (cmd.kind === "patch") {
    for (const p of cmd.pixels) write(p.x, p.y, [p.r, p.g, p.b]);
    return;
  }
  const offset = cmd.sample
    ? {
        x: Math.round(cmd.sample.x - cmd.points[0].x),
        y: Math.round(cmd.sample.y - cmd.points[0].y),
      }
    : { x: 0, y: 0 };
  const visited = new Uint8Array(width * height);
  const stamp = (p: Point) => {
    for (
      let y = Math.max(0, Math.ceil(p.y - cmd.radius));
      y <= Math.min(height - 1, Math.floor(p.y + cmd.radius));
      y++
    )
      for (
        let x = Math.max(0, Math.ceil(p.x - cmd.radius));
        x <= Math.min(width - 1, Math.floor(p.x + cmd.radius));
        x++
      ) {
        if ((x - p.x) ** 2 + (y - p.y) ** 2 > cmd.radius ** 2) continue;
        const i = y * width + x;
        if (visited[i]) continue;
        visited[i] = 1;
        if (cmd.mode === "restore") {
          write(x, y, null);
          continue;
        }
        const sx = x + offset.x,
          sy = y + offset.y,
          at = sy * width + sx;
        if (
          sx < 0 ||
          sy < 0 ||
          sx >= width ||
          sy >= height ||
          !state.baseOwnership[at] ||
          !state.baseCloth.pixels[at * 4 + 3]
        ) {
          blocked.add(i);
          continue;
        }
        write(
          x,
          y,
          Array.from(state.baseCloth.pixels.subarray(at * 4, at * 4 + 3)),
        );
      }
  };
  stamp(cmd.points[0]);
  for (let i = 1; i < cmd.points.length; i++) {
    const a = cmd.points[i - 1],
      b = cmd.points[i],
      distance = Math.hypot(b.x - a.x, b.y - a.y),
      steps = Math.max(1, Math.ceil(distance / Math.max(1, cmd.radius / 2)));
    for (let step = 1; step <= steps; step++)
      stamp({
        x: a.x + ((b.x - a.x) * step) / steps,
        y: a.y + ((b.y - a.y) * step) / steps,
      });
  }
}
function recompute(state: PoseState): void {
  state.cloth = cloneImage(state.baseCloth);
  state.ownership = new Uint8Array(state.baseOwnership);
  const blocked = new Set<number>();
  for (const entry of state.commands)
    applyCommand(state, entry.command, blocked);
  state.stats = stats(state, blocked);
}

/** Only registered affine suggestions, never automatic skin/cloth inference. */
export function maskAnchorTransform(
  from: RegisteredFrame,
  to: RegisteredFrame,
): { map: (p: Point) => Point; scale: number; warnings: string[] } {
  const triangle = (f: RegisteredFrame): Point[] => {
    const anchors = [
      f.points.nearShoulder,
      f.points.farShoulder,
      f.points.waistLeft,
      f.points.waistRight,
    ];
    require(anchors.every(
      (p) =>
        p &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        (p.confidence ?? 1) >= 0.35,
    ), "These torso anchors have low confidence; edit this pose manually.");
    return [
      anchors[0],
      anchors[1],
      {
        x: (anchors[2].x + anchors[3].x) / 2,
        y: (anchors[2].y + anchors[3].y) / 2,
      },
    ];
  };
  const a = triangle(from),
    b = triangle(to),
    cross = (p: Point, q: Point, r: Point) =>
      (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const detA = cross(a[0], a[1], a[2]),
    detB = cross(b[0], b[1], b[2]);
  require(Math.abs(detA) >= 2 &&
    Math.abs(detB) >= 2 &&
    Math.sign(detA) ===
      Math.sign(
        detB,
      ), "These torso anchors collapse or reverse; edit this pose manually.");
  const scale = Math.sqrt(Math.abs(detB / detA));
  require(scale >= 0.5 &&
    scale <=
      2, "The torso changes too much for a nearby-pose suggestion; edit manually.");
  const map = (p: Point): Point => {
    const u =
      ((p.x - a[0].x) * (a[2].y - a[0].y) -
        (p.y - a[0].y) * (a[2].x - a[0].x)) /
      detA;
    const v =
      ((a[1].x - a[0].x) * (p.y - a[0].y) -
        (a[1].y - a[0].y) * (p.x - a[0].x)) /
      detA;
    return {
      x: b[0].x + u * (b[1].x - b[0].x) + v * (b[2].x - b[0].x),
      y: b[0].y + u * (b[1].y - b[0].y) + v * (b[2].y - b[0].y),
    };
  };
  const warnings = [
    "Anchor-guided suggestion only. Check the neckline, skin and occlusion before accepting this pose.",
  ];
  if (
    [from, to].some((f) =>
      [f.points.nearShoulder, f.points.farShoulder].some(
        (p) => p.visibility === "occluded",
      ),
    )
  )
    warnings.push(
      "One shoulder anchor is inferred behind another part; manual review is especially important.",
    );
  return { map, scale, warnings };
}

export function compatibleNecklineProfile(
  project: WardrobeProject,
  itemId: string,
): string | undefined {
  const item = project.items.find((i) => i.manifest.id === itemId);
  return item &&
    (item.manifest.slot === "top" || item.manifest.slot === "fullBody")
    ? availableNecklinePermissionProfile(
        project.registration,
        project.document.registrationSha256,
      )
    : undefined;
}

export class MaskEditSession {
  readonly binding: Readonly<MaskBinding>;
  readonly itemName: string;
  readonly width: number;
  readonly height: number;
  readonly frameIds: readonly number[];
  private poses = new Map<number, PoseState>();
  private disposed = false;
  private loadingPose = false;
  private revision = 0;
  private readonly effective: WardrobeGarmentManifest;
  constructor(
    private readonly project: WardrobeProject,
    private readonly item: WardrobeGarment,
    private readonly sourceRenderer: WardrobeCompositor,
    action: PortableAnimationName,
    position: number,
    private readonly options: SourcePreparationOptions & {
      necklinePermissionProfile?: string;
    },
  ) {
    const clip = project.archive.manifest.animations[action];
    require(clip, "Choose an available source action.");
    poseNeighborhood(clip, position);
    this.binding = Object.freeze({
      sourceSha256: project.document.sourceSha256,
      registrationSha256: project.document.registrationSha256,
      itemId: item.manifest.id,
      itemSha256: item.sha256,
      action,
      position,
      ...(options.necklinePermissionProfile
        ? { necklinePermissionProfile: options.necklinePermissionProfile }
        : {}),
    });
    this.itemName = item.manifest.name;
    this.width = item.manifest.frameWidth;
    this.height = item.manifest.frameHeight;
    this.frameIds = Object.freeze([...new Set(clip.frames)]);
    this.effective = validateWardrobeGarmentManifest(
      options.necklinePermissionProfile
        ? {
            ...item.manifest,
            version: 3,
            necklinePermissionProfile: options.necklinePermissionProfile,
          }
        : item.manifest,
      project.registration,
      project.document.registrationSha256,
    );
  }
  private check(options: SourcePreparationOptions = {}) {
    require(!this.disposed, "This mask session is closed.");
    assertSourcePreparationActive(this.options);
    assertSourcePreparationActive(options);
  }
  private ensure(frameId: number): PoseState {
    this.check();
    const state = this.poses.get(frameId);
    require(state, "Load this source pose before editing it.");
    return state;
  }
  private async fresh(frameId: number): Promise<PoseState> {
    this.check();
    require(this.frameIds.includes(frameId), "Choose a pose in this action.");
    await yieldTask();
    this.check();
    const source = this.sourceRenderer.renderSourceFrame(frameId),
      { image, mask } = clothingPose(this.item, frameId);
    require(source.width === this.width &&
      source.height ===
        this.height, "Mask workbench needs native source dimensions.");
    const frame = this.project.registration.frames.find(
      (f) => f.frameId === frameId,
    )!;
    const protection = prepareProtection(
      reviewedRegions(frame, this.effective),
    );
    const originalProtection = prepareProtection(
      reviewedRegions(frame, this.item.manifest),
    );
    const allowed = new Uint8Array(this.width * this.height),
      ownership = new Uint8Array(allowed.length);
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const i = y * this.width + x;
        ownership[i] = mask.pixels[i * 4];
        if (
          source.pixels[i * 4 + 3] &&
          !protectedClothingAt(frameId, x, y, protection.get(y), this.effective)
        )
          allowed[i] = protectedClothingAt(
            frameId,
            x,
            y,
            originalProtection.get(y),
            this.item.manifest,
          )
            ? 2
            : 1;
      }
    return {
      frameId,
      source,
      baseCloth: image,
      baseOwnership: ownership,
      cloth: cloneImage(image),
      ownership: new Uint8Array(ownership),
      allowed,
      commands: [],
      decision: "pending",
      warnings: [],
      stats: {
        changedPixels: 0,
        addedPixels: 0,
        restoredPixels: 0,
        blockedPixels: 0,
      },
    };
  }
  private summaryOf(state: PoseState): MaskPoseSummary {
    const origins = new Set(state.commands.map((c) => c.origin));
    return {
      frameId: state.frameId,
      decision: state.decision,
      stats: { ...state.stats },
      warnings: [...state.warnings],
      origin:
        origins.size > 1
          ? "mixed"
          : origins.has("propagated")
            ? "propagated"
            : "manual",
      canUndo: state.commands.length > 0,
    };
  }
  private view(state: PoseState): MaskPoseView {
    return {
      ...this.summaryOf(state),
      source: cloneImage(state.source),
      before: compose(state, false),
      after: compose(state, true),
      baseCloth: cloneImage(state.baseCloth),
      baseOwnership: new Uint8Array(state.baseOwnership),
      ownership: new Uint8Array(state.ownership),
      allowed: new Uint8Array(state.allowed),
    };
  }
  async loadPose(frameId: number): Promise<MaskPoseView> {
    this.check();
    if (this.poses.has(frameId)) return this.view(this.ensure(frameId));
    require(!this
      .loadingPose, "Wait for the current source pose to finish loading.");
    const makeRoom = () => {
      if (this.poses.size >= MASK_MAX_POSES && !this.poses.has(frameId)) {
        const unused = [...this.poses.values()].find((p) => !p.commands.length);
        require(unused, `Keep at most ${MASK_MAX_POSES} edited poses in one draft. Reset a pose to inspect another.`);
        this.poses.delete(unused.frameId);
      }
    };
    makeRoom();
    this.loadingPose = true;
    try {
      const fresh = await this.fresh(frameId);
      this.check();
      makeRoom();
      if (!this.poses.has(frameId)) this.poses.set(frameId, fresh);
      return this.view(this.ensure(frameId));
    } finally {
      this.loadingPose = false;
    }
  }
  summary(): MaskPoseSummary[] {
    this.check();
    return [...this.poses.values()]
      .filter((p) => p.commands.length)
      .map((p) => this.summaryOf(p));
  }
  neighbors(position: number): PoseNeighbor[] {
    this.check();
    const clip = this.project.archive.manifest.animations[this.binding.action]!;
    const rows = poseNeighborhood(clip, position),
      current = rows.find((p) => p.role === "Current")!.frameId,
      seen = new Set<number>();
    return rows.filter((p) => {
      if (p.frameId === current && p.role !== "Current") return false;
      if (seen.has(p.frameId)) return false;
      seen.add(p.frameId);
      return true;
    });
  }
  private append(state: PoseState, entry: CommandEntry): MaskPoseView {
    const next = [...state.commands, entry];
    commandBudget(next);
    require([...this.poses.values()].reduce(
      (n, p) => n + poseWork(p, p === state ? next : p.commands),
      0,
    ) <=
      24_000_000, "This draft exceeds its brush work budget. Split the repair into smaller batches.");
    require([...this.poses.values()].reduce(
      (n, p) =>
        n +
        (p === state ? next : p.commands).reduce(
          (a, e) =>
            a + (e.command.kind === "patch" ? e.command.pixels.length : 0),
          0,
        ),
      0,
    ) <=
      MAX_TOTAL_PATCH_PIXELS, "This draft exceeds its reviewed-paint pixel budget.");
    state.commands = next;
    state.decision = "pending";
    recompute(state);
    this.revision++;
    return this.view(state);
  }
  stroke(frameId: number, stroke: MaskStroke): MaskPoseView {
    const state = this.ensure(frameId),
      cmd = command(
        { kind: "brush", ...stroke },
        this.width,
        this.height,
      ) as MaskCommand & { kind: "brush" };
    if (cmd.mode === "cloth") {
      const s = cmd.sample!,
        i = Math.round(s.y) * this.width + Math.round(s.x);
      require(state.baseOwnership[i] &&
        state.baseCloth.pixels[
          i * 4 + 3
        ], "Sample an opaque pixel from the original selected clothing, not newly painted pixels.");
    }
    return this.append(state, { command: cmd, origin: "manual" });
  }
  applyReviewedPatch(
    frameId: number,
    pixels: MaskPaintPixel[],
    reason = "Explicit native clothing paint, manually reviewed.",
  ): MaskPoseView {
    const state = this.ensure(frameId),
      cmd = command({ kind: "patch", pixels, reason }, this.width, this.height);
    return this.append(state, { command: cmd, origin: "manual" });
  }
  undo(frameId: number): MaskPoseView {
    const state = this.ensure(frameId);
    state.commands = state.commands.slice(0, -1);
    if (!state.commands.some((c) => c.origin === "propagated"))
      state.proposal = undefined;
    state.decision = "pending";
    recompute(state);
    this.revision++;
    return this.view(state);
  }
  reset(frameId: number): MaskPoseView {
    const state = this.ensure(frameId);
    state.commands = [];
    state.proposal = undefined;
    state.warnings = [];
    state.decision = "pending";
    recompute(state);
    this.revision++;
    return this.view(state);
  }
  decide(frameId: number, decision: MaskDecision): MaskPoseView {
    const state = this.ensure(frameId);
    require(["pending", "accepted", "rejected"].includes(
      decision,
    ), "Choose a valid pose decision.");
    require(decision !== "accepted" ||
      state.stats.changedPixels >
        0, "There are no changes to accept in this pose.");
    state.decision = decision;
    this.revision++;
    return this.view(state);
  }
  private proposalCommands(
    seed: PoseState,
    targetId: number,
  ): { commands: CommandEntry[]; warnings: string[] } {
    require(seed.frameId !==
      targetId, "A held drawing is the same pose, not a new suggestion.");
    const clip = this.project.archive.manifest.animations[this.binding.action]!;
    require(clip.frames.some(
      (id, position) =>
        id === seed.frameId &&
        this.neighbors(position).some((p) => p.frameId === targetId),
    ), "Propagate only to an adjacent action pose; review it before continuing farther.");
    const from = this.project.registration.frames.find(
        (f) => f.frameId === seed.frameId,
      )!,
      to = this.project.registration.frames.find(
        (f) => f.frameId === targetId,
      )!;
    const transform = maskAnchorTransform(from, to),
      seedId = seed.frameId;
    // A blocked seed stroke must never become paint at a different protected edge.
    const mappedClip = new Map<number, Point>();
    for (let i = 0; i < seed.ownership.length; i++) {
      const a = seed.baseOwnership[i],
        b = seed.ownership[i];
      if (
        a === b &&
        (!b ||
          [0, 1, 2, 3].every(
            (c) =>
              seed.baseCloth.pixels[i * 4 + c] === seed.cloth.pixels[i * 4 + c],
          ))
      )
        continue;
      const p = transform.map({
          x: i % this.width,
          y: Math.floor(i / this.width),
        }),
        x = Math.round(p.x),
        y = Math.round(p.y);
      if (x >= 0 && y >= 0 && x < this.width && y < this.height)
        mappedClip.set(y * this.width + x, { x, y });
    }
    require(mappedClip.size > 0 &&
      mappedClip.size <=
        MAX_TOTAL_PATCH_PIXELS, "The effective repair is empty or too large to propagate; use a smaller edit.");
    const propagationClip = [...mappedClip.values()];
    const commands: CommandEntry[] = [];
    for (const entry of seed.commands) {
      const c = entry.command;
      if (c.kind === "patch") {
        const mapped = new Map<number, MaskPaintPixel>();
        for (const p of c.pixels) {
          const q = transform.map(p),
            x = Math.round(q.x),
            y = Math.round(q.y);
          if (x >= 0 && y >= 0 && x < this.width && y < this.height)
            mapped.set(y * this.width + x, { ...p, x, y });
        }
        if (mapped.size)
          commands.push({
            command: {
              kind: "patch",
              reason:
                `Anchor suggestion from pose ${seedId}: ${c.reason}`.slice(
                  0,
                  1000,
                ),
              pixels: [...mapped.values()],
            },
            origin: "propagated",
            seedFrameId: seedId,
          });
      } else {
        const points = c.points
          .map(transform.map)
          .filter(
            (p) =>
              p.x >= 0 && p.y >= 0 && p.x < this.width && p.y < this.height,
          );
        const sample = c.sample ? transform.map(c.sample) : undefined;
        if (
          !points.length ||
          (sample &&
            (sample.x < 0 ||
              sample.y < 0 ||
              sample.x >= this.width ||
              sample.y >= this.height))
        )
          continue;
        commands.push({
          command: {
            kind: "brush",
            mode: c.mode,
            points,
            radius: Math.max(1, Math.min(48, c.radius * transform.scale)),
            ...(sample ? { sample } : {}),
          },
          origin: "propagated",
          seedFrameId: seedId,
        });
      }
    }

    for (const entry of commands) entry.command.clip = propagationClip;
    return { commands, warnings: transform.warnings };
  }

  async propose(seedId: number, targetId: number): Promise<MaskPoseView> {
    const seed = this.ensure(seedId);
    require(seed.stats.changedPixels > 0 &&
      seed.commands
        .length, "Edit a seed pose before suggesting its neighbors.");
    require(seedId !==
      targetId, "A held drawing is the same pose, not a new suggestion.");
    const clip = this.project.archive.manifest.animations[this.binding.action]!;
    require(clip.frames.some(
      (id, position) =>
        id === seedId &&
        this.neighbors(position).some((p) => p.frameId === targetId),
    ), "Propagate only to an adjacent action pose; review it before continuing farther.");
    const from = this.project.registration.frames.find(
        (f) => f.frameId === seedId,
      )!,
      to = this.project.registration.frames.find(
        (f) => f.frameId === targetId,
      )!;
    maskAnchorTransform(from, to);
    const revision = this.revision;
    await this.loadPose(targetId);
    this.check();
    require(this.revision ===
      revision, "The draft changed while preparing a suggestion; try again.");
    const target = this.ensure(targetId);
    require(!target.commands
      .length, "This target already has edits. Reset it explicitly before replacing them with a suggestion.");
    const { commands, warnings } = this.proposalCommands(seed, targetId);
    require(commands.length, "The suggestion falls outside this source pose; edit it manually.");
    commandBudget(commands);
    require([...this.poses.values()].reduce(
      (n, p) =>
        n +
        (p === target
          ? estimatedWork(commands) + estimatedWork(seed.commands)
          : poseWork(p)),
      0,
    ) <=
      24_000_000, "This draft exceeds its brush work budget. Split the repair into smaller batches.");
    require([...this.poses.values()].reduce(
      (n, p) =>
        n +
        (p === target ? commands : p.commands).reduce(
          (a, e) =>
            a + (e.command.kind === "patch" ? e.command.pixels.length : 0),
          0,
        ),
      0,
    ) <=
      MAX_TOTAL_PATCH_PIXELS, "This draft exceeds its reviewed-paint pixel budget.");
    target.commands = commands;
    target.proposal = {
      seedFrameId: seedId,
      seedCommands: structuredClone(seed.commands.map((e) => e.command)),
    };
    target.warnings = warnings;
    target.decision = "pending";
    recompute(target);
    this.revision++;
    if (target.stats.blockedPixels)
      target.warnings.push(
        `${target.stats.blockedPixels} suggested pixels were blocked by protection, source transparency or unavailable cloth sampling.`,
      );
    if (!target.stats.changedPixels)
      target.warnings.push(
        "No editable cloth was reached. Reject this suggestion or edit the pose manually.",
      );
    return this.view(target);
  }
  serialize(): Uint8Array {
    this.check();
    const poses: DraftPose[] = [...this.poses.values()]
      .filter((p) => p.commands.length)
      .map((p) => ({
        frameId: p.frameId,
        decision: p.decision,
        commands: p.commands,
        warnings: p.warnings,
        ...(p.proposal ? { proposal: p.proposal } : {}),
      }));
    const bytes = strToU8(
      JSON.stringify({
        format: "gathria-mask-edit-draft",
        version: 1,
        binding: this.binding,
        poses,
      }),
    );
    require(bytes.length <=
      MASK_MAX_DRAFT_BYTES, "The mask draft exceeds 4 MiB.");
    return bytes;
  }
  async restore(input: Uint8Array): Promise<void> {
    this.check();
    require(input instanceof Uint8Array &&
      input.length > 0 &&
      input.length <= MASK_MAX_DRAFT_BYTES, "Choose a mask draft up to 4 MiB.");
    const revision = this.revision,
      data = wardrobeObject(
        JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            new Uint8Array(input),
          ),
        ),
        "Mask draft",
        ["format", "version", "binding", "poses"],
      );
    require(data.format === "gathria-mask-edit-draft" &&
      data.version === 1, "Unsupported mask draft version.");
    const binding = wardrobeObject(data.binding, "Mask binding", [
      "sourceSha256",
      "registrationSha256",
      "itemId",
      "itemSha256",
      "action",
      "position",
      "necklinePermissionProfile",
    ]);
    require(Object.keys(binding).length === Object.keys(this.binding).length &&
      Object.entries(this.binding).every(
        ([k, v]) => k === "position" || binding[k] === v,
      ), "This draft belongs to a different source, clothing revision, action or neckline permission. Open the matching clothing and settings first.");
    integer(
      binding.position,
      0,
      this.project.archive.manifest.animations[this.binding.action]!.frames
        .length - 1,
      "Saved initial action position",
    );
    require(Array.isArray(data.poses) &&
      data.poses.length <=
        MASK_MAX_POSES, `A mask draft may contain at most ${MASK_MAX_POSES} poses.`);
    const seen = new Set<number>();
    let totalPatchPixels = 0,
      totalWork = 0;
    const plans = data.poses.map((raw): DraftPose => {
      const p = wardrobeObject(raw, "Draft pose", [
        "frameId",
        "decision",
        "commands",
        "warnings",
        "proposal",
      ]);
      const frameId = integer(p.frameId, 0, Number.MAX_SAFE_INTEGER, "Pose ID");
      require(this.frameIds.includes(frameId) &&
        !seen.has(
          frameId,
        ), "Draft poses must be unique and belong to this action.");
      seen.add(frameId);
      require(["pending", "accepted", "rejected"].includes(
        String(p.decision),
      ), "Invalid saved pose decision.");
      require(Array.isArray(p.commands) &&
        p.commands.length > 0 &&
        p.commands.length <= MAX_COMMANDS, "Invalid saved command count.");
      require(Array.isArray(p.warnings) &&
        p.warnings.length <= 16 &&
        p.warnings.every(
          (w) => typeof w === "string" && w.length <= 1000,
        ), "Invalid saved review warnings.");
      const commands = p.commands.map((raw): CommandEntry => {
        const e = wardrobeObject(raw, "Draft command", [
          "command",
          "origin",
          "seedFrameId",
        ]);
        require(e.origin === "manual" ||
          e.origin === "propagated", "Invalid edit origin.");
        const c = command(e.command, this.width, this.height);
        const seedFrameId =
          e.seedFrameId === undefined
            ? undefined
            : integer(e.seedFrameId, 0, Number.MAX_SAFE_INTEGER, "Seed pose");
        require(e.origin !== "propagated" ||
          (seedFrameId !== undefined &&
            this.frameIds.includes(
              seedFrameId,
            )), "A propagated command must record its source pose.");
        if (c.kind === "patch") totalPatchPixels += c.pixels.length;
        return {
          command: c,
          origin: e.origin,
          ...(seedFrameId === undefined ? {} : { seedFrameId }),
        };
      });
      commandBudget(commands);
      totalWork += estimatedWork(commands);
      let proposal: ProposalProof | undefined;
      if (p.proposal !== undefined) {
        const proof = wardrobeObject(p.proposal, "Propagation proof", [
          "seedFrameId",
          "seedCommands",
        ]);
        const seedFrameId = integer(
          proof.seedFrameId,
          0,
          Number.MAX_SAFE_INTEGER,
          "Proof seed pose",
        );
        require(this.frameIds.includes(seedFrameId) &&
          seedFrameId !==
            frameId, "A propagation proof must name another action pose.");
        require(Array.isArray(proof.seedCommands) &&
          proof.seedCommands.length > 0 &&
          proof.seedCommands.length <=
            MAX_COMMANDS, "Invalid propagation seed snapshot.");
        const seedCommands = proof.seedCommands.map((c) =>
          command(c, this.width, this.height),
        );
        const seedEntries: CommandEntry[] = seedCommands.map((c) => ({
          command: c,
          origin: "manual",
        }));
        commandBudget(seedEntries);
        totalWork += estimatedWork(seedEntries);
        proposal = { seedFrameId, seedCommands };
      }
      require(Boolean(proposal) ===
        commands.some(
          (c) => c.origin === "propagated",
        ), "Propagated edits require their verifiable seed snapshot.");
      return {
        frameId,
        commands,
        decision: p.decision as MaskDecision,
        warnings: p.warnings as string[],
        ...(proposal ? { proposal } : {}),
      };
    });
    require(totalPatchPixels <=
      MAX_TOTAL_PATCH_PIXELS, "This draft exceeds its reviewed-paint pixel budget.");
    require(totalWork <=
      24_000_000, "This saved draft exceeds its brush work budget; no changes were applied.");
    const next = new Map<number, PoseState>();
    for (const plan of plans) {
      const state = await this.fresh(plan.frameId);
      if (plan.proposal) {
        const seed = await this.fresh(plan.proposal.seedFrameId);
        seed.commands = plan.proposal.seedCommands.map((c) => ({
          command: c,
          origin: "manual",
        }));
        recompute(seed);
        const expected = this.proposalCommands(seed, plan.frameId).commands;
        const propagated = plan.commands.filter(
          (c) => c.origin === "propagated",
        );
        require(propagated.length <= expected.length &&
          propagated.every(
            (entry, index) =>
              JSON.stringify(entry) === JSON.stringify(expected[index]),
          ), "The saved propagation does not match its seed and registered anchors.");
        require(!plan.commands.some(
          (entry, index) =>
            entry.origin === "propagated" &&
            plan.commands.slice(0, index).some((e) => e.origin === "manual"),
        ), "Manual strokes cannot precede a saved propagation proof.");
        state.proposal = plan.proposal;
      }
      state.commands = plan.commands;
      state.decision = plan.decision;
      state.warnings = [...plan.warnings];
      recompute(state);
      require(state.decision !== "accepted" ||
        state.stats.changedPixels >
          0, "An accepted saved pose has no valid editable changes.");
      next.set(state.frameId, state);
    }
    this.check();
    require(this.revision ===
      revision, "The draft changed during import. No saved edits were applied.");
    this.poses = next;
    this.revision++;
  }
  async build(
    output: { id: string; name: string },
    options: SourcePreparationOptions = {},
  ): Promise<{ bytes: Uint8Array; report: MaskBuildReport }> {
    this.check(options);
    require(typeof output.id === "string" &&
      /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(output.id) &&
      !this.project.items.some(
        (i) => i.manifest.id === output.id,
      ), "Give the candidate a new unused clothing ID (1–64 letters, numbers, dots, underscores or hyphens).");
    require(typeof output.name === "string" &&
      output.name.trim().length > 0 &&
      output.name.length <=
        120, "Give the candidate a name of 1–120 characters.");
    const accepted = [...this.poses.values()]
      .filter((p) => p.decision === "accepted" && p.stats.changedPixels)
      .sort((a, b) => a.frameId - b.frameId);
    require(accepted.length >
      0, "Accept at least one changed pose before building clothing.");
    const revision = this.revision,
      check = () => {
        this.check(options);
        require(this.revision ===
          revision, "The draft changed during build. Build the reviewed poses again.");
      };
    const draft = this.serialize(),
      draftSha256 = await sha256(draft);
    check();
    const changedIds = new Set(accepted.map((p) => p.frameId));
    const retainedPages = [
      ...new Set(
        this.item.manifest.frames
          .filter((f) => !changedIds.has(f.frameId))
          .map((f) => f.page),
      ),
    ].sort((a, b) => a - b);
    require(retainedPages.length <
      WARDROBE_MAX_PAGES, "This clothing already fills all atlas pages. Use the full authoring workflow to repack it before mask editing.");
    const pageMap = new Map(retainedPages.map((old, i) => [old, i]));
    const pages = retainedPages.map((old, i) => ({
      ...this.item.manifest.pages[old],
      file: `patches-${i}.png` as const,
      maskFile: `ownership-${i}.png` as const,
    }));
    const files: Record<string, Uint8Array> = {};
    for (const [old, index] of pageMap) {
      files[`patches-${index}.png`] = this.item.pages[old].patch;
      files[`ownership-${index}.png`] = this.item.pages[old].ownership;
    }
    const crops = accepted.map((state) => {
      let x0 = this.width,
        y0 = this.height,
        x1 = -1,
        y1 = -1;
      for (let y = 0; y < this.height; y++)
        for (let x = 0; x < this.width; x++)
          if (state.ownership[y * this.width + x]) {
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
          }
      if (x1 < x0) return { state, x: 0, y: 0, width: 1, height: 1 };
      return { state, x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
    });
    const atlasWidth = Math.max(...crops.map((c) => c.width)),
      atlasHeight = crops.reduce((n, c) => n + c.height, 0);
    require(atlasWidth <= 8192 &&
      atlasHeight <=
        8192, "The edited poses exceed one atlas page; split this repair into smaller batches.");
    require(pages.reduce((n, p) => n + p.width * p.height, 0) +
      atlasWidth * atlasHeight <=
      WARDROBE_MAX_ITEM_PIXELS, "The edited clothing exceeds the decoded pixel budget.");
    const image: RgbaPng = {
        width: atlasWidth,
        height: atlasHeight,
        pixels: new Uint8Array(atlasWidth * atlasHeight * 4),
        colorChunks: accepted[0].baseCloth.colorChunks.map(
          (c) => new Uint8Array(c),
        ),
      },
      mask: RgbaPng = {
        ...image,
        pixels: new Uint8Array(image.pixels.length),
        colorChunks: [],
      };
    const replacements = new Map<
      number,
      WardrobeGarmentManifest["frames"][number]
    >();
    let top = 0;
    for (const c of crops) {
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          const src = (c.y + y) * this.width + c.x + x,
            dst = ((top + y) * atlasWidth + x) * 4;
          if (c.state.ownership[src]) {
            image.pixels.set(
              c.state.cloth.pixels.subarray(src * 4, src * 4 + 4),
              dst,
            );
            mask.pixels.fill(255, dst, dst + 4);
          }
        }
      replacements.set(c.state.frameId, {
        frameId: c.state.frameId,
        page: pages.length,
        rect: { x: 0, y: top, width: c.width, height: c.height },
        offset: { x: c.x, y: c.y },
      });
      top += c.height;
    }
    const pageIndex = pages.length;
    pages.push({
      file: `patches-${pageIndex}.png`,
      maskFile: `ownership-${pageIndex}.png`,
      width: atlasWidth,
      height: atlasHeight,
    });
    files[`patches-${pageIndex}.png`] = await encodeSourceRgbaPngAsync(image);
    check();
    files[`ownership-${pageIndex}.png`] = await encodeSourceRgbaPngAsync(mask);
    check();
    const manifest = validateWardrobeGarmentManifest(
      {
        ...this.effective,
        id: output.id,
        name: output.name.trim(),
        pages,
        frames: this.item.manifest.frames.map(
          (f) =>
            replacements.get(f.frameId) ?? { ...f, page: pageMap.get(f.page)! },
        ),
        provenance:
          `Mask workbench revision of ${this.item.manifest.id} (${this.item.sha256}). Source and registration unchanged. Accepted poses ${accepted.map((p) => p.frameId).join(", ")}; draft SHA256 ${draftSha256}. Native RGB from explicit cloth sampling/paint; source alpha retained on edited pixels. Every propagated pose requires explicit acceptance.\n${this.item.manifest.provenance}`.slice(
            0,
            8192,
          ),
      },
      this.project.registration,
      this.project.document.registrationSha256,
    );
    files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2) + "\n");
    await yieldTask();
    check();
    const bytes = zipSync(files, {
      level: 6,
      mtime: new Date(2020, 0, 1, 0, 0, 0),
    });
    require(bytes.length <=
      WARDROBE_MAX_ITEM_BYTES, "The clothing exceeds the 64 MiB file limit.");
    const result = await readWardrobeGarment(
      bytes,
      this.project.registration,
      this.project.document.registrationSha256,
      options,
    );
    check();
    const report: MaskBuildReport = {
      format: "gathria-mask-edit-report",
      version: 1,
      binding: { ...this.binding },
      output: { id: manifest.id, name: manifest.name, sha256: result.sha256 },
      draftSha256,
      accepted: [],
      excluded: [...this.poses.values()]
        .filter((p) => p.commands.length && p.decision !== "accepted")
        .map((p) => ({ frameId: p.frameId, decision: p.decision })),
      rules:
        "Only explicitly accepted poses are rebuilt. Source, registration, timing and unrequested pose pixels remain unchanged. New owned pixels retain source alpha; head/hand protection applies except the exact source-bound reviewed cloth permission. Suggestions are anchor-guided candidates, not automatic garment recognition or visual approval.",
    };
    for (const p of accepted)
      report.accepted.push({
        ...this.summaryOf(p),
        beforeSha256: await sha256(compose(p, false).pixels),
        afterSha256: await sha256(compose(p, true).pixels),
        ownershipSha256: await sha256(p.ownership),
      });
    check();
    return { bytes, report };
  }
  dispose(): void {
    if (!this.disposed) {
      this.disposed = true;
      this.poses.clear();
      this.sourceRenderer.dispose();
    }
  }
}

export async function createMaskEditSession(
  project: WardrobeProject,
  itemId: string,
  action: PortableAnimationName,
  position: number,
  options: SourcePreparationOptions & {
    necklinePermissionProfile?: string;
  } = {},
): Promise<MaskEditSession> {
  assertSourcePreparationActive(options);
  const item = project.items.find((i) => i.manifest.id === itemId);
  require(item &&
    item.manifest.slot !== "shoes" &&
    Object.values(project.document.selection).includes(
      itemId,
    ), "Wear the top, bottom or dress you want to repair first.");
  const sourceProject: WardrobeProject = {
    ...project,
    appearanceBank: undefined,
    document: {
      format: "gathria-wardrobe-project",
      version: 1,
      sourceSha256: project.document.sourceSha256,
      registrationSha256: project.document.registrationSha256,
      items: project.document.items,
      selection: { top: null, bottom: null, fullBody: null, shoes: null },
      preview: project.document.preview,
    },
  };
  const verified = await validateWardrobeProject(sourceProject, {
    ...options,
    decodeGarments: false,
  });
  const verifiedItem = verified.items.find((i) => i.manifest.id === itemId)!;
  require(verifiedItem &&
    verifiedItem.manifest.slot !==
      "shoes", "Mask repair supports a verified top, bottom or dress.");
  require(verifiedItem.manifest.frameWidth *
    verifiedItem.manifest.frameHeight <=
    MASK_MAX_NATIVE_PIXELS, "This source exceeds the mask workbench native-pixel budget; use the full authoring workflow.");
  const isolatedItem: WardrobeGarment = {
    ...verifiedItem,
    bytes: new Uint8Array(verifiedItem.bytes),
    manifest: structuredClone(verifiedItem.manifest),
    pages: verifiedItem.pages.map((p) => ({
      patch: new Uint8Array(p.patch),
      ownership: new Uint8Array(p.ownership),
    })),
  };
  const renderer = await createWardrobeCompositor(verified, options);
  try {
    const session = new MaskEditSession(
      verified,
      isolatedItem,
      renderer,
      action,
      position,
      options,
    );
    await session.loadPose(
      verified.archive.manifest.animations[action]!.frames[position],
    );
    return session;
  } catch (error) {
    renderer.dispose();
    throw error;
  }
}
