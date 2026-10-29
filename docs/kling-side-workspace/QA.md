# Side-view verification

The side-view route is `/workbench.html?mode=side-view&character=male` (or `female`). It uses the side source packs and their matching registration. Existing library and wardrobe evidence does not establish that this route passes.

Run the browser evidence script against the repository containing the integrated application and assets:

```sh
TARGET_REPO=/workspace/gathria-character \
EVIDENCE_DIR=/tmp/side-workspace-review-1 \
CHROMIUM_PATH=/usr/bin/chromium \
node scripts/verify-kling-side-workspace.mjs
```

The output directory must be empty. Without `EVIDENCE_DIR`, the script creates a fresh directory under `/tmp`. The script starts its own Vite server using `TARGET_REPO`'s configuration. It leaves source artwork, source timing, and application code unchanged. Python with Pillow and NumPy is required for independent pixel inspection.

The script checks actual Original and Daily controls for both characters, all four actions in both directions at 24 fps, keyboard walking/running/jumping, horizontal travel and in-place mode, pause and frame stepping, comparison and anchor overlays, mixed top/bottom/shoes selections, and project save/reload/reopen. It captures untrimmed browser-session recordings and actual UI screenshots spanning source frames 200, 208, 214, 224, 231, 238, and 249 across the two source jumps.

PNG, run/jump GIF, CharacterPack, and project artifacts come from visible download controls. GIF decoding verifies every encoded frame, 40/50 ms timing accumulation at 24 fps, dimensions, and the one-shot versus looping extension. It does not claim lossless GIF colors: GIF is a half-size, beige-background preview. PNG and CharacterPack retain native size and alpha.

The pixel audit independently decodes all exported PNG atlas pages. It compares all 107 male and 102 female frames against the source embedded in the saved project, requiring exact original RGBA, exact daily alpha, unchanged registered head/hand pixels, and no changes outside selected garment ownership. Checks bind the source, registration, and garment archives using their saved SHA-256 values. No garment-specific relaxation of hand/head protection is accepted. It also compares downloaded native PNGs to their matching decoded CharacterPack frame.

The workbench browser context closes before each fresh independent player context uploads the downloaded CharacterPack. The player exercises all four actions in both directions and re-exports the identical ZIP. Unexpected HTTP failures, browser page errors, external requests, and independent-player requests for side-view/wardrobe/skeletal code fail verification.

The regression cases in `tests/e2e/side-view.spec.ts` use the shipped side assets. They cover both character identities, exact native PNG alpha, guide-free exports, mixed project reopen, malformed-project rollback, keyboard travel, source speed, and full two-jump hold/replay. Run them with:

```sh
CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/e2e/side-view.spec.ts
```

## Interpreting evidence

A passing `evidence-index.json` records exactly this run's inputs, downloads, screenshots, playback observations, and pixel checks. Browser sampling can miss displayed ticks; observed and missing positions remain in the report. Encoded source-frame coverage is checked separately. Earlier test totals are not new results.

Exact alpha parity proves that changing the outfit adds no silhouette clipping relative to the source. It does not prove the source was already artistically complete. Registered protection checks only the supplied regions. The head outline, hand placement, seams, two-jump cadence, and estimated occluded anchors still need visual review. Screenshots and recordings are actual application output, not generated artwork.

No browser run is claimed by this document alone. The evidence index is the authoritative result; a failed run retains its failure details and completed artifacts.
