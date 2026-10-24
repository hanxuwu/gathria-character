# Sprints 21–25: native clothing pose repairs and review tools

This batch repairs the crossing male sleeve and repaints compressed female waist
folds on the two approved Kling bodies. It also adds adjacent-pose painting kits
and direct action GIF downloads. The source characters, motion, facial artwork,
body registration and old clothing archives remain unchanged. This is a review
candidate; technical checks do not constitute user visual acceptance.

| Sprint | Delivered                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 21     | `navy-suit-jacket-v5`: explicit, item-scoped review of source pose 56's near-hand boundary; cover the forearm while preserving the actual fist                           |
| 22     | `coral-daydress-v7` and `ivory-wedding-dress-v7`: native crouch fabric donor, continuously weighted across 15 compressed poses per dress; same ownership and alpha as V6 |
| 23     | Previous/current/next clothing layers, editable-area views and multi-pose painting kits bound to the source and registration                                             |
| 24     | Browser-local current-action GIF download, both directions, original timing, cancellation and a shared palette                                                           |
| 25     | Actual production downloads, matched before/after review, saved-project reopen, mixes and independent player checks                                                      |

## Try it

Open `/workbench.html?character=male&mode=wardrobe` and select **Wedding reviewed
sleeve**. For female, choose **Everyday native folds** or **Wedding native folds**.
Existing looks and saved projects retain their original clothing. Earlier
versions remain under **More outfits and earlier versions**.

Under **Fitting guides**, enable **Inspect clothing layer** and use **Download
neighboring poses for painting**. **Open larger comparison** shows all three
poses with a common crop, on desktop and mobile. **Download action GIF** is beside PNG and
CharacterPack export. [Tool behavior and limits](TOOLS.md).

## Actual exported comparisons

The left side is the previous released outfit; the right side is this batch.
Animations below use 0.5× viewing copies. Native PNG boards retain the full
768×1184 frame, and connection crops use exactly 2× nearest-neighbor enlargement.
Previous CharacterPacks are reused from the prior release, with hashes recorded;
the before PNGs were downloaded and checked again in this batch.

| Outfit                               | Native before/after                       | Connection crop                               | Right run                                             | Left run                                             | Jump                                                   |
| ------------------------------------ | ----------------------------------------- | --------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| Male everyday — unchanged control    | [1×](review/male-day-native-1x.png)       | [2×](review/male-day-connection-2x.png)       | [GIF](review/male-day-run-right-comparison.gif)       | [GIF](review/male-day-run-left-comparison.gif)       | [GIF](review/male-day-jump-right-comparison.gif)       |
| Male wedding — reviewed sleeve       | [1×](review/male-wedding-native-1x.png)   | [2×](review/male-wedding-connection-2x.png)   | [GIF](review/male-wedding-run-right-comparison.gif)   | [GIF](review/male-wedding-run-left-comparison.gif)   | [GIF](review/male-wedding-jump-right-comparison.gif)   |
| Female everyday — native waist folds | [1×](review/female-day-native-1x.png)     | [2×](review/female-day-connection-2x.png)     | [GIF](review/female-day-run-right-comparison.gif)     | [GIF](review/female-day-run-left-comparison.gif)     | [GIF](review/female-day-jump-right-comparison.gif)     |
| Female wedding — native waist folds  | [1×](review/female-wedding-native-1x.png) | [2×](review/female-wedding-connection-2x.png) | [GIF](review/female-wedding-run-right-comparison.gif) | [GIF](review/female-wedding-run-left-comparison.gif) | [GIF](review/female-wedding-jump-right-comparison.gif) |

[All native keyframes and connection sequences](review/) ·
[All five actions in both directions, directly downloaded GIFs](evidence/).
Jump GIFs play once, matching their declared clip; reopen to replay.

Portable CharacterPacks:
[male everyday](evidence/male-day.character.zip) ·
[male wedding](evidence/male-wedding.character.zip) ·
[female everyday](evidence/female-day.character.zip) ·
[female wedding](evidence/female-wedding.character.zip).

