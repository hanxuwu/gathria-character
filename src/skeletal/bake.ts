import { strToU8, unzipSync, zipSync } from "fflate";
import { createCharacterPack, validateManifest } from "../core/pack";
import type { CharacterPackManifest, GeneratedCharacter } from "../core/types";
import { prepareRig } from "./renderer";
import {
  FRAME_HEIGHT as H,
  FRAME_WIDTH as W,
  type AuthoringProject,
} from "./types";

export const LEGACY_REUSABLE_GENERATOR_ID = "gathria-reusable-rig-v1";
export const REUSABLE_GENERATOR_ID = "gathria-reusable-rig-v2";

/** Every output frame comes from the shared rig, including idle and walk.
 * No baked source character, identity-based dispatch or legacy fallback is used. */
export function bakeProject(project: AuthoringProject): GeneratedCharacter {
  const rig = prepareRig(project.rig, project.skin, project.motions);
  const hasJump = Boolean(project.motions.clips.jump);
  const rows = hasJump ? 6 : 4;
  const width = W * 8,
    height = H * rows;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const frames: CharacterPackManifest["frames"] = [];
  const animations = {} as CharacterPackManifest["animations"];
  let nextId = 0;
  for (const animation of ["idle", "walk", "run", "jump"] as const) {
    const clip = project.motions.clips[animation];
    if (!clip) continue;
    const count = animation === "idle" ? 4 : animation === "walk" ? 8 : 12;
    if (clip.keys.length !== count)
      throw Error(
        `${animation} requires ${count} source keys for this rig version.`,
      );
    const startId = nextId;
    for (let index = 0; index < count; index++) {
      const column = index % 8;
      const row =
        (animation === "idle"
          ? 0
          : animation === "walk"
            ? 1
            : animation === "run"
              ? 2
              : 4) + Math.floor(index / 8);
      const x = column * W,
        y = row * H;
      const rgba = rig.frame(animation, index, project.preview.expression);
      for (let dy = 0; dy < H; dy++)
        pixels.set(
          rgba.subarray(dy * W * 4, (dy + 1) * W * 4),
          ((y + dy) * width + x) * 4,
        );
      frames.push({ id: nextId++, x, y, width: W, height: H });
    }
    if (
      clip.sequence.some(
        (index) => !Number.isInteger(index) || index < 0 || index >= count,
      )
    )
      throw Error(`Invalid ${animation} playback sequence.`);
    animations[animation] = {
      frames: clip.sequence.map((index) => startId + index),
      fps: clip.fps,
      loop: clip.loop,
    };
  }
  const manifest = validateManifest({
    schemaVersion: 1,
    format: "gathria-character-pack",
    name: project.skin.metadata.name,
    generator: hasJump ? REUSABLE_GENERATOR_ID : LEGACY_REUSABLE_GENERATOR_ID,
    spritesheet: {
      file: "spritesheet.png",
      width,
      height,
      frameWidth: W,
      frameHeight: H,
      columns: 8,
      rows,
    },
    frames,
    animations,
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
  return { width, height, pixels, manifest };
}

/** A normal, five-file CharacterPack is independent of the authoring tool.
 * The separately saved authoring ZIP contains the images required to edit or
 * reproduce this result. character.json is intentionally only a compatibility
 * appearance reference and is never advertised as the imported-art recipe. */
export async function createBakedPack(
  project: AuthoringProject,
): Promise<Blob> {
  const generated = bakeProject(project);
  const reference = {
    ...project.skin.metadata.sourceAppearance,
    // Preview/run support is explicit even when the imported artwork used a
    // historical V6 reference with no motion version. This is playback
    // compatibility metadata, never the recipe for imported RGBA artwork.
    motionVersion: 3 as const,
    name: project.skin.metadata.name,
    expression: project.preview.expression,
    preview: {
      animation:
        project.preview.animation === "jump"
          ? ("idle" as const)
          : project.preview.animation,
      facing: project.preview.facing,
    },
  };
  const ordinary = await createCharacterPack(reference, generated);
  const files = unzipSync(new Uint8Array(await ordinary.arrayBuffer()));
  const notice =
    `Gathria reusable skeletal rig ${project.motions.clips.jump ? "v2" : "v1"}\n\n` +
    "All available action frames were generated locally from a registered skin pack, the shared humanoid bone hierarchy and motion library. No Spine software, format, runtime or copied implementation is used. No image-generation service is called during rendering or playback.\n\n" +
    "ARTWORK SOURCE\n" +
    project.skin.metadata.provenance +
    "\n\n" +
    "REPRODUCTION AND COMPATIBILITY\n" +
    "Save the separate authoring project ZIP: it contains this skin's full RGBA images, binding data, rig and clips. This playback package contains baked pixels only. character.json is a legacy-compatible appearance reference; opening it in ordinary Studio does NOT reproduce an imported skin or this rig's animation. Use Skin Studio and the saved authoring project to reproduce or edit these frames.\n" +
    "The project-owned rendering code is covered by the repository license. Rights in imported artwork are determined by the supplied source provenance; the renderer does not assign a new license to third-party images. Gathria production integration remains unverified.\n\n";
  const recipe = {
    ...project,
    skin: {
      metadata: project.skin.metadata,
      images:
        "Stored in the separate authoring ZIP; omitted from this playback package.",
    },
  };
  files["PROVENANCE.txt"] = strToU8(
    notice +
      "AUTHORING METADATA (not a self-contained image recipe)\n" +
      JSON.stringify(recipe, null, 2) +
      "\n",
  );
  const timing = (["idle", "walk", "run", "jump"] as const)
    .filter((animation) => generated.manifest.animations[animation])
    .map((animation) => {
      const clip = generated.manifest.animations[animation]!;
      return `- ${animation}: ${clip.frames.length} playback entries at ${clip.fps} FPS, loop=${clip.loop}.`;
    })
    .join("\n");
  files["INTEGRATION.md"] = strToU8(
    "# Reusable rig baked CharacterPack\n\n" +
      notice +
      "Read manifest.json and decode spritesheet.png as RGBA. Validate the format/schema and PNG dimensions. Resolve animation frame references by frame ID, not array index. Play each available action using the manifest's actual sequence and declared FPS; loop only when loop is true. Timing can be edited in the authoring project.\n\n" +
      timing +
      "\n\n" +
      "Draw at a positive integer scale with image smoothing disabled. Keep the frame-local anchor at the same world position when mirroring left-facing output; never mirror the whole spritesheet. These are in-place clips, with world movement supplied separately by the scene. All actions in this pack were baked by the shared rig; historical V6 idle/walk pixels are not reused.\n\n" +
      "This package's five root files are sufficient for independent playback. character.json is a compatibility appearance reference, not an imported-art reproduction recipe. Retain the separate authoring ZIP to edit or reproduce the full rig and skin. See player.html and docs/CHARACTER_PACK_V1.md for the playback contract. Jump, when present, is a one-shot clip: hold its final authored frame (landed in the default clip) and replay explicitly. The older three-action atlas stays unchanged; jump occupies appended rows 4 and 5. Older packages without run or jump remain playable; disable unavailable actions instead of inventing frames. The legacy character.json preview falls back to idle when authoring jump; the full project preserves jump selection.\n",
  );
  return new Blob([zipSync(files, { level: 6 })], { type: "application/zip" });
}
