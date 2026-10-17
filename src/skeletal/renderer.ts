import { prepareMeshLimb } from "../experiments/denim-rig/mesh";
import {
  IllustratedCanvas,
  translated,
  type Matrix,
  type LayerWarp,
} from "../core/illustrated-canvas";
import type { IllustratedLayer } from "../core/illustrated-types";
import {
  CHAINS,
  FRAME_WIDTH as W,
  FRAME_HEIGHT as H,
  REQUIRED_SLOTS,
  RIG_ID,
  type AnimationName,
  type ChainName,
  type Expression,
  type JointTriple,
  type MotionLibrary,
  type Point,
  type RigDefinition,
  type RigInspection,
  type SkinPack,
  type Slot,
} from "./types";

const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const map = (m: Matrix, p: Point): Point => [
  m[0] * p[0] + m[2] * p[1] + m[4],
  m[1] * p[0] + m[3] * p[1] + m[5],
];
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
function kneeBetween(
  hip: Point,
  ankle: Point,
  upperLength: number,
  lowerLength: number,
): Point {
  const dx = ankle[0] - hip[0],
    dy = ankle[1] - hip[1];
  const d = Math.max(0.01, Math.hypot(dx, dy));
  const stretch = Math.max(1, d / (upperLength + lowerLength - 0.1));
  const a = upperLength * stretch,
    b = lowerLength * stretch;
  const along = (a * a - b * b + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, a * a - along * along));
  return [
    hip[0] + (dx / d) * along + (dy / d) * height,
    hip[1] + (dy / d) * along - (dx / d) * height,
  ];
}
const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

/** This family has a deliberately explicit topology. Reject disconnected or
 * ornamental bones: every accepted chain maps to two real mesh influences,
 * torso is its parent, and root/pivot controls the whole upper assembly. Skin
 * landmarks fit the same hierarchy to different garment source proportions. */
function validateHierarchy(rig: RigDefinition, skin: SkinPack) {
  if (
    rig.id !== RIG_ID ||
    skin.metadata.rigId !== rig.id ||
    rig.frame.width !== W ||
    rig.frame.height !== H
  )
    throw Error("The skin must use the 192 × 256 humanoid rig family.");
  const bones = new Map(rig.bones.map((b) => [b.id, b]));
  if (bones.size !== 11 || bones.size !== rig.bones.length)
    throw Error("Rig bones must have the eleven unique humanoid IDs.");
  const root = bones.get("root"),
    torso = bones.get("torso"),
    head = bones.get("head");
  if (
    !root ||
    root.parent !== null ||
    !same(root.from, rig.anchor) ||
    !same(root.to, rig.pivot) ||
    !torso ||
    torso.parent !== "root" ||
    !same(torso.from, rig.pivot) ||
    !head ||
    head.parent !== "torso" ||
    !same(head.from, torso.to)
  )
    throw Error("The root, torso and head must form a connected hierarchy.");
  for (const chain of CHAINS) {
    const upper = bones.get(`${chain}:upper`),
      lower = bones.get(`${chain}:lower`);
    const points = rig.chains[chain];
    if (
      !upper ||
      !lower ||
      upper.parent !== "torso" ||
      lower.parent !== upper.id ||
      !same(upper.from, points[0]) ||
      !same(upper.to, points[1]) ||
      !same(lower.from, points[1]) ||
      !same(lower.to, points[2])
    )
      throw Error(`Invalid connected bone hierarchy for ${chain}.`);
    const source = skin.metadata.bindings.chains[chain];
    if (
      source.some((p) => p.some((n) => !Number.isFinite(n))) ||
      distance(source[0], source[1]) < 1 ||
      distance(source[1], source[2]) < 1
    )
      throw Error(`Invalid source landmarks for ${chain}.`);
  }
  const required = [
    "far-arm",
    "near-arm",
    "far-leg",
    "near-leg",
    "torso",
    "hips",
    "head",
  ];
  if (
    new Set(rig.drawOrder).size !== rig.drawOrder.length ||
    required.some(
      (id) => !rig.drawOrder.includes(id as RigDefinition["drawOrder"][number]),
    ) ||
    rig.drawOrder.some(
      (id) => ![...required, "garment", "back-hair"].includes(id),
    )
  )
    throw Error(
      "Draw order must contain each complete limb, torso, hips and head once.",
    );
  for (const slot of REQUIRED_SLOTS) {
    if (
      !(skin.images[slot] instanceof Uint8ClampedArray) ||
      skin.images[slot]!.length !== W * H * 4
    )
      throw Error(`Skin image ${slot} must contain one complete RGBA frame.`);
  }
}

