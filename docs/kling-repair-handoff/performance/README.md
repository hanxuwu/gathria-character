# Review export performance: a rejected cache trial and safe scan reuse

The baseline is PR #37 (`8578df1`). The workload uses the actual female Kling
source, V8 coral/ivory dresses and Ribbon pony V5 bank, right-facing run, all
16 source poses. It constructs both real registered compositors and runs the
same full scan and four-page PNG export in Chromium. Source/material hashes,
exact scan JSON, PNG hashes and page timings are retained in each report.
Preparation/import time is excluded; this is not an end-to-end UI benchmark.

## Trial and results

The initial hypothesis was that alternating reference/current compositors might
thrash their shared garment-page LRU. A local candidate grouped reference
rendering in bounded batches: at most 32 MiB of native reference pixels for a
scan and 16 MiB of compact tiles for contact sheets. It did not enlarge the
shared cache and kept the same cancellation and existing sheet limits.

| Measurement                                  | Baseline | Batched trial |
| -------------------------------------------- | -------: | ------------: |
| Separate fresh browsers, scan + sheets       |  18.28 s |       24.08 s |
| Same browser A/B/B/A, first run per variant  |  19.34 s |       20.85 s |
| Same browser A/B/B/A, second run per variant |  15.38 s |       21.62 s |
| Paired mean                                  |  17.36 s |       21.24 s |
| Look switches                                |       62 |             5 |

All four PNG page bytes, row metadata and scan JSON remained exact. Fewer look
switches did **not** improve elapsed time; the paired mean regressed about 22.4%.
The working sets and ordering are more complicated than a simple switch-count
model. No cache-thrashing speedup is claimed.

**The trial was rejected.** The retained `review-analysis.ts`, `review-sheets.ts`
and their tests were restored byte-for-byte to PR #37. No extra reference-image
buffers or changed render order ship. The candidate remains reviewable in
[rejected-batching.patch](rejected-batching.patch); its experimental 24 focused
tests passed before rejection, while the retained original 19 checks also passed.

## Accepted workflow optimization

The workbench can already have a successful scan immediately before the user
exports a review bundle. The accepted change reuses that scalar result only
when comparison object, action and threshold still match exactly. Existing
invalidation clears it on source/look/reference/action/direction changes or
when preparation starts. Failed/canceled scans never replace the accepted one.
It stores no rendered images and does not change output or portable schemas.

The paired baseline scan stage cost 7.34–10.82 seconds. Reusing that already
completed result avoids that redundant work for this workflow. That is a stage
measurement, **not** a promised end-to-end speedup or proof that every export
will finish within a specific time. First exports and changed inputs still scan.
Root integration/browser evidence verifies the actual accepted UI path separately.

## Reproduce

- [Fresh baseline](before.json), [fresh trial](after.json),
  [paired runs](paired.json), [decision](conclusion.json).
- `scripts/benchmark-kling-review-batching.mjs` serves the immutable PR #37
  functions with a benchmark-only Vite query transform and compares them with
  the working tree. Asset generation and image modification are not involved.
- For a current retained-code measurement, set a fresh `KLING_REVIEW_BENCH_LABEL`
  and run with `CHROMIUM_PATH=/usr/bin/chromium`. Existing reports cannot be
  overwritten.
- To replay the rejected A/B/B/A experiment, use an isolated checkout of PR #37,
  apply `rejected-batching.patch`, copy the benchmark script, and run with
  `KLING_REVIEW_BENCH_PAIRED=1` plus a fresh label. Paired mode refuses to label
  two identical baseline implementations as a trial. It also checks exact PNG
  and scan equality before writing a completed report.

Each run has an eight-minute upper bound, closes the browser/server and records
input code hashes. Host load, warmed decompression caches and JIT state affect
elapsed time; the paired ordering reduces but does not eliminate those effects.
