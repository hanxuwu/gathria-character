# Historical exports and current clothing revisions

The previous cloud failures compared newly created wardrobe projects with old
published artwork ZIPs, and several independent export checks still assumed
that every paired garment was V1. Coverage repairs deliberately changed those
archives and added source-bound V2/V3 permissions. Treating every mismatch as a
new baseline, or removing protected-region checks, would hide real regressions.

Re-running those old-project checks also exposed a real runtime regression:
`validateDualViewLook` accepted only the current catalog hash. Reopening a
previously published project after a garment repair failed, leaving the earlier
session on screen. This is fixed in the runtime, not bypassed in the tests.
`paired-garment-revisions.json` lists the 56 exact item identities published at
5d63 and the frozen coverage baseline 2a720798. Every entry binds collection,
character, native view, item ID, logical part, slot, palette, source SHA,
registration SHA and archive SHA. The registry builder verifies the immutable
2a bindings receipt and derives the other labels from 5d63; it does not need
an unmerged 2a Git object or copy historical artwork into the application.
New sessions still fetch current catalog artwork. Old projects keep their
embedded bytes through imports, view changes, palette selections and saves.
Unknown hashes or permission edits remain rejected.

The corrected checks keep two separate promises:

- **Historical files stay historical.** `build-paired-polish-baseline.mjs` reads
  embedded inputs from the permanent merged commit
  `5d63ae233ca83e61dc354e122a8708044f4e2653`. Its existing published inner/outer
  SHA assertions are unchanged. `build-reviewed-cotton-baseline.mjs` similarly
  reconstructs the original actual cotton download and must match its original
  published SHA and size before browser import. Reopening and re-saving these
  old projects still require exact pixels and exact archive bytes.
- **Current exports reflect the selected reviewed garments.** Independent
  Python checks bind every garment to exact current or historical repository
  bytes. They apply only its named source/registration-bound neckline map and
  its bounded, nonempty per-item hand reviews. Actual baked pixels must equal
  source + selected garment + appearance composition. Pixels outside ownership,
  retained hands, face/hair banks, source clocks, source coordinates and mirrored
  output remain checked. Newly added exceptions do not silently apply to old
  projects.

`coverage_export_audit.py` is an application-export checker, not an artwork
approval tool. The separate frozen coverage/finish recipe verifiers prove the
published asset revisions. The export checker then bounds differences from
historical appearance captures to those exact garment deltas and reconstructs
all frames independently of the application's compositor. An arbitrary changed
ZIP or review polygon cannot pass merely by using a recognized garment ID.

The catalog suite includes 12 new cases covering offline byte-exact old-project
round trips, all historical binding dimensions, and an actually reparsed garment
with an unapproved hand-review permission. The current 25-case catalog suite
and TypeScript check pass. Existing E2E tests also assert that old-project import
shows no error before comparing its pixels, so a stale previous session cannot
masquerade as a successful reopen.

Five negative tests in `test_coverage_export_audit.py` check current/historical
binding, forged review rejection, hand-boundary expansion, attempted head
release via a hand review, and a neckline profile bound to another source.
No historical reference image, ZIP, checksum, or audit has been overwritten.

Relevant browser suites are `dual-view-wardrobe`, `dual-view-daily-outfits`, and
`dual-view-complete-looks`. Their independent layer/GIF checks remain active;
old project tests explicitly import the old archive rather than assuming a new
catalog project contains the old bytes. Exact final run results are recorded
with the combined iteration validation, not inferred from these design notes.

A targeted Chromium check also loaded the actual previous male appearance pair
against the current catalog, exported both native views and saved the project
again. Both PNG SHA-256 hashes matched the published `docs/matched-hair/review`
images exactly, and the re-saved ZIP matched the original ZIP byte-for-byte
(58.8 seconds). This confirms the runtime compatibility fix beyond synthetic
fixtures. Independent audits of actual captured original-view exports passed
88 male frames and 96 female frames; these partial checks do not replace the
final all-action, both-view GIF suite after the remaining artwork is frozen.

A second targeted Chromium check created a fresh current male cotton project
and downloaded its native project, CharacterPack, and both-facing PNGs. The
independent cotton export auditor passed all 88 original-view frames, including
exact clothing composition, source alpha, protected regions, outside-ownership
pixels and PNG mirroring (33.0 seconds; no GIFs in this shortened check).