interface Attachment {
  layer: IllustratedLayer;
  pixels: Uint8ClampedArray;
  bottom: number;
  /** Sole normalization uses original artwork; explicit offsets remain visible. */
  sourceBottom: number;
}
/** Crop only the transparent storage area, not ownership or anatomy. Source
 * images are complete registered frames; user offsets are baked into a copy
 * before mesh creation. Thus all consumers use the same attachment placement. */
function attachment(
  slot: Slot,
  rgba: Uint8ClampedArray,
  offset: Point = [0, 0],
): Attachment {
  if (rgba.length !== W * H * 4)
    throw Error(`Invalid ${slot} image dimensions.`);
  const shifted = new Uint8ClampedArray(rgba.length);
  let sourceBottom = 0;
  const ox = Math.round(offset[0]),
    oy = Math.round(offset[1]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const nx = x + ox,
        ny = y + oy,
        p = (y * W + x) * 4;
      if (rgba[p + 3]) sourceBottom = Math.max(sourceBottom, y);
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && rgba[p + 3])
        shifted.set(rgba.subarray(p, p + 4), (ny * W + nx) * 4);
    }
  let left = W,
    right = -1,
    top = H,
    bottom = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (shifted[(y * W + x) * 4 + 3]) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  if (right < left) {
    left = 0;
    top = 0;
    right = 0;
    bottom = 0;
  }
  const width = right - left + 1,
    height = bottom - top + 1;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    pixels.set(
      shifted.subarray(
        ((top + y) * W + left) * 4,
        ((top + y) * W + left + width) * 4,
      ),
      y * width * 4,
    );
  // The low-level canvas consumes pixels directly; no packed-source decoding or
  // global layer-ID colour cache is involved in this imported-art renderer.
  return {
    layer: { id: slot, x: left, y: top, width, height, data: "", palette: {} },
    pixels,
    bottom,
    sourceBottom,
  };
}

/** Prepare once per edited project; render any skin and expression using the
 * same locally evaluated clips. No identity, preset, source bank, service or
 * pre-rendered animation appears in this module. */
