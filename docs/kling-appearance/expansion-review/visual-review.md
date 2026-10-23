# New hairstyle visual review

This is an implementation review of the exported Kling characters, not user visual acceptance. The generated design sheet and offline fitting probes were used to author the material; they are not evidence that the browser output works.

## Actual inspection scope and method

Both final Everyday / Chestnut / Gentle CharacterPacks were decoded and visually reviewed: **88 distinct male frames and 96 distinct female frames**. These are the selected source poses, not 184 newly drawn animation frames. Each pose was checked in a native 1× near-ear contact sheet; complete head/body silhouettes were checked in reduced full-frame contact sheets (prepared at 0.5×, potentially further scaled by the viewing tool). The native ear crops use each registered ear center and cover 260×260 pixels, including the upper rim, sideburn, rear-hair join and adjacent cheek/neck. Full-frame review uses a fixed canvas and therefore does not hide body/head position changes by recentering the character.

This includes every retained idle/walk/run/celebrate/jump pose, all **16 run poses 51–66** for each character, high-hand poses 71–80, crouch/takeoff 83–90 and landing/recovery 100–121. Female frame 77 is not a selected pose; 75 and 78/79/80 were reviewed directly. Original-clothing frame-0 PNGs were inspected at native size. Three hair colors × Original/Gentle were compared at frame 0 in a labeled 0.7× head board made from actual PNGs. Native additional views include male Copper/Gentle 86, female Espresso/Gentle 86, male Everyday 55/78 and female Everyday 78/79. Actual left-facing run PNG 55 was inspected for both characters. Wedding native checks cover male crouch 86 and female raised hands 78; the complete full-pack audit is of the Everyday outfits, not a second complete Wedding export.

The two delivered native ear-run GIFs use a fixed union crop. Their last two and first two decoded images (65, 66, 51, 52) were inspected side by side with the matching original source region. No additional hair/ear registration snap was visible at that boundary. Idle and walk first/last poses were also compared in the decoded pack sheets. These are **frame-by-frame and boundary observations**, not a claim that the image tool played every GIF continuously. Independent playback is established separately by the two browser capture indexes (20 action/direction checks after the editors were closed); timing and mirror checks are technical evidence, not a substitute for visual acceptance.

The exact package identities and inspected frame IDs are recorded in [final-visual-validation.json](final-visual-validation.json). [artifact-validation.json](artifact-validation.json) records the separate RGBA, decoding, timing, transparent-boundary and mirror assertions.

## Findings from actual pixels

- **Male Side part:** the swept silhouette and short sideburn remain distinct from Soft crop and Soft bob. The upper ear is partially covered by hair, instead of exposing the initial triangular scalp opening. The rear lock fills the earlier gap behind the ear without becoming a tail beside the neck. The lower sideburn edge is compact and slightly blunt; this is retained as the current design, not described as strand-level perfect.
- **Female Tucked bun:** the bun sits behind the near ear and remains above the shoulder. Hair-only width fitting and rear-layer tucking avoid the oversized donor silhouette and loose nape curls seen in early fitting probes. In raised-hand frames 78/79, the original fist remains in front of the bun and the original ear remains in front of rear hair.
- **Colors and faces:** Chestnut, Espresso and Copper preserve the same strands and attachment. Original/Gentle switch without moving the head or changing the hairstyle silhouette. The existing Gentle expression remains intentionally subtle on open-eye frames; this batch adds no new facial states.
- **Crouch:** the new hair follows the original lowered/tilted head and does not visibly detach from the ear, cross the shoulder or flatten against the canvas boundary in frame 86 or the complete decoded crouch sequences. A short nape point is still visible behind the female ear in the deepest landing crouches 106–108; it follows the neck contour and is not the former detached curl.

## Limits visible in the evidence

Fine purple/green extraction fringe is still visible on original ear, chin, fingers and body edges, especially against a dark background. Some source closed-eye frames contain small bright marks, and fast source poses have motion blur. These predate this new hair and are preserved rather than recolored or repainted. The raised-hand alpha fringe can remain visible where a source finger touches hair. Existing shirt/pants/skirt folds are outside this batch.

The bun and fringe follow the registered head; no secondary strand physics or newly redrawn turning views are added. GIF palette conversion and reduced full-body previews are review aids; native PNGs and CharacterPack RGBA are the stronger evidence for thin edges. Exact-pixel invariants and manual visual observations are reported separately.

## Review conclusion

The actual new styles are ready for user review: no large upper-ear opening, detached rear lock, lost foreground fist or new canvas clipping was found in the inspected poses. The male fringe remains relatively compact/blunt above the ear, and the female tiny nape point and source extraction fringe remain visible at close range. This conclusion covers the inspected batch only; it does not establish flawless edges, new hair physics or user-approved animation quality.
