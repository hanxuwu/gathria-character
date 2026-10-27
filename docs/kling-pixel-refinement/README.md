# Kling pixel finish candidate

Open `/workbench.html?character=male&mode=wardrobe` (or `female`). Dress the
character normally, then choose **Make and review → Try pixel finish → Build
pixel candidate**. The separate preview compares the same composed pose, offers
all available actions and both directions, and exports PNG, GIF, CharacterPack
and the conversion report. The original wardrobe and published theme defaults
remain unchanged. Close the preview to keep editing clothes, hair or faces.

This is deterministic conversion of the current complete Kling look, not newly
generated artwork. It runs locally; no drawing or generation API is called.
Changing settings requires rebuilding before downloading. A canceled or failed
rebuild retains the previous candidate. The independent player identifies the
result as **Algorithmic pixel candidate**.

## Actual exports to review

Each comparison shows the **current smooth outfit / its pixel candidate** at the
same source pose and original clock. Smooth references are scaled directly from
the actual source pack for display; pixel references use integer enlargement.
The downloads are complete five-action packs, not just the pictured run.

| Look            | Right run                                                 | Left run                                                 | CharacterPack                                                |
| --------------- | --------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| Male everyday   | [GIF](review/male-everyday-run-comparison-right-2x.gif)   | [GIF](review/male-everyday-run-comparison-left-2x.gif)   | [ZIP](evidence/final-v1/male-everyday.pixel.character.zip)   |
| Male wedding    | [GIF](review/male-wedding-run-comparison-right-2x.gif)    | [GIF](review/male-wedding-run-comparison-left-2x.gif)    | [ZIP](evidence/final-v1/male-wedding.pixel.character.zip)    |
| Female everyday | [GIF](review/female-everyday-run-comparison-right-2x.gif) | [GIF](review/female-everyday-run-comparison-left-2x.gif) | [ZIP](evidence/final-v1/female-everyday.pixel.character.zip) |
| Female wedding  | [GIF](review/female-wedding-run-comparison-right-2x.gif)  | [GIF](review/female-wedding-run-comparison-left-2x.gif)  | [ZIP](evidence/final-v1/female-wedding.pixel.character.zip)  |

[Full gallery](review/index.html) / [native and 2× keyframes, 4× head crops](review/)
include separately labeled [male](review/male-wedding-three-styles-right-2x.gif)
and [female](review/female-wedding-three-styles-right-2x.gif) comparisons against
the earlier **authored Storybook R2**. That column uses different drawings,
faces, clothing details and fewer unique poses; it is a style reference, not a
same-frame wardrobe rendering or algorithmic baseline. Its cycle duration is
the same; reviewed packs are not retimed.

[Unmodified UI downloads](evidence/final-v1/) include candidate-only left/right
run GIFs, one-shot jump GIFs, exact source/candidate PNGs and build reports.
The actual mapping for these four looks is 768×1184, anchor (384,1126), padded
by two transparent rows above and below, then sampled to **192×297**, anchor
**(96,282)**. Each look shares one 128-color palette across all five actions.

## Processing and compatibility

- One fixed source-space grid covers the entire frame bank. Transparent padding
  aligns the existing anchor exactly to an integer output coordinate. No pose is
  independently fitted, centered, warped or enlarged.
- Detail sampling chooses an existing visible source color near the cell's
  representative color. A restrained tonal heuristic protects coherent thin dark
  strokes; this is not a semantic eye/face detector. Alpha coverage becomes binary
  at a fixed 0.42 threshold. Hidden transparent RGB does not supply fringe color.
- A deterministic Oklab palette is fitted across all unique drawings in the look,
  then reused across all actions. There is no dithering, added outline, material
  recoloring, stochastic texture or temporal blending. Default: 4:1 sampling and
  128 colors. 6:1/8:1, 64/96 colors and simple sampling remain comparison options.
- Input is a validated smooth V2/V3 CharacterPack produced by the wardrobe.
  Output is a separate V4 baked pixel pack. IDs, original source-frame/time map,
  ordered action tables, holds, FPS, loop flags and motion-flow metadata remain
  intact. Geometry changes only by the declared global padding/sample mapping.
  Existing pixel packs are rejected as conversion inputs.
- The recipe records the exact source ZIP hash, original source reference,
  algorithm/settings, mapping and palette. Reports additionally bind the output
  ZIP and each PNG page. PNG/CharacterPack are lossless records of the converted
  pixels; GIF is an opaque, palette-limited preview with centisecond timing.
- The inspection preview holds a one-shot jump's final frame. The independent
  player uses the retained source motion-flow return-to-idle behavior.

The result is baked playback. Reopen the editable wardrobe to change the look,
then create a new pixel candidate; a downloaded pixel pack does not contain
independently editable garment layers. This work does not merge or replace the
earlier unmerged Source pixel study in PR #43.

## Inspiration and implementation

