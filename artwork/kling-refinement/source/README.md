# Supplementary hair artwork and source-bound fitting

`pony-temple-donor.png` was produced by the OpenAI image editing tool on
2026-10-23 using the existing Ribbon pony portrait cropped mechanically from
`artwork/kling-collection/source/volume-v1/female-hair-design.png` (middle tile).
The request preserved the pony, ribbon, palette and drawing style, and replaced
only the long curl in front of the visible ear with a short, smoothly tapered
temple lock. The generated portrait is a donor, **not** the approved character.

Only its traced local hair region is registered into the released hair donor.
Generated face, ears, anatomy, neck and clothing are discarded. The released
crown/fringe and rear pony pixels remain outside that local supplement. Original
Kling face/ear pixels and source poses are never repainted. The small local
supplement uses premultiplied registration and a bounded blend into the old
donor; no global skin-color deletion is applied to the new strand.

An initial whole-front registration was rejected because source frame 96 clipped
the crown. The shipped method preserves the released crown and footprint.
Reproduction: `PYTHONPATH=/tmp/kling-wardrobe-python python
scripts/prepare-kling-temple-v4.py`. `--prototype` produces offline authoring
previews only; actual browser-export evidence is recorded separately.

## Supplementary jacket cloth

`crouch-jacket-donor.png` was produced by the OpenAI image editing tool on
2026-10-23 using frame 86 decoded from the actual application export
`docs/kling-wardrobe/fit-polish/exports/male-wedding.character.zip`.
The request was to soften the bent navy sleeves into believable fabric folds
while retaining the pose, cuffs, silhouette, face, body and clothing design.
The generator changed other pixels too; **only navy material inside the traced
arm regions is sampled**. Its body, face, lighting halo and background are not
used. The generated image is a supplementary donor, not a replacement frame.

The sample is registered using shoulder, elbow and wrist correspondences and
blended according to the source elbow bend, fading away at cuffs, shoulder joins
and outside ink. Original sleeve ownership, alpha and anatomy remain fixed.
A first attempt using rounded texture coordinates created conspicuous circular
folds and was rejected before any release. The supplementary painting gave the
better result; remaining cuff geometry is documented in the review.

The other three primary outfit revisions use the existing published artwork:
short-sleeve cut-plane coverage and small, continuous skirt-side allowances.
They do not use the generated jacket donor. Every new bank records its exact
baseline hash and processing method. No original clothing bank is overwritten.
