# Hair and ear-edge correction

The reported crouching pose exposed a band of original scalp above the near ear.
The old hair followed the stable skull, while the original Kling ear moved down
with facial squash. This is visible in male poses 85–88, particularly 86/87, and
also affected the female character and the recovery poses 105–109.

## Repair

`scripts/kling_hair_ear_fit.py` makes the new ear-side hair arch and sideburn
follow the existing independent face registration. The correction fades to zero
before the crown and central fringe. Only new hair is sampled; the original ear,
face, neck and body remain untouched. The hairstyle is not shifted as a whole.

`scripts/kling_hair_donor_mask.py` also removes donor-skin remnants from the
internal far-fringe openings and face-facing edges. These are explicitly
reviewed coordinate masks on the four donor cutouts, not a color-removal rule on
the character. The original source artwork and design sheets are preserved.
No new image generation was used in this correction.

The same rules apply to both characters and both short hairstyles, including
hair colors. Face presets, clothing, source poses and action timing are unchanged.
Content bank IDs now end in `appearance-v2`; the format remains compatible.
Previously saved projects keep their embedded old bank and reproduce the old
appearance. Reopening an old project does not silently upgrade it; open a new
catalog wardrobe to use the correction.

## Actual exported comparisons

The first successful local-fit iteration is retained in
[`evidence/iteration1`](evidence/iteration1). It contains actual wardrobe PNG
downloads at poses 0, 86, 87 and 107, before the final donor-edge cleanup.

Start with the reported problem:

- [Ear close-up before/after GIF, 2x](male-soft-crop-ear-jump-2x.gif)
  ([1x](male-soft-crop-ear-jump-1x.gif)). This inspection crop follows the
  original ear so the seam is easy to compare. It repeats the original jump
  sequence for review; the CharacterPack still plays jump as a one-shot action.
- [Screenshot pose before/after, 2x](screenshot-pose-ear-2x.png).
- Ear comparisons across stand, run, crouch and recovery:
  male [1x](male-ear-comparison-1x.png) / [2x](male-ear-comparison-2x.png),
  female [1x](female-ear-comparison-1x.png) / [2x](female-ear-comparison-2x.png).
- Hair-color edge checks: [male](male-ear-colors-2x.png) /
  [female](female-ear-colors-2x.png).

| Character and hairstyle | Full five-action preview                                                                          | Actual CharacterPack                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Male, soft crop         | [Right](male-soft-crop-five-actions-right.gif) / [Left](male-soft-crop-five-actions-left.gif)     | [ZIP](evidence/final-male/exports/male-soft-crop.character.zip)     |
| Male, soft bob          | [Right](male-soft-bob-five-actions-right.gif) / [Left](male-soft-bob-five-actions-left.gif)       | [ZIP](evidence/final-male/exports/male-soft-bob.character.zip)      |
| Female, soft crop       | [Right](female-soft-crop-five-actions-right.gif) / [Left](female-soft-crop-five-actions-left.gif) | [ZIP](evidence/final-female/exports/female-soft-crop.character.zip) |
| Female, soft bob        | [Right](female-soft-bob-five-actions-right.gif) / [Left](female-soft-bob-five-actions-left.gif)   | [ZIP](evidence/final-female/exports/female-soft-bob.character.zip)  |

The full previews preserve actual character placement and use 0.5x scale. Male
crop and female bob compare the previously exported outfit to the corrected
outfit; the alternate-style previews compare original source to corrected
appearance, as labeled. Both styles have true old/new same-frame ear PNGs above.
All exported head poses are included in the [male](male-all-heads.png) and
[female](female-all-heads.png) contact sheets.

Actual UI: [male wardrobe](evidence/final-male/male-soft-crop-workbench.png),
[female wardrobe](evidence/final-female/female-soft-bob-workbench.png),
[independent male playback](evidence/final-male/male-soft-crop-independent.png),
[independent female playback](evidence/final-female/female-soft-bob-independent.png).

