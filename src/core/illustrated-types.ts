import type { Point } from "./pixel-art";

export type IllustratedMaterial = "skin" | "hair" | "upper" | "lower" | "shoe";
export const MATERIAL_NAMES = [
  "fixed",
  "skin",
  "hair",
  "upper",
  "lower",
  "shoe",
] as const;

/** A losslessly packed, offline-prepared sprite layer. The five bytes per pixel
 * are RGBA followed by a material id. Alpha is always either 0 or 255. */
export interface IllustratedLayer {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: string;
  palette: Partial<Record<IllustratedMaterial, string>>;
}

export interface IllustratedBody {
  torso: string;
  nearUpperArm: string;
  nearForearm: string;
  farUpperArm: string;
  farForearm: string;
  shoulderNear: Point;
  elbowNear: Point;
  wristNear: Point;
  shoulderFar: Point;
  elbowFar: Point;
  wristFar: Point;
}

export interface IllustratedLegs {
  hips: string;
  nearThigh: string;
  nearShin: string;
  nearShoe: string;
  farThigh: string;
  farShin: string;
  farShoe: string;
  garment?: string;
  hipNear: Point;
  kneeNear: Point;
  ankleNear: Point;
  hipFar: Point;
  kneeFar: Point;
  ankleFar: Point;
}

export interface IllustratedPortrait {
  head: string;
  backHair?: string;
  faceCenter: Point;
  jawStart: number;
  eyes: readonly [
    readonly [number, number, number, number],
    readonly [number, number, number, number],
  ];
}

export interface IllustratedAssetBank {
  format: 1;
  frameWidth: 192;
  frameHeight: 256;
  layers: IllustratedLayer[];
  upper: Record<
    "tee" | "hoodie" | "jacket" | "suit" | "bodice",
    IllustratedBody
  >;
  lower: Record<"trousers" | "shorts" | "skirt" | "dress", IllustratedLegs>;
  formalTrousers: IllustratedLegs;
  portraits: Record<"crop" | "bob" | "waves" | "mohawk", IllustratedPortrait>;
}
