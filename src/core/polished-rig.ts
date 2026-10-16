import { expressiveColors } from "./expressive-face";
import { unzlibSync } from "fflate";
import { ILLUSTRATED_ASSETS } from "./illustrated-assets.generated";
import { POLISHED_ASSETS } from "./polished-assets.generated";
import { FLOWER_CLIP } from "./expressive-accessory.generated";
import type { ArtV6CharacterConfig } from "./types";
import type { Point } from "./pixel-art";
import type {
  IllustratedAssetBank,
  IllustratedLayer,
} from "./illustrated-types";
import {
  IllustratedCanvas,
  boneTransform,
  translated,
  type LayerWarp,
  type Matrix,
} from "./illustrated-canvas";

const FOOT_X = [12, 7, 0, -7, -12, -8, 0, 9];
const FOOT_LIFT = [0, 0, 0, 0, 0, 5, 9, 5];
const ARM_SWING = [-8, -6, 0, 6, 8, 6, 0, -6];
const WALK_BOB = [0, -1, -2, -1, 0, -1, -2, -1];

/** One prepared rig is shared by the twelve frames of a deterministic export. */
export function preparePolishedRig(
  bank: IllustratedAssetBank,
  config: ArtV6CharacterConfig,
) {
  const layers = new Map(
    [...bank.layers, FLOWER_CLIP].map((layer) => [layer.id, layer]),
  );
  const colored = new Map<string, Uint8ClampedArray>();
  const body = bank.upper[config.upperClothing];
  const legs =
    config.upperClothing === "suit" && config.lowerClothing === "trousers"
      ? bank.formalTrousers
      : bank.lower[config.lowerClothing];
  const portrait = bank.portraits[config.hairstyle];

  function requireLayer(id: string): IllustratedLayer {
    const layer = layers.get(id);
    if (!layer) throw new Error(`Illustrated artwork is missing layer ${id}.`);
    return layer;
  }

  function colors(id: string) {
    let pixels = colored.get(id);
    if (!pixels) {
      pixels = expressiveColors(requireLayer(id), {
        ...config,
        artworkVersion: 4,
        expression:
          config.expression === "neutral" ? "gentle" : config.expression,
      });
      // Preserve warm cheek/neck chroma from the painted source while tinting
      // the material. The V3/V4 luminance-only mapping removed this face shading.
      const layer = requireLayer(id);
      if (id.startsWith("v6:") && layer.palette.skin) {
        const raw = unzlibSync(
          Uint8Array.from(atob(layer.data), (c) => c.charCodeAt(0)),
        );
        const base = [1, 3, 5].map((i) =>
          parseInt(layer.palette.skin!.slice(i, i + 2), 16),
        );
        const luminance = (r: number, g: number, b: number) =>
          0.2126 * r + 0.7152 * g + 0.0722 * b;
        const baseLight = luminance(base[0], base[1], base[2]);
        for (let p = 0; p < layer.width * layer.height; p++) {
          if (raw[p * 5 + 4] !== 1) continue;
          const light = luminance(raw[p * 5], raw[p * 5 + 1], raw[p * 5 + 2]);
          for (let c = 0; c < 3; c++) {
            const neutral =
              light <= baseLight
                ? (base[c] * light) / baseLight
                : base[c] +
                  ((255 - base[c]) * (light - baseLight)) / (255 - baseLight);
            pixels[p * 4 + c] += (raw[p * 5 + c] - neutral) * 0.35;
          }
        }
      }
      colored.set(id, pixels);
    }
    return pixels;
  }

  return function frame(animation: "idle" | "walk", index: number) {
    const canvas = new IllustratedCanvas();
    const walking = animation === "walk";
    const bob = walking ? WALK_BOB[index] : [0, -1, -1, 0][index];
    const breath = walking ? 0 : [0, 1, 0, -1][index];
    const draw = (
      id: string | undefined,
      matrix: Matrix = translated(0, bob),
      warp: LayerWarp = {},
    ) => {
      if (id) canvas.draw(requireLayer(id), colors(id), matrix, warp);
    };

    if (portrait.backHair) {
      const sway = walking ? [0, 3, 5, 3, 0, -3, -5, -3][index] : breath;
      draw(portrait.backHair, translated(0, bob), {
        inverse: (x, y) => [x - sway * Math.max(0, (y - 100) / 80) ** 2, y],
        margin: 7,
      });
    }

    function arm(near: boolean) {
      const shoulder = near ? body.shoulderNear : body.shoulderFar;
      const elbow = near ? body.elbowNear : body.elbowFar;
      const wrist = near ? body.wristNear : body.wristFar;
      const swing = walking
        ? ARM_SWING[(index + (near ? 0 : 4)) % 8]
        : breath * (near ? 1 : -1) +
          (config.expression === "joyful" ? (near ? 2 : -2) : 0);
      const posedShoulder: Point = [shoulder[0], shoulder[1] + bob];
      const posedElbow: Point = [
        elbow[0] + swing * 0.45,
        elbow[1] + bob - Math.abs(swing) * 0.2,
      ];
      const posedWrist: Point = [
        wrist[0] + swing,
        wrist[1] +
          bob -
          (Math.max(0, swing) * 0.65 + Math.abs(Math.min(0, swing)) * 0.2),
      ];
      draw(
        near ? body.nearUpperArm : body.farUpperArm,
        boneTransform(shoulder, elbow, posedShoulder, posedElbow),
      );
      draw(
        near ? body.nearForearm : body.farForearm,
        boneTransform(elbow, wrist, posedElbow, posedWrist),
      );
    }

    function leg(near: boolean) {
      const hip = near ? legs.hipNear : legs.hipFar;
      const knee = near ? legs.kneeNear : legs.kneeFar;
      const ankle = near ? legs.ankleNear : legs.ankleFar;
      const phase = (index + (near ? 0 : 4)) % 8;
      const move = walking ? FOOT_X[phase] : 0;
      const lift = walking ? FOOT_LIFT[phase] : 0;
      const posedHip: Point = [hip[0], hip[1] + bob];
      const posedAnkle: Point = [ankle[0] + move, ankle[1] - lift];
      const posedKnee: Point = [
        knee[0] + move * 0.5 + (lift > 0 ? 5 : 0),
        knee[1] + bob * 0.5 - lift * 0.5,
      ];
      draw(
        near ? legs.nearThigh : legs.farThigh,
        boneTransform(hip, knee, posedHip, posedKnee),
      );
      draw(
        near ? legs.nearShin : legs.farShin,
        boneTransform(knee, ankle, posedKnee, posedAnkle),
      );
      // Flat source soles translate along the floor during stance and lift only
      // during the returning half of the gait; body bob never moves a planted foot.
      const shoeId = near ? legs.nearShoe : legs.farShoe;
      const shoe = requireLayer(shoeId);
      draw(shoeId, translated(move, 239 - (shoe.y + shoe.height - 1) - lift));
    }

    arm(false);
    leg(false);
    leg(true);
    draw(legs.hips);
    if (legs.garment) {
      const sway = walking ? [0, 2, 4, 2, 0, -2, -4, -2][index] : 0;
      draw(legs.garment, translated(0, 0), {
        inverse: (x, y) => [
          x - sway * Math.max(0, (y - 161) / 80),
          y - bob * Math.max(0, (239 - y) / 74),
        ],
        margin: 6,
      });
    }
    draw(body.torso);
    arm(true);

    const jawScale =
      config.faceVariant === "heart"
        ? 0.94
        : config.faceVariant === "round"
          ? 1.055
          : 1;
    const jawLength =
      config.faceVariant === "oval"
        ? 1.055
        : config.faceVariant === "round"
          ? 0.97
          : 1;
    draw(portrait.head, translated(0, bob), {
      inverse: (x, y) => {
        if (y <= portrait.jawStart) return [x, y];
        // Taper back to identity at the neck: face shaping never moves the collar.
        const weight = Math.sin(
          Math.PI *
            Math.min(1, (y - portrait.jawStart) / (118 - portrait.jawStart)),
        );
        const scale = 1 + (jawScale - 1) * weight;
        return [
          portrait.faceCenter[0] + (x - portrait.faceCenter[0]) / scale,
          y - (jawLength - 1) * 10 * weight,
        ];
      },
      margin: 4,
    });
    if (config.hairAccessory === "flowers") draw(FLOWER_CLIP.id);
    canvas.removeSamplingFlecks();
    return canvas.pixels;
  };
}

