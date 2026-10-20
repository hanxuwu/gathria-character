# Kling reference video audit

Source is a 1920×1080 H.264 clip at 24 fps, 361 video frames, 15.041667 s, with AAC audio. Original file SHA256 and selected frame hashes are in metadata.json.

## Frozen stance

Use frame 348 / 14.50 seconds, frame-14.50.png. It has open eyes, a complete stable three-quarter-right standing silhouette, clearly visible hands and shoes, and no apparent motion blur. 13.00 s still lowers the arms and has half-closed eyes. 13.25–15.00 s are broadly stable but have tiny breathing and face drift; only the selected stance should establish anatomy.

Approximate silhouette bbox is (738,158)–(1137,974), excluding shadow. The head spans approximately x755–1134, y158–496, giving about 2.4 head heights in the whole figure. The near shoe naturally sits about 11 video pixels lower than the far shoe. Estimated landmarks in metadata.json are visual references, not extracted original rig joints.

## Other pose references

- Walk contact/forward step: around 0.60 s (frame-00.60.png, approximately source frame 15 / 0.625 s).
- Run flight: frame 102 / 4.25 s (frame-04.25.png), a clear gap under both feet; opposite arm/leg placement is readable.
- Celebration: frame 276 / 11.50 s (frame-11.50.png), hands above shoulders, open smile, closed happy eyes.

Video motion changes some details and proportions. These poses must not replace the frozen standing face/neck/body design.

## Style and source limitations

The uploaded PNG and selected stance are smooth 2D cartoon illustration: warm round face, brown eyes, softly shaded skin, short broad neck, compact grey/sage vest and dark shorts, full bare limbs, small white shoes. The video stance has a slightly broader cranium/cheeks and full limbs relative to the PNG. It is not native low-resolution pixel art; preserve a clean antialiased HD source and prepare any 192×256 runtime copy separately.

The muted green, textured background and diffuse ground shadow do not belong to the character. Neither the video nor the PNG supplies original layers, hidden shoulder/hip artwork, a true back view, or exact rotations. Those must be authored and described as inferred or repainted content.
