# Item-scoped hand boundary review

The immutable male registration marks part of the crossing forearm in source
pose 56 as `nearHand`. A long sleeve cannot cover it under the original contract.
The new `navy-suit-jacket-v5` explicitly keeps the distal thumb/fist protected
while assigning the proximal forearm to the sleeve. Its original cloth donor,
source alpha, face, silhouette, anchor, timing and other 87 poses are retained.
The source and shared registration hashes do not change.

Garment manifest V2 adds `handProtectionReviews`: `{frameId, label, polygon,
reason}`. Top, bottom and fullBody items may declare it; shoes cannot. Bottom
items use the same narrow review when an oversized hand polygon also protects
the original shorts behind the actual fist, preventing a skirt or trousers
from covering them. Each review names an existing
nearHand/farHand region in one frame. Its pixel-centre coverage must be a
nonempty subset of the original protected region. Head reviews, duplicates,
unknown frames and V1 review metadata are rejected. The count is bounded by
the number of registered hand regions, with the existing metadata size limit;
clips with more than 32 affected poses remain supported. A review never relaxes
protection for another item or for appearance rendering. Authored boundaries
still need visual review: the parser cannot infer a real wrist from artwork.

V1 garments retain their exact original contract and output. Existing projects
are not upgraded. Project ZIPs retain the exact V2 garment bytes. Baked export
uses the existing CharacterPack format and records the garment revision and
a compact `handProtectionReviewSummary` in `character.json` sourceMetadata.
The summary contains the review count, SHA-256, encoding name and location of
the full review records in the editable project's original garment manifest.
Long reviewed clips therefore stay within the existing generic metadata
complexity and 64 KiB limits. Older baked packs containing inline review
polygons remain readable. No custom player is needed.

The summary digest covers UTF-8 JSON without whitespace or a trailing newline:
`{"format":"gathria-hand-protection-reviews","version":1,"reviews":[...]}`.
Reviews are sorted by numeric `frameId`, then ASCII `label`; each entry uses
keys `frameId`, `label`, `polygon`, `reason` in that order. Polygon vertices
retain their declared order, with `x`, then `y` keys. This canonical summary
does not modify or replace the exact original garment bytes in saved projects.

Authoring: `scripts/prepare-kling-pose-review.py`. The documented boundary and
source/registration hashes are in `artwork/kling-pose-review/source/male-hand-review.json`.
Before/after offline boards are diagnostics; final acceptance uses app exports.
