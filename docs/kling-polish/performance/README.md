# Preparation performance — this batch

Before: production build of main `0103b5c`. After: production runtime containing
`86e4196` and the PNG codec change `49cdbd3`. The same current catalog and artwork
were served to both builds (catalog SHA is recorded in `comparison.json`); new
hair shading is not a timing confound. Existing built asset URLs are retained,
and the older build resolves new bank paths through the common repository server.

Eight fresh Chromium contexts, HTTP cache disabled, two order-balanced rounds.
No export/render/test job ran concurrently with the measured runs. Each UI-ready
stage captures exact canvas RGBA. All four stages for both characters match
across builds/rounds, including reset and repeated selection. Measurements use
this environment and local serving, not a network/mobile performance promise.

| Character | Stage | Before median | After median | Difference |
| --- | --- | --- | --- | --- |
| male | Original source ready | 8.73 s | 8.64 s | -0.09 s |
| male | First outfit | 5.77 s | 3.93 s | -1.84 s |
| male | First hairstyle | 12.93 s | 9.00 s | -3.93 s |
| male | Reset hairstyle | 2.05 s | 1.96 s | -0.10 s |
| male | Repeat hairstyle | 1.96 s | 2.09 s | +0.13 s |
| female | Original source ready | 10.66 s | 9.71 s | -0.95 s |
| female | First outfit | 5.93 s | 3.80 s | -2.13 s |
| female | First hairstyle | 59.40 s | 32.69 s | -26.71 s |
| female | Reset hairstyle | 5.68 s | 5.51 s | -0.17 s |
| female | Repeat hairstyle | 18.69 s | 10.84 s | -7.86 s |

First outfit preparation is about 32% faster for male and 36% for female;
first hairstyle about 30% and 45% faster. Female repeat selection is also faster.
Male repeat selection is **slightly slower**, 1.96 → 2.09 seconds in these two
samples. That 0.13 s result is retained; this is not a claim that every operation
improves. First female hair selection still takes about 33 s and is a remaining
UX limit. Source opening is measured separately from preparation.

The diagnostic development CPU profile found ~47.9 s of a ~65.8 s female first
hair selection in repeated PNG decoding, with substantial fflate buffer copying.
The synchronous lossless codec now uses pako's bounded 64 KiB output blocks.
It retains dimensions/CRC/Adler/filter/row-count checks and rejects trailing or
truncated zlib streams. Raw RGBA unfiltering and hidden RGB/partial alpha are
unchanged. It does not use browser color conversion, increase the page cache,
remove source protection or skip whole-pose validation.

The profile was collected during development and is diagnostic, not the paired
production benchmark. `female-before.cpuprofile` and `profile-summary.json`
retain it; `comparison.json` has every production sample and long-task record.

Reproduce from saved before/after production build directories:

```sh
node scripts/benchmark-kling-appearance.mjs \
  --before=/path/to/baseline-dist --after=/path/to/candidate-dist \
  --catalog=docs/kling-wardrobe/catalog.json \
  --output=/path/to/new-performance-report.json
```

Use an output that does not already exist. Keep the machine otherwise idle and
leave both build directories and the common catalog/artwork unchanged.
