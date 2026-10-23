# Rejected preparation-order experiment

`page-order.patch` groups appearance ownership validation by decoded atlas page
and all-pose preparation by page working set. All validation was retained; the
36 targeted unit tests and production build passed for the experiment.

Two order-balanced Chromium production-build rounds used identical assets with
HTTP cache disabled. See `../performance.json`. Mean first hair preparation:

| Character | Released runtime | Experimental runtime |
| --- | ---: | ---: |
| Male | 12.73 s | 12.30 s |
| Female | 58.86 s | 62.65 s |

Repeated hair selection: male 1.95 → 1.82 s; female 18.48 → 18.90 s.
Native idle-frame RGBA hashes matched at every measured stage, in both rounds.
These are measurements on this workspace, not general device guarantees.
The female regression outweighs the small male gain. **The patch is rejected;
final runtime retains the released validation, cache limits and preparation
order.** Final regression testing therefore applies to the retained runtime,
not this experiment. No broad loading-speed improvement is claimed.

Next prerequisite for a meaningful speed change is a profile of the large
female atlas decoding/verification work. Skipping integrity checks or raising
the bounded cache is not part of this batch.
