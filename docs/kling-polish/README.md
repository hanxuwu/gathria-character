# Kling polish and workflow — Sprints 11–15

Base: main `0103b5c` (PR #31). The two approved Kling originals, source frames,
proportions, anchors and action timings remain authoritative. This batch adds
two dress-waist revisions, two hair-shading revisions and a more reusable
clothing authoring/restore workflow. Old saved wardrobes retain their artwork.

## Review the actual exports

| Study | Five actions, right | Five actions, left | Native keyframes / details |
| --- | --- | --- | --- |
| Coral dress | [GIF](review/female-day-five-actions-right.gif) | [GIF](review/female-day-five-actions-left.gif) | [1x](review/female-day-keyframes-1x.png) · [waist 2x](review/female-day-connections-2x.png) |
| Ivory wedding dress | [GIF](review/female-wedding-five-actions-right.gif) | [GIF](review/female-wedding-five-actions-left.gif) | [1x](review/female-wedding-keyframes-1x.png) · [waist 2x](review/female-wedding-connections-2x.png) |
| Airy tousle | [GIF](review/male-hair-five-actions-right.gif) | [GIF](review/male-hair-five-actions-left.gif) | [1x](review/male-hair-keyframes-1x.png) · [ear/head 2x](review/male-hair-connections-2x.png) |
| Ribbon pony | [GIF](review/female-hair-five-actions-right.gif) | [GIF](review/female-hair-five-actions-left.gif) | [1x](review/female-hair-keyframes-1x.png) · [ear/head 2x](review/female-hair-connections-2x.png) |

[Original face / Gentle / source celebration at native size](review/expression-states-1x.png).
The male [shirt regression](review/male-day-five-actions-right.gif) and
[suit regression](review/male-wedding-five-actions-right.gif) are unchanged.

Each GIF compares identical source frames before/after. Compact GIFs are labeled
0.5x; PNG comparisons are native 1x or nearest-neighbor 2x. GIF palettes and
centisecond durations are previews; the PNG/CharacterPack retains original RGBA
and source timing. Repeating five-action montages do not change the player's
one-shot jump/celebrate behavior.

Choose **Everyday soft waist** or **Wedding soft waist** for the new dresses.
New selections of **Airy tousle** / **Ribbon pony** use the crown shading update.
Older saved hair remains exact until **Preview updated appearance → Save updated
copy** is explicitly used. Other outfit styles remain in **More outfits and
earlier versions**; a currently selected old outfit stays visible.

## What changed

- A forward-crouch upper-body/skirt boundary left a deep concave waist notch.
  V6 dress revisions resample the existing cloth edge through a small registered
  waist band and add bounded supplementary inner folds. The correction varies
  continuously with source pose geometry. Source skin, hands, head and hem are
  protected. The initial over-creased prototype was rejected and retained.
- Two representative hairstyles use broader crown highlights and coherent
  lock shadows. Alpha, ear/temple/fringe pixels, rear layers and all head
  transformations remain exact. This changes shading, not hair silhouette or
  secondary-motion physics. Gentle remains unchanged.
- **Fitting guides → Inspect clothing layer** exposes the actual native layer
  and ownership mask. **Download this pose for painting** adds PNG, binary mask,
  anchors and a bound pose override to the existing offline recipe workflow.
- **Save look** retains the exact selected artwork in bounded IndexedDB storage.
  Custom materials and removed catalog revisions can restore after refresh.
  Failed or corrupt storage never substitutes artwork or partially changes the
  accepted outfit. **Save wardrobe** remains the portable backup.

The male shirt/suit were inspected as regressions and retain their previous
artwork; this batch does not claim another male-clothing repaint.
See [source provenance](../../artwork/kling-polish/source/README.md),
[asset audit](asset-checks.json), [plan](PLAN.md) and
[recipe instructions](../kling-refinement/recipes/README.md).

## Try the authoring roundtrip

Two custom materials, deliberately absent from the shipped clothing catalog,
exercise the complete workflow. They are colorways of existing source-bound
clothing, not two new silhouettes. The male shirt is mixed with suit trousers;
both examples also retain hair and Gentle.

| Example | Actual export comparison | Portable editable project | Independent CharacterPack | Native painting kit |
| --- | --- | --- | --- | --- |
| Sky shirt study | [Five actions](review/male-authoring-five-actions-right.gif) | [Wardrobe ZIP](evidence/authoring-v1/male-male-authoring-after.wardrobe.zip) | [CharacterPack ZIP](evidence/authoring-v1/male-male-authoring-after.character.zip) | [Pose 86 kit](evidence/authoring-v1/male-authoring-pose-kit.zip) |
| Champagne dress study | [Five actions](review/female-authoring-five-actions-right.gif) | [Wardrobe ZIP](evidence/authoring-v1/female-female-authoring-after.wardrobe.zip) | [CharacterPack ZIP](evidence/authoring-v1/female-female-authoring-after.character.zip) | [Pose 86 kit](evidence/authoring-v1/female-authoring-pose-kit.zip) |

The unedited downloaded pose kits rebuild every atlas page with identical pixels.
The material recipes remove the no-op single-pose override, then apply color
across all 88 male / 96 female poses. Import → mix → Save look → reload → Apply
look preserves exact pixels **without reopening a project after refresh**.
Portable wardrobe reopening and isolated CharacterPack playback are separately
checked. Use **Open wardrobe project** for editable ZIPs and the independent
player's **Choose character pack** for CharacterPacks; painting kits go to the
offline recipe builder.

## Validation in this batch

Executed here: TypeScript and production build; **240 unit tests**;
**61 Chromium tests**; **6 Python recipe tests**. The browser suite includes
custom-material refresh, corrupt storage, unavailable storage, native pose-kit
download, earlier-outfit access, mobile/keyboard use, saved wardrobes, source
workers/cancellation, appearance upgrades and independent playback.

[Waist capture](evidence/waist-v6/evidence-index.json) and
[hair capture](evidence/hair-v5/evidence-index.json), plus the
[authoring capture](evidence/authoring-v1/evidence-index.json), contain
**16 actual exports** and **80 isolated-player action/direction checks** after
closing the editors. [This-run command record](validation-this-run.json)
distinguishes these checks from earlier sprint history.
[Decoded export verification](verification.json) checks exact downloaded PNG
pixels against their pack, source protection, alpha, borders, frame order and
timing, and decodes every generated GIF frame.
The [authoring export verification](verification-male-authoring-female-authoring.json)
adds the two custom materials. Together these cover **1,472 exported poses**,
**80 directly downloaded same-frame PNGs**, and **32 GIFs**. GIF holds may combine
identical consecutive positions while preserving cumulative duration.

One female authoring download was canceled when the execution environment's
temporary disk filled. The failed attempt is preserved. Moving browser scratch
files to the workspace disk and continuing from the saved project/material
completed the same flow; no art was regenerated and no app validation was bypassed.

## Preparation performance

Two order-balanced production runs per character/build used identical current
artwork and confirmed matching preview RGBA. Median first hairstyle preparation:
male **12.93 → 9.00 s**, female **59.40 → 32.69 s**. First outfits:
male **5.77 → 3.93 s**, female **5.93 → 3.80 s**. Female repeat selection improves;
male repeat selection is slightly slower (**1.96 → 2.09 s**), so this is not a
claim that every operation is faster. First female hair selection still involves
a substantial wait. See [all samples, method and limits](performance/README.md).

The lossless synchronous PNG decoder uses bounded inflate output blocks to
avoid repeated buffer copying. Its raw RGBA reconstruction, source/ownership
validation and decoded page-cache budget are retained. Truncated, corrupt and
trailing compression streams are rejected. No runtime artwork API is added.

Implementation is in `src/core/baked-source.ts`, `src/wardrobe/local-materials.ts`,
`NamedLooks.tsx`, `ClothingPoseInspector.tsx`, `recipe-kit.ts` and
`WardrobeEditor.tsx`; authoring preparation is in the two scripts named in source
provenance. `scripts/capture-kling-polish.mjs`, `render-kling-polish.py` and
`render-kling-polish-expressions.py` reproduce the actual review workflow.

The completed batch is submitted as a draft for review, without merging or
deploying. Older sprint test records are separate from this batch's results.

## Remaining limits

- Extreme crouch still shows some stretched waist cloth and a faint compressed
  edge. The cutout is improved; this is not a complete pose-redrawing system.
- Existing male bent-elbow sleeve/cuff edges can still look hard. The male
  clothing in this batch is a regression check, not a new repaint. Motion blur
  already present in some source jump frames is also retained.
- The head/body preserves source expression and pose changes. Gentle is an
  optional edit; this does not add three independently selectable facial rigs.
- New silhouettes or sleeve lengths still need source-bound artwork for every
  pose. A new standing PNG is not automatically fitted to all actions.
- Browser artwork storage is capped at 256 MiB with no eviction. Deleted looks
  currently leave reusable material bytes; use portable wardrobe files for
  long-term storage. Clearing browser data removes local looks and artwork.
- Technical passes and our visual inspection are distinct from user approval.
  No user visual acceptance, merge or deployment is implied.
