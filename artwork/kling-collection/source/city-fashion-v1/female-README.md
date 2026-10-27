# Female city, campus and retro clothing

This batch adds three painted designs for the existing Kling female character:

| Garment | Style and new painted details | Exact fit baseline |
| --- | --- | --- |
| City ink zip top | Urban charcoal utility top, silver zipper, ivory binding and chest pocket | `plum-pintuck-top-v1.zip`, top slot |
| Campus periwinkle dress | Cool periwinkle, ivory neckline and twin skirt piping, navy waist and broad pleat folds | `coral-daydress-v9.zip`, fullBody slot |
| Retro cherry check dress | Large cherry/ivory gingham, cherry binding and compact waist bow | `coral-daydress-v9.zip`, fullBody slot |

The utility top is an independently selectable separate and can be paired with
the existing ochre shorts. The dresses retain the existing sleeveless A-line
cut. These are new graphic/material constructions inside approved silhouettes,
not new body proportions, sleeves or skirt geometry.

## Generation and donor ownership

OpenAI image generation created `female-designs-initial.png` on 2026-10-27 from
`artwork/kling-appearance/source/female-reference.png`. `female-prompt.txt`
preserves that exact request. The initial retro bow was too large. A second
image edit reduced it and restored the large gingham beneath it; its exact
request is `female-bow-edit-prompt.txt`, and the unmodified result is retained
as `female-designs.png` (1774 × 887 RGBA).

Both generated images are design donors, not application exports. Generated
heads, faces, skin, limbs, hands, shoes and backgrounds are discarded. Only
explicitly hand-traced cloth RGB enters the new banks. `female-donors.json`
records garment boundaries, plain fabric regions and paint coordinates. It
also pins each item's own baseline path and slot. There is no color-based skin
removal; traced polygons delimit real donor artwork and never draw replacement
garment silhouettes.

## Preparation and invariants

`scripts/prepare-kling-city-fashion-female.py` imports the completed warm-date
sampler without modifying its source. Its reviewed skirt overlap behavior
prevents a flat torso-colored waist fin or a detached belt-end fragment. A
small bodice-only wrapper handles the utility top, with no skirt sampling.
The wrapper supplies new inputs, paths, metadata and per-item baselines.

For each garment, all 96 source frame IDs, atlas page geometry, crop rectangles,
offsets, source and registration bindings, binary ownership PNG bytes and every
decoded alpha byte match that item's baseline exactly. RGB changes only in
nontransparent pixels already owned by the baseline. The original character's
exposed head, face, hands, source anatomy, body proportions, anchors, action
order and timing remain unchanged. The runtime still renders local artwork.

Run from the repository root with Pillow, NumPy and SciPy installed:

```sh
python3 scripts/prepare-kling-city-fashion-female.py --prototype
python3 scripts/prepare-kling-city-fashion-female.py
```

`--item <id>` builds one garment. New archives and authoring review files are
initially written under `artwork/kling-collection/prepared/city-fashion-v1/female`.
Publication moves each new ZIP into `docs/kling-wardrobe/garments/female`, keeping
one archive copy. Existing source images, baseline banks and sampler files are
never rewritten.

The complete `asset-audit.json` records common input hashes, per-item baseline
paths/hashes/slots, all 288 pose assertions and output hashes. It also records
the unchanged shared sampler hash and the wrapper hash. Full generation asserts
exact alpha and unchanged source pixels outside ownership, then rechecks the
source and baseline byte hashes. Independent collection validation and actual
browser export evidence remain separate checks.

## Visual review and retained limits

The native offline PNGs and 12-pose contact sheets cover standing, walking,
crossed-arm and side running, raised arms, deep crouch, jump blur and recovery.
They show newly painted clothing fitted to real source pixels; they are labeled
offline authoring previews and are not presented as application downloads.
The utility contact sheet keeps original shorts so its top-only effect is clear;
the shipped outfit preset pairs the top with existing ochre shorts.

Prototype review found the utility zipper/pocket readable, blue twin piping
continuous, and retro checks large enough to avoid a tiny grid. The reduced bow
fits inside the fixed waist region. No new donor-skin strip was seen in the
reviewed arm/waist/skirt samples. The large checks still compress or stretch with
the source-bound fit in deep crouches. The existing V9 upper-skirt side shape
and compressed waist, source blur and protected neckline fragments remain.
These geometry limits are retained, not silently fixed through a new silhouette
or a redraw of the approved character. Prototype review is not user acceptance
of every animation frame.
