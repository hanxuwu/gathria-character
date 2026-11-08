# Original-view male clothing coverage

The audit covers **36 selectable garment banks × 88 native frames = 3,168
garment/frame pairs**, including the original catalog and the additional
dual-view cotton/tailored banks. Five source actions are included. The original
23 presets and individual banks also passed actual compositor rendering before
the repair (59 scenarios, 5,192 frames).

## Confirmed repair

The broad protected near-hand polygon retained a thin gray strip of the old
undershirt beside the fist in landing frames **106–110**. These are cloth pixels
outside the real fist, rather than exposed arm or neck skin.

All **27 affected tops** now replace exactly **305 reviewed pixels per bank**:
38, 55, 35, 106 and 71 respectively. The source-bound V2 garment hand reviews
allow this narrow correction. Nearby existing garment texture supplies the
replacement, at most 8 native pixels away. The source alpha and every other
rendered RGBA pixel remain exact. The other 83 poses are unchanged. Original
source archives, registrations, faces, proportions and action timing are untouched.

- [Native source / before / after crops](near-fist-source-before-after-1x.png)
- [2× crops](near-fist-source-before-after-2x.png)
- [Full jump, right](original-male-jump-before-after-right.gif)
- [Full jump, left](original-male-jump-before-after-left.gif)
- [Actual-compositor pixel verification](runtime-verification.json)
- [Asset hashes and per-frame changes](repair-report.json)

The GIFs contain the complete original 39-frame single-jump sequence at 24 fps.
The comparison repeats for review; the underlying jump remains nonlooping.
GIF centisecond rounding produces 1,620 ms instead of 1,625 ms, with the same
source frame order. The left preview mirrors the composed sprite, matching the
supported facing convention.

## Flags that must not become clothing

The visible-leg semantic masks flag retained white shoe/sole outlines in frames
51, 61, 62 and 108, including a component of 150 native pixels. Native inspection
confirmed these are footwear, not bare legs. They remain unchanged; the audit
does **not** report these diagnostic flags as zero:

- [Frame 61 source / dressed / flagged pixels](shoe-fringe-61.png)
- [Frame 62 source / dressed / flagged pixels](shoe-fringe-62.png)

The cocoa cardigan and terracotta overshirt use short sleeves. Their exposed
forearms are intentional. Likewise, muted green/gray video fringe around the
partly occluded far arm remains a source-quality limitation; this repair does
not recolor legitimate skin or broadly modify the source silhouette.

## Scope and reproducibility

All native frames were scanned and rendered, while visual review used difficult
pose boards and flagged native crops. This is not art approval of every frame
or every possible clothing mix. The five navy suit banks have no uncovered
opaque eroded sleeve core; all 36 banks have no uncovered unprotected opaque
source-cloth core or transparent holes inside that core.

See [audit summary](audit-summary.json), [cloth core measurements](cloth-core-audit.json)
and [limb measurements](limb-core-audit.json) for exact scope and exceptions.

The immutable approved cloth runs and hand polygons are recorded in
`artwork/kling-coverage/male-original-hand-cloth-review.json`. Rebuild with
`python scripts/repair-kling-male-hand-cloth-coverage.py`; it reads the pinned
pre-repair Git commit and verifies every source/baseline hash before writing.
It does not update catalogs; the repository catalog refresh step handles the
new archive hashes.
