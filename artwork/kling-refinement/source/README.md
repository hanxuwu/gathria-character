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
