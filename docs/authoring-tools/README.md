# Visual binding and shared motion authoring evidence

These are actual Skin Studio UI downloads and screenshots. No new illustration was generated. The small timing/pose change is a **technical editing example**, not a claim that the artwork or run cycle is better.

- [Actual UI workflow GIF](authoring-workflow.gif): choose forearm → drag elbow +2 px → undo → redo → restore binding → edit shared motion → swap skin.
- [Desktop screenshot](studio-desktop.png) · [Mobile screenshot](studio-mobile.png).
- [Run right 2×](edited-run-right-2x.gif) · [Run left 2×](edited-run-left-2x.gif), with [native right](edited-run-right-1x.gif) and [native left](edited-run-left-1x.gif).
- [Native key poses](run-keyposes-1x.png) · [2× key poses](run-keyposes-2x.png).
- [Native same-pose comparison](pose-edit-comparison-1x.png) · [2× comparison](pose-edit-comparison-2x.png).

| Skin | Editable project | Independent CharacterPack | Independent player |
| --- | --- | --- | --- |
| Denim daytrip | [Project ZIP](denim-daytrip.rig.zip) | [CharacterPack ZIP](denim-daytrip.character.zip) | [Screenshot](denim-daytrip/independent-player.png) |
| Coral afternoon | [Project ZIP](coral-afternoon.rig.zip) | [CharacterPack ZIP](coral-afternoon.character.zip) | [Screenshot](coral-afternoon/independent-player.png) |

The exported example retains each skin's default joint bindings. Both projects share exactly the same skeleton and motion data: run 15 FPS, first pose body bob 3 px instead of 2 px, and the first pose held for two playback entries. There are 12 unique run poses and 13 timed entries, so the intended loop is 866.67 ms. GIF timing is rounded cumulatively to 870 ms because GIF stores centiseconds; duplicate first frames may be merged by the encoder. Idle and walk pixels are unchanged.

The capture first exported unedited defaults and compared every decoded pixel and manifest with the prior checked-in reusable-rig evidence. It then used real pointer/keyboard controls and download buttons for the edited files. Reopening each project through the UI and exporting again preserved every decoded atlas pixel and manifest. The two `*-default.character.zip` and `*-reopened.character.zip` files retain these checks for review.

After closing the authoring page, the independent player loaded each edited ZIP and played run right and left (4 cases). Every unique native 192×256 frame, including feet, matched the exported PNG after reproducing only the player's ground/anchor guides. Frame order, loop duration, and the held first pose were measured. Generator/authoring imports were blocked and none were requested. Screenshots are supplemental; measured results are in the JSON records.

Capture-method note: the first attempt stopped because it compared each canvas paint with React's independently committed frame label. The completed capture identifies each sampled pose by its unique full-frame RGBA match against exported PNGs, then verifies all 12 poses, order, holds, and loop timing. It accepts no unmatched pixels; this was an observer synchronization correction, with no app-code change.

Every delivered PNG/GIF/ZIP is nonempty and decoded. ZIP members have CRC and SHA256 checks; exported character frames retain binary transparency and clear edges. GIFs are decoded back and compared with their intended palette-converted frames, ordering, and duration.

- [Browser workflow and source hashes](evidence-index.json)
- [PNG/GIF/ZIP and timing verification](artifact-validation.json)
- [Complete file inventory](file-integrity.json)

This batch adds authoring tools. It does not redraw characters, remove existing deep-joint texture compression, add arbitrary bone topology, or claim user visual acceptance. Character packs are baked playback assets; keep the full project ZIP to continue editing.
