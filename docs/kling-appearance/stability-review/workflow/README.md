# Actual appearance update, export and playback evidence

This is a new browser run against the final appearance-v3 banks, not a repeat
of historical test claims. It uses real retained editable projects, browser
PNG/project/CharacterPack downloads and a separately opened player. The underlying
PNG/source artwork is unchanged; the final bank adds the head-edge allowance and
two female hand-foreground polygons described in the parent review.

## Start here

| Character | Everyday / wedding, right | Everyday / wedding, left | Final exported wedding CharacterPack |
| --- | --- | --- | --- |
| Male | [GIF](male-everyday-wedding-right.gif) | [GIF](male-everyday-wedding-left.gif) | [ZIP](final-male/male-wedding.character.zip) |
| Female | [GIF](female-everyday-wedding-right.gif) | [GIF](female-everyday-wedding-left.gif) | [ZIP](final-female-hand-fix/female-wedding.character.zip) |

These GIFs use actual exported frames at labeled 0.5x. Each runs through idle,
walk, run, jump and celebrate, then repeats the review sequence. Jump remains
one-shot in the CharacterPack; the GIF does not introduce authored inter-action
transitions. Consecutive identical holds are combined while preserving their
cumulative duration. Male GIFs contain 88 decoded frames, female 96; each lasts
5,080 ms. GIF colors and centisecond timing are presentation limits; native PNG
RGBA and CharacterPack timing are checked separately.

Same-pose explicit copy upgrade: male [1x](male-saved-copy-ear-1x.png) /
[2x](male-saved-copy-ear-2x.png), female [1x](female-saved-copy-ear-1x.png) /
[2x](female-saved-copy-ear-2x.png). The embedded old appearance in these actual
V2 projects is content revision 1; project format and appearance content versions
are distinct.

Rectangular head-edge correction against released content v2:
[male, both hairstyles, frame 90](male-fringe-guard-v2-v3-4x.png) /
[female, both hairstyles, frame 0](female-fringe-guard-v2-v3-4x.png).
The separate [visual audit](../visual-audit.md) includes the final female
celebration thumb correction and neighboring selected poses.

Final UI: male [desktop](ui-final/male-appearance-controls-desktop.png) /
[mobile](ui-final/male-appearance-controls-mobile.png), female
[desktop](ui-female-hand-fix/female-appearance-controls-desktop.png) /
[mobile](ui-female-hand-fix/female-appearance-controls-mobile.png).
Explicit update dialog: male [desktop](ui-final/male-update-preview-desktop.png) /
[mobile](ui-final/male-update-preview-mobile.png), female
[desktop](ui-female-hand-fix/female-update-preview-desktop.png) /
[mobile](ui-female-hand-fix/female-update-preview-mobile.png).

## Final executed checks

- [Male capture](final-male/evidence-index.json) and
  [final female capture](final-female-hand-fix/evidence-index.json) passed:
  **40 real downloads**, comprising **30 native PNGs, 6 editable projects and
  4 CharacterPacks**. Every ZIP entry was decoded and CRC checked; PNG content,
  dimensions and hashes were checked, including the actual exports used below.
- Two old editable projects previewed an update at the same jump pose 86, left.
  Before-preview canvas pixels exactly matched the open project. Cancel and
  saving a separate copy left the original canvas unchanged. Reopening each
  downloaded copy restored its appearance, clothing, action, facing and exact
  new bank hash; stepping to pose 86 reproduced the preview pixels. Saved
  projects persist action/facing, not the current frame position.
- Four everyday/wedding combinations saved and reopened with exact selections.
  Male everyday uses crop/Chestnut, wedding bob/Espresso; female everyday uses
  bob/Chestnut, wedding crop/Copper. All use Gentle. Actual alternate hairstyle
  thumbnails and Copper selection were also exercised.
- After the editors closed, **40 independent playback combinations** ran at 1x:
  two characters × two outfits × five actions × two directions. The player
  loaded each actual downloaded pack while authoring-module requests were
  blocked. No frame positions were missed by the observer; no application
  exceptions, external requests or authoring-module requests occurred. The
  longest observed frame-position interval was **100.5 ms**. This is not a claim
  of perfect browser paint scheduling. A harmless missing favicon is logged.
- [Artifact validation](artifact-validation.json) decodes and hashes **62 final
  PNG/GIF artifacts**. It checks all **368 native output frames** for exact source
  RGBA outside selected appearance/garment ownership and fully transparent frame
  boundaries. Source animation sequences, fps, loop flags and anchor metadata
  are preserved. Four independently exported left PNGs exactly mirror their
  right counterparts; those right PNGs match their actual pack frames.
- Against retained v2 day exports, male changes total 315 pixels in 18 frames.
  Female changes total 2,370 pixels in 62 frames: 2,018 at the explicitly owned
  top/side head allowance, plus 352 original hand pixels restored at poses 78/79.
  Every other pixel remains exact. The final female correction versus the first
  v3 iteration changes only the two explicit foreground polygons and restores
  exact source RGBA there.
- Final desktop/mobile screenshots were a focused later capture, not repeated
  exports or playback tests. At 390px viewport width the document has no
  horizontal overflow and the complete update dialog stays inside the viewport.
  Actual full-body Fit previews were visually checked after correcting an
  initial crop in the dialog layout.

Unit/browser regression counts are recorded in the parent review separately.
Visual inspection covers full native difficult poses, source/old/new crops and
sampled positions from these actual final GIFs, together with the full-head audit.
Technical success does not constitute user visual acceptance. Source blur,
chroma-key edge colors, coarse garment folds and lack of secondary hair physics
remain visible limitations.

## Retained iterations and reproducibility

`final-male` remains final. Its first attempt encountered an evidence-harness
assertion that omitted the source anchor's `units`/`origin` fields; the valid
already-downloaded pack was reused after preserving those fields in the check.
The failure and correction are recorded in `harnessCorrections`. This was not an
application failure.

`final-female` and the earlier female screenshots in `ui-final` record the first
unpublished v3 iteration. The later visual audit found hair covering part of the
female thumb at 78/79, so the complete female workflow was rerun in
`final-female-hand-fix`. The first iteration index, PNGs, bank manifest and
artifact report remain; [retention metadata](final-female/iteration1-retention.json)
records the superseded pack's exact SHA and temporary location. Its duplicate
39 MB ZIP is not published. The final two wedding packs above are the only new
published full packs; everyday packs and editable project ZIPs were verified in
`/tmp`, with exact hashes and capture paths retained in the indexes. Re-running
the capture recreates those review inputs.

```sh
STABILITY_RUN=final-male STABILITY_CHARACTER=male node scripts/capture-kling-appearance-stability.mjs
STABILITY_RUN=final-female-hand-fix STABILITY_CHARACTER=female node scripts/capture-kling-appearance-stability.mjs
python scripts/prepare-appearance-thumbnails.py --male-run final-male --female-run final-female-hand-fix
python scripts/render-kling-appearance-stability.py --runs final-male final-female-hand-fix
python scripts/render-kling-appearance-stability.py --ui-only --ui-runs ui-final ui-female-hand-fix
```

Capture refuses to overwrite a recorded run. Use new run names for future
captures and corresponding renderer/thumbnail arguments. `--ui-only` captures
use `STABILITY_UI_PROJECT_DIR` to select a previously downloaded project; their
indexes explicitly state that no pack/playback execution is being repeated.
