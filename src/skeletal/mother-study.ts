import { strToU8, unzipSync, zipSync } from "fflate";
import {
  createCharacterPack,
  readCharacterPackArchive,
  validateManifest,
} from "../core/pack";
import type { GeneratedCharacter } from "../core/types";
import { prepareRig } from "./renderer";
import { validateStaticRigPose, type StaticRigPose } from "./static-pose";
import {
  FRAME_WIDTH as W,
  FRAME_HEIGHT as H,
  type AuthoringProject,
  type Facing,
} from "./types";

export const STUDY_POSES = [
  { id: "standing", label: "Standing" },
  { id: "walk-contact", label: "Walk contact" },
  { id: "run-flight", label: "Run flight" },
  { id: "celebrate", label: "Celebrate" },
] as const;
export interface MotherPoseStudy {
  format: "gathria-pose-study";
  version: 1;
  name: string;
  poses: Array<{ label: string; pose: StaticRigPose }>;
}

/** This separate document never changes legacy project or motion-library schemas. */
export function parseMotherPoseStudy(
  value: unknown,
  project: AuthoringProject,
): MotherPoseStudy {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Pose study must be an object.");
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).some(
      (key) => !["format", "version", "name", "poses"].includes(key),
    )
  )
    throw Error("Pose study contains unsupported fields.");
  if (
    raw.format !== "gathria-pose-study" ||
    raw.version !== 1 ||
    typeof raw.name !== "string" ||
    !raw.name.trim() ||
    raw.name.length > 80 ||
    !Array.isArray(raw.poses) ||
    raw.poses.length !== STUDY_POSES.length
  )
    throw Error("Expected a named version 1 study with four reviewed poses.");
  const poses = raw.poses.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw Error("Each study entry must contain a label and pose.");
    const entry = item as Record<string, unknown>;
    if (Object.keys(entry).some((key) => !["label", "pose"].includes(key)))
      throw Error("Pose study entry contains unsupported fields.");
    if (
      typeof entry.label !== "string" ||
      !entry.label.trim() ||
      entry.label.length > 80
    )
      throw Error("Each study pose needs a short label.");
    return {
      label: entry.label,
      pose: validateStaticRigPose(
        entry.pose,
        project.rig,
        project.skin.metadata,
      ),
    };
  });
  if (poses.some((entry, index) => entry.pose.id !== STUDY_POSES[index].id))
    throw Error(
      "Study poses must be standing, walk-contact, run-flight, celebrate in that order.",
    );
  return { format: "gathria-pose-study", version: 1, name: raw.name, poses };
}

/** Mirror each native frame, including transparent pixels; never mirror the atlas. */
export function faceStudyPixels(pixels: Uint8ClampedArray, facing: Facing) {
  if (pixels.length !== W * H * 4)
    throw Error("A study pose must be exactly 192 × 256 RGBA pixels.");
  if (facing === "right") return new Uint8ClampedArray(pixels);
  const out = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const source = (y * W + x) * 4;
      out.set(pixels.subarray(source, source + 4), (y * W + W - 1 - x) * 4);
    }
  return out;
}

export function studySheet(
  project: AuthoringProject,
  study: MotherPoseStudy,
  facing: Facing,
) {
  const checked = parseMotherPoseStudy(study, project);
  const prepared = prepareRig(project.rig, project.skin, project.motions);
  const width = W * checked.poses.length;
  const pixels = new Uint8ClampedArray(width * H * 4);
  checked.poses.forEach(({ pose }, index) => {
    const frame = faceStudyPixels(prepared.pose(pose, "neutral"), facing);
    for (let y = 0; y < H; y++)
      pixels.set(
        frame.subarray(y * W * 4, (y + 1) * W * 4),
        (y * width + index * W) * 4,
      );
  });
  return { pixels, width, height: H };
}

