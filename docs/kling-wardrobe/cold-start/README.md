# Wardrobe cold-start preparation

This batch speeds up opening the existing Kling wardrobe. It keeps the two
characters, four outfits, frame pixels, anchors, action timing and export formats
unchanged. No new artwork is generated.

Baseline: merged main `d0bf0ad`. Runtime: `c1f9a9a` on
`perf/kling-cold-start`. This is a performance review, not visual acceptance.

## Measured result

[Browser report and build inventory](browser-comparison.json): two order-balanced
rounds, eight fresh Chromium processes/contexts, HTTP cache disabled, identical
loopback servers and unchanged source/catalog hashes. This is fresh-browser cold
opening: servers preload files into memory and OS caches are not cleared.
Each case opens Original,
selects Everyday, selects Wedding and returns to Everyday. Values are medians of
two samples per character/build; raw runs and ranges are retained.

| Character | Original cold open, before → after | Change | Longest main-thread task, before → after |
| --- | --- | --- | --- |
| Male | 13.166 s → 8.223 s | −37.5% | 8.706 s → 0.171 s |
| Female | 13.773 s → 9.292 s | −32.5% | 8.772 s → 0.188 s |

Cold-open ranges do not overlap: male before 12.845–13.488 s / after
8.011–8.436 s; female before 13.693–13.853 s / after 9.168–9.416 s.
Measured main-thread blocking time (sum of each long task's duration above
50 ms) falls from 12.080 s to 0.133 s for male and 12.644 s to 0.156 s for female.
This describes UI blocking, not total CPU consumption: the workers still do work.
All four production candidate loads start three source workers (one archive,
two PNGs); all terminate after preparation without errors.

The first drawn character canvas and fully ready state remain effectively
simultaneous, at 8.223 s / 9.292 s median. This is observed after application pixel
drawing and metadata assignment, not a hardware display timestamp. There is no
early placeholder used to make this metric look faster.

| Character | Operation | Before | After |
| --- | --- | ---: | ---: |
| Male | First Everyday | 5.391 s | 5.713 s |
| Male | First Wedding | 7.204 s | 7.496 s |
| Male | Return to Everyday | 0.207 s | 0.181 s |
| Female | First Everyday | 5.231 s | 4.844 s |
| Female | First Wedding | 5.492 s | 5.466 s |
| Female | Return to Everyday | 0.168 s | 0.175 s |

This batch does **not** claim faster garment selection: male first-use selection
is 4–6% slower in these samples, while female varies from −7.4% to −0.5%.
Garment work remains on the main thread and can still cause roughly 1.4–1.9 s
tasks. Revisit remains under 0.2 s in all candidate samples. These small local
samples demonstrate a cold-start improvement, not broad-device performance.
The captured idle frame 0 after Original/Everyday/Wedding/revisit has identical
canvas RGBA hashes across builds. Full-atlas/raw-pixel parity is checked separately
through actual exports below.

## Implementation

- `src/core/baked-source.ts`: adds bounded native zlib stream decompression.
  Structure, CRC, dimensions, row count, Adler checksum and PNG filtering remain
  checked. Raw RGBA, hidden RGB, partial alpha and color chunks are retained;
  there is no Canvas decoding or color conversion. The synchronous public decoder
  and its pixel reconstruction remain available.
- `src/core/source-preparation.ts` and its worker: parse a cold source ZIP and
  decode its PNGs in short-lived module workers. Transfer private input copies
  and owned output buffers; terminate workers after completion or cancellation.
  A worker's invalid-asset response fails the load. Only worker infrastructure
  failures fall back to the same checked readers on the main thread.
- `src/wardrobe/project.ts`: retains the existing content-hashed private source
  cache and registration checks while awaiting cold ZIP preparation. Each cached
  PNG owns exactly its retained bytes. Strict import cannot be disabled through
  the new cancellation options.
- `src/wardrobe/compositor.ts`: asynchronously prepares a missing source page
  before checking its poses. Every required pose still receives protection and
  ownership checks before an appearance is accepted. Existing garment caches,
  composition and synchronous export paths remain intact.
- `src/wardrobe/WardrobeEditor.tsx`: shows actual artwork/pose preparation phases
  and cancels superseded or unmounted preparations. A previous accepted outfit
  remains available if a replacement fails. Controls wait for complete validation.

