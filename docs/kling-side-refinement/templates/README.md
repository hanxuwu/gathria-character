# Reusable native fitting review templates

The prior painting kit is bound to one exact garment. This iteration adds a small
JSON **review template** that can be reopened on another worn garment for the
same character, same source revision, same registration, and same clothing slot.
It reuses a list of difficult native poses and their canonical alignment guides.
It does not fit a new standing illustration or transfer the old garment's shape.

## Workflow

In **服装校正 · 锚点与遮挡**, export the current pose and its neighbors as a fitting
template. Change to another compatible garment, reopen the JSON, inspect its
mapped poses, and export a target painting kit. The kit contains that target's
actual pose PNGs and binary ownership masks. Repaint with the established painting
workflow and review the candidate before applying it as a new item.

A template holds at most eight unique pose IDs. Repeated animation IDs remain
intentional holds in the action metadata. Walk/run/idle loop flags are retained;
jump stays a one-shot. Selecting a few difficult poses does not claim coverage of
an entire new outfit's animation.

## Reused and garment-specific information

| Reused exactly from the native character                    | Remains specific to the target garment            |
| ----------------------------------------------------------- | ------------------------------------------------- |
| Source and registration SHA-256, character identity         | Painted clothing pixels and alpha                 |
| Native width/height and right-facing coordinates            | Binary ownership mask and silhouette              |
| Selected source frame IDs and full action ordering/timing   | Sleeve length, collar and hem shape               |
| All 17 canonical anchors, with visibility/confidence/method | Reviewed hand protection and neckline permissions |
| Canonical head/hand protection polygons                     | Cloth folds and any new hidden-body artwork       |

Top, bottom and full-body templates cannot be exchanged. Male and female bodies
cannot share templates. An older registration is rejected even if the source
video matches. Canonical guide coordinates and protected polygons must match the
currently loaded registration exactly; changing the JSON cannot relax protection.

A donor name and hash record which garment the checklist came from. They are
provenance labels, not an imported donor package or a grant to copy its exceptions.
Target guides derive protection from the actual target manifest. No donor mask,
hand exception, neckline profile, source warp or timing edit is applied.

## Existing formats remain compatible

The JSON has a separate `gathria-side-fitting-template` version-1 format. It is
not a saved wardrobe project or playable CharacterPack. Applying it only chooses
review references. The target kit uses the **existing** `gathria-garment-recipe`
version-1 format and is accepted by the existing strict painted-pose importer.
No CharacterPack, garment or wardrobe project schema changes are required.

The existing browser painting round trip allows RGB-only edits inside target
ownership, retaining every alpha value and mask. New silhouettes and sleeve
lengths still require the full artwork and ownership workflow. Current source
body art and canonical anchors are never mutated.

## Checks in this iteration

`src/side-view/fitting-template.test.ts` uses valid, small source and garment ZIPs,
with deliberately different donor/target artwork, ownership and hand reviews.
It checks native-template roundtrip, real target-kit import/rebuild, preserved
source objects, incompatible-body/slot rejection, tampered guide/timing rejection,
size bounds, unique pose limits, and cancellation. The real-character audit is
recorded separately in `verification.json`; no historical test counts are reused.

Current result: **7 scoped tests passed** (6 template tests and 1 existing pose
neighborhood test). The initial tiny fixture incorrectly used the version-2 hand
review schema for a bottom and encoded RGB-only ownership; it was corrected to
valid garment alpha ownership before the final run. No production validation was
relaxed.

The programmatic native-character audit uses frozen commit `16fb140` and creates
a blue material variant of the male terracotta shirt and a blue material variant
of the female cream blouse with the existing authoring engine. Both variants have
new IDs and changed artwork. Seven selected native PNG/mask pairs per character
match the target exactly; the existing painted-pose importer rebuilds all **107
male / 102 female** target frames byte-for-byte at decoded RGBA and ownership
level. Original source, registration and donor bytes stay exact.

- [Male review template](male.fitting-template.json)
- [Female review template](female.fitting-template.json)
- [Native audit](verification.json)
- [Scoped unit run](unit.log)

Reproduce with `node scripts/verify-kling-fitting-template.mjs`. Large proof
variant/painting ZIPs are generated into `/tmp/side-refinement/templates` by
default (`TEMPLATE_AUDIT_OUT` overrides it); they are validation artifacts, not
catalogue outfits. The compact template examples remain compatible with later
clothing revisions while source/registration/slot contracts stay identical.
Actual current-artwork UI and export evidence is recorded by the integration
workstream separately.
