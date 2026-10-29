# Side-view clothing fitting workbench

Open either tailored side-view character, then choose **服装校正 · 锚点与遮挡**.
The stage pauses in place while this tool is open. It works on the existing
Kling native right-facing frames; the original source, anchors and timing are
never moved to force a clothing fit.

## Workflow

1. Choose a worn top, bottom or dress and an action/frame. The original,
   independent painted cloth and complete current look share one native canvas.
   Toggle the guide overlay or select native 1× / integer 2× inspection.
2. Green points are visible anchors; brown points are occluded estimates.
   Purple marks protected head pixels and orange protected hand pixels. The
   17-anchor table preserves the recorded provenance. These are guides, not
   new bone controls or automatically inferred anatomy.
3. **检查这件服装的全部动作** records actual ownership, painted area,
   protected overlap and small disconnected painted regions for every action
   position. Looping actions include the last-to-first adjacency; jump never
   invents an endpoint-to-start adjacency. Click a row to inspect that pose.
   Small regions and 25% area changes are review prompts, not visual failures.
   For example, an obscuring hand may legitimately divide cloth into islands.
4. **修正本帧衣料边界** opens the established mask editor. Sample existing
   cloth, clone it locally, restore the original source, undo or reset. Native
   coordinate controls are available instead of pointer painting. Head/hand
   protection and existing reviewed permissions still apply.
5. Save a mask draft to continue later. Reopen it while wearing the exact base
   garment. Drafts bind the source, registration, garment hash and action;
   incompatible drafts are rejected without replacing the current edits.
   Each draft supports at most eight reviewed poses.
6. Accept corrected poses, build a separately named garment and inspect its
   complete appearance in both directions. Applying the candidate adds a new
   clothing item; canceling leaves the current project unchanged. Save the
   original and revised wardrobe projects separately. Existing project save,
   CharacterPack export and player behavior remain the output path.

**导出邻帧绘制包** supplies the exact garment, registration, local PNG/masks
and source-bound painting recipe for external artwork. It is an authoring kit,
not a playable character pack. Brush editing does not generate new designs,
new limb poses or physically simulated folds. New cloth silhouette beyond the
original opaque body still needs the full art-authoring workflow.

## Implementation

- `src/side-view/fitting-workbench.tsx`: native guides, garment/action selection,
  batch audit, cancel-safe mask/candidate lifecycle and source-bound guide export.
- `src/side-view/fitting-analysis.ts`: read-only raster diagnostics, bounded
  per-frame work and cancellation. No diagnosis is automatically applied.
- Existing `MaskEditSession`, `MaskEditWorkbench`, `GarmentCandidatePreview`
  and wardrobe project import/export are reused rather than introducing another
  garment format. Only an optional history-copy flag is added to the candidate
  modal, because the side-view workspace does not have styling history.
- The fitting component and edit/candidate dialogs load lazily. It uses the
  already-open compositor for guides and avoids another source copy for them.

Technical checks and screenshots for this iteration are recorded after the
actual browser round trip. Deliberate five-pixel browser test repairs are test
artifacts only and do not overwrite shipped clothing.

## Current verification

- TypeScript check passed.
- 22 scoped unit tests passed: six new fitting diagnostics, ten existing mask
  editing tests and six candidate tests. These include cancellation, loop and
  one-shot adjacency, preserved source pixels and proof-bound draft rejection.
- Two new real-browser tests passed on their first run (56.7 s and 16.6 s),
  and again with final frozen assets (55.8 s and 17.5 s). These are two distinct
  cases, not four.
  The male case checks 107 poses, guide/source hashes, undo/reset, draft save and
  reopen, rejection of a changed garment binding, left/right candidate preview,
  explicit apply and wardrobe save/reopen with exact exported PNG equality.
  Exactly five intentionally restored pixels change; source ZIP and registration
  remain byte-exact. The female case checks jump source frame 249, safe cancel
  and the 390 px layout, including scrollable integer 2× panes.
- Guide overlays and audit never modify exported PNGs. Keyboard movement and
  jumping remain blocked while the fitting workbench is open.

[Input hashes and observed results](verification.json) identify the final-asset workflow
snapshot; the initial scoped run is recorded separately in the same JSON. The browser proof outfit
is temporary and never replaces a shipped clothing file.

[Desktop guides](male-fitting-desktop.png) ·
[Corrected candidate preview](male-corrected-candidate.png) ·
[Mobile guides](female-fitting-mobile.png)
