# Stronger Kling pixel finish

Open `/workbench.html?character=male&mode=wardrobe` (or `female`), dress the
character, then choose **Make and review → Try pixel finish → Strong pixels →
Build pixel candidate**. The new option uses a 6:1 grid, a shared 96-color palette
and conservative cleanup of tiny low-contrast shade islands. **Detailed pixels**
keeps the previous 4:1/128-color finish and remains the initial selection.

This is local algorithmic conversion of the existing complete Kling look. No
new character artwork or poses are generated. Original characters, clothes,
hair, facial configuration and action clocks are the source of every result.

## Review actual exports

The comparison GIFs show **previous pixels on the left / stronger pixels on the
right**. Previous pixels use integer 2× enlargement; stronger pixels use integer
3× enlargement. Both occupy exactly 384×594 display pixels with anchor (192,564),
so differences in character display size cannot make the stronger style appear
better. Neither column is individually centered, warped or smoothed.

| Look | Right run | Left run | Strong CharacterPack |
| --- | --- | --- | --- |
| Male everyday | [GIF](review/male-everyday-run-comparison-right.gif) | [GIF](review/male-everyday-run-comparison-left.gif) | [ZIP](evidence/final-v2/male-everyday.pixel.character.zip) |
| Male wedding | [GIF](review/male-wedding-run-comparison-right.gif) | [GIF](review/male-wedding-run-comparison-left.gif) | [ZIP](evidence/final-v2/male-wedding.pixel.character.zip) |
| Female everyday | [GIF](review/female-everyday-run-comparison-right.gif) | [GIF](review/female-everyday-run-comparison-left.gif) | [ZIP](evidence/final-v2/female-everyday.pixel.character.zip) |
| Female wedding | [GIF](review/female-wedding-run-comparison-right.gif) | [GIF](review/female-wedding-run-comparison-left.gif) | [ZIP](evidence/final-v2/female-wedding.pixel.character.zip) |

[Gallery](review/index.html) includes native 1× and integer 3× keyframes,
complete 16-position run boards at 2×, and the same source-relative face/ear crop.
[UI downloads](evidence/final-v2/) contain
the native PNGs, candidate-only run GIFs in both directions, one-shot jump GIFs,
five-action packs and conversion reports. Review GIFs retain both exported
character palettes exactly; their label pixels may be palette-mapped.

## Changes and compatibility

- The fixed 6:1 grid maps a 768×1184 source with two transparent rows above and
  below to **128×198**, anchor **(64,188)**. Source IDs, original derivation,
  action order, repeated holds, FPS, loop flags and motion-flow remain intact.
- One deterministic Oklab palette covers all five actions of a complete look.
  There is no dithering, added outline, per-frame palette or temporal blending.
- The new cleanup reads the original quantized frame and writes one simultaneous
  pass. It only merges isolated one- or two-pixel interior color components into
  a strongly supported, nearby palette shade. It protects transparent borders,
  connected strokes, dark ink and high-contrast features. It never changes alpha
  or adds colors. This is a conservative color heuristic, not facial recognition
  or artist-designed contour reconstruction.
- `finish: "cluster"` opts into generator
  `gathria-kling-pixel-refinement-v2`; its report records cleanup version
  `supported-shade-islands-v1`, pass count and actual changed-pixel count.
  Omitting `finish` follows the unchanged V1 conversion and serialization path.
  A frozen pre-change ZIP/report hash regression protects its exact output.
- Both versions are independent V4 baked packs and load in the existing player.
  The player labels them **Algorithmic pixel candidate**. Editable wardrobe
  projects remain separate from the converted output.
- Changing the style or cleanup setting marks an existing candidate stale until
  rebuilt. Canceling or failing a rebuild retains the previous accepted preview.
  PNG/GIF/CharacterPack/report export all describe the actual built settings.

Main implementation: `src/pixel/refine.ts`, `src/pixel/pack.ts`,
`src/pixel/PixelRefinement.tsx`, `src/pixel/pixel.css` and the generator label in
`src/consumer/PackPlayer.tsx`. The previous PixelRefiner inspiration attribution
still applies: concepts were studied, no code was copied and no dependency was
added. This batch's shade-island cleanup is implemented independently.

