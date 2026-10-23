# Visual review of the four new outfits

This review concerns actual application PNG/CharacterPack exports. The generated
design sheet is an authoring input, not evidence of runtime appearance.

## Inspected

- The four standing exports at their native size, the compact lineup, and the
  integer-scale collar/cuff/waist/hem crops.
- All 16 exported run poses (source frames 51–66) for each of the four outfits.
- Representative stride, crossed-arm, raised-arm and deep-crouch poses, including
  matching before/after exports for the padding correction.
- Both directions are delivered as GIFs. Automated checks additionally compare
  an actual left/right PNG pair for each look and decode every delivered GIF,
  including frame timing. That is separate from visual judgement.

## Findings

The cream and forest shirts have distinct painted collars, buttons and pocket
details. The mist-blue dress retains its button front, while the lavender dress
has a separate pleated silhouette and plum bow. The existing trousers/shoes are
identified in the collection README rather than presented as new assets.

The first export showed horizontal bands in extrapolated male shirt fabric and
angular padding at the blue neckline. Smoothing only the extrapolated cloth
field improves these areas in the matching exported comparisons; inner painted
details remain intact. No new detached cloth fragments were seen in the reviewed
run poses. The numerical ownership checks separately cover all 368 exported
native frames and protect the unchanged source pixels outside selected layers.

## Remaining limitations

- Deep crouches still produce a hard concave turn at the female side waist and
  compress the skirt folds. The garment follows source pose registration rather
  than a cloth simulation.
- Large arm raises can make the short sleeve edge angular; the original arm
  contours and tank opening limit the current sleeve/collar fitting.
- Source video blur, extraction fringes and existing appearance-layer defects
  are outside this new-clothing batch and remain visible in some poses.

The batch is ready for review, not a claim of user visual acceptance or perfect
art in every frame. Functional/export test results are recorded separately in
`technical-checks.json` and `artifact-validation.json`.
