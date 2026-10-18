import { prepareMeshLimb } from "../experiments/denim-rig/mesh";
import { validateActionForearms } from "./action-forearms";
import {
  validateRunLegs,
  validateRunShoes,
  preferBentLeg,
} from "./run-attachments";
import {
  IllustratedCanvas,
  translated,
  type Matrix,
  type LayerWarp,
} from "../core/illustrated-canvas";
import type { IllustratedLayer } from "../core/illustrated-types";
import {
  CHAINS,
  ACTION_FOREARM_SLOTS,
  RUN_LEG_SLOTS,
  RUN_SHOE_SLOTS,
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
function compose(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
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
  const metadata = skin.metadata;
  if (![1, 2, 3].includes(metadata.version))
    throw Error("Unsupported skin version.");
  if (metadata.version === 2 || metadata.actionForearms)
    validateActionForearms(metadata.actionForearms);
  if (metadata.version === 3) {
    if (!metadata.runLegs && !metadata.runShoes)
      throw Error("Skin version 3 needs runLegs and/or runShoes.");
    if (metadata.runLegs) validateRunLegs(metadata.runLegs);
    if (metadata.runShoes) validateRunShoes(metadata.runShoes);
  } else if (
    metadata.runLegs !== undefined ||
    metadata.runShoes !== undefined
  ) {
    throw Error("Run alternatives require skin version 3.");
  }
  if (metadata.version === 1 && metadata.actionForearms !== undefined)
    throw Error("Active forearms require skin version 2 or 3.");
  for (const [enabled, pair] of [
    [!!metadata.actionForearms, ACTION_FOREARM_SLOTS],
    [metadata.version === 3 && !!metadata.runLegs, RUN_LEG_SLOTS],
    [metadata.version === 3 && !!metadata.runShoes, RUN_SHOE_SLOTS],
  ] as const) {
    for (const slot of pair) {
      if (metadata.slots.includes(slot) !== enabled)
        throw Error(`Skin extension and paired slot ${slot} must agree.`);
      if (
        enabled &&
        (!(skin.images[slot] instanceof Uint8ClampedArray) ||
          skin.images[slot]!.length !== W * H * 4)
      )
        throw Error(`Skin alternative pair is missing ${slot}.`);
    }
  }
}

interface Attachment {
  layer: IllustratedLayer;
  pixels: Uint8ClampedArray;
  bottom: number;
  /** Sole normalization uses original artwork; explicit offsets remain visible. */
  sourceBottom: number;
}

/** Find the actual nearest-neighbor silhouette support before vertical
 * placement. Testing the opaque pixels (not the rectangular image bounds)
 * lets a pitched heel/toe touch the ground. The resulting translation moves
 * the ankle and its IK chain together with the shoe. This follows Canvas.draw's
 * sampling exactly, including fractional horizontal positioning and offsets. */
function rotatedSole(item: Attachment, matrix: Matrix): number {
  const { layer, pixels } = item;
  const corners = [
    [layer.x - 1, layer.y - 1],
    [layer.x + layer.width, layer.y - 1],
    [layer.x - 1, layer.y + layer.height],
    [layer.x + layer.width, layer.y + layer.height],
  ].map((p) => map(matrix, [p[0], p[1]]));
  const left = Math.floor(Math.min(...corners.map((p) => p[0]))) - 1,
    right = Math.ceil(Math.max(...corners.map((p) => p[0]))) + 1,
    top = Math.floor(Math.min(...corners.map((p) => p[1]))) - 1,
    bottom = Math.ceil(Math.max(...corners.map((p) => p[1]))) + 1;
  const [a, b, c, d, tx, ty] = matrix,
    determinant = a * d - b * c;
  for (let y = bottom; y >= top; y--)
    for (let x = left; x <= right; x++) {
      const ix =
          Math.round((d * (x - tx) - c * (y - ty)) / determinant) - layer.x,
        iy = Math.round((-b * (x - tx) + a * (y - ty)) / determinant) - layer.y;
      if (
        ix >= 0 &&
        ix < layer.width &&
        iy >= 0 &&
        iy < layer.height &&
        pixels[(iy * layer.width + ix) * 4 + 3]
      )
        return y;
    }
  throw Error("A run shoe must contain opaque support pixels.");
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
  if (library.version !== 1 && library.version !== 2)
    throw Error("Unsupported motion library version.");
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
  const prepareLimb = (chain: ChainName, active = false) => {
    const near = chain.startsWith("near"),
      arm = chain.endsWith("Arm"),
      side = near ? "near" : "far";
    return prepareMeshLimb(
      (id) => requireAttachment(id).layer,
      (id) => requireAttachment(id).pixels,
      arm
        ? [`${side}-upper-arm`, `${side}-forearm${active ? "-active" : ""}`]
        : [`${side}-thigh`, `${side}-shin`],
      skin.bindings.chains[chain],
      {
        ...skin.bindings.mesh,
        ...(arm || skin.bindings.mesh.preserveAnkleOverlap
          ? {}
          : { excludeId: `${side}-shoe` }),
      },
    );
  };
  const meshes = new Map(CHAINS.map((chain) => [chain, prepareLimb(chain)]));
  const activeArmMeshes = new Map(
    skin.actionForearms
      ? (["nearArm", "farArm"] as const).map(
          (chain) => [chain, prepareLimb(chain, true)] as const,
        )
      : [],
  );

  const bentLegMeshes = new Map(
    skin.runLegs
      ? (["nearLeg", "farLeg"] as const).map((chain) => {
          const source = skin.runLegs![chain];
          return [
            chain,
            prepareMeshLimb(
              (id) => requireAttachment(id).layer,
              (id) => requireAttachment(id).pixels,
              [source.slot],
              source.joints,
              skin.bindings.mesh,
            ),
          ] as const;
        })
      : [],
  );
  const shoeSource = (chain: "nearLeg" | "farLeg", animation: AnimationName) =>
    animation === "run" && skin.runShoes
      ? skin.runShoes[chain]
      : {
          slot: (chain === "nearLeg" ? "near-shoe" : "far-shoe") as Slot,
          ankle: skin.bindings.chains[chain][2],
        };

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
    const runV2 = animation === "run" && motions.version === 2;
    const pelvis = rotateAt(key.lean, rig.pivot, 0, key.bodyBob + rootY);
    const hips: Point = [
      (skin.bindings.chains.nearLeg[0][0] + skin.bindings.chains.farLeg[0][0]) /
        2,
      (skin.bindings.chains.nearLeg[0][1] + skin.bindings.chains.farLeg[0][1]) /
        2,
    ];
    const posedHips = map(pelvis, hips);
    const upper = runV2
      ? compose(pelvis, rotateAt(key.torsoLean ?? 0, hips))
      : pelvis;
    if (inspect)
      inspection.bodyBones = rig.bones
        .filter((bone) => ["root", "torso", "head"].includes(bone.id))
        .map((bone) => ({
          id: bone.id,
          from:
            bone.id === "root"
              ? [...rig.anchor]
              : runV2 && bone.id === "torso"
                ? posedHips
                : map(upper, bone.from),
          to: runV2 && bone.id === "root" ? posedHips : map(upper, bone.to),
        }));
    const phase = (index * Math.PI * 2) / count;
    const clothLag = Math.sin(phase - Math.PI / 3);
    const draw = (slot: Slot, matrix: Matrix = upper, warp: LayerWarp = {}) => {
      const item = attachments.get(slot);
      if (item) canvas.draw(item.layer, item.pixels, matrix, warp);
    };
    const posed = new Map<ChainName, JointTriple>();
    const runShoes = new Map<ChainName, Matrix>();
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
        const hip = map(runV2 ? pelvis : upper, start);
        let ankle: Point = [
          animation === "run"
            ? (runV2 ? posedHips[0] : hip[0]) + opposite.footX
            : end[0] + opposite.footX,
          end[1] - opposite.footLift + rootY,
        ];
        if (runV2 || (animation === "run" && skin.runShoes)) {
          const source = shoeSource(chain as "nearLeg" | "farLeg", animation);
          const item = requireAttachment(source.slot);
          const shoe = rotateAt(
            opposite.shoePitch,
            source.ankle,
            ankle[0] - source.ankle[0],
          );
          const dy =
            rig.anchor[1] - 1 - rotatedSole(item, shoe) - opposite.footLift;
          ankle = [ankle[0], source.ankle[1] + dy];
          runShoes.set(chain, [
            shoe[0],
            shoe[1],
            shoe[2],
            shoe[3],
            shoe[4],
            shoe[5] + dy,
          ]);
        }
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
        useActiveForearms =
          !!skin.actionForearms &&
          (animation === "run" || animation === "jump") &&
          skin.actionForearms[animation] !== undefined,
        bent =
          animation === "run" &&
          skin.runLegs &&
          (chain === "nearLeg" || chain === "farLeg")
            ? skin.runLegs[chain]
            : undefined,
        useBent =
          !!bent &&
          preferBentLeg(skin.bindings.chains[chain], bent.joints, joints),
        mesh = useBent
          ? bentLegMeshes.get(chain as "nearLeg" | "farLeg")!
          : useActiveForearms && (chain === "nearArm" || chain === "farArm")
            ? activeArmMeshes.get(chain)!
            : meshes.get(chain)!;
      const side = chain.startsWith("near") ? "near" : "far";
      const sourceSlots: Slot[] = useBent
        ? [bent!.slot]
        : chain.endsWith("Arm")
          ? [
              `${side}-upper-arm`,
              `${side}-forearm${useActiveForearms ? "-active" : ""}`,
            ]
          : [`${side}-thigh`, `${side}-shin`];
      mesh.draw(canvas, joints);
      if (inspect)
        inspection.limbs.push({
          id: chain,
          variant: useBent ? "bent" : "base",
          sourceSlots,
          bones: [...joints],
          ...mesh.inspect(joints),
        });
      if (chain.endsWith("Leg")) {
        const near = chain.startsWith("near"),
          source = shoeSource(chain as "nearLeg" | "farLeg", animation),
          slot = source.slot;
        const opposite = jumping
          ? key
          : keys[(index + (near ? 0 : Math.floor(count / 2))) % count];
        const ankle = source.ankle;
        const sole = requireAttachment(slot).sourceBottom;
        draw(
          slot,
          runShoes.get(chain) ??
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
        case "hips":
          draw(slot, runV2 ? pelvis : upper);
          break;
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
