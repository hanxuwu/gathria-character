# Casual collection V1 — clothing donor provenance

Generated on 2026-10-23 with the OpenAI image generation tool. Inputs were
`artwork/kling-appearance/source/male-reference.png` and `female-reference.png`.
The original generated PNG is preserved as `designs.png` (2172 × 724 RGBA).
It is a **design donor**, not the application output or original video layers.

The request specified four right-facing standing characters on transparent
background: cream camp-collar shirt with dark trousers, forest work shirt with
ochre chinos, mist-blue button-front sleeveless dress, lavender pleated dress
with a plum waist bow. It requested the original warm 2D ink/shading, short
neck/limbs, arms clear of the clothing, no props, no new hair, no ground shadow.
See `prompt.txt` for the generation instruction.

Only the two new shirts and two dresses enter the prepared banks. New male
presets reuse the existing registered navy trousers / ochre chinos and shoes.
No generated head, body, hands or footwear replaces any Kling source pixels.
The model did overlap the dress sides with its hands; those occlusions are
completed using neighbouring donor cloth inside the recorded garment polygon.
These completions are derived artwork, not recovered hidden video information.

`donors.json` records cloth boundaries, texture axes, sleeve widths and waist /
hem registration. `scripts/prepare-kling-casual-collection.py` applies the
existing male V2 and female V4 fitting rules to every original source pose.
The original head, exposed limbs, anchors and action timing stay unchanged.
Nearest-cloth extrapolation is softly filtered outside the donor clothing only,
preventing striped shirt sides and angular neckline wedges. Actual inner cloth
pixels are retained. The new dresses transfer painted bodice details as well as skirt folds;
their neckline still follows the source tank silhouette. Clothing is prepared
offline and rendered locally, without a runtime image-generation call.

The saved banks use new IDs. Previous clothing and appearance ZIPs are kept
byte-for-byte; `docs/kling-wardrobe/casual-collection/baseline-hashes.json`
records the starting inputs. Asset audits record the donor hash and every pose.

Run preparation with Pillow, NumPy and SciPy installed:

```sh
python3 scripts/prepare-kling-casual-collection.py --prototype
python3 scripts/prepare-kling-casual-collection.py
python3 scripts/build-kling-wardrobe-catalog.py
```

The source banks are a per-pose 2D fitting approximation. Crouched folds can
compress, the source's tank opening limits collar shapes, and skirts do not
have simulated weight. The application export review is the visual evidence;
this attractive donor sheet alone is not evidence of successful fitting.
