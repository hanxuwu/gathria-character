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

| Probe | Simple / 96 | Detail / 96 | Detail / 128 | Visible-union coverage |
| --- | ---: | ---: | ---: | ---: |
| Male wedding | 735 jumps | 201 | 149 | 11.05% |
| Female daily | 941 jumps | 209 | 194 | 8.68% |

These are diagnostic counts, not aesthetic scores or a claim that all flicker
was removed. Detail/128 has slightly more jumps than Detail/96 at loop closure
alone. All repeated source-ID holds remain exact. Static inspection and the
aggregate diagnostic support 128 as the initial candidate default.

## Limits

Conversion preserves source movement and proportions, but deliberately changes
colors and silhouette sampling. Source blur, garment seams, gray neckline remnants
and existing shape variation remain. Hard color/alpha thresholds may still jump
on moving edges. Reduced resolution can lose thin details. This candidate cannot
automatically design the hand-placed curls, highlights or garment folds in a
purpose-drawn pixel illustration. User visual acceptance remains pending.

## Reproduce

```sh
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/e2e/pixel-refinement.spec.ts tests/e2e/pixel-playback.spec.ts tests/e2e/wardrobe-gif.spec.ts tests/e2e/clothing-authoring-lab.spec.ts
node scripts/capture-kling-pixel-refinement.mjs --plan
```

Use a fresh run directory for production capture; the scripts refuse to overwrite
earlier evidence. Full exported source packs are temporary audit inputs rather
than duplicated large repository assets. The capture index records their hashes.
Final evidence links and executed verification are recorded after capture.
