# Background preparation and complete source-page warm-up

This iteration preserves native pixels, PNG profiles, binary ownership, existing
source/garment identities, every validation check and all animation timing.
The comparison uses identical frozen `16fb140` assets on both sides, independent
of the visual garment repairs made in the same branch.

## Why the first attempt was insufficient

The [paired-page-only trial](paired-page-trial.json) moved strict clothing PNG
stream validation, two raw RGBA decodes and ownership scanning into disposable
workers. All native frames matched, but first readiness and worst UI stalls did
not improve. That trial is recorded, not presented as a successful optimization.

A subsequent Chromium CPU profile identified two remaining causes:

- `readBoundedArchive` still synchronously inflated and CRC-checked clothing and
  appearance ZIPs on the main thread. The [profile](female-load.cpuprofile)
  and [top functions](profile-top-functions.json) identify the callers. These
  diagnostic samples are not an independent timing benchmark.
- Both side-view source packs contain **three atlas pages**, but the compositor
  cache retained only two. Validating the final jump page evicted page zero;
  the first visible idle frame then decoded that large page synchronously.

## Final change

- Clothing and appearance archives now use the existing source worker transport
  with the **same bounded archive reader**: exact path allowlist, expanded byte
  bounds, directory checks, decompression validation and CRC checks remain.
- Paired patch/ownership PNGs use the shared strict codec in a disposable garment
  worker. Raw RGBA/color chunks and compact binary ownership return by transfer.
  Public/project buffers never detach. The existing garment cache only accepts
  successful complete validation while the request is still active.
- Source pages retain up to four entries (the portable format maximum) within
  the unchanged **96 Mi-pixel** ceiling. The garment cache remains 256 MiB / eight
  pages. This fixes idle → jump → idle re-decoding without changing artwork.
- Aborting a load terminates its worker and ignores late replies. A worker asset
  rejection is final. Worker construction/transport failures use the identical
  validators locally; fallback is functional but can still block the UI.

## Reproduce

```sh
node scripts/benchmark-kling-side-garment-workers.mjs \
  --baseline-ref=16fb1405239188a453d66cda94927106028eefbf \
  --rounds=2 --output=/tmp/new-worker-measurement.json
```

The runner freezes runtime text and baseline asset bytes for both isolated Vite
servers, uses separate caches/ports, alternates comparison order, and disables
HTTP caching. Every sample has a fresh Chromium context. It measures actual UI
readiness/main-thread long tasks/heartbeat gaps separately from pipeline stages.
It asserts exact native canvas pixels, all 209 dressed source-frame RGBA hashes,
asset identities, complete per-frame validation progress, and real worker usage.
It does not use the CPU profiler during measurements.

## Final measurements — 2026-10-29

The [final raw report](final-workers.json), [console record](final-workers.log)
and [summary](summary.json) cover 18:12:46–18:14:51 UTC: two order-balanced
samples per character/version, eight fresh UI contexts and eight independent
pipeline contexts. All 209 native frame hashes, source/garment/appearance
identities, UI frame-zero canvases and complete validation progress matched.
The ten relevant runtime module hashes were unchanged after measurements.

| Character | Median ready before → after | Median longest UI task before → after | Worst measured task after |
| --- | --- | --- | --- |
| Male | 7.455 s → 6.957 s (−6.7%) | 824 ms → 92 ms (−88.8%) | 101 ms |
| Female | 8.062 s → 7.716 s (−4.3%) | 1014 ms → 97 ms (−90.4%) | 98 ms |

Readiness improves modestly; the stronger result is substantially shorter UI
stalls. Individual pipeline stages may be slower because workers must start
and transfer buffers. The final cache fix avoids a large synchronous page-zero
decode at first display, so isolated stage timings do not sum to the UI gain.
Remaining measured tasks exceed 50 ms; this is improved responsiveness, not a
claim of a completely stall-free UI. See raw heap values; no memory gain is claimed.


## Checks and limits

The scoped run passed **89 tests across six files**; [unit log](unit.log) and
[typecheck](typecheck.log). This total includes existing tests and is not added
to overlapping integration totals. New cases cover raw RGBA/hidden RGB/profile
preservation, immutable inputs/policies, strict fallback, malformed data,
transport failure, cancel/late reply, aborted cache admission, three-page
retention, four-page LRU and the unchanged pixel budget.
`tests/e2e/side-loading-workers.spec.ts` separately exercises real worker
cancellation and strict browser/fallback parity; the integration report records
its run rather than assuming a pass from the presence of the test.

This does not make every operation interruptible: ownership/pose composition,
manifest parsing and some buffer copies still run on the main thread. The source
working set can now retain a third/fourth page, increasing retained memory within
its existing ceiling. No reduced-memory claim is made. Very large third-party
working sets can still exceed caches and need decoding again. Cold load timings
are local observations on this Chromium/Vite environment, not device-wide SLAs.
