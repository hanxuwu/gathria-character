# Adjacent-pose clothing inspection

This iteration extends the fitting workbench's existing area/island checks.
It does not change artwork, anchors, frame order, timing or playback. The
diagnostic runs on the selected garment, so hidden cloth in a complete outfit
may still produce a useful inspection prompt rather than a visible defect.

## What is measured

The existing registration defines small windows for the collar, near/far upper
sleeves, near/far cuffs and hem. A window moves, rotates and scales with its
relevant torso or arm guides. Each has a 24 × 24 grid with four subcell samples.
Cloth coverage includes only painted pixels owned by that garment. Original
source RGBA is sampled in the same window, with premultiplied alpha so invisible
RGB values cannot inflate a score. Full native images are not retained in the
temporal report or per-pose profile.

The adjacent-pose report contains native source-space bounds for both windows,
cloth coverage change, original-source change and the nonnegative difference.
It keeps observations even when a prompt is suppressed:

- `review`: substantial local cloth change beyond the original source change;
  inspect both poses and their neighbors.
- `source-motion`: the original character also changes substantially in this
  region. This lowers its review priority, but does not establish correct fit.
- `stable`: change is below the diagnostic threshold. This is not an artistic
  pass; small cracks, color/fold changes and defects repeated in both poses can
  remain invisible to this measurement.
- `insufficient`: less than 2.5% comparable cloth coverage or less than 90% of
  samples inside the canvas. No quality conclusion is made.

Substantial coverage change starts at 14% of the window, or 20% when guides are
hidden/low-confidence. A review prompt also requires at least 9 percentage
points beyond source change, with source change below 70% of garment change.
These conservative constants prioritize inspection; they are not learned anatomy
rules or guarantees that cloth is correct. Existing area/island/ownership checks
remain separate.

Only the original action sequence defines adjacency. Idle, walk and run include
their actual last-to-first seam; jump ends unpaired. No comparison is invented
between separate actions. The UI can open the current/next pair or enter a
correction directly, while all original frame IDs remain intact.

## Boundaries

Near/far sleeve windows follow shoulder–elbow segments; cuff windows follow
elbow–wrist segments. Hidden guides are explicitly marked. Top hems use the
waist, and bottom/full-body hems use a knee-centered band, suitable as a broad
inspection region for the current shorts and skirt. This does not automatically
find every future long-dress or trouser cuff. Shoes have no temporal windows in
this iteration. Missing/degenerate guides produce no synthetic measurement.

The algorithm checks coverage, not painted fold semantics. A source arm moving
through a skirt can change the original sample and lower a prompt even when
the new garment still needs correction. Window scores therefore supplement
continuous playback and native-frame visual review.

## Reproduce

```sh
npx vitest run src/side-view/fitting-analysis.test.ts src/side-view/fitting-temporal.test.ts
node scripts/audit-kling-side-temporal.mjs /tmp/side-refinement/temporal/audit
```

The audit script uses the application project validator and `auditFitting` in
an isolated Vite SSR instance, with exact input hashes and decoded source frames.
Its reports are diagnostic evidence, not actual UI exports. The final browser
and CharacterPack evidence is recorded separately by the integration review.

The tests exercise whole-body translation/rotation, missing cloth with stable
source, equal-area edge swaps, source-motion suppression without discarding raw
observations, invisible RGB, missing/occluded guides, irrelevant garment slots,
actual loop seams, one-shot endings and cancellation between poses.
