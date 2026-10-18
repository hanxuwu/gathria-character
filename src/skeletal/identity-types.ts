import type { ArtV6CharacterConfig } from "../core/types";
import type { EncodedWardrobePart } from "./wardrobe-types";
import type { SkinMetadata } from "./types";

/** Offline-authored identity sources registered to the frozen V6 humanoid.
 * Clothing, limbs and motion never belong to an identity. */
export interface CustomWardrobeIdentity {
  format: "gathria-character-identity";
  version: 1;
  rigId: "gathria-v6-humanoid-1";
  id: string;
  name: string;
  provenance: string;
  frame: { width: 192; height: 256 };
  anchor: readonly [96, 240];
  neck: readonly [96, 118];
  jaw: SkinMetadata["bindings"]["jaw"];
  hairSway: number;
  palette: { skin: string; hair: string };
  /** Export compatibility reference, never used to regenerate these heads. */
  sourceAppearance: ArtV6CharacterConfig;
  parts: EncodedWardrobePart[];
}

export const IDENTITY_SLOTS = [
  "head-neutral",
  "head-gentle",
  "head-joyful",
  "back-hair",
] as const;
