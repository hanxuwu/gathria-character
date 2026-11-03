# Receipts and reproduction

`before.json` and `after.json` are unchanged raw browser observations. Their
hashes are recorded in the diagnostic GIF provenance; do not reformat them.
`benchmark-summary.json` summarizes those samples without treating combined
comparison-canvas counts as individual FPS.

The cache and visibility checks use actual project assets:

```sh
npm test -- --maxWorkers=2
npm run build
CHROMIUM_PATH=/usr/bin/chromium GATHRIA_PAIRED_PLAYBACK_EVIDENCE=/tmp/paired-playback/evidence npx playwright test tests/e2e/paired-playback-cache.spec.ts --workers=1 --trace=off --output=/tmp/paired-playback/results
CHROMIUM_PATH=/usr/bin/chromium GATHRIA_LANDING_RUN_EXPORT_ROOT=/tmp/paired-playback/exports npx playwright test tests/e2e/landing-run.spec.ts --workers=1 --trace=off --output=/tmp/paired-playback/export-results
CHROMIUM_PATH=/usr/bin/chromium node scripts/smoke-dual-looks-production.mjs /tmp/paired-playback/production
```

For warm-run diagnostics, serve the revision being measured on port5176, then
run the same script at the baseline and updated revisions on the same machine:

```sh
node scripts/measure-paired-playback.mjs /tmp/paired-playback/measurement.json
```

The script freezes the transformed workspace module during each run and records
its hash. It instruments the compositor at the development-module response,
then observes native canvas pose IDs. The twelve samples are independent
three-second windows, not twelve trials of the same scene. Real device timing
and memory can differ. Production smoke tests verify behavior, not these FPS
measurements.

Historical CI records describe the baseline commit. Its PR job passed174
browser cases; its push job failed one transient assertion. They do not claim
that the full remote suite was rerun locally at the new revision. Logs are
losslessly compressed as `.log.gz`; the current focused results are separate.
