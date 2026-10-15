export type AnimationName = "idle" | "walk";
export type Facing = "left" | "right";
export type Hairstyle = "crop" | "bob" | "waves" | "mohawk";
export type UpperClothing = "tee" | "hoodie" | "jacket";
export type LowerClothing = "trousers" | "shorts" | "skirt";
export interface CharacterConfig {
  schemaVersion: 1;
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
