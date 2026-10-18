import type {
  ArtV6CharacterConfig,
  AnimationName as LegacyAnimationName,
  PlaybackAnimationName,
  Facing,
} from "../core/types";
import type { Point } from "../core/pixel-art";
import type { CustomWardrobeItem, WardrobeRecipe } from "./wardrobe-types";
import type { CustomWardrobeIdentity } from "./identity-types";
export type AnimationName = PlaybackAnimationName;
export type { Point, Facing };
export const FRAME_WIDTH = 192,
  FRAME_HEIGHT = 256;
export const RIG_ID = "gathria-v6-humanoid-1";
export const REQUIRED_SLOTS = [
  "torso",
  "hips",
  "near-upper-arm",
  "near-forearm",
  "far-upper-arm",
  "far-forearm",
  "near-thigh",
  "near-shin",
  "near-shoe",
  "far-thigh",
  "far-shin",
  "far-shoe",
  "head-neutral",
  "head-gentle",
  "head-joyful",
] as const;
export const OPTIONAL_SLOTS = ["back-hair", "garment"] as const;
export const V1_SLOTS = [...REQUIRED_SLOTS, ...OPTIONAL_SLOTS] as const;
/** These registered alternatives replace complete forearms, including hands. */
export const ACTION_FOREARM_SLOTS = [
  "near-forearm-active",
  "far-forearm-active",
] as const;
export const V2_SLOTS = [...V1_SLOTS, ...ACTION_FOREARM_SLOTS] as const;
/** Complete cloth-only leg alternatives and independently registered run shoes. */
export const RUN_LEG_SLOTS = ["near-leg-bent", "far-leg-bent"] as const;
export const RUN_SHOE_SLOTS = ["near-shoe-run", "far-shoe-run"] as const;
export const ALL_SLOTS = [
  ...V2_SLOTS,
  ...RUN_LEG_SLOTS,
  ...RUN_SHOE_SLOTS,
] as const;
export type Slot = (typeof ALL_SLOTS)[number];
export type ForearmAction = "run" | "jump";
export type ActionForearms = Partial<
  Record<
    ForearmAction,
    {
      "near-forearm": "near-forearm-active";
      "far-forearm": "far-forearm-active";
    }
  >
