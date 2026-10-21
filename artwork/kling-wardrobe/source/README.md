# Kling wardrobe garment sources

`outfit-designs.png` is an OpenAI image-generation tool output produced on
2026-10-21, using the existing transparent male and female native reference
images as visual references. It contains four **garment design references**:
teal cotton top / ochre shorts, navy wedding waistcoat / tailored shorts,
coral day dress, and an ivory wedding dress. This is not application output or
proof of animation quality.

The prompt requested the approved right-facing three-quarter chibi proportions,
short neck, clean warm outlines, soft shading, simple broad cloth folds, and
sleeveless garments. It explicitly excluded hair, hats, bouquets and new props.
Sleeveless designs let this first registered clothing library retain the
original upper arms, elbows, hands and all of their drawn poses. Long sleeves
will require their own complete registered patches; these items do not pretend
to provide them.

The tool was asked for transparency, but the result contains a tinted backdrop
and partial alpha. Preparation uses manually delimited **garment RGB only**;
none of that backdrop, generated head, face, neck, skin or limbs is used in the
runtime garments. Garment textures and silhouettes are masked separately.
Small areas hidden behind generated hands need cloth completion during
preparation. Such completion is derived artwork, not an extracted original
layer.

`scripts/prepare-kling-wardrobe-separates.py` samples the waistcoat's front-panel
details into the original frame-specific torso ownership masks. The teal top,
shorts and shoes are explicitly material/palette variants of the original
source contours and folds. They are not presented as newly drawn shirt,
trouser or shoe shapes. The dress preparation
script retains the original pose-specific bodice shading in a palette sampled
from the design, and registers the illustrated skirt per frame. Standing
neckline texture transfer was rejected because it produced shoulder artifacts.

The approved immutable base remains in `docs/kling-motion/exports/`. Registration
and garment archives are bound to its exact SHA-256 and source frame IDs.
Runtime composition is local integer RGBA replacement under explicit ownership
masks; no image API is called by the browser. Generated faces and bodies cannot
silently replace the accepted Kling characters.

See `docs/kling-wardrobe/FORMAT.md` for the actual editable project and garment
format, and the batch review for validation, exported evidence and remaining
visual limitations.

## Dress fitting revision 2

The existing design and clothing-only cutouts are reused without a new image
generation call. `prepare-kling-wardrobe-dresses.py --fit-revision=2` applies the
offline garment-only helpers in `kling_dress_fit.py`: a complete waist colour
transition, alpha compositing between overlapping cloth, and continuous side
clearance that rejoins the existing hem. The original body pixels and guides
are not transformed. Original garment ZIPs remain available; new versions use
`coral-daydress-v2` and `ivory-wedding-dress-v2` IDs. See the actual-export evidence
in `docs/kling-wardrobe/fit-v2/` for improvements and remaining limitations.

## Complete male outfits and female outline V3

[full-outfits-v1/README.md](full-outfits-v1/README.md) records the additional
OpenAI garment design sheet and exact prompt. Only manually delimited clothing
RGB is used; the generated character anatomy and tinted background are discarded.
`prepare-kling-male-tops.py` and `prepare-kling-male-trousers.py` bake all 88 source
poses with reviewed limb ownership. A new male registration/profile records
hand-boundary corrections; original registrations and archives remain frozen.

Female V3 reuses the existing source sheet. It keeps the V2 garment silhouette,
alpha and ownership exactly, preserving a narrow outer ink strip while
distributing clearance through interior fabric. No new female art generation
was used. See `prepared/female-dresses-v3/verification.json` in the parent
wardrobe directory for the per-pose audit.

## Clothing fit polish: male top V2 and female dress V4

This revision reuses both recorded design sheets without a new image-generation
call. The male correction limits preserved source ink to the external contour,
joins local shoulder material sampling and uses the traced jacket hem rather
than padded rectangular ownership. Female V4 re-extracts the existing painted
curves/lace and samples premultiplied colour/alpha to avoid background fragments.
Source anatomy, pose guides and registrations are unchanged. See the new
[male fitting record](../prepared/fit-polish/male/README.md) and
[female hem record](../prepared/dress-fit-v4/README.md); final acceptance uses
[actual application exports](../../../docs/kling-wardrobe/fit-polish/README.md).
