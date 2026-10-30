# Cold-load validation scheduling

The first-load change keeps the same strict import and all-frame composition
checks. It replaces unconditional per-pose `setTimeout(0)` waits with an
8 ms cooperative work budget in appearance-bank ownership validation and
wardrobe look preflight. Browser nested timers can impose about 4 ms of delay
on every tiny pose; grouping inexpensive work avoids paying that delay hundreds
of times while still yielding during sustained work.

`src/core/cooperative-yield.ts` invokes the caller's existing cancellation check
before and after a yield. The source/garment hashes, PNG validation, ownership
limits, progress counts and cache admission rules remain intact. No partially
validated project becomes visible or exportable, and no new cache is added.
The work budget is not a maximum task-duration guarantee: one existing PNG decode
or one frame composition remains synchronous and cannot be interrupted mid-call.

## Reproduction and evidence

```
node scripts/benchmark-kling-side-first-load.mjs \
  --baseline-ref=220ea2fd7588c1fe784c8454d66469d60fba096a \
  --rounds=2 --output=/tmp/first-load-new.json
```

The script freezes the same baseline asset bytes for both versions. Only the
appearance-bank/compositor scheduling code is switched; the rest of the captured
runtime is identical. It uses a separate Chromium context for each character and
variant, disables HTTP caching, balances comparison order, and records actual
workbench readiness, main-thread long tasks and heartbeat gaps. Separate fresh
contexts measure catalog load, compositor creation and complete pose validation.
Every rendered native RGBA frame, imported asset identity and actual frame-0 UI
canvas must match between versions. Every pose must be validated with the same
progress sequence before acceptance.

Current scoped correctness checks: 34 tests (4 scheduler, 15 appearance-bank,
15 compositor). They cover independent budgets, cancellation before/during a
yield, immutable input/caches, failed or aborted validation retry, unpreviewed
pose violations and unchanged deterministic exports. Performance numbers below come from the final quiet benchmark, not from
unit-test duration.

## Measured result — 2026-10-29

The [raw successful report](first-load-final-b.json), [console record](first-load-final-b.log)
and [summary](summary.json) cover 12:50:38–12:52:53 UTC. This was a quiet,
order-balanced local Chromium/Vite run with two samples per character/version,
8 fresh UI contexts and 8 separate pipeline contexts. It is a local observation,
not a network/device-wide performance guarantee.

| First ready canvas |  Before |   After | Reduction |
| ------------------ | ------: | ------: | --------: |
| Male median        | 8.820 s | 6.873 s |     22.1% |
| Female median      | 8.993 s | 7.785 s |     13.4% |

Complete pose-validation medians fell from 2.072 to 1.709 s (male) and 1.928 to
1.619 s (female). Catalog preparation, which includes appearance ownership
validation, fell from 3.900 to 2.976 s and 4.303 to 3.775 s respectively.
Compositor construction was essentially unchanged; female measurements were
slightly slower, 0.739 to 0.774 s. No decode or acceptance check was removed.

All 209 dressed native RGBA frame hashes, every imported asset identity and both
actual frame-0 workbench canvases matched exactly between scheduling versions
in all rounds. The complete 0…107 / 0…102 progress sequences were retained.
The earlier first attempt used Playwright's 5 s default assertion deadline and
stopped before producing any timing sample; its files remain under
`/tmp/side-fitting/performance/first-load-final.*`. The harness was corrected to
allow the existing cold load to complete. Application code and assertions about
pixels/validation were unchanged between attempts.

## Remaining bottlenecks

The largest observed main-thread task remains 832 ms for the male and 1,009 ms
for the female candidate. Heartbeat gaps reached 862 / 1,033 ms. These come from
existing large synchronous parsing/PNG/frame work; the scheduler cannot interrupt
a single operation. Thus this change makes full readiness faster but does not
claim an always-responsive first-load UI. Cancellation is checked at every
cooperative checkpoint and after each yield, with the existing worker and
single-operation limitations preserved. A future worker-based garment decode
would be a separate change requiring the same pixel and failure-path checks.

Observed JavaScript heaps varied with GC (roughly 398–515 MB across runs); no
memory reduction is claimed. The new helper does not retain images or add caches.
