# Final run hand contact review

The final male registration is
`7fa05a051d6dc1aa7184aaf484f82bb512042d276189606eee9da366d65cb43e`.
Compared with the historical c41 candidate, only the near-hand polygons at
frames39–48,55,56 change. Source pixels, all head contours, all17 fitting anchors,
and every other protected region are exact. Female remains frozen.

Actual UI review found a clear old-tank wedge above run40's fist. An earlier
color-assisted witness had mistaken warm gray tank pixels for hand pixels. The
final source-observed contact contours supersede that witness; no color deletion,
recoloring, source resynthesis or runtime permission change is used.

Selected native source / c41 / corrected dressed comparisons:

- [Run40: the broad tank wedge is removed](040-source-c41-refined.jpg).
- [Run43: actual distal finger and palm ink is fully protected](043-source-c41-refined.jpg).
- [Run56: visible thumb/palm coverage is restored](056-source-c41-refined.jpg).

All12 native overlays and three dressed contact sheets were independently
reviewed. Frames41,42,44,45 use minimal source-traced proximal upper-edge splices,
retaining the existing distal contour exactly. Frame43 also encloses every source
alpha pixel in the inspected hand-only window x300–344,y435–504; the c41 contour
had missed part of the true fingertip and lower-palm edge. Frames48,55,56 restore
source-confirmed palm/thumb/little-finger pixels previously outside protection.
The rejected earlier frame44 trial is not used.

A narrow blended gray/ink edge remains at some contacts. It is a conservative
source antialiasing margin, accepted in native review; it is not described as
perfectly separated anatomy or a completely recolored edge. The broad tank
wedges are removed while actual hand ink and soft source pixels remain intact.

[Source-bound before/after coordinates and exact delta](review.json) accompany
`artwork/kling-side-expansion/templates/source-review/qa-male-run-boundary-refinement.json`.
The existing consolidator applies this final packet after the earlier historical
hand proposals. Full native overlays and temporary dressed renders remain under
`/tmp/side-expansion/templates/hand-refinement` and
`/tmp/side-expansion/qa/male-run-refinement`.
