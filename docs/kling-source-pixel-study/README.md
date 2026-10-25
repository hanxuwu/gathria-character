# Source-derived pixel motion samples

This isolated study preserves the approved ordinary Kling poses and native animation schedules, then applies one fixed spatial grid and shared palette offline. It focuses on **male base run** and **female base walk**. It does not redraw anatomy, change the default characters, publish a new catalog theme, or revive the rejected redraw batch from PR #42.

Baseline: `ce4c38e82381a128e242e18c7296f647bad1ac54`. Processing, packaging and browser evidence were captured at `75feb9ab36dbf1985f974544022e7ce6bb7b3627` on 2026-10-25. Subsequent delivery changes add documentation and captured evidence only.

## Review the actual exports

The three-column comparisons show **ordinary / existing Pixel R2 / new detail sample**. Ordinary and R2 are retained prior application exports, identified and verified against their approved archives; the study columns are newly exported through the production UI. No independently generated character drawings are substituted into these comparisons.

| Comparison | Right | Left |
| --- | --- | --- |
| Male run: ordinary / R2 / detail | [GIF](review/male-run-original-r2-detail-right.gif) | [GIF](review/male-run-original-r2-detail-left.gif) |
| Female walk: ordinary / R2 / detail | [GIF](review/female-walk-original-r2-detail-right.gif) | [GIF](review/female-walk-original-r2-detail-left.gif) |
| Male run: detail / compact | [GIF](review/male-run-detail-compact-right.gif) | [GIF](review/male-run-detail-compact-left.gif) |
| Female walk: detail / compact | [GIF](review/female-walk-detail-compact-right.gif) | [GIF](review/female-walk-detail-compact-left.gif) |

Every target timeline position is visible in the native-size contact sheets: [male detail](review/male-detail-run-right-all-positions-native.png), [female detail](review/female-detail-walk-right-all-positions-native.png), [male compact](review/male-compact-run-right-all-positions-native.png), [female compact](review/female-compact-walk-right-all-positions-native.png). Matching left sheets and individual transparent PNGs are in `review/` and `evidence/`.

All eight uncomposited target animation GIFs are in [evidence/](evidence/), alongside the four UI-exported CharacterPacks. Review montages apply only whole-canvas scaling, matte and declared-anchor alignment. Ordinary uses 0.5x display; study and R2 use nearest-neighbor 2x. R2 has its own 192x272 native canvas; the study uses 176x266. Bodies are not fitted to one another.

The male loops all last 2/3 s: ordinary/study have 16 positions at 24 FPS, R2 has 8 at 12 FPS. Female ordinary/study lasts 1.125 s (27 at 24 FPS), while R2 lasts 1 s (8 at 8 FPS). The female three-column GIF therefore runs for 9 s to close all native clocks together. Its columns naturally drift in phase; none is retimed. GIF stores centiseconds, so a single study loop rounds to 670 ms / 1130 ms; CharacterPack playback retains the exact FPS.

## Visual findings and limits

The **detail-128** candidate is the preferred direction for preserving the approved appearance. The inspected exported contact sheets and comparative stills retain the source face, arm/leg silhouettes and shoe structure much more closely than an independently redrawn set. Its eyes, mouth and shoe edges remain more readable than the compact candidate. The source's head and body motion is retained; there is no new per-frame head placement.

The **compact-64** candidate makes the grid more obvious but loses eye, finger and shoe detail, particularly on the female walk. It is retained for comparison, not recommended as a default.

These are downsampled, palette-limited source frames, **not hand-authored pixel art**. Source blur, pose variation, existing holds and loop boundaries remain. Spatial sampling can still cause changing one-pixel edges; one shared palette does not prove that all perceptual flicker is gone. Static visual inspection, decoded timeline checks and browser playback evidence are separate from user visual acceptance. No final visual acceptance is claimed.

This study includes only the original tank-and-shorts look. It does not establish five-action coverage, wardrobe compatibility or a new action-transition system. Original `motionFlow` transition routing is not copied into these scoped loop packs. The existing player's generic “Authored pixel artwork” label describes baked pixel-mode playback; the actual provenance here is deterministic offline processing, as recorded in every pack.

## Method and preserved data

Approved inputs are `docs/kling-motion/exports/{male,female}.character.zip`, not freshly extracted video or rejected R3 material. Source IDs, order, existing holds, derivation records and 24 FPS schedules are retained exactly for the included actions.

| Target | Timeline positions | Unique drawings | Original atlas IDs |
| --- | ---: | ---: | --- |
| Male run | 16 | 16 | 51–66 |
| Female walk | 27 | 25 | 24–50, retaining the existing repeated 28 and 41 in place of 29 and 42 |

All 704x1056 frames receive the same transparent padding: 2 pixels above and 6 below. The exact body mapping is `(x/4, (y+2)/4)`, producing a 176x266 canvas and mapping anchor `(352,998)` to integer `(88,250)` without rounding. No source content is cropped. No pose-specific fitting, recentering, head locking, body warping or interpolated frames are used.

- **detail-128:** alpha-weighted 4x4 BOX sampling, one 128-color palette shared across both characters and all included actions.
- **compact-64:** alpha-weighted 8x8 BOX sampling to 88x133, one shared 64-color palette, then exact nearest-neighbor 2x expansion.