/** Full-face variants were painted offline and registered to the same neck anchor. */
export function polishedBank(
  config: ArtV6CharacterConfig,
): IllustratedAssetBank {
  const replacements = POLISHED_ASSETS as unknown as {
    layers: IllustratedLayer[];
    upper: IllustratedAssetBank["upper"];
    dress: IllustratedAssetBank["lower"]["dress"];
    formalTrousers: IllustratedAssetBank["formalTrousers"];
    portraits: Record<
      string,
      IllustratedAssetBank["portraits"]["waves"] & {
        states: Record<ArtV6CharacterConfig["expression"], string>;
      }
    >;
  };
  const portraits = { ...ILLUSTRATED_ASSETS.portraits };
  for (const style of ["waves", "crop"] as const) {
    const portrait = replacements.portraits[style];
    portraits[style] = {
      ...portrait,
      head: portrait.states[config.expression],
    };
  }
  return {
    ...ILLUSTRATED_ASSETS,
    layers: [...ILLUSTRATED_ASSETS.layers, ...replacements.layers],
    upper: { ...ILLUSTRATED_ASSETS.upper, ...replacements.upper },
    lower: { ...ILLUSTRATED_ASSETS.lower, dress: replacements.dress },
    formalTrousers: replacements.formalTrousers,
    portraits,
  };
}
