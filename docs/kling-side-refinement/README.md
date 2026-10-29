# Side-view clothing continuity and reusable fitting review

This iteration starts from PR #54 at `16fb1405239188a453d66cda94927106028eefbf`.
The earlier draft and its source artwork remain available. [Plan](PLAN.md) · [Pinned baseline](baseline.json).

## Open the workbench

Run `npm run dev`, choose **侧视新款试装与发型**, then **服装校正 · 锚点与遮挡**.
Direct routes:

- `/workbench.html?character=male&mode=side-view&collection=tailored`
- `/workbench.html?character=female&mode=side-view&collection=tailored`

The panel shows original, garment and complete-look native images. Enable neighboring poses to inspect the previous/current/next drawing with a shared scale. Real idle/walk/run loop seams are labeled; jump endpoints never wrap. Inspection rows can select a transition or open its local correction draft. Draft, candidate preview, applied project and initiated project download are distinguished. A download notice does not claim the browser file has already been written to disk.

[Workbench details](workbench/README.md) · [Temporal diagnostics](temporal/README.md) · [Reusable review templates](templates/README.md).

Templates reuse difficult-pose IDs, canonical anchors and protection references on another compatible garment. The target keeps its own images, masks and permissions. They do not automatically fit a new standing illustration or create missing cloth folds. Male/female, source revision and garment slot remain separately bound.

## Visual fixes

- [Male neckline](male/README.md): 9,372 previously unowned original-cloth pixels are covered using existing shirt artwork across 105 poses. All prior shirt pixels, original skin proof, head/hand protection and alpha remain exact. Poses 59 and 61 are unchanged.
- [Female forearm](female/README.md): release 284 incorrectly skirt-owned pixels in run40–41 to exact original forearm/ink RGBA. The other 100 skirt poses and complete blouse remain exact.

The final female contour is a focused improvement. The male repair is deliberately partial: the wider motion-blurred gray patches in jump67/89/91 and some armpit notches remain. Expanding ownership across ambiguous skin/cloth edges was rejected. The existing blouse donor transitions, neckline/waist seams, source green/matte fringes and crouched jump ending are not claimed solved.

## Performance and compatibility

Background preparation and bounded source-page caching are evaluated against identical frozen assets. Original sources, canonical registrations, 512×768 geometry, 24 fps, frame IDs/order and loop flags are fixed. Existing saved projects keep embedded artwork and retain their native rendering. No garment, wardrobe project or CharacterPack schema is changed. Template JSON is an authoring reference, not a playable pack.

Current measurement and final actual-export links are recorded when the frozen verification completes. Technical integrity and visual acceptance are reported separately; diagnostic scores are inspection priorities, not defect counts or an automatic art verdict.
