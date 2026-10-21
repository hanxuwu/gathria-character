# Dress fitting refinement

This iteration refines the existing coral day dress and ivory wedding dress on
the approved Kling female source poses. The male outfits, original source packs,
17-point registrations, body proportions, source actions and native anchor stay
unchanged. It also fixes replay of a completed edited/imported one-shot clip in
the wardrobe when that clip has no applicable motion-flow routes.

## What changed

- **Waist connection:** the previous preparation copied the original tank mask
  over the skirt last. Its irregular hem survived a short colour blend, producing
  hanging tabs and a stepped waist in crouch poses. The new garment-only overlap
  fades that hem's colour contribution fully to zero across the join. Partially
  transparent tank edges composite over the opaque skirt instead of replacing
  it with translucent pixels.
- **Interior speckles:** bilinear interpolation followed by truncation sometimes
  converted opaque alpha 255 to 254. That skipped an exact-opacity join check
  and left dark old hem dots. Revision 2 rounds the samples and accepts this
  one-level interior tolerance; focused regressions cover the failure.
- **Skirt side:** local thigh clearance previously expanded a short band of rows
  and then contracted it, creating a knob around crouch and run poses. A continuous
  side envelope now distributes that clearance along the side seam and reconnects
  with the existing hem. Interior folds and the scalloped hem retain their original
  sampling outside the narrow affected edge band. Broad hem inflation was rejected
  during review because it changed the garment silhouette unnecessarily.
- **Replay:** after a non-looping clip has completed, Play restarts it. Ordinary
  pause/resume retains its position. Reviewed source motion-flow routes still
  complete the landing before switching to a queued action.
- **Independent playback:** after visiting all five actions in both directions,
  the first jump-to-walk transition could stall when changing atlas pages. The
  loader now retains decoded `ImageBitmap` pages where supported, with an HTML
  image fallback. It releases unused pages while retaining pages shared by action
  previews and source comparison. No animation frame, cadence or transition
  route is changed by this loading correction.

`scripts/kling_dress_fit.py` contains the offline fitting functions. The existing
preparation script accepts `--fit-revision=2`; revision 1 remains its default for
reproducing older preparation. No source-body deformation or runtime image API
was added. The same recorded painted garment source is reused; this iteration
does not introduce new generated characters or clothing references.

## Open and compare

Open `/workbench.html?character=female&mode=wardrobe` and select **Everyday** or
**Wedding**. Their dress selection is marked **refined fit**. All five actions,
both directions, source comparison, authoring guides, project save/reopen and
independent CharacterPack export remain available.

Comparison columns are **day before / day refined / wedding before / wedding
refined**. PNGs and GIFs are decoded from actual workbench downloads. The prior
exports remain at `../exports/`; new exports and browser evidence are here.

- [Running comparison](review/run-comparison-right.gif) · [left](review/run-comparison-left.gif)
- [Complete jump comparison](review/jump-comparison-right.gif) · [left](review/jump-comparison-left.gif)
- [Walk](review/walk-comparison-right.gif) · [Idle](review/idle-comparison-right.gif) · [Celebrate](review/celebrate-comparison-right.gif)
- [Crouch at native size](review/frame-89-native.png) · [waist and side at 2×](review/connections-89-2x.png)
- [Run at native size](review/frame-58-native.png) · [run connections at 2×](review/connections-58-2x.png)
- [Landing connections at 2×](review/connections-104-2x.png) · [control pose](review/frame-64-native.png)
- [Everyday CharacterPack](exports/female-day.character.zip) · [editable project](exports/female-day.wardrobe.zip)
- [Wedding CharacterPack](exports/female-wedding.character.zip) · [editable project](exports/female-wedding.wardrobe.zip)
- [Actual browser and independent playback evidence](browser/evidence-index.json)
- [Decoded media and source hashes](review/media-index.json)
- [Independent-player transition measurements](browser/transition-probe-bitmap.json)
  · [day recording](browser/bitmap-female-day-independent-transitions.webm)
  · [wedding recording](browser/bitmap-female-wedding-independent-transitions.webm)

GIFs are reduced to 0.375× for practical comparison. Native PNGs retain the actual
704×1056 frame dimensions; detail crops use integer 2× magnification. Jump remains
a complete one-shot, while looping actions retain their source cadence.

## Compatibility and authoring

The new garment IDs are `coral-daydress-v2` and `ivory-wedding-dress-v2`. Older
garment ZIPs, editable projects and CharacterPacks are retained byte-for-byte.
Opening an older project keeps its embedded original dress; it does not upgrade
silently. Both revisions bind the exact same source and registration hashes.
No CharacterPack, project or garment schema version changed.

The authoring kits and their native masks are unchanged. For future clothing:
follow the per-pose registered waist and preserve near/far arm ownership; supply
cloth overlap under a join; resolve translucent cloth against cloth before
packaging; spread side clearance into a continuous seam rather than isolated
row expansions. These are preparation rules, not a claim that anchors alone can
turn one standing illustration into a complete garment pose bank.

## Verification executed in this iteration

- After the final playback fix, TypeScript and production build, **155 unit
  tests**, **36 Chromium E2E tests** and **3 focused offline fitting regressions**
  passed locally. The fitting regressions are also included in CI. These are
  this iteration's executed results, rather than the previous batch's counts.
  The two new browser regressions cover bitmap/HTML translucent-pixel parity and
  shared image lifetime across action editing, source switching and comparison.