BOX calculations use encoded-sRGB integer sums and half-up rounding. Palette training accounts for source hold durations. There is no dithering or per-frame palette. Projected alpha levels remain intact; fully transparent RGB is zero. The resulting atlas is RGBA8, compatible with the existing parser.

See [asset provenance](../../artwork/kling-source-pixel-study/README.md), [processing record](../../artwork/kling-source-pixel-study/study.json) and [bundle index](bundles/index.json) for source, palette, script and atlas hashes. Generated authoring previews under `artwork/` are explicitly marked as non-application captures; the review links above use application exports.

## Try the isolated themes

Open **Workbench → Character themes → Import theme** and choose one of these ZIPs. Direct paths on a local running app are `/workbench.html?character=male&mode=themes` and `/workbench.html?character=female&mode=themes`.

| Sample | Importable theme | UI-exported standalone pack |
| --- | --- | --- |
| Male detail | [theme ZIP](bundles/male-detail.theme.zip) | [CharacterPack](evidence/male-detail.character.zip) |
| Male compact | [theme ZIP](bundles/male-compact.theme.zip) | [CharacterPack](evidence/male-compact.character.zip) |
| Female detail | [theme ZIP](bundles/female-detail.theme.zip) | [CharacterPack](evidence/female-detail.character.zip) |
| Female compact | [theme ZIP](bundles/female-compact.theme.zip) | [CharacterPack](evidence/female-compact.character.zip) |

These have distinct study identities and are excluded from the built-in catalog. Male packs include idle, walk and run; female packs include idle and walk. Idle/walk are retained as auxiliary context because the current V4 parser requires both. Missing actions are disabled. The male pack contains 36 unique atlas cells and the female pack 29; timeline holds reuse those cells.

Load the CharacterPack ZIP using **Player → Choose character pack**. [Male](evidence/male-detail-independent.png) and [female](evidence/female-detail-independent.png) screenshots were taken in independent player contexts after all editor contexts closed. Saved sessions containing each character's two variants are also included in `evidence/`.

## Verification executed for this batch

- TypeScript check and production build passed.
- **42 targeted tests in 4 files passed**, including the new source-pixel-study parser/provenance/palette tests, existing theme/media tests and CharacterPack V4 tests. Historical full-suite counts are not represented as rerun here.
- A separate processing rerun reproduced all **35 generated artwork files byte for byte**; 130 atlas cells were independently checked for fixed alpha projection, palette membership and compact block structure.
- The production UI imported all **4 themes** and downloaded **194 files**: 4 CharacterPacks, 180 transparent PNGs (172 target positions plus 8 idle images), 8 target GIFs and 2 saved sessions.
- All exported pack frames and PNGs decoded; PNG RGBA matched the corresponding pack cells or exact left mirror. GIF frames, loop flags, centisecond timing and palette error were checked. Both sessions reopened with the selected theme, look, action, facing and paused frame intact.
- After editor contexts closed, **8 target-action and 8 idle independent playback cases** observed every timeline position, checked both directions and checked unavailable actions. No browser errors, failed requests, external requests or editor requests from the independent player were recorded.
- Both fresh character openings still selected the ordinary theme. Runtime files, catalog, existing source assets and defaults stayed unchanged from the approved baseline.
- All **8 comparison GIFs**, **8 native contact sheets** and **8 workspace/player screenshots** decoded. Ordinary reference archive members matched the approved source archives. The female comparison retains all 27 timeline positions, including its 2 repeated holds.

Machine records: [production capture](evidence/capture.json) and [decoded verification](validation.json). Technical checks establish reproducibility and playback integrity, not aesthetic approval.

## Reproduce

Use the package-lock Node environment and Python 3.12.14, Pillow 12.3.0, NumPy 2.3.5 recorded in the processing metadata. The commands below use the session's Python environment; substitute an equivalent interpreter on another machine.

```sh
/tmp/kling-polish-venv/bin/python scripts/prepare-kling-source-pixel-study.py
/tmp/kling-polish-venv/bin/python scripts/package-kling-source-pixel-study.py
npm run typecheck
npx vitest run src/themes/source-pixel-study.test.ts src/themes/theme.test.ts src/themes/media.test.ts src/core/pack-v4.test.ts
npm run build
mkdir -p .review-tmp/source-pixel-recapture
cp -R docs/kling-source-pixel-study/bundles .review-tmp/source-pixel-recapture/
KLING_SOURCE_PIXEL_STUDY_DIR=.review-tmp/source-pixel-recapture CHROMIUM_PATH=/usr/bin/chromium node scripts/capture-kling-source-pixel-study.mjs
KLING_SOURCE_PIXEL_STUDY_DIR=.review-tmp/source-pixel-recapture /tmp/kling-polish-venv/bin/python scripts/verify-kling-source-pixel-study.py
```

Choose a fresh capture directory each time; the script refuses to overwrite an existing capture record. Retained ordinary/R2 reference packs must be present for verification. Processing can be checked separately with `--output /tmp/kling-source-pixel-recheck` without overwriting committed artwork. Review this bounded sample direction before extending actions or outfits.
