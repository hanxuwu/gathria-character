# Plum pintuck blouse — one female separate-top review candidate

One OpenAI image-generation edit was made on 2026-10-26 from the approved
[`female-reference.png`](../../kling-appearance/source/female-reference.png).
[`prompt.txt`](prompt.txt) is the exact request;
[`generation.json`](generation.json) records reference, prompt and raw output
hashes. [`plum-pintuck-donor.png`](plum-pintuck-donor.png) preserves the untouched
1024 × 1536 RGBA result. It is development artwork, not an application export.

The requested transparent output includes a translucent tinted halo. Preparation
discards all generated alpha, background, face, head, skin, limbs and footwear.
Only the explicitly traced blouse RGB enters native pose paint. The donor's
standing ivory binding did not follow the moving source openings, so the first
refinement omitted that binding. The prepared design keeps the painted plum
fabric, three cream buttons and pintuck seams, with compatible plum binding.
No second image-generation call was used.

The original female character remains the exact 704 × 1056, 96-pose source at
`docs/kling-motion/exports/female.character.zip`, with anchor (352, 998). Its
five action schedules, source positions, anatomy and alpha remain unchanged.
The old template, registration, teal top, waistcoat, shorts and projects are
not rewritten. The blouse is a separate `top`, compatible with both existing
navy and ochre shorts. It is a review candidate, not a new default outfit.

## What the template reuses

The released female teal top supplies complete frame IDs, native crop bindings,
binary ownership and source alpha. The frozen registration supplies neck,
shoulder and sloped waist guides plus strict head/hand protection. A separate
cloth-paint map uses the visible neckline contour because the source neck
landmark moves onto the chin in crouched poses. These paint controls do not
change the source landmarks; every pose's controls are recorded in
[`complete-audit.json`](../prepared/complete-audit.json).

[`donor-registration.json`](donor-registration.json) records the cloth trace
and mapping. The generated buttons, seams and fabric are sampled within each
pose's visible cloth. Source broad creases and dark cloth boundary ink are
retained. The source forearm can split the blouse into disconnected islands;
the complete pose ownership resolves that occlusion. All 96 native paintings
are explicit, hash-bound `poseOverrides` in the reusable recipe, including
the crouches, side-on run, jump apex, landing and raised-arm poses.

This demonstrates reuse of an existing sleeveless contour. A standing donor
does not automatically solve different sleeves, a new neckline, a loose hem,
or hidden anatomy. Those changes would need new pose-specific artwork and
ownership. The shared recipe/import validators were not loosened.

## Three local ownership repairs

The first preview exposed old segmentation gaps. The additive authoring
derivative includes only visible original cloth inside the explicit polygons
in [`ownership-repairs.json`](ownership-repairs.json):

| Source pose | Added pixels | Reason |
| --- | ---: | --- |
| 62 | 1,863 | Lower gray tank island below the crossing forearm |
| 102 | 106 | Small blurred cloth strip inside the left armhole |
| 112 | 148 | Side cloth wedge behind the lowered near hand |

Source RGB/alpha supplies the authoring derivative's added pixels. No added
ownership intersects either bottom bank or strict protection. The 25 candidate
pixels at pose 62 that fall inside protection remain untouched. The other 93
poses retain the exact old native crop/frame mapping. Only the three repaired
crops move to a small appended atlas page; unused old crop rectangles are cleared.

The derivative is authoring input, not an additional wardrobe choice:
[`female-sleeveless-authoring-v2.zip`](../prepared/female-sleeveless-authoring-v2.zip).
The final [`plum-pintuck-top-v1.zip`](../../../docs/kling-wardrobe/garments/female/plum-pintuck-top-v1.zip)
is built through the existing strict recipe mechanism using that derivative.

## Visible constraint that remains

Original gray neckline pixels inside frozen head protection remain visible in
poses **89, 90, 93, 101, 102 and 103**, especially the blurred landing poses
101–103. This is a demonstrated template limitation, not a solved neckline.
The final blouse does not recolor those protected pixels or disguise the
problem with a new trim shape. Source motion blur and fringe also remain.

[`protected-neckline-limits.png`](../prepared/protected-neckline-limits.png)
compares native original, released teal top, new candidate and head-protection
overlay at 2×. The accompanying
[`JSON`](../prepared/protected-neckline-limits.json) records exact unchanged
RGBA probes and crop coordinates. For example, pose 101 (390, 525) and pose
103 (445, 660) are inside the existing protected region and remain source exact.

## Reproduce and check

Requires Pillow, NumPy and SciPy. This session used
`/tmp/kling-polish-venv/bin/python`; that path is not a runtime dependency.

```sh
python scripts/prepare-kling-female-top.py --prototype
python scripts/prepare-kling-female-top.py --output /tmp/plum-pintuck-rebuilt.zip
python scripts/verify-kling-female-top.py
python scripts/render-kling-female-top-review.py
```

The preparation script refuses to overwrite an existing output archive.
[`plum-pintuck-recipe.json`](../prepared/plum-pintuck-recipe.json) can also be
built directly with `scripts/build-kling-garment-variant.py`; its result is
byte-for-byte the published review candidate.

[`verification.json`](../prepared/verification.json) independently decodes all
96 poses and both 96-pose bottom combinations, checks source alpha, unchanged
pixels outside selected ownership, protected head/hands, exact unaffected
crop records, the three bounded cloth additions, explicit blocked probes and
an exact recipe rebuild. `action-*-torso.jpg` and `action-*-full.jpg` in the
prepared directory cover all 96 distinct poses. These are offline composition
reviews; actual application save/reopen and CharacterPack export evidence is
recorded by the integration work separately. Passing the pixel checks does
not claim the protected neckline limitation is visually resolved.
