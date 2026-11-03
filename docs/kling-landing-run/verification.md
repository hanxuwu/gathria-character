# Landing → Run verification

This review separates behavior checks from visual inspection. No runtime or export assertion establishes that two separately authored poses are artistically seamless.

## Behavior and pixel preservation

The focused browser review in [landing-run.spec.ts](../../tests/e2e/landing-run.spec.ts) operates the actual paired workbench, applies the complete daily look, saves/reopens its mode, and downloads GIFs and CharacterPacks through the UI. It checks both genders and both native views.

The [independent verifier](../../scripts/verify-landing-run-exports.mjs) imports neither the motion controller nor the compositor. It reconstructs the documented source-frame sequence, decodes GIFs, checks 24 FPS timing with GIF centisecond rounding, and compares decoded pixels against the downloaded native atlas with the declared export palette mapping.

Required evidence:

- Four new CharacterPacks preserve all 393 native atlas frame rectangles, anchors and PNG bytes relative to the previous actual wardrobe exports.
- Eight left/right Run → Jump → Run GIFs use the reviewed early running exits. Left is the exact horizontal mirror of right.
- Four standalone right-facing Jump GIFs remain byte-identical to the previous actual downloads. The standalone clip is still 28 ticks (side) or 39 ticks (original).
- Airborne Run requests remain buffered, repeated Jump requests do not restart the action, and Idle requests retain full recovery.
- Original-view requests strictly after the early seam finish frames 31–38 and then run. The side-view UI test starts at the final-frame **boundary**, not at a fractional time beyond that boundary; fractional late-request fallback for all four profiles is covered by controller unit tests.
- Four fresh independent V2 imports use the early routes; four historical V1 imports retain complete recovery. Re-exported current CharacterPacks remain byte-identical to their input ZIPs.

Historical V1 test packages are reconstructed from previously committed actual JSON plus the same published atlas PNGs. They are not claimed to be fresh historical UI downloads. The old motion profile is checked exactly, not inferred from a similar name.

## Expected export timing

| Character / view  | Previous flow     | Current flow      | Basic Jump        |
| ----------------- | ----------------- | ----------------- | ----------------- |
| Male / side       | 80 ticks / 3330ms | 79 ticks / 3290ms | 28 ticks / 1170ms |
| Female / side     | 77 ticks / 3210ms | 76 ticks / 3170ms | 28 ticks / 1170ms |
| Male / original   | 76 ticks / 3170ms | 67 ticks / 2790ms | 39 ticks / 1630ms |
| Female / original | 76 ticks / 3170ms | 67 ticks / 2790ms | 39 ticks / 1630ms |

GIF totals are rounded to centiseconds; native playback removes exactly 375ms (original) or 41⅔ms (side). The flow includes a full run cycle before the requested takeoff seam and another full run cycle after landing. The raw application GIF is one-shot.

## Playback clock

[playback-clock.spec.ts](../../tests/e2e/playback-clock.spec.ts) uses the actual independent player with a controlled clock. It exercises redraw continuity, pause/resume, visibility events with no hidden RAF, speed changes and action resets. The 6ms redraw interval is a synthetic regression case, **not** a measured device-level improvement. Real V2/V1 run-jump playback is covered separately by the focused browser review.

## Visual review

[Pose selection sheets](selection.md) show first contact, full compression, recovery, and old/new run entries. Original-view characters no longer finish lowering their arms and straightening into idle before running again. The side-view route avoids one extra upward rebound and uses a different running support pose.

There is still a visible change from two-foot landing to a single-foot running support, with some arm and torso changes. Existing source blur and wardrobe contour issues remain. No source or clothing pixels were changed in this revision, so this is not a garment repair or a claim that all source defects disappeared.

The before/after presentation GIFs are assembled only from actual application exports with a fixed shared crop and scale. They preserve each input's frame durations; the shorter panel is explicitly labelled when held at its last frame. A labelled review pause and loop are added for comparison. Those presentation holds are not runtime pauses. The unmodified one-shot application GIFs are retained separately.

## Recorded checks

- **650 unit tests / 66 files passed**, including all four current profiles, fractional late-input fallbacks, unchanged Idle recovery, original V1 metadata and source-clock continuity.
- **2 focused paired-workbench browser scenarios passed** (5.8 minutes): both genders, both views, save/reopen, repeated input, buffered movement, current/historical independent players, and actual export verification.
- **1 controlled-clock browser scenario passed** (6.7 seconds total). This is deterministic lifecycle coverage, not an operating-system performance benchmark.
- **TypeScript and Vite production build passed.** The new browser test initially needed explicit casts for its controlled test clock; that type-only correction does not change runtime behavior.
- **Production desktop/mobile smoke passed** for both genders and both views: single jump returns to run, published appearance banks load, comparison uses fixed standing height, and the 390px layout has no horizontal overflow. No HTTP or page errors were observed; see [production receipt](checks/production/verification.json).
- All **393 native frames**, **12 actual GIFs / 712 decoded GIF frames**, and the four unchanged basic Jump GIFs passed independent checks. Eight new flow GIFs are retained in this directory; identical basic Jump GIFs are referenced from the prior review instead of duplicated. CharacterPack metadata and download receipts are retained; the four large ZIPs can be reproduced through the app using the same unchanged atlases.

Review links and actual one-shot downloads are in the [review index](README.md#审阅材料). Each character's `review/*/pixel-verification.json` records exact image, sequence and timing checks. `review/inventory.json` and `review/comparison-inventory.json` distinguish actual download hashes from derived presentation images. Check logs and the production smoke result are retained under `checks/`.

The first focused browser attempt used the original early seam boundary itself (position 30) as a supposedly late request. That assertion was invalid: the boundary was still available. The corrected test requests at position 31. The initial test failure did not require changing the production implementation and is retained in the check log.
