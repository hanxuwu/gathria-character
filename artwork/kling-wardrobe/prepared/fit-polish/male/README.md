# Male top fitting V2

Reproduce with `python scripts/prepare-kling-male-fit-polish.py`. Add
`--preview-only` to inspect the fourteen difficult poses before writing the
complete two 88-pose garment banks. The new IDs are `teal-camp-shirt-v2` and
`navy-suit-jacket-v2`; the V1 archives and preparation scripts are not overwritten.
The final catalog metadata is in `catalog-items.json`.

## Actual baseline and causes

Before editing, native UI exports from
`docs/kling-wardrobe/full-outfits/exports/` were inspected, especially male
standing source0 and crouched source104. The standing/crouched jacket carried
a second horizontal dark waist line; its near armpit had an angular inner seam.
The shirt collar was wide and flat, and its near armpit retained an old skin
crease underneath the donor sleeve material.

- The old torso fitting retained **every dark source tank pixel**, including
  the old tank's interior hem line. That line did not belong to the new jacket.
- The torso and sleeves had separate hard UV domains. The source's bare-arm
  inner crease was additionally treated as cloth outline; this created the
  triangle-like armpit seam.
- The jacket's extra hem covered a blanket strip of original shorts, extending
  28 native pixels past the waist guide. Padded donor material was repeated
  outside the reference jacket's real curved hem and open centre.
- The camp collar's broad donor design was fitted to a fixed round source
  opening. Moving it upward made the shoulder-neck fold sharper rather than
  improving the collar; that first-iteration choice was rejected.

## Final changes

Only original **external body-contour** ink is retained inside replaced cloth;
the old tank hem and bare-arm interior line are replaced by the recorded cloth
artwork. Shoulder UV transitions blend over a 28-pixel band only in the local
shoulder neighbourhood. Elbow material coordinates blend across the shared
joint, avoiding the previous nearest-segment cut. This does not blur the whole
garment or move any source anatomy.

The camp collar is narrowed by a modest, smoothly weighted horizontal sampling
adjustment. Its height, original neck and owned outline remain unchanged.

The jacket's extra hem is limited by the **manually recorded original donor
outline**. Pixels outside the actual jacket tails are no longer owned by the
top, so the selected trousers appear there. The actual donor edge supplies the
curved hem line. Ownership never expands beyond V1, original tank coverage is
retained, and alpha is exact for every retained owned pixel. Trousers, shoes,
registration, authoring anchors and runtime composition order are unchanged.

## Source and processing provenance

All clothing RGB still comes from the unchanged development-time OpenAI image
in `artwork/kling-wardrobe/source/full-outfits-v1/designs.png`; its original
prompt, date and limitations are documented alongside it. No new image was
generated for this fitting correction. Generated anatomy is not used. The script
reuses the documented cloth-only donor boundaries and source-bound limb masks,
then packages deterministic per-pose patches for browser-local replacement.

`ownership-audit.json` records changed clothing RGB, removed padded hem pixels,
zero newly owned pixels, original owned alpha and zero protected-pixel changes.
Saved projects retain embedded V1 assets; these V2 items are explicit new files.

## Review evidence and limits

The `*-comparison-native.png` images here are **offline authoring diagnostics**,
composed in the same ownership order as the application. They compare the merged
V1 top with the V2 candidate on unchanged source/pants/shoes. Final UI exports
and independent-player evidence belong in `docs/kling-wardrobe/fit-polish/`.

`iteration-1/` retains four native boards, its audit and exact preparation-script
snapshot. Round 1 removed interior source lines and improved shoulder joins but
its raised collar was visually inferior. Round 2 restored collar height and
limited jacket tails to their real artwork boundaries. The second candidate is
the selected final version; this is not user visual approval.

Deep crouches retain dense source-donor sleeve folds, and some jacket/vest detail
is compressed to the approved source torso. The shirt still follows the source
round neck opening; an open V with additional visible skin would require a
separately authored and approved neckline. The source-sized sleeves are not a
loose jacket silhouette. These limits remain despite improved seams and do not
imply that every frame is aesthetically finished.
