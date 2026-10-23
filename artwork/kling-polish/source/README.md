# Supplementary cloth and crown painting

Authoring date: 2026-10-23. All three PNGs were made with the OpenAI image-generation
tool as edits of existing project artwork. They are supplementary authored art,
not extracted video layers or application export evidence.

| File | Input and requested change | Used region |
| --- | --- | --- |
| `crouch-waist-donor.png` | Actual V5 coral export `docs/kling-refinement/evidence/primary-fit-v3/female-female-day-after-86-right.png`; continuous compressed waist, soft folds, same pose | Explicit clothing polygon around the waist only; generated anatomy, shoes, hem and backdrop/glow are discarded |
| `airy-volume-donor.png` | Existing `airy-tousle-hair-front-cutout.png`; broad rounded bundles, upper-left highlights and occlusion shadows | Interior crown colour, original silhouette/alpha and lower temple retained |
| `pony-volume-donor.png` | V4 front attachment reconstructed by `prepare-kling-temple-v4.py`; fuller bundles with less small streaking | Interior crown colour only, V4 temple and rear pony unchanged |

The generation request explicitly retained the existing geometry. Generation is
not trusted to preserve it: the preparation scripts enforce source ownership,
original alpha and existing transformations when assembling the new candidates.
Generated donor skin is never copied onto the approved character.

Reproduce with `scripts/prepare-kling-waist-v6.py` and
`scripts/prepare-kling-sculpted-hair.py` using
`scripts/requirements-kling-wardrobe.txt`. Scripts record SHA-256 provenance in
the new banks. Old archives remain unchanged.

Waist attempt 1 extended flat cloth beside the previous outer line and sampled
too much of the donor's edge. Its new dark fold was rejected; the retained
attempt resamples the short outer cloth band as a whole and applies lower-strength
interior folds. `../prepared/rejected-waist-1` preserves the comparison.
Prepared previews are labeled OFFLINE. Application evidence is in
`docs/kling-polish/evidence` and its review folder.
