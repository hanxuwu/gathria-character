# Character theme review

The delivered scope is **two themes × two Kling characters × two complete looks**,
with five actions and both facings. The pixel theme contains **128 newly authored
pose drawings**, not filtered copies of the original video. The original base
and wedding packs are retained exactly.

## Actual animation review

These comparisons are assembled from CharacterPacks downloaded through the
production application. The original is displayed at a matching height with its
own anchor; pixel artwork is shown at exact 2×. Native exports stay unchanged.
Original run has 16 positions at 24 FPS; pixel run has eight at 12 FPS. Both
cycles last 2/3 second, so the paired run preview needs no timing stretch.

| Character / look | Original versus pixel run                                     | Pixel run, right / left                                                                                                   | Five action poses                                                   |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Male / base      | [Compare GIF](review/male-base-run-theme-comparison.gif)      | [Right](review/male-pixel-storybook-base-run-right.gif) · [Left](review/male-pixel-storybook-base-run-left.gif)           | [2× PNG](review/male-pixel-storybook-base-five-actions-2x.png)      |
| Male / wedding   | [Compare GIF](review/male-wedding-run-theme-comparison.gif)   | [Right](review/male-pixel-storybook-wedding-run-right.gif) · [Left](review/male-pixel-storybook-wedding-run-left.gif)     | [2× PNG](review/male-pixel-storybook-wedding-five-actions-2x.png)   |
| Female / base    | [Compare GIF](review/female-base-run-theme-comparison.gif)    | [Right](review/female-pixel-storybook-base-run-right.gif) · [Left](review/female-pixel-storybook-base-run-left.gif)       | [2× PNG](review/female-pixel-storybook-base-five-actions-2x.png)    |
| Female / wedding | [Compare GIF](review/female-wedding-run-theme-comparison.gif) | [Right](review/female-pixel-storybook-wedding-run-right.gif) · [Left](review/female-pixel-storybook-wedding-run-left.gif) | [2× PNG](review/female-pixel-storybook-wedding-five-actions-2x.png) |

[All review GIFs, standing comparisons and native/2× run contact sheets](review/)
include pixel idle, walk, jump and celebrate previews. Jump GIFs intentionally
play once. Reopen/replay the file to inspect another jump.

## What changed through iteration

1. Authored the pixel identity/style guide, then base and wedding pose banks.
   Preserved all source sheets and generation records. The two looks retain
   their gray tank/navy shorts or existing wedding designs, including wedding
   hair, instead of mixing original smooth clothing with pixel heads.
2. Registered row/cell drift using recorded integer translations. Reviewed crop
   gutters preserve entire shoes; shared transparent headroom preserves jumping
   heads. No pose is independently stretched to fit the canvas.
3. Reworked the male jump sheet's shoe detail and the male wedding standing/
   celebrating sheet's oversized drawing scale. The selected second versions
   and prior versions remain available for review.
4. Added phase-preserving theme/look switches, matching-outfit source comparisons,
   retained viewing zoom, explicit missing-action/look states and safe restoration.
   Fixed an oversized comparison/native canvas case and one-shot endpoint mapping.
5. The first real production capture correctly rejected an incomplete pixel pack.
   The asset builder had omitted `PROVENANCE.txt` and `INTEGRATION.md`; both are
   now included. Five real-catalog regression tests read the shipping archives,
   including a negative test that removes the provenance file. No parser check
   was relaxed to accept the broken package.

## Executed verification

The full production export/playback proof was captured at **`2ed4c18`**. It is
new evidence from this batch, not a restatement of earlier wardrobe tests.

- TypeScript and production build passed. The full local unit suite passed
  **383 tests** after the actual-package regression was added.
- The first full Chromium run passed 86 of 87 tests. Its remaining test still
  expected the old three-tab keyboard order; it was updated to traverse the new
  theme tab. The final 12 theme/wardrobe browser tests all passed, including the
  corrected navigation, phase/zoom preservation, completed jump, missing variants,
  canceled/corrupt imports, exact sessions and published-identity protection.
- Production UI downloaded **122 files**: eight CharacterPacks, 80 native PNGs,
  32 action GIFs and two self-contained theme sessions. Both sessions reopened
  with their exact embedded artwork and selected look/action/facing.
