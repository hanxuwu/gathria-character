# Source pixel: five actions and two complete looks

The finer source-derived pixel study now covers both Kling characters, their **original tank-and-shorts and existing wedding looks**, and all five actions. It is available as the explicit **Source pixel** theme. Ordinary Kling and Pixel storybook R2 remain available with their prior artwork and defaults; the earlier limited study is unchanged.

This bank uses the approved source drawings, sampled offline with a fixed grid and shared palette. It preserves their anatomy and motion rather than generating new pose drawings. Clothes and hair in the wedding variants come from the retained ordinary wedding exports. These are complete baked looks, not independently editable pixel garment layers.

## Open it

1. Open **Workbench → Character themes** for either character.
2. Select **Source pixel**, then choose the base or wedding look.
3. Select Idle, Walk, Run, Jump or Celebrate, and a facing direction.
4. Enable **Compare Kling original** for a matching-look comparison. The new theme uses its verified 1/4 source mapping, so transparent padding does not make the reference body look larger.

Direct routes on your running app:

- `/workbench.html?character=male&mode=themes`
- `/workbench.html?character=female&mode=themes`

The ordinary theme is still selected on a fresh opening. Source pixel requires an explicit click. The wardrobe, appearance and skeleton tabs retain their existing behavior. Session saves retain exact theme versions and looks; **Restore Kling original** still explicitly resets to the original base look and idle.

## Review the application exports

| Character/look | Five-action overview, right | Five-action overview, left |
| --- | --- | --- |
| Male base | [GIF](review/male-base-five-actions-right.gif) | [GIF](review/male-base-five-actions-left.gif) |
| Male wedding | [GIF](review/male-wedding-five-actions-right.gif) | [GIF](review/male-wedding-five-actions-left.gif) |
| Female base | [GIF](review/female-base-five-actions-right.gif) | [GIF](review/female-base-five-actions-left.gif) |
| Female wedding | [GIF](review/female-wedding-five-actions-right.gif) | [GIF](review/female-wedding-five-actions-left.gif) |

The overview is a finite six-second presentation with five side-by-side columns at native size. Each looping clip follows its own clock; jump plays once and holds its final drawing. It does not turn jump into an artificial repeating loop. Individual native action GIFs, including all left/right versions, are in [evidence/](evidence/).

GIF delays are rounded cumulatively to centiseconds because the format cannot represent exact 24 FPS. The CharacterPack tables and browser player retain exact 24 FPS; a GIF's slightly rounded duration does not change the underlying motion schedule.

Matched source comparisons align whole canvases at their declared anchors: ordinary at uniform 0.5x and Source pixel at exact nearest-neighbor 2x. Both columns retain the same original 24 FPS sequence.

| Base comparison | Walk | Run | Jump |
| --- | --- | --- | --- |
| Male | [GIF](review/male-base-walk-original-source-pixel-right.gif) | [GIF](review/male-base-run-original-source-pixel-right.gif) | [GIF](review/male-base-jump-original-source-pixel-right.gif) |
| Female | [GIF](review/female-base-walk-original-source-pixel-right.gif) | [GIF](review/female-base-run-original-source-pixel-right.gif) | [GIF](review/female-base-jump-original-source-pixel-right.gif) |

Ordinary columns are identified retained historical application exports, verified against the approved source archive members. Source pixel columns use this batch's actual production UI exports. Derived review boards are presentation files; native transparent PNGs and CharacterPacks remain the authoritative artwork. All previous isolated study previews remain in [the earlier review](../kling-source-pixel-study/README.md).

## Portable themes and packs

| Character | Importable theme, both looks | Base CharacterPack | Wedding CharacterPack |
| --- | --- | --- | --- |
| Male | [theme ZIP](bundles/male-source-pixel.theme.zip) | [ZIP](evidence/male-base.character.zip) | [ZIP](evidence/male-wedding.character.zip) |
| Female | [theme ZIP](bundles/female-source-pixel.theme.zip) | [ZIP](evidence/female-base.character.zip) | [ZIP](evidence/female-wedding.character.zip) |

Use **Import theme** for theme ZIPs, or **Player → Choose character pack** for a standalone CharacterPack. These packs include all five actions. Their inherited motion-flow routes remain available in the player's matching-pose mode: jump completes recovery before returning to idle. With that mode off, ordinary one-shot playback holds the final jump drawing. Workbench action selection keeps its existing direct preview behavior.

Saved/reopened sessions are [male](evidence/male-source-pixel.theme-session.zip) and [female](evidence/female-source-pixel.theme-session.zip). The capture narrows these to the complete Source pixel theme to verify portable restoration without embedding unrelated themes. This is a complete theme, unlike the earlier partial study.

## Artwork and geometry

There are **368 unique drawings** across the four looks: male 88 per look and female 96 per look. Their five action tables contain **488 timeline positions** in total. Existing held drawings remain held; no interpolated or newly repeated poses are introduced.

| Action, each look | Positions | FPS | Playback |
| --- | ---: | ---: | --- |
| Idle | 24 | 24 | Loop |
| Walk | 27 | 24 | Loop |
| Run | 16 | 24 | Loop |
| Jump | 39 | 24 | One-shot |
| Celebrate | 16 | 24 | Loop |

All outputs use **192x298** native frames and anchor **(96,282)**. The original base canvas is 704x1056 with anchor (352,998); the ordinary wedding canvas is 768x1184 with anchor (384,1126). They are placed into the same 768x1192 source canvas with fixed transparent padding:

- Base: left/right 32, top 130, bottom 6.
- Wedding: left/right 0, top 2, bottom 6.

The complete canvas is sampled uniformly at 1/4 using premultiplied-alpha BOX sampling. This preserves the previous finer study's base geometry with an exact (+8,+32) output-pixel translation to the larger shared canvas. No source content is cropped. No frame is individually fitted, recentered, stabilized or anatomically warped.

