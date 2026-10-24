# Sprints 31–35: reversible styling and exact look comparisons

Baseline: PR #35 merged as `aa11f5bac14a50aeb40dee7abb350408d544bfb7` after
both remote checks passed. Those checks are historical. Work continues on
`feat/kling-look-comparison-v7`; this new batch will be a separate draft PR.

| Sprint | Deliverable | Acceptance |
| --- | --- | --- |
| 31 | Bounded wardrobe undo/redo | Clothing, imported pieces and head choices restore exact embedded assets. Failed/canceled work never enters history. Preview controls are not styling edits. Histories are isolated by character and reset when opening another project. |
| 32 | Pin an accepted look for comparison | Compare against the same source pose, facing and attachment point, even when hairstyles use different padding. Keep one in-session reference; original comparison stays available. |
| 33 | Pinned/current PNG and action GIF | Honest fixed panel labels, identical source IDs/timing, no independent scaling, no changes to portable CharacterPack or saved-project formats. |
| 34 | Searchable visual outfit choices | Generate standing thumbnails through the actual compositor. Keep source/selection hashes and original PNG exports. Search can find earlier looks while recommendations and custom selections remain available. |
| 35 | Real production export and playback | Both characters, everyday/wedding mixes, appearance changes, history, canceled requests, save/reopen, both directions and independent player. Decode GIF/PNG/ZIP; compare existing visual pixels with the baseline. |

No new character, clothing paintover, source retiming or skeletal rewrite is
planned. Keep all accepted art files unchanged. Thumbnails and evidence are
derived from application output, not generated concept art. Commit and push
recoverable stages. Technical checks and visual review are reported separately;
the new PR remains unmerged for user review.
