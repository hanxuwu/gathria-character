# Sprints 36–45: exact-look animation review

PR #36 was merged as `1f65ff9` after both GitHub checks passed. This batch adds a
complete local review workflow to the approved Kling male and female wardrobe.
The source drawings, clothing/hair banks, frame schedules, skeletal candidates
and CharacterPack/project formats stay unchanged.

## Open the workbench

Start `npm run dev`, open
`/workbench.html?character=male&mode=wardrobe` (or `character=female`), choose a
look, and press **Open look review** below the main character preview.
Opening the reviewer pauses playback. It uses the original character as the
reference, or the current pinned look if you have used **Pin current look**.

1. Choose **Review mode**: side by side, current at 50% over the reference, or
   pixel differences. Choose full body, head, shoulders, waist, hands or feet.
   Both images use the same native crop and attachment point. Left-facing views
   mirror each panel; text is never mirrored. Checker, cream and dark backgrounds
   expose different edge problems. This diagnostic view never repaints the
   actual character or affects PNG/CharacterPack exports.
2. **Scan current action** visits every timeline position. It records source
   pose IDs, holds, timestamps, opacity changes and neighboring-frame changes.
   Sort by timeline or most changed pixels, then click a result to pause at that
   exact position. Looping actions get a last-to-first comparison; one-shot jump
   has no invented wrap. The selected body-area crop affects the view only;
   scanning always covers the full canvas so moving limbs cannot escape a fixed
   crop.
3. Write a **Review note**, choose severity and **Add review issue**. The record
   keeps action, source pose, direction, region, severity and open/resolved
   status. **Go to issue** pauses and restores its action and direction;
   **Resolve issue**, **Reopen issue** and **Delete issue** manage the list. An
   issue on a repeated held pose navigates to its first occurrence in that action.
4. Notes survive reload in this browser and follow the exact current look.
   Changing clothes or hair opens that look's separate notes; undo restores the
   corresponding records. Preview direction/action and unused inventory do not
   change the identity. Imported materials with the same name but new hashes do.
5. **Export review notes** saves a portable JSON backup. **Import review notes**
   replaces the current review only after strict validation of the whole file.
   A different source, registration or look is rejected without losing notes.
   Newer edits/imports win over an older asynchronous file read. Quota, disabled
   storage and damaged saved data produce an explicit message; damaged data is
   not overwritten. Export the in-memory notes if browser storage is unavailable.
6. **Export review bundle** captures the current action/direction against the
   selected reference. It contains `review.json`, `scan.json`, `manifest.json`
   and paginated `sheets/page-*.png` pictures. This is a review ZIP, not a
   CharacterPack: use **Export CharacterPack** for the independent player.

Review notes do not include artwork. Keep **Save wardrobe** as the editable
backup and export both looks if you need to reproduce a pinned comparison later.
Pinned look/history session behavior is unchanged. Browser-data clearing removes
locally saved review notes; an exported notes JSON remains usable with the exact
same look and source.

## What a review bundle means

The manifest identifies current and reference look hashes, source and anchor
registration, aligned canvas dimensions, action, facing and difference threshold.
It lists each data file's size and SHA-256. Contact-sheet metadata maps every
row to source pose IDs, timeline positions and duration. Only consecutive copies
of the identical source pose share a row; their complete hold is retained.

Sheets are explicitly **half native size**, with box-filtered RGBA on a cream
matte and deterministic raster labels. At most four pose rows fit on each page.
This smaller viewing copy is separate from native source PNGs. Different hair
padding is aligned using a translation-only union canvas before sampling.
Clothes and body proportions are never rescaled independently.

Scans compare premultiplied color and alpha, so hidden RGB in transparent pixels
does not manufacture differences. Cyan highlights added opacity, magenta removed
opacity, amber other visible changes. A changed pixel count measures change,
**not bad art**: a deliberately different shirt will score highly. Loop seams
and temporal differences can also reflect legitimate movement. A reviewer must
still examine the actual pictures and full animation.

## Resource and compatibility limits

- At most 100 issues and 1 MiB of notes per exact look; notes have at most 2,000
  characters. Unknown fields, invalid source IDs/actions and malformed imports
  are rejected before local state is changed.
- At most 600 action positions and 4,194,304 pixels per compared frame. Scanning
  retains scalar metrics and only a small number of live images, not a complete
  RGBA animation cache. Repeated held poses reuse their measurements.
- Contact sheets allow at most 128 pose runs, 32 million total page pixels and
  64 MiB of encoded pages. The whole budget is planned before scanning/export.
