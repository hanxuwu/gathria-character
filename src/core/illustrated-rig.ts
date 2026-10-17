import type { ArtV3CharacterConfig } from "./types";
import type { Point } from "./pixel-art";
import type {
  IllustratedAssetBank,
  IllustratedLayer,
} from "./illustrated-types";
import {
  IllustratedCanvas,
  boneTransform,
  colorLayer,
  translated,
  type LayerWarp,
  type Matrix,
} from "./illustrated-canvas";

const FOOT_X = [10, 5, 0, -6, -10, -7, 0, 8];
const FOOT_LIFT = [0, 0, 0, 0, 0, 6, 11, 6];
const ARM_SWING = [-9, -6, 0, 6, 9, 6, 0, -6];
const WALK_BOB = [0, -1, -2, -1, 0, -1, -2, -1];

/** One prepared rig is shared by the twelve frames of a deterministic export. */
export function prepareIllustratedRig(
  bank: IllustratedAssetBank,
  config: ArtV3CharacterConfig,
) {
  const layers = new Map(bank.layers.map((layer) => [layer.id, layer]));
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
      pixels = colorLayer(requireLayer(id), config);
      colored.set(id, pixels);
    }
    return pixels;
  }

  return function frame(animation: "idle" | "walk", index: number) {
    const canvas = new IllustratedCanvas();
    const walking = animation === "walk";
    const bob = walking ? WALK_BOB[index] : [0, 0, -1, 0][index];
    const breath = walking ? 0 : [0, 1, 0, -1][index];
    const draw = (
      id: string | undefined,
      matrix: Matrix = translated(0, bob),
      warp: LayerWarp = {},
    ) => {
      if (id) canvas.draw(requireLayer(id), colors(id), matrix, warp);
    };

    if (portrait.backHair) {
      const sway = walking ? [0, 1, 2, 1, 0, -1, -2, -1][index] : breath;
      draw(portrait.backHair, translated(0, bob), {
        inverse: (x, y) => [x - sway * Math.max(0, (y - 100) / 80) ** 2, y],
        margin: 3,
      });
    }

    function arm(near: boolean) {
      const shoulder = near ? body.shoulderNear : body.shoulderFar;
      const elbow = near ? body.elbowNear : body.elbowFar;
      const wrist = near ? body.wristNear : body.wristFar;
      const swing = walking
        ? ARM_SWING[(index + (near ? 0 : 4)) % 8]
        : breath * (near ? 1 : -1);
      const posedShoulder: Point = [shoulder[0], shoulder[1] + bob];
      const posedElbow: Point = [
        elbow[0] + swing * 0.45,
        elbow[1] + bob - Math.abs(swing) * 0.12,
      ];
      const posedWrist: Point = [
        wrist[0] + swing,
        wrist[1] + bob - Math.abs(swing) * 0.28,
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
        knee[0] + move * 0.5 + (lift > 0 ? 2 : 0),
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
      const sway = walking ? [0, 1, 2, 1, 0, -1, -2, -1][index] : 0;
      draw(legs.garment, translated(0, 0), {
        inverse: (x, y) => [
          x - sway * Math.max(0, (y - 161) / 80),
          y - bob * Math.max(0, (239 - y) / 74),
        ],
        margin: 3,
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
        const t = Math.min(1, (y - portrait.jawStart) / 22);
        const scale = 1 + (jawScale - 1) * t;
        return [
          portrait.faceCenter[0] + (x - portrait.faceCenter[0]) / scale,
          portrait.jawStart + (y - portrait.jawStart) / jawLength,
        ];
      },
      margin: 4,
    });
    canvas.removeSamplingFlecks();
    return canvas.pixels;
  };
}
