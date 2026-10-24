# Pixel locomotion continuity

This batch follows merged PR #41 at `ce4c38e`. It adopts a targeted **female base
walk revision 3** and retains **male revision 2** after a sixteen-drawing run
experiment failed visual review. No production renderer/UI code was changed.

Open **Character library → Explore Kling female themes → Pixel storybook →
Tank & shorts → Walk**. The artwork label reads **Revision 3**. Direct route:
`/workbench.html?character=female&mode=themes`. Original Kling playback, wardrobe,
appearance and optional skeleton tools remain available. Existing saved sessions
keep their saved revisions; importing an older session does not silently upgrade
its artwork.

## Review actual application exports

- Female walk, R2 versus R3:
  [right 2×](review/female-base-walk-before-after-right-2x.gif) ·
  [left 2×](review/female-base-walk-before-after-left-2x.gif).
- All eight walk poses:
  [native size](review/female-base-walk-keyframes-1x.png) ·
  [integer 2×](review/female-base-walk-keyframes-2x.png) ·
  [fixed head crop 3×](review/female-base-walk-heads-3x.png).
- Ordinary/R2/R3 walk at their **own native rhythms**:
  [right](native-walk-review/female-base-walk-original-r2-r3-right-native-clocks-2x.gif) ·
  [left](native-walk-review/female-base-walk-original-r2-r3-left-native-clocks-2x.gif).
  Original walk is 27 positions at 24 FPS (1.125 seconds); pixel walk is eight
  at 8 FPS (1 second). This nine-second common repeat does not retime either
  action. Their phase therefore differs midway through the comparison.
- Rejected male sixteen-drawing study, clearly labeled **NOT adopted**:
  [right](trial/review/male-base-run-r2-vs-rejected16-right-2x.gif) ·
  [left](trial/review/male-base-run-r2-vs-rejected16-left-2x.gif) ·
  [all poses](trial/review/male-run-rejected-keyframes-1x.png).

The R2/original columns are explicitly retained previous application exports.
R3 and rejected-trial columns are newly downloaded through the production UI.
Comparison rendering only crops atlas frames, mirrors declared directions,
applies a matte and scales presentation. The original column normalizes display
height and anchors; native PNGs and CharacterPacks are not rescaled or retimed.

## Selected repair and rejected experiment

Female R2's opposite half-strides used different head sizes/perspective and
body height. Integer horizontal registration alone could not repair that while
keeping planted feet on the ground. Two complete-pose authoring trials were
made. Trial 1 weakened opposing arm swing. Trial 2 restores the swing, brings
the faces closer together and is the selected source.

| Female base walk, native silhouette diagnostic | R2 | R3 |
| --- | ---: | ---: |
| Crown vertical range | 8 px | 5 px |
| Largest adjacent crown step, including wrap | 8 px | 4 px |
| Upper-head horizontal range | 3 px | 1 px |
| Lowest opaque sole Y | 250–251 | 250 |

These are opaque-silhouette proxies, not inferred facial joints or a visual
acceptance score. The residual half-stride height difference remains visible;
the opposite half is now slightly higher. This is a modest improvement, not a
claim of perfectly smooth animation or user approval. The head/neck are not
separately locked, planted poses are not lifted, and limbs are not warped.

The male trial contains sixteen genuinely distinct drawings at 24 FPS with the
same 2/3-second cycle. It nevertheless has abrupt arm-phase reversals and
extra/disconnected upper-arm impressions. Its largest crown step grows from 4
to 14 native pixels; at twice the FPS that is an even worse discrete movement
per second. We stopped after two generated banks and kept the safer R2. A valid
file or a higher frame count does not establish visual quality.

Further run work needs tightly constrained, pose-by-pose intermediate drawings
with consistent limb ownership, scale and identity. Generating additional loose
sheets or translating heads cannot resolve this failed trial reliably. No new
garment layers, clothing library or loading optimization is claimed in this batch.

## Compatibility and verification

