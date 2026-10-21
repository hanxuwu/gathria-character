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