- Cancellation, a changed action/direction, a different reference/look, or closing
  the reviewer invalidates in-flight work. Stale callbacks cannot replace newer
  scans or notes. A canceled scan keeps the last completed result when it still
  describes the same input.
- The local storage format is versioned separately from wardrobe and CharacterPack.
  Existing files retain their schemas and pixels. No image generation or remote
  processing is used at runtime.

## Actual evidence and remaining work

The production capture uses real male/female everyday and wedding materials with
registered hair, scans run/jump, exports review bundles and animation GIFs, then
closes the editor before loading the unchanged CharacterPacks independently.
See [capture and playback evidence](evidence/evidence-index.json) and
[decoded content checks](export-checks.json) for the actual results of this batch.
The [implementation plan](PLAN.md) maps all ten sprints to acceptance conditions.

The freshly exported standalone packs were byte-for-byte identical to the
committed [male wedding pack](../kling-look-workflow/evidence/male-wedding.character.zip)
and [female wedding pack](../kling-look-workflow/evidence/female-wedding.character.zip).
Those links provide the exact tested bytes without storing duplicate archives.
Open them in `/player.html`; the review ZIPs below are intended for inspecting
PNG pages and metadata, not loading as a playable character.

| Character | Run comparison                                                                | Jump comparison                                                                 | Review bundle                                                                             |
| --------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Male      | [Right](evidence/male-run-right.gif) · [Left](evidence/male-run-left.gif)     | [Right](evidence/male-jump-right.gif) · [Left](evidence/male-jump-left.gif)     | [Run](evidence/male-run-review.zip) · [Jump left](evidence/male-jump-left-review.zip)     |
| Female    | [Right](evidence/female-run-right.gif) · [Left](evidence/female-run-left.gif) | [Right](evidence/female-jump-right.gif) · [Left](evidence/female-jump-left.gif) | [Run](evidence/female-run-review.zip) · [Jump left](evidence/female-jump-left-review.zip) |

This batch does not repair existing artwork. Underarm/cuff joins, stepped shoulder
contours and some ear/rear-hair edges remain visible. Review records and changed
pixel counts must not be described as visual acceptance or automatic defect
elimination. The reviewer now makes these issues reproducibly addressable with
source-bound notes, exact poses and portable evidence.

Native contact-sheet exports can take around two minutes for a real dressed
character in this environment; progress and cancellation remain available. This
batch bounds that work but does not claim an export performance improvement.

Capture: `scripts/capture-kling-review-workbench.mjs`; independent content audit:
`scripts/verify-kling-review-workbench.py`. Build before capture. Use
`CHROMIUM_PATH=/usr/bin/chromium` where appropriate; capture writes actual
browser downloads and records code hashes and failures. Set
`KLING_REVIEW_WORKBENCH_DIR` to a fresh evidence directory for recapture;
`KLING_REVIEW_TEMP` selects the temporary pack folder (ignored by Git).
Saved source/pack files
are not regenerated to make the checks pass.

## Completed validation — 2026-10-24

This batch ran 296 unit tests, TypeScript/build checks and the full Chromium
suite. The first browser run had 72 passes and one failure: the optional review
module eagerly loaded the GIF module before an existing cancellation test could
intercept its lazy request. Loading the reviewer through `React.lazy` fixed the
regression. Five targeted checks and the subsequent full **73-test** run passed.
The existing asset audit was rerun for 101 old archives, four source files and
280 poses in three current garment banks. These are current results, not carried
forward historical test counts.

The real production audit passed **four review bundles, 28 embedded PNG pages,
110 scan positions, eight GIFs, four notes JSON files and two CharacterPacks
(184 poses)**. Twenty independent playback cases passed with every editor closed.
Native panel pixels and all scan metrics were recomputed from the actual pack
frames; GIF frame timings, one-shot/loop behavior and mirrored panels were checked.
Both packs were byte-identical to the merged baseline.

The full production capture preceded the lazy-entry fix. Only
`WardrobeEditor.tsx` changed afterward; the rendering, review and export modules
were unchanged. The [final-build smoke record](evidence/final-build-smoke/smoke.json)
checks that source delta, confirms deferred requests and compares **every unzipped
file** from a new real female run review bundle with the full capture, byte for
byte. It passed without browser, failed-request or external-request errors.
[Exact commands and final source hashes](test-results.json).

Direct app-exported contact pages:
[male run](evidence/male-run-right-contact-sheet.png),
[male jump](evidence/male-jump-left-contact-sheet.png),
[female run](evidence/female-run-right-contact-sheet.png),
[female jump](evidence/female-jump-left-contact-sheet.png).
These were extracted unchanged from the tested ZIPs; their entry hashes are in
the content audit. Technical checks do not replace final visual acceptance.
