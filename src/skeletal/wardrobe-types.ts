import type { ArtV6CharacterConfig } from "../core/types";
import type {
  ActionForearms,
  JointTriple,
  Point,
  SkinMetadata,
  Slot,
} from "./types";

export type WardrobeIdentityId = "crop" | "waves";
export type WardrobeTopId = "denim-jacket" | "soft-top";
export type WardrobeBottomId = "trousers" | "short-skirt";
export type WardrobeShoesId = "boots" | "flats";
export type WardrobeColor = "skin" | "top" | "bottom" | "shoes";

/** A recipe is an opt-in authoring extension. Old flat skins have no recipe,
 * and a detached/custom PNG is never guessed back into the catalog. */
interface WardrobeRecipeBase {
  format: "gathria-wardrobe-recipe";
  catalogVersion: 1;
  identity: WardrobeIdentityId;
  colors: Record<WardrobeColor, string>;
}
export interface WardrobeRecipeV1 extends WardrobeRecipeBase {
  version: 1;
  top: WardrobeTopId;
  bottom: WardrobeBottomId;
  shoes: WardrobeShoesId;
}
/** V2 resolves clothing IDs against the self-contained project item library.
 * Built-in identities and catalog 1 remain frozen. */
export interface WardrobeRecipeV2 extends WardrobeRecipeBase {
  version: 2;
  top: string;
  bottom: string;
  shoes: string;
}
export type WardrobeRecipe = WardrobeRecipeV1 | WardrobeRecipeV2;

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

export type WardrobeItemGroup = "top" | "bottom" | "shoes";
interface CustomWardrobeItemBase {
  format: "gathria-wardrobe-item";
  rigId: "gathria-v6-humanoid-1";
  id: string;
  name: string;
  provenance: string;
  parts: EncodedWardrobePart[];
}
export type CustomWardrobeItemV1 = CustomWardrobeItemBase & { version: 1 } & (
    | {
        group: "top";
        chains: { nearArm: JointTriple; farArm: JointTriple };
      }
    | {
        group: "bottom";
        chains: { nearLeg: JointTriple; farLeg: JointTriple };
      }
    | { group: "shoes"; ankles: { near: Point; far: Point } }
  );
/** Action-specific forearms use the same source arm registration as the rest
 * pair. Explicit V2 prevents older items silently changing their posed art. */
export type CustomWardrobeItemV2 = CustomWardrobeItemBase & {
  version: 2;
  group: "top";
  chains: { nearArm: JointTriple; farArm: JointTriple };
  actionForearms: ActionForearms;
};
export type CustomWardrobeItem = CustomWardrobeItemV1 | CustomWardrobeItemV2;

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