[PixelRefiner](https://github.com/HappyOnigiri/PixelRefiner/tree/c32659f350705f5f497fcc0737902f32915d2ef3)
inspired the focus on representative sampling, small features, alpha-aware edges
and shared perceptual palettes. Its MIT-licensed source was inspected. No source
code was copied or vendored, and it is not a runtime dependency. The Oklab
transform uses the published color-space definition. The fixed animation grid,
source pack mapping and full-bank conversion here are implemented independently.

Main files: `src/pixel/refine.ts`, `src/pixel/pack.ts`,
`src/pixel/PixelRefinement.tsx`, `src/pixel/pixel.css`. The wardrobe adds one
optional entry; the independent player adds an accurate candidate label.

## Visual selection

An offline parameter probe used two retained actual wardrobe exports: male
wedding and female daily. It compared simple sampling/96 colors, detail/96 and
detail/128. Detail sampling retained more continuous small contours; 128 colors
kept somewhat richer hair shading. This parameter probe is separate from the
production browser exports below.

The limited temporal diagnostic compares source-stable screen coordinates, not
tracked anatomy or optical flow. Eligibility is identical across all candidates:
both source cell mean alphas ≥240, maximum source RGB mean change ≤2, and all
candidate pixels opaque. A jump means an output channel difference ≥12. All run
transitions, including loop closure, are included.

| Probe        | Simple / 96 | Detail / 96 | Detail / 128 | Visible-union coverage |
| ------------ | ----------: | ----------: | -----------: | ---------------------: |
| Male wedding |   735 jumps |         201 |          149 |                 11.05% |
| Female daily |   941 jumps |         209 |          194 |                  8.68% |

These are diagnostic counts, not aesthetic scores or a claim that all flicker
was removed. Detail/128 has slightly more jumps than Detail/96 at loop closure
alone. All repeated source-ID holds remain exact. Static inspection and the
aggregate diagnostic support 128 as the initial candidate default.

[Parameter selection record](study/selection.json) retains the source hashes,
probe timings, candidate hashes, diagnostic script/results and inspection boards.
The six parameter-probe packs remain in `/tmp/kling-pixel-refinement/probe/`;
these are offline studies, not mislabeled production UI downloads.

## Limits

Conversion preserves source movement and proportions, but deliberately changes
colors and silhouette sampling. Source blur, garment seams, gray neckline remnants
and existing shape variation remain. Hard color/alpha thresholds may still jump
on moving edges. Reduced resolution can lose thin details. This candidate cannot
automatically design the hand-placed curls, highlights or garment folds in a
purpose-drawn pixel illustration. User visual acceptance remains pending.

The final actual native exports, all sixteen run poses per look and the exported
head/keyframe comparisons were inspected. Head, ear and garment placement follow
the corresponding original source poses. Hair shading is retained, but small
highlights/skin tones become bands and some narrow curls lose detail. Existing
shirt creases, gray neckline areas and stepped dress hems remain; the conversion
does not repair their source artwork. A palette is fitted per complete look,
so a different outfit can also change the available face/hair color shades.

Measured end-to-end builds (including preparing the original composed pack)
took **22.9–34.7 seconds** in this production Chromium capture. The long-task
observer measured maximum individual main-thread tasks of **1.5–3.5 seconds**.
Stage-boundary cancellation exists, but it is not instant during synchronous
work. This remains a performance limitation, not a claim of fully responsive
processing on every device.

## Verification executed in this batch

Captured runtime: `405886c`. The final delivery adds documentation/review artifacts;
the raw evidence binds the actual built JS and HTML hashes.

- Production build/TypeScript passed. Full unit suite: **448 tests / 46 files**.
  After selecting the 128-color default, **18 pixel core/pack tests** passed again.
  These are 448 unique unit cases, not 466.
- Chromium regressions: **16 passed**, including five new pixel workflows and
  eleven existing player, GIF and clothing-creation checks. These use small
  synthetic fixtures and are separate from real-character visual review.
- Production browser: four looks, **56 actual UI downloads**, eight screenshots.
  Four source ZIPs are temporary; four pixel ZIPs, four reports, 32 native PNGs
  and 12 GIFs are retained. Source/candidate PNGs match their actual pack pixels.
- Independent Python audit: **368 unique native frames**, all IDs/source maps,
  action order/FPS/holds/loop flags and exact anchor mapping. Every output alpha
  cell was independently recomputed from the smooth source. All visible colors
  belong to the look's shared palette; transparent RGB is zero.
- Twelve GIFs fully decode with the expected per-position delays, frame content
  and loop semantics. Four left/right run pairs are exact mirrors. Run is 16
  positions / 670 ms GIF duration; jump is 39 / 1630 ms. Packs retain exact 24 FPS.
  In these exports GIF palette projection preserves candidate colors exactly.
- All editors closed before **40 independent player action/direction cases**.
  Explicit scrubbing checks three positions per case; bounded real-time playback
  checks advancement. It does not claim to observe every rendered frame. All
  eight jump runs returned to idle. No editor dependencies or external requests
  were needed. One optional favicon 404 is separately recorded; no application
  failures were observed.

[Capture index](evidence/final-v1/evidence-index.json) ·
[Independent artifact audit](evidence/final-v1/artifact-validation.json) ·
[Executed logs](logs/) · [Derived gallery hashes](review/index.json).
Technical checks do not constitute user visual acceptance.

## Reproduce

```sh
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/e2e/pixel-refinement.spec.ts tests/e2e/pixel-playback.spec.ts tests/e2e/wardrobe-gif.spec.ts tests/e2e/clothing-authoring-lab.spec.ts
node scripts/capture-kling-pixel-refinement.mjs --plan
node scripts/capture-kling-pixel-refinement.mjs --run new-review --colors 128
python scripts/verify-kling-pixel-refinement.py --help
python scripts/render-kling-pixel-refinement-review.py --run new-review --output docs/kling-pixel-refinement/review-new
```

Use a fresh run directory for production capture; the scripts refuse to overwrite
earlier evidence. Full exported source packs are temporary audit inputs rather
than duplicated large repository assets. The capture index records their hashes.
Pillow and NumPy are required for the independent audit; Pillow is required for
the derived gallery. Keep the captured `dist` and temporary source packs until
the audit and gallery finish. See each script's help for directory arguments.
