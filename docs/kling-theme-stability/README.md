# Pixel motion stability and selected-look loading

PRs [#39](https://github.com/hanxuwu/gathria-character/pull/39) and
[#40](https://github.com/hanxuwu/gathria-character/pull/40) were merged into main
before this work. This separate batch addresses the reported head wobble in the
pixel characters and continues theme switching and loading work.

Open **Workbench → Character themes → Pixel storybook**. New selections use
revision 2. Imported revision-1 sessions keep their exact artwork; both revisions
can be compared within a session. Original Kling playback and the existing
wardrobe, appearance and optional skeleton tools remain available.

## Actual export comparisons

Both sides use the same 192×272 native canvas, anchor (96,251), frame positions
and action timing. These are application-exported CharacterPacks assembled into
clearly labeled 2× review GIFs, with no per-frame fitting or head alignment in the
presentation. Individual original-size GIFs and native RGBA PNGs are in
[evidence](evidence/).

| Character / look | Main comparison                                                            | Additional check                                                                                                      |
| ---------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Male / base      | [Walk, before → after](review/male-base-walk-before-after-right-2x.gif)    | [Run](review/male-base-run-before-after-right-2x.gif)                                                                 |
| Male / wedding   | [Run, before → after](review/male-wedding-run-before-after-right-2x.gif)   | [Left run](review/male-wedding-run-before-after-left-2x.gif)                                                          |
| Female / base    | [Run, before → after](review/female-base-run-before-after-right-2x.gif)    | [Idle](review/female-base-idle-before-after-right-2x.gif) · [Walk](review/female-base-walk-before-after-right-2x.gif) |
| Female / wedding | [Run, before → after](review/female-wedding-run-before-after-right-2x.gif) | [Left run](review/female-wedding-run-before-after-left-2x.gif)                                                        |

[Review directory](review/) includes both directions, native/2× walk and run
keyframes, and fixed 3× head crops. Source artwork trials are kept separately in
[the authoring record](../../artwork/kling-themes/source/stability-v2/README.md).

For a direct original / old pixel / corrected pixel comparison:
[male base](review/male-base-run-original-r1-r2-right-2x.gif) ·
[male wedding](review/male-wedding-run-original-r1-r2-right-2x.gif) ·
[female base](review/female-base-run-original-r1-r2-right-2x.gif) ·
[female wedding](review/female-wedding-run-original-r1-r2-right-2x.gif).
These display all sixteen original poses and hold each pixel drawing for two
display positions, preserving the same cycle duration. The original and R1
columns are explicitly retained prior UI exports; only R2 is newly exported.

## Causes and changes

The pixel cycle did not simply have more vertical travel than the original.
Measurements showed uneven adjacent-frame movement, left/right stride asymmetry,
horizontal sheet drift and independently drawn changes in face perspective and
body height. Pixel run has eight drawings at 12 FPS; the original has sixteen at
24 FPS. Both cycles still last 2/3 second.

- Female base idle/walk receive whole-pose integer horizontal registration.
  Their soles and internal anatomy are unchanged.
- Male walk, female base run and female wedding run use three selected complete
  eight-pose drawing banks produced through image generation. Matching face,
  ear/neck perspective and body proportions were reviewed before adoption.
  Six trials, exact prompts and source hashes are retained. Two male run trials
  were rejected because their vertical discontinuities became worse.
- Male base/wedding run retain their prior drawings. Small zero-mean vertical
  adjustments affect only airborne poses; all four planted poses keep their
  prior vertical registration. Flight soles remain above the ground. There is
  no separately pasted head, runtime head lock, anatomical warp or crossfade.
- Every action retains its declared order, FPS, loop semantics, dimensions and
  anchor. Jump and celebration drawings remain unchanged. New pixel archives
  have separate revision-2 paths and keys; published revision-1 bytes remain
  hash-protected.

[Diagnosis](../../artwork/kling-themes/source/stability-v2/diagnosis.json) and
[selection/registration records](../../artwork/kling-themes/source/stability-v2/review.json)
record the earlier actual exports, chosen/rejected art and the constrained flight
adjustments. Crown measurements are diagnostic proxies; they are not facial
landmarks or proof of visual acceptance.

The final application exports reproduce these improvements at native size:

| Check                                                  | Before | After |
| ------------------------------------------------------ | -----: | ----: |
| Male base walk, crown vertical range                   |   9 px |  3 px |
| Female base idle, upper-head horizontal range          |   9 px |  1 px |
| Female base walk, upper-head horizontal range          |  13 px |  3 px |
| Male base run, largest adjacent crown-height step      |   6 px |  4 px |
| Male wedding run, largest adjacent crown-height step   |   5 px |  3 px |
| Female base run, largest adjacent crown-height step    |  10 px |  8 px |
| Female wedding run, largest adjacent crown-height step |   5 px |  4 px |

## Switching and loading

Comparison playback now follows continuous action phase. All sixteen original
run drawings can appear between the eight pixel poses. The prior comparison
sampled only at the pixel drawing changes and skipped half the original frames.
The selected pixel timing and all exported timing remain unchanged.

Built-in themes load only the requested look, using an explicitly partial
published preview type. Each downloaded look still receives hash, archive,
identity, rendering-mode and complete PNG validation. Switching back to an
accepted look reuses it. PNG/GIF and selected CharacterPack exports do not fetch
unrelated clothing. Full theme/session saves obtain and verify the exact complete
archives, preserving portable reopening and the existing import contract.

Measured in this production Chromium capture:

| Initial original selection | Downloaded selected look | Full theme previously required | Time to ready |
| -------------------------- | -----------------------: | -----------------------------: | ------------: |
| Male / base                |         22,641,075 bytes |               58,551,656 bytes |      13.140 s |
| Female / base              |         24,565,426 bytes |               72,260,723 bytes |      15.212 s |

Initial requests contained neither the wedding pack nor the complete theme ZIP.
This is a 61.3% / 66.0% reduction in requested archive bytes. The earlier capture
reported about 27 / 30 seconds while fetching and validating both looks; those
are historical observations, not a newly rerun old-build benchmark. Network and
device speed will vary, and 13–15 seconds remains a loading limitation.

## Verification

The implementation and final artwork are committed at `22e90d3`. The capture
script's live-canvas observation fix is committed at `7a5c435`; runtime and asset
bytes did not change between these commits. This batch actually executed:

- TypeScript and production build: passed. Full unit suite: **398 tests passed**.
- Theme/presentation Chromium suite: **9 tests passed**, including selected-only
  requests, complete portable save/reopen, safe import behavior, phase retention
  and full original comparison cadence.
- Production application: **80 downloads** — four CharacterPacks, forty native
  PNGs, thirty-two GIFs and four sessions. Both characters reopened each retained
  revision without changing the selected artwork. Four nonzero theme switches
  and four real sixteen-original/eight-pixel playback checks passed.
- All editors were closed before **40 independent playback checks**: four
  exported looks × five actions × both directions. No editor dependencies,
  external requests, failed requests or browser errors were observed.
- Independent ZIP/Pillow verification decoded 128 pack frames and all 312 GIF
  frames, checked native PNG RGBA equality, exact sequence and rounded GIF delays,
  loop flags, transparency, mirrors and nested session contents. All sixty
  presentation files decoded. All four prior published bundles remain byte-exact.

Evidence: [production capture](evidence/capture.json),
[independent decoded validation](validation.json),
[downloaded PNG/GIF/ZIP files and browser screenshots](evidence/).
GIFs use a matte and palette, with maximum measured mean RGB error 1.199/255;
native PNG/CharacterPack RGBA remain exact. These technical checks do not replace
visual approval. Inspection of the actual contact sheets found steadier male
walk faces, more consistent female run faces and modest wedding improvements,
with no obvious newly cut limbs or detached necks in the reviewed poses.

The initial capture stopped because its observer retained a detached canvas
element, although the live animation advanced. The script now samples the live
canvas across layout replacement. The requirement to observe all eight pixel and
sixteen original drawings was retained. The failed attempt is not counted as a
passed matrix.

## Remaining limits and next asset work

The corrections reduce several conspicuous jumps; they do not turn eight
independently drawn poses into the original video's temporal detail. Male walk
retains some height variation and extends roughly 3–6 native pixels higher than
its existing idle pose. Female base walk still has an internal height difference
between its two strides; this batch corrects its horizontal drift. Small face,
hair and clothing-detail changes remain. Visual approval belongs to the user.

Original packs are still large, and full portable session saves must load all
included looks. Selected-look loading does not promise instant opening on all
devices or networks.

The theme UI currently selects complete base/wedding looks. Corresponding look
IDs and missing-look handling already work; truly independent pixel tops,
bottoms and shoes need authored per-pose layers, ownership masks and hidden-area
repairs. [MIXING_CONTRACT.md](../kling-themes/MIXING_CONTRACT.md) records that next
stage. No existing complete look is presented as independently editable garment
layers, and this batch does not claim all five planned sprints are complete.

## Reproduce

```sh
npm run typecheck
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/e2e/themes.spec.ts tests/e2e/theme-presentation.spec.ts
KLING_THEME_STABILITY_DIR=.review-tmp/new-theme-stability/evidence node scripts/capture-kling-theme-stability.mjs
KLING_THEME_STABILITY_DIR=.review-tmp/new-theme-stability/evidence python scripts/verify-kling-theme-stability.py
```

Use a fresh capture directory. Verification requires the captured source and
asset hashes, fully decodes delivered files, and preserves prior proof instead
of silently relabeling historical exports as new executions.
