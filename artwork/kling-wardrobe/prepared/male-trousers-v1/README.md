# Native male long-trouser pose banks

Generated offline with `python scripts/prepare-kling-male-trousers.py` from
`source/full-outfits-v1/designs.png` (relative to the wardrobe artwork directory).
The exact tool prompt/output and source use boundary are preserved there.

`donors.json` records the clothing-only contours and hip/knee/ankle coordinates
inside the painted reference. The source-matched leg owners come from
`kling_male_limb_ownership.py` and the separately versioned full-outfit kit.
The 17 original registered source guides and source pixels remain unchanged;
local garment-authoring adjustments affect only the garment texture mapping.

The sampler excludes generated skin/shoes/background and extends interior
cloth, not outline or footwear pixels, at irregular donor cuffs. Continuous
coordinates around the knee avoid a hard upper/lower-leg material cut. The
visible source hip width determines the pocket/waist texture field, preventing
clamped donor-edge bars. Crossed legs retain source surface ownership. A small
cloth allowance extends only into transparent space; detached source matte
flecks are not grown into colored clothing islands.

The two full banks contain all 88 source frames each. Ownership audits protect
head/neck/hands and leave original arm/shoe surfaces unchanged. The prepared
PNGs are authoring diagnostics, not application-export evidence. Actual UI
exports, standalone playback, native comparisons and GIFs live in
`docs/kling-wardrobe/full-outfits/`.

Limits: these are fitted painted folds, not per-frame hand-redrawn cloth or
physical simulation. Extreme bends compress or redistribute fold detail; the
pants follow the existing source legs instead of replacing their proportions.
Original blur and mixed matte edges remain. Technical checks do not establish
user visual approval.
