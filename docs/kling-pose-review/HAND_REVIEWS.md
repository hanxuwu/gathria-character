# Item-scoped hand boundary review

The immutable male registration marks part of the crossing forearm in source
pose 56 as `nearHand`. A long sleeve cannot cover it under the original contract.
The new `navy-suit-jacket-v5` explicitly keeps the distal thumb/fist protected
while assigning the proximal forearm to the sleeve. Its original cloth donor,
source alpha, face, silhouette, anchor, timing and other 87 poses are retained.
The source and shared registration hashes do not change.

Garment manifest V2 adds `handProtectionReviews`: `{frameId, label, polygon,
reason}`. Only top/fullBody items may declare it. Each review names an existing
nearHand/farHand region in one frame. Its pixel-centre coverage must be a
nonempty subset of the original protected region. Head reviews, duplicates,
unknown frames and V1 review metadata are rejected. A review never relaxes
protection for another item or for appearance rendering. Authored boundaries
still need visual review: the parser cannot infer a real wrist from artwork.

V1 garments retain their exact original contract and output. Existing projects
are not upgraded. Project ZIPs retain the exact V2 garment bytes. Baked export
uses the existing CharacterPack format and records the garment revision and
review in `character.json` sourceMetadata. No custom player is needed.

Authoring: `scripts/prepare-kling-pose-review.py`. The documented boundary and
source/registration hashes are in `artwork/kling-pose-review/source/male-hand-review.json`.
Before/after offline boards are diagnostics; final acceptance uses app exports.
