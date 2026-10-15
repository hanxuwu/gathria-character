# Detailed artwork production inputs

These two transparent illustration banks were created for this project with OpenAI's image generation tool on 2026-10-15. They are AI-assisted production inputs, **not application export screenshots**. User-supplied references guided the Japanese chibi proportions, warm shading, hair curls and layered bridal clothing; the reference files are not included here.

- `body-bank.png`: neck-down bodies, three columns by two rows. Top: hoodie/trousers, casual jacket/shorts, puff-sleeve top/skirt. Bottom: wedding suit/trousers, full wedding gown, lace bodice/shorts. Clothing and limbs are extracted separately so users can combine options freely.
- `portrait-bank.png`: heads/hair, two columns by two rows. Top: long chestnut curls, silver short crop. Bottom: dark bob, swept crest. Silhouettes cross nominal cell boundaries, so preparation uses explicit masks rather than uniform grid cropping.

The source images contain partial alpha at illustration edges and near-transparent background RGB. Preparation thresholds alpha into clean binary transparency and samples native pixels without smoothing. Source crops, anatomical material masks and overlapping joint cuts are recorded in `scripts/prepare-illustrated-assets.py` and `scripts/prepare-illustrated-portraits.py`; `scripts/prepare-illustrated-assets.mjs` is the entrypoint. The prepared, compressed RGBA/material layers are committed in `src/core/illustrated-assets.generated.ts`. Rebuilding requires Python 3 with Pillow and NumPy, not access to an image model.

Runtime V3 composition uses 192×256 frames and anchor (96, 240). There is no runtime network service, random generation or AI call. See [artwork provenance](../../docs/ASSET_PROVENANCE.md) for reuse terms and [the review](../../docs/ART_V2_REVIEW.md) for actual exported evidence. The banks and project-generated artwork are distributed under the repository's MIT License, to the extent rights are held by the contributors.
