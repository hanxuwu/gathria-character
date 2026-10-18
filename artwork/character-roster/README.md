# Three characters through the same modular system

This batch begins at `38cfaa8` on `feat/character-roster-trial`, using the
existing humanoid skeleton, identity/wardrobe libraries and local renderer.
It adds everyday characters to test reuse across long trousers, shorts and a
rejected skirt trial. The original Theo and all historical artwork remain preserved.

## New and reused materials

| Character | New source illustration                                                        | Reused clothing                                                                        |
| --------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Ravi      | Curly head with three expressions; teal utility jacket and relaxed/active arms | Theo's registered bent trousers and shin-following shoes                               |
| Lina      | Rounded bob with three expressions; ochre pullover and relaxed/active arms     | Sage shorts and footwear, newly packaged with explicit ownership and shoe registration |
| Nora      | Auburn low ponytail with three expressions and separate rear hair              | Rose's blouse in ivory, Sage shorts in coral and Lina's following sneakers             |

The [source record](source/README.md) retains five original tool outputs and
their exact prompts/hashes, including the rejected Ravi expression revision.
No image service runs in the browser. These are source illustrations rather
than substitutes for actual assembled-character evidence.

## Preparation

```sh
node scripts/prepare-roster-tops.mjs
node scripts/prepare-character-roster.mjs
```

Run from the repository root with the existing Node/Chromium environment.
The top script extracts only each garment's named parts, creates explicit
skin/fabric/fixed-color masks and registers the original arm landmarks. Lina's
stray ivory shoulder bands are excluded through local ownership polygons;
Ravi's undershirt and exposed upper-chest pixels have separate materials.

The character script registers complete expressions to a common neck point,
assigns Nora's ponytail to rear hair, builds portable identities, and combines
them with the new tops and retained lower garments. Existing Sage crop seams
are repaired only in the new derivative: misplaced hoodie pixels and duplicated
footwear pixels do not belong to its waist or shin. Shoe source axes are measured
from their own artwork. They are not copied from Theo merely because the rig ID
matches.

`prepared/tops/registration.json` and `prepared/registration.json` record source
regions, ownership, joint coordinates, archive roundtrips and pose checks.
`prepared/iterations/original-motion/` retains the initial attempts with Theo's
unmodified motion. Some shorter-leg run poses are intentionally unrenderable;
these files diagnose reach/support limits and are not finished playable packs.

The final registered files are in `prepared/projects`, `prepared/identities`,
`prepared/tops` and `prepared/garments`. Each project has its own bounded clothes
library and the three identity options. The design board's clothing is a style
reference: reused final garments can differ in cut and decoration.

Ravi retains Theo's original run. Lina and final Nora save a compact profile
with foot excursion scaled to 85% and foot lift to 95%; no body lowering is
retained. Nora's Rose skirt/flats did not support every run pose under the
following-shoe contract. Failed attempts remain in `prepared/iterations`;
they are not complete playable animations.

Actual application exports, independent playback, precise motion adaptation
and remaining limitations are documented in
[`docs/CHARACTER_ROSTER_REVIEW.md`](../../docs/CHARACTER_ROSTER_REVIEW.md).
