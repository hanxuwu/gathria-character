# Experimental baked pack

EXPERIMENTAL DENIM SKELETAL BAKE v1
Run frames use this project's own weighted mesh/triangle renderer. No Spine software, file format, runtime or third-party animation code is included.
Appearance textures reuse the existing AI-assisted V6 sources; no new artwork/model call was made for this experiment. Source revision: ea01dd8e074741fdfab0311e1e64585329c29391.
Idle/walk pixels are unchanged from Motion 3. character.json preserves appearance; opening it in ordinary Studio intentionally regenerates production Motion 3, NOT this experimental run.
Reproduce the experimental run with rig-lab.html and the separate rig project JSON. The exact recipe is also embedded below. No runtime interpretation is needed for playback.

# CharacterPack v1

Read manifest.json and decode spritesheet.png as an RGBA image. Validate schemaVersion = 1 and format = "gathria-character-pack", then validate PNG dimensions against spritesheet.width/height.

frames contains grid-aligned source rectangles, each with a unique numeric id. Resolve animation frame references by id (not by array index). Play animations.idle, animations.walk or the optional animations.run at their declared fps; loop only when loop is true. Running uses 12 frames at 18 FPS. Old packs can omit run; consumers must disable unavailable actions instead of inventing run frames. The atlas appends running below the unchanged V6 idle/walk rows. These are in-place clips: world movement, if desired, is supplied separately by the consuming scene.

Draw the source rectangle at a positive integer scale with image smoothing disabled. Coordinates are pixels from the top-left. anchor.x/y are frame-local placement coordinates: draw the frame with its anchor at your world position. For left-facing output mirror the frame horizontally around its anchor; for right-facing output draw it unchanged. Keep the same world anchor when flipping. Do not flip the entire spritesheet.

character.json is editable source configuration, not required for playback. This pack contains all assets needed by a consumer; do not regenerate them. See the repository docs/CHARACTER_PACK_V1.md for the complete contract and the standalone player at player.html for an implementation.

Frame dimensions and timing are prototype choices, not verified Gathria requirements. Gathria integration remains unverified pending inspection of its actual runtime.