The native canvas remains **192×272**, anchor **(96,251)**. All selected action
durations, order and loop semantics remain unchanged. Female base idle/run/jump/
celebrate, all wedding drawings and the complete male R2 remain exact pixels.
All six published original/R1/R2 bundles and 65 frozen prepared/source/archive
files are preserved. The female R3 wedding companion changes envelope metadata
only. The rejected study uses a different identity and stays outside the catalog.

This turn executed TypeScript checking, a production build, **399 unit tests**
and **10 Chromium tests**, including selected 8/16-position playback and ordinary
comparison cadence. The production capture at `52c086c` downloaded **108 files**:
four CharacterPacks, 68 native PNGs, 32 GIFs and four saved sessions. It reopened
retained/current selections for both characters, checked four nonzero-phase
theme switches and all selected/reference run drawings. After closing all
editors it completed **40 independent playback checks** (four looks × five
actions × two directions), requiring every timeline position. Browser errors,
failed/external requests and independent-player editor dependencies were absent.

Independent decoding checked all 128 pack frames, 68 exported native RGBA PNGs,
312 frames across the 32 GIFs, four nested saved sessions and 18 comparison
presentations. Frame sequence, rounded GIF delays, looping, transparency and
left/right mirroring passed. Of twenty current action/look combinations, only
the female base walk differs in pixels; the other nineteen match R2 exactly.
The extra ordinary/R2/R3 walk comparison fully decodes its two nine-second GIFs
and records native timelines and frame mappings separately in
[walk-original-comparison.json](native-walk-review/walk-original-comparison.json).

Production export/decode and independent-playback results are recorded in
[capture.json](evidence/capture.json) and
[validation.json](validation.json). The rejected study has separate
[technical verification](trial/validation.json); its visual decision remains
rejected even when file/playback checks pass.

That separate rejected-trial UI capture downloaded one CharacterPack, 32 native
left/right PNGs and two GIFs, and observed all sixteen playback positions.
Its verifier confirms exact pixels for the four non-run actions, sixteen unique
run drawings, unchanged cycle duration, correct mirrored exports and three
decoded review presentations. This is negative evidence supporting the decision
to keep male R2, not a new default animation.

GIFs have a matte and palette; their colors are approximations (maximum measured
mean palette error for the current exported GIFs: 1.199/255). Native PNG and pack
RGBA remain exact. The production capture also observed original selected-look
loads of 13.230/14.572 seconds; no new speed optimization was made here.

Download the accepted [female R3 CharacterPack](evidence/female-pixel-v3-base.character.zip)
or [complete female theme](../kling-themes/bundles/female-pixel-storybook-v3.theme.zip).
The other current looks and saved sessions are in [evidence](evidence/).
The [source record](../../artwork/kling-themes/source/continuity-v3/README.md)
retains exact prompts, input/output hashes, both selected/rejected trials and
reproducible preparation scripts.

## Reproduce

```sh
python scripts/analyze-kling-female-walk-continuity.py
python scripts/review-kling-run16-trial.py
python scripts/package-kling-theme-continuity.py
npm run typecheck
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/e2e/themes.spec.ts tests/e2e/theme-presentation.spec.ts
# Choose fresh output directories; never overwrite old capture records.
KLING_THEME_CONTINUITY_DIR=.review-tmp/new-continuity/evidence node scripts/capture-kling-theme-continuity.mjs
KLING_THEME_CONTINUITY_DIR=.review-tmp/new-continuity/evidence python scripts/verify-kling-theme-continuity.py
KLING_THEME_CONTINUITY_DIR=.review-tmp/new-continuity/evidence python scripts/compare-kling-walk-original.py
KLING_RUN_TRIAL_DIR=.review-tmp/new-continuity/trial/evidence node scripts/capture-kling-run-trial.mjs
KLING_RUN_TRIAL_DIR=.review-tmp/new-continuity/trial/evidence python scripts/verify-kling-run-trial.py
```

Production capture records source/asset/script hashes and actual commit identity.
Later changes require fresh capture; historical baselines remain labeled as such.
