# Independent follow-up QA

This directory records checks performed for the side-view polish iteration.
Earlier `kling-side-expansion/review` reports are baseline evidence, not new test
results. Technical preservation and visual review are separate conclusions.

## Previous projects

The two cases in `tests/e2e/side-polish.spec.ts` reopen the actual previous male
and female styled wardrobe exports. Their fixture bytes are pinned by
`../baseline.json`, so replacing historical fixtures cannot silently update the
test oracle.

For each character, three difficult poses are exported in both directions and
compared byte for byte as decoded RGBA against the previous independently baked
CharacterPack. The cases include male walk 26 and jump 67, and female run 38 and
jump 95. Re-saving the project must preserve every embedded source, registration,
garment and appearance file, as well as all corresponding document hashes and
selection. Only the inspected preview action/facing changes.

Both cases passed in the initial independent run on Chromium
(`previous-project-browser.log`). These are two browser tests and 12 PNG checks,
not 12 additional browser tests. Final combined-suite repetition, if any, is
reported by the parent QA page without adding these counts twice.

## Read-only implementation review

- The new source cache retains only SHA-bound compressed source ZIPs, with at
  most two entries and a 32 MiB budget. Returned typed arrays are copies. Failed
  or abandoned requests do not populate it; cancelling one reader leaves other
  readers active. The existing strict project importer still owns decoding.
- Garments, appearance and registration are outside that cache. New revisions
  are fetched and validated on each catalog load. No mutable project objects or
  expanded animation-frame collections were added to this cache.
- Preview rate multiplies the review playback clock only. Export paths continue
  using source manifests. The separate review browser tests compare original
  and slow-preview PNG/GIF bytes.
- Problem-frame notes are scoped to character and source SHA. Their look context
  includes registration, selected garment hashes and appearance bank/selection.
  A changed look is explicitly identified; locating a note restores a paused
  pose without silently replacing clothes.
- Integer detail crops use the same native frame coordinates and explicit
  horizontal mirroring. Source geometry, face/body drawing and runtime export
  formats are unchanged by the inspection panel.

No blocking defect was found in that implementation review. The checks do not
establish artistic quality, physically simulated fabric or absence of every
possible source-video artifact.

## Actual exports

Final actual-export verification passed for both characters:

| Check                                                    | Male                           | Female                             |
| -------------------------------------------------------- | ------------------------------ | ---------------------------------- |
| Frozen source / clothing frames                          | 107                            | 102                                |
| Hair compositions, chestnut outfit + espresso mixed look | 214                            | 204                                |
| Actual UI GIFs, three looks and both directions          | 24                             | 24                                 |
| Mixed and legacy save/reopen                             | Pass                           | Pass                               |
| Fresh standalone contexts after closing workbench        | 2                              | 2                                  |
| Current report                                           | [Male](male-final-report.json) | [Female](female-final-report.json) |

[Summary](summary.json) records the exact run times and input coverage. Both
partial runs used the same verifier and final runtime. All 240 inputs in each
report were rechecked against the final working tree; all 235 common inputs
match between reports. No page errors, failed HTTP requests or forbidden
workbench requests from the standalone player occurred. The male mobile check
also passed. GIF frames, native timing, alpha, left mirrors, source IDs and
authored replacement pixels were decoded and checked independently.

The first female run is excluded: a review-panel wording edit during capture
correctly caused the final input-freeze guard to reject it. The first male run
was interrupted when an authoring audit found nonlocal leg-width rounding
drift; the final run uses the subsequently corrected trouser bank. Neither
discarded run contributes to acceptance counts. The guards were not weakened.

## Independent visual findings

- [Male actual walk contacts](male-actual-walk-contacts.png): the broad dark
  original-shorts wedges at the reviewed hand contacts, especially frame 26,
  are removed or reduced to the retained narrow source ink/antialias edge.
  Hands preserve their original shading and finger silhouettes. The actual
  styled export changes exactly 12 walk frames and hair frame 67; its other
  94 frames remain byte-exact against the historical styled export
  ([actual RGBA delta](male-actual-baseline-delta.json)).
- [Male actual head sequence 61–69](male-actual-head-neighbors.png): the bright
  rear-scalp strip in frame 67 is covered by the retained hair correction.
  Neighboring hair frames are unchanged; the repair is confined to the rear
  head/nape region. It removes the skin flash rather than introducing a new
  head position. The source video's blur and pose change remain visible.
- [Female actual difficult poses](female-actual-hardposes.png): the retained
  complete pleated running skirt resolves the rejected detached front flap at
  frame 38, and whole-pattern substitutions inside the clips are reduced.
  Run is less wind-lifted than the rejected trial. The existing squared
  forearm/fist seam at frames 39 and 49 remains in both baseline and final;
  this iteration does not repair it. Jump keeps its more lifted fold design
  throughout, with a visible design change on entry/exit. The actual styled
  export changes 57 frames and preserves the remaining 45 exactly
  ([actual RGBA delta](female-actual-baseline-delta.json)).

These visual findings use the selected native same-frame crops;
[input provenance](visual-inputs.json) identifies the actual packs. Complete
before/after exported GIFs and native contact sheets are linked from the parent
review for motion review; every encoded frame is covered by the technical audit.
Technical pass is not a claim that all seams are artistically finished: angular
compressed male sleeves, the female forearm boundary, finite cloth deformation,
source matte fringes/blur and the jump's crouched endpoint remain limitations.
