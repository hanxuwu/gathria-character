# City, campus and retro — source artwork

Six new clothing designs for the approved Kling male and female characters: one male/female pair for each of urban utility, clean campus and retro styling. OpenAI image generation on 2026-10-27 supplied the painted clothing donors, using the existing transparent `artwork/kling-appearance/source/male-reference.png` and `female-reference.png` as identity and proportion references. The prompts, donor sheets and cloth-only traces are retained in this directory.

The generated sheets are **artwork donors**, not application exports. Generated heads, skin, limbs, trousers, shoes and backdrop are discarded. No new face, source pose or skeleton replaces the approved characters. Existing released hairstyles, expressions, bottoms and shoes complete the recipes in [looks.json](looks.json).

The male designs are an ivory utility zip shirt, sky-blue striped knit polo and burgundy/ivory bowling shirt. They preserve every reviewed Teal V5 alpha/ownership pixel across 88 source poses. The female charcoal utility top preserves the repaired Plum V1 separate-top contract; the periwinkle piped dress and cherry gingham dress preserve Coral V9 across 96 poses each. Baselines and their exact hashes are declared per garment in the recipes and audits.

Painting is fitted in RGB inside those existing garment domains. Explicit traces exclude donor skin and hands. Covered clothing is completed from neighboring cloth; those areas are authored approximations, not original layers extracted from the videos. The cherry dress's initially oversized bow was reduced in a second image-generation edit. The male polo's two broad painted stripes are continued across the bounded cloth sampling padding so they do not stop abruptly at its sides.

Preparation entry points reuse the unchanged, reviewed warm-date processing modules:

- `scripts/prepare-kling-city-fashion-male.py`
- `scripts/prepare-kling-city-fashion-female.py`
- `scripts/publish-kling-city-fashion-collection.py`

The female wrapper selects the baseline per item and uses a bodice-only sampler for the separate top. The dress sampler retains the previous waist-overlap and hem fitting. This collection adds construction detail to established cuts, not new sleeve geometry, skirt physics or runtime AI calls. The original five-action timing and registrations remain authoritative.

Prepared audits record source bindings, hashes, geometry, ownership and alpha checks. Final visual review uses exports from the actual wardrobe and independent player, separately from these donor sheets and offline fitting prototypes. See [the collection delivery](../../../../docs/kling-collection/city-fashion-v1/README.md).
