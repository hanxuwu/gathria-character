# Kling clothing fit polish

This batch refines the four existing everyday/wedding outfits on merged main
`c89e5add8d8b1a134e7cb3d7576c6370590cb57e`. It keeps the approved Kling heads,
body proportions, original source poses and action cadence. No new character
illustration replaces the video artwork.

## Changes and compatibility

The new male tops use separate `teal-camp-shirt-v2` and
`navy-suit-jacket-v2` IDs. The trousers, shoes, male registration and source pack
remain unchanged. The prior fitting treated dark pixels from the original tank
as garment edges, carrying its waistband and armpit creases into the jacket.
The new fitting distinguishes the external edge from interior tank ink, makes
the shoulder sampling transition more continuous and restores the jacket's
own lower contour. The casual collar receives a restrained horizontal fitting
adjustment; an experimental upward shift was rejected after native inspection.

The female dresses use new `coral-daydress-v4` and
`ivory-wedding-dress-v4` IDs. Their original painted hem is re-extracted without
discarding its dark outline as background. Sampling and shoe occlusion are
reviewed against the source poses rather than changing the legs or shoes.

Old garment archives, templates, source packs, registrations and previously
exported projects remain reproducible. Existing projects embed their selected
garments and do not silently upgrade. The current catalog offers the refined
versions in **Everyday** and **Wedding**. The unchanged male trousers and shoes
remain available for independent slot mixing.

## Open and inspect

- `/workbench.html?character=male&mode=wardrobe`
- `/workbench.html?character=female&mode=wardrobe`

Choose **Everyday** or **Wedding**, then enable **Compare original** and inspect
at **1× native** or **2×**. Use **Save wardrobe** for an editable project and
**Export CharacterPack** for an independently playable animation.

## Before baseline and evidence

The before material is the previous batch's actual production-UI export,
not a preparation sketch. [Baseline identities](baseline.json) bind those files
to the merged commit. Rechecking their hashes in this batch is distinct from
recapturing the original browser session.

[Evidence procedure](EVIDENCE.md) describes the new UI capture, save/reopen,
mixing, independent playback and decoded PNG/GIF/ZIP verification.
Current execution results and links will be recorded after the candidate freeze.

## Visual scope

Clothing remains fitted to the source pose bank. Strong bends can still compress
folds, and the shirt retains a neckline constrained by the original body artwork.
The goal of this batch is a visible improvement to the specific seams and hem
defects, not a claim of physically simulated cloth or final user acceptance.
Original motion blur, pose variation and whole-character mirrored left-facing
playback remain part of the source-based workflow.
