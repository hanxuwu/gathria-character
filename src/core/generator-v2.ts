import { parseCharacterConfig } from "./config";
import { material, mix, PixelArt, type Point } from "./pixel-art";
import type {
  ArtV2CharacterConfig,
  GeneratedCharacter,
  CharacterPackManifest,
} from "./types";

export const ART_V2_GENERATOR_ID = "gathria-warm-pixels-v2";
const W = 48,
  H = 64;
const GAIT = [
  { knee: [29, 50], foot: [32, 57] },
  { knee: [27, 51], foot: [29, 57] },
  { knee: [23, 51], foot: [24, 57] },
  { knee: [21, 50], foot: [20, 57] },
  { knee: [19, 50], foot: [16, 57] },
  { knee: [20, 48], foot: [18, 54] },
  { knee: [25, 48], foot: [24, 53] },
  { knee: [29, 49], foot: [30, 55] },
] satisfies { knee: Point; foot: Point }[];

function drawFrame(
  config: ArtV2CharacterConfig,
  animation: "idle" | "walk",
  frame: number,
) {
  const c = new PixelArt();
  const skin = material(config.skinTone),
    hair = material(config.hairColor);
  const top = material(config.upperColor),
    bottom = material(config.lowerColor),
    shoe = material(config.shoeColor);
  const faceEdge = mix(config.skinTone, "#704F50", 0.42);
  const skinShade = mix(config.skinTone, "#A46E65", 0.2);
  const blush = mix(config.skinTone, "#D57877", 0.32);
  const eye = mix(config.skinTone, "#302D38", 0.84);
  const walking = animation === "walk";
  const bob = walking
    ? [0, -1, -1, 0, 0, -1, -1, 0][frame]
    : [0, 0, -1, 0][frame];
  const rect = (x: number, y: number, w: number, h: number, color: string) =>
    c.rect(x, y + bob, w, h, color);
  const shape = (points: readonly Point[], color: string) =>
    c.polygon(
      points.map(([x, y]) => [x, y + bob]),
      color,
    );

  // Back hair sits behind neck and shoulders, never painted over an arm or collar.
  if (config.hairstyle === "waves") {
    shape(
      [
        [19, 8],
        [27, 8],
        [30, 11],
        [30, 22],
        [28, 28],
        [26, 32],
        [19, 33],
        [15, 30],
        [16, 27],
        [14, 24],
        [15, 19],
        [15, 13],
      ],
      hair.edge,
    );
    shape(
      [
        [19, 10],
        [27, 10],
        [28, 17],
        [27, 25],
        [25, 30],
        [20, 31],
        [17, 29],
        [18, 26],
        [16, 23],
        [17, 17],
        [16, 14],
      ],
      hair.base,
    );
    shape(
      [
        [17, 17],
        [19, 18],
        [18, 22],
        [20, 25],
        [19, 28],
        [21, 31],
        [18, 30],
        [16, 24],
      ],
      hair.shade,
    );
  } else if (config.hairstyle === "bob") {
    shape(
      [
        [18, 10],
        [27, 9],
        [31, 13],
        [30, 25],
        [28, 29],
        [18, 30],
        [15, 27],
        [15, 16],
      ],
      hair.edge,
    );
    shape(
      [
        [17, 16],
        [20, 12],
        [28, 12],
        [29, 24],
        [27, 27],
        [19, 28],
        [16, 26],
      ],
      hair.base,
    );
  }

  // Feet rotate through eight poses; one planted sole always ends at y=59.
  function leg(near: boolean) {
    const pose = walking
      ? GAIT[(frame + (near ? 0 : 4)) % 8]
      : {
          knee: [near ? 27 : 22, 50] as Point,
          foot: [near ? 28 : 21, 57] as Point,
        };
    const hip: Point = [near ? 27 : 22, 43 + bob];
    const knee: Point = [pose.knee[0], pose.knee[1] + bob];
    const ankle: Point = [pose.foot[0], pose.foot[1] - 1];
    const trousers = config.lowerClothing === "trousers";
    const fill = trousers
      ? bottom
      : { ...skin, shade: skinShade, edge: faceEdge };
    c.line(hip, knee, 5, fill.edge);
    c.line(knee, ankle, 5, fill.edge);
    c.line(hip, knee, 3, near ? fill.base : fill.shade);
    c.line(knee, ankle, 3, near ? fill.base : fill.shade);
    if (near && trousers)
      c.line(
        [knee[0] - 1, knee[1]],
        [ankle[0] - 1, ankle[1] - 1],
        1,
        bottom.light,
      );
    if (config.lowerClothing === "shorts") {
      const hem: Point = [Math.round((hip[0] + knee[0]) / 2), 47 + bob];
      c.line(hip, hem, 6, bottom.edge);
      c.line(hip, hem, 4, near ? bottom.base : bottom.shade);
      c.rect(hem[0] - 1, hem[1], 3, 1, bottom.light);
    }
    const [x, y] = pose.foot;
    c.polygon(
      [
        [x - 2, y - 2],
        [x + 1, y - 2],
        [x + 3, y],
        [x + 3, y + 2],
        [x + 2, y + 3],
        [x - 2, y + 3],
        [x - 3, y + 1],
        [x - 3, y - 1],
      ],
      shoe.edge,
    );
    c.rect(x - 2, y - 1, 4, 2, near ? shoe.base : shoe.shade);
    c.rect(x + 2, y, 1, 1, near ? shoe.base : shoe.shade);
    c.rect(x - 2, y + 1, 5, 1, near ? shoe.light : shoe.base);
    c.rect(x - 1, y + 2, 3, 1, near ? shoe.shade : shoe.edge);
  }
  const swing = walking ? [-4, -3, 0, 3, 4, 2, 0, -3][frame] : 0;
  function arm(near: boolean) {
    const offset = near ? swing : -swing;
    const shoulder: Point = [near ? 18 : 30, 34 + bob];
    const elbow: Point = [
      shoulder[0] + Math.round(offset / 2) + (near ? -1 : 0),
      38 + bob,
    ];
    const hand: Point = [
      shoulder[0] + offset + 1,
      42 + bob - (Math.abs(offset) > 3 ? 1 : 0),
    ];
    const sleeveless = config.upperClothing === "bodice";
    c.line(shoulder, elbow, 4, sleeveless ? faceEdge : top.edge);
    c.line(elbow, hand, 4, faceEdge);
    c.line(shoulder, elbow, 2, near ? skin.base : skinShade);
    c.line(elbow, hand, 2, near ? skin.base : skinShade);
    if (!sleeveless) {
      const short = config.upperClothing === "tee";
      const end: Point = short ? [elbow[0], elbow[1] - 2] : elbow;
      c.line(shoulder, end, 5, top.edge);
      c.line(shoulder, end, 3, near ? top.base : top.shade);
      if (!short) {
        c.line(elbow, [hand[0], hand[1] - 2], 3, top.edge);
        c.line(elbow, [hand[0], hand[1] - 2], 2, near ? top.base : top.shade);
        if (config.upperClothing === "suit")
          c.rect(hand[0], hand[1] - 2, 2, 1, "#F4E9D6");
      }
    }
    c.pixel(hand[0], hand[1], near ? skin.light : skin.base);
  }
  arm(false);
  leg(false);
  leg(true);
  shape(
    [
      [20, 41],
      [29, 41],
      [31, 45],
      [27, 46],
      [24, 44],
      [19, 46],
    ],
    bottom.edge,
  );
  rect(20, 42, 10, 3, bottom.base);
  rect(20, 42, 2, 3, bottom.light);
  if (config.lowerClothing === "skirt") {
    shape(
      [
        [20, 41],
        [29, 41],
        [33, 49],
        [31, 51],
        [17, 51],
        [17, 49],
      ],
      bottom.edge,
    );
    shape(
      [
        [21, 42],
        [28, 42],
        [31, 49],
        [19, 49],
      ],
      bottom.base,
    );
    shape(
      [
        [22, 43],
        [24, 43],
        [23, 49],
        [20, 49],
      ],
      bottom.light,
    );
    rect(26, 45, 1, 5, bottom.shade);
    rect(18, 50, 13, 1, bottom.shade);
  }
  if (config.lowerClothing === "dress") {
    const sway = walking ? [-1, 0, 1, 1, 0, -1, -1, 0][frame] : 0;
    // An ankle-length skirt overlaps both hips. Knees/feet move behind it.
    shape(
      [
        [20, 41],
        [29, 41],
        [31, 47],
        [35 + sway, 55],
        [33 + sway, 57],
        [16 + sway, 57],
        [15 + sway, 55],
        [18, 47],
      ],
      bottom.edge,
    );
    shape(
      [
        [21, 42],
        [28, 42],
        [30, 48],
        [33 + sway, 55],
        [18 + sway, 55],
        [19, 48],
      ],
      bottom.base,
    );
    shape(
      [
        [22, 44],
        [24, 44],
        [22 + sway, 55],
        [19 + sway, 55],
      ],
      bottom.light,
    );
    shape(
      [
        [28, 44],
        [29, 48],
        [32 + sway, 55],
        [28 + sway, 55],
      ],
      bottom.shade,
    );
    rect(18 + sway, 55, 15, 1, bottom.light);
    rect(24, 44, 1, 10, bottom.light);
  }
  // Soft shoulders, a shaped waist, and curved sleeves replace the rigid V1 blocks.
  shape(
    [
      [21, 30],
      [27, 30],
      [31, 32],
      [32, 36],
      [31, 42],
      [29, 45],
      [20, 45],
      [17, 42],
      [17, 35],
      [18, 32],
    ],
    top.edge,
  );
  shape(
    [
      [21, 31],
      [27, 31],
      [30, 33],
      [31, 36],
      [30, 41],
      [28, 43],
      [20, 43],
      [18, 40],
      [18, 35],
      [19, 33],
    ],
    top.base,
  );
  shape(
    [
      [20, 33],
      [22, 32],
      [21, 40],
      [23, 43],
      [20, 43],
      [19, 40],
      [19, 35],
    ],
    top.light,
  );
  rect(29, 35, 1, 7, top.shade);
  if (!walking && frame === 1) rect(31, 35, 1, 3, top.base);
  rect(24, 27, 4, 5, skinShade);
  rect(25, 28, 3, 3, skin.base);
  if (config.upperClothing === "hoodie") {
    shape(
      [
        [21, 30],
        [24, 31],
        [27, 31],
        [29, 30],
        [29, 32],
        [26, 34],
        [23, 33],
        [20, 32],
      ],
      top.shade,
    );
    rect(24, 33, 1, 3, top.light);
    rect(28, 33, 1, 3, top.light);
    rect(23, 39, 5, 1, top.shade);
    rect(22, 40, 1, 2, top.shade);
    rect(28, 40, 1, 2, top.shade);
    rect(23, 42, 5, 1, top.light);
  } else if (
    config.upperClothing === "jacket" ||
    config.upperClothing === "suit"
  ) {
    const formal = config.upperClothing === "suit";
    shape(
      [
        [24, 31],
        [28, 31],
        [29, 43],
        [25, 43],
      ],
      "#F4E9D6",
    );
    shape(
      [
        [21, 31],
        [24, 31],
        [26, 36],
        [23, 34],
      ],
      top.light,
    );
    shape(
      [
        [29, 31],
        [30, 33],
        [28, 36],
        [28, 32],
      ],
      top.light,
    );
    rect(25, 37, 1, 6, top.edge);
    rect(21, 39, 2, 1, top.shade);
    rect(29, 39, 1, 1, top.light);
    if (formal) {
      // Small bow tie and boutonniere, both neutral styling choices.
      rect(25, 32, 1, 2, top.edge);
      rect(27, 32, 1, 2, top.edge);
      rect(26, 33, 1, 1, top.shade);
      rect(29, 35, 1, 3, "#6E8B71");
      rect(28, 35, 2, 2, "#E6ADA0");
      rect(29, 35, 1, 1, "#FAE3BF");
      rect(26, 39, 1, 1, top.light);
      rect(26, 42, 1, 1, top.light);
    } else {
      rect(27, 36, 1, 1, top.shade);
      rect(27, 39, 1, 1, top.shade);
    }
  } else if (config.upperClothing === "bodice") {
    shape(
      [
        [21, 31],
        [23, 32],
        [25, 33],
        [27, 32],
        [29, 31],
        [28, 30],
        [22, 30],
      ],
      skin.base,
    );
    rect(22, 33, 1, 1, top.light);
    rect(27, 33, 1, 1, top.light);
    rect(20, 42, 10, 2, top.shade);
    rect(20, 42, 10, 1, top.light);
    rect(25, 42, 2, 2, "#D1AE70");
  } else {
    shape(
      [
        [22, 31],
        [24, 32],
        [27, 32],
        [28, 31],
        [27, 30],
        [23, 30],
      ],
      skin.base,
    );
    rect(23, 33, 4, 1, top.light);
    rect(21, 43, 8, 1, top.shade);
  }
  arm(true);

  // A compact three-quarter portrait: the nose stays inside the cheek contour.
  // Related silhouettes share the same relaxed, paired-eye expression.
  const face = config.faceVariant;
  const outline: Record<typeof face, Point[]> = {
    heart: [
      [21, 11],
      [28, 11],
      [32, 14],
      [34, 18],
      [34, 24],
      [32, 27],
      [29, 30],
      [24, 30],
      [20, 28],
      [17, 24],
      [17, 18],
    ],
    oval: [
      [21, 10],
      [28, 10],
      [32, 14],
      [33, 18],
      [33, 25],
      [31, 29],
      [28, 31],
      [24, 31],
      [20, 28],
      [18, 24],
      [18, 17],
    ],
    round: [
      [20, 11],
      [28, 11],
      [32, 14],
      [35, 18],
      [35, 24],
      [33, 27],
      [29, 29],
      [22, 29],
      [18, 27],
      [16, 23],
      [16, 18],
    ],
  };
  const interior: Record<typeof face, Point[]> = {
    heart: [
      [21, 12],
      [28, 12],
      [31, 15],
      [33, 18],
      [33, 24],
      [31, 27],
      [28, 29],
      [24, 29],
      [20, 26],
      [18, 23],
      [18, 18],
    ],
    oval: [
      [21, 11],
      [28, 11],
      [31, 15],
      [32, 18],
      [32, 25],
      [30, 28],
      [27, 30],
      [24, 30],
      [21, 27],
      [19, 23],
      [19, 17],
    ],
    round: [
      [20, 12],
      [28, 12],
      [31, 15],
      [34, 18],
      [34, 24],
      [32, 26],
      [28, 28],
      [22, 28],
      [19, 26],
      [17, 22],
      [17, 18],
    ],
  };
  shape(outline[face], faceEdge);
  shape(interior[face], skin.base);
  // Shading stays below the jaw and at the ear, leaving the face open and clear.

  const farEyeX = face === "round" ? 21 : 22;
  const nearEyeX = face === "oval" ? 28 : 29;
  const eyeY = 20;
  const blink = animation === "idle" && frame === 3;
  for (const x of [farEyeX, nearEyeX]) {
    rect(x, eyeY - 2, 2, 1, mix(config.hairColor, config.skinTone, 0.25));
    if (blink) {
      rect(x, eyeY + 1, 2, 1, eye);
    } else {
      rect(x, eyeY, 2, 2, eye);
    }
  }
  rect(farEyeX - 1, 24, 3, 1, blush);
  rect(nearEyeX, 24, 3, 1, blush);
  rect(27, 24, 1, 1, skinShade);
  const mouthY = face === "oval" ? 27 : 26;
  rect(25, mouthY, 3, 1, mix(config.skinTone, "#955D5A", 0.65));
  rect(28, mouthY - 1, 1, 1, mix(config.skinTone, "#955D5A", 0.5));

  // Rounded connected hair masses; one broad light cluster describes the sweep.
  if (config.hairstyle === "waves") {
    shape(
      [
        [17, 10],
        [20, 7],
        [23, 6],
        [27, 6],
        [31, 8],
        [34, 11],
        [35, 15],
        [33, 18],
        [30, 17],
        [27, 14],
        [24, 14],
        [21, 17],
        [20, 21],
        [19, 24],
        [20, 28],
        [18, 32],
        [15, 32],
        [13, 29],
        [14, 25],
        [13, 22],
        [13, 18],
        [14, 13],
      ],
      hair.edge,
    );
    shape(
      [
        [18, 11],
        [21, 8],
        [26, 7],
        [30, 9],
        [33, 12],
        [34, 15],
        [32, 16],
        [30, 15],
        [27, 12],
        [24, 13],
        [20, 16],
        [19, 21],
        [18, 24],
        [19, 28],
        [17, 31],
        [15, 30],
        [15, 26],
        [14, 23],
        [14, 18],
        [15, 14],
      ],
      hair.base,
    );
    shape(
      [
        [18, 12],
        [21, 9],
        [25, 8],
        [28, 9],
        [29, 11],
        [25, 10],
        [22, 11],
        [19, 14],
        [17, 18],
        [16, 20],
        [16, 16],
      ],
      hair.light,
    );
    shape(
      [
        [16, 23],
        [17, 21],
        [18, 23],
        [17, 26],
        [18, 28],
        [16, 30],
        [15, 28],
      ],
      hair.shade,
    );
  } else if (config.hairstyle === "crop") {
    shape(
      [
        [16, 15],
        [17, 11],
        [20, 8],
        [23, 7],
        [27, 7],
        [30, 8],
        [33, 10],
        [35, 13],
        [34, 16],
        [31, 17],
        [28, 15],
        [26, 14],
        [23, 15],
        [20, 18],
        [20, 23],
        [17, 25],
        [15, 22],
      ],
      hair.edge,
    );
    shape(
      [
        [17, 15],
        [18, 12],
        [21, 9],
        [25, 8],
        [29, 9],
        [32, 11],
        [34, 13],
        [33, 15],
        [31, 16],
        [28, 14],
        [26, 12],
        [23, 14],
        [19, 17],
        [19, 22],
        [17, 23],
        [16, 21],
      ],
      hair.base,
    );
    shape(
      [
        [19, 13],
        [21, 10],
        [25, 9],
        [29, 10],
        [30, 12],
        [26, 11],
        [23, 12],
        [20, 15],
        [18, 17],
      ],
      hair.light,
    );
    rect(17, 19, 1, 3, hair.shade);
  } else if (config.hairstyle === "bob") {
    shape(
      [
        [15, 14],
        [17, 10],
        [21, 8],
        [27, 8],
        [31, 10],
        [34, 14],
        [35, 18],
        [32, 18],
        [30, 16],
        [27, 17],
        [24, 16],
        [21, 17],
        [20, 21],
        [20, 26],
        [22, 29],
        [20, 32],
        [16, 31],
        [13, 28],
        [13, 20],
      ],
      hair.edge,
    );
    shape(
      [
        [16, 14],
        [18, 11],
        [21, 9],
        [27, 9],
        [30, 11],
        [33, 15],
        [33, 17],
        [31, 16],
        [29, 15],
        [27, 16],
        [24, 15],
        [21, 15],
        [19, 19],
        [19, 26],
        [20, 29],
        [18, 30],
        [15, 29],
        [14, 26],
        [14, 20],
      ],
      hair.base,
    );
    shape(
      [
        [17, 15],
        [19, 12],
        [22, 10],
        [26, 10],
        [28, 12],
        [23, 12],
        [20, 15],
        [17, 20],
        [16, 24],
        [15, 24],
        [15, 20],
      ],
      hair.light,
    );
    rect(16, 28, 3, 1, hair.shade);
  } else {
    // Rounded swept crest with a low, clean side silhouette.
    shape(
      [
        [17, 15],
        [20, 12],
        [25, 12],
        [28, 15],
        [24, 17],
        [21, 20],
        [20, 24],
        [17, 25],
        [15, 22],
      ],
      hair.shade,
    );
    shape(
      [
        [18, 14],
        [19, 10],
        [22, 9],
        [24, 6],
        [28, 6],
        [31, 8],
        [33, 8],
        [34, 11],
        [36, 13],
        [35, 16],
        [32, 18],
        [29, 16],
        [26, 14],
        [22, 16],
      ],
      hair.edge,
    );
    shape(
      [
        [20, 13],
        [20, 11],
        [23, 10],
        [25, 7],
        [28, 7],
        [30, 9],
        [32, 9],
        [33, 12],
        [35, 13],
        [34, 15],
        [32, 16],
        [29, 14],
        [26, 12],
        [23, 14],
      ],
      hair.base,
    );
    shape(
      [
        [23, 11],
        [25, 8],
        [28, 8],
        [30, 10],
        [27, 10],
        [25, 12],
        [22, 14],
      ],
      hair.light,
    );
    rect(17, 18, 1, 4, hair.light);
  }
  // A small ear nestles into the side hair without interrupting the cheek.
  rect(19, 23, 2, 3, skinShade);
  rect(20, 23, 1, 2, skin.base);
  return c.pixels;
}

