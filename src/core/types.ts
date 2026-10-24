export type PortableAnimationName =
  | "idle"
  | "walk"
  | "run"
  | "jump"
  | "celebrate";
export type Facing = "left" | "right";
export interface SpriteFrame {
  /** V3/V4 atlas page; V2 frames use the primary image. */
  page?: number;
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Animation {
  frames: number[];
  fps: number;
  loop: boolean;
}
export interface CharacterPackV2Manifest {
  schemaVersion: 2;
  format: "gathria-character-pack";
  name: string;
  generator: string;
  spritesheet: {
    file: "spritesheet.png";
    width: number;
    height: number;
    frameWidth: number;
    frameHeight: number;
    columns: number;
    rows: number;
  };
  frames: SpriteFrame[];
  animations: Record<"idle" | "walk", Animation> & {
    run?: Animation;
    jump?: Animation;
    celebrate?: Animation;
  };
  facing: { native: "right"; right: "none"; left: "mirror-x" };
  anchor: { x: number; y: number; units: "pixels"; origin: "top-left" };
  scale: { pixelArt: false; recommended: number; integerOnly: false };
  capabilities: { renderMode: "baked"; editableAppearance: false };
  configuration: "character.json";
}
/** Additional native pages keep original frame dimensions without oversized images. */
export interface CharacterPackV3Manifest
  extends Omit<CharacterPackV2Manifest, "schemaVersion" | "frames"> {
  schemaVersion: 3;
  additionalSheets: Array<
    Omit<CharacterPackV2Manifest["spritesheet"], "file"> & {
      file: `spritesheet-${number}.png`;
    }
  >;
  frames: Array<SpriteFrame & { page: number }>;
}
/** Authored pixel artwork. Unlike V3, a single page is valid; old V2/V3
 * manifests retain their smooth sampling contract and are never upgraded. */
export interface CharacterPackV4Manifest
  extends Omit<CharacterPackV3Manifest, "schemaVersion" | "scale"> {
  schemaVersion: 4;
  scale: { pixelArt: true; recommended: number; integerOnly: true };
}
export type BakedCharacterPackManifest =
  | CharacterPackV2Manifest
  | CharacterPackV3Manifest
  | CharacterPackV4Manifest;
export type PortableCharacterPackManifest = BakedCharacterPackManifest;
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
/** Reproducible source selection, never masquerading as a legacy wardrobe config. */
export interface BakedCharacterRecipe {
  format: "gathria-baked-character";
  schemaVersion: 1;
  name: string;
  characterId: string;
  source: {
    kind: "video-extraction" | "unified-archive";
    name: string;
    sha256: string;
  };
  provenance: string;
  derivation: {
    method: string;
    frames: Array<{
      frameId: number;
      sourceFrame: number;
      timeSeconds: number;
    }>;
  };
  sourceMetadata?: { [key: string]: JsonValue };
}
