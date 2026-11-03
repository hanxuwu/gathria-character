# Check receipts

These receipts belong to the takeoff-window refinement following `a7fbdce`.
Historical CI logs are diagnostic evidence of the previous revision, not a pass
for this revision. `previous-ci-diagnosis.json` describes the eight source-mode
test preconditions that were corrected without weakening their assertions.

Reproduce the focused checks from the repository root:

```sh
npm run typecheck
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium GATHRIA_TAKEOFF_EXPORT_ROOT=/tmp/takeoff-review npx playwright test tests/e2e/takeoff-refine.spec.ts --workers=1 --trace=off --output=/tmp/takeoff-results
CHROMIUM_PATH=/usr/bin/chromium node scripts/smoke-dual-looks-production.mjs /tmp/takeoff-production
```

The eight historical source-mode cases are selected explicitly:

```sh
CHROMIUM_PATH=/usr/bin/chromium \
GATHRIA_DUAL_TAILORED_EVIDENCE=/tmp/takeoff-legacy/dual-tailored \
GATHRIA_DUAL_WARDROBE_EVIDENCE=/tmp/takeoff-legacy/dual-wardrobe \
GATHRIA_UNIFIED_WORKBENCH_EVIDENCE=/tmp/takeoff-legacy/unified \
npx playwright test tests/e2e/dual-view-daily-outfits.spec.ts tests/e2e/dual-view-wardrobe.spec.ts tests/e2e/unified-workbench.spec.ts \
  --grep 'tailored shirt or blouse|new garments mixed|shared cotton outfit|mixed shared choices|unified workbench exports unchanged' \
  --workers=1 --trace=off --max-failures=1 --output=/tmp/takeoff-legacy-results
```

Large actual CharacterPack downloads are kept outside the repository; the review
folder records their download hashes and extracted configuration. The unchanged
standalone Jump GIFs are referenced from the prior review. Actual new flow GIFs
are included in this review. `.log.gz` files are lossless compressed tool output.
The full remote browser suite is separate from these local focused checks.
