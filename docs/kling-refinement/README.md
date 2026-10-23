# Kling refinement — review batch after PR #30

PR #30 was merged at `8f2f87f`. This batch is additive on
`feat/kling-fit-and-authoring-v2`; it does not replace the approved Kling bodies,
source action frames, timing, anchors, old banks or saved project versions.
Technical verification is separate from user visual acceptance.

## Open the changes

Start the project normally (`npm ci`, `npm run dev`). Open a Kling character,
choose **Wardrobe**, then **Everyday refined** or **Wedding refined**. The prior
**Everyday** and **Wedding** choices remain available unchanged. **Ocean linen**
is a material variation of the camp shirt, not an additional character or cut.

For the ear correction, select the female **Ribbon pony** hairstyle. Older saved
projects retain their embedded hair bank; use the explicit updated-copy preview
to adopt V4. Other hair banks and face paintings remain frozen.

For authoring, wear a top, trousers or dress, expand **Fitting guides**, then use
**Download clothing recipe**. See [recipe instructions](recipes/README.md).
A custom item is restored from its saved wardrobe project; a named look alone
does not embed that custom artwork and will not substitute a different hash.

## Actual application exports

Every review image below is built from downloaded application PNGs or decoded
CharacterPack frames. Source donor previews are separately marked **OFFLINE**.
Native PNG comparisons are 1x and nearest-neighbor 2x. GIFs are explicitly 0.5x
for a compact side-by-side review, with accumulated centisecond timing rounding.

| Review          | Right, five actions                                 | Left, five actions                                 | Native / 2x detail                                                                                                                                    |
| --------------- | --------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ear/temple      | [GIF](review/pony-five-actions-right.gif)           | [GIF](review/pony-five-actions-left.gif)           | [Before/after](review/pony-before-after-1x.png), [ear](review/pony-connections-2x.png)                                                                |
| Male daily      | [GIF](review/male-day-five-actions-right.gif)       | [GIF](review/male-day-five-actions-left.gif)       | [Before/after](review/male-day-before-after-1x.png), [cuff/waist](review/male-day-connections-2x.png)                                                 |
| Male wedding    | [GIF](review/male-wedding-five-actions-right.gif)   | [GIF](review/male-wedding-five-actions-left.gif)   | [Before/after](review/male-wedding-before-after-1x.png), [sleeves](review/male-wedding-connections-2x.png)                                            |
| Female daily    | [GIF](review/female-day-five-actions-right.gif)     | [GIF](review/female-day-five-actions-left.gif)     | [Before/after](review/female-day-before-after-1x.png), [waist](review/female-day-connections-2x.png), [hem](review/female-day-hem-2x.png)             |
| Female wedding  | [GIF](review/female-wedding-five-actions-right.gif) | [GIF](review/female-wedding-five-actions-left.gif) | [Before/after](review/female-wedding-before-after-1x.png), [waist](review/female-wedding-connections-2x.png), [hem](review/female-wedding-hem-2x.png) |
| Recipe colorway | [GIF](review/ocean-five-actions-right.gif)          | [GIF](review/ocean-five-actions-left.gif)          | [Before/after](review/ocean-before-after-1x.png), [detail](review/ocean-connections-2x.png)                                                           |

There are **24 decoded GIFs, 26 review PNG boards and 13 actual CharacterPacks**.
The [mixed outfit](evidence/outfit-mix/male-mixed-ocean-navy-workbench.png) combines
Ocean linen, navy trousers, brown shoes, copper Airy tousle and Gentle face.
The same review folder contains left/right run-only GIFs, full native keyframe
sheets and 2x full-body before/after PNGs. Five-action GIFs are repeating review
montages; exported packs retain the original one-shot jump/celebration behavior.

Portable final packs:

- [Male everyday](evidence/primary-fit-v3/male-male-day-after.character.zip)
- [Male wedding](evidence/primary-fit-v3/male-male-wedding-after.character.zip)
- [Female everyday](evidence/primary-fit-v3/female-female-day-after.character.zip)
- [Female wedding](evidence/primary-fit-v3/female-female-wedding-after.character.zip)
- [Ocean linen](evidence/primary-fit-v3/male-ocean-after.character.zip)
- [Ocean editable wardrobe](evidence/primary-fit-v3/male-ocean-after.wardrobe.zip)
- [Downloaded clothing authoring kit](evidence/primary-fit-v3/ocean-authoring-kit.zip)

## What changed, and what did not improve enough

