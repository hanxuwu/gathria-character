# Generated character through the shared rig

This is the historical first trial. The
[action-forearm follow-up](MAPLE_ACTION_POSES_REVIEW.md) adds opt-in running/jump
hands and updates the runtime contract; the original source/evidence and this
trial's recorded checks remain preserved.

Starting from merged main `51c708a`, this trial creates a genuinely new character
and takes it through source preparation, Skin Studio, four shared actions,
portable exports and a separate player. It uses branch
`feat/generated-character-pipeline`. Runtime source, original materials,
proportions/motion definitions and old files are preserved. No Spine dependency
or runtime image-generation call is introduced.

## What was made

Maple wears a terracotta knit sweater, teal trousers and leather boots. Three
OpenAI image-generation calls produced a character/part sheet, an unsuccessful
torso correction and a usable sleeveless torso backplate. The original PNGs,
prompts and deterministic registration script are retained, rather than only
delivering animated presentation images.

The generated head and complete outfit become a 15-slot skin and editable rig
project. The same sweater, trousers and boots are also exported as three
independent wardrobe items, imported on Crop and Waves, and recolored. The
existing four-action skeleton animates all these results without character-
specific runtime code.

## Findings and changes

| Actual defect                                         | Cause                                                                                           | Bounded repair                                                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| A second cuff remains at the waist when the arm rises | Model drew sleeves into the torso despite also drawing separate arms                            | Generate a complete sleeveless torso backplate and keep arm pixels solely in arm slots                                   |
| Shorts-shaped rims sit above moving trousers          | Generated pelvis tile contains rigid trouser ends, with duplicate leg opening rims in the thigh | Keep a tapered pelvis bridge; remove rigid short-leg cuffs and opening rims above the hip; fit waist beneath sweater hem |
| Upper wrist changes with sweater color                | First mask used a generic horizontal wrist cutoff, missing the curved cuff boundary             | Measure separate near/far hand and cuff polygons; save explicit skin/fixed-trim ownership                                |
| Orange ring stays visible under blue/green sleeves    | The first cuff polygon also included the orange fabric fold above the ribbing                   | Within that measured cuff region, assign the orange fold to upper-cloth material; preserve cream trim and skin           |

The last repair changes item masks, not the base skin's visible hand artwork.
The new torso has somewhat stronger orange saturation than the sleeves; the
new source remains visually coherent enough for this pipeline trial, but its
paint matching is still a separate review concern. No renderer patch is used
to hide the duplicated pieces.

The actual export comparison keeps identical expression heads, skeleton,
actions, frame order and timing. The same pose, preview background and integer
zoom are used in before/after media. Only the prepared torso/hips/thigh ownership
and wardrobe masks differ. No source illustration is passed off as a rendered
animation result.

## Review files

- [Before/after at native size](generated-traveler/final/before-after-1x.png) ·
  [2×](generated-traveler/final/before-after-2x.png)
- [Shoulder, wrist and waist](generated-traveler/final/before-after-arm-waist-4x.png) ·
  [Hip, knee and ankle](generated-traveler/final/before-after-leg-joints-4x.png)
- [Three expressions](generated-traveler/final/expressions-2x.png) ·
  [Garments on three identities](generated-traveler/final/reused-clothing-2x.png)
- [Cuff recoloring before/after](generated-traveler/final/cuff-mask-before-after-4x.png)
- [Four actions, right](generated-traveler/final/four-actions-right-2x.gif) ·
  [left](generated-traveler/final/four-actions-left-2x.gif)
- [Running comparison](generated-traveler/final/before-after-run-right-2x.gif) ·
  [Every run key](generated-traveler/final/run-keyframes-1x.png) ·
  [Every jump key](generated-traveler/final/jump-keyframes-1x.png)
- [Projects, items and CharacterPacks](generated-traveler/README.md)

