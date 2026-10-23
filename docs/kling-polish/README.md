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

## Validation in this batch

Executed here: TypeScript and production build; **240 unit tests**;
**61 Chromium tests**; **6 Python recipe tests**. The browser suite includes
custom-material refresh, corrupt storage, unavailable storage, native pose-kit
download, earlier-outfit access, mobile/keyboard use, saved wardrobes, source
workers/cancellation, appearance upgrades and independent playback.

[Waist capture](evidence/waist-v6/evidence-index.json) and
[hair capture](evidence/hair-v5/evidence-index.json) contain **12 actual exports**
and **60 isolated-player action/direction checks** after closing the editors.
[Decoded export verification](verification.json) checks exact downloaded PNG
pixels against their pack, source protection, alpha, borders, frame order and
timing, and decodes every generated GIF frame.

Final custom authoring evidence and production performance comparison are being
completed before the review PR is opened. These are current-run results; older
documents' test counts are not counted again here.

## Remaining limits

- Extreme crouch still shows some stretched waist cloth and a faint compressed
  edge. The cutout is improved; this is not a complete pose-redrawing system.
- The head/body preserves source expression and pose changes. Gentle is an
  optional edit; this does not add three independently selectable facial rigs.
- New silhouettes or sleeve lengths still need source-bound artwork for every
  pose. A new standing PNG is not automatically fitted to all actions.
- Browser artwork storage is capped at 256 MiB with no eviction. Deleted looks
  currently leave reusable material bytes; use portable wardrobe files for
  long-term storage. Clearing browser data removes local looks and artwork.
- Technical passes and our visual inspection are distinct from user approval.
  No user visual acceptance, merge or deployment is implied.
