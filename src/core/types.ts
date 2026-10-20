export type AnimationName = "idle" | "walk" | "run";
/** Portable playback can include actions outside legacy character configurations. */
export type PlaybackAnimationName = AnimationName | "jump";
/** Source playback is independent of the legacy skeletal/configuration actions. */
export type PortableAnimationName = PlaybackAnimationName | "celebrate";
export type Facing = "left" | "right";
export type Hairstyle = "crop" | "bob" | "waves" | "mohawk";
export type LegacyUpperClothing = "tee" | "hoodie" | "jacket";
export type LegacyLowerClothing = "trousers" | "shorts" | "skirt";
export type UpperClothing = LegacyUpperClothing | "suit" | "bodice";
export type LowerClothing = LegacyLowerClothing | "dress";
export type FaceVariant = "heart" | "oval" | "round";
interface CharacterAppearance {
  name: string;
  skinTone: string;
  hairstyle: Hairstyle;
  hairColor: string;
  upperClothing: UpperClothing;
  upperColor: string;
  lowerClothing: LowerClothing;
  lowerColor: string;
  shoeColor: string;
}
/** V1 always uses the original artwork, including when reopened and edited. */
export interface LegacyCharacterConfig extends CharacterAppearance {
  schemaVersion: 1;
  upperClothing: LegacyUpperClothing;
  lowerClothing: LegacyLowerClothing;
}
export interface ArtV2CharacterConfig extends CharacterAppearance {
  schemaVersion: 2;
  artworkVersion: 2;
  faceVariant: FaceVariant;
}
export interface ArtV3CharacterConfig extends CharacterAppearance {
  schemaVersion: 2;
  artworkVersion: 3;
  faceVariant: FaceVariant;
}
export interface ArtV4CharacterConfig
  extends Omit<ArtV3CharacterConfig, "artworkVersion"> {
  artworkVersion: 4;
  expression: "gentle" | "joyful";
  hairAccessory: "none" | "flowers";
}
export interface ArtV5CharacterConfig
  extends Omit<ArtV4CharacterConfig, "artworkVersion" | "expression"> {
  artworkVersion: 5;
  expression: "neutral" | "gentle" | "joyful";
}
export interface ArtV6CharacterConfig
  extends Omit<ArtV5CharacterConfig, "artworkVersion"> {
  artworkVersion: 6;
  /** Explicit opt-in; omitted on historical V6 configurations. */
  motionVersion?: 1 | 2 | 3;
  /** Saved playback choice, supported by explicit motion versions only. */
  preview?: { animation: AnimationName; facing: Facing };
}
export interface ArtV7CharacterConfig
  extends Omit<
    ArtV6CharacterConfig,
    "artworkVersion" | "motionVersion" | "preview"
  > {
  artworkVersion: 7;
}
export interface RunningCharacterConfig extends ArtV6CharacterConfig {
  motionVersion: 1;
}
export interface CompactRunningCharacterConfig extends ArtV6CharacterConfig {
  motionVersion: 2;
}
export interface CorrectedRunningCharacterConfig extends ArtV6CharacterConfig {
  motionVersion: 3;
}
export type CharacterConfig =
  | LegacyCharacterConfig
  | ArtV2CharacterConfig
  | ArtV3CharacterConfig
  | ArtV4CharacterConfig
  | ArtV5CharacterConfig
  | ArtV6CharacterConfig
  | ArtV7CharacterConfig;
export interface SpriteFrame {
  /** V3 atlas page; V1/V2 frames use the primary image. */
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
export interface CharacterPackManifest {
  schemaVersion: 1;
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
  };
  facing: { native: "right"; right: "none"; left: "mirror-x" };
  anchor: { x: number; y: number; units: "pixels"; origin: "top-left" };
  scale: { pixelArt: true; recommended: number; integerOnly: true };
  configuration: "character.json";
}
/** Native source pixels: this pack does not promise editable skeletal appearance. */
export interface CharacterPackV2Manifest
  extends Omit<
    CharacterPackManifest,
    "schemaVersion" | "animations" | "scale"
  > {
  schemaVersion: 2;
  animations: Record<"idle" | "walk", Animation> & {
    run?: Animation;
    jump?: Animation;
    celebrate?: Animation;
  };
  scale: { pixelArt: false; recommended: number; integerOnly: false };
  capabilities: { renderMode: "baked"; editableAppearance: false };
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
export type BakedCharacterPackManifest =
  | CharacterPackV2Manifest
  | CharacterPackV3Manifest;
export type PortableCharacterPackManifest =
  | CharacterPackManifest
  | BakedCharacterPackManifest;
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
export interface GeneratedCharacter {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  manifest: CharacterPackManifest;
}
export interface CharacterGenerator {
  readonly id: string;
  generate(config: CharacterConfig): GeneratedCharacter;
}
