# Theo: complete-figure pose study

Development date: 2026-10-18. This bounded study follows the review of the
Theo/Rose pair: improve one whole character and one suit before adding more
identities or clothing. Previous sources and exported projects are preserved.

## New illustration sources

Two development-time OpenAI image-generation calls produced untouched PNGs:

- `source/complete-pose-model.png`: one complete relaxed standing Theo and five
  rightward running pose studies. The existing pair design and actual output
  supplied identity/style references. The model has a fuller chest, broader
  rounded sleeves, more substantial hands/shoes and consistent warm lighting.
- `source/hidden-parts-expressions.png`: torso/arm/pelvis coverage for regions
  hidden in the standing model, two complete expression heads and active
  forearms. It uses the complete model as reference. Generated extras such as
  the torso's trouser fragment and pelvis's short leg ends are not valid
  ownership; preparation must exclude them.
- `source/prompts.json`: exact prompts for both calls.

The five source running drawings are design studies, not an exported animation
or a complete cyclic spritesheet. Their complete-character silhouettes guide
the local skeleton trial; the existing rig cannot reproduce every illustrated
torso turn, coat fold or bent-knee contour. Actual review evidence is exported
separately from Skin Studio.

## Registration direction

Derive a common scale and positions from the complete standing master rather
than squeezing each isolated part into the earlier narrow Theo bounds. Preserve
visible master artwork where possible; use supplementary parts for genuinely
hidden coverage. Register complete expression heads and retain a short connected
neck. Explicit semantic masks distinguish fabric, skin and fixed ivory/floral
details. Source alpha cleanup and nearest-neighbor sampling retain crisp pixels.

The new projects use new identity/item IDs and an opt-in project-owned run clip.
Original Theo, Rose, old versions and exported packages remain reproducible.
There are no runtime image-generation calls. Source images, technical preparation
and actual application outputs are distinct deliverables, and visual acceptance
remains for the user to decide.
