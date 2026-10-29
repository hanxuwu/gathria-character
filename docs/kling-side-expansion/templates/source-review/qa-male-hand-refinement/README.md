# Male jump hand refinement review

Actual dressed renders exposed gray tank crescents, a far-hand thigh patch, and upper-arm protection that blocked the shirt sleeve. The 20 source-bound proposals refine near hands 83–96 and 102–106, plus far hand 95. Explicit per-frame concave boundaries protect the visible fist/palm and a small wrist margin. They do not change anchors, head metadata, frame mapping, anatomy or source RGBA.

The 089/095/106 proximal images show frozen source, preceding protection and the final fist/palm boundary. The separate 095 far-hand image shows removal of the thigh overlap. Blue marks protection. All 19 native poses and the corresponding dressed comparisons were independently inspected. Frame 89's sleeve now covers the biceps, and the large old-tank bridges are removed. Blurred source fingers in 90–91 remain blurred.

`review.json` binds each polygon to source RGBA SHA and independently rasterized coverage counts. Full native crops and source overlays remain in `/tmp/side-expansion/qa/male-hand-refinement/`; all 19 clothed comparisons remain in `/tmp/side-expansion/templates/hand-refinement/{proximal-review-{00,04,08,12},last-five-review-{00,04}}.jpg`. The final actual UI export run remains a separate acceptance check.