- **80 independent playback checks** passed after all editor pages were closed:
  eight exported packs × five actions × two directions. Frame IDs, loop wrap,
  one-shot completion and absence of editor dependencies were checked.
- Independent decoding verified every PNG's native RGBA bytes, every GIF frame,
  declared order and rounded centisecond timing, loop flags, left/right mirrors,
  nested ZIP/PNG/JSON integrity and original archive byte identity. Four actual
  nonzero motion-phase switches passed. The decoder also checked 24 screenshots
  and generated 56 presentation files from those actual exports.

The independent-player harness was corrected to pause an automatically replayed
completed jump before observing playback. The complete export checkpoint was
hash-checked and all 80 independent cases rerun; no artwork was regenerated to
work around a test assumption.

- [Full capture, source/asset hashes and observed playback](evidence/capture.json)
- [Independent decoded validation](validation.json)
- [Actual downloadable files and browser screenshots](evidence/)
- [Source-to-shipped-atlas RGBA verification](../../artwork/kling-themes/technical-verification.json)

The final comparison-only presentation check is recorded separately from this
full export proof. It directly renders the smooth reference at its enlarged
display size, avoiding a small intermediate canvas followed by CSS enlargement.
The pixel canvas, artwork, playback timing and export functions remain unchanged.
Its separate screenshots and native PNG equality checks identify the exact later
commit/build rather than claiming that the earlier capture ran on new UI code.

At **`d4fb0ab`**, the final production build and full **385-test** unit suite
passed. Seven theme/presentation browser tests passed, including direct-source
2× pixel readback in both directions. All four real presentation cases then
passed: the smooth reference uses a full display-resolution backing canvas,
the pixel image retains its native canvas, and four newly downloaded native
PNGs have exactly the same bytes as the full-flow exports.

- [Latest workbench screenshots and unchanged native PNGs](presentation/)
- [Final presentation capture, exact source changes and hashes](presentation/capture.json)
- [GitHub verification for the full-flow implementation](https://github.com/hanxuwu/gathria-character/actions/runs/40101516864)

## Visual findings and remaining limits

Review covered the native output, integer enlargement, run contacts and sampled
start/middle/end poses across all five actions for each pixel look. No obvious
detached limbs, cut crowns/shoes or broken skirt silhouettes were found in these
review samples. The male wedding scale correction improves its transition from
idle to movement. Neck, arm, knee and ankle shapes are drawn together in each
pose, avoiding the earlier separate-part seam failure mode.

There is still some generated drawing variation in head/limb shape and clothing
detail between poses. Female wedding idle/celebrate is a little larger than its
moving poses. Idle changes are subtle, and the pixel cycles are authored key-pose
animation rather than the original video's full drawing density. These are
reviewable results, not a claim of perfect continuity or user visual approval.

The theme workspace currently supports these base/wedding variants. It does not
restyle all existing clothes, combine arbitrary cross-theme garment layers, or
generate additional themes at runtime. Original wardrobe editing is preserved
separately.

In the measured cloud Chromium run, initial loading of the two-look original
bundles took about **27 seconds for male and 30 seconds for female**, including
fetching, hashing and decoding both embedded look banks. These are controlled
local measurements, not mobile/network guarantees. The original theme envelopes
are large because they preserve exact portable packs; first-load speed remains
a limitation rather than being described as instantaneous.

## Reproduce

```sh
npm run typecheck
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
KLING_THEME_REVIEW_DIR=.review-tmp/theme-recapture/evidence node scripts/capture-kling-themes.mjs
KLING_THEME_REVIEW_DIR=.review-tmp/theme-recapture/evidence python scripts/verify-kling-themes.py
```

Use a fresh `KLING_THEME_REVIEW_DIR` for a new full capture. The capture also has
an explicit, hash-verified resume mode for independent playback; it cannot resume
from an incomplete download matrix. To decode the retained proof after later UI
changes, set `KLING_THEME_SOURCE_REVISION` to the exact captured commit. This mode
verifies its recorded source via Git and still requires current asset/native
export hashes to match; it never silently substitutes a different source revision.

For the already delivered full-flow proof:

```sh
KLING_THEME_SOURCE_REVISION=2ed4c18855df67b70e66ebec9bec57d30ea91385 python scripts/verify-kling-themes.py
python scripts/verify-kling-themes.py --presentation-only
```
