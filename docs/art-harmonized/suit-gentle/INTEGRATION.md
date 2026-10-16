# CharacterPack v1

Read manifest.json and decode spritesheet.png as an RGBA image. Validate schemaVersion = 1 and format = "gathria-character-pack", then validate PNG dimensions against spritesheet.width/height.

frames contains grid-aligned source rectangles, each with a unique numeric id. Resolve animation frame references by id (not by array index). Play animations.idle or animations.walk at their declared fps; loop only when loop is true.

Draw the source rectangle at a positive integer scale with image smoothing disabled. Coordinates are pixels from the top-left. anchor.x/y are frame-local placement coordinates: draw the frame with its anchor at your world position. For left-facing output mirror the frame horizontally around its anchor; for right-facing output draw it unchanged. Keep the same world anchor when flipping. Do not flip the entire spritesheet.

character.json is editable source configuration, not required for playback. This pack contains all assets needed by a consumer; do not regenerate them. See the repository docs/CHARACTER_PACK_V1.md for the complete contract and the standalone player at player.html for an implementation.

Frame dimensions and timing are prototype choices, not verified Gathria requirements. Gathria integration remains unverified pending inspection of its actual runtime.