The earlier [first-batch review](../README.md) and its packages are retained
unchanged as the baseline. These previews use actual application exports, not
the hair donor illustrations.

## Verification in this correction

- Reran **209 unit tests**, TypeScript checking and the production build; all
  passed. The emitted banks match the authored bank hashes.
- **6 focused Python regressions** passed. They cover all 184 real head
  registrations, fixed crown/fringe points, deterministic local sampling and
  donor-mask ownership. Worst inverse-map error was 0.0052 native pixels;
  minimum sampled Jacobian was 0.60375, with no foldover.
- Both original design sheets and source characters remain intact. Source
  provenance hashes were refreshed only for the derived cutouts.
- Final actual UI capture downloaded **80 PNGs and 4 CharacterPacks**. Two
  previous V2 projects reopened with exactly the previous frame-104 pixels; two
  new V2 projects saved and reopened with the corrected appearance. The temporary
  new project ZIPs have their hashes recorded rather than duplicating them here.
- After closing the wardrobe, **40 independent playback combinations** passed
  (two characters × two hairstyles × five actions × two directions). Under
  parallel capture load the observer initially missed one frame position in
  three left-jump checks. Only those combinations were rechecked; all positions
  were then observed. Initial records and targeted rechecks for
  [male](evidence/recheck-male/evidence-index.json) and
  [female](evidence/recheck-female/evidence-index.json) are retained. The initial
  longest interval was 119.3 ms; this does not claim
  perfect realtime frame scheduling.
- All **368 exported frames** preserve source RGBA outside selected garment,
  hair and face ownership. All **184 Gentle face layers** retain exactly the
  previous crop RGBA and ownership masks, and their facial/foreground guides
  remain unchanged. Four actual left-facing PNGs exactly mirror their separately
  exported right-facing counterparts.
- The **10 GIFs and 11 review PNGs** were decoded and hashed. The eight full
  previews each last 5,080 ms (88 male / 96 female GIF frames). The two ear
  inspection GIFs contain 39 frames over 1,630 ms; their source jump timing and
  per-frame inspection crops are recorded. All four ZIPs passed integrity and
  PNG decoding checks. GIF centisecond rounding does not alter CharacterPack
  timing.

Visual review covered the exported crouch/recovery sequence, both short styles
on both characters, and selected run/jump/celebration poses. The extra scalp band
is removed and the original ear structure remains visible. Full exported head
contact sheets are supplied for further review; this is not a claim of manual
acceptance of every pose. The source's minor chroma-key edge colors remain as
noted below.

Final browser and exported artifact results are recorded in
[artifact validation](artifact-validation.json),
[male capture](evidence/final-male/evidence-index.json), and
[female capture](evidence/final-female/evidence-index.json).

## Limitations

This fixes new hair alignment and donor cutouts. It does not repaint existing
Kling chroma-key fringes, source motion blur, face-to-face drawing variations,
or garment folds. There is still no secondary hair physics or long-hair system.
Technical validation and our visual comparison do not constitute user approval.

## Reproduce

Use the Python dependencies from `scripts/requirements-kling-wardrobe.txt`.

```sh
python scripts/prepare-kling-appearance.py --character both
python scripts/test_kling_hair_ear_fit.py
EAR_EDGE_RUN=repeat-male EAR_EDGE_CHARACTER=male node scripts/capture-kling-ear-edge.mjs
EAR_EDGE_RUN=repeat-female EAR_EDGE_CHARACTER=female node scripts/capture-kling-ear-edge.mjs
python scripts/render-kling-ear-edge-review.py --run repeat
```

The capture starts its own Vite server and Chromium (`/usr/bin/chromium`, or
`CHROMIUM_PATH`). Use different `EAR_EDGE_PORT` values for simultaneous captures.
New V2 project downloads are checked in a temporary directory and their hashes
are recorded, avoiding duplicate large editable bundles in this review. The
actual CharacterPacks and exported PNGs used to build the previews are retained.
