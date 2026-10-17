import type {
  ArtV6CharacterConfig,
  AnimationName,
  Facing,
} from "../core/types";
import type { Point } from "../core/pixel-art";
export type { Point, AnimationName, Facing };
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
export const ALL_SLOTS = [...REQUIRED_SLOTS, ...OPTIONAL_SLOTS] as const;
export type Slot = (typeof ALL_SLOTS)[number];
export const CHAINS = ["nearArm", "farArm", "nearLeg", "farLeg"] as const;
export type ChainName = (typeof CHAINS)[number];
export type JointTriple = readonly [Point, Point, Point];
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
export interface SkinMetadata {
  format: "gathria-skin-pack";
  version: 1;
  id: string;
  name: string;
  rigId: typeof RIG_ID;
  /** Source landmarks also fit the common bone hierarchy to the garment cuts. */
  bindings: {
    chains: Record<ChainName, JointTriple>;
    offsets: Partial<Record<Slot, Point>>;
    mesh: { blendRadius: number; volume: number };
    jaw: { center: Point; start: number; scale: number; length: number };
    hairSway: number;
    garmentSway: number;
  };
  /** Portable playback contract compatibility only. It cannot reproduce imported art. */
  sourceAppearance: ArtV6CharacterConfig;
  provenance: string;
  slots: Slot[];
}
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
}
export interface MotionClip {
  fps: number;
  loop: true;
  keys: MotionKey[];
  sequence: number[];
}
export interface MotionLibrary {
  format: "gathria-motion-library";
  version: 1;
  id: string;
  clips: Record<AnimationName, MotionClip>;
}
export interface AuthoringProject {
  format: "gathria-rig-authoring";
  version: 1;
  rig: RigDefinition;
  motions: MotionLibrary;
  skin: SkinPack;
  preview: { animation: AnimationName; facing: Facing; expression: Expression };
}
export interface RigInspection {
  limbs: Array<{
    id: string;
    bones: Point[];
    vertices: Point[];
    triangles: number[];
    weights: number[];
    rest: Point[];
  }>;
}
