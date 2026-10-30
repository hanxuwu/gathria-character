# Current refinement acceptance

Baseline: PR #54 at `16fb1405239188a453d66cda94927106028eefbf`. Implementation commit: `12d05a3`; final evidence is saved separately. This record counts current runs, not historical totals.

## Technical checks

- All **549 unit tests in 56 files passed**. Worker/template/temporal scoped runs overlap this total and are not added. [Log](checks/unit-all.log).
- TypeScript and production build passed (Vite 7.56 s). [Typecheck](checks/typecheck.log) · [Build](checks/build.log).
- **17 distinct browser cases passed**: 14 fitting/motion/previous-project/wardrobe integration cases plus 3 PR54/Worker recovery cases. These include real Worker cancellation/fallback, malformed inner garment rejection while retaining the current renderer, exact old-project PNG/embedded-file identity, draft/preview/apply/save/reopen, mobile visible-art zoom and original action sequencing. [Integration](checks/browser-integration.log) · [Recovery](qa/recovery-browser.log).
- The unchanged actual-export verifier passed both genders: **209 native source/clothing poses, 418 styled/mixed appearance compositions, 48 actual GIF downloads and four fresh independent players after closing the editor**. Source/order/24 fps/anchors, protected head/hands, authored RGBA/alpha, unowned source pixels, mirrors, GIF sequence/durations/loop flags, ZIP decode and independent re-export passed. No page errors, failed requests or forbidden independent authoring requests. [Reports and times](qa/README.md).
- Real-template authoring proof used separate existing material variants, retaining target ownership and reconstructed 107/102 native poses exactly through the established painted-pose importer. It is programmatic authoring evidence, separately from actual UI exports. [Template verification](templates/verification.json).
- Source/registration and historical embedded assets remain exact. Male/female raster repair scripts reproduce byte-exact packages; no protection profile or runtime format changed.
- Two-round performance comparison preserves all 209 native frames, actual UI frame-zero canvases, assets and validation progress. Median longest main-thread loading tasks decrease 88.8% / 90.4%; readiness improves 6.7% / 4.3%. Measurements are local, and do not establish lower memory or zero stalls. [Controlled evidence](performance/README.md).

## Visual acceptance

Actual same-frame exports visibly improve the male thin gray neckline band and remove the female run40–41 forearm cuts. Male105 poses change by a total9,372pixels; two poses remain exact. Female only40/41 change by158/126pixels; the other100 remain exact. Original proportions, head/neck, body source and motion are retained.

The male cleanup is **partial**. Jagged/double collar ink, wider motion-blurred gray remnants in jump67/89/91 and some armpit notches remain. More aggressive ownership expansion crossed ambiguous skin pixels and was rejected. Existing female donor/waist/neckline seams, source matte fringes and the original crouched jump ending are not solved here. There is no claim that every seam is invisible. [Actual visual review](qa/README.md).

## Evidence and corrected attempts

The final review GIFs are laid out from independently checked **actual UI exports**, not offline authoring composites. Native PNGs are lossless; detail magnification is integer nearest-neighbor; GIFs are indexed, half-size presentations. Jump stays a one-shot. Offline authoring diagnostics remain explicitly labeled in male/female folders.

PR #54's inherited remote failures were diagnosed from [PR annotations](checks/inherited-pr54-ci.json) and [push annotations](checks/inherited-pr54-push-ci.json). One test required an obsolete per-pose timer label; two raced action-slider/reopened playback state. Current tests wait for real completed state while preserving exact pixel/file assertions. All affected cases pass in the frozen current run.

An initial concurrent-development browser run lost a female panel during module replacement, before later assertions; it is not acceptance evidence. Visual inspection also found mobile zoom opening on an empty corner. After fixing initial centering, all four fitting cases passed under frozen code, including a visible-pixel assertion. A formatting check found three files; formatting was corrected before final export. The first paired-PNG-only Worker experiment did not improve responsiveness; its results and profile are retained, and the second measured iteration addresses the actual ZIP/cache bottlenecks.

Remote GitHub CI status is reported separately on the draft PR. Local verification above does not imply a completed remote run.
