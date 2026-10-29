# Side expansion QA

Status: final technical checks passed for all 209 source frames, using female `final-a` and corrected male `final-b`. Actual run-frame-40 export confirms the broad gray tank wedge is removed. A remaining visual limitation is explicitly recorded below: original dark shorts remain behind the male near hand in walk frame 26.

| Actual UI verification | Male | Female |
| --- | --- | --- |
| Source/clothing frames | 107 | 102 |
| Hair compositions | 2 × 107 frames | 2 × 102 frames |
| Action GIFs, both directions | 24 | 24 |
| Mixed project and legacy project reopen | Passed | Passed |
| Fresh independent players | 2 passed | 2 passed |
| Report | [final male](review/male-qa.json) | [final female](review/female-qa.json) |

Final male registration is `7fa05a051d6dc1aa7184aaf484f82bb512042d276189606eee9da366d65cb43e`; female is `7f49437c617e01141622e1ca3d463347edf51adce068a344c01d545e58567cef`. Both runs used unchanged verifier SHA `7a9104de3733b2522c896b672a619517e219dd2a18e36886a7fa78329cd1c0f0`; all 230 shared runtime paths and legacy hashes match. Final validation confirmed that every current selected asset, registration, audit, runtime and legacy input still matches its recorded hash. Neither run had a page or network error. The final 390 × 844 viewport check found the collection, outfit, hair, PNG export and project controls visible and reachable.

Male `final-b` ran 07:37:08–07:42:08 UTC on 2026-10-29; female `final-a` ran 06:04:47–06:10:07 UTC. Bulk actual downloads remain under `/tmp/side-expansion/qa/male-final-b/` and `/tmp/side-expansion/qa/female-final-a/`. The earlier [male checkpoint report](review/iterations/male-final-a-qa.json) is retained as a technical pass rejected by visual review, not as final acceptance.

Current formal checks also passed: [143 unit tests in 9 files](review/checks/unit.log), [TypeScript](review/checks/typecheck.log), [final production build](review/checks/build-final.log), 5 new-edition browser tests and [4 legacy side-view browser tests](review/checks/legacy-final.log). The five new tests comprise the [final female test](review/checks/female-browser.log) plus [four tests in the final suite](review/checks/expansion-final.log); earlier trial runs are not added to that count. The final build completed in 10.59 seconds against the frozen replacement banks.

The [library entry smoke check](review/library-entry-check.json) also verified both new entry links and their exact tailored male/female routes without page errors. It is a manual scripted check, not an additional formal browser test.

## Source and registration review

The original side sources remain the fixed 107 male and 102 female frames. Their SHA-256 values are embedded in the verifier. The existing material edition, old registrations, source bindings and old garments are compared byte for byte against the retained Git baseline before and after capture.

Independent female review inspected all 102 original source frames with their old head/hand overlays. The source-bound [correction proposals](../../artwork/kling-side-expansion/templates/source-review/qa-female/proposals.json) contain 150 region changes across 81 frames. [Native source/old/proposed comparisons](templates/source-review/qa-female/README.md) show the mistakes: rear-hand masks on thighs, missed visible fists, and head regions that included rectangular pieces of shoulders and raised arms. Raised far fists receive their own protection after the erroneous head flood is removed. The remaining frames retain the old regions. Manual hand outlines include a small conservative edge margin; wrist locations are authoring guides.

The separate candidate registration is bound to the same exact source pack. The harness requires the UI project to embed those reviewed bytes, checks every frame ID and source-frame mapping, and independently rasterizes every changed region to verify the audit's before/after/added/removed opaque coverage. It does not import the authoring helper. Male idle/walk/run/jump overlays were also independently inspected across all 107 frames; the final source review separates conservative wrist margins from displaced head/hand regions. Numerical region checks complement the source review; they do not make the registration anatomically exact by themselves.

Actual dressed review exposed overbroad male hand protection: old tank crescents, square skin patches over trousers, and upper-arm regions that blocked the new sleeve. The locomotion boundaries were revised separately. Independent QA authored [20 source-traced jump refinements](../../artwork/kling-side-expansion/templates/source-review/qa-male-hand-refinement.json) for near hands 83–96 and 102–106, plus far hand 95, with [source/candidate/proposed comparisons](templates/source-review/qa-male-hand-refinement/README.md). These boundaries protect the fist/palm and a small wrist margin, release the biceps, and remove the tank/thigh bridge without changing wrist or head metadata. All 19 corresponding clothed previews were independently inspected, followed by the final actual export checks. The run-40 finding below remains separate from these jump corrections.

The focused [12 run-contact refinements](../../artwork/kling-side-expansion/templates/source-review/qa-male-run-boundary-refinement.json) replace the warm-color witness with manually observed boundaries for 39–48 and 55–56. Independent source and dressed review confirmed removal of clear tank wedges and restored actual finger/palm coverage in 43, 48, 55 and 56. Frame 44 retains its complete distal ink coverage. The [selected native comparisons and exact delta](templates/source-review/male-run-contact/README.md) document the accepted thin ink/antialias margin; source hand pixels are not recolored to erase that blended edge. The corrected `male-final-b` actual exports and 107-frame pixel audits passed.

## Reproduction

To reproduce:

```sh
node scripts/verify-kling-side-expansion.mjs
npx playwright test tests/e2e/side-expansion.spec.ts --output=/tmp/side-expansion/qa/e2e-results
```

