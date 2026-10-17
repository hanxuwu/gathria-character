import { repairRunningArmParts } from "../../core/running-arm-parts";
import { prepareMeshLimb } from "./mesh";
import { parseRigProject, type RigProject } from "./project";
import { polishedBank } from "../../core/polished-rig";
import { expressiveColors } from "../../core/expressive-face";
import { unzlibSync } from "fflate";
import { FLOWER_CLIP } from "../../core/expressive-accessory.generated";
import type { Point } from "../../core/pixel-art";
import type { IllustratedLayer } from "../../core/illustrated-types";
import {
  IllustratedCanvas,
  boneTransform,
  translated,
  type LayerWarp,
  type Matrix,
} from "../../core/illustrated-canvas";

export const RUN_FRAME_COUNT = 12;
export const RUN_FPS = 18;
export interface RigInspection {
  limbs: Array<{
    id: string;
    bones: Point[];
    vertices: Point[];
    triangles: number[];
    weights: number[];
    rest: Point[];
  }>;
}

function rotateAt(angle: number, pivot: Point, dx = 0, dy = 0): Matrix {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return [
    c,
    s,
    -s,
    c,
    pivot[0] - c * pivot[0] + s * pivot[1] + dx,
    pivot[1] - s * pivot[0] - c * pivot[1] + dy,
  ];
}
function map(matrix: Matrix, point: Point): Point {
  const [a, b, c, d, tx, ty] = matrix;
  return [a * point[0] + c * point[1] + tx, b * point[0] + d * point[1] + ty];
}
function distance(a: Point, b: Point) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
/** Two-bone knee: keep original segment lengths while the foot follows stance.
 * Only the rare over-reach extends both bones by the same small amount. */
function kneeBetween(
  hip: Point,
  ankle: Point,
  thighLength: number,
  shinLength: number,
  bend = 1,
): Point {
  const dx = ankle[0] - hip[0],
    dy = ankle[1] - hip[1],
    d = Math.max(0.01, Math.hypot(dx, dy));
  const stretch = Math.max(1, d / (thighLength + shinLength - 0.1));
  const a = thighLength * stretch,
    b = shinLength * stretch;
  const along = (a * a - b * b + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, a * a - along * along));
  return [
    hip[0] + (dx / d) * along + (dy / d) * height * bend,
    hip[1] + (dy / d) * along - (dx / d) * height * bend,
  ];
}

/** Isolated authoring study copied from the frozen Motion 3 pose/composition
 * adapter. Only limb skinning and explicit keyframe inputs change here. No
 * production renderer imports this experiment, and no Spine code is used. */
