# Side part and tucked bun

This batch adds **Side part** to the Kling male and **Tucked bun** to the Kling
female. Each character retains Soft crop, Soft bob, the three existing hair
colors, Original/Gentle faces and the existing clothes and actions.

Use **Character library → Dress Kling male/female → Hair & face**. The new
style is available immediately in a current library session. An older saved
project remains authoritative: use **Preview updated appearance → Save updated
copy**, then reopen that copy to gain the new style. Nothing rewrites the old
project or silently changes its selected hairstyle.

## Artwork and registration

`artwork/kling-appearance/source/expansion-design.png` was generated with the
OpenAI image-generation tool on 2026-10-23. The original male/female Kling
reference PNGs provide identity, angle and proportions; the existing bob sheet
provides hair rendering consistency. The complete prompt is retained beside
the donor. This sheet is a design source, not an application screenshot.

Only the reviewed hair is extracted. Generated faces, ears, necks and clothing
are discarded; the application keeps the approved original video pixels.
`scripts/kling_hair_expansion.py` records donor-space polygons, eye guides,
hair-only fitting and separate rear-hair registration. Front/back boundaries
overlap inside opaque hair. Rear hair is drawn behind the original head, ear,
hands and garments, retaining the existing foreground-hand protection.

The compact bun avoids long tails across shoulders. Both styles follow the
existing registered head/ear motion; there is no additional hair-physics model.
Source motion blur is matched only on the existing reviewed fast poses.

Native-pose review prompted two local corrections before release: the initial
male fit left an upper-ear scalp wedge and a gap behind the ear, while the female
donor was too wide and left a loose curl at the neck. Hair-only registration,
rear-layer tucking and a bounded upper-ear overlap remove these openings without
moving or repainting the original ear. The final overlap remains entirely inside
the existing local sampler, avoiding a cut-off deformation at its boundary.

## Preserve the existing materials

`scripts/append-kling-hair-expansion.py` reads the released baseline
`4d2efafc6bfcef7185d43c8aac50e3594f505b94`, retains its atlas PNG bytes and
existing style mappings, then appends the new style's cropped patches on new
pages. Original face patches and registrations remain unchanged. The shared
hair bounding box can expand to contain the additional style; source dimensions,
transparent padding, head/face guides, hand masks and action timing stay fixed.

Male appearance content becomes V5 and female becomes V4; appearance-bank schema
remains V1. These are asset content revisions, not a replacement character body.
Editable wardrobe V2 and independent CharacterPack V3 keep their existing formats.
Released predecessor hashes continue to require an explicit saved-copy upgrade.

The lightweight catalog now includes validated style summaries so new styles
can be selected before downloading the appearance bank. Loaded old/custom banks
continue to provide their own choices. Style thumbnails are cropped from actual
exported PNGs, not from the generated design sheet.

## Actual application results

| Review | Male Side part | Female Tucked bun |
| --- | --- | --- |
| Source, retained styles and new style | [Native](review/male-lineup-1x.png) / [2×](review/male-lineup-2x.png) | [Native](review/female-lineup-1x.png) / [2×](review/female-lineup-2x.png) |
| Ear connection | [2× lineup](review/male-ear-lineup-2x.png) / [moving poses](review/male-ear-motion-2x.png) | [2× lineup](review/female-ear-lineup-2x.png) / [moving poses](review/female-ear-motion-2x.png) |
| Original beside new style, five actions | [Right GIF](review/male-five-actions-right.gif) / [Left GIF](review/male-five-actions-left.gif) | [Right GIF](review/female-five-actions-right.gif) / [Left GIF](review/female-five-actions-left.gif) |
| Running ear, fixed native crop | [GIF](review/male-ear-run-1x.gif) | [GIF](review/female-ear-run-1x.gif) |
| Everyday and wedding poses | [Native](review/male-outfit-actions-1x.png) / [2×](review/male-outfit-actions-2x.png) | [Native](review/female-outfit-actions-1x.png) / [2×](review/female-outfit-actions-2x.png) |
| Three colors and two face choices | [Standing](review/male-colors-faces-0-1x.png) / [crouching](review/male-colors-faces-86-1x.png) | [Standing](review/female-colors-faces-0-1x.png) / [crouching](review/female-colors-faces-86-1x.png) |
| Independent CharacterPack, everyday / Chestnut / Gentle | [ZIP](evidence/final-male/male-new-style.character.zip) | [ZIP](evidence/final-female/female-new-style.character.zip) |
| Final workbench with actual style cards | [Desktop](evidence/post-thumbnail-ui/male-final-desktop.png) / [mobile](evidence/post-thumbnail-ui/male-final-mobile.png) | [Desktop](evidence/post-thumbnail-ui/female-final-desktop.png) / [mobile](evidence/post-thumbnail-ui/female-final-mobile.png) |

