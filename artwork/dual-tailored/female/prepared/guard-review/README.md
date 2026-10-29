# Garment ownership diagnosis

These are offline authoring and annotation review records. The final visual acceptance evidence comes from application-exported PNG/GIF/CharacterPack files in `docs/dual-tailored/review`.

- `frame54-source-guard-ui.png`: native source, original near-hand annotation, and the actual initial UI export. The falsely protected rear ankle/shoe made a hook-shaped skirt edge.
- `*-hand-guards.jpg` and `*-hand-source-grid.png`: original source anatomy with the old annotations; these established that six near-hand polygons included thigh, ankle or shoe pixels.
- `six-pose-source-guards-before-candidate.png`: original annotation, corrected annotation and explicit shoe foreground, initial clothing seed, and final seed. The six reviewed source frame IDs are 36, 37, 47, 48, 53 and 54.
- `walk-all-before-candidate-{1,2,3}.png`: all 25 unique walking source frames, comparing the intermediate six-pose correction with the final systematic walk-only foreground/panel fit. This explains why an isolated frame fix was insufficient.
- `candidate-audit.json`: that intermediate-to-systematic comparison, including the unchanged already-fixed frame 54. It is not the final baseline comparison.
- `final-repair-audit.json`: final seed RGBA and ownership comparisons against the initial seed archives, including their hashes, final published hashes, and the six exact registration-region changes. The blouse changes only inside reviewed source hand regions on IDs 41, 43–46 (91 other poses remain unchanged); the skirt changes on 25 walking poses and running frame 54. All other native seed pixels and masks remain unchanged.
- `walk35-38-final.png`: adjacent final walking poses for checking local silhouette continuity.

The exact final authoring inputs are in `../../source/hand-foreground-v1.json`; `corrections.json` here is an earlier diagnostic record, including visible far-arm contour experiments that were superseded by the coherent walking occlusion rule. It is not loaded by the final builder. The actual registration remains schema version 1 and adds no new region types; the shoe masks are offline garment-ownership exclusions.

## Final hand completion

`hand-completion/walk-native-hands-{1,2}.png` compares the actual pre-completion export to source anatomy. `candidate-source-before-after-{1,2}.png` records the first eight trace candidates; the frame-47 candidate in the second sheet was **rejected** because it included thigh skin below the fist. `47-revised-source-before-after.png` is the accepted tighter boundary. `hand-completion/accepted-source-before-after-{1,2}.png` shows all accepted hand boundaries against source and pre-repair actual output. `hand-completion/published-repair-audit.json` records exact per-slot ownership removals for the final accepted eight hand regions. These additional masks are offline ownership exclusions; they do not change the registration format, source points or timing.

The final source-of-truth contours are `../../source/hand-foreground-v1.json` under `foregroundHand`, not the intermediate candidate JSONs. Final application-exported source/before/after wrist comparisons are maintained separately in `docs/dual-tailored/review`.