The full verifier creates a fresh `/tmp/side-expansion/qa/run-*` directory. An explicit `EVIDENCE_DIR` must be empty and inside `/tmp/side-expansion/qa/`. It starts its own Vite server and uses `/usr/bin/chromium`, or `CHROMIUM_PATH` when provided. Bulk evidence remains in `/tmp`; the repository should retain only the compact final report and selected review images.

`QA_CHARACTER=male` or `QA_CHARACTER=female` limits a run to that character. Other values are rejected. A partial report explicitly records its requested characters and expected coverage of 107 or 102 frames; it makes no claim to cover all 209. Selected new assets and registration/audit bytes are frozen across that run, while all runtime code and immutable legacy assets remain checked. The default still verifies both characters.

For each character the actual UI exports are named:

- `*-original.character.zip`: untouched source outfit.
- `*-daily.character.zip`: full new clothing with original hair.
- `*-styled.character.zip`: full new clothing with the default authored hair.
- `*-styled.wardrobe.zip`: the same full styled outfit as an editable project.
- `*-{original,daily,styled}-{idle,walk,run,jump}-{right,left}.gif`: all four native clips in both directions.
- `*-mixed-hair.wardrobe.zip`: original top plus new bottom and an espresso hairstyle, saved through the UI and reopened after a full page reload.
- `male-daily-walk-frame-35.png`, `male-daily-run-frame-40.png`, and `female-daily-walk-frame-31.png`: the same clothing-only native poses captured before the protection/waist repairs, for direct before/after review.

The three review packs and both styled/mixed editable projects are retained per character. Intermediate repeated projects and extra comparison packs are deleted after successful verification. Failed runs retain their evidence and failure screenshot so that defects can be investigated.

## What the checks establish

The clothing audit decodes all 209 source frames and the actual exported atlas pages independently. It requires original-export RGBA to equal the frozen source, source RGBA outside garment ownership to remain exact, reviewed head/hand pixels to remain exact, and owned pixels to match the authored garment RGBA in the documented slot order. This includes authored alpha. A true shirt, trouser, blouse or skirt cut may legitimately change the overall silhouette; the verifier explicitly requires and reports alpha changes inside ownership instead of reusing the old material edition's whole-frame alpha invariant.

The hair audit independently reconstructs source-over/front and destination-over/back rendering, tint and explicit integer padding for every frame. It verifies all resulting RGBA bytes, unchanged pixels outside appearance ownership, and exact opaque inner-face, foreground-hand and body pixels. Hair may cover the scalp and upper-ear region declared by the existing appearance contract. Partially transparent antialiased source edges can blend with hair behind them; that blending must match the contract byte for byte. Hair does not authorize redrawing the face or body.

Actual browser downloads prove PNG pixels and exact horizontal mirroring, guide-free export, source action order, 24 FPS, loop flags, the complete 50-frame two-jump clip, and GIF centisecond timing. Every decoded GIF frame is checked against the independently matted, downsampled and palette-mapped actual CharacterPack frame in source order; left-facing GIFs must be exact horizontal mirrors of the corresponding decoded right-facing frames. Source-frame and source-time derivation records must remain unchanged. Browser observations separately record displayed frames and missed display ticks; missed observation ticks are not presented as missing encoded source frames.

The browser suite exercises mixed clothing/hair save and reopen, legacy material-project reopen, invalid imports retaining the active project, collection-load retry returning to the requested edition, and explicit paused facing overriding a turn queued during the active jump. After the workbench context is closed, fresh independent player contexts load the actual clothing and styled packs, play every action in both directions, and re-export the uploaded ZIP bytes exactly. Independent contexts must not request workbench, wardrobe or skeletal modules.

## Visual review limits

The frozen source includes blurred/interpolated jump poses and cutout drift. Female jump source 201–204, 210–213, 218–221, 233–234 and 241–244 are visible examples. The source's green jaw/neck fringe is retained. These source defects must be distinguished from new garment seam gaps, sleeve/cuff cuts, skirt folds, leg overlap, hair masking or export artifacts. Registration and exact-pixel checks cannot restore absent source detail or replace direct review of the new outfit in motion.

The female cuff and hem fold transitions retain the limitations of the authored donor poses. This is an accepted outfit candidate with baked per-frame artwork, not a claim of physical fabric simulation.

The final native UI PNG confirms the square skin patch under male walk fist 35 is removed and the female walk-31 blouse/waist collapse is fixed. The corrected jump 83–96 and 102–106 previews remove the large tank bridges and restore the sleeve over the biceps while retaining the source fingers.

**Resolved checkpoint finding:** `final-a` run frame 40 contained a gray old-tank notch above the near fist, approximately native x257–296/y475–490. The [frozen-source/before/checkpoint diagnostic](review/iterations/male-final-a-run40-source-before-final.jpg) records why that technically passing checkpoint was visually rejected. The corrected `final-b` native PNG removes the broad wedge while retaining the narrow blended source ink/antialias edge.

**Remaining visual limitation:** male walk frame 26 (walk position 5, original source frame 52) retains a dark wedge of the original shorts behind the near hand. This is not an authored new trouser shadow or source blur. The [actual exported-pack frame](review/known-limitations/male-walk-26-actual-pack-frame.png), [source/actual/protection crop](review/known-limitations/male-walk-26-source-actual-protection.jpg), and [pixel classification](review/known-limitations/male-walk-26-classification.json) show original dark RGBA retained inside `nearHand`, with neither garment owning those pixels; examples include native (209,552), (210,560), (213,566) and (215,573). The final assets retain this known artifact. A passing protection audit should not be read as complete visual cleanup of every garment contact.