- **Ribbon pony V4:** the earlier donor curl carried a second, peach-colored ear
  edge and an abrupt cut. A new local temple strand replaces that fragment while
  preserving the existing crown, rear pony and source ear. The first whole-front
  refit clipped a high pose and was rejected. Only the bounded local supplement
  was shipped. [Source and processing](../../artwork/kling-refinement/source/README.md).
- **Navy jacket V3:** tightly bent sleeves previously warped straight cloth
  creases into wedges. A supplementary cloth painting is registered by the
  shoulder/elbow/wrist and blended continuously with bend strength, inside the
  unchanged sleeve ownership. Cuffs, hands, outside contour and boutonniere stay
  attached to their original pixels. A rounded-UV attempt produced artificial
  circular folds and was rejected.
- **Camp shirt V3:** fractional coverage at the actual sleeve cut plane softens
  a small staircase at the cuff. This is a subtle edge repair, not a complete
  redraw of the collar or waist.
- **Coral and ivory dresses V5:** shallow curved side allowances soften straight
  triangular sides in compressed poses while retaining the painted hem and
  foreground protection. The correction is local and modest. The inward notch on the right side of the waist in deep crouches
  and internal compressed folds still need further artwork; they are
  not presented as completely natural cloth.
- **Recipe kits:** hash-bound base art, category and native-pose overrides can
  reproduce a material variant without altering ownership, alpha, source frames
  or anchors. Ocean linen was built from a kit downloaded from the workbench,
  imported back, saved/reopened and exported. New silhouettes still require the
  full pose template; one standing PNG cannot automatically supply them.
- **Library capacity:** the browsable lazy metadata index now permits 64 items
  per body. Actual embedded projects still retain the existing 16-item and memory
  limits. A browser regression confirms unused items are not fetched.
- **Loading experiment rejected:** page-wise ownership checks and reordered
  preparation gave a small male gain but a female regression (first hairstyle
  mean 58.86 → 62.65 seconds on this workspace). The runtime changes were reverted.
  [Measurements and rejected patch](experiments/README.md) are retained. No
  loading speed improvement is claimed in this batch.

The approved video's faint edge color and varying original pose detail remain.
No new hair physics, cloth simulation, body reconstruction or skeleton expansion
was introduced. Visual improvement is a review judgment, not a consequence of
passing tests; final user art approval remains pending.

## Verification performed this session

The final TypeScript/production build passed, as did **240 unit tests**, **12
focused Chromium tests** and **6 Python recipe tests**. The Chromium tests include
recipe download, a larger lazy catalog, failed asset recovery, cancellation,
source Worker/fallback behavior, saved projects and independent exports.
Historical test counts in older documents are not attributed to this session.

See [asset checks](final-asset-checks.json), [decoded export verification](verification.json)
and the browser indexes in [evidence](evidence). **70 isolated-player cases**
covered all five actions in both directions and observed every timeline position.
The [session report](session-verification.json) distinguishes these runs from
historical results. These reports record exact source RGBA
outside selected ownership, alpha, original frame IDs/timing/anchors, left/right
mirrors, saved project restoration, actual downloads, browser screenshots and
isolated playback after closing the editors. All **54** baseline source/bank ZIPs
retain their original SHA256. The library budget regression covers every shipped
outfit/separates pairing with the supported hair and face combinations.

One real-flow attempt hit the existing custom-material guard: the saved Ocean
look could not reload custom bytes from the library after refresh. The report
retains that attempt. Reopening its self-contained wardrobe project restored the
exact bytes and allowed the look to apply; the system never substituted another
revision. The initial real catalog check also exposed the former 16-item metadata
limit, now covered by the larger-catalog browser test.

Reproduction commands:

```sh
python scripts/prepare-kling-temple-v4.py
python scripts/prepare-kling-refined-outfits.py
python scripts/build-kling-garment-variant.py docs/kling-refinement/recipes/ocean-linen.json --output /tmp/ocean-rebuilt.zip
python scripts/verify-kling-refinement-assets.py
SPRINT_RUN=new-review SPRINT_CASE=male-day,male-wedding,female-day,female-wedding,ocean node scripts/capture-kling-refinement.mjs
python scripts/render-kling-refinement.py
python scripts/render-kling-refinement-hems.py
```

Use the artwork Python dependencies from `scripts/requirements-kling-wardrobe.txt`
and Chromium (or `CHROMIUM_PATH`). Evidence capture requires a fresh run name.
The original before/after projects referenced by the verifier are retained in
the capture workspace; the repository retains their recipes, exact material banks,
actual CharacterPacks and one complete custom-project example. Rerun capture to
recreate temporary projects on another machine. Do not overwrite released banks
when experimenting; assign a new version.
