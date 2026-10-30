# Side-view source loading

The side-view catalog now fetches independent compressed inputs concurrently.
Strict source, registration, clothing and appearance validation still runs through
the original project importers; pixel decoding remains serial. No animation,
artwork, project format or export path was changed by this optimization.

Only the two approved source ZIPs are cached in application memory. The private
cache is keyed by URL and expected SHA-256, verifies bytes before admission,
and retains at most two entries / 32 MiB. Callers receive independent copies.
The cache does **not** retain decoded frames or entire wardrobe projects.
Existing importer and renderer caches are unchanged.

Clothing, registration and hair are fetched with HTTP revalidation on every
catalog open. They are never put in the frozen-source cache. Updating a fitting
registration cannot silently reuse a stale bank; mismatched inputs still fail
strict validation. Concurrent readers share a source request, but cancelling one
reader does not cancel another. Cancelling the final reader aborts transport and
removes the pending entry immediately; failed, corrupted and abandoned requests
are not retained.

This trades up to 32 MiB of retained compressed source bytes for fewer downloads
and source fingerprint passes. The current pair occupies approximately 24.4 MiB.
It is **not** a lower-memory claim or an instant first-load solution: cold PNG,
ownership and full-frame composition checks still dominate local readiness.

## Reproduce

```sh
npm run test -- src/side-view/source-cache.test.ts
node scripts/benchmark-kling-side-loading.mjs \
  --baseline-ref=4fd27f9 \
  --asset-ref=4fd27f9 \
  --output=/tmp/side-loading-new-report.json \
  --rounds=2 --ui=true
```

The benchmark runs real Chromium against Vite development modules. It substitutes
only the catalog loader from the baseline commit and serves the same coherent,
frozen asset bytes to both implementations. Those inputs intentionally come from
the recorded PR #53 review checkpoint, not partially rebuilt art on disk. Final
current-art visual/export acceptance is separate from this timing experiment.

Two order-balanced rounds use fresh browser contexts with HTTP cache disabled.
Catalog timing stops after a validated `WardrobeProject` has been created;
UI timing includes real compositor/preflight and the usable workbench. Every
load records exact source/registration/garment/hair hashes. Deliberate mutation
of returned source bytes and project settings must not leak into another load.
The UI test pauses at the same source frame and compares complete canvas RGBA
hashes between loader versions.

Optional `--latency-ms=150` adds a labeled, fixed per-asset server delay. This is
a controlled request-latency experiment, **not** a real mobile-network benchmark.
Browser JS heap readings are reported as observations only; they omit GPU and
native decoder memory and vary with garbage collection. Local measurements are
not a device-wide performance guarantee.

The ten unit tests cover shared loading, caller isolation, independent aborts,
all-reader cancellation/retry, failure and integrity rejection, changed hash
identity, byte/count bounds, public mutation, and transport bounds. They do not
certify the visual quality of source masks or clothing.

## Preservation and transfer result

[Timing-free browser evidence](preservation-and-requests.json) records 24 real
catalog loads and 20 same-frame UI canvas checks across two order-balanced rounds.
Source, registration, garment and appearance bytes and returned project documents
match between loader versions. Public mutation probes do not leak. The same
paused UI frame has identical RGBA in both versions at every measured stage.

Each revisit changes five asset requests to four. The avoided source transfer is
12,927,575 bytes for male or 12,659,941 bytes for female, with HTTP cache disabled.
Garment, registration and hair requests remain present. The source cache lasts
for the current module/page lifetime; it is not persistent disk storage.

This completed trial had a development-only UI copy hot reload during one sample,
so its timing and heap measurements are deliberately excluded from the retained
proof. It establishes byte preservation and avoided requests, not a speedup
percentage. Subsequent benchmarking disables file watching, uses separate Vite
optimizer caches, and rejects the run if any runtime source hash changes.

## Final quiet benchmark

[Raw final report](final-benchmark.json) · [summary](summary.json).
The final run completed at 11:37–11:40 UTC on 2026-10-29, after the heavy export
and browser QA jobs had finished. It passed all 24 catalog loads, 20 same-frame
UI comparisons, mutation-isolation checks and the 110-file runtime hash freeze.
No hot reload or runtime code change occurred. This is the accepted timing run;
earlier interrupted/contended trials are not used in the figures below.

Each number is the median of two order-balanced samples, in seconds:

| Validated catalog import                     | Before | After |
| -------------------------------------------- | -----: | ----: |
| Male first tailored collection               |  3.999 | 4.043 |
| Female first tailored collection, after male |  4.412 | 4.255 |
| Return to male tailored collection           |  0.707 | 0.597 |
| Switch male to material collection           |  1.093 | 0.954 |
| Return male from material to tailored        |  0.724 | 0.601 |
| Return to female tailored collection         |  1.552 | 1.417 |

| Actual usable workbench, including compositor/preflight | Before | After |
| ------------------------------------------------------- | -----: | ----: |
| Male first open                                         |  9.177 | 8.724 |
| Female first open, after male                           |  8.623 | 8.617 |
| Return to male                                          |  3.711 | 3.770 |
| Switch male to material collection                      |  3.787 | 3.861 |
| Return male from material to tailored                   |  3.074 | 2.867 |

The reliable benefit is avoiding a repeated 12–13 MB source request and reducing
warm catalog work. Complete UI preparation shows mixed results: two transitions
were slightly slower in this sample, and female first-open time was essentially
unchanged. These measurements do not establish a general cold-start speedup.
Strict PNG/ownership validation and full-frame preflight still dominate readiness.

Sampled browser JS heap ranges were 195–431 MiB before / 206–429 MiB after for
catalog loads, and 281–554 MiB before / 336–677 MiB after for the UI. These are
unforced-GC observations, not measured process peaks or proof of memory savings.
The new cache deliberately retains 24.4 MiB for this pair (32 MiB maximum);
existing decoded artwork and preflight working sets remain much larger. The
optimization trades bounded retained memory for fewer transfers, and does not
claim to reduce total memory or decoded-artwork preparation cost.