A new, versioned **128-color palette** is shared across all four banks. This accommodates wedding browns, navy and ivory that were poorly represented in the base-only study palette. Base color bytes can change slightly; the old study palette and assets are untouched. Per-channel encoded-sRGB RMSE against the unquantized projection is approximately 4.30/255 male base, 4.87/255 female base, 3.54/255 male wedding and 4.03/255 female wedding, measured on projected pixels with alpha >=128 and weighted by the original timeline holds. These describe palette error, not aesthetic quality or animation smoothness. Projected alpha is unchanged and all transparent RGB is zero; no dithering, per-frame palette or new shadow removal is applied.

Source IDs, derivation entries, native schedules, facing, original source metadata and all motion-flow routes are retained. The two new catalog records are additive and hash-bound. Existing catalog records, theme IDs, revisions, ordinary packs, R2 packs and partial study assets are preserved.

See [asset provenance](../../artwork/kling-source-pixel-full/README.md), [processing/index](../../artwork/kling-source-pixel-full/index.json), [palette/error record](../../artwork/kling-source-pixel-full/palette.json) and [new catalog](../../artwork/kling-source-pixel-full/catalog-index.json).

## Scope and visual limits

This is deterministic source-derived pixel artwork, not hand-placed pixel illustration. Full-source blur, body/head motion, source clothing seams and existing animation boundaries remain. Smaller edges can still shift by a pixel during motion. Native schedules and exact projection do not prove that perceived flicker is eliminated.

The wedding dress is the existing short ivory dress from the approved ordinary look; this batch does not redesign it into a new long bridal gown. New clothing choices are complete look variants; it does not automatically pixelize every wardrobe piece or provide editable pixel hair/face layers. No new drawing API is used at runtime. User visual acceptance is still separate from the technical results below.

## Verification executed for this batch

The production capture ran at commit `636a7b071da5f1cf35466a3d54dc25111d90ef80` on 2026-10-25. The follow-up delivery commit adds evidence and documentation; it does not change the captured runtime or assets.

- TypeScript and the production build passed. **120 related unit tests** passed in the three recorded command groups (35 + 30 + 55), and **10 Chromium browser regressions** passed for themes and pixel playback. Earlier batches' test counts are not added to these results.
- The unchanged generator ran in a separate repository-shaped temporary directory: **all 25 generated files, 31,462,677 bytes, matched byte for byte**. See [reproducibility proof](reproducibility.json).
- Real production controls downloaded **782 files**: 4 CharacterPacks, 736 native transparent PNGs, 40 action/direction GIFs and 2 saved sessions. Every unique frame was exported both ways; all **976 timeline positions** were observed separately, including original repeated holds.
- The verifier decoded the complete ZIP/PNG/GIF contents, checked frame order, durations, one-shot/loop flags and left/right mirroring, and independently recomputed all 368 source projections. Output RGBA equals the declared BOX/palette result; this does not mean full-resolution source pixels are lossless.
- After all editor contexts closed, **40 independent action/direction playback cases** passed. Another **8 jump-return cases** observed every jump pose through recovery before Idle; ordinary one-shot mode held its final pose. No browser errors, failed requests, external requests or independent-player requests for the editor were recorded.
- **12 theme/look phase-preservation switches**, **4 synchronized original comparisons**, and **2 exact-theme saved/reopened sessions** passed. The actual comparison canvas sizes verify the 1/4 source mapping, not height-based fitting. Both fresh character openings still selected their ordinary base look.
- All **14 derived review GIFs** and **12 workspace/player screenshots** decoded. Native animation GIFs preserve their action semantics; the five-action boards are explicitly finite review presentations.

Visual inspection covered the actual base/wedding workspace displays, matching original comparisons and selected running/crouching/celebration poses. These show the retained source anatomy and common anchor with reduced color/spatial detail. Original garment seams and source motion remain; there is no claim of eliminated flicker or final user visual approval.

Machine records: [production capture](evidence/capture.json), [decoded verification](validation.json), and [check commands/results](checks.json). [Male workspace](evidence/male-base-workspace.png) · [Male wedding comparison](evidence/male-wedding-comparison.png) · [Female independent playback](evidence/female-wedding-independent.png).

## Reproduce

Run from the repository root with the recorded Python 3.12.14 / Pillow 12.3.0 / NumPy 2.3.5 toolchain and Node dependencies from the lockfile:

```sh
/tmp/kling-polish-venv/bin/python scripts/prepare-kling-source-pixel-full.py
npm run typecheck
npx vitest run src/themes/catalog-assets.test.ts src/themes/source-pixel-study.test.ts src/themes/source-pixel-full.test.ts src/themes/comparison.test.ts src/consumer/player.test.ts
npx vitest run src/themes/theme.test.ts src/themes/media.test.ts src/themes/motion-phase.test.ts src/consumer/motion-flow.test.ts src/core/pack-v4.test.ts
CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/e2e/themes.spec.ts tests/e2e/pixel-playback.spec.ts
npm run build
KLING_SOURCE_PIXEL_FULL_DIR=.review-tmp/source-pixel-full-recapture CHROMIUM_PATH=/usr/bin/chromium node scripts/capture-kling-source-pixel-full.mjs
KLING_SOURCE_PIXEL_FULL_DIR=.review-tmp/source-pixel-full-recapture /tmp/kling-polish-venv/bin/python scripts/verify-kling-source-pixel-full.py
```

Use a fresh evidence directory on each capture. The capture reads the published full-theme catalog and refuses to overwrite a prior capture record. Substitute an equivalent local Python executable if the session-specific path is unavailable. The baseline capture guard is `f958ab2`, the completed isolated study.
