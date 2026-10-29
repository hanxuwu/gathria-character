# Side-view verification

The side-view route is `/workbench.html?mode=side-view&character=male` (or `female`). It uses the side source packs and their matching registration. Existing library and wardrobe evidence does not establish that this route passes.

## Recorded result — 2026-10-29

[Round 4 passed](browser/round-4/evidence-index.json), captured 03:58:29–04:03:23 UTC with the final frozen assets. Both library links were visible and opened the correct character. The run completed 32 workbench playback cases and 32 independent-player playback cases, plus both characters' keyboard, camera travel, pause, stepping, mixing, and saved-project reload checks. It retained 26 actual UI downloads, 47 screenshots, and two untrimmed workbench recordings.

All 209 source frames passed exact original RGBA, daily alpha, registered protection, selected ownership, and marked-skin checks. The marked-skin audit covered 10,877,321 pixels across the frames. Three source-bound material reviews excluded 1,155 raw warm-color seeds identified as clothing/shoe material; their polygons, references, hashes, and counts are retained in the report. Four stage playback cases missed up to four observed positions under browser sampling; all independent-player cases observed every position, and all encoded GIF frames and source mappings were decoded separately. No page errors, unexpected HTTP failures, external requests, or forbidden independent-player editor requests were recorded.

[Four distinct regression cases passed](browser/round-4/e2e-summary.json): three in the initial invocation, then the load-retry case in a targeted rerun after correcting its fault injection for React StrictMode's canceled initial request. The [initial report](browser/round-4/e2e-results.json), [targeted rerun](browser/round-4/e2e-retry-results.json), and [initial trace](browser/round-4/e2e-initial-failure/trace.zip) remain available. These are new side-view results, separate from historical suites.

Earlier verifier attempts remain intact. [Round 1](browser/round-1/evidence-index.json) stopped before opening a page because Playwright's bundled ffmpeg was absent; the successful run used the installed system ffmpeg through a temporary browser-cache symlink. [Round 2](browser/round-2/evidence-index.json) exposed a harness range-input synchronization issue. [Round 3](browser/round-3/failure-reproduction.json) found a real Daily ownership overlap with the protected far hand at male frame 0, pixel (304, 582). The masks were corrected against the exact runtime protection raster; runtime protection was not relaxed. Round 4 then passed.

Visual inspection covered the actual workspace, both daily idle poses, library entries, and selected jump stages. It does not establish flawless artwork: source blur, green/chroma fringe, source pose/identity changes between action segments, and the retained purple ink fringe at the male source-242 shorts edge remain visible. The source-242 tank gap was corrected. This first daily set preserves the original cuts and silhouette; the technical pass does not constitute approval of every artistic seam or estimated occluded anchor.

Run the browser evidence script against the repository containing the integrated application and assets:

```sh
TARGET_REPO=/workspace/gathria-character \
EVIDENCE_DIR=/tmp/side-workspace-review-1 \
CHROMIUM_PATH=/usr/bin/chromium \
node scripts/verify-kling-side-workspace.mjs
```

The output directory must be empty. Without `EVIDENCE_DIR`, the script creates a fresh directory under `/tmp`. The script starts its own Vite server using `TARGET_REPO`'s configuration. Video capture requires an ffmpeg executable at Playwright's configured browser-cache location. It leaves source artwork, source timing, and application code unchanged. Python with Pillow and NumPy is required for independent pixel inspection.

The script checks actual Original and Daily controls for both characters, all four actions in both directions at 24 fps, keyboard walking/running/jumping, horizontal travel and in-place mode, pause and frame stepping, comparison and anchor overlays, mixed top/bottom/shoes selections, and project save/reload/reopen. It captures untrimmed browser-session recordings and actual UI screenshots spanning source frames 200, 208, 214, 224, 231, 238, 242, and 249 across the two source jumps.

PNG, run/jump GIF, CharacterPack, and project artifacts come from visible download controls. GIF decoding verifies every encoded frame, 40/50 ms timing accumulation at 24 fps, dimensions, and the one-shot versus looping extension. It does not claim lossless GIF colors: GIF is a half-size, beige-background preview. PNG and CharacterPack retain native size and alpha.

The pixel audit independently decodes all exported PNG atlas pages. It compares all 107 male and 102 female frames against the source embedded in the saved project, requiring exact original RGBA, exact daily alpha, unchanged registered head/hand pixels, and no changes outside selected garment ownership. Checks bind the source, registration, and garment archives using their saved SHA-256 values. No garment-specific relaxation of hand/head protection is accepted. Occluded hand polygons can be absent; the source audit records why, and every supplied region is checked. Independently marked skin PNGs are hash-bound to the source audit and recomputed from the declared RGB/alpha rule minus only explicitly reviewed source-bound cloth polygons, then checked for exact RGBA preservation. The report retains each reviewed polygon, reason/reference, and raw/excluded seed counts. These warm-color seeds cover only high-confidence skin; they do not establish universal protection of pale highlights, facial ink, or ambiguous edges. It also compares downloaded native PNGs to their matching decoded CharacterPack frame.

The workbench browser context closes before each fresh independent player context uploads the downloaded CharacterPack. The player exercises all four actions in both directions and re-exports the identical ZIP. Unexpected HTTP failures, browser page errors, external requests, and independent-player requests for side-view/wardrobe/skeletal code fail verification.

The regression cases in `tests/e2e/side-view.spec.ts` use the shipped side assets. They cover both character identities, exact native PNG alpha, guide-free exports, mixed project reopen, malformed-project rollback, source-load retry and loading guards, keyboard travel, source speed, and full two-jump hold/replay. Run them with:

```sh
CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/e2e/side-view.spec.ts
```

## Interpreting evidence

A passing `evidence-index.json` records exactly this run's inputs, downloads, screenshots, playback observations, and pixel checks. Browser sampling can miss displayed ticks; observed and missing positions remain in the report. Encoded source-frame coverage is checked separately. Earlier test totals are not new results.

Exact alpha parity proves that changing the outfit adds no silhouette clipping relative to the source. It does not prove the source was already artistically complete. Registered protection checks only the supplied regions. The head outline, hand placement, seams, two-jump cadence, and estimated occluded anchors still need visual review. Screenshots and recordings are actual application output, not generated artwork.

For any new run, the fresh evidence index is the authoritative result; a failed run retains its failure details and completed artifacts.
