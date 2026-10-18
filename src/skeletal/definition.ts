import type {
  RigDefinition,
  MotionLibrary,
  MotionKey,
  JointTriple,
  ChainName,
} from "./types";
import { RIG_ID } from "./types";

/** Project-owned topology, in the established 192 × 256 authoring space.
 * Skins fit these semantic chains to their own source landmarks; motions never
 * contain a character name, garment choice, layer ID or bitmap. */
export function createRigDefinition(): RigDefinition {
  const chains: Record<ChainName, JointTriple> = {
    nearArm: [
      [75, 122],
      [64, 150],
      [60, 171],
    ],
    farArm: [
      [123, 123],
      [130, 150],
      [134, 171],
    ],
    nearLeg: [
      [86, 172],
      [79, 198],
      [73, 227],
    ],
    farLeg: [
      [110, 172],
      [108, 198],
      [110, 227],
    ],
  };
  const bones: RigDefinition["bones"] = [
    { id: "root", parent: null, from: [96, 240], to: [96, 170] },
    { id: "torso", parent: "root", from: [96, 170], to: [96, 118] },
    { id: "head", parent: "torso", from: [96, 118], to: [111, 64] },
  ];
  for (const [chain, joints] of Object.entries(chains)) {
    bones.push(
      {
        id: `${chain}:upper`,
        parent: "torso",
        from: [...joints[0]],
        to: [...joints[1]],
      },
      {
        id: `${chain}:lower`,
        parent: `${chain}:upper`,
        from: [...joints[1]],
        to: [...joints[2]],
      },
    );
  }
  return {
    format: "gathria-rig",
    version: 1,
    id: RIG_ID,
    frame: { width: 192, height: 256 },
    anchor: [96, 240],
    pivot: [96, 170],
    bones,
    chains,
    drawOrder: [
      "back-hair",
      "far-arm",
      "far-leg",
      "near-leg",
      "hips",
      "garment",
      "torso",
      "near-arm",
      "head",
    ],
  };
}

const key = (patch: Partial<MotionKey>): MotionKey => ({
  footX: 0,
  footLift: 0,
  shoePitch: 0,
  bodyBob: 0,
  armAngle: 0,
  lean: 0,
  armSwing: 0,
  ...patch,
});

/** Twelve one-shot phases: source poses and labels stay shared across skins. */
export const JUMP_PHASES = [
  "Ready",
  "Anticipation",
  "Compression",
  "Takeoff",
  "Ascent",
  "Apex",
  "Float",
  "Descent",
  "Contact",
  "Landing",
  "Recovery",
  "Ready",
] as const;

/** One motion library is applied to every registered skin. Keys are geometry;
 * sequences are playback timing, so held idle keys do not duplicate images. */
export function createMotionLibrary(): MotionLibrary {
  const footX = [12, 0, -13, -25, -27, -25, -20, -12, 0, 10, 16, 16];
  const footLift = [0, 0, 0, 10, 24, 34, 36, 30, 22, 14, 6, 2];
  const shoePitch = [0, 0, 0, 0.18, 0.4, 0.48, 0.38, 0.2, 0.05, -0.1, -0.08, 0];
  const bob = [2, 4, 2, -1, -2, 0];
  const armAngle = [
    -0.16, 0.16, 0.44, 0.6, 0.6, 0.44, 0.16, -0.16, -0.44, -0.6, -0.6, -0.44,
  ];
  const walkX = [12, 7, 0, -7, -12, -8, 0, 9];
  const walkLift = [0, 0, 0, 0, 0, 5, 9, 5];
  const walkBob = [0, -1, -2, -1, 0, -1, -2, -1];
  const walkArm = [-8, -6, 0, 6, 8, 6, 0, -6];
  return {
    format: "gathria-motion-library",
    version: 1,
    id: "gathria-shared-basic-actions-2",
    clips: {
      idle: {
        fps: 4,
        loop: true,
        keys: [0, -1, -1, 0].map((bodyBob, i) =>
          key({ bodyBob, armSwing: [0, 1, 0, -1][i] }),
        ),
        sequence: [0, 0, 1, 1, 2, 2, 2, 2, 3, 3, 0, 0],
      },
      walk: {
        fps: 10,
        loop: true,
        keys: walkX.map((x, i) =>
          key({
            footX: x,
            footLift: walkLift[i],
            bodyBob: walkBob[i],
            armSwing: walkArm[i],
          }),
        ),
        sequence: Array.from({ length: 8 }, (_, i) => i),
      },
      jump: {
        fps: 15,
        loop: false,
        keys: [
          key({}),
          key({ bodyBob: 4, armAngle: 0.12, armBend: -0.12 }),
          key({ bodyBob: 7, armAngle: 0.24, armBend: -0.2, lean: 0.03 }),
          key({ rootY: -1, bodyBob: 1, armAngle: -0.35, armBend: -0.55 }),
          key({ rootY: -3, footLift: 8, armAngle: -0.55, armBend: -0.65 }),
          key({ rootY: -4, footLift: 10, armAngle: -0.65, armBend: -0.75 }),
          key({ rootY: -4, footLift: 10, armAngle: -0.58, armBend: -0.65 }),
          key({ rootY: -3, footLift: 8, armAngle: -0.45, armBend: -0.45 }),
          key({ bodyBob: 1, armAngle: -0.18, armBend: -0.15 }),
          key({ bodyBob: 6, armAngle: 0.08, armBend: -0.1 }),
          key({ bodyBob: 3 }),
          key({}),
        ],
        sequence: Array.from({ length: 12 }, (_, i) => i),
      },
      run: {
        fps: 18,
        loop: true,
        keys: footX.map((x, i) =>
          key({
            footX: x,
            footLift: footLift[i],
            shoePitch: shoePitch[i],
            bodyBob: bob[i % 6],
            armAngle: armAngle[i],
            lean: 0.1,
          }),
        ),
        sequence: Array.from({ length: 12 }, (_, i) => i),
      },
    },
  };
}

/** Explicit opt-in defaults for the centered, ground-aware run solver.
 * Historical project creation still calls createMotionLibrary (version 1).
 * Resetting an existing v2 run uses these coordinates, never a v1 clip whose
 * foot travel was measured from two different anatomical hips. */
export function createMotionLibraryV2(): MotionLibrary {
  const library = createMotionLibrary();
  const footX = [18, 6, -6, -18, -25, -27, -23, -18, -3, 11, 19, 20];
  const footLift = [0, 0, 0, 3, 9, 16, 21, 17, 14, 10, 6, 3];
  const shoePitch = [
    -0.08, 0, 0.18, 0.32, 0.45, 0.48, 0.38, 0.2, 0.05, -0.1, -0.12, -0.1,
  ];
  const bodyBob = [4, 5, 4, 2, 0, 2];
  const torsoLean = [0, 0.012, 0.018, 0.01, -0.006, -0.01];
  return {
    ...library,
    version: 2,
    id: "gathria-centered-run-1",
    clips: {
      ...library.clips,
      run: {
        ...library.clips.run,
        keys: library.clips.run.keys.map((pose, i) => ({
          ...pose,
          footX: footX[i],
          footLift: footLift[i],
          shoePitch: shoePitch[i],
          bodyBob: bodyBob[i % 6],
          lean: 0.14,
          torsoLean: torsoLean[i % 6],
        })),
      },
    },
  };
}
