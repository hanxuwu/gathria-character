# Wardrobe loading experiment: not adopted

The row-filter prototype was **not adopted**: its pixel-correct decoder change
did not demonstrate a consistent first-load improvement across both characters.
The shipping decoder was restored byte for byte; [decision.json](decision.json)
records the restored SHA-256 and the evidence hashes.

This loading phase follows the completed art checkpoint `1dc5740`. Its catalog,
source CharacterPacks, registration, and clothing bytes are the frozen art inputs
from `ec9bd75`. The earlier [browser capture](../browser/evidence-index.json) and
[export audit](../verification/exports.json) retain their original runtime hashes;
they describe the code at capture and are not relabeled as captures of the
experimental candidate.

The preserved [candidate patch](row-filter-prototype.patch) changes only the
lossless PNG decoder's row loop in
[`src/core/baked-source.ts`](../../../../src/core/baked-source.ts). The prototype chooses
the PNG predictor once per row and copies unfiltered rows directly. Compression,
CRC/Adler validation, dimension and scanline bounds, color profiles, ownership
checks, project validation, and export formats remain unchanged.

The initial read-only SSR trace put 5.61 s of a 5.75 s male original-outfit
preflight in the two source-page decodes; all 88 frame copies cost about 71 ms.
That trace identified the decoder as the useful target. Its Node timings are not
interchangeable with the production Chromium observations below.

## Verification

[Candidate validation record](validation.json): all 155 unit tests, typecheck,
production candidate build, and 15 targeted Chromium cases passed. These results
validate the experimental source hash, not a retained runtime change; no repeat
suite is claimed after restoring the byte-identical art-checkpoint source. The browser cases cover
wardrobe selection, all-pose rejection, saved projects, exports, queued landing,
and independent playback. Their [raw report](browser-tests.json) is preserved.
The [initial launch failure](browser-tests-launch-failure.json) occurred before
application execution because Playwright's bundled headless shell was absent;
the successful run used installed `/usr/bin/chromium`, as the art capture did.

[Eight-page comparison](decoder-pixels.json): the baseline and candidate decoder
agree on every one of **1,177,583,616 RGBA bytes**, plus all color-profile chunks,
across the four actual downloaded current CharacterPacks. Every decoded page also
matches the SHA-256 recorded by the completed art export audit. The comparison
used the frozen baseline decoder read from Git and the then-current candidate
function; it asserts the rest of their source module is unchanged. Decode times
in that report are shared-host diagnostics, not the isolated browser benchmark.

## Browser comparison

The [complete same-machine, eight-case comparison](browser-comparison.json)
passed all artifact, selection, and rendered-pixel checks. Chromium was
`154.0.8037.57`. Times below are seconds; both samples are retained in round order.
A negative change means the candidate was faster.

| Case                 | Baseline samples | Candidate samples | Median change     |
| -------------------- | ---------------- | ----------------- | ----------------- |
| Male original open   | 12.286, 13.279   | 12.057, 12.396    | −0.556 s (−4.35%) |
| Female original open | 13.236, 13.887   | 13.991, 13.498    | +0.183 s (+1.35%) |
| Male Everyday        | 9.390, 9.191     | 9.222, 9.864      | +0.253 s (+2.72%) |
| Female Everyday      | 8.799, 9.116     | 8.435, 8.154      | −0.663 s (−7.40%) |

Three of four baseline/candidate ranges overlap. Female Everyday is the only
case with separated ranges and improvement in both rounds. The small original-
open differences do not establish a consistent benefit across both characters;
this is why the row patch remains an experiment. A decoder-only microbenchmark
improvement is not a demonstrated application startup improvement.

The baseline is the exact production `dist` preserved before the decoder edit.
The candidate was built separately under `/tmp`; the shared art build was not
replaced. The harness verifies every catalog source, registration, and garment
against `ec9bd75`, then checks that both production outputs contain those exact
bytes. It hashes both complete output trees before and after the comparison.

Each case launches a fresh Chromium process and context with the browser HTTP
cache disabled. Two rounds reverse baseline/candidate order for both characters.
Both servers use the same loopback implementation, preload the files into memory,
and disable response caching. OS filesystem caches are not cleared. The media
renderer, export auditor, tests, and Git push finished before the timing run;
remaining work on the host was limited to small documentation updates.

Original-open time runs from navigation start to the first observed rendered
canvas, expected status, and `aria-busy=false`. Everyday time runs from the
captured preset button click to the same acceptance boundary. This is a first
clothing selection after opening the original; its source pages are already
warm. Canvas RGBA hashes and selected item IDs must match in every run.

The report also records the last required asset's `responseEnd`, time after that
transfer until ready, all status observations, resource timings, and long tasks.
Time after transfer includes parsing, validation, decoding, copying, composition,
and UI scheduling; it is not presented as pure decoding time. Small samples and
host/JIT variation limit precision. No outlier is discarded, and the report's
`passed` field describes functional/artifact checks, not a speed threshold.

## Reproduce

Use separate production builds of frozen `ec9bd75` and a checkout with the
preserved prototype applied, with the same dependencies and frozen assets.
The shipping source does not contain the prototype: apply the patch in the
experimental checkout **before its candidate build, browser run, or pixel mode**. Keep the output directories and
report filenames distinct so previous evidence is preserved.

```sh
# In the separate experimental checkout, after preserving/building the baseline:
git apply --check docs/kling-wardrobe/fit-polish/loading/row-filter-prototype.patch
git apply docs/kling-wardrobe/fit-polish/loading/row-filter-prototype.patch
npm run typecheck
node node_modules/vite/bin/vite.js build --outDir /tmp/wardrobe-load-profile/candidate-dist

CHROMIUM_PATH=/usr/bin/chromium node scripts/benchmark-kling-wardrobe-load.mjs \
  --ref=ec9bd75 \
  --baseline=/tmp/wardrobe-load-profile/baseline-dist \
  --candidate=/tmp/wardrobe-load-profile/candidate-dist \
  --rounds=2 --looks=day --output=/tmp/wardrobe-load-repeat.json

node scripts/benchmark-kling-wardrobe-load.mjs \
  --mode=pixels --ref=ec9bd75 --output=/tmp/wardrobe-pixels-repeat.json
```

The browser harness launches only after both outputs and all frozen asset hashes
pass preflight. `--looks=day,wedding` can extend preset coverage; the recorded
bounded comparison uses Everyday. The pixel mode reads the four actual export
paths from the completed export audit rather than regenerating artwork.
