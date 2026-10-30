# Side-view frame review

Open a side-view workbench and click **检查穿帮 · 逐帧审阅**, below the action
controls. This pauses the current pose, clears queued keyboard requests, selects
in-place playback and enables the existing source/current-look comparison.
Existing action, facing, timeline and previous/next-frame controls remain usable.

The panel adds:

- **0.25× / 0.5× / 1× preview**. These rates scale only the workbench's elapsed
  preview time. Action frame order, authored poses, export FPS, exported GIF delays,
  saved project and CharacterPack metadata are unchanged. Transition countdowns
  account for slow preview. Closing review restores 1×. Travel preview is disabled
  while review is open, so slow playback does not imply a new game movement speed.
- **Same-frame native detail comparison**. Select head/ear, near or far hand/cuff,
  waist, knees/hem or ankles/shoes. Both panes use the same integer native crop,
  selected frame and facing, at exact 2× or 3× nearest-neighbor magnification.
  Small screens scroll inside the panes instead of shrinking their pixel grid.
  Registration estimates locate the crop; they do not move or deform the artwork.
- **Problem-frame notes**, with action, pack frame ID, facing and inspected region.
  Records are scoped to character and original source SHA-256. Each carries the
  registration SHA, selected garment IDs and hashes, appearance-bank SHA, hairstyle
  and color in its `lookKey` snapshot. A different current outfit or asset revision
  is explicitly marked. **定位此帧** pauses and restores the pose/facing only; it
  does not silently replace clothing or reopen an older asset revision.
- **Local persistence and JSON export**. Up to 100 recent notes, 1,000 characters
  each. A record with the same pose, facing, region and asset snapshot is updated;
  different looks retain separate records. Notes survive reload in the same
  browser, are separate from wardrobe project ZIPs, and are never uploaded.
  If local storage is unavailable, the panel reports that notes only survive in
  the open panel and offers JSON export. JSON re-import is not implemented.

These tools expose visible problems for human review. They do not automatically
prove that an outfit has no seams, drift or anatomy errors.

## Implementation

- `src/side-view/SideViewPlayground.tsx`: review entry, playback-only rate, safe
  paused pose restoration and reuse of the existing stage comparison/cache.
- `src/side-view/SideReviewPanel.tsx`: native crops, notes and JSON download.
- `src/side-view/review.ts`: crop coordinates, source-scoped note validation,
  capacity limits and look identity.
- `src/side-view/side-view.css`: accessible controls and internally scrolling
  integer-size detail panes, including a 390 px viewport.

Default playback remains 1×; this feature does not change source files, garments,
compositor behavior, character dimensions, saved-project schema or pack format.
The side-view load function interface is unchanged.

## Checks in this iteration

`npm run typecheck` passed. Seven new unit tests in
`src/side-view/review.test.ts` pass: source/character/version isolation, invalid
local data, note identity and retention, actual registration crop bounds and
look metadata. The existing 27 motion and 4 keyboard tests also pass (38 total
for that targeted run; the existing 31 are not additional new tests).

Two new browser tests in `tests/e2e/side-review.spec.ts` passed in 49.9 seconds
on Chromium, with the coherent pre-repair candidate assets on 2026-10-29:

1. Actual PNG and GIF downloads are byte-identical before and during 0.25× review;
   source FPS remains 24; measured preview progression is slowed; left detail is
   the exact mirror of right; closing review restores native timing and travel.
2. Notes export their source and look context, survive reload, identify a changed
   outfit, restore a paused frame without replacing that outfit, remain isolated
   from the other character, and keep integer magnification without page overflow
   at a 390×844 viewport.

Run the checked-in cases with:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e -- tests/e2e/side-review.spec.ts
```

These checks concern the review workflow. Final outfit asset validation and art
acceptance are recorded separately by the integrated QA run. A temporary
registration/bank mismatch while the art jobs rebuilt was correctly rejected by
the existing importer; no validation was relaxed to create screenshots.

## Actual browser captures

After the male registration and banks were rebound coherently, the actual
workbench was opened again with the current candidate. These are browser
screenshots, not mocked layouts or manually assembled crops:

- [Desktop review panel](review-panel-desktop.png)
- [Full desktop workspace](review-workspace-desktop.png)
- [390 px mobile panel](review-panel-mobile.png)
- [Actual exported problem-frame JSON](sample-review-notes.json)
- [Capture state and page-error report](capture-report.json)

The capture checks male walk pack frame 26, shows the same source/current-look
crop, records 24 fps source timing and a paused 0.25× preview setting, and confirms
that a 480 px native detail canvas stays 480 CSS pixels wide inside a scrolling
pane while the document remains 390 px wide. There were no browser page errors.
The sample note is an inspection reminder; these UI screenshots do not certify
that the clothing itself is free of visual defects.

### Final capture asset identity

The screenshots and unmodified downloaded note JSON were recaptured using the
final coherent male candidate. The note snapshot was checked against the current
source ZIP, registration and all three banks. Exact identities are also in
[capture-report.json](capture-report.json).

| Input                       | SHA-256                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `male.source.zip`           | `7322f38e39f321fb2eb54afe33bdad456bff1bd2d9739358c278971a51bc5d42` |
| `male.registration.json`    | `e4dc7c47dd3111a6a4941174a020fbec8d45ab7ead3fba1db0d91cdbb4e1aa31` |
| `male-shirt.garment.zip`    | `004533a628b28c13d4f0aa383060da413f26496f76085821ed7b04a253ceae07` |
| `male-trousers.garment.zip` | `502856755a84fd05f26fb929a3dafdf6fff4f7758ceb213433eb8d64988935bf` |
| `male.appearance.zip`       | `e259260d9d917bf7bb30e71dd22349f0d6a0af138e5f091840866b30eac4f5f6` |

Actual downloaded note JSON SHA-256: `ca5ec530119cf247470ee3527281a7d87eecb30a6f86d173eaeb7ea8891ed2c0`.
