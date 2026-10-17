# Reusable rig baked CharacterPack

Gathria reusable skeletal rig v2

All available action frames were generated locally from a registered skin pack, the shared humanoid bone hierarchy and motion library. No Spine software, format, runtime or copied implementation is used. No image-generation service is called during rendering or playback.

ARTWORK SOURCE
Prepared from this repository's existing AI-assisted V6 source artwork at 391d842c5241814aca39bed94df4373e0ceb346f. Technical extraction reuses polishedBank and Motion 3 arm ownership; no new model call or third-party illustration. Full-frame RGBA slots retain source color/texture. See docs/ASSET_PROVENANCE.md and docs/REUSABLE_RIG_REVIEW.md. Original project artwork reuse follows the repository MIT notice; imported replacement art retains its own source terms.

REPRODUCTION AND COMPATIBILITY
Save the separate authoring project ZIP: it contains this skin's full RGBA images, binding data, rig and clips. This playback package contains baked pixels only. character.json is a legacy-compatible appearance reference; opening it in ordinary Studio does NOT reproduce an imported skin or this rig's animation. Use Skin Studio and the saved authoring project to reproduce or edit these frames.
The project-owned rendering code is covered by the repository license. Rights in imported artwork are determined by the supplied source provenance; the renderer does not assign a new license to third-party images. Gathria production integration remains unverified.

Read manifest.json and decode spritesheet.png as RGBA. Validate the format/schema and PNG dimensions. Resolve animation frame references by frame ID, not array index. Play each available action using the manifest's actual sequence and declared FPS; loop only when loop is true. Timing can be edited in the authoring project.

- idle: 12 playback entries at 4 FPS, loop=true.
- walk: 8 playback entries at 10 FPS, loop=true.
- run: 12 playback entries at 18 FPS, loop=true.
- jump: 12 playback entries at 15 FPS, loop=false.

Draw at a positive integer scale with image smoothing disabled. Keep the frame-local anchor at the same world position when mirroring left-facing output; never mirror the whole spritesheet. These are in-place clips, with world movement supplied separately by the scene. All actions in this pack were baked by the shared rig; historical V6 idle/walk pixels are not reused.

This package's five root files are sufficient for independent playback. character.json is a compatibility appearance reference, not an imported-art reproduction recipe. Retain the separate authoring ZIP to edit or reproduce the full rig and skin. See player.html and docs/CHARACTER_PACK_V1.md for the playback contract. Jump, when present, is a one-shot clip: hold its final authored frame (landed in the default clip) and replay explicitly. The older three-action atlas stays unchanged; jump occupies appended rows 4 and 5. Older packages without run or jump remain playable; disable unavailable actions instead of inventing frames. The legacy character.json preview falls back to idle when authoring jump; the full project preserves jump selection.
