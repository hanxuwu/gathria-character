# Original-view female clothing coverage review

This review covers every currently selectable original-view female garment: **37 unique banks × 96 native frames = 3,552 garment/frame pairs**, including older selectable dress revisions and the cotton/tailored dual-view collections. The complete/polished collections reuse the tailored originals. The source CharacterPack remains unchanged.

## What changed

**34 banks, 242 frame patches, 89,043 added cloth pixels.** The other 3,310 garment/frame pairs retain their exact previous RGBA composition. Repairs preserve the complete pre-repair alpha channel and every pixel outside the explicitly reviewed additions. No face, limb proportions, source frame IDs, action order, FPS, loop flags, anchors, or original body artwork were regenerated.

| Finding | Native poses | Repair |
| --- | --- | --- |
| Gray source tank remains below crossing forearm | Run 62 | Extend only the already reviewed missing cloth island; retain the foreground arm and independent bottom ownership. |
| Source tank wedges at inner armhole and beside hand | Jump 102, 112 | Reuse the exact three-pose source-cloth review from the existing plum-top authoring pipeline. |
| Neutral source neckline cloth inside broad head protection | Jump 89, 90, 93, 101, 102, 103 | Reuse immutable `female-neckline-cloth-v1` cloth interiors. Paired tailored originals use the separately bound `female-original-tailored-neckline-cloth-v1`, whose six source cloth maps are identical. |
| Dark source-shorts island at waist | Jump 90 | Add a small native-coordinate cloth trace to the four legacy/cotton shorts banks. Intentional crotch shadow, leg skin and outlines remain. |

The existing garment colors are continued only into missing source-cloth ownership. New anatomy or clothing designs were not generated. PNG atlas crops are repacked; this changes transport rectangles but not the source coordinate space or playback timing. Existing saved projects retain their embedded previous garment archives; updated built-in catalog references select the repaired archives.

## Visual evidence

- [Native same-frame before/after crops](native-before-after.png) — lossless, 1:1 pixels from the actual runtime compositor.
- [Run, separates, before/after GIF](female-run-separates-before-after-right.gif).
- [Jump, separates, before/after GIF](female-jump-separates-before-after-right.gif).
- [Run, three looks, before/after GIF](female-run-three-looks-before-after-right.gif).
- [Jump, three looks, before/after GIF](female-jump-three-looks-before-after-right.gif).
- [Original difficult-pose comparison](before-native-probes.jpg).

The GIF source images come from `createWardrobeCompositor.renderFrame` and `encodeSourceRgbaPng`, including actual mixed separates. GIF previews display at half native size, use a shared 256-color preview palette, and quantize 24 FPS to cumulative 10 ms GIF durations. They repeat for inspection; the source jump remains `loop: false`. Native PNG crops retain unquantized colors. [Review frame order and timing](review-playback.json) and [actual rendered pixel hashes](actual-review-render-hashes.json) are recorded.

## Technical evidence and limits

- [Baseline item/source/registration inventory](baseline-items.json).
- [Full baseline coverage triage](baseline-coverage-metrics.json): every one of the 3,552 decoded native garment compositions matched the actual runtime's RGBA hash exactly.
- [Baseline actual runtime renders](baseline-runtime-render-hashes.json): 53 scenarios / 5,088 native frames, including all 37 banks and 16 valid mixed combinations.
- [Repair manifest](repair-report.json): exact before/after archive hashes, native bounds and added-mask/frame hashes for each change.
- [All final native frame hashes](final-native-frame-hashes.json) and [validation summary](validation-summary.json): all 3,552 frames match either their reviewed repair or their unchanged previous composition.

Technical verification is separate from art acceptance. Conservative neckline maps deliberately retain ambiguous skin/cloth blur and inner ink; the blurred jump poses still have some hard/gray boundary fragments. Source-video blur, skirt silhouette styling and some hard authored seam edges also remain. Semantic mask metrics are triage, not proof of flawless artwork, and intentionally visible neck, arms, hands, legs, crotch shading and gaps between legs are not treated as holes. No blanket skin-color removal is used.

## Reproduction

The builder requires frozen pre-repair archives named `<itemId>.zip`, pinned by the hashes in `baseline-items.json`. Obtain those archives from baseline commit `863d761bbdc927ea65080250c765b9c5c78c8fc4`; never feed already repaired banks back into the builder.

```sh
python scripts/repair-kling-original-female-coverage.py \
  --baseline-dir /tmp/female-coverage-baseline \
  --work-dir /tmp/female-coverage-rebuild
```

The script writes candidate archives and per-frame review evidence to the chosen work directory; it does not replace catalog references or modify the original CharacterPack. Existing source-bound template masks and immutable permission profiles are loaded from the repository. Catalog hashes are refreshed in the combined coverage audit workflow after the repaired archives are installed.