export function generateArtV2(value: ArtV2CharacterConfig): GeneratedCharacter {
  const config = parseCharacterConfig(value);
  if (config.schemaVersion !== 2 || config.artworkVersion !== 2)
    throw new Error("Art V2 requires explicit schemaVersion 2.");
  const width = W * 8,
    height = H * 2;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const frames: CharacterPackManifest["frames"] = [];
  for (const animation of ["idle", "walk"] as const) {
    const count = animation === "idle" ? 4 : 8,
      row = animation === "idle" ? 0 : 1;
    for (let index = 0; index < count; index++) {
      const frame = drawFrame(config, animation, index);
      for (let y = 0; y < H; y++)
        pixels.set(
          frame.subarray(y * W * 4, (y + 1) * W * 4),
          ((row * H + y) * width + index * W) * 4,
        );
      frames.push({
        id: row === 0 ? index : index + 4,
        x: index * W,
        y: row * H,
        width: W,
        height: H,
      });
    }
  }
  return {
    width,
    height,
    pixels,
    manifest: {
      schemaVersion: 1,
      format: "gathria-character-pack",
      name: config.name,
      generator: ART_V2_GENERATOR_ID,
      spritesheet: {
        file: "spritesheet.png",
        width,
        height,
        frameWidth: W,
        frameHeight: H,
        columns: 8,
        rows: 2,
      },
      frames,
      animations: {
        idle: {
          frames: [0, 0, 0, 1, 1, 2, 2, 1, 0, 0, 3, 0],
          fps: 4,
          loop: true,
        },
        walk: { frames: [4, 5, 6, 7, 8, 9, 10, 11], fps: 10, loop: true },
      },
      facing: { native: "right", right: "none", left: "mirror-x" },
      anchor: { x: 24, y: 60, units: "pixels", origin: "top-left" },
      scale: { pixelArt: true, recommended: 4, integerOnly: true },
      configuration: "character.json",
    },
  };
}
