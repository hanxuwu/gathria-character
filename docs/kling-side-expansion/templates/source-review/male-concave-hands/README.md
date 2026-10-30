# Source contact contour refinements

The first tailored registration used conservative convex hand windows. Actual
clothed review revealed bridges through the gray tank at crossed forearms and
rectangular thigh protection under touching fists. These are source geometry
errors, so the separate tailored registration now uses explicit concave native
contact contours for the reviewed poses. Original source RGBA, head contours,
wrist guides and runtime protection rules remain unchanged.

The selected panels show frozen source, prior tailored clothing, and the same
clothing generated with the refined source contour:

- [Walk35: remove the thigh rectangle below the fist](035-source-prior-refined.jpg).
- [Run40: remove the tank bridge above the forearm](040-source-prior-refined.jpg).
- [Run44: preserve the observed hand ink and antialiasing](044-source-prior-refined.jpg).
- [Jump87: remove the tank-facing concave bridge](087-source-prior-refined.jpg).
- [Jump89: release the actual biceps from the hand mask](089-source-prior-refined.jpg).
- [Jump95: retain the fists while releasing tank and thigh](095-source-prior-refined.jpg).

All16 locomotion refinements were individually source traced. The right-facing
fist upper edges39–47 were checked against a narrow native source witness band;
a one-pixel outward guard retains observed ink and uncertain mixed edge pixels.
The final polygons contain every reviewed raw-trace and witness pixel after
rasterization with the existing pixel-center rule. This guard preserves the
concavity and does not grant garment ownership over actual hands.

The initial frame44 trial changed101 inspected warm hand-edge pixels and was
**rejected**. The retained guarded contour changes0 pixels in that same inspected
hand-edge region. Its earlier trial points and rejection are explicitly recorded
in `male-hands/concave-refinements.json`; the panels here use the final guarded
contour, not the rejected trial. This local witness check supplements direct
native review; it is not an exhaustive skin classifier or an anatomy claim.

Jump source blur, especially90–91, remains exact. A small mixed-color edge can
remain where the source itself blends hand ink and tank; those uncertain pixels
remain protected. Larger gray regions were removed only after direct source
review. The independent jump proposals and evidence are in
[the QA hand review](../qa-male-hand-refinement/README.md).

The full proximal near-hand boundaries83–96 were subsequently traced around
the visible fist/palm and a small wrist margin. Earlier window tops included
actual biceps and prevented sleeves from covering the arm. The final comparison
panels incorporate this additional source-reviewed correction; the original
head contours and all fitting anchors remain unchanged.

The last five jump poses102–106 receive the same full fist/palm and wrist
review. [Frame106 source / f6 registration / refined contour](106-source-f6-refined.jpg)
shows the remaining gray tank U removed; blurred finger ink at105–106 remains
protected. [The source-bound delta](last-five-review.json) verifies that only
those five near-hand polygons change from f6; every other region, head contour,
fitting anchor and source frame mapping stays exact.

The run39–48/55–56 entries above describe the earlier guarded candidate.
Actual UI review subsequently found warm gray tank contamination in its color
witness. The [final run contact review](../male-run-contact/README.md) supersedes
those12 contours using directly observed source boundaries and restores actual
distal hand pixels where the earlier mask was incomplete. Earlier panels and
local witness counts remain historical evidence, not the final run proof.