- The [final-runtime asset audit](player-runtime/verification-assets.json) checked all 12 current items /
  **1,112 clothing poses** and all eight presets / 744 composed poses. Head/hand
  protection, ownership, transparent margins and exact Original reset passed.
  The earlier [pre-player-fix audit](verification-assets.json) is retained with
  its original implementation hashes.
- The [actual export audit](verification-exports.json) compared **two new
  CharacterPacks / four atlas pages** pixel-for-pixel with their saved-project
  compositor. All 192 garment poses preserve protected source identity pixels
  and contain no transparent holes over the replaced original clothing. Source
  frame metadata, timing, anchor and motion-flow routes remain unchanged.
- All **26 earlier garment/project/source/template/registration files** covered
  by the release-preservation audit match commit `151b4bb`. Both earlier female
  projects were reopened through the real UI and exported unchanged native
  standing pixels. The 1,061 authoring-kit inventory entries passed hash checks.
- The production browser captured **24 decoded downloads**, **20 independent
  action/facing cases**, and **eight queued transitions**, with the editor closed
  before independent playback. Ten native V2 pose PNGs match the downloaded pack
  atlas pixels; eight additional PNGs cover the two dresses with brown shoes.
  No uncaught page error, failed HTTP response or external/runtime-authoring
  request occurred in the final capture.
- All **10 comparison GIFs and nine PNGs** decode. GIF clip durations and
  looping/one-shot flags match the source metadata after centisecond rounding.
  FFmpeg independently decoded all ten GIFs without errors.
- [Actual bitmap/HTML decoder parity](browser/bitmap-pixel-parity.json) checked
  **80 exported crops** across both dresses, both atlas pages, native and half
  size, and both facings. All RGBA channels, including translucent edges, match.

The rejected intermediate capture is explicitly retained under `attempt-1/`
and `browser/attempt-1/`, with two representative failed-waist PNGs. Its report
is not final delivery evidence; large rejected duplicate archives were retained
locally rather than published again. The final reports above bind the corrected
garment archive hashes ending `...674cd8a37` and `...3bf5c57d7`.

### Independent-player transition investigation

The initial production capture recorded a first cross-page pause. An isolated
fresh player did not reproduce it, but playing all five actions in both
directions first did: the day/wedding packs paused for **225/267 ms**, skipping
early walking positions after the page change. Waiting for `image.decode()` at
load was insufficient (**254/254 ms**). Holding decoded bitmap pages reduced the
same first-transition intervals to **31/66 ms**; both captures then observed
walking positions 0–6 in order with no long task at the boundary. Repeat
transitions measured **48/33 ms**. These are measurements from this Chromium
environment, not a frame-time guarantee across devices.

Raw reports are retained for the [fresh player](browser/transition-probe-before.json),
[warmed failure](browser/transition-probe-warmed.json),
[decode-only experiment](browser/transition-probe-decoded.json), and
[bitmap correction](browser/transition-probe-bitmap.json). Their runtime hashes
identify each tested implementation; earlier records are not relabeled as
post-fix runs. The recordings show the independent player with the wardrobe
closed, and were decoded with FFmpeg. The delivered clothing archives and source
pixels did not change during these playback experiments.

The two 6336×6336 decoded pages require about **306 MiB per female pack**, before
other browser allocations. Retaining the decoded pages trades this memory for
predictable page access. The fallback keeps loading available when bitmap
decoding is unsupported, but its cross-page performance is not established by
the bitmap measurements above.

Reproduce the new archives with the existing pinned Python dependencies:

```sh
python3 scripts/prepare-kling-wardrobe-dresses.py --fit-revision=2
python3 scripts/build-kling-wardrobe-catalog.py
python3 scripts/test_kling_dress_fit.py
npm run build
WARDROBE_PRODUCTION=1 node scripts/verify-kling-wardrobe-fit-v2.mjs
python3 scripts/render-kling-wardrobe-fit-v2.py
```

The preparation command needs the reviewed per-pose masks described in the
[authoring kit guide](../templates/README.md). Preserve old reports; the focused
browser script writes this directory and requires a fresh run name for retries.
`scripts/verify-kling-player-transitions.mjs <fresh-label> --warm-actions`
records a separate actual-player transition run. The accompanying
`scripts/verify-kling-player-bitmap-parity.mjs` reproduces the exported-pixel
decoder comparison; copy its prior report before rerunning. Browser scripts
accept `CHROMIUM_PATH` when Chromium is not installed at `/usr/bin/chromium`.

## Visual limits

The join and side outline are improved, but the garments still use fitted 2D
painted folds. Source motion blur, edge fringe and the differences between a
sharp skirt and a blurred body remain visible in fast poses. This is not cloth
simulation or individually redrawn folds throughout the animation. There is no
claim of user visual approval or a completely invisible composite.
The expanded side can still have a locally heavier/stepped painted outline;
the remaining limitation is visible in the native comparisons.

This batch keeps the existing male waistcoat and shorts. Full suit sleeves and
long trousers require separate pose-specific artwork and are not delivered by
these fitting corrections. Production Gathria integration remains unverified.
