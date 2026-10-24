# Sprints 21–25: source-bound pose repairs and review tools

Baseline: merged main `f1fe1f91faa212e72d4dd25f8c30e8bf1c8f6842` (PR #33).
Both final PR checks subsequently passed. These are historical results, not this
batch's verification. Branch: `feat/kling-pose-occlusion-v5`.

The two approved Kling bodies, face, silhouette, source order, action timing and
old assets/configurations remain fixed. New artwork must use a distinct revision.

| Sprint | Deliverable                                           | Acceptance                                                                                                               | Status               |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| 21     | Correct male crossing-hand/forearm clothing ownership | Explain source frame 56 and adjacent poses; exact face/hand protection; actual before/after exports                      | Delivered for review |
| 22     | Native female compressed-waist painting               | Pose-specific cloth donors, adjacent-pose continuity, no stretched generic band; prior V6 remains available              | Delivered for review |
| 23     | Adjacent-pose inspection and painting kit             | Review previous/current/next poses with correct loop or one-shot endpoints; export bound native layers/masks/guides      | Delivered            |
| 24     | Current-action GIF download                           | Local deterministic frame rendering; right/left, documented scale/background, faithful frame order and cumulative timing | Delivered            |
| 25     | Actual export review and regression                   | Four outfits, difficult poses, mixes, old/new saved projects and isolated player; PNG/GIF/ZIP decoded and checked        | Delivered            |

Commit and push recoverable stages. Keep this batch as a draft PR for review.
Technical checks and visual judgment are reported separately. No automatic user
visual acceptance, runtime image API, new body or skeleton rewrite.

Completed stages are saved in `9c67c1b` (sleeve), `6a28337` (waist folds),
`87ac919` (inspector/kits/GIF), `c0fe72b` (identical mirrored GIF palette),
`27c79de` (larger shared-crop comparison) and `e30e913` (decoded production
downloads). [Delivery and visual limits](README.md) include the remaining
straight/blocky male cuff/fist transition and stepped female right-waist outline.
These are not counted as visually resolved. This batch stops at a draft PR;
future work should target those specific contours instead of adding more outfits.
