import { parseCharacterConfig } from "./config";
import type {
  LegacyCharacterConfig,
  CharacterGenerator,
  CharacterPackManifest,
  GeneratedCharacter,
} from "./types";

export const FRAME_WIDTH = 48;
export const FRAME_HEIGHT = 64;
const COLUMNS = 8;
const ROWS = 2;
const OUTLINE = "#292B38";
type Point = readonly [number, number];
type Palette = {
  base: string;
  light: string;
  bright: string;
  shade: string;
  dark: string;
};

function tint(hex: string, amount: number): string {
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16);
    // Shade toward a cool ink and light toward warm paper, retaining hue.
    const target = amount > 0 ? 255 : 24;
    return Math.round(channel + (target - channel) * Math.abs(amount))
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function palette(base: string): Palette {
  return {
    base,
    light: tint(base, 0.22),
    bright: tint(base, 0.39),
    shade: tint(base, -0.23),
    dark: tint(base, -0.43),
  };
}

/** Integer-only raster primitives: every source pixel is either opaque or clear. */
class PixelCanvas {
  readonly pixels = new Uint8ClampedArray(FRAME_WIDTH * FRAME_HEIGHT * 4);
  private readonly colors = new Map<string, readonly number[]>();

  pixel(x: number, y: number, color: string): void {
    if (x < 0 || y < 0 || x >= FRAME_WIDTH || y >= FRAME_HEIGHT) return;
    let rgb = this.colors.get(color);
    if (!rgb) {
      rgb = [1, 3, 5].map((offset) =>
        parseInt(color.slice(offset, offset + 2), 16),
      );
      this.colors.set(color, rgb);
    }
    const offset = (Math.round(y) * FRAME_WIDTH + Math.round(x)) * 4;
    this.pixels.set([rgb[0], rgb[1], rgb[2], 255], offset);
  }

  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ): void {
    for (let row = y; row < y + height; row++) {
      for (let column = x; column < x + width; column++)
        this.pixel(column, row, color);
    }
  }

  polygon(points: readonly Point[], color: string): void {
    const minY = Math.min(...points.map((p) => p[1]));
    const maxY = Math.max(...points.map((p) => p[1]));
    for (let y = minY; y < maxY; y++) {
      const intersections: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          intersections.push(
            a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]),
          );
        }
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        for (
          let x = Math.ceil(intersections[i]);
          x <= Math.floor(intersections[i + 1]);
          x++
        )
          this.pixel(x, y, color);
      }
    }
  }

  line(start: Point, end: Point, width: number, color: string): void {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.max(Math.abs(dx), Math.abs(dy), 1);
    const radius = Math.floor(width / 2);
    for (let step = 0; step <= length; step++) {
      const x = Math.round(start[0] + (dx * step) / length);
      const y = Math.round(start[1] + (dy * step) / length);
      this.rect(x - radius, y - radius, width, width, color);
    }
  }
}

type LegPose = { knee: Point; foot: Point };
const STRIDE: readonly LegPose[] = [
  { knee: [29, 50], foot: [31, 57] },
  { knee: [26, 51], foot: [28, 57] },
  { knee: [23, 51], foot: [25, 57] },
  { knee: [21, 50], foot: [21, 57] },
  { knee: [20, 50], foot: [17, 57] },
  { knee: [20, 50], foot: [18, 53] },
  { knee: [25, 49], foot: [24, 52] },
  { knee: [29, 49], foot: [30, 54] },
];