export function prepareSkeletalRig(value: RigProject) {
  const project = parseRigProject(value);
  const config = project.config;
  let bank = polishedBank(config);
  bank = repairRunningArmParts(bank, config);
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

  // Running exposes source pixels that were covered during the small V6 walk.
  // Arm ownership is repaired before recoloring. Preserve the established arm
  // endpoint masks; legs instead use one continuous original-texture strip.
  const jointCuts = new Map<
    string,
    {
      start: Point;
      end: Point;
      startRadius: number;
      endRadius: number;
    }
  >();
  for (const near of [true, false]) {
    const shoulder = near ? body.shoulderNear : body.shoulderFar,
      elbow = near ? body.elbowNear : body.elbowFar,
      wrist = near ? body.wristNear : body.wristFar;
    jointCuts.set(near ? body.nearUpperArm : body.farUpperArm, {
      start: shoulder,
      end: elbow,
      startRadius: 10,
      endRadius: 7,
    });
    jointCuts.set(near ? body.nearForearm : body.farForearm, {
      start: elbow,
      end: wrist,
      startRadius: 8,
      endRadius: 20,
    });
  }

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
      const cut = jointCuts.get(id);
      if (cut) {
        const raw = unzlibSync(
          Uint8Array.from(atob(layer.data), (c) => c.charCodeAt(0)),
        );
        const dx = cut.end[0] - cut.start[0],
          dy = cut.end[1] - cut.start[1],
          length2 = dx * dx + dy * dy;
        for (let p = 0; p < layer.width * layer.height; p++) {
          const x = layer.x + (p % layer.width),
            y = layer.y + Math.floor(p / layer.width),
            material = raw[p * 5 + 4];
          const t =
            ((x - cut.start[0]) * dx + (y - cut.start[1]) * dy) / length2;
          const across =
            Math.abs((x - cut.start[0]) * dy - (y - cut.start[1]) * dx) /
            Math.sqrt(length2);
          const outsideWidth = across > 11;
          const outsideStart =
            t < 0 &&
            Math.hypot(x - cut.start[0], y - cut.start[1]) > cut.startRadius;
          const outsideEnd =
            t > 1 && Math.hypot(x - cut.end[0], y - cut.end[1]) > cut.endRadius;
          const foreign = material === 2;
          const pointedCuff =
            config.upperClothing === "suit" &&
            id === body.nearForearm &&
            t < 0.3 &&
            Math.hypot(x - cut.start[0], y - cut.start[1]) >
              8 + Math.max(0, t) * Math.sqrt(length2);
          if (
            outsideStart ||
            outsideEnd ||
            outsideWidth ||
            foreign ||
            pointedCuff
          )
            pixels.fill(0, p * 4, p * 4 + 4);
        }
      }
      colored.set(id, pixels);
    }
    return pixels;
  }

  const limbMeshes = [false, true].map((near) => ({
    arm: prepareMeshLimb(
      requireLayer,
      colors,
      [
        near ? body.nearUpperArm : body.farUpperArm,
        near ? body.nearForearm : body.farForearm,
      ],
      [
        near ? body.shoulderNear : body.shoulderFar,
        near ? body.elbowNear : body.elbowFar,
        near ? body.wristNear : body.wristFar,
      ],
      project.mesh,
    ),
    leg: prepareMeshLimb(
      requireLayer,
      colors,
      [
        near ? legs.nearThigh : legs.farThigh,
        near ? legs.nearShin : legs.farShin,
      ],
      [
        near ? legs.hipNear : legs.hipFar,
        near ? legs.kneeNear : legs.kneeFar,
        near ? legs.ankleNear : legs.ankleFar,
      ],
      { ...project.mesh, excludeId: near ? legs.nearShoe : legs.farShoe },
    ),
  }));
  let inspection: RigInspection = { limbs: [] };
  function frame(frameIndex: number, inspect = false) {
    inspection = { limbs: [] };
    if (
      !Number.isInteger(frameIndex) ||
      frameIndex < 0 ||
      frameIndex >= RUN_FRAME_COUNT
    )
      throw new Error("Running frame must be an integer from 0 to 11.");
    const index = frameIndex;
    const canvas = new IllustratedCanvas();
    const dress = config.lowerClothing === "dress";
    const bob = project.timeline.frames[index].bodyBob;
    const lean = project.timeline.frames[index].lean;
    // One rigid transform includes head, neck, collar, torso and fixed flower.
    // Rotating these together preserves the original V6 neck length/identity.
    const upper = rotateAt(lean, [96, 170], dress ? -1 : 0, bob);
    const draw = (
      id: string | undefined,
      matrix: Matrix = upper,
      warp: LayerWarp = {},
    ) => {
      if (id) canvas.draw(requireLayer(id), colors(id), matrix, warp);
    };
    const phaseAngle = (index * Math.PI) / 6;
    const clothLag = Math.sin(phaseAngle - Math.PI / 3);
    const hemTrail = -3.5 + 1.8 * clothLag;
    const skirtLift = dress ? [0, 0, 1, 3, 4, 2][index % 6] : 0;
    const gripLift = (y: number) =>
      dress
        ? 4 * Math.sin(Math.PI * Math.min(1, Math.max(0, (y - 164) / 38)))
        : 0;
    function gownPoint(point: Point): Point {
      const depth = Math.max(0, Math.min(1, (point[1] - 164) / 75));
      const waist = map(upper, [point[0], 164]);
      return [
        point[0] + (waist[0] - point[0]) * (1 - depth) + hemTrail * depth,
        point[1] +
          (waist[1] - 164) * (1 - depth) -
          skirtLift * depth -
          gripLift(point[1]),
      ];
    }
    if (portrait.backHair)
      draw(portrait.backHair, upper, {
        inverse: (x, y) => [
          x - (-3 + clothLag * 2) * Math.max(0, (y - 100) / 80) ** 2,
          y,
        ],
        margin: 6,
      });

    function arm(near: boolean) {
      const shoulder = near ? body.shoulderNear : body.shoulderFar;
      const elbow = near ? body.elbowNear : body.elbowFar;
      const wrist = near ? body.wristNear : body.wristFar;
      let s = map(upper, shoulder);
      let e: Point, w: Point;
      if (dress) {
        // The painted holding hand and its gown grip share one deformation.
        // No independent arm swing can slide the fingertips across the cloth.
        w = gownPoint(wrist);
        e = kneeBetween(
          s,
          w,
          distance(shoulder, elbow),
          distance(elbow, wrist),
          near ? -1 : 1,
        );
      } else {
        const phase = (index + (near ? 0 : 6)) % 12;
        const a = project.timeline.frames[phase].armAngle;
        const upperLength = distance(shoulder, elbow);
        const foreLength = distance(elbow, wrist);
        // Bring the hidden far shoulder inward in depth without moving the
        // painted torso/neck. Its attachment remains covered by the torso.
        const pumpShoulder: Point = [shoulder[0] - (near ? 0 : 8), shoulder[1]];
        s = map(upper, pumpShoulder);
        const localElbow: Point = [
          pumpShoulder[0] + Math.sin(a) * upperLength,
          pumpShoulder[1] + Math.cos(a) * upperLength,
        ];
        // Fixed elbow flexion reads as a fore/aft pump, not a fist folding
        // towards the chest at one end and opening sideways at the other.
        const foreAngle = a + Math.PI / 2;
        const localWrist: Point = [
          localElbow[0] + Math.sin(foreAngle) * foreLength,
          localElbow[1] + Math.cos(foreAngle) * foreLength,
        ];
        e = map(upper, localElbow);
        w = map(upper, localWrist);
      }
      const mesh = limbMeshes[near ? 1 : 0].arm;
      mesh.draw(canvas, [s, e, w]);
      if (inspect)
        inspection.limbs.push({
          id: near ? "near-arm" : "far-arm",
          bones: [s, e, w],
          ...mesh.inspect([s, e, w]),
        });
    }

    function leg(near: boolean) {
      const hip = near ? legs.hipNear : legs.hipFar;
      const knee = near ? legs.kneeNear : legs.kneeFar;
      const ankle = near ? legs.ankleNear : legs.ankleFar;
      const phase = (index + (near ? 0 : 6)) % 12;
      const stride = project.timeline.frames[phase].footX * (dress ? 0.5 : 1);
      const lift = project.timeline.frames[phase].footLift * (dress ? 0.65 : 1);
      const h = map(upper, hip);
      const a: Point = [h[0] + stride, ankle[1] - lift];
      const k = kneeBetween(h, a, distance(hip, knee), distance(knee, ankle));
      const shoeId = near ? legs.nearShoe : legs.farShoe;
      const shoe = requireLayer(shoeId);
      // A planted sole is exactly y239. Lift does not inherit the torso's bob.
      const footDx = a[0] - ankle[0];
      const footDy = 239 - (shoe.y + shoe.height - 1) - lift;
      const mesh = limbMeshes[near ? 1 : 0].leg;
      mesh.draw(canvas, [h, k, a]);
      if (inspect)
        inspection.limbs.push({
          id: near ? "near-leg" : "far-leg",
          bones: [h, k, a],
          ...mesh.inspect([h, k, a]),
        });
      draw(
        shoeId,
        rotateAt(
          project.timeline.frames[phase].shoePitch,
          ankle,
          footDx,
          footDy,
        ),
      );
    }
    arm(false);
    // The intact floor-length gown fully occludes the legs. Do not expose old
    // hidden shoe scraps beneath a lifted hem or cut holes merely to show feet.
    if (!dress) {
      leg(false);
      leg(true);
    }
    draw(legs.hips);
    if (legs.garment) {
      draw(legs.garment, translated(), {
        inverse: (x, y) => {
          const depth = Math.max(0, Math.min(1, (y - 164) / 75));
          const waist = map(upper, [x, 164]);
          return [
            x - (waist[0] - x) * (1 - depth) - hemTrail * depth,
            y -
              (waist[1] - 164) * (1 - depth) +
              skirtLift * depth +
              gripLift(y),
          ];
        },
        margin: 8,
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
    draw(portrait.head, upper, {
      inverse: (x, y) => {
        if (y <= portrait.jawStart) return [x, y];
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
  }
  return {
    frame,
    inspect(index: number): RigInspection {
      frame(index, true);
      return inspection;
    },
  };
}
