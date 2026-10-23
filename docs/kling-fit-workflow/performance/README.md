# Production preparation measurements

Two order-balanced runs per build and character on this workspace, Chromium,
HTTP cache disabled. Both builds use the same in-memory catalog snapshot and
unchanged source/outfit/hair bytes. Native preview RGBA matches at every measured
stage. The selected outfit is the existing Everyday preset; new cuff artwork is
not used to manufacture a speed difference.

| Median seconds | Main / before | Candidate / after |
| --- | ---: | ---: |
| Male original ready | 8.16 | 8.00 |
| Male first outfit | 3.52 | 3.74 |
| Male first hair | 8.79 | 8.62 |
| Male reset hair | 1.73 | 1.78 |
| Male repeat hair | 1.88 | 1.83 |
| Female original ready | 9.44 | 8.96 |
| Female first outfit | 3.64 | 3.55 |
| Female first hair | 31.01 | 28.96 |
| Female reset hair | 5.17 | 5.22 |
| Female repeat hair | 9.90 | 9.34 |

The row-filter specialization is retained for the modest female improvement;
it does not make first preparation instant. Male first outfit and resets are
slightly slower in this sample. Two local samples do not establish a broad
device guarantee or a meaningful male speedup.

[Raw samples](comparison.json) · [summary](summary.json).
Reproduce with `scripts/benchmark-kling-appearance.mjs --before=<baseline-dist>
--after=<candidate-dist> --catalog=docs/kling-wardrobe/catalog.json
--output=<new-report.json>`. Use production builds, a fresh output and no
concurrent art builds/browser captures. Input pixels, bounded caches and all
integrity validation remain unchanged.

The local-byte saved-look restore is validated separately with garment network
requests blocked. It saves downloads of retained materials, not the initial
source or application download.
