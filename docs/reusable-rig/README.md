# Reusable rig evidence

These artifacts are generated from the actual browser export path. The character comparison panels use decoded CharacterPack PNGs, not concept art. Source-slot contact sheets and mesh overlays are explicitly instructional views of the imported PNGs and posed geometry.

Quick review: [run right, 2×](run-lineup-right-2x.gif) · [run left, 2×](run-lineup-left-2x.gif) · [all run keys](run-keyframes-1x.png) · [before/after, native](comparison-1x.png) · [before/after, 2×](comparison-2x.png) · [expressions](expressions-2x.png) · [action switching](action-switch-preview.gif) · [Skin Studio](skin-studio.png).

| Character       | Editable PNG skin                    | Registered template                          | Complete authoring project             | Independent playback pack                          |
| --------------- | ------------------------------------ | -------------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| Denim daytrip   | [Skin ZIP](denim-daytrip.skin.zip)   | [Template ZIP](denim-daytrip.template.zip)   | [Project ZIP](denim-daytrip.rig.zip)   | [CharacterPack ZIP](denim-daytrip.character.zip)   |
| Coral afternoon | [Skin ZIP](coral-afternoon.skin.zip) | [Template ZIP](coral-afternoon.template.zip) | [Project ZIP](coral-afternoon.rig.zip) | [CharacterPack ZIP](coral-afternoon.character.zip) |

Binding inspection: [Denim source slots](denim-daytrip/source-slots-1x.png) · [Coral source slots](coral-afternoon/source-slots-1x.png) · [Denim mesh](denim-daytrip/rig-overlay-2x.png) · [Coral mesh](coral-afternoon/rig-overlay-2x.png). Independent player: [Denim](denim-daytrip/independent-player.png) · [Coral](coral-afternoon/independent-player.png).

- `comparison-1x.png`, `comparison-2x.png`: matched production Motion 3 and new reusable-rig frames. The shared rig renders all three actions itself; its idle/walk pixels are not claimed to equal the historical renderer.
- `run-keyframes-1x.png`, `run-keyframes-2x.png`: all twelve run keys for Denim and Coral.
- `run-lineup-{left,right}-{1,2}x.gif`: both skins using the same run library. These are in-place loops, without scene translation.
- `idle-lineup-right.gif`, `walk-lineup-right.gif`, `action-switch-preview.gif`: exported clip playback and whole-loop action changes.
- `idle-walk-run-{1,2}x.png`, `expressions-2x.png`: same-size actions and complete-head expression states.
- `knees-ankles-3x.png`, `shoulders-elbows-3x.png`: matched joint details.
- `shared-rig.json`, `shared-motions.json`: identical skeleton and clip data used by both characters.
- `denim-daytrip.*.zip`, `coral-afternoon.*.zip`: portable `.skin.zip` assets, self-contained `.rig.zip` editable projects, instructional `.template.zip` registered source templates, and five-file `.character.zip` playback packages.
- Each character directory contains extracted CharacterPack files, source PNG slots, template files, a slot contact sheet, the actual mesh inspection coordinates, and a posed mesh overlay.
- `skin-studio.png`: the authoring interface. Each character's `independent-player.png` shows the consumer after all authoring pages were closed.

`evidence-index.json` records source hashes, all fresh PNG/ZIP import and reopen comparisons, the unknown-ID PNG replacement fixture, and independent live playback. `artifact-validation.json` records decoded ZIP members, all frame alpha and bounds checks, and decoded GIF frame hashes and timing. [Complete file integrity](file-integrity.json) additionally decodes all 92 delivered PNGs (including both template guides), all 7 GIFs, and all 10 ZIPs: 4 CharacterPacks (two current, two baselines) plus 6 authoring archives. The six expression exports are extracted PNG/metadata evidence, without extra ZIP files. GIF timing is rounded cumulatively to centiseconds; the underlying pack retains exact 18 fps run metadata.

The `import-regression-fixture` is a technical red/blue channel swap of one torso PNG to prove that custom imported art is used without identity-specific renderer edits. It is not a claim of newly drawn artwork. All other slots and the shared skeleton/motion data are verified unchanged.

`iterations/01/` is a compact audit of the first fast visual capture, marked `fastPreviewOnly: true`; it intentionally contains no independent playback results. Its README lists the omitted duplicate files. Final evidence lives at this directory root. [Capture attempts](capture-attempts.json) records one incomplete run during concurrent browser tests, then the successful isolated run with unchanged sequence/timing assertions. No file here claims user visual acceptance or production Gathria integration.

Regenerate final evidence:

```sh
node scripts/generate-reusable-rig-evidence.mjs
python scripts/render-reusable-rig-review.py
```

Optional bounded visual iteration:

```sh
REVIEW_FAST=1 REUSABLE_ITERATION=01 node scripts/generate-reusable-rig-evidence.mjs
REUSABLE_ITERATION=01 python scripts/render-reusable-rig-review.py
```
