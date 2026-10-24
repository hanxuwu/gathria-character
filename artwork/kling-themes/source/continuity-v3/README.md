# Locomotion continuity authoring record

This batch starts at merged `ce4c38e`. `baseline.json` freezes the SHA256 of 65
published original/R1/R2 files and prepared assets before any authoring. The
ordinary Kling drawings, original motion and all published older revisions stay
unchanged.

## Adopted: female base walk

Two complete eight-pose sheets were authored using OpenAI image generation.
Their `.generation.json` and prompt records retain inputs, exact prompts and
output hashes. Trial 1 reduced head drift but weakened opposing arm swing.
Trial 2 restores that swing and makes the face size/perspective across the two
half-strides more consistent. Trial 2 is selected for female pixel revision 3.

Technical preparation only crops declared cells, translates whole poses by
integer coordinates and samples every pose uniformly 2:1. The neck/head are not
detached, limbs are not warped and planted feet are not lifted to conceal head
movement. Native size remains 192×272, anchor (96,251), and walk remains eight
drawings with the same order, FPS and loop duration.

In the registered source review, crown range decreases from 8 to 5 native pixels,
largest adjacent step from 8 to 4, and horizontal upper-head range from 3 to 1.
All selected soles are at y250. These silhouette proxies are diagnostic, not
anatomical landmarks or proof of visual approval. A smaller half-stride height
difference remains, now with the opposite half higher; this is a modest repair,
not perfectly uniform anatomy or smoothness.

`female-walk-review.json` and the recipe record registration and residual limits.
Reproduce that analysis with `scripts/analyze-kling-female-walk-continuity.py`.
The female wedding companion R3 retains exact R2 pixels for every action. The
female base idle/run/jump/celebrate drawings likewise remain exact.

## Rejected: male sixteen-pose run

Two eight-pose generated banks were joined losslessly for a sixteen-drawing
trial at 24 FPS, preserving the original 2/3-second run cycle. Source originals,
prompts, crop/registration mappings, trial recipe and measurements are retained.
There are sixteen distinct drawings, not duplicated holds or blended frames.

Visual review rejected it: arm direction reverses abruptly at positions 4→5,
position 8 has an extra-upper-arm impression, and position 9 has an implausible
shoulder/forearm attachment. Crown range increases from 6 to 16 native pixels,
maximum adjacent step from 4 to 14. At its doubled FPS, that is an even larger
discrete movement per second. The shipping male stays byte-exact R2.

`male-run16-review.json` records the decision; `scripts/review-kling-run16-trial.py`
reproduces technical assembly and source diagnostics. The isolated trial archive
under `docs/kling-theme-continuity/trial` is for negative comparison only and is
excluded from the theme catalog. A valid ZIP is not a visual acceptance pass.

## Packaging and actual acceptance material

Run `python scripts/package-kling-theme-continuity.py` to package the selected
female R3 and the isolated male trial, while checking all frozen files before
and after. This uses the existing builder, with no new runtime rendering path.

Source-sheet studies are distinct from actual application exports. The latter,
including the rejected trial, are recorded in
`docs/kling-theme-continuity/README.md` after production capture and verification.