[Male independent player](evidence/male-wedding-independent-player.png) ·
[Female independent player](evidence/female-wedding-independent-player.png) ·
[Larger neighbor inspector](evidence/male-large-neighbors.png).
These are baked packs; no wardrobe renderer or original editor session is
required for playback. Editable project downloads were also reopened locally;
their exact hashes and temporary paths are in the browser record, while released
source/garment/appearance banks and processing scripts remain in the repository.

## What changed and why

The male source-56 `nearHand` polygon included a proximal forearm triangle, and
the old wrist guide sat too far back. Both authoring and runtime protection
prevented a sleeve from covering it. A garment V2 review records the visible
fist boundary for this item and pose only. The sleeve uses the existing recorded
cloth donor; its old diagonal cuff fringe is removed at the moved wrist.
Source registration bytes and all other 87 male poses remain exact.
[Contract and compatibility](HAND_REVIEWS.md).

Female V6 used a generic stretched cloth strip at the crouched waist. A new
OpenAI image edit of the native pose supplies curved compression folds.
Only traced interior cloth RGB is used; generated anatomy, background, alpha
and silhouette are discarded. Registration follows existing waist anchors and
crouch intensity across source poses 83–89 and 102–109. The ivory dress uses the
same fold structure with its existing fabric midtones. All other poses remain
exact. [Source, prompt, hashes and processing](../../artwork/kling-pose-review/README.md).

Relevant implementation: `src/wardrobe/contract.ts`, `protection.ts`,
`compositor.ts`, `pose-neighborhood.ts`, `recipe-kit.ts`,
`ClothingPoseInspector.tsx`, `action-gif.ts` and `WardrobeEditor.tsx`.
Authoring scripts: `prepare-kling-pose-review.py` and
`prepare-kling-native-waist.py`. Capture/verification/review scripts share the
`kling-pose` name under `scripts/`.

## Verification and visual limits

This batch ran TypeScript/production build, all 245 unit tests, all 67 Chromium
browser tests and six offline recipe tests. The final palette-only correction
additionally reran the two GIF unit and two GIF browser tests. Enlarging the
inspector then reran all five recipe/GIF browser tests and the production build. These are current
results, distinct from prior sprint records. [Test record](test-results.json). The actual downloaded neighbor kit was also
built offline: all 88 suit poses and the V2 hand review remained exact
([recipe roundtrip](recipe-roundtrip.json)).

[Asset audit](asset-checks.json) checks 84 prior archive hashes, four unchanged
source/registration files, and all 280 poses across the three new garment banks.
[Production browser record](evidence/evidence-index.json),
[decoded export audit](export-checks.json) and
[review-media index](review-index.json) record exact files, hashes, decoded frames,
timing, direction, transparency, saved-project restoration and isolated playback.

The export audit decoded four CharacterPacks (368 unique poses), 64 matched PNGs,
40 direct GIF downloads, four saved projects and two neighboring-pose kits.
After closing the editors, the independent player completed 40 action/direction
checks. All 32 paired review images/GIFs were also decoded and timed.

The long production capture completed those checks but its final harness assertion
counted the browser's missing `/favicon.ico` as an error. The raw
[failed attempt](evidence/failed-attempt.json) is retained. A separate final
production check reproduced the exact icon URL/404, verified both larger
inspectors against the earlier exported pixels, and recorded the resolution in
`evidence-index.json`. No application resource or runtime error was observed.

Visual review is narrower than those technical assertions:

- The male crossing pose now has a continuous long sleeve instead of a large
  exposed forearm triangle. The cuff/fist boundary is still rather straight and
  blocky; it needs further contour work. Old vest/waist seams elsewhere are retained.
- The female crouch has overlapping fabric folds instead of a mostly flat dark
  strip. **The old sharp/stepped right-waist outline is still visible**, especially
  enlarged. This RGB-only repaint intentionally does not pretend to repair it.
- Existing motion blur and frame-to-frame body variation in the Kling source
  remain. This batch does not invent new motion or redraw the approved body.
- GIFs are 256-color, cream-matted viewing copies. PNGs and CharacterPacks remain
  full-resolution RGBA. Runtime composition remains deterministic and local.
