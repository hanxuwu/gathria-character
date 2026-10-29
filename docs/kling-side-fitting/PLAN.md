# Side-view fitting workbench and contact refinement

Baseline: 220ea2fd7588c1fe784c8454d66469d60fba096a (draft PR #53).
Remote main checked at bfd3b4d4df9d58821bf23a7134e93a8026eb877b.
PR #53's two verify runs passed. This iteration remains a separate branch;
it does not merge the earlier candidate or replace original source assets.

## Workstreams

1. Male shoulder/sleeve fit in compressed and raised-arm poses.
2. Female sleeve/forearm contacts with source-traced garment ownership.
3. Skirt continuity across jump and source-arm foreground occlusion.
4. Hair/ear/nape audit and only visually justified local corrections.
5. Continuous keyboard/travel/jump stress checks and authoring input isolation.
6. Visual garment fitting workspace reusing strict mask editing and package formats.
7. Measured first-load improvements without weakening validation.
8. Independent actual-export, legacy project and standalone-player verification.

The lead handles integration and motion; six workers run together. Independent
QA starts when a slot is available (seven concurrent agents including lead).
Each worker owns disjoint code/assets. Shared renderer, bindings and UI edits
are coordinated before publication. Bulk trials live in /tmp/side-fitting.

## Frozen contracts

- Original source ZIPs, 107 male / 102 female frames, 512 x 768 dimensions,
  anchor (256,710), frame IDs, 24 fps and existing loop flags remain exact.
- Preserve source face/body artwork and prior saved embedded projects.
- Jump remains the original two-jump one-shot; no invented recovery frames.
- Cloth fitting must respect protected head/hands and correct original limb depth.
- Visual quality is judged on same-frame and continuous actual exported imagery,
  separately from integrity and automated test success.
- Retain best repairs; document source or garment limitations when a trial fails.
- Current review targets this branch; do not rewrite historical evidence.

## Delivery

Actual before/after GIFs, native and 2x details, editable wardrobe projects,
standalone CharacterPacks, fitting-tool screenshots and save/reopen proof;
measured loading results and current test logs. Final draft stays unmerged.
