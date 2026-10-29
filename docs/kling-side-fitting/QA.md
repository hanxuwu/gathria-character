# Current iteration acceptance

Baseline: `220ea2fd7588c1fe784c8454d66469d60fba096a` (unmerged PR #53).
This record covers the fitting-workbench iteration. Historical polish/expansion
reports and their counts are not new test results.

## Technical checks

- TypeScript check passed; production build passed (9.58 seconds).
- 186 relevant unit tests across 15 files passed. This includes the new cooperative
  scheduler and fitting diagnostics, existing mask/candidate/project/export engines,
  side motion/input/cache/review, appearance import/render and standalone playback.
  The earlier 34-test and 22-test scoped runs overlap this total and are not added.
- The independent actual-export verifier passed for both genders after asset and
  runtime freeze: 209 source/clothing poses, 418 styled/mixed hair compositions,
  48 actual GIF downloads and four fresh independent-player contexts.
- Exact source pixels outside garment ownership, protected head/hands, authored
  replacement RGBA/alpha, every source frame/order and left/right mirroring passed.
  GIF palette pixels, rounded durations and loop flags were decoded and checked.
- Workbench windows were closed before standalone verification. The exported ZIPs
  loaded without authoring/skeleton asset requests, played all actions/directions,
  and re-exported exactly. No page/network failures were recorded in final runs.
- A separate actual appearance-renderer audit checked all 209 poses in three hair
  colors (627 combinations), preserving face/foreground/outside-hair source pixels.
- Current PR #53 saved-project checks compare 12 native PNGs and every embedded
  file after re-save. Older 4fd compatibility fixtures remain unchanged.
- Source-bound authoring package audits and idempotent local repair reproduction
  passed; canonical registration and original source ZIPs remain exact.

[Independent final reports and visual checks](qa/README.md) ·
[Typecheck](checks/typecheck.log) · [Units](checks/unit.log) ·
[Build](checks/build.log) · [Final browser run](checks/browser-final.log).
The 19 distinct relevant browser cases now have passing results. The combined
run passed 18/19; the new male PR #53 compatibility test raced the action
readout and tried to fill jump position 32 while the slider still had the prior
walk range. The test now waits for the requested action and correct slider max
before filling. Both PR #53 cases passed on a fresh rerun (46.0 seconds), with
all exact-pixel and embedded-file assertions retained. Runtime/artwork did not
change. The rerun's female repetition is not counted as a twentieth distinct
case. [Focused final rerun](checks/browser-legacy-final.log).

## Visual review

The shipped workbench exports establish these changes relative to PR #53:

- Male: exactly 17 changed poses (hair67, sleeves80–95); 90 poses remain exact.
  Rear-scalp serration and rectangular compressed sleeves visibly improve.
- Female: exactly 68 changed poses (run34–51 and jump52–101); all 34 idle/walk
  poses remain exact. Run39/49 regain their original lower forearm contour;
  the puff sleeve follows the upper arm consistently; the skirt keeps one fold
  design through jumping and covers the upper hip with continuous painted cloth.
- The unmodified source face/body, dimensions, anchors and action timing are retained.
  Garment and hair silhouette changes are intentional local overlays, not source warps.

This is not a claim that every seam is invisible. Female run40 retains an existing
small triangular lower-forearm/cuff defect. Far sleeve/bodice donor boundaries,
male gray tank neckline remnants, occasional armpit notches and original matte/blur
remain visible. The calmer skirt has less wind-flutter. The original two-jump
clip still ends in a shallow crouch, so switching to idle is not a newly authored
landing-to-stand transition.

## Evidence provenance

`review/` comparisons use the prior and new **actual UI downloaded** styled packs.
The presentation script only lays out original decoded frames and encodes GIFs;
it never refits or repaints artwork. Native PNGs and ZIP pages are the lossless
reference. Comparison GIFs have an indexed palette and half-size beige presentation.
Integer 2× detail PNGs use nearest-neighbor scaling. Looping clips include the
source loop; jump and the pair presentation sequence remain one-shots.

`male/`, `female-arm/`, `skirt/` contain clearly labeled offline diagnostic
compositions used to select local repairs. `hair/` uses the actual appearance
renderer with unchanged source. These do not replace the final full-outfit UI
exports. `workbench/` shows actual tool operation; the deliberately five-pixel
correction proves workflow roundtrip and is not shipped as character artwork.

The first performance harness attempt hit a five-second Playwright assertion
limit before any measured sample. The corrected quiet run retained strict
checks and is the only accepted timing result. See [measurements](performance/README.md).
An initial formatting check found one browser-test file; whitespace was corrected
before final regression. No assertion was weakened to obtain a pass.
