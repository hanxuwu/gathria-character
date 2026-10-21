# Male source-frame wardrobe registration

These are **authoring references for the existing Kling male sprites**, not recovered original skeleton data. Source artwork, frame order, durations, native 704 × 1056 dimensions, and attachment `(352, 998)` remain unchanged.

- `reviewed-poses.json`: native-coordinate authoring proposals from visual inspection of 23 representative source poses, ten additional lower-leg corrections after reviewing the complete walking/running sheets, and explicit far-arm occlusion notes. Its source ZIP SHA-256 prevents accidental reuse on another source pack.
- `registration.json`: all 88 distinct source frames, 17 landmarks per frame, and head / visible-hand protection polygons. `sourceFrame` is the original video frame number from the CharacterPack's derivation metadata. `sourceSha256` binds the exact source CharacterPack ZIP bytes.
- Visible landmarks between inspected keyposes use deterministic optical flow. The confidence and method fields identify these proposals. Hidden shoulders/joints remain inferred and receive lower confidence. Waist attachments use each frame's actual visible garment hem.

## Reproduce

Install the pinned dependencies in `scripts/requirements-kling-wardrobe.txt`, then run from the repository root:

```sh
python scripts/prepare-kling-wardrobe-male.py \
  --output /tmp/kling-wardrobe-male \
  --registration artwork/kling-wardrobe/registration/male/registration.json
```

The preparation command automatically finishes with `scripts/refine-kling-wardrobe-male-masks.py`. Its reviewed local contours and pixel regression probes are recorded in `reviewed-mask-corrections.json`, bound to the exact source ZIP and registration hashes. This refinement runs after registration creation so the approved registration bytes remain unchanged. It verifies the corrected source crops against the original ZIP, preserves the frozen head/hand polygons, and checks source shoe/cloth pixels plus a protected skin pixel.

The output contains source frame crops; native L8 binary `semantic/NNN-{tank,shorts,skin,shoes}.png` masks; `registration/NNN-{head,nearHand,farHand}.png` protection masks; and complete action contact sheets. Hidden hands may legitimately have an empty mask. The source sprites' original alpha must still be used for compositing; these ownership masks do not replace it.

The `skin` region includes the retained face and its internal features. Use the dedicated head / hand masks when adding sleeves or trousers; preserving **all** exposed skin on top would incorrectly reveal arms or legs through new clothing.

## Findings addressed during preparation

- The crossing forearm splits the tank into disconnected upper and lower cloth regions. Keeping only the largest component drops the neckline in some frames and the hem in frame 62. Both regions are retained with spatial and warm-gray material constraints.
- Hands and thighs separate the two visible shorts pieces in frames such as 39 and 87. Both pieces retain garment ownership.
- Pale eyes can resemble gray cloth. A source-derived head region excludes them from garment seeds before labeling, and the exported registration additionally protects the head.
- Warm shoe soles can resemble skin. Completion is local to the existing shoe upper and lower sole; exposed ankle skin above the upper midpoint is retained. No global skin-color deletion is used.
- Gray tank material can resemble pale shoes or narrow warm leg creases. Garment seeds have exclusive ownership, and disconnected tank pieces must retain sufficient torso width. This avoids shirt-hem pixels displacing a shoe and avoids stray leg pixels distorting the waist anchor.
- Dark outlines, including thick shoe soles, inherit their nearest visible material. Each source-visible pixel has one semantic owner; distant edge completions are recorded in the semantic index for review. This is proposed material ownership, not recovered original layers.
- Native brown-shoe review exposed warm shoe sides/soles classified as skin in several recoil and airborne poses. Reviewed source-local ownership contours correct thirteen affected frames; a small visible cloth wedge in frame 64 is also recovered outside hand protection. The actual warm forearm edge at `(290, 691)` remains skin. These are offline mask corrections, not repainting or global color deletion.
- Flow tracking can drift when a leg passes behind another. Reviewed per-frame corrections cover the affected recoil/passing poses rather than reusing a standing skeleton.

## Limits and review status

All five source actions and the complete garment-mask / anchor contact sheets were visually inspected during this batch. This is **not** a visual acceptance of every future garment. Flat source frames do not contain the unseen torso, limbs, fabric folds, or hidden original layer boundaries. Intermediate landmarks and occluded joints are still authoring estimates. The original source has soft motion-blurred ankle boundaries and occasional mixed skin/shoe pixels at hand contacts. These uncertain boundary pixels are retained; the review does not claim perfect semantic recovery at every antialiased edge. All 88 frames were additionally inspected with a brown-shoe material preview, including idle, walk, run, jump, and celebrate. Large sleeves, long trousers, or skirts need garment-specific silhouettes, occlusion checks, and whole-loop review; anchors alone cannot provide missing artwork or guarantee natural cloth motion.

This preparation does not alter or regenerate the approved source characters. It does not introduce a runtime drawing API or a runtime skeleton transformation.