The [baseline browser capture](evidence/baseline/evidence-index.json) records
four newly downloaded old-style PNGs from retained baseline projects. Final
exports compare those same frame-0 looks pixel-for-pixel, alongside new-style
lineups, difficult poses, colors, faces and clothing combinations. Source PNGs
are padded by an integer translation for comparison; original pixels are never
resized to fit the new hair.

Native PNGs and decoded CharacterPack frames are the visual reference. Review
GIFs use a palette and centisecond timing, and labeled full-character views may
be reduced for display. A repeating five-action review GIF does not change the
exported one-shot jump semantics. Technical validation is separate from user
visual acceptance.

## Checks run for this expansion

- [Technical checks](technical-checks.json): 36 relevant unit tests, 12 Chromium
  behavior tests and 18 Python checks passed, plus TypeScript checking and the
  final production build. Both built banks and all six built thumbnails match
  their source SHA256. The
  final catalog SHA descriptor case was repeated after generation; it is not
  counted as an additional unique test. Production-build and actual-artwork
  results are recorded separately from synthetic browser fixtures.
- [Append-only audit](bank-compatibility-validation.json): 57 original files and
  22 existing atlas/ownership PNG entries are unchanged. All 184 pose records
  retain their original fields except the exact union of hair bounds. All 368
  new front/back layer frames decode with valid ownership and clear margins.
  All 456 retained hair-layer frames were also checked: their nonzero pixels
  already fit inside their original bounds, so enlarging the envelope exposes
  no previously hidden old painting.
- [Actual artifact validation](artifact-validation.json) checks the delivered
  PNGs, GIFs and CharacterPacks, old-style frame-0 equality, mirrored directions,
  original animation sequences/timing and source pixels outside authored layers.
  [Visual review](visual-review.md) records the inspected poses and remaining
  visual limitations independently of those technical checks.
- The two actual browser workflows each downloaded 52 PNGs, one editable
  project and one CharacterPack. Both projects reopened with exact preview
  pixels and saved selections. Each editor was closed before its character's
  independent playback checks. All 20 combinations passed: two characters ×
  five actions × two directions.
  [Male record](evidence/final-male/evidence-index.json) ·
  [female record](evidence/final-female/evidence-index.json).
- The [final thumbnail UI check](evidence/post-thumbnail-ui/evidence-index.json)
  loads all six actual-export hairstyle images, selects each new style and
  captures desktop/390-pixel mobile layouts without horizontal overflow. It
  performs no additional CharacterPack export.

## Reproduce

Install the pinned Python dependencies in
`scripts/requirements-kling-wardrobe.txt`. The baseline Git commit must be
available locally. These commands append from that immutable baseline rather
than rebuilding old paintings:

```sh
python scripts/append-kling-hair-expansion.py --character both
python scripts/build-kling-wardrobe-catalog.py
python scripts/verify-kling-hair-expansion.py
```

The capture script is `scripts/capture-kling-appearance-expansion.mjs`; it runs
an isolated local server and records actual downloads. The review renderer is
`scripts/render-kling-appearance-expansion.py`. See their arguments and the
capture records for source projects and reproducible file identities.

## Limits

The new materials are bound to these two approved characters and their selected
88/96 original poses. They do not automatically fit an arbitrary new character,
viewpoint or hairstyle. The compact bun follows the head rigidly; no secondary
strand animation is added. Original blur, extraction fringes, closed-eye speckles
and existing clothing-fold limitations remain. This batch does not add a new
face editor, new clothes or change the runtime drawing architecture.

At close range the male sideburn remains slightly blunt, and a small female
nape point is visible in the deepest landing crouches. These are retained in the
current review version; they are not presented as perfect strand-level results.

The complete appearance banks now download about 45.4 MB (male) and 47.1 MB
(female) when needed. They stay within the existing archive and page budgets,
but only 5.3/7.3 million decoded atlas pixels remain under the current per-bank
limit. Another similarly sized expansion needs a separate asset-loading/packing
decision rather than another unchecked append or a silent quality reduction.
