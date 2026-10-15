export type AnimationName = "idle" | "walk";
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
export type CharacterConfig =
  | LegacyCharacterConfig
  | ArtV2CharacterConfig
  | ArtV3CharacterConfig
  | ArtV4CharacterConfig
  | ArtV5CharacterConfig;
export interface SpriteFrame {
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
  animations: Record<AnimationName, Animation>;
  facing: { native: "right"; right: "none"; left: "mirror-x" };
  anchor: { x: number; y: number; units: "pixels"; origin: "top-left" };
  scale: { pixelArt: true; recommended: number; integerOnly: true };
  configuration: "character.json";
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
