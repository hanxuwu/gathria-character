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
cloth allowance extends only into transparent space.

The trouser-only source-surface check rejects disconnected shoe-sole and matte
fragments that the shared semantic skin mask had assigned to a leg. A retained
four-connected leg/shorts surface must contain either a connected warm source
skin core of at least 80 pixels (`R > 150`, `G > 75`, `R - G > 24`), or continuity
with a connected source-visible registered shorts core of at least 80 pixels.
This uses original source pixels and semantic ownership, never donor color.
Unsupported leg fragments stay source-exact before adding the three-pixel
transparent cloth allowance. The existing rule preserving source components
smaller than 20 pixels still applies to remaining candidate material. No shared
limb helper, registration, head/hand protection, source pose or top changed.

`source-fringe-exclusions.zip` contains all 88 native binary exclusion masks;
`source-fringe-exclusions.json` records their SHA256 hashes, source pixel hashes,
component bounds, and connected-core evidence. Re-running the preparation
script regenerates both. `footwear-fringe-fix.json` compares decoded new trouser
patches and ownership against commit `44d346b`, records exact changed frame and
pixel counts, and checks that ownership only shrinks and unrelated pixels stay
identical. The visible rear-leg wedge in frame 64 remains clothed.

The two full banks contain all 88 source frames each. Ownership audits protect
head/neck/hands and leave original arm/shoe surfaces unchanged. The prepared
PNGs are authoring diagnostics, not application-export evidence. Actual UI
exports, standalone playback, native comparisons and GIFs live in
`docs/kling-wardrobe/full-outfits/`.

Limits: these are fitted painted folds, not per-frame hand-redrawn cloth or
physical simulation. Extreme bends compress or redistribute fold detail; the
pants follow the existing source legs instead of replacing their proportions.
Original blur and mixed matte edges remain. Frame 64 retains a small angular
cuff point where it joins the existing connected lower-leg contour; this repair
removes detached under-shoe islands without redesigning that source pose.
Technical checks do not establish user visual approval.
