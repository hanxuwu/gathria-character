import type { ArtV6CharacterConfig } from "../core/types";
import type { JointTriple, Point, SkinMetadata, Slot } from "./types";

export type WardrobeIdentityId = "crop" | "waves";
export type WardrobeTopId = "denim-jacket" | "soft-top";
export type WardrobeBottomId = "trousers" | "short-skirt";
export type WardrobeShoesId = "boots" | "flats";
export type WardrobeColor = "skin" | "top" | "bottom" | "shoes";

/** A recipe is an opt-in authoring extension. Old flat skins have no recipe,
 * and a detached/custom PNG is never guessed back into the catalog. */
export interface WardrobeRecipe {
  format: "gathria-wardrobe-recipe";
  version: 1;
  catalogVersion: 1;
  identity: WardrobeIdentityId;
  top: WardrobeTopId;
  bottom: WardrobeBottomId;
  shoes: WardrobeShoesId;
  colors: Record<WardrobeColor, string>;
}

export type WardrobeMaterial = "skin" | "hair" | "upper" | "lower" | "shoe";

/** Checked-in, offline-prepared data: zlib-compressed 192 × 256 pixels, each
 * with RGBA and one semantic byte (0=fixed, 1=skin, 2=hair, 3=upper,
 * 4=lower, 5=shoe). Runtime assembly never classifies pixels by color. */
export interface EncodedWardrobePart {
  slot: Slot;
  data: string;
  palette: Partial<Record<WardrobeMaterial, string>>;
  preserveWarmSkin: boolean;
  sourceLayerId: string;
}

export interface WardrobeIdentity {
  id: WardrobeIdentityId;
  name: string;
  parts: EncodedWardrobePart[];
  jaw: SkinMetadata["bindings"]["jaw"];
  sourceAppearance: ArtV6CharacterConfig;
}
export interface WardrobeTop {
  id: WardrobeTopId;
  name: string;
  parts: EncodedWardrobePart[];
  chains: { nearArm: JointTriple; farArm: JointTriple };
}
export interface WardrobeBottom {
  id: WardrobeBottomId;
  name: string;
  parts: EncodedWardrobePart[];
  chains: { nearLeg: JointTriple; farLeg: JointTriple };
}
export interface WardrobeShoes {
  id: WardrobeShoesId;
  name: string;
  parts: EncodedWardrobePart[];
  ankles: { near: Point; far: Point };
}
export interface WardrobeAssets {
  format: "gathria-wardrobe-assets";
  version: 1;
  catalogVersion: 1;
  identities: WardrobeIdentity[];
  tops: WardrobeTop[];
  bottoms: WardrobeBottom[];
  shoes: WardrobeShoes[];
  provenance: string;
}
