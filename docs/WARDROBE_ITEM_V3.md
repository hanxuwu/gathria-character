# Source-relative clothing colors

Wardrobe item V3 preserves the authored color variation of new clothing at its
declared source palette. This fixes a visible mismatch between full-color custom
heads and garments whose historical recoloring transform altered the source
colors even when the source palette was selected.

## Opt-in contract

Use `format: "gathria-wardrobe-item"`, `version: 3` and the required
`colorModel: "source-relative-v1"`. All existing ownership, registration, PNG,
mask, palette, library-size and archive checks still apply. The three supported
groups remain `top`, `bottom` and `shoes`.

A top may include the existing explicit `actionForearms` map and its paired
active forearm attachments. A top without that map uses its ordinary forearms.
Bottoms and shoes cannot include the map or arm attachments. Unknown color
models and incomplete pairs are rejected before installation.

At a part's declared palette color, visible material pixels retain their
authored RGBA. At another color, the renderer adds the difference between the
target and source shading transforms to the authored RGB. Moving a color picker
one channel away from the source therefore does not switch rendering models.
Fixed material zero and alpha remain unchanged by recoloring. Geometric shoe
fitting, joint overlap and pose sampling still occur during assembly/rendering;
source-color preservation does not mean every posed pixel is an untransformed
copy of the source PNG.

## Compatibility

V1 and V2 items retain their previous recoloring results. Selecting, reopening
or saving an old item does not upgrade it. V1, V2 and V3 items can coexist in one
library, and each uses its own declared behavior.

Identity, recipe, skin, project and CharacterPack versions do not change for
this addition. Editable projects embed the V3 source items; older application
revisions reject those unsupported items. A baked CharacterPack contains the
ordinary PNG and animation metadata and plays without clothing libraries or
the new color implementation.

The [Theo complete-figure study](THEO_POSE_STUDY_REVIEW.md) exercises the new
contract with actual UI exports. It does not upgrade the original Theo/Rose
projects or the frozen catalog.
