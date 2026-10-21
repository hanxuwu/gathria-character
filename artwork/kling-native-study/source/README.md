# Native Kling male study sources

`reference.png` is copied **verbatim** from the already approved transparent
male frame 348 (14.50 s) in `artwork/kling-jump/prepared/kling-source.zip`, member
`characters/male/layers/body_composite/idle_loop/012.png`. Its 704×1056 canvas,
face, neck, proportions, source shading and smooth alpha remain intact. This
candidate does not substitute the earlier generated reference-mother drawing.

`hidden-joints.png` is one development-time OpenAI image-generation result,
conditioned on this exact reference. It supplies **newly authored occluded
coverage**, not recovered video layers. The original generated file is retained
unchanged. Peripheral translucent glow in the sheet is excluded by registration
masks; no generated background is transferred into the character.

The generation request asked for four isolated painted assets in a 2×2 layout:
a round-capped arm, a complete gray-beige vest torso, a round-capped bare leg,
and a complete dark-shorts pelvis. It explicitly requested the reference's warm
skin, thin dark-brown outline and smooth 2D cartoon shading; no head, new character
identity, pixel-art conversion, text or ground shadow. See the complete retained
request in `generation-prompt.txt` and hashes in `provenance.json`.

`scripts/prepare-kling-native-study.py` assigns every original source pixel to
exactly one anatomical group. Supplementary shoulder, shorts-root and ankle
patches are placed behind original owners. An early vest-side patch was removed
after posing revealed a disconnected sliver; the complete original vest is used.
Patch source boxes, destination
boxes and pixel counts are recorded in `../prepared/preparation-report.json`.
Only hidden supplementary paint is resized; original visible pixels are never
rescaled or recolored. Full-resolution smooth-alpha PNG parts retain the same
canvas coordinates, and complete limb textures are reassembled before bending.

Standing source-over reconstruction currently differs by zero RGBA pixels.
That is a decomposition integrity check, **not** proof of natural movement or
user visual acceptance. New posed renders are derived skeletal stills rather
than frames extracted from the original video. Neutral expression and fixed
vest/shorts/shoes are the only material design in this bounded candidate.