All final review PNGs/GIFs derive from actual Skin Studio exports or labeled
editor/independent-player captures. GIF colors are palette-quantized; transparent
CharacterPack PNGs remain authoritative. Native frames are 192×256, anchor
(96,240); idle has 4 keys/12 held steps at 4fps, walk 8 at 10fps, run 12 at 18fps,
jump 12 at 15fps and plays once. GIF durations use cumulative centisecond
rounding. The four-action tour deliberately repeats; single-action jump GIFs
have no loop extension. Previews are in place on a neutral stage, not actual
world movement or production Gathria integration.

## Current-session verification

See [verification-results.json](generated-traveler/verification-results.json)
for the final executed commands and outcomes. Historical milestone counts are
not used as this batch's test results.

This session passed **418 unit tests, 15 relevant Chromium E2E tests, TypeScript
and the production build**. The final delivery validates **16 ZIPs, 59 PNGs and
24 GIFs**; all eight closed-editor playback cases passed, with a maximum observed
browser scheduling deviation of 28 ms. The other 33 existing E2E tests were not
rerun locally; no runtime source was changed. The existing large-bundle warning
remains. A source-specific regression checks the repaired skin/cream/sleeve
material samples and both cuff folds, in addition to the frame matrix below.

The source checker renders 756 distinct frame/configuration combinations twice,
checks 15 source slots, alpha/frame boundaries, garment masks, palette changes,
single-item mixing and all three expressions. It verifies 22 original runtime
and source-bank hashes against the merged baseline. Pixel connectivity counts
are diagnostic, not an aesthetic pass: one-pixel diagonal gaps can be valid
silhouettes or imperfect joins and need visual inspection.

The browser evidence covers actual import/export, 88 timed editor frames across
four actions and both facings, three garment round trips, two project reopen
checks and eight independent-player cases after closing Studio. Independent
playback checks exact exported pixels, frame order, timing, loop wrapping and
jump hold/replay. PNGs, GIF frame sequences/durations and every ZIP member are
decoded; merely checking file existence is insufficient.

Reproduce sequentially:

```sh
PREPARE_PHASE=final node scripts/prepare-generated-traveler.mjs
node scripts/check-fresh-character.mjs
node scripts/generate-fresh-character-evidence.mjs
python3 scripts/render-fresh-character-review.py
```

The before capture is retained in `generated-traveler/phase-1/`; do not overwrite
it while reviewing a later result. `EVIDENCE_PHASE=phase-1` selects that capture
directory when intentionally reproducing the old preparation. Tools open their
own local servers and close them after checking. Do not modify sources during
capture; evidence records their hashes.

## Remaining limits exposed by this trial

- The new identity is a **flat skin/project**, not a registered wardrobe identity.
  The wardrobe supports Crop/Waves only. Opening wardrobe on Maple switches
  identity; retaining Maple while freely changing clothing/colors needs a future
  portable identity contract. The three garments themselves already work on
  both built-in identities.
- Generated source parts still require deliberate ownership, hidden coverage,
  material masks and measured registration. Asking the model for separated
  parts alone did not produce a safe rig-ready result.
- Relaxed open hands turn palm-up in some run/jump poses. A fist or alternate
  running-hand attachment is needed for a more convincing arm pump.
- Deep knee/hip folds compress source texture; one-pixel diagonal gaps can show
  at limb crossings and the neckline at enlarged zoom. No global pixel filling
  was applied to hide intentional gaps or change preserved renderers.
- Neutral/gentle expressions remain too close, and small hair-edge differences
  exist between complete generated head states. Joyful is clearly different.
  A constrained expression/identity preparation pass is the next visual task.
- The jump is the existing compact shared motion. This trial does not add
  physics, distance travel, free skeleton retargeting or arbitrary coat layering.

Functional checks and visual findings are separate. This is a reviewable
end-to-end trial with concrete fixes and retained shortcomings, not a claim of
final user visual acceptance. The branch is intended for a new draft PR; no
merge or deployment is part of this task.