The first character canvas still appears after all-pose validation. There is no
placeholder substituted for a fully prepared character.

## Verification

[Current checks](checks.json): 180 unit tests across 13 files, 18 Chromium browser
tests, TypeScript and production build passed in this batch. New cases cover
exact native decode, malformed compressed streams and PNG filters, transferable
buffer ownership, cancellation/late replies, worker failure fallback, real
browser-worker loading, disabled pending controls, and bad-source retry.

Browser timings and complete export verification are captured separately so
export, test and build workloads do not interfere with the performance comparison.

[Actual production export evidence](exports/evidence.json):

- Four presets saved and reopened with action/direction settings. All four actual
  CharacterPack downloads are **byte-identical** to the retained fit-polish packs.
  ZIP CRCs, eight decoded RGBA pages (1,177,583,616 bytes), color profiles and full
  metadata match. This includes all frames, alpha and action timing.
- Six mixed-clothing PNGs match pixel for pixel. Switching male → female → male
  → female restores both open outfits and their exact canvas pixels after cache
  eviction. All eight measured revisit intervals independently show no catalog
  asset refetch.
- After closing the editor context, four fresh independent-player contexts load
  the downloads and run all five actions in both directions: **40 playback
  checks**, including loop wrap and one-shot jump recovery. This capture observes
  every expected position; there are no recorded missing positions, browser
  errors, external requests or authoring dependencies.
- Eight actual screenshots were decoded and visually inspected for loaded
  characters, correct selection and independent display. This demonstrates
  preservation, not an improvement to the artwork itself.

| Outfit | Workbench | Independent player, run left |
| --- | --- | --- |
| Male Everyday | [Open](exports/male-day-workbench.png) | [Open](exports/male-day-independent.png) |
| Male Wedding | [Open](exports/male-wedding-workbench.png) | [Open](exports/male-wedding-independent.png) |
| Female Everyday | [Open](exports/female-day-workbench.png) | [Open](exports/female-day-independent.png) |
| Female Wedding | [Open](exports/female-wedding-workbench.png) | [Open](exports/female-wedding-independent.png) |

Newly downloaded ZIPs remain temporary because they exactly duplicate existing
deliverables: [male Everyday](../fit-polish/exports/male-day.character.zip),
[male Wedding](../fit-polish/exports/male-wedding.character.zip),
[female Everyday](../fit-polish/exports/female-day.character.zip),
[female Wedding](../fit-polish/exports/female-wedding.character.zip).
The [actual-export animation GIFs](../fit-polish/README.md) remain the visual
review; their underlying exported artwork is unchanged.

## Remaining limits

- This improves source preparation; initial clothing decoding/validation and
  synchronous export still have main-thread work. It does not promise instant
  opening or remove every long task.
- Workers require normal module-worker loading. A host that blocks them retains
  checked fallback behavior, but may experience more main-thread blocking.
- Caches are session-local. Refreshing starts cold; changing characters can evict
  source pages. Budgets limit retained cache storage, not peak browser memory.
- These measurements target desktop Chromium. Slow networks, memory-constrained
  devices and other browser engines need separate measurement.
- The existing [clothing visual limits](../fit-polish/README.md) remain unchanged.

## Reproduce

Build baseline `d0bf0ad` and runtime `c1f9a9a` into separate output directories,
using the same lockfile and no other heavy jobs during timing:

```sh
CHROMIUM_PATH=/usr/bin/chromium node scripts/benchmark-kling-wardrobe-load.mjs \
  --baseline=/path/to/before/dist --candidate=/path/to/after/dist \
  --ref=d0bf0ad --rounds=2 --looks=day,wedding --revisit=day \
  --output=/tmp/cold-start-comparison.json

CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-kling-loading-exports.mjs \
  --build=/path/to/after/dist --output=/tmp/cold-start-exports \
  --benchmark=/tmp/cold-start-comparison.json \
  --downloads=/tmp/cold-start-downloads
```

The scripts preserve earlier reports. Production build inventories, unchanged
catalog/art hashes, raw timings, canvas hashes and playback traces are retained
for review. Historical loading-reuse results are not counted as this batch's tests.
