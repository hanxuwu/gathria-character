# Actual full-outfit browser capture

Captured the production build at commit `56d1448c25bfe0cea3b7a05003cd7f5192abeedb` between 2026-10-21 19:59:20 and 20:08:03 UTC.

- `evidence-index.strict.json` is the byte-identical original report. Its strict `passed` value is `false`: all workflows completed, then the final console check rejected one missing `/favicon.ico` request.
- `evidence-index.json` is an explicitly derived reviewed report. It preserves the capture observations, records `rawStrictPassed: false`, references the raw report SHA-256, and records the sole favicon exception. Its `passed: true` means the independently reviewed functional postconditions passed; it does not relabel the original capture as a strict pass.
- Reproduce the review with `node scripts/review-kling-full-outfits-capture.mjs`. It verifies all input/artifact hashes, the complete action/facing matrix, source frame order, queued transitions and landing behavior, and all final counts. It also probes the exact icon URL against the unchanged production build to corroborate its HTTP 404.

The completed capture contains four projects saved/reopened, four CharacterPacks, four legacy project pixel comparisons, 28 primary native pose PNGs, six mixed-outfit PNGs, 40 independent playback cases, 16 queued transitions, eight screenshots and four browser recordings. All independent playback ran after every editor context was closed. Every downloaded PNG/ZIP and recorded WebM was decoded; primary PNGs were compared byte-for-byte as RGBA pixels with their exported pack frames.

The source timing remains 24 fps. No playback case missed a frame position across its observation window. The raw observations still include a 128.3 ms interval during male everyday idle and a 134.6 ms interval during female everyday jump-to-walk observation. These records describe the shared capture host and do not guarantee uninterrupted frame delivery on every device. The recordings contain complete sessions without trimming or frame replacement.

`attempt-1/` and `attempt-2/` preserve deliberately stopped earlier captures. Their `STOP_REASON.md` files explain the intervening semantic hand-edge and trouser/shoe ownership corrections. Their exports are not final deliverables. `recording-source/` retains the original Playwright video files; the named independent WebM files are identical saved copies.

Functional verification is separate from artistic acceptance. Actual final PNG/GIF reviews and remaining visual limitations are documented in the parent full-outfits review.
