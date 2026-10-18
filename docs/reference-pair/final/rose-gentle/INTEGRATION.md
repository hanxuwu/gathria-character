# Reusable rig baked CharacterPack

Gathria reusable skeletal rig v2

All available action frames were generated locally from a registered skin pack, the shared humanoid bone hierarchy and motion library. No Spine software, format, runtime or copied implementation is used. No image-generation service is called during rendering or playback.

ARTWORK SOURCE
[skin-artwork]
Prepared offline from this repository's existing AI-assisted V6 crop/waves heads, illustrated everyday garments and Motion 3 repaired arm/skirt ownership. No new image-model call. Raw authored RGBA+material IDs, source palettes and registration landmarks are retained. Catalog v1 uses one 192×256 humanoid rig family with garment-specific source cut landmarks. See docs/WARDROBE_ASSET_SOURCES.md and docs/ASSET_PROVENANCE.md. Original artwork reuse follows the repository MIT notice; imported artwork retains its own terms.
Wardrobe catalog 1 recipe: {"format":"gathria-wardrobe-recipe","version":3,"catalogVersion":1,"identity":"custom-rose","top":"custom-rose-top","bottom":"custom-rose-bottom","shoes":"custom-rose-shoes","colors":{"skin":"#f6c49d","hair":"#6a442f","top":"#c8786b","bottom":"#c8786b","shoes":"#8b5937"}}
Materials are recolored from authored masks. Shoes are fitted by nearest-neighbor sampling between the selected bottom's source ankle and the common grounded sole at y=239. Clean skin/cloth ankle allowances extend at most four source pixels behind the shoes; explicit preserveAnkleOverlap retains them during mesh preparation. Flat skin images remain independently exportable; character.json is a compatibility reference, not the wardrobe recipe.
Custom bottom custom-rose-bottom (Rose coral skirt): Original Rose outfit generated with OpenAI image generation during development, 2026-10-18 UTC. Retained source artwork/reference-pair/source/rose-clothing.png and exact prompts. scripts/prepare-reference-pair.mjs registers explicit source ownership, binary alpha192, nearest sampling, source masks, overlapping limb cuts and authored action hands. Shared rig and motions unchanged.
Custom shoes custom-rose-shoes (Rose brown Mary Janes): Original Rose outfit generated with OpenAI image generation during development, 2026-10-18 UTC. Retained source artwork/reference-pair/source/rose-clothing.png and exact prompts. scripts/prepare-reference-pair.mjs registers explicit source ownership, binary alpha192, nearest sampling, source masks, overlapping limb cuts and authored action hands. Shared rig and motions unchanged.
Custom top custom-rose-top (Rose coral bodice and cream sleeves): Original Rose outfit generated with OpenAI image generation during development, 2026-10-18 UTC. Retained source artwork/reference-pair/source/rose-clothing.png and exact prompts. Exposed collar upper-chest skin samples the original neutral neck ramp from pair-design.png; the torso owns this bounded allowance behind its unchanged cream scoop rim. No head or neck anchor changes. scripts/prepare-reference-pair.mjs registers explicit source ownership, binary alpha192, nearest sampling, source masks, overlapping limb cuts and authored action hands. Shared rig and motions unchanged.
Custom identity custom-rose (Rose): Original Rose complete character and three expression heads generated with OpenAI image generation during development, 2026-10-18 UTC. Source sheet and exact prompts retained at artwork/reference-pair/source. Offline source landmarks, nearest-neighbor sampling, binary alpha threshold 192, explicit face/hair/fixed masks: scripts/prepare-reference-pair.mjs. No runtime AI calls.
Identity source skin/hair pixels are preserved exactly when the chosen color equals the authored palette. Registered neck (96,118); source masks own only fixed, skin and hair.

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