export function prepareRig(
  definition: RigDefinition,
  sourceSkin: SkinPack,
  library: MotionLibrary,
) {
  validateHierarchy(definition, sourceSkin);
  const rig = structuredClone(definition),
    skin = structuredClone(sourceSkin.metadata),
    motions = structuredClone(library);
  const attachments = new Map<Slot, Attachment>();
  for (const slot of skin.slots) {
    const pixels = sourceSkin.images[slot];
    if (pixels)
      attachments.set(
        slot,
        attachment(slot, pixels, skin.bindings.offsets[slot]),
      );
  }
  const requireAttachment = (id: string) => {
    const result = attachments.get(id as Slot);
    if (!result) throw Error(`Skin attachment ${id} is missing.`);
    return result;
  };
  const meshes = new Map(
    CHAINS.map((chain) => {
      const near = chain.startsWith("near"),
        arm = chain.endsWith("Arm");
      const side = near ? "near" : "far";
      return [
        chain,
        prepareMeshLimb(
          (id) => requireAttachment(id).layer,
          (id) => requireAttachment(id).pixels,
          arm
            ? [`${side}-upper-arm`, `${side}-forearm`]
            : [`${side}-thigh`, `${side}-shin`],
          skin.bindings.chains[chain],
          {
            ...skin.bindings.mesh,
            ...(arm ? {} : { excludeId: `${side}-shoe` }),
          },
        ),
      ] as const;
    }),
  );

  function render(
    animation: AnimationName,
    index: number,
    expression: Expression,
    inspect: boolean,
  ) {
    const clip = motions.clips[animation];
    if (
      !clip ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= clip.keys.length
    )
      throw Error("Animation key is outside this clip.");
    if (!["neutral", "gentle", "joyful"].includes(expression))
      throw Error("Unsupported expression.");
    const keys = clip.keys;
    const key = keys[index],
      count = keys.length;
    const canvas = new IllustratedCanvas();
    const inspection: RigInspection = { limbs: [] };
    const jumping = animation === "jump";
    const rootY = jumping ? (key.rootY ?? 0) : 0;
    const upper = rotateAt(key.lean, rig.pivot, 0, key.bodyBob + rootY);
    if (inspect)
      inspection.bodyBones = rig.bones
        .filter((bone) => ["root", "torso", "head"].includes(bone.id))
        .map((bone) => ({
          id: bone.id,
          from: bone.id === "root" ? [...rig.anchor] : map(upper, bone.from),
          to: map(upper, bone.to),
        }));
    const phase = (index * Math.PI * 2) / count;
    const clothLag = Math.sin(phase - Math.PI / 3);
    const draw = (slot: Slot, matrix: Matrix = upper, warp: LayerWarp = {}) => {
      const item = attachments.get(slot);
      if (item) canvas.draw(item.layer, item.pixels, matrix, warp);
    };
    const posed = new Map<ChainName, JointTriple>();
    for (const chain of CHAINS) {
      const near = chain.startsWith("near"),
        arm = chain.endsWith("Arm");
      const [start, middle, end] = skin.bindings.chains[chain];
      const phaseIndex = jumping
        ? index
        : (index + (near ? 0 : Math.floor(count / 2))) % count;
      const opposite = keys[phaseIndex];
      if (arm && jumping) {
        // Both arms push off together. Rotate the original two segments about
        // their own joints so shoulder registration and limb length survive.
        const swing = expression === "joyful" ? (near ? 2 : -2) : 0;
        const restMiddle: Point = [
          middle[0] + swing * 0.45,
          middle[1] - Math.abs(swing) * 0.2,
        ];
        const restEnd: Point = [
          end[0] + swing,
          end[1] -
            (Math.max(0, swing) * 0.65 + Math.abs(Math.min(0, swing)) * 0.2),
        ];
        const elbow = map(rotateAt(key.armAngle, start), restMiddle);
        const wrist = map(
          rotateAt(key.armAngle + (key.armBend ?? 0), restMiddle),
          restEnd,
        );
        posed.set(chain, [
          map(upper, start),
          map(upper, elbow),
          map(upper, [
            wrist[0] + elbow[0] - restMiddle[0],
            wrist[1] + elbow[1] - restMiddle[1],
          ]),
        ]);
      } else if (arm && animation === "run") {
        const shoulder: Point = [start[0] - (near ? 0 : 8), start[1]];
        const upperLength = distance(start, middle),
          lowerLength = distance(middle, end);
        const a = opposite.armAngle;
        const elbow: Point = [
          shoulder[0] + Math.sin(a) * upperLength,
          shoulder[1] + Math.cos(a) * upperLength,
        ];
        const wrist: Point = [
          elbow[0] + Math.sin(a + Math.PI / 2) * lowerLength,
          elbow[1] + Math.cos(a + Math.PI / 2) * lowerLength,
        ];
        posed.set(chain, [
          map(upper, shoulder),
          map(upper, elbow),
          map(upper, wrist),
        ]);
      } else if (arm) {
        const swing =
          animation === "idle"
            ? key.armSwing * (near ? 1 : -1) +
              (expression === "joyful" ? (near ? 2 : -2) : 0)
            : opposite.armSwing;
        posed.set(chain, [
          map(upper, start),
          map(upper, [
            middle[0] + swing * 0.45,
            middle[1] - Math.abs(swing) * 0.2,
          ]),
          map(upper, [
            end[0] + swing,
            end[1] -
              (Math.max(0, swing) * 0.65 + Math.abs(Math.min(0, swing)) * 0.2),
          ]),
        ]);
      } else {
        const hip = map(upper, start);
        const ankle: Point = [
          animation === "run"
            ? hip[0] + opposite.footX
            : end[0] + opposite.footX,
          end[1] - opposite.footLift + rootY,
        ];
        const jumpFlex = Math.min(
          1,
          (Math.abs(key.bodyBob) +
            key.footLift +
            Math.abs(key.footX) +
            Math.abs(key.lean) * 20) /
            3,
        );
        const jumpKnee = jumping
          ? kneeBetween(
              hip,
              ankle,
              distance(start, middle),
              distance(middle, end),
            )
          : middle;
        const knee: Point = jumping
          ? [
              middle[0] + (jumpKnee[0] - middle[0]) * jumpFlex,
              middle[1] + rootY + (jumpKnee[1] - middle[1] - rootY) * jumpFlex,
            ]
          : animation === "run"
            ? kneeBetween(
                hip,
                ankle,
                distance(start, middle),
                distance(middle, end),
              )
            : [
                middle[0] +
                  opposite.footX * 0.5 +
                  (opposite.footLift > 0 ? 5 : 0),
                middle[1] + key.bodyBob * 0.5 - opposite.footLift * 0.5,
              ];
        posed.set(chain, [hip, knee, ankle]);
      }
    }
    function limb(chain: ChainName) {
      const joints = posed.get(chain)!,
        mesh = meshes.get(chain)!;
      mesh.draw(canvas, joints);
      if (inspect)
        inspection.limbs.push({
          id: chain,
          bones: [...joints],
          ...mesh.inspect(joints),
        });
      if (chain.endsWith("Leg")) {
        const near = chain.startsWith("near"),
          slot: Slot = near ? "near-shoe" : "far-shoe";
        const opposite = jumping
          ? key
          : keys[(index + (near ? 0 : Math.floor(count / 2))) % count];
        const ankle = skin.bindings.chains[chain][2];
        const sole = requireAttachment(slot).sourceBottom;
        draw(
          slot,
          rotateAt(
            opposite.shoePitch,
            ankle,
            joints[2][0] - ankle[0],
            rig.anchor[1] - 1 - sole - opposite.footLift + rootY,
          ),
        );
      }
    }
    for (const slot of rig.drawOrder) {
      switch (slot) {
        case "far-arm":
          limb("farArm");
          break;
        case "near-arm":
          limb("nearArm");
          break;
        case "far-leg":
          limb("farLeg");
          break;
        case "near-leg":
          limb("nearLeg");
          break;
        case "head": {
          const jaw = skin.bindings.jaw;
          const neck = rig.bones.find((b) => b.id === "head")!.from[1];
          draw(`head-${expression}`, upper, {
            inverse: (x, y) => {
              if (y <= jaw.start || y >= neck) return [x, y];
              const weight = Math.sin(
                Math.PI *
                  Math.min(1, (y - jaw.start) / Math.max(1, neck - jaw.start)),
              );
              return [
                jaw.center[0] +
                  (x - jaw.center[0]) / (1 + (jaw.scale - 1) * weight),
                y - (jaw.length - 1) * 10 * weight,
              ];
            },
            margin: 4,
          });
          break;
        }
        case "back-hair": {
          const sway =
            skin.bindings.hairSway *
            (animation === "run"
              ? -3 + clothLag * 2
              : animation === "walk"
                ? Math.sin(phase) * 5
                : jumping
                  ? key.armAngle * 2
                  : key.armSwing);
          draw(slot, upper, {
            inverse: (x, y) => [
              x - sway * Math.min(1.4, Math.max(0, (y - 100) / 80)) ** 2,
              y,
            ],
            margin: Math.ceil(Math.abs(sway) * 2) + 1,
          });
          break;
        }
        case "garment": {
          const garment = attachments.get(slot);
          if (!garment) break;
          const top = garment.layer.y,
            height = Math.max(1, garment.bottom - top);
          const sway =
            skin.bindings.garmentSway *
            (animation === "run"
              ? -3.5 + 1.8 * clothLag
              : animation === "walk"
                ? Math.sin(phase) * 4
                : 0);
          draw(slot, translated(), {
            inverse: (x, y) => {
              const depth = Math.max(0, Math.min(1, (y - top) / height));
              const waist = map(upper, [x, top]);
              return [
                x - (waist[0] - x) * (1 - depth) - sway * depth,
                y - (waist[1] - top) * (1 - depth) - rootY * depth,
              ];
            },
            margin: Math.ceil(Math.abs(sway)) + 8,
          });
          break;
        }
        default:
          draw(slot);
      }
    }
    canvas.removeSamplingFlecks();
    return { pixels: canvas.pixels, inspection };
  }
  return {
    frame(
      animation: AnimationName,
      index: number,
      expression: Expression = "gentle",
    ) {
      return render(animation, index, expression, false).pixels;
    },
    inspect(
      animation: AnimationName,
      index: number,
      expression: Expression = "gentle",
    ) {
      return render(animation, index, expression, true).inspection;
    },
  };
}