function drawFrame(
  config: LegacyCharacterConfig,
  animation: "idle" | "walk",
  frame: number,
): Uint8ClampedArray {
  const c = new PixelCanvas();
  const skin = palette(config.skinTone);
  const hair = palette(config.hairColor);
  const top = palette(config.upperColor);
  const bottom = palette(config.lowerColor);
  const shoe = palette(config.shoeColor);
  const walking = animation === "walk";
  const bob = walking
    ? [0, -1, -1, 0, 0, -1, -1, 0][frame]
    : [0, 0, -1, 0][frame];
  const y = (value: number) => value + bob;
  const rect = (
    x: number,
    topY: number,
    width: number,
    height: number,
    color: string,
  ) => c.rect(x, y(topY), width, height, color);
  const shape = (points: readonly Point[], color: string) =>
    c.polygon(
      points.map(([x, py]) => [x, y(py)]),
      color,
    );

  const drawLeg = (pose: LegPose, near: boolean) => {
    const hip: Point = [near ? 27 : 22, y(43)];
    const knee: Point = [pose.knee[0], pose.knee[1] + bob];
    const ankle: Point = [pose.foot[0], pose.foot[1] - 2];
    const clothed = config.lowerClothing === "trousers";
    const leg = clothed ? bottom : skin;
    c.line(hip, knee, 5, OUTLINE);
    c.line(knee, ankle, 5, OUTLINE);
    c.line(hip, knee, 3, near ? leg.base : leg.shade);
    c.line(knee, ankle, 3, near ? leg.base : leg.shade);
    c.line(
      [knee[0] - 1, knee[1]],
      [ankle[0] - 1, ankle[1]],
      1,
      near ? leg.light : leg.base,
    );
    if (config.lowerClothing === "shorts") {
      const shortEnd: Point = [Math.round((hip[0] + knee[0]) / 2), y(47)];
      c.line(hip, shortEnd, 6, OUTLINE);
      c.line(hip, shortEnd, 4, near ? bottom.base : bottom.shade);
      c.line(
        [shortEnd[0] - 1, shortEnd[1]],
        [shortEnd[0] + 1, shortEnd[1]],
        1,
        bottom.light,
      );
    }
    const [fx, fy] = pose.foot;
    // The planted sole always ends at y=59; raised feet retain the same shoe shape.
    c.polygon(
      [
        [fx - 3, fy - 2],
        [fx + 1, fy - 2],
        [fx + 2, fy - 1],
        [fx + 4, fy - 1],
        [fx + 5, fy + 1],
        [fx + 5, fy + 3],
        [fx - 3, fy + 3],
      ],
      OUTLINE,
    );
    c.rect(fx - 2, fy - 1, 4, 2, near ? shoe.base : shoe.shade);
    c.rect(fx + 2, fy, 2, 1, near ? shoe.base : shoe.shade);
    c.rect(fx - 2, fy + 1, 6, 1, near ? shoe.light : shoe.base);
    if (near) c.rect(fx - 1, fy - 1, 2, 1, shoe.bright);
  };

  const armSwing = walking ? [0, -3, -5, -3, 0, 3, 5, 3][frame] : 0;
  const drawArm = (near: boolean) => {
    const shoulder: Point = [near ? 20 : 29, y(32)];
    const swing = near ? armSwing : -armSwing;
    const elbow: Point = [shoulder[0] + Math.round(swing / 2), y(38)];
    const hand: Point = [
      shoulder[0] + swing + 1,
      y(43) - (Math.abs(swing) > 3 ? 1 : 0),
    ];
    c.line(shoulder, elbow, 5, OUTLINE);
    c.line(elbow, hand, 5, OUTLINE);
    const sleeveEnd =
      config.upperClothing === "tee"
        ? ([elbow[0], elbow[1] - 3] as Point)
        : elbow;
    c.line(shoulder, elbow, 3, near ? skin.base : skin.shade);
    c.line(elbow, hand, 3, near ? skin.base : skin.shade);
    c.line(shoulder, sleeveEnd, 4, near ? top.base : top.shade);
    if (config.upperClothing !== "tee") {
      c.line(elbow, [hand[0], hand[1] - 3], 3, near ? top.base : top.shade);
      c.rect(hand[0] - 1, hand[1] - 3, 3, 1, top.dark);
    }
    if (near) {
      c.line(
        [shoulder[0] - 1, shoulder[1]],
        [sleeveEnd[0] - 1, sleeveEnd[1]],
        1,
        top.light,
      );
      c.pixel(hand[0] - 1, hand[1], skin.light);
    }
  };

  drawArm(false);
  drawLeg(
    walking ? STRIDE[(frame + 4) % 8] : { knee: [22, 50], foot: [21, 57] },
    false,
  );
  drawLeg(walking ? STRIDE[frame] : { knee: [28, 50], foot: [28, 57] }, true);

  // Waist and hems overlap the independent leg joints.
  shape(
    [
      [19, 41],
      [31, 41],
      [32, 46],
      [27, 47],
      [24, 45],
      [19, 46],
    ],
    OUTLINE,
  );
  rect(20, 42, 11, 3, bottom.base);
  rect(20, 42, 3, 3, bottom.light);
  rect(28, 42, 3, 3, bottom.shade);
  if (config.lowerClothing === "skirt") {
    shape(
      [
        [20, 41],
        [30, 41],
        [34, 49],
        [33, 51],
        [17, 51],
        [17, 49],
      ],
      OUTLINE,
    );
    shape(
      [
        [21, 42],
        [29, 42],
        [32, 49],
        [19, 49],
      ],
      bottom.base,
    );
    shape(
      [
        [23, 43],
        [25, 43],
        [24, 49],
        [21, 49],
      ],
      bottom.light,
    );
    shape(
      [
        [28, 43],
        [30, 47],
        [31, 49],
        [27, 49],
      ],
      bottom.shade,
    );
    rect(19, 49, 13, 1, bottom.dark);
  }

  // A stepped shoulder and waist silhouette is shared by the three garment cuts.
  shape(
    [
      [20, 28],
      [28, 28],
      [32, 31],
      [32, 42],
      [30, 44],
      [19, 44],
      [17, 41],
      [17, 32],
    ],
    OUTLINE,
  );
  shape(
    [
      [21, 29],
      [27, 29],
      [31, 32],
      [30, 42],
      [19, 42],
      [18, 33],
    ],
    top.base,
  );
  shape(
    [
      [21, 30],
      [23, 30],
      [21, 41],
      [19, 41],
      [19, 33],
    ],
    top.light,
  );
  rect(29, 33, 2, 8, top.shade);
  rect(20, 42, 10, 1, top.dark);
  if (!walking && frame === 1) {
    // A one-pixel chest expansion gives the inhale its own drawing without moving feet.
    rect(31, 34, 1, 4, top.shade);
  }

  if (config.upperClothing === "hoodie") {
    shape(
      [
        [20, 27],
        [26, 27],
        [30, 29],
        [28, 33],
        [24, 34],
        [20, 31],
        [18, 30],
      ],
      top.dark,
    );
    shape(
      [
        [20, 28],
        [25, 28],
        [28, 30],
        [25, 32],
        [21, 30],
      ],
      top.light,
    );
    rect(25, 32, 1, 4, top.bright);
    rect(28, 32, 1, 3, top.bright);
    rect(24, 38, 5, 1, top.shade);
    rect(23, 39, 1, 2, top.shade);
    rect(29, 39, 1, 2, top.shade);
    rect(24, 41, 5, 1, top.light);
  } else if (config.upperClothing === "jacket") {
    shape(
      [
        [25, 29],
        [28, 30],
        [28, 42],
        [25, 42],
      ],
      "#E9DFCC",
    );
    shape(
      [
        [23, 29],
        [25, 30],
        [26, 34],
        [23, 33],
        [22, 31],
      ],
      top.bright,
    );
    shape(
      [
        [29, 30],
        [30, 32],
        [28, 35],
        [28, 31],
      ],
      top.light,
    );
    rect(25, 35, 1, 8, top.dark);
    rect(22, 37, 2, 1, top.dark);
    rect(29, 37, 1, 1, top.bright);
    rect(26, 36, 1, 1, "#E9DFCC");
    rect(26, 40, 1, 1, "#E9DFCC");
  } else {
    shape(
      [
        [22, 29],
        [28, 29],
        [28, 31],
        [26, 32],
        [23, 31],
      ],
      top.dark,
    );
    rect(23, 29, 4, 1, skin.shade);
    rect(23, 41, 6, 1, top.light);
  }
  drawArm(true);

  rect(23, 25, 6, 5, OUTLINE);
  rect(24, 25, 4, 4, skin.shade);
  rect(26, 27, 2, 2, skin.base);

  // Original profile portrait: a large readable eye, lit cheek, ear, and small nose.
  shape(
    [
      [20, 10],
      [28, 10],
      [31, 12],
      [32, 16],
      [32, 19],
      [34, 20],
      [34, 22],
      [32, 23],
      [32, 25],
      [29, 28],
      [22, 28],
      [19, 25],
      [17, 21],
      [17, 14],
    ],
    OUTLINE,
  );
  shape(
    [
      [21, 11],
      [28, 11],
      [30, 13],
      [31, 19],
      [33, 20],
      [33, 22],
      [31, 22],
      [31, 25],
      [28, 27],
      [22, 26],
      [18, 20],
      [18, 15],
    ],
    skin.base,
  );
  shape(
    [
      [20, 16],
      [23, 17],
      [23, 24],
      [27, 26],
      [29, 26],
      [28, 27],
      [22, 26],
      [18, 21],
    ],
    skin.shade,
  );
  rect(27, 13, 3, 4, skin.light);
  rect(29, 21, 2, 2, skin.light);
  rect(32, 20, 1, 1, skin.light);
  rect(30, 24, 2, 1, skin.dark);
  rect(26, 23, 2, 1, tint(config.skinTone, -0.12));
  const blink = !walking && frame === 3;
  rect(28, 16, 3, 1, hair.dark);
  if (blink) {
    rect(28, 19, 3, 1, OUTLINE);
  } else {
    rect(28, 18, 3, 3, OUTLINE);
    rect(28, 18, 1, 1, "#FFF4DC");
  }

  if (config.hairstyle === "crop") {
    shape(
      [
        [19, 8],
        [27, 8],
        [27, 9],
        [30, 9],
        [32, 11],
        [32, 14],
        [29, 15],
        [25, 14],
        [23, 17],
        [21, 18],
        [20, 23],
        [17, 22],
        [16, 18],
        [16, 12],
      ],
      OUTLINE,
    );
    shape(
      [
        [19, 9],
        [26, 9],
        [30, 11],
        [31, 13],
        [27, 13],
        [24, 14],
        [21, 18],
        [18, 20],
        [17, 16],
        [17, 12],
      ],
      hair.base,
    );
    rect(19, 10, 7, 2, hair.light);
    rect(18, 12, 3, 2, hair.light);
    rect(26, 11, 3, 1, hair.bright);
    rect(17, 17, 2, 4, hair.shade);
  } else if (config.hairstyle === "bob") {
    shape(
      [
        [19, 8],
        [28, 8],
        [31, 10],
        [32, 13],
        [31, 16],
        [25, 16],
        [23, 20],
        [23, 27],
        [20, 29],
        [15, 27],
        [15, 15],
        [16, 11],
      ],
      OUTLINE,
    );
    shape(
      [
        [19, 9],
        [27, 9],
        [30, 11],
        [31, 14],
        [25, 14],
        [22, 18],
        [22, 26],
        [20, 27],
        [16, 26],
        [16, 15],
        [17, 12],
      ],
      hair.base,
    );
    rect(18, 12, 2, 12, hair.light);
    rect(20, 10, 7, 2, hair.light);
    rect(21, 12, 2, 4, hair.bright);
    rect(16, 23, 2, 3, hair.shade);
    rect(20, 22, 2, 4, hair.shade);
    rect(25, 14, 5, 1, hair.shade);
  } else if (config.hairstyle === "waves") {
    shape(
      [
        [20, 7],
        [26, 7],
        [26, 8],
        [30, 8],
        [32, 10],
        [32, 14],
        [29, 16],
        [24, 15],
        [23, 18],
        [23, 21],
        [24, 23],
        [23, 26],
        [24, 28],
        [21, 30],
        [17, 29],
        [15, 26],
        [16, 23],
        [14, 21],
        [15, 17],
        [15, 12],
        [17, 9],
        [20, 9],
      ],
      OUTLINE,
    );
    shape(
      [
        [20, 8],
        [25, 8],
        [26, 9],
        [29, 9],
        [31, 11],
        [30, 14],
        [25, 13],
        [22, 16],
        [22, 21],
        [23, 23],
        [21, 26],
        [23, 28],
        [20, 29],
        [17, 27],
        [18, 24],
        [16, 21],
        [17, 18],
        [16, 15],
        [17, 11],
      ],
      hair.base,
    );
    shape(
      [
        [20, 10],
        [25, 9],
        [28, 11],
        [25, 11],
        [21, 13],
        [19, 17],
        [17, 16],
        [18, 12],
      ],
      hair.light,
    );
    rect(21, 10, 3, 1, hair.bright);
    rect(19, 17, 2, 4, hair.shade);
    rect(17, 20, 2, 2, hair.light);
    rect(19, 23, 3, 2, hair.light);
    rect(17, 26, 2, 1, hair.light);
    rect(20, 27, 2, 1, hair.shade);
  } else {
    // Shaved side and a jagged raised crest distinguish the mohawk at thumbnail size.
    shape(
      [
        [20, 12],
        [27, 11],
        [29, 13],
        [25, 14],
        [23, 18],
        [21, 22],
        [18, 22],
        [17, 17],
      ],
      hair.shade,
    );
    rect(19, 15, 2, 5, hair.light);
    shape(
      [
        [19, 12],
        [19, 7],
        [21, 8],
        [22, 5],
        [24, 6],
        [26, 4],
        [28, 6],
        [30, 5],
        [30, 8],
        [32, 9],
        [32, 13],
        [29, 15],
        [25, 14],
        [23, 15],
      ],
      OUTLINE,
    );
    shape(
      [
        [20, 11],
        [21, 9],
        [23, 7],
        [25, 8],
        [27, 6],
        [29, 8],
        [31, 10],
        [30, 13],
        [26, 12],
        [23, 13],
      ],
      hair.base,
    );
    rect(23, 9, 2, 3, hair.light);
    rect(26, 7, 2, 3, hair.light);
    rect(29, 10, 2, 1, hair.bright);
  }

  // The ear sits in front of the hair, preserving a crisp face / hair boundary.
  rect(22, 19, 3, 4, skin.shade);
  rect(23, 19, 2, 3, skin.base);
  rect(23, 20, 1, 1, skin.light);
  return c.pixels;
}