>;
export const CHAINS = ["nearArm", "farArm", "nearLeg", "farLeg"] as const;
export type ChainName = (typeof CHAINS)[number];
export type JointTriple = readonly [Point, Point, Point];
export interface RunLegs {
  nearLeg: { slot: "near-leg-bent"; joints: JointTriple };
  farLeg: { slot: "far-leg-bent"; joints: JointTriple };
}
export interface RunShoes {
  nearLeg: { slot: "near-shoe-run"; ankle: Point };
  farLeg: { slot: "far-shoe-run"; ankle: Point };
}
/** V4 explicit footwear parenting: sourceShin→ankle registers the shoe's local leg axis. */
export interface ShinFollowRunShoes {
  nearLeg: { slot: "near-shoe-run"; ankle: Point; sourceShin: Point };
  farLeg: { slot: "far-shoe-run"; ankle: Point; sourceShin: Point };
}
export interface ShoeInspection {
  chain: "nearLeg" | "farLeg";
  sourceSlot: Slot;
  sourceAnkle: Point;
  sourceShin: Point;
  ankle: Point;
  rotation: number;
  matrix: readonly [number, number, number, number, number, number];
  sole: number;
  targetSole: number;
  supportError: number;
  ankleShift: number;
  searchSamples: number;
}
export type Expression = "neutral" | "gentle" | "joyful";
export interface BoneDefinition {
  id: string;
  parent: string | null;
  from: Point;
  to: Point;
}
export interface RigDefinition {
  format: "gathria-rig";
  version: 1;
  id: typeof RIG_ID;
  frame: { width: 192; height: 256 };
  anchor: Point;
  pivot: Point;
  bones: BoneDefinition[];
  chains: Record<ChainName, JointTriple>;
  drawOrder: (
    | Slot
    | "near-arm"
    | "far-arm"
    | "near-leg"
    | "far-leg"
    | "head"
  )[];
}
interface SkinMetadataBase {
  format: "gathria-skin-pack";
  id: string;
  name: string;
  rigId: typeof RIG_ID;
  /** Source landmarks also fit the common bone hierarchy to the garment cuts. */
  bindings: {
    chains: Record<ChainName, JointTriple>;
    offsets: Partial<Record<Slot, Point>>;
    mesh: {
      blendRadius: number;
      volume: number;
      /** Cleanly separated footwear permits a painted ankle allowance behind the shoe. */
      preserveAnkleOverlap?: true;
    };
    jaw: { center: Point; start: number; scale: number; length: number };
    hairSway: number;
    garmentSway: number;
  };
  /** Portable playback contract compatibility only. It cannot reproduce imported art. */
  sourceAppearance: ArtV6CharacterConfig;
  provenance: string;
  slots: Slot[];
}
export type SkinMetadata = SkinMetadataBase &
  (
    | { version: 1; actionForearms?: never; runLegs?: never; runShoes?: never }
    | {
        version: 2;
        actionForearms: ActionForearms;
        runLegs?: never;
        runShoes?: never;
      }
    | ({ version: 3; actionForearms?: ActionForearms } & (
        | { runLegs: RunLegs; runShoes?: RunShoes }
        | { runLegs?: RunLegs; runShoes: RunShoes }
      ))
    | {
        version: 4;
        actionForearms?: ActionForearms;
        runLegs?: RunLegs;
        runShoes: ShinFollowRunShoes;
      }
  );
export interface SkinPack {
  metadata: SkinMetadata;
  images: Partial<Record<Slot, Uint8ClampedArray>>;
}
export interface MotionKey {
  footX: number;
  footLift: number;
  shoePitch: number;
  bodyBob: number;
  armAngle: number;
  lean: number;
  armSwing: number;
  /** Jump-only whole-body translation; omitted in legacy poses. */
  rootY?: number;
  /** Jump-only elbow bend relative to the registered rest arm. */
  armBend?: number;
  /** Motion-library v2 run only: upper-body rotation relative to the pelvis. */
  torsoLean?: number;
}
export interface MotionClip {
  fps: number;
  loop: boolean;
  keys: MotionKey[];
  sequence: number[];
}
export interface MotionLibrary {
  format: "gathria-motion-library";
  /** V2 opts run into shared pelvis-relative feet and grounded shoe rotation.
   * Other actions retain v1 semantics; imports never upgrade implicitly. */
  version: 1 | 2;
  id: string;
  clips: Record<LegacyAnimationName, MotionClip> & { jump?: MotionClip };
}
export interface AuthoringProject {
  format: "gathria-rig-authoring";
  version: 1;
  rig: RigDefinition;
  motions: MotionLibrary;
  skin: SkinPack;
  /** Optional, explicitly selected catalog composition; flat skin pixels remain authoritative. */
  wardrobe?: WardrobeRecipe;
  /** Embedded registered clothing sources; projects never depend on a device catalog. */
  wardrobeItems?: CustomWardrobeItem[];
  /** Complete expression heads and masks, retained even after detaching a recipe. */
  wardrobeIdentities?: CustomWardrobeIdentity[];
  preview: { animation: AnimationName; facing: Facing; expression: Expression };
}
export interface RigInspection {
  shoes?: ShoeInspection[];
  bodyBones?: Array<{ id: string; from: Point; to: Point }>;
  limbs: Array<{
    id: string;
    /** The chosen cloth source; anatomical bones remain independent. */
    sourceSlots?: Slot[];
    variant?: "base" | "bent";
    bones: Point[];
    vertices: Point[];
    triangles: number[];
    weights: number[];
    rest: Point[];
  }>;
}
