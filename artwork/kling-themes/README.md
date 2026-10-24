# Character theme source assets

This directory preserves authoring references, generated source sheets and the
technical preparation of independent visual themes. It does not replace the
approved Kling source artwork, wardrobe catalog or original playback packs.

## Source pose guides

`source-guides/{male,female}/` contains guides extracted from the retained
`docs/kling-motion/exports/*.character.zip` archives. Every pose uses the **same**
704×1056 → 320×480 transform and `(32,16)` placement inside a 384×512 guide cell.
No frame is separately fitted to its visible bounding box. Source bobbing and
airborne height remain visible. The JSON alongside each guide records the exact
source archive hash, selected pose IDs, original action timeline and guide hash.

These are pose references, not newly authored theme frames. An independently
redrawn theme can use its own cadence and should not pretend its drawings are
pixel-exact video extraction or inherit an old visual approval.

```sh
python scripts/prepare-kling-theme-assets.py guides
python scripts/prepare-kling-theme-assets.py guides --look wedding
```

Wedding guides come from the retained prior application exports described below.
Their shared 768×1184 canvas is sampled to 311×480 and placed at `(36,16)` in
each guide cell. This is a guide-only common transform, not the pixel artwork's
registration. Each wedding action has eight cells; the combined sheet has four
idle references followed by four celebration references.

## Original theme wrappers

The `kling-original` theme bundles embed the retained male/female motion archive
**without changing a single byte** as the `base` look. Their `wedding` look embeds
the exact previous application export in
`docs/kling-paint-roundtrip/evidence/{character}-wedding-before.character.zip`.
That look includes its selected clothing, hair and expression; it is not the
bald source-video drawing. The `theme.json` envelope contains identity, version,
rendering mode, provenance, reference hash and both logical looks. The existing
wardrobe remains available for editable layers.

```sh
python scripts/prepare-kling-theme-assets.py originals
```

## Authored pixel sheets

`source/` retains generated artwork and its generation records. A pixel theme is
authored through the image-generation tool; no style filter or shader is used to
claim a new hand-drawn theme. Preparation only extracts declared grid cells,
applies explicit integer translations to register misplaced cells, samples all
poses at the declared common integer scale, and builds an atlas. It never changes
one pose's body proportions through independent fitting or interpolates anatomy.

Generation can leave alpha values of 253–254 inside a drawing and extremely faint
0–2-alpha haze outside it. Preparation preserves the original RGBA values. Its
clipping guard treats alpha above 16 as visible artwork; it rejects translations
that would clip that artwork. A transparent border is not evidence of a correct
pose—every action still needs visual inspection.

The source recipe records each action sheet, grid, frame count, optional explicit
timeline, frame rate, loop semantics and registration translations. Source crops
can follow an explicitly reviewed empty gutter when the drawing extends past the
nominal 512-pixel row boundary; this preserves the complete shoe instead of
cutting it in half. All current pixel poses use the same 32-source-pixel
transparent top padding, 2:1 sampling, native 192×272 frame and `(96,251)` anchor.
This extra headroom prevents the jumping crown or wedding hair from being clipped.
It does not stretch or resize the body. Jump must be
a one-shot. All five actions are required before a built-in theme is published.
The generated V4 CharacterPack declares integer pixel rendering and its own
native attachment point. V2/V3 original packs retain their old smooth contract.

```sh
python scripts/prepare-kling-theme-assets.py pixel --recipe path/to/recipe.json
```

Example recipe shape (filenames and timing must be chosen from real reviewed art):

```json
{
  "character": "male",
  "id": "pixel-storybook",
  "revision": 1,
  "name": "Pixel storybook",
  "frameSize": [192, 272],
  "integerSample": 2,
  "registrationPadding": {"left": 0, "top": 32, "right": 0, "bottom": 0},
  "anchor": {"x": 96, "y": 251},
  "provenance": "Actual generation source, references and preparation steps.",
  "actions": {
    "run": {
      "file": "male-run-v1.png",
      "columns": 4,
      "rows": 2,
      "count": 8,
      "fps": 12,
      "loop": true,
      "translations": [[0,-32],[0,-32],[0,-32],[0,-32],[0,0],[0,0],[0,0],[0,0]]
    }
  }
}
```

The shortened example intentionally omits four actions and **will not publish**.
Complete recipes need `idle`, `walk`, `run`, `jump` and `celebrate`.

The four complete build recipes are `source/{male,female}-pixel-storybook.recipe.json`
and `source/{male,female}-pixel-storybook-wedding.recipe.json`. Each produces 32
drawings: four idle, eight walk, eight run, eight jump and four celebrate. Run is
12 fps, walk/jump 8 fps; idle and celebration use explicit repeated-frame holds.
The idle bank is near-static and does not add an artificial blink. Jump is a
one-shot. The atlas uses the same fixed scale for every action and every look.

Wedding sheet layout drift is corrected using the recorded crown-center and
shoe-bottom measurements in each recipe. The result is an explicitly authored
contact/flight trajectory, **not** recovered source-video timing. These whole-pose
translations preserve the artwork's relative head/limb positions. Artwork still
has modest changes in apparent detail between independently generated actions.
Male wedding idle/celebrate v1 had visibly larger anatomy than locomotion; the
published v2 is a separate recorded image-generation correction that brings its
head/body scale closer to the walk/run bank. V1 remains as an iteration source.
No pose-dependent resizing has been used to conceal drawing differences.
Four celebration drawings and eight
locomotion drawings also limit temporal detail compared with the original video.

`male-jump-v2.png` is the published male base jump source: its recorded generation
edit removes the unintended shoe-lace marks introduced in v1. Both source versions
remain available. `pixel-guide-v1.generation.json` explicitly says that the exact
initial guide prompt was not retained; its request summary must not be quoted as
an exact prompt. Production animation sources retain their full generation records.

## Catalog and outputs

`catalog-index.json` records exact published bundle hashes, lengths and preview
paths. `src/themes/catalog.ts` verifies these hashes and all five actions before
accepting a built-in entry. Production URLs are emitted through Vite's static
asset graph; development URLs remain stable for review.

`prepared/{character}/{theme}/` contains the native atlas, preview and preparation
record. Deliverable theme and character archives are in
`docs/kling-themes/bundles/`. Technical source-cell experiments are labeled as
studies; application-rendered GIF/PNG evidence belongs in the review documents.

```sh
python scripts/prepare-kling-theme-assets.py catalog
```

Adding an unrelated outfit under the same logical look ID is not a valid theme
mapping. A theme missing a requested outfit must ask the user to choose an
available look, rather than silently substituting clothes or mixing art styles.
