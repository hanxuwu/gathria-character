# Current-run verification

Verified in the unified-workbench working tree based on
`3c525729f3f96d81141993a7ab933602df2dc635`, using Node 24 and Chromium.
These results belong to this consolidation change; previous refinement reports
are not counted as tests of it.

## Technical results

- `npm test`: **549 tests / 56 files passed** (38.16 seconds).
- `npm run build`: TypeScript and production build passed (Vite 5.54 seconds).
- **52 distinct browser cases passed** across the focused runs below. Reruns
  are excluded from the count. This is the relevant regression selection, not a
  claim that the entire historical browser suite ran in this batch.

| Browser spec                       | Passed cases | Main coverage                                                                                                                               |
| ---------------------------------- | -----------: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `unified-workbench.spec.ts`        |            6 | Exact side pose and draft retention, four source/registration contexts, exports, fresh player, cross-import and duplicate-identity recovery |
| `workspace-shell.spec.ts`          |            7 | Single library entry, lazy loading, keyboard/mobile navigation, rig undo, trusted identity messages and initial character                   |
| `native-study.spec.ts`             |            4 | Both skeletal candidates, editable pose round trip, legacy URLs and imported identity                                                       |
| `side-view.spec.ts`                |            4 | Both characters, PNG/mixing/reopen, original timing, two-jump one-shot and failed-load isolation                                            |
| `side-fitting.spec.ts`             |            2 | Actual clothing corrections, candidate application, save/reopen, source guides and mobile fitting                                           |
| `side-fitting-refinement.spec.ts`  |            2 | Adjacent-frame boundaries, current-pose export and source-bound reusable templates                                                          |
| `side-fitting-legacy.spec.ts`      |            2 | Earlier male/female projects retain embedded drawings and registration                                                                      |
| `wardrobe.spec.ts`                 |            6 | Original-view outfits, imports, export/reopen, independent player and motion state                                                          |
| `themes.spec.ts`                   |            8 | Complete art themes, original bytes, native pixel export, saved sessions, phase and lazy loading                                            |
| `side-expansion.spec.ts`           |            5 | Both new-cut editions, exact left/right mirroring, hair, mixed outfits and collection recovery                                              |
| `side-review.spec.ts`              |            2 | Slow review without export retiming, bookmarks, source isolation and mobile display                                                         |
| `side-polish.spec.ts`              |            2 | Earlier tailored project compatibility                                                                                                      |
| `side-refinement-recovery.spec.ts` |            2 | Parser-worker fallback/cancellation and damaged input recovery                                                                              |

Browser invocation uses:

```sh
CHROMIUM_PATH=/usr/bin/chromium CHROMIUM_ARGS_JSON='["--no-sandbox"]' \
  npx playwright test <specs above> --workers=1
```

The source selector preserves each visited tool. Side projects additionally keep
their own frame, facing, outfit, review position and uncommitted mask draft.
The modal lifecycle test makes a real five-pixel mask stroke, suspends its host,
then verifies byte-identical saved draft content, identical preview and working
undo after returning. It deliberately triggers host suspension programmatically;
ordinary native-modal outside-click blocking remains intact.

Cross-import tests verify that loaded character/collection identity can differ
from the retained slot key without losing the imported drawing. Duplicate
identities remain individually accessible through the retained-project selector.
A late trusted message from the hidden original player cannot replace the
currently edited skeletal session.

## Actual export evidence

**“Before” and “after” below mean before/after switching tools in the new
workbench, not screenshots from two different code revisions.** These are actual
UI downloads. No new artwork was generated for the comparison.

- Male run, left, frame 43: [before](review/male-run-left-before.png) /
  [after](review/male-run-left-after.png), **byte-identical native PNG**.
- Female run, right: [before PNG](review/female-run-right-before.png) /
  [after PNG](review/female-run-right-after.png), **byte-identical native PNG**.
- Female run, right: [before GIF](review/female-run-right-before.gif) /
  [after GIF](review/female-run-right-after.gif), **byte-identical actual GIF**.
- [Export check record](review/export-proof.json).
- [Fresh independent player after closing the editor](review/female-independent-player.png).

The PNGs are 512 × 768 and retain transparent and opaque pixels. The GIF is
256 × 384 on the existing matte background: 18 run frames, 24 FPS source timing
represented by the existing 40/50 ms GIF delays, total 750 ms, looping. GIF does
not carry the PNG's fractional alpha; this is unchanged export behavior.

Two independently exported female CharacterPacks were strictly parsed. All
decompressed archive members matched exactly across the switch; every atlas PNG
decoded. The pack contains 102 frames and idle/walk/run/jump, including the
original 50-frame non-looping two-jump clip. No celebration action was invented
for the side source.

After closing the editor, a **new browser context** loaded the exported pack,
played run, changed to left-facing, and re-exported the exact uploaded ZIP bytes.
It requested no workbench, wardrobe, side-view or skeletal modules. The two
14 MB verification packs remain in `/tmp/unified-workbench/browser/`; they are
not added again to the repository for this UI-only change.

## Review images and scope

- [Library, desktop](review/library-desktop.png) and [mobile](review/library-mobile.png).
- [Retained side fitting review](review/side-retained-review.png).
- [Side workspace at 390 px](review/side-mobile.png).

Source art, garment assets, the compositor, source motion and export contracts
have no changes relative to the baseline. Native PNG/GIF comparisons confirm
that changing tools does not redraw the chosen pose. This is **workflow and
render-preservation verification**, not a claim that existing clothing defects
were repaired or that every outfit is artistically perfect.

The original-view Wardrobe keeps its previous behavior of closing temporary
modals when hidden. The new exact uncommitted correction-draft retention applies
to the side sessions. Reloading the page still requires saving projects and
portable drafts first.

## Corrections made during verification

The first regression pass exposed obsolete assertions for the removed library
skeleton link and for the old practice of leaving the previous character visible
while another loaded. They were updated to the single entry and the retained,
hidden previous context, preserving the original pixel and export checks.

One new display assertion initially compared raw PNG RGB against Canvas's
premultiplied-alpha storage. It now puts the decoded exported RGBA through the
same browser Canvas storage before exact display comparison; raw PNG/GIF byte
checks were not relaxed.

A male saved-hair reopen case was interrupted by recorded Vite hot updates to
the workbench while that case ran. Its unchanged assertions, and the female
counterpart, passed again after the implementation was frozen. The final focused
runs have no unresolved failures.

Detailed local run logs: `/tmp/unified-workbench/regression.log`,
`followup.log`, `compatibility.log`, `final.log`, plus
`/tmp/unified-workbench-unit.log` and `/tmp/unified-workbench-build-final.log`.
