# Wardrobe loading reuse

This batch removes duplicate clothing decode and ZIP parsing in the existing
Kling wardrobe. The four outfits, source artwork, anchors, animation timing,
selection workflow and exported formats are unchanged.

Baseline: merged main `93d2034`. Runtime implementation: `562827b` on
`perf/kling-wardrobe-loading`. This is a performance review, not new artwork or
user visual acceptance.

## Measured browser result

[Complete timing and build inventory](browser-comparison.json): two order-balanced
rounds, eight fresh Chromium processes/contexts, disabled browser HTTP cache,
identical loopback servers, unchanged catalog and asset hashes. Each case opens
Original, selects Everyday, selects Wedding, then returns to Everyday. Values are
medians of two samples per character/build; all raw runs and ranges are retained.

| Character | Operation                |   Before |    After | Change |
| --------- | ------------------------ | -------: | -------: | -----: |
| Male      | Original cold open       | 12.925 s | 12.526 s |  -3.1% |
| Male      | First Everyday selection |  9.463 s |  5.486 s | -42.0% |
| Male      | First Wedding selection  | 14.003 s |  7.031 s | -49.8% |
| Male      | Return to Everyday       |  2.468 s |  0.153 s | -93.8% |
| Female    | Original cold open       | 14.074 s | 13.357 s |  -5.1% |
| Female    | First Everyday selection |  8.359 s |  4.808 s | -42.5% |
| Female    | First Wedding selection  | 10.336 s |  5.823 s | -43.7% |
| Female    | Return to Everyday       |  2.019 s |  0.168 s | -91.7% |

First clothing selection is **42–50% faster** in this sample. Returning to an
already-used look is **92–94% faster**. First and return previews have identical
native canvas RGBA hashes. The small Original-open difference is not credited to
this change: original source parsing and decoding were not optimized. That still
takes roughly **12–14 seconds** on this machine. These local measurements do not
predict network/mobile timings, and two samples are not a broad-device benchmark.

## What changed

- `src/wardrobe/project.ts`: hash a copied garment ZIP before lookup; retain its
  checked files in a private LRU capped at 64 MiB / 16 archives. Copy each stored
  entry on insertion and return, so caller-owned byte arrays cannot poison it.
  Revalidate the manifest against the current character/registration on every read.
- `src/wardrobe/garment-pages.ts`: share the exact decoded RGBA patch and compact
  ownership alpha between import validation and composition. Retain the existing
  8-page / 192 MiB decoded budget, now including color-profile bytes. A preview
  decode and a strict successful import remain distinct states. APNG, complete
  compression streams, binary ownership and out-of-mask artwork still undergo the
  required checks; strict success is recorded only after those pass.
- `src/wardrobe/compositor.ts`: consume those internal decoded pages instead of
  decoding the same PNGs again. Source RGBA decoding, all-pose head/hand protection,
  pixel replacement, color-profile matching, appearance validation, cancellation
  semantics and frame/export copying are unchanged.

No cache trusts a supplied garment ID or `item.sha256`. The compositor still
normalizes authoritative ZIP bytes before use. Changed bytes produce a different
key; changed registration/selection still receives its own appearance preflight.
Import and persistence cannot promote a shallow preview into strict validation.
There is no runtime image API or persistent cache upload.

## Verification and actual outputs

Executed in this batch (not inherited test counts):

- [Checks](checks.json): TypeScript, production build, **161 unit tests** across
  12 files and **15 Chromium E2E tests** (wardrobe + baked playback), all passed.
  New regression coverage includes stored/compressed ZIP mutation isolation,
  same-ID changed content, current registration binding, malformed ownership and
  shallow APNG preview caches that must still fail strict import/save.
- [Actual production UI capture](exports/evidence.json): four preset projects
  saved and reopened with their chosen action/direction; all four resulting
  **CharacterPack ZIPs are byte-identical** to the retained fit-polish outputs.
  Eight decoded RGBA pages (1,177,583,616 bytes), color profiles and complete
  metadata also match. Six mixed-shirt/trouser PNGs match pixel for pixel.
- Switching male → female → male → female exercises bounded-cache eviction;
  both restored sessions retain exact canvas pixels and clothing selections.
- After closing the editor context, four fresh standalone-player contexts run
  all five actions in both directions: **40 playback checks**, including loop
  wrap, valid frame IDs and one-shot jump recovery. No authoring modules are
  requested. One female/day/jump-left observation missed two frame positions;
  this scheduling gap is retained in the trace, not presented as exhaustive
  display-frame capture. Every atlas frame is covered by the full RGBA audit.
- The timing report's eight return-to-Everyday intervals are independently
  audited against _all_ recorded catalog-resource requests: no clothing asset
  refetch, unchanged first-use/return canvas pixels and selection.

Actual workbench and standalone screenshots:

| Outfit          | Workbench                                    | Independent player, running left               |
| --------------- | -------------------------------------------- | ---------------------------------------------- |
| Male Everyday   | [Open](exports/male-day-workbench.png)       | [Open](exports/male-day-independent.png)       |
| Male Wedding    | [Open](exports/male-wedding-workbench.png)   | [Open](exports/male-wedding-independent.png)   |
| Female Everyday | [Open](exports/female-day-workbench.png)     | [Open](exports/female-day-independent.png)     |
| Female Wedding  | [Open](exports/female-wedding-workbench.png) | [Open](exports/female-wedding-independent.png) |

The newly downloaded ZIPs stay temporary because they are exactly the same files
already delivered: [male Everyday](../fit-polish/exports/male-day.character.zip),
[male Wedding](../fit-polish/exports/male-wedding.character.zip),
[female Everyday](../fit-polish/exports/female-day.character.zip),
[female Wedding](../fit-polish/exports/female-wedding.character.zip).
Existing [actual-export GIFs](../fit-polish/README.md) remain the animation review.
Screenshots were visually inspected for loaded content, wardrobe selection and
standalone display. This verifies preservation, not a new artistic improvement.

## Remaining limitations

- First source decode is still expensive and runs on the main thread. This batch
  does not claim instant cold open or eliminate all long tasks; no worker or PNG
  decoder experiment is shipped.
- Caches last only for this page session. Refreshing starts cold; switching between
  the two large source characters can evict decoded pages and require re-decoding.
- The budgets bound retained internal caches, not total browser memory. The new
  archive cache can retain up to 64 MiB in addition to the existing pixel caches.
- Existing garment seam/shading and source-motion limits remain those documented in
  the [fit-polish review](../fit-polish/README.md). No cosmetic change is made here.

## Reproduce

Build baseline `93d2034` and candidate `562827b` into separate directories with the
same dependency lockfile. Then run from the candidate checkout:

```sh
CHROMIUM_PATH=/usr/bin/chromium node scripts/benchmark-kling-wardrobe-load.mjs \
  --baseline=/path/to/before/dist --candidate=/path/to/after/dist \
  --ref=93d2034 --rounds=2 --looks=day,wedding --revisit=day \
  --output=/tmp/wardrobe-loading-comparison.json

CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-kling-loading-exports.mjs \
  --build=/path/to/after/dist --output=/tmp/wardrobe-loading-exports \
  --downloads=/tmp/wardrobe-loading-downloads
```

The scripts refuse to overwrite prior reports. Browser timings run without other
build/test/export jobs; functional export capture is separate from timing. The
PNG decoder is the original shipping implementation; the previously rejected
[row-filter experiment](../fit-polish/loading/README.md) remains historical only.
