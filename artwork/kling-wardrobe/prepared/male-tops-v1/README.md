# Native male camp shirt and suit jacket

Reproduce with `python scripts/prepare-kling-male-tops.py` after building the
male full-outfit registration/profile. `catalog-items.json` records the final
two archives. `package-validation.json` records the written ZIP CRC, decoded
atlas pages and all 88 pose RGBA/ownership comparisons for each item.

The painted reference and exact image-generation prompt are retained in
`artwork/kling-wardrobe/source/full-outfits-v1/`. Only cloth RGB is sampled.
Source head, neck, hands, body pose and alpha remain authoritative. Clothing
ownership uses the reviewed visible limbs; short sleeves stop on the upper arm
and leave a returning folded forearm in front. Long sleeves keep the original
visible fist. Registered anchors remain immutable; local authoring axes do not
transform the character.

Donor padding uses plain fabric so skin, background and rose/ivory detail do
not stretch into unrelated cloth. The visible source hem determines vertical
fitting instead of repeating one donor row. Source shoulder crease darkness is
retained using cloth hue, preventing a brown skin ring within a sleeve.

The 14 native prepared poses and contact sheets are authoring diagnostics.
Use the actual UI exports and independent playback under
`docs/kling-wardrobe/full-outfits/` for implementation review. Folds remain fitted
from one painted reference rather than redrawn per frame. Conservative wrist
cuts and a tiny original underarm edge can remain; the suit follows the existing
arm/pelvis volume rather than adding a loose jacket silhouette.