/** Compatibility selectors are one-frame holds, not animation cycles. */
export function bakeStudyHolds(
  project: AuthoringProject,
  study: MotherPoseStudy,
): GeneratedCharacter {
  const checked = parseMotherPoseStudy(study, project);
  const prepared = prepareRig(project.rig, project.skin, project.motions);
  const width = W * 3;
  const pixels = new Uint8ClampedArray(width * H * 4);
  checked.poses.slice(0, 3).forEach(({ pose }, index) => {
    const frame = prepared.pose(pose, "neutral");
    for (let y = 0; y < H; y++)
      pixels.set(
        frame.subarray(y * W * 4, (y + 1) * W * 4),
        (y * width + index * W) * 4,
      );
  });
  const manifest = validateManifest({
    schemaVersion: 1,
    format: "gathria-character-pack",
    name: "Reference mother — static pose holds",
    generator: "gathria-static-pose-study-v1",
    spritesheet: {
      file: "spritesheet.png",
      width,
      height: H,
      frameWidth: W,
      frameHeight: H,
      columns: 3,
      rows: 1,
    },
    frames: [0, 1, 2].map((id) => ({
      id,
      x: id * W,
      y: 0,
      width: W,
      height: H,
    })),
    animations: {
      idle: { frames: [0], fps: 1, loop: false },
      walk: { frames: [1], fps: 1, loop: false },
      run: { frames: [2], fps: 1, loop: false },
    },
    facing: { native: "right", right: "none", left: "mirror-x" },
    anchor: {
      x: project.rig.anchor[0],
      y: project.rig.anchor[1],
      units: "pixels",
      origin: "top-left",
    },
    scale: { pixelArt: true, recommended: 1, integerOnly: true },
    configuration: "character.json",
  });
  return { width, height: H, pixels, manifest };
}

export async function createStudyHoldPack(
  project: AuthoringProject,
  study: MotherPoseStudy,
) {
  const generated = bakeStudyHolds(project, study);
  const reference = {
    ...project.skin.metadata.sourceAppearance,
    name: generated.manifest.name,
    motionVersion: 3 as const,
    expression: "neutral" as const,
    preview: { animation: "idle" as const, facing: "right" as const },
  };
  const ordinary = await createCharacterPack(reference, generated);
  const files = unzipSync(new Uint8Array(await ordinary.arrayBuffer()));
  const notice =
    "REFERENCE MOTHER CANDIDATE — STATIC POSE STUDY\n\n" +
    "These are three still poses, NOT completed idle, walk or run animation cycles. " +
    "The CharacterPack v1 compatibility selectors map idle to Standing, walk to Walk contact and run to Run flight. " +
    "Each selector holds one frame at 1 FPS with loop=false. Celebration is deliberately excluded; it is not a jump animation.\n\n" +
    "ARTWORK SOURCE\n" +
    project.skin.metadata.provenance +
    "\n\n" +
    "The candidate is composed locally from registered RGBA parts and explicit static joint coordinates. " +
    "No runtime image-generation calls are made. Legacy defaults, motion clips and saved configurations are unchanged. " +
    "character.json is only a legacy appearance reference, not a recipe that reproduces this imported character. " +
    "Retain the separate pose-study archive (project.rig.zip + poses.json + registration metadata) to reproduce all four candidate poses. " +
    "Opening project.rig.zip in ordinary Skin Studio uses its ordinary motion path, not these explicit review poses.\n";
  files["PROVENANCE.txt"] = strToU8(notice);
  files["INTEGRATION.md"] = strToU8(
    "# Static pose holds — CharacterPack v1\n\n" +
      notice +
      "\n" +
      "Decode spritesheet.png as RGBA and resolve frames by manifest frame ID. " +
      "Use the declared 192×256 frame size and fixed anchor; mirror each frame for left-facing output. " +
      "Keep nearest-neighbour sampling at positive integer scales. All three selectors are one-shot still holds. " +
      "No jump selector is included. The five root files load in the unchanged independent player. " +
      "Gathria production integration and final user visual acceptance remain unverified.\n",
  );
  const bytes = zipSync(files, { level: 6 });
  readCharacterPackArchive(bytes);
  return new Blob([bytes], { type: "application/zip" });
}
