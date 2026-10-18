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

## Final prepared candidate

[Preparation details](prepared/PREPARATION.md) and
[registration/checks/hashes](prepared/registration.json) record the exact offline
processing. The standing master uses uniform scale 0.484 and neck `(96,118)`;
the far shoe is translated down two pixels to the common sole baseline. Helper
heads use a uniform scale of 0.318. Helper arm/action-hand cells are retained as
unused source material: the actual character uses the complete master's curled
hands for all actions.

The helper contributes neutral/joyful heads and hidden cloth only. Ownership
corrections remove misplaced hand fringe and duplicated coat hem, restrict fill
to occluded areas, and distinguish bright hair from skin. All fifteen registered
source slots preserve exact source RGBA at their declared colors through the
explicit V3 garment color contract.

The new project owns its twelve-key 18 fps run and four jump-clearance keys;
old projects and global motions are unchanged. Moving source hip annotations
inside the hidden pelvis leaves standing pixels exact but improves first-contact
foot separation. Deep folds and asymmetric half-cycle strides remain limits.
The final and old-run comparator projects use identical artwork and bindings.

Historical prepared trials are retained under `prepared/iterations/`; they are
technical diagnostics. [Actual Studio exports and independent playback](../../docs/theo-pose-study/README.md)
are the final review evidence.