export function generateLegacyCharacter(
  value: LegacyCharacterConfig,
): GeneratedCharacter {
  const config = parseCharacterConfig(value);
  if (config.schemaVersion !== 1)
    throw new Error("The V1 renderer requires a V1 character configuration.");
  const width = FRAME_WIDTH * COLUMNS;
  const height = FRAME_HEIGHT * ROWS;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const frames: CharacterPackManifest["frames"] = [];
  for (const animation of ["idle", "walk"] as const) {
    const count = animation === "idle" ? 4 : 8;
    const row = animation === "idle" ? 0 : 1;
    for (let index = 0; index < count; index++) {
      const frame = drawFrame(config, animation, index);
      for (let py = 0; py < FRAME_HEIGHT; py++) {
        const destination =
          ((row * FRAME_HEIGHT + py) * width + index * FRAME_WIDTH) * 4;
        pixels.set(
          frame.subarray(py * FRAME_WIDTH * 4, (py + 1) * FRAME_WIDTH * 4),
          destination,
        );
      }
      frames.push({
        id: row === 0 ? index : 4 + index,
        x: index * FRAME_WIDTH,
        y: row * FRAME_HEIGHT,
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
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
      generator: pixelGenerator.id,
      spritesheet: {
        file: "spritesheet.png",
        width,
        height,
        frameWidth: FRAME_WIDTH,
        frameHeight: FRAME_HEIGHT,
        columns: COLUMNS,
        rows: ROWS,
      },
      frames,
      animations: {
        idle: { frames: [0, 1, 2, 3], fps: 4, loop: true },
        walk: { frames: [4, 5, 6, 7, 8, 9, 10, 11], fps: 10, loop: true },
      },
      facing: { native: "right", right: "none", left: "mirror-x" },
      anchor: { x: 24, y: 60, units: "pixels", origin: "top-left" },
      scale: { pixelArt: true, recommended: 4, integerOnly: true },
      configuration: "character.json",
    },
  };
}

export const pixelGenerator: CharacterGenerator = {
  id: "gathria-original-pixels-v1",
  generate: (config) => {
    if (config.schemaVersion !== 1)
      throw new Error("The V1 renderer requires a V1 character configuration.");
    return generateLegacyCharacter(config);
  },
};
