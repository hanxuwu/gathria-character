# Male hair and ear visual review

Reviewed on 2026-10-23 against the retained actual V3 exports from `d6a50f0`.
The new images come from the wardrobe's downloaded CharacterPacks using male
bank V4, not from the donor sheet or an offline fitting prototype.

## What was inspected

- All 88 exported poses for Soft crop / Chestnut / everyday and all 88 poses
  for Soft bob / Espresso / wedding. Every pose was compared with its matching
  old exported pose in native-size, 256 × 210 ear/head crops. This includes all
  16 run poses (51–66), the selected idle/walk poses, raised-hand poses, crouch
  and the full selected jump sequence.
- Enlarged actual PNG details for both styles at poses 0, 51, 55, 57, 62, 66,
  86 and 87, and full native-size character frames at 0, 57, 75, 86, 90 and 102
  for each look. The full views check the ear repair against the hair silhouette,
  original neck, raised sleeves/hands and shoulders.
- This is a framewise visual review, not a claim of real-time human playback
  approval. GIF decoding, timing, mirrors and the 20 standalone playback checks
  are separately recorded in [artifact-validation.json](artifact-validation.json)
  and the [browser record](evidence/final/evidence-index.json).

## Findings

The old Soft bob has an oversized open wedge behind the near ear in idle,
running and crouching. It is transparent background between the original ear
and the hair silhouette, rather than a patch of donor skin. The front-only
cutout omitted a continuous rear strand present in the donor. Tracking that
cutout more accurately could not restore the missing strand.

The new rear strand substantially closes that opening, and the modest front
overlap covers the upper-ear/scalp wedge. The visible ear still belongs to the
original face. Across all 88 bob poses, the added strand stays behind the ear,
head and sleeves; no new hanging curl or shoulder protrusion was observed.
The earlier offline version with a hanging lower curl was not used in these
exports. The run sequence keeps a consistent ear/hair relationship as the head
rises and falls. Crouch 86–87 and raised-arm 75 retain the intended foreground
hand/sleeve ordering.

Soft crop's change is smaller: the hair now overlaps the upper ear instead of
leaving the exposed scalp crescent and doubled contour. The checked sequence
does not introduce a new detached hair edge or alter the crown silhouette.

This is a visible improvement to the reported ear-window problem. It does not
make every boundary flawless: a small negative space beside the bob's outer
hair tip can remain, and source alpha edges can still produce fine light or
colored fringes. Those are distinguishable from the former large cutout.
No additional broad mask expansion is justified by this review.

## Pixel checks, separate from visual judgment

Both old/new packs were decoded independently for this review. Frame IDs,
complete animation metadata and anchors are identical. All 528 sampled
24 × 24 near-eye, far-eye and mouth squares (three per pose, two looks) are
RGBA-identical to their corresponding old exports. These samples verify the
features, not every pixel of the face. The separate artifact validator checks
every frame's pixels outside old/new selected-hair ownership; it reports zero
changes there. Hashes and this review's scope are retained in
[final-visual-validation.json](final-visual-validation.json).

## Remaining limits

The original video blur remains conspicuous in fast poses such as 89–90 and
100–102. Existing closed-eyelid speckles, green/purple extraction fringes and
raised-hand alpha fringes are still visible at native scale or enlargement.
Existing clothing folds/seams are outside this hair repair and were not
redrawn. Hair follows registered head motion without independent strand
animation. This batch's visual judgment is limited to these two male looks;
female pixels and assets were intentionally left unchanged. Final user visual
acceptance remains open.