## Validation and visual limits

Executed validation and selection results are recorded in [verification.json](verification.json).
Automated checks and actual character inspection are reported separately.

This batch executed **459 unit tests / 46 files**, production build/TypeScript,
and **18 Chromium regressions**, all passing. The browser regressions use small
synthetic fixtures; the separate production capture uses four actual wardrobe
looks, 56 UI downloads and eight screenshots. Runtime captured: `749b68b`.

The [independent artifact audit](evidence/final-v2/artifact-validation.json)
decoded 368 native pack frames, 32 PNGs and 12 GIFs. All four source ZIPs are
byte-identical to the retained previous batch, and their decoded source pixels,
manifest and recipe also match. Target alpha is independently recomputed from
the fixed source grid. Four left/right run pairs are exact mirrors; raw GIF
palette projection error is zero. Run GIFs have 16 positions / 670 ms; jumps
have 39 / 1630 ms and are one-shot. Packs retain the original exact 24 FPS clock.

All editors were closed before 40 independent player action/facing checks,
including explicit scrubbing and bounded playback observation. This does not
claim to inspect every browser animation-frame callback. Application/console/
request failure lists are empty; one optional favicon diagnostic is separately
recorded. The 24-image derived gallery fully decodes; all eight comparison GIFs
retain exact character RGB from their source packs.

Actual complete run boards (all 16 positions for each of four looks), the head
crops and editor/player displays were inspected. Pixel grain is stronger and no
new disconnected part was identified in those inspected positions. Fine curls,
eyelashes and dress decoration lose detail; source seams and blur remain.

Measured click-to-ready conversion, including original wardrobe preparation,
took **22.3–34.5 seconds** in production Chromium. Maximum main-thread long tasks
were **1.52–3.54 seconds**. This remains a responsiveness limitation and is not a
device-independent performance guarantee.

An [offline parameter study](study/selection.json) uses two retained actual
wardrobe source packs to separate resolution changes from cleanup. Across the
complete banks, cleanup changes 2,760 / 650,437 visible pixels for male wedding
(0.424%) and 1,640 / 889,771 for female everyday (0.184%). It leaves the 6:1
sampled alpha and palette exactly unchanged. The same-display boards show that
the stronger pixel grain primarily comes from 6:1 sampling; cleanup is subtle.

The limited run diagnostic counts RGB jumps of at least 12 at identical screen
coordinates where source mean RGB changes by at most 2, both source mean alphas
are at least 240, and both candidate pixels are opaque. All transitions include
loop closure. Plain6 → cluster6 counts are **112 → 115** for male wedding and
**134 → 135** for female everyday, with only **11.60% / 9.09%** visible-union
coverage. This small regression is explicitly retained in the study; cleanup is
not a temporal-stability improvement. Different-resolution 4:1 results are not
assigned a directly comparable score. These observations are not optical flow,
aesthetic scores or proof that moving edges do not flicker.

The stronger appearance primarily comes from coarser sampling and fewer colors;
the shade cleanup is deliberately modest. At this resolution eyelashes, eye
highlights, thin hair curls and garment decoration occupy fewer pixels. Some
fine detail is lost. Existing source seams, motion blur and anatomy variations
remain. Fixed grids and shared palettes do not eliminate temporal edge flicker;
the cleanup does not register a moving head or invent intermediate frames.
User visual acceptance remains pending.

## Reproduce

```sh
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/e2e/pixel-refinement.spec.ts tests/e2e/pixel-playback.spec.ts tests/e2e/wardrobe-gif.spec.ts tests/e2e/clothing-authoring-lab.spec.ts
node scripts/capture-kling-strong-pixels.mjs --plan
node scripts/capture-kling-strong-pixels.mjs --run final-v2
python scripts/verify-kling-strong-pixels.py --help
python scripts/render-kling-strong-pixels-review.py --run final-v2 --output docs/kling-strong-pixels/review
```

Use a fresh run/output directory to retain earlier evidence. The capture and
audit require the retained PR48 source packages for exact source-pixel comparison;
their paths and hashes are recorded, rather than duplicating large source packs
in Git. Preserve the captured production build until audit completion. Pillow
and NumPy are needed for the independent audit and exact-palette gallery.
